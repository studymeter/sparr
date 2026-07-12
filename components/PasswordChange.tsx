"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import PasswordInput from "@/components/PasswordInput";
import Footer from "@/components/Footer";

type Translate = ReturnType<typeof useTranslations>;

type PasswordChangeResult = { ok: true } | { ok: false; messageKey: string };

// Send the password-change request and map response status to a message key.
async function submitPasswordChange(
  currentCredential: string,
  newCredential: string
): Promise<PasswordChangeResult> {
  const res = await fetch("/api/auth/password-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentCredential, newCredential }),
  });
  if (res.status === 401) return { ok: false, messageKey: "wrongCurrent" };
  if (res.status === 403) return { ok: false, messageKey: "oauthNotAllowed" };
  if (!res.ok) return { ok: false, messageKey: "changeFailed" };
  return { ok: true };
}

type PasswordChangeFormProps = {
  currentCredential: string;
  newCredential: string;
  confirm: string;
  error: string | null;
  done: boolean;
  isSaving: boolean;
  t: Translate;
  onCurrentChange: (value: string) => void;
  onNewChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function PasswordChangeForm(props: PasswordChangeFormProps) {
  const { currentCredential, newCredential, confirm } = props;
  const { error, done, isSaving, t } = props;
  return (
    <form className="auth-form" onSubmit={props.onSubmit} noValidate>
      <div className="auth-field">
        <label htmlFor="current" className="auth-label">
          {t("currentPassword")}
        </label>
        <PasswordInput
          id="current"
          value={currentCredential}
          onChange={(event) => props.onCurrentChange(event.target.value)}
          autoComplete="current-password"
          required
          disabled={isSaving}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="new" className="auth-label">
          {t("newPassword")}
        </label>
        <PasswordInput
          id="new"
          value={newCredential}
          onChange={(event) => props.onNewChange(event.target.value)}
          autoComplete="new-password"
          required
          disabled={isSaving}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="confirm" className="auth-label">
          {t("confirmPassword")}
        </label>
        <PasswordInput
          id="confirm"
          value={confirm}
          onChange={(event) => props.onConfirmChange(event.target.value)}
          autoComplete="new-password"
          required
          disabled={isSaving}
        />
      </div>

      {error && <p className="auth-error">{error}</p>}
      {done && <p className="auth-ok">{t("changed")}</p>}

      <button type="submit" className="btn-primary" disabled={isSaving}>
        {isSaving ? t("changing") : t("submit")}
      </button>
    </form>
  );
}

function PasswordChangeChrome({
  t,
  children,
}: {
  t: Translate;
  children: React.ReactNode;
}) {
  return (
    <div className="mp-page">
      <header className="mp-header">
        <Link href="/" className="mp-brand sm-gradient-text">
          Sparr
        </Link>
        <nav className="mp-nav">
          <Link href="/mypage" className="btn-tertiary">
            {t("backToAccount")}
          </Link>
        </nav>
      </header>

      <main className="mypage-settings-main">
        <div className="mypage-settings-hero">
          <h1 className="mypage-settings-title">{t("title")}</h1>
          <p className="mypage-settings-subtitle">{t("subtitle")}</p>
        </div>

        <section className="mypage-settings-card">{children}</section>
      </main>

      <Footer />
    </div>
  );
}

export default function PasswordChange() {
  const t = useTranslations("passwordChange");
  const [currentCredential, setCurrentCredential] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newCredential.length < 8) {
      setError(t("minLengthError"));
      return;
    }
    if (newCredential !== confirm) {
      setError(t("mismatchError"));
      return;
    }
    setIsSaving(true);
    const result = await submitPasswordChange(currentCredential, newCredential);
    setIsSaving(false);
    if (!result.ok) {
      setError(t(result.messageKey));
      return;
    }
    setDone(true);
    setCurrentCredential("");
    setNewCredential("");
    setConfirm("");
  };

  return (
    <PasswordChangeChrome t={t}>
      <PasswordChangeForm
        currentCredential={currentCredential}
        newCredential={newCredential}
        confirm={confirm}
        error={error}
        done={done}
        isSaving={isSaving}
        t={t}
        onCurrentChange={setCurrentCredential}
        onNewChange={setNewCredential}
        onConfirmChange={setConfirm}
        onSubmit={handleSubmit}
      />
    </PasswordChangeChrome>
  );
}
