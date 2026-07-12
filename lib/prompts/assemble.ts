// 各キャラ最終 system prompt の組み立て。
// 最終 = common_base（地）＋ 役割ブロック ＋ 個別生成ブロック ＋ 会話の記憶 ＋ 横断ドシエ。
// 章は廃止。3人に好きな順で何度でもコールできる前提で、毎回その時点の世界状態を注入する。
// 真因・隠し事実・mood は instructions の内部メモとしてのみ渡し、「出力するな」と縛る。

import { COMMON_BASE } from "./commonBase";
import {
  DOSSIER_BODY_PREVIEW_CHARS,
  DOSSIER_CROSS_TURNS,
  MEMORY_MAX_TURNS,
} from "../constants";
import type { CallLogs, CallTurn, Doc, Project, Stakeholder } from "../types";

// role は PERSONA 由来の自由ラベル（シナリオ固有）。そのまま表示に使う。
function roleLabel(role: Stakeholder["role"]): string {
  return role;
}

function personaBlock(stakeholder: Stakeholder, project: Project): string {
  return `# このキャラの個別設定（毎回生成・このプレイ固有）
- 氏名: ${stakeholder.name}
- 立場: ${roleLabel(stakeholder.role)}
- 所属/業種像: ${stakeholder.company}
- 案件: ${project.title}
- 全体状況: ${project.situation}
- このキャラ視点の状況: ${stakeholder.situation}
- 性格・話し方: ${stakeholder.persona}
- この場面での目的: ${stakeholder.goal}

# 内部状態（出力しない・態度に滲ませるだけ）
- 開始時の機嫌/怒りレベル: ${stakeholder.moodStart}/10
- これは数値として絶対に口にしない。言葉と温度でだけ表す。

# 最初の一言
- ${stakeholder.openingInstruction}
- 第一声はあなた自身が決める。固定の台詞をなぞらない。`;
}

// 真因への距離（relationToRootCause）に応じた「知っていること／出し方」。
// 役割のハードコードをやめ、rootCause と各キャラの persona/goal（personaBlock 側）で汎用に駆動する。
function disclosureBlock(stakeholder: Stakeholder, project: Project): string {
  const docTool = stakeholder.docToolEnabled
    ? `
- 資料・調査を明確に依頼されたら create_work_document 関数を呼んで着手し、「まとめておきます」と口頭でも応じる。理由なく拒否し続けない。`
    : "";
  switch (stakeholder.relationToRootCause) {
    case "hiding":
      return `# 真因について（あなたは知っているが隠す・内部メモ。数値や設定として出力しない）
- 真因: ${project.rootCause}
- あなたはこれを知っている。だが自分に分が悪い話なので、自分からは認めたくない。
- 最初は楽観・一般論・「問題ないはず」でかわす。自分から核心（真因そのもの）を口にしない。
- だが具体（どの条件で・どのデータで・どこの話か）を突かれたり、強く指示されると、少しずつ綻び、最終的に認める。${docTool}`;
    case "partial":
      return `# 真因について（部分的にしか知らない）
- あなたは状況の断片は把握しているが、核心（真因）は分かっていない。分からないことは分からないと言う。
- 自分から真因を言い当てない。自分の立場・責任の観点から、PMに結論や説明材料を求める圧をかける。${docTool}`;
    case "unaware":
    default:
      return `# 真因について（知らない）
- あなたは根本原因を知らない。困っている事実・不満だけを訴える。
- 自分から原因や解決策を言わない。「で、どうするの?」と相手（PM）に考えさせ、答えを迫る。
- 具体的で現実的な方針が出るまで納得しない。${docTool}`;
  }
}

// 急に態度を変えさせないために渡す記憶ブロック。
function memoryBlock(history: CallTurn[], selfName: string): string {
  if (!history || history.length === 0) {
    return `# この相手との通話履歴
- まだ話していない。これが最初のコール。`;
  }
  const recent = history.slice(-MEMORY_MAX_TURNS);
  const lines = recent
    .map(
      (turn) => `${turn.role === "user" ? "PM" : selfName}: ${turn.text.trim()}`
    )
    .join("\n");
  return `# この相手との通話履歴（あなたはこれを覚えている）
${lines}

- 上記を踏まえて続ける。前回からの温度・関係を引き継ぎ、急に機嫌を戻したり忘れたりしない。
- 既に出た話を蒸し返しすぎない。前回の約束や発言と食い違えば指摘する。`;
}

// 横断ドシエ：入手済み資料＋他の人に何を言ったか。準備と一貫性が効く。
function dossierBlock(
  documents: Doc[],
  callLogs: CallLogs,
  self: Stakeholder,
  all: Stakeholder[]
): string {
  const generated = documents.filter((doc) => doc.source === "generated");
  const docPart =
    generated.length === 0
      ? "- PMはまだ開発メンバーから裏取りの資料を得ていない。"
      : generated
          .map(
            (doc) =>
              `- 「${doc.title}」: ${doc.body.slice(0, DOSSIER_BODY_PREVIEW_CHARS)}`
          )
          .join("\n");

  const others = all.filter((stakeholder) => stakeholder.id !== self.id);
  const otherParts: string[] = [];
  for (const other of others) {
    const log = callLogs[other.id];
    if (log && log.length > 0) {
      const tail = log
        .slice(-DOSSIER_CROSS_TURNS)
        .map(
          (turn) =>
            `${turn.role === "user" ? "PM" : other.name}: ${turn.text.trim()}`
        )
        .join(" / ");
      otherParts.push(
        `- ${other.name}（${roleLabel(other.role)}）とのやり取り: ${tail}`
      );
    }
  }
  const crossPart =
    otherParts.length > 0
      ? otherParts.join("\n")
      : "- 他の関係者とのやり取りはまだ伝わってきていない。";

  return `# 把握している周辺情報（内部メモ・出力しない／態度や突っ込みに活かす）
## PMが入手している資料
${docPart}

## 社内で漏れ聞こえている、PMと他の関係者のやり取り
${crossPart}

- PMの説明がこれらと整合していれば信用してよい。食い違えば「さっきと違う」「上にはこう言ったらしいが?」等と突くこと。
- ただし、あなたが直接は知り得ない内部情報（真因そのもの等）を自分から口にしない。`;
}

export type AssembleContext = {
  callLogs: CallLogs; // 全員の履歴（この相手の記憶＋横断ドシエ）
  stakeholders: Stakeholder[]; // 横断ドシエ用の全員
};

export function assembleSystemPrompt(
  stakeholder: Stakeholder,
  project: Project,
  ctx: AssembleContext
): string {
  const history = ctx.callLogs[stakeholder.id] ?? [];
  return [
    COMMON_BASE,
    "",
    "---",
    "",
    personaBlock(stakeholder, project),
    "",
    "---",
    "",
    disclosureBlock(stakeholder, project),
    "",
    "---",
    "",
    memoryBlock(history, stakeholder.name),
    "",
    "---",
    "",
    dossierBlock(
      project.documents,
      ctx.callLogs,
      stakeholder,
      ctx.stakeholders
    ),
    "",
    "---",
    "",
    CALL_ENDING_BLOCK,
  ].join("\n");
}

// 通話の終わり方（全キャラ共通）。自分で切断はしない。区切りを発話でつけるだけ。
const CALL_ENDING_BLOCK = `# 通話の終わり方
- 用件が済んだ、これ以上話しても進まない、相手（PM）が「ありがとう」「また連絡する」等で締めにきた、と感じたら、ダラダラ続けない。
- そのときは、あなたのキャラらしい短い締めの一言（「じゃあ、そういうことで」「とりあえず、よろしく」など）を言って、会話に区切りをつける。
- ただし通話を切る操作は相手（PM）がやる。あなたは電話を切らない。締めたあとは、相手が続ければ普通に応じる。
- 用件の途中・相手がまだ食い下がっている最中には締めない。`;
