import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getTicketSnapshot } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await providers.auth.getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const store = await providers.getStore();
    const snapshot = await getTicketSnapshot(store, principal.id);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[player/tickets:get] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
