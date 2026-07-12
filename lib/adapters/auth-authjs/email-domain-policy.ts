const ALLOWED_DOMAINS_ENV = "AUTH_ALLOWED_EMAIL_DOMAINS";

export function parseAllowedEmailDomains(
  raw: string | undefined = process.env[ALLOWED_DOMAINS_ENV]
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[] = parseAllowedEmailDomains()
): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.includes(domain);
}

/** Google `hd` hint — only meaningful when exactly one domain is allowed. */
export function googleHostedDomainHint(
  allowedDomains: string[] = parseAllowedEmailDomains()
): string | undefined {
  return allowedDomains.length === 1 ? allowedDomains[0] : undefined;
}

/**
 * When a single org domain is configured, require Google Workspace `hd` claim
 * so personal Gmail accounts cannot satisfy the allowlist by email alone.
 */
export function isGoogleHostedDomainValid(
  profile: unknown,
  allowedDomains: string[] = parseAllowedEmailDomains()
): boolean {
  const hint = googleHostedDomainHint(allowedDomains);
  if (!hint) return true;
  const hd = (profile as { hd?: string })?.hd?.toLowerCase();
  return hd === hint;
}
