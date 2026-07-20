import type Stripe from "stripe";
import type { Store } from "@/lib/providers";
import { stripeClient } from "@/lib/stripe";

const MAX_TICKETS_PER_PAYMENT = 1000;

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name}_missing`);
  }
  return value;
}

function ticketUnitPriceId(): string {
  return required("STRIPE_PRICE_ID_TICKET");
}

export function parseTicketQuantity(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return 1;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_TICKETS_PER_PAYMENT
  ) {
    return null;
  }
  return value;
}

type CheckoutInput = {
  accountId: string;
  accountEmail: string;
  stripeCustomerId: string | null;
  origin: string;
  quantity: number;
};

export async function createTicketCheckout(
  input: CheckoutInput
): Promise<string> {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price: ticketUnitPriceId(),
      quantity: input.quantity,
    },
  ];
  const session = await stripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    client_reference_id: input.accountId,
    success_url: `${input.origin}/me?billing=success`,
    cancel_url: `${input.origin}/me?billing=cancel`,
    metadata: {
      accountId: input.accountId,
      ticketCount: String(input.quantity),
    },
    customer: input.stripeCustomerId ?? undefined,
    customer_email: input.stripeCustomerId ? undefined : input.accountEmail,
  });
  if (!session.url) throw new Error("checkout_url_missing");
  return session.url;
}

export async function ensureStripeCustomerId(
  store: Store,
  accountId: string,
  accountEmail: string,
  currentCustomerId: string | null
): Promise<string> {
  if (currentCustomerId) return currentCustomerId;
  const customer = await stripeClient().customers.create({
    email: accountEmail,
    metadata: { accountId },
  });
  await store.accounts.update(accountId, { stripeCustomerId: customer.id });
  return customer.id;
}

function parseTicketCount(raw: string | undefined): number | null {
  return parseTicketQuantity(raw);
}

function resolveFulfillmentFields(session: Stripe.Checkout.Session): {
  accountId: string;
  ticketCount: number;
} | null {
  const metadataAccountId = session.metadata?.accountId;
  const accountId = metadataAccountId ?? session.client_reference_id ?? "";
  if (!accountId) return null;
  const ticketCount = parseTicketCount(session.metadata?.ticketCount);
  if (!ticketCount) return null;
  return { accountId, ticketCount };
}

export async function fulfillPaidCheckoutSession(
  store: Store,
  session: Stripe.Checkout.Session
): Promise<"ignored" | "fulfilled" | "duplicate"> {
  if (session.mode !== "payment") return "ignored";
  if (session.payment_status !== "paid") return "ignored";
  const fields = resolveFulfillmentFields(session);
  if (!fields) return "ignored";

  const account = await store.accounts.get(fields.accountId);
  if (!account || account.role !== "player") return "ignored";

  const inserted = await store.billingFulfillments.createIfAbsent({
    stripeSessionId: session.id,
    accountId: fields.accountId,
    ticketCount: fields.ticketCount,
  });
  if (!inserted) return "duplicate";

  await store.ticketLedger.createBatch(
    fields.accountId,
    "purchase",
    fields.ticketCount
  );
  return "fulfilled";
}
