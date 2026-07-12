// ギブアップ時の総合評価プロンプト。全コールの履歴をまとめて、プレイヤーの動きを辛口に講評する。
// 評価基準はシナリオの rubric（project.rubric＝SCENARIO の rubric_prompt）に従う（汎用）。

import type { Project, Stakeholder } from "../types";

export function buildOverallPrompt(
  project: Project,
  stakeholders: Stakeholder[]
): string {
  const names = stakeholders
    .map((stakeholder) => `- ${stakeholder.name}（${stakeholder.role}）`)
    .join("\n");

  return `あなたは、ロールプレイ訓練を指導する辛口のコーチ。
プレイヤーが関係者と何度かコールでやり取りした「一連の動き」を総合的に評価する。

# 登場人物
${names}

# この回の真因（評価の文脈・プレイヤーには見えていない情報）
${project.rootCause}

# 採点の指針（このシナリオの評価基準）
${project.rubric}

# 採点の方針
- 上の「採点の指針」に厳密に沿って 0〜100 の整数で採点する。
- 甘くしない。平謝り・抽象論・他責・準備不足・核心に到達しないままの楽観は厳しく減点する。だが人格否定はしない。何が足りなかったかを具体的に、次に活きる形で示す。
- ほとんど何もできていない（誰とも実質的に話していない等）場合は低得点。
- 配点の内訳や項目名は出力に含めない。

# 出力（このJSONオブジェクトのみ。前置き・コードフェンス禁止）
{
  "score": 0〜100の整数,
  "headline": "一言サマリ（例: 「核心の入口までは来たが、詰め切れなかった」）",
  "good": ["良かった点を1〜3個。なければ空配列"],
  "improvements": ["改善すべき点を2〜4個。具体的に"],
  "comment": "総評（3〜5文。辛口に。真因にどこまで迫れたかへの言及を含める）"
}`;
}

export type ScoreResult = {
  score: number;
  headline: string;
  good: string[];
  improvements: string[];
  comment: string;
};
