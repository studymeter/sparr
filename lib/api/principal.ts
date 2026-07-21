import { NextResponse } from "next/server";
import { authAllowsAnonymous, providers } from "@/lib/composition";
import type { Principal } from "@/lib/providers";

export async function getPrincipal(): Promise<Principal> {
  return providers.auth.getPrincipal();
}

// Reject anonymous callers on endpoints that must not be public unless the
// deployment explicitly runs in anonymous mode (AUTH_PROVIDER=none). Choosing a
// real auth provider does not gate a route by itself — the route must check.
// Authenticated players and admins always pass.
export function requireAuthenticated(
  principal: Principal
): NextResponse | null {
  if (principal.role === "anonymous" && !authAllowsAnonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return null;
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
