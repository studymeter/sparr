import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingEntry = {
  key: string;
  value: string;
};

type PatchBody =
  | { settings: SettingEntry[] }
  | {
      settings: Record<string, string>;
    };

export async function GET() {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const store = await providers.getStore();
    const settings = await store.settings.list();
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[admin/settings:get] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const body = (await req.json()) as PatchBody;
    if (!body || typeof body !== "object" || !("settings" in body)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const updates = Array.isArray(body.settings)
      ? body.settings
      : Object.entries(body.settings || {}).map(([key, value]) => ({
          key,
          value,
        }));

    if (
      !updates.length ||
      updates.some(
        (entry) =>
          !entry.key ||
          typeof entry.key !== "string" ||
          typeof entry.value !== "string"
      )
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const store = await providers.getStore();
    const saved = await Promise.all(
      updates.map((entry) => store.settings.update(entry.key, entry.value))
    );
    return NextResponse.json(saved);
  } catch (err) {
    console.error("[admin/settings:patch] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
