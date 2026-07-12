"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  const nextLocale: Locale = locale === "ja" ? "en" : "ja";

  return (
    <button
      type="button"
      className={className ?? "btn-tertiary"}
      onClick={() => router.replace(pathname, { locale: nextLocale })}
      aria-label={t("localeSwitchAria")}
    >
      {t("localeSwitch")}
    </button>
  );
}
