"use client";

import type { VoiceClientTransport } from "@/lib/providers";
import { OpenAIVoiceClientTransport } from "@/lib/adapters/openai/voice-client";

export function createVoiceTransport(): VoiceClientTransport {
  return new OpenAIVoiceClientTransport();
}
