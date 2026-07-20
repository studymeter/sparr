import { TICKET_INITIAL_GRANT_COUNT } from "@/lib/constants";
import type { Store, TicketLedger } from "@/lib/providers";

export class InsufficientTicketsError extends Error {
  constructor() {
    super("insufficient_tickets");
  }
}

export async function syncTicketGrants(
  store: Store,
  accountId: string
): Promise<void> {
  const account = await store.accounts.get(accountId);
  if (!account) throw new Error("account_not_found");

  const grantsIssued = await store.ticketLedger.countGranted(accountId);
  const toIssue = Math.max(0, TICKET_INITIAL_GRANT_COUNT - grantsIssued);
  if (toIssue === 0) return;

  await store.ticketLedger.createBatch(
    accountId,
    "registration_grant",
    toIssue
  );
}

export async function getTicketSnapshot(
  store: Store,
  accountId: string
): Promise<{
  balance: number;
  ledger: TicketLedger[];
}> {
  await syncTicketGrants(store, accountId);
  const [balance, ledger] = await Promise.all([
    store.ticketLedger.countActive(accountId),
    store.ticketLedger.listByAccount(accountId, 20),
  ]);
  return { balance, ledger };
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
