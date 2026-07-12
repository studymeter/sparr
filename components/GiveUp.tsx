"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GameState } from "@/lib/types";
import type { ScoreResult } from "@/lib/prompts/score";

type Phase = "confirm" | "loading" | "revealed";
type Translate = ReturnType<typeof useTranslations>;

const SCORE_CIRCUMFERENCE = 326.7;

function scoreCircleColor(sc: number): string {
  if (sc >= 70) return "#2563eb";
  if (sc >= 30) return "#f97316";
  return "#e11d48";
}

function rankFor(score: number): string {
  if (score >= 80) return "S";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  if (score >= 30) return "C";
  return "D";
}

async function persistResult(
  game: GameState,
  result: ScoreResult
): Promise<void> {
  try {
    const res = await fetch("/api/player/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: game.project.scenarioId,
        score: result.score,
        headline: result.headline,
        good: result.good,
        improvements: result.improvements,
        comment: result.comment,
      }),
    });
    if (!res.ok) {
      console.warn("[giveup] result save returned non-ok status:", res.status);
    }
  } catch (err) {
    console.warn("[giveup] result save failed:", err);
  }
}

function ConfirmPhase({
  t,
  onCancel,
  onReveal,
}: {
  t: Translate;
  onCancel: () => void;
  onReveal: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal giveup">
        <h2 className="giveup-h">{t("confirmTitle")}</h2>
        <p className="giveup-warn">
          {t("confirmBody")}
          <br />
          <strong style={{ color: "var(--danger)" }}>
            {t("confirmWarning")}
          </strong>
          {t("confirmRetry")}
        </p>
        <div className="giveup-actions">
          <button className="btn-tertiary" onClick={onCancel}>
            {t("keepPlaying")}
          </button>
          <button className="btn-primary" onClick={onReveal}>
            {t("reveal")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingPhase({ t }: { t: Translate }) {
  return (
    <div className="modal-backdrop">
      <div className="scoring">
        <div className="spinner" />
        <div>{t("scoring")}</div>
      </div>
    </div>
  );
}

function ScoreArea({
  evalResult,
  score,
  rank,
  t,
}: {
  evalResult: ScoreResult;
  score: number;
  rank: string;
  t: Translate;
}) {
  const circleColor = scoreCircleColor(score);
  return (
    <div className="rp-score-area">
      <div className="rp-circle-wrap">
        <svg viewBox="0 0 120 120" className="rp-circle-svg" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={circleColor}
            strokeWidth="10"
            strokeDasharray={SCORE_CIRCUMFERENCE}
            strokeDashoffset={SCORE_CIRCUMFERENCE * (1 - score / 100)}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="rp-circle-inner">
          <span className="rp-grade" style={{ color: circleColor }}>
            {rank}
          </span>
          <span className="rp-grade-label">{t("grade")}</span>
        </div>
      </div>
      <div className="rp-score-row">
        <span className="rp-score-num">{score}</span>
        <span className="rp-score-denom">{t("points")}</span>
      </div>
      {evalResult.headline && (
        <p className="rp-headline">{evalResult.headline}</p>
      )}
      {evalResult.comment && <p className="rp-comment">{evalResult.comment}</p>}
    </div>
  );
}

function ScoreErrorCard({
  t,
  onReveal,
}: {
  t: Translate;
  onReveal: () => void;
}) {
  return (
    <div className="brief-card">
      <span className="brief-label label-pink">{t("scoreError")}</span>
      <div className="ans-body">
        <p>{t("scoreErrorBody")}</p>
        <button className="btn-secondary" onClick={onReveal}>
          {t("retryEvaluation")}
        </button>
      </div>
    </div>
  );
}

// Good points and improvements share the same card layout, differing only in
// the icon and item accent color.
function FeedbackSection({
  variant,
  label,
  items,
}: {
  variant: "good" | "needs";
  label: string;
  items: string[];
}) {
  const iconPath = variant === "good" ? "M8 12l3 3 5-5" : "M12 8v4M12 16h.01";
  return (
    <div className="rp-section">
      <div
        className={`rp-section-icon rp-section-icon-${variant}`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d={iconPath} />
        </svg>
      </div>
      <div className="rp-section-label">{label}</div>
      <div className="rp-fc-card">
        <ul className="rp-fc-list">
          {items.map((item, idx) => (
            <li key={idx} className={`rp-fc-item rp-fc-item-${variant}`}>
              <span className="rp-fc-dot" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AnswerSection({ t, rootCause }: { t: Translate; rootCause: string }) {
  return (
    <div className="rp-section">
      <div
        className="rp-section-icon rp-section-icon-answer"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      </div>
      <div className="rp-section-label">{t("answerReveal")}</div>
      <div className="rp-fc-card">
        <p className="rp-answer-body">{rootCause}</p>
      </div>
    </div>
  );
}

function RevealedView({
  t,
  evalResult,
  score,
  rank,
  rootCause,
  onReveal,
  onRetry,
}: {
  t: Translate;
  evalResult: ScoreResult | null;
  score: number;
  rank: string;
  rootCause: string;
  onReveal: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="briefing result-page">
      <div className="briefing-inner">
        <header className="mp-header briefing-header">
          <a
            href="https://sparr.studymeter.jp/"
            className="mp-brand sm-gradient-text"
          >
            Sparr
          </a>
        </header>
        <div className="rp-header">
          <div className="eyebrow eyebrow-pink">{t("resultEyebrow")}</div>
          <h1 className="briefing-h">{t("resultTitle")}</h1>
          <p className="briefing-sub">{t("resultSubtitle")}</p>
        </div>

        {evalResult ? (
          <ScoreArea evalResult={evalResult} score={score} rank={rank} t={t} />
        ) : (
          <ScoreErrorCard t={t} onReveal={onReveal} />
        )}

        {evalResult && evalResult.good?.length > 0 && (
          <FeedbackSection
            variant="good"
            label={t("goodPoints")}
            items={evalResult.good}
          />
        )}

        {evalResult && evalResult.improvements?.length > 0 && (
          <FeedbackSection
            variant="needs"
            label={t("improvements")}
            items={evalResult.improvements}
          />
        )}

        <AnswerSection t={t} rootCause={rootCause} />

        <button className="btn-tertiary shadow" onClick={onRetry}>
          {t("backToMyPage")}
        </button>
      </div>
    </div>
  );
}

export default function GiveUp({
  game,
  onCancel,
  onRetry,
}: {
  game: GameState;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("game.giveUp");
  const [phase, setPhase] = useState<Phase>("confirm");
  const [evalResult, setEvalResult] = useState<ScoreResult | null>(null);
  const rootCause = game.project.rootCause;

  const reveal = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/player/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: game.project,
          stakeholders: game.stakeholders,
          callLogs: game.callLogs,
        }),
      });
      const data = await res.json();
      if (res.ok && typeof data?.score === "number") {
        const result = data as ScoreResult;
        setEvalResult(result);
        await persistResult(game, result);
      }
    } catch {
      /* evaluation optional */
    }
    setPhase("revealed");
  };

  if (phase === "confirm") {
    return <ConfirmPhase t={t} onCancel={onCancel} onReveal={reveal} />;
  }

  if (phase === "loading") {
    return <LoadingPhase t={t} />;
  }

  const score = evalResult?.score ?? 0;
  return (
    <RevealedView
      t={t}
      evalResult={evalResult}
      score={score}
      rank={rankFor(score)}
      rootCause={rootCause}
      onReveal={reveal}
      onRetry={onRetry}
    />
  );
}
