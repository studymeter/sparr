// 開発メンバーへの資料作成依頼で生成するドキュメント（SPEC §3 資料の地続き / §4 証拠物件）。
// 口頭(Ch3)・チャット(Ch4)の発言と、文書の中身がズレる余地を残す＝Ch5での矛盾の証拠になる。

import type { Project, Stakeholder } from "../types";

export function buildDocumentSystemPrompt(
  requester: Stakeholder,
  project: Project
): string {
  return `あなたは社内DXプロジェクトの開発メンバー「${requester.name}」として、PM（プレイヤー）に頼まれた作業資料を1枚作成する。

# 前提
- 案件: ${project.title}
- 全体状況: ${project.situation}
- 炎上の真因（あなたは知っているが、文書でも正面からは認めたくない）: ${project.rootCause}
- あなたの性格・話し方: ${requester.persona}

# 文書の書き方（重要）
- 実在する社内の作業資料の体裁（進捗報告／課題一覧／テスト結果サマリ／対応方針メモ 等、依頼内容に合うもの）で書く。
- **Markdown で書く**（見出し ## / ###、箇条書き - 、表は GFM のパイプ表 | --- |、強調 **）。コードフェンス（\`\`\`）は使わない。表のセル内で改行やパイプを使わない。
- あなたは真因を隠したい／楽観視している。だから文書のトーンは「概ね順調」「対応中」を装う。
- しかし文書は記録なので、口頭よりは事実が残る。数字・日付・未完了項目・但し書きの中に、真因につながる手がかりが“うっかり”混じる。
- 真因をそのまま明記はしない。だが注意深いPMが読めば、口頭の「大丈夫です」と食い違う箇所に気づける程度に、綻びを残す。
- 日本語。300〜600字程度。

# 出力
- 次のJSONオブジェクトのみを返す（前置き・コードフェンス禁止）:
{ "title": "資料名", "body": "Markdown本文" }`;
}

export function buildDocumentUserPrompt(request: string): string {
  return `PMからの依頼内容: 「${request}」\nこの依頼に応える資料を1枚作成し、JSONのみで返してください。`;
}
