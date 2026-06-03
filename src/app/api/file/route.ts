// 選択された1ファイルの中身を取得して返す。
// 解析(/api/analyze)は全ファイルの中身を運ばない（重い）ので、
// 「クリックしたファイルだけ」をその場で取りに行く軽量エンドポイント。
// repo が "local:..." のときはローカル fs から読む（開発時のドッグフーディング用）。

import { readLocalFile, isLocalAnalysisEnabled } from "@/lib/local-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/file?repo=owner/repo&path=src/foo.ts → { content } */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo")?.trim() ?? "";
  const path = searchParams.get("path")?.trim() ?? "";

  // path はリポ内相対パスのみ許可（.. や絶対パスを弾く）。
  if (!path || path.startsWith("/") || path.includes("..")) {
    return Response.json({ error: "path が不正です" }, { status: 400 });
  }

  // ローカル解析（local:<name>）のファイルはローカル fs から読む。
  // GitHub raw には存在しないので owner/repo 経路には乗せられない。
  if (repo.startsWith("local:")) {
    // 多層防御：readLocalFile 内部でも弾くが、入口でも本番(production)を 403 で止める。
    if (!isLocalAnalysisEnabled()) {
      return Response.json(
        { error: "ローカル解析は開発時のみ利用できます" },
        { status: 403 },
      );
    }
    try {
      const { content, truncated } = await readLocalFile(
        repo.slice("local:".length),
        path,
      );
      return Response.json({ content, truncated });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ローカル取得に失敗しました";
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // repo は "owner/repo" 形式のみ許可。
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    return Response.json({ error: "repo の形式が不正です" }, { status: 400 });
  }

  // codeload と同じく HEAD でデフォルトブランチを解決。認証不要。
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;
  const res = await fetch(url, { headers: { "User-Agent": "codemap" } });

  if (res.status === 404) {
    return Response.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json(
      { error: `取得に失敗しました (status ${res.status})` },
      { status: 502 },
    );
  }

  // 巨大ファイルでブラウザを固めないよう上限を設ける（先頭だけ返す）。
  const MAX = 200_000; // 約200KB
  const text = await res.text();
  const truncated = text.length > MAX;
  return Response.json({
    content: truncated ? text.slice(0, MAX) : text,
    truncated,
  });
}
