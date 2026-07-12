import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { assembleSystemPrompt } from "@/lib/prompts/assemble";
import type { CallLogs, Doc, Project, Stakeholder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  stakeholderId: string;
  project: Project;
  stakeholders: Stakeholder[];
  documents: Doc[];
  callLogs: CallLogs;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { stakeholderId, project, stakeholders, documents, callLogs } = body;

    if (!stakeholderId || !project || !stakeholders?.length) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const stakeholder = stakeholders.find(
      (candidate) => candidate.id === stakeholderId
    );
    if (!stakeholder) {
      return NextResponse.json({ error: "not_found" }, { status: 400 });
    }

    const instructions = assembleSystemPrompt(
      stakeholder,
      { ...project, documents: documents || [] },
      { callLogs: callLogs || {}, stakeholders }
    );

    const raw = await providers.voice.issue({
      instructions,
      voice: stakeholder.voiceCode,
      enableDocTool: stakeholder.docToolEnabled,
    });
    return NextResponse.json({
      value: raw.value,
      model: raw.model,
      sessionUpdate: raw.sessionUpdate,
    });
  } catch (err) {
    console.error("[player/realtime/session] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
