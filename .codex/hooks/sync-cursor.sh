#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit) — .claude 配下の変更を .cursor へ同期する。
# 自動変換できるものは変換、できないものはリマインダーを出す。
# ブロックしない（常に exit 0）。

raw="$(cat)"
fp="$(printf '%s' "$raw" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input&&j.tool_input.file_path)||""));}
    catch(e){process.stdout.write("");}
  });' 2>/dev/null)"

[ -z "$fp" ] && exit 0

# basename（/ と \ の両方に対応）
base="${fp##*[/\\]}"

# ── .claude/hooks/* の変更 ───────────────────────────────────────────────────
if echo "$fp" | grep -qE '[/\\]\.claude[/\\]hooks[/\\]'; then
  case "$base" in
    format.sh)
      # 両者は同一内容。直コピーで同期。
      cp ".claude/hooks/format.sh" ".cursor/hooks/format.sh" 2>/dev/null
      echo "ℹ️  [cursor-sync] format.sh → .cursor/hooks/format.sh へ同期しました" >&2
      ;;
    verify.sh)
      # guard 変数のみ差異があるため sed で適合してから書き出す。
      # Claude 版: j.stop_hook_active / [ "$active" = "true" ]
      # Cursor 版: j.loop_count      / [ "$active" != "0" ]
      sed \
        -e 's/j\.stop_hook_active/j.loop_count/g' \
        -e 's/stop_hook_active guard/loop_count guard/g' \
        -e 's/\[ "\$active" = "true" \] && exit 0/[ "$active" != "0" ] \&\& exit 0/' \
        ".claude/hooks/verify.sh" > ".cursor/hooks/verify-typecheck.sh" 2>/dev/null
      echo "ℹ️  [cursor-sync] verify.sh → .cursor/hooks/verify-typecheck.sh へ同期しました（guard 変数を適合済み）" >&2
      ;;
    guard-secrets.sh|guard-bash.sh|guard-protected.sh)
      # Claude 版はテキスト出力、Cursor 版は JSON 出力形式のため自動変換不可。
      echo "⚠️  [cursor-sync] $base が変更されました。.cursor/hooks/ の対応ファイルも手動で確認してください（JSON 出力フォーマットが異なります）。" >&2
      ;;
  esac
fi

# ── ルール系ファイルの変更（AI の判断が必要なためリマインダーのみ） ──────────
case "$fp" in
  */CLAUDE.md|*\\CLAUDE.md)
    echo "⚠️  [cursor-sync] CLAUDE.md が変更されました。.cursor/rules/ の該当ルールも確認・更新してください。" >&2
    ;;
  */CODING-GUIDELINES.md|*\\CODING-GUIDELINES.md)
    echo "⚠️  [cursor-sync] CODING-GUIDELINES.md が変更されました。.cursor/rules/50-coding-style.mdc も確認してください。" >&2
    ;;
  */.claude/claude-security-guidance.md|*\\.claude\\claude-security-guidance.md)
    echo "⚠️  [cursor-sync] claude-security-guidance.md が変更されました。.cursor/rules/10-security.mdc も確認してください。" >&2
    ;;
esac

exit 0
