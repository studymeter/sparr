import type { Store } from "@/lib/providers";

/**
 * Password-registered accounts and OAuth identities are kept separate.
 * Google sign-in is blocked when the email already belongs to a password account
 * that is not linked to this OAuth provider account.
 */
export async function isOAuthBlockedByPasswordAccount(
  store: Store,
  email: string,
  provider: string,
  providerAccountId: string
): Promise<boolean> {
  const existing = await store.accounts.findByEmail(email.toLowerCase());
  if (!existing?.passwordHash) return false;

  const oauth = await store.oauthAccounts.findByProvider(
    provider,
    providerAccountId
  );
  const isLinkedToSameAccount =
    oauth !== null && oauth.accountId === existing.id;
  return !isLinkedToSameAccount;
}
