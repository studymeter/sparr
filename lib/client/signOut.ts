export async function signOut(redirectTo = "/me"): Promise<boolean> {
  const response = await fetch("/api/auth/signout", { method: "POST" });
  if (!response.ok) return false;
  window.location.assign(redirectTo);
  return true;
}
