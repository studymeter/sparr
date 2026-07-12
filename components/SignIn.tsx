"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import PasswordInput from "@/components/PasswordInput";
import LocaleSwitcher from "@/components/LocaleSwitcher";

const GOOGLE_SIGN_IN_ACTION = "/api/auth/signin/google";

function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("auth");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/csrf", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { csrfToken?: string };
        if (active && data.csrfToken) setCsrfToken(data.csrfToken);
      } catch {
        // Button stays disabled until CSRF is available.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <form method="POST" action={GOOGLE_SIGN_IN_ACTION}>
      <input type="hidden" name="csrfToken" value={csrfToken ?? ""} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button
        type="submit"
        className="auth-btn auth-btn-google"
        disabled={!csrfToken}
      >
        {t("googleSignIn")}
      </button>
    </form>
  );
}

type Translate = ReturnType<typeof useTranslations>;

type SignInResult = { ok: true } | { ok: false; messageKey: string };

// Perform the credentials sign-in request. Returns a message key on failure
// (network/5xx → unavailable, otherwise invalid credentials).
async function runSignIn(
  email: string,
  credential: string
): Promise<SignInResult> {
  try {
    const response = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, credential }),
    });
    if (response.ok) return { ok: true };
    return {
      ok: false,
      messageKey:
        response.status >= 500 ? "signInUnavailable" : "invalidCredentials",
    };
  } catch {
    return { ok: false, messageKey: "signInUnavailable" };
  }
}

// Map an Auth.js OAuth error code (from the query string) to a localized message.
function resolveOAuthError(code: string | null, t: Translate): string | null {
  if (!code) return null;
  switch (code) {
    case "DomainNotAllowed":
      return t("oauthDomainNotAllowed");
    case "OAuthAccountNotLinked":
      return t("oauthAccountNotLinked");
    case "AccessDenied":
      return t("oauthAccessDenied");
    case "Configuration":
      return t("oauthConfiguration");
    default:
      return t("oauthFailed");
  }
}

type CredentialsFieldsProps = {
  email: string;
  credential: string;
  isLoading: boolean;
  displayError: string | null;
  t: Translate;
  onEmailChange: (value: string) => void;
  onCredentialChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function CredentialsFields(props: CredentialsFieldsProps) {
  const { email, credential, isLoading, displayError, t } = props;
  return (
    <form className="auth-form" onSubmit={props.onSubmit} noValidate>
      <div className="auth-field">
        <label htmlFor="email" className="auth-label">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          className="auth-input"
          value={email}
          onChange={(event) => props.onEmailChange(event.target.value)}
          autoComplete="email"
          required
          disabled={isLoading}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="credential" className="auth-label">
          {t("password")}
        </label>
        <PasswordInput
          id="credential"
          value={credential}
          onChange={(event) => props.onCredentialChange(event.target.value)}
          autoComplete="current-password"
          required
          disabled={isLoading}
        />
      </div>

      {displayError && <p className="auth-error">{displayError}</p>}

      <button type="submit" className="auth-btn" disabled={isLoading}>
        {isLoading ? t("signingIn") : t("signInButton")}
      </button>
    </form>
  );
}

type SignInCardHeaderProps = {
  googleEnabled: boolean;
  callbackUrl: string;
  t: Translate;
  tc: Translate;
};

function SignInCardHeader({
  googleEnabled,
  callbackUrl,
  t,
  tc,
}: SignInCardHeaderProps) {
  return (
    <>
      <div className="auth-card-header">
        <Link href="/" className="auth-close" aria-label={tc("close")}>
          ×
        </Link>
        <LocaleSwitcher />
      </div>
      <h1 className="auth-title">{t("signInTitle")}</h1>

      {googleEnabled && (
        <>
          <GoogleSignInButton callbackUrl={callbackUrl} />
          <div className="auth-divider" aria-hidden="true">
            <span>{t("or")}</span>
          </div>
        </>
      )}
    </>
  );
}

export default function SignIn({
  googleEnabled = false,
}: {
  googleEnabled?: boolean;
}) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = resolveOAuthError(searchParams.get("error"), t);
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const displayError = submitError ?? oauthError;
  const callbackUrl = locale === "ja" ? "/me" : "/en/me";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setIsLoading(true);
    const result = await runSignIn(email, credential);
    setIsLoading(false);
    if (result.ok) {
      router.push("/me");
      return;
    }
    setSubmitError(t(result.messageKey));
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <SignInCardHeader
          googleEnabled={googleEnabled}
          callbackUrl={callbackUrl}
          t={t}
          tc={tc}
        />

        <CredentialsFields
          email={email}
          credential={credential}
          isLoading={isLoading}
          displayError={displayError}
          t={t}
          onEmailChange={setEmail}
          onCredentialChange={setCredential}
          onSubmit={handleSubmit}
        />

        <p className="auth-link">
          {t("noAccount")} <Link href="/signup">{t("signUpLink")}</Link>
        </p>
      </div>
    </div>
  );
}
