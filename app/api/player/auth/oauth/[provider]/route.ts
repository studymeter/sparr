import type { NextRequest } from "next/server";
import { forwardAuthGet, forwardAuthPost } from "@/lib/api/auth-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  return forwardAuthGet(req, ["signin", provider]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  return forwardAuthPost(req, ["signin", provider]);
}
