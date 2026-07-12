// 簡易ID生成（永続化なし・衝突回避は緩くてよい）。

export function uid(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}${timestamp}${rand}`;
}
