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

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { SOURCE_EXT, parseGoModule } from "./languages";
import { IGNORE_DIR, type FetchedRepo, type RepoFile } from "./github";

/** ローカル解析が許可される環境か（開発時のみ）。 */
export function isLocalAnalysisEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Windows 形式のパスを WSL 形式に正規化する。
 *  - `C:\Users\me\foo` / `C:/Users/me/foo` → `/mnt/c/Users/me/foo`
 *  - バックスラッシュはスラッシュへ、ドライブ文字は小文字へ。
 * Windows 形式でなければそのまま返す。エクスプローラーの「パスのコピー」を
 * そのまま貼れるようにするための入口変換（セキュリティ判定は変換後に効く）。
 */
function normalizeWindowsPath(p: string): string {
  // 前後の空白と引用符を剥がす（エクスプローラーの「パスのコピー」は "..." 付き）。
  p = p.trim().replace(/^["']|["']$/g, "").trim();
  // 先頭が「英字 + :」ならドライブ指定の Windows パス。
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (m) {
    const drive = m[1].toLowerCase();
    const rest = m[2].replace(/\\/g, "/");
    return `/mnt/${drive}/${rest}`;
  }
  // ドライブ無しでもバックスラッシュ区切りなら / に統一しておく。
  return p.includes("\\") ? p.replace(/\\/g, "/") : p;
}

/**
 * 解析を許可するルート群。ここより外は読ませない。
 *  - WSL のホーム（/home/<user>）
 *  - Windows のユーザーフォルダ（/mnt/c/Users/<user>）※WSL から Windows 側の
 *    プロジェクトを解析するため。存在する場合だけ追加する（純 Linux 環境では無い）。
 * /mnt/c/Windows 等のシステム領域は含めない（ユーザー領域だけ許可）。
 */
function allowedRoots(): string[] {
  const roots = [resolve(homedir())];
  // WSL: Windows のユーザーフォルダ。USER 環境変数のユーザー名で組み立てる。
  const winUser = process.env.USER || process.env.USERNAME;
  if (winUser) {
    const winHome = `/mnt/c/Users/${winUser}`;
    if (existsSync(winHome)) roots.push(resolve(winHome));
  }
  return roots;
}

/**
 * target がいずれかの許可ルート配下に収まっているか。.. での脱出を弾く。
 * relative() が ".." で始まる（=ルートの外）か絶対パスを返す（=別ツリーで無関係）
 * 場合は配下でない。空文字はルート自身＝許可。1つでも配下なら true。
 */
function isWithinAllowedRoot(target: string): boolean {
  const abs = resolve(target);
  return allowedRoots().some((root) => {
    const rel = relative(root, abs);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}

/** target が属する許可ルートを返す（複数候補のうち配下に含むもの）。無ければ null。 */
function owningRoot(target: string): string | null {
  const abs = resolve(target);
  for (const root of allowedRoots()) {
    const rel = relative(root, abs);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return root;
  }
  return null;
}

/**
 * シンボリックリンクを実体に解決した上で、ホーム配下かつ非機密かを確認する。
 * これを通った実パスだけ読んでよい。symlink でホーム外（/etc 等）を指していても
 * realpath で実体を見るので回避できない。存在しなければ null。
 */
async function safeRealPath(target: string): Promise<string | null> {
  // まず文字列ベースで明らかな外/機密を弾く（realpath 前の早期拒否）。
  if (!isWithinAllowedRoot(target) || pathHasSecretDir(target)) return null;
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    return null; // 存在しない等
  }
  // 実体（symlink 解決後）も改めてホーム配下・非機密であることを要求する。
  if (!isWithinAllowedRoot(real) || pathHasSecretDir(real)) return null;
  return real;
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

/**
 * パス要素のどこかに機密ディレクトリ名が含まれるか（許可ルートからの相対で判定）。
 * 許可ルート外なら判定不能＝安全側で機密扱い（true）にして弾く。
 */
function pathHasSecretDir(absPath: string): boolean {
  const root = owningRoot(absPath);
  if (!root) return true;
  const fromRoot = relative(root, resolve(absPath));
  return fromRoot.split(sep).some((seg) => SECRET_NAMES.has(seg));
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

  // 入力を正規化（Windows 形式 C:\... を /mnt/c/... に）。省略時は cwd。
  // 絶対パスならそのまま、相対なら cwd 起点で解決。
  const target = dirInput
    ? resolve(process.cwd(), normalizeWindowsPath(dirInput))
    : process.cwd();

  // ルート検証：symlink 実体まで解決した上でホーム配下・非機密かを確認する。
  const realTarget = await safeRealPath(target);
  if (!realTarget) {
    // 何が原因か（外 or 機密 or 不在）を区別してメッセージを出す。
    if (!isWithinAllowedRoot(target)) {
      throw new Error(
        "解析できるのはホーム（WSL）か Windows のユーザーフォルダ配下だけです",
      );
    }
    if (pathHasSecretDir(target)) {
      throw new Error("機密ディレクトリは解析できません");
    }
    throw new Error("指定したディレクトリが見つかりません");
  }

  const files: RepoFile[] = [];
  let goModContent: string | null = null;
  let tsconfigContent: string | null = null;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const relPath = relative(realTarget!, abs).split(sep).join("/");

      if (IGNORE_DIR.test(relPath + "/")) continue;
      // 機密ディレクトリ（.ssh 等）配下は丸ごとスキップ。
      if (SECRET_NAMES.has(entry.name)) continue;
      // シンボリックリンクは辿らない（ホーム外/機密を指すリンクでの脱出を防ぐ）。
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        // 機密ファイル名（.env / id_rsa / *.pem 等）は中身を読まない。
        if (isSecretFile(entry.name)) continue;
        if (relPath === "go.mod") {
          goModContent = await readFile(abs, "utf8");
        } else if (relPath === "tsconfig.json") {
          tsconfigContent = await readFile(abs, "utf8"); // paths エイリアス解決用
        } else if (SOURCE_EXT.test(relPath)) {
          // 巨大ファイルは読み飛ばす（メモリ保護）。
          const info = await stat(abs);
          if (info.size > 1_000_000) continue;
          files.push({ path: relPath, content: await readFile(abs, "utf8") });
        }
      }
    }
  }

  await walk(realTarget);

  // 表示名は所属ルートからの相対パス（owner/repo の代わり）。realTarget 基準で出す。
  const nameRoot = owningRoot(realTarget) ?? realTarget;
  const name =
    relative(nameRoot, realTarget) || basename(realTarget) || "local";
  return {
    repo: `local:${name}`,
    files,
    goModule: goModContent ? parseGoModule(goModContent) : null,
    tsconfig: tsconfigContent,
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

  // Windows 形式が混ざっても扱えるよう正規化してから候補を組む。
  const nName = normalizeWindowsPath(name);
  const nFile = normalizeWindowsPath(filePath);
  // name はどの許可ルートからの相対か不定（WSL ホーム or Windows ユーザーフォルダ）。
  // 各ルートについて root/name/filePath と root/filePath を候補にし、cwd も後方互換で足す。
  const candidates = [
    ...allowedRoots().flatMap((root) => [
      resolve(root, nName, nFile),
      resolve(root, nFile),
    ]),
    resolve(process.cwd(), nFile),
  ];

  for (const target of candidates) {
    // symlink 実体まで解決し、ホーム配下・非機密を確認した実パスだけ採用する。
    const real = await safeRealPath(target);
    if (!real) continue;
    // 実パスのファイル名でも機密判定（リンク先が id_rsa 等でないか）。
    if (isSecretFile(basename(real))) continue;

    const info = await stat(real).catch(() => null);
    if (info?.isFile()) {
      const MAX = 200_000; // 約200KB。/api/file の GitHub 経路と揃える。
      const text = await readFile(real, "utf8");
      const truncated = text.length > MAX;
      return { content: truncated ? text.slice(0, MAX) : text, truncated };
    }
  }

  throw new Error("ファイルが見つかりません");
}
