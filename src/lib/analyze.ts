import { Project, SourceFile } from "ts-morph";
import type { RepoFile } from "./github";
import type { RepoGraph, FileNode, DependencyEdge } from "./types";
import {
  detectLanguage,
  pythonImports,
  goImports,
  rustImports,
} from "./languages";

/** import 先候補に試す拡張子（拡張子なし import の解決用）。 */
const RESOLVE_EXT = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

/**
 * リポのファイル群を AST 解析し、ファイル間の依存グラフを作る。
 * AI は使わない。import 文を辿るだけで「誰が誰を呼ぶか」は確定的に分かる。
 */
export function analyzeRepo(
  repo: string,
  files: RepoFile[],
  goModule: string | null = null,
): RepoGraph {
  const pathSet = new Set(files.map((f) => f.path));
  const edgeSet = new Set<string>(); // "from\tto" で重複排除
  const edges: DependencyEdge[] = [];

  const addEdge = (from: string, to: string) => {
    if (to === from) return;
    const key = `${from}\t${to}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to });
  };

  // 言語ごとに解析方法を分ける。
  const jsFiles = files.filter((f) => detectLanguage(f.path) === "js");
  const pyFiles = files.filter((f) => detectLanguage(f.path) === "python");
  const goFiles = files.filter((f) => detectLanguage(f.path) === "go");
  const rsFiles = files.filter((f) => detectLanguage(f.path) === "rust");

  // JS/TS: ts-morph で正確に AST 解析。
  if (jsFiles.length > 0) {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true },
      skipAddingFilesFromTsConfig: true,
    });
    for (const f of jsFiles) {
      project.createSourceFile(f.path, f.content, { overwrite: true });
    }
    for (const sf of project.getSourceFiles()) {
      const fromPath = sf.getFilePath().replace(/^\//, "");
      for (const spec of getImportSpecifiers(sf)) {
        // 相対 import のみ解決対象（外部パッケージはグラフに出さない）
        if (!spec.startsWith(".")) continue;
        const resolved = resolveRelative(fromPath, spec, pathSet);
        if (resolved) addEdge(fromPath, resolved);
      }
    }
  }

  // Python: 正規表現で import 行を拾う軽量解析。
  for (const f of pyFiles) {
    for (const target of pythonImports(f.path, f.content, pathSet)) {
      addEdge(f.path, target);
    }
  }

  // Go: import パス（パッケージ＝ディレクトリ）を module 名で解決。
  for (const f of goFiles) {
    for (const target of goImports(f.content, goModule, pathSet)) {
      addEdge(f.path, target);
    }
  }

  // Rust: mod / use crate:: を同リポ内のファイルに解決。
  for (const f of rsFiles) {
    for (const target of rustImports(f.path, f.content, pathSet)) {
      addEdge(f.path, target);
    }
  }

  const nodes = buildNodes(files, edges);

  return {
    repo,
    nodes,
    edges,
    fileCount: files.length,
    skippedCount: 0,
  };
}

/** import / export ... from / 動的 import の指定子を集める。 */
function getImportSpecifiers(sf: SourceFile): string[] {
  const specs: string[] = [];
  for (const imp of sf.getImportDeclarations()) {
    specs.push(imp.getModuleSpecifierValue());
  }
  // re-export（export { x } from "./y"）も依存
  for (const exp of sf.getExportDeclarations()) {
    const v = exp.getModuleSpecifierValue();
    if (v) specs.push(v);
  }
  return specs;
}

/**
 * 相対 import 指定子を、実在するファイルパスに解決する。
 * 例: from="src/app/page.tsx", spec="../lib/foo" → "src/lib/foo.ts"
 */
function resolveRelative(
  fromPath: string,
  spec: string,
  pathSet: Set<string>,
): string | null {
  const fromDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : "";
  const joined = normalizePath(`${fromDir}/${spec}`);

  // そのまま実在するか
  if (pathSet.has(joined)) return joined;
  // 拡張子・index を補って探す
  for (const ext of RESOLVE_EXT) {
    if (pathSet.has(joined + ext)) return joined + ext;
  }
  // TS/ESM 慣習: ソースは .ts だが import は "./foo.js" と書く。
  // 末尾の .js 系を剥がして .ts 系で解決し直す。
  const stripped = joined.replace(/\.(js|jsx|mjs|cjs)$/, "");
  if (stripped !== joined) {
    if (pathSet.has(stripped)) return stripped;
    for (const ext of RESOLVE_EXT) {
      if (pathSet.has(stripped + ext)) return stripped + ext;
    }
  }
  return null;
}

/** ".." や "." を畳んでパスを正規化する。 */
function normalizePath(p: string): string {
  const parts = p.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join("/");
}

/** エッジから各ファイルの参照数・被参照数を集計してノードを作る。 */
function buildNodes(
  files: RepoFile[],
  edges: DependencyEdge[],
): FileNode[] {
  const importCount = new Map<string, number>();
  const importedByCount = new Map<string, number>();

  for (const e of edges) {
    importCount.set(e.from, (importCount.get(e.from) ?? 0) + 1);
    importedByCount.set(e.to, (importedByCount.get(e.to) ?? 0) + 1);
  }

  return files.map((f) => ({
    path: f.path,
    importCount: importCount.get(f.path) ?? 0,
    importedByCount: importedByCount.get(f.path) ?? 0,
  }));
}
