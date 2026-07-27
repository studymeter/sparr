#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) — auto-format the touched file (best-effort).
# PostToolUse cannot block, so failures here never stop work.
raw="$(cat)"
fp="$(printf '%s' "$raw" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input&&j.tool_input.file_path)||""));}
    catch(e){process.stdout.write("");}
  });' 2>/dev/null)"
[ -z "$fp" ] && exit 0
[ -f "$fp" ] || exit 0
case "$fp" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.css|*.scss)
    npx --yes prettier --write "$fp" >/dev/null 2>&1 || true ;;
esac
exit 0
