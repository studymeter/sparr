/**
 * Voice provider contracts.
 *
 * Server-side issuing and client-side transport are both represented here
 * because realtime voice spans server and browser boundaries.
 */
export type VoiceTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type VoiceIssueRequest = {
  instructions: string;
  voice: string;
  enableDocTool?: boolean;
};

export type VoiceSessionBundle = {
  value: string;
  model: string;
  sessionUpdate: Record<string, unknown>;
};

export interface VoiceProvider {
  issue(req: VoiceIssueRequest): Promise<VoiceSessionBundle>;
}

export type VoiceEvent =
  | { type: "assistant_speaking"; active: boolean }
  | {
      type: "transcript";
      role: "user" | "assistant";
      text: string;
      itemId?: string;
    }
  | {
      type: "tool_call";
      name: string;
      callId: string;
      argumentsJson: string;
    }
  | {
      type: "response_done";
      assistantOutputs: Array<{
        id?: string;
        role?: string;
        content?: Array<{ transcript?: string; text?: string }>;
      }>;
    };

export type VoiceTransportSession = {
  ephemeralKey: string;
  model: string;
  sessionUpdate?: Record<string, unknown> | null;
};

export interface VoiceClientTransport {
  connect(
    session: VoiceTransportSession,
    onEvent: (event: VoiceEvent) => void
  ): Promise<void>;
  setAudioElement?(el: HTMLAudioElement | null): void;
  disconnect(): void;
  setMuted(muted: boolean): void;
  requestResponse(): void;
  sendToolOutput(callId: string, output: string): void;
}
