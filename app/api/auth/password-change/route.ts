import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  currentCredential?: string;
  newCredential?: string;
};

function errorResponse(err: unknown): NextResponse {
  if (err instanceof Error && err.message === "oauth_managed") {
    return NextResponse.json({ error: "oauth_managed" }, { status: 403 });
  }
  if (
    err instanceof Error &&
    (err.message === "invalid_credential" || err.message === "unauthenticated")
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  console.error("[auth/password-change] error:", err);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const principal = await providers.auth.getPrincipal();
    if (principal.role === "anonymous") {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    if (!body.currentCredential || !body.newCredential) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (body.newCredential.length < 8) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    await providers.auth.changePassword({
      currentCredential: body.currentCredential,
      newCredential: body.newCredential,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
