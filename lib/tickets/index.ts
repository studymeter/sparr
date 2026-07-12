import {
  TICKET_GRANT_INTERVAL_MS,
  TICKET_INITIAL_GRANT_COUNT,
} from "@/lib/constants";
import type { Store, TicketLedger, TicketLedgerType } from "@/lib/providers";

const GRANT_TYPES: TicketLedgerType[] = ["registration_grant", "monthly_grant"];
const DAY_MS = 24 * 60 * 60 * 1000;
const GRANT_INTERVAL_DAYS = Math.floor(TICKET_GRANT_INTERVAL_MS / DAY_MS);
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export class InsufficientTicketsError extends Error {
  constructor() {
    super("insufficient_tickets");
  }
}

function ensureDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function jstDaySerial(value: Date): number {
  return Math.floor((value.getTime() + JST_OFFSET_MS) / DAY_MS);
}

function jstMidnightIsoFromSerial(daySerial: number): string {
  return new Date(daySerial * DAY_MS - JST_OFFSET_MS).toISOString();
}

export function getNextGrantAt(createdAt: string): string {
  const createdSerial = jstDaySerial(ensureDate(createdAt));
  const todaySerial = jstDaySerial(new Date());
  const elapsedDays = Math.max(0, todaySerial - createdSerial);
  const elapsedCycles = Math.floor(elapsedDays / GRANT_INTERVAL_DAYS);
  const nextSerial = createdSerial + (elapsedCycles + 1) * GRANT_INTERVAL_DAYS;
  return jstMidnightIsoFromSerial(nextSerial);
}

export async function syncTicketGrants(
  store: Store,
  accountId: string
): Promise<void> {
  const account = await store.accounts.get(accountId);
  if (!account) throw new Error("account_not_found");

  const createdSerial = jstDaySerial(ensureDate(account.createdAt));
  const todaySerial = jstDaySerial(new Date());
  const elapsedDays = Math.max(0, todaySerial - createdSerial);
  const grantsOwed =
    TICKET_INITIAL_GRANT_COUNT + Math.floor(elapsedDays / GRANT_INTERVAL_DAYS);
  const grantsIssued = await store.ticketLedger.countGranted(accountId);
  const toIssue = Math.max(0, grantsOwed - grantsIssued);
  if (toIssue === 0) return;

  let registrationToIssue = 0;
  if (grantsIssued < TICKET_INITIAL_GRANT_COUNT) {
    registrationToIssue = Math.min(
      TICKET_INITIAL_GRANT_COUNT - grantsIssued,
      toIssue
    );
  }
  if (registrationToIssue > 0) {
    await store.ticketLedger.createBatch(
      accountId,
      "registration_grant",
      registrationToIssue
    );
  }
  const monthlyToIssue = toIssue - registrationToIssue;
  if (monthlyToIssue > 0) {
    await store.ticketLedger.createBatch(
      accountId,
      "monthly_grant",
      monthlyToIssue
    );
  }
}

export async function getTicketSnapshot(
  store: Store,
  accountId: string
): Promise<{
  balance: number;
  nextGrantAt: string;
  ledger: TicketLedger[];
}> {
  await syncTicketGrants(store, accountId);
  const account = await store.accounts.get(accountId);
  if (!account) throw new Error("account_not_found");
  const [balance, ledger] = await Promise.all([
    store.ticketLedger.countActive(accountId),
    store.ticketLedger.listByAccount(accountId, 20),
  ]);
  return {
    balance,
    nextGrantAt: getNextGrantAt(account.createdAt),
    ledger,
  };
}

export async function consumeTicket(
  store: Store,
  accountId: string,
  scenarioId: string
): Promise<void> {
  await syncTicketGrants(store, accountId);
  const current = await store.ticketLedger.countActive(accountId);
  if (current < 1) throw new InsufficientTicketsError();
  const consumed = await store.ticketLedger.consumeOldestActive(
    accountId,
    scenarioId
  );
  if (!consumed) throw new InsufficientTicketsError();
}

export { GRANT_TYPES };
