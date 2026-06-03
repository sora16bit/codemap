<div align="center">

# CodeMap

### Lánzale un repo de GitHub. Obtén un mapa de *cómo* leerlo.

Convierte cualquier repositorio público en un mapa de dependencias — y te dice **por dónde empezar a leer**. El mapa se construye mecánicamente: gratis, rápido, sin clave de API.

**[▶ Pruébalo en vivo en codemap.sora16bit.com](https://codemap.sora16bit.com)**

[![Live demo](https://img.shields.io/badge/demo-codemap.sora16bit.com-2563eb.svg)](https://codemap.sora16bit.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#contribuir)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#lenguajes-admitidos)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · Español · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [한국어](README.ko.md)

<!-- Imagen principal: CodeMap analizando su propio código (dogfooding). Guardada en docs/assets/self.png -->
![CodeMap visualizando su propio código fuente — archivos agrupados en cajas de colores por directorio, con una guía de "por dónde empezar" a la derecha](assets/self.png)

<sub>*Izquierda: el mapa de dependencias — archivos agrupados en cajas de colores por directorio. Derecha: por dónde empezar — puntos de entrada, fundamentos y hojas, ordenados automáticamente. Arriba: CodeMap leyendo su propio código.*</sub>

</div>

---

## Índice

- [El problema](#el-problema)
- [Qué hace CodeMap](#qué-hace-codemap)
- [Inicio rápido](#inicio-rápido)
- [Cómo funciona](#cómo-funciona)
- [Lenguajes admitidos](#lenguajes-admitidos)
- [Estado y hoja de ruta](#estado-y-hoja-de-ruta)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## El problema

Abres un repositorio desconocido para aprender de él. Te enfrentas a cientos de archivos sin idea de por dónde empezar. Las herramientas que existen dejan un hueco cada una:

- **Las herramientas de chat con IA** (Cursor, Claude Code, DeepWiki) responden sobre un *punto* del código, pero **no hay mapa**. Solo aprendes lo que preguntaste y el panorama completo nunca se arma en tu cabeza.
- **Las herramientas de visualización** (Sourcegraph, Madge) te dan un mapa, pero son **solo líneas**. No te dicen qué hace cada archivo ni por dónde empezar.

Así que te atascas: puedes preguntar por los árboles o mirar el bosque, pero nada te entrega el **sendero**.

## Qué hace CodeMap

La IA de propósito general **responde tus preguntas**. CodeMap **dibuja el mapa de todo el proyecto — y señala el punto de partida.**

Pega una URL de un repo público de GitHub. CodeMap analiza el código y te da:

- **🗺️ Un mapa de dependencias** — qué archivo importa a cuál, como diagrama interactivo. Los archivos se agrupan en cajas de colores por carpeta, así la forma de la base de código se ve de un vistazo.
- **📍 Por dónde empezar** — cada archivo se clasifica en **puntos de entrada** (donde empieza la ejecución), **bases** (de las que dependen muchos — entiéndelas para captar el conjunto) y **hojas** (independientes, para leer después). Así leen los desarrolladores con experiencia el código desconocido: no de la línea 1 al final, sino visión general → entrada → núcleo, sin leerlo todo.
- **🏷️ Qué es probablemente cada archivo** — un rol de una palabra deducido de su nombre y ruta (`Definiciones de tipos`, `Enrutamiento`, `Lógica central`…), con cero IA y cero alucinación. Cuando no puede saberlo, calla en vez de adivinar mal.
- **📖 El código real** — clic en cualquier archivo para leer su fuente a pantalla completa, con el mapa y las dependencias al lado para no perder el sitio.

Todo lo anterior se construye **mecánicamente — sin IA, sin clave de API, gratis y rápido.** La IA se reserva para una futura capa opcional de explicación, con tu propia clave de API (BYOK).

La interfaz está disponible en **8 idiomas** (English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어).

## Inicio rápido

La forma más rápida es la **[demo en vivo](https://codemap.sora16bit.com)** (sin instalar). Pega un repo (`owner/repo` o una URL completa `github.com/...`) y pulsa **Analizar**. Prueba `sindresorhus/ky` o `cli/cli` para verlo en una base de código real.

Para ejecutarlo localmente (Node.js 20+):

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

Luego abre <http://localhost:3000>.

## Cómo funciona

```
Repo de GitHub ──tar.gz (codeload, sin auth)──▶ extraer archivos fuente
                                                      │
                                                      ▼
                            src/lib/analyze.ts  (despachador de lenguajes)
                             ├─ JS/TS  → ts-morph (imports AST precisos)
                             ├─ Python → resolutor regex
                             └─ Go/Rust → resolutor regex
                                                      │
                                                      ▼
                  grafo de dependencias ──▶ diagrama React Flow + guía de lectura
```

- **Frontend:** Next.js 16 (App Router), React Flow (`@xyflow/react`), Tailwind CSS v4
- **Obtención:** los repos públicos se descargan como tarball desde codeload (sin auth) y se extraen los archivos fuente
- **Análisis:** `src/lib/analyze.ts` despacha por lenguaje; las extensiones admitidas viven en `src/lib/languages.ts` (`SOURCE_EXT`) — añadir un lenguaje empieza ahí
- **Guía de lectura:** `src/lib/reading-guide.ts` deriva entrada/base/hoja solo de los conteos de import — sin IA

## Lenguajes admitidos

| Lenguaje | Análisis de dependencias | Mapa · guía de lectura · pistas de rol |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ regex | ✅ |
| Go | ✅ regex (consciente del module) | ✅ |
| Rust | ✅ regex (`mod` / `use crate::`) | ✅ |
| Otros (Java, C/C++, Ruby…) | — obtenidos y mapeados | ✅ (sin líneas de import) |

## Estado y hoja de ruta

> ⚠️ **Temprano pero usable.** La capa gratuita de "leer un repo" funciona hoy. Las capas de explicación con IA son la siguiente fase.

| Función | Estado |
|---|---|
| Mapa de dependencias con agrupación por carpeta | ✅ Publicado |
| Guía de "por dónde empezar" (entrada / base / hoja) | ✅ Publicado |
| Pistas de rol de archivo (sin IA) | ✅ Publicado |
| Lector de código a pantalla completa con navegación de mapa/deps | ✅ Publicado |
| Interfaz en 8 idiomas | ✅ Publicado |
| Resúmenes de rol de archivo — qué hace, en una línea (IA) | 🔜 Planeado (BYOK) |
| Explicación línea por línea para principiantes — "qué se rompe si borras esta línea" (IA) | 🔜 Planeado (BYOK) |

Las capas de IA estarán **ancladas en hechos del AST** (dónde se define/usa un símbolo, a dónde resuelve un import) para que las explicaciones no aluciden — crucial para una herramienta dirigida a quienes aprenden.

## Contribuir

Issues y PRs son bienvenidos. Una gran primera contribución es **añadir un lenguaje**: extiende `SOURCE_EXT` y el despachador en `src/lib/languages.ts` (Python/Go/Rust son ejemplos basados en regex a seguir).

## Licencia

[MIT](../LICENSE)
