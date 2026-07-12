"use client";

import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <a
        className="sf-powered"
        href="https://studymeter.jp"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="sf-powered-label">Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Studymeter_logo.png" alt="StudyMeter" />
      </a>
      <nav className="sf-links">
        <span className="sf-copy">© {year} Studymeter Inc.</span>
        <a
          href="https://studymeter.jp"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("company")}
        </a>
        <a
          href="https://studymeter.jp/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("privacy")}
        </a>
        <a
          href="https://studymeter.jp/termsofuse"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("terms")}
        </a>
      </nav>
    </footer>
  );
}
