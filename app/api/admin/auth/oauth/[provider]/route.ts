import type { NextRequest } from "next/server";
import { forwardAuthGet, forwardAuthPost } from "@/lib/api/auth-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/admin";
  return forwardAuthGet(req, ["signin", provider], { callbackUrl });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/admin";
  return forwardAuthPost(req, ["signin", provider], { callbackUrl });
}
