import { NextResponse } from "next/server";
import { providers } from "@/lib/composition";
import type { Principal } from "@/lib/providers";

export async function getPrincipal(): Promise<Principal> {
  return providers.auth.getPrincipal();
}

export function requireAdmin(principal: Principal): NextResponse | null {
  if (principal.role === "anonymous") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (principal.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
