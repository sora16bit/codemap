import { ImageResponse } from "next/og";
import { parseRepoInput, fetchRepoFiles, RepoTooLargeError } from "@/lib/github";
import { analyzeRepo } from "@/lib/analyze";
import { buildReadingGuide } from "@/lib/reading-guide";

// fetchRepoFiles / analyzeRepo は Node 専用 API（tar-stream, ts-morph）を使う。
export const runtime = "nodejs";
// 入力リポごとに結果が変わるので常に動的。
export const dynamic = "force-dynamic";
// 公開デモの暴走対策：1リクエストの上限時間。
export const maxDuration = 30;

const WIDTH = 1200;
const HEIGHT = 630;

// 静かな開発者ツールのトンマナ（zinc 基調・blue 1色アクセント・絵文字なし）。
const INK = "#18181b"; // zinc-900
const SUB = "#52525b"; // zinc-600
const FAINT = "#a1a1aa"; // zinc-400
const LINE = "#e4e4e7"; // zinc-200
const BLUE = "#2563eb";
const BG = "#fafafa"; // zinc-50

/** パスの末尾ファイル名だけ取り出す（カードは横幅が限られるので短く出す）。 */
function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * GET /api/og?repo=owner/repo （URL 形式も可）
 * 解析結果を「指標＋読む順」カードの PNG にして返す。SNS 共有のヒーロー画像。
 * 地図そのもの（React Flow）は Satori では描けないので、
 * 製品の核である「まずどこから読むか（入口・土台）」を画像化する。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("repo") ?? searchParams.get("url") ?? "";

  // 解析に失敗してもカードは必ず返す（壊れた OG 画像は共有体験を殺す）。
  let repoLabel = "";
  let fileCount = 0;
  let edgeCount = 0;
  let entries: string[] = [];
  let foundations: string[] = [];
  let ok = false;

  try {
    if (input.trim() !== "") {
      const { owner, repo } = parseRepoInput(input);
      const fetched = await fetchRepoFiles(owner, repo);
      const graph = analyzeRepo(
        fetched.repo,
        fetched.files,
        fetched.goModule,
        fetched.tsconfig,
      );
      const guide = buildReadingGuide(graph, 3);
      repoLabel = graph.repo;
      fileCount = graph.fileCount;
      edgeCount = graph.edges.length;
      entries = guide.entrypoints.slice(0, 2).map((g) => basename(g.path));
      // 入口に出た名前は土台側で重複表示しない（basename が同名になるケース対策）。
      const seen = new Set(entries);
      foundations = [];
      for (const g of guide.foundations) {
        const name = basename(g.path);
        if (seen.has(name)) continue;
        seen.add(name);
        foundations.push(name);
        if (foundations.length === 3) break;
      }
      ok = true;
    }
  } catch (err) {
    // RepoTooLargeError も含め、失敗時はフォールバックカードに落とす。
    if (!(err instanceof RepoTooLargeError) && !(err instanceof Error)) {
      // 想定外はログだけ（カードは下のフォールバックで返る）。
      console.error("og: unexpected error", err);
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: BG,
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* ヘッダー：ブランドと repo 名 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: INK,
              letterSpacing: -0.5,
            }}
          >
            CodeMap
          </div>
          <div style={{ fontSize: 22, color: FAINT }}>
            read code you didn&apos;t write
          </div>
        </div>

        {/* repo 名（大見出し） */}
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 800,
            color: INK,
            marginTop: 28,
            letterSpacing: -1.5,
          }}
        >
          {ok ? repoLabel : "Map any repo"}
        </div>

        {/* 指標 or 案内 */}
        {ok ? (
          <div style={{ display: "flex", gap: 56, marginTop: 8 }}>
            <Stat label="files" value={String(fileCount)} />
            <Stat label="dependencies" value={String(edgeCount)} />
            <Stat
              label="start points"
              value={String(entries.length + foundations.length)}
            />
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 28, color: SUB, marginTop: 12 }}>
            Paste a GitHub URL and see where to start reading.
          </div>
        )}

        <div
          style={{
            display: "flex",
            height: 1,
            backgroundColor: LINE,
            margin: "36px 0",
          }}
        />

        {/* 読む順：まずここから（製品の核を画像化） */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: SUB,
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Start reading here
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(entries.length ? entries : foundations.length ? foundations : ["—"]).map(
              (name, i) => (
                <Chip key={i} name={name} accent />
              ),
            )}
            {entries.length > 0 &&
              foundations.map((name, i) => <Chip key={`f${i}`} name={name} />)}
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: FAINT }}>
            Made with CodeMap
          </div>
          <div style={{ display: "flex", fontSize: 22, color: BLUE }}>
            codemap.sora16bit.com
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 46, fontWeight: 800, color: INK }}>{value}</div>
      <div style={{ fontSize: 22, color: FAINT, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Chip({ name, accent }: { name: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 26,
        fontFamily: "monospace",
        color: accent ? BLUE : INK,
        backgroundColor: accent ? "#eff6ff" : "#ffffff",
        border: `1px solid ${accent ? "#bfdbfe" : LINE}`,
        borderRadius: 10,
        padding: "10px 18px",
      }}
    >
      {name}
    </div>
  );
}
