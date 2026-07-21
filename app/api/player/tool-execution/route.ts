import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getPrincipal, requireAuthenticated } from "@/lib/api/principal";
import type { Project, Stakeholder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  project: Project;
  stakeholders: Stakeholder[];
  request: string;
};

export async function POST(req: Request) {
  try {
    // Generates a document via the AI provider (OpenAI cost) — gate anonymous
    // callers unless the deployment runs in anonymous mode.
    const authError = requireAuthenticated(await getPrincipal());
    if (authError) return authError;

    const body = (await req.json()) as Body;
    if (!body.project || !body.stakeholders?.length) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const data = await providers.ai.generateDocument(body);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[player/document] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
