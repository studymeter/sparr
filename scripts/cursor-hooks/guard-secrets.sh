#!/usr/bin/env bash
# preToolUse (Write|StrReplace) — block secret leakage.
# Receives tool call JSON on stdin. Outputs {"permission":"allow"|"deny"}.
set -uo pipefail

raw="$(cat)"

deny() {
  node -e "console.log(JSON.stringify({permission:'deny',user_message:'$1',agent_message:'$1'}))"
  exit 2
}

if [ -z "$(printf '%s' "$raw" | tr -d '[:space:]')" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

printf '%s' "$raw" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  const allow = () => {
    console.log(JSON.stringify({ permission: "allow" }));
    process.exit(0);
  };
  const deny = (msg) => {
    console.log(JSON.stringify({ permission: "deny", user_message: msg, agent_message: msg }));
    process.exit(2);
  };
  if (!s.trim()) return allow();
  let j;
  try {
    j = JSON.parse(s);
  } catch {
    return deny("フック入力を解釈できなかった。");
  }
  const ti = j.tool_input || j;
  const fp = String(ti.file_path || ti.path || "");
  const isDoc = /\.(md|mdc|example|sample|template)$/i.test(fp);
  const payload = JSON.stringify(ti);
  if (/(\/|^)\.env($|\.)/.test(fp) && !/\.env\.(example|sample|template)$/.test(fp)) {
    return deny(fp + " は秘密情報ファイル。編集禁止。");
  }
  if (!isDoc && /sk-[A-Za-z0-9_-]{20,}/.test(payload)) return deny("ハードコードされた API キー検出。");
  if (
    !isDoc &&
    /(OPENAI_API_KEY|API_KEY|SECRET|TOKEN|PASSWORD)[^A-Za-z0-9]{0,3}(:|=)[^A-Za-z0-9]{0,3}.{8,}/i.test(payload)
  ) {
    return deny("秘密情報のハードコードらしき記述を検出。");
  }
  if (!isDoc && /NEXT_PUBLIC_[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)/i.test(payload)) {
    return deny("NEXT_PUBLIC_ で秘密をクライアント露出しない。");
  }
  const content = String(ti.contents || ti.content || ti.new_string || "");
  if (
    !isDoc &&
    /use client/.test(content) &&
    /process\.env\.(OPENAI_API_KEY|[A-Z0-9_]*SECRET[A-Z0-9_]*|[A-Z0-9_]*API_KEY)/.test(content)
  ) {
    return deny("クライアントコンポーネントからサーバ秘密へ触れている。");
  }
  allow();
});
'
