// アプリ全体のデータモデル（DBなし・クライアント保持）。
// 1プレイ分の「シナリオインスタンス」。Store の SCENARIO/PERSONA（プロンプト）から
// 共通プロンプトが毎回生成する。シナリオ非依存（汎用）であることが要件。

export type DocSource = "initial" | "generated";

export type Doc = {
  id: string;
  title: string;
  body: string;
  source: DocSource;
};

// 各キャラが「真因（rootCause）」にどれだけ近いか。どのシナリオでも
// 「相手がどこまで本音/事実を出すか」の度合いとして使える汎用概念。
export type RelationToRootCause = "unaware" | "partial" | "hiding";

export type Stakeholder = {
  id: string;
  name: string; // 毎回生成（固定名にしない）
  role: string; // 役割ラベル（シナリオ固有。例: 購買部長 / ユーザー部門 など）
  company: string; // 所属・組織像
  relationToPlayer: string; // プレイヤーから見た関係（例: あなたの上司 / 発注元の担当者）
  situation: string; // そのキャラ視点の状況
  relationToRootCause: RelationToRootCause;
  persona: string; // 性格・話し方
  goal: string; // その人物の目的
  moodStart: number; // 開始時の機嫌（内部値・UIに出さない）
  openingInstruction: string; // 「最初の一言はキャラ自身に言わせる」指示文
  voiceCode: string; // 音声（PERSONA から引き継ぐ・AI生成しない）
  docToolEnabled: boolean; // 資料生成ツールを使えるか（PERSONA から引き継ぐ）
};

export type Project = {
  scenarioId: string; // 元になった SCENARIO の id（結果記録などに使う）
  title: string;
  situation: string;
  rootCause: string; // この回の真因（内部値・UIに出さない。challenge_prompt から生成）
  rubric: string; // 採点の指針（SCENARIO の rubric_prompt をそのまま保持・内部値）
  documents: Doc[];
  briefing: Briefing; // 起動直後に出す状況説明（ゴールは書かない・状況だけ）
};

// 起動直後のブリーフィング（概要＋今朝のトラブル）。
// ゴール（○○せよ）は書かない。状況だけ置く（不可侵ルール）。
export type Briefing = {
  overview: string; // 概要（プレイヤー向けの素の説明・2〜4文）
  trouble: string; // 今朝起きたこと＝発端（2〜4文）
};

// 1コールぶんの書き起こしの1発話
export type CallTurn = { role: "user" | "assistant"; text: string };

// 各ステークホルダーとの通話履歴（複数回ぶんを連結）。会話の記憶として使う。
export type CallLogs = Record<string, CallTurn[]>;

export type GameState = {
  project: Project;
  stakeholders: Stakeholder[];
  callLogs: CallLogs; // stakeholderId -> 過去のやり取り
};

// セットアップAPIが返す生のJSON形。title/situation/rootCause/briefing/documents/
// stakeholders は AI が生成し、scenarioId/rubric はサーバが SCENARIO から付与する。
export type SetupResponse = {
  project: {
    scenarioId: string;
    title: string;
    situation: string;
    rootCause: string;
    rubric: string;
  };
  briefing: Briefing;
  documents: Array<{
    title: string;
    body: string;
    kind?: string; // 種別ヒント（plan/requirements/issues/backlog/email など）
  }>;
  stakeholders: Array<{
    role: string;
    name: string;
    company: string;
    relationToPlayer: string;
    situation: string;
    relationToRootCause: RelationToRootCause;
    persona: string;
    goal: string;
    moodStart: number;
    openingInstruction: string;
    voiceCode: string;
    docToolEnabled: boolean;
  }>;
};
