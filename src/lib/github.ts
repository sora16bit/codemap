import { extract } from "tar-stream";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { SOURCE_EXT, parseGoModule } from "./languages";

// 解析対象の拡張子は languages.ts に集約（対応言語を増やすときはそこを触る）。

/** 解析から除外するディレクトリ。生成物・依存は読んでも意味がない。
 *  ローカル解析(local-repo.ts)でも使うので export する。 */
export const IGNORE_DIR =
  /(^|\/)(node_modules|\.next|\.git|dist|build|out|coverage|\.vercel)(\/|$)/;

// 公開デモの乱用対策（上限）。巨大モノレポを投げられてもサーバーを潰させない。
// 超えたら途中で打ち切って「大きすぎる」と返す（無防備に全部読み込まない）。
const MAX_FILES = 1500; // 解析対象ファイル数
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 総バイト数 30MB
const MAX_FILE_BYTES = 1024 * 1024; // 1ファイル 1MB（local-repo.ts と揃える）

/** リポが大きすぎて解析を打ち切ったときの目印エラー。 */
export class RepoTooLargeError extends Error {
  constructor() {
    super(
      "リポジトリが大きすぎて解析できません（ファイル数・サイズの上限超過）。" +
        "小さめのリポジトリでお試しください。",
    );
    this.name = "RepoTooLargeError";
  }
}

export interface RepoFile {
  /** リポジトリルートからの相対パス */
  path: string;
  content: string;
}

export interface FetchedRepo {
  repo: string; // owner/repo
  files: RepoFile[];
  /** Go の module パス（go.mod の module 行）。Go 依存解決に使う。無ければ null。 */
  goModule: string | null;
  /** ルート tsconfig.json の中身。paths エイリアス（@/* 等）解決に使う。無ければ null。
   *  SOURCE_EXT に含まれずノードにはしないが、解析のガードレールとして運ぶ（goModule と同じ扱い）。 */
  tsconfig: string | null;
}

/** GitHub の URL や owner/repo 文字列から owner と repo を取り出す。 */
export function parseRepoInput(input: string): { owner: string; repo: string } {
  const trimmed = input.trim();
  // https://github.com/owner/repo(.git)(/...) と owner/repo の両方を受ける
  const urlMatch = trimmed.match(
    /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  throw new Error(
    "GitHub の URL（https://github.com/owner/repo）か owner/repo 形式で入力してください",
  );
}

/**
 * 公開リポを tarball で丸ごと取得し、JS/TS ファイルだけを展開して返す。
 * 認証不要（公開リポのみ対応）。デフォルトブランチを GitHub が解決してくれる。
 */
export async function fetchRepoFiles(
  owner: string,
  repo: string,
): Promise<FetchedRepo> {
  // codeload はデフォルトブランチを HEAD で解決できる
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`;
  const res = await fetch(url, {
    headers: { "User-Agent": "codemap" },
  });

  if (res.status === 404) {
    throw new Error(
      "リポジトリが見つかりません。公開リポか、URL が正しいか確認してください",
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub からの取得に失敗しました (status ${res.status})`);
  }
  if (!res.body) {
    throw new Error("レスポンスが空でした");
  }

  const { files, goModContent, tsconfigContent } = await extractSourceFiles(
    res.body,
  );
  return {
    repo: `${owner}/${repo}`,
    files,
    goModule: goModContent ? parseGoModule(goModContent) : null,
    tsconfig: tsconfigContent,
  };
}

/**
 * tar.gz ストリームからソースファイルを抜き出す。
 * あわせて go.mod（あれば）の中身も拾う（Go 依存解決の module 名に使う）。
 */
async function extractSourceFiles(
  body: ReadableStream<Uint8Array>,
): Promise<{
  files: RepoFile[];
  goModContent: string | null;
  tsconfigContent: string | null;
}> {
  const files: RepoFile[] = [];
  let goModContent: string | null = null;
  let tsconfigContent: string | null = null;
  let totalBytes = 0; // 採用したファイルの累計バイト数（上限監視用）
  // 上限超過の記録。ストリームは destroy せず最後まで流し切り（finish を確実に発火させる）、
  // 採用だけ止める。destroy で途中破壊すると tar-stream が error でなく close だけ出し、
  // 待ち受け Promise が宙吊りになってハングする（実測で確認済み）。
  let aborted = false;
  const gunzip = createGunzip();
  const extractor = extract();

  extractor.on("entry", (header, stream, next) => {
    // 既に上限超過なら、以降のエントリは中身を読まず捨てて流し切る。
    if (aborted) {
      stream.resume();
      stream.on("end", next);
      return;
    }

    // tarball の中身は「repo-HEAD/...」という接頭辞が付くので剥がす
    const rel = header.name.replace(/^[^/]+\//, "");

    // go.mod / tsconfig.json はリポルートのものだけ拾う（ノードにはしない）。
    const isRootGoMod = rel === "go.mod";
    const isRootTsconfig = rel === "tsconfig.json";
    const skip =
      header.type !== "file" ||
      IGNORE_DIR.test(rel) ||
      (!SOURCE_EXT.test(rel) && !isRootGoMod && !isRootTsconfig);

    if (skip) {
      stream.resume(); // 読み捨て
      stream.on("end", next);
      return;
    }

    // ファイル数が上限を超えたら以降は採用しない（巨大モノレポ対策）。
    if (files.length >= MAX_FILES) {
      aborted = true;
      stream.resume();
      stream.on("end", next);
      return;
    }

    const chunks: Buffer[] = [];
    let fileBytes = 0;
    let tooBig = false;
    stream.on("data", (c: Buffer) => {
      fileBytes += c.length;
      // 1ファイルが大きすぎる場合はそのファイルだけ読み捨てる（minified 等）。
      if (fileBytes > MAX_FILE_BYTES) {
        tooBig = true;
        chunks.length = 0;
        stream.resume();
        return;
      }
      chunks.push(c);
    });
    stream.on("end", () => {
      if (tooBig) {
        next(); // 1MB 超の単一ファイルはスキップして続行
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (isRootGoMod) {
        goModContent = text; // ノードにはせず module 解決にだけ使う
      } else if (isRootTsconfig) {
        tsconfigContent = text; // ノードにはせず paths エイリアス解決に使う
      } else {
        totalBytes += fileBytes;
        // 総バイト数が上限を超えたら以降は採用しない（メモリ枯渇対策）。
        if (totalBytes > MAX_TOTAL_BYTES) {
          aborted = true;
        } else {
          files.push({ path: rel, content: text });
        }
      }
      next();
    });
    stream.on("error", next);
  });

  // Web ReadableStream → Node Readable に変換して gunzip → extract に流す
  const nodeStream = Readable.fromWeb(body as never);

  await new Promise<void>((resolve, reject) => {
    extractor.on("finish", resolve);
    extractor.on("error", reject);
    gunzip.on("error", reject);
    nodeStream.on("error", reject);
    nodeStream.pipe(gunzip).pipe(extractor);
  });

  // 上限超過していたら、ここで明示的に打ち切りエラーを投げる。
  if (aborted) {
    throw new RepoTooLargeError();
  }

  return { files, goModContent, tsconfigContent };
}
