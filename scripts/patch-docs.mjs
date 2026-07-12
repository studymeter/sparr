import fs from "fs";

let readme = fs.readFileSync("README.md", "utf8");

readme = readme.replace(
  "chmod +x .claude/hooks/*.sh  # AI/コミット前のセキュリティフックを有効化",
  "chmod +x .claude/hooks/*.sh   # Claude Code: 実行前ブロックフック\nbash scripts/bootstrap-cursor-hooks.sh   # Cursor: ルール + hooks をセットアップ"
);

readme = readme.replace(
  "- Claude Code を使うなら、セキュリティレビュー用プラグインを入れる：\n  `/plugin install security-guidance@claude-plugins-official` → `/reload-plugins`\n- 前提：Node 20+ ／（プラグイン利用時）Python 3.8+",
  "- **Claude Code** … セキュリティレビュー用プラグイン:\n  `/plugin install security-guidance@claude-plugins-official` → `/reload-plugins`\n- **Cursor** … `.cursor/rules/*.mdc` は clone 済み。bootstrap 後は Cursor を再起動し、\n  Settings → Hooks で Project Hooks を確認\n- 前提：Node 20+ ／（Claude プラグイン利用時）Python 3.8+"
);

readme = readme.replace(
  "- **指針**：`CLAUDE.md`（AIが必ず読む共通ルール）\n- **ローカル遮断**：`.claude/hooks/*`（秘密漏洩・危険コマンドを実行前にブロック）＋\n  `.husky/*`（コミット/プッシュ前に型・Lint・セキュリティ確認）",
  "- **指針**：`CLAUDE.md`（全AIツール共通）＋ `.cursor/rules/*.mdc`（Cursor 向け要約）\n- **ローカル遮断（Claude Code）**：`.claude/hooks/*`（秘密漏洩・危険コマンドを実行前にブロック）\n- **ローカル遮断（Cursor）**：`.cursor/hooks/*`（上記と同種のガード）\n- **Git フック**：`.husky/*`（コミット/プッシュ前に型・Lint・セキュリティ確認）"
);

readme = readme.replace(
  "- **AIレビュー**：security-guidance プラグイン（脆弱性を検出・修正。助言・非ブロック）",
  "- **AIレビュー**：security-guidance プラグイン（Claude Code。脆弱性を検出・修正。助言・非ブロック）"
);

readme = readme.replace(
  "CLAUDE.md                        AI（Claude Code）向けの指針・セキュリティ要件\nSECURITY-SETUP.md                セキュリティ運用の導入手順・ブランチ保護・限界\n.claude/                         AIフック（実行前ブロック）＋ セキュリティ設定",
  "CLAUDE.md                        AI向け指針・セキュリティ要件（Claude Code / Cursor 共通の正本）\nSECURITY-SETUP.md                セキュリティ運用の導入手順・限界（OSS 向け）\n.cursor/rules/*.mdc                Cursor プロジェクトルール（CLAUDE.md へのポインタ）\n.cursor/hooks.json + hooks/      Cursor ローカルブロック（秘密・危険コマンド等）\n.claude/                         Claude Code フック ＋ セキュリティ設定"
);

readme = readme.replace(
  ".husky/                          Gitフック（commit/push 前のローカルチェック）",
  ".husky/                          Gitフック（commit/push 前のローカルチェック）\nscripts/bootstrap-cursor-hooks.sh  Cursor hooks の初回セットアップ"
);

fs.writeFileSync("README.md", readme);

let claudeMd = fs.readFileSync("CLAUDE.md", "utf8");
claudeMd = claudeMd.replace(
  "- `.claude/settings.json`／`.claude/hooks/*` … セキュリティ/検証フック（**触らない**）。\n- `.claude/claude-security-guidance.md`",
  "- `.claude/settings.json`／`.claude/hooks/*` … セキュリティ/検証フック（**触らない**）。\n- `.cursor/rules/*.mdc` … Cursor 向けプロジェクトルール（正本は `CLAUDE.md`。**内容をここだけで変えない**）。\n- `.cursor/hooks.json`／`.cursor/hooks/*` … Cursor ローカルブロック（**触らない**）。\n- `.claude/claude-security-guidance.md`"
);
fs.writeFileSync("CLAUDE.md", claudeMd);

let bootstrap = fs.readFileSync("scripts/bootstrap-cursor-hooks.sh", "utf8");
bootstrap = bootstrap.split('"./hooks/').join('".cursor/hooks/');
bootstrap = bootstrap.replace(
  '"matcher": "Write"',
  '"matcher": "Write|StrReplace"'
);
fs.writeFileSync("scripts/bootstrap-cursor-hooks.sh", bootstrap);

const hj = JSON.parse(fs.readFileSync(".cursor/hooks.json", "utf8"));
for (const hook of hj.hooks.preToolUse || []) hook.matcher = "Write|StrReplace";
fs.writeFileSync(".cursor/hooks.json", JSON.stringify(hj, null, 2) + "\n");

console.log("patch-docs: OK");
