import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { uid } from "@/lib/id";
import type { ScoreResult } from "@/lib/prompts/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = ScoreResult & {
  scenarioId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (
      typeof body.score !== "number" ||
      typeof body.headline !== "string" ||
      !Array.isArray(body.good) ||
      !Array.isArray(body.improvements) ||
      typeof body.comment !== "string"
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const principal = await providers.auth.getPrincipal();
    const store = await providers.getStore();
    const saved = await store.results.create({
      id: uid("result_"),
      accountId: principal.role === "anonymous" ? null : principal.id,
      scenarioId: body.scenarioId || "scenario_runtime",
      summary: `${body.headline}\n${body.comment}`,
      evaluation: JSON.stringify({
        score: body.score,
        headline: body.headline,
        good: body.good,
        improvements: body.improvements,
        comment: body.comment,
      }),
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error("[player/results:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const principal = await providers.auth.getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json([], { status: 200 });
    }
    const store = await providers.getStore();
    const rows = await store.results.listByAccount(principal.id);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[player/results] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
