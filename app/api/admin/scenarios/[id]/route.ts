import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import { uid } from "@/lib/id";
import type { PersonaCreateInput, Scenario } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id } = await params;
    const store = await providers.getStore();
    const scenario = await store.scenarios.get(id);
    if (!scenario) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const personas = await store.personas.findByScenarioId(id);
    return NextResponse.json({ ...scenario, personas });
  } catch (err) {
    console.error("[admin/scenarios/:id] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = (await req.json()) as Partial<Omit<Scenario, "id">> & {
      personas?: PersonaCreateInput[];
    };
    const store = await providers.getStore();
    const scenario = await store.scenarios.update(id, {
      tags: normalizeTags(body.tags),
      basePrompt: body.basePrompt,
      challengePrompt: body.challengePrompt,
      documentsPrompt: body.documentsPrompt,
      rubricPrompt: body.rubricPrompt,
    });
    if (!scenario) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (Array.isArray(body.personas)) {
      const personas = body.personas.map((persona) => ({
        ...persona,
        id: persona.id?.trim() || uid("persona_"),
      }));
      await store.personas.replaceAll(id, personas);
    }
    const personas = await store.personas.findByScenarioId(id);
    return NextResponse.json({ ...scenario, personas });
  } catch (err) {
    console.error("[admin/scenarios/:id:patch] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id } = await params;
    const store = await providers.getStore();
    const scenario = await store.scenarios.get(id);
    if (!scenario) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await store.scenarios.delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/scenarios/:id:delete] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
