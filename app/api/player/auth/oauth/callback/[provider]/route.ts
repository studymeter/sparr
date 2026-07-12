import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy vanity URL — forwards query to the Auth.js callback handler. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const target = new URL(req.url);
  target.pathname = `/api/auth/callback/${provider}`;
  return NextResponse.redirect(target);
}
