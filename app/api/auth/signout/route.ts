import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await providers.auth.signout();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/signout] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
