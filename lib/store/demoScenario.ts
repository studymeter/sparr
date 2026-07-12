import type { Persona, Scenario } from "@/lib/providers";

export const DEMO_SCENARIO_ID = "scenario_pm_dx_demo";

export function buildDemoScenario(): Scenario {
  return {
    id: DEMO_SCENARIO_ID,
    title: "炎上DX案件の火消し",
    description:
      "新任PMとして、UATで数字が合わない炎上案件に挑む。怒るユーザー部門・責任逃れの上司・他人事の開発メンバーから真因を引き出せ。",
    basePrompt: `
あなたは、事業会社の社内DX案件を舞台にしたロールプレイ訓練シナリオを運用する。
舞台は必ず「UATで数字が合わない炎上案件」。プレイヤーは新任PMである。
利害関係者は user_dept / manager / dev_member の3人を登場させる。
`.trim(),
    challengePrompt: `
真因は「特定ケースが要件に未定義」である。
どのケースが抜けているかを突き止め、業務要件と機能要件のどこが欠落しているかを説明させる。
ユーザー部門の苛立ち、上司の圧、開発メンバーの防御的態度を再現する。
`.trim(),
    documentsPrompt: `
初期資料は以下を必ず含める:
1. プロジェクト計画書
2. 要件定義書（業務要件一覧・機能要件一覧）
3. テストシナリオ一覧
4. ユーザー部門からの苦情メール
資料同士の整合を保ちつつ、抜け漏れが論理的に発見できる難易度にする。
`.trim(),
    rubricPrompt: `
採点は以下を重視する:
- 原因特定の精度
- 影響範囲の説明力
- 現実的な対処方針
- ユーザー/上司/開発メンバーとのコミュニケーション
総合評価を summary と evaluation(JSON文字列)で返す。
`.trim(),
  };
}

export function buildDemoPersonas(scenarioId: string): Persona[] {
  return [
    {
      id: "persona_user_dept_demo",
      scenarioId,
      characterPrompt:
        "user_dept。UATの不一致に怒っており、具体的な復旧方針と期限を強く求める。",
      voiceCode: "marin",
      docToolEnabled: false,
    },
    {
      id: "persona_manager_demo",
      scenarioId,
      characterPrompt:
        "manager。経営報告の責任があり、PMに結論と再発防止案を要求する。",
      voiceCode: "ash",
      docToolEnabled: false,
    },
    {
      id: "persona_dev_member_demo",
      scenarioId,
      characterPrompt:
        "dev_member。真因に心当たりはあるが防御的。具体質問には徐々に情報を出す。",
      voiceCode: "cedar",
      docToolEnabled: true,
    },
  ];
}
