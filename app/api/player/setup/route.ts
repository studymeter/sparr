import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { requireAuthenticated } from "@/lib/api/principal";
import { consumeTicket, InsufficientTicketsError } from "@/lib/tickets";
import type { Store } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  scenarioId?: string;
  seed?: string;
};

// Consume a play ticket for the player. Returns a 402 response when the
// player has no tickets left, or null when consumption succeeded.
async function consumePlayerTicket(
  store: Store,
  playerId: string,
  scenarioId: string
): Promise<NextResponse | null> {
  try {
    await consumeTicket(store, playerId, scenarioId);
    return null;
  } catch (err) {
    if (err instanceof InsufficientTicketsError) {
      return NextResponse.json(
        { error: "insufficient_tickets" },
        { status: 402 }
      );
    }
    throw err;
  }
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
      const ticketError = await consumePlayerTicket(
        store,
        principal.id,
        body.scenarioId
      );
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
