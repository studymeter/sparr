"use client";

// クライアント保持のゲーム状態（永続化なし・リロードで消えてよい：SPEC §1/§3）。

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";
import { uid } from "@/lib/id";
import type {
  CallTurn,
  Doc,
  GameState,
  SetupResponse,
  Stakeholder,
} from "@/lib/types";

function workMemoFallback(): string {
  if (typeof document === "undefined") {
    return jaMessages.game.workMemoFallback;
  }
  return document.documentElement.lang === "en"
    ? enMessages.game.workMemoFallback
    : jaMessages.game.workMemoFallback;
}

type GameContextValue = {
  game: GameState | null;
  setupFromResponse: (res: SetupResponse) => void;
  addGeneratedDoc: (doc: { title: string; body: string }) => Doc;
  appendCallLog: (stakeholderId: string, turns: CallTurn[]) => void;
  // 資料作成依頼。コールを切っても完成する（生成はアプリ常駐のストア側で進む）。
  // stakeholderId は依頼したキャラ（アダプターが「誰として書くか」を決めるのに使う）。
  // onError は生成に失敗した場合に呼ばれる（呼び出し元でのトースト表示などに使う）。
  requestDocument: (
    request: string,
    stakeholderId: string,
    onError?: () => void
  ) => void;
  // プレイ時間の起点。Hub コンポーネントは通話の開始・終了ごとに再マウントされる
  // ため、ここ（ゲームのライフサイクルに紐づく側）で持つことでカウントが途切れない。
  playStartedAt: number | null;
  markPlayStarted: () => void;
  hasShownPlayTimeReminder: boolean;
  markPlayTimeReminderShown: () => void;
  // リマインダーの表示中かどうかも同じ理由でここに置く。「続ける」か「終了」を
  // 押すまでは、通話の開始・終了を挟んでも消えない。
  isPlayTimeReminderDismissed: boolean;
  dismissPlayTimeReminder: () => void;
  reset: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

function buildStakeholders(res: SetupResponse): Stakeholder[] {
  return res.stakeholders.map((stakeholder) => ({
    id: uid("sh_"),
    name: stakeholder.name,
    role: stakeholder.role,
    company: stakeholder.company,
    situation: stakeholder.situation,
    relationToRootCause: stakeholder.relationToRootCause,
    persona: stakeholder.persona,
    goal: stakeholder.goal,
    moodStart: stakeholder.moodStart,
    openingInstruction: stakeholder.openingInstruction,
    voiceCode: stakeholder.voiceCode,
    docToolEnabled: stakeholder.docToolEnabled,
  }));
}

function buildDocuments(res: SetupResponse): Doc[] {
  // メール（今回のスタート地点）を先頭に。残りは生成順のまま。
  const orderedDocs = [...res.documents].sort((left, right) => {
    const leftRank = left.kind === "email" ? 0 : 1;
    const rightRank = right.kind === "email" ? 0 : 1;
    return leftRank - rightRank;
  });
  return orderedDocs.map((doc) => ({
    id: uid("doc_"),
    title: doc.title,
    body: doc.body,
    source: "initial" as const,
  }));
}

function buildProject(
  res: SetupResponse,
  documents: Doc[]
): GameState["project"] {
  return {
    scenarioId: res.project.scenarioId,
    title: res.project.title,
    situation: res.project.situation,
    rootCause: res.project.rootCause,
    rubric: res.project.rubric,
    documents,
    briefing: res.briefing,
  };
}

function makeGeneratedDoc(doc: { title: string; body: string }): Doc {
  return {
    id: uid("doc_"),
    title: doc.title,
    body: doc.body,
    source: "generated",
  };
}

function withGeneratedDoc(
  prev: GameState | null,
  newDoc: Doc
): GameState | null {
  if (!prev) return prev;
  return {
    ...prev,
    project: {
      ...prev.project,
      documents: [...prev.project.documents, newDoc],
    },
  };
}

function withAppendedLog(
  prev: GameState | null,
  stakeholderId: string,
  turns: CallTurn[]
): GameState | null {
  if (!prev) return prev;
  const existing = prev.callLogs[stakeholderId] ?? [];
  return {
    ...prev,
    callLogs: { ...prev.callLogs, [stakeholderId]: [...existing, ...turns] },
  };
}

// 依頼後にコールを切って画面を離れても資料は完成して届く（生成はストア側で非同期に進む）。
// サーバがエラーを返した場合や本文が空だった場合は onError で呼び出し元に伝える
// （以前は無言で握りつぶしており、「作成中」表示のまま資料が届かないように見えていた）。
function postDocumentRequest(params: {
  game: GameState;
  stakeholderId: string;
  request: string;
  onDoc: (doc: { title: string; body: string }) => void;
  onError?: () => void;
}): void {
  const { game, stakeholderId, request, onDoc, onError } = params;
  fetch("/api/player/tool-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: game.project,
      stakeholders: game.stakeholders,
      stakeholderId,
      request,
    }),
  })
    .then(async (res) => {
      const doc = await res.json().catch(() => null);
      if (!res.ok || !doc?.body) {
        onError?.();
        return;
      }
      onDoc({ title: doc.title || workMemoFallback(), body: doc.body });
    })
    .catch(() => {
      onError?.();
    });
}

// プレイ時間の起点と「終了リマインダー案内済みか」。ゲームの生成／リセットに
// 合わせて巻き戻す（Hub 側の再マウントには影響されない）。
function usePlayTimeState() {
  const [playStartedAt, setPlayStartedAt] = useState<number | null>(null);
  const [hasShownPlayTimeReminder, setHasShownPlayTimeReminder] =
    useState(false);
  const [isPlayTimeReminderDismissed, setIsPlayTimeReminderDismissed] =
    useState(false);

  // Hub 初回表示時に一度だけ呼ばれる想定。以後の再マウント（通話の開始・終了）では
  // 既に値があるので上書きされない。
  const markPlayStarted = useCallback(() => {
    setPlayStartedAt((prev) => prev ?? Date.now());
  }, []);

  const markPlayTimeReminderShown = useCallback(() => {
    setHasShownPlayTimeReminder(true);
  }, []);

  const dismissPlayTimeReminder = useCallback(() => {
    setIsPlayTimeReminderDismissed(true);
  }, []);

  const resetPlayTime = useCallback(() => {
    setPlayStartedAt(null);
    setHasShownPlayTimeReminder(false);
    setIsPlayTimeReminderDismissed(false);
  }, []);

  return {
    playStartedAt,
    markPlayStarted,
    hasShownPlayTimeReminder,
    markPlayTimeReminderShown,
    isPlayTimeReminderDismissed,
    dismissPlayTimeReminder,
    resetPlayTime,
  };
}

function useGameProvider(): GameContextValue {
  const [game, setGame] = useState<GameState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameRef.current = game;
  });

  const {
    playStartedAt,
    markPlayStarted,
    hasShownPlayTimeReminder,
    markPlayTimeReminderShown,
    isPlayTimeReminderDismissed,
    dismissPlayTimeReminder,
    resetPlayTime,
  } = usePlayTimeState();

  const setupFromResponse = useCallback(
    (res: SetupResponse) => {
      const documents = buildDocuments(res);
      setGame({
        project: buildProject(res, documents),
        stakeholders: buildStakeholders(res),
        callLogs: {},
      });
      resetPlayTime();
    },
    [resetPlayTime]
  );

  const addGeneratedDoc = useCallback(
    (doc: { title: string; body: string }): Doc => {
      const newDoc = makeGeneratedDoc(doc);
      setGame((prev) => withGeneratedDoc(prev, newDoc));
      return newDoc;
    },
    []
  );

  const appendCallLog = useCallback(
    (stakeholderId: string, turns: CallTurn[]) => {
      if (!turns.length) return;
      setGame((prev) => withAppendedLog(prev, stakeholderId, turns));
    },
    []
  );

  const requestDocument = useCallback(
    (request: string, stakeholderId: string, onError?: () => void) => {
      const currentGame = gameRef.current;
      if (!currentGame) return;
      postDocumentRequest({
        game: currentGame,
        stakeholderId,
        request,
        onDoc: addGeneratedDoc,
        onError,
      });
    },
    [addGeneratedDoc]
  );

  const reset = useCallback(() => {
    setGame(null);
    resetPlayTime();
  }, [resetPlayTime]);

  return useMemo<GameContextValue>(
    () => ({
      game,
      setupFromResponse,
      addGeneratedDoc,
      appendCallLog,
      requestDocument,
      playStartedAt,
      markPlayStarted,
      hasShownPlayTimeReminder,
      markPlayTimeReminderShown,
      isPlayTimeReminderDismissed,
      dismissPlayTimeReminder,
      reset,
    }),
    [
      game,
      setupFromResponse,
      addGeneratedDoc,
      appendCallLog,
      requestDocument,
      playStartedAt,
      markPlayStarted,
      hasShownPlayTimeReminder,
      markPlayTimeReminderShown,
      isPlayTimeReminderDismissed,
      dismissPlayTimeReminder,
      reset,
    ]
  );
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const value = useGameProvider();
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
