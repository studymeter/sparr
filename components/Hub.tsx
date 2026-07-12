"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import DocumentViewer from "@/components/DocumentViewer";
import CornerDeco from "@/components/CornerDeco";
import type { GameState, Stakeholder } from "@/lib/types";

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

function DocBadgeIcon() {
  return (
    <svg
      width="11"
      height="11"
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

function HubHeader() {
  return (
    <header className="mp-header briefing-header">
      <a
        href="https://sparr.studymeter.jp/"
        className="mp-brand sm-gradient-text"
      >
        Sparr
      </a>
    </header>
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
  return (
    <div className="persona-card">
      <div className={`pc-avatar pc-color-${index % 3}`}>
        {contact.name.trim().slice(0, 1)}
      </div>
      <span className="pc-guide">{contact.role}</span>
      <div className="pc-name">{contact.name}</div>
      <div className="pc-company">{contact.company}</div>
      {contact.docToolEnabled && (
        <span className="pc-doc-badge">
          <DocBadgeIcon />
          {t("docBadge")}
        </span>
      )}
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

function HubActions({
  onOpenDocs,
  onGiveUp,
}: {
  onOpenDocs: () => void;
  onGiveUp: () => void;
}) {
  const t = useTranslations("game.hub");
  return (
    <div className="hub-actions">
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

  return (
    <div className="home">
      <CornerDeco />
      <HubHeader />

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
            onOpenDocs={() => setShowDocs(true)}
            onGiveUp={onGiveUp}
          />
        </div>
      </main>

      {showDocs && (
        <DocumentViewer
          documents={game.project.documents}
          onClose={() => setShowDocs(false)}
          starred={starredDocs}
          onToggleStar={onToggleStarredDoc}
        />
      )}

      {showLeaveConfirm && (
        <LeaveConfirmModal onStay={stayOnPage} onLeave={leavePage} />
      )}
    </div>
  );
}
