"use client";

import type { GameState } from "@/lib/types";
import { useTranslations } from "next-intl";
import BrandLogo from "@/components/BrandLogo";
import { APP_HOME_URL } from "@/lib/constants";

export default function Briefing({
  game,
  onEnter,
}: {
  game: GameState;
  onEnter: () => void;
}) {
  const t = useTranslations("game.briefing");
  const { briefing } = game.project;
  return (
    <div className="briefing">
      <header className="mp-header briefing-header">
        <a href={APP_HOME_URL} className="mp-brand">
          <BrandLogo />
        </a>
      </header>
      <div className="briefing-inner">
        <div className="sm-eyebrow eyebrow-left">{t("eyebrow")}</div>
        <h1 className="briefing-h">{t("title")}</h1>
        <p className="briefing-sub">{t("subtitle")}</p>

        <div className="brief-card">
          <span className="brief-label label-blue">{t("situation")}</span>
          <p>{briefing.overview}</p>
        </div>

        <div className="brief-card-row">
          <div className="brief-card block">
            <div className="brief-card-header">
              <span className="brief-label label-purple">{t("trigger")}</span>
            </div>
            <p>{briefing.trouble}</p>
          </div>
          <div className="brief-card block">
            <div className="brief-card-header">
              <span className="brief-label label-blue">{t("yourJob")}</span>
            </div>
            <p>{t("yourJobBody")}</p>
          </div>
        </div>

        <button className="btn-primary shadow" onClick={onEnter}>
          {t("start")}&nbsp;&nbsp;→
        </button>

        <p className="briefing-note">{t("privacyNote")}</p>
      </div>
    </div>
  );
}
