import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  Account,
  AccountCreateInput,
  BillingFulfillmentStore,
  AccountListFilter,
  AccountStore,
  AccountWithCredential,
  OAuthAccount,
  OAuthAccountCreateInput,
  OAuthAccountStore,
  Persona,
  PersonaStore,
  Result,
  ResultCreateInput,
  ResultStore,
  Scenario,
  ScenarioCreateInput,
  ScenarioStore,
  Setting,
  SettingStore,
  Store,
  TicketLedger,
  TicketLedgerStore,
  TicketLedgerType,
} from "@/lib/providers";
import { uid } from "@/lib/id";
import { buildDemoPersonas, buildDemoScenario } from "@/lib/store/demoScenario";
import { TICKET_INITIAL_GRANT_COUNT } from "@/lib/constants";

function nowIso(): string {
  return new Date().toISOString();
}

function toPublicAccount(row: AccountWithCredential): Account {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    emailVerified: row.emailVerified,
    stripeCustomerId: row.stripeCustomerId,
    createdAt: row.createdAt,
  };
}

export function createSqliteStore(dbPath: string): Store {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  assertSchemaCompatibility(db);
  seedScenarioIfNeeded(db);

  return {
    accounts: createAccountsStore(db),
    oauthAccounts: createOauthAccountsStore(db),
    scenarios: createScenariosStore(db),
    personas: createPersonasStore(db),
    results: createResultsStore(db),
    settings: createSettingsStore(db),
    ticketLedger: createTicketLedgerStore(db),
    billingFulfillments: createBillingFulfillmentStore(db),
  };
}

function selectAccountRowById(
  db: Database.Database,
  id: string
): AccountWithCredential | undefined {
  return db
    .prepare(
      "SELECT id, email, password_hash as passwordHash, username, role, email_verified as emailVerified, stripe_customer_id as stripeCustomerId, created_at as createdAt FROM account WHERE id = ?"
    )
    .get(id) as AccountWithCredential | undefined;
}

function findAccountWithCredential(
  db: Database.Database,
  id: string
): AccountWithCredential | null {
  const row = selectAccountRowById(db, id);
  return row ? { ...row, email: row.email.toLowerCase() } : null;
}

function insertAccount(
  db: Database.Database,
  input: AccountCreateInput
): Account {
  const id = input.id || uid("acct_");
  db.prepare(
    `
      INSERT INTO account (id, email, password_hash, username, role, email_verified, stripe_customer_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.email.toLowerCase(),
    input.passwordHash ?? null,
    input.username,
    input.role,
    input.emailVerified ?? null,
    input.stripeCustomerId ?? null,
    input.createdAt ?? nowIso()
  );
  return {
    id,
    email: input.email.toLowerCase(),
    username: input.username,
    role: input.role,
    emailVerified: input.emailVerified ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
    createdAt: input.createdAt ?? nowIso(),
  };
}

function updateAccount(
  db: Database.Database,
  id: string,
  patch: Partial<Omit<Account, "id">>
): Account | null {
  const current = findAccountWithCredential(db, id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    email: patch.email ? patch.email.toLowerCase() : current.email,
  };
  db.prepare(
    `
      UPDATE account
      SET email = ?, username = ?, role = ?, email_verified = ?, stripe_customer_id = ?
      WHERE id = ?
    `
  ).run(
    next.email,
    next.username,
    next.role,
    next.emailVerified,
    next.stripeCustomerId ?? null,
    id
  );
  return toPublicAccount(next);
}

function listAccounts(
  db: Database.Database,
  filter?: AccountListFilter
): Account[] {
  let sql =
    "SELECT id, email, username, role, stripe_customer_id as stripeCustomerId FROM account";
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (filter?.role) {
    clauses.push("role = ?");
    args.push(filter.role);
  }
  if (filter?.q) {
    clauses.push("(email LIKE ? OR username LIKE ?)");
    args.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY email ASC";
  sql = sql.replace(
    "SELECT id, email, username, role, stripe_customer_id as stripeCustomerId FROM account",
    "SELECT id, email, username, role, email_verified as emailVerified, stripe_customer_id as stripeCustomerId, created_at as createdAt FROM account"
  );
  const rows = db.prepare(sql).all(...args) as Account[];
  return rows.map((row) => ({
    ...row,
    email: row.email.toLowerCase(),
    emailVerified: row.emailVerified ?? null,
    createdAt: row.createdAt,
  }));
}

function createAccountsStore(db: Database.Database): AccountStore {
  return {
    async create(input: AccountCreateInput) {
      return insertAccount(db, input);
    },
    async get(id) {
      const row = selectAccountRowById(db, id);
      return row ? toPublicAccount(row) : null;
    },
    async getWithCredential(id) {
      return findAccountWithCredential(db, id);
    },
    async findByEmail(email) {
      const row = db
        .prepare(
          "SELECT id, email, password_hash as passwordHash, username, role, email_verified as emailVerified, stripe_customer_id as stripeCustomerId, created_at as createdAt FROM account WHERE email = ?"
        )
        .get(email.toLowerCase()) as AccountWithCredential | undefined;
      return row ? { ...row, email: row.email.toLowerCase() } : null;
    },
    async update(id, patch) {
      return updateAccount(db, id, patch);
    },
    async updatePassword(id, passwordHash) {
      db.prepare("UPDATE account SET password_hash = ? WHERE id = ?").run(
        passwordHash,
        id
      );
    },
    async delete(id) {
      db.prepare("DELETE FROM account WHERE id = ?").run(id);
    },
    async list(filter) {
      return listAccounts(db, filter);
    },
    async count() {
      const row = db.prepare("SELECT COUNT(*) as count FROM account").get() as {
        count: number;
      };
      return row.count;
    },
  };
}

function createOauthAccountsStore(db: Database.Database): OAuthAccountStore {
  return {
    async create(input: OAuthAccountCreateInput) {
      const id = input.id || uid("oacct_");
      db.prepare(
        `
          INSERT INTO oauth_account (id, account_id, provider, provider_account_id)
          VALUES (?, ?, ?, ?)
        `
      ).run(id, input.accountId, input.provider, input.providerAccountId);
      return {
        id,
        accountId: input.accountId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      };
    },
    async findByProvider(provider, providerAccountId) {
      const row = db
        .prepare(
          `
            SELECT id, account_id as accountId, provider, provider_account_id as providerAccountId
            FROM oauth_account
            WHERE provider = ? AND provider_account_id = ?
          `
        )
        .get(provider, providerAccountId) as OAuthAccount | undefined;
      return row ? { ...row } : null;
    },
    async listByAccount(accountId) {
      const rows = db
        .prepare(
          `
            SELECT id, account_id as accountId, provider, provider_account_id as providerAccountId
            FROM oauth_account
            WHERE account_id = ?
            ORDER BY id ASC
          `
        )
        .all(accountId) as OAuthAccount[];
      return rows.map((row) => ({ ...row }));
    },
    async delete(id) {
      db.prepare("DELETE FROM oauth_account WHERE id = ?").run(id);
    },
  };
}

type ScenarioRow = {
  id: string;
  title: string;
  description: string;
  base_prompt: string;
  challenge_prompt: string;
  documents_prompt: string;
  rubric_prompt: string;
};

function toScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    basePrompt: row.base_prompt,
    challengePrompt: row.challenge_prompt,
    documentsPrompt: row.documents_prompt,
    rubricPrompt: row.rubric_prompt,
  };
}

function insertScenario(
  db: Database.Database,
  input: ScenarioCreateInput
): Scenario {
  db.prepare(
    `
      INSERT INTO scenario (id, title, description, base_prompt, challenge_prompt, documents_prompt, rubric_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.title,
    input.description,
    input.basePrompt,
    input.challengePrompt,
    input.documentsPrompt,
    input.rubricPrompt
  );
  return { ...input };
}

function getScenarioById(db: Database.Database, id: string): Scenario | null {
  const row = db
    .prepare(
      `
        SELECT id, title, description, base_prompt, challenge_prompt, documents_prompt, rubric_prompt
        FROM scenario
        WHERE id = ?
      `
    )
    .get(id) as ScenarioRow | undefined;
  if (!row) return null;
  return toScenario(row);
}

function updateScenario(
  db: Database.Database,
  id: string,
  patch: Partial<Omit<Scenario, "id">>
): Scenario | null {
  const current = getScenarioById(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare(
    `
      UPDATE scenario
      SET title = ?, description = ?, base_prompt = ?, challenge_prompt = ?, documents_prompt = ?, rubric_prompt = ?
      WHERE id = ?
    `
  ).run(
    next.title,
    next.description,
    next.basePrompt,
    next.challengePrompt,
    next.documentsPrompt,
    next.rubricPrompt,
    id
  );
  return next;
}

function createScenariosStore(db: Database.Database): ScenarioStore {
  return {
    async create(input) {
      return insertScenario(db, input);
    },
    async get(id) {
      return getScenarioById(db, id);
    },
    async update(id, patch) {
      return updateScenario(db, id, patch);
    },
    async delete(id) {
      db.prepare("DELETE FROM scenario WHERE id = ?").run(id);
    },
    async list() {
      const rows = db
        .prepare(
          `
            SELECT id, title, description, base_prompt, challenge_prompt, documents_prompt, rubric_prompt
            FROM scenario
            ORDER BY id ASC
          `
        )
        .all() as ScenarioRow[];
      return rows.map((row) => toScenario(row));
    },
    async count() {
      const row = db
        .prepare("SELECT COUNT(*) as count FROM scenario")
        .get() as { count: number };
      return row.count;
    },
  };
}

type PersonaRow = {
  id: string;
  scenario_id: string;
  character_prompt: string;
  voice_code: string;
  doc_tool_enabled: number;
};

function toPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    characterPrompt: row.character_prompt,
    voiceCode: row.voice_code,
    docToolEnabled: row.doc_tool_enabled === 1,
  };
}

function findPersonasByScenarioId(
  db: Database.Database,
  scenarioId: string
): Persona[] {
  const rows = db
    .prepare(
      `
        SELECT id, scenario_id, character_prompt, voice_code, doc_tool_enabled
        FROM persona
        WHERE scenario_id = ?
        ORDER BY id ASC
      `
    )
    .all(scenarioId) as PersonaRow[];
  return rows.map((row) => toPersona(row));
}

function createPersonasStore(db: Database.Database): PersonaStore {
  return {
    async create(input) {
      db.prepare(
        `
          INSERT INTO persona (id, scenario_id, character_prompt, voice_code, doc_tool_enabled)
          VALUES (?, ?, ?, ?, ?)
        `
      ).run(
        input.id,
        input.scenarioId,
        input.characterPrompt,
        input.voiceCode,
        input.docToolEnabled ? 1 : 0
      );
      return { ...input };
    },
    async findByScenarioId(scenarioId) {
      return findPersonasByScenarioId(db, scenarioId);
    },
    async replaceAll(scenarioId, personas) {
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM persona WHERE scenario_id = ?").run(scenarioId);
        const stmt = db.prepare(
          `
            INSERT INTO persona (id, scenario_id, character_prompt, voice_code, doc_tool_enabled)
            VALUES (?, ?, ?, ?, ?)
          `
        );
        for (const persona of personas) {
          stmt.run(
            persona.id,
            scenarioId,
            persona.characterPrompt,
            persona.voiceCode,
            persona.docToolEnabled ? 1 : 0
          );
        }
      });
      tx();
      return findPersonasByScenarioId(db, scenarioId);
    },
  };
}

type ResultRow = {
  id: string;
  account_id: string | null;
  scenario_id: string;
  summary: string;
  evaluation: string;
};

function toResult(row: ResultRow): Result {
  return {
    id: row.id,
    accountId: row.account_id,
    scenarioId: row.scenario_id,
    summary: row.summary,
    evaluation: row.evaluation,
  };
}

function insertResult(db: Database.Database, input: ResultCreateInput): Result {
  db.prepare(
    `
      INSERT INTO result (id, account_id, scenario_id, summary, evaluation)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.accountId,
    input.scenarioId,
    input.summary,
    input.evaluation
  );
  return { ...input };
}

function getResultById(db: Database.Database, id: string): Result | null {
  const row = db
    .prepare(
      "SELECT id, account_id, scenario_id, summary, evaluation FROM result WHERE id = ?"
    )
    .get(id) as ResultRow | undefined;
  if (!row) return null;
  return toResult(row);
}

function updateResult(
  db: Database.Database,
  id: string,
  patch: Partial<Omit<Result, "id">>
): Result | null {
  const current = getResultById(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db.prepare(
    `
      UPDATE result
      SET account_id = ?, scenario_id = ?, summary = ?, evaluation = ?
      WHERE id = ?
    `
  ).run(next.accountId, next.scenarioId, next.summary, next.evaluation, id);
  return next;
}

function createResultsStore(db: Database.Database): ResultStore {
  return {
    async create(input) {
      return insertResult(db, input);
    },
    async get(id) {
      return getResultById(db, id);
    },
    async update(id, patch) {
      return updateResult(db, id, patch);
    },
    async delete(id) {
      db.prepare("DELETE FROM result WHERE id = ?").run(id);
    },
    async listByAccount(accountId) {
      const rows = db
        .prepare(
          `
            SELECT id, account_id, scenario_id, summary, evaluation
            FROM result
            WHERE account_id = ?
            ORDER BY rowid DESC
          `
        )
        .all(accountId) as ResultRow[];
      return rows.map((row) => toResult(row));
    },
    async listRecent(limit) {
      const rows = db
        .prepare(
          `
            SELECT id, account_id, scenario_id, summary, evaluation
            FROM result
            ORDER BY rowid DESC
            LIMIT ?
          `
        )
        .all(limit) as ResultRow[];
      return rows.map((row) => toResult(row));
    },
    async count() {
      const row = db.prepare("SELECT COUNT(*) as count FROM result").get() as {
        count: number;
      };
      return row.count;
    },
  };
}

function createSettingsStore(db: Database.Database): SettingStore {
  return {
    async create(input: Setting) {
      const updatedAt = input.updatedAt || nowIso();
      db.prepare(
        "INSERT OR REPLACE INTO setting (`key`, value, updated_at) VALUES (?, ?, ?)"
      ).run(input.key, input.value, updatedAt);
      return { key: input.key, value: input.value, updatedAt };
    },
    async get(key) {
      const row = db
        .prepare("SELECT `key`, value, updated_at FROM setting WHERE `key` = ?")
        .get(key) as
        | {
            key: string;
            value: string;
            updated_at: string;
          }
        | undefined;
      if (!row) return null;
      return { key: row.key, value: row.value, updatedAt: row.updated_at };
    },
    async update(key, value) {
      const updatedAt = nowIso();
      db.prepare(
        "INSERT OR REPLACE INTO setting (`key`, value, updated_at) VALUES (?, ?, ?)"
      ).run(key, value, updatedAt);
      return { key, value, updatedAt };
    },
    async delete(key) {
      db.prepare("DELETE FROM setting WHERE `key` = ?").run(key);
    },
    async list() {
      const rows = db
        .prepare(
          "SELECT `key`, value, updated_at FROM setting ORDER BY `key` ASC"
        )
        .all() as Array<{ key: string; value: string; updated_at: string }>;
      return rows.map((row) => ({
        key: row.key,
        value: row.value,
        updatedAt: row.updated_at,
      }));
    },
  };
}

type TicketLedgerRow = Omit<TicketLedger, "isActive"> & { isActive: number };

function createTicketBatch(
  db: Database.Database,
  accountId: string,
  type: TicketLedgerType,
  count: number
): TicketLedger[] {
  if (count <= 0) return [];
  const created: TicketLedger[] = [];
  const stmt = db.prepare(
    `
      INSERT INTO ticket_ledger
      (id, account_id, type, is_active, consumed_at, consumed_scenario_id, revoked_at, created_at)
      VALUES (?, ?, ?, 1, NULL, NULL, NULL, ?)
    `
  );
  const insertAll = db.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const id = uid("tkt_");
      const createdAt = nowIso();
      stmt.run(id, accountId, type, createdAt);
      created.push({
        id,
        accountId,
        type,
        isActive: true,
        consumedAt: null,
        consumedScenarioId: null,
        revokedAt: null,
        createdAt,
      });
    }
  });
  insertAll();
  return created;
}

function countRegistrationGrants(
  db: Database.Database,
  accountId: string
): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as count
        FROM ticket_ledger
        WHERE account_id = ?
          AND type = 'registration_grant'
      `
    )
    .get(accountId) as { count: number };
  return row.count;
}

function ensureRegistrationGrants(
  db: Database.Database,
  accountId: string,
  targetCount: number
): number {
  if (targetCount <= 0) return 0;
  // better-sqlite3 transactions serialize writers, so concurrent ensure calls
  // for the same DB cannot both observe a deficit and double-issue.
  const run = db.transaction(() => {
    const toIssue = Math.max(
      0,
      targetCount - countRegistrationGrants(db, accountId)
    );
    if (toIssue === 0) return 0;
    createTicketBatch(db, accountId, "registration_grant", toIssue);
    return toIssue;
  });
  return run();
}

function listTicketsByAccount(
  db: Database.Database,
  accountId: string,
  limit: number
): TicketLedger[] {
  const rows = db
    .prepare(
      `
        SELECT id,
               account_id as accountId,
               type,
               is_active as isActive,
               consumed_at as consumedAt,
               consumed_scenario_id as consumedScenarioId,
               revoked_at as revokedAt,
               created_at as createdAt
        FROM ticket_ledger
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(accountId, limit) as TicketLedgerRow[];
  return rows.map((row) => ({
    ...row,
    isActive: row.isActive === 1,
  }));
}

function consumeOldestActiveTicket(
  db: Database.Database,
  accountId: string,
  scenarioId: string
): TicketLedger | null {
  const tx = db.transaction(() => {
    const oldest = db
      .prepare(
        `
          SELECT id,
                 account_id as accountId,
                 type,
                 is_active as isActive,
                 consumed_at as consumedAt,
                 consumed_scenario_id as consumedScenarioId,
                 revoked_at as revokedAt,
                 created_at as createdAt
          FROM ticket_ledger
          WHERE account_id = ?
            AND is_active = 1
          ORDER BY created_at ASC
          LIMIT 1
        `
      )
      .get(accountId) as TicketLedgerRow | undefined;
    if (!oldest) return null;
    const consumedAt = nowIso();
    db.prepare(
      `
        UPDATE ticket_ledger
        SET is_active = 0,
            consumed_at = ?,
            consumed_scenario_id = ?
        WHERE id = ?
      `
    ).run(consumedAt, scenarioId, oldest.id);
    return {
      ...oldest,
      isActive: false,
      consumedAt,
      consumedScenarioId: scenarioId,
    } satisfies TicketLedger;
  });
  return tx();
}

function getTicketById(db: Database.Database, id: string): TicketLedger | null {
  const row = db
    .prepare(
      `
        SELECT id,
               account_id as accountId,
               type,
               is_active as isActive,
               consumed_at as consumedAt,
               consumed_scenario_id as consumedScenarioId,
               revoked_at as revokedAt,
               created_at as createdAt
        FROM ticket_ledger
        WHERE id = ?
      `
    )
    .get(id) as TicketLedgerRow | undefined;
  if (!row) return null;
  return { ...row, isActive: row.isActive === 1 };
}

// Revocation is logical (is_active = 0 + revoked_at): the row stays in the
// ledger, so registration-grant sync still counts it and never re-issues.
function revokeActiveTicketBatch(
  db: Database.Database,
  accountId: string,
  count: number
): number {
  const result = db
    .prepare(
      `
        UPDATE ticket_ledger
        SET is_active = 0,
            revoked_at = ?
        WHERE id IN (
          SELECT id FROM ticket_ledger
          WHERE account_id = ? AND is_active = 1
          ORDER BY created_at DESC
          LIMIT ?
        )
      `
    )
    .run(nowIso(), accountId, count);
  return result.changes;
}

function createTicketLedgerStore(db: Database.Database): TicketLedgerStore {
  return {
    async createBatch(accountId, type, count) {
      return createTicketBatch(db, accountId, type, count);
    },
    async ensureRegistrationGrants(accountId, targetCount) {
      return ensureRegistrationGrants(db, accountId, targetCount);
    },
    async listByAccount(accountId, limit = 20) {
      return listTicketsByAccount(db, accountId, limit);
    },
    async countGranted(accountId) {
      return countRegistrationGrants(db, accountId);
    },
    async countActive(accountId) {
      const row = db
        .prepare(
          `
            SELECT COUNT(*) as count
            FROM ticket_ledger
            WHERE account_id = ?
              AND is_active = 1
          `
        )
        .get(accountId) as { count: number };
      return row.count;
    },
    async consumeOldestActive(accountId, scenarioId) {
      return consumeOldestActiveTicket(db, accountId, scenarioId);
    },
    async getById(id) {
      return getTicketById(db, id);
    },
    async revokeById(id) {
      db.prepare(
        `
          UPDATE ticket_ledger
          SET is_active = 0,
              revoked_at = ?
          WHERE id = ? AND is_active = 1
        `
      ).run(nowIso(), id);
    },
    async revokeActiveBatch(accountId, count) {
      return revokeActiveTicketBatch(db, accountId, count);
    },
  };
}

function createBillingFulfillmentStore(
  db: Database.Database
): BillingFulfillmentStore {
  return {
    async createIfAbsent(input) {
      const id = uid("billf_");
      const createdAt = nowIso();
      const result = db
        .prepare(
          `
            INSERT OR IGNORE INTO billing_fulfillment
            (id, stripe_session_id, account_id, ticket_count, created_at)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          input.stripeSessionId,
          input.accountId,
          input.ticketCount,
          createdAt
        );
      return result.changes > 0;
    },
  };
}

type TableInfoRow = {
  name: string;
};

function assertSchemaCompatibility(db: Database.Database): void {
  const requiredColumns: Record<string, string[]> = {
    account: [
      "id",
      "email",
      "password_hash",
      "username",
      "role",
      "email_verified",
      "stripe_customer_id",
      "created_at",
    ],
    oauth_account: ["id", "account_id", "provider", "provider_account_id"],
    scenario: [
      "id",
      "title",
      "description",
      "base_prompt",
      "challenge_prompt",
      "documents_prompt",
      "rubric_prompt",
    ],
    persona: [
      "id",
      "scenario_id",
      "character_prompt",
      "voice_code",
      "doc_tool_enabled",
    ],
    result: ["id", "account_id", "scenario_id", "summary", "evaluation"],
    setting: ["key", "value", "updated_at"],
    ticket_ledger: [
      "id",
      "account_id",
      "type",
      "is_active",
      "consumed_at",
      "consumed_scenario_id",
      "revoked_at",
      "created_at",
    ],
    billing_fulfillment: [
      "id",
      "stripe_session_id",
      "account_id",
      "ticket_count",
      "created_at",
    ],
  };

  for (const [table, required] of Object.entries(requiredColumns)) {
    const rows = db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<TableInfoRow>;
    const available = new Set(rows.map((row) => row.name));
    const missing = required.filter((column) => !available.has(column));
    if (missing.length === 0) continue;
    throw new Error(
      [
        `SQLite schema mismatch on table '${table}'.`,
        `Missing columns: ${missing.join(", ")}.`,
        "Back up the current database and run a forward migration before restarting.",
      ].join(" ")
    );
  }
}

function migrate(db: Database.Database): void {
  createBaseTables(db);
  migrateAccountTable(db);
  migrateScenarioTable(db);
  migrateTicketLedgerTable(db);
  migrateBillingFulfillmentTable(db);
  seedTicketsForPlayers(db);
}

function createBaseTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      email_verified TEXT,
      stripe_customer_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      UNIQUE(provider, provider_account_id)
    );

    CREATE TABLE IF NOT EXISTS scenario (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      base_prompt TEXT NOT NULL,
      challenge_prompt TEXT NOT NULL,
      documents_prompt TEXT NOT NULL,
      rubric_prompt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persona (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
      character_prompt TEXT NOT NULL,
      voice_code TEXT NOT NULL,
      doc_tool_enabled INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS result (
      id TEXT PRIMARY KEY,
      account_id TEXT REFERENCES account(id) ON DELETE SET NULL,
      scenario_id TEXT NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      evaluation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      consumed_at TEXT,
      consumed_scenario_id TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_fulfillment (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      ticket_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function migrateAccountTable(db: Database.Database): void {
  if (!tableHasColumn(db, "account", "email_verified")) {
    db.exec("ALTER TABLE account ADD COLUMN email_verified TEXT;");
  }
  if (!tableHasColumn(db, "account", "created_at")) {
    db.exec("ALTER TABLE account ADD COLUMN created_at TEXT;");
  }
  if (!tableHasColumn(db, "account", "stripe_customer_id")) {
    db.exec("ALTER TABLE account ADD COLUMN stripe_customer_id TEXT;");
  }
  db.prepare("UPDATE account SET created_at = ? WHERE created_at IS NULL").run(
    nowIso()
  );
  if (columnIsNotNull(db, "account", "password_hash")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS account_next (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        email_verified TEXT,
        stripe_customer_id TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO account_next (id, email, password_hash, username, role, email_verified, stripe_customer_id, created_at)
      SELECT id, email, password_hash, username, role, email_verified, stripe_customer_id, created_at FROM account;
      DROP TABLE account;
      ALTER TABLE account_next RENAME TO account;
      PRAGMA foreign_keys = ON;
    `);
  }
}

function migrateScenarioTable(db: Database.Database): void {
  if (!tableHasColumn(db, "scenario", "title")) {
    db.exec("ALTER TABLE scenario ADD COLUMN title TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "scenario", "description")) {
    db.exec(
      "ALTER TABLE scenario ADD COLUMN description TEXT NOT NULL DEFAULT '';"
    );
  }
}

function migrateTicketLedgerTable(db: Database.Database): void {
  if (!tableHasColumn(db, "ticket_ledger", "is_active")) {
    db.exec("ALTER TABLE ticket_ledger ADD COLUMN is_active INTEGER;");
    db.exec("UPDATE ticket_ledger SET is_active = 1 WHERE is_active IS NULL;");
  }
  if (!tableHasColumn(db, "ticket_ledger", "consumed_at")) {
    db.exec("ALTER TABLE ticket_ledger ADD COLUMN consumed_at TEXT;");
  }
  if (!tableHasColumn(db, "ticket_ledger", "consumed_scenario_id")) {
    db.exec("ALTER TABLE ticket_ledger ADD COLUMN consumed_scenario_id TEXT;");
  }
  if (!tableHasColumn(db, "ticket_ledger", "revoked_at")) {
    db.prepare("ALTER TABLE ticket_ledger ADD COLUMN revoked_at TEXT").run();
  }
}

function migrateBillingFulfillmentTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_fulfillment (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      ticket_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedTicketsForPlayers(db: Database.Database): void {
  const players = db
    .prepare(
      `
        SELECT id
        FROM account
        WHERE role = 'player'
          AND NOT EXISTS (
            SELECT 1 FROM ticket_ledger ledger WHERE ledger.account_id = account.id
          )
      `
    )
    .all() as Array<{ id: string }>;
  for (const player of players) {
    ensureRegistrationGrants(db, player.id, TICKET_INITIAL_GRANT_COUNT);
  }
}

function tableHasColumn(
  db: Database.Database,
  table: string,
  column: string
): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
}

function columnIsNotNull(
  db: Database.Database,
  table: string,
  column: string
): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const target = rows.find((row) => row.name === column);
  return target?.notnull === 1;
}

function seedScenarioIfNeeded(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM scenario").get() as {
    count: number;
  };
  if (count.count > 0) return;

  const scenario = buildDemoScenario();
  db.prepare(
    `
      INSERT INTO scenario (id, base_prompt, challenge_prompt, documents_prompt, rubric_prompt)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(
    scenario.id,
    scenario.basePrompt,
    scenario.challengePrompt,
    scenario.documentsPrompt,
    scenario.rubricPrompt
  );

  const stmt = db.prepare(
    `
      INSERT INTO persona (id, scenario_id, character_prompt, voice_code, doc_tool_enabled)
      VALUES (?, ?, ?, ?, ?)
    `
  );
  for (const persona of buildDemoPersonas(scenario.id)) {
    stmt.run(
      persona.id,
      persona.scenarioId,
      persona.characterPrompt,
      persona.voiceCode,
      persona.docToolEnabled ? 1 : 0
    );
  }
}
