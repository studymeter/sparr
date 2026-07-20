import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getTicketSnapshot } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  username?: string;
};

export async function GET() {
  try {
    const principal = await providers.auth.getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const store = await providers.getStore();
    const account = await store.accounts.get(principal.id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const oauthAccounts = await store.oauthAccounts.listByAccount(principal.id);
    const signInMethod = oauthAccounts.length > 0 ? "oauth" : "password";
    const tickets = await getTicketSnapshot(store, principal.id);
    return NextResponse.json({
      ...account,
      signInMethod,
      oauthProvider: oauthAccounts[0]?.provider ?? null,
      tickets,
    });
  } catch (err) {
    console.error("[player/account:get] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return PATCH(req);
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as PatchBody;
    if (
      body.username !== undefined &&
      (typeof body.username !== "string" || !body.username.trim())
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const principal = await providers.auth.getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const store = await providers.getStore();
    const account = await store.accounts.update(principal.id, {
      username: body.username !== undefined ? body.username.trim() : undefined,
    });
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(account);
  } catch (err) {
    console.error("[player/account:patch] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
