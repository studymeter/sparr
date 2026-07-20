import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/api/principal";
import {
  createTicketCheckout,
  ensureStripeCustomerId,
  parseTicketQuantity,
} from "@/lib/billing";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function readQuantity(req: Request): Promise<number | null> {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || !("quantity" in body)) {
      return parseTicketQuantity(undefined);
    }
    return parseTicketQuantity((body as { quantity: unknown }).quantity);
  } catch {
    return parseTicketQuantity(undefined);
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (principal.role !== "player") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const quantity = await readQuantity(req);
    if (quantity === null) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    }

    const store = await providers.getStore();
    const account = await store.accounts.get(principal.id);
    if (!account) {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }
    if (account.role !== "player") {
      return NextResponse.json({ error: "not_a_player" }, { status: 400 });
    }

    const customerId = await ensureStripeCustomerId(
      store,
      account.id,
      account.email,
      account.stripeCustomerId
    );
    const url = await createTicketCheckout({
      accountId: account.id,
      accountEmail: account.email,
      stripeCustomerId: customerId,
      origin: requestOrigin(req),
      quantity,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[player/billing/checkout:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
