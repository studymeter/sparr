import {
  type Account,
  type AccountCreateInput,
  type AccountWithCredential,
  type BillingFulfillmentCreateInput,
  type OAuthAccount,
  type OAuthAccountCreateInput,
  type Persona,
  type Result,
  type Scenario,
  type Setting,
  type Store,
  type TicketLedger,
} from "@/lib/providers";
import { uid } from "@/lib/id";

function cloneAccount(row: Account): Account {
  return { ...row };
}

function cloneCredentialRow(row: AccountWithCredential): AccountWithCredential {
  return { ...row };
}

function cloneOAuthAccount(row: OAuthAccount): OAuthAccount {
  return { ...row };
}

function cloneScenario(row: Scenario): Scenario {
  return { ...row, tags: [...row.tags] };
}

function clonePersona(row: Persona): Persona {
  return { ...row };
}

function cloneResult(row: Result): Result {
  return { ...row };
}

function cloneTicketLedger(row: TicketLedger): TicketLedger {
  return { ...row };
}

function cloneBillingFulfillmentInput(
  row: BillingFulfillmentCreateInput
): BillingFulfillmentCreateInput {
  return { ...row };
}

type MemoryStoreSeed = {
  accounts?: AccountWithCredential[];
  oauthAccounts?: OAuthAccount[];
  scenarios?: Scenario[];
  personas?: Persona[];
  results?: Result[];
  settings?: Setting[];
  ticketLedger?: TicketLedger[];
  billingFulfillments?: BillingFulfillmentCreateInput[];
};

type MemoryState = {
  accounts: Map<string, AccountWithCredential>;
  accountsByEmail: Map<string, string>;
  oauthAccounts: Map<string, OAuthAccount>;
  oauthAccountByProvider: Map<string, string>;
  scenarios: Map<string, Scenario>;
  personas: Map<string, Persona>;
  results: Map<string, Result>;
  settings: Map<string, Setting>;
  ticketLedger: Map<string, TicketLedger>;
  billingFulfillments: Map<string, BillingFulfillmentCreateInput>;
};

function createMemoryState(): MemoryState {
  return {
    accounts: new Map<string, AccountWithCredential>(),
    accountsByEmail: new Map<string, string>(),
    oauthAccounts: new Map<string, OAuthAccount>(),
    oauthAccountByProvider: new Map<string, string>(),
    scenarios: new Map<string, Scenario>(),
    personas: new Map<string, Persona>(),
    results: new Map<string, Result>(),
    settings: new Map<string, Setting>(),
    ticketLedger: new Map<string, TicketLedger>(),
    billingFulfillments: new Map<string, BillingFulfillmentCreateInput>(),
  };
}

function seedAccountRows(state: MemoryState, seed?: MemoryStoreSeed): void {
  for (const account of seed?.accounts ?? []) {
    state.accounts.set(account.id, cloneCredentialRow(account));
    state.accountsByEmail.set(account.email.toLowerCase(), account.id);
  }
  for (const oauthAccount of seed?.oauthAccounts ?? []) {
    state.oauthAccounts.set(oauthAccount.id, cloneOAuthAccount(oauthAccount));
    state.oauthAccountByProvider.set(
      `${oauthAccount.provider}:${oauthAccount.providerAccountId}`,
      oauthAccount.id
    );
  }
}

function seedContentRows(state: MemoryState, seed?: MemoryStoreSeed): void {
  for (const scenario of seed?.scenarios ?? [])
    state.scenarios.set(scenario.id, cloneScenario(scenario));
  for (const persona of seed?.personas ?? [])
    state.personas.set(persona.id, clonePersona(persona));
  for (const result of seed?.results ?? [])
    state.results.set(result.id, cloneResult(result));
}

function seedConfigRows(state: MemoryState, seed?: MemoryStoreSeed): void {
  for (const setting of seed?.settings ?? [])
    state.settings.set(setting.key, { ...setting });
  for (const row of seed?.ticketLedger ?? [])
    state.ticketLedger.set(row.id, cloneTicketLedger(row));
  for (const row of seed?.billingFulfillments ?? []) {
    state.billingFulfillments.set(
      row.stripeSessionId,
      cloneBillingFulfillmentInput(row)
    );
  }
}

function createAccountWriteMethods(
  state: MemoryState
): Pick<Store["accounts"], "create" | "update" | "updatePassword" | "delete"> {
  const { accounts, accountsByEmail, oauthAccounts, oauthAccountByProvider } =
    state;
  return {
    async create(input: AccountCreateInput) {
      const id = input.id || uid("acct_");
      const email = input.email.toLowerCase();
      const row: AccountWithCredential = {
        id,
        email,
        username: input.username,
        role: input.role,
        emailVerified: input.emailVerified ?? null,
        stripeCustomerId: input.stripeCustomerId ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
        passwordHash: input.passwordHash ?? null,
      };
      accounts.set(id, row);
      accountsByEmail.set(email, id);
      return cloneAccount(row);
    },
    async update(id, patch) {
      const current = accounts.get(id);
      if (!current) return null;
      const next: AccountWithCredential = { ...current, ...patch };
      if (patch.email && patch.email !== current.email) {
        accountsByEmail.delete(current.email.toLowerCase());
        accountsByEmail.set(patch.email.toLowerCase(), id);
        next.email = patch.email.toLowerCase();
      }
      accounts.set(id, next);
      return cloneAccount(next);
    },
    async updatePassword(id, passwordHash) {
      const current = accounts.get(id);
      if (!current) return;
      accounts.set(id, { ...current, passwordHash: passwordHash ?? null });
    },
    async delete(id) {
      const current = accounts.get(id);
      if (current) {
        accountsByEmail.delete(current.email.toLowerCase());
      }
      for (const oauthAccount of oauthAccounts.values()) {
        if (oauthAccount.accountId !== id) continue;
        oauthAccountByProvider.delete(
          `${oauthAccount.provider}:${oauthAccount.providerAccountId}`
        );
        oauthAccounts.delete(oauthAccount.id);
      }
      accounts.delete(id);
    },
  };
}

function createAccountReadMethods(
  state: MemoryState
): Pick<
  Store["accounts"],
  "get" | "getWithCredential" | "findByEmail" | "list" | "count"
> {
  const { accounts, accountsByEmail } = state;
  return {
    async get(id) {
      const row = accounts.get(id);
      return row ? cloneAccount(row) : null;
    },
    async getWithCredential(id) {
      const row = accounts.get(id);
      return row ? cloneCredentialRow(row) : null;
    },
    async findByEmail(email) {
      const id = accountsByEmail.get(email.toLowerCase());
      if (!id) return null;
      const row = accounts.get(id);
      return row ? cloneCredentialRow(row) : null;
    },
    async list(filter) {
      const query = filter?.q?.toLowerCase();
      return [...accounts.values()]
        .filter((row) => {
          if (filter?.role && row.role !== filter.role) return false;
          if (!query) return true;
          return (
            row.email.toLowerCase().includes(query) ||
            row.username.toLowerCase().includes(query)
          );
        })
        .map(cloneAccount);
    },
    async count() {
      return accounts.size;
    },
  };
}

function createAccountMethods(state: MemoryState): Store["accounts"] {
  return {
    ...createAccountWriteMethods(state),
    ...createAccountReadMethods(state),
  };
}

function createOAuthAccountMethods(state: MemoryState): Store["oauthAccounts"] {
  const { oauthAccounts, oauthAccountByProvider } = state;
  return {
    async create(input: OAuthAccountCreateInput) {
      const id = input.id || uid("oacct_");
      const row: OAuthAccount = {
        id,
        accountId: input.accountId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      };
      oauthAccounts.set(id, row);
      oauthAccountByProvider.set(
        `${row.provider}:${row.providerAccountId}`,
        row.id
      );
      return cloneOAuthAccount(row);
    },
    async findByProvider(provider, providerAccountId) {
      const key = `${provider}:${providerAccountId}`;
      const id = oauthAccountByProvider.get(key);
      if (!id) return null;
      const row = oauthAccounts.get(id);
      return row ? cloneOAuthAccount(row) : null;
    },
    async listByAccount(accountId) {
      return [...oauthAccounts.values()]
        .filter((row) => row.accountId === accountId)
        .map(cloneOAuthAccount);
    },
    async delete(id) {
      const current = oauthAccounts.get(id);
      if (current) {
        oauthAccountByProvider.delete(
          `${current.provider}:${current.providerAccountId}`
        );
      }
      oauthAccounts.delete(id);
    },
  };
}

function createScenarioMethods(state: MemoryState): Store["scenarios"] {
  const { scenarios } = state;
  return {
    async create(input) {
      scenarios.set(input.id, cloneScenario(input));
      return cloneScenario(input);
    },
    async get(id) {
      const row = scenarios.get(id);
      return row ? cloneScenario(row) : null;
    },
    async update(id, patch) {
      const current = scenarios.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      scenarios.set(id, next);
      return cloneScenario(next);
    },
    async delete(id) {
      scenarios.delete(id);
    },
    async list() {
      return [...scenarios.values()].map(cloneScenario);
    },
    async count() {
      return scenarios.size;
    },
  };
}

function createPersonaMethods(state: MemoryState): Store["personas"] {
  const { personas } = state;
  return {
    async create(input) {
      personas.set(input.id, clonePersona(input));
      return clonePersona(input);
    },
    async findByScenarioId(scenarioId) {
      return [...personas.values()]
        .filter((row) => row.scenarioId === scenarioId)
        .map(clonePersona);
    },
    async replaceAll(scenarioId, nextPersonas) {
      for (const row of [...personas.values()]) {
        if (row.scenarioId === scenarioId) personas.delete(row.id);
      }
      for (const row of nextPersonas) {
        personas.set(row.id, clonePersona({ ...row, scenarioId }));
      }
      return [...personas.values()]
        .filter((row) => row.scenarioId === scenarioId)
        .map(clonePersona);
    },
  };
}

function createResultMethods(state: MemoryState): Store["results"] {
  const { results } = state;
  return {
    async create(input) {
      results.set(input.id, cloneResult(input));
      return cloneResult(input);
    },
    async get(id) {
      const row = results.get(id);
      return row ? cloneResult(row) : null;
    },
    async update(id, patch) {
      const current = results.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      results.set(id, next);
      return cloneResult(next);
    },
    async delete(id) {
      results.delete(id);
    },
    async listByAccount(accountId) {
      return [...results.values()]
        .filter((row) => row.accountId === accountId)
        .map(cloneResult);
    },
    async listRecent(limit) {
      return [...results.values()].slice(-limit).reverse().map(cloneResult);
    },
    async count() {
      return results.size;
    },
  };
}

function createSettingMethods(state: MemoryState): Store["settings"] {
  const { settings } = state;
  return {
    async create(input) {
      settings.set(input.key, { ...input });
      return { ...input };
    },
    async get(key) {
      const row = settings.get(key);
      return row ? { ...row } : null;
    },
    async update(key, value) {
      const row = { key, value, updatedAt: new Date().toISOString() };
      settings.set(key, row);
      return { ...row };
    },
    async delete(key) {
      settings.delete(key);
    },
    async list() {
      return [...settings.values()].map((row) => ({ ...row }));
    },
  };
}

function countMemoryRegistrationGrants(
  ticketLedger: Map<string, TicketLedger>,
  accountId: string
): number {
  return [...ticketLedger.values()].filter(
    (row) => row.accountId === accountId && row.type === "registration_grant"
  ).length;
}

function createMemoryTicketBatch(
  ticketLedger: Map<string, TicketLedger>,
  accountId: string,
  type: TicketLedger["type"],
  count: number
): TicketLedger[] {
  if (count <= 0) return [];
  const created: TicketLedger[] = [];
  for (let index = 0; index < count; index += 1) {
    const row: TicketLedger = {
      id: uid("tkt_"),
      accountId,
      type,
      isActive: true,
      consumedAt: null,
      consumedScenarioId: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    ticketLedger.set(row.id, row);
    created.push(cloneTicketLedger(row));
  }
  return created;
}

function ensureMemoryRegistrationGrants(
  ticketLedger: Map<string, TicketLedger>,
  accountId: string,
  targetCount: number
): number {
  if (targetCount <= 0) return 0;
  // No await between count and insert: the body runs to completion on one
  // turn of the event loop, so concurrent callers cannot interleave here.
  const toIssue = Math.max(
    0,
    targetCount - countMemoryRegistrationGrants(ticketLedger, accountId)
  );
  if (toIssue === 0) return 0;
  createMemoryTicketBatch(
    ticketLedger,
    accountId,
    "registration_grant",
    toIssue
  );
  return toIssue;
}

function createTicketGrantMethods(
  state: MemoryState
): Pick<
  Store["ticketLedger"],
  | "createBatch"
  | "ensureRegistrationGrants"
  | "listByAccount"
  | "countGranted"
  | "countActive"
> {
  const { ticketLedger } = state;
  return {
    async createBatch(accountId, type, count) {
      return createMemoryTicketBatch(ticketLedger, accountId, type, count);
    },
    async ensureRegistrationGrants(accountId, targetCount) {
      return ensureMemoryRegistrationGrants(
        ticketLedger,
        accountId,
        targetCount
      );
    },
    async listByAccount(accountId, limit = 20) {
      return [...ticketLedger.values()]
        .filter((row) => row.accountId === accountId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(cloneTicketLedger);
    },
    async countGranted(accountId) {
      return countMemoryRegistrationGrants(ticketLedger, accountId);
    },
    async countActive(accountId) {
      return [...ticketLedger.values()]
        .filter((row) => row.accountId === accountId)
        .filter((row) => row.isActive).length;
    },
  };
}

function createTicketConsumeMethods(
  state: MemoryState
): Pick<
  Store["ticketLedger"],
  "consumeOldestActive" | "getById" | "revokeById" | "revokeActiveBatch"
> {
  const { ticketLedger } = state;
  return {
    async consumeOldestActive(accountId, scenarioId) {
      const oldest = [...ticketLedger.values()]
        .filter((row) => row.accountId === accountId && row.isActive)
        .sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt)
        )[0];
      if (!oldest) return null;
      const next: TicketLedger = {
        ...oldest,
        isActive: false,
        consumedAt: new Date().toISOString(),
        consumedScenarioId: scenarioId,
      };
      ticketLedger.set(next.id, next);
      return cloneTicketLedger(next);
    },
    async getById(id) {
      const row = ticketLedger.get(id);
      return row ? cloneTicketLedger(row) : null;
    },
    // Revocation is logical (isActive = false + revokedAt): the row stays in
    // the ledger, so registration-grant sync still counts it and never re-issues.
    async revokeById(id) {
      const row = ticketLedger.get(id);
      if (!row || !row.isActive) return;
      ticketLedger.set(id, {
        ...row,
        isActive: false,
        revokedAt: new Date().toISOString(),
      });
    },
    async revokeActiveBatch(accountId, count) {
      const targets = [...ticketLedger.values()]
        .filter((row) => row.accountId === accountId && row.isActive)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, count);
      const revokedAt = new Date().toISOString();
      for (const row of targets) {
        ticketLedger.set(row.id, { ...row, isActive: false, revokedAt });
      }
      return targets.length;
    },
  };
}

function createTicketLedgerMethods(state: MemoryState): Store["ticketLedger"] {
  return {
    ...createTicketGrantMethods(state),
    ...createTicketConsumeMethods(state),
  };
}

function createBillingFulfillmentMethods(
  state: MemoryState
): Store["billingFulfillments"] {
  const { billingFulfillments } = state;
  return {
    async createIfAbsent(input) {
      if (billingFulfillments.has(input.stripeSessionId)) return false;
      billingFulfillments.set(
        input.stripeSessionId,
        cloneBillingFulfillmentInput(input)
      );
      return true;
    },
  };
}

export function createMemoryStore(seed?: MemoryStoreSeed): Store {
  const state = createMemoryState();
  seedAccountRows(state, seed);
  seedContentRows(state, seed);
  seedConfigRows(state, seed);

  return {
    accounts: createAccountMethods(state),
    oauthAccounts: createOAuthAccountMethods(state),
    scenarios: createScenarioMethods(state),
    personas: createPersonaMethods(state),
    results: createResultMethods(state),
    settings: createSettingMethods(state),
    ticketLedger: createTicketLedgerMethods(state),
    billingFulfillments: createBillingFulfillmentMethods(state),
  };
}
