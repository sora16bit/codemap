// tsconfig paths エイリアス（@/ 等）の依存解決テスト。
// 使い方: NODE_ENV=development npx tsx scripts/test-alias.mts
// 期待：@/lib/foo が src/lib/foo.ts に解決され、エッジが張られる。
import { analyzeRepo } from "../src/lib/analyze.ts";
import type { RepoFile } from "../src/lib/github.ts";

let failed = 0;
function check(label: string, cond: boolean) {
  console.log(cond ? `✅ ${label}` : `❌ ${label}`);
  if (!cond) failed++;
}

// 最小プロジェクト：page が @/lib/posts を import、posts は ./site を相対 import。
// tsconfig は files に含めず、取得側が別途渡す想定で第4引数で渡す（実環境準拠）。
// ★実物の tsconfig はコメント・末尾カンマを含み、paths 値に // や /* を含む
//   （"@/*": ["./src/*"]）。これらでパーサが壊れないことを検証する（生文字列で渡す）。
const tsconfig = `{
  // Next.js のデフォルト tsconfig 風（コメントあり）
  "compilerOptions": {
    "target": "ES2017",
    "paths": {
      "@/*": ["./src/*"],
    },
  },
}`;
const files: RepoFile[] = [
  { path: "src/app/page.tsx", content: `import { getPosts } from "@/lib/posts";` },
  { path: "src/lib/posts.ts", content: `import { site } from "./site";\nexport const getPosts = () => site;` },
  { path: "src/lib/site.ts", content: `export const site = {};` },
];

const graph = analyzeRepo("local:test", files, null, tsconfig);
const has = (from: string, to: string) =>
  graph.edges.some((e) => e.from === from && e.to === to);

// 相対 import は従来通り解決される（回帰チェック）。
check("相対 import: posts.ts → site.ts", has("src/lib/posts.ts", "src/lib/site.ts"));
// ★本命：@/ エイリアスが解決される。
check("@/ エイリアス: page.tsx → posts.ts", has("src/app/page.tsx", "src/lib/posts.ts"));

console.log(`\nedges: ${graph.edges.length}`);
graph.edges.forEach((e) => console.log(`  ${e.from} → ${e.to}`));
process.exit(failed > 0 ? 1 : 0);
