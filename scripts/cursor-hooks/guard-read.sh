#!/usr/bin/env bash
set -uo pipefail
raw="$(cat)"
fp="$(printf '%s' "$raw" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.file_path||""));}catch{process.exit(3);}});')"
if printf '%s' "$fp" | grep -qE '(^|/)\.env($|\.)' && ! printf '%s' "$fp" | grep -qE '\.env\.(example|sample|template)$'; then
  echo '{"permission":"deny","user_message":".env は読み取り禁止。"}'; exit 2
fi
echo '{"permission":"allow"}'
