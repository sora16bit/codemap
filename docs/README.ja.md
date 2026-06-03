<div align="center">

# CodeMap

### GitHub リポジトリを投げると、「どう読めばいいか」の地図が手に入る。

公開リポジトリを依存マップに変え、**どこから読み始めればいいか**まで教える、AI不要・無料のツール。

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#コントリビュート)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#対応言語)

[English](../README.md) · 日本語 · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [한국어](README.ko.md)

<!-- ヒーロー画像: CodeMap で CodeMap 自身を解析した図（ドッグフーディング）。docs/assets/self.png に保存。 -->
![CodeMap 自身のソースを可視化した図 — ディレクトリごとに色付きの箱でファイルがグループ化され、右に「どこから読むか」ガイドが付く](assets/self.png)

<sub>*左：依存マップ — ディレクトリごとに色付きの箱でファイルをグループ化。右：どこから読むか — 入口・土台・末端を自動で振り分け。上：CodeMap が自分自身のソースを読んでいる図。*</sub>

</div>

---

## 目次

- [課題](#課題)
- [CodeMap がすること](#codemap-がすること)
- [クイックスタート](#クイックスタート)
- [仕組み](#仕組み)
- [対応言語](#対応言語)
- [状況とロードマップ](#状況とロードマップ)
- [コントリビュート](#コントリビュート)
- [ライセンス](#ライセンス)

## 課題

学ぶために、知らないリポジトリを開く。何百ものファイルを前に、どこから手をつければいいか分からない。既存ツールはそれぞれ穴がある：

- **AIチャット系**（Cursor、Claude Code、DeepWiki）はコードの*一点*について答えてくれるが、**地図がない**。聞いたことしか分からず、全体像が頭で組み上がらない。
- **可視化系**（Sourcegraph、Madge）は地図をくれるが、**ただの線**だ。各ファイルが何をするか、どこから読むかは教えてくれない。

結局、木について質問するか、森を眺めるかで、**進むべき道**を渡してくれるものがない。

## CodeMap がすること

汎用AIは**質問に答える**。CodeMap は**プロジェクト全体の地図を描き、入口を指し示す。**

公開リポジトリの GitHub URL を貼ると、ソースを解析してこれを返す：

- **🗺️ 依存マップ** — どのファイルがどのファイルを import しているかをインタラクティブな図に。ディレクトリごとに色付きの箱でまとめ、コードベースの形が一目で分かる。
- **📍 どこから読むか** — 全ファイルを**入口**（実行の起点）・**土台**（多くから依存される＝理解すれば全体が分かる）・**末端**（単独で読める＝後回し）に分類。これは熟練者が知らないコードを読む実際のやり方だ。1行目から最後まで読むのではなく、俯瞰→入口→核、そして全部は読まない。
- **🏷️ 各ファイルがたぶん何か** — 名前とパスから推測した一言の役割（`型定義`、`ルーティング`、`中核ロジック`…）。AIは使わず、幻覚もない。判断できない時は、外すより黙る。
- **📖 実際のコード** — どのファイルもクリックで全画面表示。地図と依存関係を脇に保ったまま読めるので、自分の位置を見失わない。

以上すべてが**機械的に作られる — AI不要・APIキー不要・無料・高速。** AIは、任意の将来の解説レイヤー（あなた自身のAPIキーを使う BYOK）のために取っておく。

UI は**8言語**対応（English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어）。

## クイックスタート

Node.js 20 以上が必要。

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

<http://localhost:3000> を開き、リポジトリ（`owner/repo` か `github.com/...` のフルURL）を貼って **解析** を押す。`sindresorhus/ky` や `cli/cli` で実際のコードベースで試せる。

## 仕組み

```
GitHub リポ ──tar.gz（codeload・認証不要）──▶ ソースファイルを抽出
                                                  │
                                                  ▼
                          src/lib/analyze.ts （言語ディスパッチャ）
                           ├─ JS/TS  → ts-morph（正確な AST import 解析）
                           ├─ Python → 正規表現リゾルバ
                           └─ Go/Rust → 正規表現リゾルバ
                                                  │
                                                  ▼
                       依存グラフ ──▶ React Flow の図 ＋ 読む順ガイド
```

- **フロント:** Next.js 16（App Router）、React Flow（`@xyflow/react`）、Tailwind CSS v4
- **取得:** 公開リポを codeload から tarball で取得（認証不要）、ソースだけ抽出
- **解析:** `src/lib/analyze.ts` が言語ごとに振り分け。対応拡張子は `src/lib/languages.ts`（`SOURCE_EXT`）に集約 — 言語追加はここから
- **読む順ガイド:** `src/lib/reading-guide.ts` が import 数だけから入口/土台/末端を導く — AI不要

## 対応言語

| 言語 | 依存解析 | 地図・読む順・役割ヒント |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ 正規表現 | ✅ |
| Go | ✅ 正規表現（module 解決） | ✅ |
| Rust | ✅ 正規表現（`mod` / `use crate::`） | ✅ |
| その他（Java, C/C++, Ruby…） | — 取得・地図化のみ | ✅（依存線なし） |

## 状況とロードマップ

> ⚠️ **初期だが使える。** 無料の「リポを読む」レイヤーは今動く。AI解説レイヤーが次フェーズ。

| 機能 | 状態 |
|---|---|
| ディレクトリでまとめた依存マップ | ✅ 実装済み |
| 「どこから読むか」ガイド（入口/土台/末端） | ✅ 実装済み |
| ファイル役割ヒント（AI不要） | ✅ 実装済み |
| 地図・依存ナビ付き全画面コードリーダー | ✅ 実装済み |
| 8言語UI | ✅ 実装済み |
| ファイル役割の一言要約（AI） | 🔜 予定（BYOK） |
| 初学者向け1行ずつの解説 — 「この行を消すと何が壊れるか」（AI） | 🔜 予定（BYOK） |

AIレイヤーは **AST の確かな事実**（シンボルの定義/使用場所、import の解決先）を**ガードレールにして幻覚を防ぐ** — 学習者向けツールには必須。

## コントリビュート

Issue・PR を歓迎。最初の一歩には**言語追加**がおすすめ：`src/lib/languages.ts` の `SOURCE_EXT` とディスパッチャを拡張（Python/Go/Rust が正規表現ベースの手本）。

## ライセンス

[MIT](../LICENSE)
