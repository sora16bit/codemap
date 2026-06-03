// CodeMap のコアデータ構造。
// 「どのファイルがどのファイルを呼んでいるか」を表す依存グラフ。
// AI は一切使わない。AST 解析の結果だけでここまで作る。

/** 1ファイルを表すノード */
export interface FileNode {
  /** リポジトリルートからの相対パス（例: src/app/page.tsx） */
  path: string;
  /** import 文の数（このファイルが他をどれだけ参照しているか） */
  importCount: number;
  /** このファイルを import しているファイル数（被参照数＝重要度の目安） */
  importedByCount: number;
}

/** ファイル間の依存（A が B を import している） */
export interface DependencyEdge {
  /** import している側のパス */
  from: string;
  /** import されている側のパス */
  to: string;
}

/** リポジトリ全体の解析結果 */
export interface RepoGraph {
  /** owner/repo 形式 */
  repo: string;
  nodes: FileNode[];
  edges: DependencyEdge[];
  /** 解析対象になったファイル総数 */
  fileCount: number;
  /** 解析できなかった・スキップしたファイル数 */
  skippedCount: number;
}
