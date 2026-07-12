import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import { cookies } from "next/headers";
import type {
  AuthHandlers,
  AuthProvider,
  ChangePasswordInput,
  Principal,
  RegisterInput,
  SignInInput,
  Store,
} from "@/lib/providers";
import { uid } from "@/lib/id";
import { syncTicketGrants } from "@/lib/tickets";
import { canChangePassword } from "@/lib/auth/sign-in-method";
import { buildAuthJsConfig } from "./config";
import { resolveAuthUrl } from "./auth-url";
import { isEmailDomainAllowed } from "./email-domain-policy";

type SessionUser = {
  id?: string;
  role?: "player" | "admin";
};

function usernameFromEmail(email: string): string {
  const [name] = email.split("@");
  return name || "player";
}

function anonymous(): Principal {
  return { id: "anonymous", role: "anonymous" };
}

function isCredentialSignInFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const authError = err as Error & { type?: string; code?: string };
  return (
    authError.type === "CredentialsSignin" || authError.code === "credentials"
  );
}

export class AuthJsAuthProvider implements AuthProvider {
  readonly handlers: AuthHandlers;

  private readonly authFn: () => Promise<unknown>;

  private readonly signInFn: (
    provider: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  private readonly signOutFn: (
    options?: Record<string, unknown>
  ) => Promise<unknown>;

  constructor(private readonly getStore: () => Promise<Store>) {
    const config = buildAuthJsConfig(getStore);
    config.trustHost = true;
    if (process.env.NODE_ENV === "development" && !resolveAuthUrl()) {
      console.warn(
        "[auth] AUTH_URL が未設定です。Google OAuth で redirect_uri_mismatch になる場合は AUTH_URL=http://localhost:3000 を .env.local に追加してください。"
      );
    }
    const { handlers, auth, signIn, signOut } = NextAuth(config);
    this.handlers = handlers;
    this.authFn = auth;
    this.signInFn = signIn;
    this.signOutFn = signOut;
  }

  private async signInWithCredentials(input: SignInInput): Promise<unknown> {
    try {
      const signInResult = await this.signInFn("credentials", {
        email: input.email.toLowerCase(),
        credential: input.credential,
        redirect: false,
      });
      const resultWithError = signInResult as { error?: string } | undefined;
      if (resultWithError?.error) {
        throw new Error("invalid_credential");
      }
      return signInResult;
    } catch (err) {
      if (isCredentialSignInFailure(err)) {
        throw new Error("invalid_credential");
      }
      throw err;
    }
  }

  private async principalByEmail(email: string): Promise<Principal> {
    const store = await this.getStore();
    const account = await store.accounts.findByEmail(email.toLowerCase());
    if (!account || (account.role !== "player" && account.role !== "admin")) {
      throw new Error("invalid_credential");
    }
    return { id: account.id, role: account.role };
  }

  async getPrincipal(): Promise<Principal> {
    const session = (await this.authFn()) as { user?: SessionUser } | null;
    const user = session?.user;
    if (!user?.id) return anonymous();
    if (user.role !== "player" && user.role !== "admin") return anonymous();

    const store = await this.getStore();
    const account = await store.accounts.get(user.id);
    if (!account) {
      console.info("再ログインをしてください。");
      return anonymous();
    }

    if (user.role === "player") {
      await syncTicketGrants(store, user.id);
    }
    return {
      id: user.id,
      role: user.role,
    };
  }

  async signin(input: SignInInput): Promise<Principal> {
    await this.signInWithCredentials(input);
    return this.principalByEmail(input.email);
  }

  async signout(): Promise<void> {
    await this.signOutFn({ redirect: false });
    const cookieStore = await cookies();
    cookieStore.delete("authjs.session-token");
    cookieStore.delete("__Secure-authjs.session-token");
  }

  async register(input: RegisterInput): Promise<Principal> {
    const email = input.email.toLowerCase();
    if (!isEmailDomainAllowed(email)) {
      throw new Error("email_domain_not_allowed");
    }
    const store = await this.getStore();
    const existing = await store.accounts.findByEmail(email);
    if (existing) throw new Error("email_already_exists");

    const passwordHash = await bcrypt.hash(input.credential, 12);
    const created = await store.accounts.create({
      id: uid("acct_"),
      email,
      username: input.username || usernameFromEmail(email),
      role: input.role,
      passwordHash,
      emailVerified: null,
    });

    try {
      await this.signInWithCredentials({ email, credential: input.credential });
    } catch {
      throw new Error("register_signin_failed");
    }

    return {
      id: created.id,
      role: created.role,
    };
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const principal = await this.getPrincipal();
    if (principal.role === "anonymous") throw new Error("unauthenticated");

    const store = await this.getStore();
    if (!(await canChangePassword(store, principal.id))) {
      throw new Error("oauth_managed");
    }

    const account = await store.accounts.getWithCredential(principal.id);
    if (!account?.passwordHash) throw new Error("oauth_managed");

    const isValid = await bcrypt.compare(
      input.currentCredential,
      account.passwordHash
    );
    if (!isValid) throw new Error("invalid_credential");

    const nextHash = await bcrypt.hash(input.newCredential, 12);
    await store.accounts.updatePassword(account.id, nextHash);
  }
}
