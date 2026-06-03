import { Project, SourceFile, ts } from "ts-morph";
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
  tsconfigContent: string | null = null,
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
    // tsconfig の paths エイリアス（@/* → src/* 等）を読む。
    // モダンな TS/Next.js は相対 import でなくエイリアスで繋ぐので、
    // これを解決しないと依存エッジが張れず「全部末端」に見える。
    // tsconfig は SOURCE_EXT に含まれずファイル一覧に来ないので、取得側から別途渡す。
    const aliases = parseTsconfigAliases(tsconfigContent);

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
        if (spec.startsWith(".")) {
          // 相対 import
          const resolved = resolveRelative(fromPath, spec, pathSet);
          if (resolved) addEdge(fromPath, resolved);
        } else {
          // エイリアス（@/lib/foo 等）をリポ内パスに展開して解決を試みる。
          // マッチしなければ外部パッケージ＝グラフに出さない。
          const expanded = expandAlias(spec, aliases);
          if (expanded) {
            const resolved = resolveBare(expanded, pathSet);
            if (resolved) addEdge(fromPath, resolved);
          }
        }
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

/**
 * 既にリポルート相対のパス（エイリアス展開後）を、拡張子・index 補完で解決する。
 * 例: "src/lib/posts" → "src/lib/posts.ts"。
 */
function resolveBare(repoRelPath: string, pathSet: Set<string>): string | null {
  const joined = normalizePath(repoRelPath);
  if (pathSet.has(joined)) return joined;
  for (const ext of RESOLVE_EXT) {
    if (pathSet.has(joined + ext)) return joined + ext;
  }
  const stripped = joined.replace(/\.(js|jsx|mjs|cjs)$/, "");
  if (stripped !== joined) {
    if (pathSet.has(stripped)) return stripped;
    for (const ext of RESOLVE_EXT) {
      if (pathSet.has(stripped + ext)) return stripped + ext;
    }
  }
  return null;
}

/**
 * tsconfig.json の中身（文字列）の compilerOptions.paths からエイリアス表を作る。
 * 例: { "@/*": ["./src/*"] } → [{ prefix: "@/", target: "src/" }]。
 * 末尾 /* のワイルドカード形式のみ対応（最頻出。完璧は狙わない方針）。
 * tsconfig が無い/壊れている場合は空配列（＝従来通り相対のみ）。
 *
 * パースは TypeScript 公式の parseConfigFileTextToJson を使う。tsconfig は JSONC
 * （コメント・末尾カンマ）かつ paths 値に // や /* を含む（"@/*": ["./src/*"]）ため、
 * 自前の正規表現パーサだと文字列内の /* を誤ってコメント除去して壊す（実測で確認済み）。
 */
function parseTsconfigAliases(
  tsconfigContent: string | null,
): { prefix: string; target: string }[] {
  if (!tsconfigContent) return [];

  const parsed = ts.parseConfigFileTextToJson("tsconfig.json", tsconfigContent);
  if (parsed.error) return [];
  const paths = parsed.config?.compilerOptions?.paths as
    | Record<string, string[]>
    | undefined;
  if (!paths) return [];

  const out: { prefix: string; target: string }[] = [];
  for (const [key, vals] of Object.entries(paths)) {
    if (!key.endsWith("/*") || !Array.isArray(vals) || vals.length === 0) continue;
    const target = vals[0];
    if (typeof target !== "string" || !target.endsWith("/*")) continue;
    out.push({
      prefix: key.slice(0, -1), // "@/*" → "@/"
      // "./src/*" → "src/"。先頭 ./ は剥がす。
      target: target.slice(0, -1).replace(/^\.\//, ""),
    });
  }
  return out;
}

/**
 * import 指定子がエイリアスにマッチすれば、リポ相対パスに展開して返す。
 * 例: spec="@/lib/posts", alias={prefix:"@/", target:"src/"} → "src/lib/posts"。
 * マッチしなければ null（＝外部パッケージ）。
 */
function expandAlias(
  spec: string,
  aliases: { prefix: string; target: string }[],
): string | null {
  for (const { prefix, target } of aliases) {
    if (spec.startsWith(prefix)) {
      return target + spec.slice(prefix.length);
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
