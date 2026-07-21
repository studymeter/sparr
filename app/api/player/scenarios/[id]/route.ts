import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import { getPrincipal, requireAuthenticated } from "@/lib/api/principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Returns the full scenario incl. prompts — gate anonymous callers unless
    // the deployment runs in anonymous mode.
    const authError = requireAuthenticated(await getPrincipal());
    if (authError) return authError;

    const { id } = await params;
    const store = await providers.getStore();
    const scenario = await store.scenarios.get(id);
    if (!scenario) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const personas = await store.personas.findByScenarioId(id);
    return NextResponse.json({ ...scenario, personas });
  } catch (err) {
    console.error("[player/scenarios/:id] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
