"use client";

// My Page — the app's startup screen. Login button top-right, scenario
// selection in the main area. Picking a scenario starts the sparring flow.

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDateTime as formatDate } from "@/lib/i18n/formatDate";
import SignOutButton from "@/components/SignOutButton";
import Footer from "@/components/Footer";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import BrandLogo from "@/components/BrandLogo";

type Account = {
  id: string;
  email: string;
  username: string;
  role: string;
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

type ScenarioCard = {
  id: string;
  title: string;
  description: string;
};

type ResultRow = {
  id: string;
  summary: string;
  evaluation: string;
  createdAt: string;
  scenarioTitle: string | null;
};

type RecentItem = {
  id: string;
  scenarioTitle: string | null;
  headline: string;
  score: number | null;
  createdAt: string;
};

function parseRecent(row: ResultRow): RecentItem {
  let score: number | null = null;
  let headline = row.summary?.split("\n")[0] ?? "";
  try {
    const evaluation = JSON.parse(row.evaluation) as {
      score?: number;
      headline?: string;
    };
    if (typeof evaluation.score === "number") score = evaluation.score;
    if (evaluation.headline) headline = evaluation.headline;
  } catch {
    // summary fallback already set
  }
  return {
    id: row.id,
    scenarioTitle: row.scenarioTitle,
    headline,
    score,
    createdAt: row.createdAt,
  };
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function scoreCircleColor(sc: number): string {
  if (sc >= 70) return "#2563eb";
  if (sc >= 30) return "#f97316";
  return "#e11d48";
}

function rankFor(score: number): string {
  if (score >= 80) return "S";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  if (score >= 30) return "C";
  return "D";
}

function useMyPageData() {
  const [account, setAccount] = useState<Account | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [tickets, setTickets] = useState<TicketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [accRes, scRes, reRes] = await Promise.all([
        fetch("/api/player/account"),
        fetch("/api/player/scenarios"),
        fetch("/api/player/results"),
      ]);
      if (!active) return;
      if (accRes.ok) {
        const accountData = (await accRes.json()) as Account;
        setAccount(accountData);
        const ticketRes = await fetch("/api/player/tickets");
        if (active && ticketRes.ok) {
          setTickets((await ticketRes.json()) as TicketSnapshot);
        }
      }
      if (scRes.ok) setScenarios((await scRes.json()) as ScenarioCard[]);
      if (reRes.ok) {
        const rows = (await reRes.json()) as ResultRow[];
        setRecent(rows.map(parseRecent).slice(0, 5));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { account, scenarios, recent, tickets, loading };
}

function useScenarioStart(input: {
  account: Account | null;
  tickets: TicketSnapshot | null;
  onStart: (scenarioId: string) => void;
}) {
  const { account, tickets, onStart } = input;
  const [pendingScenario, setPendingScenario] = useState<ScenarioCard | null>(
    null
  );
  const [showNoTicketModal, setShowNoTicketModal] = useState(false);

  const hasNoTickets = Boolean(account && tickets && tickets.balance < 1);
  const consumesTicketOnStart = Boolean(account);

  const closeConfirmModal = (): void => {
    setPendingScenario(null);
  };

  const confirmStartScenario = (): void => {
    if (!pendingScenario) return;
    onStart(pendingScenario.id);
    setPendingScenario(null);
  };

  const closeNoTicketModal = (): void => {
    setShowNoTicketModal(false);
  };

  const handleStartScenario = (scenario: ScenarioCard): void => {
    if (hasNoTickets) {
      setShowNoTicketModal(true);
      return;
    }
    if (consumesTicketOnStart) {
      setPendingScenario(scenario);
      return;
    }
    onStart(scenario.id);
  };

  return {
    pendingScenario,
    showNoTicketModal,
    consumesTicketOnStart,
    closeConfirmModal,
    confirmStartScenario,
    closeNoTicketModal,
    handleStartScenario,
  };
}

function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={isOpen ? "M18 6L6 18M6 6l12 12" : "M3 12h18M3 6h18M3 18h18"} />
    </svg>
  );
}

function AuthHeaderNav({
  tickets,
  menuOpen,
  setMenuOpen,
}: {
  tickets: TicketSnapshot | null;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const t = useTranslations("mypage");
  return (
    <>
      <div className="mp-header-actions">
        <button
          className="mp-hamburger"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? t("menuClose") : t("menuOpen")}
        >
          <HamburgerIcon isOpen={menuOpen} />
        </button>
      </div>
      <nav className={`mp-nav mp-nav-auth${menuOpen ? " mp-nav-open" : ""}`}>
        {tickets && (
          <p className="auth-empty">
            {t("ticketsRemaining", { count: tickets.balance })}
          </p>
        )}
        <Link
          href="/mypage"
          className="btn-tertiary"
          onClick={() => setMenuOpen(false)}
        >
          {t("myAccount")}
        </Link>
        <SignOutButton
          className="btn-tertiary"
          redirectTo="/me"
          showError={false}
        />
      </nav>
      {menuOpen && (
        <div className="mp-menu-backdrop" onClick={() => setMenuOpen(false)} />
      )}
    </>
  );
}

function MyPageHeader({
  account,
  tickets,
  menuOpen,
  setMenuOpen,
}: {
  account: Account | null;
  tickets: TicketSnapshot | null;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const t = useTranslations("mypage");
  return (
    <header className="mp-header">
      <Link href="https://sparr.studymeter.jp/" className="mp-brand">
        <BrandLogo />
      </Link>

      {/* Desktop nav; on mobile a hamburger menu (signed-in only) */}
      {account ? (
        <AuthHeaderNav
          tickets={tickets}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      ) : (
        <nav className="mp-nav">
          <LocaleSwitcher />
          <Link href="/signin" className="btn-primary shadow">
            {t("login")}
          </Link>
        </nav>
      )}
    </header>
  );
}

function HeroDecoration() {
  return (
    <svg
      className="mp-hero-deco"
      viewBox="0 0 440 440"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blob-grad" x1="40%" y1="1%" x2="60%" y2="99%">
          <stop offset="0%" stopColor="#E0E5FB" />
        </linearGradient>
      </defs>
      <path
        d="M 379.2068710805023,220 C 376.13223821633886,271.02030794003457 352.43927445852535,309.14397168322097 314.0317625264993,337.91210068874824 C 275.6242505944732,366.6802296942755 236.82094056700288,372.5687628248244 187.16931142037203,363.84064502763647 C 137.51768227374117,355.11252723044856 84.43388788187863,335.18803891222626 65.7736167933451,294.2715117028087 C 47.11334570481157,253.35498449339113 69.60916137015437,202.96957460707966 93.8679559777044,159.2580089805486 C 118.12675058525443,115.54644335401753 139.96019565717276,91.00317316854803 187.0675898310952,75.71368357015339 C 234.17498400501765,60.424193971758754 290.9770705974352,53.953297702606065 329.40492684731663,82.81056098857539 C 367.83278309719805,111.66782427454471 382.28150394466576,168.97969205996543 379.2068710805023,220 Z"
        fill="url(#blob-grad)"
        stroke="none"
      />
    </svg>
  );
}

function HeroSection({ account }: { account: Account | null }) {
  const t = useTranslations("mypage");
  return (
    <section className="mp-hero">
      <HeroDecoration />
      <p className="sm-eyebrow">{t("eyebrow")}</p>
      <div>
        {account ? (
          <div>
            <h1 className="mp-title">{t("greeting")}</h1>
            <h1 className="mp-title">
              <span style={{ color: "var(--sm-primary)" }}>
                {account.username}
              </span>{" "}
              <span>{t("honorific")}</span>
            </h1>
          </div>
        ) : (
          <div>
            <h1 className="mp-title">
              {t("heroTitle")}{" "}
              <span className="sm-gradient-text sm-display">
                {t("heroTitleHighlight")}
              </span>
            </h1>
          </div>
        )}
      </div>
      <p className="mp-lead">{t("lead")}</p>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      className="mp-search-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScenarioList({
  scenarios,
  onSelect,
}: {
  scenarios: ScenarioCard[];
  onSelect: (scenario: ScenarioCard) => void;
}) {
  const t = useTranslations("mypage");
  const tc = useTranslations("common");
  return (
    <div className="mp-scenarios">
      {scenarios.map((sc) => (
        <div className="mp-card" key={sc.id}>
          <span className="mp-card-title">{sc.title || t("noTitle")}</span>
          <span className="mp-card-desc">
            {truncate(sc.description || t("noDescription"), 75)}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "end",
              width: "100%",
            }}
          >
            <button
              type="button"
              className="btn-primary"
              onClick={() => onSelect(sc)}
            >
              {tc("start")} →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScenarioSection({
  scenarios,
  searchQuery,
  setSearchQuery,
  onSelect,
}: {
  scenarios: ScenarioCard[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSelect: (scenario: ScenarioCard) => void;
}) {
  const t = useTranslations("mypage");
  const filteredScenarios = scenarios.filter((sc) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      sc.title.toLowerCase().includes(query) ||
      sc.description.toLowerCase().includes(query)
    );
  });
  return (
    <section className="mp-section">
      <h2 className="mp-section-title">{t("scenariosSection")}</h2>
      <div className="mp-search-wrap">
        <SearchIcon />
        <input
          type="text"
          className="mp-search-input"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(ev) => setSearchQuery(ev.target.value)}
        />
      </div>
      {filteredScenarios.length === 0 ? (
        <p className="auth-empty">
          {scenarios.length === 0 ? t("noScenarios") : t("noMatchingScenarios")}
        </p>
      ) : (
        <ScenarioList scenarios={filteredScenarios} onSelect={onSelect} />
      )}
    </section>
  );
}

function ScoreCircle({ score }: { score: number }) {
  return (
    <div className="ri-score">
      <div className="ri-circle-wrap">
        <svg viewBox="0 0 60 60" className="ri-circle-svg" aria-hidden="true">
          <circle
            cx="30"
            cy="30"
            r="24"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="5"
          />
          <circle
            cx="30"
            cy="30"
            r="24"
            fill="none"
            stroke={scoreCircleColor(score)}
            strokeWidth="5"
            strokeDasharray="150.8"
            strokeDashoffset={150.8 * (1 - score / 100)}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
          />
        </svg>
        <div className="ri-circle-inner">
          <span className="ri-rank" style={{ color: scoreCircleColor(score) }}>
            {rankFor(score)}
          </span>
        </div>
      </div>
      <div className="ri-num-wrap">
        <span className="ri-num" style={{ color: scoreCircleColor(score) }}>
          {score}
        </span>
        <span className="ri-denom">/ 100</span>
      </div>
    </div>
  );
}

function RecentResultItem({ result }: { result: RecentItem }) {
  const t = useTranslations("mypage");
  const locale = useLocale() as Locale;
  return (
    <div className="result-item">
      <span className="result-headline">
        {result.scenarioTitle || t("noTitle")}
      </span>
      <div className="result-top">
        <span className="mp-card-desc"> {result.headline}</span>
        {result.score !== null && <ScoreCircle score={result.score} />}
      </div>
      <div className="result-meta">{formatDate(result.createdAt, locale)}</div>
    </div>
  );
}

function RecentSection({ recent }: { recent: RecentItem[] }) {
  const t = useTranslations("mypage");
  return (
    <section className="mp-section">
      <h2 className="mp-section-title">{t("recentSessions")}</h2>
      <div className="mypage-results">
        {recent.map((result) => (
          <RecentResultItem key={result.id} result={result} />
        ))}
      </div>
    </section>
  );
}

function NoTicketModal({
  onClose,
  onPurchase,
  purchasePending,
  purchaseError,
}: {
  onClose: () => void;
  onPurchase: () => void;
  purchasePending: boolean;
  purchaseError: string | null;
}) {
  const t = useTranslations("mypage");
  const tc = useTranslations("common");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal mp-confirm-modal"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mp-confirm-body">
          <h3 className="mp-confirm-title">{t("noTicketsTitle")}</h3>
          <p className="mp-confirm-text">{t("buyTicketsHint")}</p>
          {purchaseError && <p className="auth-empty">{purchaseError}</p>}
          <div className="mp-confirm-actions">
            <button
              type="button"
              className="btn-tertiary"
              onClick={onPurchase}
              disabled={purchasePending}
            >
              {purchasePending ? t("buyTicketsRedirecting") : t("buyTickets")}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              {tc("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmStartModal({
  scenario,
  consumesTicket,
  onCancel,
  onConfirm,
}: {
  scenario: ScenarioCard;
  consumesTicket: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("mypage");
  const tc = useTranslations("common");
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal mp-confirm-modal"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mp-confirm-body">
          <h3 className="mp-confirm-title">
            {t("startConfirm", {
              title: scenario.title || t("thisScenario"),
            })}
          </h3>
          <p className="mp-confirm-text">
            {consumesTicket ? t("consumesTicket") : t("startsSetup")}
          </p>
          <div className="mp-confirm-actions">
            <button type="button" className="btn-tertiary" onClick={onCancel}>
              {tc("cancel")}
            </button>
            <button type="button" className="btn-primary" onClick={onConfirm}>
              {tc("start")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function readBillingFlash(): "success" | "cancel" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const status = params.get("billing");
  return status === "success" || status === "cancel" ? status : null;
}

function clearBillingQueryParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("billing")) return;
  params.delete("billing");
  const next = params.toString();
  const nextUrl = next
    ? `${window.location.pathname}?${next}`
    : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function BillingFlash() {
  const t = useTranslations("mypage");
  const [status] = useState(readBillingFlash);
  useEffect(() => {
    clearBillingQueryParam();
  }, []);
  if (status === "success") {
    return (
      <p className="mp-billing-flash mp-billing-flash-success">
        {t("purchaseAccepted")}
      </p>
    );
  }
  if (status === "cancel") {
    return (
      <p className="mp-billing-flash mp-billing-flash-muted">
        {t("purchaseCanceled")}
      </p>
    );
  }
  return null;
}

function useTicketPurchase() {
  const t = useTranslations("mypage");
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  useEffect(() => {
    const onPageShow = (): void => {
      // Browser back/forward cache can keep stale local state.
      setPurchasePending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const purchase = async (): Promise<void> => {
    setPurchaseError(null);
    setPurchasePending(true);
    try {
      const res = await fetch("/api/player/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1 }),
      });
      if (!res.ok) throw new Error("checkout_failed");
      const body = (await res.json()) as { url?: string };
      if (!body.url) throw new Error("checkout_url_missing");
      window.location.assign(body.url);
    } catch {
      setPurchaseError(t("purchaseFailed"));
      setPurchasePending(false);
    }
  };

  return { purchase, purchasePending, purchaseError };
}

function MyPageLoading() {
  const tc = useTranslations("common");
  return (
    <div className="mp-loading" role="status" aria-busy="true">
      <BrandLogo className="mp-loading-logo" />
      <span className="mp-loading-label">{tc("loading")}</span>
    </div>
  );
}

export default function MyPage({
  onStart,
}: {
  onStart: (scenarioId: string) => void;
}) {
  const { account, scenarios, recent, tickets, loading } = useMyPageData();
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const start = useScenarioStart({ account, tickets, onStart });
  const { purchase, purchasePending, purchaseError } = useTicketPurchase();

  if (loading) return <MyPageLoading />;

  return (
    <div className="mp-page">
      <MyPageHeader
        account={account}
        tickets={tickets}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <main className="mp-main">
        <HeroSection account={account} />
        <BillingFlash />
        <ScenarioSection
          scenarios={scenarios}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelect={start.handleStartScenario}
        />
        {account && recent.length > 0 && <RecentSection recent={recent} />}
      </main>
      {start.showNoTicketModal && (
        <NoTicketModal
          onClose={start.closeNoTicketModal}
          onPurchase={purchase}
          purchasePending={purchasePending}
          purchaseError={purchaseError}
        />
      )}
      {start.pendingScenario && (
        <ConfirmStartModal
          scenario={start.pendingScenario}
          consumesTicket={start.consumesTicketOnStart}
          onCancel={start.closeConfirmModal}
          onConfirm={start.confirmStartScenario}
        />
      )}
      <Footer />
    </div>
  );
}
