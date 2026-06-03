<div align="center">

# CodeMap

### Throw a GitHub repo at it. Get a map of how to *read* it.

A free, no-AI tool that turns any public repository into a dependency map — and tells you **where to start reading**.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#contributing)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#supported-languages)

English · [日本語](docs/README.ja.md) · [简体中文](docs/README.zh-CN.md) · [Español](docs/README.es.md) · [Français](docs/README.fr.md) · [Deutsch](docs/README.de.md) · [Português](docs/README.pt.md) · [한국어](docs/README.ko.md)

<!-- Hero shot: CodeMap analyzing its own source (dogfooding). Saved to docs/assets/self.png -->
![CodeMap visualizing its own source code — files grouped into colored boxes by directory, with a "where to start" reading guide on the right](docs/assets/self.png)

<sub>*Left: the dependency map — files grouped into colored boxes by directory. Right: where to start reading — entry points, foundations, and leaves, sorted automatically. Above: CodeMap reading its own source.*</sub>

</div>

---

## Table of contents

- [The problem](#the-problem)
- [What CodeMap does](#what-codemap-does)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Supported languages](#supported-languages)
- [Status & roadmap](#status--roadmap)
- [Contributing](#contributing)
- [License](#license)

## The problem

You open an unfamiliar repository to learn from it. You're faced with hundreds of files and no idea where to begin. The tools that exist each leave a gap:

- **AI chat tools** (Cursor, Claude Code, DeepWiki) answer about a *point* in the code — but there's **no map**. You only learn what you asked, and the whole picture never assembles in your head.
- **Visualization tools** (Sourcegraph, Madge) give you a map — but it's **just lines**. They don't tell you what each file does, or where to start.

So you're stuck: you can ask about trees, or stare at a forest, but nothing hands you the **trail**.

## What CodeMap does

General-purpose AI **answers your questions**. CodeMap **draws the map of the whole project — and points to the trailhead.**

Paste a public GitHub URL. CodeMap parses the source and gives you:

- **🗺️ A dependency map** — which file imports which, as an interactive diagram. Files are grouped into colored boxes by directory, so the shape of the codebase is visible at a glance.
- **📍 Where to start reading** — every file is sorted into **entry points** (where execution starts), **foundations** (depended on by many — understand these to grasp the whole), and **leaves** (standalone, read later). This is how experienced developers actually read unfamiliar code: not line 1 to the end, but overview → entry → core, never reading everything.
- **🏷️ What each file probably is** — a one-word role guessed from its name and path (`Type definitions`, `Routing`, `Core logic`…), with zero AI and zero hallucination. When it can't tell, it stays silent rather than guessing wrong.
- **📖 The actual code** — click any file to read its source in a fullscreen view, with the map and dependencies kept beside you so you never lose your place.

Everything above is built **mechanically — no AI, no API key, free, and fast.** AI is reserved for an optional future explanation layer, via your own API key (BYOK).

The UI is available in **8 languages** (English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어).

## Quick start

Requires Node.js 20+.

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

Open <http://localhost:3000>, paste a repo (`owner/repo` or a full `github.com/...` URL), and hit **Analyze**. Try `sindresorhus/ky` or `cli/cli` to see it on a real codebase.

## How it works

```
GitHub repo  ──tar.gz (codeload, no auth)──▶  extract source files
                                                     │
                                                     ▼
                              src/lib/analyze.ts  (language dispatcher)
                               ├─ JS/TS  → ts-morph (accurate AST imports)
                               ├─ Python → regex resolver
                               └─ Go/Rust → regex resolver
                                                     │
                                                     ▼
                       dependency graph ──▶ React Flow diagram + reading guide
```

- **Frontend:** Next.js 16 (App Router), React Flow (`@xyflow/react`), Tailwind CSS v4
- **Fetch:** public repos pulled as a tarball from codeload (no authentication), source files extracted
- **Analysis:** `src/lib/analyze.ts` dispatches by language; supported extensions live in `src/lib/languages.ts` (`SOURCE_EXT`) — adding a language starts there
- **Reading guide:** `src/lib/reading-guide.ts` derives entry/foundation/leaf purely from import counts — no AI

## Supported languages

| Language | Dependency analysis | Map · reading guide · role hints |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ regex | ✅ |
| Go | ✅ regex (module-aware) | ✅ |
| Rust | ✅ regex (`mod` / `use crate::`) | ✅ |
| Others (Java, C/C++, Ruby…) | — fetched & mapped | ✅ (no import lines) |

## Status & roadmap

> ⚠️ **Early but usable.** The free "read a repo" layer works today. The AI explanation layers are the next phase.

| Feature | State |
|---|---|
| Dependency map with directory grouping | ✅ Shipped |
| "Where to start" guide (entry / foundation / leaf) | ✅ Shipped |
| File-role hints (no AI) | ✅ Shipped |
| Fullscreen code reader with map/deps nav | ✅ Shipped |
| 8-language UI | ✅ Shipped |
| File-role summaries — what a file does, in one line (AI) | 🔜 Planned (BYOK) |
| Line-by-line explanation for beginners — "what breaks if you delete this line" (AI) | 🔜 Planned (BYOK) |

The AI layers will be **grounded in AST facts** (where a symbol is defined/used, where an import resolves) so explanations don't hallucinate — critical for a tool aimed at learners.

## Contributing

Issues and PRs are welcome. A great first contribution is **adding a language**: extend `SOURCE_EXT` and the dispatcher in `src/lib/languages.ts` (Python/Go/Rust are regex-based examples to follow).

## License

[MIT](LICENSE)
