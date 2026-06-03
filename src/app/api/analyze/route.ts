import { parseRepoInput, fetchRepoFiles } from "@/lib/github";
import { analyzeRepo } from "@/lib/analyze";

// ts-morph と tar-stream は Node 専用 API を使うので Edge では動かない。
export const runtime = "nodejs";
// 解析結果は入力リポに依存するので常に動的に実行する。
export const dynamic = "force-dynamic";

/** POST { repo: "owner/repo" | "https://github.com/owner/repo" } → RepoGraph */
export async function POST(request: Request) {
  let input: unknown;
  try {
    const body = await request.json();
    input = body?.repo;
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  if (typeof input !== "string" || input.trim() === "") {
    return Response.json({ error: "repo を指定してください" }, { status: 400 });
  }

  try {
    const { owner, repo } = parseRepoInput(input);
    const fetched = await fetchRepoFiles(owner, repo);
    const graph = analyzeRepo(fetched.repo, fetched.files, fetched.goModule);
    return Response.json(graph);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "解析中に予期しないエラーが発生しました";
    return Response.json({ error: message }, { status: 400 });
  }
}
