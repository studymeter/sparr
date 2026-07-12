import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { syncTicketGrants } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterBody = {
  email?: string;
  credential?: string;
  username?: string;
};

function errorResponse(err: unknown): NextResponse {
  if (err instanceof Error && err.message === "email_already_exists") {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  if (err instanceof Error && err.message === "email_domain_not_allowed") {
    return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });
  }
  console.error("[auth/register] error:", err);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
    if (!body.email || !body.credential) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (body.credential.length < 8) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const principal = await providers.auth.register({
      email: body.email.toLowerCase(),
      credential: body.credential,
      username: body.username?.trim() || undefined,
      role: "player",
    });

    const store = await providers.getStore();
    await syncTicketGrants(store, principal.id);
    const account = await store.accounts.get(principal.id);
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
