"use client";

import type {
  VoiceClientTransport,
  VoiceEvent,
  VoiceTransportSession,
} from "@/lib/providers";

type RawEvent = {
  type?: string;
  transcript?: string;
  item_id?: string;
  item?: { type?: string; name?: string; call_id?: string; arguments?: string };
  response?: {
    output?: Array<{
      id?: string;
      role?: string;
      content?: Array<{ transcript?: string; text?: string }>;
    }>;
  };
};

type RawEventHandler = (evt: RawEvent) => VoiceEvent | null;

function assistantSpeakingStart(): VoiceEvent {
  return { type: "assistant_speaking", active: true };
}

function assistantSpeakingStop(): VoiceEvent {
  return { type: "assistant_speaking", active: false };
}

function assistantTranscript(evt: RawEvent): VoiceEvent {
  return {
    type: "transcript",
    role: "assistant",
    text: evt.transcript || "",
    itemId: evt.item_id,
  };
}

function userTranscript(evt: RawEvent): VoiceEvent {
  return {
    type: "transcript",
    role: "user",
    text: evt.transcript || "",
    itemId: evt.item_id,
  };
}

function workDocumentToolCall(evt: RawEvent): VoiceEvent | null {
  const item = evt.item;
  if (
    item?.type === "function_call" &&
    item.name === "create_work_document" &&
    item.call_id
  ) {
    return {
      type: "tool_call",
      name: item.name,
      callId: item.call_id,
      argumentsJson: item.arguments || "{}",
    };
  }
  return null;
}

function responseDone(evt: RawEvent): VoiceEvent {
  return {
    type: "response_done",
    assistantOutputs: evt.response?.output ?? [],
  };
}

// NOTE: the Realtime API emits both legacy ("response.audio.*") and current
// ("response.output_audio.*") event names; both forms map to the same handler.
const rawEventHandlers = new Map<string, RawEventHandler>([
  ["response.audio.delta", assistantSpeakingStart],
  ["response.output_audio.delta", assistantSpeakingStart],
  ["response.audio.done", assistantSpeakingStop],
  ["response.output_audio.done", assistantSpeakingStop],
  ["response.audio_transcript.done", assistantTranscript],
  ["response.output_audio_transcript.done", assistantTranscript],
  ["conversation.item.input_audio_transcription.completed", userTranscript],
  ["response.output_item.done", workDocumentToolCall],
  ["response.done", responseDone],
]);

function toVoiceEvent(data: string): VoiceEvent | null {
  let evt: RawEvent;
  try {
    evt = JSON.parse(data) as RawEvent;
  } catch {
    return null;
  }
  const handler = evt.type ? rawEventHandlers.get(evt.type) : undefined;
  return handler ? handler(evt) : null;
}

export class OpenAIVoiceClientTransport implements VoiceClientTransport {
  private pc: RTCPeerConnection | null = null;

  private dc: RTCDataChannel | null = null;

  private stream: MediaStream | null = null;

  private ontrack: ((stream: MediaStream) => void) | null = null;

  async connect(
    session: VoiceTransportSession,
    onEvent: (event: VoiceEvent) => void
  ): Promise<void> {
    this.pc = new RTCPeerConnection();
    this.pc.ontrack = (event) => {
      if (this.ontrack) this.ontrack(event.streams[0]);
    };

    await this.attachMicrophone();

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (event) => {
      const voiceEvent = toVoiceEvent(event.data);
      if (voiceEvent) onEvent(voiceEvent);
    };
    this.dc.onopen = () => {
      this.sendSessionUpdate(session);
    };

    await this.negotiateSdp(this.pc, session);
  }

  private async attachMicrophone(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream.getTracks().forEach((t) => this.pc?.addTrack(t, this.stream!));
  }

  private sendSessionUpdate(session: VoiceTransportSession): void {
    if (!session.sessionUpdate) return;
    this.dc?.send(
      JSON.stringify({
        type: "session.update",
        session: session.sessionUpdate,
      })
    );
  }

  private async negotiateSdp(
    pc: RTCPeerConnection,
    session: VoiceTransportSession
  ): Promise<void> {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      }
    );
    if (!sdpRes.ok) {
      throw new Error("音声接続の確立に失敗しました");
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpRes.text(),
    });
  }

  setAudioElement(el: HTMLAudioElement | null): void {
    this.ontrack = (stream) => {
      if (!el) return;
      el.srcObject = stream;
      el.play().catch(() => {});
    };
  }

  disconnect(): void {
    this.dc?.close();
    this.pc?.getSenders().forEach((sender) => sender.track?.stop());
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.dc = null;
    this.pc = null;
    this.stream = null;
  }

  setMuted(muted: boolean): void {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  requestResponse(): void {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify({ type: "response.create" }));
    }
  }

  sendToolOutput(callId: string, output: string): void {
    if (this.dc?.readyState !== "open") return;
    this.dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output,
        },
      })
    );
    this.requestResponse();
  }
}
