import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignInBody = { email?: string; credential?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignInBody;
    if (!body.email || !body.credential) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const principal = await providers.auth.signin({
      email: body.email,
      credential: body.credential,
    });
    const store = await providers.getStore();
    const account = await store.accounts.get(principal.id);
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_credential") {
      return NextResponse.json(
        { error: "invalid_credential" },
        { status: 401 }
      );
    }
    console.error("[auth/signin] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
