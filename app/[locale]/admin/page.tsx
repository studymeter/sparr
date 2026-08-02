"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDateTimeTable } from "@/lib/i18n/formatDate";
import SignOutButton from "@/components/SignOutButton";
import PasswordInput from "@/components/PasswordInput";
import BrandLogo from "@/components/BrandLogo";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountRole = "player" | "admin";
type Account = {
  id: string;
  email: string;
  username: string;
  role: AccountRole;
  createdAt?: string;
};
type RecentResult = {
  id: string;
  accountId: string | null;
  scenarioId: string;
  summary: string;
  evaluation: string;
};
type DashboardResult = RecentResult & {
  scenarioTitle: string;
  accountUsername: string | null;
  accountEmail: string | null;
};
type DashboardStats = {
  totalUsers: number;
  totalScenarios: number;
  totalResults: number;
  recentResults: DashboardResult[];
};
type ScenarioSummary = {
  id: string;
  title: string;
  challengePrompt: string;
  tags: string[];
};
type Persona = {
  id: string;
  scenarioId: string;
  characterPrompt: string;
  voiceCode: string;
  docToolEnabled: boolean;
};
type ScenarioDetail = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  basePrompt: string;
  challengePrompt: string;
  documentsPrompt: string;
  rubricPrompt: string;
  personas: Persona[];
};
type Setting = { key: string; value: string };
type Tab = "dashboard" | "users" | "scenarios" | "settings" | "account";
type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "admin-theme";
type UserModal =
  | { kind: "create" }
  | { kind: "edit"; user: Account }
  | { kind: "delete"; user: Account }
  | { kind: "view"; user: Account }
  | { kind: "tickets"; user: Account }
  | { kind: "bulkTickets"; users: Account[] };
type UserResult = RecentResult & { scenarioTitle: string };
type UserDetail = Account & { results: UserResult[] };
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
type ScenarioModal =
  | { kind: "create" }
  | { kind: "edit"; id: string }
  | { kind: "delete"; scenario: ScenarioSummary }
  | { kind: "results"; scenario: ScenarioSummary };
type ScenarioUserStat = {
  accountId: string | null;
  email: string | null;
  username: string | null;
  playCount: number;
  averageScore: number | null;
  bestScore: number | null;
};
type ScenarioResultsSummary = {
  scenarioId: string;
  totalPlays: number;
  totalUsers: number;
  averageScore: number | null;
  perUser: ScenarioUserStat[];
};
type PersonaRow = {
  id: string;
  characterPrompt: string;
  voiceCode: string;
  docToolEnabled: boolean;
};
type ScenarioFormState = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  basePrompt: string;
  challengePrompt: string;
  documentsPrompt: string;
  rubricPrompt: string;
  personas: PersonaRow[];
};
type PromptFieldDef = {
  key: string;
  label: string;
  value: string;
  setter: (val: string) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined | null, locale: Locale): string {
  if (!iso) return "—";
  return formatDateTimeTable(iso, locale);
}

function ticketTypeLabel(
  type: string,
  t: ReturnType<typeof useTranslations<"account">>
): string {
  if (type === "registration_grant") return t("ticketTypeRegistration");
  if (type === "monthly_grant") return t("ticketTypeMonthly");
  if (type === "purchase") return t("ticketTypePurchase");
  if (type === "admin_adjust") return t("ticketTypeAdminAdjust");
  return type;
}

function extractScore(evaluation: string): number | null {
  try {
    const parsed = JSON.parse(evaluation) as { score?: number };
    return typeof parsed.score === "number" ? parsed.score : null;
  } catch {
    return null;
  }
}

function scenarioLabel(scenario: ScenarioSummary): string {
  return scenario.title || scenario.id;
}

function distinctSortedTags(list: ScenarioSummary[]): string[] {
  return [...new Set(list.flatMap((scenario) => scenario.tags))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function toFormState(detail: ScenarioDetail): ScenarioFormState {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    tags: detail.tags,
    basePrompt: detail.basePrompt,
    challengePrompt: detail.challengePrompt,
    documentsPrompt: detail.documentsPrompt,
    rubricPrompt: detail.rubricPrompt,
    personas: detail.personas.map(
      ({ id, characterPrompt, voiceCode, docToolEnabled }) => ({
        id,
        characterPrompt,
        voiceCode,
        docToolEnabled,
      })
    ),
  };
}

async function loadScenarioDetail(
  scenarioId: string,
  isActive: () => boolean,
  onLoad: (detail: ScenarioDetail) => void,
  setLoading: (val: boolean) => void
) {
  const res = await fetch(`/api/admin/scenarios/${scenarioId}`);
  if (!isActive()) return;
  if (res.ok) onLoad((await res.json()) as ScenarioDetail);
  setLoading(false);
}

type ScenarioCallbacks = {
  setBusy: (val: boolean) => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  saveFailedMsg: string;
  createFailedMsg: string;
};

async function submitScenarioForm(
  isEdit: boolean,
  scenarioId: string | undefined,
  formState: ScenarioFormState,
  cbs: ScenarioCallbacks
) {
  const { setBusy, onError, onSaved, saveFailedMsg, createFailedMsg } = cbs;
  const personas: Persona[] | undefined =
    formState.personas.length > 0
      ? formState.personas.map((row) => ({ ...row, scenarioId: formState.id }))
      : undefined;
  setBusy(true);
  const url = isEdit
    ? `/api/admin/scenarios/${scenarioId}`
    : "/api/admin/scenarios";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...formState, personas }),
  });
  setBusy(false);
  if (!res.ok) {
    onError(isEdit ? saveFailedMsg : createFailedMsg);
    return;
  }
  onSaved();
}

type SubmitCreateUserOpts = {
  email: string;
  cred: string;
  username: string;
  role: AccountRole;
  setErr: (msg: string | null) => void;
  setBusy: (val: boolean) => void;
  onError: (msg: string) => void;
  onCreated: () => void;
  passwordMin8Msg: string;
  emailExistsMsg: string;
  createFailedMsg: string;
};

async function submitCreateUser(opts: SubmitCreateUserOpts) {
  const {
    email,
    cred,
    username,
    role,
    setErr,
    setBusy,
    onError,
    onCreated,
    passwordMin8Msg,
    emailExistsMsg,
    createFailedMsg,
  } = opts;
  if (cred.length < 8) {
    setErr(passwordMin8Msg);
    return;
  }
  setBusy(true);
  setErr(null);
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      credential: cred,
      username: username.trim() || undefined,
      role,
    }),
  });
  setBusy(false);
  if (res.status === 409) {
    setErr(emailExistsMsg);
    return;
  }
  if (!res.ok) {
    onError(createFailedMsg);
    return;
  }
  onCreated();
}

type SubmitEditUserOpts = {
  userId: string;
  username: string;
  origUsername: string;
  role: AccountRole;
  origRole: AccountRole;
  setErr: (msg: string | null) => void;
  setBusy: (val: boolean) => void;
  onError: (msg: string) => void;
  onSaved: () => void;
  selfRoleChangeMsg: string;
  checkInputMsg: string;
  saveFailedMsg: string;
};

async function submitEditUser(opts: SubmitEditUserOpts) {
  const {
    userId,
    username,
    origUsername,
    role,
    origRole,
    setErr,
    setBusy,
    onError,
    onSaved,
    selfRoleChangeMsg,
    checkInputMsg,
    saveFailedMsg,
  } = opts;
  setBusy(true);
  setErr(null);
  const body: { username?: string; role?: AccountRole } = {};
  if (username.trim() !== origUsername) body.username = username.trim();
  if (role !== origRole) body.role = role;
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  setBusy(false);
  if (res.status === 400) {
    const data = (await res.json()) as { error?: string };
    setErr(
      data.error === "cannot_change_own_role"
        ? selfRoleChangeMsg
        : checkInputMsg
    );
    return;
  }
  if (!res.ok) {
    onError(saveFailedMsg);
    return;
  }
  onSaved();
}

function showOk(setter: (msg: string | null) => void, msg: string) {
  setter(msg);
  setTimeout(() => setter(null), 3000);
}

// ── Style constants ───────────────────────────────────────────────────────────

const ST = {
  // .mp-page (globals.css) only sets min-height/overflow, which is a no-op
  // without a bounded height — and the app-wide `body { overflow: hidden }`
  // (built for the fixed-viewport call screens) then blocks scrolling
  // entirely. Give the admin root its own bounded, scrollable box instead of
  // touching that shared global rule.
  page: { height: "100vh", overflowY: "auto" } as React.CSSProperties,
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "24px 20px",
    boxShadow: "var(--sm-shadow-sm)",
    textAlign: "center",
  } as React.CSSProperties,
  area: {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 13,
    resize: "vertical",
    color: "var(--text)",
    background: "var(--card)",
    boxSizing: "border-box",
    lineHeight: 1.6,
  } as React.CSSProperties,
  td: { padding: "12px 14px", color: "var(--text)" } as React.CSSProperties,
  tdKey: {
    padding: "12px 14px",
    color: "var(--text)",
    fontFamily: "monospace",
    fontSize: 13,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  tdAction: {
    padding: "8px 10px",
    width: 100,
    textAlign: "center",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  tdCheckbox: {
    padding: "12px 8px 12px 14px",
    width: 32,
  } as React.CSSProperties,
  tdDate: {
    padding: "12px 14px",
    color: "var(--muted)",
    fontSize: 12,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  btnSm: {
    fontSize: 13,
    height: 32,
    padding: "0 14px",
    borderRadius: 6,
    fontWeight: 600,
    color: "var(--accent)",
    borderColor: "var(--accent)",
    background: "var(--accent-soft)",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  btnDanger: {
    fontSize: 13,
    height: 32,
    padding: "0 14px",
    borderRadius: 6,
    fontWeight: 600,
    color: "var(--danger)",
    borderColor: "var(--danger-border)",
    background: "var(--danger-soft)",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  selfBadge: {
    display: "inline-block",
    marginLeft: 6,
    fontSize: 11,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 999,
    padding: "1px 7px",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  scItem: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "18px 20px",
    boxShadow: "var(--sm-shadow-sm)",
    transition: "box-shadow 0.18s ease",
  } as React.CSSProperties,
  scInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  } as React.CSSProperties,
  scLeft: { flex: 1, minWidth: 0 } as React.CSSProperties,
  scId: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: 6,
    fontFamily: "monospace",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  } as React.CSSProperties,
  scChallenge: {
    fontSize: 14,
    color: "var(--text)",
    lineHeight: 1.6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  scBtns: { display: "flex", gap: 6, flexShrink: 0 } as React.CSSProperties,
  tagBadgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  } as React.CSSProperties,
  tagBadge: {
    display: "inline-block",
    fontSize: 11,
    color: "var(--muted)",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "2px 9px",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  tagChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--text)",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "2px 6px 2px 10px",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  tagChipRemove: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
    padding: "0 4px",
  } as React.CSSProperties,
  addBox: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: "20px",
    background: "var(--card)",
  } as React.CSSProperties,
  addTitle: {
    margin: "0 0 14px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "var(--sm-font-display)",
    color: "var(--text)",
  } as React.CSSProperties,
  addForm: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr auto",
    gap: 8,
  } as React.CSSProperties,
  settingRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 8,
  } as React.CSSProperties,
  settingHead: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--muted)",
    padding: "0 4px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  } as React.CSSProperties,
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "var(--header-bg)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,
  headerInner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    gap: 16,
  } as React.CSSProperties,
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    minWidth: 0,
  } as React.CSSProperties,
  brand: {
    fontSize: 18,
    fontWeight: 900,
    fontFamily: "var(--sm-font-display)",
    letterSpacing: "0.02em",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  nav: {
    display: "flex",
    gap: 2,
    overflowX: "auto",
    scrollbarWidth: "none",
  } as React.CSSProperties,
  playerLink: {
    fontSize: 13,
    color: "var(--accent)",
    fontWeight: 600,
    textDecoration: "none",
    flexShrink: 0,
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "6px 14px",
    background: "var(--card)",
  } as React.CSSProperties,
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  } as React.CSSProperties,
  themeToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: 8,
    background: "var(--card)",
    cursor: "pointer",
  } as React.CSSProperties,
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "32px 24px 80px",
  } as React.CSSProperties,
  pageH2: {
    fontSize: 22,
    fontWeight: 800,
    fontFamily: "var(--sm-font-display)",
    margin: "0 0 20px",
    color: "var(--text)",
  } as React.CSSProperties,
  dashGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 16,
    marginBottom: 32,
  } as React.CSSProperties,
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } as React.CSSProperties,
  // .result-top (globals.css) assumes a heading sits above it and adds
  // margin-top for that spacing — here it's the card's first element, so
  // the inherited margin just shows up as stray whitespace at the top.
  resultTop: { marginTop: 0 } as React.CSSProperties,
  scenarioLine: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  } as React.CSSProperties,
  scenarioTag: {
    color: "var(--accent)",
    fontWeight: 700,
  } as React.CSSProperties,
  scenarioSummary: {
    fontWeight: 400,
    color: "var(--muted)",
  } as React.CSSProperties,
  sectionH3: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "var(--sm-font-display)",
    margin: "0 0 12px",
    color: "var(--text)",
  } as React.CSSProperties,
  statValue: {
    fontSize: 40,
    fontWeight: 900,
    fontFamily: "var(--sm-font-display)",
    color: "var(--accent)",
    lineHeight: 1,
    marginBottom: 2,
  } as React.CSSProperties,
  statLabel: {
    fontSize: 13,
    color: "var(--muted)",
    marginTop: 6,
    fontWeight: 500,
  } as React.CSSProperties,
  toolbar: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } as React.CSSProperties,
  bulkBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    padding: "10px 16px",
    background: "var(--accent-soft)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text)",
  } as React.CSSProperties,
  bulkUserList: {
    maxHeight: 160,
    overflowY: "auto",
    margin: "12px 0 20px",
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.9,
  } as React.CSSProperties,
  thRow: {
    background: "var(--accent-soft)",
    borderBottom: "1px solid var(--border)",
  } as React.CSSProperties,
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    letterSpacing: "0.03em",
  } as React.CSSProperties,
  confirmInner: {
    padding: "32px 32px 28px",
    maxWidth: 440,
    width: "100%",
  } as React.CSSProperties,
  confirmMsg: {
    margin: "0 0 20px",
    fontSize: 16,
    color: "var(--text)",
    lineHeight: 1.6,
  } as React.CSSProperties,
  confirmBtns: { display: "flex", gap: 10 } as React.CSSProperties,
  flex1: { flex: 1 } as React.CSSProperties,
  editEmailField: { marginBottom: 12 } as React.CSSProperties,
  selfNote: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "4px 0 0",
  } as React.CSSProperties,
  accountWrap: { maxWidth: 460 } as React.CSSProperties,
  scenarioToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  } as React.CSSProperties,
  userModalsModal: {
    padding: "28px 32px",
    maxWidth: 560,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
  } as React.CSSProperties,
  wideModal: {
    padding: "28px 32px",
    maxWidth: 700,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
  } as React.CSSProperties,
  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottom: "1px solid var(--border)",
    marginBottom: 24,
  } as React.CSSProperties,
  modalTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 700,
    fontFamily: "var(--sm-font-display)",
  } as React.CSSProperties,
  formActBtns: {
    display: "flex",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
  } as React.CSSProperties,
  userBtns: { display: "flex", gap: 6 } as React.CSSProperties,
  roleBadgeAdmin: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    letterSpacing: "0.03em",
  } as React.CSSProperties,
  roleBadgePlayer: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 999,
    background: "var(--muted-soft)",
    color: "var(--muted)",
    letterSpacing: "0.03em",
  } as React.CSSProperties,
  tableWrap: { overflowX: "auto" } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  } as React.CSSProperties,
  personaNote: {
    fontSize: 11,
    color: "var(--muted)",
    margin: "4px 0 0",
  } as React.CSSProperties,
  personaSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } as React.CSSProperties,
  personaTableWrap: {
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  } as React.CSSProperties,
  closeBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--muted)",
    fontSize: 20,
    lineHeight: 1,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexShrink: 0,
    padding: 0,
  } as React.CSSProperties,
  saveBtnMt: { marginTop: 8 } as React.CSSProperties,
  centerToast: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(31, 42, 55, 0.90)",
    color: "#fff",
    borderRadius: 12,
    padding: "14px 32px",
    fontSize: 15,
    fontWeight: 600,
    zIndex: 9999,
    pointerEvents: "none",
    transition: "opacity 0.3s ease",
  } as React.CSSProperties,
  settingsDesc: {
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.75,
    margin: "0 0 20px",
    padding: "12px 16px",
    background: "var(--accent-soft)",
    borderRadius: 10,
    border: "1px solid var(--border)",
  } as React.CSSProperties,
  ticketFormsRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 12,
  } as React.CSSProperties,
  ticketGrantForm: {
    display: "flex",
    gap: 8,
  } as React.CSSProperties,
  ticketCountInput: { width: 90 } as React.CSSProperties,
  roleToggle: {
    display: "inline-flex",
    gap: 4,
    padding: 4,
    background: "var(--muted-soft)",
    borderRadius: 999,
    width: "fit-content",
  } as React.CSSProperties,
  roleToggleDisabled: {
    display: "inline-flex",
    gap: 4,
    padding: 4,
    background: "var(--muted-soft)",
    borderRadius: 999,
    width: "fit-content",
    opacity: 0.55,
  } as React.CSSProperties,
  roleToggleBtn: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 22px",
    borderRadius: 999,
    cursor: "pointer",
  } as React.CSSProperties,
  roleToggleBtnActive: {
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 22px",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "var(--sm-shadow-sm)",
  } as React.CSSProperties,
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatusMsg({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) return <p className="auth-error">{error}</p>;
  if (ok) return <p className="auth-ok">{ok}</p>;
  return null;
}

type ModalShellProps = {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
};
function ModalShell({ title, onClose, wide, children }: ModalShellProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={wide ? ST.wideModal : ST.userModalsModal}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div style={ST.modalHead}>
          <h2 style={ST.modalTitle}>{title}</h2>
          <button type="button" style={ST.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type FormActionsProps = {
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
};
function FormActions({ busy, submitLabel, onCancel }: FormActionsProps) {
  const tc = useTranslations("common");
  return (
    <div style={ST.formActBtns}>
      <button
        type="button"
        className="auth-btn secondary"
        style={ST.flex1}
        onClick={onCancel}
        disabled={busy}
      >
        {tc("cancel")}
      </button>
      <button
        type="submit"
        className="auth-btn"
        style={ST.flex1}
        disabled={busy}
      >
        {busy ? tc("saving") : submitLabel}
      </button>
    </div>
  );
}

type ConfirmButtonsProps = {
  busy: boolean;
  danger?: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};
function ConfirmButtons({
  busy,
  danger,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmButtonsProps) {
  const tc = useTranslations("common");
  const bgStyle = danger ? { flex: 1, background: "var(--danger)" } : ST.flex1;
  return (
    <div style={ST.confirmBtns}>
      <button
        type="button"
        className="auth-btn secondary"
        style={ST.flex1}
        onClick={onCancel}
        disabled={busy}
      >
        {tc("cancel")}
      </button>
      <button
        type="button"
        className="auth-btn"
        style={bgStyle}
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? tc("processing") : confirmLabel}
      </button>
    </div>
  );
}

type ConfirmModalProps = {
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  danger?: boolean;
};
function ConfirmModal({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: ConfirmModalProps) {
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handleConfirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
    } catch {
      setErr(tc("operationFailed"));
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        style={ST.confirmInner}
        onClick={(ev) => ev.stopPropagation()}
      >
        <p style={ST.confirmMsg}>{message}</p>
        {err && <p className="auth-error">{err}</p>}
        <ConfirmButtons
          busy={busy}
          danger={danger}
          confirmLabel={confirmLabel}
          onCancel={onCancel}
          onConfirm={() => void handleConfirm()}
        />
      </div>
    </div>
  );
}

function CenterToast({ show }: { show: boolean }) {
  const tc = useTranslations("common");
  return (
    <div style={{ ...ST.centerToast, opacity: show ? 1 : 0 }}>
      {tc("saved")}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={ST.card}>
      <div style={ST.statValue}>{value}</div>
      <div style={ST.statLabel}>{label}</div>
    </div>
  );
}

function RecentResultItem({ result }: { result: DashboardResult }) {
  const t = useTranslations("admin");
  const score = extractScore(result.evaluation);
  return (
    <div className="result-item">
      <div className="result-top" style={ST.resultTop}>
        <span style={ST.scenarioLine}>
          <span style={ST.scenarioTag}>{t("scenarioTag")}</span>{" "}
          {result.scenarioTitle}
          {result.summary && (
            <span style={ST.scenarioSummary}>
              {" — "}
              {result.summary.split("\n")[0]}
            </span>
          )}
        </span>
        {score !== null && (
          <span className="result-score" style={{ fontSize: 16 }}>
            {t("scorePoints", { score })}
          </span>
        )}
      </div>
      <div className="result-meta">
        {t("accountLabel")}{" "}
        {result.accountUsername ?? result.accountEmail ?? "—"}
      </div>
    </div>
  );
}

function Dashboard() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/admin/dashboard");
      if (!active) return;
      if (!res.ok) {
        setError(tc("loadFailed"));
      } else {
        setStats((await res.json()) as DashboardStats);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [tc]);
  if (loading) return <p className="auth-empty">{tc("loading")}</p>;
  if (error ?? !stats)
    return <p className="auth-error">{error ?? tc("error")}</p>;
  const cards = [
    { label: t("stats.users"), value: stats.totalUsers },
    { label: t("stats.scenarios"), value: stats.totalScenarios },
    { label: t("stats.sessions"), value: stats.totalResults },
  ];
  return (
    <div>
      <div style={ST.dashGrid}>
        {cards.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      <h3 style={ST.sectionH3}>{t("recentSessions")}</h3>
      {stats.recentResults.length === 0 ? (
        <p className="auth-empty">{t("noSessions")}</p>
      ) : (
        <div style={ST.recentList}>
          {stats.recentResults.map((result) => (
            <RecentResultItem key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: AccountRole }) {
  return (
    <span style={role === "admin" ? ST.roleBadgeAdmin : ST.roleBadgePlayer}>
      {role}
    </span>
  );
}

function UserRowActions({
  isSelf,
  isPlayer,
  onView,
  onTickets,
  onEdit,
  onDelete,
}: {
  isSelf: boolean;
  isPlayer: boolean;
  onView: () => void;
  onTickets: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  return (
    <div style={ST.userBtns}>
      <button
        type="button"
        className="tb-btn"
        style={ST.btnSm}
        onClick={onView}
      >
        {t("actions.view")}
      </button>
      {isPlayer && (
        <button
          type="button"
          className="tb-btn"
          style={ST.btnSm}
          onClick={onTickets}
        >
          {t("actions.tickets")}
        </button>
      )}
      <button
        type="button"
        className="tb-btn"
        style={ST.btnSm}
        onClick={onEdit}
      >
        {t("actions.edit")}
      </button>
      {!isSelf && (
        <button
          type="button"
          className="tb-btn danger"
          style={ST.btnDanger}
          onClick={onDelete}
        >
          {tc("delete")}
        </button>
      )}
    </div>
  );
}

function UserRow({
  user,
  selfId,
  selected,
  onToggleSelect,
  onView,
  onTickets,
  onEdit,
  onDelete,
}: {
  user: Account;
  selfId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onTickets: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const isSelf = user.id === selfId;
  const isPlayer = user.role === "player";
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        background: isSelf ? "var(--accent-soft)" : undefined,
      }}
    >
      <td style={ST.tdCheckbox}>
        {isPlayer && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        )}
      </td>
      <td style={ST.td}>
        {user.email}
        {isSelf && <span style={ST.selfBadge}>{t("users.self")}</span>}
      </td>
      <td style={ST.td}>{user.username}</td>
      <td style={ST.td}>
        <RoleBadge role={user.role} />
      </td>
      <td style={ST.tdDate}>{formatDate(user.createdAt, locale)}</td>
      <td style={ST.td}>
        <UserRowActions
          isSelf={isSelf}
          isPlayer={isPlayer}
          onView={onView}
          onTickets={onTickets}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

function UserTableHead({
  hasPlayers,
  allSelected,
  onToggleSelectAll,
}: {
  hasPlayers: boolean;
  allSelected: boolean;
  onToggleSelectAll: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <thead>
      <tr style={ST.thRow}>
        <th style={ST.th}>
          {hasPlayers && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
            />
          )}
        </th>
        {[
          t("users.email"),
          t("users.displayName"),
          t("users.role"),
          t("users.createdAt"),
          t("users.actions"),
        ].map((col) => (
          <th key={col} style={ST.th}>
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function UserTable({
  users,
  selfId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onTickets,
  onEdit,
  onDelete,
}: {
  users: Account[];
  selfId: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onView: (user: Account) => void;
  onTickets: (user: Account) => void;
  onEdit: (user: Account) => void;
  onDelete: (user: Account) => void;
}) {
  const playerIds = users
    .filter((usr) => usr.role === "player")
    .map((usr) => usr.id);
  const allSelected =
    playerIds.length > 0 && playerIds.every((id) => selectedIds.has(id));
  return (
    <div style={ST.tableWrap}>
      <table style={ST.table}>
        <UserTableHead
          hasPlayers={playerIds.length > 0}
          allSelected={allSelected}
          onToggleSelectAll={onToggleSelectAll}
        />
        <tbody>
          {users.map((usr) => (
            <UserRow
              key={usr.id}
              user={usr}
              selfId={selfId}
              selected={selectedIds.has(usr.id)}
              onToggleSelect={() => onToggleSelect(usr.id)}
              onView={() => onView(usr)}
              onTickets={() => onTickets(usr)}
              onEdit={() => onEdit(usr)}
              onDelete={() => onDelete(usr)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type UserToolbarProps = {
  query: string;
  roleFilter: "" | "player" | "admin";
  setQuery: (val: string) => void;
  setRoleFilter: (val: "" | "player" | "admin") => void;
  onCreate: () => void;
};
function UserToolbar({
  query,
  roleFilter,
  setQuery,
  setRoleFilter,
  onCreate,
}: UserToolbarProps) {
  const t = useTranslations("admin");
  return (
    <div style={ST.toolbar}>
      <input
        className="auth-input"
        style={{ flex: 1, minWidth: 180 }}
        placeholder={t("users.searchPlaceholder")}
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
      />
      <select
        className="auth-input"
        style={{ width: 130 }}
        value={roleFilter}
        onChange={(ev) =>
          setRoleFilter(ev.target.value as "" | "player" | "admin")
        }
      >
        <option value="">{t("users.allRoles")}</option>
        <option value="player">player</option>
        <option value="admin">admin</option>
      </select>
      <button
        type="button"
        className="auth-btn"
        style={{ width: "auto", padding: "0 20px" }}
        onClick={onCreate}
      >
        {t("newCreate")}
      </button>
    </div>
  );
}

function userResultStats(results: RecentResult[]) {
  const scores = results
    .map((result) => extractScore(result.evaluation))
    .filter((score): score is number => score !== null);
  const average =
    scores.length > 0
      ? Math.round(
          (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10
        ) / 10
      : null;
  return {
    count: results.length,
    average,
    best: scores.length > 0 ? Math.max(...scores) : null,
  };
}

function UserResultRow({ result }: { result: UserResult }) {
  const score = extractScore(result.evaluation);
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={ST.td}>{result.scenarioTitle}</td>
      <td style={ST.td}>
        <ScoreText value={score} />
      </td>
      <td style={ST.td}>{result.summary.split("\n")[0]}</td>
    </tr>
  );
}

function UserResultsTable({ results }: { results: UserResult[] }) {
  const t = useTranslations("admin");
  if (results.length === 0)
    return <p className="auth-empty">{t("results.noRecords")}</p>;
  return (
    <div style={ST.tableWrap}>
      <table style={ST.table}>
        <thead>
          <tr style={ST.thRow}>
            {[
              t("results.scenario"),
              t("results.score"),
              t("results.summary"),
            ].map((col) => (
              <th key={col} style={ST.th}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <UserResultRow key={result.id} result={result} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TicketHistoryTableProps = {
  ledger: TicketRow[];
  onDeleteRequest: (ticket: TicketRow) => void;
};
function TicketHistoryTable({
  ledger,
  onDeleteRequest,
}: TicketHistoryTableProps) {
  const t = useTranslations("admin");
  const ta = useTranslations("account");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  if (ledger.length === 0)
    return <p className="auth-empty">{t("tickets.noHistory")}</p>;
  return (
    <div className="ticket-table-wrap">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>{t("tickets.dateTime")}</th>
            <th>{t("tickets.type")}</th>
            <th>{t("tickets.status")}</th>
            <th>{t("tickets.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt, locale)}</td>
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
              <td>
                {row.isActive && (
                  <button
                    type="button"
                    className="tb-btn danger"
                    style={ST.btnDanger}
                    onClick={() => onDeleteRequest(row)}
                  >
                    {tc("delete")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TicketCountFormProps = {
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  danger?: boolean;
  onSubmit: (count: number) => void;
};
function TicketCountForm({
  busy,
  submitLabel,
  busyLabel,
  danger,
  onSubmit,
}: TicketCountFormProps) {
  const [count, setCount] = useState(1);
  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (count < 1) return;
    onSubmit(count);
  };
  return (
    <form onSubmit={handleSubmit} style={ST.ticketGrantForm}>
      <input
        className="auth-input"
        style={ST.ticketCountInput}
        type="number"
        min={1}
        max={1000}
        value={count}
        onChange={(ev) => setCount(Number(ev.target.value))}
        disabled={busy}
      />
      <button
        type="submit"
        className={danger ? "auth-btn danger" : "auth-btn"}
        style={{ width: "auto", padding: "0 18px" }}
        disabled={busy || count < 1}
      >
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

async function fetchTicketSnapshot(
  userId: string
): Promise<TicketSnapshot | null> {
  const res = await fetch(`/api/admin/users/${userId}/tickets`);
  return res.ok ? ((await res.json()) as TicketSnapshot) : null;
}

async function grantTickets(
  userId: string,
  count: number
): Promise<TicketSnapshot | null> {
  const res = await fetch(`/api/admin/users/${userId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  return res.ok ? ((await res.json()) as TicketSnapshot) : null;
}

async function deleteTicketRequest(
  userId: string,
  ticketId: string
): Promise<TicketSnapshot> {
  const res = await fetch(`/api/admin/users/${userId}/tickets/${ticketId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as TicketSnapshot;
}

async function deleteTicketBatchRequest(
  userId: string,
  count: number
): Promise<TicketSnapshot & { deletedCount: number }> {
  const res = await fetch(`/api/admin/users/${userId}/tickets`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as TicketSnapshot & { deletedCount: number };
}

function useTicketSnapshot(userId: string) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [snapshot, setSnapshot] = useState<TicketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [grantErr, setGrantErr] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const snap = await fetchTicketSnapshot(userId);
      if (!active) return;
      if (snap) setSnapshot(snap);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const grant = async (count: number) => {
    setGranting(true);
    setGrantMsg(null);
    setGrantErr(null);
    const snap = await grantTickets(userId, count);
    setGranting(false);
    if (!snap) {
      setGrantErr(t("tickets.grantFailed"));
      return;
    }
    setSnapshot(snap);
    showOk(setGrantMsg, t("tickets.granted", { count }));
  };

  const deleteOne = async (ticketId: string) => {
    setSnapshot(await deleteTicketRequest(userId, ticketId));
    showOk(setGrantMsg, tc("deleted"));
  };

  const deleteBatch = async (count: number) => {
    setDeletingBatch(true);
    const result = await deleteTicketBatchRequest(userId, count);
    setDeletingBatch(false);
    setSnapshot(result);
    showOk(
      setGrantMsg,
      t("tickets.deletedCount", { count: result.deletedCount })
    );
  };

  return {
    snapshot,
    loading,
    granting,
    grantMsg,
    grantErr,
    deletingBatch,
    grant,
    deleteOne,
    deleteBatch,
  };
}

type TicketSnapshotApi = ReturnType<typeof useTicketSnapshot>;

function TicketOverview({
  snapshot,
  granting,
  deletingBatch,
  grantErr,
  grantMsg,
  onGrant,
  onRequestBatchDelete,
}: {
  snapshot: TicketSnapshot;
  granting: boolean;
  deletingBatch: boolean;
  grantErr: string | null;
  grantMsg: string | null;
  onGrant: (count: number) => void;
  onRequestBatchDelete: (count: number) => void;
}) {
  const t = useTranslations("admin");
  const ta = useTranslations("account");
  const tc = useTranslations("common");
  return (
    <>
      <div className="auth-field">
        <span className="auth-label">{t("tickets.balance")}</span>
        <div className="auth-readonly">
          {snapshot.balance} {ta("ticketUnit")}
        </div>
      </div>
      <div style={ST.ticketFormsRow}>
        <TicketCountForm
          busy={granting}
          submitLabel={t("users.grantTickets")}
          busyLabel={tc("granting")}
          onSubmit={onGrant}
        />
        <TicketCountForm
          busy={deletingBatch}
          submitLabel={t("users.deleteByCount")}
          busyLabel={tc("deleting")}
          danger
          onSubmit={onRequestBatchDelete}
        />
      </div>
      {grantErr && <p className="auth-error">{grantErr}</p>}
      {grantMsg && <p className="auth-ok">{grantMsg}</p>}
    </>
  );
}

function TicketDeleteConfirms({
  pendingDelete,
  pendingBatchDelete,
  onCancelSingle,
  onConfirmSingle,
  onCancelBatch,
  onConfirmBatch,
}: {
  pendingDelete: TicketRow | null;
  pendingBatchDelete: number | null;
  onCancelSingle: () => void;
  onConfirmSingle: () => void;
  onCancelBatch: () => void;
  onConfirmBatch: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  return (
    <>
      {pendingDelete && (
        <ConfirmModal
          message={t("confirm.deleteTicket", {
            date: formatDate(pendingDelete.createdAt, locale),
            note: t("confirm.irreversible"),
          })}
          confirmLabel={tc("delete")}
          danger
          onCancel={onCancelSingle}
          onConfirm={onConfirmSingle}
        />
      )}
      {pendingBatchDelete !== null && (
        <ConfirmModal
          message={t("confirm.deleteTicketBatch", {
            count: pendingBatchDelete,
            note: t("confirm.irreversible"),
          })}
          confirmLabel={tc("delete")}
          danger
          onCancel={onCancelBatch}
          onConfirm={onConfirmBatch}
        />
      )}
    </>
  );
}

function UserTicketsSection({ userId }: { userId: string }) {
  const tc = useTranslations("common");
  const ticketApi: TicketSnapshotApi = useTicketSnapshot(userId);
  const { snapshot, loading, grant, deleteOne, deleteBatch } = ticketApi;
  const [pendingDelete, setPendingDelete] = useState<TicketRow | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] = useState<number | null>(
    null
  );

  if (loading) return <p className="auth-empty">{tc("loading")}</p>;
  if (!snapshot) return <p className="auth-error">{tc("loadFailed")}</p>;

  return (
    <div className="auth-form">
      <TicketOverview
        snapshot={snapshot}
        granting={ticketApi.granting}
        deletingBatch={ticketApi.deletingBatch}
        grantErr={ticketApi.grantErr}
        grantMsg={ticketApi.grantMsg}
        onGrant={(count) => void grant(count)}
        onRequestBatchDelete={setPendingBatchDelete}
      />
      <TicketHistoryTable
        ledger={snapshot.ledger}
        onDeleteRequest={setPendingDelete}
      />
      <TicketDeleteConfirms
        pendingDelete={pendingDelete}
        pendingBatchDelete={pendingBatchDelete}
        onCancelSingle={() => setPendingDelete(null)}
        onConfirmSingle={() => {
          if (pendingDelete) {
            void deleteOne(pendingDelete.id).then(() => setPendingDelete(null));
          }
        }}
        onCancelBatch={() => setPendingBatchDelete(null)}
        onConfirmBatch={() => {
          if (pendingBatchDelete !== null) {
            void deleteBatch(pendingBatchDelete).then(() =>
              setPendingBatchDelete(null)
            );
          }
        }}
      />
    </div>
  );
}

type UserDetailModalProps = {
  user: Account;
  onClose: () => void;
};
function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/admin/users/${user.id}`);
      if (!active) return;
      if (res.ok) {
        setDetail((await res.json()) as UserDetail);
      } else {
        setError(tc("loadFailed"));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user.id, tc]);
  return (
    <ModalShell
      title={t("modals.userHistory", { username: user.username })}
      onClose={onClose}
      wide
    >
      {loading && <p className="auth-empty">{tc("loading")}</p>}
      {!loading && (error || !detail) && (
        <p className="auth-error">{error ?? tc("error")}</p>
      )}
      {!loading &&
        detail &&
        (() => {
          const stats = userResultStats(detail.results);
          return (
            <div>
              <div style={ST.dashGrid}>
                <SummaryCard
                  label={t("stats.playCount")}
                  display={String(stats.count)}
                />
                <SummaryCard
                  label={t("stats.averageScore")}
                  display={stats.average === null ? "—" : `${stats.average}`}
                />
                <SummaryCard
                  label={t("stats.highScore")}
                  display={stats.best === null ? "—" : `${stats.best}`}
                />
              </div>
              <h3 style={ST.sectionH3}>{t("results.history")}</h3>
              <UserResultsTable results={detail.results} />
            </div>
          );
        })()}
    </ModalShell>
  );
}

type UserTicketsModalProps = {
  user: Account;
  onClose: () => void;
};
function UserTicketsModal({ user, onClose }: UserTicketsModalProps) {
  const t = useTranslations("admin");
  return (
    <ModalShell
      title={t("modals.userTickets", { username: user.username })}
      onClose={onClose}
      wide
    >
      <UserTicketsSection userId={user.id} />
    </ModalShell>
  );
}

type BulkGrantTicketsModalProps = {
  users: Account[];
  onClose: () => void;
  onGranted: (msg: string) => void;
  onError: (msg: string) => void;
};
function BulkGrantTicketsModal({
  users,
  onClose,
  onGranted,
  onError,
}: BulkGrantTicketsModalProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);

  const handleGrant = async (count: number) => {
    setBusy(true);
    const oks = await Promise.all(
      users.map((usr) =>
        fetch(`/api/admin/users/${usr.id}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count }),
        }).then((res) => res.ok)
      )
    );
    setBusy(false);
    const successCount = oks.filter(Boolean).length;
    if (successCount === 0) {
      onError(t("tickets.grantFailed"));
      return;
    }
    onGranted(
      successCount === users.length
        ? t("tickets.bulkGrantedAll", { users: successCount, count })
        : t("tickets.bulkGrantedPartial", {
            total: users.length,
            success: successCount,
            count,
          })
    );
  };

  return (
    <ModalShell
      title={t("modals.bulkGrantTitle", { count: users.length })}
      onClose={onClose}
    >
      <p style={ST.confirmMsg}>
        {t("modals.bulkGrantBody", { count: users.length })}
      </p>
      <div style={ST.bulkUserList}>
        {users.map((usr) => (
          <div key={usr.id}>
            {usr.username}（{usr.email}）
          </div>
        ))}
      </div>
      <TicketCountForm
        busy={busy}
        submitLabel={t("users.bulkGrant")}
        busyLabel={tc("granting")}
        onSubmit={(count) => void handleGrant(count)}
      />
    </ModalShell>
  );
}

type UserModalsProps = {
  modal: UserModal | null;
  selfId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  onReload: () => void;
  onBulkGranted: () => void;
};
function DeleteUserModal({
  user,
  onCancel,
  onDone,
}: {
  user: Account;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const doDelete = async () => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("failed");
    onDone();
  };
  return (
    <ConfirmModal
      message={t("confirm.deleteUser", {
        email: user.email,
        note: t("confirm.irreversible"),
      })}
      confirmLabel={tc("delete")}
      danger
      onCancel={onCancel}
      onConfirm={() => void doDelete()}
    />
  );
}

type UserModalContext = {
  selfId: string;
  onClose: () => void;
  onError: (msg: string) => void;
  onBulkGranted: () => void;
  done: (msg: string) => void;
  t: ReturnType<typeof useTranslations<"admin">>;
  tc: ReturnType<typeof useTranslations<"common">>;
};

function renderUserModal(modal: UserModal, ctx: UserModalContext) {
  const { selfId, onClose, onError, onBulkGranted, done, t, tc } = ctx;
  switch (modal.kind) {
    case "create":
      return (
        <CreateUserModal
          onClose={onClose}
          onCreated={() => done(t("users.created"))}
          onError={onError}
        />
      );
    case "view":
      return <UserDetailModal user={modal.user} onClose={onClose} />;
    case "tickets":
      return <UserTicketsModal user={modal.user} onClose={onClose} />;
    case "bulkTickets":
      return (
        <BulkGrantTicketsModal
          users={modal.users}
          onClose={onClose}
          onGranted={(msg) => {
            onBulkGranted();
            done(msg);
          }}
          onError={onError}
        />
      );
    case "edit":
      return (
        <EditUserModal
          user={modal.user}
          selfId={selfId}
          onClose={onClose}
          onSaved={() => done(tc("saved"))}
          onError={onError}
        />
      );
    case "delete":
      return (
        <DeleteUserModal
          user={modal.user}
          onCancel={onClose}
          onDone={() => done(tc("deleted"))}
        />
      );
    default:
      return null;
  }
}

function UserModals({
  modal,
  selfId,
  onClose,
  onDone,
  onError,
  onReload,
  onBulkGranted,
}: UserModalsProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  if (!modal) return null;
  const done = (msg: string) => {
    onClose();
    onDone(msg);
    onReload();
  };
  return renderUserModal(modal, {
    selfId,
    onClose,
    onError,
    onBulkGranted,
    done,
    t,
    tc,
  });
}

type UsersDisplayProps = {
  users: Account[];
  loading: boolean;
  selfId: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (modal: UserModal) => void;
};
function UsersDisplay({
  users,
  loading,
  selfId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
}: UsersDisplayProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  if (loading) return <p className="auth-empty">{tc("loading")}</p>;
  if (users.length === 0)
    return <p className="auth-empty">{t("users.notFound")}</p>;
  return (
    <UserTable
      users={users}
      selfId={selfId}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      onView={(usr) => onOpen({ kind: "view", user: usr })}
      onTickets={(usr) => onOpen({ kind: "tickets", user: usr })}
      onEdit={(usr) => onOpen({ kind: "edit", user: usr })}
      onDelete={(usr) => onOpen({ kind: "delete", user: usr })}
    />
  );
}

function useAdminStatus() {
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<string | null>(null);
  const notify = useCallback((msg: string) => showOk(setStatusOk, msg), []);
  return { statusErr, statusOk, setStatusErr, notify };
}

type SelectionBarProps = {
  count: number;
  onBulkGrant: () => void;
  onClear: () => void;
};
function SelectionBar({ count, onBulkGrant, onClear }: SelectionBarProps) {
  const t = useTranslations("admin");
  if (count === 0) return null;
  return (
    <div style={ST.bulkBar}>
      <span>{t("selection.count", { count })}</span>
      <button
        type="button"
        className="auth-btn"
        style={{ width: "auto", padding: "0 18px" }}
        onClick={onBulkGrant}
      >
        {t("selection.bulkGrantTickets")}
      </button>
      <button
        type="button"
        className="tb-btn"
        style={ST.btnSm}
        onClick={onClear}
      >
        {t("selection.clear")}
      </button>
    </div>
  );
}

type SetSelected = (
  action: Set<string> | ((prev: Set<string>) => Set<string>)
) => void;

function buildSelectionHandlers(
  users: Account[],
  selectedIds: Set<string>,
  setSelectedIds: SetSelected
) {
  const playerIds = users
    .filter((usr) => usr.role === "player")
    .map((usr) => usr.id);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () => {
    const allSelected =
      playerIds.length > 0 && playerIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(playerIds));
  };
  return { toggleSelect, toggleSelectAll };
}

type UsersHeaderProps = {
  statusErr: string | null;
  statusOk: string | null;
  query: string;
  roleFilter: "" | "player" | "admin";
  setQuery: (val: string) => void;
  setRoleFilter: (val: "" | "player" | "admin") => void;
  onCreate: () => void;
  selectedCount: number;
  onBulkGrant: () => void;
  onClearSelection: () => void;
};

function UsersHeader(props: UsersHeaderProps) {
  return (
    <>
      <StatusMsg error={props.statusErr} ok={props.statusOk} />
      <UserToolbar
        query={props.query}
        roleFilter={props.roleFilter}
        setQuery={props.setQuery}
        setRoleFilter={props.setRoleFilter}
        onCreate={props.onCreate}
      />
      <SelectionBar
        count={props.selectedCount}
        onBulkGrant={props.onBulkGrant}
        onClear={props.onClearSelection}
      />
    </>
  );
}

function useUsersList(filters: {
  query: string;
  roleFilter: "" | "player" | "admin";
  refreshKey: number;
  onReset: () => void;
}) {
  const { query, roleFilter, refreshKey, onReset } = filters;
  const [users, setUsers] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (roleFilter) params.set("role", roleFilter);
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!active) return;
      if (res.ok) setUsers((await res.json()) as Account[]);
      onReset();
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [query, roleFilter, refreshKey, onReset]);
  return { users, loading };
}

function useUsersData(
  query: string,
  roleFilter: "" | "player" | "admin",
  refreshKey: number
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resetSelection = useCallback(() => setSelectedIds(new Set()), []);
  const { users, loading } = useUsersList({
    query,
    roleFilter,
    refreshKey,
    onReset: resetSelection,
  });
  const handlers = buildSelectionHandlers(users, selectedIds, setSelectedIds);
  return { users, loading, selectedIds, resetSelection, ...handlers };
}

function Users({ selfId }: { selfId: string }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "player" | "admin">("");
  const [modal, setModal] = useState<UserModal | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { statusErr, statusOk, setStatusErr, notify } = useAdminStatus();
  const {
    users,
    loading,
    selectedIds,
    resetSelection,
    toggleSelect,
    toggleSelectAll,
  } = useUsersData(query, roleFilter, refreshKey);
  const reload = useCallback(() => setRefreshKey((prev) => prev + 1), []);
  const openBulkGrant = () =>
    setModal({
      kind: "bulkTickets",
      users: users.filter((usr) => selectedIds.has(usr.id)),
    });
  const handleError = (msg: string) => {
    setModal(null);
    setStatusErr(msg);
  };
  return (
    <div>
      <UsersHeader
        statusErr={statusErr}
        statusOk={statusOk}
        query={query}
        roleFilter={roleFilter}
        setQuery={setQuery}
        setRoleFilter={setRoleFilter}
        onCreate={() => setModal({ kind: "create" })}
        selectedCount={selectedIds.size}
        onBulkGrant={openBulkGrant}
        onClearSelection={resetSelection}
      />
      <UsersDisplay
        loading={loading}
        users={users}
        selfId={selfId}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpen={setModal}
      />
      <UserModals
        modal={modal}
        selfId={selfId}
        onClose={() => setModal(null)}
        onDone={notify}
        onError={handleError}
        onReload={reload}
        onBulkGranted={resetSelection}
      />
    </div>
  );
}

type RoleToggleProps = {
  value: AccountRole;
  onChange: (role: AccountRole) => void;
  disabled?: boolean;
};
function RoleToggle({ value, onChange, disabled }: RoleToggleProps) {
  const roles: AccountRole[] = ["player", "admin"];
  return (
    <div style={disabled ? ST.roleToggleDisabled : ST.roleToggle}>
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          style={value === role ? ST.roleToggleBtnActive : ST.roleToggleBtn}
          onClick={() => onChange(role)}
          disabled={disabled}
        >
          {role}
        </button>
      ))}
    </div>
  );
}

type CUFState = {
  email: string;
  cred: string;
  username: string;
  role: AccountRole;
};
type CUFSet = {
  setEmail: (val: string) => void;
  setCred: (val: string) => void;
  setUsername: (val: string) => void;
  setRole: (val: AccountRole) => void;
};
type CreateUserFieldsProps = { state: CUFState; set: CUFSet; busy: boolean };
function CreateUserFields({ state, set, busy }: CreateUserFieldsProps) {
  const t = useTranslations("admin");
  const { email, cred, username, role } = state;
  const { setEmail, setCred, setUsername, setRole } = set;
  return (
    <>
      <div className="auth-field">
        <label className="auth-label">{t("users.emailRequired")}</label>
        <input
          className="auth-input"
          type="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          disabled={busy}
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">{t("users.passwordRequired")}</label>
        <PasswordInput
          required
          value={cred}
          onChange={(ev) => setCred(ev.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">{t("users.displayNameLabel")}</label>
        <input
          className="auth-input"
          type="text"
          value={username}
          onChange={(ev) => setUsername(ev.target.value)}
          disabled={busy}
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">{t("users.roleRequired")}</label>
        <RoleToggle value={role} onChange={setRole} disabled={busy} />
      </div>
    </>
  );
}

type CreateUserModalProps = {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
};
function CreateUserModal({
  onClose,
  onCreated,
  onError,
}: CreateUserModalProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [cred, setCred] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<AccountRole>("player");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cuState = { email, cred, username, role };
  const cuSet = { setEmail, setCred, setUsername, setRole };
  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void submitCreateUser({
      email,
      cred,
      username,
      role,
      setErr,
      setBusy,
      onError,
      onCreated,
      passwordMin8Msg: t("users.passwordMin8"),
      emailExistsMsg: t("users.emailExists"),
      createFailedMsg: tc("createFailed"),
    });
  };
  return (
    <ModalShell title={t("users.createTitle")} onClose={onClose}>
      <form className="auth-form" onSubmit={onSubmit}>
        <CreateUserFields state={cuState} set={cuSet} busy={busy} />
        {err && <p className="auth-error">{err}</p>}
        <FormActions
          busy={busy}
          submitLabel={tc("create")}
          onCancel={onClose}
        />
      </form>
    </ModalShell>
  );
}

type EditUserFieldsProps = {
  username: string;
  setUsername: (val: string) => void;
  role: AccountRole;
  setRole: (val: AccountRole) => void;
  isSelf: boolean;
  busy: boolean;
};
function EditUserFields({
  username,
  setUsername,
  role,
  setRole,
  isSelf,
  busy,
}: EditUserFieldsProps) {
  const t = useTranslations("admin");
  return (
    <>
      <div className="auth-field">
        <label className="auth-label">{t("users.displayNameLabel")}</label>
        <input
          className="auth-input"
          type="text"
          value={username}
          onChange={(ev) => setUsername(ev.target.value)}
          disabled={busy}
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">{t("users.roleLabel")}</label>
        <RoleToggle value={role} onChange={setRole} disabled={busy || isSelf} />
        {isSelf && <p style={ST.selfNote}>{t("users.selfRoleNote")}</p>}
      </div>
    </>
  );
}

type EditUserModalProps = {
  user: Account;
  selfId: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
};
function EditUserModal({
  user,
  selfId,
  onClose,
  onSaved,
  onError,
}: EditUserModalProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState<AccountRole>(user.role);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void submitEditUser({
      userId: user.id,
      username,
      origUsername: user.username,
      role,
      origRole: user.role,
      setErr,
      setBusy,
      onError,
      onSaved,
      selfRoleChangeMsg: t("users.selfRoleChange"),
      checkInputMsg: t("users.checkInput"),
      saveFailedMsg: tc("saveFailed"),
    });
  };
  return (
    <ModalShell title={t("users.editTitle")} onClose={onClose}>
      <div className="auth-field" style={ST.editEmailField}>
        <span className="auth-label">{t("users.email")}</span>
        <div className="auth-readonly">{user.email}</div>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <EditUserFields
          username={username}
          setUsername={setUsername}
          role={role}
          setRole={setRole}
          isSelf={user.id === selfId}
          busy={busy}
        />
        {err && <p className="auth-error">{err}</p>}
        <FormActions busy={busy} submitLabel={tc("save")} onCancel={onClose} />
      </form>
    </ModalShell>
  );
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

function ScenarioTagBadges({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div style={ST.tagBadgeRow}>
      {tags.map((tag) => (
        <span key={tag} style={ST.tagBadge}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function ScenarioItem({
  scenario,
  onResults,
  onEdit,
  onDelete,
}: {
  scenario: ScenarioSummary;
  onResults: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  return (
    <div style={ST.scItem}>
      <div style={ST.scInner}>
        <div style={ST.scLeft}>
          <div style={ST.scId}>{scenarioLabel(scenario)}</div>
          <div style={ST.scChallenge} title={scenario.challengePrompt}>
            {scenario.challengePrompt}
          </div>
          <ScenarioTagBadges tags={scenario.tags} />
        </div>
        <div style={ST.scBtns}>
          <button
            type="button"
            className="tb-btn"
            style={ST.btnSm}
            onClick={onResults}
          >
            {t("actions.results")}
          </button>
          <button
            type="button"
            className="tb-btn"
            style={ST.btnSm}
            onClick={onEdit}
          >
            {t("actions.edit")}
          </button>
          <button
            type="button"
            className="tb-btn danger"
            style={ST.btnDanger}
            onClick={onDelete}
          >
            {tc("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioList({
  list,
  loading,
  onResults,
  onEdit,
  onDelete,
}: {
  list: ScenarioSummary[];
  loading: boolean;
  onResults: (sc: ScenarioSummary) => void;
  onEdit: (sc: ScenarioSummary) => void;
  onDelete: (sc: ScenarioSummary) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  if (loading) return <p className="auth-empty">{tc("loading")}</p>;
  if (list.length === 0)
    return <p className="auth-empty">{t("scenarios.none")}</p>;
  return (
    <div style={ST.recentList}>
      {list.map((sc) => (
        <ScenarioItem
          key={sc.id}
          scenario={sc}
          onResults={() => onResults(sc)}
          onEdit={() => onEdit(sc)}
          onDelete={() => onDelete(sc)}
        />
      ))}
    </div>
  );
}

function SummaryCard({ label, display }: { label: string; display: string }) {
  return (
    <div style={ST.card}>
      <div style={ST.statValue}>{display}</div>
      <div style={ST.statLabel}>{label}</div>
    </div>
  );
}

function ScoreText({ value }: { value: number | null }) {
  const t = useTranslations("admin");
  return <>{value === null ? "—" : t("scorePoints", { score: value })}</>;
}

function ScenarioUserRow({ stat }: { stat: ScenarioUserStat }) {
  const label = stat.username || stat.email || "—";
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={ST.td}>
        {label}
        {stat.email && stat.username && (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {stat.email}
          </div>
        )}
      </td>
      <td style={ST.td}>{stat.playCount}</td>
      <td style={ST.td}>
        <ScoreText value={stat.averageScore} />
      </td>
      <td style={ST.td}>
        <ScoreText value={stat.bestScore} />
      </td>
    </tr>
  );
}

function ScenarioResultsTable({ perUser }: { perUser: ScenarioUserStat[] }) {
  const t = useTranslations("admin");
  if (perUser.length === 0)
    return <p className="auth-empty">{t("results.noRecords")}</p>;
  return (
    <div style={ST.tableWrap}>
      <table style={ST.table}>
        <thead>
          <tr style={ST.thRow}>
            {[
              t("users.userColumn"),
              t("stats.playCount"),
              t("stats.averageScore"),
              t("stats.highScore"),
            ].map((col) => (
              <th key={col} style={ST.th}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {perUser.map((stat) => (
            <ScenarioUserRow key={stat.accountId ?? "anon"} stat={stat} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScenarioResultsModalProps = {
  scenario: ScenarioSummary;
  onClose: () => void;
};
function ScenarioResultsModal({
  scenario,
  onClose,
}: ScenarioResultsModalProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [summary, setSummary] = useState<ScenarioResultsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/admin/scenarios/${scenario.id}/results`);
      if (!active) return;
      if (res.ok) {
        setSummary((await res.json()) as ScenarioResultsSummary);
      } else {
        setError(tc("loadFailed"));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [scenario.id, tc]);
  return (
    <ModalShell
      title={t("modals.resultsSummary", { title: scenarioLabel(scenario) })}
      onClose={onClose}
      wide
    >
      {loading && <p className="auth-empty">{tc("loading")}</p>}
      {!loading && (error || !summary) && (
        <p className="auth-error">{error ?? tc("error")}</p>
      )}
      {!loading && summary && (
        <div>
          <div style={ST.dashGrid}>
            <SummaryCard
              label={t("stats.totalPlays")}
              display={String(summary.totalPlays)}
            />
            <SummaryCard
              label={t("stats.uniqueUsers")}
              display={String(summary.totalUsers)}
            />
            <SummaryCard
              label={t("stats.avgScore")}
              display={
                summary.averageScore === null ? "—" : `${summary.averageScore}`
              }
            />
          </div>
          <h3 style={ST.sectionH3}>{t("results.userScores")}</h3>
          <ScenarioResultsTable perUser={summary.perUser} />
        </div>
      )}
    </ModalShell>
  );
}

type ScenarioModalsProps = {
  modal: ScenarioModal | null;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  onReload: () => void;
};
function ScenarioModals({
  modal,
  onClose,
  onDone,
  onError,
  onReload,
}: ScenarioModalsProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const done = (msg: string) => {
    onClose();
    onDone(msg);
    onReload();
  };
  if (modal?.kind === "create")
    return (
      <ScenarioFormModal
        onClose={onClose}
        onSaved={() => done(t("scenarios.created"))}
        onError={onError}
      />
    );
  if (modal?.kind === "edit")
    return (
      <ScenarioFormModal
        scenarioId={modal.id}
        onClose={onClose}
        onSaved={() => done(tc("saved"))}
        onError={onError}
      />
    );
  if (modal?.kind === "delete") {
    const doDelete = async () => {
      const res = await fetch(`/api/admin/scenarios/${modal.scenario.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("failed");
      done(tc("deleted"));
    };
    return (
      <ConfirmModal
        message={t("confirm.deleteScenario", {
          id: modal.scenario.id,
          note: t("confirm.irreversible"),
        })}
        confirmLabel={tc("delete")}
        danger
        onCancel={onClose}
        onConfirm={() => void doDelete()}
      />
    );
  }
  if (modal?.kind === "results")
    return <ScenarioResultsModal scenario={modal.scenario} onClose={onClose} />;
  return null;
}

function ScenarioToolbar({
  tagFilter,
  setTagFilter,
  availableTags,
  onCreate,
}: {
  tagFilter: string;
  setTagFilter: (val: string) => void;
  availableTags: string[];
  onCreate: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <div style={ST.scenarioToolbar}>
      <select
        className="auth-input"
        style={{ width: 180 }}
        value={tagFilter}
        onChange={(ev) => setTagFilter(ev.target.value)}
      >
        <option value="">{t("scenarios.allTags")}</option>
        {availableTags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="auth-btn"
        style={{ width: "auto", padding: "10px 28px" }}
        onClick={onCreate}
      >
        {t("newCreate")}
      </button>
    </div>
  );
}

function useScenarioList(refreshKey: number) {
  const [list, setList] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/admin/scenarios");
      if (!active) return;
      if (res.ok) setList((await res.json()) as ScenarioSummary[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);
  return { list, loading };
}

function Scenarios() {
  const [modal, setModal] = useState<ScenarioModal | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const { statusErr, statusOk, setStatusErr, notify } = useAdminStatus();
  const reload = useCallback(() => setRefreshKey((prev) => prev + 1), []);
  const { list, loading } = useScenarioList(refreshKey);
  const availableTags = useMemo(() => distinctSortedTags(list), [list]);
  // A tag can disappear from the list (edited/deleted elsewhere) while still
  // selected; fall back to "no filter" instead of matching nothing forever.
  const effectiveTagFilter = availableTags.includes(tagFilter) ? tagFilter : "";
  const filteredList = useMemo(
    () =>
      effectiveTagFilter
        ? list.filter((sc) => sc.tags.includes(effectiveTagFilter))
        : list,
    [list, effectiveTagFilter]
  );
  const openCreate = () => {
    setStatusErr(null);
    setModal({ kind: "create" });
  };
  const onModalError = (msg: string) => {
    setModal(null);
    setStatusErr(msg);
  };
  return (
    <div>
      <StatusMsg error={statusErr} ok={statusOk} />
      <ScenarioToolbar
        tagFilter={effectiveTagFilter}
        setTagFilter={setTagFilter}
        availableTags={availableTags}
        onCreate={openCreate}
      />
      <ScenarioList
        list={filteredList}
        loading={loading}
        onResults={(sc) => setModal({ kind: "results", scenario: sc })}
        onEdit={(sc) => setModal({ kind: "edit", id: sc.id })}
        onDelete={(sc) => setModal({ kind: "delete", scenario: sc })}
      />
      <ScenarioModals
        modal={modal}
        onClose={() => setModal(null)}
        onDone={notify}
        onError={onModalError}
        onReload={reload}
      />
    </div>
  );
}

// ── ScenarioFormModal ─────────────────────────────────────────────────────────

const PROMPT_KEYS = [
  "basePrompt",
  "challengePrompt",
  "documentsPrompt",
  "rubricPrompt",
] as const;

type PromptKey = (typeof PROMPT_KEYS)[number];

function PromptField({ def, busy }: { def: PromptFieldDef; busy: boolean }) {
  return (
    <div className="auth-field">
      <label className="auth-label">{def.label}</label>
      <textarea
        style={{ ...ST.area, minHeight: 100 }}
        required
        value={def.value}
        onChange={(ev) => def.setter(ev.target.value)}
        disabled={busy}
      />
    </div>
  );
}

function ScenarioIdField({
  state,
  isEdit,
}: {
  state: ScenarioFormState;
  isEdit: boolean;
}) {
  const t = useTranslations("admin.scenarios");
  if (!isEdit) return null;
  return (
    <div className="auth-field">
      <label className="auth-label">{t("idLabel")}</label>
      <div
        className="auth-readonly"
        style={{ fontFamily: "monospace", fontSize: 13 }}
      >
        {state.id}
      </div>
    </div>
  );
}

function TagsField({
  tags,
  onChange,
  busy,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  busy: boolean;
}) {
  const ts = useTranslations("admin.scenarios");
  const [draft, setDraft] = useState("");

  const addDraftTag = () => {
    const next = draft.trim();
    setDraft("");
    if (next.length === 0 || tags.includes(next)) return;
    onChange([...tags, next]);
  };
  const removeTag = (index: number) =>
    onChange(tags.filter((_, i) => i !== index));

  return (
    <div className="auth-field">
      <label className="auth-label">{ts("tagsLabel")}</label>
      {tags.length > 0 && (
        <div style={ST.tagBadgeRow}>
          {tags.map((tag, index) => (
            <span key={`${tag}-${index}`} style={ST.tagChip}>
              {tag}
              <button
                type="button"
                style={ST.tagChipRemove}
                onClick={() => removeTag(index)}
                disabled={busy}
                aria-label={ts("tagRemove", { tag })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="auth-input"
        type="text"
        value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          addDraftTag();
        }}
        // NOTE: Commit the pending draft when focus leaves the field, so a tag
        // typed without Enter is not silently dropped when the user clicks
        // save (blur fires before the submit click is processed).
        onBlur={addDraftTag}
        disabled={busy}
        placeholder={ts("tagsPlaceholder")}
      />
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function PersonaTableRow({
  row,
  index,
  onUpdate,
  onRemove,
  busy,
  autoAssignId,
}: {
  row: PersonaRow;
  index: number;
  onUpdate: (index: number, patch: Partial<PersonaRow>) => void;
  onRemove: (index: number) => void;
  busy: boolean;
  autoAssignId: string;
}) {
  return (
    <tr
      style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}
    >
      <td
        style={{
          ...ST.td,
          fontFamily: "monospace",
          fontSize: 12,
          color: row.id ? "var(--text)" : "var(--muted)",
        }}
      >
        {row.id || autoAssignId}
      </td>
      <td style={ST.td}>
        <textarea
          style={{ ...ST.area, minHeight: 60, fontSize: 12 }}
          value={row.characterPrompt}
          onChange={(ev) =>
            onUpdate(index, { characterPrompt: ev.target.value })
          }
          disabled={busy}
        />
      </td>
      <td style={ST.td}>
        <input
          className="auth-input"
          style={{ fontSize: 12, width: "100%", boxSizing: "border-box" }}
          value={row.voiceCode}
          onChange={(ev) => onUpdate(index, { voiceCode: ev.target.value })}
          disabled={busy}
          placeholder="ash"
        />
      </td>
      <td style={{ ...ST.td, textAlign: "center", verticalAlign: "middle" }}>
        <input
          type="checkbox"
          checked={row.docToolEnabled}
          onChange={(ev) =>
            onUpdate(index, { docToolEnabled: ev.target.checked })
          }
          disabled={busy}
        />
      </td>
      <td style={{ ...ST.td, textAlign: "center", verticalAlign: "middle" }}>
        <button
          type="button"
          className="tb-btn danger"
          style={{ ...ST.btnDanger, padding: "0 8px" }}
          onClick={() => onRemove(index)}
          disabled={busy}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// eslint-disable-next-line max-lines-per-function
function PersonaSection({
  rows,
  onChange,
  busy,
}: {
  rows: PersonaRow[];
  onChange: (rows: PersonaRow[]) => void;
  busy: boolean;
}) {
  const t = useTranslations("admin.scenarios");
  const ta = useTranslations("admin");
  const addRow = () =>
    onChange([
      ...rows,
      { id: "", characterPrompt: "", voiceCode: "", docToolEnabled: false },
    ]);
  const updateRow = (index: number, patch: Partial<PersonaRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));
  return (
    <div className="auth-field">
      <div style={ST.personaSectionHeader}>
        <label className="auth-label" style={{ margin: 0 }}>
          {t("persona")}
        </label>
        <button
          type="button"
          className="tb-btn"
          style={ST.btnSm}
          onClick={addRow}
          disabled={busy}
        >
          + {ta("actions.add")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p style={ST.personaNote}>{t("personaEmpty")}</p>
      ) : (
        <div style={ST.personaTableWrap}>
          <table style={ST.table}>
            <thead>
              <tr style={ST.thRow}>
                <th style={{ ...ST.th, width: 130 }}>ID</th>
                <th style={ST.th}>{t("characterPrompt")}</th>
                <th style={{ ...ST.th, width: 100 }}>voiceCode</th>
                <th style={{ ...ST.th, width: 60 }}>Doc</th>
                <th style={{ ...ST.th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <PersonaTableRow
                  key={i}
                  row={row}
                  index={i}
                  onUpdate={updateRow}
                  onRemove={removeRow}
                  busy={busy}
                  autoAssignId={t("autoAssignId")}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ScenarioFormBodyProps = {
  state: ScenarioFormState;
  setState: (patch: Partial<ScenarioFormState>) => void;
  isEdit: boolean;
  busy: boolean;
};
function ScenarioFormBody({
  state,
  setState,
  isEdit,
  busy,
}: ScenarioFormBodyProps) {
  const ts = useTranslations("admin.scenarios");
  const promptLabelByKey: Record<PromptKey, string> = {
    basePrompt: ts("basePrompt"),
    challengePrompt: ts("challengePrompt"),
    documentsPrompt: ts("documentsPrompt"),
    rubricPrompt: ts("rubricPrompt"),
  };
  const promptFields = PROMPT_KEYS.map((key) => ({
    key,
    label: promptLabelByKey[key],
    value: state[key] as string,
    setter: (val: string) => setState({ [key]: val }),
  }));
  return (
    <>
      <ScenarioIdField state={state} isEdit={isEdit} />
      <div className="auth-field">
        <label className="auth-label">{ts("titleLabel")}</label>
        <input
          className="auth-input"
          type="text"
          value={state.title}
          onChange={(ev) => setState({ title: ev.target.value })}
          disabled={busy}
        />
      </div>
      <div className="auth-field">
        <label className="auth-label">{ts("descriptionLabel")}</label>
        <textarea
          style={{ ...ST.area, minHeight: 60 }}
          value={state.description}
          onChange={(ev) => setState({ description: ev.target.value })}
          disabled={busy}
        />
      </div>
      <TagsField
        tags={state.tags}
        onChange={(tags) => setState({ tags })}
        busy={busy}
      />
      {promptFields.map((def) => (
        <PromptField key={def.key} def={def} busy={busy} />
      ))}
      <PersonaSection
        rows={state.personas}
        onChange={(rows) => setState({ personas: rows })}
        busy={busy}
      />
    </>
  );
}

const EMPTY_FORM: ScenarioFormState = {
  id: "",
  title: "",
  description: "",
  tags: [],
  basePrompt: "",
  challengePrompt: "",
  documentsPrompt: "",
  rubricPrompt: "",
  personas: [],
};

type ScenarioFormModalProps = {
  scenarioId?: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
};

// Loads an existing scenario's detail into the form when editing. Returns the
// loading flag; a create form (no id) is never loading.
function useScenarioDetailLoader(
  scenarioId: string | undefined,
  setForm: (state: ScenarioFormState) => void
): boolean {
  const [loadingDetail, setLoadingDetail] = useState(Boolean(scenarioId));
  useEffect(() => {
    if (!scenarioId) return;
    let active = true;
    void loadScenarioDetail(
      scenarioId,
      () => active,
      (detail) => setForm(toFormState(detail)),
      setLoadingDetail
    );
    return () => {
      active = false;
    };
  }, [scenarioId, setForm]);
  return loadingDetail;
}

function ScenarioFormModal({
  scenarioId,
  onClose,
  onSaved,
  onError,
}: ScenarioFormModalProps) {
  const t = useTranslations("admin.scenarios");
  const tc = useTranslations("common");
  const isEdit = Boolean(scenarioId);
  const [formState, setFormStateRaw] = useState<ScenarioFormState>(EMPTY_FORM);
  const setState = (patch: Partial<ScenarioFormState>) =>
    setFormStateRaw((prev) => ({ ...prev, ...patch }));
  const [busy, setBusy] = useState(false);
  const loadingDetail = useScenarioDetailLoader(scenarioId, setFormStateRaw);
  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void submitScenarioForm(isEdit, scenarioId, formState, {
      setBusy,
      onError,
      onSaved,
      saveFailedMsg: tc("saveFailed"),
      createFailedMsg: tc("createFailed"),
    });
  };
  return (
    <ModalShell
      title={isEdit ? t("editTitle") : t("createTitle")}
      onClose={onClose}
      wide
    >
      {loadingDetail ? (
        <p className="auth-empty">{tc("loading")}</p>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} style={{ gap: 14 }}>
          <ScenarioFormBody
            state={formState}
            setState={setState}
            isEdit={isEdit}
            busy={busy}
          />
          <FormActions
            busy={busy}
            submitLabel={isEdit ? tc("save") : tc("create")}
            onCancel={onClose}
          />
        </form>
      )}
    </ModalShell>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// eslint-disable-next-line max-lines-per-function
function SettingTableRow({
  settingKey,
  value,
  onSave,
  onDelete,
  showToast,
}: {
  settingKey: string;
  value: string;
  onSave: (oldKey: string, newKey: string, newValue: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  showToast: () => void;
}) {
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState(settingKey);
  const [draftValue, setDraftValue] = useState(value);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    setBusy(true);
    await onSave(settingKey, draftKey.trim() || settingKey, draftValue);
    setBusy(false);
    setEditing(false);
    showToast();
  };

  const cancel = () => {
    setDraftKey(settingKey);
    setDraftValue(value);
    setEditing(false);
  };

  const masked =
    value.length > 0 ? "•".repeat(Math.min(value.length, 20)) : "—";

  return (
    <tr>
      <td style={ST.tdKey}>
        {editing ? (
          <input
            className="auth-input"
            style={{ fontFamily: "monospace", fontSize: 13, width: "100%" }}
            value={draftKey}
            autoFocus
            disabled={busy}
            onChange={(ev) => setDraftKey(ev.target.value)}
          />
        ) : (
          settingKey
        )}
      </td>
      <td style={ST.td}>
        {editing ? (
          <input
            className="auth-input"
            style={{ fontSize: 13, width: "100%" }}
            value={draftValue}
            disabled={busy}
            onChange={(ev) => setDraftValue(ev.target.value)}
          />
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                letterSpacing: revealed ? undefined : 1,
              }}
            >
              {revealed ? value || "—" : masked}
            </span>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 3px",
                color: "var(--muted)",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
              }}
              onClick={() => setRevealed((prev) => !prev)}
              title={revealed ? tc("hide") : tc("show")}
            >
              <EyeIcon open={revealed} />
            </button>
          </span>
        )}
      </td>
      <td style={ST.tdAction}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {editing ? (
            <>
              <button
                type="button"
                className="tb-btn"
                style={ST.btnSm}
                onClick={() => void commit()}
                disabled={busy}
              >
                {tc("save")}
              </button>
              <button
                type="button"
                className="tb-btn"
                style={ST.btnSm}
                onClick={cancel}
                disabled={busy}
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="tb-btn"
                style={ST.btnSm}
                onClick={() => {
                  setDraftKey(settingKey);
                  setDraftValue(value);
                  setEditing(true);
                }}
              >
                {ta("actions.edit")}
              </button>
              <button
                type="button"
                className="tb-btn danger"
                style={ST.btnDanger}
                disabled={busy}
                onClick={() => void onDelete(settingKey)}
              >
                {tc("delete")}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function AddSettingForm({
  onAdd,
  onClose,
}: {
  onAdd: (key: string, value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.settings");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!newKey.trim()) return;
    onAdd(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
    onClose();
  };
  return (
    <div style={ST.addBox}>
      <form onSubmit={(ev) => void handleSubmit(ev)} style={ST.addForm}>
        <input
          className="auth-input"
          placeholder={t("keyPlaceholder")}
          style={{ fontFamily: "monospace", fontSize: 13 }}
          value={newKey}
          autoFocus
          onChange={(ev) => setNewKey(ev.target.value)}
        />
        <input
          className="auth-input"
          placeholder={t("valuePlaceholder")}
          style={{ fontSize: 13 }}
          value={newValue}
          onChange={(ev) => setNewValue(ev.target.value)}
        />
        <button
          type="submit"
          className="auth-btn"
          style={{ whiteSpace: "nowrap", padding: "0 18px" }}
          disabled={!newKey.trim()}
        >
          {ta("actions.add")}
        </button>
        <button
          type="button"
          className="tb-btn"
          style={ST.btnSm}
          onClick={onClose}
        >
          {tc("cancel")}
        </button>
      </form>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
function Settings() {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("common");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const reload = useCallback(() => setRefreshKey((prev) => prev + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/admin/settings");
      if (!active) return;
      if (res.ok) setSettings((await res.json()) as Setting[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const triggerToast = useCallback(() => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1000);
  }, []);

  const autoSave = useCallback(
    async (oldKey: string, newKey: string, value: string) => {
      if (oldKey !== newKey) {
        await fetch(`/api/admin/settings/${encodeURIComponent(oldKey)}`, {
          method: "DELETE",
        });
      }
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: [{ key: newKey, value }] }),
      });
      reload();
    },
    [reload]
  );

  const deleteSetting = useCallback(
    async (key: string) => {
      await fetch(`/api/admin/settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      reload();
    },
    [reload]
  );

  const addSetting = useCallback(
    async (key: string, value: string) => {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: [{ key, value }] }),
      });
      triggerToast();
      reload();
    },
    [reload, triggerToast]
  );

  if (loading) return <p className="auth-empty">{tc("loading")}</p>;
  return (
    <div>
      <CenterToast show={showToast} />
      <p style={ST.settingsDesc}>{t("description")}</p>
      {showAddForm ? (
        <AddSettingForm
          onAdd={(key, value) => void addSetting(key, value)}
          onClose={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          className="auth-btn"
          style={{ padding: "8px 20px" }}
          onClick={() => setShowAddForm(true)}
        >
          {t("addNew")}
        </button>
      )}
      {settings.length > 0 && (
        <div style={{ ...ST.personaTableWrap, marginTop: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={ST.thRow}>
                <th style={{ ...ST.th, width: "35%" }}>{t("key")}</th>
                <th style={ST.th}>{t("value")}</th>
                <th style={{ ...ST.th, width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <SettingTableRow
                  key={setting.key}
                  settingKey={setting.key}
                  value={setting.value}
                  onSave={autoSave}
                  onDelete={deleteSetting}
                  showToast={triggerToast}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────

type AccountFormProps = {
  account: Account;
  username: string;
  setUsername: (val: string) => void;
  busy: boolean;
  err: string | null;
  ok: string | null;
};
function AccountForm({
  account,
  username,
  setUsername,
  busy,
  err,
  ok,
}: AccountFormProps) {
  const t = useTranslations("admin.account");
  const tu = useTranslations("admin.users");
  const tc = useTranslations("common");
  return (
    <>
      <div className="auth-field">
        <span className="auth-label">{t("email")}</span>
        <div className="auth-readonly">{account.email}</div>
      </div>
      <div className="auth-field">
        <span className="auth-label">{t("role")}</span>
        <div className="auth-readonly">{account.role}</div>
      </div>
      <div className="auth-field">
        <label htmlFor="admin-username" className="auth-label">
          {tu("displayNameLabel")}
        </label>
        <input
          id="admin-username"
          className="auth-input"
          type="text"
          value={username}
          onChange={(ev) => setUsername(ev.target.value)}
          disabled={busy}
          required
        />
      </div>
      <StatusMsg error={err} ok={ok} />
      <button
        type="submit"
        className="auth-btn"
        disabled={busy || !username.trim()}
      >
        {busy ? tc("saving") : tc("save")}
      </button>
    </>
  );
}

function AccountPanel() {
  const tc = useTranslations("common");
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/admin/account");
      if (!active) return;
      if (res.ok) {
        const data = (await res.json()) as Account;
        setAccount(data);
        setUsername(data.username);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    const res = await fetch("/api/admin/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(tc("saveFailed"));
      return;
    }
    setOk(tc("saved"));
    setTimeout(() => setOk(null), 3000);
  };
  if (!account) return <p className="auth-empty">{tc("loading")}</p>;
  return (
    <div style={ST.accountWrap}>
      <form className="auth-form" onSubmit={(ev) => void handleSubmit(ev)}>
        <AccountForm
          account={account}
          username={username}
          setUsername={setUsername}
          busy={busy}
          err={err}
          ok={ok}
        />
      </form>
      <div className="auth-actions">
        <SignOutButton redirectTo="/signin" />
      </div>
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

const TAB_IDS: Tab[] = [
  "dashboard",
  "users",
  "scenarios",
  "settings",
  "account",
];

function TabButton({
  id,
  label,
  activeTab,
  onClick,
}: {
  id: Tab;
  label: string;
  activeTab: Tab;
  onClick: () => void;
}) {
  const isActive = id === activeTab;
  const tabStyle: React.CSSProperties = {
    border: "none",
    background: isActive ? "var(--accent-soft)" : "transparent",
    color: isActive ? "var(--accent)" : "var(--muted)",
    fontWeight: isActive ? 700 : 500,
    fontSize: 14,
    padding: "7px 16px",
    borderRadius: 999,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s ease, color 0.15s ease",
  };
  return (
    <button type="button" onClick={onClick} style={tabStyle}>
      {label}
    </button>
  );
}

// Heroicons v2 outline "sun" / "moon" (https://heroicons.com), MIT licensed.
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
      />
    </svg>
  );
}

function ThemeToggleButton({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const t = useTranslations("admin");
  const themeLabel = theme === "dark" ? t("themeLight") : t("themeDark");
  return (
    <button
      type="button"
      style={ST.themeToggle}
      onClick={onToggle}
      title={themeLabel}
      aria-label={themeLabel}
    >
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function AdminHeader({
  tab,
  theme,
  onTabChange,
  onToggleTheme,
}: {
  tab: Tab;
  theme: Theme;
  onTabChange: (next: Tab) => void;
  onToggleTheme: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <header style={ST.header}>
      <div style={ST.headerInner}>
        <div style={ST.headerLeft}>
          <span style={ST.brand}>
            <BrandLogo className="brand-logo brand-logo-admin" />
            {t("brandSuffix")}
          </span>
          <nav style={ST.nav}>
            {TAB_IDS.map((id) => (
              <TabButton
                key={id}
                id={id}
                label={t(`tabs.${id}`)}
                activeTab={tab}
                onClick={() => onTabChange(id)}
              />
            ))}
          </nav>
        </div>
        <div style={ST.headerRight}>
          <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
          <Link href="/" style={ST.playerLink}>
            {t("playerLink")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function AdminMain({ tab, selfId }: { tab: Tab; selfId: string }) {
  const t = useTranslations("admin");
  const label = t(`tabs.${tab}`);
  return (
    <main style={ST.main}>
      <h2 style={ST.pageH2}>{label}</h2>
      {tab === "dashboard" && <Dashboard />}
      {tab === "users" && <Users selfId={selfId} />}
      {tab === "scenarios" && <Scenarios />}
      {tab === "settings" && <Settings />}
      {tab === "account" && <AccountPanel />}
    </main>
  );
}

const themeChangeListeners = new Set<() => void>();

function readStoredTheme(): Theme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

function getServerTheme(): Theme {
  return "light";
}

function subscribeToThemeChanges(listener: () => void): () => void {
  themeChangeListeners.add(listener);
  return () => themeChangeListeners.delete(listener);
}

function useAdminTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    subscribeToThemeChanges,
    readStoredTheme,
    getServerTheme
  );
  const toggleTheme = useCallback(() => {
    const next: Theme = readStoredTheme() === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    themeChangeListeners.forEach((listener) => listener());
  }, []);
  return [theme, toggleTheme];
}

export default function AdminPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selfId, setSelfId] = useState<string>("");
  const [theme, toggleTheme] = useAdminTheme();
  const [authStatus, setAuthStatus] = useReducer(
    (_: string, next: string) => next,
    "loading"
  );
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/admin/account");
      if (!active) return;
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (res.status === 403) {
        router.replace("/");
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as Account;
        setSelfId(data.id);
        setAuthStatus("ready");
      } else {
        setAuthStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);
  if (authStatus === "loading")
    return (
      <div className="auth-page" data-theme={theme}>
        <p className="auth-empty">{tc("authChecking")}</p>
      </div>
    );
  if (authStatus === "error")
    return (
      <div className="auth-page" data-theme={theme}>
        <p className="auth-error">{t("authLoadFailed")}</p>
      </div>
    );
  return (
    <div className="mp-page" style={ST.page} data-theme={theme}>
      <AdminHeader
        tab={tab}
        theme={theme}
        onTabChange={setTab}
        onToggleTheme={toggleTheme}
      />
      <AdminMain tab={tab} selfId={selfId} />
    </div>
  );
}
