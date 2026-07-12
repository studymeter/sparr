"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useGame } from "@/app/store";
import DocumentViewer from "@/components/DocumentViewer";
import { createVoiceTransport } from "@/lib/composition.client";
import type { CallTurn, GameState, Stakeholder } from "@/lib/types";
import type { VoiceEvent } from "@/lib/providers";

type Phase = "incoming" | "connecting" | "live" | "ended" | "error";
type Translate = ReturnType<typeof useTranslations>;
type Transport = ReturnType<typeof createVoiceTransport>;
type PushTurn = (
  role: CallTurn["role"],
  text: string | undefined,
  id?: string
) => void;

type ResponseDoneEvent = Extract<VoiceEvent, { type: "response_done" }>;
type AssistantOutput = NonNullable<
  ResponseDoneEvent["assistantOutputs"]
>[number];

const ROLE_LABEL: Record<string, string> = {
  user_dept: "ユーザー部門",
  manager: "DX推進責任者",
  dev_member: "開発メンバー",
};

const OPENING_RESPONSE_DELAY_MS = 900;
const TOAST_DURATION_MS = 4000;

// Mutable holders shared between the hook, the effect handlers, and the
// module-level call logic. Plain `{ current }` boxes behave like useRef.
type CallController = {
  transport: { current: Transport | null };
  timers: { current: ReturnType<typeof setTimeout>[] };
  transcript: { current: CallTurn[] };
  seenIds: { current: Set<string> };
  ending: { current: boolean };
  requestDoc: { current: (req: string) => void };
  openingDone: { current: boolean };
  muted: { current: boolean };
};

function statusTextFor(phase: Phase, t: Translate): string {
  if (phase === "connecting") return t("connecting");
  if (phase === "live") return t("live");
  if (phase === "error") return t("connectionFailed");
  return "";
}

// The document tool passes a free-form request in JSON args; fall back to a
// default request when the payload is missing or unparseable.
function parseDocRequest(
  argumentsJson: string | undefined,
  fallback: string
): string {
  try {
    const args = JSON.parse(argumentsJson || "{}");
    if (args.request) return String(args.request);
  } catch {
    /* ignore */
  }
  return fallback;
}

function collectAssistantTurns(
  outputs: AssistantOutput[] | undefined,
  pushTurn: PushTurn
): void {
  for (const out of outputs ?? []) {
    if (out.role !== "assistant") continue;
    for (const content of out.content ?? []) {
      pushTurn("assistant", content.transcript || content.text, out.id);
    }
  }
}

function makePushTurn(ctrl: CallController): PushTurn {
  return (role, text, id) => {
    const value = (text || "").trim();
    if (!value) return;
    const key = id ? `${role}:${id}` : `${role}:${value}`;
    if (ctrl.seenIds.current.has(key)) return;
    ctrl.seenIds.current.add(key);
    ctrl.transcript.current.push({ role, text: value });
  };
}

function makeEventHandler(
  ctrl: CallController,
  deps: {
    t: Translate;
    setSpeaking: (active: boolean) => void;
    pushTurn: PushTurn;
  }
): (evt: VoiceEvent) => void {
  const { t, setSpeaking, pushTurn } = deps;
  return (evt) => {
    switch (evt.type) {
      case "assistant_speaking":
        setSpeaking(evt.active);
        break;
      case "transcript":
        pushTurn(evt.role, evt.text, evt.itemId);
        break;
      case "response_done":
        setSpeaking(false);
        if (!ctrl.openingDone.current) {
          ctrl.openingDone.current = true;
          if (!ctrl.muted.current) ctrl.transport.current?.setMuted(false);
        }
        collectAssistantTurns(evt.assistantOutputs, pushTurn);
        break;
      case "tool_call": {
        const request = parseDocRequest(
          evt.argumentsJson,
          t("defaultDocRequest")
        );
        ctrl.requestDoc.current(request);
        ctrl.transport.current?.sendToolOutput(evt.callId, t("docStarted"));
        break;
      }
      default:
        break;
    }
  };
}

function cleanupCall(ctrl: CallController): void {
  ctrl.transport.current?.disconnect();
  ctrl.transport.current = null;
  ctrl.timers.current.forEach(clearTimeout);
  ctrl.timers.current = [];
}

function hangUpCall(
  ctrl: CallController,
  deps: {
    setSpeaking: (active: boolean) => void;
    appendCallLog: (stakeholderId: string, turns: CallTurn[]) => void;
    stakeholderId: string;
    onClose: () => void;
  }
): void {
  if (ctrl.ending.current) return;
  ctrl.ending.current = true;
  cleanupCall(ctrl);
  deps.setSpeaking(false);

  const transcript = ctrl.transcript.current.filter((turn) => turn.text.trim());
  deps.appendCallLog(deps.stakeholderId, transcript);
  deps.onClose();
}

type IssuedSession = {
  ephemeralKey: string;
  model: string;
  sessionUpdate: Record<string, unknown> | null;
};

async function issueSession(
  stakeholderId: string,
  game: GameState,
  t: Translate
): Promise<IssuedSession> {
  const sres = await fetch("/api/player/session-issuance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stakeholderId,
      project: game.project,
      stakeholders: game.stakeholders,
      documents: game.project.documents,
      callLogs: game.callLogs,
    }),
  });
  const session = await sres.json();
  if (!sres.ok) throw new Error(session.error || t("sessionFailed"));
  // The key is either server-normalized (`value`) or in the raw OpenAI payload.
  const ephemeralKey: string | undefined =
    session.value || session.client_secret?.value;
  if (!ephemeralKey) throw new Error(t("noEphemeralKey"));
  return {
    ephemeralKey,
    model: session.model || "gpt-realtime",
    sessionUpdate: session.sessionUpdate ?? null,
  };
}

async function connectCall(
  ctrl: CallController,
  deps: {
    game: GameState;
    stakeholder: Stakeholder;
    t: Translate;
    audioRef: { current: HTMLAudioElement | null };
    setPhase: (phase: Phase) => void;
    setErrMsg: (message: string) => void;
    handleEvent: (evt: VoiceEvent) => void;
  }
): Promise<void> {
  const { game, stakeholder, t, audioRef } = deps;
  const { setPhase, setErrMsg, handleEvent } = deps;
  try {
    const { ephemeralKey, model, sessionUpdate } = await issueSession(
      stakeholder.id,
      game,
      t
    );
    const transport = createVoiceTransport();
    ctrl.transport.current = transport;
    transport.setAudioElement?.(audioRef.current);
    transport.setMuted(true);
    await transport.connect(
      { ephemeralKey, model, sessionUpdate },
      handleEvent
    );
    setPhase("live");
    ctrl.timers.current.push(
      setTimeout(() => transport.requestResponse(), OPENING_RESPONSE_DELAY_MS)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : t("connectionError");
    setErrMsg(message);
    setPhase("error");
    cleanupCall(ctrl);
  }
}

function applyMute(ctrl: CallController, next: boolean): void {
  ctrl.muted.current = next;
  if (ctrl.openingDone.current) ctrl.transport.current?.setMuted(next);
}

function registerTimer(
  ctrl: CallController,
  timer: ReturnType<typeof setTimeout>
): void {
  ctrl.timers.current.push(timer);
}

function bindRequestDoc(ctrl: CallController, fn: (req: string) => void): void {
  ctrl.requestDoc.current = fn;
}

function useCallController(): CallController {
  // useState's lazy initializer builds the mutable holder bundle exactly once.
  const [ctrl] = useState<CallController>(() => ({
    transport: { current: null },
    timers: { current: [] },
    transcript: { current: [] },
    seenIds: { current: new Set() },
    ending: { current: false },
    requestDoc: { current: () => {} },
    openingDone: { current: false },
    muted: { current: false },
  }));
  return ctrl;
}

type CallSessionDeps = {
  game: GameState;
  stakeholder: Stakeholder;
  onClose: () => void;
  t: Translate;
  audioRef: { current: HTMLAudioElement | null };
  appendCallLog: (stakeholderId: string, turns: CallTurn[]) => void;
  setSpeaking: (active: boolean) => void;
  setPhase: (phase: Phase) => void;
  setErrMsg: (message: string) => void;
};

// Owns the transport lifecycle: builds the event handler, connects on mount,
// and hangs up (persisting the transcript) on unmount or user action.
function useCallSession(ctrl: CallController, deps: CallSessionDeps) {
  const { game, stakeholder, onClose, t, audioRef } = deps;
  const { appendCallLog, setSpeaking, setPhase, setErrMsg } = deps;

  const pushTurn = useMemo(() => makePushTurn(ctrl), [ctrl]);
  const handleEvent = useMemo(
    () => makeEventHandler(ctrl, { t, setSpeaking, pushTurn }),
    [ctrl, t, setSpeaking, pushTurn]
  );
  const cleanup = useCallback(() => cleanupCall(ctrl), [ctrl]);
  const hangUp = useCallback(
    () =>
      hangUpCall(ctrl, {
        setSpeaking,
        appendCallLog,
        stakeholderId: stakeholder.id,
        onClose,
      }),
    [ctrl, setSpeaking, appendCallLog, stakeholder.id, onClose]
  );
  const connect = useCallback(
    () =>
      connectCall(ctrl, {
        game,
        stakeholder,
        t,
        audioRef,
        setPhase,
        setErrMsg,
        handleEvent,
      }),
    [ctrl, game, stakeholder, t, audioRef, setPhase, setErrMsg, handleEvent]
  );

  useEffect(() => {
    void connect();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connect, hangUp };
}

// Wires the document-request bridge and its "creating…" toast. The transport's
// tool-call handler invokes the latest requestDoc through ctrl.requestDoc.
function useDocToast(
  ctrl: CallController,
  requestDocument: (req: string) => void,
  t: Translate
): string | null {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      registerTimer(
        ctrl,
        setTimeout(() => setToast(null), TOAST_DURATION_MS)
      );
    },
    [ctrl]
  );

  const requestDoc = useCallback(
    (req: string) => {
      requestDocument(req);
      showToast(t("docCreatingToast"));
    },
    [requestDocument, showToast, t]
  );

  useEffect(() => {
    bindRequestDoc(ctrl, requestDoc);
  });

  return toast;
}

function useVoiceCall({
  game,
  stakeholder,
  onClose,
  t,
  audioRef,
}: {
  game: GameState;
  stakeholder: Stakeholder;
  onClose: () => void;
  t: Translate;
  audioRef: { current: HTMLAudioElement | null };
}) {
  const { appendCallLog, requestDocument } = useGame();
  const ctrl = useCallController();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [, setErrMsg] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const { connect, hangUp } = useCallSession(ctrl, {
    game,
    stakeholder,
    onClose,
    t,
    audioRef,
    appendCallLog,
    setSpeaking,
    setPhase,
    setErrMsg,
  });

  const toast = useDocToast(ctrl, requestDocument, t);

  const toggleMute = useCallback(() => {
    const next = !muted;
    applyMute(ctrl, next);
    setMuted(next);
  }, [muted, ctrl]);

  return {
    phase,
    muted,
    speaking,
    toast,
    showDocs,
    setShowDocs,
    connect,
    hangUp,
    toggleMute,
    statusText: statusTextFor(phase, t),
  };
}

function CallHeader({
  statusText,
  speaking,
  stakeholder,
  t,
}: {
  statusText: string;
  speaking: boolean;
  stakeholder: Stakeholder;
  t: Translate;
}) {
  return (
    <div className={`inc-head role-${stakeholder.role}`}>
      <div className="inc-caller">{statusText}</div>
      <div className={`inc-avatar ${speaking ? "speaking" : ""}`}>
        {stakeholder.name.trim().slice(0, 1)}
      </div>
      <div className="inc-name">{stakeholder.name}</div>
      <div className="inc-role">
        {ROLE_LABEL[stakeholder.role]} {stakeholder.company} ·Sparr{" "}
        {t("simulatorSuffix")}
      </div>
    </div>
  );
}

function CallErrorActions({
  t,
  tc,
  onRetry,
  onHangUp,
}: {
  t: Translate;
  tc: Translate;
  onRetry: () => void;
  onHangUp: () => void;
}) {
  return (
    <div className="inc-actions">
      <div className="call-err">
        <span>{t("connectionFailedDetail")}</span>
        <button className="btn-primary" onClick={onRetry}>
          {t("retryCall")}
        </button>
        <button className="btn-tertiary" onClick={onHangUp}>
          {tc("close")}
        </button>
      </div>
    </div>
  );
}

function CallLiveActions({
  t,
  muted,
  phase,
  onShowDocs,
  onToggleMute,
  onHangUp,
}: {
  t: Translate;
  muted: boolean;
  phase: Phase;
  onShowDocs: () => void;
  onToggleMute: () => void;
  onHangUp: () => void;
}) {
  return (
    <div className="inc-actions live">
      <div className="inc-act">
        <button
          className="call-ctrl docs"
          onClick={onShowDocs}
          aria-label={t("documentsAria")}
        >
          <IconFolder />
        </button>
        <span>{t("documents")}</span>
      </div>
      <div className="inc-act">
        <button
          className={`call-ctrl mic ${muted ? "muted" : ""}`}
          onClick={onToggleMute}
          disabled={phase !== "live"}
          aria-label={t("muteAria")}
        >
          {muted ? <IconMicOff /> : <IconMic />}
        </button>
        <span>{muted ? t("muted") : t("mute")}</span>
      </div>
      <div className="inc-act">
        <button
          className="call-ctrl hang"
          onClick={onHangUp}
          aria-label={t("hangUpAria")}
        >
          <IconStop />
        </button>
        <span>{t("hangUp")}</span>
      </div>
    </div>
  );
}

export default function CallScreen({
  game,
  stakeholder,
  onClose,
  starredDocs,
  onToggleStarredDoc,
}: {
  game: GameState;
  stakeholder: Stakeholder;
  onClose: () => void;
  starredDocs: Set<string>;
  onToggleStarredDoc: (id: string) => void;
}) {
  const t = useTranslations("game.call");
  const tc = useTranslations("common");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const call = useVoiceCall({ game, stakeholder, onClose, t, audioRef });

  return (
    <div className="incoming-screen call-live">
      <div className="incoming-card">
        <CallHeader
          statusText={call.statusText}
          speaking={call.speaking}
          stakeholder={stakeholder}
          t={t}
        />

        {call.phase === "error" ? (
          <CallErrorActions
            t={t}
            tc={tc}
            onRetry={call.connect}
            onHangUp={call.hangUp}
          />
        ) : (
          <CallLiveActions
            t={t}
            muted={call.muted}
            phase={call.phase}
            onShowDocs={() => call.setShowDocs(true)}
            onToggleMute={call.toggleMute}
            onHangUp={call.hangUp}
          />
        )}
      </div>

      <audio ref={audioRef} autoPlay />
      {call.toast && <div className="toast">{call.toast}</div>}

      {call.showDocs && (
        <DocumentViewer
          documents={game.project.documents}
          onClose={() => call.setShowDocs(false)}
          starred={starredDocs}
          onToggleStar={onToggleStarredDoc}
        />
      )}
    </div>
  );
}

function IconFolder() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}
function IconMic() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function IconMicOff() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 11V6a3 3 0 0 0-5.9-.8" />
      <path d="M5 11a7 7 0 0 0 10.5 6M19 11a7 7 0 0 1-.3 2" />
      <path d="M12 18v3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
function IconStop() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}
