"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import PasswordInput from "@/components/PasswordInput";
import LocaleSwitcher from "@/components/LocaleSwitcher";

type Translate = ReturnType<typeof useTranslations>;

type RegisterResult = { ok: true } | { ok: false; errorCode?: string };

// Perform the register request. On failure, surfaces the endpoint's error code.
async function runRegister(
  email: string,
  username: string,
  credential: string
): Promise<RegisterResult> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      credential,
      username: username.trim() || undefined,
    }),
  });
  if (response.ok) return { ok: true };
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: false, errorCode: data.error };
}

// Translate the register endpoint's error code into a localized message.
function registerErrorMessage(code: string | undefined, t: Translate): string {
  if (code === "conflict") return t("emailAlreadyRegistered");
  if (code === "domain_not_allowed") return t("domainNotAllowedRegister");
  return t("registerFailed");
}

type SignUpFieldsProps = {
  email: string;
  username: string;
  credential: string;
  error: string | null;
  isLoading: boolean;
  t: Translate;
  onEmailChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onCredentialChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function SignUpFields(props: SignUpFieldsProps) {
  const { email, username, credential, error, isLoading, t } = props;
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
        <label htmlFor="username" className="auth-label">
          {t("usernameOptional")}
        </label>
        <input
          id="username"
          type="text"
          className="auth-input"
          value={username}
          onChange={(event) => props.onUsernameChange(event.target.value)}
          autoComplete="username"
          disabled={isLoading}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="credential" className="auth-label">
          {t("passwordMin8")}
        </label>
        <PasswordInput
          id="credential"
          value={credential}
          onChange={(event) => props.onCredentialChange(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          disabled={isLoading}
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="auth-btn" disabled={isLoading}>
        {isLoading ? t("creatingAccount") : t("createAccount")}
      </button>
    </form>
  );
}

export default function SignUp() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await runRegister(email, username, credential);
    setIsLoading(false);
    if (!result.ok) {
      setError(registerErrorMessage(result.errorCode, t));
      return;
    }
    router.push("/me");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <LocaleSwitcher />
        </div>
        <h1 className="auth-title">{t("signUpTitle")}</h1>

        <SignUpFields
          email={email}
          username={username}
          credential={credential}
          error={error}
          isLoading={isLoading}
          t={t}
          onEmailChange={setEmail}
          onUsernameChange={setUsername}
          onCredentialChange={setCredential}
          onSubmit={handleSubmit}
        />

        <p className="auth-link">
          {t("hasAccount")} <Link href="/signin">{t("signInLink")}</Link>
        </p>
      </div>
    </div>
  );
}
