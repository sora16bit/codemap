// 「このファイルは何をするか」を AI なしで推測する。
//
// ファイルの中身は読まない。パス・ディレクトリ名・ファイル名・拡張子の
// 慣習だけから役割を当てる。正確さは AI 要約(②BYOK)に劣るが、
// 無料・即時・幻覚なし。「で、このファイル何？」の空白を埋めるのが目的。
//
// 大原則: 自信が無いときは無理に言わない（null を返す）。
// 初学者向けなので、外れた断定をするより「分からない」を返す方が誠実。
//
// 戻り値は「役割キー」（言語非依存のスラッグ）。表示時に i18n の role.<key> で
// 各言語に訳す。ロジックは言語に依存させない。

/** 役割キー（i18n の role.<key> に対応）。 */
export type RoleKey =
  | "test"
  | "type-def"
  | "type-decl"
  | "util"
  | "ui"
  | "hook"
  | "api"
  | "page"
  | "style"
  | "config"
  | "config-data"
  | "model"
  | "core"
  | "state"
  | "i18n"
  | "entry-name" // 公開の窓口（index）
  | "entrypoint" // 実行の起点（main/cli 等）
  | "constants"
  | "router"
  | "translate"
  | "parser"
  | "generator"
  | "analyzer"
  | "provider"
  | "wrapper"
  | "event"
  | "loader"
  | "validator"
  | "message"
  | "doc"
  | "ext-background"
  | "ext-content"
  | "ext-manifest"
  | "license"
  | "privacy"
  | "userscript";

/** パス断片 → 役割キー。ディレクトリ名やパスの一部に含まれていたら採用。 */
const PATH_HINTS: [RegExp, RoleKey][] = [
  [/(^|\/)(__tests__|tests?|spec|specs|e2e)(\/|$)/i, "test"],
  [/(^|\/)types?(\/|$)/i, "type-def"],
  [/(^|\/)(utils?|helpers?|lib)(\/|$)/i, "util"],
  [/(^|\/)(components?|ui|views?|widgets?)(\/|$)/i, "ui"],
  [/(^|\/)(hooks?)(\/|$)/i, "hook"],
  [/(^|\/)(api|routes?|controllers?|endpoints?)(\/|$)/i, "api"],
  [/(^|\/)(pages?|app)(\/|$)/i, "page"],
  [/(^|\/)(styles?|css)(\/|$)/i, "style"],
  [/(^|\/)(config|configs?|settings?)(\/|$)/i, "config"],
  [/(^|\/)(models?|entities?|schemas?)(\/|$)/i, "model"],
  [/(^|\/)(services?|core)(\/|$)/i, "core"],
  [/(^|\/)(store|stores?|state|redux)(\/|$)/i, "state"],
  [/(^|\/)(locales?|i18n|lang)(\/|$)/i, "i18n"],
];

/** ファイル名（拡張子抜き）→ 役割キー。完全一致寄りの強いヒント。 */
const NAME_HINTS: [RegExp, RoleKey][] = [
  [/\.(test|spec)$/i, "test"],
  [/^index$/i, "entry-name"],
  [/^(main|app|server|cli|entry|bootstrap)$/i, "entrypoint"],
  [/^(constants?|const)$/i, "constants"],
  [/^(config|configuration|settings?)$/i, "config"],
  [/^types?$/i, "type-def"],
  [/^(utils?|helpers?)$/i, "util"],
  [/^(router|routes?|routing)$/i, "router"],
  [/translat(e|or|ion)/i, "translate"],
  [/^(schema|model)$/i, "model"],
];

/** 拡張子 → 役割キー。名前・パスで決まらなかった時の最後の手がかり。 */
const EXT_HINTS: [RegExp, RoleKey][] = [
  [/\.d\.ts$/i, "type-decl"],
  [/\.(css|scss|sass|less)$/i, "style"],
  [/\.(json|ya?ml|toml)$/i, "config-data"],
  [/\.(md|mdx)$/i, "doc"],
];

// 名前の「末尾の動詞・名詞」から役割を当てる（loadSettings→読み込み等）。
const SUFFIX_HINTS: [RegExp, RoleKey][] = [
  [/parser$/i, "parser"],
  [/(generator|builder)$/i, "generator"],
  [/(analyzer|analyser)$/i, "analyzer"],
  [/(provider)$/i, "provider"],
  [/(wrapper)$/i, "wrapper"],
  [/(handler|listener)$/i, "event"],
  [/(loader|^load)/i, "loader"],
  [/(validator)$/i, "validator"],
  [/(message)$/i, "message"],
];

// ブラウザ拡張の頻出ファイル（このリポ種別で「不明」が多発するので個別に拾う）。
const WELLKNOWN_NAME: [RegExp, RoleKey][] = [
  [/^background$/i, "ext-background"],
  [/^(contentscript|pagescript)$/i, "ext-content"],
  [/manifest/i, "ext-manifest"],
  [/licen[sc]e/i, "license"],
  [/privacy/i, "privacy"],
  [/\.user$/i, "userscript"],
];

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** 拡張子を全部落としたファイル名（"settings.test.ts" → "settings"）。 */
function stem(name: string): string {
  const firstDot = name.indexOf(".");
  return firstDot === -1 ? name : name.slice(0, firstDot);
}

/**
 * パス・名前・拡張子から役割キーを1つ推測する。当てられなければ null。
 * 優先度: types/ ディレクトリ > ファイル名 > 接尾辞 > 頻出名 > パス > 拡張子。
 */
export function guessFileRole(path: string): RoleKey | null {
  const name = basename(path);

  // 0) types/ ディレクトリ配下は問答無用で型定義（settings.ts でも型）。
  if (/(^|\/)types?(\/|$)/i.test(path)) return "type-def";

  const noExtForName = name.replace(/\.[^.]+$/, "");
  const s = stem(name);

  for (const [re, role] of NAME_HINTS) {
    if (re.test(noExtForName) || re.test(s)) return role;
  }
  for (const [re, role] of SUFFIX_HINTS) {
    if (re.test(noExtForName)) return role;
  }
  for (const [re, role] of WELLKNOWN_NAME) {
    if (re.test(noExtForName) || re.test(name)) return role;
  }
  for (const [re, role] of PATH_HINTS) {
    if (re.test(path)) return role;
  }
  for (const [re, role] of EXT_HINTS) {
    if (re.test(name)) return role;
  }
  return null; // 分からない時は黙る（嘘を出さない）。
}
