import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
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
