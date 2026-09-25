import { responsesToBundle, fallbackBundle } from "./pathways-source.mjs?v=20260922_793";
import { filterSummaryLine, themeName, THEMES, preserveReservedKeys } from "./dashboard-view.mjs?v=20260922_793";
import {
  bindExportDelegation, createExportRegistry, exportSvgToPng, mountExportRail,
} from "./dashboard-export.mjs?v=20260922_793";
import { buildDashboardPackage, mountCopyPrompt, mountPackageControl } from "./dashboard-prompt.mjs?v=20260922_793";
import { mountThemeSwatch, syncIdentityAccent } from "./dashboard-theme.mjs?v=20260922_793";
import {
  bindInfoDismissal, classicWidget, dataTable, infoDisc, kpiStrip, modeSwitch, pivotTable,
  unavailablePanel,
} from "./classic-widgets.mjs?v=20260922_793";
import { TOOLTIP_HIDE_DELAY_MS, mountTooltipLayer } from "./dashboard-tooltip.mjs?v=20260922_793";
import { mountBreadcrumbs } from "./dashboard-breadcrumbs.mjs?v=20260922_793";
import { mountStatus, markChanged, motionMs, trackHostChrome } from "./dashboard-status.mjs?v=20260922_793";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_793";

/* People Pathway island runtime.
 *
 * Boots on #pathways-root, reads the bundle named by data-bundle-url, and renders
 * the three chapters of the mega page: the Pathway Map hero (oversized horizontal
 * bars + the person trajectory layer), the movement waterfall, and the freshness
 * beeswarm. Zero dependencies, zero compilation: plain ES module + SVG.
 *
 * Data honesty contract (issue #98):
 *   - unknown, loading, stale, unfinished, and zero never share a rendering;
 *   - bars are unique people per step, journey order, never re-sorted;
 *   - trajectories draw transitions only, skips visible, regressions kept;
 *   - a filter the bundle cannot answer renders unavailable, never a guess.
 *
 * Person layer: displayName + profile click-through render only when the host
 * bundle carries them from the staff-locked Rock page. The committed fictional
 * bundle exercises the identical interaction with visibly fictional people and
 * inert profile links. Normal Rock staff page authorization is the boundary;
 * nothing in this module widens it.
 */

const LIFECYCLE = [
  { key: "new", label: "New", token: "--cohort-new" },
  { key: "crowd", label: "Crowd", token: "--cohort-crowd" },
  { key: "core", label: "Core", token: "--cohort-core" },
  { key: "leader", label: "Leader", token: "--cohort-leader" },
];
const GENDER = [
  { key: "women", label: "Women", token: "--gender-women" },
  { key: "men", label: "Men", token: "--gender-men" },
  { key: "unknown", label: "Unknown", token: "--gender-unknown" },
];
const AGE = [
  { key: "kids", label: "Kids", token: "--age-kids" },
  { key: "youth", label: "Youth", token: "--age-youth" },
  { key: "youngAdults", label: "Young Adults", token: "--age-young-adults" },
  { key: "adults", label: "Adults", token: "--age-adults" },
  { key: "seasoned", label: "Seasoned", token: "--age-seasoned" },
];
/* The state ladder, in the order a person walks it, with the plain-language name
 * of each rung. Rock's own column name for a rung differs per step -- "New Signup"
 * on Build, "Scheduled" on Baptisms -- and the bar's hover readout prints that
 * literal name; these are the one vocabulary that can label the same colour across
 * every step, which is what a stack legend and a filter pill both have to do.
 *
 * The colours are the page's existing semantic tokens rather than a new palette:
 * a rung means the same thing as the cohort or movement tone it borrows, and a
 * new token would need regenerating all four theme blocks to say the same thing.
 * Ghost states never reach here -- they have no count to stack (ADR 0018). */
const STATE = [
  { key: "enrolled", label: "Signed up", token: "--cohort-new" },
  { key: "observed", label: "Observed", token: "--gender-unknown" },
  { key: "attended", label: "Attended", token: "--cohort-crowd" },
  { key: "active", label: "Ongoing", token: "--cohort-core" },
  { key: "completed", label: "Completed", token: "--move-gain" },
  { key: "unfinished", label: "Unfinished", token: "--move-loss" },
];
/* State leads, and is the default. Where a step's people stand on its own ladder
 * is the question this page is asked first; lifecycle, gender and age are the
 * cuts you take afterwards. The insertion order here is the order of the console
 * tiles and of the Classic table's columns, so the default and the first tile
 * cannot drift apart. */
const STACKS = { state: STATE, lifecycle: LIFECYCLE, gender: GENDER, age: AGE };
const STACK_LABELS = { state: "State", lifecycle: "Lifecycle", gender: "Gender", age: "Age band" };
const DEFAULT_STACK = "state";
/* The stack segments whose token docs/design/theme-token-contract.md rules OUTLINED --
 * exempt from the 3:1 mark floor by design (Core gold, the near-achromatic Unknown
 * greys), because their fill always carries an --edge-strong boundary wherever it is
 * drawn today. --accent carries no such boundary, so narrowing to one of these segments
 * leaves the theme's own static accent in place rather than promoting an unverified
 * contrast into brand chrome -- the same segment reads fine in its own bar, just not as
 * a ring or a headline highlight. */
const IDENTITY_ACCENT_EXEMPT = new Set(["--cohort-core", "--cohort-new", "--age-kids", "--gender-unknown"]);
/* Filter dimensions, in console order. State is a filter as well as a stack: the
 * step chips that used to print every rung as prose are gone, so narrowing to a
 * rung is how a reader now asks "who is only signed up?" -- one control instead
 * of eighteen lines of text to scan. */
const FILTER_DIMS = ["state", "lifecycle", "gender", "age"];
const emptyFilters = () => ({ state: new Set(), lifecycle: new Set(), gender: new Set(), age: new Set() });
/* Display mode (#215/#218, contract §3). Classic is a second renderer over the
 * same filtered slice Creative already computes -- never a second filter model. */
const MODES = ["creative", "classic"];
const DEFAULT_MODE = "creative";
/* Rock migration cut-off, read from the bundle.
 *
 * The schema was migrated into Rock up to this date, so a transition timestamp
 * on or before it is when the record was imported, not when the person actually
 * moved. The dates are real data and are not hidden, but they cannot be read as
 * ministry activity, and a migration batch of hundreds on one day would
 * otherwise be the loudest "event" on the plot.
 *
 * It lives in dashboards/favor-exec-pathways.json and arrives through the bundle
 * meta, so changing the window never means editing chart code. */
const migrationThrough = () => state.bundle?.meta?.migrationThrough || null;
const GAIN_KINDS = new Set(["entered", "progressed", "resumed", "completed", "leadership-prep", "became-leader"]);
const LOSS_KINDS = new Set(["regressed"]);
const STALL_KINDS = new Set(["unfinished", "stalled"]);
const KIND_LABELS = {
  entered: "Entered", progressed: "Progressed", resumed: "Resumed", completed: "Completed",
  unfinished: "Unfinished", stalled: "Stalled", regressed: "Regressed",
  "leadership-prep": "Leadership prep", "became-leader": "Became Leader",
};
/* The decorative pathway logo and its console toggle were removed on operator
 * instruction: the mark carried no reading, and a console control that changes
 * no count is a control an agent has to read past to find the ones that do. */
const SVG_NS = "http://www.w3.org/2000/svg";

/* Surface identity for every artifact this page produces: the export rail's file
 * names, the package manifest, and both prompts read it (contract §6/§7). */
const SURFACE = Object.freeze({ id: "favor-exec-pathways", title: "People Pathways", route: "exec/pathways" });
/* The palettes this surface offers. Favor Grow Multicolor was withdrawn from Pathways at
 * #331 because it then carried nothing but Grow's own static course-artwork hues, which
 * read as another dashboard's palette leaking in. #464's dynamic identity accent changed
 * what the palette IS -- a promotion of whatever real per-item dimension the reader has
 * narrowed to one selection, never a fixed hue pair -- and Pathways has such a dimension
 * (the stack segment), so it offers every palette dashboard-view.mjs's THEMES names, the
 * same as every other island. */
const PALETTES = THEMES;
/* The asset version the host served this module under. A module island can read its
 * own identity; the exec block, which is inlined into a classic script, cannot (§8a). */
const TEMPLATE_VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";
/* One registry for the whole island. Rails are thrown away and rebuilt on every
 * filter change, so the id -> live-accessor mapping outlives them and one delegated
 * listener on the island root outlives both. */
const exportRegistry = createExportRegistry();
/* The 15/35/35/15 reference the People PRD set for the base. Held here so the
 * composition table and the ratio tile read the same number. */
const LIFECYCLE_REFERENCE = { Leader: 15, Core: 35, Crowd: 35, New: 15 };

const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
));
const formatCount = (value) => (typeof value === "number" ? value.toLocaleString("en-US") : "—");
const formatDate = (iso) => {
  if (!iso) return "undated";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
};
const kindClass = (kind) => (GAIN_KINDS.has(kind) ? "kind-gain" : LOSS_KINDS.has(kind) ? "kind-loss" : STALL_KINDS.has(kind) ? "kind-stalled" : "kind-neutral");
/* Deterministic jitter so a re-render never reshuffles the swarm. */
const hashUnit = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

const MOBILE = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 768px)") : { matches: false };
const isMobile = Boolean(MOBILE.matches);

const state = {
  bundle: null,
  // Starts collapsed on mobile/narrow screens so the pathways lead; open on desktop.
  sidebarCollapsed: Boolean(isMobile),
  /* queryId -> the ISO instant that read was COMPUTED (not served). See renderReadStamp(). */
  readAt: new Map(),
  paletteHost: null,
  themeSwatch: null,
  swarmPaint: [],
  stack: DEFAULT_STACK,
  frontDoorStacked: false,
  filters: emptyFilters(),
  awakeRef: null,
  root: null,
  reducedMotion: false,
  // The UX bar (#587): the shared status chip, and the last filter state renderAll saw.
  status: null,
  lastFilterKey: null,
  // Creative/Classic, #215/#218. Absent from the hash means creative.
  mode: DEFAULT_MODE,
  // The generated control grammar (#220/#222). renderRail() rebuilds it as it builds
  // the console itself, so a prompt can never describe a control that is not there.
  controls: [],
  // Leaders Directory tag chips. A widget-local narrowing of the rows that widget
  // displays -- deliberately NOT part of state.filters, not in the URL, and it never
  // touches another widget. The widget says so on its face.
  directoryTags: new Set(),
  // The one shared bubble every prose mark opens into. Mounted once on the root,
  // never rebuilt, so a filter re-render cannot orphan it.
  proseTips: null,
  /* Whether a sounding opens a profile card. On by default: the card is the reason
   * the beeswarm is worth hovering, and a reader who has not asked for anything
   * should get the richer reading. Off is for the reader who is reading the shoals
   * themselves and wants nothing landing over them, and for a screen share where a
   * card that follows the pointer is a distraction rather than a detail. */
  cards: true,
  // The mark whose card is currently pinned open, so a second click on it lets go.
  pinnedDot: null,
  // A shell remount invalidates the old read generation before the new tab owns this singleton.
  mountGeneration: 0,
  abortController: null,
  chromeTimer: null,
};

/* Explanatory prose lives in a hover bubble, never in the layout (standing rule,
 * DESIGN.md "Prose is hover-only"). Two reasons, both from the floor:
 *
 * 1. A paragraph that appears or changes length on a filter click shoves the chart
 *    the reader is aiming at. Every filter click used to move the page under the
 *    pointer because these blocks grew and shrank with the data behind them.
 * 2. This is a graphic dashboard. A wall of words in front of the graphic is the
 *    wrong instrument, however well written.
 *
 * The bubble is positioned fixed, so prose costs exactly zero layout at every
 * viewport. The mark is a real button: hover, focus, and tap all open it, and
 * Escape closes it.
 *
 * The one exception is an absence. "Unavailable", "no rows", and "no dated source
 * in Rock" stay in the layout where they cannot be missed, because an unavailable
 * page must never look like an empty church. */
function proseMark(text, label) {
  if (!text) return null;
  const mark = el("button", "prosemark");
  mark.type = "button";
  mark.setAttribute("aria-label", label || "How to read this");
  const svg = svgEl("svg", { viewBox: "0 0 12 12", "aria-hidden": "true", focusable: "false" });
  svg.append(svgEl("circle", { cx: "6", cy: "6", r: "5" }));
  svg.append(svgEl("circle", { class: "dotcap", cx: "6", cy: "3.4", r: ".8" }));
  svg.append(svgEl("line", { x1: "6", y1: "5.4", x2: "6", y2: "9" }));
  mark.append(svg);
  /* The layer is resolved on each event, never captured here. renderShell()
   * replaces the root's children, so the bubble has to be mounted after the
   * chapters that carry these marks are built -- which means at construction
   * time state.proseTips is still null. Looking it up when the pointer arrives
   * is what keeps a mark built during the first paint alive. */
  const body = () => {
    const layer = state.proseTips;
    if (!layer) return null;
    // The shared bubble is sized for a two-word readout by default. Prose needs a
    // measure it can be read in, so the mark says which kind it carries.
    layer.element.dataset.kind = "prose";
    return el("p", "dashboard-tip__prose", typeof text === "function" ? text() : text);
  };
  const open = () => {
    const layer = state.proseTips;
    const content = body();
    if (layer && content) layer.show(mark, content);
  };
  const close = () => state.proseTips?.hide();
  mark.addEventListener("pointerenter", open);
  mark.addEventListener("pointerleave", close);
  mark.addEventListener("focus", open);
  mark.addEventListener("blur", close);
  // Hover shows, click pins, a second click lets go. Also the touch equivalent: a
  // finger has no hover, so the tap has to hold the bubble open by itself.
  mark.addEventListener("click", (event) => {
    event.preventDefault();
    event[PIN_HANDLED] = true;
    const layer = state.proseTips;
    if (!layer) return;
    if (layer.isPinned()) { layer.hide({ immediate: true }); return; }
    releasePins();
    open();
    layer.pin();
  });
  return mark;
}

/* ------------------------------------------------------------------ boot -- */

/* Rock renders its own fixed chrome above the island, and the sticky console
 * sits underneath it. Measuring the host's bar beats hard-coding a height that
 * differs between the workbench (no chrome) and production (an orange nav):
 * without this the console's head is hidden behind the nav in production and
 * looks perfect in the workbench, which is the worst kind of difference to
 * debug. The measurement is capped so a full-height fixed overlay can never
 * collapse the console to nothing.
 */
function hostChromeOffset() {
  if (typeof document.elementsFromPoint !== "function") return 0;
  let lowest = 0;
  const probe = document.elementsFromPoint(Math.round(window.innerWidth / 2), 2) || [];
  for (const node of probe) {
    if (node === document.documentElement || node === document.body) continue;
    if (state.root && (node === state.root || state.root.contains(node))) continue;
    const position = window.getComputedStyle(node).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const rect = node.getBoundingClientRect();
    if (rect.top <= 2 && rect.bottom > lowest) lowest = rect.bottom;
  }
  return Math.min(lowest, Math.round(window.innerHeight * 0.35));
}

function applyHostChrome() {
  if (!state.root) return;
  const top = Math.round(hostChromeOffset()) + 16;
  state.root.style.setProperty("--console-top", `${top}px`);
}

/* -------------------------------------------------- the deferred first paint (#543) --
 *
 * THE ONE NETWORK CALL THIS ISLAND MAKES, and the only one it is allowed to make.
 * docs/decisions/0024-pathways-deferred-first-paint.md is the exemption; ADR 0015's
 * "islands never fetch" holds everywhere else, and tools/package_pathways_island.py
 * enforces the shape of this exact call rather than trusting a reviewer to notice.
 *
 * Why it exists: Rock sends the browser no byte of the page until the block has
 * finished rendering, and the ten registered-read reads this wrapper used to
 * inline cost 3,275 ms of serial SQL. The wrapper now runs none of them on the page
 * request and publishes an address instead; this reads that address and the reader
 * gets a surface in the meantime.
 *
 * What bounds it: the address comes from the wrapper's own #pathways-deferred node
 * and must be RELATIVE -- a bare query string against the page the reader is already
 * on. It cannot name a host, a path, or an API. Its response is the same page under
 * the same Rock authorization, so it can only ever contain what this reader was
 * already entitled to read inline. Nothing is sent: no body, no token, no header
 * beyond Accept, and the only thing sent with it is the Rock session cookie the
 * reader's browser already holds for this origin.
 */
function deferredReadAddress() {
  const node = document.getElementById("pathways-deferred");
  if (!node || node.type !== "application/json") return null;
  let address = null;
  try {
    address = JSON.parse(node.textContent).dataUrl;
  } catch {
    return null;
  }
  /* A relative query string, and nothing else. This is the fence, not a formality:
   * "//host", "https://host" and "/some/path" are all rejected here, so the only
   * thing this island can ever read is the page it is already on. */
  return typeof address === "string" && address.startsWith("?") ? address : null;
}

/* The campus the wrapper resolved, so the pending surface is labelled with the scope the
 * reader actually asked for rather than defaulting to Manila behind their back. */
function deferredCampus() {
  const node = document.getElementById("pathways-deferred");
  if (!node) return undefined;
  try {
    return JSON.parse(node.textContent).campus || undefined;
  } catch {
    return undefined;
  }
}

function isCurrentMount(root, generation) {
  return state.root === root && state.mountGeneration === generation;
}

/* ONE READ PER REQUEST, ONE AT A TIME. The ten reads used to arrive as a single payload,
 * which meant the first station could not draw until the slowest of them had finished --
 * the same "wait for the sum" the server used to impose, just moved. Asking for them one
 * at a time lets each station fill as its own read lands.
 *
 * SEQUENTIAL, NOT PARALLEL, AND THAT IS NOT A COMPROMISE. Rock runs on ASP.NET session
 * state, which takes a per-session lock for the duration of each request, so ten parallel
 * requests from one reader would queue on the server anyway -- and would arrive as a burst
 * that buys nothing and costs ten concurrent page renders. In series, the reader sees the
 * map, then the movement, then the freshness, in the order the page reads. */
async function fetchDeferredPart(address, queryId, { fresh = false, signal = null } = {}) {
  const url = `${address}&q=${encodeURIComponent(queryId)}${fresh ? "&fresh=1" : ""}`;
  /* Nothing is configured here beyond the two lines below. fetch already defaults to
   * same-origin, so the reader's existing Rock session cookie rides along and nothing
   * else does -- no token, no header, no body. The default IS the contract. The signal
   * only cancels work that no longer belongs to this mounted tab. */
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "text/html" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`deferred pathway read answered ${response.status}`);
  /* The response is a Rock page, so the payload is read out of it by the id the
   * wrapper gave it. Parsed inert with DOMParser: nothing in that document runs. */
  const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
  const island = parsed.getElementById("pathways-data");
  if (!island) throw new Error("deferred pathway read returned no data island");
  const payload = JSON.parse(island.textContent);
  if (!payload || payload.queryId !== queryId) throw new Error("deferred read answered a different query");
  /* The wrapper sends {readAt, payload}. readAt is written INSIDE the cache block, so for a
   * memoised read it is when the entry was filled, not when it was served -- which is the
   * only version of this fact worth showing a reader. */
  const envelope = payload.response;
  if (!envelope || typeof envelope !== "object" || !("payload" in envelope)) {
    throw new Error("deferred read did not carry a read stamp");
  }
  return { response: envelope.payload, readAt: envelope.readAt || null };
}

/* REPO RULE (operator, 2026-09-21): when a skeleton is needed in order to lazy load, ONLY
 * THE GRAPHS AND BARS ARE SKELETON. Everything else is real on first paint -- the masthead,
 * the breadcrumbs, the chapter headings and their (i) marks, the whole filter console, the
 * mode switch, the export rail, the colophon. The reader can already be filtering while the
 * readings are still arriving, and that is the point: a skeleton over a control is a control
 * you took away.
 *
 * An earlier draft of this drew the masthead and the filter bar as shimmer too. It made the
 * reader wait for the part they could have been using.
 *
 * So this fills the mark areas only, and it carries no number, label, axis or legend: a
 * placeholder a reader can mistake for a reading is worse than an empty frame (ADR 0018).
 * renderAll() replaces each one the moment that station's own read lands. */
function markSkeleton(lines) {
  const wrap = el("div", "markskel");
  for (let i = 0; i < lines.length; i += 1) {
    const row = el("div", "markskel__row");
    const band = el("span", "skeleton markskel__band");
    band.style.setProperty("--markskel-w", lines[i]);
    row.append(band);
    wrap.append(row);
  }
  return wrap;
}

/* One band, the width of the mark it stands in for. Always aria-hidden: the live region
 * already says the pathways are being read, and a shimmer is not a reading. */
function pendingBand(width, { fill = false } = {}) {
  const band = el("span", `skeleton markskel__band${fill ? " markskel__band--fill" : ""}`);
  band.style.setProperty("--markskel-w", width);
  band.setAttribute("aria-hidden", "true");
  return band;
}

/* WHAT A CHAPTER LOOKS LIKE WHILE ITS READ IS IN FLIGHT.
 *
 * Operator, 2026-09-22: "Skeletons SHOULD only show for graphs, not other items. Ex: 'New
 * People Gathering' should show, but the graph is loading."
 *
 * The first cut of this replaced each chapter body wholesale, which took the step names, the
 * pathway headings, the legend and the ledger down with the bars. None of those is a reading
 * and none of them was ever waiting on one: every one comes from the pathway configuration
 * the island already holds at first paint. Only the bar is unknown, so only the bar shimmers.
 *
 * The waterfall is the one honest exception. It is a single SVG whose labels are drawn inside
 * the plot from rows only the read carries, so there is no chrome there to keep. */
function renderPendingMarks(root, sections = ["map", "wf", "swarm"]) {
  for (const id of sections) {
    if (id === "map") {
      renderPathLabels();
      renderBars({ pending: true });
      stubTrajectories();
    } else if (id === "wf") {
      const body = root.querySelector("#chapter-wf .chapter__body");
      if (body) body.replaceChildren(markSkeleton(["70%", "52%", "38%"]));
    } else if (id === "swarm") {
      renderSwarmPending();
    }
  }
  /* Classic is one table of everything, so it stays a skeleton until the last read lands. */
  const classic = root.querySelector("#pathways-classic");
  if (classic && sections.length) classic.replaceChildren(markSkeleton(["100%", "100%", "100%", "100%"]));
}

/* Freshness, before its read lands. The axis and every step name on this pathway are
 * configuration, so they are real from the first frame; the strip of dots is the only part
 * of this chapter that a read can change. */
function renderSwarmPending() {
  const body = state.root && state.root.querySelector("#chapter-swarm .chapter__body");
  if (!body) return;
  const meta = state.root.querySelector("#chapter-swarm .chapter__meta");
  if (meta) meta.textContent = "per-step season";
  body.replaceChildren();
  const wrap = el("div", "swarm");
  const axis = el("div", "swarm__axis");
  axis.append(
    el("span", null, "Fresh, inside the expected window"),
    el("span", null, "Window edge"),
    el("span", null, "Twice the window and beyond"),
  );
  wrap.append(axis);
  for (const step of activePath().steps) {
    const row = el("div", "swarmrow");
    row.append(el("span", "swarmrow__name", step.label));
    const plot = el("div", "swarmrow__plot");
    plot.append(pendingBand("100%", { fill: true }));
    row.append(plot);
    wrap.append(row);
  }
  body.append(wrap);
  mountChapterRail("swarm", "freshness", null);
}

/* HOW OLD IS WHAT I AM LOOKING AT (operator request, 2026-09-21).
 *
 * Seven of the ten reads are memoised for ten minutes, so a number on this page can have
 * been computed some minutes ago and not be recomputed now. That is a good trade -- nobody
 * decides anything on whether a count moved in the last ten minutes -- but it should not be
 * invisible, because a reader watching for a change they just made in Rock deserves to know
 * they may be looking at a cached answer rather than a broken one.
 *
 * THE OLDEST READ WINS. The stamp states one age for the page, and the page is only as fresh
 * as its stalest station. Taking the newest, or an average, would overstate it -- and an
 * overstated freshness claim is worse than none, because it is the one a reader acts on.
 *
 * An unparseable or missing stamp renders `?`, never a guess and never a silent omission
 * (ADR 0018). */
function readAgeMinutes() {
  let oldest = null;
  for (const value of state.readAt.values()) {
    const at = Date.parse(value);
    if (!Number.isFinite(at)) return null;
    if (oldest === null || at < oldest) oldest = at;
  }
  if (oldest === null) return null;
  return Math.max(0, Math.round((Date.now() - oldest) / 60000));
}

function readAgeWords(minutes) {
  if (minutes === null) return "?";
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

function renderReadStamp() {
  if (!state.root) return;
  const meta = state.root.querySelector(".masthead__meta");
  if (!meta) return;
  let stamp = meta.querySelector(".stamp--read");
  if (!stamp) {
    stamp = el("p", "stamp stamp--read");
    meta.append(stamp);
  }
  const minutes = readAgeMinutes();
  stamp.replaceChildren(document.createTextNode("Read "), el("strong", null, readAgeWords(minutes)));
  /* The reader should be able to find out WHY a reading is eight minutes old without being
   * told about caches on a page that is otherwise about people. One mark, hover-only, per
   * the standing prose rule. */
  const mark = proseMark(
    "Most readings on this page are held for ten minutes after they are computed, so the same "
    + "number can be served to everyone who opens the page in that window instead of every "
    + "reader waiting for it to be worked out again. This says how long ago the oldest reading "
    + "here was actually computed. Person level readings are never held, so those are always "
    + "current. Reload to force every reading to be worked out again.",
    "Why a reading can be a few minutes old",
  );
  if (mark) stamp.append(mark);
}

/* The order the ten reads are asked for, and it is the order the page reads top to bottom --
 * not cheapest first. The reader is looking at the Pathway Map, so the Map's reads go first
 * even though the waterfall would return sooner; a page that fills out of order makes the
 * reader hunt for what changed. The last three feed Classic and the directory, which are
 * below the fold or behind the mode switch. */
const DEFERRED_READ_ORDER = Object.freeze([
  "people-pathway-step-current",
  "people-pathway-step-alltime",
  "people-pathway-front-door",
  "people-base-counts",
  "people-pathway-waterfall",
  "people-pathway-freshness",
  "people-pathway-step-people",
  "people-pathway-transitions",
  "people-leader-counts",
  "people-leaders-directory",
]);

/* Which chapter each read feeds, so a station stops being a skeleton at the moment its own
 * data is there and not before. A chapter listed against several reads waits for all of them:
 * half a freshness plot is a wrong reading, not a partial one. */
const SECTION_READS = Object.freeze({
  map: ["people-pathway-step-current", "people-pathway-step-alltime", "people-pathway-front-door", "people-base-counts"],
  /* The trajectory layer lives INSIDE the map chapter but reads different queries, and that
   * distinction is not cosmetic: drawing it from the map's reads produced a permanent "the
   * staff-person read was refused" under a plot whose data simply had not arrived yet. It is
   * its own section, with its own reads and its own stub, so it draws when it can be true. */
  flow: ["people-pathway-transitions", "people-pathway-step-people"],
  wf: ["people-pathway-waterfall"],
  swarm: ["people-pathway-freshness", "people-pathway-step-people"],
});

/* A read that has not arrived yet is spelled as a refusal so responsesToBundle() still sees
 * its closed ten-key shape. That is safe ONLY because the chapters it feeds are still
 * skeletons and the refusal copy is never on screen; the moment a chapter's reads all land,
 * that chapter renders from real rows. */
function pendingResponse(queryId) {
  return { status: "refused", queryId, code: "pending" };
}

/* DRAG, NOT SCROLL (operator, 2026-09-22: "Trajectories is still scrollable vertically.
 * Better: instead of scrollable, make it draggable").
 *
 * A plot wider than its column has to pan somehow, and it used to pan by being a scroll
 * container on the X axis alone. That is the trap: CSS coerces a `visible` cross-axis to
 * `auto` the moment the other axis is `auto`, so declaring ONE axis scrollable silently made
 * BOTH scrollable. That is the vertical scrollbar that kept reappearing inside the trajectory
 * field, and no amount of `overflow-y: visible` was ever going to remove it -- that
 * declaration was the cause. The stylesheet says `hidden` outright now, the scrollbar is
 * gone, and the horizontal axis is panned by dragging the field itself.
 *
 * Touch is left to the browser (`touch-action: pan-x`), which pans sideways natively and
 * still scrolls the page vertically; this only adds the pointer gesture a wide plot invites.
 * The box keeps a tab stop, so arrow keys pan it for a keyboard. A drag that actually
 * travelled swallows the click that follows it, so releasing over a mark never opens it. */
const DRAG_SLOP_PX = 4;

function makeDragPannable(box, label) {
  if (!box || box.dataset.dragPan === "on") return box;
  box.dataset.dragPan = "on";
  box.tabIndex = 0;
  if (label) box.setAttribute("aria-label", `${label}. Drag it, or use the arrow keys, to pan sideways.`);
  let grab = null;
  box.addEventListener("pointerdown", (event) => {
    /* Touch already pans natively under `touch-action: pan-x`; handling it here as well
     * would move the field twice for one finger. */
    if (event.pointerType === "touch" || event.button !== 0) return;
    if (box.scrollWidth <= box.clientWidth) return;
    grab = { id: event.pointerId, x: event.clientX, left: box.scrollLeft, moved: false };
  });
  box.addEventListener("pointermove", (event) => {
    if (!grab || event.pointerId !== grab.id) return;
    const dx = event.clientX - grab.x;
    if (!grab.moved) {
      if (Math.abs(dx) < DRAG_SLOP_PX) return;
      grab.moved = true;
      box.classList.add("is-dragging");
      try { box.setPointerCapture(grab.id); } catch { /* capture is a nicety, not the gesture */ }
    }
    box.scrollLeft = grab.left - dx;
    event.preventDefault();
  });
  const release = (event) => {
    if (!grab || (event && event.pointerId !== grab.id)) return;
    const travelled = grab.moved;
    try { box.releasePointerCapture(grab.id); } catch { /* already released */ }
    grab = null;
    box.classList.remove("is-dragging");
    if (travelled) {
      box.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); },
        { capture: true, once: true });
    }
  };
  box.addEventListener("pointerup", release);
  box.addEventListener("pointercancel", release);
  return box;
}

/* Draw one chapter, and nothing else. The mapping mirrors SECTION_READS: a chapter is drawn
 * exactly once, when every read it needs is in. The filter console's counts come from the
 * person layer, so the rail is redrawn with the chapter that carries it. */
function renderSection(id, { flowPending = false } = {}) {
  if (id === "map") {
    renderPathLabels();
    renderBars({});
    /* renderBars() rebuilds the whole map chapter body, #flowwrap included, so the trajectory
     * stub has to go back afterwards until the flow section's own reads land. */
    if (flowPending) stubTrajectories();
  } else if (id === "flow") {
    drawTrajectories();
  } else if (id === "wf") {
    renderWaterfall();
  } else if (id === "swarm") {
    renderSwarm();
    renderRail();
  }
}

/* The trajectory plot's own silhouette. The hint beneath it is emptied rather than left
 * saying anything: every sentence it can carry is a statement about data that is not here
 * yet, and the worst of them ("the staff-person read was refused") is a straight falsehood
 * while the read is merely in flight. */
function stubTrajectories() {
  const mount = state.root && state.root.querySelector("#flowwrap .flow__mount");
  if (mount) {
    mount.replaceChildren(markSkeleton(["100%"]));
    makeDragPannable(mount, "Person trajectories");
  }
  const notes = state.root && state.root.querySelector("#flowwrap .flowwrap__notes");
  if (notes) notes.replaceChildren();
  const hint = state.root && state.root.querySelector("#flowwrap .flowwrap__hint");
  if (hint) hint.textContent = "";
}

async function streamDeferredReads(root, address, generation = state.mountGeneration) {
  const current = () => isCurrentMount(root, generation);
  const signal = state.abortController && state.abortController.signal;
  const landed = new Map();
  const drawn = new Set();
  state.readAt.clear();
  const campus = deferredCampus() || "MNL";
  let failures = 0;

  if (!current()) return;
  renderPendingMarks(root);
  announce("Reading the pathways\u2026", { visible: true });

  for (const queryId of DEFERRED_READ_ORDER) {
    if (!current()) return;
    try {
      let part = await fetchDeferredPart(address, queryId, { signal });
      if (!current()) return;
      /* A REFUSAL IS NEVER ACCEPTED FROM THE CACHE (operator ruling, 2026-09-21: "cache
       * refusal should fail immediately"). Seven of these reads are memoised for ten
       * minutes, refusals included, so one transient timeout used to blank a station long
       * after the cause had gone. Asking once more with fresh=1 runs the read with no cache
       * around it: if the cause has passed the reader gets the reading, and if it has not,
       * the `?` they are shown is the state of that query NOW rather than a ten-minute echo. */
      if (part.response && part.response.status === "refused") {
        const freshOptions = { fresh: true };
        freshOptions.signal = signal;
        part = await fetchDeferredPart(address, queryId, freshOptions);
        if (!current()) return;
      }
      landed.set(queryId, part.response);
      if (part.readAt) state.readAt.set(queryId, part.readAt);
    } catch {
      if (!current()) return;
      /* One read failing is not the page failing. Record it as the refusal it is, let that
       * station carry its own reason, and keep asking for the rest. */
      failures += 1;
      landed.set(queryId, { status: "refused", queryId, code: "query-failed" });
    }

    /* ONLY THE SECTIONS THAT JUST COMPLETED ARE REDRAWN.
     *
     * The first version of this called renderAll() after every landed read, which redraws
     * every station including drawTrajectories() and its ~2,000 curves. Measured on preview:
     * ten reads whose network time totals 7.0s took 23.9s wall, so seventeen of those seconds
     * were this function redrawing work that had not changed. Rendering a chapter once, when
     * its own reads are all in, is the difference between streaming and thrashing. */
    const ready = Object.entries(SECTION_READS)
      .filter(([id, reads]) => !drawn.has(id) && reads.every((read) => landed.has(read)))
      .map(([id]) => id);
    if (!ready.length) continue;

    if (!current()) return;
    const responses = Object.fromEntries(
      DEFERRED_READ_ORDER.map((id) => [id, landed.has(id) ? landed.get(id) : pendingResponse(id)]),
    );
    try {
      state.bundle = responsesToBundle({ schemaVersion: 1, dashboardId: "favor-exec-pathways", campus, responses });
    } catch {
      continue;
    }
    updateSurfaceMeta();
    for (const id of ready) {
      drawn.add(id);
      renderSection(id, { flowPending: !drawn.has("flow") });
    }
    renderReadStamp();
  }

  if (!current()) return;
  /* renderClassic() deliberately does nothing while Creative is the mode -- it keeps the
   * Classic DOM it drew so switching back is instant -- which means the stub this function
   * put in the Classic mount is the one thing renderAll() will not clear. It is invisible
   * (the mount is hidden in Creative) and a mode switch replaces it, but leaving a dead
   * skeleton in the document is how a later reader finds a shimmer where a table should be. */
  /* Classic is one table of everything, so it is drawn once at the end rather than per
   * chapter. renderClassic() deliberately does nothing while Creative is the mode -- it keeps
   * the Classic DOM it drew so switching back is instant -- which means the stub this function
   * put in the Classic mount is the one thing nothing else will clear. It is invisible (the
   * mount is hidden in Creative) and a mode switch replaces it, but leaving a dead skeleton in
   * the document is how a later reader finds a shimmer where a table should be. */
  if (state.mode === "classic") {
    renderClassic();
  } else {
    const classic = root.querySelector("#pathways-classic");
    if (classic) classic.replaceChildren();
  }
  noteFilterChange();

  if (failures === DEFERRED_READ_ORDER.length) {
    announce("The pathway readings could not be loaded. Every station says so below.");
  } else if (failures > 0) {
    announce(`Pathways loaded. ${failures} of ${DEFERRED_READ_ORDER.length} readings could not be read; those stations say so.`);
  } else {
    announce("Pathways loaded.", { visible: false });
  }
}

export async function boot(root = document.getElementById("pathways-root"), suppliedBundle = null) {
  if (!root) return;
  // The shell normally navigates between tabs, but retries and embedded hosts can remount this
  // module in place. Invalidate the old generation before it can repaint the new root.
  if (state.root) teardown(state.root);
  if (state.abortController) state.abortController.abort();
  state.mountGeneration += 1;
  const generation = state.mountGeneration;
  state.abortController = typeof AbortController === "function" ? new AbortController() : null;
  state.root = root;
  state.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("pathways");
  readHash();
  // First paint must already reflect the mode a pasted/shared hash named.
  root.dataset.mode = state.mode;
  root.dataset.console = state.sidebarCollapsed ? "closed" : "open";
  document.addEventListener("click", (e) => {
    // Opening Rock's hamburger menu immediately hides the filter console
    if (e.target.closest && e.target.closest(".navbar-toggle, [data-toggle='collapse'], .navigation-trigger, .navbar-header")) {
      toggleSidebar(true);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
      if (!state.sidebarCollapsed && state.root) {
        const sidebar = state.root.querySelector("#filter-sidebar");
        const toggleBtn = state.root.querySelector("#btn-toggle-sidebar");
        if (sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
          toggleSidebar(true);
        }
      }
    }
  });

  if (!state.documentBound) {
    state.documentBound = true;
    if (MOBILE.addEventListener) MOBILE.addEventListener("change", mountPalette);
  }

  renderShell(root);
  trackHostChrome(root);

  mountPalette();
  /* One delegated listener for every export control on the page, bound once to the
   * island root: rails are rebuilt on every filter change and a listener bound to a
   * rail would go with it. The package accessor returns a promise; the delegation
   * awaits it (contract §6/§7). */
  bindExportDelegation(root, exportRegistry, {
    view: buildView,
    announce,
    package: () => buildDashboardPackage(buildView()),
  });
  bindInfoDismissal(root);
  /* After renderShell, which replaces the root's children and would take the
   * bubble with it. The marks built during that pass are still live, because
   * proseMark() resolves this layer when the pointer arrives rather than when
   * the mark is made. Mounted once and never rebuilt, so a filter re-render
   * cannot orphan it. */
  state.proseTips = mountTooltipLayer(root, { surface: "pathways-prose" });
  /* The one release for every pinned readout. Bound on the document, not the root,
   * because a reader who has finished with a card clicks wherever they are looking
   * next, which is often Rock's own chrome.
   *
   * Bubble phase, and each trigger stamps the click it already handled. A capture
   * listener would run BEFORE the trigger's own toggle and release the pin the
   * reader was trying to close, so the second click would re-open it and the card
   * could never be dismissed by clicking it. Escape needs no target at all. */
  root.ownerDocument.addEventListener("click", (event) => {
    if (event[PIN_HANDLED]) return;
    releasePins();
  });
  root.ownerDocument.addEventListener("keydown", (event) => {
    if (event.key === "Escape") releasePins();
  });
  /* The same safety net dashboard-tooltip.mjs grew, for the two readouts this island
   * draws itself. A strip or a bar only reports a leave when the pointer walks off it,
   * never when a filter re-render walks it off the pointer, and the card it opened then
   * stands over a pointer that has moved on. `pointerover` fires once per element the
   * pointer enters, so this costs one closest() per entry, not a pointermove tax. */
  root.ownerDocument.addEventListener("pointerover", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest(".swarmrow__overlay, .namecard, .keycap")) return;
    scheduleSleep();
    const card = target && target.closest(".segcard");
    if (card) return;
    for (const seg of state.root ? state.root.querySelectorAll(".segcard") : []) {
      if (seg.hidden || seg.dataset.pinned === "true") continue;
      if (target && seg.parentElement && seg.parentElement.contains(target)) continue;
      seg.hidden = true;
    }
  }, true);
  applyHostChrome();
  // Rock's chrome can settle after first paint, so measure again once the page
  // is quiet, and whenever the viewport changes. The timer is generation-guarded so an old
  // Pathways mount cannot write furniture values into a newly mounted Leadership tab.
  state.chromeTimer = window.setTimeout(() => {
    if (isCurrentMount(root, generation)) applyHostChrome();
  }, 400);
  window.addEventListener("resize", () => {
    if (isCurrentMount(root, generation)) applyHostChrome();
  }, { passive: true });
  let deferredAddress = null;
  try {
    if (suppliedBundle) {
      state.bundle = suppliedBundle;
    } else {
      const island = document.getElementById("pathways-data");
      if (island && island.type === "application/json") {
        // The wrapper inlined the reads: the dev workbench, the fictional bundle, and
        // the datapart response itself if this ever renders inside one.
        state.bundle = responsesToBundle(JSON.parse(island.textContent));
      } else {
        deferredAddress = deferredReadAddress();
        if (!deferredAddress) throw new Error("the passive production data island is missing");
        /* THE SURFACE IS BUILT NOW, FROM THIS. fallbackBundle()'s own copy is "Live Rock
         * query pending. Reserved, not zero." -- which is exactly true here -- so the
         * console, the masthead and every heading render real and usable while the reads
         * run. Only the marks are replaced with a silhouette, below. */
        state.bundle = fallbackBundle(deferredCampus());
      }
    }
  } catch {
    // Every way the deferred read can fail -- offline, a login redirect, a page
    // without the island, malformed JSON -- lands here and renders the documented
    // unavailable bundle. A failed read is never a silent empty page.
    deferredAddress = null;
    state.bundle = fallbackBundle();
  }
  updateSurfaceMeta();
  await progressiveRender(root);

  if (deferredAddress) await streamDeferredReads(root, deferredAddress);
  if (!isCurrentMount(root, generation)) return;
  window.addEventListener("hashchange", () => { readHash(); renderAll(); });
  window.addEventListener("resize", debounce(() => { drawTrajectories(); paintAllSwarms(); }, 150));
  // A background tab never runs requestAnimationFrame, so a page opened in one
  // finishes its render with unsized, unpainted canvases and shows an empty
  // freshness strip the first time it is looked at. Repaint on the way in.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestAnimationFrame(() => { drawTrajectories(); paintAllSwarms(); });
  });
}

export function teardown(root = state.root) {
  // Do not let a stale shell callback tear down a newer module generation that owns the
  // singleton. The shell passes the detached host when it invalidates a mount.
  if (root && state.root && root !== state.root) return;
  state.mountGeneration += 1;
  if (state.abortController) state.abortController.abort();
  state.abortController = null;
  if (state.chromeTimer) window.clearTimeout(state.chromeTimer);
  state.chromeTimer = null;
  if (state.status && typeof state.status.destroy === "function") state.status.destroy();
  state.status = null;
  if (state.proseTips && typeof state.proseTips.destroy === "function") state.proseTips.destroy();
  state.proseTips = null;
  if (root) {
    root.replaceChildren();
    root.classList.remove("pathways");
    delete root.dataset.mode;
    delete root.dataset.console;
  }
  state.root = null;
  state.bundle = null;
  state.readAt.clear();
}

/* Reads a comma-set hash param against a closed vocabulary (LIFECYCLE/GENDER/AGE
 * keys), same spellings filteredPeople() compares against person.lifecycle /
 * person.gender / person.ageBand. Unknown tokens are dropped, never guessed. */
function parseKeySetParam(params, key, validKeys) {
  const out = new Set();
  const raw = params.get(key);
  if (!raw) return out;
  const valid = new Set(validKeys);
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (valid.has(token)) out.add(token);
  }
  return out;
}

function readHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const stack = params.get("stack");
  state.stack = stack && STACKS[stack] ? stack : DEFAULT_STACK;
  state.filters = {
    state: parseKeySetParam(params, "state", STATE.map((s) => s.key)),
    lifecycle: parseKeySetParam(params, "lifecycle", LIFECYCLE.map((c) => c.key)),
    gender: parseKeySetParam(params, "gender", GENDER.map((g) => g.key)),
    age: parseKeySetParam(params, "age", AGE.map((a) => a.key)),
  };
  state.mode = params.get("mode") === "classic" ? "classic" : DEFAULT_MODE;
  // Absent means on, so a shared link without the key behaves the way the page does
  // out of the box. Only the non-default is ever written.
  state.cards = params.get("cards") !== "off";
}

function writeHash() {
  const params = new URLSearchParams();
  // stack is always written, as today; every other key writes only when non-default.
  params.set("stack", state.stack);
  for (const dim of FILTER_DIMS) {
    if (state.filters[dim].size) params.set(dim, [...state.filters[dim]].sort().join(","));
  }
  if (state.mode !== DEFAULT_MODE) params.set("mode", state.mode);
  if (!state.cards) params.set("cards", "off");
  // This function rebuilds the hash from scratch, so a shell key sitting in the URL would be
  // dropped by the reader's first filter change. Carry the reserved keys across (#600). With no
  // shell present there is nothing to carry and the output is unchanged.
  preserveReservedKeys(params);
  const next = `#${params.toString()}`;
  if (window.location.hash !== next) history.replaceState(null, "", next);
}

function debounce(fn, wait) {
  let handle = null;
  return (...args) => { clearTimeout(handle); handle = setTimeout(() => fn(...args), wait); };
}

/* Progressive order from the issue: shell, labels, bars, trajectories, then the lower
 * chapters. It used to pause between phases (820ms of fixed "beats" on every first paint,
 * live data included); the UX bar (#587) bans fake latency and #543 is about time to first
 * reading, so the order is kept and the waiting is gone. The data is already here by the
 * time this runs; nothing was being waited for. */
async function progressiveRender(root) {
  renderRail();
  renderPathLabels();
  renderBars({});
  drawTrajectories();
  renderWaterfall();
  renderSwarm();
  // First paint has to reproduce what a shared #mode=classic link named, not wait
  // for the first filter change to notice it.
  renderClassic();
  noteFilterChange();
  announce("People Pathway loaded.", { visible: false });
}

/* ------------------------------------------------------------- rendering -- */

function renderShell(root) {
  root.replaceChildren();
  const shell = el("div", "shell");

  // Every pathway renders in this one scroll, so the console does not select a
  // pathway -- it changes how the same soundings are read.
  const toggleBar = el("div", "sidebar-toggle-bar");
  const toggleBtn = el("button", "toggle-btn");
  toggleBtn.id = "btn-toggle-sidebar";
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  toggleBtn.setAttribute("aria-controls", "filter-sidebar");
  const toggleText = el("span", null, "Filter console");
  toggleText.id = "toggle-text";
  const chevron = svgEl("svg", { class: "arrow", viewBox: "0 0 12 12", "aria-hidden": "true" });
  chevron.append(svgEl("path", {
    d: "M4 2 L8 6 L4 10", fill: "none", stroke: "currentColor",
    "stroke-width": "1.75", "stroke-linecap": "square",
  }));
  chevron.id = "toggle-arrow";
  toggleBtn.append(toggleText, chevron);
  toggleBtn.addEventListener("click", () => toggleSidebar());
  toggleBar.append(toggleBtn);

  const layout = el("div", `dashboard-layout ${state.sidebarCollapsed ? "is-collapsed" : ""}`);
  layout.id = "pathways-layout";

  const mainCol = el("div", "main-column");
  /* Both compositions live in the document at once. Classic hides the Creative
   * chapters and shows its own grid; Creative does the reverse. Nothing is
   * destroyed, so the switch back is instant and identical (contract \u00a73). */
  for (const chapter of [
    buildChapter("map", "Pathway Map", "One sounded band per step, in the order a person actually walks it. Every pathway is on this page and all bands share one scale, so a given length means the same number of people throughout. A dashed wash means the step has no Rock schema yet, which is different from 0, loading, or stale."),
    buildChapter("wf", "Movement since last Sunday", "Set and drift across the human-authored steps, not a repeat of headcount. Direction and sign carry the meaning alongside colour, so the story survives colourblindness and print."),
    buildChapter("swarm", "Freshness", "Soundings: one dot is one person, rows keep pathway order, and freshness is measured against each step\u2019s own expected season. The full population stays on the page: the shoals are the signal, not clutter."),
  ]) {
    chapter.classList.add("creative-only");
    mainCol.append(chapter);
  }
  const classicMount = el("div", "classic-mount");
  classicMount.id = "pathways-classic";
  mainCol.append(classicMount);
  // The colophon is reference prose and reads the same in both modes (plan \u00a77b).
  mainCol.append(buildColophon());

  const sidebar = el("aside", "filter-sidebar");
  sidebar.id = "filter-sidebar";
  sidebar.setAttribute("role", "region");
  sidebar.setAttribute("aria-label", "Dashboard filters");

  layout.append(mainCol, sidebar);

  const backdrop = el("div", "filter-backdrop");
  backdrop.id = "pathways-filter-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", () => toggleSidebar(true));

  if (!root.closest?.(".pshell")) {
    const trail = el("div", "pathways-trail");
    mountBreadcrumbs(trail, { currentSurface: "pathways" });
    shell.append(trail);
  }
  shell.append(buildMasthead(), toggleBar, layout, backdrop);

  const live = el("div", "srlive");
  live.id = "pathways-live";
  live.setAttribute("aria-live", "polite");
  shell.append(live);
  root.append(shell);
}

function toggleSidebar(collapsed) {
  state.sidebarCollapsed = collapsed !== undefined ? collapsed : !state.sidebarCollapsed;
  const layout = state.root ? state.root.querySelector("#pathways-layout") : document.querySelector("#pathways-layout");
  const toggleBtn = state.root ? state.root.querySelector("#btn-toggle-sidebar") : document.querySelector("#btn-toggle-sidebar");
  const toggleText = state.root ? state.root.querySelector("#toggle-text") : document.querySelector("#toggle-text");
  const backdrop = state.root ? state.root.querySelector("#pathways-filter-backdrop") : document.querySelector("#pathways-filter-backdrop");
  if (layout) layout.classList.toggle("is-collapsed", state.sidebarCollapsed);
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  if (toggleText) toggleText.textContent = "Filter console";
  /* The chevron used to be turned from here, as an inline style, which is why this
   * also had to clear the property by hand on mobile: an inline transform outranks any
   * stylesheet, so the desktop angle followed the button onto the bottom sheet. CSS owns
   * the mark now, keyed off the data-console written below, exactly as Exec Overview and
   * Connect Health key theirs -- one rule, both breakpoints, same direction on all three. */
  if (backdrop) backdrop.classList.toggle("is-active", !state.sidebarCollapsed);
  if (state.root) state.root.dataset.console = state.sidebarCollapsed ? "closed" : "open";
}

/* The UX bar (#587): the chip is the sighted half of every announce(); the live region this
 * island renders stays the half assistive tech hears. The chip mounts on first use and is
 * re-attached if renderShell() has since rebuilt the root beneath it. */
function announce(message, { visible = true } = {}) {
  const live = document.getElementById("pathways-live");
  if (live) live.textContent = message;
  if (!state.root) return;
  if (!state.status) state.status = mountStatus(state.root, { live: null });
  else if (!state.status.element.isConnected) state.root.append(state.status.element);
  state.status.announce(message, { visible });
}
/* A filter change is explained by the stations it changed, not by a toast on every click:
 * the chapters settle once and the live region says what the view now shows. The first
 * render is not a change. */
function filterKey() {
  const parts = Object.entries(state.filters || {}).map(([k, v]) => `${k}=${v instanceof Set ? [...v].sort().join("+") : String(v ?? "")}`);
  return `${state.stack}|${parts.join("&")}`;
}
function noteFilterChange() {
  const key = filterKey();
  if (state.lastFilterKey === undefined || state.lastFilterKey === null) { state.lastFilterKey = key; return; }
  if (key === state.lastFilterKey) return;
  state.lastFilterKey = key;
  announce(filterSummaryLine(state.filters), { visible: false });
  if (!state.root) return;
  const targets = state.mode === "classic"
    ? state.root.querySelectorAll(".cw, .kpi-strip")
    : state.root.querySelectorAll(".chapter");
  markChanged(targets);
}

function updateSurfaceMeta() {
  const stamps = state.root.querySelectorAll(".masthead .stamp strong");
  if (stamps[0]) stamps[0].textContent = state.bundle.meta?.campus || "Unavailable";
  const flag = document.getElementById("pathways-fictional-flag");
  if (flag && !state.bundle.fictional) flag.remove();
}

function buildMasthead() {
  const head = el("header", "masthead");
  const top = el("div", "masthead__top");
  const title = el("div", "masthead__title");
  const mark = svgEl("svg", { class: "masthead__mark", viewBox: "0 0 48 48", role: "img", "aria-label": "Favor Church" });
  mark.append(svgEl("path", { fill: "currentColor", d: "M24 1l4.6 9.7 10.3-3.4-3.4 10.3L45.2 22l-9.7 4.6 3.4 10.3-10.3-3.4L24 43.2l-4.6-9.7-10.3 3.4 3.4-10.3L2.8 22l9.7-4.6L9.1 7.1l10.3 3.4z" }));
  const h1 = el("h1", null, "People Pathways ");
  h1.append(el("span", "title-beta", "(Beta)"));
  title.append(mark, h1);
  const meta = el("div", "masthead__meta");
  meta.append(el("p", "stamp"), el("p", "stamp"));
  meta.children[0].innerHTML = "Scope <strong>MNL</strong>";
  meta.children[1].innerHTML = "Compared with <strong>last Sunday</strong>";
  const left = el("div", "masthead__id");
  left.append(title, meta);
  /* Masthead right-hand column (#229): the controls belong in the corner a reader checks
   * for what a page lets them do. Scope stamps read down the left side with the title (#295),
   * and the column is bottom-aligned in CSS so the tools sit under the masthead rather than
   * level with the title, where they read as a second headline. */
  const aside = el("div", "masthead__aside");
  aside.append(buildMastheadTools());
  top.append(left, aside);
  head.append(top);
  const status = el("p", "status-beta");
  status.append(
    el("strong", null, "Beta"),
    el("span", null, "Numbers are real; what each one counts is still under review and can change"),
  );
  head.append(status);
  const flag = el("p", "flag--fictional", "Fictional prototype data.");
  flag.id = "pathways-fictional-flag";
  head.append(flag);
  return head;
}

/* Masthead tools, both modes: the two-target copy prompt beside the title block and
 * the surface-level package control. The package is one artifact per surface rather
 * than per widget (plan §10), so it sits here and not in a widget rail. Its rows are
 * a count of the exportable sections -- the aggregate summary the delegation checks
 * before it will hand the package to a download (D8). */
function buildMastheadTools() {
  const tools = el("div", "masthead__tools");
  /* align: "end" -- both controls sit at the end edge of the masthead now, so the popover and
   * the tips anchor to that edge instead of running off the other side. */
  mountCopyPrompt(tools, { view: buildView, announce, align: "end" });
  drawTipMark(tools);
  mountPackageControl(tools, { surfaceId: SURFACE.id, align: "end" });

  exportRegistry.register(SURFACE.id, {
    title: SURFACE.title,
    table: () => {
      const view = buildView();
      const rows = (view.sections || [])
        .filter((section) => !section.personLevel)
        .map((section) => ({
          section: section.heading,
          kind: section.kind,
          rows: Array.isArray(section.rows) ? section.rows.length : 0,
        }));
      return {
        id: "package-summary",
        title: `${SURFACE.title} package`,
        columns: [
          { key: "section", label: "Section" },
          { key: "kind", label: "Kind" },
          { key: "rows", label: "Rows", kind: "number" },
        ],
        rows,
      };
    },
  });
  return tools;
}

/* The shared prompt module ends its guidelines link with a text arrow. Icons on this
 * surface are drawn in one stroke, so the glyph becomes an SVG mark and the new-tab
 * meaning it carried moves into the link's accessible name (the mark itself is
 * decorative). Masthead affordance only; the module's markup is otherwise untouched. */
function drawTipMark(tools) {
  const link = tools.querySelector(".ai-guidelines-tip__link");
  if (!link) return;
  const label = String(link.textContent || "").replace(/\s*\u2197\s*$/, "").trim();
  if (!label) return;
  link.textContent = label;
  const mark = svgEl("svg", {
    class: "ai-guidelines-tip__mark", viewBox: "0 0 12 12", "aria-hidden": "true", focusable: "false",
  });
  mark.append(svgEl("path", { d: "M4.5 2.5h5v5M9.5 2.5 2.5 9.5", fill: "none", stroke: "currentColor" }));
  link.append(mark, el("span", "srlive", " (opens in a new tab)"));
}

function buildChapter(id, heading, what) {
  const section = el("section", "chapter");
  section.id = `chapter-${id}`;
  const head = el("div", "chapter__head");
  const h2 = el("h2", null, heading);
  h2.id = `chapter-${id}-title`;
  section.setAttribute("aria-labelledby", h2.id);
  head.append(h2);
  // The explanation used to sit above the chart as a paragraph, then as a click
  // disclosure. Both cost layout: opening one, or a filter changing its text,
  // shoved the chart the reader was aiming at. It is a hover bubble now.
  const mark = proseMark(what, `How to read ${heading.toLowerCase()}`);
  if (mark) head.append(mark);
  // Freshness is the chapter the profile cards open over, so its heading carries the
  // switch for them. The other chapters have no cards to switch.
  if (id === "swarm") head.append(cardSwitch("head"));
  head.append(el("p", "chapter__meta"));
  section.append(head, el("div", "chapter__body"));
  return section;
}

function buildColophon() {
  const p = el("p", "colophon", "Where these numbers come from");
  const mark = proseMark(
    "The live staff-locked Rock page reads production through registered, reviewed, SELECT-only named queries. Missing data renders as unavailable with its reason, and nothing on this page is invented client-side. Normal Rock staff page authorization is the viewer boundary. Fictional prototype data is labelled in the masthead when this is the offline workbench.",
    "Where these numbers come from");
  if (mark) p.append(mark);
  return p;
}

function renderBundleFailure(root, error) {
  const body = root.querySelector("#chapter-map .chapter__body") || root;
  const note = el("p", "chapter__what");
  note.textContent = `The data bundle did not load (${error.message}). Nothing is rendered in its place: an unavailable page must never look like an empty church.`;
  body.replaceChildren(note);
}

/* The page is one megapage: every pathway renders at once. Layers that need a flat
 * ordered step list (trajectories, freshness, the ledger) consume this combined
 * pseudo-path; renderBars regroups the same steps under their own pathway heading. */
function activePath() {
  const pathways = state.bundle.pathways || [];
  return {
    id: "all",
    label: "All pathways",
    description: pathways.map((p) => p.label).join(" · "),
    logo: pathways[0]?.logo || "burst",
    steps: pathways.flatMap((p) => p.steps),
  };
}

function activeFilterDimensions() {
  return Object.entries(state.filters).filter(([, set]) => set.size > 0).map(([dim]) => dim);
}

function renderAll() {
  writeHash();
  renderRail();
  // The four Creative stations below live under .creative-only, which CSS hides
  // outright in Classic mode (pathways.css [data-mode="classic"] .creative-only).
  // Rebuilding their SVG/DOM on every filter change while they're not on screen
  // is pure wasted work -- renderClassic() already skips the reverse case.
  if (state.mode !== "classic") {
    renderPathLabels();
    renderBars({});
    drawTrajectories();
    renderWaterfall();
    renderSwarm();
  }
  renderClassic();
  syncStackAccent();
  noteFilterChange();
}

/* Favor Grow Multicolor on Pathways: narrow the active stack dimension to exactly one
 * segment and that segment's own colour promotes into --accent and the selection washes,
 * the same mechanism Grow's course ladder proved (shared/dashboard-theme.mjs's
 * syncIdentityAccent()). IDENTITY_ACCENT_EXEMPT segments never promote -- see its comment. */
function syncStackAccent() {
  if (!state.root) return;
  const selected = state.filters[state.stack];
  const onlyKey = selected && selected.size === 1 ? [...selected][0] : null;
  const segment = onlyKey ? STACKS[state.stack].find((entry) => entry.key === onlyKey) : null;
  const safe = segment && !IDENTITY_ACCENT_EXEMPT.has(segment.token) ? segment.token.replace(/^--/, "") : null;
  syncIdentityAccent(state.root, {
    theme: state.root.dataset.theme || null,
    activeThemes: ["favor-grow-multicolor"],
    key: safe,
    slots: {
      "--accent": "mark",
      "--spectrum-lock": "mark",
      "--spectrum-lock-wash": { wash: 30 },
      "--selected-wash": { wash: 16 },
      "--hover-wash": { wash: 8 },
    },
  });
  /* A locked band is a 30% wash, so its text is ink rather than the ladder's on grade. */
  state.root.style.setProperty("--spectrum-lock-ink", state.root.style.getPropertyValue("--spectrum-lock") ? "var(--ink)" : "");
}

/* Creative/Classic switch (contract §3). Both modes read the exact same
 * filtered slice this file already computes (filteredPeople(), activePath(),
 * barReading(), the waterfall/freshness data) -- switching never forks filter
 * state, only how it renders. */
function setMode(mode) {
  const next = MODES.includes(mode) ? mode : DEFAULT_MODE;
  if (next === state.mode) return;
  state.mode = next;
  if (state.root) {
    state.root.dataset.mode = state.mode;
    /* The one authored moment (grammar §14), as long as the --motion-state token says,
     * which reduced motion zeroes. */
    const beat = motionMs(state.root, "--motion-state", 180);
    if (beat > 0) {
      state.root.classList.add("is-mode-switching");
      window.setTimeout(() => state.root.classList.remove("is-mode-switching"), beat);
    }
  }
  renderAll();
}

/* Classic renderer (#218). Defined with the rest of the Classic composition at the
 * foot of this module; renderAll() calls it last, and it is a no-op in Creative. */

/* Filter console: mode switch, stack mode, gender pills, age ratio table, lifecycle focus. */
function renderRail() {
  const sidebar = state.root.querySelector("#filter-sidebar");
  if (!sidebar) return;
  // Keeps the root's data-mode in sync on every render, not just the click path --
  // a pasted/shared hash (readHash() -> renderAll()) must reproduce the same DOM
  // state a click would, since CSS composes Classic under [data-mode="classic"].
  if (state.root) state.root.dataset.mode = state.mode;
  sidebar.replaceChildren();
  /* The control grammar a browser agent is handed (#220 §11) is emitted here, by the
   * same pass that builds the controls, so it can never drift from the console it describes. */
  state.controls = [];

  // 0. Mode switch (contract §3), first element in the console, above the head.
  // The control itself is the shared one (#237): three islands used to hand-build the
  // same two buttons in the same order, so the ordering ruling lived in three places
  // and could drift in any of them. classic-widgets owns the markup and the pressed
  // bookkeeping now; this island keeps only what is genuinely its own -- setMode().
  sidebar.append(modeSwitch(state.mode, (next) => setMode(next)));
  state.controls.push({
    id: "mode",
    kind: "segmented",
    label: "Display mode",
    selector: "#pathways-root .mode-switch__btn[data-mode]",
    values: MODES,
    effect: "Switches the whole page between the Creative reading and the Classic table reading. Both modes show the same filtered slice, so switching never loses the filters.",
  });

  // 1. Sidebar Header
  const head = el("div", "sidebar-head");
  const backBtn = el("button", "sidebar-back-btn");
  backBtn.id = "btn-sidebar-back";
  backBtn.type = "button";
  backBtn.setAttribute("aria-label", "Close filters");
  backBtn.innerHTML = '<span class="back-arrow" aria-hidden="true">←</span> Back';
  backBtn.addEventListener("click", () => toggleSidebar(true));

  const titleWrap = el("div", "sidebar-title-wrap");
  titleWrap.append(backBtn, el("h2", null, "Display"));

  const dims = activeFilterDimensions();
  const summaryPill = el("span", "active-summary-pill", dims.length === 0 ? "All People" : `Focused: ${dims.map((d) => STACK_LABELS[d]).join(" + ")}`);
  titleWrap.append(summaryPill);

  const resetBtn = el("button", "reset-btn", "Reset All");
  resetBtn.type = "button";
  resetBtn.id = "btn-reset-filters";
  resetBtn.title = "Reset all filters, stack dimension, and pathways";
  resetBtn.addEventListener("click", () => {
    state.stack = DEFAULT_STACK;
    state.filters = emptyFilters();
    state.awakeRef = null;
    renderAll();
  });
  head.append(titleWrap, resetBtn);
  sidebar.append(head);

  /* Profile cards, next to the other display controls rather than down with the
   * demographic filters: it changes how the page reads, not which people it counts.
   * Deliberately outside Reset All's reach for the same reason -- resetting the
   * filters should not put a card back over the chart a reader just cleared. */
  const cardsRow = el("div", "sidebar-cards");
  cardsRow.append(el("span", "sidebar-cards__label", "Profile cards"));
  cardsRow.append(cardSwitch("rail"));
  sidebar.append(cardsRow);
  state.controls.push({
    id: "cards",
    kind: "toggle",
    label: "Profile cards",
    selector: "#pathways-root .cardswitch",
    values: ["on", "off"],
    effect: "Turns the profile card a sounding opens on hover on or off. On is the default; off leaves the plumb line, the day, and the keyboard readout in place, and only stops the card from opening over the page.",
  });
  state.controls.push({
    id: "reset",
    kind: "button-group",
    label: "Reset all filters",
    selector: "#btn-reset-filters",
    values: ["reset"],
    effect: "Clears the state focus and every demographic filter, and returns the stack dimension to state.",
  });

  // 2. Filter Form
  const form = el("form", "filter-form");
  form.setAttribute("role", "search");
  form.setAttribute("aria-label", "Pathway and demographic filters");
  form.addEventListener("submit", (e) => e.preventDefault());

  // Aggregate stats across people in the bundle
  const people = state.bundle.people || [];
  const totalCount = people.length || 1;
  const genderCounts = { women: 0, men: 0, unknown: 0 };
  const ageCounts = { kids: 0, youth: 0, youngAdults: 0, adults: 0, seasoned: 0 };
  const lifeCounts = { new: 0, crowd: 0, core: 0, leader: 0 };

  for (const p of people) {
    if (genderCounts[p.gender] !== undefined) genderCounts[p.gender] += 1;
    if (ageCounts[p.ageBand] !== undefined) ageCounts[p.ageBand] += 1;
    if (lifeCounts[p.lifecycle] !== undefined) lifeCounts[p.lifecycle] += 1;
  }

  // --- Fieldset 1: Stack By ---
  const stackFs = el("fieldset", "filter-fieldset");
  const stackLeg = el("legend", "filter-legend");
  stackLeg.innerHTML = `<span>Stack By</span> <span class="sub">${escapeText(STACK_LABELS[state.stack])}</span>`;
  stackFs.append(stackLeg);

  /* Four tiles rather than four stacked rows. As a list, the four dimensions read
   * as a queue with a winner at the top and three also-rans below it; as a 2x2
   * they read as what they are -- four equal ways to cut the same population,
   * one of them currently chosen. The chosen tile carries its own segment
   * swatches, so the console shows the legend it is about to draw. */
  const stackCol = el("div", "stack-tiles");
  for (const [key, label] of Object.entries(STACK_LABELS)) {
    const isAct = state.stack === key;
    const btn = el("button", `stack-tile ${isAct ? "is-active" : ""}`);
    btn.type = "button";
    btn.dataset.stack = key;
    btn.setAttribute("aria-pressed", String(isAct));
    btn.addEventListener("click", () => {
      state.stack = key;
      renderAll();
    });
    btn.append(el("span", "stack-tile__name", label));
    const swatches = el("span", "stack-tile__swatches");
    swatches.setAttribute("aria-hidden", "true");
    for (const segment of STACKS[key]) {
      const chip = el("i", "stack-tile__swatch");
      chip.style.background = `var(${segment.token})`;
      swatches.append(chip);
    }
    btn.append(swatches);
    btn.append(el("span", "stack-tile__meta", `${STACKS[key].length} segments`));
    stackCol.append(btn);
  }
  stackFs.append(stackCol);
  form.append(stackFs);
  state.controls.push({
    id: "stack",
    kind: "segmented",
    label: "Stack by",
    selector: "#filter-sidebar .stack-tile[data-stack]",
    values: Object.keys(STACKS),
    effect: "Chooses which dimension segments every step bar, and which columns the Classic step table carries. It selects nobody in or out. 'State' is the default and stacks the step's own ladder -- signed up, attended, ongoing, completed, unfinished -- so one bar shows where a step's people actually sit; a state Rock cannot answer contributes no segment and stays a `?` beside the step.",
  });

  /* --- Fieldset 2: State focus ------------------------------------------------
   *
   * The step rows used to print every rung as a line of prose -- "Signed up, not
   * yet placed 795 · In a Connect Group 2,243" -- eighteen times down the page.
   * Reading eighteen paragraphs to answer "who is only signed up?" is the wrong
   * instrument; narrowing to that rung is the right one, and this is it.
   *
   * The rungs are deliberately generic here. A step names its own rung in Rock's
   * words ("New Signup" on Build, "Scheduled" on Baptisms), and the bar's hover
   * still prints those; but a filter has to name one thing that means the same
   * across eighteen steps, so the pill says "Signed up" and the count beside it
   * is how many people sit on that rung anywhere on this pathway. */
  const stateFs = el("fieldset", "filter-fieldset");
  const stateLeg = el("legend", "filter-legend");
  const isStateActive = state.filters.state.size > 0;
  const stateSubText = !isStateActive
    ? "Every rung"
    : [...state.filters.state].map((k) => STATE.find((s) => s.key === k)?.label || k).join(", ");
  stateLeg.innerHTML = `<span>State</span> <span class="sub">${escapeText(stateSubText)}</span>`;
  stateFs.append(stateLeg);

  // Rung totals across the visible pathway, so a pill that would select nobody
  // says 0 rather than pretending to be a live option.
  const rungTotals = Object.fromEntries(STATE.map((rung) => [rung.key, 0]));
  const rungGhosts = Object.fromEntries(STATE.map((rung) => [rung.key, 0]));
  for (const step of (state.bundle.pathways || []).flatMap((p) => p.steps)) {
    for (const [key, value] of Object.entries(step.segments?.state || {})) {
      if (key in rungTotals) rungTotals[key] += value;
    }
    for (const reading of step.stateReadings || []) {
      if (reading.schemaStatus === "ghost" && reading.key in rungGhosts) rungGhosts[reading.key] += 1;
    }
  }

  const stateRow = el("div", "state-pill-row");
  const stateAll = el("button", `state-pill ${!isStateActive ? "is-active" : ""}`);
  stateAll.type = "button";
  stateAll.dataset.stateKey = "all";
  stateAll.setAttribute("aria-pressed", String(!isStateActive));
  stateAll.addEventListener("click", () => { state.filters.state.clear(); renderAll(); });
  stateAll.append(el("span", "state-pill__name", "Every rung"));
  stateRow.append(stateAll);

  for (const rung of STATE) {
    const isOn = state.filters.state.has(rung.key);
    const pill = el("button", `state-pill ${isOn ? "is-active" : ""}`);
    pill.type = "button";
    pill.dataset.stateKey = rung.key;
    pill.setAttribute("aria-pressed", String(isOn));
    pill.style.setProperty("--pill-tone", `var(${rung.token})`);
    pill.addEventListener("click", () => {
      if (isOn) state.filters.state.delete(rung.key); else state.filters.state.add(rung.key);
      renderAll();
    });
    const swatch = el("i", "state-pill__dot");
    swatch.style.background = `var(${rung.token})`;
    pill.append(swatch, el("span", "state-pill__name", rung.label));
    pill.append(el("span", "val-tag", formatCount(rungTotals[rung.key] || 0)));
    // A rung some steps declare but Rock cannot answer is not the same as a rung
    // nobody is on, and the pill is the only place left that can say so.
    const ghosts = rungGhosts[rung.key];
    const title = ghosts
      ? `${rung.label}: ${formatCount(rungTotals[rung.key] || 0)} people across this pathway. ${ghosts} step${ghosts === 1 ? "" : "s"} declare this rung but Rock holds nothing for it, so those steps contribute no one here — reserved, not zero.`
      : `${rung.label}: ${formatCount(rungTotals[rung.key] || 0)} people across this pathway.`;
    pill.title = title;
    pill.setAttribute("aria-label", title);
    if (ghosts) pill.append(el("span", "state-pill__ghost num", "?"));
    stateRow.append(pill);
  }
  stateFs.append(stateRow);
  form.append(stateFs);
  state.controls.push({
    id: "state",
    kind: "multi-select",
    label: "State focus",
    selector: "#filter-sidebar .state-pill[data-state-key]",
    values: ["all", ...STATE.map((rung) => rung.key)],
    effect: "Narrows every step bar and every freshness mark to the chosen rungs of the step ladder, answered per step from the same aggregate the bars are drawn from. Combining it with a demographic focus renders unavailable rather than inventing an intersection the bundle does not carry.",
  });

  // --- Fieldset 3: Gender Focus (matching template pills with micro-meters) ---
  const genderFs = el("fieldset", "filter-fieldset");
  const genderLeg = el("legend", "filter-legend");
  const isGenderActive = state.filters.gender.size > 0;
  const genderSubText = !isGenderActive ? "All People" : [...state.filters.gender].map((g) => GENDER.find((x) => x.key === g)?.label || g).join(", ");
  genderLeg.innerHTML = `<span>Gender</span> <span class="sub">${escapeText(genderSubText)}</span>`;
  genderFs.append(genderLeg);

  const genderRow = el("div", "gender-pill-row");

  // All button
  const genAllBtn = el("button", `gender-btn ${!isGenderActive ? "is-active" : ""}`);
  genAllBtn.type = "button";
  genAllBtn.dataset.gender = "all";
  genAllBtn.setAttribute("aria-pressed", String(!isGenderActive));
  genAllBtn.addEventListener("click", () => {
    state.filters.gender.clear();
    renderAll();
  });
  const genAllTop = el("div", "gender-btn-top");
  genAllTop.innerHTML = `<span>All</span> <span class="val-tag">${formatCount(people.length)}</span>`;
  const genAllMeter = el("div", "btn-meter");
  const genAllFill = el("div", "btn-meter-fill");
  genAllFill.style.transform = "scaleX(1)";
  genAllFill.style.background = "var(--ink)";
  genAllMeter.append(genAllFill);
  genAllBtn.append(genAllTop, genAllMeter);
  genderRow.append(genAllBtn);

  // Women button
  const womenCount = genderCounts.women || 0;
  const womenPct = Math.round((womenCount / totalCount) * 100) || 55;
  const isWomen = state.filters.gender.has("women");
  const genWomenBtn = el("button", `gender-btn ${isWomen ? "is-active" : ""}`);
  genWomenBtn.type = "button";
  genWomenBtn.dataset.gender = "women";
  genWomenBtn.setAttribute("aria-pressed", String(isWomen));
  genWomenBtn.addEventListener("click", () => {
    state.filters.gender.has("women") ? state.filters.gender.delete("women") : state.filters.gender.add("women");
    renderAll();
  });
  const genWomenTop = el("div", "gender-btn-top");
  genWomenTop.innerHTML = `<span>Women</span> <span class="val-tag">${womenPct}%</span>`;
  const genWomenMeter = el("div", "btn-meter");
  const genWomenFill = el("div", "btn-meter-fill");
  genWomenFill.style.transform = `scaleX(${womenPct / 100})`;
  genWomenFill.style.background = "var(--accent)";
  genWomenMeter.append(genWomenFill);
  genWomenBtn.append(genWomenTop, genWomenMeter);
  genderRow.append(genWomenBtn);

  // Men button
  const menCount = genderCounts.men || 0;
  const menPct = Math.round((menCount / totalCount) * 100) || 42;
  const isMen = state.filters.gender.has("men");
  const genMenBtn = el("button", `gender-btn ${isMen ? "is-active" : ""}`);
  genMenBtn.type = "button";
  genMenBtn.dataset.gender = "men";
  genMenBtn.setAttribute("aria-pressed", String(isMen));
  genMenBtn.addEventListener("click", () => {
    state.filters.gender.has("men") ? state.filters.gender.delete("men") : state.filters.gender.add("men");
    renderAll();
  });
  const genMenTop = el("div", "gender-btn-top");
  genMenTop.innerHTML = `<span>Men</span> <span class="val-tag">${menPct}%</span>`;
  const genMenMeter = el("div", "btn-meter");
  const genMenFill = el("div", "btn-meter-fill");
  genMenFill.style.transform = `scaleX(${menPct / 100})`;
  genMenFill.style.background = "var(--secondary)";
  genMenMeter.append(genMenFill);
  genMenBtn.append(genMenTop, genMenMeter);
  genderRow.append(genMenBtn);

  genderFs.append(genderRow);
  form.append(genderFs);
  state.controls.push({
    id: "gender",
    kind: "button-group",
    label: "Gender focus",
    selector: "#filter-sidebar .gender-btn[data-gender]",
    values: ["all", ...GENDER.map((g) => g.key)],
    effect: "Narrows the whole page to the chosen genders; the pills toggle, so more than one can be on. \"All\" clears the axis. Unknown is a real value and is never folded into another.",
  });

  // --- Fieldset 4: Age Distribution (matching template ratio table) ---
  const ageFs = el("fieldset", "filter-fieldset");
  const ageLeg = el("legend", "filter-legend");
  const isAgeActive = state.filters.age.size > 0;
  const ageSubText = !isAgeActive ? "All Ages" : [...state.filters.age].map((a) => AGE.find((x) => x.key === a)?.label || a).join(", ");
  ageLeg.innerHTML = `<span>Age Distribution</span> <span class="sub">${escapeText(ageSubText)}</span>`;
  ageFs.append(ageLeg);

  const ageTable = el("table", "ratio-table");
  ageTable.setAttribute("aria-label", "Age distribution focus table");
  const ageThead = el("thead");
  ageThead.innerHTML = "<tr><th scope='col'>Age Band</th><th scope='col'>Share</th><th scope='col'>Count</th></tr>";
  const ageTbody = el("tbody");

  // All Ages Row
  const allRow = el("tr", !isAgeActive ? "is-selected" : "");
  allRow.dataset.ageRow = "all";
  allRow.innerHTML = `<td><span>All Ages</span></td><td><strong>100%</strong></td><td><span class="ratio-idx">${formatCount(people.length)}</span></td>`;
  allRow.addEventListener("click", () => {
    state.filters.age.clear();
    renderAll();
  });
  ageTbody.append(allRow);

  // Age band rows
  for (const ageBand of AGE) {
    const count = ageCounts[ageBand.key] || 0;
    const pct = Math.round((count / totalCount) * 100) || 0;
    const isSelected = state.filters.age.has(ageBand.key);
    const tr = el("tr", isSelected ? "is-selected" : "");
    tr.dataset.ageRow = ageBand.key;
    tr.innerHTML = `
      <td>
        <span class="swatch-dot" style="background:var(${ageBand.token})"></span>
        <span>${escapeText(ageBand.label)}</span>
      </td>
      <td><strong>${pct}%</strong></td>
      <td><span class="ratio-idx">${formatCount(count)}</span></td>
    `;
    tr.addEventListener("click", () => {
      state.filters.age.has(ageBand.key) ? state.filters.age.delete(ageBand.key) : state.filters.age.add(ageBand.key);
      renderAll();
    });
    ageTbody.append(tr);
  }
  ageTable.append(ageThead, ageTbody);
  ageFs.append(ageTable);
  form.append(ageFs);
  state.controls.push({
    id: "age",
    kind: "table-rows",
    label: "Age distribution focus",
    selector: "#filter-sidebar .ratio-table tr[data-age-row]",
    values: ["all", ...AGE.map((a) => a.key)],
    effect: "Clicking a row toggles that Favor age group for the whole page; the \"all\" row clears the axis.",
  });

  // --- Fieldset 5: Lifecycle Focus ---
  const lifeFs = el("fieldset", "filter-fieldset");
  const lifeLeg = el("legend", "filter-legend");
  const isLifeActive = state.filters.lifecycle.size > 0;
  const lifeSubText = !isLifeActive ? "All Cohorts" : [...state.filters.lifecycle].map((l) => LIFECYCLE.find((x) => x.key === l)?.label || l).join(", ");
  lifeLeg.innerHTML = `<span>Lifecycle</span> <span class="sub">${escapeText(lifeSubText)}</span>`;
  lifeFs.append(lifeLeg);

  const lifeGrid = el("div", "chip-grid-2");
  for (const cohort of LIFECYCLE) {
    const isAct = state.filters.lifecycle.has(cohort.key);
    const count = lifeCounts[cohort.key] || 0;
    const pct = Math.round((count / totalCount) * 100) || 0;
    const btn = el("button", `opt-btn ${isAct ? "is-active" : ""}`);
    btn.type = "button";
    btn.dataset.lifecycle = cohort.key;
    btn.setAttribute("aria-pressed", String(isAct));
    btn.addEventListener("click", () => {
      state.filters.lifecycle.has(cohort.key) ? state.filters.lifecycle.delete(cohort.key) : state.filters.lifecycle.add(cohort.key);
      renderAll();
    });

    const rowTop = el("div", "btn-row-top");
    const title = el("span", "btn-title");
    title.innerHTML = `<i class="swatch-dot" style="background:var(${cohort.token})"></i>${escapeText(cohort.label)}`;
    const valTag = el("span", "val-tag", `${pct}%`);
    rowTop.append(title, valTag);

    const meter = el("div", "btn-meter");
    const fill = el("div", "btn-meter-fill");
    fill.style.transform = `scaleX(${isAct ? 1 : pct / 100})`;
    fill.style.background = `var(${cohort.token})`;
    meter.append(fill);

    btn.append(rowTop, meter);
    lifeGrid.append(btn);
  }
  lifeFs.append(lifeGrid);
  form.append(lifeFs);
  state.controls.push({
    id: "lifecycle",
    kind: "button-group",
    label: "Lifecycle focus",
    selector: "#filter-sidebar .opt-btn[data-lifecycle]",
    values: LIFECYCLE.map((c) => c.key),
    effect: "Narrows the whole page to the chosen cohorts; the chips toggle, so more than one can be on. None on means every cohort.",
  });
  /* Built in renderShell(), above the layout, but it belongs to this console and the
   * grammar has to name it or an agent cannot open the filters at all. */
  state.controls.push({
    id: "sidebar",
    kind: "toggle",
    label: "Show or hide the filters",
    selector: "#btn-toggle-sidebar",
    values: ["show", "hide"],
    effect: "Opens and closes the filter console, which starts closed, so an agent has to press this before it can reach any filter.",
  });

  // Status / Scope caption note
  /* This note sits inside the console, so its old two-line focused form pushed
   * every control below it down the moment a filter was clicked, in the one
   * place where the reader is clicking repeatedly. The state stays on the face
   * and the caveat moves behind the mark. */
  const count = el("div", "filter-count-note");
  count.textContent = dims.length === 0
    ? "Showing the full population."
    : `Focused on ${dims.map((d) => STACK_LABELS[d].toLowerCase()).join(" and ")}.`;
  const countMark = proseMark(
    dims.length === 0
      ? "Freshness reveals old records instead of hiding them, so a stale date still shows up here."
      : "Trajectories and dots filter exactly. Bars answer one dimension at a time from this bundle. The waterfall and the freshness strips stay full-population until a live query serves this focus, and they say so in place.",
    "What this focus covers");
  if (countMark) count.append(countMark);
  form.append(count);

  sidebar.append(form);
  mountPalette();
}

function renderPathLabels() {
  const section = state.root.querySelector("#chapter-map");
  const meta = section.querySelector(".chapter__meta");
  const count = (state.bundle.pathways || []).length;
  meta.textContent = `all ${count} pathways · journey order, never sorted by size`;
}

/* The one demographic predicate on this island.
 *
 * Creative applies it to person rows; Classic applies the identical function to the
 * base cross-tab rows of #224. An empty set on an axis means "no filter on that
 * axis", exactly as the hash serializes it. Classic never gets its own filter model:
 * if a Classic view cannot be produced through this function, it renders unavailable
 * and says why (plan §15). */
function matchesDemographicFilters({ lifecycle, gender, ageBand }) {
  return (
    (!state.filters.lifecycle.size || state.filters.lifecycle.has(lifecycle)) &&
    (!state.filters.gender.size || state.filters.gender.has(gender)) &&
    (!state.filters.age.size || state.filters.age.has(ageBand))
  );
}

/* People visible under the current demographic filters. */
function filteredPeople() {
  const people = state.bundle.people || [];
  return people.filter((person) => matchesDemographicFilters(person));
}

/* The same slice, read off the base cross-tab. The registered rows spell the
 * lifecycle with a capital ("Leader"); the hash and the console spell it lower
 * ("leader"). One lowercase bridge is the whole difference -- the sets, the empty-set
 * rule, and the predicate above are shared. */
function filteredBaseRows() {
  const base = state.bundle?.base;
  if (!base || base.availability?.status !== "available") return [];
  return (base.rows || []).filter((row) => matchesDemographicFilters({
    lifecycle: String(row.lifecycle || "").toLowerCase(),
    gender: row.gender,
    ageBand: row.ageBand,
  }));
}

/* Bar value + segments for the current stack mode and filters. The bundle carries
 * one aggregate per dimension, so exactly one filtered dimension can be answered
 * honestly; two at once renders unavailable rather than a fabricated intersection. */
/* The step's own declared reading for one state rung, or null when the step never
 * declared it. Used to label a stacked state band with Rock's literal column name. */
function stateReadingFor(step, key) {
  return (step.stateReadings || []).find((reading) => reading.key === key) || null;
}

function barReading(step) {
  const dims = activeFilterDimensions();
  if (step.schemaStatus === "ghost") return { kind: "ghost" };
  if (step.availability?.status === "unavailable") return { kind: "unavailable", reason: step.availability.reason };
  if (step.grain === "aggregate") return { kind: "aggregate" };
  if (dims.length > 1) return { kind: "unavailable", reason: "needs a live query for combined filters" };
  if (dims.length === 1) {
    const dim = dims[0];
    const segments = step.segments?.[dim];
    if (!segments) return { kind: "unavailable", reason: "no breakdown for this filter" };
    const total = [...state.filters[dim]].reduce((sum, key) => sum + (segments[key] || 0), 0);
    const parts = STACKS[dim].filter((c) => state.filters[dim].has(c.key))
      .map((c) => ({ ...c, value: segments[c.key] || 0 }));
    return { kind: "value", total, parts, dim };
  }
  const segments = step.segments?.[state.stack];
  const parts = segments
    ? STACKS[state.stack].map((c) => ({ ...c, value: segments[c.key] || 0 })).filter((p) => p.value > 0)
    : [];
  return { kind: "value", total: step.uniqueCount, parts, dim: state.stack };
}

/* Front Door: four independent Sunday touchpoints, not one funnel step.
 *
 * The default is split lanes, because that is what the data actually is --
 * four separate observations of the same Sunday, each counted its own way, with
 * people appearing in more than one. Stacking them produces a bar whose length
 * means nothing, so the stacked view is opt-in and says "overlapping" on its
 * face rather than presenting a total as a population.
 *
 * Every reading is in text: value, week-over-week delta, the four-week average,
 * and the Rock metric behind it. Nothing here needs a hover.
 */
function signalDelta(signal) {
  if (signal.delta === null || signal.delta === undefined) return { text: "first reading", cls: "is-flat" };
  if (signal.delta === 0) return { text: "level w/w", cls: "is-flat" };
  const cls = signal.delta > 0 ? "is-up" : "is-down";
  return { text: `${signal.delta > 0 ? "+" : "−"}${Math.abs(signal.delta)} w/w`, cls };
}

function signalAverage(signal) {
  if (signal.averageValue === null || signal.averageValue === undefined) return null;
  const weeks = signal.averageWeeks || 0;
  return weeks >= 4 ? `4-Sunday avg ${signal.averageValue}` : `${weeks}-Sunday avg ${signal.averageValue}`;
}

function paintFrontDoor(track, step, maxCount) {
  const signals = step.aggregateSignals || [];
  const observed = signals.filter((signal) => signal.value !== null && signal.value !== undefined);
  track.classList.add("step__track--signals");
  track.setAttribute("role", "group");

  if (!signals.length) {
    track.setAttribute("aria-label", `${step.label}: no Sunday touchpoints were returned`);
    track.append(el("span", "step__aggnote", "No Sunday touchpoints were returned. Unobserved isn't zero."));
    return;
  }

  const dated = step.observedDate ? formatDate(step.observedDate) : "an unrecorded Sunday";
  track.setAttribute("aria-label",
    `${step.label}: ${observed.length} independent Sunday touchpoints observed on ${dated}. They overlap, so they aren't a population.`);

  const head = el("div", "signal-head");
  head.append(el("span", "signal-head__label", `Sunday ${dated}`));
  const toggle = el("button", "signal-head__toggle", state.frontDoorStacked ? "Split to lanes" : "Stack signals");
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", String(state.frontDoorStacked));
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    state.frontDoorStacked = !state.frontDoorStacked;
    renderBars({});
    drawTrajectories();
    announce(state.frontDoorStacked
      ? "Sunday touchpoints stacked. The total overlaps and isn't a count of people."
      : "Sunday touchpoints split into independent lanes.", { visible: false });
  });
  head.append(toggle);
  track.append(head);

  // The lane scale is the largest touchpoint, not the pathway maximum: against a
  // pathway of thousands these four would all collapse to a hairline and stop
  // being readable as differences.
  const peak = observed.reduce((top, signal) => Math.max(top, signal.value), 0) || 1;

  if (state.frontDoorStacked) {
    const total = observed.reduce((sum, signal) => sum + signal.value, 0);
    const bar = el("div", "signal-stack");
    for (const signal of observed) {
      const seg = el("span", "signal-stack__seg");
      seg.style.background = `var(${signal.token})`;
      seg.style.flexGrow = String(signal.value);
      seg.tabIndex = 0;
      seg.setAttribute("role", "img");
      seg.setAttribute("aria-label", `${signal.label}: ${formatCount(signal.value)} touches`);
      bindSegmentReadout(seg, track, {
        label: signal.label, value: signal.value, total, token: signal.token,
        unit: "touches", note: `${signal.rockMetric} · overlapping, not people`,
      });
      bar.append(seg);
    }
    track.append(bar);
    const readout = el("div", "signal-stack__readout");
    readout.append(el("span", "signal-stack__total num", formatCount(total)));
    readout.append(el("span", "signal-stack__caveat", "overlapping touches, not people"));
    track.append(readout);
    track.append(el("div", "signal-legend",
      observed.map((signal) => `${signal.label} ${formatCount(signal.value)}`).join(" · ")));
  } else {
    const lanes = el("div", "signal-lanes");
    for (const signal of signals) {
      const lane = el("div", "signal-lane");
      const missing = signal.value === null || signal.value === undefined;
      if (missing) lane.classList.add("signal-lane--unobserved");

      const name = el("div", "signal-lane__name");
      const swatch = el("span", "signal-lane__swatch");
      swatch.style.background = missing ? "transparent" : `var(${signal.token})`;
      name.append(swatch, el("span", null, signal.label));
      lane.append(name);

      const rail = el("div", "signal-lane__rail");
      const fill = el("span", "signal-lane__fill");
      fill.style.width = missing ? "0%" : `${Math.max(2, (signal.value / peak) * 100)}%`;
      fill.style.background = `var(${signal.token})`;
      rail.append(fill);
      rail.tabIndex = 0;
      rail.setAttribute("role", "img");
      rail.setAttribute("aria-label", missing
        ? `${signal.label}: not observed on this Sunday`
        : `${signal.label}: ${formatCount(signal.value)} touches`);
      bindSegmentReadout(rail, rail, {
        label: signal.label,
        value: missing ? null : signal.value,
        total: null,
        token: missing ? null : signal.token,
        unit: "touches",
        note: missing
          ? `Not observed on this Sunday. Source: ${signal.rockMetric}.`
          : `${signal.description} ${signalDelta(signal).text}${signalAverage(signal) ? ` \u00b7 ${signalAverage(signal)}` : ""}. Source: ${signal.rockMetric}.`,
      });
      lane.append(rail);

      const readout = el("div", "signal-lane__readout");
      readout.append(el("span", "signal-lane__value num", missing ? "—" : formatCount(signal.value)));
      if (missing) {
        readout.append(el("span", "signal-lane__meta", "not observed"));
      } else {
        const delta = signalDelta(signal);
        readout.append(el("span", `signal-lane__delta ${delta.cls}`, delta.text));
        const average = signalAverage(signal);
        if (average) readout.append(el("span", "signal-lane__meta num", average));
      }
      lane.append(readout);

      const laneMark = proseMark(`${signal.description} Source: ${signal.rockMetric}.`, `What ${signal.label || "this signal"} counts`);
      if (laneMark) lane.append(laneMark);
      lanes.append(lane);
    }
    track.append(lanes);
  }

  const footMark = proseMark(step.note
    || "Independent Sunday touchpoints. They overlap, so they never sum to people.",
    "How to read the front door");
  if (footMark) track.append(footMark);
}

/* Segment readout. A stacked bar is only honest if you can find out what a band
 * is; a native title attribute waits a second, cannot be styled, and never
 * appears on touch. This is a real readout: the band's name, its count, and its
 * share of the step, shown the moment the pointer lands on it.
 */
function segmentReadout(track) {
  let card = track.querySelector(".segcard");
  if (!card) {
    card = el("div", "segcard");
    card.hidden = true;
    track.append(card);
  }
  return card;
}

/* Which segment, if any, pinned the readout its track shares. Held here rather
 * than in each binding's closure because the card is one element per track: with
 * a flag per segment, pinning one bar and then hovering its neighbour left the
 * first bar's flag stuck on and the readout could never be closed again. */
const pinnedSegment = new WeakMap();

function bindSegmentReadout(seg, track, { label, value, total, token, unit = "people", note = null }) {
  const isPinned = () => {
    const card = track.querySelector(".segcard");
    return !!card && card.dataset.pinned === "true" && pinnedSegment.get(track) === seg;
  };
  let hideTimer = null;
  const show = (event) => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const card = segmentReadout(track);
    card.replaceChildren();
    const head = el("div", "segcard__head");
    // A ghost has no colour and no number; drawing an empty swatch and a dash
    // for it just adds two pieces of furniture that mean nothing.
    if (token) {
      const swatch = el("span", "segcard__swatch");
      swatch.style.background = `var(${token})`;
      head.append(swatch);
    }
    head.append(el("span", "segcard__label", label));
    card.append(head);
    if (value !== null && value !== undefined) {
      const line = el("div", "segcard__line");
      line.append(el("span", "segcard__value num", formatCount(value)));
      if (unit) line.append(el("span", "segcard__unit", unit));
      card.append(line);
    } else {
      card.append(el("p", "segcard__unknown", "Not counted yet"));
    }
    if (total && total > 0 && value !== null && value !== undefined) {
      card.append(el("p", "segcard__share num", `${Math.round((value / total) * 100)}% of ${formatCount(total)}`));
    }
    if (note) card.append(el("p", "segcard__note", note));
    card.hidden = false;
    positionNamecard(card, event);
  };
  // A short grace period, the same shared delay dashboard-tooltip.mjs's bubble uses, rather
  // than an instant hide -- the cursor needs a moment to travel off one thin bar without the
  // card blinking shut and back on the next one.
  const hide = ({ immediate = false } = {}) => {
    if (isPinned() && !immediate) return;
    if (hideTimer) clearTimeout(hideTimer);
    const card = track.querySelector(".segcard");
    if (!card) return;
    if (immediate) {
      card.hidden = true;
      card.dataset.pinned = "false";
      if (pinnedSegment.get(track) === seg) pinnedSegment.delete(track);
      return;
    }
    hideTimer = setTimeout(() => { if (card.dataset.pinned !== "true") card.hidden = true; }, TOOLTIP_HIDE_DELAY_MS);
  };
  seg.addEventListener("pointerenter", show);
  seg.addEventListener("pointermove", show);
  seg.addEventListener("pointerleave", () => hide());
  seg.addEventListener("focus", show);
  seg.addEventListener("blur", () => hide());
  // Hover shows, click pins. A second click on the same segment lets go, and so does
  // Escape or a click anywhere else (releasePins, bound once at boot). This is also the
  // touch equivalent: a finger has no hover, so the tap has to hold the reading itself.
  seg.addEventListener("click", (event) => {
    event[PIN_HANDLED] = true;
    if (isPinned()) { hide({ immediate: true }); return; }
    event.preventDefault?.();
    releasePins();
    show(event);
    segmentReadout(track).dataset.pinned = "true";
    pinnedSegment.set(track, seg);
  });
  seg.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide({ immediate: true });
  });
}

function renderBars(phase) {
  const body = state.root.querySelector("#chapter-map .chapter__body");
  body.replaceChildren();
  const pathways = state.bundle.pathways || [];
  const allSteps = pathways.flatMap((p) => p.steps);

  const legend = el("div", "legend");
  legend.setAttribute("aria-label", `${STACK_LABELS[state.stack]} legend`);
  for (const category of STACKS[state.stack]) {
    const row = el("div", "legend__row");
    const swatch = el("span", "legend__swatch");
    swatch.style.background = `var(${category.token})`;
    row.append(swatch, el("span", "legend__name", category.label));
    legend.append(row);
  }
  if (allSteps.some((s) => s.schemaStatus === "ghost")) {
    const ghostRow = el("div", "legend__row");
    const ghostSwatch = el("span", "legend__swatch");
    ghostSwatch.style.background = "var(--ghost-wash)";
    ghostRow.append(ghostSwatch, el("span", "legend__name", "No schema yet"));
    legend.append(ghostRow);
  }
  // The grey band behind every bar had no entry here at all, which is most of why
  // readers guessed at it. It gets a swatch, a name, and the same readout the band
  // itself carries -- so the answer is one hover away from either mark.
  if (allSteps.some((s) => (s.allTimeCount || 0) > 0)) {
    const everRow = el("div", "legend__row");
    everRow.tabIndex = 0;
    const everSwatch = el("span", "legend__swatch legend__swatch--alltime");
    everRow.append(everSwatch, el("span", "legend__name", "Ever reached"));
    const everNote = "The grey band behind each bar is everyone who has ever stood on that step. The colour is who is standing there today; the grey beyond it has moved on or gone quiet.";
    everRow.setAttribute("aria-label", `Ever reached. ${everNote}`);
    bindSegmentReadout(everRow, legend, {
      label: "Ever reached", value: null, total: null, token: null, unit: "", note: everNote,
    });
    everRow.classList.add("has-readout");
    legend.append(everRow);
  }
  body.append(legend);
  if (state.stack === "state") {
    // Stacking by state, the legend has to say two things a colour cannot: each
    // step prints Rock's own column name for its rungs, and a rung Rock cannot
    // answer contributes no band -- it stays a `?` on the chips (ADR 0018).
    const ghostStates = allSteps.some((s) => (s.stateReadings || []).some((r) => r.schemaStatus === "ghost"));
    /* This paragraph is the one the operator named: it grew and shrank with
     * `ghostStates`, so a filter click resized the block and shoved the chart
     * below it. It rides the legend's own mark now, where it costs no layout. */
    const mark = proseMark(
      `Each bar splits by where its people sit on that step's ladder. The chips beside a step keep Rock's own column names, like "New Signup" and "Attended Session 1", and hovering a band shows them.${ghostStates ? " A rung Rock holds nothing for draws no band and stays a ? on the chips. That means reserved, not zero." : ""}`,
      "How to read the bars");
    if (mark) legend.append(mark);
  }

  // One shared scale: a bar of a given length means the same number of people in
  // every pathway on this page. Per-pathway scales would make Leadership readiness
  // look the size of Foundational.
  // The historical layer shares the live-bar scale. A long all-time ghost must
  // mean the same number of people anywhere on the map, too.
  const maxCount = Math.max(1, ...allSteps.flatMap((s) => [s.uniqueCount || 0, s.allTimeCount || 0]));

  for (const path of pathways) {
    const section = el("section", "pathway-section");
    section.dataset.pathId = path.id;
    const secHead = el("div", "pathway-section__head");
    const secName = el("h3", "pathway-section__name", path.label);
    secHead.append(secName);
    // A renamed pathway can lose the thing its old name said out loud. Where the
    // configuration carries that clarification, attach it to the heading as a hover readout
    // (#236/#252, hover-by-default) -- and keep it in the visible description too, because
    // DESIGN.md's floor is that hover carries the detail, never the only copy of it.
    if (path.note) {
      secName.tabIndex = 0;
      secName.setAttribute("aria-label", `${path.label}. ${path.note}`);
      bindSegmentReadout(secName, secHead, {
        label: path.label, value: null, total: null, token: null, unit: "", note: path.note,
      });
      secName.classList.add("has-readout");
    }
    secHead.append(el("span", "pathway-section__count", `${path.steps.length} steps`));
    secHead.style.position = "relative";
    section.append(secHead);
    const group = el("div", "pathgroup");
    group.append(el("p", "pathgroup__desc", path.description));
    const noteMark = path.note ? proseMark(path.note, `About ${path.label}`) : null;
    if (noteMark) group.append(noteMark);
    section.append(group);

    const list = el("ol", "pathmap");
    list.style.listStyle = "none";
    list.style.margin = "0";
    list.style.padding = "0";
    list.style.position = "relative";

    for (const step of path.steps) {
      const item = el("li", "step");
      item.dataset.stepId = step.id;
      const side = el("div", "step__side");
      const label = el("div", "step__label");
      label.append(el("span", "step__name", step.label));
      const persist = [step.persistence, step.optional ? "optional" : null, step.grain === "aggregate" ? "aggregate" : null].filter(Boolean).join(" · ");
      label.append(el("span", "step__persist", persist));
      side.append(label);
      /* The measured rungs used to be printed here as prose, every one of them,
       * on every step: "Signed up, not yet placed 795 · In a Connect Group 2,243"
       * and seventeen more like it down the page. The bar is stacked by state now
       * and the console filters by it, so the numbers are on the bar, in its hover
       * and in the pills -- reprinting them was a wall of text standing in for a
       * control.
       *
       * What survives is the half a bar cannot carry: a rung a step declares and
       * Rock cannot answer draws no segment, so without this line it would vanish
       * entirely and read as a step with fewer rungs rather than a step with an
       * unmeasured one. It stays a `?`, never a 0 (ADR 0018). */
      const states = el("div", "step__states");
      if (step.stateReadings) {
        for (const reading of step.stateReadings) {
          if (reading.schemaStatus !== "ghost") continue;
          const span = el("span", "step__state step__state--unknown");
          span.innerHTML = `${escapeText(reading.label)} <strong class="num">?</strong>`;
          const title = `${step.label} · ${reading.label}: no Rock schema yet. Reserved, not zero.${reading.note ? ` ${reading.note}` : ""}`;
          span.title = title;
          span.setAttribute("aria-label", title);
          states.append(span);
        }
      }
      if (step.campusNote) states.append(el("span", null, step.campusNote));
      side.append(states);
      item.append(side);

      const zone = el("div", "step__zone");
      if (step.schemaStatus === "ghost") {
        const track = el("div", "step__track step__track--ghost");
        item.classList.add("step--ghost");
        track.setAttribute("role", "img");
        track.setAttribute("aria-label", `${step.label} has no Rock schema yet`);
        const placeholderWidth = 35 + (hashUnit(step.id) * 30);
        const seg = el("span", "step__seg step__seg--pattern-diagonal");
        seg.style.width = `${placeholderWidth}%`;
        seg.title = `${step.label}: no Rock schema yet`;
        track.append(seg);
        track.append(el("span", "step__value step__value--unknown num", "?"), el("span", "step__ghostnote", step.ghostNote || "No Rock schema yet. Reserved, not zero."));
        zone.append(track);
      } else if (phase.pending) {
        /* The bar, and only the bar. The name, the persistence line, the ghost rungs and
         * the pathway heading beside it are all already true. The silhouette descends down
         * the path because a pathway narrows -- the shape of the station, not a reading. */
        const seat = path.steps.indexOf(step);
        const span = Math.max(1, path.steps.length - 1);
        zone.append(pendingBand(`${Math.round(88 - (seat / span) * 64)}%`));
      } else {
        const reading = barReading(step);
        const track = el("div", "step__track");
        track.setAttribute("role", "img");
        if (reading.kind === "aggregate") {
          paintFrontDoor(track, step, maxCount);
        } else if (reading.kind === "unavailable") {
          track.classList.add("step__track--unavailable");
          track.setAttribute("aria-label", `${step.label}: unavailable, ${reading.reason}`);
          const placeholderWidth = 40 + (hashUnit(step.id) * 35);
          const seg = el("span", "step__seg step__seg--pattern-diagonal");
          seg.style.width = `${placeholderWidth}%`;
          seg.title = `${step.label}: data pending (${reading.reason})`;
          track.append(seg);
          track.append(el("span", "step__value step__value--unknown num", "?"), el("span", "step__aggnote", reading.reason || "Live query pending · Reserved, not zero"));
        } else {
          /* All-time ghost bar: a translucent grey segment behind the coloured fill that
           * shows the cumulative historical pool at a glance. It stays visible even if
           * the current window is zero: absence now is not absence from the journey. */
          const canShowAllTime = step.allTimeCount != null
            && (step.persistence === "seasonal" || step.persistence === "current")
            && step.grain !== "aggregate"
            && step.allTimeCount > 0
            && phase.valuesOnly !== true
            && phase.pending !== true;
          if (canShowAllTime) {
            /* The grey band is the single most-misread mark on this page: readers
             * ask whether it means inactive, or pending, or an error. It means
             * neither -- it is everyone who has EVER stood on this step, drawn
             * behind everyone standing there today, so the colour is a share of
             * the grey and the gap between them is the people who have moved on.
             *
             * A native `title` was carrying that whole explanation, which meant
             * it appeared after a second, styled by the browser, and never at all
             * on touch. It now uses the same readout every other segment on this
             * page uses, and the band brightens and grows a cap as you arrive at
             * it, so the mark you are reading about is unmistakable.
             */
            const width = (step.allTimeCount / maxCount) * 94;
            const gap = Math.max(0, step.allTimeCount - (reading.total || 0));
            const ghostSeg = el("span", "step__seg step__seg--alltime");
            ghostSeg.style.width = `${width}%`;
            ghostSeg.tabIndex = 0;
            ghostSeg.setAttribute("role", "img");
            const allTimeNote = gap > 0
              ? `${formatCount(reading.total || 0)} of them are here today; ${formatCount(gap)} have moved on or gone quiet.`
              : `Everyone who has ever reached this step is still here today.`;
            ghostSeg.setAttribute("aria-label",
              `Everyone who has ever reached ${step.label}: ${formatCount(step.allTimeCount)} people. ${allTimeNote}`);
            bindSegmentReadout(ghostSeg, track, {
              label: `Ever reached ${step.label}`,
              value: step.allTimeCount,
              total: null,
              token: null,
              note: allTimeNote,
            });
            track.append(ghostSeg);
            // The cap is what makes the band findable when the gap is two people
            // wide: a 2px tick always sits at the all-time extent, and it is the
            // thing that extends on hover.
            const cap = el("span", "step__alltimecap");
            cap.style.left = `${width}%`;
            cap.setAttribute("aria-hidden", "true");
            track.append(cap);
          }
          if (reading.total === 0) {
            track.setAttribute("aria-label", `${step.label}: 0 people under the current filters${canShowAllTime ? `; ${formatCount(step.allTimeCount)} all-time` : ""}`);
            track.append(el("span", "step__zero num", "0 under these filters"));
          } else {
            track.setAttribute("aria-label", `${step.label}: ${formatCount(reading.total)} unique people`);
          if (phase.valuesOnly) {
            const seg = el("span", "step__seg");
            seg.style.background = "var(--rule)";
            seg.style.width = `${(reading.total / maxCount) * 94}%`;
            track.append(seg);
          } else {
            for (const part of reading.parts) {
              // Stacking by state, the honest name of a band is the name Rock's own
              // Kanban column carries on THIS step -- "Attended Session 1" on Build,
              // not the generic rung label the legend needs to reuse across steps.
              const local = reading.dim === "state" ? stateReadingFor(step, part.key) : null;
              const segLabel = local ? local.label : part.label;
              const seg = el("span", "step__seg");
              seg.style.background = `var(${part.token})`;
              seg.style.width = `${(part.value / maxCount) * 94}%`;
              seg.tabIndex = 0;
              seg.setAttribute("role", "img");
              seg.setAttribute("aria-label", `${segLabel}: ${formatCount(part.value)} of ${formatCount(reading.total)} in ${step.label}`);
              bindSegmentReadout(seg, track, {
                label: segLabel, value: part.value, total: reading.total, token: part.token,
                note: local
                  ? `${step.label} · ${part.label}${local.note ? ` · ${local.note}` : ""}`
                  : `${step.label} · by ${(STACK_LABELS[state.stack] || state.stack).toLowerCase()}`,
              });
              track.append(seg);
            }
          }
            const valueLabel = el("span", "step__value num", formatCount(reading.total));
            track.append(valueLabel);
          }
        }
        zone.append(track);
      }
      item.append(zone);
      list.append(item);
    }
    section.append(list);
    body.append(section);
  }

  const flowwrap = el("div", "flowwrap");
  flowwrap.id = "flowwrap";
  const flowHead = el("div", "flowwrap__head");
  flowHead.append(el("h3", null, "Person trajectories"));
  const flowMeta = el("span", "chapter__meta");
  /* The plot pans; the sentences under it do not. They used to live INSIDE the mount, which
   * meant dragging the field dragged the prose sideways with it and put 8px of the last line
   * outside a box that now clips rather than scrolls. They are siblings of the mount. */
  flowwrap.append(flowHead, el("p", "flowwrap__hint"), el("div", "flow__mount"), el("div", "flowwrap__notes"));
  flowHead.append(flowMeta);
  body.append(flowwrap);

  body.append(buildStepLedger(activePath(), phase.pending === true));
  // The chapter's export rail: same control group, same corner, exporting the same
  // live step table the Classic widget does. A DOM bar chart has no faithful image,
  // so PNG renders in the honest disabled form (plan §15).
  mountChapterRail("map", "pathway-steps", null);
}

function buildStepLedger(path, pending = false) {
  const details = el("details", "disclosure");
  details.append(el("summary", null, "Show the labelled step ledger"));
  const wrap = el("div", "tablewrap");
  const table = el("table");
  const caption = el("caption", null, "Every visible step with unique people, states, persistence, and freshness window. One person counts once per step.");
  const thead = el("thead");
  thead.innerHTML = "<tr><th scope='col'>Step</th><th scope='col' class='num'>Unique people</th><th scope='col'>States</th><th scope='col'>Persistence</th><th scope='col' class='num'>Window (days)</th></tr>";
  const tbody = el("tbody");
  for (const step of path.steps) {
    const tr = el("tr");
    /* Pending: the step name, its persistence and its window are configuration and stay.
     * The two measured columns shimmer rather than print a 0 or a `?` -- `?` means Rock
     * holds no schema for it, which is a different thing from "still reading" (ADR 0018). */
    if (pending) {
      tr.innerHTML = `<th scope='row'>${escapeText(step.label)}</th><td class='num'><span class='skeleton cellskel' aria-hidden='true'></span></td><td><span class='skeleton cellskel' aria-hidden='true'></span></td><td>${escapeText(step.persistence)}</td><td class='num'>${step.freshnessDays || "\u2014"}</td>`;
      tbody.append(tr);
      continue;
    }
    const states = step.stateReadings
      ? step.stateReadings.map((r) => `${r.label} ${r.count === null ? "?" : formatCount(r.count)}`).join(", ")
      : (step.states ? Object.entries(step.states).map(([k, v]) => `${k} ${formatCount(v)}`).join(", ") : (step.schemaStatus === "ghost" ? "no schema yet" : "aggregate signals"));
    tr.innerHTML = `<th scope='row'>${escapeText(step.label)}</th><td class='num'>${step.schemaStatus === "ghost" ? "no schema yet" : formatCount(step.uniqueCount)}</td><td>${escapeText(states)}</td><td>${escapeText(step.persistence)}</td><td class='num'>${step.freshnessDays || "—"}</td>`;
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  wrap.append(table);
  details.append(wrap);
  return details;
}

/* ---------------------------------------------------- trajectory overlay -- */

function drawTrajectories() {
  const mount = state.root.querySelector("#flowwrap .flow__mount");
  const hint = state.root.querySelector("#flowwrap .flowwrap__hint");
  const meta = state.root.querySelector("#flowwrap .chapter__meta");
  const notes = state.root.querySelector("#flowwrap .flowwrap__notes");
  if (!mount) return;
  mount.replaceChildren();
  if (notes) notes.replaceChildren();
  const path = activePath();
  const stepIndex = new Map(path.steps.map((s, i) => [s.id, i]));
  const people = filteredPeople()
    .map((person) => ({ ...person, moves: (person.trajectory || []).filter((t) => stepIndex.has(t.stepId)) }))
    .filter((person) => person.moves.length > 0);
  const authorized = state.bundle.meta?.personLayerAuthorized === true;
  const transitionsAvailable = state.bundle.meta?.queryAvailability?.["people-pathway-transitions"]?.status !== "unavailable";

  if (!authorized) {
    hint.textContent = "The staff-person read was refused or unavailable. No person is drawn, which is different from nobody moving; aggregate chapters remain independent.";
    meta.textContent = "person layer unavailable";
    return;
  }
  if (!transitionsAvailable) {
    hint.textContent = "The bounded transition read was refused or malformed. Current staff-person holdings may still feed dots, but no trajectory is drawn and missing movement isn't reported as zero.";
    meta.textContent = "transition layer unavailable";
    return;
  }
  const page = state.bundle.meta?.personPage;
  const transitionPage = state.bundle.meta?.transitionPage;
  /* An absence still speaks in the layout (the two branches above), but this is
   * an explanation, so it goes behind the mark. */
  hint.replaceChildren();
  const hintMark = proseMark(
    "Transitions only: skips show as jumps, and regressions keep their real dates. Marked columns are the dates carrying the most movement. This plot shows the rhythm of the whole page rather than one person; the freshness strips below are the per-person layer. It reads the first bounded person page and a bounded transition window, not an exhaustive population export.",
    "How to read the trajectories");
  if (hintMark) hint.append(hintMark);
  meta.textContent = `${people.length} ${people.length === 1 ? "person" : "people"} drawn · ${state.bundle.fictional ? "fictional people" : `first page, up to ${page?.limit || 2000} person rows and ${transitionPage?.limit || 5000} transitions`}`;

  const dates = people.flatMap((p) => p.moves.map((m) => m.date)).filter(Boolean).sort();
  if (dates.length === 0) { (notes || mount).append(el("p", "flowwrap__hint", "No dated transitions under the current filters.")); return; }
  // Domain: the movement that actually exists, not a fixed calendar window.
  // A trailing-12-months axis crushed every real transition into a single
  // column at "today", because migration only started weeks ago -- the plot
  // showed a date range instead of showing movement. The axis now fits the
  // observed span and says what span it is showing, so a short history reads
  // as a short history rather than as a vertical line.
  const DAY = 86400000;
  const observed = dates.map((iso) => new Date(iso).getTime()).filter((t) => Number.isFinite(t));
  const dataMin = Math.min(...observed);
  const dataMax = Math.max(...observed);
  // A single day of movement would otherwise divide by zero; give it a window
  // wide enough to read, centred on the day itself.
  const rawSpan = Math.max(dataMax - dataMin, 0);
  const pad = Math.max(rawSpan * 0.05, DAY);
  const t0 = dataMin - pad;
  const t1 = dataMax + pad;
  const spanDays = Math.max(1, Math.round((dataMax - dataMin) / DAY));
  const distinctDates = new Set(dates).size;
  const width = Math.max(720, mount.clientWidth || 720);
  const rowHeight = 38;
  // +18 of headroom for the event labels, so they never sit on the top edge.
  const height = path.steps.length * rowHeight + 58;
  const left = 12; const right = 24;
  const x = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return left;
    return left + Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))) * (width - left - right);
  };
  const y = (stepId) => 42 + stepIndex.get(stepId) * rowHeight;

  makeDragPannable(mount, "Person trajectories");
  const svg = svgEl("svg", { class: "flow__svg", viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": "Person trajectories across the ordered steps" });
  svg.style.width = `${width}px`;
  for (const step of path.steps) {
    svg.append(svgEl("line", { x1: left, x2: width - right, y1: y(step.id), y2: y(step.id), stroke: "var(--rule)", "stroke-dasharray": "1 5" }));
    const label = svgEl("text", { x: left, y: y(step.id) - 7, class: "flow__joint" });
    label.textContent = step.label;
    svg.append(label);
  }
  // Migration zone: everything at or before the cut-off, marked once, behind the
  // plot. Drawn before the dots so it reads as ground rather than as a mask.
  const cutoff = migrationThrough();
  const migrationT = cutoff ? new Date(cutoff).getTime() : NaN;
  const migrationX = cutoff ? x(cutoff) : left;
  const migrationVisible = Number.isFinite(migrationT) && migrationT > t0 && migrationX > left + 4;
  if (migrationVisible) {
    // A hatch reads as "different kind of time" the way the waterfall's ghost
    // bars do, and unlike a flat wash it survives being covered by the curves.
    const defs = svgEl("defs");
    const pattern = svgEl("pattern", {
      id: "pathways-migration-hatch", width: 14, height: 14,
      patternUnits: "userSpaceOnUse", patternTransform: "rotate(-45)",
    });
    pattern.append(svgEl("line", { class: "flow__migrationhatch", x1: 0, y1: 0, x2: 0, y2: 14 }));
    defs.append(pattern);
    svg.append(defs);

    const box = { x: left, y: 18, width: Math.max(0, migrationX - left), height: Math.max(0, height - 44) };
    svg.append(svgEl("rect", { class: "flow__migration", ...box }));
    svg.append(svgEl("rect", { ...box, fill: "url(#pathways-migration-hatch)", "pointer-events": "none" }));
    svg.append(svgEl("line", { class: "flow__migrationedge", x1: migrationX, x2: migrationX, y1: 18, y2: height - 26 }));
    // Label at the top of the band, where the event labels live, so it is always
    // on screen rather than tucked against the axis.
    const zoneLabel = svgEl("text", { x: left + 6, y: 11, class: "flow__migrationlabel" });
    zoneLabel.textContent = "Rock migration \u00b7 import dates, not movement";
    svg.append(zoneLabel);
  }

  const axisStart = svgEl("text", { x: left, y: height - 8, class: "flow__joint" });
  axisStart.textContent = formatDate(dates[0]);
  svg.append(axisStart);
  const axis = svgEl("text", { x: width - right, y: height - 8, class: "flow__joint", "text-anchor": "end" });
  axis.textContent = `${formatDate(dates[dates.length - 1])} · ${spanDays}-day span`;
  svg.append(axis);

  // Rock records a transition as a date, not a moment, and stage groups are
  // advanced in batches -- so hundreds of people share a handful of dates and
  // land on exactly the same pixel. Plotted raw that reads as a lattice of
  // identical dots: it hides how many people are in each cluster and looks like
  // a diagram rather than a population.
  //
  // Each person is given a fixed offset inside their own date-and-step cell,
  // seeded from their reference so a re-render never reshuffles them. The dot
  // stays inside its cell, so it never claims a date or a step it does not have;
  // it only stops pretending to be the only one there. Overlap then reads as
  // density, because the dots are translucent and pile up.
  const cellW = Math.min(26, (width - left - right) / Math.max(8, distinctDates)) * 0.42;
  const cellH = rowHeight * 0.30;
  const scatter = (ref, stepId, axis) => {
    const unit = hashUnit(`${ref}:${stepId}:${axis}`);
    return (unit - 0.5) * 2;
  };

  // This plot is a read-only picture of the rhythm, deliberately -- the one sanctioned
  // per-mark hover exception named in the 2026-09-02 operator ruling (#236/#252): every other
  // mark on this page defaults to hover, but a hover system on this one demonstrably breaks
  // the page, so it opts out and shows its value visibly instead (the event markers and the
  // sentence beneath the plot, both always on).
  //
  // Waking one person out of it used to attach six listeners to every line, hit
  // path and dot. At production scale that was ~7,000 elements and ~42,000
  // listeners, plus mix-blend-mode on every circle, and the page went blank.
  // Nobody was picking a stranger out of two thousand curves anyway. The
  // interrogable per-person layer is the freshness beeswarm, which is bounded
  // and stays hoverable; here the job is to show where to look.
  const layer = svgEl("g", { class: "flow" });
  const linePieces = new Map();
  const dotPieces = [];
  for (const person of people) {
    const points = person.moves.map((m) => ({
      px: x(m.date) + scatter(person.ref, m.stepId, "x") * cellW,
      py: y(m.stepId) + scatter(person.ref, m.stepId, "y") * cellH,
    }));
    if (points.length > 1) {
      // One path per polarity instead of one path per person: same picture,
      // three nodes instead of thousands.
      const lastKind = person.moves[person.moves.length - 1].kind;
      const bucket = kindClass(lastKind);
      const d = points.map((point, index) => {
        if (index === 0) return `M ${point.px.toFixed(1)} ${point.py.toFixed(1)}`;
        const prev = points[index - 1];
        const mx = ((prev.px + point.px) / 2).toFixed(1);
        return `C ${mx} ${prev.py.toFixed(1)}, ${mx} ${point.py.toFixed(1)}, ${point.px.toFixed(1)} ${point.py.toFixed(1)}`;
      }).join(" ");
      linePieces.set(bucket, (linePieces.get(bucket) || "") + d + " ");
    }
    for (const point of points) dotPieces.push(`M ${point.px.toFixed(1)} ${point.py.toFixed(1)} m -2.6 0 a 2.6 2.6 0 1 0 5.2 0 a 2.6 2.6 0 1 0 -5.2 0`);
  }
  for (const [bucket, d] of linePieces) {
    layer.append(svgEl("path", { d, class: `flow__line ${bucket}`, "aria-hidden": "true" }));
  }
  // Every transition dot as one filled path. 4,000 circles became one node.
  if (dotPieces.length) {
    layer.append(svgEl("path", { d: dotPieces.join(" "), class: "flow__dots", "aria-hidden": "true" }));
  }
  svg.append(layer);

  // Event markers: the dates worth looking at. A date carrying markedly more
  // movement than the rest is where a batch actually happened, and naming it is
  // more use than letting the reader hunt for the thickest column.
  const byDate = new Map();
  let migratedMoves = 0;
  for (const person of people) {
    for (const move of person.moves) {
      if (!move.date) continue;
      // A migration batch is an import, not a Sunday. Counting it here would
      // make the loudest marker on the plot the day the data was loaded.
      if (cutoff && move.date <= cutoff) { migratedMoves += 1; continue; }
      byDate.set(move.date, (byDate.get(move.date) || 0) + 1);
    }
  }
  const counts = [...byDate.values()];
  const mean = counts.reduce((sum, value) => sum + value, 0) / Math.max(1, counts.length);
  const sd = Math.sqrt(counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, counts.length));
  const events = [...byDate.entries()]
    .filter(([, count]) => count >= Math.max(mean + sd, 2))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .sort((left, right) => left[0].localeCompare(right[0]));

  const marks = svgEl("g", { class: "flow__events" });
  // Marked dates can sit days apart, and their labels then overprint into
  // nonsense. Every marker keeps its line and dot; a label is placed only where
  // there is room for it. Nothing is lost by dropping one: the sentence under
  // the plot names every marked date in full.
  let lastLabelX = -Infinity;
  for (const [iso, count] of events) {
    const mx = x(iso);
    marks.append(svgEl("line", { class: "flow__eventline", x1: mx, x2: mx, y1: 18, y2: height - 26 }));
    marks.append(svgEl("circle", { class: "flow__eventdot", cx: mx, cy: 18, r: 3.5 }));
    if (mx - lastLabelX >= 78) {
      const label = svgEl("text", { x: mx, y: 11, class: "flow__eventlabel", "text-anchor": "middle" });
      label.textContent = `${formatDate(iso).replace(/,\s*\d{4}$/, "")} · ${count}`;
      marks.append(label);
      lastLabelX = mx;
    }
  }
  svg.append(marks);
  mount.append(svg);

  if (events.length) {
    // The dates are the reading and stay on the page; why they are marked is an
    // explanation and goes behind the mark.
    const list = el("p", "flowwrap__events");
    list.textContent = `Marked ${events.length === 1 ? "date" : "dates"}: ${events
      .map(([iso, count]) => `${formatDate(iso)} (${count} ${count === 1 ? "move" : "moves"})`)
      .join(" · ")}`;
    const eventsMark = proseMark(
      "These dates carry more movement than the rest of the window, which usually means a batch was advanced that day.",
      "Why these dates are marked");
    if (eventsMark) list.append(eventsMark);
    (notes || mount).append(list);
  }
  if (migratedMoves > 0) {
    const zone = el("p", "flowwrap__migration");
    zone.textContent = `Shaded to ${formatDate(cutoff)}: the Rock migration window, ${formatCount(migratedMoves)} `
      + `${migratedMoves === 1 ? "transition" : "transitions"}`;
    const zoneMark = proseMark(
      `${migratedMoves === 1 ? "This transition carries" : "These transitions carry"} an import timestamp from when the schema was migrated, not the day the person moved. They are drawn because they are real records, and they are left out of the marked dates so a load batch is never read as ministry activity.`,
      "About the migration window");
    if (zoneMark) zone.append(zoneMark);
    (notes || mount).append(zone);
  }

}

/* The person card belongs to the page, not to a chapter.
 *
 * It used to be created inside the trajectory chapter's scroll mount, which
 * carries `overflow-x: auto`. CSS resolves the other axis of that to `auto` as
 * well, so the mount is a scroll container in both directions and an absolutely
 * positioned child placed over a freshness strip hundreds of pixels below it was
 * simply clipped away. The card was built, filled, and unhidden every time, and
 * the reader never saw one. getBoundingClientRect() reports the same rect either
 * way, which is why geometry checks called it fine.
 *
 * Mounted once on the island root and positioned in viewport coordinates, it can
 * be shown over any chapter, and re-rendering a chapter can no longer destroy it
 * mid-hover. */
function ensureNamecard() {
  const existing = document.getElementById("pathways-namecard");
  if (existing) return existing;
  if (!state.root) return null;
  const card = el("div", "namecard");
  card.hidden = true;
  card.id = "pathways-namecard";
  state.root.append(card);
  return card;
}

let sleepTimer = null;
const scheduleSleep = () => {
  clearTimeout(sleepTimer);
  const card = document.getElementById("pathways-namecard");
  if (card && card.dataset.sticky === "true") return;
  sleepTimer = setTimeout(sleepAll, 320);
};
const cancelSleep = () => clearTimeout(sleepTimer);

/* Waking a person used to re-toggle two classes on every dot in the chapter --
 * 2,071 of them on prod, measured at ~203ms of layout per pointer entry, which
 * is what made the swarm hover feel broken. The soundings are painted marks now,
 * so waking someone is a card plus a repaint of the one row under the pointer. */
function wakePerson(person, event, options = {}) {
  state.awakeRef = person.ref;
  renderNamecard(person, event, options);
  // Say the position first: it is what the card is for, and a screen-reader
  // reader should not have to sit through a movement count to hear it.
  const standings = personStandings(person);
  const where = standings.length
    ? standings.map((stand) => `${stand.stepLabel}, ${stand.rungLabel}${stand.days === null ? "" : `, ${stand.days} days`}`).join("; ")
    : "no recorded position on any step";
  announce(`${person.displayName}. ${where}. ${person.trajectory.length} transitions.`, { visible: false });
}

function sleepAll() {
  state.awakeRef = null;
  state.pinnedDot = null;
  const card = document.getElementById("pathways-namecard");
  if (card) { card.hidden = true; card.dataset.sticky = "false"; }
}

/* Profile cards on or off, from either of the two places that offer the switch.
 *
 * Both mounts are the same control, so neither can go stale against the other: every
 * `.cardswitch` on the page is repainted from the one piece of state. Turning cards
 * off releases whatever is open at that moment, because a reader reaching for this
 * switch is usually reaching for it BECAUSE a card is in their way. */
function setCards(next) {
  state.cards = Boolean(next);
  if (!state.cards) releasePins();
  writeHash();
  paintCardSwitches();
}

function paintCardSwitches() {
  if (!state.root) return;
  for (const btn of state.root.querySelectorAll(".cardswitch")) {
    btn.setAttribute("aria-pressed", String(state.cards));
    btn.dataset.on = String(state.cards);
    const label = btn.querySelector(".cardswitch__label");
    if (label) label.textContent = state.cards ? "Cards on" : "Cards off";
    btn.title = state.cards
      ? "Profile cards open on hover. Click one to keep it open."
      : "Profile cards stay closed. The plumb line and the day still read on hover.";
  }
}

/* One switch, mounted twice: in the filter console with the rest of the display
 * controls, and on the Freshness heading, which is the chapter the cards actually
 * belong to. A reader who wants them gone is looking at the beeswarm, not at the
 * console, so making them go and find it would be the wrong instrument. */
function cardSwitch(variant) {
  const btn = el("button", `cardswitch cardswitch--${variant}`);
  btn.type = "button";
  btn.dataset.on = String(state.cards);
  btn.setAttribute("aria-pressed", String(state.cards));
  const dot = el("span", "cardswitch__dot");
  dot.setAttribute("aria-hidden", "true");
  btn.append(dot, el("span", "cardswitch__label", state.cards ? "Cards on" : "Cards off"));
  btn.addEventListener("click", (event) => {
    event[PIN_HANDLED] = true;
    setCards(!state.cards);
  });
  return btn;
}

/* Stamped on a click a readout's own toggle has already dealt with, so the
 * document-level release below leaves that click alone. */
const PIN_HANDLED = Symbol("pathways.pinHandled");

/* One gesture for every readout on the island: hover shows it, click pins it, and
 * anything else lets go. Without a single release, a pin could only be undone by
 * finding the exact mark that opened it, which is how a helpful pin turns into a
 * tooltip that follows the reader around. */
function releasePins() {
  sleepAll();
  if (state.root) {
    for (const card of state.root.querySelectorAll('.segcard[data-pinned="true"]')) {
      card.dataset.pinned = "false";
      card.hidden = true;
    }
  }
  state.proseTips?.hide({ immediate: true });
}

/* Journey-ordered walk of the steps this person actually holds.
 *
 * `holdings` arrives in query order, which is not the order anyone walks a
 * pathway. Iterating the pathway definitions instead means the card reads top to
 * bottom in the same sequence as the map above it, and a person who appears on
 * three pathways gets all three, still in order. */
function personStandings(person) {
  const held = new Map();
  for (const holding of person.holdings || []) {
    // Last write wins per step: a person can carry more than one row for a step
    // and the latest rung is the one they are standing on.
    held.set(holding.stepId, holding);
  }
  const out = [];
  for (const pathway of state.bundle.pathways || []) {
    for (const step of pathway.steps) {
      const holding = held.get(step.id);
      if (!holding) continue;
      const reading = (step.stateReadings || []).find((r) => r.key === holding.stateKey);
      const rung = STATE.find((r) => r.key === holding.stateKey);
      const days = holding.sinceDate
        ? Math.max(0, Math.round((Date.now() - new Date(holding.sinceDate).getTime()) / 86400000))
        : null;
      out.push({
        stepId: step.id,
        stepLabel: step.label,
        // Rock's own column name for this rung wherever the step declares one --
        // the same contract the bars and the chips keep. The generic ladder word
        // is the fallback, never the preference.
        rungLabel: reading?.label || rung?.label || holding.stateKey,
        token: rung?.token || null,
        season: step.freshnessDays || 0,
        sinceDate: holding.sinceDate || null,
        days,
      });
    }
  }
  return out;
}

function renderNamecard(person, event, options = {}) {
  const card = ensureNamecard();
  if (!card) return;
  card.replaceChildren();
  const runtimePersonRef = Number.isSafeInteger(person.ref) && person.ref > 0 ? String(person.ref) : null;
  const profileHref = runtimePersonRef && !state.bundle.fictional ? `/Person/${encodeURIComponent(runtimePersonRef)}` : null;
  const name = el("p", "namecard__name");
  if (profileHref) {
    const link = el("a", null, person.displayName);
    link.href = profileHref;
    name.append(link);
  } else {
    name.textContent = person.displayName;
  }
  card.append(name);
  const lifecycle = LIFECYCLE.find((c) => c.key === person.lifecycle);
  card.append(el("p", "namecard__meta", `${lifecycle ? lifecycle.label : person.lifecycle} · ${person.gender} · ${AGE.find((a) => a.key === person.ageBand)?.label || person.ageBand}`));

  /* Where they stand.
   *
   * This is the card's reason to exist and it was the one thing missing: the
   * card listed a person's MOVEMENTS but never their POSITION, so it could tell
   * you someone entered Build in August and not that they are sitting on
   * "Attended Session 1" eighty days later. A pathway dashboard whose person
   * card cannot say where the person is on the pathway is answering the wrong
   * question.
   *
   * One row per step held, in journey order, each carrying Rock's own column
   * name for the rung and how long they have stood on it -- measured against
   * that step's own season, because eighty days means something different on a
   * 28-day step than on a 365-day one. */
  const standings = personStandings(person);
  if (standings.length) {
    card.append(el("p", "namecard__label", "Where they stand"));
    const list = el("dl", "namecard__stand");
    for (const stand of standings) {
      list.append(el("dt", null, stand.stepLabel));
      const dd = el("dd");
      const chip = el("span", "namecard__rung", stand.rungLabel);
      // The rung chip is tinted by the same token the bar segment uses, so the
      // colour a reader learned on the map means the same thing here.
      if (stand.token) {
        chip.style.background = `color-mix(in srgb, var(${stand.token}) 26%, transparent)`;
        chip.style.borderColor = `color-mix(in srgb, var(${stand.token}) 60%, transparent)`;
      }
      dd.append(chip);
      if (stand.days === null) {
        // ADR 0018: Rock holds no date for this holding. `?`, never a zero and
        // never an invented duration.
        const ghost = el("span", "namecard__ghost", "?");
        const title = `${stand.stepLabel}: Rock records the rung but no date, so there is nothing to age. Reserved, not zero.`;
        ghost.title = title;
        ghost.setAttribute("aria-label", title);
        dd.append(ghost);
      } else {
        const fact = stand.season > 0
          ? `${formatCount(stand.days)} days · ${bandLabel(stand.days, stand.season)}`
          : `${formatCount(stand.days)} days`;
        const span = el("span", "namecard__fact", fact);
        if (stand.season > 0 && stand.days >= stand.season) span.classList.add("is-past");
        dd.append(span);
      }
      list.append(dd);
    }
    card.append(list);
  }

  if ((person.trajectory || []).length) {
    card.append(el("p", "namecard__label", "How they got here"));
    const seq = el("ol", "namecard__seq");
    const stepLabel = (id) => {
      for (const pathway of state.bundle.pathways) {
        const step = pathway.steps.find((s) => s.id === id);
        if (step) return step.label;
      }
      return id;
    };
    /* Two sources can record the same fact -- a completion written by the step
     * itself and again by the programme that owns it -- and the card then said
     * "COMPLETED Favor DNA Jul 13, 2026" twice in a row, which reads as two
     * separate events to someone scanning a history. Identical (kind, step,
     * date) is one move; keep the first and drop the echo. Two real moves of
     * the same kind on the same step on different days both survive. */
    const seen = new Set();
    for (const move of person.trajectory) {
      const fingerprint = `${move.kind}|${move.stepId}|${move.date}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const li = el("li");
      li.append(el("span", `namecard__kind ${kindClass(move.kind)}`, KIND_LABELS[move.kind] || move.kind));
      li.append(el("span", null, stepLabel(move.stepId)));
      li.append(el("span", "namecard__date", formatDate(move.date)));
      seq.append(li);
    }
    card.append(seq);
  }

  if (profileHref) {
    const go = el("a", "namecard__go", "Open profile →");
    go.href = profileHref;
    card.append(go);
  } else {
    card.append(el("p", "namecard__inert", state.bundle.meta?.profileNote || "Profile links activate on Rock."));
  }
  card.hidden = false;
  card.dataset.sticky = options.sticky ? "true" : "false";
  card.onmouseenter = cancelSleep;
  card.onmouseleave = scheduleSleep;
  positionNamecard(card, event);
}

/* Everything here is viewport space, because the card is `position: fixed` on the
 * island root rather than absolute inside a chapter. That is the frame the reader
 * is actually in: it knows where the screen ends, it does not move when a chapter
 * scrolls under it, and no ancestor's overflow can clip it. */
function positionNamecard(card, event) {
  const pointerViewportX = event?.clientX ?? 40;
  const cardWidth = card.offsetWidth;
  card.style.left = `${Math.max(8, Math.min(pointerViewportX + 14, window.innerWidth - cardWidth - 8))}px`;
  /* The card now carries a person's whole standing, so it is tall enough to run
   * off the bottom of the window. Flip it above the pointer when it would, and
   * only then -- a card that always sat above would cover the strip the reader
   * is sweeping. Measured against the viewport rather than the mount, because
   * the mount is the full scroll height and would never report an overflow. */
  const cardHeight = card.offsetHeight;
  const pointerViewportY = event?.clientY ?? 40;
  const flip = cardHeight + 18 > window.innerHeight - pointerViewportY;
  const wanted = flip ? pointerViewportY - cardHeight - 12 : pointerViewportY + 10;
  /* Then clamp in viewport space, which is the only frame that knows where the
   * screen ends. Flipping alone is not enough: a card taller than the room above
   * the mark simply moved the overflow from the bottom of the window to the top,
   * and the reader saw a card cut off at the header instead. The card's own
   * max-height keeps it inside 80vh, so a fit always exists.
   *
   * The ceiling is Rock's fixed nav, not the window: clamping to the window put
   * the card's name and first standing underneath the orange bar in production
   * while the workbench, which has no chrome, looked perfect. --console-top is
   * the same measured offset the sticky console clears itself with. */
  const ceiling = Number.parseFloat(
    getComputedStyle(state.root || document.documentElement)
      .getPropertyValue("--console-top")) || 8;
  const top = Math.min(
    Math.max(wanted, ceiling),
    Math.max(ceiling, window.innerHeight - cardHeight - 8));
  card.style.top = `${top}px`;
}

/* -------------------------------------------------------------- waterfall -- */

/* Movement provenance. A ghost bar has to answer two questions to be worth
 * drawing: what would be here, and why is it not. Both answers are per kind,
 * so they live beside the kinds rather than in one paragraph above the chart.
 */
const KIND_SOURCES = Object.freeze({
  entered: { what: "Arrived at a step for the first time.", source: "Stage signup groups, Connect Group and Serving arrivals, and new board cards." },
  progressed: { what: "Moved forward within a step's sessions.", source: "Build and Favor DNA session groups." },
  completed: { what: "Finished a step.", source: "Graduate groups, and the CLT workflow's completion timestamp." },
  unfinished: { what: "Left a step without finishing it.", source: "Board cards moved to the Inactive connection state." },
  "became-leader": { what: "Appointed to a leader role.", source: "A leader-flagged Group Type Role arriving on Connect Group or Serving." },
  "leadership-prep": { what: "Started leadership preparation.", source: "The Connect Leadership Training workflow being initiated." },
  resumed: { what: "Came back to a step after going quiet.", source: "Needs last Sunday's membership to compare against. No snapshot exists yet." },
  stalled: { what: "Stopped moving without any record of leaving.", source: "Needs last Sunday's membership to compare against. No snapshot exists yet." },
  regressed: { what: "Fell back to an earlier step.", source: "Needs last Sunday's step position to compare against. No snapshot exists yet." },
});
const SNAPSHOT_REASON = "Rock stores current membership, not history: there's no record of who stood where last Sunday. Until step membership is snapshotted weekly, this row can't be counted, and an uncounted row isn't a zero.";

function renderWaterfall() {
  const body = state.root.querySelector("#chapter-wf .chapter__body");
  const meta = state.root.querySelector("#chapter-wf .chapter__meta");
  body.replaceChildren();
  const wf = state.bundle.waterfall;
  if (!wf) {
    body.append(el("p", "chapter__what", "Movement is unavailable because the registered aggregate read was refused or malformed. Unavailable isn't zero."));
    mountChapterRail("wf", "movement", null);
    return;
  }
  meta.textContent = wf.compareDate ? `vs ${formatDate(wf.compareDate)}` : "comparison date unavailable";
  if (wf.status === "partial") {
    renderPartialWaterfall(body, wf);
    // A partial waterfall draws DOM ghost rows rather than the SVG, so there is no
    // faithful image to save and the PNG control stays in its disabled form.
    mountChapterRail("wf", "movement", null);
    return;
  }
  if (activeFilterDimensions().length > 0) {
    const notice = el("p", "focus-notice");
    notice.textContent = "Full population shown. Movement under your focus filters needs a live query; this bundle will not guess it.";
    body.append(notice);
  }

  const rows = [
    { label: wf.anchorBeforeLabel, value: wf.anchorBefore, anchor: true },
    ...wf.movements,
    { label: wf.anchorNowLabel, value: wf.anchorNow, anchor: true },
  ];
  const width = 860; const rowH = 34; const gap = 10;
  const height = rows.length * (rowH + gap) + 30;
  const labelW = 190; const valueW = 90;
  const plotW = width - labelW - valueW;
  const maxAnchor = Math.max(wf.anchorBefore, wf.anchorNow, 1);
  const maxDelta = Math.max(...wf.movements.map((m) => Math.abs(m.delta)), 1);
  const anchorScale = (v) => (v / maxAnchor) * plotW * 0.92;
  const deltaScale = (v) => (Math.abs(v) / maxDelta) * (plotW / 2) * 0.85;
  const mid = labelW + plotW / 2;

  const wrap = el("div", "waterfall");
  const svgwrap = el("div", "wf__svgwrap");
  const svg = svgEl("svg", { class: "wf__svg", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Movement waterfall since last Sunday; exact values in the ledger below" });
  svg.append(svgEl("line", { class: "wf__axisline", x1: mid, x2: mid, y1: 6, y2: height - 24 }));

  let runningEdge = null;
  rows.forEach((row, index) => {
    const top = 10 + index * (rowH + gap);
    const label = svgEl("text", { x: labelW - 10, y: top + rowH / 2 + 4, "text-anchor": "end", class: row.anchor ? "wf__anchor-label" : "wf__label" });
    label.textContent = row.label;
    svg.append(label);
    if (row.anchor) {
      const w = anchorScale(row.value);
      svg.append(svgEl("rect", { class: "wf__bar", x: labelW, y: top, width: w, height: rowH, fill: "var(--move-neutral)", opacity: "0.55" }));
      const value = svgEl("text", { x: labelW + w + 8, y: top + rowH / 2 + 4, class: "wf__value" });
      value.textContent = formatCount(row.value);
      svg.append(value);
      runningEdge = { x: labelW + w, y: top + rowH };
    } else {
      const w = deltaScale(row.delta);
      const gain = row.delta >= 0;
      const fill = gain ? "var(--move-gain)" : (STALL_KINDS.has(row.kind) ? "var(--move-stalled)" : "var(--move-loss)");
      const barX = gain ? mid : mid - w;
      const rect = svgEl("rect", { class: "wf__bar", x: barX, y: top, width: Math.max(2, w), height: rowH, fill });
      const title = svgEl("title");
      title.textContent = `${row.label}: ${gain ? "+" : "−"}${Math.abs(row.delta)}${row.affectsTotal ? "" : " (within-path movement, doesn't change the total)"}`;
      rect.append(title);
      svg.append(rect);
      const value = svgEl("text", { x: gain ? mid + w + 8 : mid - w - 8, y: top + rowH / 2 + 4, "text-anchor": gain ? "start" : "end", class: "wf__value" });
      value.textContent = `${gain ? "+" : "−"}${formatCount(Math.abs(row.delta))}${row.affectsTotal ? "" : " · within"}`;
      svg.append(value);
      if (runningEdge) svg.append(svgEl("line", { class: "wf__connector", x1: labelW, x2: width - valueW, y1: top - gap / 2, y2: top - gap / 2 }));
    }
  });
  svgwrap.append(svg);
  makeDragPannable(svgwrap, "Movement waterfall");
  wrap.append(svgwrap);

  const totalDelta = wf.movements.filter((m) => m.affectsTotal).reduce((sum, m) => sum + m.delta, 0);
  const reconciles = wf.anchorBefore + totalDelta === wf.anchorNow;
  const recon = el("p", `wf__recon ${reconciles ? "is-ok" : "is-broken"}`);
  recon.innerHTML = reconciles
    ? `Reconciliation <strong>holds</strong>: ${formatCount(wf.anchorBefore)} ${escapeText(wf.anchorBeforeLabel.toLowerCase())} ${totalDelta >= 0 ? "+" : "−"} ${formatCount(Math.abs(totalDelta))} net movement = ${formatCount(wf.anchorNow)} now. Within-path movements shift bars without changing the total.`
    : `Reconciliation <strong>broken</strong>: ${formatCount(wf.anchorBefore)} + ${formatCount(totalDelta)} ≠ ${formatCount(wf.anchorNow)}. This is a defect, never a rounding note.`;
  wrap.append(recon);
  body.append(wrap);

  const details = el("details", "disclosure");
  details.append(el("summary", null, "Show the labelled movement ledger"));
  const twrap = el("div", "tablewrap");
  const table = el("table");
  table.innerHTML = "<caption>Movement since last Sunday by kind. Signed values; within-path movements are marked.</caption><thead><tr><th scope='col'>Movement</th><th scope='col' class='num'>People</th><th scope='col'>Counts toward total</th></tr></thead>";
  const tbody = el("tbody");
  for (const move of wf.movements) {
    const tr = el("tr");
    tr.innerHTML = `<td>${escapeText(move.label)}</td><td class='num'>${move.delta >= 0 ? "+" : "−"}${formatCount(Math.abs(move.delta))}</td><td>${move.affectsTotal ? "yes" : "within-path"}</td>`;
    tbody.append(tr);
  }
  table.append(tbody);
  twrap.append(table);
  details.append(twrap);
  body.append(details);
  mountChapterRail("wf", "movement", movementPng);
}


/* The partial waterfall used to be a warning paragraph and a table, which told
 * the reader that something was missing without showing them the shape of it.
 * Draw the chart instead: counted movements as real bars, everything the schema
 * cannot answer yet as a ghost bar carrying a question mark. A ghost reserves
 * the row -- it is visibly not a zero -- and its readout says what the row
 * would mean and which Rock source would fill it.
 */
function renderPartialWaterfall(body, wf) {
  const observed = wf.movements.filter((move) => move.delta !== null && move.delta !== undefined);
  const maxDelta = Math.max(...observed.map((move) => Math.abs(move.delta)), 1);

  const wrap = el("div", "waterfall waterfall--partial");
  const chart = el("div", "wfghost");

  const anchorRow = (label, note) => {
    const row = el("div", "wfghost__row wfghost__row--anchor");
    row.append(el("span", "wfghost__label", label));
    const rail = el("div", "wfghost__rail wfghost__rail--anchor");
    const ghost = el("span", "wfghost__bar wfghost__bar--ghost is-total");
    ghost.style.width = "62%";
    ghost.tabIndex = 0;
    ghost.setAttribute("role", "img");
    ghost.setAttribute("aria-label", `${label}: unavailable. ${note}`);
    bindSegmentReadout(ghost, rail, { label, value: null, total: null, token: null, unit: "", note });
    rail.append(ghost);
    row.append(rail);
    row.append(el("span", "wfghost__value wfghost__value--unknown num", "?"));
    return row;
  };

  chart.append(anchorRow(wf.anchorBeforeLabel, SNAPSHOT_REASON));

  for (const move of observed) {
    const meaning = KIND_SOURCES[move.kind] || {};
    const row = el("div", "wfghost__row");
    row.append(el("span", "wfghost__label", move.label));
    const rail = el("div", "wfghost__rail");
    const gain = move.delta >= 0;
    const bar = el("span", `wfghost__bar ${gain ? "is-gain" : (STALL_KINDS.has(move.kind) ? "is-stalled" : "is-loss")} ${gain ? "is-plus" : "is-minus"}`);
    bar.style.width = `${Math.max(3, (Math.abs(move.delta) / maxDelta) * 46)}%`;
    bar.tabIndex = 0;
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${move.label}: ${gain ? "plus" : "minus"} ${Math.abs(move.delta)} people. ${meaning.what || ""}`);
    bindSegmentReadout(bar, rail, {
      label: move.label,
      value: Math.abs(move.delta),
      total: null,
      token: gain ? "--move-gain" : (STALL_KINDS.has(move.kind) ? "--move-stalled" : "--move-loss"),
      note: `${meaning.what || ""} Source: ${meaning.source || "registered movement rows."}`,
    });
    rail.append(bar);
    row.append(rail);
    row.append(el("span", "wfghost__value num", `${gain ? "+" : "−"}${formatCount(Math.abs(move.delta))}`));
    chart.append(row);
  }

  for (const kind of wf.unavailableKinds) {
    const meaning = KIND_SOURCES[kind] || {};
    const label = KIND_LABELS[kind] || kind;
    const row = el("div", "wfghost__row");
    row.append(el("span", "wfghost__label wfghost__label--ghost", label));
    const rail = el("div", "wfghost__rail");
    const negative = LOSS_KINDS.has(kind) || STALL_KINDS.has(kind);
    const ghost = el("span", `wfghost__bar wfghost__bar--ghost ${negative ? "is-minus" : "is-plus"}`);
    // A stable width per kind: a ghost must not imply a magnitude, but a row of
    // identical placeholders reads as a loading state rather than a reservation.
    ghost.style.width = `${16 + hashUnit(kind) * 18}%`;
    ghost.tabIndex = 0;
    ghost.setAttribute("role", "img");
    ghost.setAttribute("aria-label", `${label}: not counted yet. ${meaning.what || ""} ${meaning.source || ""}`);
    bindSegmentReadout(ghost, rail, {
      label, value: null, total: null, token: null, unit: "",
      note: `${negative ? "Counts against the total. " : ""}${meaning.what || ""} ${meaning.source || ""}`,
    });
    rail.append(ghost);
    row.append(rail);
    row.append(el("span", `wfghost__value wfghost__value--unknown num ${negative ? "is-minus" : ""}`, negative ? "−?" : "?"));
    chart.append(row);
  }

  chart.append(anchorRow(wf.anchorNowLabel, SNAPSHOT_REASON));
  wrap.append(chart);

  const legend = el("p", "wfghost__legend");
  const legendMark = proseMark(
    "Bars hang off the centre axis: gains to the right, losses to the left, so a reserved regression still reads as a subtraction. Hatched rows are reserved, not zero: the movement is real, the count is not recorded yet. Hover or focus any row for what it means and which Rock source feeds it.",
    "How to read the movement bars");
  if (legendMark) legend.append(legendMark);
  wrap.append(legend);
  body.append(wrap);
}

/* --------------------------------------------------------------- soundings --
 * A beeswarm is a density distribution, and the aggregate freshness bins are
 * already exactly that -- with the true population behind them, which the
 * bounded person read never has. So the crowd is expanded from bins: a bin of
 * N at 18-35 days becomes N dots spread across that span, packed by collision
 * dodge rather than scattered by random jitter, so a pile-up means density and
 * nothing else. */

const DOT_R = 3;
const DOT_GAP = 0.9;

function staleHex(days, windowDays, tones) {
  if (days >= windowDays * 2) return tones.loss;
  if (days >= windowDays) return tones.stalled;
  return tones.gain;
}

/* Expand bins into individual soundings at deterministic x. */
/* Days a person has stood at a step, or null when the bundle has no date for
 * them there. Returns a number, never a person: the person-storage boundary is
 * that nothing in this module retains a person record, and a helper that hands
 * back a scalar is how the swarm honours it while still being computed twice.
 */
function stepDays(person, stepId, today) {
  // A state focus narrows this strip to the rung it names, per step, exactly as
  // it narrows the bar above -- a person can be 'completed' on Build and
  // 'enrolled' on Grow, so the filter has to be answered against the holding at
  // THIS step rather than against the person as a whole.
  const wanted = state.filters.state;
  const holdings = (person.holdings || []).filter((item) => item.stepId === stepId
    && (!wanted.size || wanted.has(item.stateKey)));
  if (wanted.size && !holdings.length) return null;
  const holding = [...holdings].reverse().find((item) => item.sinceDate);
  const move = wanted.size ? null : [...(person.trajectory || [])].reverse().find((item) => item.stepId === stepId && item.date);
  const sinceDate = holding?.sinceDate || move?.date;
  if (!sinceDate) return null;
  return Math.max(0, Math.round((today - new Date(sinceDate).getTime()) / 86400000));
}

/* One point list for the whole strip: the people this page can name and the
 * people it cannot, placed by the same rule and drawn in the same pass.
 *
 * They used to be two layers. The named ones were absolutely-positioned DOM
 * buttons pinned to `top: 50%`, so a step with 1,102 nameable people drew 1,102
 * twelve-pixel circles along a single horizontal line -- an opaque rope, sitting
 * on top of and completely hiding the density canvas the chapter exists to show.
 * Hovering one of them re-toggled two classes on all 2,071 dots in the chapter,
 * measured at ~203ms of layout per pointer entry: the hover felt broken because
 * it was. Both problems are the same problem, and merging the layers fixes both.
 *
 * A named person still resolves to their own namecard and profile link; the
 * difference is that a mark now sits where its density says it sits, and the
 * pointer resolves it through one hit-test instead of one DOM node per person.
 */
/* Resolve a named sounding back to the person it stands for.
 *
 * The geometry layer holds an index, never a record: nothing on this island
 * retains a person object past the render that produced it (see stepDays). The
 * index is into the same deterministic order the row was built from -- filtered
 * people, in bundle order, keeping only those the step can date -- so recomputing
 * it here costs one bounded pass and cannot drift from what was drawn. */
function soundingPerson(entry, dot) {
  if (!dot || (dot.namedIdx ?? -1) < 0) return null;
  const today = Date.now();
  let seen = 0;
  for (const person of filteredPeople()) {
    if (stepDays(person, entry.stepId, today) === null) continue;
    if (seen === dot.namedIdx) return person;
    seen += 1;
  }
  return null;
}

function swarmPlacements(row, spanDays, named = []) {
  const points = [];
  // Every named person the page CAN identify is drawn from their own exact
  // date. Expanding the full aggregate count as well would draw them twice --
  // once as themselves and once as an anonymous sounding somewhere else -- so
  // their bin gives up one seat each and the canvas holds exactly the remainder.
  const claimed = new Map();
  for (let idx = 0; idx < named.length; idx += 1) {
    const entry = named[idx];
    points.push({ days: entry.days, xFrac: Math.min(0.995, entry.days / spanDays), namedIdx: idx });
    for (const bin of row.densityBins || []) {
      const to = Math.max(bin.toDays, bin.fromDays + 1);
      if (entry.days >= bin.fromDays && entry.days <= to) {
        claimed.set(bin.fromDays, (claimed.get(bin.fromDays) || 0) + 1);
        break;
      }
    }
  }
  for (const bin of row.densityBins || []) {
    const count = Math.max(0, (bin.count || 0) - (claimed.get(bin.fromDays) || 0));
    const from = bin.fromDays;
    const to = Math.max(bin.toDays, bin.fromDays + 1);
    for (let i = 0; i < count; i += 1) {
      // Deterministic spread across the bin: stable across re-renders, and
      // evenly covering the bin rather than clumping at its edge.
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const wobble = (hashUnit(`${row.stepId}:${from}:${i}`) - 0.5) * 0.6;
      const days = from + (to - from) * Math.min(1, Math.max(0, t + wobble / count));
      points.push({ days, xFrac: Math.min(0.995, days / spanDays), namedIdx: -1 });
    }
  }
  points.sort((a, b) => a.xFrac - b.xFrac);
  return points;
}

/* Vertical collision dodge, symmetric about the centreline.
 *
 * The dot radius is derived per row rather than fixed: a dense row saturates a
 * fixed radius, every column hits the ceiling, and the swarm flattens into a
 * brick that shows no density at all -- the one thing it exists to show. Sizing
 * the dot so the busiest column just fits keeps the silhouette honest. */
/* One radius for the whole chapter, sized off the busiest column. Per-row
 * sizing would make a sparse row's dots larger than a crowded row's, and then
 * dot size -- the one thing that should mean nothing here -- would read as
 * meaning something. */
function globalSwarmRadius(entries) {
  let busiest = 1;
  for (const entry of entries) {
    const width = Math.max(1, entry.canvas.getBoundingClientRect().width);
    const columns = new Map();
    for (const point of entry.points) {
      const key = Math.floor((point.xFrac * width) / 4);
      columns.set(key, (columns.get(key) || 0) + 1);
    }
    const rowPeak = Math.max(1, ...columns.values());
    entry.peak = rowPeak;
    busiest = Math.max(busiest, rowPeak);
  }
  for (const entry of entries) entry.peak = busiest;
  // Dots overlap by design, so the radius is not "height / stack": it only has
  // to stay readable as a mark.
  return busiest > 40 ? 2.6 : busiest > 18 ? 3.2 : 4;
}

/* Column occupancy, used to decide how far a column has to spread. */
function columnCounts(points, width, radius) {
  const counts = new Map();
  const bucket = Math.max(2, radius * 1.5);
  for (const point of points) {
    const key = Math.floor((point.xFrac * width) / bucket);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { counts, bucket };
}

/* Density scatter, centre-weighted.
 *
 * A strict non-overlapping pack draws tidy rows of separate circles, which is
 * not what a SHAP swarm looks like and not how density reads. Dots are allowed
 * to overlap here, biased toward the centreline, with the spread growing as the
 * square root of the column's population -- so a busy column is a thick, bright
 * lens and a lone person is one dim dot on the line. Brightness does the rest,
 * additively, in paintSwarm. */
function scatterSwarm(points, width, height, radius, peak) {
  const { counts, bucket } = columnCounts(points, width, radius);
  const maxOffset = height / 2 - radius - 1;
  const seen = new Map();
  const placed = [];
  for (const point of points) {
    const x = point.xFrac * width;
    const key = Math.floor(x / bucket);
    const n = counts.get(key) || 1;
    const i = seen.get(key) || 0;
    seen.set(key, i + 1);

    // Spread is normalised against the busiest column in the chapter, so the
    // densest shoal fills its band and every other column is a true relative
    // fraction of it. sqrt keeps a column of 2 from vanishing next to 140.
    const spread = maxOffset * Math.min(1, Math.sqrt(n) / Math.sqrt(peak));
    // Deterministic, centre-weighted: two hashes averaged approximate a
    // triangular distribution, which piles at the middle and thins at the edge.
    const h1 = hashUnit(`${point.days.toFixed(2)}:${key}:${i}:a`);
    const h2 = hashUnit(`${point.days.toFixed(2)}:${key}:${i}:b`);
    const centred = (h1 + h2) - 1;
    // `depth` is how many people share this column. The paint needs it to pick a
    // per-dot alpha that cannot clip (see paintSwarm).
    placed.push({ x, y: centred * spread, days: point.days, depth: n, namedIdx: point.namedIdx ?? -1 });
  }
  return placed;
}

/* Column index for the hit-test. Scanning every sounding on every pointermove is
 * 3,900 distance tests per event on Connect Group; bucketing by column turns the
 * search into the handful of marks actually under the pointer. */
function indexPlacements(placed, bucket) {
  const index = new Map();
  for (let i = 0; i < placed.length; i += 1) {
    const key = Math.floor(placed[i].x / bucket);
    let cell = index.get(key);
    if (!cell) { cell = []; index.set(key, cell); }
    cell.push(i);
  }
  return index;
}


/* ------------------------------------------------------- sounding hit-test --
 * Every dot on the canvas is hoverable, but only some of them are a person we
 * can name. The crowd is expanded from aggregate density bins, which carry a
 * count and no identity: the person read is bounded by stepLimit and gated by
 * authorization, so most soundings have no record behind them. Hovering one
 * therefore reports what is actually true about it -- its step, its exact
 * season-relative age, and its band -- and says plainly that it is one of N at
 * that depth rather than inventing a name for it. A sounding that does coincide
 * with someone from the bounded read resolves to that person and their full
 * namecard, the same as the ringed dots. */

function nearestSounding(entry, x, y) {
  const placed = entry.placed || [];
  const index = entry.index;
  const bucket = entry.bucket || 12;
  // A named mark is drawn larger and is the one worth catching, so it reaches a
  // little further than an anonymous sounding. Both stay small enough that the
  // pointer resolves what is under it rather than what is merely nearby.
  const reach = (entry.radius || 3) + 4;
  // A nameable mark reaches much further than an anonymous sounding. It is the
  // one mark on the strip that can answer a question, and at rest it now looks
  // like every other mark, so the pointer has to do the finding. Anonymous
  // soundings keep the tight radius: near a named person, the reader wants the
  // person.
  //
  // The reach is generous on purpose. Only a minority of soundings are in the
  // bounded person read -- 16 of 163 on Build -- so at a tight radius the full
  // card is a lottery the reader loses most of the time, which reads as "the
  // hover cards don't work". At 32px a sweep along a row finds the people in it.
  // It never invents one: with no named mark in range the reader still gets the
  // anonymous sounding under the pointer, which says outright that this person
  // is not in the named read.
  const namedReach = reach + 32;
  let best = null;
  let bestScore = Infinity;
  const consider = (i) => {
    const dot = placed[i];
    if (!dot) return;
    const dx = dot.x - x;
    const dy = (entry.mid + dot.y) - y;
    const limit = dot.namedIdx >= 0 ? namedReach : reach;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > limit) return;
    // A person outranks an anonymous sounding at the same distance: the named
    // mark is the one that can answer a question when you click it.
    const score = dist - (dot.namedIdx >= 0 ? namedReach : 0);
    if (score < bestScore) { bestScore = score; best = dot; }
  };
  if (index) {
    const key = Math.floor(x / bucket);
    for (let k = key - 1; k <= key + 1; k += 1) {
      for (const i of index.get(k) || []) consider(i);
    }
  } else {
    for (let i = 0; i < placed.length; i += 1) consider(i);
  }
  return best;
}

/* ---------------------------------------------------------- the plumb line --
 *
 * The chapter is called Soundings, and taking a sounding is the interaction: you
 * lower a line at a chosen depth and read what is down there. Until now hovering
 * a shoal produced a card out of nowhere with no mark on the strip, so a reader
 * could not tell which of two thousand dots the card was about -- the #235
 * complaint, still open, that "a circle highlights on interaction and does
 * nothing".
 *
 * So the hover draws the instrument. A hairline drops through the strip at the
 * pointer's day and carries that day at the floor; the 14-day band it lands in
 * lifts out of the ground behind the dots; and the sounding under the cursor
 * takes a ring that opens from the mark over ~140ms. Everything is painted on a
 * second canvas over the density, so a hover costs one rAF repaint of one row
 * instead of the ~203ms of layout that re-styling every dot in the chapter used
 * to cost.
 */
const SOUNDING_RING_MS = 140;

function paintSounding(entry) {
  const overlay = entry.overlay;
  if (!overlay) return;
  const fit = fitCanvas(overlay);
  if (!fit) return;
  const { ctx, width, height } = fit;
  const cursor = entry.cursor;
  if (!cursor) return;
  const tones = entry.tones || {};
  const mid = entry.mid ?? height / 2;

  // 1. The band the pointer is standing in, lifted out of the ground. This is
  //    what turns a smear into a reading: you can see the 14 days you are on.
  if (cursor.band) {
    const x0 = (cursor.band.fromDays / entry.spanDays) * width;
    const x1 = Math.min(width, ((cursor.band.toDays + 1) / entry.spanDays) * width);
    ctx.globalAlpha = 0.14 * cursor.progress;
    ctx.fillStyle = tones.focus || tones.ink || "#ffffff";
    ctx.fillRect(x0, 0, Math.max(2, x1 - x0), height);
    ctx.globalAlpha = 1;
  }

  // 2. The line itself, and the day it is standing at.
  ctx.globalAlpha = 0.55 + (0.35 * cursor.progress);
  ctx.strokeStyle = tones.ink || "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(cursor.x) + 0.5, 0);
  ctx.lineTo(Math.round(cursor.x) + 0.5, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 2b. The day the line is standing at, and what that day means, printed on the
  //     line itself. Without this the plumb line is a pretty vertical rule: the
  //     reader still has to guess where 42 days sits on an axis labelled only at
  //     its two ends, which is the whole complaint about this strip.
  // When the line has caught a mark, the chip reports THAT mark's day: the ring
  // and the number must never disagree by the pixel the pointer happened to sit on.
  const days = Math.round(cursor.dot ? cursor.dot.days : (cursor.days || 0));
  const inBand = cursor.band ? (cursor.band.count || 0) : 0;
  // A name, when the mark under the line has one, leads the chip.
  //
  // Names used to be reachable only by landing exactly on a 3px mark, and once
  // every mark was drawn alike there was nothing left to aim at -- on Build, 16
  // nameable people among 163. The chip is already on screen for every position
  // of the line, so putting the name in it means sweeping the strip surfaces
  // names continuously instead of by luck. The card still opens with the fuller
  // record; this is the part you can read without stopping.
  const who = cursor.who;
  const chip = who
    ? `${who.displayName} · ${days}d · ${bandLabel(days, entry.windowDays)}`
    : `${days}d · ${bandLabel(days, entry.windowDays)}${cursor.band ? ` · ${inBand} in this band` : ""}`;
  ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  const textWidth = ctx.measureText(chip).width;
  const padding = 6;
  const boxWidth = textWidth + padding * 2;
  // Flip to the left of the line near the right edge so the chip is never
  // clipped by the plot, and never covers the line it is labelling.
  const flip = cursor.x + 6 + boxWidth > width;
  const boxX = flip ? cursor.x - 6 - boxWidth : cursor.x + 6;
  ctx.globalAlpha = cursor.progress;
  ctx.fillStyle = tones.ground || "#000000";
  ctx.fillRect(boxX, 2, boxWidth, 18);
  ctx.strokeStyle = tones.ink || "#ffffff";
  ctx.globalAlpha = 0.35 * cursor.progress;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, 2.5, boxWidth - 1, 17);
  ctx.globalAlpha = cursor.progress;
  ctx.fillStyle = tones.ink || "#ffffff";
  ctx.fillText(chip, boxX + padding, 11.5);
  ctx.globalAlpha = 1;

  // 3. The sounding it found. The ring opens from the mark rather than fading
  //    in on top of it, so the eye is led to the dot and not to the ring.
  if (cursor.dot) {
    const cy = mid + cursor.dot.y;
    const radius = entry.radius || 3;
    const grown = radius + 3 + (5 * cursor.progress);
    ctx.beginPath();
    ctx.arc(cursor.dot.x, cy, grown, 0, Math.PI * 2);
    ctx.strokeStyle = tones.ink || "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = cursor.progress;
    ctx.stroke();
    if (cursor.dot.namedIdx >= 0) {
      // A named mark gets a second, wider ring: the click here opens a profile,
      // and that has to look different from a sounding that cannot be opened.
      ctx.beginPath();
      ctx.arc(cursor.dot.x, cy, grown + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = tones.focus || tones.ink || "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.7 * cursor.progress;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/* Advance a row's ring animation. One rAF chain per hovered row, stopped the
 * moment it settles -- never a standing loop, and never one per dot. */
function animateSounding(entry) {
  if (entry.raf) return;
  const step = () => {
    entry.raf = 0;
    const cursor = entry.cursor;
    if (!cursor) { paintSounding(entry); return; }
    if (state.reducedMotion) {
      cursor.progress = 1;
      paintSounding(entry);
      return;
    }
    const elapsed = performance.now() - cursor.startedAt;
    const t = Math.min(1, elapsed / SOUNDING_RING_MS);
    // Exponential ease-out: the ring arrives confidently and settles, rather
    // than easing in and reading as lag.
    cursor.progress = 1 - Math.pow(1 - t, 3);
    paintSounding(entry);
    if (t < 1) entry.raf = requestAnimationFrame(step);
  };
  entry.raf = requestAnimationFrame(step);
}

function bandFor(entry, days) {
  for (const bin of entry.densityBins || []) {
    if (days >= bin.fromDays && days <= bin.toDays) return bin;
  }
  return null;
}

/* Move the plumb line. `dot` may be null: a reader sweeping an empty stretch of
 * the strip still gets the line and the day, which is how they learn what the
 * horizontal axis means. */
function setSounding(entry, x, dot, event) {
  const previous = entry.cursor;
  const days = Math.max(0, (x / Math.max(1, entry.plotWidth || 1)) * entry.spanDays);
  const same = previous && previous.dot === dot;
  entry.cursor = {
    x,
    dot,
    days,
    // Resolved once here rather than in paintSounding, which runs on every frame
    // of the ring animation: soundingPerson() walks the bounded person list, and
    // that is a per-move cost, not a per-frame one.
    who: dot ? soundingPerson(entry, dot) : null,
    band: bandFor(entry, dot ? dot.days : days),
    progress: same ? previous.progress : (state.reducedMotion ? 1 : 0),
    startedAt: same ? previous.startedAt : performance.now(),
  };
  animateSounding(entry);
  /* Landing on a mark opens that mark's card; leaving one starts the short grace
   * period in scheduleSleep (the caller's job, so the keyboard walk is exempt).
   * The grace is what makes a sweep readable: gaps between marks are most of a
   * strip, and an instant hide blinked the card shut between every pair. It is a
   * delay, not a latch, so the card still follows the pointer off the row. */
  if (dot) showSounding(entry, dot, event);
}

function clearSounding(entry) {
  if (entry.raf) { cancelAnimationFrame(entry.raf); entry.raf = 0; }
  entry.cursor = null;
  paintSounding(entry);
}

function bandLabel(days, windowDays) {
  if (days >= windowDays * 2) return "past twice the season";
  if (days >= windowDays) return "past the season";
  return "inside the season";
}

function hideSoundingCard() {
  const card = document.getElementById("pathways-namecard");
  if (card && card.dataset.sticky !== "true") card.hidden = true;
}

/* One card for both kinds of sounding. A named one resolves to that person and
 * their profile link, exactly as a clickable dot used to; an anonymous one says
 * plainly that it is one of N at that depth rather than inventing a name. */
function showSounding(entry, dot, event, options = {}) {
  /* Cards switched off. The strip keeps its plumb line, its day, and its keyboard
   * announcement -- what goes away is the card that lands over the page, which is
   * the only part a reader ever asks to be rid of. */
  if (!state.cards) return;
  const card = ensureNamecard();
  if (!card) return;
  /* A pinned card holds, including against the named branch below -- hover used
   * to walk straight past this guard and replace a card the reader had just
   * clicked to keep. Only a second click, Escape, or a click away releases it. */
  if (card.dataset.sticky === "true" && !options.sticky) return;
  const who = soundingPerson(entry, dot);
  if (who) { cancelSleep(); wakePerson(who, event, options); return; }
  const days = Math.round(dot.days);
  cancelSleep();
  card.replaceChildren();
  card.dataset.sticky = options.sticky ? "true" : "false";
  card.append(el("p", "namecard__name", `${days}-day sounding`));
  card.append(el("p", "namecard__meta", `${entry.stepLabel} · ${bandLabel(days, entry.windowDays)} (${entry.windowDays}-day season)`));
  card.append(el("p", "namecard__note",
    `One of ${entry.total} people at this step counted by the aggregate read. This sounding isn't in the current bounded person read, so it has no name to show.`));
  card.onmouseenter = cancelSleep;
  card.onmouseleave = scheduleSleep;
  card.hidden = false;
  positionNamecard(card, event);
}

/* Pointer, touch and keyboard all drive the same plumb line.
 *
 * Pointer work is coalesced onto one rAF: a fast sweep across a dense row fires
 * pointermove far more often than the screen refreshes, and the old binding did
 * a full hit-test plus a chapter-wide class rewrite on every one of them.
 *
 * The keyboard path is a real equivalent rather than a token one. The strip is a
 * single tab stop that steps through its soundings in day order -- arrows move
 * one, Home and End jump to the freshest and the stalest, Enter opens a named
 * sounding's profile. That is a better instrument than the 1,102 tab stops the
 * DOM-button version nominally offered and no one could ever use.
 */
/* ---------------------------------------------------- touch scrub (#369) -- */

/* The beeswarm's touch instrument, built to the same contract as Connect
 * Health's field strip so the two dashboards teach one gesture, not two.
 *
 * A finger cannot hover, and it also covers the thing it is pointing at. So the
 * readout rides ABOVE the finger as a keycap, the strip stays live while the
 * finger travels, dragging clear of the row cancels, and lifting opens the full
 * card. Never the only path: the arrow-key walk reaches every sounding with no
 * pointer at all, which is why the keycap is aria-hidden -- a screen reader
 * stays on the walk rather than hearing this twice.
 */
const SCRUB_CANCEL_MARGIN = 32;

function soundingKeycap() {
  let node = state.root ? state.root.querySelector("#pathways-keycap") : null;
  if (!node && state.root) {
    node = el("div", "keycap");
    node.id = "pathways-keycap";
    node.setAttribute("aria-hidden", "true");
    node.hidden = true;
    node.append(el("span", "keycap-state"), el("span", "keycap-name"), el("span", "keycap-pos"));
    state.root.appendChild(node);
  }
  return node;
}

function showSoundingKeycap(entry, dot, who, clientX, clientY, cancelled) {
  const node = soundingKeycap();
  if (!node || !dot) return;
  const [stateSpan, nameSpan, posSpan] = node.children;
  const days = Math.round(dot.days);
  if (cancelled) {
    stateSpan.className = "keycap-state";
    stateSpan.textContent = "Release to cancel";
    node.dataset.cancel = "true";
  } else {
    stateSpan.className = `keycap-state ${bandToneClass(days, entry.windowDays)}`;
    stateSpan.textContent = bandLabel(days, entry.windowDays);
    delete node.dataset.cancel;
  }
  nameSpan.textContent = who ? who.displayName : `${days}-day sounding`;
  posSpan.textContent = who
    ? `${days}d · ${entry.stepLabel}`
    : `${entry.stepLabel} · one of ${formatCount(entry.total)}`;

  node.hidden = false;
  node.dataset.keycapOn = "true";
  const rect = node.getBoundingClientRect();
  let left = clientX - rect.width / 2;
  left = Math.min(Math.max(left, 12), window.innerWidth - rect.width - 12);
  // 56px of clearance is a fingertip: the keycap must never be under the hand
  // that is driving it.
  let top = clientY - 56 - rect.height;
  if (top < 8) { top = clientY + 56; node.dataset.keycapFlip = "true"; }
  else delete node.dataset.keycapFlip;
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

function hideSoundingKeycap() {
  const node = soundingKeycap();
  if (!node) return;
  node.hidden = true;
  delete node.dataset.keycapOn;
  delete node.dataset.cancel;
  delete node.dataset.keycapFlip;
  for (const span of node.querySelectorAll("span")) span.textContent = "";
}

function bandToneClass(days, windowDays) {
  if (days >= windowDays * 2) return "is-far";
  if (days >= windowDays) return "is-past";
  return "is-fresh";
}

function bindSoundingScrub(entry) {
  const surface = entry.overlay;
  let cancelled = false;
  let held = null;

  const cleanup = () => {
    hideSoundingKeycap();
    clearSounding(entry);
    state.soundingScrub = null;
    held = null;
    cancelled = false;
  };

  const step = (event) => {
    const box = surface.getBoundingClientRect();
    cancelled = event.clientY > box.bottom + SCRUB_CANCEL_MARGIN
      || event.clientY < box.top - SCRUB_CANCEL_MARGIN;
    const x = event.clientX - box.left;
    const dot = nearestSounding(entry, x, event.clientY - box.top);
    // The line follows the finger even where there is no mark, exactly as it
    // follows a pointer: that is how the axis teaches itself.
    setSounding(entry, x, dot, event);
    hideSoundingCard();
    held = dot || null;
    if (dot) showSoundingKeycap(entry, dot, entry.cursor?.who || null, event.clientX, event.clientY, cancelled);
    else hideSoundingKeycap();
  };

  surface.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    if (state.soundingScrub) return;
    // Claims the gesture, which also suppresses the compatibility click that
    // would otherwise open the card a second time.
    event.preventDefault();
    try { surface.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    state.soundingScrub = { pointerId: event.pointerId, entry };
    step(event);
  });

  surface.addEventListener("pointermove", (event) => {
    if (!state.soundingScrub || state.soundingScrub.pointerId !== event.pointerId) return;
    step(event);
  });

  surface.addEventListener("pointerup", (event) => {
    if (!state.soundingScrub || state.soundingScrub.pointerId !== event.pointerId) return;
    const wasCancelled = cancelled;
    const dot = held;
    try { surface.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    hideSoundingKeycap();
    state.soundingScrub = null;
    held = null;
    cancelled = false;
    if (wasCancelled) { clearSounding(entry); announce("Nothing opened."); return; }
    // Lift opens the full card, pinned: on touch there is no hover to hold it.
    if (dot) { state.pinnedDot = dot; showSounding(entry, dot, event, { sticky: true }); }
  });

  surface.addEventListener("pointercancel", (event) => {
    if (!state.soundingScrub || state.soundingScrub.pointerId !== event.pointerId) return;
    try { surface.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    cleanup();
  });
  surface.addEventListener("lostpointercapture", () => { if (state.soundingScrub) cleanup(); });
}

function bindSoundingHover(plot, entry) {
  const surface = entry.overlay;
  let pending = null;
  let frame = 0;

  const resolve = () => {
    frame = 0;
    if (!pending) return;
    const { x, y, event } = pending;
    pending = null;
    const dot = nearestSounding(entry, x, y);
    surface.style.cursor = dot ? "pointer" : "crosshair";
    setSounding(entry, x, dot, event);
    /* Off a mark, start the grace period rather than hiding outright. Sweeping a
     * strip crosses far more empty pixels than marks, so an instant hide made the
     * card blink between every pair; holding it open indefinitely instead left a
     * card standing over a pointer that had long since moved on, which reads as a
     * tooltip that will not go away. The 320ms grace covers the gaps and nothing
     * more: pause anywhere off a mark and the card lets go by itself. */
    if (!dot) scheduleSleep();
  };

  surface.addEventListener("pointermove", (event) => {
    // Touch drives the scrub instead; letting both run would fight over the
    // cursor and flash the card behind the keycap.
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const rect = surface.getBoundingClientRect();
    pending = { x: event.clientX - rect.left, y: event.clientY - rect.top, event };
    if (!frame) frame = requestAnimationFrame(resolve);
  });
  surface.addEventListener("pointerleave", () => {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    pending = null;
    surface.style.cursor = "default";
    clearSounding(entry);
    scheduleSleep();
  });
  /* Click pins the card open, which is the only way a reader can hold a reading
   * long enough to read it through or follow the profile link inside it. Clicking
   * the same mark again lets go, clicking a different mark moves the pin, and
   * clicking empty strip closes it -- the same toggle every other readout on this
   * island uses. */
  surface.addEventListener("click", (event) => {
    event[PIN_HANDLED] = true;
    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const dot = nearestSounding(entry, x, event.clientY - rect.top);
    if (!dot) { sleepAll(); clearSounding(entry); return; }
    const held = state.pinnedDot === dot && document.getElementById("pathways-namecard")?.dataset.sticky === "true";
    releasePins();
    if (held) return;
    state.pinnedDot = dot;
    setSounding(entry, x, dot, event);
    showSounding(entry, dot, event, { sticky: true });
  });

  const stepTo = (nextIndex, event) => {
    const placed = entry.placed || [];
    if (!placed.length) return;
    const ordered = entry.byDay || (entry.byDay = placed.map((_, i) => i).sort((a, b) => placed[a].x - placed[b].x));
    const clamped = Math.max(0, Math.min(ordered.length - 1, nextIndex));
    entry.keyAt = clamped;
    const dot = placed[ordered[clamped]];
    /* A keydown carries no coordinates, so the card used to land at the origin of
     * the chapter -- often thousands of pixels above the mark the reader had just
     * stepped onto. Anchor it to the mark itself: the keyboard walk deserves the
     * same placement the pointer gets. */
    const box = surface.getBoundingClientRect();
    const anchor = {
      clientX: box.left + dot.x,
      clientY: box.top + (entry.mid ?? box.height / 2) + dot.y,
    };
    setSounding(entry, dot.x, dot, anchor);
    /* The keyboard walk pins each step it lands on: there is no pointer to hold
     * the card open, and the grace period would close it under the reader. */
    sleepAll();
    state.pinnedDot = dot;
    showSounding(entry, dot, anchor, { sticky: true });
    const who = soundingPerson(entry, dot);
    announce(who
      ? `${who.displayName}, ${Math.round(dot.days)} days in ${entry.stepLabel}.`
      : `${Math.round(dot.days)}-day sounding in ${entry.stepLabel}, ${bandLabel(dot.days, entry.windowDays)}.`, { visible: false });
  };

  surface.addEventListener("keydown", (event) => {
    const at = entry.keyAt ?? -1;
    const last = (entry.placed || []).length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); stepTo(at + 1, event); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); stepTo(at <= 0 ? 0 : at - 1, event); }
    else if (event.key === "Home") { event.preventDefault(); stepTo(0, event); }
    else if (event.key === "End") { event.preventDefault(); stepTo(last, event); }
    else if (event.key === "Escape") { sleepAll(); clearSounding(entry); entry.keyAt = null; }
  });
  surface.addEventListener("blur", () => { clearSounding(entry); scheduleSleep(); });
}

/* Size a canvas to its box in device pixels and hand back a ready 2D context. */
function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/* Paint one row's crowd: an anonymous density field, then the named people as
 * crisp marks on top of it. Canvas for both, because a full pathway runs past
 * any sane DOM node budget -- 1,102 buttons on one row was the proof.
 *
 * The density used to composite additively at a flat alpha with no ceiling, so
 * Connect Group's busiest column stacked ~1,500 marks and clipped to pure white:
 * a 200-person column and a 1,500-person column painted the same colour, which
 * is the one thing a density plot must never do. Alpha is now normalised against
 * the chapter's busiest column, so the top of the range lands just under
 * saturation and every column below it is a true relative reading.
 */
function paintSwarm(entry, tones, radius) {
  const fit = fitCanvas(entry.canvas);
  if (!fit) return;
  const { ctx, width, height } = fit;
  const placed = scatterSwarm(entry.points, width, height, radius, entry.peak);
  const mid = height / 2;

  // ONE kind of mark. Every sounding is drawn the same way -- an additive dot
  // that brightens where people pile up -- because that pile-up IS the reading.
  // A person the page can name used to be drawn as a second, opaque, outlined
  // species on top, which made the strip look like it carried two different
  // measurements when it carries one: days since a date, one dot per person.
  // Being nameable is a property of the bounded person read, not of the person,
  // and it has no business changing how a mark looks at rest.
  //
  // Every mark draws at the same low alpha and the marks ADD. That is the whole
  // density model, and it is deliberately not normalised: a column eleven deep
  // sums past 1.0 and clips to white, so the busiest shoals glow out.
  //
  // This is the instrument a beeswarm actually is, and clipping is a feature of
  // it, not a defect. An earlier pass here replaced the constant with an
  // exponential saturation curve capped at 0.88 so that a 900-deep column and a
  // 1,500-deep column would still differ. They did differ, and the strip went
  // lukewarm everywhere: capping the sum means no column can ever reach white,
  // so the peaks the chapter exists to show read as grey. Discriminating between
  // two columns that are both far past the top of the scale is not worth the
  // whole scale, and the exact depth is a number the reader gets from the hover
  // chip, which reports it, rather than by comparing two whites.
  //
  //   depth  1 ->  0.09      one person, barely lit
  //   depth  5 ->  0.45
  //   depth 11 ->  ~1.0      clips: the shoal starts to glow
  //   depth 30+ ->  white
  const DOT_ALPHA = 0.09;

  // Under a focus filter the difference between marks becomes a real one, so it
  // is the only thing allowed to change them: the people the filter actually
  // matched stay lit and everyone else drops back to context. Same shape, same
  // size, same tone, same pile-up behaviour -- only the level differs, which is
  // why a filtered strip still reads as one population rather than two.
  const focused = entry.focused === true;

  ctx.globalCompositeOperation = "lighter";
  for (const dot of placed) {
    const lit = focused && dot.namedIdx >= 0;
    // Under a filter the matched marks are lifted and the rest drop to a ground
    // the eye reads as context, so a filtered strip is the same population
    // dimmed, never a second population drawn. The lift is needed because a
    // single matched person at the resting alpha is invisible: a filter that
    // matches four people has to show four people, not an empty strip.
    ctx.globalAlpha = focused
      ? (lit ? Math.max(DOT_ALPHA, 0.42) : DOT_ALPHA * 0.3)
      : DOT_ALPHA;
    ctx.beginPath();
    ctx.arc(dot.x, mid + dot.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = staleHex(dot.days, entry.windowDays, tones);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  entry.placed = placed;
  entry.radius = radius;
  entry.mid = mid;
  entry.plotWidth = width;
  entry.plotHeight = height;
  entry.bucket = Math.max(6, radius * 3);
  entry.index = indexPlacements(placed, entry.bucket);
  entry.tones = tones;
  paintSounding(entry);
}

function paintAllSwarms() {
  if (!state.root || !state.swarmPaint.length) return;
  // Read live, at paint time, off the active theme -- no hardcoded fallback.
  // A fallback here would silently paint favor-dark's hues into a cream or
  // indigo theme, which is the exact failure the token contract exists
  // to prevent.
  const css = getComputedStyle(state.root);
  const tones = {
    gain: css.getPropertyValue("--move-gain").trim(),
    stalled: css.getPropertyValue("--move-stalled").trim(),
    loss: css.getPropertyValue("--move-loss").trim(),
    // The ground a named mark punches out of, and the hairline it is drawn with.
    // Both come off the live theme for the same reason the three tones do.
    ground: css.getPropertyValue("--depth-2").trim() || css.getPropertyValue("--background").trim(),
    ink: css.getPropertyValue("--ink").trim(),
    focus: css.getPropertyValue("--focus").trim(),
    muted: css.getPropertyValue("--muted-ink").trim(),
  };
  const radius = globalSwarmRadius(state.swarmPaint);
  for (const entry of state.swarmPaint) paintSwarm(entry, tones, radius);
}

/* --------------------------------------------------------------- beeswarm -- */

function renderSwarm() {
  state.swarmPaint = [];
  const body = state.root.querySelector("#chapter-swarm .chapter__body");
  const meta = state.root.querySelector("#chapter-swarm .chapter__meta");
  body.replaceChildren();
  const freshness = state.bundle.freshness || [];
  const path = activePath();
  const rows = freshness.filter((f) => path.steps.some((s) => s.id === f.stepId));
  // Each step ages against its own season, so a single page-wide window would be
  // a claim about Grow that Favor College never agreed to. Say what is actually
  // in force instead of naming one default that governs nothing.
  const windows = [...new Set(rows.map((r) => r.windowDays))].sort((a, b) => a - b);
  meta.textContent = windows.length
    ? (windows.length === 1 ? `${windows[0]}-day season` : `${windows[0]}–${windows[windows.length - 1]}-day seasons · 14-day bands`)
    : "per-step season";
  // Live steps on this pathway that the freshness read carries no dated source
  // for. They used to vanish from this chapter without a word, which reads as
  // "nothing here is stale" when the truth is "nothing here has a date".
  const gapSteps = (state.bundle.freshnessGaps || [])
    .map((id) => path.steps.find((s) => s.id === id))
    .filter(Boolean);
  const gapNote = gapSteps.length
    ? el("p", "chapter__what", `No dated source in Rock yet for ${gapSteps.map((s) => s.label).join(", ")} — those steps are counted elsewhere on this page but nothing here records when a person entered them, so they draw no strip rather than a fresh-looking one.`)
    : null;
  if (rows.length === 0) {
    const status = state.bundle.meta?.queryAvailability?.["people-pathway-freshness"]?.status;
    body.append(el("p", "chapter__what", status === "available" ? "The bounded freshness read returned no rows for this pathway. This is an empty result, not an unavailable response." : "Freshness is unavailable because the registered aggregate read was refused or malformed. Unavailable isn't zero."));
    if (gapNote) body.append(gapNote);
    mountChapterRail("swarm", "freshness", null);
    return;
  }
  if (activeFilterDimensions().length > 0) {
    const notice = el("p", "focus-notice");
    notice.textContent = "Lit marks are the people your focus matched. The dimmed marks are everyone this read could not match \u2014 which includes anyone who does match but falls outside the bounded person page. The ledger below stays full-population until a live query serves this focus.";
    body.append(notice);
  }

  const wrap = el("div", "swarm");
  const axis = el("div", "swarm__axis");
  axis.append(el("span", null, "Fresh, inside the expected window"), el("span", null, "Window edge"), el("span", null, "Twice the window and beyond"));
  wrap.append(axis);

  const people = filteredPeople();
  const today = Date.now();

  for (const row of rows) {
    const step = path.steps.find((s) => s.id === row.stepId);
    const rowEl = el("div", "swarmrow");
    rowEl.append(el("span", "swarmrow__name", step.label));
    const plot = el("div", "swarmrow__plot");
    // The axis used to be a flat three times the window, so a step where nobody
    // is older than a month reserved two thirds of the plot for days that do not
    // exist and squeezed every dot into the left edge. Fit it to what was
    // actually observed, keeping enough room past the window edge that the edge
    // itself stays on screen and "past the window" is still legible.
    const binMax = (row.densityBins || []).reduce((top, bin) => Math.max(top, bin.toDays || bin.fromDays), 0);
    const personMax = people.reduce((top, person) => Math.max(top, stepDays(person, row.stepId, today) ?? 0), 0);
    const observedMax = Math.max(binMax, personMax);
    const spanDays = Math.max(Math.round(row.windowDays * 1.15), Math.ceil(observedMax * 1.06), 14);
    const pct = (days) => `${Math.min(97, (days / spanDays) * 100)}%`;

    const windowBand = el("span", "swarmrow__window");
    windowBand.style.width = pct(row.windowDays);
    plot.append(windowBand);
    const edge = el("span", "swarmrow__windowedge");
    edge.style.left = pct(row.windowDays);
    edge.title = `${step.label}: the ${row.windowDays}-day season edge. Dots to the right have not been seen inside it.`;
    plot.append(edge);

    // Three day marks in the plot itself. "Past the window" is a judgement the
    // reader can only check against a number, and until now the axis carried
    // words only -- so a dot two thirds along could have been 40 days or 400.
    const tick = (days, text, align) => {
      const mark = el("span", `swarmrow__tick swarmrow__tick--${align}`, text);
      mark.style.left = align === "end" ? "auto" : pct(days);
      if (align === "end") mark.style.right = "0.35rem";
      plot.append(mark);
    };
    tick(0, "0d", "start");
    if (row.windowDays > 0 && row.windowDays < spanDays * 0.92) tick(row.windowDays, `${row.windowDays}d`, "mid");
    tick(spanDays, row.capped ? `${state.bundle.freshnessCapDays || 392}d+` : `${spanDays}d`, "end");

    // The crowd is drawn from the aggregate bins, which carry the true
    // population; the bounded person read only ever covers part of it. Every
    // dot here is one person counted by the aggregate, never a sampled record
    // dressed up as the whole. The named people join the same placement pass so
    // they land where their density says they land instead of on one flat line.
    // Days only, never the record: the placement pass needs a position, and the
    // person behind a mark is resolved from the same order at hover time.
    const named = [];
    for (const person of people) {
      const days = stepDays(person, row.stepId, today);
      if (days !== null) named.push({ days });
    }
    const crowd = swarmPlacements(row, spanDays, named);
    const canvas = el("canvas", "swarmrow__canvas");
    canvas.setAttribute("aria-hidden", "true");
    plot.append(canvas);

    // The hover layer is its own canvas so the plumb line can be redrawn on a
    // pointer move without repainting several thousand density marks, and it is
    // the element that takes focus: one tab stop that walks the whole strip.
    const overlay = el("canvas", "swarmrow__overlay");
    overlay.tabIndex = 0;
    overlay.setAttribute("role", "img");
    overlay.setAttribute("aria-label",
      `${step.label}: ${crowd.length} people by season-relative age against a ${row.windowDays}-day season, ${named.length} of them nameable. Use the arrow keys to step through them.`);
    plot.append(overlay);

    const entry = {
      canvas, overlay, points: crowd, windowDays: row.windowDays,
      densityBins: row.densityBins || [],
      spanDays,
      stepLabel: step.label,
      stepId: row.stepId,
      total: crowd.length,
      named: named.length,
      // Whether a focus filter is in force, which is the only condition under
      // which a nameable mark is drawn differently from any other mark.
      focused: activeFilterDimensions().length > 0,
      mid: 0,
      cursor: null,
      raf: 0,
      keyAt: null,
    };
    // A screen reader gets the same distinction sighted readers get from the
    // brightness split, said in words rather than implied by a level.
    if (entry.focused && named.length) {
      overlay.setAttribute("aria-label", `${overlay.getAttribute("aria-label")} ${formatCount(named.length)} match your focus; the rest are people this read could not match.`);
    }
    state.swarmPaint.push(entry);
    bindSoundingHover(plot, entry);
    bindSoundingScrub(entry);

    rowEl.append(plot);
    const dotCoverage = state.bundle.fictional
      ? "fictional people"
      : (state.bundle.meta?.personLayerAuthorized ? "from the bounded staff-person page" : "unavailable because the staff-person read was refused");
    // Say what the strip is measuring, not only how to read the dots: which
    // record's date is being aged, how many people carry one, and whether the
    // tail was capped. A reader who cannot see the "and beyond" is reading a
    // shorter history than the one that exists.
    const capNote = row.capped ? ` The oldest band holds ${state.bundle.freshnessCapDays || 392} days and beyond, drawn at the cap.` : "";
    // With one kind of mark, the note can no longer point at a look ("the
    // outlined ones"). Under a focus it says what the lit marks are and, just as
    // importantly, what the dimmed ones are NOT: the crowd is everyone this read
    // could not match, which includes people who do match but fall outside the
    // bounded person page. Calling them "people who don't match" would be a
    // claim the bundle cannot support.
    const namedNote = !named.length
      ? ""
      : entry.focused
        ? ` ${formatCount(named.length)} lit marks match your focus (${dotCoverage}) and open a profile. The dimmed marks are everyone this read could not match.`
        : ` ${formatCount(named.length)} of them open a profile (${dotCoverage}).`;
    /* The facts stay on the row and the explanation goes behind the mark. Eight
     * of these ran to 1,370 characters of caption above the strips, and every
     * clause after the count changed with the filters, so the strips walked down
     * the page on each click. What is left is short, and its length barely moves. */
    rowEl.append(el("span", "swarmrow__meta",
      `${row.windowDays}-day season · ${formatCount(row.datedPeople ?? 0)} people`));
    const mark = proseMark(
      `One mark is one person, placed by how long ago their date was, and brighter where people pile up.${namedNote}${row.undatedPeople ? ` ${row.undatedPeople} people here have no date, so they stay listed but unplotted.` : ""}${capNote}`,
      `How to read the ${row.stepLabel || "freshness"} strip`);
    if (mark) rowEl.append(mark);
    wrap.append(rowEl);
  }
  body.append(wrap);
  // Canvas needs laid-out boxes, so paint after the rows are in the document.
  requestAnimationFrame(() => paintAllSwarms());

  if (gapNote) body.append(gapNote);

  const details = el("details", "disclosure");
  details.append(el("summary", null, "Show the labelled freshness ledger"));
  const twrap = el("div", "tablewrap");
  const table = el("table");
  // The season is now a column rather than a sentence under the chapter: the three
  // count columns mean nothing without the number they were measured against, and
  // that number is different on every row.
  table.innerHTML = "<caption>People inside, past, and far past each step’s expected season, with the season each row was measured against.</caption><thead><tr><th scope='col'>Step</th><th scope='col' class='num'>Season (days)</th><th scope='col' class='num'>Inside window</th><th scope='col' class='num'>Past window</th><th scope='col' class='num'>Twice window and beyond</th><th scope='col' class='num'>Undated</th><th scope='col' class='num'>Oldest band</th></tr></thead>";
  const tbody = el("tbody");
  for (const row of rows) {
    const step = path.steps.find((s) => s.id === row.stepId);
    let inside = 0; let past = 0; let far = 0;
    for (const bin of row.densityBins || []) {
      if (bin.fromDays >= row.windowDays * 2) far += bin.count;
      else if (bin.fromDays >= row.windowDays) past += bin.count;
      else inside += bin.count;
    }
    // An undated person is not a fresh person and not a zero: they are counted on
    // this step and have no date to age. The dash says exactly that (ADR 0018).
    const oldest = row.oldestBandFromDays === null || row.oldestBandFromDays === undefined
      ? "?"
      : `${row.oldestBandFromDays}${row.capped ? "+" : `–${row.oldestBandFromDays + 13}`}d`;
    const tr = el("tr");
    tr.innerHTML = `<th scope='row'>${escapeText(step.label)}</th><td class='num'>${formatCount(row.windowDays)}</td><td class='num'>${formatCount(inside)}</td><td class='num'>${formatCount(past)}</td><td class='num'>${formatCount(far)}</td><td class='num'>${formatCount(row.undatedPeople || 0)}</td><td class='num'>${escapeText(oldest)}</td>`;
    tbody.append(tr);
  }
  table.append(tbody);
  twrap.append(table);
  details.append(twrap);
  body.append(details);
  // One canvas per step row plus DOM labels: a single image of this chapter would not
  // be a faithful picture of it, so PNG stays in the honest disabled form here and
  // ships on the Classic widget's compact SVG aid instead.
  mountChapterRail("swarm", "freshness", null);
}

/* ================================================================ Classic ==
 *
 * Classic is a second renderer over the slice Creative already computes, never a
 * second filter model (plan D4, D1). Every widget below is built from a
 * DashboardSection, and that same section object is what the export rail writes and
 * what the package carries -- so an artifact cannot drift from the reading on screen
 * (D7). The People chapter (plan §6) comes first because it is the origin ask; the
 * movement chapters follow the Creative order.
 *
 * Person-level displays -- the Leaders Directory rows and the trajectory overlay --
 * carry personLevel: true, which is what keeps them out of every export and every
 * package by construction (D8/D16).
 */

const CLASSIC_UNAVAILABLE_EXPORT = "Nothing to export while this reading is unavailable";

function sumRows(rows) {
  return (rows || []).reduce((total, row) => total + (Number(row && row.count) || 0), 0);
}

function sharePercent(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function signedPoints(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0 pts";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} pts`;
}

const ACRONYMS = { clt: "CLT", dna: "DNA", fcx: "FCX", mnl: "MNL", bne: "BNE", sel: "SEL" };

function humanize(text) {
  const words = String(text || "").replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Unnamed";
  return words.map((word) => ACRONYMS[word.toLowerCase()] || word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/* The registered vocabulary travels with the data, so the dimension order and the
 * labels come from the bundle; the module constants are the fallback when the
 * base read was refused and there is nothing to read them from. */
function baseDimensions() {
  const dims = state.bundle?.base?.dimensions || {};
  const ageBands = dims.ageBands?.length
    ? dims.ageBands
    : [...AGE.map((band) => ({ id: band.key, label: band.label })), { id: "unknown", label: "Unknown" }];
  const genders = dims.genders?.length ? dims.genders : GENDER.map((g) => ({ id: g.key, label: g.label }));
  const lifecycles = dims.lifecycles?.length
    ? dims.lifecycles
    : ["Leader", "Core", "Crowd", "New"].map((id) => ({ id, label: id, idealShare: LIFECYCLE_REFERENCE[id] }));
  return { ageBands, genders, lifecycles };
}

/* Gender columns honour the global gender filter: an axis the viewer has narrowed
 * shows what remains, never a column of zeroes for what was excluded. */
function visibleGenders() {
  const genders = baseDimensions().genders;
  if (!state.filters.gender.size) return genders;
  return genders.filter((gender) => state.filters.gender.has(gender.id));
}

function baseUnavailable() {
  const base = state.bundle?.base;
  if (!base) return "The people-base-counts read isn't in this bundle at all. Unavailable isn't zero.";
  if (base.availability?.status !== "available") {
    return base.availability?.reason
      || "The registered people-base-counts read was refused or malformed. Unavailable isn't zero.";
  }
  return null;
}

/* --------------------------------------------------- P1: the base, right now -- */

function peopleBaseSection() {
  const id = "people-base";
  const heading = "The base, right now";
  const refused = baseUnavailable();
  if (refused) return { id, heading, kind: "kpi", kpis: [], unavailable: refused };

  const rows = filteredBaseRows();
  const total = sumRows(rows);
  const dims = baseDimensions();
  const kpis = [{
    label: "People in this slice",
    value: total,
    unit: "people",
    state: "neutral",
    note: "Every active person in the Favor People base, counted once, under the filters the console is holding right now. Clear the filters and this is the whole base.",
  }];

  for (const band of dims.ageBands) {
    const count = sumRows(rows.filter((row) => row.ageBand === band.id));
    const share = sharePercent(count, total);
    const tile = {
      label: band.label,
      value: count,
      unit: "people",
      delta: share === null ? "" : `${share}% of the slice`,
      state: band.id === "unknown" ? "unknown" : "neutral",
    };
    if (band.id === "unknown") {
      tile.note = "People whose birth date Rock cannot resolve. They are their own group and are never folded into another one, so this tile is a reading and not a rounding error.";
    }
    kpis.push(tile);
  }

  const leaders = sumRows(rows.filter((row) => String(row.lifecycle || "").toLowerCase() === "leader"));
  const leaderShare = sharePercent(leaders, total);
  const reference = LIFECYCLE_REFERENCE.Leader;
  const ratio = {
    label: "Leader : person",
    value: leaders > 0 ? `1 : ${(total / leaders).toFixed(1)}` : null,
    unit: "",
    delta: leaderShare === null ? "" : `${leaderShare}% leaders · ${reference}% reference`,
    state: leaderShare === null ? "unknown" : (leaderShare >= reference ? "healthy" : "watch"),
    note: "The numerator is the Leader cohort of the People base, not the leader-tier table below: one person can hold several tiers, so adding the tiers up would count that person more than once. The wash is healthy when the Leader share meets the 15% reference the People PRD set, and watch below it.",
  };
  kpis.push(ratio);

  const note = leaders > 0
    ? `One leader for every ${(total / leaders).toFixed(1)} people in this slice.`
    : "No Leader-cohort people remain under these filters, so the ratio has no numerator and stays unavailable.";
  /* A strip of tiles is still a table when it leaves the page: the rail exports the
   * readings themselves rather than an empty sheet. */
  const columns = [
    { key: "reading", label: "Reading" },
    { key: "value", label: "Value" },
    { key: "unit", label: "Unit" },
    { key: "detail", label: "Detail" },
  ];
  const readings = kpis.map((kpi) => ({
    reading: kpi.label,
    value: kpi.value,
    unit: kpi.unit || null,
    detail: kpi.delta || null,
  }));
  return { id, heading, kind: "kpi", kpis, columns, rows: readings, note };
}

/* -------------------------------------------------- P2: cohort composition -- */

function compositionSection() {
  const id = "people-composition";
  const heading = "Cohort composition";
  const refused = baseUnavailable();
  const columns = [
    { key: "cohort", label: "Cohort" },
    { key: "people", label: "People", kind: "number" },
    { key: "share", label: "Share", kind: "percent" },
    { key: "reference", label: "Reference", kind: "percent" },
    { key: "difference", label: "Difference" },
  ];
  if (refused) return { id, heading, kind: "table", columns, rows: [], unavailable: refused };

  const rows = filteredBaseRows();
  const total = sumRows(rows);
  const dims = baseDimensions();
  const out = dims.lifecycles.map((cohort) => {
    const count = sumRows(rows.filter((row) => row.lifecycle === cohort.id));
    const share = sharePercent(count, total);
    const ideal = Number.isFinite(cohort.idealShare) ? cohort.idealShare : LIFECYCLE_REFERENCE[cohort.id] ?? null;
    return {
      cohort: cohort.label,
      people: count,
      share,
      reference: ideal,
      difference: share === null || ideal === null ? "—" : signedPoints(share - ideal),
    };
  });
  const widest = out.reduce((top, row) => {
    const gap = Math.abs(Number(row.share || 0) - Number(row.reference || 0));
    return gap > top.gap ? { gap, row } : top;
  }, { gap: -1, row: null });
  const note = widest.row
    ? `${widest.row.cohort} sits ${signedPoints(Number(widest.row.share) - Number(widest.row.reference))} from its ${widest.row.reference}% reference, the widest gap in this slice.`
    : "";
  return { id, heading, kind: "table", columns, rows: out, note };
}

/* ---------------------------------------------- P3: age by gender distribution -- */

function ageGenderSection() {
  const id = "people-age-gender";
  const heading = "Age group by gender";
  const refused = baseUnavailable();
  const genders = visibleGenders();
  const columns = [
    { key: "ageBand", label: "Age group" },
    ...genders.map((gender) => ({ key: gender.id, label: gender.label, kind: "number" })),
    { key: "total", label: "Total", kind: "number" },
  ];
  if (refused) return { id, heading, kind: "table", columns, rows: [], unavailable: refused };

  const rows = filteredBaseRows();
  const dims = baseDimensions();
  const out = dims.ageBands.map((band) => {
    const inBand = rows.filter((row) => row.ageBand === band.id);
    const line = { ageBand: band.label };
    for (const gender of genders) line[gender.id] = sumRows(inBand.filter((row) => row.gender === gender.id));
    line.total = sumRows(inBand);
    return line;
  });
  const total = { ageBand: "All ages" };
  for (const gender of genders) total[gender.id] = sumRows(rows.filter((row) => row.gender === gender.id));
  total.total = sumRows(rows);
  const largest = out.reduce((top, row) => (row.total > (top ? top.total : -1) ? row : top), null);
  const note = largest && total.total
    ? `${largest.ageBand} is the largest group in this slice at ${sharePercent(largest.total, total.total)}% of it.`
    : "";
  return { id, heading, kind: "table", columns, rows: out, totalRow: total, note };
}

/* --------------------------------------------------- P4: leader counts by role -- */

const CAMPUS_SORT_ORDER = { MNL: 1, BNE: 2, SEL: 3, ALL: 4 };
function compareCampuses(a, b) {
  const rankA = CAMPUS_SORT_ORDER[String(a).toUpperCase()] || 99;
  const rankB = CAMPUS_SORT_ORDER[String(b).toUpperCase()] || 99;
  return rankA - rankB || String(a).localeCompare(String(b));
}

function leaderCampuses(rows) {
  return [...new Set((rows || []).map((row) => String(row.campus || "")))]
    .filter(Boolean)
    .sort(compareCampuses);
}

function leaderCountsSection() {
  const id = "people-leaders";
  const heading = "Leader counts by role";
  const leaders = state.bundle?.leaders;
  const refusedReason = !leaders
    ? "The people-leader-counts read isn't in this bundle at all. Unavailable isn't zero."
    : (leaders.availability?.status !== "available"
      ? (leaders.availability?.reason || "The registered people-leader-counts read was refused or malformed. Unavailable isn't zero.")
      : null);
  const campuses = refusedReason ? [] : leaderCampuses(leaders.rows);
  const columns = [
    { key: "group", label: "Group" },
    { key: "tier", label: "Tier" },
    ...campuses.map((campus) => ({ key: campus, label: campus, kind: "number" })),
    { key: "total", label: "Total", kind: "number" },
  ];
  if (refusedReason) return { id, heading, kind: "pivot", columns, rows: [], unavailable: refusedReason };

  const rows = leaders.rows || [];
  const line = (group, label, matching) => {
    const record = { group, tier: label };
    let total = 0;
    for (const campus of campuses) {
      const count = matching.filter((row) => row.campus === campus).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
      record[campus] = count;
      total += count;
    }
    record.total = total;
    return record;
  };

  const out = [];
  for (const tier of leaders.tiers || []) {
    if (!tier.resolves) {
      const gapRow = { group: "Schema gap", tier: `${tier.label}: no tier resolves`, total: null };
      for (const campus of campuses) gapRow[campus] = null;
      out.push(gapRow);
      continue;
    }
    if (tier.id === "ministry-team") {
      const teams = [...new Set(rows.filter((row) => row.role === "ministry-team").map((row) => row.team).filter(Boolean))].sort();
      for (const team of teams) {
        out.push(line("Ministry Teams", team, rows.filter((row) => row.role === "ministry-team" && row.team === team)));
      }
      continue;
    }
    out.push(line("Leadership tiers", tier.label, rows.filter((row) => row.role === tier.id)));
  }
  for (const gap of leaders.gaps || []) {
    const gapRow = { group: "Schema gap", tier: `${humanize(gap.role)}: schema gap`, total: null };
    for (const campus of campuses) gapRow[campus] = null;
    out.push(gapRow);
  }

  const counted = out.filter((row) => row.total !== null).reduce((sum, row) => sum + row.total, 0);
  const note = `${formatCount(counted)} leader places across ${out.filter((row) => row.total !== null).length} rows. Leader rows carry no age, gender, or lifecycle, so leader counts do not respond to the lifecycle, gender, or age filters.`;
  return { id, heading, kind: "pivot", columns, rows: out, note };
}

/* ------------------------------------------- P5: the Leaders Directory (display) -- */

function directoryCountsSection() {
  const id = "people-leaders-directory-counts";
  const heading = "Leader counts by role and team";
  const leaders = state.bundle?.leaders;
  const columns = [
    { key: "role", label: "Role" },
    { key: "team", label: "Team" },
    { key: "campus", label: "Campus" },
    { key: "count", label: "Leaders", kind: "number" },
  ];
  if (!leaders || leaders.availability?.status !== "available") {
    return {
      id,
      heading,
      kind: "table",
      columns,
      rows: [],
      unavailable: leaders?.availability?.reason
        || "The registered people-leader-counts read was refused or malformed, so there are no aggregate counts to export.",
    };
  }
  const tierLabel = new Map((leaders.tiers || []).map((tier) => [tier.id, tier.label]));
  const rows = [...(leaders.rows || [])]
    .map((row) => ({
      role: tierLabel.get(row.role) || humanize(row.role),
      team: row.team || null,
      campus: row.campus,
      count: Number(row.count) || 0,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || String(a.team || "").localeCompare(String(b.team || "")));
  return { id, heading, kind: "table", columns, rows };
}

function directoryTagVocabulary() {
  return state.bundle?.directory?.tagVocabulary || [];
}

/* The rows this widget displays: the whole directory page, narrowed by the widget's
 * own tag chips. That narrowing is local to this widget on purpose -- it is a way to
 * read a list, not a filter on the dashboard -- and the widget says so on its face. */
function directoryRows() {
  const rows = state.bundle?.directory?.rows || [];
  if (!state.directoryTags.size) return rows;
  return rows.filter((row) => [...state.directoryTags].every((tag) => (row.tags || []).includes(tag)));
}

function directorySection() {
  const id = "people-leaders-directory";
  const heading = "Leaders Directory";
  const directory = state.bundle?.directory;
  const columns = [
    { key: "leader", label: "Leader" },
    { key: "role", label: "Role" },
    { key: "teams", label: "Teams" },
    { key: "tags", label: "Tags" },
    { key: "campus", label: "Campus" },
    { key: "since", label: "Leading since", kind: "date" },
  ];
  const base = { id, heading, kind: "table", personLevel: true, columns };
  if (!directory || directory.availability?.status !== "available") {
    return {
      ...base,
      rows: [],
      unavailable: directory?.availability?.reason
        || "The registered people-leaders-directory read was refused or unavailable. No leader is listed, which is different from there being none.",
    };
  }
  const tierLabel = new Map((state.bundle?.leaders?.tiers || []).map((tier) => [tier.id, tier.label]));
  const tagLabel = new Map(directoryTagVocabulary().map((tag) => [tag.id, tag.label]));
  const rows = directoryRows().map((row) => ({
    leader: row.name,
    role: tierLabel.get(row.role) || humanize(row.role),
    teams: (row.teams || []).length ? row.teams.join(", ") : null,
    tags: (row.tags || []).length ? row.tags.map((tag) => tagLabel.get(tag) || humanize(tag)).join(", ") : null,
    campus: row.campus,
    since: row.since ? formatDate(row.since) : null,
  }));
  return { ...base, rows };
}

/* ------------------------------------------------------- the step pivot table -- */

/* Which dimension the step columns carry. barReading() answers a single filtered
 * axis from the bundle's own per-dimension aggregate and falls back to the stack
 * dimension when no axis is filtered; the columns follow the same rule, so the table
 * and the bars can never disagree about what they are showing. */
function stepSegments() {
  const dims = activeFilterDimensions();
  if (dims.length === 1) {
    const dim = dims[0];
    return { dim, segments: STACKS[dim].filter((segment) => state.filters[dim].has(segment.key)) };
  }
  return { dim: state.stack, segments: STACKS[state.stack] };
}

function stepPivotSection() {
  const id = "pathway-steps";
  const heading = "People on each step";
  const { dim, segments } = stepSegments();
  const columns = [
    { key: "group", label: "Pathway" },
    { key: "step", label: "Step" },
    ...segments.map((segment) => ({ key: segment.key, label: segment.label, kind: "number" })),
    { key: "total", label: "People", kind: "number" },
    { key: "share", label: "Of largest step", kind: "percent" },
  ];
  const pathways = state.bundle?.pathways || [];
  if (!pathways.length) {
    return { id, heading, kind: "pivot", columns, rows: [], unavailable: "No pathway configuration came back with this bundle, so there are no steps to count." };
  }

  const rows = [];
  for (const path of pathways) {
    for (const step of path.steps || []) {
      const reading = barReading(step);
      if (reading.kind === "aggregate") {
        for (const signal of step.aggregateSignals || []) {
          const line = { group: `${path.label} · Front Door`, step: signal.label, total: signal.value ?? null, share: null };
          for (const segment of segments) line[segment.key] = null;
          rows.push(line);
        }
        continue;
      }
      const suffix = reading.kind === "ghost"
        ? ", no schema yet"
        : (reading.kind === "unavailable" ? `, unavailable: ${reading.reason}` : "");
      const line = { group: path.label, step: `${step.label}${suffix}`, total: null, share: null };
      const breakdown = reading.kind === "value" ? (step.segments?.[dim] || null) : null;
      for (const segment of segments) {
        line[segment.key] = breakdown ? (Number(breakdown[segment.key]) || 0) : null;
      }
      if (reading.kind === "value") line.total = reading.total ?? null;
      rows.push(line);
    }
  }
  const largest = rows.reduce((top, row) => (Number.isFinite(row.total) && row.total > top ? row.total : top), 0);
  for (const row of rows) {
    if (Number.isFinite(row.total) && largest > 0 && !String(row.group).includes("Front Door")) {
      row.share = sharePercent(row.total, largest);
    }
  }
  const ghosts = rows.filter((row) => String(row.step).includes("no schema yet")).length;
  const note = ghosts
    ? `${ghosts} steps are reserved with no Rock schema yet. A reserved step isn't a zero, and its row stays on the table.`
    : "Every step on this page answered.";
  return { id, heading, kind: "pivot", columns, rows, note };
}

/* ------------------------------------------------------------ movement table -- */

function movementSection() {
  const id = "movement";
  const heading = "Movement since last Sunday";
  const columns = [
    { key: "movement", label: "Movement" },
    { key: "in", label: "In", kind: "number" },
    { key: "out", label: "Out", kind: "number" },
    { key: "net", label: "Net", kind: "number" },
    { key: "counts", label: "Counts toward total" },
  ];
  const wf = state.bundle?.waterfall;
  if (!wf) {
    return { id, heading, kind: "table", columns, rows: [], unavailable: "Movement is unavailable because the registered aggregate read was refused or malformed. Unavailable isn't zero." };
  }
  const rows = (wf.movements || []).map((move) => {
    const delta = move.delta;
    const known = delta !== null && delta !== undefined;
    return {
      movement: move.label,
      in: known && delta > 0 ? delta : (known ? 0 : null),
      out: known && delta < 0 ? Math.abs(delta) : (known ? 0 : null),
      net: known ? delta : null,
      counts: move.affectsTotal ? "yes" : "within-path",
    };
  });
  for (const kind of wf.unavailableKinds || []) {
    rows.push({
      movement: `${KIND_LABELS[kind] || kind}: not counted yet`,
      in: null,
      out: null,
      net: null,
      counts: LOSS_KINDS.has(kind) || STALL_KINDS.has(kind) ? "against the total" : "toward the total",
    });
  }
  const anchors = wf.status === "partial"
    ? "Both anchors are unavailable on this bundle, so the table shows the counted movements without a population to reconcile against."
    /* Only the leading capital is dropped: the label reads "Last Sunday", and
     * lower-casing the whole thing turned a weekday into "sunday" mid-sentence. */
    : `${formatCount(wf.anchorBefore)} people ${String(wf.anchorBeforeLabel || "before").replace(/^[A-Z]/, (letter) => letter.toLowerCase())} · ${formatCount(wf.anchorNow)} now.`;
  const focus = activeFilterDimensions().length
    ? " Full population: movement under the focus filters needs a live query, and this bundle will not guess it."
    : "";
  return { id, heading, kind: "table", columns, rows, note: `${anchors}${focus}` };
}

/* ----------------------------------------------------------- freshness table -- */

function freshnessBands(row) {
  let inside = 0; let past = 0; let far = 0;
  for (const bin of row.densityBins || []) {
    if (bin.fromDays >= row.windowDays * 2) far += bin.count;
    else if (bin.fromDays >= row.windowDays) past += bin.count;
    else inside += bin.count;
  }
  return { inside, past, far, total: inside + past + far };
}

function freshnessSection() {
  const id = "freshness";
  const heading = "Freshness by recency band";
  const columns = [
    { key: "step", label: "Step" },
    { key: "window", label: "Season (days)", kind: "number" },
    { key: "inside", label: "Inside window", kind: "number" },
    { key: "past", label: "Past window", kind: "number" },
    { key: "far", label: "Twice window and beyond", kind: "number" },
    { key: "undated", label: "Undated", kind: "number" },
    { key: "people", label: "People", kind: "number" },
  ];
  const path = activePath();
  const rows = (state.bundle?.freshness || []).filter((row) => path.steps.some((step) => step.id === row.stepId));
  if (!rows.length) {
    const status = state.bundle?.meta?.queryAvailability?.["people-pathway-freshness"]?.status;
    return {
      id,
      heading,
      kind: "table",
      columns,
      rows: [],
      unavailable: status === "available"
        ? "The bounded freshness read returned no rows for these pathways. That's an empty result, not an unavailable one."
        : "Freshness is unavailable because the registered aggregate read was refused or malformed. Unavailable isn't zero.",
    };
  }
  const out = rows.map((row) => {
    const step = path.steps.find((candidate) => candidate.id === row.stepId);
    const bands = freshnessBands(row);
    return {
      step: step ? step.label : humanize(row.stepId),
      window: row.windowDays,
      inside: bands.inside,
      past: bands.past,
      far: bands.far,
      // Counted on the step, no date to age from. Kept as its own column so it is
      // never quietly folded into "inside the window".
      undated: row.undatedPeople || 0,
      people: bands.total + (row.undatedPeople || 0),
    };
  });
  const stalest = out.reduce((top, row) => ((row.past + row.far) > (top ? top.past + top.far : -1) ? row : top), null);
  const focus = activeFilterDimensions().length
    ? " The bands stay full-population until a live query serves the focus filters."
    : "";
  const note = stalest
    ? `${stalest.step} carries the most people past their season: ${formatCount(stalest.past + stalest.far)}.${focus}`
    : "";
  return { id, heading, kind: "table", columns, rows: out, note };
}

/* --------------------------------------------------------- prose and people -- */

function colophonSection() {
  return {
    id: "colophon",
    heading: "Where these numbers come from",
    kind: "prose",
    text: "The live staff-locked Rock page reads production through registered, reviewed, SELECT-only named queries. Missing data renders as unavailable with its reason; nothing on this page is invented client-side. Normal Rock staff page authorization is the viewer boundary."
      + (state.bundle?.fictional ? " This render is fictional prototype data, labelled in the masthead." : ""),
  };
}

function trajectorySection() {
  const drawn = filteredPeople().filter((candidate) => (candidate.trajectory || []).length > 0).length;
  return {
    id: "trajectories",
    heading: "Person trajectories",
    kind: "prose",
    personLevel: true,
    text: `${drawn} people are drawn in the Creative trajectory overlay under the current filters. This is a person-level display on a staff-locked page: it has no Classic table, no export rail, and it never enters the package.`,
  };
}

/* One list, one order, and it is what the page is actually rendering right now:
 * the People chapter exists only in Classic, the trajectory overlay only in
 * Creative, and both compositions read the same slice through the same predicate. */
function classicSections() {
  const sections = [];
  if (state.mode === "classic") {
    sections.push(peopleBaseSection());
    sections.push(compositionSection());
    sections.push(ageGenderSection());
    sections.push(leaderCountsSection());
    sections.push(directoryCountsSection());
    sections.push(directorySection());
  }
  sections.push(stepPivotSection());
  if (state.mode !== "classic") sections.push(trajectorySection());
  sections.push(movementSection());
  sections.push(freshnessSection());
  sections.push(colophonSection());
  return sections;
}

function sectionById(id) {
  return classicSections().find((section) => section.id === id) || null;
}

/* ------------------------------------------------------------- the view model -- */

/* The complete, addressable description of what the viewer is looking at: the
 * contract every artifact on this page is built from (apps/shared/dashboard-view.mjs).
 *
 * Exported as this island's one test seam: the dev workbench runs validateView() over
 * it on every render, so a section that loses its id or its kind fails visibly on the
 * page instead of quietly producing a malformed export. The production wrapper loads
 * this module for its side effect and never reads the export. */
export function buildView() {
  // The address bar always carries the whole view, so read it after the writer ran.
  writeHash();
  const filters = {
    stack: state.stack,
    lifecycle: [...state.filters.lifecycle].sort(),
    gender: [...state.filters.gender].sort(),
    age: [...state.filters.age].sort(),
  };
  const summary = filterSummaryLine(filters, {
    stack: "Stacked by",
    lifecycle: "Lifecycle",
    gender: "Gender",
    age: "Age group",
  });
  return {
    surface: SURFACE,
    mode: state.mode,
    /* The palette the reader is actually looking at, so a rebuilt report matches the view it
     * came from (#248). Read off the root rather than off the control, because the root is
     * the switch: the attribute is the state, and it is right even before the swatch mounts. */
    theme: state.root?.dataset.theme || null,
    url: window.location.href,
    filters,
    filterSummary: `Scope ${state.bundle?.meta?.campus || "unavailable"} · ${summary}`,
    templateVersion: TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    fictional: Boolean(state.bundle?.fictional),
    sections: classicSections(),
    controls: state.controls,
  };
}

/* --------------------------------------------------------------- chart aids -- */

function aidSvg(className, width, height, label) {
  const svg = svgEl("svg", {
    class: `cwaid ${className}`, viewBox: `0 0 ${width} ${height}`, width, height,
    role: "img", "aria-label": label,
  });
  return svg;
}

/* A donut is the aid, never the reading: every share it draws is a column in the
 * table beside it, and its label reads the whole composition out loud. */
function donutAid(parts, label) {
  const size = 132;
  const radius = 46;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = parts.reduce((sum, part) => sum + (Number(part.value) || 0), 0);
  const svg = aidSvg("cwaid--donut", size, size, label);
  const ring = svgEl("circle", {
    class: "cwaid__ring", cx: centre, cy: centre, r: radius, fill: "none", "stroke-width": 18,
  });
  svg.append(ring);
  if (!total) return svg;
  let offset = 0;
  for (const part of parts) {
    const value = Number(part.value) || 0;
    if (value <= 0) continue;
    const length = (value / total) * circumference;
    const arc = svgEl("circle", {
      cx: centre, cy: centre, r: radius, fill: "none", "stroke-width": 18,
      stroke: `var(${part.token})`,
      "stroke-dasharray": `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`,
      "stroke-dashoffset": `${(-offset).toFixed(2)}`,
      transform: `rotate(-90 ${centre} ${centre})`,
    });
    svg.append(arc);
    offset += length;
  }
  return svg;
}

/* The Creative waterfall, shrunk to an aid beside the movement table: same centre
 * axis, same sign convention, gains right and losses left. */
function movementAid(rows) {
  const width = 220;
  const rowHeight = 15;
  const gap = 5;
  const height = Math.max(40, rows.length * (rowHeight + gap) + 6);
  const known = rows.filter((row) => Number.isFinite(row.net));
  const peak = known.reduce((top, row) => Math.max(top, Math.abs(row.net)), 1);
  const mid = width / 2;
  const svg = aidSvg("cwaid--waterfall", width, height, `Movement, ${known.length} counted kinds around a centre axis; the exact values are in the table.`);
  svg.append(svgEl("line", { class: "cwaid__axis", x1: mid, x2: mid, y1: 2, y2: height - 2 }));
  rows.forEach((row, index) => {
    const top = 3 + index * (rowHeight + gap);
    if (!Number.isFinite(row.net)) {
      svg.append(svgEl("rect", {
        class: "cwaid__ghost", x: mid - 14, y: top, width: 28, height: rowHeight,
      }));
      return;
    }
    const span = Math.max(2, (Math.abs(row.net) / peak) * (width / 2 - 6));
    const gain = row.net >= 0;
    svg.append(svgEl("rect", {
      class: `cwaid__bar ${gain ? "is-gain" : "is-loss"}`,
      x: gain ? mid : mid - span, y: top, width: span, height: rowHeight,
    }));
  });
  return svg;
}

/* Freshness as three stacked bands per step: inside the season, past it, and twice
 * past it. The counts are the row beside it; this is the silhouette. */
function freshnessAid(rows) {
  const width = 220;
  const rowHeight = 13;
  const gap = 7;
  const height = Math.max(40, rows.length * (rowHeight + gap) + 6);
  const peak = rows.reduce((top, row) => Math.max(top, row.people || 0), 1);
  const svg = aidSvg("cwaid--bands", width, height, `Freshness bands for ${rows.length} steps: inside the season, past it, and twice past it. The counts are in the table.`);
  rows.forEach((row, index) => {
    const top = 3 + index * (rowHeight + gap);
    let x = 0;
    for (const band of [
      { key: "inside", cls: "is-fresh" },
      { key: "past", cls: "is-stalled" },
      { key: "far", cls: "is-stale" },
    ]) {
      const value = Number(row[band.key]) || 0;
      if (value <= 0) continue;
      const span = (value / peak) * (width - 4);
      svg.append(svgEl("rect", { class: `cwaid__band ${band.cls}`, x, y: top, width: Math.max(1, span), height: rowHeight }));
      x += span;
    }
  });
  return svg;
}

/* The People bar, split into the same three bands as the chart: inside the season, past
 * it, and twice past it, on one scale (the largest People count). Undated people are the
 * unfilled rest of the track. Rows are built in `rows` order and sorting moves the same
 * nodes, so the bands survive a re-sort. */
function freshnessBarBands(table, rows) {
  const peak = rows.reduce((top, row) => Math.max(top, row.people || 0), 0);
  const trs = [...(table.tBodies[0]?.rows || [])];
  rows.forEach((row, index) => {
    const track = trs[index]?.querySelector(".ct__bar-track");
    if (!track || peak <= 0) return;
    track.replaceChildren();
    track.classList.add("ct__bar-track--bands");
    for (const band of [
      { key: "inside", cls: "is-fresh" },
      { key: "past", cls: "is-stalled" },
      { key: "far", cls: "is-stale" },
    ]) {
      const value = Number(row[band.key]) || 0;
      if (value <= 0) continue;
      const span = el("span", `ct__bar-band ${band.cls}`);
      span.style.width = `${(value / peak) * 100}%`;
      track.append(span);
    }
  });
}

/* PNG travels with the node the viewer is actually looking at, so the same rail
 * button is honest in both modes (contract §6, plan §15). */
function classicAidNode(sectionId) {
  return state.root?.querySelector(`#cw-${sectionId} .cw__aid svg`) || null;
}

function pngFrom(node) {
  if (!node) return Promise.reject(new Error("no chart to save as an image"));
  const ground = state.root ? getComputedStyle(state.root).getPropertyValue("--surface").trim() : "";
  return exportSvgToPng(node, { background: ground || null });
}

function movementPng() {
  return pngFrom(state.mode === "classic"
    ? classicAidNode("movement")
    : state.root?.querySelector("#chapter-wf .wf__svg"));
}

function freshnessPng() {
  return pngFrom(state.mode === "classic" ? classicAidNode("freshness") : null);
}

function compositionPng() {
  return pngFrom(classicAidNode("people-composition"));
}

/* --------------------------------------------------------------- the rails -- */

function markRailUnavailable(rail) {
  if (!rail) return;
  for (const button of rail.querySelectorAll(".xrail__btn")) {
    button.classList.add("tool__off");
    button.setAttribute("aria-disabled", "true");
    if (button.tagName === "BUTTON") button.disabled = true;
    button.title = CLASSIC_UNAVAILABLE_EXPORT;
  }
}

function mountSectionRail(host, section, png) {
  const options = {
    registry: exportRegistry,
    id: section.id,
    title: section.heading,
    table: () => sectionById(section.id),
  };
  if (typeof png === "function" && !section.unavailable) options.png = png;
  const rail = mountExportRail(host, options);
  if (section.unavailable) markRailUnavailable(rail);
  return rail;
}

/* The Creative chapters carry the same rail, in the same corner of the chapter head,
 * exporting the same live table the Classic widget does. */
function mountChapterRail(chapter, sectionId, png) {
  const head = state.root?.querySelector(`#chapter-${chapter} .chapter__head`);
  if (!head) return;
  const previous = head.querySelector(".chapter__tools");
  if (previous) previous.remove();
  const section = sectionById(sectionId);
  if (!section) return;
  const tools = el("div", "chapter__tools");
  mountSectionRail(tools, section, png);
  head.append(tools);
}

/* ------------------------------------------------------------ classic widgets -- */

function infoPop(title, paragraphs) {
  const holder = document.createDocumentFragment();
  for (const text of paragraphs.filter(Boolean)) holder.append(el("p", "info-pop__p", text));
  return infoDisc(holder, { label: `About ${title}` });
}

/* Give one column of a built table the numeric cell treatment (right-aligned, Arial
 * tabular) without touching the section it was built from. Display only. */
function alignAsNumbers(table, headerLabel) {
  const headers = [...table.querySelectorAll("thead th")];
  const index = headers.findIndex((th) => th.textContent.trim() === headerLabel);
  if (index < 0) return;
  headers[index].classList.add("ct__num");
  for (const row of table.querySelectorAll("tbody tr")) {
    const cell = row.children[index];
    if (cell) cell.classList.add("ct__num");
  }
}

function classicPanel(section, { question, info, half = false, aid = null, png = null }) {
  const widget = classicWidget({
    id: `cw-${section.id}`,
    title: section.heading,
    question,
    info: infoPop(section.heading, info),
    aid: section.unavailable ? null : aid,
  });
  if (half) widget.root.classList.add("cw--half");
  mountSectionRail(widget.railHost, section, png);
  if (section.unavailable) {
    widget.body.append(unavailablePanel(section.unavailable));
  }
  widget.setNote(section.unavailable ? "" : (section.note || ""));
  return widget;
}

function paletteHost() {
  if (!MOBILE.matches) return state.root;
  const sidebar = state.root ? state.root.querySelector("#filter-sidebar") : document.querySelector("#filter-sidebar");
  if (!sidebar) return state.root;
  const form = sidebar.querySelector(".filter-form");
  const target = form || sidebar;
  let slot = sidebar.querySelector(".palette-slot");
  if (!slot) {
    slot = el("fieldset", "filter-fieldset palette-slot");
    const legend = el("legend", "filter-legend");
    legend.append(el("span", null, "Palette"));
    legend.append(el("span", "sub", "how the board looks"));
    slot.append(legend);
    target.append(slot);
  } else if (slot.parentElement !== target) {
    target.append(slot);
  }
  return slot;
}

function mountPalette() {
  if (!state.root) return;
  /* This used to reach over and clear the chevron's inline transform on mobile -- a
   * function about the palette undoing a style set by the console toggle, because an
   * inline transform is the one thing the mobile stylesheet could not override. The
   * mark is pure CSS now, so the coupling is gone with it. */
  const host = paletteHost();
  if (state.paletteHost === host) return;
  if (state.themeSwatch && state.themeSwatch.element) state.themeSwatch.element.remove();
  const slot = state.root.querySelector(".palette-slot");
  if (slot && host !== slot) slot.remove();
  state.paletteHost = host;
  state.themeSwatch = mountThemeSwatch(host, {
    root: state.root,
    surface: SURFACE.id,
    seed: state.root?.dataset?.theme || null,
    themes: PALETTES,
    onChange: (theme) => {
      syncStackAccent();
      announce(theme ? `${themeName(theme)} palette.` : "Default palette.");
    },
  });
  mountPen(host);
}

/* Executive Markup (#598): the pen beside the palette; lazy until pressed. */
function mountPen(host) {
  if (state.markup) { state.markup.remount(host); return; }
  state.markup = mountMarkup(state.root, {
    surface: { id: "pathways", title: SURFACE.title },
    host,
    frame: state.root,
    context: () => ({ mode: state.root?.dataset?.mode || null, theme: state.root?.dataset?.theme || null, filterSummary: filterSummaryLine(state.filters) || null, url: window.location.href, title: document.title }),
    announce: (message) => announce(message, { visible: false }),
  });
}

function renderClassic() {
  const mount = state.root?.querySelector("#pathways-classic");
  if (!mount) return;
  // Creative keeps every node it drew; the Classic grid is only hidden, so switching
  // back is instant and identical. Nothing here touches the Creative DOM.
  if (state.mode !== "classic") return;
  mount.replaceChildren();
  const grid = el("div", "classic-grid");
  const sections = new Map(classicSections().map((section) => [section.id, section]));

  /* P1 -- the quiet strip. */
  const base = sections.get("people-base");
  const baseWidget = classicPanel(base, {
    question: "How many people do we have?",
    info: [
      "Every tile counts active people in the Favor People base once, under the filters the console is holding. The age groups are Favor's own, and Unknown is a group, not a gap.",
      "The Leader : person tile takes its numerator from the Leader cohort of this same base, so it compares like with like. The tier table below answers a different question: how many leader places there are, by role.",
      state.bundle?.fictional ? "This render is fictional prototype data." : null,
    ],
  });
  /* The strip borrows the widget frame; cw--strip lets the stylesheet run it flush
   * and keep the body unclipped, so the tiles' (i) popovers can leave the box. */
  baseWidget.root.classList.add("cw--strip");
  if (base.unavailable) grid.append(baseWidget.root);
  else {
    baseWidget.body.append(kpiStrip(base.kpis, { label: "People readings" }));
    grid.append(baseWidget.root);
  }

  /* P2 -- cohort composition against the 15/35/35/15 reference. */
  const composition = sections.get("people-composition");
  const donutParts = composition.unavailable ? [] : composition.rows.map((row) => ({
    value: row.people,
    token: (LIFECYCLE.find((cohort) => cohort.label === row.cohort) || {}).token || "--move-neutral",
  }));
  const donutLabel = composition.unavailable
    ? "Composition unavailable"
    : `Composition: ${composition.rows.map((row) => `${row.cohort} ${row.share ?? "—"}%`).join(", ")}`;
  const compositionWidget = classicPanel(composition, {
    question: "How is the base composed?",
    half: true,
    aid: composition.unavailable ? null : donutAid(donutParts, donutLabel),
    png: compositionPng,
    info: [
      "Counts of active people by connection status under the current filters. Reference is the 15 / 35 / 35 / 15 shape the People PRD set for the base; Difference is this slice minus that reference, in percentage points.",
      "The reference is a target, not a measurement: a difference is a conversation, never a defect.",
    ],
  });
  if (!composition.unavailable) {
    const table = dataTable(composition, {
      caption: "Active people in the current slice. One person holds exactly one connection status.",
      inlineBarKey: "people",
    });
    /* Difference is signed points rendered as text (so the export keeps the sign and
     * unit); on the page it is still a number and reads in the numeric column voice. */
    alignAsNumbers(table, "Difference");
    compositionWidget.body.append(table);
  }
  grid.append(compositionWidget.root);

  /* P3 -- age by gender. */
  const spread = sections.get("people-age-gender");
  const spreadWidget = classicPanel(spread, {
    question: "How is the base distributed?",
    half: true,
    info: [
      "Favor age groups down the side, genders across the top. Gender columns follow the console's gender filter: narrow it and the columns you excluded leave rather than sit at zero.",
      "Unknown is an explicit row and an explicit column. Rock cannot resolve every birth date or gender, and those people are counted where they are, not folded into a neighbour.",
    ],
  });
  if (!spread.unavailable) {
    spreadWidget.body.append(dataTable(spread, {
      caption: "Active people in the current slice, counted once each.",
      inlineBarKey: "total",
      totalRow: spread.totalRow,
    }));
  }
  grid.append(spreadWidget.root);

  /* P4 -- leader counts by role, with the schema gaps rendered. */
  const leaders = sections.get("people-leaders");
  const leaderNotes = state.bundle?.leaders?.notes || [];
  const leaderGaps = (state.bundle?.leaders?.gaps || []).map((gap) => `${humanize(gap.role)}: ${gap.reason}`);
  const leaderWidget = classicPanel(leaders, {
    question: "How many leaders, by role?",
    info: [
      "Leader places by tier and campus. A person can hold more than one tier, so the rows do not sum to a number of people and there's no total row.",
      "Leader counts do not respond to the lifecycle, gender, or age filters: the registered leader rows carry no demographics, and narrowing them by a dimension they don't have would be a guess.",
      ...leaderNotes,
      ...leaderGaps,
    ],
  });
  if (!leaders.unavailable) {
    leaderWidget.body.append(pivotTable(leaders, {
      groupKey: "group",
      inlineBarKey: "total",
      caption: "Leader places by tier and campus. Rows marked schema gap are reserved, not zero.",
    }));
  }
  grid.append(leaderWidget.root);

  /* P5 -- the directory itself: display only, and its rail exports the counts. */
  const directory = sections.get("people-leaders-directory");
  const counts = sections.get("people-leaders-directory-counts");
  const page = state.bundle?.directory?.page;
  const directoryWidget = classicWidget({
    id: `cw-${directory.id}`,
    title: directory.heading,
    question: "Who are the leaders?",
    info: infoPop(directory.heading, [
      "Names on this widget are a display on a staff-locked page, at the classification the surface already carries. They are never exported and never enter the dashboard package: the export control beside this title emits aggregate role and team counts instead.",
      "The tag chips narrow this list only. They aren't a dashboard filter, they aren't in the address bar, and no other widget moves when you press one.",
      ...(state.bundle?.directory?.gaps || []).map((gap) => `${humanize(gap.tag)}: ${gap.reason}`),
    ]),
  });
  mountSectionRail(directoryWidget.railHost, counts, null);
  if (directory.unavailable) {
    directoryWidget.body.append(unavailablePanel(directory.unavailable));
  } else {
    directoryWidget.body.append(buildDirectoryChips());
    directoryWidget.body.append(dataTable(directory, {
      sortable: true,
      rowHeaderKey: "leader",
      caption: "Display only: aggregate role and team counts are what this widget exports.",
    }));
    const shown = directory.rows.length;
    const held = (state.bundle?.directory?.rows || []).length;
    const paging = page && page.exhaustive === false
      ? ` First page only, up to ${formatCount(page.limit)} rows: this is a bounded read, not an exhaustive directory.`
      : "";
    directoryWidget.setNote(`${formatCount(shown)} of ${formatCount(held)} leaders listed.${paging}`);
  }
  grid.append(directoryWidget.root);

  /* The movement chapters, in the Creative order. */
  const steps = sections.get("pathway-steps");
  const stepWidget = classicPanel(steps, {
    question: "Where does everyone sit on each pathway?",
    info: [
      "One row per step, in the order a person walks it, never re-sorted by size. The columns are the segments of whichever dimension the console is stacking by; filter a single dimension and the columns become the values you kept.",
      "Share is of the largest step in view, the same one shared scale the Creative bars use. Steps overlap: one person can hold several, so the column never sums to a population.",
      "Front Door is its own row group. Its four Sunday touchpoints are independent observations that overlap, so they are counted their own way and never added together.",
      "A reserved step with no Rock schema yet shows — in every cell and says so beside its name. Unavailable isn't zero.",
    ],
  });
  if (!steps.unavailable) {
    stepWidget.body.append(pivotTable(steps, {
      groupKey: "group",
      inlineBarKey: "total",
      caption: "Unique people per step under the current filters. One person counts once per step.",
    }));
  }
  grid.append(stepWidget.root);

  const movement = sections.get("movement");
  const movementWidget = classicPanel(movement, {
    question: "What changed this week?",
    aid: movement.unavailable ? null : movementAid(movement.rows),
    png: movementPng,
    info: [
      `Set and drift against ${state.bundle?.waterfall?.compareDate ? formatDate(state.bundle.waterfall.compareDate) : "the comparison Sunday"}. In and Out are the same signed movement read twice, so a kind is either one or the other and never both.`,
      "Within-path movements shift people between steps without changing the population, which is why they are marked rather than netted into the total.",
      "A kind marked not counted yet is reserved: the movement is real and the count isn't recorded in Rock yet.",
    ],
  });
  if (!movement.unavailable) {
    movementWidget.body.append(dataTable(movement, {
      caption: state.bundle?.waterfall?.compareDate
        ? `Movement since ${formatDate(state.bundle.waterfall.compareDate)}, by kind. In and Out are the same signed movement, read twice.`
        : "Movement since the comparison Sunday, by kind. The comparison date is unavailable.",
    }));
  }
  grid.append(movementWidget.root);

  const freshness = sections.get("freshness");
  const freshnessWidget = classicPanel(freshness, {
    question: "How stale is each step's crowd?",
    /* No side aid: this table is too wide to share its row with a chart, and the aid slid
     * under the People column. The bands live in each row's bar instead (below). */
    aid: null,
    png: freshnessPng,
    info: [
      "Each step has its own expected season, so freshness is measured against that step's window rather than one calendar rule for the whole page.",
      "The bands come from the aggregate density bins, which carry the true population. The Creative beeswarm draws the same people as dots.",
      "Steps overlap, so the People column doesn't add up to a population and there's no total row.",
    ],
  });
  if (!freshness.unavailable) {
    const table = dataTable(freshness, {
      caption: "People inside, past, and far past each step's expected season.",
      inlineBarKey: "people",
      sortable: true,
    });
    freshnessBarBands(table, freshness.rows);
    freshnessWidget.body.append(table);
    /* The PNG rail rasterizes the band chart, so it still renders, off-screen at its real
     * size (the exporter measures the node), and is never announced twice. */
    const pngSource = el("div", "cw__aid cw__aid--offstage");
    pngSource.setAttribute("aria-hidden", "true");
    pngSource.append(freshnessAid(freshness.rows));
    freshnessWidget.root.append(pngSource);
  }
  grid.append(freshnessWidget.root);

  mount.append(grid);
}

/* The Leaders Directory's own tag chips: a local narrowing of the rows this widget
 * displays, plus the tags Rock has no schema for, rendered in the honest disabled
 * form with the reason on them rather than as boxes nobody has ticked. */
function buildDirectoryChips() {
  const bar = el("div", "dirchips");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Narrow this list by tag");
  bar.append(el("span", "dirchips__label", "Tags (this list only)"));
  for (const tag of directoryTagVocabulary()) {
    const active = state.directoryTags.has(tag.id);
    const chip = el("button", `dirchip ${active ? "is-active" : ""}`, tag.label);
    chip.type = "button";
    chip.dataset.tag = tag.id;
    chip.setAttribute("aria-pressed", String(active));
    chip.title = tag.source ? `Source: ${tag.source}` : "";
    chip.addEventListener("click", () => {
      if (state.directoryTags.has(tag.id)) state.directoryTags.delete(tag.id);
      else state.directoryTags.add(tag.id);
      renderClassic();
      announce(`Leaders Directory narrowed to ${state.directoryTags.size || "no"} tag filters. The dashboard filters did not change.`, { visible: false });
    });
    bar.append(chip);
  }
  const vocabulary = new Set(directoryTagVocabulary().map((tag) => tag.id));
  for (const gap of state.bundle?.directory?.gaps || []) {
    if (vocabulary.has(gap.tag)) continue;
    const chip = el("span", "dirchip tool__off", humanize(gap.tag));
    chip.setAttribute("aria-disabled", "true");
    chip.title = gap.reason;
    bar.append(chip);
  }
  return bar;
}

if (typeof document !== "undefined") {
  const autoBoot = () => {
    const root = document.getElementById("pathways-root");
    if (root && root.dataset.manualBoot !== "true") boot(root);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoBoot);
  else autoBoot();
}
