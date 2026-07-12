import { NextResponse } from "next/server";
import { getPrincipal, requireAdmin } from "@/lib/api/principal";
import { providers } from "@/lib/composition";
import type { Result } from "@/lib/providers";
import type { ScoreResult } from "@/lib/prompts/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ResultStore has no listByScenario; scan a large recent window and filter here.
const RESULT_SCAN_LIMIT = 100_000;

type UserStat = {
  accountId: string | null;
  email: string | null;
  username: string | null;
  playCount: number;
  averageScore: number | null;
  bestScore: number | null;
};

function extractScore(evaluation: string): number | null {
  try {
    const parsed = JSON.parse(evaluation) as Partial<ScoreResult>;
    return typeof parsed.score === "number" ? parsed.score : null;
  } catch {
    return null;
  }
}

function average(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

function toUserStat(
  accountId: string | null,
  rows: Result[],
  accountById: Map<string, { email: string; username: string }>
): UserStat {
  const account = accountId ? accountById.get(accountId) : undefined;
  const scores = rows
    .map((row) => extractScore(row.evaluation))
    .filter((score): score is number => score !== null);
  return {
    accountId,
    email: account?.email ?? null,
    username: account?.username || null,
    playCount: rows.length,
    averageScore: average(scores),
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipal();
    const forbidden = requireAdmin(principal);
    if (forbidden) return forbidden;

    const { id } = await params;
    const store = await providers.getStore();
    const scenario = await store.scenarios.get(id);
    if (!scenario) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [allResults, accounts] = await Promise.all([
      store.results.listRecent(RESULT_SCAN_LIMIT),
      store.accounts.list(),
    ]);
    const accountById = new Map(
      accounts.map((account) => [account.id, account])
    );
    const scenarioResults = allResults.filter(
      (result) => result.scenarioId === id
    );

    const resultsByAccount = new Map<string | null, Result[]>();
    for (const result of scenarioResults) {
      const rows = resultsByAccount.get(result.accountId) ?? [];
      rows.push(result);
      resultsByAccount.set(result.accountId, rows);
    }

    const perUser = [...resultsByAccount.entries()]
      .map(([accountId, rows]) => toUserStat(accountId, rows, accountById))
      .sort(
        (left, right) => (right.averageScore ?? -1) - (left.averageScore ?? -1)
      );

    const allScores = scenarioResults
      .map((result) => extractScore(result.evaluation))
      .filter((score): score is number => score !== null);

    return NextResponse.json({
      scenarioId: id,
      totalPlays: scenarioResults.length,
      totalUsers: resultsByAccount.size,
      averageScore: average(allScores),
      perUser,
    });
  } catch (err) {
    console.error("[admin/scenarios/:id/results] error:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
