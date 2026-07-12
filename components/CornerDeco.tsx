'use client';

// 背景のパステル三角デコ（トップ／ハブ共通）。コンテンツの背面に固定表示。

export default function CornerDeco() {
  return (
    <div className="corner-deco" aria-hidden>
      <span className="cd cd-tl" />
      <span className="cd cd-tr" />
      <span className="cd cd-bl" />
      <span className="cd cd-br" />
    </div>
  );
}
