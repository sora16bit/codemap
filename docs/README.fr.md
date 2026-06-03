<div align="center">

# CodeMap

### Donnez-lui un dépôt GitHub. Obtenez une carte de *comment* le lire.

Un outil gratuit et sans IA qui transforme n'importe quel dépôt public en carte de dépendances — et vous dit **par où commencer à lire**.

**[▶ Essayez-le en ligne sur codemap.sora16bit.com](https://codemap.sora16bit.com)**

[![Live demo](https://img.shields.io/badge/demo-codemap.sora16bit.com-2563eb.svg)](https://codemap.sora16bit.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](../LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#contribuer)
[![Languages](https://img.shields.io/badge/analyzes-JS%20%C2%B7%20TS%20%C2%B7%20Python%20%C2%B7%20Go%20%C2%B7%20Rust-black.svg)](#langages-pris-en-charge)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · Français · [Deutsch](README.de.md) · [Português](README.pt.md) · [한국어](README.ko.md)

<!-- Image principale : CodeMap analysant son propre code (dogfooding). Enregistrée dans docs/assets/self.png -->
![CodeMap visualisant son propre code source — fichiers regroupés en boîtes colorées par répertoire, avec un guide « par où commencer » à droite](assets/self.png)

<sub>*À gauche : la carte des dépendances — fichiers regroupés en boîtes colorées par répertoire. À droite : par où commencer — points d'entrée, fondations et feuilles, triés automatiquement. Ci-dessus : CodeMap lisant son propre code.*</sub>

</div>

---

## Sommaire

- [Le problème](#le-problème)
- [Ce que fait CodeMap](#ce-que-fait-codemap)
- [Démarrage rapide](#démarrage-rapide)
- [Comment ça marche](#comment-ça-marche)
- [Langages pris en charge](#langages-pris-en-charge)
- [État et feuille de route](#état-et-feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)

## Le problème

Vous ouvrez un dépôt inconnu pour en apprendre. Face à des centaines de fichiers, vous ne savez pas par où commencer. Les outils existants laissent chacun un manque :

- **Les outils de chat IA** (Cursor, Claude Code, DeepWiki) répondent sur un *point* du code, mais **il n'y a pas de carte**. Vous n'apprenez que ce que vous avez demandé, et la vue d'ensemble ne s'assemble jamais dans votre tête.
- **Les outils de visualisation** (Sourcegraph, Madge) donnent une carte, mais ce ne sont **que des lignes**. Ils ne disent pas ce que fait chaque fichier ni par où commencer.

Vous êtes donc coincé : interroger les arbres ou contempler la forêt, mais rien ne vous tend le **sentier**.

## Ce que fait CodeMap

L'IA généraliste **répond à vos questions**. CodeMap **dessine la carte de tout le projet — et indique le point de départ.**

Collez l'URL d'un dépôt public GitHub. CodeMap analyse le code source et vous donne :

- **🗺️ Une carte de dépendances** — quel fichier importe quel autre, en diagramme interactif. Les fichiers sont regroupés en boîtes colorées par dossier, la forme de la base de code se voit d'un coup d'œil.
- **📍 Par où commencer** — chaque fichier est classé en **points d'entrée** (où l'exécution commence), **socles** (dont beaucoup dépendent — comprenez-les pour saisir l'ensemble) et **feuilles** (autonomes, à lire plus tard). C'est ainsi que les développeurs expérimentés lisent du code inconnu : pas de la ligne 1 à la fin, mais vue d'ensemble → entrée → cœur, sans tout lire.
- **🏷️ Ce qu'est probablement chaque fichier** — un rôle en un mot déduit de son nom et de son chemin (`Définitions de types`, `Routage`, `Logique centrale`…), zéro IA et zéro hallucination. Quand il ne peut pas savoir, il se tait au lieu de mal deviner.
- **📖 Le code réel** — cliquez sur n'importe quel fichier pour lire sa source en plein écran, la carte et les dépendances restant à côté pour ne pas perdre votre place.

Tout cela est construit **mécaniquement — sans IA, sans clé d'API, gratuit et rapide.** L'IA est réservée à une future couche d'explication optionnelle, via votre propre clé d'API (BYOK).

L'interface est disponible en **8 langues** (English, 日本語, 简体中文, Español, Français, Deutsch, Português, 한국어).

## Démarrage rapide

Le plus rapide est la **[démo en ligne](https://codemap.sora16bit.com)** (sans installation). Collez un dépôt (`owner/repo` ou une URL complète `github.com/...`) et cliquez sur **Analyser**. Essayez `sindresorhus/ky` ou `cli/cli` pour le voir sur une vraie base de code.

Pour l'exécuter localement (Node.js 20+) :

```bash
git clone https://github.com/sora16bit/codemap.git
cd codemap
npm install
npm run dev
```

Puis ouvrez <http://localhost:3000>.

## Comment ça marche

```
Dépôt GitHub ──tar.gz (codeload, sans auth)──▶ extraire les fichiers source
                                                     │
                                                     ▼
                           src/lib/analyze.ts  (répartiteur de langages)
                            ├─ JS/TS  → ts-morph (imports AST précis)
                            ├─ Python → résolveur regex
                            └─ Go/Rust → résolveur regex
                                                     │
                                                     ▼
              graphe de dépendances ──▶ diagramme React Flow + guide de lecture
```

- **Frontend :** Next.js 16 (App Router), React Flow (`@xyflow/react`), Tailwind CSS v4
- **Récupération :** les dépôts publics sont téléchargés en tarball depuis codeload (sans auth), les fichiers source extraits
- **Analyse :** `src/lib/analyze.ts` répartit par langage ; les extensions prises en charge sont dans `src/lib/languages.ts` (`SOURCE_EXT`) — ajouter un langage commence ici
- **Guide de lecture :** `src/lib/reading-guide.ts` dérive entrée/socle/feuille uniquement des comptes d'import — sans IA

## Langages pris en charge

| Langage | Analyse de dépendances | Carte · guide de lecture · indices de rôle |
|---|---|---|
| JavaScript / TypeScript | ✅ AST (ts-morph) | ✅ |
| Python | ✅ regex | ✅ |
| Go | ✅ regex (sensible au module) | ✅ |
| Rust | ✅ regex (`mod` / `use crate::`) | ✅ |
| Autres (Java, C/C++, Ruby…) | — récupérés et cartographiés | ✅ (sans lignes d'import) |

## État et feuille de route

> ⚠️ **Précoce mais utilisable.** La couche gratuite « lire un dépôt » fonctionne aujourd'hui. Les couches d'explication par IA sont la prochaine phase.

| Fonctionnalité | État |
|---|---|
| Carte de dépendances avec regroupement par dossier | ✅ Livré |
| Guide « par où commencer » (entrée / socle / feuille) | ✅ Livré |
| Indices de rôle de fichier (sans IA) | ✅ Livré |
| Lecteur de code plein écran avec navigation carte/deps | ✅ Livré |
| Interface en 8 langues | ✅ Livré |
| Résumés de rôle de fichier — ce qu'il fait, en une ligne (IA) | 🔜 Prévu (BYOK) |
| Explication ligne par ligne pour débutants — « ce qui casse si vous supprimez cette ligne » (IA) | 🔜 Prévu (BYOK) |

Les couches d'IA seront **ancrées dans les faits de l'AST** (où un symbole est défini/utilisé, où un import se résout) pour que les explications n'hallucinent pas — crucial pour un outil destiné aux apprenants.

## Contribuer

Les issues et PR sont les bienvenues. Une excellente première contribution est d'**ajouter un langage** : étendez `SOURCE_EXT` et le répartiteur dans `src/lib/languages.ts` (Python/Go/Rust sont des exemples basés sur regex à suivre).

## Licence

[MIT](../LICENSE)
