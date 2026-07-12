#!/usr/bin/env bash
set -uo pipefail
raw="$(cat)"
cmd="$(printf '%s' "$raw" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);process.stdout.write(String(j.command||""));}
    catch(e){process.stderr.write("PARSE_FAIL");process.exit(3);}
  });' 2>/tmp/cursor-gb.err)"
if [ "$(cat /tmp/cursor-gb.err 2>/dev/null)" = "PARSE_FAIL" ]; then
  echo '{"permission":"deny","user_message":"フック入力を解釈できなかった。"}'
  exit 2
fi
[ -z "$cmd" ] && echo '{"permission":"allow"}' && exit 0
deny() { node -e "console.log(JSON.stringify({permission:'deny',user_message:'$1',agent_message:'$1'}))"; exit 2; }
printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[A-Za-z]*r[A-Za-z]*[[:space:]]+(/|~|\$HOME|\*)' && deny "破壊的な rm 禁止。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+commit([[:space:]].*)?[[:space:]](--no-verify|-n)([[:space:]]|$)' && deny "git commit --no-verify 禁止。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push([[:space:]].*)?[[:space:]]--no-verify([[:space:]]|$)' && deny "git push --no-verify 禁止。"
printf '%s' "$cmd" | grep -qE 'git[[:space:]]+push([[:space:]].*)?[[:space:]](--force|--force-with-lease|-f)([[:space:]]|$)' && deny "force push 禁止。"
printf '%s' "$cmd" | grep -qE '(curl|wget)[[:space:]].*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh' && deny "curl|sh 禁止。"
printf '%s' "$cmd" | grep -qE '(cat|less|more|head|tail)[[:space:]]+[^|]*\.env($|[[:space:].])' && deny ".env 読み取り禁止。"
printf '%s' "$cmd" | grep -qE '^[[:space:]]*(printenv|env)[[:space:]]*$' && deny "環境変数一括出力禁止。"
echo '{"permission":"allow"}'
