import { extract } from "tar-stream";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { SOURCE_EXT, parseGoModule } from "./languages";

// 解析対象の拡張子は languages.ts に集約（対応言語を増やすときはそこを触る）。

/** 解析から除外するディレクトリ。生成物・依存は読んでも意味がない。
 *  ローカル解析(local-repo.ts)でも使うので export する。 */
export const IGNORE_DIR =
  /(^|\/)(node_modules|\.next|\.git|dist|build|out|coverage|\.vercel)(\/|$)/;

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

  const { files, goModContent } = await extractSourceFiles(res.body);
  return {
    repo: `${owner}/${repo}`,
    files,
    goModule: goModContent ? parseGoModule(goModContent) : null,
  };
}

/**
 * tar.gz ストリームからソースファイルを抜き出す。
 * あわせて go.mod（あれば）の中身も拾う（Go 依存解決の module 名に使う）。
 */
async function extractSourceFiles(
  body: ReadableStream<Uint8Array>,
): Promise<{ files: RepoFile[]; goModContent: string | null }> {
  const files: RepoFile[] = [];
  let goModContent: string | null = null;
  const gunzip = createGunzip();
  const extractor = extract();

  extractor.on("entry", (header, stream, next) => {
    // tarball の中身は「repo-HEAD/...」という接頭辞が付くので剥がす
    const rel = header.name.replace(/^[^/]+\//, "");

    // go.mod はリポルートのものだけ拾う（依存グラフのノードにはしない）。
    const isRootGoMod = rel === "go.mod";
    const skip =
      header.type !== "file" ||
      IGNORE_DIR.test(rel) ||
      (!SOURCE_EXT.test(rel) && !isRootGoMod);

    if (skip) {
      stream.resume(); // 読み捨て
      stream.on("end", next);
      return;
    }

    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (isRootGoMod) {
        goModContent = text; // ノードにはせず module 解決にだけ使う
      } else {
        files.push({ path: rel, content: text });
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

  return { files, goModContent };
}
