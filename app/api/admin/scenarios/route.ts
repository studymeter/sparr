import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import { uid } from "@/lib/id";
import type { PersonaCreateInput, ScenarioCreateInput } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export async function GET() {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const store = await providers.getStore();
    const scenarios = await store.scenarios.list();
    return NextResponse.json(
      scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        challengePrompt: scenario.challengePrompt,
        tags: scenario.tags,
      }))
    );
  } catch (err) {
    console.error("[admin/scenarios] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// eslint-disable-next-line complexity
export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const body = (await req.json()) as ScenarioCreateInput & {
      personas?: PersonaCreateInput[];
    };
    if (
      !body.basePrompt ||
      !body.challengePrompt ||
      !body.documentsPrompt ||
      !body.rubricPrompt
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const store = await providers.getStore();
    const scenario = await store.scenarios.create({
      id: body.id?.trim() || uid("scenario_"),
      title: body.title ?? "",
      description: body.description ?? "",
      tags: normalizeTags(body.tags),
      basePrompt: body.basePrompt,
      challengePrompt: body.challengePrompt,
      documentsPrompt: body.documentsPrompt,
      rubricPrompt: body.rubricPrompt,
    });
    if (Array.isArray(body.personas)) {
      const personas = body.personas.map((persona) => ({
        ...persona,
        id: persona.id?.trim() || uid("persona_"),
      }));
      await store.personas.replaceAll(scenario.id, personas);
    }
    return NextResponse.json(scenario, { status: 201 });
  } catch (err) {
    console.error("[admin/scenarios:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
