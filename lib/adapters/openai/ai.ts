import type {
  AIProvider,
  DocumentGenerationInput,
  DocumentGenerationResult,
  SessionEvaluationInput,
  SetupInput,
} from "@/lib/providers";
import type { SetupResponse } from "@/lib/types";
import type { ScoreResult } from "@/lib/prompts/score";
import { SETUP_SYSTEM_PROMPT, buildSetupUserPrompt } from "@/lib/prompts/setup";
import {
  buildDocumentSystemPrompt,
  buildDocumentUserPrompt,
} from "@/lib/prompts/document";
import { buildOverallPrompt } from "@/lib/prompts/score";

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY が設定されていません（サーバ側）");
  }
  return key;
}

function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL || "gpt-4o";
}

export class OpenAIAIProvider implements AIProvider {
  async generateSetup(input: SetupInput): Promise<SetupResponse> {
    const { scenario, personas, seed } = input;
    const completion = await this.complete({
      messages: [
        { role: "system", content: SETUP_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSetupUserPrompt(scenario, personas, seed),
        },
      ],
      json: true,
      temperature: 1,
      maxTokens: 8000,
    });
    const raw = JSON.parse(completion) as {
      project: { title: string; situation: string; rootCause: string };
      briefing: SetupResponse["briefing"];
      documents: SetupResponse["documents"];
      stakeholders: Array<
        Omit<
          SetupResponse["stakeholders"][number],
          "voiceCode" | "docToolEnabled"
        >
      >;
    };
    // Server attaches non-AI fields: scenarioId/rubric from the scenario,
    // voiceCode/docToolEnabled from each persona (matched by output order).
    return {
      project: {
        scenarioId: scenario.id,
        title: raw.project.title,
        situation: raw.project.situation,
        rootCause: raw.project.rootCause,
        rubric: scenario.rubricPrompt,
      },
      briefing: raw.briefing,
      documents: raw.documents,
      stakeholders: raw.stakeholders.map((stakeholder, i) => ({
        ...stakeholder,
        voiceCode: personas[i]?.voiceCode ?? "alloy",
        docToolEnabled: personas[i]?.docToolEnabled ?? false,
      })),
    };
  }

  async generateDocument(
    input: DocumentGenerationInput
  ): Promise<DocumentGenerationResult> {
    const { project, stakeholders, request } = input;
    const devMember = stakeholders.find(
      (stakeholder) => stakeholder.role === "dev_member"
    );
    if (!devMember) {
      throw new Error("開発メンバーが見つかりません");
    }
    const completion = await this.complete({
      messages: [
        {
          role: "system",
          content: buildDocumentSystemPrompt(devMember, project),
        },
        {
          role: "user",
          content: buildDocumentUserPrompt(
            request || "現状の進捗と課題をまとめてください"
          ),
        },
      ],
      json: true,
      maxTokens: 2500,
    });
    return extractDoc(completion);
  }

  async evaluateSession(input: SessionEvaluationInput): Promise<ScoreResult> {
    const { project, stakeholders, callLogs } = input;
    const blocks: string[] = [];
    for (const stakeholder of stakeholders) {
      const log = callLogs?.[stakeholder.id];
      if (!log || log.length === 0) continue;
      const role =
        stakeholder.role === "user_dept"
          ? "ユーザー部門"
          : stakeholder.role === "manager"
            ? "上司"
            : "開発メンバー";
      const lines = log
        .filter((turn) => turn.text?.trim())
        .map(
          (turn) =>
            `${turn.role === "user" ? "PM" : stakeholder.name}: ${turn.text.trim()}`
        )
        .join("\n");
      if (lines) {
        blocks.push(`## ${stakeholder.name}（${role}）とのコール\n${lines}`);
      }
    }

    const convo =
      blocks.length > 0
        ? blocks.join("\n\n")
        : "(誰とも実質的に会話していない)";
    const completion = await this.complete({
      messages: [
        { role: "system", content: buildOverallPrompt(project, stakeholders) },
        {
          role: "user",
          content: `# 一日のやり取り\n${convo}\n\n上記を総合評価し、JSONのみで返してください。`,
        },
      ],
      json: true,
      maxTokens: 1600,
    });
    return parseScoreResult(completion);
  }

  private async complete(req: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    json?: boolean;
    maxTokens?: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      model: textModel(),
      messages: req.messages,
      temperature: req.temperature ?? 1,
    };
    if (req.json) {
      body.response_format = { type: "json_object" };
    }
    if (req.maxTokens) {
      body.max_completion_tokens = req.maxTokens;
    }

    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI chat error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI chat: 応答が空です");
    }
    return content;
  }
}

function parseJsonLenient(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(stripped) as Record<string, unknown>;
  }
}

function parseScoreResult(raw: string): ScoreResult {
  const parsed = parseJsonLenient(raw);
  return {
    score: Number(parsed.score ?? 0),
    headline: String(parsed.headline ?? ""),
    good: Array.isArray(parsed.good)
      ? parsed.good.map((item) => String(item))
      : [],
    improvements: Array.isArray(parsed.improvements)
      ? parsed.improvements.map((item) => String(item))
      : [],
    comment: String(parsed.comment ?? ""),
  };
}

function docFromJson(text: string): { title: string; body: string } | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.body === "string" && parsed.body.trim()) {
      return {
        title: String(parsed.title || "作業メモ"),
        body: unescapeIfNeeded(parsed.body),
      };
    }
  } catch {
    // continue fallback
  }
  return null;
}

function docFromBodyField(
  text: string
): { title: string; body: string } | null {
  const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]*?)"\s*}?\s*$/);
  if (!bodyMatch) return null;
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  return {
    title: titleMatch ? titleMatch[1] : "作業メモ",
    body: unescapeIfNeeded(bodyMatch[1]),
  };
}

function extractDoc(raw: string): { title: string; body: string } {
  let text = (raw || "").trim();
  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const fromJson = docFromJson(text);
  if (fromJson) return fromJson;

  const fromBodyField = docFromBodyField(text);
  if (fromBodyField) return fromBodyField;

  if (text.startsWith("{") || text.startsWith("[")) {
    text = text.replace(/^[{\[]/, "").replace(/[}\]]$/, "");
  }
  return { title: "作業メモ", body: text };
}

function unescapeIfNeeded(text: string): string {
  if (text.includes("\\n") || text.includes('\\"') || text.includes("\\t")) {
    return text
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return text;
}
