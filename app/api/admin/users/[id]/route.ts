import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  username?: string;
  role?: "player" | "admin";
};

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
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const [results, scenarios] = await Promise.all([
      store.results.listByAccount(id),
      store.scenarios.list(),
    ]);
    const scenarioById = new Map(
      scenarios.map((scenario) => [scenario.id, scenario])
    );
    const enrichedResults = results.map((result) => ({
      ...result,
      scenarioTitle:
        scenarioById.get(result.scenarioId)?.title || result.scenarioId,
    }));
    return NextResponse.json({ ...account, results: enrichedResults });
  } catch (err) {
    console.error("[admin/users/:id:get] error:", err);
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
    const body = (await req.json()) as PatchBody;
    if (!body || (body.username === undefined && body.role === undefined)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (body.role !== undefined && id === principal.id) {
      return NextResponse.json(
        { error: "cannot_change_own_role" },
        { status: 400 }
      );
    }

    const store = await providers.getStore();
    const updated = await store.accounts.update(id, {
      username: body.username?.trim(),
      role: body.role,
    });
    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[admin/users/:id:patch] error:", err);
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
    if (id === principal.id) {
      return NextResponse.json(
        { error: "cannot_delete_own_account" },
        { status: 400 }
      );
    }

    const store = await providers.getStore();
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await store.accounts.delete(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[admin/users/:id:delete] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
