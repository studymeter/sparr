#!/usr/bin/env bash
# PreToolUse (Bash) — block dangerous or bypass commands.
# exit 2 = BLOCK. Receives the tool call as JSON on stdin. FAILS CLOSED.
set -uo pipefail

raw="$(cat)"
cmd="$(printf '%s' "$raw" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input&&j.tool_input.command)||""));}
    catch(e){process.stderr.write("PARSE_FAIL");process.exit(3);}
  });' 2>/tmp/cc-gb.err)"

if [ "$(cat /tmp/cc-gb.err 2>/dev/null)" = "PARSE_FAIL" ]; then
  echo "🚫 BLOCKED (bash): フック入力を解釈できなかった。安全側でブロックする。" >&2; exit 2
fi
[ -z "$cmd" ] && exit 0

block() { echo "🚫 BLOCKED (bash): $1" >&2; exit 2; }

printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[A-Za-z]*r[A-Za-z]*[[:space:]]+(/|~|\$HOME|\*)' \
  && block "破壊的な rm（ルート/ホーム/ワイルドカード）。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+commit([[:space:]].*)?[[:space:]](--no-verify|-n)([[:space:]]|$)' \
  && block "git commit --no-verify でフックを飛ばすの禁止。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push([[:space:]].*)?[[:space:]]--no-verify([[:space:]]|$)' \
  && block "git push --no-verify 禁止。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push([[:space:]].*)?[[:space:]](--force|--force-with-lease|-f)([[:space:]]|$)' \
  && block "force push 禁止（履歴破壊・保護ブランチ回避につながる）。"
# ユーザーの明示的な指示なしに commit・push させない。
# .push-authorized が存在するときだけ通す（サイクル終了後に Claude が削除する）。
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+commit([[:space:]]|$)'; then
  [ -f ".push-authorized" ] || block "commit には事前の明示的な指示が必要。ユーザーから「コミットして」「プッシュして」と言われたら最初に .push-authorized を作成してから実行すること。"
fi
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push([[:space:]]|$)'; then
  [ -f ".push-authorized" ] || block "push には事前の明示的な指示が必要。ユーザーから「プッシュして」と言われたら最初に .push-authorized を作成してから実行すること。"
fi
printf '%s' "$cmd" | grep -qE '(curl|wget)[[:space:]].*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh' \
  && block "リモートスクリプトの直接実行（curl|sh）禁止。"
printf '%s' "$cmd" | grep -qE '(cat|less|more|head|tail|bat|nano|vi|vim|code)[[:space:]]+[^|]*\.env($|[[:space:].])' \
  && block ".env の中身を読み出さない。"
printf '%s' "$cmd" | grep -qE '^[[:space:]]*(printenv|env)[[:space:]]*$' \
  && block "環境変数の一括出力は秘密漏洩リスク。必要な変数だけ参照する。"

exit 0
