import type { Locale } from "@/i18n/routing";

const LOCALE_TAG: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
};

export function localeToBcp47(locale: Locale): string {
  return LOCALE_TAG[locale];
}

export function formatDateTime(iso: string, locale: Locale): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(localeToBcp47(locale), {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(iso: string, locale: Locale): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(localeToBcp47(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateTimeTable(iso: string, locale: Locale): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return value.toLocaleString(localeToBcp47(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnlyTable(iso: string, locale: Locale): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return value.toLocaleDateString(localeToBcp47(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
