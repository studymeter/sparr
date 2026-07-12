import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import type { Result } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardResult = Result & {
  scenarioTitle: string;
  accountUsername: string | null;
  accountEmail: string | null;
};

type DashboardStats = {
  totalUsers: number;
  totalScenarios: number;
  totalResults: number;
  recentResults: DashboardResult[];
};

export async function GET() {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const store = await providers.getStore();
    const [accounts, scenarios, totalResults, recentResults] =
      await Promise.all([
        store.accounts.list(),
        store.scenarios.list(),
        store.results.count(),
        store.results.listRecent(20),
      ]);

    const accountById = new Map(
      accounts.map((account) => [account.id, account])
    );
    const scenarioById = new Map(
      scenarios.map((scenario) => [scenario.id, scenario])
    );

    const payload: DashboardStats = {
      totalUsers: accounts.length,
      totalScenarios: scenarios.length,
      totalResults,
      recentResults: recentResults.map((result) => {
        const account = result.accountId
          ? accountById.get(result.accountId)
          : undefined;
        return {
          ...result,
          scenarioTitle:
            scenarioById.get(result.scenarioId)?.title || result.scenarioId,
          accountUsername: account?.username || null,
          accountEmail: account?.email ?? null,
        };
      }),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[admin/dashboard] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
