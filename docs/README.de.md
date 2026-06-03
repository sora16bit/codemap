<div align="center">

# CodeMap

### Wirf ihm ein GitHub-Repo zu. Erhalte eine Karte, *wie* man es liest.

Ein kostenloses Tool ohne KI, das jedes öffentliche Repository in eine Abhängigkeitskarte verwandelt — und dir sagt, **wo du mit dem Lesen anfangen sollst**.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#mitwirken)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#unterstützte-sprachen)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · Deutsch · [Português](README.pt.md) · [한국어](README.ko.md)

<!-- Hero-Bild: CodeMap analysiert seinen eigenen Quellcode (Dogfooding). Gespeichert in docs/assets/self.png -->
![CodeMap visualisiert seinen eigenen Quellcode — Dateien pro Verzeichnis in farbige Kästen gruppiert, rechts mit einem „Wo anfangen“-Leitfaden](assets/self.png)

<sub>*Links: die Abhängigkeitskarte — Dateien pro Verzeichnis in farbige Kästen gruppiert. Rechts: wo anfangen — Einstiegspunkte, Fundamente und Blätter, automatisch sortiert. Oben: CodeMap liest seinen eigenen Quellcode.*</sub>

</div>

---

## Inhalt

- [Das Problem](#das-problem)
- [Was CodeMap macht](#was-codemap-macht)
- [Schnellstart](#schnellstart)
- [Wie es funktioniert](#wie-es-funktioniert)
- [Unterstützte Sprachen](#unterstützte-sprachen)
- [Status & Roadmap](#status--roadmap)
- [Mitwirken](#mitwirken)
- [Lizenz](#lizenz)

## Das Problem

Du öffnest ein unbekanntes Repository, um daraus zu lernen. Vor dir Hunderte Dateien, und keine Ahnung, wo anfangen. Die vorhandenen Tools lassen je eine Lücke:

- **KI-Chat-Tools** (Cursor, Claude Code, DeepWiki) beantworten einen *Punkt* im Code — aber es gibt **keine Karte**. Du erfährst nur, wonach du gefragt hast, und das Gesamtbild fügt sich im Kopf nie zusammen.
- **Visualisierungstools** (Sourcegraph, Madge) geben dir eine Karte — aber das sind **nur Linien**. Sie sagen nicht, was jede Datei tut oder wo man anfängt.

Also steckst du fest: Bäume befragen oder den Wald betrachten, aber nichts reicht dir den **Pfad**.

## Was CodeMap macht

Allzweck-KI **beantwortet deine Fragen**. CodeMap **zeichnet die Karte des gesamten Projekts — und zeigt den Einstieg.**

Füge die URL eines öffentlichen GitHub-Repos ein. CodeMap analysiert den Quellcode und gibt dir:

- **🗺️ Eine Abhängigkeitskarte** — welche Datei welche importiert, als interaktives Diagramm. Dateien werden pro Ordner in farbige Kästen gruppiert, die Form der Codebasis ist auf einen Blick sichtbar.
- **📍 Wo anfangen** — jede Datei wird einsortiert in **Einstiegspunkte** (wo die Ausführung beginnt), **Fundamente** (von vielen abhängig — verstehe sie, um das Ganze zu erfassen) und **Blätter** (eigenständig, später lesen). So lesen erfahrene Entwickler unbekannten Code: nicht von Zeile 1 bis zum Ende, sondern Überblick → Einstieg → Kern, und nie alles.
- **🏷️ Was jede Datei vermutlich ist** — eine Ein-Wort-Rolle aus Name und Pfad abgeleitet (`Typdefinitionen`, `Routing`, `Kernlogik`…), null KI und null Halluzination. Wenn unklar, schweigt es lieber, als falsch zu raten.
- **📖 Der echte Code** — klicke auf eine Datei, um ihren Quelltext im Vollbild zu lesen, mit Karte und Abhängigkeiten daneben, damit du den Überblick behältst.

All das wird **maschinell erstellt — keine KI, kein API-Schlüssel, kostenlos und schnell.** KI bleibt einer optionalen künftigen Erklärungsschicht vorbehalten, über deinen eigenen API-Schlüssel (BYOK).

Die Oberfläche gibt es in **8 Sprachen** (English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어).

## Schnellstart

Benötigt Node.js 20+.

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

Öffne <http://localhost:3000>, füge ein Repo ein (`owner/repo` oder eine vollständige `github.com/...`-URL) und klicke auf **Analysieren**. Probiere `sindresorhus/ky` oder `cli/cli`, um es an echtem Code zu sehen.

## Wie es funktioniert

```
GitHub-Repo ──tar.gz (codeload, ohne Auth)──▶ Quelldateien extrahieren
                                                   │
                                                   ▼
                          src/lib/analyze.ts  (Sprach-Dispatcher)
                           ├─ JS/TS  → ts-morph (präzise AST-Imports)
                           ├─ Python → Regex-Resolver
                           └─ Go/Rust → Regex-Resolver
                                                   │
                                                   ▼
               Abhängigkeitsgraph ──▶ React-Flow-Diagramm + Lese-Leitfaden
```

- **Frontend:** Next.js 16 (App Router), React Flow (`@xyflow/react`), Tailwind CSS v4
- **Abruf:** öffentliche Repos werden als Tarball von codeload geladen (ohne Auth), Quelldateien extrahiert
- **Analyse:** `src/lib/analyze.ts` verteilt nach Sprache; unterstützte Endungen liegen in `src/lib/languages.ts` (`SOURCE_EXT`) — eine Sprache hinzuzufügen beginnt hier
- **Lese-Leitfaden:** `src/lib/reading-guide.ts` leitet Einstieg/Fundament/Blatt allein aus Import-Zahlen ab — ohne KI

## Unterstützte Sprachen

| Sprache | Abhängigkeitsanalyse | Karte · Lese-Leitfaden · Rollenhinweise |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ Regex | ✅ |
| Go | ✅ Regex (module-bewusst) | ✅ |
| Rust | ✅ Regex (`mod` / `use crate::`) | ✅ |
| Andere (Java, C/C++, Ruby…) | — geholt & kartiert | ✅ (ohne Import-Linien) |

## Status & Roadmap

> ⚠️ **Früh, aber nutzbar.** Die kostenlose „Repo lesen“-Schicht funktioniert heute. Die KI-Erklärungsschichten sind die nächste Phase.

| Funktion | Stand |
|---|---|
| Abhängigkeitskarte mit Ordner-Gruppierung | ✅ Veröffentlicht |
| „Wo anfangen“-Leitfaden (Einstieg / Fundament / Blatt) | ✅ Veröffentlicht |
| Datei-Rollenhinweise (ohne KI) | ✅ Veröffentlicht |
| Vollbild-Code-Reader mit Karten-/Deps-Navigation | ✅ Veröffentlicht |
| Oberfläche in 8 Sprachen | ✅ Veröffentlicht |
| Datei-Rollen-Zusammenfassungen — was sie tut, in einer Zeile (KI) | 🔜 Geplant (BYOK) |
| Zeilenweise Erklärung für Einsteiger — „was kaputtgeht, wenn du diese Zeile löschst“ (KI) | 🔜 Geplant (BYOK) |

Die KI-Schichten werden **in AST-Fakten verankert** (wo ein Symbol definiert/verwendet wird, wohin ein Import auflöst), damit Erklärungen nicht halluzinieren — entscheidend für ein Tool für Lernende.

## Mitwirken

Issues und PRs sind willkommen. Ein großartiger erster Beitrag ist das **Hinzufügen einer Sprache**: erweitere `SOURCE_EXT` und den Dispatcher in `src/lib/languages.ts` (Python/Go/Rust sind regex-basierte Vorlagen).

## Lizenz

[MIT](../LICENSE)
