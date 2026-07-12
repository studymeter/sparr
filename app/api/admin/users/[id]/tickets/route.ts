import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import { getTicketSnapshot } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GRANT_COUNT = 1000;

type GrantBody = {
  count?: number;
};

type DeleteBody = {
  count?: number;
};

function isValidCount(count: unknown): count is number {
  return (
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_GRANT_COUNT
  );
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
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (account.role !== "player") {
      return NextResponse.json({ error: "not_a_player" }, { status: 400 });
    }
    const snapshot = await getTicketSnapshot(store, id);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[admin/users/:id/tickets:get] error:", err);
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
    const body = (await req.json()) as GrantBody;
    if (!isValidCount(body.count)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const store = await providers.getStore();
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (account.role !== "player") {
      return NextResponse.json({ error: "not_a_player" }, { status: 400 });
    }

    await store.ticketLedger.createBatch(id, "admin_adjust", body.count);
    const snapshot = await getTicketSnapshot(store, id);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    console.error("[admin/users/:id/tickets:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = (await req.json()) as DeleteBody;
    if (!isValidCount(body.count)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const store = await providers.getStore();
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (account.role !== "player") {
      return NextResponse.json({ error: "not_a_player" }, { status: 400 });
    }

    const deletedCount = await store.ticketLedger.revokeActiveBatch(
      id,
      body.count
    );
    const snapshot = await getTicketSnapshot(store, id);
    return NextResponse.json({ ...snapshot, deletedCount });
  } catch (err) {
    console.error("[admin/users/:id/tickets:delete] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
