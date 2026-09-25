/* Shared view-model contract for every dashboard island (#214).
 *
 * One vocabulary sits under Classic mode, the export rail, the copy prompt, and the
 * machine-readable package: a DashboardView is what the signed-in viewer currently sees,
 * composed client-side from live island state. Nothing here fetches, stores, or logs.
 *
 * This file is the single canonical source under apps/shared/. Every island carries a
 * synced copy in its capture directory (tools/sync_shared_modules.py); the exec island
 * inlines it through tools/build_exec_overview_block.py. Edit here, never the copies.
 *
 * DashboardView (plain data, JSON-safe):
 *   {
 *     surface: { id, title, route },          // "favor-exec-pathways", "People Pathway", "exec/pathways"
 *     mode: "creative" | "classic",
 *     url: string,                             // the complete address of this exact view (#215)
 *     filters: { [key]: string | string[] },   // serialized global filter state, human-readable keys
 *     filterSummary: string,                   // one line, e.g. "Manila · All ages · Women"
 *     templateVersion: string,                 // island assetVersion or block build identity
 *     generatedAt: string,                     // ISO instant; the one permitted Date use (export-time)
 *     fictional: boolean,                      // true on fixture renders -- every artifact says so
 *     sections: DashboardSection[],
 *     controls: ControlGrammar[],              // generated from the same code that builds the console
 *   }
 *
 * DashboardSection:
 *   {
 *     id, heading,                             // stable id, the chapter/widget question or title
 *     kind: "kpi" | "table" | "pivot" | "timeline" | "prose" | "links",
 *     note?: string,                           // the widget's one-line computed insight
 *     unavailable?: string,                    // reason when the whole section is unavailable
 *     personLevel?: boolean,                   // true => display-only; never exported, never packaged (D8/D16)
 *     kpis?: [{ label, value, unit?, delta?, state?, note? }],
 *       // value: string | number | null (null renders "—"); state: healthy|watch|thin|unknown|neutral
 *     columns?: [{ key, label, kind? }],       // kind: text | number | percent | date
 *     rows?: [{ [key]: string | number | null }],
 *     text?: string,                           // prose kind
 *   }
 *
 * ControlGrammar (teaches a browser agent the real console, #220/#222):
 *   { id, kind: "segmented" | "button-group" | "select" | "toggle" | "table-rows",
 *     label, selector, values?: string[], effect: string }
 */

export const VIEW_SCHEMA_VERSION = 1;
export const MODES = Object.freeze(["creative", "classic"]);
export const DEFAULT_MODE = "creative";
/* The four runtime palettes (#248, #331). The names are derived from the ids rather than stored
 * beside them so there is one spelling of each theme in this repository: themes/favor-*.json
 * carries the colours, tools/build_theme_blocks.py emits them, and nothing here needs a hex.
 * A surface's default is whatever its stylesheet already declares, so THEME_DEFAULT is null
 * -- "no attribute set" is a real state, and it is the one nobody's view changes from. */
export const THEMES = Object.freeze([
  "favor-cream", "favor-dark", "favor-indigo", "favor-grow-multicolor",
  // People & Leaders (#600). Two near-white runtime palettes, each named for what it shows
  // rather than for the brand: Leadership is the warm ground that carries brand orange as its
  // identity, Watershed the cool one that carries river blue as its. Both are offered in every
  // island's swatch, because a palette a reader can reach from one surface and not another is a
  // palette they will assume is broken.
  "favor-leadership", "favor-watershed",
]);
export const THEME_DEFAULT = null;

/* ---------------------------------------------------------------- shell state (#600) --
 * A shell may host several dashboards behind one route (People & Leaders: Pathways,
 * Leadership, Multiplication at /exec/people). The shell owns a small, closed set of hash
 * keys; every other key belongs to whichever island is mounted.
 *
 * RESERVED_STATE_KEYS is the boundary, and it is enforced from BOTH sides: an island may
 * never read or write one, and the shell may never read or write anything else. A mounted
 * island rebuilds the hash from its own state (pathways-boot.mjs writeHash() does exactly
 * that), so without preserveReservedKeys() the first filter change would silently drop the
 * reader back to the default tab. */
export const RESERVED_STATE_KEYS = Object.freeze(["tab"]);

/* Copy the shell's keys from the live hash onto a params object an island is about to write.
 * A no-op when no shell is present, which is what keeps a standalone island deployment
 * byte-for-byte unchanged. */
export function preserveReservedKeys(params, hash = null) {
  const raw = hash === null
    ? (typeof window !== "undefined" && window.location ? window.location.hash : "")
    : hash;
  const current = new URLSearchParams(String(raw || "").replace(/^#/, ""));
  for (const key of RESERVED_STATE_KEYS) {
    const value = current.get(key);
    if (value !== null && value !== "") params.set(key, value);
  }
  return params;
}

/* Strip every key that is neither reserved nor declared shared by the destination. This is the
 * deny-by-default rule (ADR 0022): a filter crosses a tab boundary only when someone has
 * declared, in code, that it means the same thing on the other side. Silence means reset.
 *
 * The rule exists because the dangerous failure is not a lost filter, it is a kept one. Pathways'
 * `age` is person-derived and Leadership's `groupAge` is group-derived
 * (docs/leadership-ubiquitous-language.md); a filter that appears to follow the reader while
 * quietly changing meaning is worse than one that clears. */
export function resetUnsharedKeys(params, sharedKeys = []) {
  const keep = new Set([...RESERVED_STATE_KEYS, ...sharedKeys]);
  for (const key of [...params.keys()]) {
    if (!keep.has(key)) params.delete(key);
  }
  return params;
}
export const SECTION_KINDS = Object.freeze(["kpi", "table", "pivot", "timeline", "prose", "links"]);
export const UNAVAILABLE_MARK = "—";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const AGGREGATE_ONLY_TITLE = "Aggregate rows only, no person data";
export const AI_GUIDELINES_URL = "https://ai-usage.favor.church";

export function slug(value, fallback = "") {
  const cleaned = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

export function columnsOf(section) {
  return Array.isArray(section && section.columns) ? section.columns.filter((c) => c && c.key) : [];
}

/* The boundary statement: what an artifact taken from a section may and may not contain, in
 * the words the viewer sees on the control that produces it.
 *
 * It is resolved, not asserted. "Aggregate rows only, no person data" is true of almost every
 * section on every surface, and it is the default -- but it is not true everywhere, and a
 * universal claim baked into the export module is a claim no call site can correct. Connect's
 * pressure and queue tables are the case that broke it: a Connect group's title is the title
 * Rock holds, and at Favor those read `age band // leader first name`, so a leader's first
 * name travels in the group title. No person-shaped key is involved and assertAggregateSection
 * is right to pass it -- but "no person data" on the button that exports it is not true.
 *
 * A section that cannot honestly make the default claim carries its own `boundary`: one
 * complete sentence that REPLACES the default rather than adding to it. `view.boundary` moves
 * the default for a whole surface. Every artifact for that section then reads its statement
 * from here -- the rail tooltip, the .xlsx Provenance sheet, the clipboard caption and TSV
 * tail, and the package manifest -- so the same file cannot make two different claims. */
export function boundaryFor(section, view) {
  const own = section && typeof section.boundary === "string" ? section.boundary.trim() : "";
  if (own) return own;
  const surface = view && typeof view.boundary === "string" ? view.boundary.trim() : "";
  return surface || AGGREGATE_ONLY_TITLE;
}

/* Column keys and labels that mark a row as person-shaped. The export rail and the package
 * refuse these outright; a section that legitimately displays people must carry
 * personLevel: true and is then skipped entirely rather than partially copied. */
const PERSON_KEY_PATTERN = /^(person|people)(ref|id|alias)$|^(display|full|first|last|nick)?name$|^(e-?mail|phone|mobile|address|birth(date|day)|dob)$/i;
const PERSON_LABEL_PATTERN = /\b(name|email|e-mail|phone|mobile|address|birthdate|birthday)\b/i;
const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeMode(value) {
  const text = String(value || "").trim().toLowerCase();
  return MODES.includes(text) ? text : DEFAULT_MODE;
}

/* Unlike normalizeMode, an unrecognised value resolves to null rather than to a default.
 * Forcing a stray value onto favor-cream would repaint a dark island cream on the strength
 * of a typo; null leaves the island showing what it ships, which is the safe reading. */
export function normalizeTheme(value) {
  const text = String(value || "").trim().toLowerCase();
  return THEMES.includes(text) ? text : THEME_DEFAULT;
}

/* "favor-indigo" -> "Favor Indigo". The only place a theme name is spelled out.
 *
 * Two palettes are named for the surface they belong to rather than for the brand, so the "Favor"
 * prefix is dropped for them: a reader picking "Leadership" or "Watershed" in the swatch is
 * choosing a world, not a house colourway, and "Favor Leadership" reads like a fifth brand. */
const THEME_NAME_EXCEPTIONS = Object.freeze({
  "favor-leadership": "Leadership",
  "favor-watershed": "Watershed",
});

export function themeName(id) {
  const theme = normalizeTheme(id);
  if (!theme) return "";
  if (THEME_NAME_EXCEPTIONS[theme]) return THEME_NAME_EXCEPTIONS[theme];
  return theme.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function isPersonShapedKey(key) {
  const text = String(key || "").trim();
  if (!text) return false;
  const bare = text.replace(/[\s_-]+/g, "");
  return PERSON_KEY_PATTERN.test(bare) || PERSON_LABEL_PATTERN.test(text);
}

export function isPersonShapedColumn(column) {
  if (!column || typeof column !== "object") return false;
  return isPersonShapedKey(column.key) || PERSON_LABEL_PATTERN.test(String(column.label || ""));
}

export class AggregatePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "AggregatePolicyError";
  }
}

/* Throws when a section could carry person data. Sections flagged personLevel are
 * refused by construction: callers must filter them out before export or packaging. */
export function assertAggregateSection(section) {
  if (!section || typeof section !== "object") throw new AggregatePolicyError("section is not an object");
  if (section.personLevel) throw new AggregatePolicyError(`section ${section.id} is person-level display and never exports`);
  const columns = Array.isArray(section.columns) ? section.columns : [];
  for (const column of columns) {
    if (isPersonShapedColumn(column)) {
      throw new AggregatePolicyError(`section ${section.id} carries a person-shaped column: ${column.key}`);
    }
  }
  const rows = Array.isArray(section.rows) ? section.rows : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [key, value] of Object.entries(row)) {
      if (isPersonShapedKey(key)) throw new AggregatePolicyError(`section ${section.id} row carries a person-shaped key: ${key}`);
      if (typeof value === "string" && EMAIL_VALUE_PATTERN.test(value.trim())) {
        throw new AggregatePolicyError(`section ${section.id} row carries an e-mail-shaped value`);
      }
    }
  }
  return section;
}

export function exportableSections(view) {
  const sections = Array.isArray(view?.sections) ? view.sections : [];
  return sections.filter((section) => section && !section.personLevel);
}

/* Cell formatting shared by tables, TSV/HTML copies, and the package. null/undefined is
 * the unavailable mark and never a zero; numbers keep their precision, callers round. */
export function formatCell(value, kind = "text") {
  if (value === null || value === undefined || value === "") return UNAVAILABLE_MARK;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return UNAVAILABLE_MARK;
    if (kind === "percent") return `${Math.round(value * 10) / 10}%`;
    return value.toLocaleString("en-US");
  }
  return String(value);
}

/* Filters serialize as stable, readable key=value pairs. Arrays join with commas and are
 * written only when non-empty, so an absent key always means "no filter on that axis". */
export function serializeFilters(filters, { into = new URLSearchParams(), defaults = {} } = {}) {
  const entries = Object.entries(filters || {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, raw] of entries) {
    const value = raw instanceof Set ? [...raw] : raw;
    if (value === null || value === undefined || value === false || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      into.set(key, [...value].map(String).sort().join(","));
      continue;
    }
    if (value === true) { into.set(key, "1"); continue; }
    if (defaults[key] !== undefined && String(defaults[key]) === String(value)) continue;
    into.set(key, String(value));
  }
  return into;
}

export function parseListParam(params, key) {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

export function filterSummaryLine(filters, labels = {}) {
  const parts = [];
  for (const [key, raw] of Object.entries(filters || {})) {
    const value = raw instanceof Set ? [...raw] : raw;
    if (value === null || value === undefined || value === false || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    const label = labels[key] || key;
    const text = Array.isArray(value) ? value.join(" + ") : value === true ? "on" : String(value);
    parts.push(`${label}: ${text}`);
  }
  return parts.length ? parts.join(" · ") : "No filters";
}

/* Builds the one provenance line every artifact carries (D7/D8, ADR-0010 parity). Pass the
 * section the artifact was taken from and the line ends with that section's own boundary
 * statement; omit it and the line reads exactly as it always has. */
export function provenanceLine(view, section) {
  const bits = [
    view?.surface?.title || view?.surface?.id || "Favor dashboard",
    `/${String(view?.surface?.route || "").replace(/^\//, "")}`,
    `${normalizeMode(view?.mode)} mode`,
    view?.filterSummary || "No filters",
    view?.generatedAt ? `generated ${view.generatedAt}` : null,
    view?.fictional ? "FICTIONAL PROTOTYPE DATA — not real Favor Church records" : null,
    boundaryFor(section, view),
  ].filter(Boolean);
  return bits.join(" · ");
}

/* Minimal structural validation used by tests and by the package builder before it
 * trusts a view. Returns a list of problems; empty means valid. */
export function validateView(view) {
  const problems = [];
  if (!view || typeof view !== "object") return ["view is not an object"];
  if (!view.surface || typeof view.surface.id !== "string" || !view.surface.id) problems.push("surface.id missing");
  if (!view.surface || typeof view.surface.route !== "string") problems.push("surface.route missing");
  if (!MODES.includes(view.mode)) problems.push(`mode must be one of ${MODES.join("|")}`);
  if (typeof view.url !== "string") problems.push("url missing");
  if (!view.filters || typeof view.filters !== "object") problems.push("filters missing");
  if (!Array.isArray(view.sections)) problems.push("sections must be an array");
  else {
    view.sections.forEach((section, index) => {
      if (!section || typeof section !== "object") { problems.push(`section ${index} is not an object`); return; }
      if (typeof section.id !== "string" || !section.id) problems.push(`section ${index} has no id`);
      if (!SECTION_KINDS.includes(section.kind)) problems.push(`section ${section.id || index} has an unknown kind`);
      if (section.rows && !Array.isArray(section.rows)) problems.push(`section ${section.id} rows must be an array`);
      if (section.columns && !Array.isArray(section.columns)) problems.push(`section ${section.id} columns must be an array`);
    });
  }
  if (!Array.isArray(view.controls)) problems.push("controls must be an array (may be empty)");
  return problems;
}

/* Convenience for islands: a table section from a column list and row objects. */
export function tableSection(id, heading, columns, rows, extra = {}) {
  return { id, heading, kind: "table", columns, rows, ...extra };
}

export function kpiSection(id, heading, kpis, extra = {}) {
  return { id, heading, kind: "kpi", kpis, ...extra };
}
