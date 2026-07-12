import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { uid } from "@/lib/id";
import { providers } from "@/lib/composition";
import { syncTicketGrants } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateBody = {
  email?: string;
  credential?: string;
  username?: string;
  role?: "player" | "admin";
};

export async function GET(req: Request) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const searchQuery = url.searchParams.get("q");
    const store = await providers.getStore();
    const accounts = await store.accounts.list({
      role:
        role === "player" || role === "admin"
          ? (role as "player" | "admin")
          : undefined,
      // eslint-disable-next-line id-length
      q: searchQuery || undefined,
    });
    return NextResponse.json(accounts);
  } catch (err) {
    console.error("[admin/users:get] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// eslint-disable-next-line complexity
export async function POST(req: Request) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const body = (await req.json()) as CreateBody;
    if (!body.email || !body.credential || !body.role) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (body.credential.length < 8) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const email = body.email.toLowerCase();
    const store = await providers.getStore();
    const existing = await store.accounts.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(body.credential, 12);
    const username = body.username?.trim() || email.split("@")[0] || "player";
    const account = await store.accounts.create({
      id: uid("acct_"),
      email,
      username,
      role: body.role,
      passwordHash,
      emailVerified: null,
    });
    if (account.role === "player") {
      await syncTicketGrants(store, account.id);
    }
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    console.error("[admin/users:post] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
