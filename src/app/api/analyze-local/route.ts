// ローカルディレクトリを解析する（開発時のみ）。
// 未公開のプロジェクトを GitHub に上げる前に CodeMap で読む用。本番では 403。

import { analyzeRepo } from "@/lib/analyze";
import { readLocalRepo, isLocalAnalysisEnabled } from "@/lib/local-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/analyze-local?dir=<相対パス省略可> → RepoGraph */
export async function GET(request: Request) {
  if (!isLocalAnalysisEnabled()) {
    return Response.json(
      { error: "ローカル解析は開発時のみ利用できます" },
      { status: 403 },
    );
  }
  const { searchParams } = new URL(request.url);
  const dir = searchParams.get("dir") ?? undefined;

  try {
    const fetched = await readLocalRepo(dir);
    const graph = analyzeRepo(
      fetched.repo,
      fetched.files,
      fetched.goModule,
      fetched.tsconfig,
    );
    return Response.json(graph);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ローカル解析に失敗しました";
    return Response.json({ error: message }, { status: 400 });
  }
}
