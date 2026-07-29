/**
 * Persistence provider contracts.
 *
 * This file mirrors docs/architecture/data-model.md.
 */
export type AccountRole = "player" | "admin";

export type Account = {
  id: string;
  email: string;
  username: string;
  role: AccountRole;
  emailVerified: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
};

export type AccountWithCredential = Account & {
  passwordHash: string | null;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  basePrompt: string;
  challengePrompt: string;
  documentsPrompt: string;
  rubricPrompt: string;
};

export type Persona = {
  id: string;
  scenarioId: string;
  characterPrompt: string;
  voiceCode: string;
  docToolEnabled: boolean;
};

export type Result = {
  id: string;
  accountId: string | null;
  scenarioId: string;
  summary: string;
  evaluation: string;
};

export type Setting = {
  key: string;
  value: string;
  updatedAt?: string;
};

export type AccountListFilter = {
  role?: AccountRole;
  q?: string;
};

export type AccountCreateInput = Omit<
  AccountWithCredential,
  "id" | "passwordHash" | "emailVerified" | "stripeCustomerId" | "createdAt"
> & {
  id?: string;
  passwordHash?: string | null;
  emailVerified?: string | null;
  stripeCustomerId?: string | null;
  createdAt?: string;
};

export type ScenarioCreateInput = Scenario;
export type PersonaCreateInput = Persona;
export type ResultCreateInput = Result;

export type TicketLedgerType =
  | "registration_grant"
  | "monthly_grant"
  | "purchase"
  | "admin_adjust";

export type TicketLedger = {
  id: string;
  accountId: string;
  type: TicketLedgerType;
  isActive: boolean;
  consumedAt: string | null;
  consumedScenarioId: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type TicketLedgerCreateInput = Omit<
  TicketLedger,
  | "id"
  | "isActive"
  | "consumedAt"
  | "consumedScenarioId"
  | "revokedAt"
  | "createdAt"
> & {
  id?: string;
  createdAt?: string;
};

export interface AccountStore {
  create(input: AccountCreateInput): Promise<Account>;
  get(id: string): Promise<Account | null>;
  getWithCredential(id: string): Promise<AccountWithCredential | null>;
  findByEmail(email: string): Promise<AccountWithCredential | null>;
  update(
    id: string,
    patch: Partial<Omit<Account, "id">>
  ): Promise<Account | null>;
  updatePassword(id: string, passwordHash: string | null): Promise<void>;
  delete(id: string): Promise<void>;
  list(filter?: AccountListFilter): Promise<Account[]>;
  count(): Promise<number>;
}

export type OAuthAccount = {
  id: string;
  accountId: string;
  provider: string;
  providerAccountId: string;
};

export type OAuthAccountCreateInput = Omit<OAuthAccount, "id"> & {
  id?: string;
};

export interface OAuthAccountStore {
  create(input: OAuthAccountCreateInput): Promise<OAuthAccount>;
  findByProvider(
    provider: string,
    providerAccountId: string
  ): Promise<OAuthAccount | null>;
  listByAccount(accountId: string): Promise<OAuthAccount[]>;
  delete(id: string): Promise<void>;
}

export interface ScenarioStore {
  create(input: ScenarioCreateInput): Promise<Scenario>;
  get(id: string): Promise<Scenario | null>;
  update(
    id: string,
    patch: Partial<Omit<Scenario, "id">>
  ): Promise<Scenario | null>;
  delete(id: string): Promise<void>;
  list(): Promise<Scenario[]>;
  count(): Promise<number>;
}

export interface PersonaStore {
  create(input: PersonaCreateInput): Promise<Persona>;
  findByScenarioId(scenarioId: string): Promise<Persona[]>;
  replaceAll(
    scenarioId: string,
    personas: PersonaCreateInput[]
  ): Promise<Persona[]>;
}

export interface ResultStore {
  create(input: ResultCreateInput): Promise<Result>;
  get(id: string): Promise<Result | null>;
  update(
    id: string,
    patch: Partial<Omit<Result, "id">>
  ): Promise<Result | null>;
  delete(id: string): Promise<void>;
  listByAccount(accountId: string): Promise<Result[]>;
  listRecent(limit: number): Promise<Result[]>;
  count(): Promise<number>;
}

export interface SettingStore {
  create(input: Setting): Promise<Setting>;
  get(key: string): Promise<Setting | null>;
  update(key: string, value: string): Promise<Setting>;
  delete(key: string): Promise<void>;
  list(): Promise<Setting[]>;
}

export interface TicketLedgerStore {
  createBatch(
    accountId: string,
    type: TicketLedgerType,
    count: number
  ): Promise<TicketLedger[]>;
  // Count registration_grant rows and insert only the deficit, atomically, so
  // concurrent syncs cannot issue more than targetCount.
  ensureRegistrationGrants(
    accountId: string,
    targetCount: number
  ): Promise<number>;
  listByAccount(accountId: string, limit?: number): Promise<TicketLedger[]>;
  countGranted(accountId: string): Promise<number>;
  countActive(accountId: string): Promise<number>;
  consumeOldestActive(
    accountId: string,
    scenarioId: string
  ): Promise<TicketLedger | null>;
  getById(id: string): Promise<TicketLedger | null>;
  // Revocation is logical (is_active = false + revoked_at): the row stays in
  // the ledger, so registration-grant sync still counts it and never re-issues.
  revokeById(id: string): Promise<void>;
  revokeActiveBatch(accountId: string, count: number): Promise<number>;
}

export type BillingFulfillmentCreateInput = {
  stripeSessionId: string;
  accountId: string;
  ticketCount: number;
};

export interface BillingFulfillmentStore {
  createIfAbsent(input: BillingFulfillmentCreateInput): Promise<boolean>;
}

export interface Store {
  accounts: AccountStore;
  oauthAccounts: OAuthAccountStore;
  scenarios: ScenarioStore;
  personas: PersonaStore;
  results: ResultStore;
  settings: SettingStore;
  ticketLedger: TicketLedgerStore;
  billingFulfillments: BillingFulfillmentStore;
}
