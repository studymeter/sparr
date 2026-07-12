"use client";

import { useTranslations } from "next-intl";

const CONTACT_URL =
  "https://40nndt.share-na2.hsforms.com/2lSTF5JEES12i5FUaP_FA3g";

export default function ContactButton() {
  const t = useTranslations("contact");
  return (
    <a
      className="contact-pill"
      href={CONTACT_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t("title")}
    >
      <span className="contact-text">
        <span className="contact-eyebrow">{t("eyebrow")}</span>
        <span className="contact-main">{t("main")}</span>
      </span>
    </a>
  );
}
