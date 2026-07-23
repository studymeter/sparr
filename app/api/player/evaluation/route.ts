import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getPrincipal, requireAuthenticated } from "@/lib/api/principal";
import { consumeTicket, InsufficientTicketsError } from "@/lib/tickets";
import type { CallLogs, Project, Stakeholder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  project: Project;
  stakeholders: Stakeholder[];
  callLogs: CallLogs;
};

// The play ticket is consumed here, once the score is actually ready to show
// — not at setup — so a failed evaluation never costs the player a ticket.
async function consumePlayerTicketOnScore(
  playerId: string,
  scenarioId: string
): Promise<void> {
  const store = await providers.getStore();
  try {
    await consumeTicket(store, playerId, scenarioId);
  } catch (err) {
    if (!(err instanceof InsufficientTicketsError)) throw err;
    console.warn(
      "[player/evaluate] ticket consumption skipped (insufficient tickets):",
      playerId
    );
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    // Scores the session via the AI provider (OpenAI cost) — gate anonymous
    // callers unless the deployment runs in anonymous mode.
    const authError = requireAuthenticated(principal);
    if (authError) return authError;

    const body = (await req.json()) as Body;
    if (!body.project || !body.stakeholders?.length) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const data = await providers.ai.evaluateSession(body);

    if (principal.role === "player" && typeof data?.score === "number") {
      await consumePlayerTicketOnScore(principal.id, body.project.scenarioId);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[player/evaluate] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
