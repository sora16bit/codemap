<div align="center">

# CodeMap

### 丢给它一个 GitHub 仓库，得到一张「该怎么读」的地图。

一个免费、无需 AI 的工具，把任何公开仓库变成依赖地图，并告诉你**该从哪里开始读**。

**[▶ 立即在线体验 codemap.sora16bit.com](https://codemap.sora16bit.com)**

[![Live demo](https://img.shields.io/badge/demo-codemap.sora16bit.com-2563eb.svg)](https://codemap.sora16bit.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#贡献)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#支持的语言)

[English](../README.md) · [日本語](README.ja.md) · 简体中文 · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [한국어](README.ko.md)

<!-- 主图：CodeMap 分析自身源码的截图（dogfooding）。保存到 docs/assets/self.png。 -->
![CodeMap 可视化自身源码 —— 文件按目录分组到彩色方框中，右侧带有「从哪读起」指南](assets/self.png)

<sub>*左：依赖地图 —— 文件按目录分组到彩色方框中。右：从哪读起 —— 自动归类为入口、基础与叶子。上：CodeMap 正在阅读自身的源码。*</sub>

</div>

---

## 目录

- [问题](#问题)
- [CodeMap 做什么](#codemap-做什么)
- [快速开始](#快速开始)
- [工作原理](#工作原理)
- [支持的语言](#支持的语言)
- [状态与路线图](#状态与路线图)
- [贡献](#贡献)
- [许可证](#许可证)

## 问题

你打开一个陌生仓库想学习。面对成百上千个文件，却不知从何下手。现有工具各有缺口：

- **AI 聊天类**（Cursor、Claude Code、DeepWiki）能回答代码中*某一点*的问题，但**没有地图**。你只了解你问的部分，整体图景始终无法在脑中拼合。
- **可视化类**（Sourcegraph、Madge）给你一张地图，但那**只是些线**。它们不告诉你每个文件做什么、该从哪读起。

于是你卡住了：要么问树木，要么望森林，却没有东西递给你一条**路径**。

## CodeMap 做什么

通用 AI **回答你的问题**。CodeMap **画出整个项目的地图 —— 并指向入口。**

粘贴公开仓库的 GitHub 链接，CodeMap 解析源码后给你：

- **🗺️ 依赖地图** —— 哪个文件 import 哪个，呈现为交互式图。文件按目录分组到彩色方框，代码库的形态一眼可见。
- **📍 从哪读起** —— 把每个文件分为**入口**（执行起点）、**基础**（被许多文件依赖 —— 理解它们就能把握整体）、**末端**（独立、可稍后读）。这正是有经验的开发者阅读陌生代码的真实方式：不是从第一行读到最后，而是俯瞰 → 入口 → 核心，且从不读完全部。
- **🏷️ 每个文件大概是什么** —— 从名称和路径推测的一词角色（`类型定义`、`路由`、`核心逻辑`…），零 AI、零幻觉。无法判断时宁可沉默，也不乱猜。
- **📖 真实代码** —— 点击任意文件全屏阅读源码，地图和依赖保留在旁，让你不会迷失位置。

以上全部**机械生成 —— 无需 AI、无需 API 密钥、免费且快速。** AI 留给可选的未来讲解层（用你自己的 API 密钥，BYOK）。

界面支持**8 种语言**（English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어）。

## 快速开始

最快的方式是**[在线体验](https://codemap.sora16bit.com)**（无需安装）。粘贴仓库（`owner/repo` 或完整的 `github.com/...` 链接）并点击 **分析**。可用 `sindresorhus/ky` 或 `cli/cli` 在真实代码库上试试。

在本地运行（需要 Node.js 20+）：

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

然后打开 <http://localhost:3000>。

## 工作原理

```
GitHub 仓库 ──tar.gz（codeload，免鉴权）──▶ 提取源文件
                                              │
                                              ▼
                        src/lib/analyze.ts （语言分发器）
                         ├─ JS/TS  → ts-morph（精确的 AST import 解析）
                         ├─ Python → 正则解析器
                         └─ Go/Rust → 正则解析器
                                              │
                                              ▼
                       依赖图 ──▶ React Flow 图表 ＋ 阅读顺序指南
```

- **前端：** Next.js 16（App Router）、React Flow（`@xyflow/react`）、Tailwind CSS v4
- **获取：** 公开仓库从 codeload 以 tarball 拉取（免鉴权），仅提取源文件
- **解析：** `src/lib/analyze.ts` 按语言分发；支持的扩展名集中在 `src/lib/languages.ts`（`SOURCE_EXT`）—— 新增语言从这里开始
- **阅读指南：** `src/lib/reading-guide.ts` 仅凭 import 数推导入口/基础/末端 —— 无需 AI

## 支持的语言

| 语言 | 依赖分析 | 地图・阅读顺序・角色提示 |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ 正则 | ✅ |
| Go | ✅ 正则（module 解析） | ✅ |
| Rust | ✅ 正则（`mod` / `use crate::`） | ✅ |
| 其他（Java, C/C++, Ruby…） | — 仅获取与地图化 | ✅（无 import 线） |

## 状态与路线图

> ⚠️ **早期但可用。** 免费的「读懂仓库」层今天就能用。AI 讲解层是下一阶段。

| 功能 | 状态 |
|---|---|
| 带目录分组的依赖地图 | ✅ 已发布 |
| 「从哪读起」指南（入口/基础/末端） | ✅ 已发布 |
| 文件角色提示（无 AI） | ✅ 已发布 |
| 带地图/依赖导航的全屏代码阅读器 | ✅ 已发布 |
| 8 语言界面 | ✅ 已发布 |
| 文件作用一句话摘要（AI） | 🔜 计划中（BYOK） |
| 面向初学者的逐行讲解 —— 「删掉这行会坏掉什么」（AI） | 🔜 计划中（BYOK） |

AI 层将**以 AST 的确切事实为护栏**（符号在哪定义/使用、import 解析到哪里）**以防幻觉** —— 对面向学习者的工具至关重要。

## 贡献

欢迎 Issue 和 PR。很好的第一个贡献是**新增语言**：扩展 `src/lib/languages.ts` 中的 `SOURCE_EXT` 和分发器（Python/Go/Rust 是可参考的正则示例）。

## 许可证

[MIT](../LICENSE)
