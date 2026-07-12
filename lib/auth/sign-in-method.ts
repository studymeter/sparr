import type { Store } from "@/lib/providers";

export type SignInMethod = "password" | "oauth";

export async function getSignInMethod(
  store: Store,
  accountId: string
): Promise<SignInMethod> {
  const oauthAccounts = await store.oauthAccounts.listByAccount(accountId);
  return oauthAccounts.length > 0 ? "oauth" : "password";
}

export async function canChangePassword(
  store: Store,
  accountId: string
): Promise<boolean> {
  return (await getSignInMethod(store, accountId)) === "password";
}
