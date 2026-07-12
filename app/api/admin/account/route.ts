import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  username?: string;
};

export async function GET() {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const store = await providers.getStore();
    const account = await store.accounts.get(principal.id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(account);
  } catch (err) {
    console.error("[admin/account:get] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const body = (await req.json()) as PatchBody;
    if (
      body.username !== undefined &&
      (typeof body.username !== "string" || !body.username.trim())
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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
    console.error("[admin/account:patch] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
