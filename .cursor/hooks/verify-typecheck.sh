#!/usr/bin/env bash
# Stop — don't let the turn end with broken types or lint errors.
# exit 2 = block the stop (Claude keeps working). loop_count guard avoids loops.
raw="$(cat)"
active="$(printf '%s' "$raw" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);process.stdout.write(String(j.loop_count||false));}
    catch(e){process.stdout.write("false");}
  });' 2>/dev/null)"
[ "$active" != "0" ] && exit 0

[ -f package.json ] || exit 0

if grep -q '"typecheck"' package.json; then
  if ! npm run typecheck >/tmp/cc-typecheck.log 2>&1; then
    echo "❌ 未完了: 型チェックが通っていない。完了とする前に直すこと。" >&2
    echo "---- tsc output (tail) ----" >&2
    tail -n 30 /tmp/cc-typecheck.log >&2
    exit 2
  fi
fi

if grep -q '"lint"' package.json; then
  if ! npm run lint >/tmp/cc-lint.log 2>&1; then
    echo "❌ 未完了: Lint が通っていない。完了とする前に直すこと。" >&2
    echo "---- lint output (tail) ----" >&2
    tail -n 30 /tmp/cc-lint.log >&2
    exit 2
  fi
fi

exit 0
