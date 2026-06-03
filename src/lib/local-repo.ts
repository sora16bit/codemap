// 手元（サーバーのローカル fs）のディレクトリを解析対象として読む。
//
// 用途：未公開リポや開発中のプロジェクトを、GitHub に上げる前に解析する。
// CodeMap で CodeMap 自身を可視化する（ドッグフーディング）のもこれ。
//
// ⚠️ セキュリティ：任意パスを読めると /etc/passwd 等を覗ける。だから
//   - 開発時（NODE_ENV !== production）だけ有効。本番(Vercel)では無効。
//   - 読めるのはプロジェクトルート（process.cwd()）配下だけ。.. で外に出られない。
// あくまで「自分の手元で動かす開発者向け」機能。デプロイ先では使えない。

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { SOURCE_EXT, parseGoModule } from "./languages";
import { IGNORE_DIR, type FetchedRepo, type RepoFile } from "./github";

/** ローカル解析が許可される環境か（開発時のみ）。 */
export function isLocalAnalysisEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * ローカルディレクトリを再帰的に読み、解析対象ファイルを集めて返す。
 * dirInput は省略時 process.cwd()（このプロジェクト自身）。
 * ルート配下に限定し、外への脱出（..）は拒否する。
 */
export async function readLocalRepo(dirInput?: string): Promise<FetchedRepo> {
  if (!isLocalAnalysisEnabled()) {
    throw new Error("ローカル解析は開発時のみ利用できます");
  }

  const root = process.cwd();
  const target = dirInput ? resolve(root, dirInput) : root;

  // ルート配下に閉じ込める（パストラバーサル防止）。
  // target が root と同じか、root 配下でなければ拒否する。
  const rel = relative(root, target);
  if (rel.startsWith("..")) {
    throw new Error("プロジェクトルートの外は解析できません");
  }

  const files: RepoFile[] = [];
  let goModContent: string | null = null;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const relPath = relative(target, abs).split(sep).join("/");

      if (IGNORE_DIR.test(relPath + "/")) continue;

      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        if (relPath === "go.mod") {
          goModContent = await readFile(abs, "utf8");
        } else if (SOURCE_EXT.test(relPath)) {
          // 巨大ファイルは読み飛ばす（メモリ保護）。
          const info = await stat(abs);
          if (info.size > 1_000_000) continue;
          files.push({ path: relPath, content: await readFile(abs, "utf8") });
        }
      }
    }
  }

  await walk(target);

  // 表示名はディレクトリ名（owner/repo の代わり）。
  const name = relative(root, target) || target.split(sep).pop() || "local";
  return {
    repo: `local:${name}`,
    files,
    goModule: goModContent ? parseGoModule(goModContent) : null,
  };
}

/**
 * ローカル解析したファイル1つの中身を読む（/api/file の local: 経路）。
 *
 * name は readLocalRepo が付けた repo 名（"local:" を除いた部分）。
 * 注意：name は経路によって「cwd からの相対パス（dir 指定時）」にも
 * 「ディレクトリのベース名（cwd 自身を解析した時）」にもなる＝ディレクトリ解決の
 * 基準として信用できない。なので解決は cwd 起点で行い、filePath が cwd 配下で
 * 見つかればそれを使う。見つからなければ cwd/name 配下も試す（サブディレクトリ解析）。
 * いずれも cwd 配下に閉じ込める（パストラバーサル防止）。
 */
export async function readLocalFile(
  name: string,
  filePath: string,
): Promise<{ content: string; truncated: boolean }> {
  if (!isLocalAnalysisEnabled()) {
    throw new Error("ローカル解析は開発時のみ利用できます");
  }

  const root = process.cwd();

  // 候補：まず cwd 直下、次に cwd/name 直下（name が実在ディレクトリの場合のみ）。
  const candidates = [resolve(root, filePath)];
  const named = resolve(root, name);
  if (!relative(root, named).startsWith("..")) {
    candidates.push(resolve(named, filePath));
  }

  for (const target of candidates) {
    // cwd 配下に閉じ込める（.. で外に出る候補は捨てる）。
    if (relative(root, target).startsWith("..")) continue;
    const info = await stat(target).catch(() => null);
    if (info?.isFile()) {
      const MAX = 200_000; // 約200KB。/api/file の GitHub 経路と揃える。
      const text = await readFile(target, "utf8");
      const truncated = text.length > MAX;
      return { content: truncated ? text.slice(0, MAX) : text, truncated };
    }
  }

  throw new Error("ファイルが見つかりません");
}
