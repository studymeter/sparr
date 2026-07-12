import { providers } from "@/lib/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = providers.auth.handlers;
