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
  // onError は生成に失敗した場合に呼ばれる（呼び出し元でのトースト表示などに使う）。
  requestDocument: (request: string, onError?: () => void) => void;
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
function postDocumentRequest(
  game: GameState,
  request: string,
  onDoc: (doc: { title: string; body: string }) => void,
  onError?: () => void
): void {
  fetch("/api/player/tool-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: game.project,
      stakeholders: game.stakeholders,
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

function useGameProvider(): GameContextValue {
  const [game, setGame] = useState<GameState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameRef.current = game;
  });

  const setupFromResponse = useCallback((res: SetupResponse) => {
    const documents = buildDocuments(res);
    setGame({
      project: buildProject(res, documents),
      stakeholders: buildStakeholders(res),
      callLogs: {},
    });
  }, []);

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
    (request: string, onError?: () => void) => {
      const currentGame = gameRef.current;
      if (!currentGame) return;
      postDocumentRequest(currentGame, request, addGeneratedDoc, onError);
    },
    [addGeneratedDoc]
  );

  const reset = useCallback(() => setGame(null), []);

  return useMemo<GameContextValue>(
    () => ({
      game,
      setupFromResponse,
      addGeneratedDoc,
      appendCallLog,
      requestDocument,
      reset,
    }),
    [
      game,
      setupFromResponse,
      addGeneratedDoc,
      appendCallLog,
      requestDocument,
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
