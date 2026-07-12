"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type PasswordInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "type">;

export default function PasswordInput({
  className = "auth-input",
  disabled,
  ...props
}: PasswordInputProps) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={className}
        disabled={disabled}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? t("passwordHideAria") : t("passwordShowAria")}
        aria-pressed={visible}
      >
        {visible ? t("passwordHide") : t("passwordShow")}
      </button>
    </div>
  );
}
