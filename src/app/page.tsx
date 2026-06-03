"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { RepoGraph } from "@/lib/types";
import { buildReadingGuide, type GuideEntry } from "@/lib/reading-guide";
import { guessFileRole } from "@/lib/file-role";
import { type Lang, LANGS, LANG_LABEL, detectLang, t } from "@/lib/i18n";

// React Flow はブラウザ専用（window 依存）なので SSR を切って読み込む。
const Graph = dynamic(() => import("@/components/Graph"), { ssr: false });

export default function Home() {
  // UI 言語。初期はブラウザ言語、既定は英語。
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(detectLang()), []);
  const [input, setInput] = useState("");
  const [graph, setGraph] = useState<RepoGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 選択ファイルの中身（クリック時にその1ファイルだけ取りに行く）。
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  // コードを全画面オーバーレイで開いているか。
  const [codeOpen, setCodeOpen] = useState(false);
  // 開発時のみ：解析したい手元プロジェクトのパス（ホーム配下・空ならこのプロジェクト自身）。
  const [localDir, setLocalDir] = useState("");

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelected(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析に失敗しました");
      setGraph(data as RepoGraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラー");
    } finally {
      setLoading(false);
    }
  }

  // 開発時のみ：手元のプロジェクトを解析（未公開でもドッグフーディングできる）。
  // dir 省略＝このプロジェクト自身。指定＝ホーム配下の他プロジェクト（絶対パス可）。
  const isDev = process.env.NODE_ENV !== "production";
  async function analyzeLocal(dir?: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelected(null);
    try {
      const url = dir
        ? `/api/analyze-local?dir=${encodeURIComponent(dir)}`
        : "/api/analyze-local";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析に失敗しました");
      setGraph(data as RepoGraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラー");
    } finally {
      setLoading(false);
    }
  }

  const selectedNode = graph?.nodes.find((n) => n.path === selected) ?? null;
  // 選択ファイルが import している先 / されている元（繋がりの可視化）。
  const imports = graph?.edges.filter((e) => e.from === selected) ?? [];
  const importedBy = graph?.edges.filter((e) => e.to === selected) ?? [];
  // 「どこから読むか」ガイド（入口・土台・葉）。AI不要、依存データだけで出す。
  const guide = useMemo(() => (graph ? buildReadingGuide(graph) : null), [graph]);

  // ファイルを選んだら、その1ファイルの中身を取りに行く（選択解除で消す）。
  useEffect(() => {
    if (!selected || !graph) {
      setCode(null);
      setCodeOpen(false); // 選択解除でオーバーレイも閉じる
      return;
    }
    let cancelled = false;
    setCodeLoading(true);
    setCode(null);
    fetch(`/api/file?repo=${encodeURIComponent(graph.repo)}&path=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCode(d.error ? `// 取得できませんでした: ${d.error}` : d.content);
      })
      .catch(() => {
        if (!cancelled) setCode("// 取得中にエラーが発生しました");
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false);
      });
    // 別ファイルに切り替わったら前のリクエスト結果を捨てる。
    return () => {
      cancelled = true;
    };
  }, [selected, graph]);

  return (
    <div className="relative flex flex-col flex-1 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-start justify-between">
          <h1 className="text-sm font-semibold tracking-tight">
            CodeMap
            <span className="ml-2 font-normal text-zinc-400">
              {t(lang, "app.tagline")}
            </span>
          </h1>
          {/* 言語切替。既定は英語、ブラウザ言語で初期化。 */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={analyze} className="mt-3 flex max-w-xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(lang, "input.placeholder")}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? t(lang, "btn.analyzing") : t(lang, "btn.analyze")}
          </button>
        </form>
        {isDev && (
          // 開発時だけ出る。手元のプロジェクトを解析（ドッグフーディング用）。
          // パス欄が空ならこのプロジェクト自身、入力すればホーム配下の他プロジェクト。
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => analyzeLocal(localDir.trim() || undefined)}
              disabled={loading}
              className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline disabled:opacity-40 dark:hover:text-zinc-100"
            >
              {t(lang, "btn.analyzeLocal")}
            </button>
            <input
              value={localDir}
              onChange={(e) => setLocalDir(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") analyzeLocal(localDir.trim() || undefined);
              }}
              placeholder={t(lang, "ph.localDir")}
              className="min-w-0 flex-1 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:text-zinc-300"
            />
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1">
          {graph && graph.fileCount > 0 ? (
            <Graph graph={graph} onSelect={setSelected} selected={selected} lang={lang} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">
              {loading ? (
                t(lang, "status.fetching")
              ) : graph ? (
                // 取得できたが対応ファイルが0件。理由を明示する（無言の空画面は「壊れてる」と誤解される）。
                <span>
                  {t(lang, "empty.noSource")}
                  <br />
                  {t(lang, "empty.checkRepo")}
                </span>
              ) : (
                t(lang, "empty.start")
              )}
            </div>
          )}
        </main>

        {graph && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="text-zinc-500">
              {graph.repo} ・ {graph.fileCount} {t(lang, "summary.files")} ・{" "}
              {graph.edges.length} {t(lang, "summary.deps")}
            </p>
            {graph.edges.length === 0 && graph.fileCount > 0 && (
              // 依存0は故障ではない。理由を添えないと「壊れてる?」と誤解される。
              <p className="mt-1 text-xs text-zinc-400">{t(lang, "deps.zeroReason")}</p>
            )}
            {selectedNode ? (
              <div className="mt-3 space-y-3">
                {/* 全体（読む順ガイド）へ戻る導線。これが無いと選択後に詰む。 */}
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {t(lang, "panel.back")}
                </button>
                <div>
                  <p className="break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {selectedNode.path}
                  </p>
                  {guessFileRole(selectedNode.path) && (
                    // AI なしの推測ヒント。名前/パスから機械的に当てた役割。
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="text-zinc-400">{t(lang, "panel.estimated")}</span>{" "}
                      {t(lang, `role.${guessFileRole(selectedNode.path)}`)}
                    </p>
                  )}
                </div>
                <Section title={`${t(lang, "panel.imports")} (${imports.length})`}>
                  {imports.map((e) => (
                    <Item key={e.to} path={e.to} onClick={() => setSelected(e.to)} />
                  ))}
                </Section>
                <Section title={`${t(lang, "panel.importedBy")} (${importedBy.length})`}>
                  {importedBy.map((e) => (
                    <Item
                      key={e.from}
                      path={e.from}
                      onClick={() => setSelected(e.from)}
                    />
                  ))}
                </Section>
                {/* 中身は全画面オーバーレイで読む（狭い右パネルに詰め込まない）。 */}
                <div>
                  {codeLoading ? (
                    <p className="text-xs text-zinc-400">{t(lang, "panel.loadingContent")}</p>
                  ) : code != null ? (
                    <button
                      onClick={() => setCodeOpen(true)}
                      className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      {t(lang, "panel.readFull")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : guide ? (
              // 何も選んでいない時は「どこから読むか」ガイドを出す。
              // クリックすると地図上でそのファイルの依存線が強調される。
              <div className="mt-4 space-y-5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {t(lang, "guide.heading")}
                </p>
                <GuideSection
                  title={t(lang, "guide.entry")}
                  hint={t(lang, "guide.entryHint")}
                  entries={guide.entrypoints}
                  onSelect={setSelected}
                  lang={lang}
                />
                <GuideSection
                  title={t(lang, "guide.foundation")}
                  hint={t(lang, "guide.foundationHint")}
                  entries={guide.foundations}
                  onSelect={setSelected}
                  lang={lang}
                />
                <GuideSection
                  title={t(lang, "guide.leaf")}
                  hint={t(lang, "guide.leafHint")}
                  entries={guide.leaves}
                  onSelect={setSelected}
                  lang={lang}
                />
              </div>
            ) : null}
          </aside>
        )}
      </div>

      {/* コード全画面オーバーレイ。狭い右パネルでなく、画面いっぱいで読む。 */}
      {codeOpen && selectedNode && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {selectedNode.path}
              </p>
              {guessFileRole(selectedNode.path) && (
                <p className="text-xs text-zinc-500">
                  <span className="text-zinc-400">{t(lang, "panel.estimated")}</span>{" "}
                  {t(lang, `role.${guessFileRole(selectedNode.path)}`)}
                </p>
              )}
            </div>
            <button
              onClick={() => setCodeOpen(false)}
              className="ml-4 shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {t(lang, "overlay.close")}
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            {/* 左の細いナビ。閉じずに次のファイルへ飛べる（読みながら辿る）。 */}
            <nav className="flex w-80 shrink-0 flex-col border-r border-zinc-200 text-sm dark:border-zinc-800">
              {/* 全画面内の小さい地図。ノードクリックで閉じずにコードが切り替わる。
                  背景クリック(null)は無視＝ミニ地図ではオーバーレイを閉じない。 */}
              {graph && graph.fileCount > 0 && (
                <div className="h-56 shrink-0 border-b border-zinc-200 dark:border-zinc-800">
                  <Graph
                    graph={graph}
                    onSelect={(p) => p && setSelected(p)}
                    selected={selected}
                    compactLegend
                    lang={lang}
                  />
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3">
              {guide && (
                <div className="mb-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t(lang, "guide.heading")}
                  </p>
                  <NavGroup label={t(lang, "guide.entry")} entries={guide.entrypoints} current={selected} onPick={setSelected} />
                  <NavGroup label={t(lang, "guide.foundation")} entries={guide.foundations} current={selected} onPick={setSelected} />
                  <NavGroup label={t(lang, "guide.leaf")} entries={guide.leaves} current={selected} onPick={setSelected} />
                </div>
              )}
              <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <NavList
                  label={`${t(lang, "nav.importsTo")} (${imports.length})`}
                  paths={imports.map((e) => e.to)}
                  current={selected}
                  onPick={setSelected}
                />
                <NavList
                  label={`${t(lang, "nav.importedBy")} (${importedBy.length})`}
                  paths={importedBy.map((e) => e.from)}
                  current={selected}
                  onPick={setSelected}
                  emptyLabel={t(lang, "nav.none")}
                />
              </div>
              </div>
            </nav>
            <pre className="flex-1 overflow-auto bg-zinc-50 p-5 font-mono text-sm leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              <code>{codeLoading ? "読み込み中…" : code ?? ""}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-500">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/** オーバーレイ左ナビの共通ボタン。現在開いてるファイルは強調。 */
function NavButton({
  path,
  current,
  onPick,
}: {
  path: string;
  current: string | null;
  onPick: (p: string) => void;
}) {
  const active = path === current;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return (
    <li>
      <button
        onClick={() => onPick(path)}
        title={path}
        className={`block w-full truncate rounded px-2 py-1 text-left font-mono text-xs transition-colors ${
          active
            ? "bg-blue-600 text-white"
            : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-zinc-800"
        }`}
      >
        {name}
      </button>
    </li>
  );
}

/** 読む順の1グループ（入口/土台/末端）をナビに出す。 */
function NavGroup({
  label,
  entries,
  current,
  onPick,
}: {
  label: string;
  entries: GuideEntry[];
  current: string | null;
  onPick: (p: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="mb-0.5 text-[11px] text-zinc-400">{label}</p>
      <ul className="space-y-0.5">
        {entries.map((e) => (
          <NavButton key={e.path} path={e.path} current={current} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}

/** 依存（import 先/元）の一覧をナビに出す。 */
function NavList({
  label,
  paths,
  current,
  onPick,
  emptyLabel = "—",
}: {
  label: string;
  paths: string[];
  current: string | null;
  onPick: (p: string) => void;
  emptyLabel?: string;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-medium text-zinc-500">{label}</p>
      {paths.length === 0 ? (
        <p className="px-2 text-[11px] text-zinc-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {paths.map((p) => (
            <NavButton key={p} path={p} current={current} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ path, onClick }: { path: string; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="block w-full break-all rounded px-2 py-1 text-left font-mono text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-zinc-800"
      >
        {path}
      </button>
    </li>
  );
}

/** 「どこから読むか」ガイドの1セクション（入口/土台/末端）。 */
function GuideSection({
  title,
  hint,
  entries,
  onSelect,
  lang,
}: {
  title: string;
  hint: string;
  entries: GuideEntry[];
  onSelect: (path: string) => void;
  lang: Lang;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{title}</p>
      <p className="mb-1 text-[11px] text-zinc-400">{hint}</p>
      <ul className="space-y-1">
        {entries.map((e) => {
          const role = guessFileRole(e.path);
          return (
            <li key={e.path}>
              <button
                onClick={() => onSelect(e.path)}
                className="block w-full rounded px-2 py-1 text-left hover:bg-blue-50 dark:hover:bg-zinc-800"
              >
                <span className="block break-all font-mono text-xs text-blue-600 dark:text-blue-400">
                  {e.path}
                </span>
                <span className="block text-[11px] text-zinc-400">
                  {t(lang, `reason.${e.reasonKey}`, { count: e.count ?? 0 })}
                  {role ? ` ・ ${t(lang, `role.${role}`)}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
