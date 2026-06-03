// 「このリポはどこから読めばいいか」を、依存データだけから機械的に出す。
//
// AI は使わない。新しい解析も要らない。analyze.ts が既に数えている
// importCount（このファイルが何を import するか）と
// importedByCount（このファイルが何から import されるか）だけで、
// リポを読むときのセオリー＝「入口・土台・葉」を判定できる。

import type { RepoGraph, FileNode } from "./types";

/** なぜここを読むべきかの理由キー（表示時に i18n で訳す）。 */
export type ReasonKey =
  | "entry-no-importer" // どこからも import されない＝ここから始まる
  | "entry-public" // 公開エントリらしいファイル
  | "foundation-deps" // N 個のファイルが依存（count を使う）
  | "leaf-standalone"; // 何も import しない単独の部品

/** 読む順ガイドの1項目。理由は言語非依存のキー＋数値で持つ。 */
export interface GuideEntry {
  path: string;
  /** なぜここを読むべきか（表示時に i18n で訳すキー）。 */
  reasonKey: ReasonKey;
  /** foundation-deps の被参照数など、理由文に埋める数値。 */
  count?: number;
}

/** リポを読むための3つの切り口。 */
export interface ReadingGuide {
  /** 入口＝実行の起点。誰からも import されないが何かを import するファイル。 */
  entrypoints: GuideEntry[];
  /** 土台＝多くから import される核。これを理解すると全体が分かる。 */
  foundations: GuideEntry[];
  /** 葉＝何も import しない末端部品。単独で読めるので後回しでよい。 */
  leaves: GuideEntry[];
}

// 入口らしい名前（同点なら優先して上に出す）。実行の起点になりやすい慣習名。
const ENTRY_NAME = /(^|\/)(index|main|app|page|server|cli)\.\w+$/;

// テスト類は「被参照0」になりがちだが、ユーザーが読みたい「入口」ではない。
// 入口候補からは外す（土台・葉には残す）。
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i;
const TEST_FILE = /\.(test|spec)\.\w+$/;

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * 依存グラフから「読む順ガイド」を作る。
 * 各カテゴリは多い順に最大 maxPerSection 件。
 */
export function buildReadingGuide(
  graph: RepoGraph,
  maxPerSection = 5,
): ReadingGuide {
  const nodes = graph.nodes;

  // 入口: 被参照0かつ何かを import している（＝呼ばれないが処理を始める側）。
  // ただしテストは「入口」として読みたいものではないので除外する。
  const isTest = (p: string) => TEST_PATH.test(p) || TEST_FILE.test(p);
  let entryNodes = nodes.filter(
    (n) => n.importedByCount === 0 && n.importCount > 0 && !isTest(n.path),
  );
  // ライブラリでは公開 index が他から import されるため「被参照0の入口」が
  // 0 件になりがち。その場合は慣習名（index/main 等・非テスト）で import が
  // 多いものを入口として拾う（例: ky の source/index.ts）。
  if (entryNodes.length === 0) {
    entryNodes = nodes.filter(
      (n) => ENTRY_NAME.test(n.path) && n.importCount > 0 && !isTest(n.path),
    );
  }
  const entrypoints = entryNodes
    .sort(byEntryLikeliness)
    .slice(0, maxPerSection)
    .map((n) => ({
      path: n.path,
      reasonKey: (n.importedByCount === 0
        ? "entry-no-importer"
        : "entry-public") as ReasonKey,
    }));

  // 土台: 被参照が多い順。1件以上参照されているものだけ。
  const foundations = [...nodes]
    .filter((n) => n.importedByCount > 0)
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, maxPerSection)
    .map((n) => ({
      path: n.path,
      reasonKey: "foundation-deps" as ReasonKey,
      count: n.importedByCount,
    }));

  // 葉: 何も import しない＝単独で読める部品。被参照が少ない順に出す。
  const leaves = nodes
    .filter((n) => n.importCount === 0)
    .sort((a, b) => a.importedByCount - b.importedByCount)
    .slice(0, maxPerSection)
    .map((n) => ({
      path: n.path,
      reasonKey: "leaf-standalone" as ReasonKey,
    }));

  return { entrypoints, foundations, leaves };
}

/** 入口候補の並べ替え: 慣習名を優先、その次は import 数が多い順。 */
function byEntryLikeliness(a: FileNode, b: FileNode): number {
  const an = ENTRY_NAME.test(a.path) ? 1 : 0;
  const bn = ENTRY_NAME.test(b.path) ? 1 : 0;
  if (an !== bn) return bn - an;
  return b.importCount - a.importCount;
}

export { basename as guideBasename };
