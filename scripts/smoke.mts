// コアロジック（取得→AST解析）が実リポで動くかの単体確認。
// 使い方: npx tsx scripts/smoke.mts <owner/repo>
import { parseRepoInput, fetchRepoFiles } from "../src/lib/github.ts";
import { analyzeRepo } from "../src/lib/analyze.ts";

const input = process.argv[2] ?? "sindresorhus/slugify";
const { owner, repo } = parseRepoInput(input);
console.log(`fetching ${owner}/${repo} ...`);

const fetched = await fetchRepoFiles(owner, repo);
console.log(`JS/TS files: ${fetched.files.length}`);

const graph = analyzeRepo(fetched.repo, fetched.files);
console.log(`nodes: ${graph.nodes.length}, edges: ${graph.edges.length}`);

// 被参照が多い＝重要なファイル top5
const top = [...graph.nodes]
  .sort((a, b) => b.importedByCount - a.importedByCount)
  .slice(0, 5);
console.log("most-imported files:");
for (const n of top) {
  console.log(`  ${n.importedByCount} <- ${n.path}`);
}

console.log("sample edges:");
for (const e of graph.edges.slice(0, 8)) {
  console.log(`  ${e.from}  ->  ${e.to}`);
}
