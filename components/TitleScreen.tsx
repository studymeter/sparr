"use client";

// タイトル画面（コミック調）。クリーム地＋放射サンバースト＋紙吹雪。

import { useState } from "react";
import Footer from "@/components/Footer";
import ContactButton from "@/components/ContactButton";

export default function TitleScreen({ onStart }: { onStart: () => void }) {
  const [isImgAvailable, setIsImgAvailable] = useState(true);

  return (
    <div className="title">
      {/* 紙吹雪ドット */}
      <div className="confetti" aria-hidden>
        <span className="cf cf1" />
        <span className="cf cf2" />
        <span className="cf cf3" />
        <span className="cf cf4" />
        <span className="cf cf5" />
        <span className="cf cf6" />
      </div>

      <div className="title-hero">
        {isImgAvailable ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="title-img"
            src="/title.png"
            alt="プロジェクトマネージャーのヤバい一日"
            onError={() => setIsImgAvailable(false)}
          />
        ) : (
          <h1 className="title-name">
            <span className="tn-1">プロジェクトマネージャーの</span>
            <span className="tn-2">ヤバい1日</span>
          </h1>
        )}

        <p className="title-tag">
          DXプロジェクトが大炎上！
          <br />
          キレるユーザー、責任逃れのパワハラ上司、自分事じゃない部下…
          <br />
          プロジェクトマネージャーとして、この危機を乗り越えろ！
        </p>

        <button className="title-start" onClick={onStart}>
          はじめる&nbsp;&nbsp;→
        </button>

        <p className="title-note">
          🎧 音が出ます。イヤホンとマイクを接続してください。
        </p>
      </div>

      <ContactButton />
      <Footer />
    </div>
  );
}
