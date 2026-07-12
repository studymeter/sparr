"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "@/lib/client/signOut";

type SignOutButtonProps = {
  className?: string;
  redirectTo?: string;
  label?: string;
  showError?: boolean;
};

export default function SignOutButton({
  className = "auth-btn danger",
  redirectTo = "/me",
  label,
  showError = true,
}: SignOutButtonProps) {
  const t = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonLabel = label ?? t("signOut");

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    const ok = await signOut(redirectTo);
    if (!ok) {
      setError(t("signOutFailed"));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void handleClick()}
        disabled={busy}
      >
        {busy ? t("signingOut") : buttonLabel}
      </button>
      {showError && error && <p className="auth-error">{error}</p>}
    </>
  );
}
