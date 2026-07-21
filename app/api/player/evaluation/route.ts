import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getPrincipal, requireAuthenticated } from "@/lib/api/principal";
import type { CallLogs, Project, Stakeholder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  project: Project;
  stakeholders: Stakeholder[];
  callLogs: CallLogs;
};

export async function POST(req: Request) {
  try {
    // Scores the session via the AI provider (OpenAI cost) — gate anonymous
    // callers unless the deployment runs in anonymous mode.
    const authError = requireAuthenticated(await getPrincipal());
    if (authError) return authError;

    const body = (await req.json()) as Body;
    if (!body.project || !body.stakeholders?.length) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const data = await providers.ai.evaluateSession(body);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[player/evaluate] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
