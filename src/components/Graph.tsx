"use client";

import { useMemo, useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RepoGraph } from "@/lib/types";
import { buildReadingGuide } from "@/lib/reading-guide";
import { type Lang, t } from "@/lib/i18n";

/** 読む順の役割。地図上で入口/土台を視覚的に区別するために使う。 */
type ReadRole = "entry" | "foundation" | "leaf" | null;

interface GraphProps {
  graph: RepoGraph;
  /** ノード選択時はパス、背景クリックで解除時は null を返す */
  onSelect: (path: string | null) => void;
  /** 現在選択中のファイルパス（その依存線だけ強調する） */
  selected: string | null;
  /** 凡例を最初から畳んでおく（オーバーレイのミニ地図など狭い場所用）。 */
  compactLegend?: boolean;
  /** UI 言語（凡例の翻訳に使う）。 */
  lang: Lang;
}

/** ファイル名だけを取り出す（パスが長いと図がうるさいので）。 */
function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** ファイルの所属ディレクトリ（色分けの単位）。トップレベルは "(root)"。 */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "(root)" : path.slice(0, i);
}

// ディレクトリ群の色。トンマナは「静かめ」だが、色の役割＝ディレクトリの区別なので
// 色相はしっかり散らす（前版は全部グレー系で隣と区別がつかなかった反省）。
// 彩度は中程度（原色まで上げない）＝落ち着くが見分けはつく。
// 選択ハイライトの blue(#2563eb) と被らないよう、純 blue はパレットから外す。
const PALETTE = [
  "#0d9488", // teal
  "#7c3aed", // violet
  "#d97706", // amber
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
  "#dc2626", // red
  "#4f46e5", // indigo
  "#ea580c", // orange
  "#0284c7", // sky
  "#9333ea", // purple
  "#16a34a", // green
];

/** ディレクトリ → 色 の対応を、出現順に安定して割り当てる。 */
function buildDirColors(graph: RepoGraph): Map<string, string> {
  const dirs: string[] = [];
  for (const n of graph.nodes) {
    const d = dirOf(n.path);
    if (!dirs.includes(d)) dirs.push(d);
  }
  dirs.sort(); // パス順に並べておくと凡例が見やすい
  const map = new Map<string, string>();
  dirs.forEach((d, i) => map.set(d, PALETTE[i % PALETTE.length]));
  return map;
}

// レイアウト定数。
const NODE_W = 150; // 子ノードの幅
const NODE_H = 36; // 子ノードの高さ
const GAP_Y = 16; // 子ノードの縦間隔
const PAD = 24; // グループ枠の内側余白
const HEADER = 30; // グループ枠の見出し帯の高さ
const GROUP_GAP_X = 48; // グループ間の横間隔
const COLS = 3; // グループを並べる列数

/**
 * 依存グラフを React Flow のノード/エッジに変換する。
 *
 * レイアウトの肝＝「フォルダを箱として見せる」。
 * 同一ディレクトリのファイルを、色付きのグループ枠（親ノード）の中に子ノードとして
 * 積む。これで「src/lib 群」「src/app 群」が塊として一目で分かる（毛玉対策）。
 * 箱の中は被参照が多い順（土台を下に）、大きさ＝被参照数で土台ほど大きい。
 */
function toNodes(
  graph: RepoGraph,
  dirColors: Map<string, string>,
  roleOf: (path: string) => ReadRole,
  highlightDir: string | null,
  highlightRole: ReadRole,
  lang: Lang,
): Node[] {
  // ディレクトリごとにファイルをまとめる。
  const byDir = new Map<string, RepoGraph["nodes"]>();
  for (const n of graph.nodes) {
    const d = dirOf(n.path);
    const arr = byDir.get(d) ?? [];
    arr.push(n);
    byDir.set(d, arr);
  }
  const dirs = [...byDir.keys()].sort();
  const maxImportedBy = Math.max(1, ...graph.nodes.map((n) => n.importedByCount));

  // 各グループ枠のサイズを先に算出（中身の数で高さが決まる）。
  const groupW = NODE_W + PAD * 2;
  const sizeOf = (dir: string) => {
    const count = byDir.get(dir)!.length;
    return { w: groupW, h: HEADER + PAD + count * (NODE_H + GAP_Y) };
  };

  // グループを格子状（COLS 列）に配置。列ごとに高さを積んで重ならないようにする。
  const colHeights = new Array(COLS).fill(0);
  const nodes: Node[] = [];

  dirs.forEach((dir, idx) => {
    const col = idx % COLS;
    const { w, h } = sizeOf(dir);
    const x = col * (groupW + GROUP_GAP_X);
    const y = colHeights[col];
    colHeights[col] += h + GROUP_GAP_X;

    const color = dirColors.get(dir) ?? "#64748b";
    // 凡例でディレクトリが選ばれている時、それ以外の箱は淡くして注目を集める。
    const dimmed = highlightDir != null && highlightDir !== dir;

    // 親＝グループ枠。クリックでファイルと取り違えないよう selectable は切る。
    nodes.push({
      id: `group:${dir}`,
      position: { x, y },
      data: { label: dir },
      selectable: false,
      style: {
        width: w,
        height: h,
        opacity: dimmed ? 0.25 : 1,
        background: `${color}14`, // 薄い塗り（16進の末尾 14 ≒ 8% 透過）
        border: `2px solid ${color}`,
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color,
        padding: 6,
      },
    });

    // 子＝ファイル。親基準の相対座標で枠の中に積む。
    const filesInDir = [...byDir.get(dir)!].sort(
      (a, b) => a.importedByCount - b.importedByCount,
    );
    filesInDir.forEach((n, rowIdx) => {
      const weight = n.importedByCount / maxImportedBy;
      const width = NODE_W - 30 + Math.round(weight * 30); // 土台ほど少し広く
      const role = roleOf(n.path);
      // 読む順を「色以外」で表す（色はディレクトリに使っているため）：
      //   入口 = 明るい縁取りで「ここから入る」を強調
      //   土台 = 白い縁取り＋濃い影で「重い核」を強調
      //   末端 = 少し沈める（淡く）
      // ラベルにも控えめな接頭辞を付ける（記号は乱発しない＝トンマナ）。
      const roleStyle =
        role === "entry"
          ? { border: "2px solid #fafafa", boxShadow: "0 0 0 2px rgba(255,255,255,0.25)" }
          : role === "foundation"
            ? { border: "2px solid rgba(255,255,255,0.9)" }
            : role === "leaf"
              ? { opacity: 0.6 }
              : {};
      const labelPrefix =
        role === "entry"
          ? `${t(lang, "guide.entry")} `
          : role === "foundation"
            ? `${t(lang, "guide.foundation")} `
            : "";
      // 凡例で読む順が選ばれている時：その役割は際立たせ、他は沈める。
      const roleHighlight =
        highlightRole == null
          ? {}
          : role === highlightRole
            ? { opacity: 1, boxShadow: "0 0 0 2px #2563eb" }
            : { opacity: 0.2 };
      nodes.push({
        id: n.path,
        parentId: `group:${dir}`,
        extent: "parent",
        position: { x: PAD, y: HEADER + rowIdx * (NODE_H + GAP_Y) },
        data: { label: `${labelPrefix}${basename(n.path)}` },
        // 依存線は解析が自動で引く。手動でエッジを繋ぐ機能はないので、
        // React Flow がデフォルトで出す接続ハンドル（黒丸）を消す。
        connectable: false,
        style: {
          background: color,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 12,
          padding: "8px 12px",
          width,
          height: NODE_H,
          // 長いファイル名が枠からはみ出さないよう1行省略（… 表示）。
          whiteSpace: "nowrap" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "center" as const,
          ...roleStyle,
          ...roleHighlight, // 役割ハイライトは最後＝leaf の既定 opacity も上書きする
        },
      });
    });
  });

  return nodes;
}

/**
 * 依存線を作る。毛玉対策の肝はここ。
 * - 普段は全部の線を薄い smoothstep（直角を丸めた配線）で出す＝地図の形だけ見せる。
 * - ノードを選ぶと、その選択ファイルに「繋がる線だけ」を濃く色付きで強調し、
 *   無関係な線はさらに薄くする＝注目箇所の依存関係が一気に読める（IDA 風）。
 * 「俯瞰（薄い全体）⇄ 精読（選択を強調）」をエッジの濃淡で表現する。
 */
function buildEdges(graph: RepoGraph, selected: string | null): Edge[] {
  return graph.edges.map((e, i) => {
    const touches = selected != null && (e.from === selected || e.to === selected);
    // 何も選んでいない時は一律に薄い。選択時は関係線だけ濃く、他は極薄に。
    const opacity = selected == null ? 0.18 : touches ? 0.95 : 0.05;
    const stroke = touches ? "#2563eb" : "#94a3b8";
    return {
      id: `e${i}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      animated: touches,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      // pointerEvents:none で線をクリック/ドラッグの対象から外す。
      // こうしないとノード間を埋める線を掴んでしまい、背景ドラッグ（地図のパン）が
      // できない。線は「見るだけ」なので操作対象から外して問題ない。
      style: { stroke, strokeWidth: touches ? 2 : 1, opacity, pointerEvents: "none" },
      // 強調線は他の線の上に描く。
      zIndex: touches ? 10 : 0,
    };
  });
}

export default function Graph({
  graph,
  onSelect,
  selected,
  compactLegend = false,
  lang,
}: GraphProps) {
  const dirColors = useMemo(() => buildDirColors(graph), [graph]);
  // 凡例の開閉。狭い場所（ミニ地図）では畳んだ状態で始める。邪魔な時は閉じられる。
  const [legendOpen, setLegendOpen] = useState(!compactLegend);
  // 凡例でクリックされたディレクトリ。その箱だけ強調し他を淡くする。
  const [highlightDir, setHighlightDir] = useState<string | null>(null);
  // 凡例でクリックされた読む順の役割。その役割のファイルだけ強調する。
  const [highlightRole, setHighlightRole] = useState<ReadRole>(null);
  // 読む順（入口/土台/末端）の分類を path → role の引き表にする。
  // 地図上でノードを視覚的に区別するため（色はディレクトリに使用済み）。
  const roleOf = useMemo(() => {
    const guide = buildReadingGuide(graph, Infinity);
    const map = new Map<string, ReadRole>();
    for (const e of guide.foundations) map.set(e.path, "foundation");
    for (const e of guide.leaves) map.set(e.path, "leaf");
    // 入口は最優先（土台と重なっても入口として見せる）。
    for (const e of guide.entrypoints) map.set(e.path, "entry");
    return (path: string): ReadRole => map.get(path) ?? null;
  }, [graph]);
  // ノードはレイアウト＋ハイライト状態で作る。
  const nodes = useMemo(
    () => toNodes(graph, dirColors, roleOf, highlightDir, highlightRole, lang),
    [graph, dirColors, roleOf, highlightDir, highlightRole, lang],
  );
  // エッジは選択で濃淡が変わるので selected も依存に含める。
  const edges = useMemo(() => buildEdges(graph, selected), [graph, selected]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      // 箱（グループノード）自体のクリックは選択扱いにしない。ファイルだけ。
      if (node.id.startsWith("group:")) return;
      onSelect(node.id);
    },
    [onSelect],
  );
  // 地図の何もない所をクリックしたら選択解除＝全体（読む順ガイド）に戻る。
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        // 読むための地図であって編集ツールではない。手動の接続/エッジ更新は無効。
        nodesConnectable={false}
        edgesReconnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {/* 凡例: 2軸。色=ディレクトリ、縁取り/濃淡=読む順（入口/土台/末端）。
          邪魔な時は畳める（最小化）。狭いミニ地図では初期状態で畳む。 */}
      <div className="absolute right-3 top-3 max-h-[70%] w-60 overflow-y-auto rounded-md border border-zinc-200 bg-white/95 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 font-semibold uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {t(lang, "legend.title")}
          <span className="text-zinc-400">{legendOpen ? "▾" : "▸"}</span>
        </button>
        {legendOpen && (
        <div className="px-3 pb-3">
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t(lang, "legend.readingOrder")}
          <span className="ml-1 font-normal normal-case text-zinc-400">
            {t(lang, "legend.clickToHighlight")}
          </span>
        </p>
        <ul className="mb-3 space-y-0.5 text-zinc-800 dark:text-zinc-100">
          {(
            [
              ["entry", "legend.entry", "ring-2 ring-zinc-900 dark:ring-zinc-100"],
              ["foundation", "legend.foundation", "ring-1 ring-zinc-700 dark:ring-zinc-300"],
              ["leaf", "legend.leaf", "opacity-50"],
            ] as [ReadRole, string, string][]
          ).map(([role, labelKey, swatch]) => {
            const active = highlightRole === role;
            return (
              <li key={labelKey}>
                <button
                  onClick={() => {
                    setHighlightDir(null);
                    setHighlightRole(active ? null : role);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors ${
                    active
                      ? "bg-zinc-200 dark:bg-zinc-700"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className={`inline-block h-3 w-4 shrink-0 rounded-sm bg-zinc-500 ${swatch}`} />
                  {t(lang, labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t(lang, "legend.directory")}
          <span className="ml-1 font-normal normal-case text-zinc-400">
            {t(lang, "legend.clickToHighlight")}
          </span>
        </p>
        <ul className="space-y-0.5">
          {[...dirColors.entries()].map(([dir, color]) => {
            const active = highlightDir === dir;
            return (
              <li key={dir}>
                <button
                  onClick={() => {
                    setHighlightRole(null);
                    setHighlightDir(active ? null : dir);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors ${
                    active
                      ? "bg-zinc-200 dark:bg-zinc-700"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded"
                    style={{ background: color }}
                  />
                  <span className="truncate font-mono text-zinc-800 dark:text-zinc-100">
                    {dir}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </div>
        )}
      </div>
    </div>
  );
}
