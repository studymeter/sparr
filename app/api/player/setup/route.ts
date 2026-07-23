import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { requireAuthenticated } from "@/lib/api/principal";
import { getTicketSnapshot } from "@/lib/tickets";
import type { Store } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  scenarioId?: string;
  seed?: string;
};

// Ticket consumption now happens on successful evaluation (see
// app/api/player/evaluation/route.ts), not at setup. Setup only gates on
// having a ticket available, without consuming it yet.
async function requirePlayerTicket(
  store: Store,
  playerId: string
): Promise<NextResponse | null> {
  const { balance } = await getTicketSnapshot(store, playerId);
  if (balance < 1) {
    return NextResponse.json(
      { error: "insufficient_tickets" },
      { status: 402 }
    );
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.scenarioId) {
      return NextResponse.json(
        { error: "scenarioId_required" },
        { status: 400 }
      );
    }
    const store = await providers.getStore();
    const principal = await providers.auth.getPrincipal();
    // Generating a setup calls the AI provider (OpenAI cost) — gate anonymous
    // callers unless the deployment runs in anonymous mode.
    const authError = requireAuthenticated(principal);
    if (authError) return authError;
    if (principal.role === "player") {
      const ticketError = await requirePlayerTicket(store, principal.id);
      if (ticketError) return ticketError;
    }
    const scenario = await store.scenarios.get(body.scenarioId);
    if (!scenario) {
      return NextResponse.json(
        { error: "scenario_not_found" },
        { status: 404 }
      );
    }
    const personas = await store.personas.findByScenarioId(scenario.id);
    const data = await providers.ai.generateSetup({
      scenario,
      personas,
      seed: body.seed,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[player/setup] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
