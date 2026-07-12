// Twitter カードも OGP 画像と同じものを使う。
// Next.js 16: route segment config は re-export 不可のため直接定義する。
export { default } from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "プロジェクトマネージャーのヤバい一日";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
