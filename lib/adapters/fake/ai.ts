import type {
  AIProvider,
  DocumentGenerationInput,
  SessionEvaluationInput,
  SetupInput,
} from "@/lib/providers";
import type { ScoreResult } from "@/lib/prompts/score";
import type { RelationToRootCause, SetupResponse } from "@/lib/types";

export class FakeAIProvider implements AIProvider {
  async generateSetup(input: SetupInput): Promise<SetupResponse> {
    const { scenario, personas } = input;
    return {
      project: {
        scenarioId: scenario.id,
        title: scenario.title || "サンプルシナリオ（fake）",
        situation: scenario.description || "（fake）状況の説明",
        rootCause: "（fake）真因は challenge_prompt を参照",
        rubric: scenario.rubricPrompt,
      },
      briefing: {
        overview: scenario.description || "（fake）概要",
        trouble: "（fake）発端のメッセージが届いています。",
      },
      documents: [
        {
          title: "資料（ダミー）",
          body: "## 概要\n- fake adapter のサンプル資料です。",
          kind: "doc",
        },
      ],
      stakeholders: personas.map((persona, i) => {
        const relation: RelationToRootCause =
          i === 0
            ? "unaware"
            : i === personas.length - 1
              ? "hiding"
              : "partial";
        return {
          role: `登場人物${i + 1}`,
          name: `テスト太郎${i + 1}`,
          company: "（fake）所属",
          relationToPlayer: "（fake）あなたの同僚",
          situation: "（fake）この人物視点の状況",
          relationToRootCause: relation,
          persona: persona.characterPrompt,
          goal: "（fake）目的",
          moodStart: 5,
          openingInstruction: "（fake）軽く切り出す",
          voiceCode: persona.voiceCode,
          docToolEnabled: persona.docToolEnabled,
        };
      }),
    };
  }

  async generateDocument(_input: DocumentGenerationInput) {
    return {
      title: "作業メモ（ダミー）",
      body: "## 現状\n- fakeAIProvider で生成したサンプルです。",
    };
  }

  async evaluateSession(_input: SessionEvaluationInput): Promise<ScoreResult> {
    return {
      score: 52,
      headline: "要点を詰め切れず、調整が後手に回った",
      good: ["複数の関係者に接触し、情報収集を試みた"],
      improvements: ["仮説を先に立て、裏取り対象を絞るべきだった"],
      comment: "情報収集の姿勢は見えましたが、絞り込みが遅れました。",
    };
  }
}
