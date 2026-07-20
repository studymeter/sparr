"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDateTimeTable } from "@/lib/i18n/formatDate";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import SignOutButton from "@/components/SignOutButton";
import Footer from "@/components/Footer";
import BrandLogo from "@/components/BrandLogo";

type Account = {
  id: string;
  email: string;
  username: string;
  role: string;
  signInMethod: "password" | "oauth";
  oauthProvider: string | null;
  tickets?: TicketSnapshot;
};

type TicketRow = {
  id: string;
  type: string;
  isActive: boolean;
  consumedAt: string | null;
  consumedScenarioId: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type TicketSnapshot = {
  balance: number;
  ledger: TicketRow[];
};

type SettingsTab = "profile" | "security" | "language" | "tickets" | "session";

type TUserMypage = ReturnType<typeof useTranslations<"userMypage">>;
type TAccount = ReturnType<typeof useTranslations<"account">>;
type TCommon = ReturnType<typeof useTranslations<"common">>;
type TAuth = ReturnType<typeof useTranslations<"auth">>;

const TAB_IDS: SettingsTab[] = [
  "tickets",
  "profile",
  "security",
  "language",
  "session",
];

function ticketTypeLabel(type: string, t: TAccount): string {
  if (type === "registration_grant") return t("ticketTypeRegistration");
  if (type === "monthly_grant") return t("ticketTypeMonthly");
  if (type === "purchase") return t("ticketTypePurchase");
  if (type === "admin_adjust") return t("ticketTypeAdminAdjust");
  return type;
}

function tabLabel(tab: SettingsTab, t: TUserMypage): string {
  if (tab === "profile") return t("sectionProfile");
  if (tab === "security") return t("sectionSecurity");
  if (tab === "language") return t("sectionLanguage");
  if (tab === "tickets") return t("sectionTickets");
  return t("sectionSession");
}

function tabDescription(tab: SettingsTab, t: TUserMypage): string {
  if (tab === "profile") return t("sectionProfileDesc");
  if (tab === "security") return t("sectionSecurityDesc");
  if (tab === "language") return t("sectionLanguageDesc");
  if (tab === "tickets") return t("sectionTicketsDesc");
  return t("sectionSessionDesc");
}

function oauthProviderLabel(provider: string | null, t: TUserMypage): string {
  if (provider === "google") return t("oauthProviderGoogle");
  return provider ?? t("oauthProviderUnknown");
}

type AccountSettings = ReturnType<typeof useAccountSettings>;

// Loads the player's account and ticket snapshot, and owns the profile form
// state (username edit + save status).
function useAccountSettings() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [tickets, setTickets] = useState<TicketSnapshot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refreshTickets = useCallback(async (): Promise<void> => {
    const ticketRes = await fetch("/api/player/tickets");
    if (!ticketRes.ok) return;
    setTickets((await ticketRes.json()) as TicketSnapshot);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/player/account");
      if (!active) return;
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as Account;
        setAccount(data);
        setUsername(data.username);
        setTickets(data.tickets ?? null);
      }
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return {
    account,
    username,
    setUsername,
    status,
    tickets,
    isSaving,
    setIsSaving,
    error,
    setError,
    saved,
    setSaved,
    refreshTickets,
  };
}

function hasBillingResultParam(): boolean {
  if (typeof window === "undefined") return false;
  const status = new URLSearchParams(window.location.search).get("billing");
  return status === "success" || status === "cancel";
}

function SettingsTabBar({
  activeTab,
  onSelect,
  t,
}: {
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
  t: TUserMypage;
}) {
  return (
    <div className="mypage-folder-tabs" role="tablist" aria-label={t("title")}>
      {TAB_IDS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`mypage-tab-${tab}`}
          aria-selected={activeTab === tab}
          aria-controls={`mypage-panel-${activeTab}`}
          className={`mypage-folder-tab${
            activeTab === tab ? " mypage-folder-tab-active" : ""
          }`}
          onClick={() => onSelect(tab)}
        >
          {tabLabel(tab, t)}
        </button>
      ))}
    </div>
  );
}

function SettingsCardHead({
  activeTab,
  account,
  t,
}: {
  activeTab: SettingsTab;
  account: Account | null;
  t: TUserMypage;
}) {
  const isOAuthSecurity =
    activeTab === "security" && account?.signInMethod === "oauth";
  return (
    <div className="mypage-settings-card-head">
      <h2 className="mypage-settings-card-title">{tabLabel(activeTab, t)}</h2>
      <p className="mypage-settings-card-desc">
        {isOAuthSecurity
          ? t("sectionSecurityDescOAuth")
          : tabDescription(activeTab, t)}
      </p>
    </div>
  );
}

function ProfilePanel({
  settings,
  onSubmit,
  tauth,
  tc,
}: {
  settings: AccountSettings;
  onSubmit: (event: React.FormEvent) => void;
  tauth: TAuth;
  tc: TCommon;
}) {
  const disabled = settings.status !== "ready" || settings.isSaving;
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <div className="auth-field">
        <span className="auth-label">{tauth("email")}</span>
        <div className="auth-readonly">{settings.account?.email ?? "—"}</div>
      </div>
      <div className="auth-field">
        <label htmlFor="username" className="auth-label">
          {tauth("displayName")}
        </label>
        <input
          id="username"
          type="text"
          className="auth-input"
          value={settings.username}
          onChange={(event) => settings.setUsername(event.target.value)}
          autoComplete="username"
          required
          disabled={disabled}
        />
      </div>
      {settings.error && <p className="auth-error">{settings.error}</p>}
      {settings.saved && <p className="auth-ok">{tc("saved")}</p>}
      <button
        type="submit"
        className="btn-primary"
        disabled={disabled || !settings.username.trim()}
      >
        {settings.isSaving ? tc("saving") : tc("save")}
      </button>
    </form>
  );
}

function SecurityPanel({
  account,
  t,
  ta,
}: {
  account: Account | null;
  t: TUserMypage;
  ta: TAccount;
}) {
  if (account?.signInMethod === "oauth") {
    return (
      <p className="auth-readonly">
        {t("oauthPasswordManaged", {
          provider: oauthProviderLabel(account.oauthProvider, t),
        })}
      </p>
    );
  }
  return (
    <Link href="/mypage/password" className="btn-secondary">
      {ta("changePassword")}
    </Link>
  );
}

function TicketTable({
  ledger,
  locale,
  ta,
}: {
  ledger: TicketRow[];
  locale: Locale;
  ta: TAccount;
}) {
  return (
    <div className="ticket-table-wrap">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>{ta("dateTime")}</th>
            <th>{ta("type")}</th>
            <th>{ta("status")}</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTimeTable(row.createdAt, locale)}</td>
              <td>{ticketTypeLabel(row.type, ta)}</td>
              <td>
                {row.isActive ? (
                  <span className="ticket-status ticket-active">
                    {ta("unused")}
                  </span>
                ) : row.revokedAt ? (
                  <span className="ticket-status ticket-used">
                    {ta("revoked")}
                  </span>
                ) : (
                  <span className="ticket-status ticket-used">
                    {ta("used")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketsPanel({
  tickets,
  locale,
  t,
  ta,
  tc,
  onPurchase,
  isPurchasing,
  purchaseError,
  purchaseStatus,
}: {
  tickets: TicketSnapshot | null;
  locale: Locale;
  t: TUserMypage;
  ta: TAccount;
  tc: TCommon;
  onPurchase: () => void;
  isPurchasing: boolean;
  purchaseError: string | null;
  purchaseStatus: "success" | "cancel" | null;
}) {
  if (!tickets) {
    return <p className="auth-empty">{tc("loading")}</p>;
  }
  return (
    <>
      <div className="mypage-purchase-card">
        <div className="mypage-purchase-card-head">
          <p className="mypage-purchase-card-title">{t("purchaseCardTitle")}</p>
          <p className="mypage-purchase-card-body">{t("purchaseCardBody")}</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={onPurchase}
          disabled={isPurchasing}
        >
          {isPurchasing ? t("buyTicketsRedirecting") : t("buyTickets")}
        </button>
      </div>
      {purchaseStatus === "success" ? (
        <p className="mypage-purchase-feedback mypage-purchase-feedback-ok">
          {t("purchaseAccepted")}
        </p>
      ) : null}
      {purchaseStatus === "cancel" ? (
        <p className="mypage-purchase-feedback mypage-purchase-feedback-muted">
          {t("purchaseCanceled")}
        </p>
      ) : null}
      {purchaseError ? (
        <p className="mypage-purchase-feedback mypage-purchase-feedback-error">
          {purchaseError}
        </p>
      ) : null}
      <div className="mypage-settings-ticket-summary">
        <div className="mypage-settings-stat">
          <span className="mypage-settings-stat-label">
            {ta("ticketBalance")}
          </span>
          <span className="mypage-settings-stat-value">
            {tickets.balance} {ta("ticketUnit")}
          </span>
        </div>
      </div>
      <div className="auth-field">
        <span className="auth-label">{ta("history")}</span>
        {tickets.ledger.length === 0 ? (
          <div className="auth-readonly">{ta("noHistory")}</div>
        ) : (
          <TicketTable ledger={tickets.ledger} locale={locale} ta={ta} />
        )}
      </div>
    </>
  );
}

type FolderProps = {
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
  settings: AccountSettings;
  locale: Locale;
  onSubmit: (event: React.FormEvent) => void;
  onPurchase: () => void;
  isPurchasing: boolean;
  purchaseError: string | null;
  purchaseStatus: "success" | "cancel" | null;
  t: TUserMypage;
  ta: TAccount;
  tc: TCommon;
  tauth: TAuth;
};

function SettingsPanel({
  activeTab,
  settings,
  locale,
  onSubmit,
  onPurchase,
  isPurchasing,
  purchaseError,
  purchaseStatus,
  t,
  ta,
  tc,
  tauth,
}: {
  activeTab: SettingsTab;
  settings: AccountSettings;
  locale: Locale;
  onSubmit: (event: React.FormEvent) => void;
  onPurchase: () => void;
  isPurchasing: boolean;
  purchaseError: string | null;
  purchaseStatus: "success" | "cancel" | null;
  t: TUserMypage;
  ta: TAccount;
  tc: TCommon;
  tauth: TAuth;
}) {
  if (activeTab === "profile") {
    return (
      <ProfilePanel
        settings={settings}
        onSubmit={onSubmit}
        tauth={tauth}
        tc={tc}
      />
    );
  }
  if (activeTab === "security") {
    return <SecurityPanel account={settings.account} t={t} ta={ta} />;
  }
  if (activeTab === "language") {
    return <LocaleSwitcher className="btn-tertiary mypage-settings-locale" />;
  }
  if (activeTab === "tickets") {
    return (
      <TicketsPanel
        tickets={settings.tickets}
        locale={locale}
        t={t}
        ta={ta}
        tc={tc}
        onPurchase={onPurchase}
        isPurchasing={isPurchasing}
        purchaseError={purchaseError}
        purchaseStatus={purchaseStatus}
      />
    );
  }
  return <SignOutButton className="btn-tertiary" redirectTo="/" showError />;
}

function SettingsFolder(props: FolderProps) {
  const { activeTab, onSelect, settings, t } = props;
  return (
    <div className="mypage-folder">
      <SettingsTabBar activeTab={activeTab} onSelect={onSelect} t={t} />

      <div className="mypage-folder-body">
        <section
          className="mypage-folder-sheet"
          role="tabpanel"
          id={`mypage-panel-${activeTab}`}
          aria-labelledby={`mypage-tab-${activeTab}`}
        >
          <SettingsCardHead
            activeTab={activeTab}
            account={settings.account}
            t={t}
          />
          <SettingsPanel
            activeTab={activeTab}
            settings={settings}
            locale={props.locale}
            onSubmit={props.onSubmit}
            onPurchase={props.onPurchase}
            isPurchasing={props.isPurchasing}
            purchaseError={props.purchaseError}
            purchaseStatus={props.purchaseStatus}
            t={t}
            ta={props.ta}
            tc={props.tc}
            tauth={props.tauth}
          />
        </section>
      </div>
    </div>
  );
}

export default function MyPageSettings() {
  const t = useTranslations("userMypage");
  const ta = useTranslations("account");
  const tc = useTranslations("common");
  const tauth = useTranslations("auth");
  const locale = useLocale() as Locale;
  const [activeTab, setActiveTab] = useState<SettingsTab>("tickets");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseStatus] = useState<"success" | "cancel" | null>(() => {
    if (typeof window === "undefined") return null;
    const status = new URLSearchParams(window.location.search).get("billing");
    return status === "success" || status === "cancel" ? status : null;
  });
  const settings = useAccountSettings();
  const refreshTickets = settings.refreshTickets;

  useEffect(() => {
    if (purchaseStatus !== "success") return;
    void refreshTickets();
  }, [purchaseStatus, refreshTickets]);

  useEffect(() => {
    if (!purchaseStatus) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("billing");
    const next = params.toString();
    const nextUrl = next
      ? `${window.location.pathname}?${next}`
      : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }, [purchaseStatus]);

  useEffect(() => {
    const onPageShow = (): void => {
      // Browser back/forward cache can restore "purchasing" state.
      if (hasBillingResultParam()) {
        setIsPurchasing(false);
        return;
      }
      setIsPurchasing(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    settings.setError(null);
    settings.setSaved(false);
    settings.setIsSaving(true);
    const res = await fetch("/api/player/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: settings.username.trim() }),
    });
    settings.setIsSaving(false);
    if (!res.ok) {
      settings.setError(tc("saveFailed"));
      return;
    }
    settings.setSaved(true);
  };

  const handlePurchase = async (): Promise<void> => {
    setPurchaseError(null);
    setIsPurchasing(true);
    try {
      const res = await fetch("/api/player/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/mypage" }),
      });
      if (!res.ok) throw new Error("checkout_failed");
      const body = (await res.json()) as { url?: string };
      if (!body.url) throw new Error("checkout_url_missing");
      window.location.assign(body.url);
    } catch {
      setPurchaseError(t("purchaseFailed"));
      setIsPurchasing(false);
    }
  };

  return (
    <div className="mp-page">
      <header className="mp-header">
        <Link href="/" className="mp-brand">
          <BrandLogo />
        </Link>
        <nav className="mp-nav">
          <Link href="/" className="btn-tertiary">
            {t("backToHome")}
          </Link>
        </nav>
      </header>

      <main className="mypage-settings-main">
        <div className="mypage-settings-hero">
          <h1 className="mypage-settings-title">{t("title")}</h1>
          <p className="mypage-settings-subtitle">{t("subtitle")}</p>
        </div>

        <SettingsFolder
          activeTab={activeTab}
          onSelect={setActiveTab}
          settings={settings}
          locale={locale}
          onSubmit={handleSubmit}
          onPurchase={handlePurchase}
          isPurchasing={isPurchasing}
          purchaseError={purchaseError}
          purchaseStatus={purchaseStatus}
          t={t}
          ta={ta}
          tc={tc}
          tauth={tauth}
        />
      </main>

      <Footer />
    </div>
  );
}
