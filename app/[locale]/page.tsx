"use client";

// 画面遷移のオーケストレータ：マイページ→ローディング→ブリーフィング→ハブ→コール。
// 起動直後はマイページ（シナリオ選択）。シナリオを選ぶとそのシナリオで開始する。

import { useCallback, useState } from "react";
import { useGame } from "@/app/store";
import MyPage from "@/components/MyPage";
import Boot from "@/components/Boot";
import Briefing from "@/components/Briefing";
import Hub from "@/components/Hub";
import CallScreen from "@/components/CallScreen";
import GiveUp from "@/components/GiveUp";
import type { GameState } from "@/lib/types";

type Screen =
  | { kind: "mypage" }
  | { kind: "boot"; scenarioId?: string }
  | { kind: "briefing" }
  | { kind: "hub" }
  | { kind: "call"; stakeholderId: string }
  | { kind: "giveup" };

type HubViewProps = {
  game: GameState;
  setScreen: (screen: Screen) => void;
  starredDocs: Set<string>;
  onToggleStarredDoc: (id: string) => void;
};

function HubView({
  game,
  setScreen,
  starredDocs,
  onToggleStarredDoc,
}: HubViewProps) {
  return (
    <Hub
      game={game}
      onCall={(id) => setScreen({ kind: "call", stakeholderId: id })}
      onGiveUp={() => setScreen({ kind: "giveup" })}
      starredDocs={starredDocs}
      onToggleStarredDoc={onToggleStarredDoc}
    />
  );
}

type CallViewProps = HubViewProps & {
  stakeholderId: string;
  onClose: () => void;
};

function CallView(props: CallViewProps) {
  const { game, stakeholderId, onClose, starredDocs, onToggleStarredDoc } =
    props;
  const stakeholder = game.stakeholders.find(
    (member) => member.id === stakeholderId
  );
  if (!stakeholder) {
    return <HubView {...props} />;
  }
  // コールはハブの上にポップアップ表示（背景にハブが透ける）
  return (
    <>
      <HubView {...props} />
      <CallScreen
        game={game}
        stakeholder={stakeholder}
        onClose={onClose}
        starredDocs={starredDocs}
        onToggleStarredDoc={onToggleStarredDoc}
      />
    </>
  );
}

function toggleSetMember(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function Page() {
  const { game, reset } = useGame();
  const [screen, setScreen] = useState<Screen>({ kind: "mypage" });
  const [starredDocs, setStarredDocs] = useState<Set<string>>(new Set());

  const toggleStarredDoc = useCallback((id: string) => {
    setStarredDocs((prev) => toggleSetMember(prev, id));
  }, []);

  const goHub = useCallback(() => setScreen({ kind: "hub" }), []);

  const startScenario = useCallback((id: string) => {
    setScreen({ kind: "boot", scenarioId: id });
  }, []);

  // 「もう一度」はマイページ（シナリオ選択）に戻す。
  const retry = useCallback(() => {
    reset();
    setScreen({ kind: "mypage" });
  }, [reset]);

  if (screen.kind === "mypage") {
    return <MyPage onStart={startScenario} />;
  }

  if (screen.kind === "boot") {
    return (
      <Boot
        scenarioId={screen.scenarioId}
        onReady={() => setScreen({ kind: "briefing" })}
      />
    );
  }

  // ゲーム状態が無い場合はマイページへ戻す（リロード時など）。
  if (!game) {
    return <MyPage onStart={startScenario} />;
  }

  if (screen.kind === "briefing") {
    return <Briefing game={game} onEnter={goHub} />;
  }

  if (screen.kind === "giveup") {
    return <GiveUp game={game} onCancel={goHub} onRetry={retry} />;
  }

  if (screen.kind === "call") {
    return (
      <CallView
        game={game}
        stakeholderId={screen.stakeholderId}
        onClose={goHub}
        setScreen={setScreen}
        starredDocs={starredDocs}
        onToggleStarredDoc={toggleStarredDoc}
      />
    );
  }

  return (
    <HubView
      game={game}
      setScreen={setScreen}
      starredDocs={starredDocs}
      onToggleStarredDoc={toggleStarredDoc}
    />
  );
}
