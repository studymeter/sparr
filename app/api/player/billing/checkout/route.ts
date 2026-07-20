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

type CheckoutBody = {
  quantity?: unknown;
  returnPath?: unknown;
};

async function readRequestBody(
  req: Request
): Promise<{ quantity: number | null; returnPath: "/me" | "/mypage" }> {
  try {
    const body = (await req.json()) as CheckoutBody;
    const quantity = parseTicketQuantity(body?.quantity);
    const returnPath = body?.returnPath === "/mypage" ? "/mypage" : "/me";
    return { quantity, returnPath };
  } catch {
    return { quantity: parseTicketQuantity(undefined), returnPath: "/me" };
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

    const { quantity, returnPath } = await readRequestBody(req);
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
      returnPath,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[player/billing/checkout:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
