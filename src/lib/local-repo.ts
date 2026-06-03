// 手元（サーバーのローカル fs）のディレクトリを解析対象として読む。
//
// 用途：自分の他プロジェクトや未公開リポを、GitHub に上げる前に解析する。
// CodeMap で CodeMap 自身を可視化する（ドッグフーディング）のもこれ。
//
// ⚠️ セキュリティ（任意パスを読めると秘密鍵や認証情報を覗かれる）。多層で防ぐ：
//   1. 開発時（NODE_ENV !== production）だけ有効。本番(Vercel)では無効。
//   2. 読めるのは「ホームディレクトリ配下」だけ。/etc など外には .. でも出られない。
//   3. ホーム配下でも機密ディレクトリ/ファイル（.ssh, .aws, .env 等）は除外する。
// さらに dev サーバーは localhost 限定で起動する（package.json の dev スクリプト）。
//   → 大学 Wi-Fi 等、同一ネットワークの他人からこの窓口に触れられないようにするため。
// あくまで「自分の手元で動かす開発者向け」機能。デプロイ先では使えない。

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { SOURCE_EXT, parseGoModule } from "./languages";
import { IGNORE_DIR, type FetchedRepo, type RepoFile } from "./github";

/** ローカル解析が許可される環境か（開発時のみ）。 */
export function isLocalAnalysisEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 解析を許可するルート＝ユーザーのホームディレクトリ。ここより外は読ませない。 */
function allowedRoot(): string {
  return resolve(homedir());
}

/** target が許可ルート（ホーム）配下に収まっているか。.. での脱出を弾く。 */
function isWithinAllowedRoot(target: string): boolean {
  const rel = relative(allowedRoot(), resolve(target));
  // rel が空文字（=ホーム自身）か、".." で始まらず絶対パスでもなければ配下。
  return rel === "" || (!rel.startsWith("..") && !resolve(target).startsWith(".."));
}

// ホーム配下でも触らせない機密ディレクトリ/ファイル名。秘密鍵・認証情報・環境変数など。
// パスのどこかにこれらの名前が含まれていたら、その要素ごとスキップする。
const SECRET_NAMES = new Set([
  ".ssh",
  ".aws",
  ".gnupg",
  ".gpg",
  ".kube",
  ".docker",
  ".config", // 各種ツールの認証トークンが入りがち
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".git-credentials",
]);
// 機密を示すファイル名のパターン（.env / .env.local / id_rsa / *.pem / *.key など）。
const SECRET_FILE_RE =
  /(^\.env(\..+)?$|^\.netrc$|^id_(rsa|ed25519|ecdsa|dsa)$|\.pem$|\.key$|\.pfx$|\.p12$|credentials|secret)/i;

/** パス要素のどこかに機密ディレクトリ名が含まれるか。 */
function pathHasSecretDir(absPath: string): boolean {
  const fromHome = relative(allowedRoot(), absPath);
  return fromHome.split(sep).some((seg) => SECRET_NAMES.has(seg));
}

/** このファイル名は機密として除外すべきか。 */
function isSecretFile(name: string): boolean {
  return SECRET_FILE_RE.test(name);
}

/**
 * ローカルディレクトリを再帰的に読み、解析対象ファイルを集めて返す。
 * dirInput は省略時 process.cwd()（このプロジェクト自身）。指定すればホーム配下の
 * 任意プロジェクトを解析できる（絶対パスでも cwd 相対でも可）。
 * ホーム配下に限定し、外への脱出（..）と機密ディレクトリ/ファイルは拒否する。
 */
export async function readLocalRepo(dirInput?: string): Promise<FetchedRepo> {
  if (!isLocalAnalysisEnabled()) {
    throw new Error("ローカル解析は開発時のみ利用できます");
  }

  // dirInput が絶対パスならそのまま、相対なら cwd 起点で解決。省略時は cwd。
  const target = dirInput ? resolve(process.cwd(), dirInput) : process.cwd();

  // ホーム配下に閉じ込める（パストラバーサル防止）。外は読ませない。
  if (!isWithinAllowedRoot(target)) {
    throw new Error("ホームディレクトリの外は解析できません");
  }
  // 機密ディレクトリ自体を解析対象に指定された場合も拒否。
  if (pathHasSecretDir(target)) {
    throw new Error("機密ディレクトリは解析できません");
  }

  const files: RepoFile[] = [];
  let goModContent: string | null = null;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const relPath = relative(target, abs).split(sep).join("/");

      if (IGNORE_DIR.test(relPath + "/")) continue;
      // 機密ディレクトリ（.ssh 等）配下は丸ごとスキップ。
      if (SECRET_NAMES.has(entry.name)) continue;

      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        // 機密ファイル名（.env / id_rsa / *.pem 等）は中身を読まない。
        if (isSecretFile(entry.name)) continue;
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

  // 表示名はホームからの相対パス（owner/repo の代わり）。
  const name =
    relative(allowedRoot(), target) || basename(target) || "local";
  return {
    repo: `local:${name}`,
    files,
    goModule: goModContent ? parseGoModule(goModContent) : null,
  };
}

/**
 * ローカル解析したファイル1つの中身を読む（/api/file の local: 経路）。
 *
 * name は readLocalRepo が付けた repo 名（"local:" を除いた部分）＝ホームからの相対
 * プロジェクトパス。filePath はそのプロジェクト内の相対パス。
 * 解決した実パスは必ず「ホーム配下」かつ「非機密」であることを確認してから読む
 * （一覧で除外しても個別読みで機密が抜ける穴を塞ぐ＝多層防御）。
 */
export async function readLocalFile(
  name: string,
  filePath: string,
): Promise<{ content: string; truncated: boolean }> {
  if (!isLocalAnalysisEnabled()) {
    throw new Error("ローカル解析は開発時のみ利用できます");
  }

  // 候補：ホーム/name/filePath（本筋）、ホーム/filePath、cwd/filePath（後方互換）。
  const home = allowedRoot();
  const candidates = [
    resolve(home, name, filePath),
    resolve(home, filePath),
    resolve(process.cwd(), filePath),
  ];

  for (const target of candidates) {
    // 多層チェック：ホーム配下か／機密ディレクトリでないか／機密ファイル名でないか。
    if (!isWithinAllowedRoot(target)) continue;
    if (pathHasSecretDir(target)) continue;
    if (isSecretFile(basename(target))) continue;

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
