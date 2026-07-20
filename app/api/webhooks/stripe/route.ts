import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfillPaidCheckoutSession } from "@/lib/billing";
import { providers } from "@/lib/composition";
import { stripeClient, stripeWebhookSigningValue } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyEvent(payload: string, signature: string): Stripe.Event {
  return stripeClient().webhooks.constructEvent(
    payload,
    signature,
    stripeWebhookSigningValue()
  );
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "signature_missing" }, { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = verifyEvent(payload, signature);
  } catch (err) {
    console.error("[webhooks/stripe:verify] error:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const store = await providers.getStore();
      await fulfillPaidCheckoutSession(
        store,
        event.data.object as Stripe.Checkout.Session
      );
    }
  } catch (err) {
    // NOTE: Keep webhook idempotent and ack the event to prevent retry storms.
    console.error("[webhooks/stripe:process] error:", err);
  }

  return NextResponse.json({ received: true });
}
