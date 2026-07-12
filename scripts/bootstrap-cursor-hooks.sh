#!/usr/bin/env bash
# Install Cursor project hooks from committed scripts. Run from repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .cursor/hooks

cp scripts/cursor-hooks/guard-bash.sh scripts/cursor-hooks/guard-secrets.sh scripts/cursor-hooks/guard-read.sh .cursor/hooks/

cp .claude/hooks/format.sh .cursor/hooks/format.sh
sed -i '' 's/j.tool_input&&j.tool_input.file_path/j.file_path/' .cursor/hooks/format.sh 2>/dev/null || \
  sed -i 's/j.tool_input&&j.tool_input.file_path/j.file_path/' .cursor/hooks/format.sh

cp .claude/hooks/verify.sh .cursor/hooks/verify-typecheck.sh
sed -i '' 's/stop_hook_active/loop_count/' .cursor/hooks/verify-typecheck.sh 2>/dev/null || \
  sed -i 's/stop_hook_active/loop_count/' .cursor/hooks/verify-typecheck.sh
sed -i '' 's/\[ "$active" = "true" \]/[ "$active" != "0" ]/' .cursor/hooks/verify-typecheck.sh 2>/dev/null || \
  sed -i 's/\[ "$active" = "true" \]/[ "$active" != "0" ]/' .cursor/hooks/verify-typecheck.sh

cat > .cursor/hooks.json << 'EOF'
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [{ "command": ".cursor/hooks/guard-bash.sh", "timeout": 15, "failClosed": true }],
    "preToolUse": [{ "command": ".cursor/hooks/guard-secrets.sh", "matcher": "Write|StrReplace", "timeout": 15, "failClosed": true }],
    "beforeReadFile": [{ "command": ".cursor/hooks/guard-read.sh", "timeout": 10, "failClosed": true }],
    "afterFileEdit": [{ "command": ".cursor/hooks/format.sh", "timeout": 60 }],
    "stop": [{ "command": ".cursor/hooks/verify-typecheck.sh", "timeout": 300, "loop_limit": 1 }]
  }
}
EOF

chmod +x .cursor/hooks/*.sh
echo "Done. Restart Cursor if hooks were cached."
