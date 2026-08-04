"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import DocumentViewer from "@/components/DocumentViewer";
import CornerDeco from "@/components/CornerDeco";
import BrandLogo from "@/components/BrandLogo";
import { useGame } from "@/app/store";
import { PLAY_TIME_REMINDER_MS } from "@/lib/constants";
import type { Briefing, GameState, Stakeholder } from "@/lib/types";

const PLAY_TIME_TICK_MS = 1000;

// プレイ時間の経過を計測し、規定時間を超えたら一度だけ終了リマインダーを出す。
// 開始時刻・案内済みか・リマインダー表示中かはすべてゲーム状態側（app/store.tsx）
// で持つ — Hub は通話の開始・終了ごとに再マウントされるため、Hub のローカル
// state だとカウントもリマインダーの表示も途切れてしまう（「続ける」「終了」を
// 押すまでは消えないようにする）。
function usePlayTimer() {
  const {
    playStartedAt,
    markPlayStarted,
    hasShownPlayTimeReminder,
    markPlayTimeReminderShown,
    isPlayTimeReminderDismissed,
    dismissPlayTimeReminder,
  } = useGame();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    markPlayStarted();
  }, [markPlayStarted]);

  useEffect(() => {
    if (playStartedAt === null) return;
    const tick = () => {
      const elapsed = Date.now() - playStartedAt;
      setElapsedMs(elapsed);
      if (!hasShownPlayTimeReminder && elapsed >= PLAY_TIME_REMINDER_MS) {
        markPlayTimeReminderShown();
      }
    };
    tick();
    const id = setInterval(tick, PLAY_TIME_TICK_MS);
    return () => clearInterval(id);
  }, [playStartedAt, hasShownPlayTimeReminder, markPlayTimeReminderShown]);

  return {
    elapsedMs,
    showReminder: hasShownPlayTimeReminder && !isPlayTimeReminderDismissed,
    dismissReminder: dismissPlayTimeReminder,
  };
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Guards against accidental back-navigation: intercepts popstate and asks
// the user to confirm before actually leaving the page.
function useLeaveGuard() {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const guardRef = useRef(true);

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const onPop = () => {
      if (!guardRef.current) return;
      setShowLeaveConfirm(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const stayOnPage = () => {
    setShowLeaveConfirm(false);
    window.history.pushState(null, "", window.location.href);
  };
  const leavePage = () => {
    guardRef.current = false;
    window.history.back();
  };

  return { showLeaveConfirm, stayOnPage, leavePage };
}

function DocBadgeIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="14 2 14 8 20 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="16"
        y1="13"
        x2="8"
        y2="13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="17"
        x2="8"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.95-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="4"
        y1="22"
        x2="4"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayTimeBadge({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="hub-play-time">
      <ClockIcon />
      <span>{formatElapsed(elapsedMs)}</span>
    </div>
  );
}

function PlayTimeReminderModal({
  onEnd,
  onContinue,
}: {
  onEnd: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("game.hub");
  return (
    <div className="modal-backdrop">
      <div className="modal giveup">
        <h2>{t("playTimeReminderTitle")}</h2>
        <p className="giveup-warn">{t("playTimeReminderBody")}</p>
        <div className="giveup-actions">
          <button className="btn-tertiary" onClick={onContinue}>
            {t("playTimeReminderContinue")}
          </button>
          <button className="btn-primary" onClick={onEnd}>
            {t("playTimeReminderEnd")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HubHeader() {
  return (
    <header className="mp-header briefing-header">
      <a href="https://sparr.studymeter.jp/" className="mp-brand">
        <BrandLogo />
      </a>
    </header>
  );
}

function DocBadgeInfoModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("game.hub");
  const tc = useTranslations("common");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal giveup" onClick={(ev) => ev.stopPropagation()}>
        <h2 className="pc-doc-modal-title">
          <DocBadgeIcon size={20} />
          {t("docBadge")}
        </h2>
        <p className="giveup-warn pc-doc-modal-text">{t("docBadgeExplain")}</p>
        <div className="giveup-actions">
          <button className="btn-primary" onClick={onClose}>
            {tc("close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonaCard({
  contact,
  index,
  onCall,
}: {
  contact: Stakeholder;
  index: number;
  onCall: (stakeholderId: string) => void;
}) {
  const t = useTranslations("game.hub");
  const [showDocInfo, setShowDocInfo] = useState(false);
  return (
    <div className="persona-card">
      <div className={`pc-avatar pc-color-${index % 3}`}>
        {contact.name.trim().slice(0, 1)}
      </div>
      {contact.docToolEnabled && (
        <button
          type="button"
          className="pc-doc-badge"
          onClick={() => setShowDocInfo(true)}
        >
          <DocBadgeIcon />
          {t("docBadge")}
        </button>
      )}
      {showDocInfo && (
        <DocBadgeInfoModal onClose={() => setShowDocInfo(false)} />
      )}
      <div className="pc-name">{contact.name}</div>
      <div className="pc-company">{contact.company}</div>
      <button
        type="button"
        className="btn-primary"
        onClick={() => onCall(contact.id)}
      >
        <PhoneIcon />
        {t("startCall")}
      </button>
    </div>
  );
}

function BriefingIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="8"
        y="2"
        width="8"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line
        x1="9"
        y1="12"
        x2="15"
        y2="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="16"
        x2="13"
        y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 状況を確認し直せるよう、Briefing 画面と同じ内容（状況・きっかけ・あなたの仕事）
// を Hub からポップアップで再表示する。
function BriefingModal({
  briefing,
  onClose,
}: {
  briefing: Briefing;
  onClose: () => void;
}) {
  const tb = useTranslations("game.briefing");
  const tc = useTranslations("common");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal brief hub-briefing-modal"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className="hub-briefing-title">{tb("title")}</h2>
        <div className="brief-card">
          <span className="brief-label label-blue">{tb("situation")}</span>
          <p>{briefing.overview}</p>
        </div>
        <div className="brief-card">
          <span className="brief-label label-purple">{tb("trigger")}</span>
          <p>{briefing.trouble}</p>
        </div>
        <div className="brief-card">
          <span className="brief-label label-blue">{tb("yourJob")}</span>
          <p>{tb("yourJobBody")}</p>
        </div>
        <div className="giveup-actions">
          <button className="btn-primary" onClick={onClose}>
            {tc("close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefingButton({ briefing }: { briefing: Briefing }) {
  const t = useTranslations("game.hub");
  const [showBriefing, setShowBriefing] = useState(false);
  return (
    <>
      <button
        className="btn-tertiary shadow"
        onClick={() => setShowBriefing(true)}
      >
        <BriefingIcon />
        {t("briefing")}
      </button>
      {showBriefing && (
        <BriefingModal
          briefing={briefing}
          onClose={() => setShowBriefing(false)}
        />
      )}
    </>
  );
}

function HubActions({
  briefing,
  onOpenDocs,
  onGiveUp,
}: {
  briefing: Briefing;
  onOpenDocs: () => void;
  onGiveUp: () => void;
}) {
  const t = useTranslations("game.hub");
  return (
    <div className="hub-actions">
      <BriefingButton briefing={briefing} />
      <button className="btn-tertiary shadow" onClick={onOpenDocs}>
        <FolderIcon />
        {t("caseFolder")}
      </button>
      <button className="btn-primary shadow" onClick={onGiveUp}>
        <FlagIcon />
        {t("finishAndScore")}
      </button>
    </div>
  );
}

function LeaveConfirmModal({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("game.hub");
  return (
    <div className="modal-backdrop">
      <div className="modal giveup">
        <h2>{t("leaveConfirmTitle")}</h2>
        <p className="giveup-warn">{t("leaveConfirmBody")}</p>
        <div className="giveup-actions">
          <button className="btn-tertiary" onClick={onStay}>
            {t("stay")}
          </button>
          <button className="btn-danger" onClick={onLeave}>
            {t("leave")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HubOverlays({
  showDocs,
  documents,
  starredDocs,
  onToggleStarredDoc,
  onCloseDocs,
  showLeaveConfirm,
  onStay,
  onLeave,
  showReminder,
  onEnd,
  onContinue,
}: {
  showDocs: boolean;
  documents: GameState["project"]["documents"];
  starredDocs: Set<string>;
  onToggleStarredDoc: (id: string) => void;
  onCloseDocs: () => void;
  showLeaveConfirm: boolean;
  onStay: () => void;
  onLeave: () => void;
  showReminder: boolean;
  onEnd: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      {showDocs && (
        <DocumentViewer
          documents={documents}
          onClose={onCloseDocs}
          starred={starredDocs}
          onToggleStar={onToggleStarredDoc}
        />
      )}
      {showLeaveConfirm && (
        <LeaveConfirmModal onStay={onStay} onLeave={onLeave} />
      )}
      {showReminder && (
        <PlayTimeReminderModal onEnd={onEnd} onContinue={onContinue} />
      )}
    </>
  );
}

export default function Hub({
  game,
  onCall,
  onGiveUp,
  starredDocs,
  onToggleStarredDoc,
}: {
  game: GameState;
  onCall: (stakeholderId: string) => void;
  onGiveUp: () => void;
  starredDocs: Set<string>;
  onToggleStarredDoc: (id: string) => void;
}) {
  const t = useTranslations("game.hub");
  const [showDocs, setShowDocs] = useState(false);
  const { showLeaveConfirm, stayOnPage, leavePage } = useLeaveGuard();
  const { elapsedMs, showReminder, dismissReminder } = usePlayTimer();

  return (
    <div className="home">
      <CornerDeco />
      <HubHeader />
      <PlayTimeBadge elapsedMs={elapsedMs} />
      <main className="home-main">
        <div className="home-content">
          <h2 className="home-h">{game.project.title}</h2>
          <p className="home-sub">
            {t("subtitle")} <br />
            {t("subtitleLine2")}
          </p>

          <div className="persona-grid">
            {game.stakeholders.map((contact, i) => (
              <PersonaCard
                key={contact.id}
                contact={contact}
                index={i}
                onCall={onCall}
              />
            ))}
          </div>

          <HubActions
            briefing={game.project.briefing}
            onOpenDocs={() => setShowDocs(true)}
            onGiveUp={onGiveUp}
          />
        </div>
      </main>

      <HubOverlays
        showDocs={showDocs}
        documents={game.project.documents}
        starredDocs={starredDocs}
        onToggleStarredDoc={onToggleStarredDoc}
        onCloseDocs={() => setShowDocs(false)}
        showLeaveConfirm={showLeaveConfirm}
        onStay={stayOnPage}
        onLeave={leavePage}
        showReminder={showReminder}
        onEnd={() => {
          dismissReminder();
          onGiveUp();
        }}
        onContinue={dismissReminder}
      />
    </div>
  );
}
