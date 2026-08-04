// ゲーム全体で使う定数。マジックナンバーをコードに直書きしない。

// assemble.ts: memoryBlock で同一相手の履歴を末尾からこの数まで渡す
export const MEMORY_MAX_TURNS = 16;

// assemble.ts: 横断ドシエに含める他の関係者とのやり取りの最大発話数
export const DOSSIER_CROSS_TURNS = 6;

// assemble.ts: 横断ドシエに表示する資料本文のプレビュー文字数（プロンプトのトークン節約）
export const DOSSIER_BODY_PREVIEW_CHARS = 180;

// Boot.tsx: 擬似プログレスバーの上限%（実際の完了で 100% にする）
export const BOOT_PROGRESS_CEILING = 95;

// Boot.tsx: プログレスバーの更新間隔 (ms)
export const BOOT_TICK_INTERVAL_MS = 350;

// Boot.tsx: 完了表示から次画面へ遷移するまでの遅延 (ms)
export const BOOT_READY_DELAY_MS = 450;

// CallScreen.tsx: WebRTC 接続後、session.update と音声経路の安定を待ってから
// 相手の最初の発話を促すまでの遅延 (ms)
export const CALL_OPENING_DELAY_MS = 900;

// CallScreen.tsx: トースト表示時間 (ms)
export const TOAST_DURATION_MS = 4000;

// GiveUp.tsx: ランク境界（score >= この値でそのランク以上）
export const SCORE_S_MIN = 80;
export const SCORE_A_MIN = 70;
export const SCORE_B_MIN = 50;
export const SCORE_C_MIN = 30;

// tickets: 登録時の初回付与枚数（生涯・定期付与なし）
export const TICKET_INITIAL_GRANT_COUNT = 3;

// Hub.tsx: この時間が経つと「そろそろ終了？」のリマインダーを出す (ms)
export const PLAY_TIME_REMINDER_MS = 15 * 60 * 1000;

// 左上ロゴの戻り先（アプリのトップ。sparr.studymeter.jp は紹介サイト側）
export const APP_HOME_URL = "https://app.sparr.studymeter.jp/";
