#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) — block secret leakage.
# exit 2 = BLOCK the tool call (required for enforcement). exit 0 = allow.
# Receives the tool call as JSON on stdin. Uses node (always present with
# Claude Code) and FAILS CLOSED: if parsing breaks, it blocks rather than allows.
set -uo pipefail

raw="$(cat)"

read_field() { # $1 = JS expression returning a string
  printf '%s' "$raw" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const j=JSON.parse(s);const ti=j.tool_input||{};
        process.stdout.write(String(('"$1"')||""));}
      catch(e){process.stderr.write("PARSE_FAIL");process.exit(3);}
    });' 2>/tmp/cc-gs.err
}

block() { echo "🚫 BLOCKED (secrets): $1" >&2; exit 2; }

fp="$(read_field 'ti.file_path')"
if [ "$(cat /tmp/cc-gs.err 2>/dev/null)" = "PARSE_FAIL" ]; then
  block "フック入力を解釈できなかった。安全側でブロックする。"
fi
payload="$(read_field 'JSON.stringify(ti)')"

# 1) Editing a real secret file (.env, .env.local, ...). Allow templates.
if printf '%s' "$fp" | grep -qE '(^|/)\.env($|\.)'; then
  if ! printf '%s' "$fp" | grep -qE '\.env\.(example|sample|template)$'; then
    block "$fp は秘密情報ファイル。編集/コミット禁止。鍵名の追加は .env.example へ。"
  fi
fi

# 2) Hardcoded provider secret in the content
printf '%s' "$payload" | grep -qE 'sk-[A-Za-z0-9_-]{20,}' \
  && block "ハードコードされた API キーらしき文字列を検出。.env.local（サーバのみ）を使う。"
printf '%s' "$payload" | grep -qiE '(OPENAI_API_KEY|API_KEY|SECRET|TOKEN|PASSWORD)[^A-Za-z0-9]{0,3}(:|=)[^A-Za-z0-9]{0,3}.{8,}' \
  && block "秘密情報のハードコードらしき記述を検出。環境変数で扱う。"

# 3) Secret reaching the client via NEXT_PUBLIC_
printf '%s' "$payload" | grep -qiE 'NEXT_PUBLIC_[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)' \
  && block "NEXT_PUBLIC_ で秘密情報をクライアントへ露出させない。OpenAIキーはサーバのみ、クライアントは ephemeral key 経由。"

# 4) Standard server secret referenced from a client component
if printf '%s' "$payload" | grep -q 'use client' \
   && printf '%s' "$payload" | grep -qE 'process\.env\.(OPENAI_API_KEY|[A-Z0-9_]*SECRET[A-Z0-9_]*|[A-Z0-9_]*API_KEY)'; then
  block '"use client" のファイルからサーバ秘密(process.env)へ触れている。秘密処理は app/api/** に置く。'
fi

exit 0
