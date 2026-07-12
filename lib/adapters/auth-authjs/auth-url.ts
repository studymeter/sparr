/** Canonical app origin for Auth.js (must match Google redirect URI host). */
export function resolveAuthUrl(): string | undefined {
  const raw = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!raw?.trim()) return undefined;
  return raw.replace(/\/\/$/, "");
}

export function googleOAuthCallbackPath(): string {
  return "/api/auth/callback/google";
}

export function googleOAuthCallbackUrl(): string | undefined {
  const authUrl = resolveAuthUrl();
  if (!authUrl) return undefined;
  return `${authUrl}${googleOAuthCallbackPath()}`;
}
