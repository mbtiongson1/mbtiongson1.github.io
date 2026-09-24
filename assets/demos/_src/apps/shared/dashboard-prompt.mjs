/* Copy prompt, prompt builders, and the machine-readable dashboard package (#214, #220, #221).
 *
 * One button, two targets. A browser agent already looking at the open dashboard gets the
 * computer-use prompt; an agent carrying the rock-favor plugin gets the deep-dive prompt with
 * the page's whole visible reading attached as a chunked, checksummed package.
 *
 * Everything here is composed client-side from a DashboardView (apps/shared/dashboard-view.mjs).
 * Nothing in this file reaches the network, browser storage, or the logger: production islands
 * are packaged under a forbidden-token scan and this module has to pass it.
 *
 * Public API
 *   buildComputerUsePrompt(view) -> string                       pure, deterministic
 *   buildDeepDivePrompt(view, { manifest }) -> string            pure, deterministic
 *   buildDashboardPackage(view, { maxChunkBytes }) -> Promise<{ manifest, chunks }>
 *   packageToText(pkg) -> string                                 manifest + fenced chunks
 *   verifyPackage(pkg) -> Promise<{ ok, problems }>              recomputes sizes + checksums
 *   reconstructSections(pkg) -> sections[]                       merges chunks back together
 *   copyTextToClipboard(text) / fallbackCopyText(text)
 *   mountCopyPrompt(host, { view, guidelinesUrl, announce, align }) -> { button, popover, ... }
 *
 * Package shape
 *   manifest {
 *     schemaVersion, surface, surfaceTitle, route, url, templateVersion, generatedAt, mode,
 *     filters, filterSummary, fictional, maxChunkBytes, chunkCount,
 *     chunks: [{ index, id, bytes, sha256, sectionIds }],
 *     boundary,                                  // the safety contract in plain words
 *   }
 *   chunk {
 *     schemaVersion, index, id, sectionIds,
 *     content: { sections: [{ id, heading, kind, note, unavailable, kpis, columns, rows, text }] },
 *   }
 *
 * A section wider than one chunk is split by rows: every part repeats the section's id, heading,
 * kind and columns, so reconstructSections() can concatenate the row slices back in order.
 * Person-level sections never enter the package -- exportableSections() drops them and
 * assertAggregateSection() refuses anything person-shaped that slipped past a flag (D8, D16).
 */

import {
  AGGREGATE_ONLY_TITLE,
  AI_GUIDELINES_URL,
  SVG_NS,
  UNAVAILABLE_MARK,
  assertAggregateSection,
  exportableSections,
  formatCell,
  normalizeMode,
  normalizeTheme,
  provenanceLine,
  validateView,
} from "./dashboard-view.mjs";
import { fallbackCopyText } from "./dashboard-export.mjs";

export const PACKAGE_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_CHUNK_BYTES = 8192;
export const DEEP_DIVE_ROW_LIMIT = 12;
export const PROSE_EXCERPT_LIMIT = 280;
export const SIDEBAR_TOGGLE_ID = "btn-toggle-sidebar";
export const EXPORT_BUTTON_SELECTOR = ".xrail__btn[data-export]";

export const PACKAGE_BOUNDARY =
  "This package holds only the aggregate rows this page already shows to the signed-in viewer. " +
  "It carries no person records, no credentials, no endpoints, and no query text.";

const ENCODER = new TextEncoder();

/* Both masthead controls hand this page to an AI assistant; the only question they ask the
 * reader is where that assistant is right now. So the labels name the assistant ("AI prompt")
 * and the outcome ("Download package") rather than the mechanism ("Copy", ".json"), and the
 * file type is demoted to a muted suffix -- nobody wants a .json, they want the thing it does. */
const COPY_LABEL = "Copy AI prompt";
const COPIED_LABEL = "Prompt copied!";
const COPIED_MS = 2500;
const TIP_LEAD = "First time? Check ";
const GUIDELINES_LABEL = "Favor AI Guidelines";
const PACKAGE_LABEL = "Download package";
const PACKAGE_SUFFIX = ".json";
const HOW_TO_LEAD = "New to this? ";
const HOW_TO_LABEL = "How to customize a report";

/* The guide page (#229) that teaches the package -> assistant -> prototype loop. A route, not
 * an absolute URL: it is a Rock page under the Dashboards router, served from the same host as
 * the island, and the workbench overrides it so the local draft is reachable there too. */
export const HOW_TO_URL = "/exec/guides/customize-a-report";

export const PROMPT_TARGETS = Object.freeze([
  Object.freeze({
    kind: "computer-use",
    label: "Computer-use prompt",
    hint: "for a browser agent on this open page",
    icon: Object.freeze([
      ["rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }],
      ["path", { d: "M8 21h8" }],
      ["path", { d: "M12 17v4" }],
    ]),
  }),
  Object.freeze({
    kind: "deep-dive",
    label: "Claude / Codex deep dive",
    hint: "needs the rock-favor plugin",
    icon: Object.freeze([
      ["polyline", { points: "4 17 10 11 4 5" }],
      ["line", { x1: "12", y1: "19", x2: "20", y2: "19" }],
      ["path", { d: "M12 3l1.2 2.6L16 6.8l-2.8 1.2L12 10.6 10.8 8 8 6.8l2.8-1.2z" }],
    ]),
  }),
]);

/* ---------------------------------------------------------------- small helpers */

function utf8(text) {
  return ENCODER.encode(text);
}

function byteLength(text) {
  return utf8(text).length;
}

function toPlainValue(value) {
  if (value instanceof Set) return [...value].map(String);
  if (Array.isArray(value)) return value.map((entry) => (entry === undefined ? null : entry));
  return value;
}

/* Filters render human-readably, never URL-encoded: an agent reads these and types them back. */
function filterPairs(filters) {
  const pairs = [];
  const entries = Object.entries(filters || {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, raw] of entries) {
    const value = toPlainValue(raw);
    if (value === null || value === undefined || value === false || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      pairs.push([key, value.map(String).join(",")]);
      continue;
    }
    pairs.push([key, value === true ? "on" : String(value)]);
  }
  return pairs;
}

export function describeFilters(filters) {
  const pairs = filterPairs(filters);
  if (!pairs.length) return "none (the whole dashboard is unfiltered)";
  return pairs.map(([key, value]) => `${key}=${value}`).join(" · ");
}

function plainFilters(filters) {
  const out = {};
  for (const [key, raw] of Object.entries(filters || {})) {
    const value = toPlainValue(raw);
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function surfaceTitleOf(view) {
  return view?.surface?.title || view?.surface?.id || "Favor dashboard";
}

function routeOf(view) {
  const route = String(view?.surface?.route || "").replace(/^\/+/, "");
  return route ? `/${route}` : "/";
}

function formatDelta(delta) {
  if (delta === null || delta === undefined || delta === "") return "";
  if (typeof delta === "number") {
    if (!Number.isFinite(delta)) return "";
    return `${delta > 0 ? "+" : ""}${delta}`;
  }
  return String(delta);
}

function briefly(text, limit = PROSE_EXCERPT_LIMIT) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/* ---------------------------------------------------------------- computer-use prompt */

export function controlGrammarLine(control) {
  const label = String(control?.label || control?.id || "control");
  const kind = String(control?.kind || "control");
  const selector = String(control?.selector || "(no selector declared)");
  const declared = Array.isArray(control?.values) && control.values.length
    ? control.values.map(String).join(", ")
    : null;
  const values = declared || (kind === "toggle" ? "on, off" : "free text");
  const effect = String(control?.effect || "no effect recorded");
  return `- ${label} (${kind}) · selector: ${selector} · values: ${values} · effect: ${effect}`;
}

export function buildComputerUsePrompt(view) {
  const title = surfaceTitleOf(view);
  const route = routeOf(view);
  const mode = normalizeMode(view?.mode);
  const url = String(view?.url || route);
  const controls = Array.isArray(view?.controls) ? view.controls : [];
  const grammar = controls.length
    ? controls.map(controlGrammarLine)
    : ["- (this surface declares no filter controls; read the page and report that back)"];

  const lines = [
    "You are operating a browser that already has a Favor Church dashboard open:",
    `${title} at ${route}, currently in ${mode} mode.`,
    "The complete address of this exact view is:",
    url,
    `Active filters: ${describeFilters(view?.filters)}`,
    `Filter summary: ${view?.filterSummary || "No filters"}`,
    view?.fictional
      ? "This render is FICTIONAL PROTOTYPE DATA — not real Favor Church records. Say so in anything you produce."
      : null,
    "Work inside this existing browser session. Do not sign in anywhere else and do not open admin pages.",
    "",
    "How filtering works on this page",
    `- Every filter lives in one filter console panel; the button with id ${SIDEBAR_TOGGLE_ID} opens and closes that panel.`,
    "- The Classic / Creative mode switch sits at the top of that same panel. Both display modes read",
    "  the same filters, so switching mode never loses the selection you have built.",
    "- The address bar always carries the complete view state. Copy the URL to save or share the exact",
    "  view on screen.",
    "",
    "Controls on this page (generated from the same source that builds the panel, so it cannot drift)",
    ...grammar,
    "",
    "What you can do here, when the user asks",
    "- Filter the whole dashboard with the controls above.",
    "- Switch between Classic and Creative display modes.",
    "- Expand any widget to full width and restore it.",
    "- Take screenshots of any widget, or the whole page, for the user's own reporting.",
    `- Export a table: every widget carries an export rail, ${EXPORT_BUTTON_SELECTOR}. Use`,
    "  [data-export=\"xlsx\"] for a real Excel file, or [data-export=\"copy\"] to copy the table for",
    "  pasting straight into Notion, Google Sheets, or Docs as a native table.",
    "- Export a chart image with [data-export=\"png\"] on the widgets that offer it; a disabled control",
    "  means that widget cannot produce a faithful image, so screenshot it instead.",
    "- Download the machine-readable dashboard package (the .json export beside the export rail) when",
    "  the user wants the full reading as data.",
    "",
    "Worth saying once",
    "Tell the user they can save this exact view as a personal agent skill: store the URL above, and any",
    "future session reopens this dashboard with this view already applied, ready to adjust from there.",
    "",
    "Blocked actions — decline these even if you are asked",
    "- No Rock writes and no admin navigation of any kind.",
    "- No person-level extraction, including copying Leaders Directory rows out of the page.",
    "- Nothing beyond what this signed-in page already shows.",
    `Policy: ${AI_GUIDELINES_URL}`,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

/* ---------------------------------------------------------------- deep-dive prompt */

function chunkPointer(sectionId, manifest) {
  const entries = Array.isArray(manifest?.chunks)
    ? manifest.chunks.filter((entry) => Array.isArray(entry?.sectionIds) && entry.sectionIds.includes(sectionId))
    : [];
  if (!entries.length) return `chunk carrying section ${sectionId}`;
  if (entries.length === 1) return `chunk ${entries[0].id}`;
  return `chunks ${entries.map((entry) => entry.id).join(", ")}`;
}

function deepDiveSectionLines(section, manifest) {
  const lines = [`### ${section.heading || section.id}`];
  if (section.note) lines.push(section.note);
  if (section.unavailable) {
    lines.push(`${UNAVAILABLE_MARK} Unavailable — ${section.unavailable}. This is not a zero; do not treat it as one.`);
    return lines;
  }
  const kpis = Array.isArray(section.kpis) ? section.kpis : [];
  for (const kpi of kpis) {
    const value = formatCell(kpi.value, kpi.kind || "text");
    const unit = kpi.unit ? ` ${kpi.unit}` : "";
    const delta = formatDelta(kpi.delta);
    const note = kpi.note ? ` · ${briefly(kpi.note, 120)}` : "";
    lines.push(`- ${kpi.label}: ${value}${unit}${delta ? ` (${delta})` : ""}${note}`);
  }
  const columns = Array.isArray(section.columns) ? section.columns : [];
  if (columns.length) {
    const rows = Array.isArray(section.rows) ? section.rows : [];
    lines.push(columns.map((column) => column.label || column.key).join(" | "));
    for (const row of rows.slice(0, DEEP_DIVE_ROW_LIMIT)) {
      lines.push(columns.map((column) => formatCell(row?.[column.key], column.kind)).join(" | "));
    }
    if (rows.length > DEEP_DIVE_ROW_LIMIT) {
      const rest = rows.length - DEEP_DIVE_ROW_LIMIT;
      lines.push(`... ${rest} more rows, see package ${chunkPointer(section.id, manifest)}`);
    }
    if (!rows.length) lines.push(`${UNAVAILABLE_MARK} no rows match the current filters`);
  }
  if (section.text) lines.push(`> ${briefly(section.text)}`);
  return lines;
}

export function buildDeepDivePrompt(view, { manifest = null } = {}) {
  const title = surfaceTitleOf(view);
  const sections = exportableSections(view);
  const lines = [];

  lines.push(`You are an AI assistant analyzing the Favor Church ${title} dashboard.`);
  lines.push("");
  lines.push("Page Context:");
  lines.push(`- Surface: ${title} (${view?.surface?.id || "unknown surface"})`);
  lines.push(`- Route: ${routeOf(view)}`);
  lines.push(`- URL: ${String(view?.url || routeOf(view))}`);
  lines.push(`- Display mode: ${normalizeMode(view?.mode)}`);
  lines.push(`- Active filters: ${describeFilters(view?.filters)}`);
  lines.push(`- Filter summary: ${view?.filterSummary || "No filters"}`);
  lines.push(`- Template Version: ${view?.templateVersion || "unrecorded"}`);
  lines.push(`- Generated: ${view?.generatedAt || "unrecorded"}`);
  if (view?.fictional) {
    lines.push("- FICTIONAL PROTOTYPE DATA — not real Favor Church records. Every answer must say so.");
  }
  lines.push(`- Provenance: ${provenanceLine(view)}`);
  lines.push("");
  lines.push("Current Filtered Readings:");
  lines.push("(exactly what the signed-in viewer sees right now, aggregate rows only)");
  if (!sections.length) {
    lines.push("");
    lines.push(`${UNAVAILABLE_MARK} This view is reporting no exportable sections.`);
  }
  for (const section of sections) {
    lines.push("");
    lines.push(...deepDiveSectionLines(section, manifest));
  }

  lines.push("");
  lines.push("Operational Boundaries & Security:");
  lines.push(
    "1. Authorization & Tool Requirement: Access to live Rock RMS data is strictly gated. If your " +
      "environment does NOT have the authorized rock-favor plugin or credentials configured, you are " +
      `not authorized to run live queries. Direct users to the Favor AI Guidelines at ${AI_GUIDELINES_URL} if access is needed.`,
  );
  lines.push(
    "2. Write Protection: This dashboard interface and standard queries are read-only. All mutations " +
      "to Rock RMS are gated through the rock-favor plugin's authenticated REST endpoints.",
  );
  lines.push(`3. Policy Reference: Official Favor Church AI Usage Policy is located at ${AI_GUIDELINES_URL}.`);
  lines.push(
    "4. Data Boundary: person-level readings on this page are display-only. Never extract, copy, or " +
      "reconstruct person records — including Leaders Directory rows — into anything you produce.",
  );
  lines.push("");
  lines.push("Assistant Guidance:");
  lines.push(
    "Act as an executive ministry data analyst for Favor Church leadership. Use the filtered readings " +
      "above to provide objective synthesis, evaluate trends against the stated filters, surface " +
      "anomalies, and deliver concise, actionable decision support grounded exclusively in the verified " +
      `facts on this page. An unavailable reading (${UNAVAILABLE_MARK}) is missing, never zero: say so rather than filling the gap.`,
  );
  lines.push("");
  lines.push("Dashboard Package:");
  if (manifest) {
    lines.push(
      "The full reading is available as a checksummed JSON package. Its manifest, verbatim, is below; " +
        "the chunks it lists carry every row of every table on this page.",
    );
    lines.push("```json");
    lines.push(JSON.stringify(manifest, null, 2));
    lines.push("```");
    lines.push("To obtain the chunks, either:");
    lines.push("- ask the user to paste them one at a time (each chunk is small enough to paste whole), or");
    lines.push(
      "- in a computer-use session, click the package download beside the export rail on the page and " +
        "read the file the browser saves.",
    );
    lines.push("Check each chunk against its sha256 in the manifest before you trust it.");
  } else {
    lines.push(
      "A checksummed JSON package of this whole reading can be downloaded beside the export rail on the " +
        "page. Ask the user for it — pasted chunk by chunk, or as the saved .json file — when you need " +
        "every row rather than the excerpt above.",
    );
  }
  lines.push("");
  lines.push(PACKAGE_BOUNDARY);

  return lines.join("\n");
}

/* ---------------------------------------------------------------- the package */

function packColumn(column) {
  const packed = { key: String(column?.key ?? ""), label: String(column?.label ?? column?.key ?? "") };
  if (column?.kind) packed.kind = String(column.kind);
  return packed;
}

function packKpi(kpi) {
  const packed = { label: String(kpi?.label ?? ""), value: kpi?.value === undefined ? null : kpi.value };
  if (kpi?.unit) packed.unit = String(kpi.unit);
  if (kpi?.delta !== undefined && kpi?.delta !== null && kpi?.delta !== "") packed.delta = kpi.delta;
  if (kpi?.state) packed.state = String(kpi.state);
  if (kpi?.note) packed.note = String(kpi.note);
  return packed;
}

function packRow(row) {
  const packed = {};
  for (const [key, value] of Object.entries(row || {})) {
    packed[key] = value === undefined ? null : value;
  }
  return packed;
}

/* The chunk-side shape of a section: stable ids, no rendering state, JSON-safe throughout. */
export function packSection(section) {
  const packed = {
    id: String(section.id),
    heading: String(section.heading ?? section.id),
    kind: String(section.kind ?? "table"),
  };
  if (section.note) packed.note = String(section.note);
  if (section.unavailable) packed.unavailable = String(section.unavailable);
  if (Array.isArray(section.kpis)) packed.kpis = section.kpis.map(packKpi);
  if (Array.isArray(section.columns)) packed.columns = section.columns.map(packColumn);
  if (Array.isArray(section.rows)) packed.rows = section.rows.map(packRow);
  if (section.text) packed.text = String(section.text);
  return packed;
}

function chunkIdFor(index) {
  return `chunk-${String(index + 1).padStart(2, "0")}`;
}

function newChunk(index) {
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    index,
    id: chunkIdFor(index),
    sectionIds: [],
    content: { sections: [] },
  };
}

function chunkText(chunk) {
  return JSON.stringify(chunk);
}

/* Greedy fill: whole sections where they fit, row-by-row splitting where they do not.
 * Every emitted chunk serializes to at most maxChunkBytes UTF-8 bytes. */
function composeChunks(packedSections, maxChunkBytes) {
  const chunks = [];
  let current = newChunk(0);

  const size = () => byteLength(chunkText(current));
  const flush = () => {
    if (!current.content.sections.length) return;
    chunks.push(current);
    current = newChunk(chunks.length);
  };
  const attach = (part) => {
    current.content.sections.push(part);
    current.sectionIds.push(part.id);
  };
  const detach = () => {
    current.content.sections.pop();
    current.sectionIds.pop();
  };
  const pushPart = (part, label) => {
    attach(part);
    if (size() <= maxChunkBytes) return;
    detach();
    flush();
    attach(part);
    if (size() > maxChunkBytes) {
      throw new Error(`${label} does not fit in a ${maxChunkBytes}-byte chunk`);
    }
  };

  for (const section of packedSections) {
    const listKey = Array.isArray(section.rows) ? "rows" : Array.isArray(section.kpis) ? "kpis" : null;
    if (!listKey) {
      pushPart(section, `section ${section.id}`);
      continue;
    }
    const items = section[listKey];
    let cursor = 0;
    let emitted = false;
    while (!emitted || cursor < items.length) {
      const part = { ...section, [listKey]: [] };
      pushPart(part, `the header of section ${section.id}`);
      emitted = true;
      let added = 0;
      while (cursor < items.length) {
        part[listKey].push(items[cursor]);
        if (size() > maxChunkBytes) {
          part[listKey].pop();
          break;
        }
        cursor += 1;
        added += 1;
      }
      if (cursor >= items.length) break;
      if (added === 0) {
        if (current.content.sections.length === 1) {
          throw new Error(
            `section ${section.id} ${listKey} entry ${cursor} does not fit in a ${maxChunkBytes}-byte chunk`,
          );
        }
        detach();
      }
      flush();
    }
  }
  flush();
  return chunks;
}

export async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("crypto.subtle is unavailable, so the dashboard package cannot be checksummed");
  }
  const digest = await subtle.digest("SHA-256", utf8(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildDashboardPackage(view, { maxChunkBytes = DEFAULT_MAX_CHUNK_BYTES } = {}) {
  const problems = validateView(view);
  if (problems.length) {
    throw new Error(`dashboard view is not packageable: ${problems.join("; ")}`);
  }
  if (!Number.isFinite(maxChunkBytes) || maxChunkBytes < 512) {
    throw new Error("maxChunkBytes must be a number of at least 512");
  }

  const sections = exportableSections(view);
  const packed = sections.map((section) => packSection(assertAggregateSection(section)));
  const chunks = composeChunks(packed, maxChunkBytes);

  const entries = [];
  for (const chunk of chunks) {
    const text = chunkText(chunk);
    entries.push({
      index: chunk.index,
      id: chunk.id,
      bytes: byteLength(text),
      sha256: await sha256Hex(text),
      sectionIds: [...chunk.sectionIds],
    });
  }

  const manifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    surface: String(view.surface.id),
    surfaceTitle: surfaceTitleOf(view),
    route: routeOf(view),
    url: String(view.url || ""),
    templateVersion: view.templateVersion ? String(view.templateVersion) : null,
    generatedAt: view.generatedAt ? String(view.generatedAt) : null,
    mode: normalizeMode(view.mode),
    /* Additive at schemaVersion 1 on purpose: a v1 consumer reading an unknown key is fine,
     * and bumping the version would tell every pinned reader the shape changed under them
     * when nothing it already parses did. null means "the palette this surface ships", which
     * is a real state and the one nobody's view has moved from. */
    theme: normalizeTheme(view.theme),
    filters: plainFilters(view.filters),
    filterSummary: view.filterSummary ? String(view.filterSummary) : "No filters",
    fictional: Boolean(view.fictional),
    maxChunkBytes,
    chunkCount: chunks.length,
    chunks: entries,
    boundary: PACKAGE_BOUNDARY,
  };

  return { manifest, chunks };
}

export function packageToText(pkg) {
  const manifest = pkg?.manifest || {};
  const chunks = Array.isArray(pkg?.chunks) ? pkg.chunks : [];
  const fence = "```";
  const lines = [
    `Favor dashboard package — ${manifest.surfaceTitle || manifest.surface || "dashboard"} ${manifest.route || ""}`.trim(),
    manifest.boundary || PACKAGE_BOUNDARY,
    "",
    `Manifest (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}):`,
    `${fence}json`,
    JSON.stringify(manifest, null, 2),
    fence,
  ];
  chunks.forEach((chunk, position) => {
    lines.push("");
    lines.push(`Chunk ${position + 1} of ${chunks.length} — ${chunk.id}:`);
    lines.push(`${fence}json`);
    lines.push(chunkText(chunk));
    lines.push(fence);
  });
  return lines.join("\n");
}

export async function verifyPackage(pkg) {
  const problems = [];
  const manifest = pkg?.manifest;
  const chunks = Array.isArray(pkg?.chunks) ? pkg.chunks : [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, problems: ["manifest missing"] };
  }
  const entries = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  if (manifest.chunkCount !== chunks.length) {
    problems.push(`manifest chunkCount ${manifest.chunkCount} does not match ${chunks.length} chunks`);
  }
  if (entries.length !== chunks.length) {
    problems.push(`manifest lists ${entries.length} chunk entries for ${chunks.length} chunks`);
  }
  if (!manifest.boundary) problems.push("manifest boundary statement missing");

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const entry = entries[index];
    const text = chunkText(chunk);
    const bytes = byteLength(text);
    const sha256 = await sha256Hex(text);
    if (!entry) {
      problems.push(`chunk ${chunk?.id || index} has no manifest entry`);
      continue;
    }
    if (entry.id !== chunk.id) problems.push(`chunk ${index} id ${chunk.id} does not match manifest ${entry.id}`);
    if (entry.index !== chunk.index) problems.push(`chunk ${chunk.id} index ${chunk.index} does not match manifest ${entry.index}`);
    if (entry.bytes !== bytes) problems.push(`chunk ${chunk.id} is ${bytes} bytes, manifest says ${entry.bytes}`);
    if (entry.sha256 !== sha256) problems.push(`chunk ${chunk.id} checksum does not match the manifest`);
    if (Number.isFinite(manifest.maxChunkBytes) && bytes > manifest.maxChunkBytes) {
      problems.push(`chunk ${chunk.id} is ${bytes} bytes, over the ${manifest.maxChunkBytes}-byte budget`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/* The scripted reader: chunks back into the sections the page was showing. */
export function reconstructSections(pkg) {
  const chunks = Array.isArray(pkg?.chunks) ? [...pkg.chunks] : [];
  chunks.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
  const byId = new Map();
  const order = [];
  for (const chunk of chunks) {
    const parts = Array.isArray(chunk?.content?.sections) ? chunk.content.sections : [];
    for (const part of parts) {
      const id = part?.id;
      if (id === undefined || id === null) continue;
      if (!byId.has(id)) {
        const base = { ...part };
        if (Array.isArray(part.kpis)) base.kpis = [...part.kpis];
        if (Array.isArray(part.columns)) base.columns = part.columns.map((column) => ({ ...column }));
        if (Array.isArray(part.rows)) base.rows = part.rows.map((row) => ({ ...row }));
        byId.set(id, base);
        order.push(id);
        continue;
      }
      const base = byId.get(id);
      if (Array.isArray(part.kpis) && Array.isArray(base.kpis)) base.kpis.push(...part.kpis);
      if (Array.isArray(part.rows) && Array.isArray(base.rows)) base.rows.push(...part.rows.map((row) => ({ ...row })));
    }
  }
  return order.map((id) => byId.get(id));
}

/* ---------------------------------------------------------------- clipboard */

export function copyTextToClipboard(text) {
  const nav = globalThis.navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    return nav.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return fallbackCopyText(text);
}

/* ---------------------------------------------------------------- the mounted control */

function svgIcon(doc, shapes, size = 14) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attributes] of shapes) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    svg.appendChild(node);
  }
  return svg;
}

/* The "opens in a new tab" mark. A literal "↗" is a text glyph: it inherits whatever the
 * fallback face decides an arrow looks like, it does not follow the design system's stroke
 * weight, and a screen reader reads it out. This is the same drawn vocabulary as every other
 * icon here -- aria-hidden, currentColor, and sized in em so it tracks the tip's type. */
function externalMark(doc) {
  const mark = svgIcon(doc, [
    ["path", { d: "M7 17 17 7" }],
    ["path", { d: "M9 7h8v8" }],
  ]);
  mark.setAttribute("class", "ai-guidelines-tip__mark");
  mark.setAttribute("width", "1em");
  mark.setAttribute("height", "1em");
  return mark;
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.setAttribute("class", className);
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function mountCopyPrompt(host, options = {}) {
  const { view, guidelinesUrl = AI_GUIDELINES_URL, announce, align = "start" } = options;
  if (!host) throw new Error("mountCopyPrompt needs a host element");
  if (typeof view !== "function") throw new Error("mountCopyPrompt needs a view() accessor");
  const doc = host.ownerDocument || globalThis.document;
  if (!doc) throw new Error("mountCopyPrompt needs a document");

  /* The popover hangs off the control, so it has to know which way the control faces:
   * `align: "end"` marks a control sitting at the end of its masthead, and classic-base.css
   * anchors the popover to that edge instead of running it off the other side. */
  const root = element(doc, "div", align === "end" ? "copy-prompt copy-prompt--end" : "copy-prompt");

  const button = element(doc, "button", "copy-prompt-btn");
  button.setAttribute("type", "button");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.appendChild(
    svgIcon(doc, [
      ["rect", { x: "8", y: "8", width: "14", height: "14", rx: "2" }],
      ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
      ["path", { d: "M14 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" }],
    ]),
  );
  const buttonLabel = element(doc, "span", "copy-prompt-btn__label", COPY_LABEL);
  button.appendChild(buttonLabel);
  const caret = svgIcon(doc, [["path", { d: "M6 9l6 6 6-6" }]], 12);
  caret.setAttribute("class", "copy-prompt-btn__caret");
  button.appendChild(caret);

  const tip = element(doc, "p", "ai-guidelines-tip");
  tip.appendChild(doc.createTextNode ? doc.createTextNode(TIP_LEAD) : element(doc, "span", null, TIP_LEAD));
  const tipLink = element(doc, "a", "ai-guidelines-tip__link");
  tipLink.setAttribute("href", String(guidelinesUrl || AI_GUIDELINES_URL));
  tipLink.setAttribute("target", "_blank");
  tipLink.setAttribute("rel", "noopener noreferrer");
  tipLink.appendChild(doc.createTextNode ? doc.createTextNode(GUIDELINES_LABEL) : element(doc, "span", null, GUIDELINES_LABEL));
  tipLink.appendChild(externalMark(doc));
  tip.appendChild(tipLink);

  const popover = element(doc, "div", "copy-prompt-popover");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Copy a prompt");
  popover.hidden = true;

  const optionButtons = PROMPT_TARGETS.map((target) => {
    const option = element(doc, "button", "copy-prompt-option");
    option.setAttribute("type", "button");
    option.setAttribute("data-prompt", target.kind);
    option.appendChild(svgIcon(doc, target.icon, 16));
    const body = element(doc, "span", "copy-prompt-option__body");
    body.appendChild(element(doc, "span", "copy-prompt-option__label", target.label));
    body.appendChild(element(doc, "span", "copy-prompt-option__hint", target.hint));
    option.appendChild(body);
    popover.appendChild(option);
    return option;
  });

  root.appendChild(button);
  root.appendChild(tip);
  root.appendChild(popover);
  host.appendChild(root);

  let errorNode = null;
  let copiedTimer = null;
  let open = false;

  function clearError() {
    if (!errorNode) return;
    if (typeof errorNode.remove === "function") errorNode.remove();
    else if (errorNode.parentNode) errorNode.parentNode.removeChild(errorNode);
    errorNode = null;
  }

  function showError(message) {
    clearError();
    errorNode = element(doc, "p", "copy-prompt-error", `Could not copy the prompt: ${message}`);
    errorNode.setAttribute("role", "alert");
    root.appendChild(errorNode);
    if (typeof announce === "function") announce(`Could not copy the prompt: ${message}`);
  }

  function showCopied() {
    if (copiedTimer) globalThis.clearTimeout(copiedTimer);
    buttonLabel.textContent = COPIED_LABEL;
    button.classList.add("is-copied");
    copiedTimer = globalThis.setTimeout(() => {
      buttonLabel.textContent = COPY_LABEL;
      button.classList.remove("is-copied");
      copiedTimer = null;
    }, COPIED_MS);
  }

  function onDocumentKeydown(event) {
    if (event.key !== "Escape") return;
    close();
  }

  function onDocumentPointerdown(event) {
    if (root.contains && root.contains(event.target)) return;
    close();
  }

  function openPopover() {
    if (open) return;
    open = true;
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
    doc.addEventListener("keydown", onDocumentKeydown, true);
    doc.addEventListener("pointerdown", onDocumentPointerdown, true);
    if (optionButtons[0] && typeof optionButtons[0].focus === "function") optionButtons[0].focus();
  }

  function close() {
    if (!open) return;
    open = false;
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("keydown", onDocumentKeydown, true);
    doc.removeEventListener("pointerdown", onDocumentPointerdown, true);
    if (typeof button.focus === "function") button.focus();
  }

  function toggle() {
    if (open) close();
    else openPopover();
  }

  function moveFocus(from, step) {
    const index = optionButtons.indexOf(from);
    if (index < 0) return;
    const next = optionButtons[(index + step + optionButtons.length) % optionButtons.length];
    if (next && typeof next.focus === "function") next.focus();
  }

  function onPopoverKeydown(event) {
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowRight") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      moveFocus(event.target, 1);
      return;
    }
    if (key === "ArrowUp" || key === "ArrowLeft") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      moveFocus(event.target, -1);
    }
  }

  async function copy(kind) {
    clearError();
    try {
      const current = view();
      let text;
      if (kind === "deep-dive") {
        const pkg = await buildDashboardPackage(current);
        text = buildDeepDivePrompt(current, { manifest: pkg.manifest });
      } else {
        text = buildComputerUsePrompt(current);
      }
      await copyTextToClipboard(text);
      close();
      showCopied();
      return text;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      showError(message);
      return null;
    }
  }

  const onButtonClick = () => {
    toggle();
  };
  button.addEventListener("click", onButtonClick);
  popover.addEventListener("keydown", onPopoverKeydown);
  const optionHandlers = optionButtons.map((option) => {
    const handler = () => {
      copy(option.getAttribute("data-prompt"));
    };
    option.addEventListener("click", handler);
    return handler;
  });

  function destroy() {
    if (copiedTimer) globalThis.clearTimeout(copiedTimer);
    copiedTimer = null;
    doc.removeEventListener("keydown", onDocumentKeydown, true);
    doc.removeEventListener("pointerdown", onDocumentPointerdown, true);
    button.removeEventListener("click", onButtonClick);
    popover.removeEventListener("keydown", onPopoverKeydown);
    optionButtons.forEach((option, index) => option.removeEventListener("click", optionHandlers[index]));
    clearError();
    if (typeof root.remove === "function") root.remove();
    else if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { root, button, popover, tip, options: optionButtons, copy, open: openPopover, close, destroy };
}

/* ---- the package control -------------------------------------------------- */

/* The surface-level package button and the guide link beneath it.
 *
 * Four islands each built this control by hand -- same markup, same aria-label, four
 * copies of the wording -- which is exactly how a label drifts. It lives here now, beside
 * mountCopyPrompt, because the two are a pair: they answer the same question ("hand this
 * page to an assistant") and a reader chooses between them, so their labels have to be
 * written together or the choice stops making sense.
 *
 * The button carries data-export="package"; the click is handled by the delegation
 * bindExportDelegation() already installed on the island root, so this mounts markup and
 * nothing else. `title` stays the aggregate-only sentence: the safety claim is the one
 * thing that must survive a hover on any surface, whatever the label says.
 */
export function mountPackageControl(host, options = {}) {
  const { surfaceId, howToUrl = HOW_TO_URL, title = AGGREGATE_ONLY_TITLE, align = "start" } = options;
  if (!host) throw new Error("mountPackageControl needs a host element");
  if (!surfaceId) throw new Error("mountPackageControl needs a surfaceId");
  const doc = host.ownerDocument || globalThis.document;
  if (!doc) throw new Error("mountPackageControl needs a document");

  const root = element(doc, "div", align === "end" ? "package-control package-control--end" : "package-control");

  const rail = element(doc, "div", "xrail xrail--package");
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "Download the dashboard package");

  const button = element(doc, "button", "xrail__btn xrail__btn--package");
  button.setAttribute("type", "button");
  button.setAttribute("data-export", "package");
  button.setAttribute("data-widget", String(surfaceId));
  button.setAttribute("aria-label", `${PACKAGE_LABEL} (${PACKAGE_SUFFIX.replace(/^\./, "")})`);
  button.setAttribute("title", title);
  button.appendChild(
    svgIcon(doc, [
      ["path", { d: "M16.5 9.4 7.55 4.24a1.8 1.8 0 0 0-1.8 0L2.5 6.1" }],
      ["path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }],
      ["polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }],
      ["line", { x1: "12", y1: "22.08", x2: "12", y2: "12" }],
    ]),
  );
  button.appendChild(element(doc, "span", "xrail__label", PACKAGE_LABEL));
  const suffix = element(doc, "span", "xrail__suffix", PACKAGE_SUFFIX);
  suffix.setAttribute("aria-hidden", "true");
  button.appendChild(suffix);
  rail.appendChild(button);

  /* The same affordance the copy-prompt tip already has, pointing at the guide instead of
   * the policy: a reader who does not know what a package is for needs teaching before they
   * need rules. Both links live under their own button so neither one looks like it explains
   * the other -- the failure the two-identical-twins masthead had before #229. */
  const tip = element(doc, "p", "how-to-tip");
  tip.appendChild(doc.createTextNode ? doc.createTextNode(HOW_TO_LEAD) : element(doc, "span", null, HOW_TO_LEAD));
  const link = element(doc, "a", "how-to-tip__link");
  link.setAttribute("href", String(howToUrl || HOW_TO_URL));
  link.appendChild(doc.createTextNode ? doc.createTextNode(HOW_TO_LABEL) : element(doc, "span", null, HOW_TO_LABEL));
  tip.appendChild(link);

  root.appendChild(rail);
  root.appendChild(tip);
  host.appendChild(root);

  return { root, rail, button, tip, link };
}
