<div align="center">

# CodeMap

### GitHub 저장소를 던지면, *어떻게 읽을지*의 지도가 나옵니다.

공개 저장소를 의존성 지도로 바꾸고, **어디서부터 읽기 시작할지**까지 알려주는 무료·AI 불필요 도구.

**[▶ codemap.sora16bit.com에서 지금 사용해보기](https://codemap.sora16bit.com)**

[![Live demo](https://img.shields.io/badge/demo-codemap.sora16bit.com-2563eb.svg)](https://codemap.sora16bit.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#기여)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#지원-언어)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · 한국어

<!-- 히어로 이미지: CodeMap이 자기 자신의 소스를 분석한 그림(도그푸딩). docs/assets/self.png에 저장. -->
![CodeMap이 자기 자신의 소스 코드를 시각화한 그림 — 파일이 디렉터리별 색상 박스로 그룹화되고 오른쪽에 「어디서부터 읽을지」 가이드가 함께 표시됨](assets/self.png)

<sub>*왼쪽: 의존성 지도 — 파일이 디렉터리별 색상 박스로 그룹화됨. 오른쪽: 어디서부터 읽을지 — 진입점, 기반, 잎으로 자동 분류. 위: CodeMap이 자기 자신의 소스를 읽는 그림.*</sub>

</div>

---

## 목차

- [문제](#문제)
- [CodeMap이 하는 일](#codemap이-하는-일)
- [빠른 시작](#빠른-시작)
- [동작 방식](#동작-방식)
- [지원 언어](#지원-언어)
- [상태 및 로드맵](#상태-및-로드맵)
- [기여](#기여)
- [라이선스](#라이선스)

## 문제

배우려고 낯선 저장소를 엽니다. 수백 개의 파일 앞에서 어디서부터 시작해야 할지 모릅니다. 기존 도구는 각각 빈틈이 있습니다:

- **AI 채팅 도구**(Cursor, Claude Code, DeepWiki)는 코드의 *한 지점*에 답하지만 **지도가 없습니다**. 물어본 것만 알게 되고, 전체 그림이 머릿속에서 끝내 조립되지 않습니다.
- **시각화 도구**(Sourcegraph, Madge)는 지도를 주지만 **선뿐**입니다. 각 파일이 무엇을 하는지, 어디서부터 읽을지는 알려주지 않습니다.

그래서 막힙니다. 나무를 묻거나 숲을 바라볼 수는 있어도, **길**을 건네주는 것은 없습니다.

## CodeMap이 하는 일

범용 AI는 **질문에 답합니다**. CodeMap은 **프로젝트 전체의 지도를 그리고 — 진입점을 가리킵니다.**

공개 저장소의 GitHub URL을 붙여 넣으면, 소스를 분석해 다음을 줍니다:

- **🗺️ 의존성 지도** — 어떤 파일이 어떤 파일을 import 하는지 인터랙티브 다이어그램으로. 파일은 디렉터리별 색상 박스로 묶여 코드베이스의 형태가 한눈에 보입니다.
- **📍 어디서부터 읽을지** — 모든 파일을 **입구**(실행이 시작되는 곳), **토대**(많은 파일이 의존 — 이해하면 전체가 보임), **말단**(독립적, 나중에 읽기)으로 분류합니다. 이것이 숙련된 개발자가 낯선 코드를 읽는 실제 방식입니다. 1번째 줄부터 끝까지가 아니라 조망 → 입구 → 핵심, 그리고 전부 읽지 않습니다.
- **🏷️ 각 파일이 아마 무엇인지** — 이름과 경로에서 추측한 한 단어 역할(`타입 정의`, `라우팅`, `핵심 로직`…), AI 없이 환각도 없이. 알 수 없을 땐 틀리게 추측하기보다 침묵합니다.
- **📖 실제 코드** — 어떤 파일이든 클릭하면 전체 화면으로 소스를 읽되, 지도와 의존 관계를 옆에 두어 위치를 잃지 않습니다.

위 모든 것은 **기계적으로 생성 — AI 불필요, API 키 불필요, 무료이고 빠름.** AI는 선택적인 미래의 설명 레이어(본인 API 키 사용, BYOK)를 위해 남겨둡니다.

UI는 **8개 언어**로 제공됩니다(English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어).

## 빠른 시작

가장 빠른 방법은 **[라이브 데모](https://codemap.sora16bit.com)** (설치 불필요)입니다. 저장소(`owner/repo` 또는 전체 `github.com/...` URL)를 붙여넣고 **분석**을 누르세요. `sindresorhus/ky`나 `cli/cli`로 실제 코드베이스에서 시험해 보세요.

로컬에서 실행하려면 (Node.js 20 이상):

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

그런 다음 <http://localhost:3000>을 여세요.

## 동작 방식

```
GitHub 저장소 ──tar.gz (codeload, 인증 불필요)──▶ 소스 파일 추출
                                                    │
                                                    ▼
                          src/lib/analyze.ts  (언어 디스패처)
                           ├─ JS/TS  → ts-morph (정확한 AST import 분석)
                           ├─ Python → 정규식 리졸버
                           └─ Go/Rust → 정규식 리졸버
                                                    │
                                                    ▼
                의존성 그래프 ──▶ React Flow 다이어그램 + 읽는 순서 가이드
```

- **프런트엔드:** Next.js 16 (App Router), React Flow (`@xyflow/react`), Tailwind CSS v4
- **가져오기:** 공개 저장소를 codeload에서 tarball로 받아(인증 불필요) 소스 파일만 추출
- **분석:** `src/lib/analyze.ts`가 언어별로 분배. 지원 확장자는 `src/lib/languages.ts`(`SOURCE_EXT`)에 모여 있음 — 언어 추가는 여기서 시작
- **읽는 순서 가이드:** `src/lib/reading-guide.ts`가 import 수만으로 입구/토대/말단을 도출 — AI 불필요

## 지원 언어

| 언어 | 의존성 분석 | 지도・읽는 순서・역할 힌트 |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ 정규식 | ✅ |
| Go | ✅ 정규식 (module 인식) | ✅ |
| Rust | ✅ 정규식 (`mod` / `use crate::`) | ✅ |
| 기타 (Java, C/C++, Ruby…) | — 가져와서 지도화만 | ✅ (import 선 없음) |

## 상태 및 로드맵

> ⚠️ **초기지만 사용 가능.** 무료 「저장소 읽기」 레이어는 지금 동작합니다. AI 설명 레이어가 다음 단계입니다.

| 기능 | 상태 |
|---|---|
| 디렉터리 그룹화 의존성 지도 | ✅ 배포됨 |
| 「어디서부터 읽을지」 가이드 (입구 / 토대 / 말단) | ✅ 배포됨 |
| 파일 역할 힌트 (AI 불필요) | ✅ 배포됨 |
| 지도/의존 내비게이션이 있는 전체 화면 코드 리더 | ✅ 배포됨 |
| 8개 언어 UI | ✅ 배포됨 |
| 파일 역할 한 줄 요약 (AI) | 🔜 예정 (BYOK) |
| 초보자용 한 줄씩 설명 — 「이 줄을 지우면 무엇이 깨지는가」 (AI) | 🔜 예정 (BYOK) |

AI 레이어는 **AST의 확실한 사실**(심볼이 어디서 정의/사용되는지, import가 어디로 해석되는지)을 **가드레일로 삼아 환각을 막습니다** — 학습자를 위한 도구에는 필수입니다.

## 기여

이슈와 PR을 환영합니다. 첫 기여로 좋은 것은 **언어 추가**입니다: `src/lib/languages.ts`의 `SOURCE_EXT`와 디스패처를 확장하세요(Python/Go/Rust가 정규식 기반 예시).

## 라이선스

[MIT](../LICENSE)
