import bcrypt from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { customFetch } from "next-auth";
import type { NextAuthConfig } from "next-auth";
import type { Store } from "@/lib/providers";
import {
  googleHostedDomainHint,
  isEmailDomainAllowed,
  isGoogleHostedDomainValid,
} from "./email-domain-policy";
import { isOAuthBlockedByPasswordAccount } from "./oauth-policy";
import { createOAuthFetch } from "./oauth-fetch";
import { createAuthJsStoreAdapter } from "./store-adapter";

type UserRole = "player" | "admin";

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: Date | null;
};

type GetStore = () => Promise<Store>;

type AuthCallbacks = NonNullable<NextAuthConfig["callbacks"]>;
type SignInParams = Parameters<NonNullable<AuthCallbacks["signIn"]>>[0];
type JwtParams = Parameters<NonNullable<AuthCallbacks["jwt"]>>[0];
type SessionParams = Parameters<NonNullable<AuthCallbacks["session"]>>[0];
type CredentialsInput = Partial<Record<"email" | "credential", unknown>>;

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

async function findPasswordVerifiedAccount(
  store: Store,
  email: string,
  credential: string
) {
  const account = await store.accounts.findByEmail(email);
  if (!account?.passwordHash) return null;
  const isValid = await bcrypt.compare(credential, account.passwordHash);
  return isValid ? account : null;
}

async function authorizeCredentials(
  getStore: GetStore,
  credentials: CredentialsInput | undefined
): Promise<AppUser | null> {
  const email = String(credentials?.email || "").toLowerCase();
  const credential = String(credentials?.credential || "");
  if (!email || !credential) return null;
  if (!isEmailDomainAllowed(email)) return null;
  const store = await getStore();
  const account = await findPasswordVerifiedAccount(store, email, credential);
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    name: account.username,
    role: account.role,
    emailVerified: toDate(account.emailVerified),
  };
}

function resolveSignInEmail(params: SignInParams): string {
  const { user, profile } = params;
  if (user.email) return user.email.toLowerCase();
  return typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
}

async function handleSignIn(
  getStore: GetStore,
  params: SignInParams
): Promise<boolean | string> {
  const { account, profile } = params;
  if (account?.provider !== "google" || !account.providerAccountId) {
    return true;
  }
  const email = resolveSignInEmail(params);
  if (!email) return false;

  if (!isEmailDomainAllowed(email) || !isGoogleHostedDomainValid(profile)) {
    return "/signin?error=DomainNotAllowed";
  }

  const store = await getStore();
  const blocked = await isOAuthBlockedByPasswordAccount(
    store,
    email,
    account.provider,
    account.providerAccountId
  );
  if (blocked) {
    return "/signin?error=OAuthAccountNotLinked";
  }
  return true;
}

async function lookupTokenRole(
  getStore: GetStore,
  userId: string
): Promise<UserRole | null> {
  const store = await getStore();
  const account = await store.accounts.get(userId);
  if (account?.role === "player" || account?.role === "admin") {
    return account.role;
  }
  return null;
}

async function enrichJwtToken(getStore: GetStore, params: JwtParams) {
  const { token, user } = params;
  const userId =
    user && "id" in user ? String((user as { id: string }).id) : token.sub;
  if (user && "id" in user) {
    token.sub = userId;
  }
  if (user && "role" in user) {
    token.role = (user as { role: UserRole }).role;
    return token;
  }
  if (!userId) return token;
  const role = await lookupTokenRole(getStore, String(userId));
  if (role) {
    token.role = role;
  }
  return token;
}

function applySessionClaims(params: SessionParams) {
  const { token, session } = params;
  if (session.user) {
    (session.user as { id?: string }).id = token.sub;
    if (token.role === "player" || token.role === "admin") {
      (session.user as { role?: UserRole }).role = token.role;
    }
  }
  return session;
}

export function buildAuthJsConfig(
  getStore: () => Promise<Store>
): NextAuthConfig {
  const hostedDomain = googleHostedDomainHint();
  const oauthFetch = createOAuthFetch();
  return {
    secret: process.env.AUTH_SECRET,
    basePath: "/api/auth",
    debug: process.env.AUTH_DEBUG === "true",
    adapter: createAuthJsStoreAdapter(getStore),
    session: { strategy: "jwt" },
    pages: {
      signIn: "/signin",
      error: "/signin",
    },
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID || "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
        authorization: hostedDomain
          ? { params: { hd: hostedDomain } }
          : undefined,
        [customFetch]: oauthFetch,
      }),
      Credentials({
        credentials: {
          email: { label: "Email", type: "email" },
          credential: { label: "Password", type: "password" },
        },
        authorize: (credentials) => authorizeCredentials(getStore, credentials),
      }),
    ],
    callbacks: {
      signIn: (params) => handleSignIn(getStore, params),
      jwt: (params) => enrichJwtToken(getStore, params),
      session: (params) => applySessionClaims(params),
    },
    cookies: {
      sessionToken: {
        name: "authjs.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
    },
  };
}
