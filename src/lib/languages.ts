// 言語ごとの「依存の取り出し方」を定義する。
//
// JS/TS は ts-morph で正確に AST 解析する。
// それ以外（Python など）は正規表現で import 行を拾う軽量方式。
// 精度は落ちるが「ファイルの繋がりの地図」を描くには十分で、
// 同じ仕組みで Go / Rust など他言語も後から足せる。

export type Language = "js" | "python" | "go" | "rust";

/** 拡張子からどの言語として解析するかを判定する。未対応なら null。 */
export function detectLanguage(path: string): Language | null {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) return "js";
  if (/\.py$/.test(path)) return "python";
  if (/\.go$/.test(path)) return "go";
  if (/\.rs$/.test(path)) return "rust";
  return null;
}

/**
 * 地図に載せるソースファイルの拡張子（github.ts のフィルタ用）。
 *
 * ここは「ファイルを拾うか」の基準で、「依存線を引けるか」とは別。
 * detectLanguage が返せる JS/Python は import を辿って依存線も引くが、
 * それ以外（Go/Rust/Java など）は依存線は引けなくても、箱（ディレクトリ
 * 可視化）・読む順ガイド・役割ヒントはファイル名/パスだけで出せる＝言語非依存。
 * 純 Go リポで「0件」になったり、混在リポで Go 部分だけ地図から消える
 * （＝半分欠けた地図）のを防ぐため、主要言語の拡張子を広く拾う。
 */
export const SOURCE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|c|h|cpp|cc|hpp|cs|swift|scala|sh|vue|svelte)$/;

// ── Python ──────────────────────────────────────────────

/**
 * Python ファイルから「同じリポ内の別ファイルへの依存」を抽出する。
 * 戻り値は解決済みの相対パス（リポルートからの）の配列。
 *
 * 扱う構文:
 *   from .foo import x        → 同階層の foo
 *   from ..pkg.mod import x   → 2つ上の pkg/mod
 *   from . import sibling     → 同階層の sibling
 *   import pkg.mod            → ルートからの pkg/mod（絶対 import の一部を拾う）
 *
 * pathSet に実在するものだけ返す（標準ライブラリや外部パッケージは自然に除外される）。
 */
export function pythonImports(
  fromPath: string,
  content: string,
  pathSet: Set<string>,
): string[] {
  const results = new Set<string>();
  const fromDir = dirOf(fromPath);

  // コメント・文字列内の擬似 import を完全には排除しないが、
  // 行頭（インデント含む）の import/from だけ見るので実害は小さい。
  const lines = content.split("\n");

  for (const raw of lines) {
    const line = raw.trim();

    // from <module> import <names>
    const fromMatch = line.match(/^from\s+(\.*)([\w.]*)\s+import\s+(.+)$/);
    if (fromMatch) {
      const dots = fromMatch[1]; // 先頭のドット（相対の深さ）
      const mod = fromMatch[2]; // ドット区切りモジュール（空のこともある）
      const names = fromMatch[3]; // import する名前たち

      if (dots) {
        // 相対 import: ドットの数だけ階層を上がる
        const base = ascend(fromDir, dots.length);
        if (mod) {
          // from .pkg.mod import x  → base/pkg/mod
          addPythonTarget(base, mod.replace(/\./g, "/"), pathSet, results);
        } else {
          // from . import a, b  → base/a, base/b（各名前が兄弟モジュール）
          for (const name of splitImportNames(names)) {
            addPythonTarget(base, name, pathSet, results);
          }
        }
      } else if (mod) {
        // from pkg.mod import x（絶対）→ ルートから pkg/mod
        addPythonTarget("", mod.replace(/\./g, "/"), pathSet, results);
      }
      continue;
    }

    // import <module>[, <module>...]
    const importMatch = line.match(/^import\s+(.+)$/);
    if (importMatch) {
      for (const mod of splitImportNames(importMatch[1])) {
        // import a.b.c → ルートから a/b/c（絶対 import の自リポ分だけ拾う）
        addPythonTarget("", mod.replace(/\./g, "/"), pathSet, results);
      }
    }
  }

  results.delete(fromPath); // 自己参照は除外
  return [...results];
}

/** base ディレクトリ＋モジュールパスから、実在する .py / パッケージを探して追加。 */
function addPythonTarget(
  base: string,
  modPath: string,
  pathSet: Set<string>,
  out: Set<string>,
): void {
  const joined = base ? `${base}/${modPath}` : modPath;
  const candidates = [`${joined}.py`, `${joined}/__init__.py`];
  for (const c of candidates) {
    if (pathSet.has(c)) {
      out.add(c);
      return;
    }
  }
}

/** "a, b as c, d" → ["a", "b", "d"]（as 別名・空白を除去）。 */
function splitImportNames(s: string): string[] {
  return s
    .replace(/[()]/g, "") // from x import (a, b) のカッコ
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter((p) => p && p !== "*");
}

/** パスのディレクトリ部分を返す（"a/b/c.py" → "a/b"）。 */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** dir から n-1 階層上がる（Python の相対 import はドット1個＝同階層）。 */
function ascend(dir: string, dotCount: number): string {
  let parts = dir ? dir.split("/") : [];
  // ドット1個 = 同階層なので、上がるのは (dotCount - 1) 回
  for (let i = 0; i < dotCount - 1; i++) parts.pop();
  return parts.join("/");
}

// ── Go ──────────────────────────────────────────────────

/**
 * Go の import から「同じリポ内の別パッケージへの依存」を抽出する。
 *
 * Go の import はパッケージ単位（ディレクトリ）で、ファイル名を含まない。
 * 例: import "github.com/cli/cli/v2/internal/config"
 *     → リポ内の internal/config/ ディレクトリの全 .go ファイルが参照先。
 * モジュール名（go.mod の module 行）を前提に、それを剥がしてディレクトリを得る。
 * モジュール名は呼び出し側で渡す（解析全体で1回 go.mod から取る）。
 *
 * 完璧は狙わない（言語ごとの軽量方式。繋がりの地図が描ければ十分）。
 */
export function goImports(
  content: string,
  modulePath: string | null,
  pathSet: Set<string>,
): string[] {
  const results = new Set<string>();
  // ディレクトリ → そのディレクトリ内の .go ファイル一覧（事前計算）。
  // 毎回作ると重いので呼び出し側でキャッシュしたいが、まずは単純実装。
  const specs = collectGoImportSpecs(content);

  for (const spec of specs) {
    // モジュール名で始まる import だけがリポ内依存（残りは標準/外部）。
    if (!modulePath || !spec.startsWith(modulePath + "/")) continue;
    const dir = spec.slice(modulePath.length + 1); // "internal/config" 等
    // そのディレクトリ直下の .go ファイルを参照先にする。
    // _test.go は他パッケージから import されない（テスト専用）ので除外＝
    // ファイル単位グラフでの水増しを減らす。
    for (const p of pathSet) {
      if (dirOf(p) === dir && p.endsWith(".go") && !p.endsWith("_test.go")) {
        results.add(p);
      }
    }
  }
  return [...results];
}

/** import "x" / import (\n "x"\n "y"\n) の両構文からパスを集める。 */
function collectGoImportSpecs(content: string): string[] {
  const specs: string[] = [];
  // ブロック import: import ( ... )
  const block = content.match(/import\s*\(([\s\S]*?)\)/);
  if (block) {
    for (const line of block[1].split("\n")) {
      const m = line.match(/"([^"]+)"/);
      if (m) specs.push(m[1]);
    }
  }
  // 単行 import: import "x"
  for (const m of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) {
    specs.push(m[1]);
  }
  return specs;
}

/** go.mod の中身から module パス（"github.com/owner/repo"）を取り出す。 */
export function parseGoModule(content: string): string | null {
  const m = content.match(/^\s*module\s+(\S+)/m);
  return m ? m[1] : null;
}

// ── Rust ────────────────────────────────────────────────

/**
 * Rust の mod / use から「同じリポ内の別ファイルへの依存」を抽出する。
 *
 * 扱う構文（軽量・完璧は狙わない）:
 *   mod foo;            → 同階層 foo.rs か foo/mod.rs
 *   use crate::a::b...  → クレートルート（src/）から a/b.rs か a/b/mod.rs か a.rs
 *
 * crate ルートは慣習上 src/ 配下なので、fromPath から src ルートを推測する。
 */
export function rustImports(
  fromPath: string,
  content: string,
  pathSet: Set<string>,
): string[] {
  const results = new Set<string>();
  const fromDir = dirOf(fromPath);
  const crateRoot = fromPath.includes("/src/")
    ? fromPath.slice(0, fromPath.indexOf("/src/") + 4) // ".../src"
    : fromPath.startsWith("src/")
      ? "src"
      : "";

  for (const raw of content.split("\n")) {
    const line = raw.trim();

    // mod foo;  → 同階層の foo.rs / foo/mod.rs
    const mod = line.match(/^(?:pub\s+)?mod\s+(\w+)\s*;/);
    if (mod) {
      addRustTarget(fromDir, mod[1], pathSet, results);
      continue;
    }

    // use crate::a::b::...;  → クレートルートから a/b
    const use = line.match(/^(?:pub\s+)?use\s+crate::([\w:]+)/);
    if (use) {
      const segs = use[1].split("::").filter(Boolean);
      // 末尾は型/関数名のことが多いので、末端を1つ削った階層も試す。
      for (let cut = segs.length; cut >= 1; cut--) {
        const modPath = segs.slice(0, cut).join("/");
        const before = results.size;
        addRustTarget(crateRoot, modPath, pathSet, results);
        if (results.size > before) break; // 当たったら止める
      }
    }
  }
  results.delete(fromPath);
  return [...results];
}

/** base からの modPath を foo.rs / foo/mod.rs として探して追加。 */
function addRustTarget(
  base: string,
  modPath: string,
  pathSet: Set<string>,
  out: Set<string>,
): void {
  const joined = base ? `${base}/${modPath}` : modPath;
  for (const c of [`${joined}.rs`, `${joined}/mod.rs`]) {
    if (pathSet.has(c)) {
      out.add(c);
      return;
    }
  }
}
