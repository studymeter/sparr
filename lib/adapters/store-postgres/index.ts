import { Pool, type PoolClient } from "pg";
import type {
  Account,
  AccountCreateInput,
  AccountListFilter,
  AccountWithCredential,
  BillingFulfillmentStore,
  OAuthAccount,
  OAuthAccountCreateInput,
  Result,
  ResultCreateInput,
  Scenario,
  ScenarioCreateInput,
  Store,
  TicketLedger,
  TicketLedgerType,
} from "@/lib/providers";
import { uid } from "@/lib/id";
import { TICKET_INITIAL_GRANT_COUNT } from "@/lib/constants";

type Queryable = Pool | PoolClient;

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

export async function createPostgresStore(
  connectionString: string
): Promise<Store> {
  const pool = new Pool({ connectionString });
  await migrate(pool);

  return {
    accounts: createAccountStore(pool),
    oauthAccounts: createOAuthAccountStore(pool),
    scenarios: createScenarioStore(pool),
    personas: createPersonaStore(pool),
    results: createResultStore(pool),
    settings: createSettingStore(pool),
    ticketLedger: createTicketLedgerStore(pool),
    billingFulfillments: createBillingFulfillmentStore(pool),
  };
}

async function insertAccount(
  pool: Pool,
  input: AccountCreateInput
): Promise<Account> {
  const id = input.id || uid("acct_");
  const email = input.email.toLowerCase();
  await pool.query(
    `
      INSERT INTO account (id, email, password_hash, username, role, email_verified, stripe_customer_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      id,
      email,
      input.passwordHash ?? null,
      input.username,
      input.role,
      input.emailVerified ?? null,
      input.stripeCustomerId ?? null,
      input.createdAt ?? nowIso(),
    ]
  );
  const emailVerified = input.emailVerified ?? null;
  const createdAt = input.createdAt ?? nowIso();
  return {
    id,
    email,
    username: input.username,
    role: input.role,
    emailVerified,
    stripeCustomerId: input.stripeCustomerId ?? null,
    createdAt,
  };
}

async function getAccountWithCredential(
  pool: Pool,
  id: string
): Promise<AccountWithCredential | null> {
  const result = await pool.query(
    `
      SELECT id, email, password_hash AS "passwordHash", username, role
           , email_verified AS "emailVerified", stripe_customer_id AS "stripeCustomerId", created_at AS "createdAt"
      FROM account
      WHERE id = $1
    `,
    [id]
  );
  if (!result.rows[0]) return null;
  return result.rows[0] as AccountWithCredential;
}

async function findAccountByEmail(
  pool: Pool,
  email: string
): Promise<AccountWithCredential | null> {
  const result = await pool.query(
    `
      SELECT id, email, password_hash AS "passwordHash", username, role
           , email_verified AS "emailVerified", stripe_customer_id AS "stripeCustomerId", created_at AS "createdAt"
      FROM account
      WHERE email = $1
    `,
    [email.toLowerCase()]
  );
  if (!result.rows[0]) return null;
  return result.rows[0] as AccountWithCredential;
}

async function listAccounts(
  pool: Pool,
  filter?: AccountListFilter
): Promise<Account[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filter?.role) {
    values.push(filter.role);
    clauses.push(`role = $${values.length}`);
  }
  if (filter?.q) {
    values.push(`%${filter.q}%`);
    clauses.push(
      `(email ILIKE $${values.length} OR username ILIKE $${values.length})`
    );
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT id, email, username, role, email_verified AS "emailVerified", stripe_customer_id AS "stripeCustomerId", created_at AS "createdAt" FROM account ${where} ORDER BY email ASC`,
    values
  );
  return result.rows as Account[];
}

function createAccountStore(pool: Pool): Store["accounts"] {
  return {
    create: (input) => insertAccount(pool, input),
    async get(id) {
      const result = await pool.query(
        'SELECT id, email, username, role, email_verified AS "emailVerified", stripe_customer_id AS "stripeCustomerId", created_at AS "createdAt" FROM account WHERE id = $1',
        [id]
      );
      if (!result.rows[0]) return null;
      return result.rows[0] as Account;
    },
    getWithCredential: (id) => getAccountWithCredential(pool, id),
    findByEmail: (email) => findAccountByEmail(pool, email),
    async update(id, patch) {
      const current = await this.getWithCredential(id);
      if (!current) return null;
      const next = {
        ...current,
        ...patch,
        email: patch.email ? patch.email.toLowerCase() : current.email,
      };
      await pool.query(
        `
          UPDATE account
          SET email = $1, username = $2, role = $3, email_verified = $4, stripe_customer_id = $5
          WHERE id = $6
        `,
        [
          next.email,
          next.username,
          next.role,
          next.emailVerified,
          next.stripeCustomerId ?? null,
          id,
        ]
      );
      return toPublicAccount(next);
    },
    async updatePassword(id, passwordHash) {
      await pool.query("UPDATE account SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        id,
      ]);
    },
    async delete(id) {
      await pool.query("DELETE FROM account WHERE id = $1", [id]);
    },
    list: (filter) => listAccounts(pool, filter),
    async count() {
      const result = await pool.query("SELECT COUNT(*) AS count FROM account");
      return Number(result.rows[0].count);
    },
  };
}

function createOAuthAccountStore(pool: Pool): Store["oauthAccounts"] {
  return {
    async create(input: OAuthAccountCreateInput) {
      const id = input.id || uid("oacct_");
      const result = await pool.query(
        `
          INSERT INTO oauth_account (id, account_id, provider, provider_account_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id, account_id AS "accountId", provider, provider_account_id AS "providerAccountId"
        `,
        [id, input.accountId, input.provider, input.providerAccountId]
      );
      return result.rows[0] as OAuthAccount;
    },
    async findByProvider(provider, providerAccountId) {
      const result = await pool.query(
        `
          SELECT id, account_id AS "accountId", provider, provider_account_id AS "providerAccountId"
          FROM oauth_account
          WHERE provider = $1 AND provider_account_id = $2
        `,
        [provider, providerAccountId]
      );
      return (result.rows[0] as OAuthAccount | undefined) || null;
    },
    async listByAccount(accountId) {
      const result = await pool.query(
        `
          SELECT id, account_id AS "accountId", provider, provider_account_id AS "providerAccountId"
          FROM oauth_account
          WHERE account_id = $1
          ORDER BY id ASC
        `,
        [accountId]
      );
      return result.rows as OAuthAccount[];
    },
    async delete(id) {
      await pool.query("DELETE FROM oauth_account WHERE id = $1", [id]);
    },
  };
}

async function insertScenario(
  pool: Pool,
  input: ScenarioCreateInput
): Promise<Scenario> {
  await pool.query(
    `
      INSERT INTO scenario
      (id, title, description, base_prompt, challenge_prompt, documents_prompt, rubric_prompt)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.id,
      input.title,
      input.description,
      input.basePrompt,
      input.challengePrompt,
      input.documentsPrompt,
      input.rubricPrompt,
    ]
  );
  return { ...input };
}

async function listScenarios(pool: Pool): Promise<Scenario[]> {
  const result = await pool.query(
    `
      SELECT id, title, description, base_prompt AS "basePrompt", challenge_prompt AS "challengePrompt",
             documents_prompt AS "documentsPrompt", rubric_prompt AS "rubricPrompt"
      FROM scenario
      ORDER BY id ASC
    `
  );
  return result.rows as Array<{
    id: string;
    title: string;
    description: string;
    basePrompt: string;
    challengePrompt: string;
    documentsPrompt: string;
    rubricPrompt: string;
  }>;
}

function createScenarioStore(pool: Pool): Store["scenarios"] {
  return {
    create: (input) => insertScenario(pool, input),
    async get(id) {
      const result = await pool.query(
        `
          SELECT id, title, description, base_prompt AS "basePrompt", challenge_prompt AS "challengePrompt",
                 documents_prompt AS "documentsPrompt", rubric_prompt AS "rubricPrompt"
          FROM scenario WHERE id = $1
        `,
        [id]
      );
      return (result.rows[0] as (typeof result.rows)[number]) || null;
    },
    async update(id, patch) {
      const current = await this.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      await pool.query(
        `
          UPDATE scenario
          SET title = $1, description = $2, base_prompt = $3, challenge_prompt = $4, documents_prompt = $5, rubric_prompt = $6
          WHERE id = $7
        `,
        [
          next.title,
          next.description,
          next.basePrompt,
          next.challengePrompt,
          next.documentsPrompt,
          next.rubricPrompt,
          id,
        ]
      );
      return next;
    },
    async delete(id) {
      await pool.query("DELETE FROM scenario WHERE id = $1", [id]);
    },
    list: () => listScenarios(pool),
    async count() {
      const result = await pool.query("SELECT COUNT(*) AS count FROM scenario");
      return Number(result.rows[0].count);
    },
  };
}

function createPersonaStore(pool: Pool): Store["personas"] {
  return {
    async create(input) {
      await pool.query(
        `
          INSERT INTO persona (id, scenario_id, character_prompt, voice_code, doc_tool_enabled)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          input.id,
          input.scenarioId,
          input.characterPrompt,
          input.voiceCode,
          input.docToolEnabled,
        ]
      );
      return { ...input };
    },
    async findByScenarioId(scenarioId) {
      const result = await pool.query(
        `
          SELECT id, scenario_id AS "scenarioId", character_prompt AS "characterPrompt",
                 voice_code AS "voiceCode", doc_tool_enabled AS "docToolEnabled"
          FROM persona
          WHERE scenario_id = $1
          ORDER BY id ASC
        `,
        [scenarioId]
      );
      return result.rows as Awaited<ReturnType<typeof this.create>>[];
    },
    async replaceAll(scenarioId, personas) {
      await pool.query("DELETE FROM persona WHERE scenario_id = $1", [
        scenarioId,
      ]);
      for (const persona of personas) {
        await this.create({ ...persona, scenarioId });
      }
      return this.findByScenarioId(scenarioId);
    },
  };
}

async function insertResult(
  pool: Pool,
  input: ResultCreateInput
): Promise<Result> {
  await pool.query(
    `
      INSERT INTO result (id, account_id, scenario_id, summary, evaluation)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      input.id,
      input.accountId,
      input.scenarioId,
      input.summary,
      input.evaluation,
    ]
  );
  return { ...input };
}

async function listResultsByAccount(
  pool: Pool,
  accountId: string
): Promise<Result[]> {
  const result = await pool.query(
    `
      SELECT id, account_id AS "accountId", scenario_id AS "scenarioId", summary, evaluation
      FROM result
      WHERE account_id = $1
      ORDER BY id DESC
    `,
    [accountId]
  );
  return result.rows as Array<{
    id: string;
    accountId: string | null;
    scenarioId: string;
    summary: string;
    evaluation: string;
  }>;
}

async function listRecentResults(pool: Pool, limit: number): Promise<Result[]> {
  const result = await pool.query(
    `
      SELECT id, account_id AS "accountId", scenario_id AS "scenarioId", summary, evaluation
      FROM result
      ORDER BY id DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows as Array<{
    id: string;
    accountId: string | null;
    scenarioId: string;
    summary: string;
    evaluation: string;
  }>;
}

function createResultStore(pool: Pool): Store["results"] {
  return {
    create: (input) => insertResult(pool, input),
    async get(id) {
      const result = await pool.query(
        `
          SELECT id, account_id AS "accountId", scenario_id AS "scenarioId", summary, evaluation
          FROM result
          WHERE id = $1
        `,
        [id]
      );
      return (result.rows[0] as (typeof result.rows)[number]) || null;
    },
    async update(id, patch) {
      const current = await this.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      await pool.query(
        `
          UPDATE result
          SET account_id = $1, scenario_id = $2, summary = $3, evaluation = $4
          WHERE id = $5
        `,
        [next.accountId, next.scenarioId, next.summary, next.evaluation, id]
      );
      return next;
    },
    async delete(id) {
      await pool.query("DELETE FROM result WHERE id = $1", [id]);
    },
    listByAccount: (accountId) => listResultsByAccount(pool, accountId),
    listRecent: (limit) => listRecentResults(pool, limit),
    async count() {
      const result = await pool.query("SELECT COUNT(*) AS count FROM result");
      return Number(result.rows[0].count);
    },
  };
}

function createSettingStore(pool: Pool): Store["settings"] {
  return {
    async create(input) {
      await pool.query(
        `
          INSERT INTO setting (key, value, updated_at)
          VALUES ($1,$2,$3)
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `,
        [input.key, input.value, input.updatedAt || nowIso()]
      );
      return {
        key: input.key,
        value: input.value,
        updatedAt: input.updatedAt || nowIso(),
      };
    },
    async get(key) {
      const result = await pool.query(
        'SELECT key, value, updated_at AS "updatedAt" FROM setting WHERE key = $1',
        [key]
      );
      return (result.rows[0] as (typeof result.rows)[number]) || null;
    },
    async update(key, value) {
      const updatedAt = nowIso();
      await pool.query(
        `
          INSERT INTO setting (key, value, updated_at)
          VALUES ($1,$2,$3)
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `,
        [key, value, updatedAt]
      );
      return { key, value, updatedAt };
    },
    async delete(key) {
      await pool.query("DELETE FROM setting WHERE key = $1", [key]);
    },
    async list() {
      const result = await pool.query(
        'SELECT key, value, updated_at AS "updatedAt" FROM setting ORDER BY key ASC'
      );
      return result.rows;
    },
  };
}

async function createTicketBatch(
  db: Queryable,
  accountId: string,
  type: TicketLedgerType,
  count: number
): Promise<TicketLedger[]> {
  if (count <= 0) return [];
  // Single multi-row INSERT: atomic (no partial grant if the request fails
  // midway) and one round-trip instead of `count`.
  const values: string[] = [];
  const params: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, true, NULL, NULL, NULL, $${base + 4})`
    );
    params.push(uid("tkt_"), accountId, type, nowIso());
  }
  const result = await db.query(
    `
      INSERT INTO ticket_ledger
      (id, account_id, type, is_active, consumed_at, consumed_scenario_id, revoked_at, created_at)
      VALUES ${values.join(", ")}
      RETURNING id, account_id AS "accountId", type, is_active AS "isActive",
                consumed_at AS "consumedAt", consumed_scenario_id AS "consumedScenarioId",
                revoked_at AS "revokedAt", created_at AS "createdAt"
    `,
    params
  );
  return result.rows as TicketLedger[];
}

async function ensureRegistrationGrants(
  pool: Pool,
  accountId: string,
  targetCount: number
): Promise<number> {
  if (targetCount <= 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent ensures for the same account.
    const locked = await client.query(
      `SELECT id FROM account WHERE id = $1 FOR UPDATE`,
      [accountId]
    );
    if ((locked.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      throw new Error("account_not_found");
    }
    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM ticket_ledger
        WHERE account_id = $1
          AND type = 'registration_grant'
      `,
      [accountId]
    );
    const granted = Number(countResult.rows[0].count);
    const toIssue = Math.max(0, targetCount - granted);
    if (toIssue === 0) {
      await client.query("COMMIT");
      return 0;
    }
    await createTicketBatch(client, accountId, "registration_grant", toIssue);
    await client.query("COMMIT");
    return toIssue;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Keep the original error if rollback itself fails.
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listTicketsByAccount(
  pool: Pool,
  accountId: string,
  limit: number
): Promise<TicketLedger[]> {
  const result = await pool.query(
    `
      SELECT id,
             account_id AS "accountId",
             type,
             is_active AS "isActive",
             consumed_at AS "consumedAt",
             consumed_scenario_id AS "consumedScenarioId",
             revoked_at AS "revokedAt",
             created_at AS "createdAt"
      FROM ticket_ledger
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [accountId, limit]
  );
  return result.rows as TicketLedger[];
}

async function consumeOldestActiveTicket(
  pool: Pool,
  accountId: string,
  scenarioId: string
): Promise<TicketLedger | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `
        SELECT id
        FROM ticket_ledger
        WHERE account_id = $1
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `,
      [accountId]
    );
    const targetId = selected.rows[0]?.id as string | undefined;
    if (!targetId) {
      await client.query("COMMIT");
      return null;
    }
    const consumedAt = nowIso();
    const updated = await client.query(
      `
        UPDATE ticket_ledger
        SET is_active = false,
            consumed_at = $1,
            consumed_scenario_id = $2
        WHERE id = $3
        RETURNING id, account_id AS "accountId", type, is_active AS "isActive",
                  consumed_at AS "consumedAt", consumed_scenario_id AS "consumedScenarioId",
                  revoked_at AS "revokedAt", created_at AS "createdAt"
      `,
      [consumedAt, scenarioId, targetId]
    );
    await client.query("COMMIT");
    return updated.rows[0] as TicketLedger;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getTicketById(
  pool: Pool,
  id: string
): Promise<TicketLedger | null> {
  const result = await pool.query(
    `
      SELECT id,
             account_id AS "accountId",
             type,
             is_active AS "isActive",
             consumed_at AS "consumedAt",
             consumed_scenario_id AS "consumedScenarioId",
             revoked_at AS "revokedAt",
             created_at AS "createdAt"
      FROM ticket_ledger
      WHERE id = $1
    `,
    [id]
  );
  return (result.rows[0] as TicketLedger | undefined) ?? null;
}

// Revocation is logical (is_active = false + revoked_at): the row stays in
// the ledger, so registration-grant sync still counts it and never re-issues.
async function revokeTicketById(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `
      UPDATE ticket_ledger
      SET is_active = false,
          revoked_at = $1
      WHERE id = $2 AND is_active = true
    `,
    [nowIso(), id]
  );
}

async function revokeActiveTicketBatch(
  pool: Pool,
  accountId: string,
  count: number
): Promise<number> {
  const result = await pool.query(
    `
      UPDATE ticket_ledger
      SET is_active = false,
          revoked_at = $1
      WHERE id IN (
        SELECT id FROM ticket_ledger
        WHERE account_id = $2 AND is_active = true
        ORDER BY created_at DESC
        LIMIT $3
      )
    `,
    [nowIso(), accountId, count]
  );
  return result.rowCount ?? 0;
}

function createTicketLedgerStore(pool: Pool): Store["ticketLedger"] {
  return {
    createBatch: (accountId, type, count) =>
      createTicketBatch(pool, accountId, type, count),
    ensureRegistrationGrants: (accountId, targetCount) =>
      ensureRegistrationGrants(pool, accountId, targetCount),
    listByAccount: (accountId, limit = 20) =>
      listTicketsByAccount(pool, accountId, limit),
    async countGranted(accountId) {
      const result = await pool.query(
        `
          SELECT COUNT(*) AS count
          FROM ticket_ledger
          WHERE account_id = $1
            AND type = 'registration_grant'
        `,
        [accountId]
      );
      return Number(result.rows[0].count);
    },
    async countActive(accountId) {
      const result = await pool.query(
        `
          SELECT COUNT(*) AS count
          FROM ticket_ledger
          WHERE account_id = $1
            AND is_active = true
        `,
        [accountId]
      );
      return Number(result.rows[0].count);
    },
    consumeOldestActive: (accountId, scenarioId) =>
      consumeOldestActiveTicket(pool, accountId, scenarioId),
    getById: (id) => getTicketById(pool, id),
    revokeById: (id) => revokeTicketById(pool, id),
    revokeActiveBatch: (accountId, count) =>
      revokeActiveTicketBatch(pool, accountId, count),
  };
}

function createBillingFulfillmentStore(pool: Pool): BillingFulfillmentStore {
  return {
    async createIfAbsent(input) {
      const result = await pool.query(
        `
          INSERT INTO billing_fulfillment
          (id, stripe_session_id, account_id, ticket_count, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (stripe_session_id) DO NOTHING
        `,
        [
          uid("billf_"),
          input.stripeSessionId,
          input.accountId,
          input.ticketCount,
          nowIso(),
        ]
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}

async function migrate(pool: Pool): Promise<void> {
  await createTables(pool);
  await applyColumnMigrations(pool);
  await seedRegistrationGrants(pool);
}

async function createTables(pool: Pool): Promise<void> {
  await pool.query(`
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
      doc_tool_enabled BOOLEAN NOT NULL
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
      is_active BOOLEAN NOT NULL,
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

async function applyColumnMigrations(pool: Pool): Promise<void> {
  await pool.query(
    "ALTER TABLE account ADD COLUMN IF NOT EXISTS email_verified TEXT"
  );
  await pool.query(
    "ALTER TABLE account ADD COLUMN IF NOT EXISTS created_at TEXT"
  );
  await pool.query(
    "ALTER TABLE account ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT"
  );
  await pool.query(
    "UPDATE account SET created_at = $1 WHERE created_at IS NULL",
    [nowIso()]
  );
  await pool.query(
    "ALTER TABLE account ALTER COLUMN password_hash DROP NOT NULL"
  );
  await pool.query(
    "ALTER TABLE scenario ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE scenario ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE ticket_ledger ADD COLUMN IF NOT EXISTS is_active BOOLEAN"
  );
  await pool.query(
    "UPDATE ticket_ledger SET is_active = true WHERE is_active IS NULL"
  );
  await pool.query(
    "ALTER TABLE ticket_ledger ALTER COLUMN is_active SET NOT NULL"
  );
  await pool.query(
    "ALTER TABLE ticket_ledger ADD COLUMN IF NOT EXISTS consumed_at TEXT"
  );
  await pool.query(
    "ALTER TABLE ticket_ledger ADD COLUMN IF NOT EXISTS consumed_scenario_id TEXT"
  );
  await pool.query(
    "ALTER TABLE ticket_ledger ADD COLUMN IF NOT EXISTS revoked_at TEXT"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_fulfillment (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      ticket_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

async function seedRegistrationGrants(pool: Pool): Promise<void> {
  const players = await pool.query(
    `
      SELECT account.id
      FROM account
      WHERE account.role = 'player'
        AND NOT EXISTS (
          SELECT 1 FROM ticket_ledger ledger WHERE ledger.account_id = account.id
        )
    `
  );
  for (const row of players.rows as Array<{ id: string }>) {
    await ensureRegistrationGrants(pool, row.id, TICKET_INITIAL_GRANT_COUNT);
  }
}
