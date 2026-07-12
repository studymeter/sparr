import type {
  VoiceIssueRequest,
  VoiceProvider,
  VoiceSessionBundle,
} from "@/lib/providers";

// Server-side OpenAI helpers for the realtime (voice) flow. The API key is used
// here (server) only. SDK-free / fetch-based to stay lightweight.
const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY が設定されていません（サーバ側）");
  }
  return key;
}

function realtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
}

// VAD (turn detection). Defaults are too sensitive and cut speech on noise;
// every value is overridable via env.
function turnDetectionConfig(): Record<string, unknown> {
  const type = process.env.OPENAI_VAD_TYPE || "server_vad";
  if (type === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness: process.env.OPENAI_VAD_EAGERNESS || "low",
    };
  }
  const threshold = Number(process.env.OPENAI_VAD_THRESHOLD ?? 0.5);
  const prefixMs = Number(process.env.OPENAI_VAD_PREFIX_MS ?? 300);
  const silenceMs = Number(process.env.OPENAI_VAD_SILENCE_MS ?? 500);
  return {
    type: "server_vad",
    threshold,
    prefix_padding_ms: prefixMs,
    silence_duration_ms: silenceMs,
  };
}

// Input noise reduction. near_field = headset/close mic, far_field = laptop mic.
function noiseReductionType(): string {
  return process.env.OPENAI_NOISE_REDUCTION || "near_field";
}

// Tool the dev_member invokes when asked (by voice) to produce a work document.
const DOC_TOOL = {
  type: "function",
  name: "create_work_document",
  description:
    "PM（通話相手）から、調査結果・課題・データ・進捗などをまとめた作業資料の作成や、原因調査を頼まれたときに呼ぶ。資料は後でPMの案件フォルダに届く。依頼を引き受けると決めたら呼ぶこと。",
  parameters: {
    type: "object",
    properties: {
      request: {
        type: "string",
        description:
          "PMから依頼された内容（何を調べて／何をまとめてほしいか）を簡潔に。",
      },
    },
    required: ["request"],
  },
};

// Build the realtime session config once; used both for the minted token and the
// post-connect session.update (to make sure it is applied).
function buildRealtimeSessionConfig(params: {
  instructions: string;
  voice: string;
  enableDocTool?: boolean;
}): Record<string, unknown> {
  const tools: unknown[] = params.enableDocTool ? [DOC_TOOL] : [];
  return {
    type: "realtime",
    model: realtimeModel(),
    instructions: params.instructions,
    audio: {
      input: {
        turn_detection: turnDetectionConfig(),
        transcription: { model: "whisper-1" },
        noise_reduction: { type: noiseReductionType() },
      },
      output: { voice: params.voice },
    },
    tools,
    tool_choice: tools.length > 0 ? "auto" : "none",
  };
}

// Mint an ephemeral key (GA: POST /v1/realtime/client_secrets).
// Response shape: { value: "ek_...", expires_at, session: {...} }.
async function createRealtimeSession(
  sessionConfig: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${OPENAI_API_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ session: sessionConfig }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI realtime session error ${res.status}: ${errText}`);
  }

  return res.json();
}

export function voiceForRole(role: string): string {
  switch (role) {
    case "user_dept":
      return process.env.OPENAI_VOICE_USER || "marin";
    case "manager":
      return process.env.OPENAI_VOICE_MANAGER || "ash";
    case "dev_member":
      return process.env.OPENAI_VOICE_DEV || "cedar";
    default:
      return process.env.OPENAI_REALTIME_VOICE || "alloy";
  }
}

export class OpenAIVoiceProvider implements VoiceProvider {
  async issue(req: VoiceIssueRequest): Promise<VoiceSessionBundle> {
    const sessionConfig = buildRealtimeSessionConfig({
      instructions: req.instructions,
      voice: req.voice,
      enableDocTool: req.enableDocTool,
    });

    const raw = (await createRealtimeSession(sessionConfig)) as Record<
      string,
      unknown
    >;
    const secretObj =
      (raw["client_secret"] as Record<string, unknown> | undefined) ?? {};
    const value =
      (raw["value"] as string | undefined) ??
      (secretObj["value"] as string | undefined);
    if (!value) {
      throw new Error("realtime session value がありません");
    }

    const { model: _model, ...sessionUpdate } = sessionConfig as {
      model?: string;
    };
    const rawSession =
      (raw["session"] as Record<string, unknown> | undefined) ?? {};
    const currentModel =
      (rawSession["model"] as string | undefined) ?? realtimeModel();
    return { value, model: currentModel, sessionUpdate };
  }
}
