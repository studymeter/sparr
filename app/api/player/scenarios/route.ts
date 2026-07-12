import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await providers.getStore();
    const scenarios = await store.scenarios.list();
    // Selection screen needs only display fields — never ship the prompts to the client.
    return NextResponse.json(
      scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        description: scenario.description,
      }))
    );
  } catch (err) {
    console.error("[player/scenarios] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
