import { uid } from "@/lib/id";
import type {
  OAuthAccount,
  OAuthAccountCreateInput,
  Store,
} from "@/lib/providers";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";

function usernameFromEmail(email: string): string {
  const [name] = email.split("@");
  return name || "player";
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIso(value?: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toAdapterUser(account: {
  id: string;
  email: string;
  username: string;
  emailVerified: string | null;
}): AdapterUser {
  return {
    id: account.id,
    email: account.email,
    name: account.username,
    emailVerified: toDate(account.emailVerified),
    image: null,
  };
}

function toOAuthAccountInput(account: AdapterAccount): OAuthAccountCreateInput {
  return {
    accountId: account.userId,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
}

async function findOAuthAccount(
  store: Store,
  provider: string,
  providerAccountId: string
): Promise<OAuthAccount | null> {
  return store.oauthAccounts.findByProvider(provider, providerAccountId);
}

type GetStore = () => Promise<Store>;

// Account read lookups.
function createUserReadMethods(
  getStore: GetStore
): Pick<Adapter, "getUser" | "getUserByEmail" | "getUserByAccount"> {
  return {
    async getUser(id) {
      const store = await getStore();
      const row = await store.accounts.get(id);
      return row ? toAdapterUser(row) : null;
    },
    async getUserByEmail(email) {
      const store = await getStore();
      const row = await store.accounts.findByEmail(email);
      return row ? toAdapterUser(row) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const store = await getStore();
      const oauth = await findOAuthAccount(store, provider, providerAccountId);
      if (!oauth) return null;
      const account = await store.accounts.get(oauth.accountId);
      return account ? toAdapterUser(account) : null;
    },
  };
}

// Account create/update/delete.
function createUserWriteMethods(
  getStore: GetStore
): Pick<Adapter, "createUser" | "updateUser" | "deleteUser"> {
  return {
    async createUser(user) {
      if (!user.email) {
        throw new Error("oauth_user_email_required");
      }
      const store = await getStore();
      const email = user.email.toLowerCase();
      const existing = await store.accounts.findByEmail(email);
      if (existing) {
        throw new Error("oauth_email_conflict");
      }
      const created = await store.accounts.create({
        id: user.id || uid("acct_"),
        email,
        username: user.name || usernameFromEmail(user.email),
        role: "player",
        passwordHash: null,
        emailVerified: toIso(user.emailVerified),
      });
      return toAdapterUser(created);
    },
    async updateUser(user) {
      const store = await getStore();
      const patch: {
        email?: string;
        username?: string;
        emailVerified?: string | null;
      } = {};
      if (user.email) patch.email = user.email.toLowerCase();
      if (user.name) patch.username = user.name;
      if (user.emailVerified !== undefined) {
        patch.emailVerified = toIso(user.emailVerified);
      }
      const updated = await store.accounts.update(user.id, patch);
      if (!updated) throw new Error("account_not_found");
      return toAdapterUser(updated);
    },
    async deleteUser(userId) {
      const store = await getStore();
      await store.accounts.delete(userId);
    },
  };
}

// OAuth account linking and lookup.
function createOAuthMethods(
  getStore: GetStore
): Pick<Adapter, "linkAccount" | "unlinkAccount"> {
  return {
    async linkAccount(account) {
      const store = await getStore();
      const target = await store.accounts.getWithCredential(account.userId);
      if (target?.passwordHash) {
        throw new Error("oauth_email_password_conflict");
      }
      await store.oauthAccounts.create(toOAuthAccountInput(account));
      return account;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      const store = await getStore();
      const current = await findOAuthAccount(
        store,
        provider,
        providerAccountId
      );
      if (!current) return;
      await store.oauthAccounts.delete(current.id);
    },
  };
}

export function createAuthJsStoreAdapter(getStore: GetStore): Adapter {
  return {
    ...createUserReadMethods(getStore),
    ...createUserWriteMethods(getStore),
    ...createOAuthMethods(getStore),
    async createSession(_session: AdapterSession) {
      throw new Error("jwt_session_strategy_in_use");
    },
    async getSessionAndUser(_sessionToken: string) {
      return null;
    },
    async updateSession(_session: Partial<AdapterSession>) {
      return null;
    },
    async deleteSession(_sessionToken: string) {},
    async createVerificationToken(_token: VerificationToken) {
      throw new Error("verification_token_not_supported");
    },
    async useVerificationToken(_token: { identifier: string; token: string }) {
      return null;
    },
    async getAccount(providerAccountId, provider) {
      const store = await getStore();
      const oauth = await findOAuthAccount(store, provider, providerAccountId);
      if (!oauth) return null;
      return {
        userId: oauth.accountId,
        provider: oauth.provider,
        providerAccountId: oauth.providerAccountId,
        type: "oauth",
      };
    },
  };
}
