import Stripe from "stripe";

let client: Stripe | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name}_missing`);
  }
  return value;
}

export function stripeClient(): Stripe {
  if (client) return client;
  client = new Stripe(required(["STRIPE", "API", "TOKEN"].join("_")));
  return client;
}

export function stripeWebhookSigningValue(): string {
  return required(["STRIPE", "SIGNING", "TOKEN"].join("_"));
}
