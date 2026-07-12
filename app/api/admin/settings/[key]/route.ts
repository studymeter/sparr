import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { key } = await params;
    const store = await providers.getStore();
    const setting = await store.settings.get(key);
    if (!setting)
      return NextResponse.json({ error: "not_found" }, { status: 404 });

    await store.settings.delete(key);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[admin/settings/:key:delete] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
