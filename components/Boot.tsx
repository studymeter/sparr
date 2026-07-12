"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useGame } from "@/app/store";
import BrandLogo from "@/components/BrandLogo";
import {
  BOOT_PROGRESS_CEILING,
  BOOT_READY_DELAY_MS,
  BOOT_TICK_INTERVAL_MS,
} from "@/lib/constants";
import type { SetupResponse } from "@/lib/types";

// Drives the setup call: fake-progress ticking, the API request, and
// error/insufficient-ticket state. State stays owned by the Boot component.
function useBootFlow({
  scenarioId,
  onReady,
}: {
  scenarioId?: string;
  onReady: () => void;
}) {
  const t = useTranslations("game.boot");
  const tc = useTranslations("common");
  const { setupFromResponse } = useGame();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientTickets, setIsInsufficientTickets] = useState(false);
  const hasStarted = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setIsInsufficientTickets(false);
    setProgress(0);

    const tick = setInterval(() => {
      setProgress((prev) =>
        prev >= BOOT_PROGRESS_CEILING
          ? BOOT_PROGRESS_CEILING
          : prev + Math.max(0.4, (BOOT_PROGRESS_CEILING - prev) * 0.05)
      );
    }, BOOT_TICK_INTERVAL_MS);

    try {
      const res = await fetch("/api/player/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data?.error === "insufficient_tickets") {
          setIsInsufficientTickets(true);
          throw new Error(t("insufficientTickets"));
        }
        throw new Error(data.error || t("setupFailed"));
      }
      clearInterval(tick);
      setProgress(100);
      setupFromResponse(data as SetupResponse);
      setTimeout(onReady, BOOT_READY_DELAY_MS);
    } catch (err) {
      clearInterval(tick);
      setError(err instanceof Error ? err.message : tc("unknownError"));
    }
  }, [setupFromResponse, onReady, scenarioId, t, tc]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [run]);

  return { progress, error, isInsufficientTickets, run };
}

function ProgressView({ progress }: { progress: number }) {
  const t = useTranslations("game.boot");

  const stepFor = (value: number): string => {
    if (value < 30) return t("step1");
    if (value < 60) return t("step2");
    if (value < 90) return t("step3");
    return t("step4");
  };

  return (
    <>
      <div
        className="bar"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
      >
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="step">
        {stepFor(progress)} <span className="pct">{Math.round(progress)}%</span>
      </div>
    </>
  );
}

function ErrorView({
  isInsufficientTickets,
  onRetry,
}: {
  isInsufficientTickets: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("game.boot");
  const tc = useTranslations("common");
  const router = useRouter();
  return (
    <>
      <div className="err">
        {isInsufficientTickets
          ? t("insufficientTicketsDetail")
          : t("loadFailed")}
        <br />
        {isInsufficientTickets ? t("checkTickets") : t("tryAgain")}
      </div>
      {isInsufficientTickets ? (
        <button className="btn-tertiary" onClick={() => router.push("/me")}>
          {t("backToMyPage")}
        </button>
      ) : (
        <button className="btn-primary" onClick={onRetry}>
          {tc("retry")}
        </button>
      )}
    </>
  );
}

export default function Boot({
  scenarioId,
  onReady,
}: {
  scenarioId?: string;
  onReady: () => void;
}) {
  const { progress, error, isInsufficientTickets, run } = useBootFlow({
    scenarioId,
    onReady,
  });

  return (
    <div className="boot">
      <h1 className="boot-brand">
        <BrandLogo className="boot-brand-logo" />
      </h1>
      {!error ? (
        <ProgressView progress={progress} />
      ) : (
        <ErrorView
          isInsufficientTickets={isInsufficientTickets}
          onRetry={run}
        />
      )}
    </div>
  );
}
