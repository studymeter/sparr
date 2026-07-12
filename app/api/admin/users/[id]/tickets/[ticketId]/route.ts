import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import { getTicketSnapshot } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id, ticketId } = await params;
    const store = await providers.getStore();
    const account = await store.accounts.get(id);
    if (!account) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (account.role !== "player") {
      return NextResponse.json({ error: "not_a_player" }, { status: 400 });
    }

    const ticket = await store.ticketLedger.getById(ticketId);
    if (!ticket || ticket.accountId !== id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!ticket.isActive) {
      return NextResponse.json({ error: "already_consumed" }, { status: 400 });
    }

    await store.ticketLedger.revokeById(ticketId);
    const snapshot = await getTicketSnapshot(store, id);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[admin/users/:id/tickets/:ticketId:delete] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
