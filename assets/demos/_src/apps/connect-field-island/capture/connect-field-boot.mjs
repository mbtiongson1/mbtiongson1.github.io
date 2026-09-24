import { buildModel, STATE, LEADER_LOAD_THIN, LOGGED_RATE_WATCH, rollupBands } from "./connect-field-source.mjs?v=20260922_794";
import {
  bindExportDelegation, createExportRegistry, exportSvgToPng, mountExportRail,
} from "./dashboard-export.mjs?v=20260922_794";
import { buildDashboardPackage, mountCopyPrompt, mountPackageControl } from "./dashboard-prompt.mjs?v=20260922_794";
import { mountThemeSwatch } from "./dashboard-theme.mjs?v=20260922_794";
import { themeName } from "./dashboard-view.mjs?v=20260922_794";
import {
  bindInfoDismissal, classicWidget, dataTable, kpiStrip, modeSwitch, pivotTable, sparkline,
  unavailablePanel as classicUnavailable,
} from "./classic-widgets.mjs?v=20260922_794";
import { mountTooltipLayer, tooltipContent } from "./dashboard-tooltip.mjs?v=20260922_794";
import { mountStatus, markChanged, motionMs, trackHostChrome } from "./dashboard-status.mjs?v=20260922_794";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_794";
import "./dashboard-breadcrumbs.mjs?v=20260922_794";

/* exec/connect — Connect Health · island runtime.
 *
 * One operations room over every active Connect Group. The Rock block
 * server-renders the markup fragment, appends the passive JSON island
 * (#connect-field-data), and loads this module; this module validates that
 * payload through connect-field-source.mjs and fills every mount. Zero
 * dependencies, zero compilation, and no remote import: everything this module
 * needs arrives from the island's own packaged assets.
 *
 * It is NOT network-free any more, and it used to be. The Plotboard reaches two
 * allowlisted OpenStreetMap hosts — tiles, and a locality lookup — because a drawn
 * basemap could only ever show places somebody had already drawn, and a Connect in
 * an unanticipated municipality was dropped from the board in silence (operator
 * ruling 2026-09-04, reversing #231). Every NUMBER on this page still comes from
 * what the server put here and nothing else; the network only answers "where is
 * this municipality". See docs/connect-map-allowlist.md.
 *
 * Honesty contract (issue #164). Three states must never be confusable:
 *
 *   skeleton      filled, shimmering, purple, carrying a `?`  (.ghost-bar /
 *                 .ghost-row / .ghost-num) — the console is still working.
 *   real zero     the numeral 0 in --ink on an unbroken baseline (.state-zero)
 *                 — we looked, and the answer is none.
 *   unavailable   hollow, dashed, never animated (.station-unavailable /
 *                 .is-unavailable), the word "Unavailable" and the reason
 *                 — we cannot look, and here is why.
 *
 * A refusal is never a zero. Retention, Progression, Demand and the map are not
 * tracked in this release, so every place the prototype drew a number for them
 * draws the unavailable state instead, and the health model names them as
 * uncomputed inputs rather than scoring them as healthy. `no meeting on record`
 * is its own rendering everywhere: Rock holds no AttendanceOccurrence row for
 * that group that week, which is neither a cancelled meeting nor a meeting
 * nobody entered attendance for.
 *
 * Privacy: no person id, name, contact value, address, landmark, or coordinate
 * may enter this DOM or any URL it builds. A Connect Group's own name and its
 * Region and Cluster parents all carry the names of the people who lead them, so
 * none of them is ever emitted. A group is titled instead from the PII-free
 * fields the read already returns — `groupTitle()`, the one naming function on
 * this page — and the only link target is
 * #
 *
 * The map ships MapLibre GL JS vendored into this island's own packaged assets, and
 * no longer ships its geography. The earlier build drew a hand-authored basemap so
 * the Plotboard could reach no tile server and no geocoder (Operator Decision
 * 2026-09-02, issue #231); that decision was reversed on 2026-09-04, because a drawn
 * basemap can only ever show places someone already drew, and a Connect in a
 * municipality nobody anticipated was dropped from the board without a word. The
 * Plotboard now renders real OpenStreetMap tiles and resolves an unknown locality
 * against a geocoder, so it DOES make network calls -- two hosts, both allowlisted
 * and both recorded in docs/connect-map-allowlist.md.
 *
 * What did not change is the grain. The only thing that leaves this page is the name
 * of an administrative place -- a city, municipality, or district -- and never a
 * group, a home, a person, or any coordinate Rock holds. LOCALITY_CENTROIDS remains
 * the offline fast path for everything live today; the geocoder is only ever asked
 * about a name it does not contain, once, and the answer is cached in the browser.
 */

/* ------------------------------------------------------------ vocabulary -- */

const HEALTH_ORDER = ["critical", "thin", "watch", "healthy", "unknown"];
const HEALTH_LABEL = {
  critical: "Critical", thin: "Thin", watch: "Watch", healthy: "Healthy", unknown: "Unknown",
};
const HEALTH_RANK = { critical: 4, thin: 3, watch: 2, healthy: 1, unknown: 0 };
/* Hues are read from the stylesheet's tokens rather than restated here, so the
 * palette has exactly one home. These strings are only ever assigned to
 * `style.background` / `style.fill`, never parsed. */
const HEALTH_TOKEN = {
  critical: "var(--critical)", thin: "var(--thin)", watch: "var(--watch)",
  healthy: "var(--healthy)", unknown: "var(--unknown)",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_BANDS = ["Morning", "Afternoon", "Early Evening", "Late Evening"];
/* Presentation order for the two Rock attribute axes. Anything the field holds
 * that is not on these lists is appended in alphabetical order rather than
 * dropped: the console never silently hides a shape the church actually has. */
const AGE_ORDER = ["Kids", "Youth", "Young Adults", "Adults", "Seasoned"];
const CAMPUS_ORDER = ["MNL", "BNE", "SEL"];
const MOBILE = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 768px)")
  : { matches: false, addEventListener: () => {} };
const CAMPUS_SORT_ORDER = { MNL: 1, BNE: 2, SEL: 3, ALL: 4 };
function compareCampuses(a, b) {
  const rankA = CAMPUS_SORT_ORDER[String(a).toUpperCase()] || 99;
  const rankB = CAMPUS_SORT_ORDER[String(b).toUpperCase()] || 99;
  return rankA - rankB || String(a).localeCompare(String(b));
}
const TYPE_ORDER = [
  "Men & Women", "Women Only", "Single", "Couples", "College Students", "Men Only", "Single Moms",
];

const CONNECT_URL = "#";

/* Said once, in every place that used to claim the opposite. Connect group titles are
 * the titles Rock holds, and at Favor those read "age band // leader first name", so
 * the Group column of the pressure and queue tables carries a first name. #208 settled
 * that for the screen (a pastor identifies these groups by their leader, and an
 * age-band-plus-reference title is not recognisable in the field). Classic gave those
 * two tables export rails, which carried the same name into .xlsx, the clipboard, the
 * package and the deep-dive prompt -- a widening #214's D8 deliberately left as its own
 * named decision. The operator named it on 2026-09-02: accept, and say so. Three strings
 * on this page previously read "No leader is named anywhere on this page"; they were
 * true when they were written and are not true now, so they say this instead. */
/* What the export controls on the two name-carrying tables say about their own files.
 * The default is "Aggregate rows only, no person data"; on these two it would be a false
 * statement printed on the control that does the exporting. boundaryFor() reads this off
 * the section, so the tooltip, the xlsx Provenance sheet and the package manifest cannot
 * drift into three different claims about one file. */
const LEADER_NAMING_BOUNDARY = "Aggregate rows only, but group titles carry a leader's first name";

const LEADER_NAMING_NOTE = "Leader counts here are counts, not names. The Group column is a different matter: it carries the group title Rock holds, and in this church those read \"age band // leader first name\", so a leader's first name is on screen and in anything exported from a table that shows it. Group titles were kept readable on purpose, because a group is recognised in the field by who leads it, and exports now carry them for the same reason.";

/* The surface's own identity, as the export artifacts, the copy prompt and the
 * package all have to name it. Route and title are the page's, not this file's
 * invention: they match ops/surfaces.json and the masthead. */
const SURFACE = Object.freeze({ id: "favor-exec-connect", title: "Connect Health", route: "exec/connect" });
/* The asset version this module was actually served under, read off its own
 * import URL rather than restated, so a stale cache can never claim to be a
 * fresh template in an exported artifact. */
const TEMPLATE_VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";

/* One sentinel for "the attribute is not set on this group". It leads with
 * U+2400 SYMBOL FOR NULL, a printable glyph no Rock attribute value or free-text
 * locality will ever contain, so a genuine label can never collide with it. It
 * keeps unset groups inside every denominator — a matrix row, a select option, a
 * locality row of their own — instead of letting them fall quietly out of the
 * count. It is never rendered: `labelFor` turns it into "Not set" first. */
const NOT_SET = "\u2400not-set";
const NOT_SET_LABEL = "Not set";

/* Queue thresholds. Stated here, not buried in the sort, because they are the
 * reading this console offers rather than facts about Rock. */
const QUEUE_LENGTH = 8;

/* The SVG namespace is read off an <svg> the server already rendered rather than
 * restated as a literal here, so the only absolute URL anywhere in this runtime
 * is the approved connect.example.invalid drill-through prefix above. */
let svgNamespace = null;

/* ----------------------------------------------------------------- state -- */

const state = {
  root: null,
  payload: null,
  model: null,
  reducedMotion: false,
  // The UX bar (#587): the shared status chip, mounted on first announce.
  status: null,
  collapsed: false,
  pinned: false,
  cardReturnFocus: null,
  documentBound: false,
  /* Display mode (#214/#215): Classic is a second renderer over this same
   * filtered slice, never a second filter model (D1/D4). Creative is the
   * default and, in this phase, the only reading that paints differently --
   * see buildModeSwitch() and the renderClassic() seam below. */
  mode: "creative",
  /* The console's own control grammar, regenerated by buildSidebar() as it
   * builds each control group and handed to the computer-use prompt verbatim.
   * One source builds the console and describes it, so the prompt cannot drift
   * from the sidebar the way a hand-written list would (#220 §11). */
  controls: [],
  /* Mount-once latches. The export rails, the masthead tools and the delegated
   * click listener outlive every re-render; the Classic grid does not. */
  classicBound: false,
  mastheadMounted: false,
  creativeRailsMounted: false,
  /* The Plotboard's analytical question: pressure (default), capacity, network,
   * opportunity. Page state, not a filter and not in the URL -- changing the
   * question never changes which groups the page is reading (#258 §5). */
  plotMode: "pressure",
  /* One shared filter object. Every station reads this and only this, so a
   * cohort cell, a rhythm pocket, a canopy band, a mode panel, a board line, a
   * locality row and a console control are all the same gesture. */
  filters: {
    campus: "ALL",
    health: new Set(),
    age: new Set(),
    type: new Set(),
    meet: new Set(),
    unled: false,
    locality: "",
    day: "",
    band: "",
    canopy: "",
  },
};

/* ----------------------------------------------------------- DOM helpers -- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function svgHostNamespace() {
  if (svgNamespace) return svgNamespace;
  const host = state.root ? state.root.querySelector("svg") : null;
  svgNamespace = host ? host.namespaceURI : null;
  return svgNamespace;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(svgHostNamespace(), tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/* Compose a line of prose with emphasis without ever touching innerHTML. Every
 * value on this page comes from Rock, so the DOM is built from text nodes and
 * nothing on this page can be interpreted as markup. */
function rich(tag, className, parts) {
  const node = el(tag, className);
  for (const part of parts) {
    if (part === null || part === undefined || part === false) continue;
    if (typeof part === "string") node.append(document.createTextNode(part));
    else if (part instanceof Node) node.append(part);
    else if (part.strong !== undefined) node.append(el("strong", part.className || null, part.strong));
    else if (part.em !== undefined) node.append(el("em", part.className || null, part.em));
    else if (part.text !== undefined) node.append(el("span", part.className || null, part.text));
  }
  return node;
}

function mount(id) {
  return state.root ? state.root.querySelector(`#${id}`) : null;
}

function fill(id, ...nodes) {
  const target = mount(id);
  if (target) target.replaceChildren(...nodes.filter(Boolean));
  return target;
}

const fmt = (value) => (typeof value === "number" ? value.toLocaleString("en-US") : String(value));
const pct = (part, whole) => (whole ? (100 * part) / whole : 0);
const round1 = (value) => Math.round(value * 10) / 10;

/* The UX bar (#587): every announce() is said twice, once to the live region for assistive
 * tech and once as the status chip for everyone else. Filter chatter passes visible: false
 * and is explained by the stations it changed instead (markChanged, in applySelection). */
function announce(message, { visible = true } = {}) {
  const live = mount("connect-live");
  if (live) live.textContent = message;
  if (!state.status && state.root) state.status = mountStatus(state.root, { live: null });
  if (state.status) state.status.announce(message, { visible });
}

/* --------------------------------------------- the three honest states --- */

/* Skeleton. The `?` glyph is drawn by the stylesheet's ::after so it cannot be
 * mistaken for a value; it is repeated into the accessible name here so a screen
 * reader hears the same "not yet known" the eye sees. */
function ghostBar(extraClass) {
  const node = el("span", extraClass ? `ghost-bar ${extraClass}` : "ghost-bar");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", "? Still loading. We don't know this value yet.");
  return node;
}

function ghostNumber() {
  return ghostBar("ghost-num");
}

function ghostRows(count, label) {
  const wrap = el("div", "ghost-row");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `? Still loading ${label}`);
  for (let index = 0; index < count; index += 1) {
    const bar = el("span", "ghost-bar");
    bar.setAttribute("aria-hidden", "true");
    wrap.append(bar);
  }
  return wrap;
}

/* One tooltip layer for the whole island (#236, #252, #275): the stations re-render
 * on every filter change, so this is created once and shared across all widgets. */
let sharedTooltipLayer = null;
function tooltipLayer() {
  if (typeof document === "undefined") return null;
  if (!sharedTooltipLayer) {
    const root = document.getElementById("connect-field") || document.body;
    sharedTooltipLayer = mountTooltipLayer(root, { surface: "connect-field" });
  }
  return sharedTooltipLayer;
}

function attachTooltip(trigger, render, { pin = true } = {}) {
  const layer = tooltipLayer();
  if (!layer || !trigger) return;
  const fn = typeof render === "function"
    ? render
    : (render && typeof render === "object" && !(render instanceof Node) && ("label" in render || "value" in render))
      ? () => tooltipContent(render)
      : () => render;
  layer.attach(trigger, { render: fn, pin });
}

function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function bulletList(items, { label = null } = {}) {
  const card = document.createElement("div");
  card.className = "dashboard-tip__card";
  if (label) {
    const head = document.createElement("div");
    head.className = "dashboard-tip__head";
    const lbl = document.createElement("span");
    lbl.className = "dashboard-tip__label";
    lbl.textContent = String(label);
    head.append(lbl);
    card.append(head);
  }
  const ul = document.createElement("ul");
  ul.className = "dashboard-tip__bullets";
  for (const item of items) {
    if (!item) continue;
    const li = document.createElement("li");
    if (typeof item === "string") {
      li.textContent = item;
    } else if (item instanceof Node) {
      li.append(item);
    } else if (typeof item === "object" && item.title) {
      const strong = document.createElement("strong");
      strong.textContent = item.title;
      li.append(strong);
      if (item.text) li.append(document.createTextNode(`: ${item.text}`));
    }
    ul.append(li);
  }
  card.append(ul);
  return card;
}

/* Unavailable, at station scale: hollow, dashed, never animated, always
 * carrying the reason it is unavailable behind hover (#275). */
function unavailablePanel(reason, headline) {
  const panel = el("div", "station-unavailable");
  panel.append(el("span", "unavailable-label", headline ? `Unavailable · ${headline}` : "Unavailable"));
  const text = reason || "We don't have this number, and nothing came back to say why.";
  const trigger = el("button", "unavailable-trigger", "Why unavailable?");
  trigger.type = "button";
  attachTooltip(trigger, () => bulletList(splitSentences(text), { label: headline || "Unavailable" }));
  panel.append(trigger);
  return panel;
}

/* Unavailable, inline: the same hollow dash inside a line of telemetry. The
 * reason travels as the accessible name, title, and tooltip (#275) so the
 * mark is never a bare shrug. */
function unavailableMark(reason, word = "Unavailable") {
  const node = el("span", "is-unavailable unavailable-mark");
  node.append(el("span", "unavailable-label", word));
  node.setAttribute("role", "note");
  node.tabIndex = 0;
  node.setAttribute("aria-label", `Unavailable. ${reason || ""}`.trim());
  if (reason) {
    node.title = reason;
    attachTooltip(node, () => bulletList(splitSentences(reason), { label: word }));
  }
  return node;
}

/* ADR 0018: a value Rock does not yet carry. It keeps its slot, it reads `?`, and the
 * reason lives in the tooltip rather than beside every instance. This is NOT the loading
 * skeleton (.ghost-bar), which is filled and animated because loading is chrome work. */
function ghostStat(reason) {
  const node = el("span", "stat-ghost", "?");
  node.setAttribute("role", "note");
  node.tabIndex = 0;
  node.setAttribute("aria-label", `Not measured yet. ${reason || ""}`.trim());
  if (reason) {
    node.title = reason;
    attachTooltip(node, () => bulletList(splitSentences(reason), { label: "Not measured yet" }));
  }
  return node;
}

/* A real zero. No bar, no dash, no hedge: the numeral, in reading ink. */
function zeroMark() {
  const node = el("span", "state-zero num", "0");
  node.append(el("span", "zero-baseline"));
  return node;
}

/* The one place a count becomes a DOM node, so "we counted none" and "we could
 * not count" can never be produced by the same call. */
function countMark(value, className) {
  if (value === 0) return zeroMark();
  return el("span", className ? `num ${className}` : "num", fmt(value));
}

/* "N of M" where M may be unknown. An unknown M is never printed as the slice's
 * own size and never as 0: both would state a total we do not have. The words
 * differ from "Unavailable" on purpose -- the shown count IS known, only the
 * total is not, and collapsing those two would lose that. */
function ofTotal(shown, total) {
  return total === null
    ? `${fmt(shown)} of an unknown total`
    : `${fmt(shown)} of ${fmt(total)}`;
}

/* ------------------------------------------------------------- the model -- */

const groupsOk = () => state.model && state.model.availability.groups === STATE.OK;
const attendanceOk = () => state.model && state.model.availability.attendance === STATE.OK;
const accessNoScope = () => Boolean(state.model && state.model.meta && state.model.meta.accessNoScope);

/* Four things this release does not track. The reader of this page is a pastor,
 * so what a station prints is the plain sentence about the church: what we do
 * not have, and that it is not a zero. The operator's own note travels on the
 * payload and is engineering language — it is not paraphrased away and it is
 * not shown to an exec mid-station either; it is kept verbatim in the colophon,
 * where the record of WHY a number does not exist yet belongs. */
const PLAIN_UNAVAILABLE = {
  retention: "We don't track how many people stay in a group over time. Nothing here is a zero. We just don't have this number yet.",
  progression: "We don't track people moving between groups. Nothing here is a zero. We just don't have this number yet.",
  demand: "We can't yet count how many people asked to join a group against how many places there are. Nothing here is a zero. We just don't have this number yet.",
};

function reasonFor(key) {
  if (PLAIN_UNAVAILABLE[key]) return PLAIN_UNAVAILABLE[key];
  return (state.model && state.model.reasons[key]) || "";
}

/* The operator's own note, verbatim, for the colophon only. */
function technicalNoteFor(key) {
  const carried = state.payload && typeof state.payload === "object" && state.payload.unavailable
    ? state.payload.unavailable[key]
    : null;
  if (typeof carried === "string" && carried.trim().length > 0) return carried.trim();
  return (state.model && state.model.reasons[key]) || "";
}

/* ------------------------------------------------------ naming a group --- */

/* A Connect Group's Rock name is `<age band> // <leader>` for all 293 of them.
 * That name was previously withheld as PII and the title was composed from the
 * PII-free fields instead. OPERATOR DECISION, 2026-09-01: show the real name --
 * `Adults // Adrian` -- because the composed form degraded to the bare database
 * id in practice (every field it composed from is currently NULL) and a pastor
 * cannot act on `Connect Group #4821`.
 *
 * So `groupName` from the read is the title. The composed form is kept as the
 * fallback for a group whose name is missing, and the numeric reference is the
 * last resort:
 *
 *   Adults // Adrian   ->   Adults · Ortigas Center · Tuesdays 7:00 PM   ->   Connect Group #4821
 *
 * This is the ONLY function that names a group. Queue rows, hover cards, the
 * pressure table, the field strip and every aria-label read from it, so no
 * station can invent its own naming. Any part that is null is dropped and the
 * separators close up behind it; the numeric reference is the fallback only
 * when every part is missing, and otherwise lives on as a demoted chip because
 * staff still need it to find the group in Rock. */

/* Belt and braces over the adapter's own `//` refusal: a title part that
 * somehow carried the ancestry separator is dropped rather than printed. */
function titlePart(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.includes("//")) return null;
  return text;
}

/* titlePart drops anything containing ` // ` -- the privacy guard on derived
 * canopy labels. A Connect Group's own name IS `<age band> // <leader>`, so a
 * name read through titlePart is always discarded and the composed title used
 * instead. Operator exception, 2026-09-01: names are displayed, so they are read
 * through this accessor. Used ONLY for a group's own name and its parent's. */
function namePart(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

/* Rock stores the meet-up day as a weekday. A pastor reads a recurring meeting
 * in the plural, so "Tuesday" is spoken as "Tuesdays". Anything that is not a
 * weekday this console recognises is printed exactly as Rock stores it. */
function pluralDay(value) {
  const text = titlePart(value);
  if (!text) return null;
  const bare = text.replace(/s$/i, "");
  const match = DAYS.find((day) => day.toLowerCase() === bare.toLowerCase());
  return match ? `${match}s` : text;
}

/* Meet-up time is free text in Rock. When the text says unambiguously what
 * clock time it means, it is tidied to a readable clock; when it does not, the
 * stored text is printed as-is rather than guessed into a time the group may
 * not meet at. `7:00` alone does not say which half of the day it means, so it
 * prints as `7:00`, never as `7:00 PM`. */
function parseClock(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  const meridiem = raw.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (meridiem) {
    const base = Number(meridiem[1]);
    const minute = Number(meridiem[2] || 0);
    if (base < 1 || base > 12 || minute > 59) return null;
    return { hour: (base % 12) + (meridiem[3].toLowerCase() === "p" ? 12 : 0), minute };
  }

  const clock = raw.match(/(\d{1,2}):(\d{2})/);
  if (clock) {
    const base = Number(clock[1]);
    const minute = Number(clock[2]);
    const padded = clock[1].length === 2;
    /* 13:00 and up can only be 24-hour; a zero-padded hour is written by a
     * 24-hour clock too. Anything else is ambiguous and is left alone. */
    if (base <= 23 && minute <= 59 && (base >= 13 || padded)) return { hour: base, minute };
  }
  return null;
}

function readableTime(value) {
  const text = titlePart(value);
  if (!text) return null;
  const clock = parseClock(text);
  if (!clock) return text;
  const suffix = clock.hour < 12 ? "AM" : "PM";
  const hour = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
  return `${hour}:${String(clock.minute).padStart(2, "0")} ${suffix}`;
}

function groupTitle(group) {
  const name = namePart(group.groupName);
  if (name) return name;
  const parts = [];
  const age = titlePart(group.ageGroup);
  const locality = titlePart(group.locality);
  const when = [pluralDay(group.meetupDay), readableTime(group.meetupTime)].filter(Boolean).join(" ");
  if (age) parts.push(age);
  if (locality) parts.push(locality);
  if (when) parts.push(when);
  if (!parts.length) return `Connect Group #${group.groupRef}`;
  return parts.join(" · ");
}

/* The Rock reference, spoken. Used where a title has to be one flat string —
 * an aria-label, a tooltip — so the reference travels with the title there too. */
const groupTitleSpoken = (group) => `${groupTitle(group)} · group #${group.groupRef}`;

/* The parent's own Rock name, which carries its tier already -- `Region // Cainta`.
 * Previously this read `under a region (parent #24040)`; a database id is not a
 * place a pastor can recognise. Falls back to the tier alone when the parent has
 * no name, and to the band statement when there is no tier at all. */
function parentLabel(group) {
  const parent = namePart(group.parentGroupName);
  if (parent) return parent;
  const tier = titlePart(group.canopyTier);
  if (tier) return `under a ${tier.toLowerCase()}`;
  return "directly under the band";
}

/* The Rock reference, demoted: a small monospace chip beside the title. It is
 * what the drill URL uses and what staff type into Rock, so it stays visible —
 * but it is no longer the group's name. The stylesheet has no rule for it yet,
 * so the demotion is set here rather than by inventing a class that does
 * nothing. */
function groupRefChip(group) {
  const chip = el("span", "mono group-ref", `#${group.groupRef}`);
  chip.style.fontSize = "0.72em";
  chip.style.fontWeight = "400";
  chip.style.opacity = "0.62";
  chip.style.marginLeft = "8px";
  chip.style.letterSpacing = "0.02em";
  chip.title = "The group's reference number in Rock.";
  return chip;
}

/* Title plus chip, as one block. Every station that shows a group by name uses
 * this or `groupTitle` — never its own arrangement of the same fields. */
function groupHeading(group, className) {
  const node = el("div", className);
  node.append(el("span", "group-title", groupTitle(group)));
  node.append(groupRefChip(group));
  return node;
}

/* Facet keys. Every one of them folds "the attribute is not set" into a real
 * category rather than dropping the group, because a group nobody has
 * classified is exactly the group a console like this should surface. */
const ageKey = (group) => group.ageGroup || NOT_SET;
const typeKeys = (group) => (group.groupTypes.length ? group.groupTypes : [NOT_SET]);
const meetKey = (group) => group.locationType || NOT_SET;
const dayKey = (group) => group.meetupDay || NOT_SET;
const localityKey = (group) => group.locality || NOT_SET;
const canopyKey = (group) => group.canopyBand || NOT_SET;
const labelFor = (key) => (key === NOT_SET ? NOT_SET_LABEL : key);

/* Meet-up time is free text in Rock, so the band is this console's reading of
 * that text and never a Rock field. The rule is deliberately strict: a time is
 * only banded when the string says which half of the day it means. `7:00` alone
 * does not, so it lands in Not set rather than being guessed into an evening it
 * may not be. `09:30` and `19:30` are zero-padded 24-hour clock and do. */
function timeBand(group) {
  const clock = parseClock(group.meetupTime);
  if (!clock) return NOT_SET;
  const minutes = clock.hour * 60 + clock.minute;
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 17 * 60) return "Afternoon";
  if (minutes < 19 * 60 + 30) return "Early Evening";
  return "Late Evening";
}

const bandKey = (group) => timeBand(group);

/* Members per leader, or null for an unled group: an unled group is not a point
 * at infinite load, it is a different fact, and it is drawn in its own gutter. */
function leaderSpan(group) {
  const component = group.health.components && group.health.components.leadership;
  if (component && typeof component.membersPerLeader === "number") return component.membersPerLeader;
  if (group.leaderCount === 0) return null;
  return round1(group.activeMemberCount / group.leaderCount);
}

/* The health object carries an array of component reasons. Older shapes carried
 * one string; both are read so the runtime never renders "[object Object]" if
 * the adapter's reason shape moves. */
function healthReasons(group) {
  const health = group.health || {};
  if (Array.isArray(health.reasons)) return health.reasons.filter(Boolean);
  if (typeof health.reason === "string" && health.reason) return [health.reason];
  return [];
}

/* ------------------------------------------------------- occurrence axis -- */

/* The church-wide week axis, and one lookup per group. A week that is on the
 * axis but absent from a group's rows is `no-record`: Rock holds no occurrence
 * for that group that week. It is never counted as silence, and it is never
 * drawn as a missed or expected meeting. */
let weekAxis = [];
let weeksByGroup = new Map();

function buildOccurrenceIndex() {
  weekAxis = attendanceOk() ? state.model.weeks.map((week) => week.weekStartDate) : [];
  weeksByGroup = new Map();
  if (!groupsOk()) return;
  for (const group of state.model.groups) {
    const summary = group.attendance;
    if (!summary) continue;
    const lookup = new Map();
    for (const week of summary.weeks) lookup.set(week.weekStartDate, week.occurrenceState);
    weeksByGroup.set(group.groupRef, lookup);
  }
}

function occurrenceAt(group, weekStartDate) {
  if (!attendanceOk()) return "unavailable";
  const lookup = weeksByGroup.get(group.groupRef);
  if (!lookup) return "no-record";
  return lookup.get(weekStartDate) || "no-record";
}

const OCC_CLASS = {
  "attendance-recorded": "occ-submitted",
  "did-not-occur": "occ-didnotmeet",
  "not-logged": "occ-notlogged",
  "no-record": "occ-none",
  unavailable: "occ-unavailable is-unavailable",
};
/* The four things a group-week can be, said the way a pastor would say them.
 * They must stay four different sentences: a cancelled meeting, a meeting
 * nobody entered attendance for, and a week with no meeting on record at all
 * are three different facts about a group, and "unavailable" is a fourth fact
 * about us rather than about the group. */
const OCC_WORD = {
  "attendance-recorded": "attendance entered",
  "did-not-occur": "meeting cancelled, the group told us",
  "not-logged": "attendance not entered, nobody wrote it down",
  "no-record": "no meeting on record",
  unavailable: "unavailable, we couldn't load attendance from Rock",
};

/* The trailing six weeks of the axis, as one strip. Five distinct renderings,
 * never blank, never collapsed into "missed". */
function occurrenceStrip(group) {
  const strip = el("span", "occ-strip");
  strip.setAttribute("role", "img");
  const weeks = weekAxis.slice(-6);
  if (!weeks.length) {
    const cells = attendanceOk() ? 6 : 6;
    for (let index = 0; index < cells; index += 1) {
      const cell = el("span", `occ ${OCC_CLASS[attendanceOk() ? "no-record" : "unavailable"]}`);
      cell.title = OCC_WORD[attendanceOk() ? "no-record" : "unavailable"];
      strip.append(cell);
    }
    strip.setAttribute("aria-label", attendanceOk()
      ? "There are no weeks in this attendance window."
      : `We couldn't load attendance from Rock. ${state.model.reasons.attendance || ""}`.trim());
    return strip;
  }
  const words = [];
  for (const weekStartDate of weeks) {
    const occState = occurrenceAt(group, weekStartDate);
    const cell = el("span", `occ ${OCC_CLASS[occState]}`);
    cell.title = `Week of ${weekStartDate}: ${OCC_WORD[occState]}`;
    strip.append(cell);
    words.push(`${weekStartDate} ${OCC_WORD[occState]}`);
  }
  strip.setAttribute("aria-label", `Last ${weeks.length} weeks: ${words.join("; ")}`);
  return strip;
}

/* ------------------------------------------------------------- the slice -- */

function matchesFilters(group, except) {
  const filters = state.filters;
  if (except !== "campus" && filters.campus !== "ALL" && group.campusShortCode !== filters.campus) return false;
  if (except !== "health" && filters.health.size && !filters.health.has(group.health.band)) return false;
  if (except !== "unled" && filters.unled && group.leaderCount !== 0) return false;
  if (except !== "age" && filters.age.size && !filters.age.has(ageKey(group))) return false;
  if (except !== "type" && filters.type.size && !typeKeys(group).some((token) => filters.type.has(token))) return false;
  if (except !== "meet" && filters.meet.size && !filters.meet.has(meetKey(group))) return false;
  if (except !== "locality" && filters.locality && localityKey(group) !== filters.locality) return false;
  if (except !== "day" && filters.day && dayKey(group) !== filters.day) return false;
  if (except !== "band" && filters.band && bandKey(group) !== filters.band) return false;
  if (except !== "canopy" && filters.canopy && canopyKey(group) !== filters.canopy) return false;
  return true;
}

const allGroups = () => (groupsOk() ? state.model.groups : []);
const slice = () => allGroups().filter((group) => matchesFilters(group));
/* Option counts follow the rest of the slice but ignore the facet's own key, so
 * the numbers on a facet's own controls stay comparable with each other. */
const poolFor = (key) => allGroups().filter((group) => matchesFilters(group, key));

function fieldTotal() {
  const total = state.model && state.model.meta ? state.model.meta.groupCount : null;
  return typeof total === "number" ? total : null;
}

function resetFilters() {
  const filters = state.filters;
  filters.campus = "ALL";
  filters.health.clear();
  filters.age.clear();
  filters.type.clear();
  filters.meet.clear();
  filters.unled = false;
  filters.locality = "";
  filters.day = "";
  filters.band = "";
  filters.canopy = "";
}

function activeFilterTags() {
  const filters = state.filters;
  const tags = [];
  if (filters.campus !== "ALL") tags.push({ label: `Campus ${filters.campus}`, clear: () => { filters.campus = "ALL"; } });
  if (filters.unled) tags.push({ label: "Unled groups", clear: () => { filters.unled = false; } });
  for (const band of filters.health) tags.push({ label: HEALTH_LABEL[band] || band, clear: () => filters.health.delete(band) });
  for (const age of filters.age) tags.push({ label: labelFor(age), clear: () => filters.age.delete(age) });
  for (const type of filters.type) tags.push({ label: labelFor(type), clear: () => filters.type.delete(type) });
  for (const meet of filters.meet) tags.push({ label: labelFor(meet), clear: () => filters.meet.delete(meet) });
  if (filters.locality) tags.push({ label: labelFor(filters.locality), clear: () => { filters.locality = ""; } });
  if (filters.day) tags.push({ label: labelFor(filters.day), clear: () => { filters.day = ""; } });
  if (filters.band) tags.push({ label: labelFor(filters.band), clear: () => { filters.band = ""; } });
  if (filters.canopy) tags.push({ label: labelFor(filters.canopy), clear: () => { filters.canopy = ""; } });
  return tags;
}

/* --------------------------------------------------- reading a group out -- */

function infoIcon() {
  const icon = svgEl("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" });
  icon.append(
    svgEl("circle", { cx: 8, cy: 8, r: 7 }),
    svgEl("line", { x1: 8, y1: 7, x2: 8, y2: 11.4 }),
    svgEl("circle", { class: "dotcap", cx: 8, cy: 4.7, r: 0.9 }),
  );
  return icon;
}

function whyTrigger(group, reasons, { label = "Why now", disc = false } = {}) {
  const trigger = disc
    ? el("button", "why-trigger-disc")
    : el("button", "why-trigger", label);
  trigger.type = "button";
  trigger.setAttribute("aria-label", `${label} for ${groupTitleSpoken(group)}`);
  if (disc) {
    trigger.append(infoIcon());
  }
  const bullets = Array.isArray(reasons) && reasons.length ? reasons : ["nothing we can measure is out of range"];
  attachTooltip(trigger, () => bulletList(bullets, { label }));
  return trigger;
}

/* Queue rank. Deliberately a stated arithmetic over named components rather
 * than a score: 1. No leader · 2. Attendance gone quiet · 3. Most people per leader.
 * An unavailable input contributes nothing at all — it neither helps nor hurts
 * a group's place in the queue. */
function severity(group) {
  const summary = attendanceOk() ? group.attendance : null;
  const span = leaderSpan(group);
  let score = (HEALTH_RANK[group.health.band] || 0) * 1000;
  if (group.leaderCount === 0) score += 400;
  if (summary) {
    score += summary.silentStreak * 60;
    if (summary.loggedRate !== null) score += (1 - summary.loggedRate) * 80;
  }
  if (span !== null) score += Math.min(span, 40) * 2;
  return score;
}

/* --------------------------------------------------------- URL address -- */

/* Complete address for the exact view (#215): every filter axis plus display
 * mode round-trips through the query string, so a share link, a saved view,
 * and the computer-use prompt all land on the same slice a viewer built here.
 * An absent key always means "no filter on that axis" -- readUrl() never
 * narrows the field from a garbage value, it just leaves that axis at its
 * default. Called once from boot(), after the model exists and before the
 * first buildSidebar()/renderAll(), so first paint already reads correct. */
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const filters = state.filters;

  /* Campus codes come from this read's own model, exactly like buildSidebar()
   * reads them, so a URL cannot claim a campus this field does not have. */
  const campusCodes = state.model && state.model.meta && Array.isArray(state.model.meta.campuses)
    ? state.model.meta.campuses.map((campus) => campus.shortCode)
    : [];
  const validCampus = (value) => value === "ALL" || campusCodes.includes(value);

  const campusParam = params.get("campus");
  if (campusParam) {
    if (validCampus(campusParam)) filters.campus = campusParam;
  } else {
    /* The URL is silent on campus. The server already resolved this viewer's
     * own campus (payload.campus) -- seed the console from that instead of
     * always defaulting to ALL, but only when it is a campus this field
     * actually has. This is the seeding this console never did before. */
    const serverCampus = state.payload && typeof state.payload.campus === "string" ? state.payload.campus : null;
    if (serverCampus && validCampus(serverCampus)) filters.campus = serverCampus;
  }

  /* Every other axis is validated the way campus already was: a URL value is kept
   * only when this field actually holds it. `?health=zzz` used to survive into the
   * console and empty every station to nothing -- a filter the viewer cannot see on
   * a chip, cannot clear, and which re-stamped itself into the address bar on the
   * next click. An unrecognised value is dropped, which reads as "no filter on that
   * axis" rather than as "match nothing". When the groups read itself failed there
   * is no vocabulary to check against, so the URL is taken at its word instead of
   * being emptied: a transient outage must not quietly rewrite a shared link. */
  const canValidate = groupsOk();
  const held = (derive) => {
    const values = new Set();
    if (!canValidate) return values;
    for (const group of state.model.groups) {
      const key = derive(group);
      if (Array.isArray(key)) for (const one of key) values.add(one);
      else values.add(key);
    }
    return values;
  };
  const known = (vocabulary, always) => (value) => (always || canValidate ? vocabulary.has(value) : true);

  const setParam = (key, accepts) => {
    const raw = params.get(key);
    if (!raw) return new Set();
    return new Set(raw.split(",").map((part) => part.trim()).filter(Boolean).filter(accepts));
  };
  const scalarParam = (key, accepts) => {
    const raw = (params.get(key) || "").trim();
    return raw && accepts(raw) ? raw : "";
  };

  filters.health = setParam("health", known(new Set(HEALTH_ORDER), true));
  filters.age = setParam("age", known(held(ageKey)));
  filters.type = setParam("type", known(held(typeKeys)));
  filters.meet = setParam("meet", known(held(meetKey)));

  filters.unled = params.get("unled") === "1";
  filters.locality = scalarParam("locality", known(held(localityKey)));
  filters.day = scalarParam("day", known(held(dayKey)));
  filters.band = scalarParam("band", known(held(bandKey)));
  filters.canopy = scalarParam("canopy", known(held(canopyKey)));

  state.mode = params.get("mode") === "classic" ? "classic" : "creative";
}

/* Writes only the non-default keys, so an all-clear console is a clean URL
 * and a filtered one is a link a colleague can paste back in whole. Set
 * values join with commas, sorted, so the same selection always serializes
 * to the same string. replaceState only -- a filter click is never a new
 * history entry. Called from applySelection(), after every mutation. */
function writeUrl() {
  const filters = state.filters;
  const params = new URLSearchParams();
  const setParam = (key, set) => {
    if (set && set.size) params.set(key, [...set].map(String).sort().join(","));
  };

  setParam("age", filters.age);
  if (filters.band) params.set("band", filters.band);
  /* Campus is written even when it is ALL. It is the one key whose absence does not
   * mean "no filter on that axis": readUrl() seeds an absent campus from the server
   * payload, so omitting it turned a deliberate "All campuses" into the recipient's
   * own campus the moment the link was pasted somewhere else. Exec writes its campus
   * unconditionally for the same reason; validCampus() already accepts "ALL". */
  params.set("campus", filters.campus || "ALL");
  if (filters.canopy) params.set("canopy", filters.canopy);
  if (filters.day) params.set("day", filters.day);
  setParam("health", filters.health);
  if (filters.locality) params.set("locality", filters.locality);
  setParam("meet", filters.meet);
  if (state.mode && state.mode !== "creative") params.set("mode", state.mode);
  setParam("type", filters.type);
  if (filters.unled) params.set("unled", "1");

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  window.history.replaceState(window.history.state, "", url);
}

/* ------------------------------------------------------------------ boot -- */

/**
 * Boot the Connect Health console into `root`, or into #connect-field when the
 * caller passes nothing.
 *
 * `payload` is the parsed contents of the #connect-field-data island. When it is
 * omitted the island is read from the document; when it is missing, unparseable,
 * or not the closed production shape, the adapter returns a model whose sources
 * are all unavailable and whose reasons say why, and every station renders the
 * unavailable state rather than a zero.
 */
export async function boot(root, payload) {
  const host = root || document.getElementById("connect-field");
  if (!host) return;
  state.root = host;
  state.reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  bindChrome();
  trackHostChrome(host);
  renderSkeleton();
  applyHostChrome();
  /* Rock's own fixed chrome can settle after first paint, so the sticky console
   * offset is measured again once the page is quiet and on every resize. */
  window.setTimeout(applyHostChrome, 400);
  window.addEventListener("resize", applyHostChrome, { passive: true });

  let supplied = payload;
  if (supplied === null || supplied === undefined) {
    try {
      const island = document.getElementById("connect-field-data");
      if (!island || island.type !== "application/json") throw new Error("the passive production data island is missing");
      supplied = JSON.parse(island.textContent);
    } catch {
      supplied = null;
    }
  }
  state.payload = supplied;

  /* The skeleton is a real state, not a decoration: it is held long enough to be
   * seen so that "still working" can never be confused with "nothing there".
   * Reduced motion skips the beat entirely. */
  await phaseDelay(180);

  state.model = buildModel(supplied);
  buildOccurrenceIndex();

  readUrl();
  /* Write the address back once at boot, so the URL is the complete address of
   * what is on screen from first paint -- including the campus the server
   * seeded -- rather than only after the first filter click. Every export and
   * every prompt quotes location.href, so it has to be true before anyone
   * clicks anything. replaceState only; no history entry. */
  writeUrl();
  state.root.dataset.mode = state.mode;

  renderProvenance();
  renderColophon();
  buildSidebar();
  renderAll();
  mountPalette();

  announce(accessNoScope()
    ? "Connect Health loaded. Your account is allowed on this page but resolves no Connect campus scope. This is an access condition, not an empty field."
    : groupsOk()
      ? `Connect Health loaded. ${fmt(state.model.groups.length)} Connect Groups in view.`
      : "Connect Health loaded. We couldn't load the Connect Groups; every station says so, and none of them shows a number.");
}

const phaseDelay = (ms) => new Promise((resolve) => {
  if (state.reducedMotion || !ms) resolve();
  else window.setTimeout(resolve, ms);
});

/* --------------------------------------------------------------- chrome -- */

/* The sticky console sits under whatever fixed bar Rock renders above the
 * island. Measuring the host beats hard-coding a height that differs between the
 * workbench and production; the measurement is capped so a full-height overlay
 * can never collapse the console to nothing. */
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
  state.root.style.setProperty("--console-top", `${Math.round(hostChromeOffset()) + 16}px`);
}

function closeConsole() {
  const layout = mount("app-layout");
  const toggle = mount("btn-toggle-sidebar");
  const backdrop = mount("filter-backdrop");
  if (layout && !state.collapsed) {
    state.collapsed = true;
    layout.classList.add("is-collapsed");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.classList.toggle("is-active", false);
    if (state.root) state.root.dataset.console = "closed";
  }
}

function bindChrome() {
  if (state.root) state.root.dataset.console = state.collapsed ? "closed" : "open";
  const toggle = mount("btn-toggle-sidebar");
  const layout = mount("app-layout");
  const back = mount("btn-sidebar-back");
  const backdrop = mount("filter-backdrop");

  const updateBackdrop = () => {
    if (backdrop) backdrop.classList.toggle("is-active", !state.collapsed);
    if (state.root) state.root.dataset.console = state.collapsed ? "closed" : "open";
  };

  if (toggle && layout) {
    toggle.addEventListener("click", () => {
      if (state.collapsed && MOBILE.matches) {
        hideCard(true);
      }
      state.collapsed = !state.collapsed;
      layout.classList.toggle("is-collapsed", state.collapsed);
      toggle.setAttribute("aria-expanded", String(!state.collapsed));
      updateBackdrop();
    });
    /* On a narrow screen the field leads and the console is an instrument you
     * reach for, so it starts folded away. */
    if (window.matchMedia("(max-width: 768px)").matches) {
      state.collapsed = true;
      layout.classList.add("is-collapsed");
      toggle.setAttribute("aria-expanded", "false");
      updateBackdrop();
    }
  }

  if (back) back.addEventListener("click", closeConsole);
  if (backdrop) backdrop.addEventListener("click", closeConsole);

  document.addEventListener("click", (e) => {
    // Opening Rock's hamburger menu immediately hides the filter console
    if (e.target.closest && e.target.closest(".navbar-toggle, [data-toggle='collapse'], .navigation-trigger, .navbar-header")) {
      closeConsole();
      return;
    }
    if (window.matchMedia("(max-width: 768px)").matches) {
      if (!state.collapsed && layout) {
        const sidebar = mount("filter-sidebar");
        if (sidebar && !sidebar.contains(e.target) && toggle && !toggle.contains(e.target)) {
          closeConsole();
        }
      }
    }
  });

  const reset = mount("btn-reset-filters");
  if (reset) reset.addEventListener("click", () => applySelection(resetFilters, "Filters reset. Showing the whole field."));
  const scopeReset = mount("scope-reset");
  if (scopeReset) scopeReset.addEventListener("click", () => applySelection(resetFilters, "Filters reset. Showing the whole field."));
  const form = mount("filter-form");
  if (form) form.addEventListener("submit", (event) => event.preventDefault());

  bindDisclosures();

  if (!state.documentBound) {
    state.documentBound = true;
    MOBILE.addEventListener("change", mountPalette);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      hideCard(true);
      closeConsole();
      for (const disc of state.root.querySelectorAll(".info-disc[open]")) disc.removeAttribute("open");
    });
    document.addEventListener("click", (event) => {
      const card = mount("groupcard");
      if (state.pinned && card && !card.contains(event.target)
        && !(event.target.closest && event.target.closest(".tick, .dot, .cohort-cell, .queue-row"))) {
        hideCard(true);
      }
      const opened = event.target.closest ? event.target.closest(".info-disc") : null;
      for (const disc of state.root.querySelectorAll(".info-disc[open]")) {
        if (disc !== opened && !disc.contains(event.target)) disc.removeAttribute("open");
      }
    });
  }
}

/* The explainer prose lives behind the shell's own `(i)` <details> disclosures,
 * which are keyboard-operable by construction. All this adds is keeping the
 * popover on screen and closing the others. */
function bindDisclosures() {
  for (const disc of state.root.querySelectorAll(".info-disc")) {
    disc.addEventListener("toggle", () => {
      if (!disc.open) return;
      const pop = disc.querySelector(".info-pop");
      if (!pop) return;
      pop.style.left = "";
      const rect = pop.getBoundingClientRect();
      const overflow = rect.right - (window.innerWidth - 12);
      if (overflow > 0) {
        let left = -8 - overflow;
        if (rect.left + (left + 8) < 12) left = 12 - rect.left - 8;
        pop.style.left = `${left}px`;
      }
    });
  }
}

/* ------------------------------------------------------------- skeletons -- */

/* Everything the console will eventually fill starts as the loading state, so
 * the page never shows an empty box that could be read as a zero. */
function renderSkeleton() {
  for (const id of ["stamp-scope", "stamp-count", "stamp-asof", "stamp-window"]) {
    const target = mount(id);
    if (target) target.replaceChildren(ghostNumber());
  }
  fill("flag-provenance", ghostBar("ghost-flag"));
  fill("scope-summary", ghostNumber());
  fill("signal-note", ghostNumber());
  fill("signal-board", ghostRows(4, "the signal board"));
  fill("fieldstrip", ghostRows(1, "the field strip"));
  fill("fieldstrip-legend", ghostNumber());
  fill("cohort-grid", ghostRows(6, "the Cohorts grid"));
  fill("rhythm-grid", ghostRows(5, "the Weekly Rhythm grid"));
  fill("rhythm-foot", ghostNumber());
  fill("logging-grid", ghostRows(6, "the week-by-week attendance table"));
  fill("logging-foot", ghostNumber());
  fill("pressure-retention", ghostRows(2, "the retention panel"));
  fill("pressure-foot", ghostNumber());
  fill("modes-row", ghostRows(3, "the meeting modes"));
  fill("canopy", ghostRows(4, "the canopy"));
  fill("canopy-foot", ghostNumber());
  fill("queue", ghostRows(8, "the queue"));
  fill("locality-table", ghostRows(8, "the locality table"));
  fill("map-unavailable", ghostRows(2, "the place panel"));
  fill("map-foot", ghostNumber());
  fill("colophon-unavailable", ghostRows(2, "the notes on what we cannot show yet"));
  const plot = mount("pressure-plot");
  if (plot) plot.replaceChildren(svgEl("title", {}));
}

/* --------------------------------------------------------- masthead flag -- */

/* The masthead flag says where every number on this page came from. Live and
 * fictional payloads name themselves plainly, and every failure is visible here
 * before a reader reaches a station. */
function renderProvenance() {
  const model = state.model;
  const mode = state.payload && typeof state.payload === "object" ? state.payload.mode : null;
  const parts = [];

  if (mode === "fictional") {
    parts.push({ strong: "Fictional prototype data." });
    parts.push(" Nothing on this page is a fact about the church. The production wrapper never serves this bundle.");
  } else if (accessNoScope()) {
    parts.push({ strong: "Allowed on this page; no Connect campus scope resolved." });
    parts.push(" This is an account access condition, not a church-wide field with zero groups.");
  } else if (!groupsOk() && !attendanceOk()) {
    parts.push({ strong: "Nothing came back from Rock." });
    parts.push(" Every station on this page says Unavailable, and not one of them is showing a zero.");
  }

  if (model) {
    const held = [];
    if (!groupsOk()) held.push("Connect Groups");
    if (!attendanceOk()) held.push("attendance weeks");
    if (held.length) parts.push(` We couldn't load ${held.join(" or ")}.`);
  }

  fill("flag-provenance", ...parts.map((part) => (
    typeof part === "string" ? document.createTextNode(part)
      : part.strong !== undefined ? el("strong", null, part.strong)
        : el("em", "mono", part.em)
  )));
}

const UNAVAILABLE_TITLE = {
  retention: "Retention: Unavailable",
  progression: "Progression between groups: Unavailable",
  demand: "People waiting for a group: Unavailable",
};

function renderColophon() {
  const list = el("ul", "unavailable-notes");
  for (const key of ["retention", "progression", "demand"]) {
    const item = el("li", "unavailable-note");
    const btn = el("button", "unavailable-trigger", UNAVAILABLE_TITLE[key]);
    btn.type = "button";
    const bullets = splitSentences(reasonFor(key));
    const note = technicalNoteFor(key);
    if (note && note !== reasonFor(key)) bullets.push(`Technical: ${note}`);
    attachTooltip(btn, () => bulletList(bullets, { label: UNAVAILABLE_TITLE[key] }));
    item.append(btn);
    list.append(item);
  }
  if (state.model && !groupsOk()) {
    const item = el("li", "unavailable-note");
    const btn = el("button", "unavailable-trigger", "Connect Groups: Unavailable");
    btn.type = "button";
    attachTooltip(btn, () => bulletList(splitSentences(state.model.reasons.groups || "We couldn't load groups."), { label: "Connect Groups" }));
    item.append(btn);
    list.append(item);
  }
  if (state.model && !attendanceOk()) {
    const item = el("li", "unavailable-note");
    const btn = el("button", "unavailable-trigger", "Weekly attendance: Unavailable");
    btn.type = "button";
    attachTooltip(btn, () => bulletList(splitSentences(state.model.reasons.attendance || "We couldn't load attendance."), { label: "Weekly attendance" }));
    item.append(btn);
    list.append(item);
  }
  fill("colophon-unavailable", list);
}

/* ------------------------------------------------------------- the whole -- */

/* One selection gesture: mutate the shared filter object, rebuild the console's
 * own controls, redraw every station, and say out loud what changed. */
function applySelection(mutate, message) {
  mutate();
  writeUrl();
  buildSidebar();
  renderAll();
  if (message) announce(message, { visible: false });
  if (state.root) {
    markChanged(state.mode === "classic"
      ? state.root.querySelectorAll(".cw, .kpi-strip")
      : state.root.querySelectorAll('[id^="station-"]'));
  }
}

function renderAll() {
  if (!state.model) return;
  if (!state.pinned) hideCard(true);

  const noScope = accessNoScope();
  setFilterControlsAvailable(!noScope);
  const data = slice();
  if (noScope) {
    renderAccessNoScope();
    renderClassic(data);
    return;
  }
  renderStamps(data);
  renderScopebar(data);

  if (!groupsOk()) {
    renderFieldUnavailable();
    renderPlace(data);
    renderClassic(data);
    return;
  }

  renderSignal(data);
  renderCohort(data);
  renderRhythm(data);
  renderLogging(data);
  renderPressure(data);
  renderModes(data);
  renderCanopy(data);
  renderQueue(data);
  renderPlace(data);
  renderClassic(data);
}

/* =============================================================== CLASSIC ==
 *
 * Classic (#219) is a SECOND RENDERER over the exact `data` slice renderAll()
 * just computed -- slice() through matchesFilters(), the same predicate every
 * Creative station reads (D1/D4). There is no second filter model here, no
 * second query, and no widget that quietly widens the field: a view that
 * cannot be produced from this slice is not produced at all. It renders as an
 * honest refusal instead, and the gap is reported (plan §15).
 *
 * One set of section builders feeds three consumers:
 *   the Classic tables      renderClassicGrid()
 *   the export rails        table() re-reads the live section at click time (D7)
 *   the copy prompt/package buildView() -> sections
 * so a spreadsheet, a pasted table and a chunked package can never disagree
 * with what is on the screen. Person data never enters any of them: the group
 * card stays Creative-only, and every Classic row is group-grain aggregate
 * with leaderCount rather than a leader (D8).
 *
 * The Creative stations keep rendering in both modes and are hidden by CSS
 * under [data-mode="classic"], so switching back is instant and identical. */

const exportRegistry = createExportRegistry();

/* The Creative station that owns each section's rail, in station order. The
 * logging table lives inside the RHYTHM station and takes its own inline rail
 * below, because one station head can only hold one control group. */
const CREATIVE_RAILS = [
  ["station-signal", "connect-signal"],
  ["station-map", "connect-place"],
  ["station-pressure", "connect-pressure"],
  ["station-cohort", "connect-cohorts"],
  ["station-rhythm", "connect-rhythm"],
  ["station-modes", "connect-modes"],
  ["station-queue", "connect-queue"],
  ["station-canopy", "connect-canopy"],
];

/* Every Classic widget, in reading order, with the heading and question it
 * carries. Used to render the honest refusal set when there is no field to
 * read, so an unavailable page still names all eight stations rather than
 * collapsing to one shrug. */
const CLASSIC_STATIONS = [
  ["connect-signal", "Field signal", "kpi", "Is the Connect field healthy right now?"],
  ["connect-health", "Health bands", "table", "How is the slice spread across states?"],
  ["connect-place", "Localities", "table", "Where should I look first?"],
  ["connect-pressure", "Leader pressure", "table", "Where is leadership under pressure?"],
  ["connect-cohorts", "Cohorts", "pivot", "Which cohorts are thick, and which are thin?"],
  ["connect-rhythm", "Weekly rhythm", "table", "When does the network meet?"],
  ["connect-logging", "Week by week", "table", "Is attendance being logged?"],
  ["connect-modes", "Meeting modes", "table", "Does the room change the pattern?"],
  ["connect-queue", "Intervention queue", "table", "Which groups should I open next?"],
  ["connect-canopy", "Canopy rollup", "pivot", "Which parts of the organisation carry the field?"],
];

/* State as a background wash, never as ink (grammar §3, D11). */
const CLASSIC_WASH = {
  critical: "var(--classic-wash-critical)",
  thin: "var(--classic-wash-thin)",
  watch: "var(--classic-wash-watch)",
  healthy: "var(--classic-wash-healthy)",
  unknown: "var(--classic-wash-unknown)",
};

/* The Classic clone of the pressure plot, kept so the PNG control exports the
 * chart the reader is actually looking at in whichever mode they are in. */
let classicPlotNode = null;

function classicSurfaceColor() {
  if (!state.root || typeof window.getComputedStyle !== "function") return "#171926";
  const value = window.getComputedStyle(state.root).getPropertyValue("--classic-surface");
  return (value || "").trim() || "#171926";
}

/* ------------------------------------------------------- section builders -- */

function sectionShell(id, kind, extra) {
  const meta = CLASSIC_STATIONS.find((entry) => entry[0] === id) || [id, id, kind];
  return { id, heading: meta[1], title: meta[1], kind, ...extra };
}

/* Nothing to read, so every station says the same true sentence rather than
 * drawing a table of zeroes. */
function unavailableSections(reason, headline) {
  const sections = CLASSIC_STATIONS.map(([id, heading, kind]) => ({
    id, heading, title: heading, kind,
    unavailable: headline ? `${headline}: ${reason}` : reason,
  }));
  sections.push(colophonSection());
  return sections;
}

/* The church-wide answered-attendance series, computed over THIS slice. Weeks
 * with no meeting on record are not in a denominator; a week nobody in the
 * slice met in is null, and the sparkline lifts its pen rather than drawing a
 * zero. */
function weeklyAnsweredSeries(data) {
  if (!attendanceOk() || weekAxis.length < 2) return [];
  return weekAxis.map((weekStartDate) => {
    let observed = 0;
    let answered = 0;
    for (const group of data) {
      const occState = occurrenceAt(group, weekStartDate);
      if (occState === "no-record" || occState === "unavailable") continue;
      observed += 1;
      if (occState !== "not-logged") answered += 1;
    }
    return observed ? Math.round(pct(answered, observed)) : null;
  });
}

const sumOf = (groups, read) => groups.reduce((total, group) => total + read(group), 0);
const openSeatsOf = (groups) => sumOf(groups, (group) => (
  group.openSeatCount !== null && group.openSeatCount > 0 ? group.openSeatCount : 0
));

function signalSection(data) {
  const total = fieldTotal();
  const people = sumOf(data, (group) => group.activeMemberCount);
  const leaders = sumOf(data, (group) => group.leaderCount);
  const unled = data.filter((group) => group.leaderCount === 0).length;
  const ledPeople = sumOf(data.filter((group) => group.leaderCount > 0), (group) => group.activeMemberCount);
  const span = leaders > 0 ? round1(ledPeople / leaders) : null;
  const stats = occurrenceStats(data);
  const answered = attendanceOk() && stats.observed > 0 ? Math.round(pct(stats.answered, stats.observed)) : null;
  const watchLine = Math.round(LOGGED_RATE_WATCH * 100);

  const kpis = [
    {
      label: "Connect Groups in view", value: data.length, unit: data.length === 1 ? "group" : "groups", state: "neutral",
      note: total === null
        ? "We couldn't load the Connect Groups, so the field total is unknown rather than zero."
        : `${ofTotal(data.length, total)} Connect Groups match the current slice. Every station on this page is reading this same slice.`,
    },
    {
      label: "People in these groups", value: people, unit: "active members", state: "neutral",
      note: "Active members of the groups in this slice, counted once per group. A person in two groups is counted in both, because this is a count of group places rather than of people.",
    },
    {
      label: "Leaders on record", value: leaders, unit: leaders === 1 ? "leader" : "leaders",
      state: unled ? "thin" : "healthy",
      note: unled
        ? `${fmt(unled)} ${unled === 1 ? "group has" : "groups have"} no Leader or Assistant Leader on record in Rock. ${LEADER_NAMING_NOTE}`
        : `Every group in this slice has at least one Leader or Assistant Leader on record. ${LEADER_NAMING_NOTE}`,
    },
    {
      label: "Attendance signal", value: answered, kind: "percent",
      unit: answered === null ? "" : "of meetings on record answered",
      state: answered === null ? "unknown" : answered >= watchLine ? "healthy" : "watch",
      note: attendanceOk()
        ? `Of the meetings Rock holds on record for this slice, the share where someone entered the attendance or the group told us the meeting was cancelled. Weeks with no meeting on record aren't in the denominator. Below ${watchLine}% reads as Watch.`
        : `${state.model.reasons.attendance || "We couldn't load attendance from Rock."} This isn't a zero.`,
    },
    {
      label: "Leader span", value: span, unit: span === null ? "" : "people per leader",
      state: span === null ? "unknown" : span >= LEADER_LOAD_THIN ? "thin" : "healthy",
      note: `Active members of the led groups in this slice, divided by the leaders on record. Unled groups are left out of this number rather than being counted as one leader carrying everybody. ${LEADER_LOAD_THIN} or more per leader is the strain the queue names.`,
    },
    {
      label: "Retention", value: "?", state: "unknown",
      note: reasonFor("retention"),
    },
    {
      label: "Progression", value: "?", state: "unknown",
      note: reasonFor("progression"),
    },
  ];

  const rows = kpis.map((kpi) => ({
    reading: kpi.label,
    value: kpi.value,
    unit: kpi.kind === "percent" ? "% of meetings on record answered" : kpi.unit || "",
  }));

  return sectionShell("connect-signal", "kpi", {
    kpis,
    columns: [
      { key: "reading", label: "Reading" },
      { key: "value", label: "Value", kind: "number" },
      { key: "unit", label: "Unit" },
    ],
    rows,
    note: `${ofTotal(data.length, total)} Connect Groups in this slice · ${fmt(unled)} unled.`,
  });
}

function healthSection(data) {
  const rows = HEALTH_ORDER.map((band) => {
    const inBand = data.filter((group) => group.health.band === band);
    return {
      band: HEALTH_LABEL[band],
      groups: inBand.length,
      share: data.length ? round1(pct(inBand.length, data.length)) : null,
      people: sumOf(inBand, (group) => group.activeMemberCount),
      leaders: sumOf(inBand, (group) => group.leaderCount),
    };
  });
  rows.push({
    band: "All in slice",
    groups: data.length,
    share: data.length ? 100 : null,
    people: sumOf(data, (group) => group.activeMemberCount),
    leaders: sumOf(data, (group) => group.leaderCount),
  });
  const unknown = data.filter((group) => group.health.band === "unknown").length;
  return sectionShell("connect-health", "table", {
    columns: [
      { key: "band", label: "State" },
      { key: "groups", label: "Groups", kind: "number" },
      { key: "share", label: "Share of slice", kind: "percent" },
      { key: "people", label: "Members", kind: "number" },
      { key: "leaders", label: "Leaders", kind: "number" },
    ],
    rows,
    note: unknown
      ? `${fmt(unknown)} ${unknown === 1 ? "group cannot" : "groups cannot"} be put in any state at all, because ${unbandableBecause()}. They are counted as Unknown here and never as healthy.`
      : "Every group in this slice could be put in a state. Unknown is a real row, not a rounding of the others.",
  });
}

function cohortSection(data) {
  const ages = axisValues("age");
  const types = axisValues("type");
  const existing = new Set();
  for (const group of allGroups()) {
    for (const token of typeKeys(group)) existing.add(`${ageKey(group)}|${token}`);
  }

  const columns = [{ key: "age", label: "Who it is for" }];
  types.forEach((type, index) => columns.push({ key: `t${index}`, label: labelFor(type), kind: "number" }));
  columns.push({ key: "groups", label: "Groups (distinct)", kind: "number" });

  const rows = ages.map((age) => {
    const row = { age: labelFor(age) };
    types.forEach((type, index) => {
      row[`t${index}`] = existing.has(`${age}|${type}`)
        ? data.filter((group) => ageKey(group) === age && typeKeys(group).includes(type)).length
        : null;
    });
    row.groups = data.filter((group) => ageKey(group) === age).length;
    return row;
  });

  const totalRow = { age: "All ages" };
  types.forEach((type, index) => {
    totalRow[`t${index}`] = data.filter((group) => typeKeys(group).includes(type)).length;
  });
  totalRow.groups = data.length;
  rows.push(totalRow);

  return sectionShell("connect-cohorts", "pivot", {
    columns,
    rows,
    note: "A group can be more than one kind, so the kind columns deliberately don't add up to the row. The last column is the distinct group count.",
  });
}

function rhythmSection(data) {
  const days = axisValues("day");
  const bands = axisValues("band");
  const existing = new Set();
  for (const group of allGroups()) existing.add(`${bandKey(group)}|${dayKey(group)}`);

  const columns = [{ key: "day", label: "Day" }];
  bands.forEach((band, index) => columns.push({ key: `b${index}`, label: labelFor(band), kind: "number" }));
  columns.push({ key: "groups", label: "Groups", kind: "number" });

  const rows = days.map((day) => {
    const row = { day: labelFor(day) };
    bands.forEach((band, index) => {
      row[`b${index}`] = existing.has(`${band}|${day}`)
        ? data.filter((group) => bandKey(group) === band && dayKey(group) === day).length
        : null;
    });
    row.groups = data.filter((group) => dayKey(group) === day).length;
    return row;
  });

  const totalRow = { day: "Every day" };
  bands.forEach((band, index) => {
    totalRow[`b${index}`] = data.filter((group) => bandKey(group) === band).length;
  });
  totalRow.groups = data.length;
  rows.push(totalRow);

  const unread = data.filter((group) => bandKey(group) === NOT_SET).length;
  return sectionShell("connect-rhythm", "table", {
    columns,
    rows,
    note: `Rock stores the meet-up time as free text, so ${fmt(unread)} of ${fmt(data.length)} groups have a time this page cannot read as a clock time and sit in Not set rather than being guessed into an evening.`,
  });
}

function loggingSection(data) {
  if (!attendanceOk()) {
    return sectionShell("connect-logging", "table", { unavailable: state.model.reasons.attendance || "We couldn't load attendance from Rock." });
  }
  const columns = [
    { key: "week", label: "Week beginning" },
    { key: "entered", label: "Attendance entered", kind: "number" },
    { key: "cancelled", label: "Meeting cancelled", kind: "number" },
    { key: "notEntered", label: "Attendance not entered", kind: "number" },
    { key: "noRecord", label: "No meeting on record", kind: "number" },
    { key: "answered", label: "Answered", kind: "percent" },
  ];
  const totals = { entered: 0, cancelled: 0, notEntered: 0, noRecord: 0 };
  const rows = weekAxis.map((weekStartDate) => {
    const counts = { entered: 0, cancelled: 0, notEntered: 0, noRecord: 0 };
    for (const group of data) {
      const occState = occurrenceAt(group, weekStartDate);
      if (occState === "attendance-recorded") counts.entered += 1;
      else if (occState === "did-not-occur") counts.cancelled += 1;
      else if (occState === "not-logged") counts.notEntered += 1;
      else counts.noRecord += 1;
    }
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    const observed = counts.entered + counts.cancelled + counts.notEntered;
    return {
      week: weekStartDate,
      ...counts,
      answered: observed ? round1(pct(counts.entered + counts.cancelled, observed)) : null,
    };
  });
  const observedAll = totals.entered + totals.cancelled + totals.notEntered;
  rows.push({
    week: "Every week",
    ...totals,
    answered: observedAll ? round1(pct(totals.entered + totals.cancelled, observedAll)) : null,
  });

  return sectionShell("connect-logging", "table", {
    columns,
    rows,
    note: rows.length > 1
      ? `${fmt(observedAll)} meetings are on record out of ${fmt(data.length * weekAxis.length)} possible. The other ${fmt(totals.noRecord)} group-weeks have no meeting on record at all, and count as neither answered nor silent.`
      : "Rock came back with no weeks at all in this window. We looked and found none. That isn't the same as being unable to look.",
  });
}

function pressureSection(data) {
  const rows = [...data].sort((left, right) => severity(right) - severity(left)).map((group) => ({
    group: groupTitle(group),
    ref: group.groupRef,
    campus: group.campusShortCode,
    members: group.activeMemberCount,
    leaders: group.leaderCount,
    perLeader: leaderSpan(group),
    capacity: group.capacity,
    openSeats: group.openSeatCount,
    state: HEALTH_LABEL[group.health.band],
    why: (group.health && group.health.reasons && group.health.reasons[0]) || "",
  }));
  const withSpan = data.filter((group) => leaderSpan(group) !== null);
  const strained = withSpan.filter((group) => leaderSpan(group) >= LEADER_LOAD_THIN).length;
  return sectionShell("connect-pressure", "table", {
    columns: [
      { key: "group", label: "Group" },
      { key: "ref", label: "Rock reference", kind: "number" },
      { key: "campus", label: "Campus" },
      { key: "members", label: "Members", kind: "number" },
      { key: "leaders", label: "Leaders", kind: "number" },
      { key: "perLeader", label: "People per leader", kind: "number" },
      { key: "capacity", label: "Capacity", kind: "number" },
      { key: "openSeats", label: "Open seats", kind: "number" },
      { key: "state", label: "State" },
      { key: "why", label: "Why" },
    ],
    rows,
    boundary: LEADER_NAMING_BOUNDARY,
    note: `${fmt(strained)} of ${fmt(withSpan.length)} led groups carry ${LEADER_LOAD_THIN} or more members per leader. We don't track retention or progression yet, so no row can show them.`,
  });
}

function modesSection(data) {
  const rows = axisValues("meet").map((key) => {
    const sub = data.filter((group) => meetKey(group) === key);
    const stats = occurrenceStats(sub);
    return {
      mode: labelFor(key),
      groups: sub.length,
      people: sumOf(sub, (group) => group.activeMemberCount),
      leaders: sumOf(sub, (group) => group.leaderCount),
      openSeats: openSeatsOf(sub),
      answered: attendanceOk() && stats.observed ? round1(pct(stats.answered, stats.observed)) : null,
    };
  });
  const all = occurrenceStats(data);
  rows.push({
    mode: "All modes",
    groups: data.length,
    people: sumOf(data, (group) => group.activeMemberCount),
    leaders: sumOf(data, (group) => group.leaderCount),
    openSeats: openSeatsOf(data),
    answered: attendanceOk() && all.observed ? round1(pct(all.answered, all.observed)) : null,
  });
  return sectionShell("connect-modes", "table", {
    columns: [
      { key: "mode", label: "Meeting mode" },
      { key: "groups", label: "Groups", kind: "number" },
      { key: "people", label: "Members", kind: "number" },
      { key: "leaders", label: "Leaders", kind: "number" },
      { key: "openSeats", label: "Open seats", kind: "number" },
      { key: "answered", label: "Meetings answered", kind: "percent" },
    ],
    rows,
    note: "Open seats count only the groups with a capacity set in Rock. How many people stay isn't something we track, so no mode can show it.",
  });
}

function canopySection(data) {
  const bands = axisValues("canopy")
    .map((key) => ({ key, groups: data.filter((group) => canopyKey(group) === key) }))
    .filter((band) => band.groups.length > 0)
    .sort((left, right) => right.groups.length - left.groups.length);

  const rows = [];
  const rowGroups = bands.map((band) => {
    const tiers = new Map();
    for (const group of band.groups) {
      const tier = group.canopyTier === null ? "Directly under the band" : group.canopyTier;
      if (!tiers.has(tier)) tiers.set(tier, []);
      tiers.get(tier).push(group);
    }
    const bandRows = [...tiers.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .map(([tier, groups]) => ({
        band: labelFor(band.key),
        tier,
        groups: groups.length,
        people: sumOf(groups, (group) => group.activeMemberCount),
        leaders: sumOf(groups, (group) => group.leaderCount),
      }));
    rows.push(...bandRows);
    return { label: `${labelFor(band.key)} · ${fmt(band.groups.length)} ${band.groups.length === 1 ? "group" : "groups"}`, rows: bandRows };
  });

  const totalRow = {
    band: "All canopy bands",
    tier: "All tiers",
    groups: data.length,
    people: sumOf(data, (group) => group.activeMemberCount),
    leaders: sumOf(data, (group) => group.leaderCount),
  };
  rows.push(totalRow);
  rowGroups.push({ label: "", rows: [totalRow] });

  return sectionShell("connect-canopy", "pivot", {
    columns: [
      { key: "band", label: "Canopy band" },
      { key: "tier", label: "Tier" },
      { key: "groups", label: "Groups", kind: "number" },
      { key: "people", label: "Members", kind: "number" },
      { key: "leaders", label: "Leaders", kind: "number" },
    ],
    rows,
    rowGroups,
    note: `${fmt(data.length)} groups sit under ${fmt(bands.length)} ${bands.length === 1 ? "band" : "bands"}. No Region or Cluster name appears: in Rock those levels are named after the people who lead them, so only the tier word is shown.`,
  });
}

function queueSection(data) {
  const ranked = data
    .filter((group) => (HEALTH_RANK[group.health.band] || 0) >= 2)
    .sort((left, right) => severity(right) - severity(left));
  const unknown = data.filter((group) => group.health.band === "unknown").length;
  const rows = ranked.map((group, index) => ({
    rank: index + 1,
    group: groupTitle(group),
    ref: group.groupRef,
    campus: group.campusShortCode,
    state: HEALTH_LABEL[group.health.band],
    open: `${CONNECT_URL}${group.groupRef}`,
    why: (group.health && group.health.reasons && group.health.reasons[0]) || "",
  }));
  return sectionShell("connect-queue", "table", {
    columns: [
      { key: "rank", label: "Queue position", kind: "number" },
      { key: "group", label: "Group" },
      { key: "ref", label: "Rock reference", kind: "number" },
      { key: "campus", label: "Campus" },
      { key: "state", label: "State" },
      { key: "open", label: "Open in Connect" },
      { key: "why", label: "Why" },
    ],
    rows,
    boundary: LEADER_NAMING_BOUNDARY,
    note: unknown
      ? `Every group on Watch, Thin, or Critical in this slice: ${fmt(rows.length)} of ${fmt(data.length)}. A further ${fmt(unknown)} can't be put in any state at all, because ${unbandableBecause()}; they aren't ranked and aren't counted as healthy.`
      : `Every group on Watch, Thin, or Critical in this slice: ${fmt(rows.length)} of ${fmt(data.length)}. 1. No leader · 2. Attendance gone quiet · 3. Most people per leader.`,
  });
}

function placeSection(data) {
  const aggregated = aggregateLocalities(data);
  const rows = aggregated.map((row) => {
    const rollup = localityRollup(row, data);
    const pressureWord = rollup.pressure ? (rollup.pressure.charAt(0).toUpperCase() + rollup.pressure.slice(1)) : "·";
    return {
      locality: row.notMapped ? "No locality on record" : row.locality,
      groups: row.groupCount,
      people: row.activeMemberCount,
      leaders: row.leaderCount,
      capacitySet: row.capacityKnownCount,
      openSeats: row.capacityKnownCount === 0 ? null : row.openSeatCount,
      pressure: pressureWord,
    };
  });
  const allRollup = rollupBands({
    critical: sumOf(data, (g) => g.health.band === "critical" ? 1 : 0),
    thin: sumOf(data, (g) => g.health.band === "thin" ? 1 : 0),
    watch: sumOf(data, (g) => g.health.band === "watch" ? 1 : 0),
    healthy: sumOf(data, (g) => g.health.band === "healthy" ? 1 : 0),
    unknown: sumOf(data, (g) => g.health.band === "unknown" ? 1 : 0),
  }, localityPressure(data));
  rows.push({
    locality: "All localities",
    groups: data.length,
    people: sumOf(data, (group) => group.activeMemberCount),
    leaders: sumOf(data, (group) => group.leaderCount),
    capacitySet: data.filter((group) => group.capacity !== null).length,
    openSeats: openSeatsOf(data),
    pressure: allRollup.pressure ? (allRollup.pressure.charAt(0).toUpperCase() + allRollup.pressure.slice(1)) : "·",
  });
  const unplaced = data.filter((group) => group.locality === null).length;
  return sectionShell("connect-place", "table", {
    columns: [
      { key: "locality", label: "Locality" },
      { key: "groups", label: "Groups", kind: "number" },
      { key: "people", label: "Members", kind: "number" },
      { key: "leaders", label: "Leaders", kind: "number" },
      { key: "capacitySet", label: "Capacity set in Rock", kind: "number" },
      { key: "openSeats", label: "Open seats", kind: "number" },
      { key: "pressure", label: "Pressure" },
    ],
    rows,
    note: `${fmt(unplaced)} of ${fmt(data.length)} groups have no locality on record and keep their own row. No address and no map coordinate is on this page at all.`,
  });
}

function colophonSection() {
  return {
    id: "connect-colophon",
    heading: "What this page doesn't have",
    title: "What this page doesn't have",
    kind: "prose",
    text: ["retention", "progression", "demand"]
      .map((key) => `${UNAVAILABLE_TITLE[key]}: ${reasonFor(key)}`)
      .join(" "),
  };
}

/* The whole reading, as data. Rebuilt on demand rather than cached, because a
 * rail click has to read the slice as it is at that moment (D7) and a cached
 * copy is exactly the bug this rule exists to prevent. */
function buildSections() {
  if (!state.model) return [];
  if (accessNoScope()) return unavailableSections(state.model.reasons.groups || "", "Access condition");
  if (!groupsOk()) return unavailableSections(state.model.reasons.groups || "", null);
  const data = slice();
  /* Page order, and the artifacts follow it: WHAT (signal, health) -> WHERE
   * (the Plotboard's localities) -> WHY (pressure, cohorts, rhythm, logging,
   * modes) -> ACT (the queue) -> the wider organisation (canopy). */
  return [
    signalSection(data),
    healthSection(data),
    placeSection(data),
    pressureSection(data),
    cohortSection(data),
    rhythmSection(data),
    loggingSection(data),
    modesSection(data),
    queueSection(data),
    canopySection(data),
    colophonSection(),
  ];
}

function sectionById(id) {
  return buildSections().find((section) => section.id === id) || null;
}

/* ------------------------------------------------------------- the view -- */

function filterValues() {
  const filters = state.filters;
  const view = { mode: state.mode };
  if (filters.campus && filters.campus !== "ALL") view.campus = filters.campus;
  if (filters.health.size) view.health = [...filters.health].map((band) => HEALTH_LABEL[band] || band).sort();
  if (filters.unled) view.unled = "1";
  if (filters.age.size) view.age = [...filters.age].map(labelFor).sort();
  if (filters.type.size) view.type = [...filters.type].map(labelFor).sort();
  if (filters.meet.size) view.meet = [...filters.meet].map(labelFor).sort();
  if (filters.locality) view.locality = labelFor(filters.locality);
  if (filters.day) view.day = labelFor(filters.day);
  if (filters.band) view.band = labelFor(filters.band);
  if (filters.canopy) view.canopy = labelFor(filters.canopy);
  return view;
}

/* The DashboardView contract (apps/shared/dashboard-view.mjs): what the signed-in
 * viewer is looking at right now, composed client-side from live state. The one
 * Date in this runtime lives here and only here, and only at export time.
 *
 * Exported beside boot() because it is this island's second seam: it is a pure
 * read of live state, so a workbench (or a future headless check) can assert
 * validateView(buildView()) === [] without driving a rail button. Nothing in
 * production calls it except the rails and the copy prompt. */
export function buildView() {
  const tags = activeFilterTags();
  return {
    surface: { ...SURFACE },
    mode: state.mode === "classic" ? "classic" : "creative",
    /* The palette the reader is actually looking at, so a rebuilt report matches the view it
     * came from (#248). Read off the root rather than off the control, because the root is
     * the switch: the attribute is the state, and it is right even before the swatch mounts. */
    theme: state.root?.dataset.theme || null,
    url: window.location.href,
    filters: filterValues(),
    filterSummary: tags.length ? tags.map((tag) => tag.label).join(" · ") : "The whole field",
    templateVersion: TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    fictional: Boolean(state.payload && typeof state.payload === "object" && state.payload.mode === "fictional"),
    sections: buildSections(),
    controls: [...state.controls],
  };
}

/* ------------------------------------------------- table decoration ------ */

/* The shared builders own every cell's text; these helpers only add a
 * background wash, a truer title, or the one link a queue row needs. Nothing
 * below writes a value. */
function bodyRows(table) {
  return [...table.querySelectorAll("tbody tr")].filter((row) => !row.classList.contains("ct__group"));
}

function markTotalRow(table) {
  const rows = bodyRows(table);
  const last = rows[rows.length - 1];
  if (last) last.classList.add("ct__total");
}

function sectionIsEmpty(section) {
  if (Array.isArray(section.rowGroups)) return section.rowGroups.every((group) => !Array.isArray(group.rows) || group.rows.length === 0);
  return Array.isArray(section.rows) && section.rows.length === 0;
}

/* The one aid that does not sit in a table row. It aids the Attendance signal
 * tile beside it, so it carries its own one-line reading -- the same first and
 * last values the sparkline's label already speaks -- rather than floating as
 * a bare line (grammar §6: a sparkline never appears without its numbers). */
function sparkFigure(series) {
  const present = series.filter((value) => value !== null);
  const figure = el("figure", "cw__aid-figure");
  figure.append(sparkline(series, {
    width: 220, height: 44,
    label: `Share of meetings on record that were answered, week by week across ${weekAxis.length} weeks in this slice`,
  }));
  figure.append(el("figcaption", "cw__aid-caption",
    `Meetings answered, week by week · ${fmt(present[0])}% → ${fmt(present[present.length - 1])}%`));
  return figure;
}

function washRows(table, states) {
  bodyRows(table).forEach((row, index) => {
    const token = CLASSIC_WASH[states[index]];
    if (!token) return;
    for (const cell of row.children) cell.style.backgroundImage = `linear-gradient(${token}, ${token})`;
  });
}

/* Density heat, as a background only: the numeral stays in reading ink. */
function heatCells(table, valuesByRow, max) {
  if (!max) return;
  bodyRows(table).forEach((row, rowIndex) => {
    const values = valuesByRow[rowIndex];
    if (!values) return;
    const cells = [...row.querySelectorAll("td.ct__num")];
    values.forEach((value, index) => {
      const cell = cells[index];
      if (!cell || typeof value !== "number") return;
      const share = (4 + (value / max) * 26).toFixed(1);
      const wash = `color-mix(in srgb, var(--classic-bar) ${share}%, transparent)`;
      cell.style.backgroundImage = `linear-gradient(${wash}, ${wash})`;
    });
  });
}

/* A dash in the matrices is not a refusal — it is a shape the church does not
 * have anywhere in the field. Same mark, different sentence, so the title the
 * shared builder wrote is replaced with the true one. */
function retitleUnavailableCells(table, title) {
  for (const cell of table.querySelectorAll("tbody td.ct__unavail")) cell.title = title;
}

function retitleColumnCells(table, cellIndex, title) {
  for (const row of bodyRows(table)) {
    const cell = row.children[cellIndex];
    if (cell && cell.classList.contains("ct__unavail")) cell.title = title;
  }
}

function linkifyColumn(table, cellIndex) {
  for (const row of bodyRows(table)) {
    const cell = row.children[cellIndex];
    if (!cell) continue;
    const href = cell.textContent;
    if (!href || href.indexOf(CONNECT_URL) !== 0) continue;
    const link = el("a", "ct__link", "Open Connect");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Open group ${href.slice(CONNECT_URL.length)} on connect.example.invalid`);
    cell.replaceChildren(link);
  }
}

/* ------------------------------------------------------- the composition -- */

function mountRail(widget, section, png) {
  if (!widget || !section || section.unavailable) return;
  mountExportRail(widget.railHost, {
    registry: exportRegistry,
    id: section.id,
    title: section.title || section.heading,
    table: () => sectionById(section.id),
    png: png || undefined,
  });
}

function classicTableWidget(grid, section, options = {}) {
  const widget = classicWidget({
    id: `cw-${section.id}`,
    title: section.title || section.heading,
    question: options.question,
    info: options.info,
    aid: options.aid || null,
  });
  if (options.half) widget.root.classList.add("cw--half");
  /* One stack, so the aid stays the body's second grid cell however much sits
   * under the table. Tables lead; the chart is never above one. */
  const stack = el("div", "cw__stack");
  if (section.unavailable) {
    stack.append(classicUnavailable(section.unavailable));
  } else {
    const table = options.build(section);
    /* Only a table whose last row really is a total gets the total rule. The
     * pressure and queue tables end on whichever group happens to sort last,
     * and a 2px rule under a random group would read as a sum. */
    if (options.total !== false) markTotalRow(table);
    if (options.decorate) options.decorate(table, section);
    stack.append(table);
    /* A slice can be empty. A header with no rows under it says nothing; a
     * sentence says what happened and what to do -- and that this is a real
     * empty, not an unavailable reading. */
    if (sectionIsEmpty(section)) stack.append(el("p", "cw__empty", "Nothing to list for this slice. Widen a filter to see rows here."));
    mountRail(widget, section, options.png);
    /* The body's inset moves onto the cells so the sticky head and the sticky
     * row header meet the widget's edges with nothing scrolling past them. */
    widget.body.classList.add("cw__body--table");
  }
  widget.body.append(stack);
  if (widget.aidHost) widget.body.append(widget.aidHost);
  const noteNode = widget.root.querySelector(".cw__note");
  /* An aid too wide to sit beside the table sits under it instead, outside the
   * body's height cap -- a chart a reader has to scroll 300 rows to reach is
   * not an aid to anything (grammar §2: beside the table where it fits, below
   * it otherwise). */
  if (!section.unavailable && options.aidBelow) {
    const node = options.aidBelow();
    if (node) {
      const band = el("div", "cw__aid cw__aid--below");
      band.append(node);
      widget.root.insertBefore(band, noteNode);
    }
  }
  /* A refusal is a reading, and a reading a viewer has to scroll three hundred
   * rows inside a capped body to reach is a hidden one. The station's second
   * axis therefore sits in its own band under the body, beside the note, where
   * it is met on the way past rather than found (grammar §8). */
  if (!section.unavailable && options.after) {
    const node = options.after();
    if (node) {
      const band = el("div", "cw__after");
      band.append(node);
      widget.root.insertBefore(band, noteNode);
    }
  }
  widget.setNote(section.note || "");
  grid.append(widget.root);
  return widget;
}

function pressurePlotAid() {
  const source = mount("pressure-plot");
  if (!source || !source.querySelector(".dot")) return null;
  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.setAttribute("class", "pressure-plot classic-plot-aid");
  clone.setAttribute("role", "img");
  const label = source.getAttribute("aria-label");
  if (label) clone.setAttribute("aria-label", label);
  return clone;
}

/* One accessor for both rails: whichever plot the reader is actually looking
 * at is the one that becomes the image. */
function pressurePng() {
  const node = state.mode === "classic" && classicPlotNode && classicPlotNode.isConnected
    ? classicPlotNode
    : mount("pressure-plot");
  return exportSvgToPng(node, { background: classicSurfaceColor() });
}

function renderClassicGrid(data) {
  const host = mount("classic-mount");
  if (!host) return;
  classicPlotNode = null;
  const sections = buildSections();
  const byId = new Map(sections.map((section) => [section.id, section]));
  const grid = el("div", "classic-grid");

  if (accessNoScope() || !groupsOk()) {
    const reason = (state.model && state.model.reasons.groups) || "";
    const widget = classicWidget({
      id: "cw-connect-field",
      title: "The Connect field",
      question: "What is on the console right now?",
      info: "Classic renders the same filtered slice the Creative stations render. With no groups to read there's no table to draw, so every station on this page says the same true sentence rather than showing a zero.",
      expandable: false,
    });
    widget.body.append(classicUnavailable(reason, {
      headline: accessNoScope() ? "Access condition" : "Connect Groups",
    }));
    widget.setNote("Nothing here is a zero. Switch to Creative and every station says the same thing.");
    grid.append(widget.root);
    host.replaceChildren(grid);
    return;
  }

  /* SIGNAL -- quiet tiles, the health-band table beside them, and the field
   * strip reduced to one sparkline aid where a real weekly series exists. */
  const signal = byId.get("connect-signal");
  const series = weeklyAnsweredSeries(data);
  const sparkNode = series.some((value) => value !== null) ? sparkFigure(series) : null;
  const signalWidget = classicWidget({
    id: "cw-connect-signal",
    title: signal.title,
    question: "Is the Connect field healthy right now?",
    info: "6 readings over the groups currently in the slice, each one a plain count or a stated ratio rather than a blended score. State is a background wash only; the numbers stay in reading ink. Retention has no approved Rock resolver, so it reads as a ghost ? and says why; it isn't a zero.",
    aid: sparkNode,
  });
  const signalStack = el("div", "cw__stack");
  signalStack.append(kpiStrip(signal.kpis, { label: "Field signal readings" }));
  signalWidget.body.append(signalStack);
  if (signalWidget.aidHost) signalWidget.body.append(signalWidget.aidHost);
  signalWidget.setNote(signal.note);
  mountRail(signalWidget, signal);
  grid.append(signalWidget.root);

  classicTableWidget(grid, byId.get("connect-health"), {
    question: "How is the slice spread across states?",
    info: "The 5 states a group can be in, counted over the current slice, with the people and leaders inside them. The wash behind each row is that state; the numbers stay in reading ink. A group's state is the worst of the four things health is made of (Leadership, Activity, Retention, Progression), never a blended score. Capacity is an operating signal and never bands a group. Unknown is its own row and never folds into the others.",
    build: (section) => dataTable(section, {
      inlineBarKey: "groups",
      caption: "Groups in the current slice by state.",
    }),
    decorate: (table) => washRows(table, HEALTH_ORDER),
  });

  /* COHORTS -- the same matrix renderCohort() computes, stripped to a pivot. */
  const cohorts = byId.get("connect-cohorts");
  const cohortTypes = cohorts.columns.slice(1, -1);
  classicTableWidget(grid, cohorts, {
    question: "Which cohorts are thick, and which are thin?",
    info: "Who a group is for, against what kind of group it is, both straight from Rock. A group can be more than one kind, so one group sits in more than one column and the columns deliberately don't add up to the row; the last column is the distinct count. A dash is a shape the church doesn't have anywhere in the field, which is different from a zero, and a 0 is a real zero: the shape exists and nothing in this slice has it.",
    build: (section) => pivotTable(section, {
      groupKey: "__ungrouped",
      rowGroups: [{ label: "", rows: section.rows }],
      caption: "Groups in the current slice by cohort.",
    }),
    decorate: (table, section) => {
      retitleUnavailableCells(table, "No group anywhere in the field has this shape. Not a zero, and not a number we're missing.");
      const rows = section.rows.slice(0, -1);
      const values = rows.map((row) => cohortTypes.map((column) => row[column.key]));
      const max = Math.max(1, ...values.flat().filter((value) => typeof value === "number"));
      heatCells(table, values, max);
    },
  });

  /* RHYTHM + LOGGING -- two linear tables, heat in the cells. */
  const rhythm = byId.get("connect-rhythm");
  const rhythmBands = rhythm.columns.slice(1, -1);
  classicTableWidget(grid, rhythm, {
    question: "When does the network meet?",
    info: "The day and the time of day the groups in this slice meet. The wash behind a count is its density against the busiest pocket. The times of day are this page's reading, not a Rock field: Rock stores the meet-up time as free text, so a time that can't be read as a clock time lands in Not set rather than being guessed into an evening the group may not meet in. A dash is a pocket the church doesn't use anywhere in the field.",
    build: (section) => dataTable(section, {
      inlineBarKey: "groups",
      caption: "Groups in the current slice by meeting day and time of day.",
    }),
    decorate: (table, section) => {
      retitleUnavailableCells(table, "No group anywhere in the field meets in this pocket. Not a zero.");
      const rows = section.rows.slice(0, -1);
      const values = rows.map((row) => rhythmBands.map((column) => row[column.key]));
      const max = Math.max(1, ...values.flat().filter((value) => typeof value === "number"));
      heatCells(table, values, max);
    },
  });

  classicTableWidget(grid, byId.get("connect-logging"), {
    question: "Is attendance being logged?",
    info: "One row per week. Answered is the share of the meetings on record where someone entered attendance or the group told us the meeting was cancelled. Every week in the window against the groups in this slice. Each group-week is exactly one of 4 things, and they are never collapsed: attendance entered, the group told us the meeting was cancelled, the meeting is on record and nobody wrote down who came, or Rock holds no meeting for that group that week at all. The last of those isn't silence and isn't in the answered denominator.",
    build: (section) => dataTable(section, {
      caption: "One row per week.",
    }),
  });

  /* PRESSURE -- the table is the station now; the plot is the aid. */
  const pressure = byId.get("connect-pressure");
  const plotAid = pressurePlotAid();
  classicPlotNode = plotAid;
  const perLeaderIndex = pressure.columns.findIndex((column) => column.key === "perLeader");
  classicTableWidget(grid, pressure, {
    question: "Where is leadership under pressure?",
    info: "Every group in this slice: members, leaders, people per leader, capacity, its state and why. We don't track retention or progression yet, so no row can show them. Ordered the way the queue is ordered: unled first, then the ones where attendance has gone quiet, then the ones where each leader carries the most people. People per leader is blank for an unled group because it isn't a number, not because it is zero. " + LEADER_NAMING_NOTE,
    aidBelow: () => plotAid,
    png: plotAid ? pressurePng : null,
    total: false,
    build: (section) => dataTable(section, {
      sortable: true,
      caption: "Every group in this slice: members, leaders, people per leader, capacity, its state and why.",
    }),
    decorate: (table) => {
      retitleColumnCells(table, perLeaderIndex, "Not a number for this group: it has no Leader or Assistant Leader on record, so people per leader can't be worked out. This isn't a zero.");
    },
    /* The second axis this station was designed around. It has no approved
     * Rock resolver, so it stays visible as a refusal rather than leaving a
     * blank edge that would read as agreement. */
    after: () => classicUnavailable(reasonFor("retention"), { headline: "Retention: how many people stay" }),
  });

  classicTableWidget(grid, byId.get("connect-modes"), {
    question: "Does the room change the pattern?",
    info: "Every kind of meeting place in the field, compared on the same scales: the same group and member counts, the same seat arithmetic, the same share of meetings answered. Open seats count only the groups with a capacity set in Rock. How many people stay isn't something we track, so no mode can show it; an empty column would read as agreement.",
    build: (section) => dataTable(section, {
      inlineBarKey: "groups",
      caption: "Groups in the current slice by where they meet.",
    }),
  });

  classicTableWidget(grid, byId.get("connect-canopy"), {
    question: "Which parts of the organisation carry the field?",
    info: "The canopy as a rollup rather than a picture: each band is a row-group, and the tiers beneath it are its rows. A group that sits directly under a band is counted where it actually sits. No Region or Cluster name appears anywhere. In Rock, those levels are named after the people who lead them.",
    build: (section) => pivotTable(section, {
      groupKey: "band",
      rowGroups: section.rowGroups,
      inlineBarKey: "groups",
      caption: "Groups in the current slice, rolled up by canopy band and the tier beneath it.",
    }),
  });

  const queue = byId.get("connect-queue");
  const openIndex = queue.columns.findIndex((column) => column.key === "open");
  classicTableWidget(grid, queue, {
    question: "Which groups should I open next?",
    info: "The queue over the current slice. Sort any column; the queue position stays with its row. Every group in this slice on Watch, Thin, or Critical, not the first eight. The order uses only what this page can actually work out: something we don't have never quietly counts as healthy, and never counts at all. Every row says why now in plain terms, and the link lands on that group's attendance page in Connect and nowhere else.",
    total: false,
    build: (section) => dataTable(section, {
      sortable: true,
      caption: "The queue over the current slice.",
    }),
    decorate: (table) => linkifyColumn(table, openIndex),
  });

  const place = byId.get("connect-place");
  classicTableWidget(grid, place, {
    question: "Where do the groups meet?",
    info: "Where the groups in this slice meet, how many leaders they have, and how many of them have a capacity set in Rock. Locality is free text in Rock, tidied into a standard set of names on the way in. Groups with no locality on record keep their own row rather than being dropped, because a group nobody can place is exactly the kind of thing a map would have hidden. Open seats read as a dash where no group in that locality has a capacity set.",
    build: (section) => dataTable(section, {
      inlineBarKey: "groups",
      caption: "Where the groups in this slice meet.",
    }),
    /* Classic is a table reading, so the Plotboard's board does not appear here;
     * the rows below ARE what the board plots, in the order the board ranks them.
     * Nothing is withheld and nothing is unavailable -- switch to Creative for the
     * same localities as a board. */
  });

  host.replaceChildren(grid);
}

/* ---------------------------------------------------- rails and the tools -- */

/* Creative keeps its own composition; it gains one quiet control group per
 * station head, in the same corner every time, reading the same live section
 * the Classic widget exports. */
function renderCreativeRails() {
  if (state.creativeRailsMounted || !groupsOk() || accessNoScope()) return;
  state.creativeRailsMounted = true;

  for (const [stationId, sectionId] of CREATIVE_RAILS) {
    const station = mount(stationId);
    const head = station ? station.querySelector(".station-head") : null;
    if (!head) continue;
    const host = el("div", "station-rail");
    head.append(host);
    mountExportRail(host, {
      registry: exportRegistry,
      id: sectionId,
      title: (sectionById(sectionId) || {}).title || sectionId,
      table: () => sectionById(sectionId),
      png: sectionId === "connect-pressure" ? pressurePng : undefined,
    });
  }

  /* The week-by-week table lives inside the RHYTHM station, under a head that
   * already carries the rhythm rail, so it takes its own inline one. */
  const logging = mount("logging-grid");
  if (logging && logging.parentNode) {
    const host = el("div", "station-rail station-rail--inline");
    logging.parentNode.insertBefore(host, logging);
    mountExportRail(host, {
      registry: exportRegistry,
      id: "connect-logging",
      title: "Week by week",
      table: () => sectionById("connect-logging"),
    });
  }
}

/* The package summary the delegation checks before it builds the real package:
 * aggregate by construction, and small enough to read at a glance. */
function packageSummaryTable() {
  const view = buildView();
  return {
    id: "connect-package",
    title: "Connect Health: package summary",
    columns: [{ key: "field", label: "Field" }, { key: "value", label: "Value" }],
    rows: [
      { field: "Surface", value: SURFACE.title },
      { field: "Display mode", value: view.mode },
      { field: "Sections", value: view.sections.length },
      { field: "Filters", value: view.filterSummary },
    ],
  };
}

function renderMastheadTools() {
  if (state.mastheadMounted) return;
  const host = mount("masthead-tools");
  if (!host) return;
  state.mastheadMounted = true;
  host.replaceChildren();

  /* align: "end" -- both controls sit at the end edge of the masthead now, so the
   * popover and the tips anchor to that edge instead of running off the other side. */
  mountCopyPrompt(host, { view: buildView, announce, align: "end" });

  /* The shared delegation announces "Saved <title> as a JSON package." With the surface title
   * now "Connect Health", no leading article needs stripping. Everything the reader sees -- the button's
   * label, the summary table's caption, the artifact's provenance line -- carries the full surface title. */
  exportRegistry.register(SURFACE.id, { title: SURFACE.title.replace(/^The\s+/, ""), table: packageSummaryTable });
  mountPackageControl(host, { surfaceId: SURFACE.id, align: "end" });

}

/* One delegated listener on the island root outlives every re-render, because
 * a rail's buttons are thrown away and rebuilt on every filter change. */
function ensureClassicBindings() {
  if (state.classicBound || !state.root) return;
  state.classicBound = true;
  bindExportDelegation(state.root, exportRegistry, {
    view: buildView,
    announce,
    package: () => buildDashboardPackage(buildView()),
  });
  bindInfoDismissal(state.root);
}

/* The #248 palette control sits bottom-left, sticky to the page, matching pathways.
 * It mounts exactly once, after the first renderAll(), and deliberately NOT from
 * renderMastheadTools() where it used to live: that function runs on every render pass, so
 * the swatch was torn down and re-appended to the island root on every filter change, and
 * where it landed in the flow depended on whatever else had rendered after it. Same CSS as
 * pathways, different DOM position -- which is the whole of issue #277. Sticky resolves
 * against normal flow, so being appended mid-render put it partway up the page instead of
 * at the bottom. Mounting last, once, is what makes the two surfaces agree.
 *
 * This surface still never wires a rockPrefsTransport -- no transport means mountThemeSwatch
 * keeps the choice local instead of writing it back to Rock. That is a deliberate choice
 * about not writing to Rock from a read-only surface, not a leftover of the old zero-network
 * promise, which the Plotboard no longer keeps. */
function paletteHost() {
  if (!MOBILE.matches) return state.root;
  const sidebar = mount("filter-sidebar");
  if (!sidebar) return state.root;
  let slot = sidebar.querySelector(".palette-slot");
  if (!slot) {
    slot = el("fieldset", "filter-fieldset palette-slot");
    const legend = el("legend", "filter-legend");
    legend.append(el("span", null, "Palette"));
    legend.append(el("span", "sub", "how the board looks"));
    slot.append(legend);
    sidebar.append(slot);
  }
  return slot;
}

function mountPalette() {
  if (!state.root) return;
  const host = paletteHost();
  if (state.paletteHost === host) return;
  if (state.themeSwatch && state.themeSwatch.element) state.themeSwatch.element.remove();
  const slot = state.root.querySelector(".palette-slot");
  if (slot && host !== slot) slot.remove();
  state.paletteHost = host;
  state.themeSwatch = mountThemeSwatch(host, {
    root: state.root,
    surface: SURFACE.id,
    onChange: (theme) => announce(theme ? `${themeName(theme)} palette.` : "Default palette."),
  });
  mountPen(host);
}

/* Executive Markup (#598): the pen beside the palette; lazy until pressed. */
function mountPen(host) {
  if (state.markup) { state.markup.remount(host); return; }
  state.markup = mountMarkup(state.root, {
    surface: { id: "connect-field", title: SURFACE.title },
    host,
    frame: state.root,
    context: () => ({ mode: state.root?.dataset?.mode || null, theme: state.root?.dataset?.theme || null, filterSummary: null, url: window.location.href, title: document.title }),
    announce: (message) => announce(message, { visible: false }),
  });
}

/* The one seam renderAll() calls, in every path it can take. */
function renderClassic(data) {
  renderMastheadTools();
  renderCreativeRails();
  renderClassicGrid(data);
  ensureClassicBindings();
}

/* No-scope leaves nothing meaningful to filter. Hide the console and its
 * expander, then disable and inert every control as a semantic backstop so an
 * author stylesheet cannot accidentally return no-op controls to the tab order. */
function setFilterControlsAvailable(available) {
  const toggle = mount("btn-toggle-sidebar");
  if (toggle) {
    toggle.hidden = !available;
    toggle.disabled = !available;
    const bar = toggle.closest(".sidebar-toggle-bar");
    if (bar) bar.hidden = !available;
  }

  const sidebar = mount("filter-sidebar");
  if (!sidebar) return;
  sidebar.hidden = !available;
  sidebar.inert = !available;
  sidebar.setAttribute("aria-hidden", String(!available));
  for (const control of sidebar.querySelectorAll("button, select, input, textarea")) {
    control.disabled = !available;
  }
}

/* A successful live response with no groups is an authorization result, not a
 * church-wide zero. Keep it visually in the established hollow error language,
 * but name the permission condition at every reading point so it cannot be
 * mistaken for an empty field. */
function renderAccessNoScope() {
  const reason = state.model.reasons.groups;
  const panel = (headline) => unavailablePanel(reason, `Access condition · ${headline}`);
  fill("stamp-scope", document.createTextNode("NO CAMPUS SCOPE"));
  /* Unavailable, like the two stamps under it: this slot holds a count, and
     "Access condition" is the name of a state, not a number. The panel below it
     and this mark's own title carry the reason. */
  fill("stamp-count", unavailableMark(reason));
  fill("stamp-asof", unavailableMark(reason));
  fill("stamp-window", unavailableMark(reason));
  fill("scope-summary", document.createTextNode("Allowed on this page · no Connect campus scope"));
  fill("scope-tags");
  const reset = mount("scope-reset");
  if (reset) reset.hidden = true;
  fill("filter-count-note", document.createTextNode(reason));
  for (const id of ["campus-row", "health-btns", "age-btns", "type-btns", "meet-btns"]) {
    fill(id, unavailableMark(reason, "No scope"));
  }
  fill("signal-note", document.createTextNode(reason));
  fill("signal-board", panel("Signal"));
  fill("fieldstrip", panel("Field strip"));
  fill("fieldstrip-legend", document.createTextNode(reason));
  fill("cohort-grid", panel("Cohorts"));
  fill("rhythm-grid", panel("Rhythm"));
  fill("rhythm-foot");
  fill("logging-grid", panel("Week by week"));
  fill("logging-foot");
  const plot = mount("pressure-plot");
  if (plot) plot.replaceChildren(svgEl("title", {}, reason));
  fill("pressure-retention", panel("Pressure"));
  fill("pressure-foot", document.createTextNode(reason));
  const table = mount("pressure-table");
  if (table) table.replaceChildren(el("summary", null, "Group table unavailable for this account"), panel("Pressure table"));
  fill("modes-row", panel("Meeting modes"));
  fill("canopy", panel("Canopy"));
  fill("canopy-foot");
  fill("queue", panel("Queue"));
  fill("locality-table", panel("Localities"));
  fill("plot-campus-row", unavailableMark(reason, "No scope"));
  fill("plot-rail-title", document.createTextNode("Needs attention"));
  fill("plot-rail-body", panel("Plotboard rail"));
  fill("map-unavailable", panel("Place"));
  fill("map-foot", document.createTextNode(reason));
}

/* Groups are the spine: without them nothing downstream is knowable, and every
 * station says so in the same hollow dashed language rather than drawing an
 * empty chart that reads as a field with nothing in it. */
function renderFieldUnavailable() {
  const reason = state.model.reasons.groups || "";
  fill("signal-note", document.createTextNode("We couldn't load the Connect Groups. No count is shown, because no count is known."));
  fill("signal-board", unavailablePanel(reason, "Signal"));
  fill("fieldstrip", unavailablePanel(reason, "Field strip"));
  fill("fieldstrip-legend", document.createTextNode("No group is on the strip: we couldn't load the Connect Groups. This isn't an empty field."));
  fill("cohort-grid", unavailablePanel(reason, "Cohorts"));
  fill("rhythm-grid", unavailablePanel(reason, "Rhythm"));
  fill("rhythm-foot");
  fill("logging-grid", unavailablePanel(state.model.reasons.attendance || reason, "Week by week"));
  fill("logging-foot");
  const plot = mount("pressure-plot");
  if (plot) plot.replaceChildren(svgEl("title", {}));
  fill("pressure-retention", unavailablePanel(reasonFor("retention"), "Retention: how many people stay"));
  fill("pressure-foot", document.createTextNode("Nothing is plotted: we couldn't load the Connect Groups."));
  const table = mount("pressure-table");
  if (table) table.replaceChildren(el("summary", null, "Show every group as a table"), unavailablePanel(reason, "Pressure table"));
  fill("modes-row", unavailablePanel(reason, "Meeting modes"));
  fill("canopy", unavailablePanel(reason, "Canopy"));
  fill("canopy-foot");
  fill("queue", unavailablePanel(reason, "Queue"));
}

/* ---------------------------------------------------------------- stamps -- */

function renderStamps(data) {
  const total = fieldTotal();
  const scope = mount("stamp-scope");
  if (scope) scope.replaceChildren(document.createTextNode(state.filters.campus === "ALL" ? "ALL CAMPUSES" : state.filters.campus));

  const count = mount("stamp-count");
  if (count) {
    /* `292 / 292` labelled neither number and, unfiltered, said the same thing
     * twice -- a ratio a reader had to decode to learn nothing. It is the slice
     * over the whole field, so it is only worth printing once the slice differs
     * from the field, and then it is printed as a sentence rather than a sum. */
    if (total === null) count.replaceChildren(unavailableMark(state.model.reasons.groups));
    else if (data.length === total) count.replaceChildren(document.createTextNode(fmt(total)));
    else count.replaceChildren(document.createTextNode(`${fmt(data.length)} of ${fmt(total)}`));
  }

  const asOf = mount("stamp-asof");
  if (asOf) {
    const value = state.model.meta.asOfDate;
    asOf.replaceChildren(value
      ? document.createTextNode(value)
      : unavailableMark(state.model.reasons.groups || state.model.reasons.attendance));
  }

  const window_ = mount("stamp-window");
  if (window_) {
    if (!attendanceOk()) {
      window_.replaceChildren(unavailableMark(state.model.reasons.attendance));
    } else if (!weekAxis.length) {
      window_.replaceChildren(document.createTextNode("no weeks came back"));
    } else {
      window_.replaceChildren(document.createTextNode(`${weekAxis.length} wk · ${weekAxis[0]} → ${weekAxis[weekAxis.length - 1]}`));
    }
  }
}

/* -------------------------------------------------------------- scopebar -- */

function renderScopebar(data) {
  const total = fieldTotal();
  const tags = activeFilterTags();

  const summary = mount("scope-summary");
  if (summary) {
    if (total === null) {
      summary.replaceChildren(unavailableMark(state.model.reasons.groups));
    } else if (tags.length) {
      summary.replaceChildren(document.createTextNode(`${fmt(data.length)} of ${fmt(total)} Connect Groups`));
    } else {
      summary.replaceChildren(document.createTextNode(`The whole field · ${fmt(total)} Connect Groups`));
    }
  }

  const tagWrap = mount("scope-tags");
  if (tagWrap) {
    tagWrap.replaceChildren();
    for (const tag of tags) {
      const chip = el("span", "scope-tag");
      chip.append(document.createTextNode(tag.label));
      const clear = el("button", null, "×");
      clear.type = "button";
      clear.setAttribute("aria-label", `Clear filter ${tag.label}`);
      clear.addEventListener("click", () => applySelection(tag.clear, `Cleared ${tag.label}.`));
      chip.append(clear);
      tagWrap.append(chip);
    }
  }

  const reset = mount("scope-reset");
  if (reset) reset.hidden = tags.length === 0;
  const pill = mount("active-summary");
  if (pill) pill.textContent = tags.length ? `${tags.length} active` : "All";

  const note = mount("filter-count-note");
  if (note) {
    note.replaceChildren(...(total === null
      ? [document.createTextNode("We couldn't load the Connect Groups, so there's nothing here to filter.")]
      : [
        el("strong", null, fmt(data.length)),
        document.createTextNode(` of ${fmt(total)} Connect Groups match. Every station on the page is showing this same slice.`),
      ]));
  }
}

/* -------------------------------------------------------------- sidebar -- */

function optionButton(label, count, pressed, token, onToggle, maxCount) {
  const button = el("button", "opt-btn");
  button.type = "button";
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  const top = el("span", "btn-row-top");
  top.append(el("span", "btn-title", label));
  const tag = el("span", "val-tag");
  // A facet count of 0 is a real zero ONLY when the groups read actually returned.
  // With no groups loaded there is nothing to have counted, so the count is unknown
  // and must not borrow the zero glyph, which this page defines as "we looked".
  if (!groupsOk()) tag.append(unavailableMark("We couldn't load the groups from Rock, so there's nothing to count yet.", "—"));
  else tag.append(count === 0 ? zeroMark() : document.createTextNode(fmt(count)));
  top.append(tag);
  const meter = el("span", "btn-meter");
  const fillBar = el("span", "btn-meter-fill");
  if (token) fillBar.style.background = token;
  fillBar.style.transform = `scaleX(${maxCount ? count / maxCount : 0})`;
  meter.append(fillBar);
  button.append(top, meter);
  button.addEventListener("click", onToggle);
  return button;
}

/* The console describes itself as it builds itself. Every control group pushes
 * one ControlGrammar entry here (apps/shared/dashboard-view.mjs), with the
 * selector that really matches the live DOM and the values really on offer, so
 * the computer-use prompt is generated from the same source that builds the
 * sidebar and cannot drift from it (#220 §11). */
function pushControl(control) {
  state.controls.push(control);
}

/* Display mode toggle (contract §3). Rebuilt on every buildSidebar() call,
 * same as campus-row and the other dynamic sidebar groups, so aria-pressed
 * always matches state.mode without a second bookkeeping path. */
function buildModeSwitch() {
  const wrap = mount("mode-switch-mount");
  if (!wrap) return;
  wrap.replaceChildren();

  /* The control is the shared one (#237). classic-widgets owns the two buttons, their
   * order, and the aria-pressed bookkeeping; this island keeps only what is genuinely
   * its own -- the authored transition and the selection announcement. */
  wrap.append(modeSwitch(state.mode, (value) => {
    /* The one authored moment (grammar §14). The class goes on BEFORE the
     * render, so the widgets this render builds start held back and ease in
     * when it drops; adding it after would fade a finished page out and back,
     * which is a flicker rather than a swap. */
    const beat = motionMs(state.root, "--motion-state", 180);
    if (beat > 0) {
      state.root.classList.add("is-mode-switching");
      window.setTimeout(() => { state.root.classList.remove("is-mode-switching"); }, beat);
    }
    applySelection(() => {
      state.mode = value;
      state.root.dataset.mode = value;
    }, value === "classic" ? "Classic mode." : "Creative mode.");
  }));
  pushControl({
    id: "mode",
    kind: "segmented",
    label: "Display mode",
    selector: "#mode-switch-mount .mode-switch__btn",
    values: ["Creative", "Classic"],
    effect: "Switches the whole page between the Creative reading and the Classic tables. Both modes read the same filters, so switching never loses the selection.",
  });
}

function buildSidebar() {
  if (!state.model) return;
  state.controls = [];
  buildModeSwitch();
  const filters = state.filters;

  /* Campus. The codes come from the read itself, so a campus the church adds
   * appears without a code change, and ALL is always the last, safe scope. The
   * SAME control is built into the sidebar and onto the Plotboard bar, from one
   * builder calling one closure, so the map can never hold a campus the rest of
   * the page has not moved to (#258 §6). */
  const values = mountCampusRow("campus-row");
  mountCampusRow("plot-campus-row");
  if (values) {
    pushControl({
      id: "campus",
      kind: "button-group",
      label: "Campus scope",
      selector: "#campus-row .acronym-btn, #plot-campus-row .acronym-btn",
      values,
      effect: "Narrows every station to one campus, moves the Plotboard camera with it, and clears a locality that isn't in that campus. ALL is the whole field and is always the last button.",
    });
  }

  /* Health, plus the one hard flag that is not a band: unled. It sits here
   * because it is the question a pastor asks in the same breath. */
  const healthWrap = mount("health-btns");
  if (healthWrap) {
    healthWrap.replaceChildren();
    const pool = poolFor("health");
    const counts = HEALTH_ORDER.map((band) => pool.filter((group) => group.health.band === band).length);
    const unledCount = poolFor("unled").filter((group) => group.leaderCount === 0).length;
    const max = Math.max(1, ...counts, unledCount);
    HEALTH_ORDER.forEach((band, index) => {
      healthWrap.append(optionButton(
        HEALTH_LABEL[band], counts[index], filters.health.has(band), HEALTH_TOKEN[band],
        () => applySelection(() => {
          if (filters.health.has(band)) filters.health.delete(band);
          else filters.health.add(band);
        }, `${HEALTH_LABEL[band]} ${filters.health.has(band) ? "cleared" : "selected"}.`),
        max,
      ));
    });
    healthWrap.append(optionButton(
      "Unled", unledCount, filters.unled, HEALTH_TOKEN.critical,
      () => applySelection(() => { filters.unled = !filters.unled; }, filters.unled ? "Unled groups cleared." : "Unled groups only."),
      max,
    ));
    pushControl({
      id: "health",
      kind: "button-group",
      label: "Health, and the unled flag",
      selector: "#health-btns .opt-btn",
      values: [...HEALTH_ORDER.map((band) => HEALTH_LABEL[band]), "Unled"],
      effect: "Multi-select: each press adds or removes that state from the slice. Unled isn't a state but the plain fact of no leader on record, and combines with the rest.",
    });
  }

  buildTokenFacet("age-btns", "age", axisValues("age"), filters.age);
  buildTokenFacet("type-btns", "type", axisValues("type"), filters.type);
  pushControl({
    id: "age",
    kind: "button-group",
    label: "Age group: who the group is for",
    selector: "#age-btns .opt-btn",
    values: axisValues("age").map(labelFor),
    effect: "Multi-select. Not set is a real option: a group nobody has classified stays in the field rather than dropping out of it.",
  });
  pushControl({
    id: "type",
    kind: "button-group",
    label: "Group types",
    selector: "#type-btns .opt-btn",
    values: axisValues("type").map(labelFor),
    effect: "Multi-select. A group can be more than one kind, so a group matches if any selected kind is one of its kinds.",
  });

  /* Meeting location type: compact buttons, because the label is short and the
   * question ("does the room change the pattern?") lives in its own station. */
  const meetWrap = mount("meet-btns");
  if (meetWrap) {
    meetWrap.replaceChildren();
    const pool = poolFor("meet");
    for (const key of axisValues("meet")) {
      const count = pool.filter((group) => meetKey(group) === key).length;
      const button = el("button", "mini-btn", shortMeetLabel(key));
      button.type = "button";
      button.title = `${labelFor(key)} · ${fmt(count)} groups in this slice`;
      button.setAttribute("aria-pressed", filters.meet.has(key) ? "true" : "false");
      button.setAttribute("aria-label", `${labelFor(key)}, ${fmt(count)} groups`);
      button.addEventListener("click", () => applySelection(() => {
        if (filters.meet.has(key)) filters.meet.delete(key);
        else filters.meet.add(key);
      }, `${labelFor(key)} ${filters.meet.has(key) ? "cleared" : "selected"}.`));
      meetWrap.append(button);
    }
    pushControl({
      id: "meet",
      kind: "button-group",
      label: "Meeting: where the group meets",
      selector: "#meet-btns .mini-btn",
      values: axisValues("meet").map(shortMeetLabel),
      effect: "Multi-select over the meeting location type. The button labels are shortened; the full name is in each button's title.",
    });
  }

  fillSelect("sel-locality", axisValues("locality"), "locality", "All localities");
  fillSelect("sel-day", axisValues("day"), "day", "All days");
  fillSelect("sel-band", axisValues("band"), "band", "All times");
  fillSelect("sel-region", axisValues("canopy"), "canopy", "All canopy bands");
  pushControl({
    id: "locality",
    kind: "select",
    label: "Locality",
    selector: "#sel-locality",
    values: ["All localities", ...axisValues("locality").map(labelFor)],
    effect: "Single choice. Each option carries its group count in this slice; the empty option is the whole field.",
  });
  pushControl({
    id: "day",
    kind: "select",
    label: "Meet-up day",
    selector: "#sel-day",
    values: ["All days", ...axisValues("day").map(labelFor)],
    effect: "Single choice over the day the group meets.",
  });
  pushControl({
    id: "band",
    kind: "select",
    label: "Time of day",
    selector: "#sel-band",
    values: ["All times", ...axisValues("band").map(labelFor)],
    effect: "Single choice. The bands are this page's reading of Rock's free-text meet-up time; a time that can't be read as a clock time is Not set rather than guessed.",
  });
  pushControl({
    id: "canopy",
    kind: "select",
    label: "Canopy band",
    selector: "#sel-region",
    values: ["All canopy bands", ...axisValues("canopy").map(labelFor)],
    effect: "Single choice over the part of the organisation a group sits under. No Region or Cluster name appears, only the band.",
  });
  pushControl({
    id: "reset",
    kind: "button-group",
    label: "Reset every filter",
    selector: "#btn-reset-filters",
    values: ["Reset"],
    effect: "Clears every axis at once and returns the page to the whole field. The scope bar carries the same control while any filter is active.",
  });
  pushControl({
    id: "sidebar",
    kind: "toggle",
    label: "Filter console",
    selector: "#btn-toggle-sidebar",
    values: ["open", "closed"],
    effect: "Opens and closes the filter console itself. On a narrow screen it starts closed, because the field leads.",
  });
}

function shortMeetLabel(key) {
  if (key === NOT_SET) return "Not set";
  if (key === "Home Connect") return "Home";
  if (key === "Favor Studio") return "Studio";
  return key;
}

function buildTokenFacet(mountId, facetKey, values, selected) {
  const wrap = mount(mountId);
  if (!wrap) return;
  wrap.replaceChildren();
  const pool = poolFor(facetKey);
  const counts = values.map((value) => pool.filter((group) => (
    facetKey === "type" ? typeKeys(group).includes(value) : ageKey(group) === value
  )).length);
  const max = Math.max(1, ...counts);
  values.forEach((value, index) => {
    wrap.append(optionButton(
      labelFor(value), counts[index], selected.has(value), "",
      () => applySelection(() => {
        if (selected.has(value)) selected.delete(value);
        else selected.add(value);
      }, `${labelFor(value)} ${selected.has(value) ? "cleared" : "selected"}.`),
      max,
    ));
  });
}

/* Every axis is built from what the field actually holds, ordered by the
 * church's own reading order where one exists and alphabetically after that.
 * Not set is always last and always present when any group is unclassified. */
function axisValues(facetKey) {
  const seen = new Set();
  for (const group of allGroups()) {
    if (facetKey === "age") seen.add(ageKey(group));
    else if (facetKey === "type") for (const token of typeKeys(group)) seen.add(token);
    else if (facetKey === "meet") seen.add(meetKey(group));
    else if (facetKey === "locality") seen.add(localityKey(group));
    else if (facetKey === "day") seen.add(dayKey(group));
    else if (facetKey === "band") seen.add(bandKey(group));
    else if (facetKey === "canopy") seen.add(canopyKey(group));
  }
  const preferred = facetKey === "age" ? AGE_ORDER
    : facetKey === "type" ? TYPE_ORDER
      : facetKey === "day" ? DAYS
        : facetKey === "band" ? TIME_BANDS
          : [];
  const ordered = [];
  for (const value of preferred) if (seen.has(value)) { ordered.push(value); seen.delete(value); }
  const hasNotSet = seen.delete(NOT_SET);
  ordered.push(...[...seen].sort((left, right) => left.localeCompare(right)));
  if (hasNotSet) ordered.push(NOT_SET);
  return ordered;
}

function fillSelect(mountId, values, facetKey, allLabel) {
  const select = mount(mountId);
  if (!select) return;
  select.replaceChildren();
  const all = el("option", null, allLabel);
  all.value = "";
  select.append(all);
  const pool = poolFor(facetKey);
  for (const value of values) {
    const count = pool.filter((group) => (
      facetKey === "locality" ? localityKey(group) === value
        : facetKey === "day" ? dayKey(group) === value
          : facetKey === "band" ? bandKey(group) === value
            : canopyKey(group) === value
    )).length;
    const option = el("option", null, `${labelFor(value)} · ${fmt(count)}`);
    option.value = value;
    select.append(option);
  }
  select.value = state.filters[facetKey] || "";
  select.onchange = () => applySelection(() => {
    state.filters[facetKey] = select.value;
  }, select.value ? `${labelFor(select.value)} selected.` : "Selection cleared.");
}

/* ================================================================ SIGNAL == */

/* Why a group has no band at all. The two causes are different facts and must
 * never be worded as one: either the attendance read itself is unavailable, or
 * the read is fine and Rock simply holds no occurrence record for that group in
 * the window. Neither is silence, and neither is healthy. */
function unbandableBecause() {
  return attendanceOk()
    ? "Rock holds no meeting on record for them anywhere in this window, which isn't the same as nobody showing up"
    : "we couldn't load attendance from Rock";
}

function renderSignal(data) {
  const total = fieldTotal();
  const unled = data.filter((group) => group.leaderCount === 0).length;
  const critical = data.filter((group) => group.health.band === "critical").length;
  const thin = data.filter((group) => group.health.band === "thin").length;
  const watch = data.filter((group) => group.health.band === "watch").length;
  const healthy = data.filter((group) => group.health.band === "healthy").length;
  const unknown = data.filter((group) => group.health.band === "unknown").length;
  const collecting = data.filter((group) => group.collectingMembers === true).length;

  fill("signal-note", ...[
    el("strong", null, ofTotal(data.length, total)),
    document.createTextNode(` Connect Groups in slice · ${fmt(collecting)} collecting members`),
  ]);

  const lines = [
    {
      rank: 1,
      tone: unled ? "critical" : "healthy",
      verb: "act first",
      head: unled ? `${fmt(unled)} UNLED ${unled === 1 ? "GROUP" : "GROUPS"}` : "NO UNLED GROUPS",
      copy: unled
        ? [{ strong: "No Leader or Assistant Leader on record in Rock." }]
        : [document.createTextNode("Every group in this slice has at least one Leader or Assistant Leader on record.")],
      bullets: unled
        ? [
            "No Leader or Assistant Leader on record in Rock",
            "A plain fact, not a score; it leads the queue below",
            "Critical regardless of what else is known",
          ]
        : [
            "Every group in this slice has at least one Leader or Assistant Leader on record",
            "No unled groups in this slice",
          ],
      select: unled ? () => { state.filters.unled = true; } : null,
      selectWord: "Unled groups only.",
    },
    {
      rank: 2,
      tone: "thin",
      verb: "coverage",
      head: `${fmt(critical + thin)} UNDER STRAIN`,
      copy: [
        { strong: `${fmt(critical)} critical` },
        document.createTextNode(` (${fmt(unled)} unled) · `),
        { strong: `${fmt(thin)} thin` },
      ],
      bullets: [
        `${fmt(critical)} critical · ${fmt(thin)} thin (${fmt(unled)} unled)`,
        "Decided on the worst of Leadership, Activity, Retention, and Progression",
        "Each group names exactly what is wrong, never a blended score",
      ],
      select: () => {
        state.filters.health = new Set(["critical", "thin"]);
      },
      selectWord: "Critical and thin groups.",
    },
    {
      rank: 3,
      tone: "watch",
      verb: "observe",
      head: `${fmt(watch)} ON WATCH`,
      copy: [document.createTextNode("Softer pressure")],
      bullets: [
        `${fmt(watch)} groups on watch in this slice`,
        "Softer pressure: attendance entering soft or capacity near limit",
        "The cheapest place to prevent next month's strain",
      ],
      select: () => {
        state.filters.health = new Set(["watch"]);
      },
      selectWord: "Groups on watch.",
    },
  ];

  const board = mount("signal-board");
  if (!board) return;
  board.replaceChildren();

  for (const line of lines) {
    const node = el("div", `board-line${line.select ? " is-actionable" : ""}`);
    node.dataset.rank = String(line.rank);
    node.append(el("span", `board-headline c-${line.tone}`, line.head));
    node.append(rich("p", "board-sub", line.copy));
    node.append(el("span", "board-verb", line.verb));
    attachTooltip(node, () => bulletList(line.bullets, { label: line.head }), { pin: !line.select });
    if (line.select) {
      node.setAttribute("role", "button");
      node.tabIndex = 0;
      const act = () => applySelection(line.select, line.selectWord);
      node.addEventListener("click", act);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); act(); }
      });
    }
    board.append(node);
  }

  /* The fourth line is the quiet composition line: full-width band bar with
   * counts beneath in mono, healthy segment quietest, no headline type. */
  const compLine = el("div", "board-line board-composition");
  compLine.dataset.rank = "4";
  compLine.tabIndex = 0;
  compLine.setAttribute("role", "note");

  const countsText = `${fmt(healthy)} healthy · ${fmt(watch)} watch · ${fmt(thin)} thin · ${fmt(critical)} critical · ${fmt(unknown)} unknown`;
  compLine.setAttribute("aria-label", `Field composition: ${countsText}`);

  const bar = bandBar({
    criticalCount: critical,
    thinCount: thin,
    watchCount: watch,
    healthyCount: healthy,
    unknownCount: unknown,
  });
  bar.classList.add("band-bar-signal");
  compLine.append(bar);

  const counts = el("p", "board-composition-counts mono", countsText);
  compLine.append(counts);

  attachTooltip(compLine, () => bulletList([
    `${fmt(healthy)} healthy`,
    `${fmt(watch)} on watch`,
    `${fmt(thin)} thin`,
    `${fmt(critical)} critical`,
    `${fmt(unknown)} unknown`,
  ], { label: "Field composition" }));

  board.append(compLine);

  renderFieldStrip(data);
}

/* The field strip is the whole field, always: the slice stays lit and the rest
 * dims, so the denominator is never off-screen. Arrow keys walk it, Enter opens
 * a group — the ticks are the visual, but not the only, path. */
function renderFieldStrip(data) {
  const strip = mount("fieldstrip");
  if (!strip) return;
  const total = fieldTotal();
  const inSlice = new Set(data.map((group) => group.groupRef));
  const sorted = [...allGroups()].sort((left, right) => (
    (HEALTH_RANK[right.health.band] || 0) - (HEALTH_RANK[left.health.band] || 0)
    || severity(right) - severity(left)
    || left.groupRef - right.groupRef
  ));

  strip.replaceChildren();
  sorted.forEach((group, index) => {
    const lit = inSlice.has(group.groupRef);
    const tick = el("span", `tick h-${group.health.band}${lit ? "" : " is-dim"}`);
    tick.dataset.groupRef = String(group.groupRef);
    tick.setAttribute("role", "button");
    tick.tabIndex = index === 0 ? 0 : -1;
    tick.setAttribute("aria-label", `${groupTitleSpoken(group)} · ${HEALTH_LABEL[group.health.band]}${lit ? "" : " · outside the current slice"}`);
    tick.title = `${groupTitleSpoken(group)} · ${HEALTH_LABEL[group.health.band]}`;
    strip.append(tick);
  });

  strip.setAttribute("aria-label",
    `${total === null ? "Every Connect Group we could load" : `All ${fmt(total)} Connect Groups`} as one strip, sorted Critical to Healthy. ${fmt(data.length)} are in the current slice; the rest are dimmed. Use the arrow keys to walk the strip and Enter to open a group.`);

  strip.onmousemove = (event) => {
    const tick = event.target.closest(".tick");
    if (!tick || state.pinned) return;
    const group = groupByRef(Number(tick.dataset.groupRef));
    if (group) showCard(group, { x: event.clientX, y: event.clientY }, false);
  };
  strip.onmouseleave = () => { if (!state.pinned) hideCard(); };
  strip.onclick = (event) => {
    const tick = event.target.closest(".tick");
    if (!tick) return;
    const group = groupByRef(Number(tick.dataset.groupRef));
    if (group) showCard(group, { x: event.clientX, y: event.clientY }, true);
  };
  strip.onkeydown = (event) => {
    const ticks = [...strip.querySelectorAll(".tick")];
    const current = ticks.indexOf(document.activeElement);
    if (current < 0) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const group = groupByRef(Number(ticks[current].dataset.groupRef));
      if (group) showCard(group, ticks[current], true);
      return;
    }
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(current + 1, ticks.length - 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ticks.length - 1;
    else return;
    event.preventDefault();
    ticks[current].tabIndex = -1;
    ticks[next].tabIndex = 0;
    ticks[next].focus();
  };
  bindScrub(strip, scrubStripResolver(strip));

  const legend = mount("fieldstrip-legend");
  if (legend) {
    legend.replaceChildren(document.createTextNode(`The whole field, one tick per group: ${ofTotal(data.length, total)} lit. In slice:`));
    for (const band of HEALTH_ORDER) {
      const count = data.filter((group) => group.health.band === band).length;
      const swatch = el("span", "sw");
      swatch.style.background = HEALTH_TOKEN[band];
      legend.append(swatch);
      legend.append(document.createTextNode(`${fmt(count)} ${HEALTH_LABEL[band].toLowerCase()}`));
    }
    legend.append(document.createTextNode("."));
    const hint = el("span", "scrub-hint", "Drag across the strip to read a group. Lift to open it.");
    hint.setAttribute("aria-hidden", "true");
    legend.append(hint);
  }
}

function groupByRef(groupRef) {
  return allGroups().find((group) => group.groupRef === groupRef) || null;
}

/* =============================================================== COHORTS == */

/* Age Group × Group Types, straight from the Connect attribute contract. Group
 * Types is a multi-select in Rock, so one group sits in more than one column and
 * the columns deliberately do not sum to the row — the header says so rather
 * than letting a reader add them up and get the wrong total. */
function renderCohort(data) {
  const grid = mount("cohort-grid");
  if (!grid) return;
  const ages = axisValues("age");
  const types = axisValues("type");
  const total = fieldTotal();

  /* Structural absence is computed against the whole field, not the slice: a
   * shape that exists nowhere is a different fact from a shape that no group in
   * this slice happens to have. */
  const existing = new Set();
  for (const group of allGroups()) {
    for (const token of typeKeys(group)) existing.add(`${ageKey(group)}|${token}`);
  }

  grid.replaceChildren();
  grid.style.gridTemplateColumns = "";
  const head = el("div", "cohort-headrow");
  head.append(el("div", null, `Who it is for × what kind of group · ${ofTotal(data.length, total)}`));
  for (const type of types) head.append(el("div", null, labelFor(type)));
  grid.append(head);
  setMatrixColumns([head], types.length);

  const rows = [];
  for (const age of ages) {
    const row = el("div", "cohort-row");
    row.append(el("div", "cohort-rowlabel", labelFor(age)));
    for (const type of types) {
      if (!existing.has(`${age}|${type}`)) {
        const cell = el("div", "cohort-cell is-na");
        cell.setAttribute("role", "cell");
        cell.title = `There's no ${labelFor(age)} × ${labelFor(type)} group anywhere in the field. That's a shape the church doesn't have. Not a zero.`;
        cell.append(el("div", "cell-n", "—"));
        cell.append(el("div", "cell-sub", "no such shape"));
        row.append(cell);
        continue;
      }
      const sub = data.filter((group) => ageKey(group) === age && typeKeys(group).includes(type));
      const concern = sub.filter((group) => (HEALTH_RANK[group.health.band] || 0) >= 3).length;
      const rate = pct(concern, sub.length);
      const active = state.filters.age.size === 1 && state.filters.age.has(age)
        && state.filters.type.size === 1 && state.filters.type.has(type);

      const cell = el("button", `cohort-cell${sub.length ? "" : " is-zero"}${active ? " is-active" : ""}`);
      cell.type = "button";
      if (sub.length) {
        /* The wash is share Thin-or-Critical, mixed from the semantic token so
         * the palette stays in the stylesheet. A browser that cannot mix simply
         * gets no wash; the numeral and the strip carry the value regardless. */
        cell.style.background = `color-mix(in srgb, var(--critical) ${(3 + (rate / 100) * 26).toFixed(1)}%, transparent)`;
      }
      cell.setAttribute("aria-label",
        `${labelFor(age)} × ${labelFor(type)}: ${sub.length ? `${fmt(sub.length)} groups, ${rate.toFixed(0)}% thin or critical` : "0 groups in this slice, a real zero: the shape exists, nothing in this slice has it"}`);
      const numeral = el("div", "cell-n");
      numeral.append(sub.length ? document.createTextNode(fmt(sub.length)) : zeroMark());
      cell.append(numeral);
      cell.append(el("div", "cell-sub", sub.length ? `${rate.toFixed(0)}% thin or critical` : "none in slice"));
      const strip = el("div", "cell-strip");
      const bar = el("i");
      bar.style.width = `${rate}%`;
      strip.append(bar);
      cell.append(strip);
      cell.addEventListener("click", () => applySelection(() => {
        const already = state.filters.age.size === 1 && state.filters.age.has(age)
          && state.filters.type.size === 1 && state.filters.type.has(type);
        state.filters.age.clear();
        state.filters.type.clear();
        if (!already) { state.filters.age.add(age); state.filters.type.add(type); }
      }, `${labelFor(age)} × ${labelFor(type)}.`));
      row.append(cell);
    }
    rows.push(row);
    grid.append(row);
  }
  setMatrixColumns(rows, types.length);
}

/* The matrices are grids of a label column plus one column per axis value, and
 * the axis is whatever the field holds, so the template is set here rather than
 * hard-coded to seven columns in the stylesheet. */
function setMatrixColumns(rows, columns) {
  for (const row of rows) {
    row.style.gridTemplateColumns = `130px repeat(${Math.max(columns, 1)}, minmax(96px, 1fr))`;
  }
}

/* ================================================================ RHYTHM == */

function renderRhythm(data) {
  const grid = mount("rhythm-grid");
  if (!grid) return;
  const days = axisValues("day");
  const bands = axisValues("band");

  const existing = new Set();
  for (const group of allGroups()) existing.add(`${bandKey(group)}|${dayKey(group)}`);

  let max = 1;
  for (const band of bands) {
    for (const day of days) {
      const n = data.filter((group) => bandKey(group) === band && dayKey(group) === day).length;
      if (n > max) max = n;
    }
  }

  grid.replaceChildren();
  const head = el("div", "rhythm-headrow");
  head.append(el("div", null, "Time ↓ · Day →"));
  for (const day of days) head.append(el("div", null, day === NOT_SET ? NOT_SET_LABEL : day.slice(0, 3)));
  grid.append(head);

  const rows = [head];
  for (const band of bands) {
    const row = el("div", "rhythm-row");
    row.append(el("div", "rhythm-rowlabel", labelFor(band)));
    for (const day of days) {
      if (!existing.has(`${band}|${day}`)) {
        const cell = el("div", "rhythm-cell is-na");
        cell.setAttribute("role", "cell");
        cell.title = `No group anywhere in the field meets ${labelFor(day)} ${labelFor(band)}. That's a slot the church doesn't use. Not a zero.`;
        cell.append(el("span", "rn", "—"));
        cell.append(el("div", "rsub", "no such pocket"));
        row.append(cell);
        continue;
      }
      const sub = data.filter((group) => bandKey(group) === band && dayKey(group) === day);
      const concern = sub.filter((group) => (HEALTH_RANK[group.health.band] || 0) >= 3).length;
      const rate = pct(concern, sub.length);
      const active = state.filters.day === day && state.filters.band === band;

      const cell = el("button", `rhythm-cell${sub.length ? "" : " is-zero"}${active ? " is-active" : ""}`);
      cell.type = "button";
      if (sub.length) {
        cell.style.background = `color-mix(in srgb, var(--connect-400) ${(4 + (sub.length / max) * 26).toFixed(1)}%, transparent)`;
      }
      cell.setAttribute("aria-label", `${labelFor(band)} ${labelFor(day)}: ${sub.length ? `${fmt(sub.length)} groups, ${rate.toFixed(0)}% thin or critical` : "0 groups in this slice, a real zero"}`);
      const numeral = el("span", "rn");
      numeral.append(sub.length ? document.createTextNode(fmt(sub.length)) : zeroMark());
      cell.append(numeral);
      cell.append(el("div", "rsub", sub.length ? `${rate.toFixed(0)}% thin or critical` : "none in slice"));
      if (sub.length) {
        const strip = el("div", "cell-strip");
        const bar = el("i");
        bar.style.width = `${rate}%`;
        strip.append(bar);
        cell.append(strip);
      }
      cell.addEventListener("click", () => applySelection(() => {
        const already = state.filters.day === day && state.filters.band === band;
        state.filters.day = already ? "" : day;
        state.filters.band = already ? "" : band;
      }, `${labelFor(day)} ${labelFor(band)}.`));
      row.append(cell);
    }
    rows.push(row);
    grid.append(row);
  }
  for (const row of rows) row.style.gridTemplateColumns = `130px repeat(${Math.max(days.length, 1)}, minmax(84px, 1fr))`;

  /* The read under the matrix. Densest pocket is a fact; heaviest pressure is
   * only offered for pockets big enough to mean anything, and both are labelled
   * exploratory rather than a verdict. */
  const foot = mount("rhythm-foot");
  if (!foot) return;
  if (!data.length) {
    foot.replaceChildren(document.createTextNode("No group in the field matches this slice. That's a real none: we looked, and there are no groups here."));
    return;
  }
  let densest = null;
  let heaviest = null;
  const notSet = data.filter((group) => bandKey(group) === NOT_SET).length;
  for (const band of bands) {
    for (const day of days) {
      const sub = data.filter((group) => bandKey(group) === band && dayKey(group) === day);
      if (!sub.length) continue;
      if (!densest || sub.length > densest.count) densest = { band, day, count: sub.length };
      if (sub.length >= 6) {
        const rate = pct(sub.filter((group) => (HEALTH_RANK[group.health.band] || 0) >= 3).length, sub.length);
        if (!heaviest || rate > heaviest.rate) heaviest = { band, day, rate, count: sub.length };
      }
    }
  }
  const parts = [
    document.createTextNode("Densest pocket: "),
    el("strong", null, densest ? `${labelFor(densest.day)} ${labelFor(densest.band)} (${fmt(densest.count)} groups)` : "—"),
    document.createTextNode("."),
    ...(heaviest ? [
      document.createTextNode(" Heaviest pressure: "),
      el("strong", null, `${labelFor(heaviest.day)} ${labelFor(heaviest.band)}`),
      document.createTextNode(` (${heaviest.rate.toFixed(0)}% thin/critical).`),
    ] : []),
  ];
  if (notSet) {
    const trigger = el("button", "foot-info-trigger", `${fmt(notSet)} unparsed times`);
    trigger.type = "button";
    attachTooltip(trigger, () => bulletList([
      `${fmt(notSet)} of ${fmt(data.length)} groups have a meet-up time we can't read as a clock time`,
      "Rock stores meet-up time as free text; anything unread is left in Not set rather than guessed",
      "Patterns to explore, not verdicts",
    ], { label: "Meet-up time format" }));
    parts.push(document.createTextNode(" "), trigger);
  }
  foot.replaceChildren(...parts);
}

/* --------------------------------------------------- weekly logging grid -- */

/* Week by week over the slice. Four states per group-week, and the fourth —
 * `no occurrence record` — is the one this station exists to keep separate: Rock
 * holds no AttendanceOccurrence row for that group that week, which is neither a
 * missed meeting nor an expected one, and it is never counted as silence. */
function renderLogging(data) {
  const wrap = mount("logging-grid");
  const foot = mount("logging-foot");
  if (!wrap) return;

  if (!attendanceOk()) {
    wrap.replaceChildren(unavailablePanel(state.model.reasons.attendance, "Week by week"));
    if (foot) foot.replaceChildren(document.createTextNode("No week is drawn: we couldn't load attendance from Rock. That isn't a field of weeks where nothing happened."));
    return;
  }
  if (!weekAxis.length) {
    const p = el("p", "station-foot", "No weeks on record in this window. ");
    const trg = el("button", "foot-info-trigger", "Why?");
    trg.type = "button";
    attachTooltip(trg, () => bulletList([
      "Rock came back with no weeks at all in this window",
      "We looked and found none, different from not being able to look",
      "Different again from a field where nobody met",
    ], { label: "No weeks on record" }));
    p.append(trg);
    wrap.replaceChildren(p);
    if (foot) foot.replaceChildren();
    return;
  }

  const weekCounts = [];
  let totals = { recorded: 0, didNotOccur: 0, notLogged: 0, noRecord: 0 };
  for (const weekStartDate of weekAxis) {
    const counts = { recorded: 0, didNotOccur: 0, notLogged: 0, noRecord: 0 };
    for (const group of data) {
      const occState = occurrenceAt(group, weekStartDate);
      if (occState === "attendance-recorded") counts.recorded += 1;
      else if (occState === "did-not-occur") counts.didNotOccur += 1;
      else if (occState === "not-logged") counts.notLogged += 1;
      else counts.noRecord += 1;
    }
    totals = {
      recorded: totals.recorded + counts.recorded,
      didNotOccur: totals.didNotOccur + counts.didNotOccur,
      notLogged: totals.notLogged + counts.notLogged,
      noRecord: totals.noRecord + counts.noRecord,
    };
    weekCounts.push({ weekStartDate, counts });
  }

  /* Grouped line graph is the default view */
  const chart = buildLoggingChart(data, weekCounts);

  /* Relocated table behind a disclosure control */
  const table = el("table", "field-table logging-table");
  table.append(el("caption", null,
    `Every week in the window against ${fmt(data.length)} groups in this slice.`));
  const thead = el("thead");
  const headRow = el("tr");
  for (const [label, scope] of [["Week", "col"], ["Attendance entered", "col"], ["Meeting cancelled", "col"], ["Attendance not entered", "col"], ["No meeting on record", "col"], ["Shape", "col"]]) {
    const cell = el("th", label === "Week" || label === "Shape" ? null : "num", label);
    cell.setAttribute("scope", scope);
    headRow.append(cell);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const { weekStartDate, counts } of weekCounts) {
    const row = el("tr");
    const label = el("th", "mono", weekStartDate);
    label.setAttribute("scope", "row");
    row.append(label);
    for (const key of ["recorded", "didNotOccur", "notLogged", "noRecord"]) {
      const cell = el("td", "num");
      cell.append(countMark(counts[key]));
      row.append(cell);
    }
    const shape = el("td");
    shape.append(loggingBar(counts, data.length, weekStartDate));
    row.append(shape);
    tbody.append(row);
  }
  table.append(tbody);

  const details = el("details", "logging-table-details");
  const summary = el("summary", "logging-table-summary", "Show the week-by-week table");
  details.append(summary);
  const scroll = el("div", "tablewrap");
  scroll.append(table);
  details.append(scroll);

  wrap.replaceChildren(chart, details);

  if (foot) {
    const observed = totals.recorded + totals.didNotOccur + totals.notLogged;
    const answered = totals.recorded + totals.didNotOccur;
    const trigger = el("button", "foot-info-trigger", "Detail");
    trigger.type = "button";
    attachTooltip(trigger, () => bulletList([
      `${fmt(observed)} meetings on record out of ${fmt(data.length * weekAxis.length)} possible group-weeks`,
      `${observed ? Math.round(pct(answered, observed)) : 0}% of meetings on record were answered (attendance entered or cancelled)`,
      `${fmt(totals.noRecord)} times with no meeting on record in Rock at all (not counted as silence)`,
    ], { label: "Weekly logging detail" }));
    foot.replaceChildren(...[
      el("strong", null, `${fmt(observed)}`),
      document.createTextNode(" on record · "),
      el("strong", null, `${observed ? Math.round(pct(answered, observed)) : 0}%`),
      document.createTextNode(" answered "),
      trigger,
    ]);
  }
}

function buildLoggingChart(data, weekCounts) {
  const wrap = el("div", "logging-chart-wrap");

  const caption = el("p", "logging-chart-caption",
    `Every week in the window against ${fmt(data.length)} groups in this slice.`);
  wrap.append(caption);

  const SERIES = [
    { key: "recorded", label: "Attendance entered", className: "series-recorded", shape: "circle" },
    { key: "didNotOccur", label: "Meeting cancelled", className: "series-did-not-occur", shape: "triangle" },
    { key: "notLogged", label: "Attendance not entered", className: "series-not-logged", shape: "square" },
    { key: "noRecord", label: "No meeting on record", className: "series-no-record", shape: "diamond" },
  ];

  /* Legend */
  const legend = el("ul", "logging-legend");
  for (const s of SERIES) {
    const item = el("li", "logging-legend-item");
    const icon = svgEl("svg", {
      class: `logging-legend-icon ${s.className}`,
      viewBox: "0 0 24 12",
      width: "24",
      height: "12",
      "aria-hidden": "true",
    });
    icon.append(svgEl("line", { x1: "0", y1: "6", x2: "24", y2: "6" }));
    if (s.shape === "circle") {
      icon.append(svgEl("circle", { cx: "12", cy: "6", r: "3.5", class: `logging-marker ${s.className}` }));
    } else if (s.shape === "triangle") {
      icon.append(svgEl("polygon", { points: "12,2 8.5,9.5 15.5,9.5", class: `logging-marker ${s.className}` }));
    } else if (s.shape === "square") {
      icon.append(svgEl("rect", { x: "9", y: "3", width: "6", height: "6", class: `logging-marker ${s.className}` }));
    } else if (s.shape === "diamond") {
      icon.append(svgEl("polygon", { points: "12,1.5 16,6 12,10.5 8,6", class: `logging-marker ${s.className}` }));
    }
    item.append(icon, el("span", null, s.label));
    legend.append(item);
  }
  wrap.append(legend);

  /* SVG Chart */
  const W = 860;
  const H = 280;
  const plot = { left: 54, right: 826, top: 24, bottom: 228 };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const N = weekCounts.length;

  let maxVal = 0;
  for (const item of weekCounts) {
    for (const s of SERIES) {
      if (item.counts[s.key] > maxVal) maxVal = item.counts[s.key];
    }
  }

  const { yMax, ticks } = computeLoggingYTicks(maxVal);
  const Y = (val) => plot.bottom - (yMax > 0 ? (val / yMax) * plotHeight : 0);

  const svg = svgEl("svg", {
    class: "logging-chart-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
  });

  const title = svgEl("title", {});
  title.textContent = `Weekly group logging: attendance entered, meeting cancelled, attendance not entered, and no meeting on record over ${N} weeks against ${fmt(data.length)} groups in this slice.`;
  svg.append(title);

  /* Horizontal grid lines & Y tick labels */
  for (const tick of ticks) {
    const y = Y(tick);
    svg.append(svgEl("line", {
      class: "gridline",
      x1: String(plot.left),
      y1: y.toFixed(1),
      x2: String(plot.right),
      y2: y.toFixed(1),
    }));
    const tickLabel = svgEl("text", {
      class: "tick-label",
      x: String(plot.left - 8),
      y: (y + 4).toFixed(1),
      "text-anchor": "end",
    });
    tickLabel.textContent = fmt(tick);
    svg.append(tickLabel);
  }

  /* Baseline X axis */
  svg.append(svgEl("line", {
    class: "axis",
    x1: String(plot.left),
    y1: String(plot.bottom),
    x2: String(plot.right),
    y2: String(plot.bottom),
  }));

  /* Vertical grid lines, ticks, and date labels */
  for (let i = 0; i < N; i++) {
    const item = weekCounts[i];
    const x = N === 1 ? (plot.left + plot.right) / 2 : plot.left + (i / (N - 1)) * plotWidth;

    svg.append(svgEl("line", {
      class: "gridline gridline-x",
      x1: x.toFixed(1),
      y1: String(plot.top),
      x2: x.toFixed(1),
      y2: String(plot.bottom),
    }));

    svg.append(svgEl("line", {
      class: "axis-tick",
      x1: x.toFixed(1),
      y1: String(plot.bottom),
      x2: x.toFixed(1),
      y2: String(plot.bottom + 5),
    }));

    const dateLabel = svgEl("text", {
      class: "tick-label",
      x: x.toFixed(1),
      y: String(plot.bottom + 20),
      "text-anchor": "middle",
    });
    dateLabel.textContent = item.weekStartDate;
    svg.append(dateLabel);
  }

  /* Render each of the four series */
  for (const s of SERIES) {
    const points = weekCounts.map((item, i) => {
      const x = N === 1 ? (plot.left + plot.right) / 2 : plot.left + (i / (N - 1)) * plotWidth;
      const val = item.counts[s.key] || 0;
      const y = Y(val);
      return { x, y, val, week: item.weekStartDate };
    });

    let d = "";
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      d += `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    svg.append(svgEl("path", {
      class: `logging-line ${s.className}`,
      d,
    }));

    for (const pt of points) {
      let marker;
      if (s.shape === "circle") {
        marker = svgEl("circle", {
          class: `logging-marker ${s.className}`,
          cx: pt.x.toFixed(1),
          cy: pt.y.toFixed(1),
          r: "3.5",
        });
      } else if (s.shape === "triangle") {
        const pts = `${pt.x.toFixed(1)},${(pt.y - 4).toFixed(1)} ${(pt.x - 3.5).toFixed(1)},${(pt.y + 3.5).toFixed(1)} ${(pt.x + 3.5).toFixed(1)},${(pt.y + 3.5).toFixed(1)}`;
        marker = svgEl("polygon", {
          class: `logging-marker ${s.className}`,
          points: pts,
        });
      } else if (s.shape === "square") {
        marker = svgEl("rect", {
          class: `logging-marker ${s.className}`,
          x: (pt.x - 3).toFixed(1),
          y: (pt.y - 3).toFixed(1),
          width: "6",
          height: "6",
        });
      } else if (s.shape === "diamond") {
        const pts = `${pt.x.toFixed(1)},${(pt.y - 4.5).toFixed(1)} ${(pt.x + 4).toFixed(1)},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${(pt.y + 4.5).toFixed(1)} ${(pt.x - 4).toFixed(1)},${pt.y.toFixed(1)}`;
        marker = svgEl("polygon", {
          class: `logging-marker ${s.className}`,
          points: pts,
        });
      }
      const markerTitle = svgEl("title", {});
      markerTitle.textContent = `${s.label}: ${fmt(pt.val)} (week of ${pt.week})`;
      marker.append(markerTitle);
      svg.append(marker);
    }
  }

  wrap.append(svg);
  return wrap;
}

function computeLoggingYTicks(maxVal) {
  const max = Math.max(1, maxVal);
  if (max <= 4) {
    const ticks = [];
    for (let i = 0; i <= max; i++) ticks.push(i);
    return { yMax: max, ticks };
  }
  let step = 1;
  if (max <= 10) step = 2;
  else if (max <= 25) step = 5;
  else if (max <= 50) step = 10;
  else if (max <= 100) step = 20;
  else if (max <= 250) step = 50;
  else if (max <= 500) step = 100;
  else {
    const raw = max / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    step = Math.ceil(raw / mag) * mag;
  }
  const yMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  return { yMax, ticks };
}

function loggingBar(counts, denominator, weekStartDate) {
  const bar = el("span", "logbar");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label",
    `Week of ${weekStartDate}, out of ${denominator} groups: ${counts.recorded} with attendance entered, ${counts.didNotOccur} cancelled, ${counts.notLogged} with no attendance entered, ${counts.noRecord} with no meeting on record.`);
  const segments = [
    ["recorded", "var(--healthy)"],
    ["didNotOccur", "var(--muted)"],
    ["notLogged", "var(--critical)"],
    ["noRecord", "var(--panel-lit)"],
  ];
  for (const [key, token] of segments) {
    if (!counts[key]) continue;
    const segment = el("i", `logseg logseg-${key}`);
    segment.style.width = `${pct(counts[key], denominator || 1)}%`;
    segment.style.background = token;
    bar.append(segment);
  }
  return bar;
}

/* ============================================================== PRESSURE == */

/* Designed as a two-axis field — leader load against retention — because
 * "loaded and sticky" is a different pastoral conversation from "supported and
 * drifting". The retention axis has no approved Rock resolver, so it renders
 * unavailable and the marks sit on one rail. Vertical position carries no
 * meaning here: the jitter only stops marks from hiding each other, and the
 * plot says so out loud rather than spreading the dots to look like data.
 */
function renderPressure(data) {
  const svg = mount("pressure-plot");
  if (!svg) return;
  const W = 860;
  const plot = { left: 62, right: 690, top: 46, bottom: 250 };
  const rail = 152;
  const jitter = 52;
  const gutter = { left: 726, right: 846 };
  const xMax = 24;

  const X = (value) => plot.left + (Math.min(Math.max(value, 0), xMax) / xMax) * (plot.right - plot.left);
  /* Deterministic per group, so a re-render never reshuffles the rail. */
  const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

  const nodes = [];
  for (const value of [0, 4, 8, 12, 16, 20, 24]) {
    nodes.push(svgEl("line", { class: "gridline", x1: X(value), y1: plot.top, x2: X(value), y2: plot.bottom }));
    const label = svgEl("text", { class: "tick-label", x: X(value), y: plot.bottom + 18, "text-anchor": "middle" });
    label.textContent = value === xMax ? "24+" : String(value);
    nodes.push(label);
  }
  nodes.push(svgEl("line", { class: "axis", x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom }));
  nodes.push(svgEl("line", { class: "guide", x1: X(12), y1: plot.top, x2: X(12), y2: plot.bottom }));

  const guideLabel = svgEl("text", { class: "quad-label", x: X(12) + 10, y: plot.top + 14 });
  guideLabel.textContent = "ONE LEADER PER 12 PEOPLE: WORKING GUIDE";
  nodes.push(guideLabel);

  const axisLabel = svgEl("text", { class: "axis-label", x: (plot.left + plot.right) / 2, y: 300, "text-anchor": "middle" });
  axisLabel.textContent = "PEOPLE PER LEADER →";
  nodes.push(axisLabel);

  const noMeaning = svgEl("text", { class: "gutter-label", x: plot.left, y: plot.top - 16 });
  noMeaning.textContent = "HEIGHT MEANS NOTHING HERE: WE DON'T TRACK RETENTION YET";
  nodes.push(noMeaning);

  nodes.push(svgEl("line", { class: "guide", x1: gutter.left - 16, y1: plot.top, x2: gutter.left - 16, y2: plot.bottom }));
  const gutterLabel = svgEl("text", { class: "gutter-label", x: (gutter.left + gutter.right) / 2, y: plot.top - 16, "text-anchor": "middle" });
  gutterLabel.textContent = "UNLED";
  nodes.push(gutterLabel);

  const inSlice = new Set(data.map((group) => group.groupRef));
  let unledInSlice = 0;
  let overMax = 0;
  for (const group of allGroups()) {
    const lit = inSlice.has(group.groupRef);
    const span = leaderSpan(group);
    const radius = Math.max(3.2, Math.min(9, 2.4 + Math.sqrt(Math.max(group.activeMemberCount, 0)) * 0.85));
    let cx;
    if (span === null) {
      cx = gutter.left + hash(group.groupRef) * (gutter.right - gutter.left);
      if (lit) unledInSlice += 1;
    } else {
      cx = X(span);
      if (lit && span > xMax) overMax += 1;
    }
    const cy = rail + (hash(group.groupRef * 7 + 3) - 0.5) * 2 * jitter;
    const dot = svgEl("circle", {
      class: `dot${lit ? "" : " is-dim"}`,
      cx: cx.toFixed(1),
      cy: cy.toFixed(1),
      r: radius.toFixed(1),
      "fill-opacity": "0.62",
    });
    dot.dataset.groupRef = String(group.groupRef);
    dot.style.fill = HEALTH_TOKEN[group.health.band];
    nodes.push(dot);
  }

  const title = svgEl("title", {});
  title.textContent = `One mark per Connect Group: left to right is people per leader, mark size is active members, colour is the group\u2019s state. ${data.length} of ${allGroups().length} marks are lit. The table below shows the same groups without the picture.`;
  svg.replaceChildren(title, ...nodes);
  bindDots(svg);

  /* Retention is unavailable, and the station says it where the axis would
   * have been rather than leaving a blank edge that reads as agreement. */
  fill("pressure-retention", unavailablePanel(reasonFor("retention"), "Retention: how many people stay"));

  const withSpan = data.filter((group) => leaderSpan(group) !== null);
  const strained = withSpan.filter((group) => leaderSpan(group) >= LEADER_LOAD_THIN).length;
  const hint = el("span", "scrub-hint", "Drag across the plot to read a group. Lift to open it.");
  hint.setAttribute("aria-hidden", "true");
  fill("pressure-foot", ...[
    el("strong", null, fmt(unledInSlice)),
    document.createTextNode(` unled · `),
    el("strong", null, fmt(strained)),
    document.createTextNode(` of ${fmt(withSpan.length)} carry ${LEADER_LOAD_THIN}+ members/leader`),
    document.createTextNode(overMax ? ` · ${fmt(overMax)} at 24+ edge` : ""),
    hint,
  ]);

  renderPressureTable(data);
}

function bindDots(svg) {
  svg.onmousemove = (event) => {
    const dot = event.target.closest(".dot");
    if (!dot || dot.classList.contains("is-dim")) return;
    for (const hovered of svg.querySelectorAll(".dot.is-hover")) hovered.classList.remove("is-hover");
    dot.classList.add("is-hover");
    if (state.pinned) return;
    const group = groupByRef(Number(dot.dataset.groupRef));
    if (group) showCard(group, { x: event.clientX, y: event.clientY }, false);
  };
  svg.onmouseleave = () => {
    for (const hovered of svg.querySelectorAll(".dot.is-hover")) hovered.classList.remove("is-hover");
    if (!state.pinned) hideCard();
  };
  svg.onclick = (event) => {
    const dot = event.target.closest(".dot");
    if (!dot || dot.classList.contains("is-dim")) return;
    const group = groupByRef(Number(dot.dataset.groupRef));
    if (group) showCard(group, { x: event.clientX, y: event.clientY }, true);
  };
  bindScrub(svg, scrubDotResolver(svg));
}

/* The same data as the plot, keyboard-reachable, no canvas and no pointer
 * required. Sorted the way the queue is, so the top of the table is the top of
 * the console's attention. */
function renderPressureTable(data) {
  const details = mount("pressure-table");
  if (!details) return;
  const rows = [...data].sort((left, right) => severity(right) - severity(left));

  const summary = el("summary", null, `Show every group as a table · ${fmt(rows.length)} groups`);
  const scroll = el("div", "tablewrap");
  const table = el("table", "field-table");
  table.append(el("caption", null, "Every group in this slice: members, leaders, people per leader, capacity, its state and why."));
  const thead = el("thead");
  const headRow = el("tr");
  for (const label of ["Group", "Campus", "Members", "Leaders", "People per leader", "Capacity", "Open seats", "State", "Why"]) {
    const cell = el("th", null, label);
    cell.setAttribute("scope", "col");
    headRow.append(cell);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const group of rows) {
    const row = el("tr");
    const label = el("th");
    label.setAttribute("scope", "row");
    const open = el("a", "group-ref-link", groupTitle(group));
    open.href = `${CONNECT_URL}${group.groupRef}`;
    open.target = "_blank";
    open.rel = "noopener";
    open.setAttribute("aria-label", `Open ${groupTitleSpoken(group)} on connect.example.invalid`);
    label.append(open);
    label.append(groupRefChip(group));
    row.append(label);
    row.append(el("td", null, group.campusShortCode));
    row.append(numCell(group.activeMemberCount));
    row.append(numCell(group.leaderCount));

    const spanCell = el("td", "num");
    const span = leaderSpan(group);
    spanCell.append(span === null ? el("span", "c-critical", "unled") : document.createTextNode(String(span)));
    row.append(spanCell);

    const capCell = el("td", "num");
    capCell.append(group.capacity === null
      ? unavailableMark("No capacity is set on this group in Rock, so it's unknown, not zero and not full.", "Unknown")
      : countMark(group.capacity));
    row.append(capCell);

    const seatCell = el("td", "num");
    seatCell.append(group.openSeatCount === null
      ? unavailableMark("Rock has no capacity for this group, so we can't work out how many seats are open.", "Unknown")
      : countMark(group.openSeatCount));
    row.append(seatCell);

    const bandCell = el("td");
    bandCell.append(el("span", `state-chip h-${group.health.band}`, HEALTH_LABEL[group.health.band]));
    row.append(bandCell);
    const whyCell = el("td", "why-cell");
    whyCell.append(whyTrigger(group, healthReasons(group), { label: "Why now" }));
    row.append(whyCell);
    tbody.append(row);
  }
  table.append(tbody);
  scroll.append(table);

  const wasOpen = details.open;
  details.replaceChildren(summary, scroll);
  details.open = wasOpen;
}

function numCell(value) {
  const cell = el("td", "num");
  cell.append(countMark(value));
  return cell;
}

/* ================================================================= MODES == */

/* Every meeting location type in the field, compared on shared scales: the same
 * health composition bar, the same answered-occurrence rate, the same seat
 * arithmetic. The retention spread the prototype drew here is unavailable and
 * says so in every panel on purpose — an empty row would read as agreement. */
function renderModes(data) {
  const row = mount("modes-row");
  if (!row) return;
  row.replaceChildren();

  for (const key of axisValues("meet")) {
    const sub = data.filter((group) => meetKey(group) === key);
    const panel = el("button", `mode-panel${state.filters.meet.size === 1 && state.filters.meet.has(key) ? " is-active" : ""}`);
    panel.type = "button";

    const head = el("div", "mode-head");
    head.append(el("span", "mode-name", labelFor(key)));
    const count = el("span", "mode-n");
    if (sub.length === 0) count.append(zeroMark(), document.createTextNode(" groups"));
    else count.append(document.createTextNode(`${fmt(sub.length)} groups`));
    head.append(count);
    panel.append(head);

    if (!sub.length) {
      panel.append(el("p", "mode-empty", `No ${labelFor(key)} group is in this slice. A real zero: we looked, and there are none.`));
    } else {
      panel.append(compositionBar(sub, `${labelFor(key)}: the mix of group states`));

      /* Answered-occurrence rate: of the group-weeks that actually had an
       * occurrence record, the share that were answered at all. Weeks with no
       * occurrence record are not in the denominator, because they are not
       * evidence of anything. */
      const stats = occurrenceStats(sub);
      const rateLine = el("p", "mode-foot");
      if (!attendanceOk()) {
        rateLine.append(document.createTextNode("Meetings answered "));
        rateLine.append(unavailableMark(state.model.reasons.attendance));
      } else if (stats.observed === 0) {
        const mark = el("span", "mode-stat-empty", "No meetings on record");
        attachTooltip(mark, () => bulletList([
          "Not one of these groups has a meeting on record in this window",
          "No rate to give, and nothing to read into it",
        ], { label: `${labelFor(key)} meetings` }));
        rateLine.append(mark);
      } else {
        const rate = `${Math.round(pct(stats.answered, stats.observed))}%`;
        const trigger = el("button", "mode-stat-trigger");
        trigger.type = "button";
        trigger.append(el("strong", null, rate));
        trigger.append(document.createTextNode(" answered"));
        attachTooltip(trigger, () => bulletList([
          `${rate} of ${fmt(stats.observed)} meetings on record were answered`,
          `${fmt(stats.noRecord)} times there was no meeting on record at all`,
        ], { label: `${labelFor(key)} meetings answered` }), { pin: false });
        rateLine.append(trigger);
      }
      panel.append(rateLine);

      const seats = sub.reduce((total, group) => total + (group.openSeatCount !== null && group.openSeatCount > 0 ? group.openSeatCount : 0), 0);
      const capacityKnown = sub.filter((group) => group.capacity !== null).length;
      const seatLine = el("p", "mode-foot");
      const seatTrigger = el("button", "mode-stat-trigger");
      seatTrigger.type = "button";
      seatTrigger.append(el("strong", null, fmt(seats)));
      seatTrigger.append(document.createTextNode(" open seats"));
      attachTooltip(seatTrigger, () => bulletList([
        `${fmt(seats)} open seats across ${fmt(capacityKnown)} of ${fmt(sub.length)} groups with capacity set in Rock`,
        `${fmt(sub.length - capacityKnown)} groups have no capacity set in Rock`,
      ], { label: `${labelFor(key)} open seats` }), { pin: false });
      seatLine.append(seatTrigger);
      panel.append(seatLine);

      const retention = el("div", "mode-ret");
      retention.append(el("span", "mode-ret-label", "how many people stay"));
      retention.append(unavailableMark(reasonFor("retention")));
      panel.append(retention);
    }

    panel.addEventListener("click", () => applySelection(() => {
      const already = state.filters.meet.size === 1 && state.filters.meet.has(key);
      state.filters.meet.clear();
      if (!already) state.filters.meet.add(key);
    }, `${labelFor(key)}.`));
    row.append(panel);
  }
}

function occurrenceStats(groups) {
  let observed = 0;
  let answered = 0;
  let noRecord = 0;
  if (!attendanceOk()) return { observed, answered, noRecord };
  for (const group of groups) {
    for (const weekStartDate of weekAxis) {
      const occState = occurrenceAt(group, weekStartDate);
      if (occState === "no-record") { noRecord += 1; continue; }
      observed += 1;
      if (occState !== "not-logged") answered += 1;
    }
  }
  return { observed, answered, noRecord };
}

function compositionBar(groups, label) {
  const bar = el("span", "comp-bar");
  bar.setAttribute("role", "img");
  const words = [];
  for (const band of HEALTH_ORDER) {
    const count = groups.filter((group) => group.health.band === band).length;
    if (!count) continue;
    words.push(`${count} ${HEALTH_LABEL[band].toLowerCase()}`);
    const segment = el("i", `comp-seg h-${band}`);
    segment.style.width = `${pct(count, groups.length)}%`;
    segment.style.background = HEALTH_TOKEN[band];
    bar.append(segment);
  }
  bar.setAttribute("aria-label", `${label}: ${words.join(", ")} of ${groups.length} groups.`);
  return bar;
}

/* ================================================================ CANOPY == */

/* Physical weight, not an org tree: band width is group count and the fill is
 * health composition. The band name is the highest ancestor whose name is
 * structural — the Region and Cluster levels are named after the people who lead
 * them, so this console emits the tier word and the numeric parent reference and
 * never the parent's name. The tree is ragged, and the band says how ragged. */
function renderCanopy(data) {
  const wrap = mount("canopy");
  if (!wrap) return;
  wrap.replaceChildren();

  const bands = axisValues("canopy")
    .map((key) => ({ key, groups: data.filter((group) => canopyKey(group) === key) }))
    .filter((band) => band.groups.length > 0)
    .sort((left, right) => right.groups.length - left.groups.length);

  if (!bands.length) {
    wrap.append(el("p", "canopy-empty", "No group in the field matches this slice. A real none: we looked, and there are no groups here."));
    fill("canopy-foot");
    return;
  }

  for (const band of bands) {
    const button = el("button", `canopy-band${state.filters.canopy === band.key ? " is-active" : ""}`);
    button.type = "button";
    button.style.flexGrow = String(Math.max(band.groups.length, 2));

    const fillWrap = el("span", "canopy-fill");
    for (const healthBand of HEALTH_ORDER) {
      const count = band.groups.filter((group) => group.health.band === healthBand).length;
      if (!count) continue;
      const segment = el("i", `h-${healthBand}`);
      segment.style.height = `${pct(count, band.groups.length)}%`;
      segment.style.background = HEALTH_TOKEN[healthBand];
      fillWrap.append(segment);
    }
    button.append(fillWrap);

    const direct = band.groups.filter((group) => group.canopyTier === null).length;
    const tiers = new Map();
    for (const group of band.groups) {
      if (group.canopyTier === null) continue;
      tiers.set(group.canopyTier, (tiers.get(group.canopyTier) || 0) + 1);
    }
    const tierWords = [...tiers.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([tier, count]) => `${fmt(count)} under a ${tier.toLowerCase()}`);
    if (direct) tierWords.push(`${fmt(direct)} sitting directly under the band`);

    const label = el("span", "canopy-label", labelFor(band.key));
    label.append(el("small", null, `${fmt(band.groups.length)} groups`));
    button.append(label);
    button.setAttribute("aria-label", `${labelFor(band.key)}: ${fmt(band.groups.length)} groups in this slice.`);
    attachTooltip(button, () => bulletList([
      `${fmt(band.groups.length)} groups in this slice`,
      ...tierWords,
    ], { label: labelFor(band.key) }), { pin: false });

    button.addEventListener("click", () => applySelection(() => {
      state.filters.canopy = state.filters.canopy === band.key ? "" : band.key;
    }, `${labelFor(band.key)}.`));
    wrap.append(button);
  }

  const total = fieldTotal();
  fill("canopy-foot", ...[
    el("strong", null, fmt(data.length)),
    document.createTextNode(`${total === null ? " of an unknown total" : ` of ${fmt(total)}`} groups across ${fmt(bands.length)} ${bands.length === 1 ? "band" : "bands"}`),
  ]);
}

/* ================================================================= QUEUE == */

/* Only after the field: the groups under the most pressure in the current slice,
 * never a spreadsheet. The rank uses only inputs this console can compute — an
 * unavailable input never quietly scores as healthy, and never scores at all. */
function renderQueue(data) {
  const queue = mount("queue");
  if (!queue) return;
  queue.replaceChildren();

  const unknown = data.filter((group) => group.health.band === "unknown");
  const rankable = data
    .filter((group) => (HEALTH_RANK[group.health.band] || 0) >= 2)
    .sort((left, right) => severity(right) - severity(left));
  const ranked = rankable.slice(0, QUEUE_LENGTH);

  if (!ranked.length) {
    // "A real none" is only true if every group here could actually be judged. If the
    // whole slice is unbandable, saying nothing needs attention would be a claim we
    // have not earned, so the two cases get two different sentences.
    queue.append(el("div", "queue-empty", unknown.length === data.length && data.length > 0
      ? "We can't rank anything in this slice: there's no meeting on record for any of these groups, so none of them can be judged. This isn't the same as nothing needing attention."
      : "Nothing in this slice needs the queue: no group here is on Watch, Thin, or Critical. We looked; that's a real none, not a missing number."));
  } else {
    ranked.forEach((group, index) => {
      const row = el("div", "queue-row");
      row.append(el("span", "queue-rank", String(index + 1)));

      const identity = el("div");
      identity.append(groupHeading(group, "queue-name"));
      /* The title already carries who the group is for, where it is and when it
       * meets, so the line beneath it carries only what the title does not. */
      const meta = [
        group.campusShortCode,
        typeKeys(group).map(labelFor).join(" + "),
        labelFor(meetKey(group)),
        labelFor(bandKey(group)),
      ].join(" · ");
      identity.append(el("div", "queue-meta", meta));
      row.append(identity);

      const why = el("div", "queue-why");
      const reasons = healthReasons(group);
      if (reasons[0]) why.append(el("span", "why-line", reasons[0]));
      why.append(whyTrigger(group, reasons, { label: "Why now", disc: true }));
      why.append(occurrenceStrip(group));
      row.append(why);

      row.append(el("span", `state-chip h-${group.health.band}`, HEALTH_LABEL[group.health.band]));

      const open = el("a", "open-connect", "Open Connect ↗");
      open.href = `${CONNECT_URL}${group.groupRef}`;
      open.target = "_blank";
      open.rel = "noopener";
      open.setAttribute("aria-label", `Open ${groupTitleSpoken(group)} on connect.example.invalid`);
      row.append(open);
      queue.append(row);
    });
  }

  const notes = el("div", "queue-notes");
  if (unknown.length) {
    const unkBtn = el("button", "queue-note-trigger", `${fmt(unknown.length)} unknown ${unknown.length === 1 ? "group" : "groups"} excluded`);
    unkBtn.type = "button";
    attachTooltip(unkBtn, () => bulletList([
      `Can't be put in any state: ${unbandableBecause()}`,
      "Not ranked in this queue",
      "Not counted as healthy, counted as unknown across all totals",
    ], { label: "Unknown groups" }));
    notes.append(unkBtn);
  }
  const rankBtn = el("button", "queue-note-trigger", `Ranked out of ${fmt(data.length)} groups${rankable.length > ranked.length ? ` · top ${fmt(ranked.length)} shown` : ""}`);
  rankBtn.type = "button";
  const rankBullets = [
    "1. No leader",
    "2. Attendance gone quiet",
    "3. Most people per leader",
  ];
  if (rankable.length > ranked.length) {
    rankBullets.push(`Station shows top ${fmt(ranked.length)} of ${fmt(rankable.length)}; export rail carries all ranked groups`);
  }
  attachTooltip(rankBtn, () => bulletList(rankBullets, { label: "Queue ranking order" }));
  notes.append(rankBtn);
  queue.append(notes);
}

/* ========================================================== PLOTBOARD ==
 *
 * The Plotboard is a LOCALITY OPERATIONS BOARD, not a GIS surface (#258).
 *
 * One stable visual grammar, and it does not change between modes:
 *
 *     position  = the locality's centroid          (never a group, never an address)
 *     size      = how many Connect Groups are there
 *     numeral   = the same group count, in figures
 *     label     = the place name
 *     emphasis  = whether this reading is pointing at the place, and in what state
 *
 * The object does not shapeshift when the question changes. Everything that used
 * to compete with that grammar -- two heatmaps, the gap ring, per-marker risk
 * mini-bars, a numeral that meant "groups" in one mode and "seats" in another,
 * and a rail that only existed in one mode -- is gone. Composition (which bands,
 * how much capacity, how many leaders) lives in the permanent rail, where there
 * is room to name it in words.
 *
 * Colour is CSS's job. The marker carries `data-band` / `data-cap` and the console
 * carries `data-plotmode`; the stylesheet decides what those mean on the cream
 * board. So switching modes repaints without rebuilding a single node, and a
 * theme change cannot leave the map holding a colour the rest of the page has
 * stopped using. There is no colour literal in this region at all.
 *
 * Why DOM markers rather than MapLibre symbol layers: a symbol layer with text
 * needs a `glyphs` URL, and this island ships no glyph PBFs and is not allowed to
 * fetch any. Text on this board therefore has to be HTML. That is a rendering
 * constraint, not a design one.
 */

/* The four questions, the compact noun that names each, and the two lines of
 * copy the board shows: the subtitle (what this mode ranks) and the legend chip
 * on the board itself (what the fill means). Pressure is first and is the
 * default -- the executive job is to find where attention is required, and
 * network density is context, not the opening question (#258 §5). */
const PLOT_MODES = {
  pressure: {
    label: "Pressure",
    subtitle: "Places where Thin / Critical pressure is concentrating.",
    legend: "size = groups · filled = a place the rail ranks · hue = the place's state, any Critical wins · hatched = no Connect",
    railTitle: "Needs attention",
  },
  capacity: {
    label: "Capacity",
    subtitle: "Places with known room to receive people.",
    legend: "size = groups · filled = a place the rail ranks · deeper = more known seats · dashed = capacity not set · hatched = no Connect",
    railTitle: "Places with room",
  },
  network: {
    label: "Network",
    subtitle: "Where the Connect network is concentrated.",
    legend: "size = groups · nothing lit: presence, not a judgement · hatched = no Connect",
    railTitle: "Largest concentrations",
  },
  opportunity: {
    label: "Opportunity",
    subtitle: "Where verified demand exceeds healthy receiving capacity.",
    legend: "size = groups · nothing lit: demand is Unavailable · hatched = no Connect",
    railTitle: "Demand exceeding capacity",
  },
};

const PLOT_MODE_KEYS = ["pressure", "capacity", "network", "opportunity"];

/* Coarse administrative centroids. This is the whole geography this page has,
 * and it is deliberately no finer: a locality is the smallest place a Connect
 * Group is ever described by, and no street, landmark, or person coordinate
 * enters this file. Zoom stops here because the data stops here. */
const LOCALITY_CENTROIDS = {
  // MNL
  "Quezon City": { coords: [121.0486, 14.6511], campus: "MNL" },
  "Manila": { coords: [120.9804, 14.5904], campus: "MNL" },
  "Pasig": { coords: [121.0764, 14.5605], campus: "MNL" },
  "Ortigas Center": { coords: [121.0567, 14.5866], campus: "MNL" },
  "Makati": { coords: [121.0211, 14.5568], campus: "MNL" },
  "Taguig": { coords: [121.0745, 14.5271], campus: "MNL" },
  "BGC": { coords: [121.0503, 14.5547], campus: "MNL" },
  "Mandaluyong": { coords: [121.0339, 14.5774], campus: "MNL" },
  "San Juan": { coords: [121.0299, 14.6044], campus: "MNL" },
  "Marikina": { coords: [121.0994, 14.6331], campus: "MNL" },
  "Caloocan": { coords: [120.9724, 14.6513], campus: "MNL" },
  "Valenzuela": { coords: [120.9695, 14.6917], campus: "MNL" },
  "Malabon": { coords: [120.9511, 14.6579], campus: "MNL" },
  "Navotas": { coords: [120.948, 14.6572], campus: "MNL" },
  "Pasay": { coords: [120.9947, 14.5437], campus: "MNL" },
  "Parañaque": { coords: [120.9915, 14.5008], campus: "MNL" },
  "Las Piñas": { coords: [120.9818, 14.4809], campus: "MNL" },
  "Muntinlupa": { coords: [121.0449, 14.3893], campus: "MNL" },
  "Alabang": { coords: [121.0418, 14.4243], campus: "MNL" },
  "Pateros": { coords: [121.0671, 14.5448], campus: "MNL" },
  "Cainta": { coords: [121.1163, 14.578], campus: "MNL" },
  "Taytay": { coords: [121.136, 14.5587], campus: "MNL" },
  "Antipolo": { coords: [121.1759, 14.5872], campus: "MNL" },
  "San Mateo": { coords: [121.1174, 14.6952], campus: "MNL" },
  "Bulacan": { coords: [121.0474, 14.8102], campus: "MNL" },
  "Cavite": { coords: [120.9384, 14.4442], campus: "MNL" },
  "Laguna": { coords: [121.0705, 14.3514], campus: "MNL" },
  // BNE
  /* The live field normalises Brisbane's groups to the city, not to a suburb: on
     prod all 33 of them arrive as one locality called "Brisbane" and none of the
     suburbs below is ever used. Without this the board silently dropped every one
     of them -- they were only ever visible while church-wide scope drew a campus
     mark, and the moment the board opened on Metro Manila instead they had no
     mark, no name in the off-frame note, and no way for a reader to know. Same
     for Seoul. City-level, so coarser than the suburb centroids beside it. */
  "Brisbane": { coords: [153.0260, -27.4705], campus: "BNE" },
  "South Bank": { coords: [153.0201, -27.4809], campus: "BNE" },
  "Wakerley": { coords: [153.1615, -27.4855], campus: "BNE" },
  "Capalaba": { coords: [153.1963, -27.5236], campus: "BNE" },
  "Chermside": { coords: [153.0306, -27.3855], campus: "BNE" },
  "Sunnybank": { coords: [153.0605, -27.5779], campus: "BNE" },
  "North Lakes": { coords: [153.0176, -27.2233], campus: "BNE" },
  "Logan": { coords: [153.0027, -27.7632], campus: "BNE" },
  "Mount Gravatt": { coords: [153.0725, -27.5342], campus: "BNE" },
  "Fortitude Valley": { coords: [153.0354, -27.4578], campus: "BNE" },
  "Indooroopilly": { coords: [152.9734, -27.4998], campus: "BNE" },
  // SEL
  "Seoul": { coords: [126.9780, 37.5665], campus: "SEL" },
  "Gangnam": { coords: [127.0473, 37.5172], campus: "SEL" },
  "Hongdae": { coords: [126.9236, 37.5563], campus: "SEL" },
  "Itaewon": { coords: [126.9944, 37.5346], campus: "SEL" },
  "Gwanak": { coords: [126.9515, 37.4783], campus: "SEL" },
  "Songpa": { coords: [127.1055, 37.5145], campus: "SEL" },
  "Yongsan": { coords: [126.9904, 37.5326], campus: "SEL" },
  "Seongsu": { coords: [127.0560, 37.5445], campus: "SEL" },
  "Jongno": { coords: [126.9918, 37.5729], campus: "SEL" },
};

function localityCentroid(locality) {
  const entry = LOCALITY_CENTROIDS[locality];
  return entry ? (entry.coords || entry) : null;
}

const CAMPUS_CAMERA_VIEWS = {
  MNL: { center: [121.045, 14.565], zoom: 10.35 },
  BNE: { center: [153.05, -27.5], zoom: 9.6 },
  SEL: { center: [126.99, 37.53], zoom: 10.4 },
  /* Corrected: the old [135, 10] at z3.2 framed Manila and left Brisbane below the
   * board and Seoul above it, so the church-wide view -- the one an operator sees
   * before they have filtered anything -- showed one campus of three. This centre
   * is the Mercator midpoint of the three campuses and this zoom holds all of
   * them in the frame the station actually has. */
  ALL: { center: [137.0, 5.6], zoom: 2.5 },
};

/* Zoom is bounded at both ends. The lower bound keeps the three campuses in one
 * frame; the upper bound is the point past which a locality centroid would start
 * to look like an address. Nothing on this board changes meaning with zoom, so
 * there is no zoom the operator has to find. */
const PLOT_MIN_ZOOM = 2.2;
const PLOT_MAX_ZOOM = 12.5;
/* Room for a mark's own diameter plus its name, so fitting the marks never puts
 * the outermost one half off the edge of the board. */
const PLOT_FIT_PADDING = 64;
/* How far below its campus's tuned zoom the camera will pull back to catch marks
 * near the edge. Small on purpose: the field is worth more legible than complete
 * at first glance, and the board pans. */
const PLOT_FIT_SLACK = 0.45;

/* The share of the placeable field one campus has to carry before the board
 * stops reading the church as three campuses and starts reading it as that
 * campus's localities. Today Manila carries 256 of 292 -- 88% -- so the board
 * opens on Metro Manila; if Brisbane grew to a third of the field the same rule
 * puts the campus tier back without anyone editing this file. */
const PLOT_DOMINANT_SHARE = 0.75;

/* Known open seats, in six steps, so Capacity reads as a ramp rather than as
 * fifty different numbers. `unknown` is its own step and is NOT step 0: nobody
 * has set a capacity, which is a different fact from "there is no room".
 *
 * The edges are set against the real spread, not against a round-number
 * intuition. At 1/5/10/20/40 the top step began at forty seats, and a locality
 * with a dozen groups clears forty without trying: every place the rail could
 * rank drew in the same deepest shade, and the ramp had stopped saying anything
 * exactly where Capacity is asked. */
const CAPACITY_STEPS = [1, 10, 25, 50, 100];

function capacityStep(row) {
  if (row.capacityKnownCount === 0) return "unknown";
  const seats = row.openSeatCount || 0;
  let step = 0;
  for (const edge of CAPACITY_STEPS) {
    if (seats >= edge) step += 1;
  }
  return String(step);
}

function localityPressure(groups) {
  const pressureCounts = { leadership: 0, activity: 0 };
  for (const group of groups) {
    const band = group.health && group.health.band;
    if (!band || band === "healthy" || band === "unknown") continue;
    const comps = group.health.components || {};
    if (comps.leadership && comps.leadership.band === band) pressureCounts.leadership += 1;
    else if (comps.activity && comps.activity.band === band) pressureCounts.activity += 1;
    else if (group.health.override === "unled") pressureCounts.leadership += 1;
    else if (group.health.override === "silent") pressureCounts.activity += 1;
  }
  return pressureCounts;
}

function localityRollup(row, groups) {
  const pool = groups || (state.model && state.model.groups) || [];
  const localityGroups = pool.filter((g) => (row.notMapped ? g.locality === null : g.locality === row.locality));
  const pressureCounts = localityPressure(localityGroups);
  return rollupBands({
    critical: row.criticalCount || 0,
    thin: row.thinCount || 0,
    watch: row.watchCount || 0,
    healthy: row.healthyCount || 0,
    unknown: row.unknownCount || 0,
  }, pressureCounts);
}

/* How much of the locality is under pressure. Used only to RANK the rail; it is
 * never drawn on a marker, because a share and a state on the same object are
 * two channels asking to be read at once. */
function concernShare(row) {
  const under = row.criticalCount + row.thinCount;
  return row.groupCount ? under / row.groupCount : 0;
}

function underPressure(row) {
  return row.criticalCount + row.thinCount;
}

/* How many places the board lights and the rail lists. The same number for both,
 * because they are one answer to one question. */
const PLOT_LIT_COUNT = 8;

/* ONE ranking, read by the rail AND by the board.
 *
 * The first build painted every mark in every mode, and on the real spread that
 * left the board saying "everywhere" -- a locality with one Critical group in
 * thirty-three drew the same red as the place carrying fourteen under pressure,
 * so the colour channel had no power to answer "where first". The rail could
 * answer it; the map could not, which made the map decoration.
 *
 * So the board now lights exactly what the rail ranks. Three levels of emphasis
 * and one hue channel:
 *
 *     on    the place is in the rail's list -- filled in its own state's hue
 *     near  it has this mode's signal but ranks below the cut -- ring only
 *     off   this mode has nothing to say about it -- quiet neutral ring
 *
 * Nothing is hidden: every place keeps its position, its size, its numeral and
 * its name at every level, and the table below carries all of them. What changes
 * is which of them are shouting. (#258 §1, §10.) */
function plotRanking(rows, mode) {
  const placed = plottableRows(rows).filter((row) => row.groupCount > 0);
  let ranked = [];
  let statOf = null;

  if (mode === "pressure") {
    ranked = placed.filter((row) => underPressure(row) > 0).sort((left, right) => (
      underPressure(right) - underPressure(left)
      || right.criticalCount - left.criticalCount
      || concernShare(right) - concernShare(left)
    ));
    statOf = (row) => {
      const critical = row.criticalCount ? `${fmt(row.criticalCount)} critical` : "";
      const thin = row.thinCount ? `${fmt(row.thinCount)} thin` : "";
      return `${[critical, thin].filter(Boolean).join(" · ")} of ${fmt(row.groupCount)}`;
    };
  } else if (mode === "capacity") {
    /* A locality where nobody has set a capacity is not a place we know has
     * room; it is a place we cannot answer for. It stays on the board as an
     * outline and is counted in the rail's foot, never ranked as if it were a
     * zero. */
    ranked = placed.filter((row) => row.capacityKnownCount > 0).sort((left, right) => (
      right.openSeatCount - left.openSeatCount || right.groupCount - left.groupCount
    ));
    statOf = (row) => `${fmt(row.openSeatCount)} open seats · ${fmt(row.capacityKnownCount)} of ${fmt(row.groupCount)} have a capacity set`;
  } else if (mode === "network") {
    ranked = placed.slice().sort((left, right) => (
      right.groupCount - left.groupCount || right.leaderCount - left.leaderCount
    ));
    statOf = (row) => `${fmt(row.leaderCount)} ${row.leaderCount === 1 ? "leader" : "leaders"} · ${fmt(row.activeMemberCount)} members`;
  }

  const rank = new Map();
  ranked.forEach((row, index) => { rank.set(row.locality, index + 1); });
  const signal = new Set(ranked.map((row) => row.locality));
  return { placed, ranked, rank, signal, statOf };
}

/* Network describes and Opportunity has no source, so neither of them lights
 * anything: in those two readings the size of a mark is the whole message, and
 * a lit mark would be claiming a judgement the mode does not make. */
const PLOT_LIGHTS = { pressure: true, capacity: true, network: false, opportunity: false };

function plotEmphasis(row, ranking, mode) {
  if (!PLOT_LIGHTS[mode]) return "off";
  const rank = ranking.rank.get(row.locality);
  if (rank && rank <= PLOT_LIT_COUNT) return "on";
  return ranking.signal.has(row.locality) ? "near" : "off";
}

/* Bubble diameter in screen pixels. sqrt so that area, not radius, tracks the
 * count -- twice the groups looks twice as big. Fixed in pixels, so a bubble
 * means the same thing at every zoom.
 *
 * The coefficient came down from 15 to 11 for two reasons, both measured on the
 * real spread. The cap was binding: at 15 every locality from 26 groups upward
 * drew at the same 76px, so Quezon City's 33 and Ortigas Center's 26 were the
 * same mark and the size channel had quietly stopped working at the top of the
 * range -- the end of the range that matters most. And in Metro Manila's core a
 * dozen marks at that scale simply sat on top of each other. At 11 the cap stops
 * binding until 43 groups and the core separates. */
function bubbleSize(count) {
  return Math.max(24, Math.min(72, Math.round(Math.sqrt(count || 1) * 11)));
}

/* Every locality with a centroid, biggest first, so the declutter pass below
 * gives the crowded places their name before it gives one to a place with two
 * groups in it. */
function plottableRows(rows) {
  return rows
    .filter((row) => !row.notMapped && row.locality && placeCoords(row))
    .sort((left, right) => right.groupCount - left.groupCount);
}

/* GLOBAL -> CAMPUS -> LOCALITY (#258 §3), and the board really does have two
 * tiers rather than pretending one grain works at every scale. The three
 * campuses are thousands of kilometres apart, so if the board tries to hold all
 * three at once every locality centroid lands on the same handful of pixels: an
 * early build drew all 37 of them there, stacked into an unreadable target. The
 * campus tier is the answer to that -- ONE mark per campus, same anatomy, and
 * choosing one drops to its localities.
 *
 * What it is NOT the answer to is a church whose field is almost entirely in one
 * city. Reading Favor as three campuses meant the opening frame spanned three
 * continents over a basemap that carries no world geography, so the first thing
 * an operator saw was three dots on empty grey while 256 of 292 groups sat inside
 * one of them (operator ruling, 2026-09-04). So the tier follows the SHAPE OF THE
 * FIELD: campus grain while the field is genuinely spread across campuses,
 * locality grain -- framed on that campus -- once one of them carries
 * PLOT_DOMINANT_SHARE of it.
 *
 * Derived from the slice and never from the camera. A tier that changed with zoom
 * would re-word the rail and the rankings while the reader was moving around the
 * board, which is the shapeshifting #258 §1 exists to forbid. Scope is untouched
 * either way: FIELD SCOPE still reads ALL CAMPUSES and every number on the page
 * still counts the whole church. */
function plotTier() {
  if ((state.filters.campus || "ALL") !== "ALL") return "locality";
  if (campusesWithGroups().length <= 1) return "locality";
  return dominantCampus() ? "locality" : "campus";
}

function campusesWithGroups() {
  const seen = new Set();
  /* The lifted pool, for the same reason the board reads it: picking one
   * locality must not make the church look like a one-campus church. */
  for (const group of poolFor("locality")) {
    if (group.campusShortCode) seen.add(group.campusShortCode);
  }
  return [...seen].filter((code) => CAMPUS_CAMERA_VIEWS[code]).sort(compareCampuses);
}

/* The one campus that carries the field, or null when no single campus does.
 * Read off the same lifted pool the board reads, so picking one locality cannot
 * change which campus the board considers dominant -- otherwise selecting a
 * Brisbane locality would re-frame the whole board on Brisbane. Ties break on
 * the campus code: a camera that opens somewhere different on every reload is
 * worse than one that opens consistently on the wrong place. */
function dominantCampus() {
  const counts = new Map();
  let total = 0;
  for (const group of poolFor("locality")) {
    const code = group.campusShortCode;
    if (!code || !CAMPUS_CAMERA_VIEWS[code]) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
    total += 1;
  }
  if (!total) return null;
  let best = null;
  for (const code of [...counts.keys()].sort()) {
    if (!best || counts.get(code) > counts.get(best)) best = code;
  }
  return counts.get(best) / total >= PLOT_DOMINANT_SHARE ? best : null;
}

/* The same row shape aggregateLocalities() produces, one per campus, so the
 * board, the rail and every ranking below read one vocabulary at either tier. */
function aggregateCampuses(groups) {
  const byCampus = new Map();
  for (const group of groups) {
    const code = group.campusShortCode;
    if (!code || !CAMPUS_CAMERA_VIEWS[code]) continue;
    let row = byCampus.get(code);
    if (!row) {
      row = emptyLocalityRow(code, false);
      row.isCampus = true;
      byCampus.set(code, row);
    }
    row.groupCount += 1;
    row.leaderCount += group.leaderCount;
    row.activeMemberCount += group.activeMemberCount;
    const band = (group.health && group.health.band) || "unknown";
    if (Object.prototype.hasOwnProperty.call(row, `${band}Count`)) row[`${band}Count`] += 1;
    else row.unknownCount += 1;
    row.campuses.add(code);
    if (group.capacity === null) row.capacityUnknownCount += 1;
    else row.capacityKnownCount += 1;
    if (group.openSeatCount !== null && group.openSeatCount > 0) row.openSeatCount += group.openSeatCount;
    /* Why this campus is being surfaced, in the operator's own units: the place
     * inside it carrying the most groups under pressure. */
    const localityKeyed = group.locality;
    if (localityKeyed) {
      row.inner = row.inner || new Map();
      const under = (HEALTH_RANK[band] || 0) >= 3 ? 1 : 0;
      row.inner.set(localityKeyed, (row.inner.get(localityKeyed) || 0) + under);
    }
  }
  return [...byCampus.values()].sort((left, right) => right.groupCount - left.groupCount);
}

/* The rows the board and the rail are both reading right now. */
function plotRows(rows, data) {
  return plotTier() === "campus" ? aggregateCampuses(data) : rows;
}

/* ---------------------------------------------- adaptive locality placing -- */

/* The board used to be able to draw only the places someone had already typed into
 * LOCALITY_CENTROIDS. plottableRows() drops any row whose centroid is missing, so a
 * Connect created in a municipality nobody anticipated did not appear as an error, or
 * as a zero, or anywhere at all -- it was simply absent, and the board still looked
 * complete. Operator ruling 2026-09-04: the map has to adapt to whatever the Connect
 * data says, and it has to say WHERE the Connect is.
 *
 * So the table is now the fast path rather than the whole world:
 *   1. LOCALITY_CENTROIDS       -- instant, offline, covers everything live today
 *   2. localStorage cache       -- anything this browser has resolved before
 *   3. Nominatim, once, per name, throttled and country-biased
 *   4. named on screen as unplaced -- never silently dropped
 *
 * Step 4 is the one that matters. A locality that cannot be placed is a fact about the
 * data, and it belongs in front of the operator, not in a filtered-out array. */

const GEOCODE_ENDPOINT = "data:,";
const GEOCODE_CACHE_KEY = "favor.connect-field.locality-centroids.v1";
/* Nominatim's usage policy is one request per second for an app this size. The board
 * resolves a handful of names once and then never again, so a polite queue costs the
 * operator nothing and keeps this inside the terms we are relying on. */
const GEOCODE_MIN_INTERVAL_MS = 1100;
/* Bias the search by the campus's country so "San Jose" in a Manila Connect does not
 * resolve to California. Short codes are the only campus vocabulary this island has. */
const CAMPUS_COUNTRY_CODES = { MNL: "ph", BNE: "au", SEL: "kr" };

let geocodeCache = null;
const geocodeAttempted = new Set();
const geocodeUnplaced = new Map();
let geocodeQueue = Promise.resolve();
let geocodeLastAt = 0;

function loadGeocodeCache() {
  if (geocodeCache) return geocodeCache;
  geocodeCache = new Map();
  /* Wrapped, and the page still renders with none of it: private windows, cleared site
   * data and browsers set to block storage all throw here, and the built-in table plus
   * a live lookup already cover the board without it. */
  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_KEY);
    if (raw) {
      for (const [name, coords] of Object.entries(JSON.parse(raw))) {
        if (Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite)) {
          geocodeCache.set(name, coords);
        }
      }
    }
  } catch (error) {
    geocodeCache = new Map();
  }
  return geocodeCache;
}

function saveGeocodeCache() {
  try {
    window.localStorage.setItem(
      GEOCODE_CACHE_KEY,
      JSON.stringify(Object.fromEntries(loadGeocodeCache())),
    );
  } catch (error) {
    /* A cache that cannot persist is still a cache for this page view. */
  }
}

/* The key is the name AND the country, because "Brisbane" is a place in three of the
 * countries this church is in and the campus is what tells them apart. */
function geocodeKey(locality, country) {
  return `${country || "??"}:${String(locality).trim().toLowerCase()}`;
}

function cachedCentroid(locality, country) {
  return loadGeocodeCache().get(geocodeKey(locality, country)) || null;
}

async function geocodeLocality(locality, country) {
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("q", locality);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  /* A locality name is not personal data and it is the only thing that leaves: no
   * group, no person, no address, no coordinate from Rock. The locality-grain privacy
   * contract is unchanged -- this asks "where is this municipality", nothing more. */
  if (country) url.searchParams.set("countrycodes", country);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`geocoder answered ${response.status}`);
  const results = await response.json();
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) throw new Error("no match");
  const coords = [Number(hit.lon), Number(hit.lat)];
  if (!coords.every(Number.isFinite)) throw new Error("unusable coordinates");
  return coords;
}

/* Queue rather than fire-and-forget, so N unknown localities are N spaced requests
 * instead of a burst that gets this dashboard rate-limited for everyone on it. */
function enqueueGeocode(locality, country) {
  geocodeQueue = geocodeQueue.then(async () => {
    const wait = Math.max(0, GEOCODE_MIN_INTERVAL_MS - (Date.now() - geocodeLastAt));
    if (wait) await new Promise((resume) => setTimeout(resume, wait));
    geocodeLastAt = Date.now();
    try {
      const coords = await geocodeLocality(locality, country);
      loadGeocodeCache().set(geocodeKey(locality, country), coords);
      saveGeocodeCache();
      geocodeUnplaced.delete(locality);
      return true;
    } catch (error) {
      /* Record the reason and show it. A place the board cannot draw is not allowed to
       * be invisible -- that is the whole defect this replaces. */
      geocodeUnplaced.set(locality, error && error.message ? error.message : "could not be located");
      return false;
    }
  });
  return geocodeQueue;
}

/* Called after a render, never during one: resolution is async and the board must not
 * wait on the network to draw the places it already knows. Anything resolved re-renders
 * the board once, at the end, rather than once per name. */
function placeUnknownLocalities(rows) {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const wanted = [];
  for (const row of rows) {
    if (row.notMapped || !row.locality || row.isCampus) continue;
    if (placeCoords(row)) continue;
    const country = CAMPUS_COUNTRY_CODES[[...(row.campuses || [])][0]] || null;
    const key = geocodeKey(row.locality, country);
    if (geocodeAttempted.has(key)) continue;
    geocodeAttempted.add(key);
    wanted.push([row.locality, country]);
  }
  if (!wanted.length) return;
  let resolvedAny = false;
  for (const [locality, country] of wanted) {
    enqueueGeocode(locality, country).then((ok) => { resolvedAny = resolvedAny || ok; });
  }
  geocodeQueue = geocodeQueue.then(() => {
    if (resolvedAny) renderPlotMap(plotLastRows);
    renderUnplacedNote();
  });
}

function placeCoords(row) {
  if (row.isCampus) return (CAMPUS_CAMERA_VIEWS[row.locality] || {}).center || null;
  const built = localityCentroid(row.locality);
  if (built) return built;
  /* Then whatever this browser has already resolved. Campus-keyed, so a Brisbane
   * locality never borrows a Manila one's coordinates. */
  for (const code of row.campuses || []) {
    const hit = cachedCentroid(row.locality, CAMPUS_COUNTRY_CODES[code]);
    if (hit) return hit;
  }
  return cachedCentroid(row.locality, null);
}

let plotMap = null;
/* Held so the GC cannot collect it out from under the map -- see kickFirstFrame. */
let plotMapResizeObserver = null;
let plotMarkers = [];
let plotCameraKey = null;
let plotButtonsBound = false;
/* The rows the board is currently holding, so Recenter can re-frame exactly what
 * is on the board without a render. */
let plotLastRows = [];

/* ------------------------------------------------------------- the board -- */

function initPlotLayers() {
  if (!plotMap || plotMap.getLayer("locality-heat")) return;
  /* Heat first, then the anchoring disc, then the DOM marks on top. The heatmap is
   * what answers "where is Connect concentrated" at a glance without the reader
   * having to compare 17 bubble diameters; it is weighted by group count, so it says
   * the same thing the marks say rather than a second, competing story.
   *
   * It fades out as the reader zooms in, because at street level a smear is worse
   * than a number -- past zoom 12 the marks and the rail carry it. */
  plotMap.addLayer({
    id: "locality-heat",
    type: "heatmap",
    source: "localities",
    maxzoom: 14,
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 6, 1, 13, 2.4],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 18, 10, 42, 13, 70],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.62, 12, 0.42, 14, 0],
      /* Cream -> Favor orange -> deep rust. Zero stop is fully transparent so the
       * basemap reads through everywhere the church is not, which is the point of
       * showing real geography at all. */
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(254,241,232,0)",
        0.2, "rgba(255,214,170,0.55)",
        0.45, "rgba(255,160,90,0.72)",
        0.7, "rgba(244,85,0,0.82)",
        1, "rgba(150,42,0,0.9)",
      ],
    },
  });
  plotMap.addLayer({
    id: "locality-halo",
    type: "circle",
    source: "localities",
    paint: {
      "circle-radius": ["get", "halo"],
      "circle-color": "rgba(18,20,17,0.10)",
      "circle-stroke-width": 0,
    },
  });
}

function localitiesGeoJSON(rows) {
  const plottable = plottableRows(rows);
  /* Normalised against the largest locality actually in view, not a constant: Ortigas
   * carries 167 of 292 and would otherwise saturate the whole ramp and flatten every
   * other place to nothing. Relative heat answers "where is it concentrated", which is
   * the question the board is for. */
  const peak = plottable.reduce((most, row) => Math.max(most, row.groupCount || 0), 0) || 1;
  return {
    type: "FeatureCollection",
    features: plottable.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: placeCoords(row) },
      properties: {
        locality: row.locality,
        halo: bubbleSize(row.groupCount) / 2 + 3,
        weight: Math.min(1, (row.groupCount || 0) / peak),
      },
    })),
  };
}

/* Hover is an emphasis, never a source. Pointing at a bubble lights the matching
 * rail row and vice versa; nothing appears that was not already on the page, so
 * a keyboard or touch reader loses nothing by never hovering (#258 §9). */
function cuePlace(place, on) {
  if (!state.root) return;
  const selector = `[data-place="${(place || "").replace(/"/g, '\\"')}"]`;
  for (const node of state.root.querySelectorAll(selector)) {
    node.classList.toggle("is-cued", Boolean(on));
  }
}

/* One gesture at either tier. At church-wide scope a mark IS a campus, so
 * choosing it narrows the campus filter -- the same shared state the sidebar
 * writes -- and the board drops to that campus's localities. At campus scope a
 * mark is a locality and toggles the locality filter. Either way it is one
 * applySelection, so every station moves with it. */
function selectPlace(row, spoken) {
  if (row.isCampus) {
    applySelection(() => { state.filters.campus = row.locality; }, spoken);
    return;
  }
  applySelection(() => {
    state.filters.locality = state.filters.locality === row.locality ? "" : row.locality;
  }, spoken);
}

let plotEmptyPopup = null;

function showEmptyPopup(coords, localityName, nearestRow) {
  if (!plotMap || typeof window === "undefined" || !window.maplibregl) return;
  if (!plotEmptyPopup) {
    plotEmptyPopup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: 10,
      className: "loc-empty-popup",
    });
  }
  const popupWrap = el("div", "loc-empty-pop");
  popupWrap.append(el("strong", "lep-name", localityName));
  popupWrap.append(el("span", "lep-status", "No Connect Groups here"));
  if (nearestRow) {
    popupWrap.append(el("span", "lep-nearest", `Nearest Connect: ${nearestRow.locality} (${fmt(nearestRow.groupCount)} ${nearestRow.groupCount === 1 ? "group" : "groups"})`));
  }
  plotEmptyPopup.setLngLat(coords).setDOMContent(popupWrap).addTo(plotMap);
}

function hideEmptyPopup() {
  if (plotEmptyPopup) plotEmptyPopup.remove();
}

function rebuildPlotMarkers(rows) {
  if (!plotMap || typeof window === "undefined" || !window.maplibregl) return;
  const maplibregl = window.maplibregl;

  for (const entry of plotMarkers) entry.marker.remove();
  plotMarkers = [];
  hideEmptyPopup();

  const ranking = plotRanking(rows, state.plotMode);
  const plottable = plottableRows(rows);
  const presentLocalities = new Set(plottable.map((row) => row.locality));

  for (const row of plottable) {
    const coords = placeCoords(row);
    const selected = !row.isCampus && state.filters.locality === row.locality;
    const size = bubbleSize(row.groupCount);
    const lit = plotEmphasis(row, ranking, state.plotMode);
    const rank = ranking.rank.get(row.locality) || 0;

    const node = el("button", "loc-bubble");
    node.type = "button";
    node.style.setProperty("--bubble", `${size}px`);
    node.dataset.place = row.locality;
    node.dataset.band = localityRollup(row).band;
    node.dataset.cap = capacityStep(row);
    /* Facts on the mark, meaning in the stylesheet: `lit` says how loudly this
     * place is speaking in the current reading, and the sheet decides what that
     * looks like on the cream board. Still no colour literal in this file. */
    node.dataset.lit = lit;
    node.setAttribute("aria-pressed", selected ? "true" : "false");
    if (selected) node.classList.add("is-selected");

    const dot = el("span", "lb-dot");
    dot.append(el("span", "lb-n", fmt(row.groupCount)));
    node.append(dot, el("span", "lb-name", row.locality));

    node.addEventListener("click", () => selectPlace(row, row.isCampus
      ? `Campus scope ${row.locality}. The board now shows its localities.`
      : `${row.locality}.`));
    node.addEventListener("mouseenter", () => cuePlace(row.locality, true));
    node.addEventListener("mouseleave", () => cuePlace(row.locality, false));
    node.addEventListener("focus", () => cuePlace(row.locality, true));
    node.addEventListener("blur", () => cuePlace(row.locality, false));

    const marker = new maplibregl.Marker({ element: node }).setLngLat(coords).addTo(plotMap);
    /* AFTER addTo, deliberately: MapLibre stamps its own aria-label="Map marker"
     * on any element handed to Marker, which would otherwise be the only name a
     * screen reader ever heard for this bubble. The name carries the same facts
     * the matching rail row carries, so the board is readable without a pointer
     * and without a tooltip. */
    const rankWord = lit === "on" ? `${PLOT_MODES[state.plotMode].label} rank ${fmt(rank)} · ` : "";
    node.setAttribute("aria-label", `${row.isCampus ? `${row.locality} campus` : row.locality} · ${rankWord}${fmt(row.groupCount)} ${row.groupCount === 1 ? "group" : "groups"} · ${plotModeFact(row)}${row.isCampus ? " · choose to see its localities" : ""}`);
    const label = node.querySelector(".lb-name");
    plotMarkers.push({
      marker, node, coords,
      label,
      place: row.locality,
      campuses: row.campuses ? [...row.campuses] : [],
      labelWidth: (label && label.offsetWidth) || 60,
      labelHeight: (label && label.offsetHeight) || 20,
      size: size,
      lit,
    });
  }

  if (plotTier() !== "campus") {
    const campusFilter = (state.filters.campus || "ALL").toUpperCase();
    for (const [name, loc] of Object.entries(LOCALITY_CENTROIDS)) {
      if (campusFilter !== "ALL" && loc.campus !== campusFilter) continue;
      if (presentLocalities.has(name)) continue;

      let nearest = null;
      let minD2 = Infinity;
      for (const row of plottable) {
        if (row.isCampus) continue;
        const rowCoords = placeCoords(row);
        if (!rowCoords) continue;
        const rowCampus = row.campuses && row.campuses.size ? [...row.campuses][0] : null;
        if (rowCampus && rowCampus !== loc.campus) continue;
        const dx = rowCoords[0] - loc.coords[0];
        const dy = rowCoords[1] - loc.coords[1];
        const d2 = dx * dx + dy * dy;
        if (d2 < minD2) {
          minD2 = d2;
          nearest = row;
        }
      }

      const nearestText = nearest
        ? ` · Nearest Connect: ${nearest.locality} (${fmt(nearest.groupCount)} ${nearest.groupCount === 1 ? "group" : "groups"})`
        : "";
      const ariaText = `${name} · No Connect Groups here${nearestText}`;

      const node = el("button", "loc-empty");
      node.type = "button";
      node.dataset.place = name;
      node.dataset.campus = loc.campus;

      const ghost = el("span", "le-ghost");
      node.append(ghost, el("span", "lb-name", name));

      node.addEventListener("mouseenter", () => {
        cuePlace(name, true);
        showEmptyPopup(loc.coords, name, nearest);
      });
      node.addEventListener("mouseleave", () => {
        cuePlace(name, false);
        hideEmptyPopup();
      });
      node.addEventListener("focus", () => {
        cuePlace(name, true);
        showEmptyPopup(loc.coords, name, nearest);
      });
      node.addEventListener("blur", () => {
        cuePlace(name, false);
        hideEmptyPopup();
      });
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        if (plotEmptyPopup && plotEmptyPopup.isOpen()) {
          hideEmptyPopup();
        } else {
          showEmptyPopup(loc.coords, name, nearest);
        }
      });

      const marker = new maplibregl.Marker({ element: node }).setLngLat(loc.coords).addTo(plotMap);
      /* AFTER addTo, for the same reason the ranked bubbles above do it: MapLibre
       * stamps aria-label="Map marker" on any element handed to Marker, which
       * would otherwise be the only name a screen reader heard for this place. */
      node.setAttribute("aria-label", ariaText);
      const label = node.querySelector(".lb-name");
      plotMarkers.push({
        marker, node, coords: loc.coords,
        label,
        place: name,
        campuses: [loc.campus],
        labelWidth: (label && label.offsetWidth) || 50,
        labelHeight: (label && label.offsetHeight) || 16,
        size: 14,
        lit: "off",
        isEmpty: true,
      });
    }
  }

  placeLabels();
}

/* One phrase per mode, for the marker's accessible name, so what a fill means is
 * available as words and not only as a colour. */
function plotModeFact(row) {
  const mode = state.plotMode;
  if (mode === "capacity") {
    return row.capacityKnownCount === 0
      ? "capacity not set in Rock, so open seats are Unknown"
      : `${fmt(row.openSeatCount)} open seats known`;
  }
  if (mode === "network") return `${fmt(row.leaderCount)} leaders`;
  if (mode === "opportunity") return "demand Unavailable";
  const under = row.criticalCount + row.thinCount;
  return under ? `${fmt(under)} of ${fmt(row.groupCount)} Thin or Critical` : "nothing Thin or Critical here";
}

/* Names collide; bubbles never do. A name is only ever dropped when there is
 * nowhere on any of the four sides of its own mark to put it -- the bubble, its
 * size and its numeral stay exactly where they were, and every name is in the
 * rail and in the table below regardless.
 *
 * The first build only ever tried BELOW the mark, so in dense Manila more than
 * half the board was anonymous circles: an operator read "22" with no idea which
 * place it was, in exactly the quarter of the map where knowing matters most.
 * Trying the other three sides before giving up recovers nearly all of them. */
const LABEL_SIDES = ["below", "above", "right", "left"];

/* The box has to be the box the browser will actually paint, or the test passes
 * and the board still collides. The first version assumed a 14px-tall name 1px
 * off the disc; the sheet renders it 20px tall 3px off, so QUEZON CITY (below its
 * mark) and ORTIGAS CENTER (above its own, 90px south) each cleared a model that
 * was six pixels too short and then overlapped on screen. Width was measured from
 * the DOM from the start; height and the two gaps now come from the same place --
 * LABEL_GAP_Y / LABEL_GAP_X are the `margin` values in the .lb-name rule. */
const LABEL_GAP_Y = 3;
const LABEL_GAP_X = 5;
/* Not-overlapping is not the same as readable. PARAÑAQUE and TAGUIG cleared each
 * other by five pixels and an operator read "PARAÑAQUE TAGUIG" as one phrase, so
 * every name claims a little air on each side and neighbours have to respect it. */
const LABEL_PAD_X = 5;

function labelBox(side, point, half, width, height) {
  const halfWidth = width / 2 + LABEL_PAD_X;
  const halfHeight = height / 2;
  const padded = width + LABEL_PAD_X * 2;
  if (side === "below") return { x1: point.x - halfWidth, x2: point.x + halfWidth, y1: point.y + half + LABEL_GAP_Y, y2: point.y + half + LABEL_GAP_Y + height };
  if (side === "above") return { x1: point.x - halfWidth, x2: point.x + halfWidth, y1: point.y - half - LABEL_GAP_Y - height, y2: point.y - half - LABEL_GAP_Y };
  if (side === "right") return { x1: point.x + half + LABEL_GAP_X, x2: point.x + half + LABEL_GAP_X + padded, y1: point.y - halfHeight, y2: point.y + halfHeight };
  return { x1: point.x - half - LABEL_GAP_X - padded, x2: point.x - half - LABEL_GAP_X, y1: point.y - halfHeight, y2: point.y + halfHeight };
}

function overlaps(box, others) {
  return others.some((other) => (
    box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1
  ));
}

function placeLabels() {
  if (!plotMap) return;

  /* Every MARK reserves its own disc before any NAME is placed, so a place name
   * can never come to rest on top of another locality's numeral -- which is what
   * put MANDALUYONG across the Ortigas mark and MALABON across Caloocan's.
   *
   * Two classes of reservation, though. A LIT mark's disc is hard: it is carrying
   * a number the reader is being sent to, and nothing may cross it. An unlit
   * mark's disc is soft -- it is a quiet ring, structure rather than signal -- so
   * a lit place's name may cross it if that is the only way the name fits. In
   * Metro Manila's core that is the difference between naming Ortigas Center,
   * Pasig and Mandaluyong and leaving the three busiest places on the board as
   * anonymous circles. */
  const hard = [];
  const soft = [];
  const projected = [];
  for (const entry of plotMarkers) {
    if (entry.isEmpty) continue;
    const point = plotMap.project(entry.coords);
    const half = entry.size / 2;
    const disc = { x1: point.x - half, x2: point.x + half, y1: point.y - half, y2: point.y + half };
    (entry.lit === "on" ? hard : soft).push(disc);
    projected.push({ entry, point, half });
  }
  for (const entry of plotMarkers) {
    if (!entry.isEmpty) continue;
    const point = plotMap.project(entry.coords);
    const half = entry.size / 2;
    projected.push({ entry, point, half });
  }

  /* The places the board has LIT get their name first, then the rest biggest
   * first, so when a name genuinely has to go it is never one of the places the
   * rail is pointing at. */
  const order = projected.slice().sort((left, right) => (
    (right.entry.lit === "on" ? 1 : 0) - (left.entry.lit === "on" ? 1 : 0)
    || right.entry.size - left.entry.size
  ));

  const names = [];
  for (const { entry, point, half } of order) {
    if (!entry.label) continue;
    const against = entry.lit === "on" ? [hard, names] : [hard, soft, names];
    let placed = null;
    for (const side of LABEL_SIDES) {
      const box = labelBox(side, point, half, entry.labelWidth, entry.labelHeight);
      if (!against.some((list) => overlaps(box, list))) { placed = { side, box }; break; }
    }
    entry.label.classList.toggle("is-quiet", !placed);
    entry.label.dataset.side = placed ? placed.side : "below";
    if (placed) names.push(placed.box);
  }

  /* Entirely outside the canvas, not merely clipped at the edge: a disc half in
   * frame still tells the reader something is there, and pointing at it would be
   * noise. Fully gone is the case worth naming. */
  const canvas = plotMap.getCanvas();
  const width = canvas ? canvas.clientWidth : 0;
  const height = canvas ? canvas.clientHeight : 0;
  const gone = [];
  const shown = new Set();
  const known = new Set();
  for (const { entry, point, half } of projected) {
    if (entry.isEmpty) continue;
    for (const code of entry.campuses || []) known.add(code);
    if (point.x + half < 0 || point.x - half > width || point.y + half < 0 || point.y - half > height) {
      gone.push(entry);
    } else {
      for (const code of entry.campuses || []) shown.add(code);
    }
  }
  const campusesGone = [...known].filter((code) => !shown.has(code)).sort(compareCampuses);
  /* A locality that is off-frame only because its whole campus is off-frame is
     already covered by the campus, and counting it again would tell the reader
     there are fourteen missing places when eleven of them are Brisbane. */
  const loose = gone.filter((entry) => !(entry.campuses || []).some((code) => campusesGone.includes(code)));
  const next = offscreenNote(loose.map((entry) => entry.place).sort(), campusesGone);
  if (next !== plotOffscreenNote) {
    plotOffscreenNote = next;
    writePlotLegend();
  }
}

/* The camera is derived, never a second state. It follows the ONE campus filter
 * the whole page shares, and it follows the selected locality; it never changes
 * zoom on its own when a locality is picked, because a selection is not a request
 * to go closer. `Recenter` re-applies exactly this and touches nothing else.
 *
 * It also FRAMES WHAT IT DREW. The first build flew to a fixed centre and zoom
 * per campus, which meant the church-wide view -- the very first thing an
 * operator sees, before they have filtered anything -- put Manila's mark in
 * frame and left Brisbane's below the board and Seoul's above it: one campus of
 * three, on an empty field, with the rail listing all three. So the camera now
 * fits the marks it is about to draw, and the tuned per-campus zoom becomes the
 * CLOSEST it will go rather than the only thing it does. Manila keeps its
 * framing and stops clipping Bulacan and Cavite; church-wide pulls back until
 * all three campuses are on the board. */
function plotBounds(rows) {
  const coords = plottableRows(rows).map(placeCoords).filter(Boolean);
  if (!coords.length) return null;
  let west = 180, east = -180, south = 90, north = -90;
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return { coords, box: [[west, south], [east, north]] };
}

function applyPlotCamera(rows, force) {
  if (!plotMap) return;
  const campus = (state.filters.campus || "ALL").toUpperCase();
  /* At church-wide scope the board frames the campus that carries the field
   * rather than trying to hold all three. It also bounds only THAT campus's
   * marks, so Manila's provincial localities still pull the frame open through
   * PLOT_FIT_SLACK while Brisbane and Seoul stop dragging the centre out into
   * open ocean. Whatever falls off the frame is named in the legend by
   * offscreenNote(), never silently dropped. */
  const framed = campus === "ALL" ? dominantCampus() : null;
  const view = CAMPUS_CAMERA_VIEWS[framed || campus] || CAMPUS_CAMERA_VIEWS.ALL;
  const selected = state.filters.locality && state.filters.locality !== NOT_SET
    ? localityCentroid(state.filters.locality)
    : null;
  const bounds = plotBounds(framed ? rows.filter((row) => row.campuses && row.campuses.has(framed)) : rows);
  const shape = bounds ? bounds.box.map((pair) => pair.map((n) => n.toFixed(2)).join()).join("|") : "none";
  const key = `${campus}|${framed || ""}|${state.filters.locality || ""}|${shape}`;
  if (!force && key === plotCameraKey) return;
  plotCameraKey = key;
  const duration = state.reducedMotion ? 0 : 620;

  /* A selection pans, and only pans: the operator asked which place, not to go
   * closer, and the rest of the board has to stay where they last saw it. */
  if (selected) {
    plotMap.easeTo({ center: selected, duration, essential: true });
    return;
  }
  /* Open on the campus's own tuned framing, and widen from there only as far as
   * PLOT_FIT_SLACK to catch marks sitting near the edge. Widening without a
   * limit is what the outliers would ask for: three provincial localities
   * carrying eight groups between them would pull Metro Manila's two hundred
   * into a thumbnail where the marks sit on top of each other. Widening not at
   * all is what put two of the three campuses off the church-wide board. This is
   * mode-independent on purpose -- changing the question must never move the
   * camera, or the board shapeshifts under the reader (#258 §1). */
  if (bounds && bounds.coords.length > 1) {
    const fitted = plotMap.cameraForBounds(bounds.box, { padding: PLOT_FIT_PADDING });
    if (fitted) {
      const zoom = Math.max(Math.min(fitted.zoom, view.zoom), view.zoom - PLOT_FIT_SLACK);
      plotMap.easeTo({ center: fitted.center, zoom, duration, essential: true });
      return;
    }
  }
  if (bounds) {
    plotMap.easeTo({ center: bounds.coords[0], zoom: view.zoom, duration, essential: true });
    return;
  }
  plotMap.easeTo({ center: view.center, zoom: view.zoom, duration, essential: true });
}

/* ------------------------------------------------------------- the rail -- */

/* One micro-bar, in the rail and only in the rail, carrying the four bands in
 * fixed order. This is the composition channel #258 §1 moved off the marker: it
 * has room here for the numbers beside it, which is what made it unreadable at
 * marker size. */
function bandBar(row) {
  const bar = el("span", "band-bar");
  bar.setAttribute("aria-hidden", "true");
  for (const band of HEALTH_ORDER) {
    const count = row[`${band}Count`] || 0;
    if (!count) continue;
    const part = el("i", `band-${band}`);
    part.style.flexGrow = String(count);
    bar.append(part);
  }
  return bar;
}

function railRow(rank, row, statLine) {
  const item = el("button", "rail-row");
  item.type = "button";
  item.dataset.place = row.locality;
  item.setAttribute("aria-pressed", !row.isCampus && state.filters.locality === row.locality ? "true" : "false");

  const top = el("span", "rr-top");
  top.append(el("span", "rr-rank", String(rank)));
  top.append(el("span", "rr-name", row.locality));
  top.append(el("span", "rr-count", fmt(row.groupCount)));
  item.append(top);
  item.append(el("span", "rr-stat", statLine));
  item.append(bandBar(row));

  item.addEventListener("click", () => selectPlace(row, row.isCampus
    ? `Campus scope ${row.locality}. The board now shows its localities.`
    : `${row.locality}.`));
  item.addEventListener("mouseenter", () => cuePlace(row.locality, true));
  item.addEventListener("mouseleave", () => cuePlace(row.locality, false));
  item.addEventListener("focus", () => cuePlace(row.locality, true));
  item.addEventListener("blur", () => cuePlace(row.locality, false));
  return item;
}

function railFoot(text) {
  return el("p", "rail-foot", text);
}

/* The detail state. Selecting a locality -- from the board, from this rail, or
 * from the table -- answers "what exactly" without asking anybody to zoom, and
 * ends on the operational drill: the queue, already filtered to this place. */
function railDetail(row, groups) {
  const nodes = [];
  const head = el("div", "rail-detail-head");
  head.append(el("h4", "rd-name", row.locality));
  const campuses = [...row.campuses].sort(compareCampuses).join(" · ");
  head.append(el("p", "rd-scope", campuses ? `${campuses} · ${fmt(row.groupCount)} ${row.groupCount === 1 ? "group" : "groups"}` : `${fmt(row.groupCount)} groups`));

  const bar = bandBar(row);
  bar.classList.add("band-bar-signal");
  head.append(bar);

  const rollup = localityRollup(row, groups);
  const pressureText = rollup.pressure
    ? `Main pressure: ${rollup.pressure.charAt(0).toUpperCase() + rollup.pressure.slice(1)}`
    : "No pressure in what we can see.";
  head.append(el("p", "rd-pressure", pressureText));

  nodes.push(head);

  const list = el("dl", "rd-facts");
  const fact = (term, node) => {
    list.append(el("dt", null, term));
    const dd = el("dd");
    dd.append(node);
    list.append(dd);
  };
  fact("Leaders", countMark(row.leaderCount));
  fact("Active members", countMark(row.activeMemberCount));
  fact("Capacity set in Rock", document.createTextNode(`${fmt(row.capacityKnownCount)} of ${fmt(row.groupCount)}`));
  fact("Open seats", row.capacityKnownCount === 0
    ? unavailableMark("No group in this locality has a capacity set in Rock, so we can't work out how many seats are open.", "Unknown")
    : countMark(row.openSeatCount));
  nodes.push(list);

  const bands = el("ul", "rd-bands");
  for (const band of HEALTH_ORDER) {
    const count = row[`${band}Count`] || 0;
    if (!count) continue;
    const item = el("li", `rd-band band-${band}`);
    item.append(el("span", "rd-band-label", HEALTH_LABEL[band] || band));
    item.append(el("span", "rd-band-n", fmt(count)));
    bands.append(item);
  }
  if (bands.childNodes.length) nodes.push(bands);

  const actions = el("div", "rail-actions");
  const back = el("button", "btn btn-quiet rail-back", `Back to ${PLOT_MODES[state.plotMode].label}`);
  back.type = "button";
  back.addEventListener("click", () => selectPlace(row, `Cleared ${row.locality}.`));

  /* The operational destination, and it is styled as the loudest thing in the
   * rail because it is the ACT step of the page (#258 §9). Its count comes off
   * this locality's own row, so it says what the reader is looking at rather
   * than what the whole slice happens to contain. */
  const queued = (row.watchCount || 0) + (row.thinCount || 0) + (row.criticalCount || 0);
  const drill = el("a", "btn rail-drill", `Open the queue for ${row.locality}`);
  drill.href = "#station-queue";
  drill.title = `${fmt(queued)} of the ${fmt(row.groupCount)} groups in ${row.locality} are on Watch, Thin, or Critical.`;
  actions.append(drill, back);
  nodes.push(actions);
  return nodes;
}

/* The rail is PERMANENT (#258 §4). It is present in every mode and in the empty
 * and unavailable states too, so the map's geometry never depends on whether
 * there happens to be a second column to fill. */
function renderPlotRail(rows, groups) {
  const title = mount("plot-rail-title");
  const body = mount("plot-rail-body");
  if (!body) return;

  const mode = state.plotMode;
  const copy = PLOT_MODES[mode];
  const tier = plotTier();
  const selectedRow = state.filters.locality && state.filters.locality !== NOT_SET
    ? rows.find((row) => row.locality === state.filters.locality)
    : null;

  if (title) title.textContent = selectedRow ? "Selected" : copy.railTitle;

  if (!groupsOk()) {
    body.replaceChildren(unavailablePanel(
      (state.model && state.model.reasons.groups) || "",
      "Nothing to rank",
    ));
    return;
  }

  if (selectedRow) {
    body.replaceChildren(...railDetail(selectedRow, groups));
    return;
  }

  if (mode === "opportunity") {
    /* #258 §7, and it is a hard requirement rather than a preference. There is
     * no registered demand query, the Demand Gate has failed, and the previous
     * build filled this space with `groups*16 + thinCritical*9` -- a number with
     * no source, drawn as though it had one. An empty mode that says why is the
     * honest reading; a populated one would not be. */
    const oppNote = el("p", "rail-foot");
    const oppTrg = el("button", "rail-foot-trigger", "Coming soon · Opportunity reading");
    oppTrg.type = "button";
    attachTooltip(oppTrg, () => bulletList([
      "Capacity mode carries the half of this question with a real source: open seats",
      "Opportunity stays on the board so the vocabulary doesn't move when demand lands",
      "Demand query has no approved Rock resolver yet",
    ], { label: "Opportunity reading" }));
    oppNote.append(oppTrg);
    body.replaceChildren(
      unavailablePanel(reasonFor("demand"), "Demand signal"),
      oppNote,
    );
    return;
  }

  /* The same ranking the board lit. The rail names the places; the board says
   * where they are. One call, so the two can never disagree. */
  const ranking = plotRanking(plotRows(rows, groups), mode);
  const { placed, ranked, statOf } = ranking;
  if (!placed.length) {
    body.replaceChildren(railFoot("No locality in this slice has a place on the board. The table below is the full record."));
    return;
  }

  let foot = "";
  if (mode === "pressure") {
    const clear = placed.length - ranked.length;
    foot = clear
      ? `${fmt(clear)} of ${fmt(placed.length)} localities on the board have nothing Thin or Critical in them, so they aren't ranked here and stay unlit on the board.`
      : "";
  } else if (mode === "capacity") {
    const unknown = placed.filter((row) => row.capacityKnownCount === 0).length;
    foot = unknown
      ? `${fmt(unknown)} ${unknown === 1 ? "locality has" : "localities have"} no capacity set on any group, so their room is Unknown, not zero. They draw as a dashed outline and aren't ranked.`
      : "";
  } else {
    const unplaced = rows.filter((row) => row.notMapped || !LOCALITY_CENTROIDS[row.locality]);
    const unplacedGroups = unplaced.reduce((total, row) => total + row.groupCount, 0);
    foot = unplacedGroups
      ? `${fmt(unplacedGroups)} ${unplacedGroups === 1 ? "group is" : "groups are"} not on the board: no locality on record, or a locality with no centroid. They are in the table below.`
      : "";
  }

  /* A real none, and it is worth saying out loud rather than showing an empty
   * column: nothing in this slice is Thin or Critical anywhere on the board. */
  if (!ranked.length) {
    body.replaceChildren(railFoot(mode === "pressure"
      ? `Nothing Thin or Critical anywhere on the board in this slice: all ${fmt(placed.length)} localities are clear. A real none: we looked.`
      : "No locality in this slice can be ranked on this reading."));
    return;
  }

  const list = el("div", "rail-list");
  ranked.slice(0, PLOT_LIT_COUNT).forEach((row, index) => {
    list.append(railRow(index + 1, row, statOf(row)));
  });

  /* The board only fills marks in the modes that rank a judgement (#258 grammar:
   * PLOT_LIGHTS). In Network and Opportunity nothing is lit, so the same sentence
   * would describe a board the reader is looking at and cannot see. Say who is
   * doing the ranking instead. */
  const more = ranked.length > PLOT_LIT_COUNT
    ? (PLOT_LIGHTS[mode]
      ? `The ${fmt(PLOT_LIT_COUNT)} places the board has lit, of ${fmt(ranked.length)} it can rank on this reading; the table below carries every one.`
      : `The top ${fmt(PLOT_LIT_COUNT)} of ${fmt(ranked.length)} places on this reading. Nothing is lit on the board for this question; the table below carries every one.`)
    : "";
  const nodes = [list];
  const bullets = [];
  if (more) bullets.push(more);
  if (foot) bullets.push(foot);
  if (bullets.length) {
    const footWrap = el("p", "rail-foot");
    const footTrg = el("button", "rail-foot-trigger", `Showing ${fmt(Math.min(ranked.length, PLOT_LIT_COUNT))} of ${fmt(ranked.length)} places`);
    footTrg.type = "button";
    attachTooltip(footTrg, () => bulletList(bullets, { label: "Plotboard ranking details" }));
    footWrap.append(footTrg);
    nodes.push(footWrap);
  }
  body.replaceChildren(...nodes);
}

/* ---------------------------------------------------------- the controls -- */

/* ONE campus state (#258 §6). The sidebar's campus row and the Plotboard's
 * campus row are the same control built twice, calling the same closure: picking
 * Manila anywhere moves the shared filter, the scope stamp, the URL, the camera,
 * the rail and every other station together. There is no map-only campus, and
 * the camera-only affordance is called Recenter and is not a campus selector. */
function mountCampusRow(hostId) {
  const host = mount(hostId);
  if (!host || !state.model) return null;
  host.replaceChildren();
  const codes = state.model.meta.campuses.map((campus) => campus.shortCode).sort(compareCampuses);
  const values = [...codes, "ALL"];
  for (const code of values) {
    const button = el("button", "acronym-btn", code);
    button.type = "button";
    button.setAttribute("aria-pressed", state.filters.campus === code ? "true" : "false");
    const groupsHere = code === "ALL"
      ? fieldTotal()
      : (state.model.meta.campuses.find((campus) => campus.shortCode === code) || {}).groupCount;
    button.title = code === "ALL"
      ? `Every campus · ${groupsHere === null ? "we don't know how many" : fmt(groupsHere)} groups`
      : `${code} · ${typeof groupsHere === "number" ? fmt(groupsHere) : "we don't know how many"} groups`;
    button.addEventListener("click", () => applySelection(() => {
      state.filters.campus = code;
      /* A locality that is not in the campus you just moved to would otherwise
       * hold every station at zero rows while the board looks fine. */
      if (state.filters.locality && !localityIsInCampus(state.filters.locality, code)) {
        state.filters.locality = "";
      }
    }, `Campus scope ${code}. The board, the rail and every station now show ${code === "ALL" ? "every campus" : code}.`));
    host.append(button);
  }
  return values;
}

function localityIsInCampus(locality, code) {
  if (code === "ALL") return true;
  const key = locality === NOT_SET ? null : locality;
  return allGroups().some((group) => group.locality === key && group.campusShortCode === code);
}

function setPlotMode(mode) {
  if (!PLOT_MODES[mode] || state.plotMode === mode) return;
  state.plotMode = mode;
  renderPlace(state.model ? slice() : []);
  announce(`${PLOT_MODES[mode].label}. ${PLOT_MODES[mode].subtitle}`);
}

/* Wired on every render rather than once at map creation: the previous build
 * bound these when the map was first built, so every handler kept the first
 * slice forever and the board answered with data the console had moved on from. */
function bindPlotControls() {
  if (!state.root || plotButtonsBound) return;
  plotButtonsBound = true;

  for (const button of state.root.querySelectorAll(".plot-modes button[data-plotmode]")) {
    button.addEventListener("click", () => setPlotMode(button.getAttribute("data-plotmode")));
  }
  const recenter = state.root.querySelector("[data-recenter]");
  if (recenter) {
    recenter.addEventListener("click", () => {
      applyPlotCamera(plotLastRows, true);
      const campus = state.filters.campus === "ALL" ? "every campus" : state.filters.campus;
      announce(`Recentred on ${campus}. Nothing else changed.`);
    });
  }
}

function syncPlotChrome() {
  const board = mount("map-console");
  const tier = plotTier();
  if (board) {
    board.dataset.plotmode = state.plotMode;
    board.dataset.plottier = tier;
  }
  const copy = PLOT_MODES[state.plotMode];
  for (const button of (state.root ? state.root.querySelectorAll(".plot-modes button[data-plotmode]") : [])) {
    const active = button.getAttribute("data-plotmode") === state.plotMode;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.classList.toggle("active", active);
  }
  const subtitle = mount("plot-mode-copy");
  if (subtitle) {
    subtitle.textContent = tier === "campus"
      ? `${copy.subtitle} Church-wide, so each mark is a campus. Choose one to see its localities.`
      : copy.subtitle;
  }
  writePlotLegend();
}

/* A mark the camera does not include is a place the board is not showing, and the
 * reader has no way to know it is there. The camera deliberately refuses to widen
 * past PLOT_FIT_SLACK for provincial outliers -- fitting Bulacan and Laguna pulls
 * Metro Manila's core into an unreadable huddle -- so the honest move is to keep
 * the framing and say what it costs, rather than let two localities with Thin and
 * Critical groups in them vanish silently.
 *
 * It is part of the legend and not a station of its own because it is the same
 * kind of claim: what a reader is and is not looking at. Recomputed on every move
 * and zoom, because panning changes the answer. */
let plotOffscreenNote = "";

function writePlotLegend() {
  const legend = mount("plot-legend");
  if (!legend) return;
  const copy = PLOT_MODES[state.plotMode];
  if (!copy) return;
  const base = plotTier() === "campus" ? `each mark = a campus · ${copy.legend}` : copy.legend;
  const parts = [base];
  if (plotOffscreenNote) parts.push(plotOffscreenNote);
  const next = parts.join(" · ");
  if (legend.textContent !== next) legend.textContent = next;
}

/* A locality the board could not place is the one thing on this surface that must never
 * be quiet. It is not Unavailable -- we have the groups, we have the locality name, we
 * simply could not put it on the ground -- and it is not a zero either. So it is named,
 * with its count, in its own line under the board, and the rail and the table below
 * still carry every one of its groups. */
function renderUnplacedNote() {
  const host = mount("plot-unplaced");
  if (!host) return;
  const rows = (plotLastRows || []).filter(
    (row) => !row.notMapped && row.locality && !row.isCampus && !placeCoords(row),
  );
  if (!rows.length) {
    host.replaceChildren();
    host.hidden = true;
    return;
  }
  const named = rows
    .slice()
    .sort((left, right) => (right.groupCount || 0) - (left.groupCount || 0))
    .map((row) => `${row.locality} (${fmt(row.groupCount || 0)})`);
  const total = rows.reduce((sum, row) => sum + (row.groupCount || 0), 0);
  host.replaceChildren(
    el("strong", null, `${fmt(rows.length)} ${rows.length === 1 ? "locality" : "localities"} not on the map`),
    document.createTextNode(
      `: ${named.join(", ")}. ${fmt(total)} ${total === 1 ? "group is" : "groups are"} counted in every number ` +
      "on this page and listed in the table below; only the mark is missing.",
    ),
  );
  host.hidden = false;
}

/* Named while there are few enough for a name to be useful, counted once there
 * are not. Either way the number is the honest part. */
/* A clipped suburb and a campus that is entirely out of the picture are not the
 * same fact, and since the board started opening on the campus that carries the
 * field (plotTier) the second one happens on the very first frame. "14 places"
 * would be true and would still let a reader believe they were looking at the
 * whole church, so a campus with none of its marks in frame is named as a campus,
 * named first, and its localities are not counted twice in the tail. */
function offscreenNote(places, campusesGone) {
  const campuses = campusesGone || [];
  if (!places.length && !campuses.length) return "";
  const parts = [];
  if (campuses.length) parts.push(`all of ${campuses.join(" and ")}`);
  if (places.length) {
    parts.push(places.length <= 3
      ? places.join(", ")
      : `${fmt(places.length)} ${campuses.length ? "other " : ""}places`);
  }
  const many = places.length > 1 || campuses.length > 1 || (places.length && campuses.length);
  return `off this frame: ${parts.join(", and ")}; zoom out to see ${many ? "them" : "it"}`;
}

/* ------------------------------------------------------------- the map -- */

function renderPlotMap(rows) {
  if (typeof document === "undefined") return;
  const container = mount("map-canvas");
  if (!container) return;
  const maplibregl = typeof window !== "undefined" ? window.maplibregl : null;
  if (!maplibregl) {
    fill("map-unavailable", unavailablePanel(
      "The map couldn't start in this browser. The locality table below is the full record, and nothing is missing from it.",
      "The Plotboard",
    ));
    const host = mount("map-unavailable");
    if (host) host.hidden = false;
    return;
  }

  plotLastRows = rows;
  const geojson = localitiesGeoJSON(rows);
  /* After the rows are recorded, so a resolution that triggers a re-render sees the
   * same set, and after the geojson is built, so the board draws what it can place
   * now rather than waiting on the network. */
  placeUnknownLocalities(rows);
  renderUnplacedNote();

  if (!plotMap) {
    try {
      plotMap = new maplibregl.Map({
        container: "map-canvas",
        /* A real basemap, not a drawing of one. The previous style rendered six
         * fill/line layers over 45 hand-authored features -- 27 city polygons with a
         * `name` of null -- which is a mock of geography, and it could only ever show
         * the places someone had already drawn. Operator ruling 2026-09-04: render
         * MapLibre in full and show the actual world, so a Connect in a municipality
         * nobody anticipated lands on real ground instead of nowhere.
         *
         * Raster and not vector: vector needs a `glyphs` endpoint to draw its own
         * labels, and a style URL besides; raster OSM tiles arrive already labelled
         * from one allowlisted host, which is the smaller network surface for the same
         * result. `tile.openstreetmap.org` is the allowlist entry -- see
         * docs/connect-map-allowlist.md. Attribution is a licence condition, not
         * decoration, so it is a control on the map and not a line in a doc. */
        style: {
          version: 8,
          sources: {
            
            localities: { type: "geojson", data: geojson },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#e9e4dc" } },
            
          ],
        },
        center: (CAMPUS_CAMERA_VIEWS[(state.filters.campus || "ALL").toUpperCase()] || CAMPUS_CAMERA_VIEWS.ALL).center,
        zoom: (CAMPUS_CAMERA_VIEWS[(state.filters.campus || "ALL").toUpperCase()] || CAMPUS_CAMERA_VIEWS.ALL).zoom,
        minZoom: PLOT_MIN_ZOOM,
        maxZoom: PLOT_MAX_ZOOM,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });

      plotMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      /* Best-effort nudge at the first render frame. THIS DOES NOT FIX THE PROD BUG --
       * see issue #285, and do not read this block as a solution.
       *
       * What is established on prod: this map never finishes loading its style. The live
       * map object sits permanently half-built -- isStyleLoaded() false, loaded() false,
       * getStyle() throwing on an undefined stylesheet, getSource("basemap") absent, not
       * one tile requested, and not one error logged, because from MapLibre's point of
       * view nothing has gone wrong yet. The DOM markers draw correctly over the empty
       * canvas because they are main-thread overlays that need neither the style nor the
       * render loop, which is why the board looks half-alive rather than broken.
       *
       * This is not a regression from the real basemap, and it is style-independent: a
       * freshly constructed map on that same page with an EMPTY style ({sources:{},
       * layers:[]}) fails identically. So the hand-drawn basemap this build replaced
       * never rendered on prod either -- which is what "why is this not using MapLibre"
       * was actually looking at. MapLibre was present, on version 4.7.1, on screen, and
       * had never been given a chance to load anything. The same code loads 16 tiles on
       * the dev workbench, so the cause is in the Rock page environment (the block
       * renders inside an ASP.NET UpdatePanel, `upnlHtmlContentView`) and not here.
       *
       * Ruled out on prod, each measured rather than assumed: CSP (the only directive on
       * the document is frame-ancestors), WebGL (available, ANGLE/Metal), blob Workers
       * (a trivial one round-trips), container size (660x618, visible, every ancestor
       * display/visibility clean), cache staleness (the module is fetched fresh and
       * executes), duplicate instances (exactly one map, one canvas), and reachability
       * (a main-thread fetch and Image of a tile URL both succeed from that page).
       *
       * resize() + triggerRepaint() was observed once to take tiles 0 -> 27 and
       * isStyleLoaded() false -> true, which is why this block exists -- but that has NOT
       * reproduced, and shipping it changed nothing. The revival was almost certainly
       * caused by something else in that debugging session, so the attribution was wrong.
       * The calls are harmless and cheap, so they stay as a nudge; the actual defect is
       * open in #285. */
      const kickFirstFrame = () => {
        if (!plotMap) return;
        try {
          plotMap.resize();
          plotMap.triggerRepaint();
        } catch (ignored) {
          /* A map already torn down is not worth a console line. */
        }
      };
      kickFirstFrame();
      requestAnimationFrame(kickFirstFrame);
      setTimeout(kickFirstFrame, 250);
      /* The observer is held on the map, not dropped on the floor: an unreferenced
       * ResizeObserver is collectable, and the first version of this block lost its
       * observer to the GC before it ever fired. */
      if (typeof ResizeObserver === "function") {
        const host = document.getElementById("map-canvas");
        if (host) {
          plotMapResizeObserver = new ResizeObserver(kickFirstFrame);
          plotMapResizeObserver.observe(host);
        }
      }
      const drawNow = () => {
        const current = plotLastRows && plotLastRows.length ? plotLastRows : rows;
        rebuildPlotMarkers(current);
        applyPlotCamera(current, true);
      };
      const addLayersWhenStyled = () => {
        if (!plotMap) return;
        /* isStyleLoaded() can already be true on this tick, in which case `styledata`
         * has been and gone and waiting for it would wait forever. */
        if (plotMap.isStyleLoaded()) initPlotLayers();
        else plotMap.once("styledata", () => initPlotLayers());
      };
      addLayersWhenStyled();
      drawNow();
      plotMap.on("move", placeLabels);
      plotMap.on("zoom", placeLabels);
      /* moveend as well, and not for tidiness: the last `move` of an easeTo fires
         before the markers' own transforms have settled, so a camera flight ended
         with a stale off-frame note -- on the opening frame, the one that has
         whole campuses outside it, the note read empty. */
      plotMap.on("moveend", placeLabels);
    } catch (error) {
      plotMap = null;
      return;
    }
    /* The key is NOT seeded here. It used to be, in a two-part campus|locality
     * form that applyPlotCamera's campus|framed|locality|shape key could
     * never match -- so it read like a guard and was dead the moment it was
     * written. The `load` handler above applies the camera with force:true and
     * sets the real key; until then `null` is the honest value. */
    return;
  }

  const source = plotMap.getSource("localities");
  if (source) source.setData(geojson);
  applyPlotCamera(rows, false);
  rebuildPlotMarkers(rows);
}

/* The table under the board. The Plotboard answers WHERE at a glance; this
 * answers it exhaustively, and it is the keyboard and screen-reader path to
 * every place the board draws.
 * Locality is free text in Rock and arrives normalised through a documented
 * alias map in the SQL; groups with no locality on record get their own row
 * instead of being dropped, because a group nobody can place is exactly the
 * kind of thing a map would have hidden. */
function renderPlace(data) {
  const wrap = mount("locality-table");
  const foot = mount("map-foot");

  /* One aggregation per reading. The TABLE reads the slice exactly as every other
   * station does. The BOARD and the RAIL read the slice with the locality
   * selection lifted -- `poolFor("locality")` -- and that is the one deliberate
   * asymmetry on this page.
   *
   * The reason: the locality filter is the board's OWN selection. Honouring it on
   * the board meant that the moment an operator asked "what about Quezon City?",
   * every other place vanished and they were left with a single circle in an
   * empty cream field -- the board destroying the orientation it exists to give,
   * at the exact moment it was asked a question (#258 §9). Every other filter
   * still applies here, the selected place is drawn selected, and Signal, Queue,
   * the table and the URL all follow the full slice. Nothing else changes. */
  const rows = groupsOk() ? aggregateLocalities(data) : [];
  const boardGroups = groupsOk() ? poolFor("locality") : [];
  const boardRows = groupsOk() ? aggregateLocalities(boardGroups) : [];

  bindPlotControls();
  syncPlotChrome();
  if (groupsOk()) renderPlotMap(plotRows(boardRows, boardGroups));
  renderPlotRail(boardRows, boardGroups);

  if (!wrap) return;
  if (!groupsOk()) {
    wrap.replaceChildren(unavailablePanel(state.model.reasons.groups, "Where the groups are"));
    if (foot) foot.replaceChildren(document.createTextNode("No locality is listed: we couldn't load the Connect Groups. That isn't a field with no places in it."));
    return;
  }

  if (!rows.length) {
    wrap.replaceChildren(el("p", "station-foot", "No groups in this slice."));
    if (foot) foot.replaceChildren();
    return;
  }

  const table = el("table", "field-table locality-table");
  table.append(el("caption", null, `Where the ${fmt(data.length)} groups in this slice meet.`));
  const thead = el("thead");
  const headRow = el("tr");
  for (const [label, numeric] of [["Locality", false], ["Groups", true], ["Leaders", true], ["Capacity set in Rock", true], ["Open seats", true], ["Pressure", false], ["No locality", true]]) {
    const cell = el("th", numeric ? "num" : null, label);
    cell.setAttribute("scope", "col");
    headRow.append(cell);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr", row.notMapped ? "is-not-mapped" : null);
    const label = el("th");
    label.setAttribute("scope", "row");
    const select = el("button", "loc-name", row.notMapped ? "No locality on record" : row.locality);
    select.type = "button";
    select.setAttribute("aria-pressed", state.filters.locality === (row.notMapped ? NOT_SET : row.locality) ? "true" : "false");
    select.addEventListener("click", () => applySelection(() => {
      const key = row.notMapped ? NOT_SET : row.locality;
      state.filters.locality = state.filters.locality === key ? "" : key;
    }, row.notMapped ? "Groups with no locality on record." : `${row.locality}.`));
    label.append(select);
    tr.append(label);

    tr.append(numCell(row.groupCount));
    tr.append(numCell(row.leaderCount));

    const capacity = el("td", "num");
    capacity.append(countMark(row.capacityKnownCount));
    capacity.append(document.createTextNode(` of ${fmt(row.groupCount)}`));
    tr.append(capacity);

    const seats = el("td", "num");
    if (row.capacityKnownCount === 0) {
      seats.append(unavailableMark("No group in this locality has a capacity set in Rock, so we can't work out how many seats are open.", "Unknown"));
    } else {
      seats.append(countMark(row.openSeatCount));
    }
    tr.append(seats);

    const rollup = localityRollup(row, data);
    const pressureWord = rollup.pressure ? (rollup.pressure.charAt(0).toUpperCase() + rollup.pressure.slice(1)) : "·";
    tr.append(el("td", "loc-pressure", pressureWord));

    tr.append(numCell(row.notMapped ? row.groupCount : 0));
    tbody.append(tr);
  }
  table.append(tbody);

  const scroll = el("div", "tablewrap");
  scroll.append(table);
  wrap.replaceChildren(scroll);

  if (foot) {
    const unplaced = data.filter((group) => group.locality === null).length;
    const capacityUnknown = data.filter((group) => group.capacity === null).length;
    foot.replaceChildren(...[
      el("strong", null, fmt(unplaced)),
      document.createTextNode(` of ${fmt(data.length)} groups have no locality on record · `),
      el("strong", null, fmt(capacityUnknown)),
      document.createTextNode(" capacity unset in Rock"),
    ]);
  }
}

/* The same aggregation the adapter performs over the whole field, computed over
 * the current slice so the table follows the console. Unplaced groups are their
 * own row and always last: folding them into a named locality would invent a
 * place, and dropping them would quietly shrink the denominator. */
function aggregateLocalities(groups) {
  const byLocality = new Map();
  const unmapped = emptyLocalityRow(null, true);
  for (const group of groups) {
    let row = unmapped;
    if (group.locality !== null) {
      row = byLocality.get(group.locality);
      if (!row) {
        row = emptyLocalityRow(group.locality, false);
        byLocality.set(group.locality, row);
      }
    }
    row.groupCount += 1;
    row.leaderCount += group.leaderCount;
    row.activeMemberCount += group.activeMemberCount;
    /* The band roll-up the Plotboard rail ranks by and the marker takes its one
     * colour from. An unbandable group lands in `unknownCount` and never in
     * `healthyCount`: on this page something we cannot work out is never quietly
     * counted as well. */
    const band = (group.health && group.health.band) || "unknown";
    if (Object.prototype.hasOwnProperty.call(row, `${band}Count`)) row[`${band}Count`] += 1;
    else row.unknownCount += 1;
    if (group.campusShortCode) row.campuses.add(group.campusShortCode);
    if (group.capacity === null) row.capacityUnknownCount += 1;
    else row.capacityKnownCount += 1;
    if (group.openSeatCount !== null && group.openSeatCount > 0) row.openSeatCount += group.openSeatCount;
  }
  const rows = [...byLocality.values()].sort((left, right) => (
    right.groupCount - left.groupCount || left.locality.localeCompare(right.locality)
  ));
  if (unmapped.groupCount > 0) rows.push(unmapped);
  return rows;
}

function emptyLocalityRow(locality, notMapped) {
  return {
    locality,
    notMapped,
    groupCount: 0,
    leaderCount: 0,
    activeMemberCount: 0,
    capacityKnownCount: 0,
    capacityUnknownCount: 0,
    openSeatCount: 0,
    criticalCount: 0,
    thinCount: 0,
    watchCount: 0,
    healthyCount: 0,
    unknownCount: 0,
    campuses: new Set(),
  };
}

/* ============================================================ GROUP CARD == */

/* The short fact beside a chip. Under ten words, always. The model's full reason string
 * is the sentence for the Overall line and the tooltip; it is too long for a row. */
function componentFact(key, component) {
  if (key === "leadership") {
    return component.membersPerLeader === null
      ? "no leader on record"
      : `${component.membersPerLeader} members per leader`;
  }
  if (key === "activity") {
    if (component.silentStreak >= 1) {
      const week = component.silentStreak === 1 ? "week" : "weeks";
      return `${component.silentStreak} ${week} in a row with nothing entered`;
    }
    const entered = Math.round(component.loggedRate * component.observedWeeks);
    return `attendance entered ${entered} of ${component.observedWeeks} weeks`;
  }
  return "";
}

/* One label anatomy for the strip, the plot and the queue. No group name, no
 * parent name, no person: a group is titled by `groupTitle()` from its own
 * PII-free fields, and the only link is its attendance page in Connect. */
function cardContent(group) {
  const nodes = [];

  const close = el("button", "gc-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close this group card");
  close.addEventListener("click", () => hideCard(true));
  nodes.push(close);

  nodes.push(groupHeading(group, "gc-name"));
  nodes.push(el("div", "gc-meta", [
    group.campusShortCode,
    labelFor(canopyKey(group)),
    parentLabel(group),
  ].join(" · ")));

  const states = el("dl", "gc-states");

  states.append(el("dt", null, "Overall"));
  const overallVal = el("dd", "gcs-overall");
  overallVal.append(el("span", `state-chip h-${group.health.band}`, HEALTH_LABEL[group.health.band]));
  const primaryReason = healthReasons(group)[0];
  if (primaryReason) overallVal.append(el("span", "why-line", primaryReason));
  states.append(overallVal);

  const components = (group.health && group.health.components) || {};
  const componentOrder = [
    ["leadership", "Leadership", components.leadership],
    ["activity", "Activity", components.activity],
    ["retention", "Retention", components.retention],
    ["progression", "Progression", components.progression],
  ];
  for (const [key, label, component] of componentOrder) {
    states.append(el("dt", null, label));
    const value = el("dd");
    if (!component || component.band === "unavailable") {
      value.append(ghostStat(component ? component.reason : ""));
    } else {
      value.append(el("span", `state-chip h-${component.band}`, HEALTH_LABEL[component.band] || component.band));
      const fact = componentFact(key, component);
      if (fact) value.append(el("span", "gcs-fact", fact));
      if (key === "activity") value.append(occurrenceStrip(group));
    }
    states.append(value);
  }
  nodes.push(states);

  nodes.push(el("div", "gc-tele-label", "Operating signals"));

  const tele = el("div", "gc-tele is-signals");
  const span = leaderSpan(group);
  const sig = (group.health && group.health.signals) || {};
  const capSig = sig.capacity || {};
  const colSig = sig.collecting || {};
  const pairs = [
    ["capacity", group.capacity === null
      ? ghostStat(capSig.reason || "No capacity is set on this group in Rock.")
      : countMark(group.capacity)],
    ["open seats", group.openSeatCount === null
      ? ghostStat(capSig.reason || "Rock has no capacity for this group, so we can't work out how many seats are open.")
      : countMark(group.openSeatCount)],
    ["still collecting", group.collectingMembers === null
      ? ghostStat(colSig.reason || "Rock doesn't say whether this group is still collecting members.")
      : el("span", "v", group.collectingMembers ? "yes" : "no")],
    ["members", countMark(group.activeMemberCount)],
    ["leaders", countMark(group.leaderCount)],
    ["people per leader", span === null ? el("span", "v c-critical", "UNLED") : el("span", "v", `1 : ${span}`)],
    ["meets", el("span", "v", `${labelFor(dayKey(group))} · ${group.meetupTime || "time not set"} · ${labelFor(bandKey(group))}`)],
    ["shape", el("span", "v", `${labelFor(ageKey(group))} · ${typeKeys(group).map(labelFor).join(" + ")}`)],
  ];
  for (const [key, value] of pairs) {
    tele.append(el("span", "k", key));
    if (value.classList && !value.classList.contains("v")) value.classList.add("v");
    tele.append(value);
  }
  nodes.push(tele);

  const why = el("div", "gc-why");
  const label = (HEALTH_RANK[group.health.band] || 0) >= 2 ? "Why now" : "Reading";
  why.append(el("strong", null, label));
  const reasons = healthReasons(group);
  why.append(whyTrigger(group, reasons, { label, disc: true }));
  nodes.push(why);

  const actions = el("div", "gc-actions");
  const open = el("a", "open-connect", "Open Connect ↗");
  open.href = `${CONNECT_URL}${group.groupRef}`;
  open.target = "_blank";
  open.rel = "noopener";
  actions.append(open);
  actions.append(el("span", "gc-note", "where the action happens · no personal details on this page"));
  nodes.push(actions);

  return nodes;
}

function showCard(group, anchor, pin) {
  const card = mount("groupcard");
  if (!card) return;
  card.replaceChildren(...cardContent(group));
  card.hidden = false;
  if (window.matchMedia("(max-width: 768px)").matches) closeConsole();
  card.setAttribute("role", "dialog");
  card.setAttribute(
    "aria-label",
    `${groupTitleSpoken(group)}: ${HEALTH_LABEL[group.health.band]}. ${healthReasons(group)[0] || ""}`.trim()
  );
  card.tabIndex = -1;
  state.pinned = Boolean(pin);
  positionCard(anchor);
  if (pin && anchor instanceof Element) {
    state.cardReturnFocus = anchor;
    card.focus();
  }
}

function positionCard(anchor) {
  const card = mount("groupcard");
  if (!card) return;
  if (window.matchMedia("(max-width: 768px)").matches) {
    card.style.left = "";
    card.style.top = "";
    return;
  }
  let x = 0;
  let y = 0;
  if (anchor instanceof Element) {
    const rect = anchor.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.bottom;
  } else if (anchor && typeof anchor.x === "number") {
    x = anchor.x;
    y = anchor.y;
  }
  const width = card.offsetWidth || 350;
  const height = card.offsetHeight || 300;
  let left = x + 18;
  let top = y + 14;
  if (left + width > window.innerWidth - 12) left = x - width - 18;
  if (left < 12) left = 12;
  if (top + height > window.innerHeight - 12) top = window.innerHeight - height - 12;
  if (top < 12) top = 12;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function hideCard(force) {
  const card = mount("groupcard");
  if (!card) return;
  if (state.pinned && !force) return;
  const returnFocus = state.cardReturnFocus;
  state.pinned = false;
  state.cardReturnFocus = null;
  card.hidden = true;
  if (force && returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

function keycapNode() {
  let node = state.root ? state.root.querySelector("#fieldkeycap") : null;
  if (!node && state.root) {
    node = document.createElement("div");
    node.className = "keycap";
    node.id = "fieldkeycap";
    node.setAttribute("aria-hidden", "true");
    node.hidden = true;

    const stateSpan = document.createElement("span");
    stateSpan.className = "keycap-state";
    const nameSpan = document.createElement("span");
    nameSpan.className = "keycap-name";
    const posSpan = document.createElement("span");
    posSpan.className = "keycap-pos";

    node.append(stateSpan, nameSpan, posSpan);
    state.root.appendChild(node);
  }
  return node;
}

function showKeycap(group, caption, clientX, clientY, cancelled) {
  const node = keycapNode();
  if (!node || !group) return;

  const [stateSpan, nameSpan, posSpan] = node.children;
  if (cancelled) {
    stateSpan.className = "keycap-state";
    stateSpan.textContent = "Release to cancel";
    node.dataset.cancel = "true";
  } else {
    stateSpan.className = `keycap-state c-${group.health.band}`;
    stateSpan.textContent = HEALTH_LABEL[group.health.band] || "";
    delete node.dataset.cancel;
  }
  nameSpan.textContent = groupTitle(group);
  posSpan.textContent = caption || "";

  node.hidden = false;
  node.dataset.keycapOn = "true";

  const rect = node.getBoundingClientRect();
  let left = clientX - rect.width / 2;
  left = Math.min(Math.max(left, 12), window.innerWidth - rect.width - 12);
  let top = clientY - 56 - rect.height;
  let flipped = false;
  if (top < 8) {
    top = clientY + 56;
    flipped = true;
  }
  if (flipped) {
    node.dataset.keycapFlip = "true";
  } else {
    delete node.dataset.keycapFlip;
  }
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

function hideKeycap() {
  const node = keycapNode();
  if (!node) return;
  node.hidden = true;
  delete node.dataset.keycapOn;
  delete node.dataset.cancel;
  delete node.dataset.keycapFlip;
  const spans = node.querySelectorAll("span");
  for (const span of spans) span.textContent = "";
}

const PAN_ZONE = 32;
const PAN_STEP = 8;

function edgePan(wrap, clientX) {
  if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 1) return 0;
  const rect = wrap.getBoundingClientRect();
  const prev = wrap.scrollLeft;
  if (clientX <= rect.left + PAN_ZONE) {
    wrap.scrollLeft = Math.max(0, prev - PAN_STEP);
  } else if (clientX >= rect.right - PAN_ZONE) {
    const max = wrap.scrollWidth - wrap.clientWidth;
    wrap.scrollLeft = Math.min(max, prev + PAN_STEP);
  }
  return wrap.scrollLeft - prev;
}

function bindScrub(plot, resolve) {
  if (!plot) return;
  const aimClass = plot.classList.contains("fieldstrip") ? "is-aim" : "is-hover";
  let wrap = null;
  let box = null;
  let currentAimElement = null;
  let currentGroup = null;
  let currentElement = null;
  let isCancelled = false;
  let panRaf = null;
  let lastClientX = 0;
  let lastClientY = 0;

  const stopPanLoop = () => {
    if (panRaf) {
      cancelAnimationFrame(panRaf);
      panRaf = null;
    }
  };

  const cleanup = () => {
    stopPanLoop();
    if (currentAimElement) {
      currentAimElement.classList.remove("is-aim", "is-hover");
      currentAimElement = null;
    }
    hideKeycap();
    state.scrub = null;
  };

  const stepResolve = (clientX, clientY) => {
    isCancelled = clientY > box.bottom + 32 || clientY < box.top - 32;
    const res = resolve(clientX, clientY);
    if (res) {
      currentGroup = res.group;
      currentElement = res.element;
      if (currentAimElement !== res.element) {
        if (currentAimElement) currentAimElement.classList.remove("is-aim", "is-hover");
        currentAimElement = res.element;
        if (currentAimElement) currentAimElement.classList.add(aimClass);
      }
      showKeycap(res.group, res.caption, clientX, clientY, isCancelled);
    }
  };

  const startPanLoop = () => {
    if (panRaf) return;
    const loop = () => {
      panRaf = null;
      if (!state.scrub) return;
      const scrolled = edgePan(wrap, lastClientX);
      if (scrolled !== 0) {
        if (typeof resolve.pan === "function") resolve.pan(scrolled);
        box = plot.getBoundingClientRect();
        stepResolve(lastClientX, lastClientY);
        const rect = wrap.getBoundingClientRect();
        const inZone = (lastClientX <= rect.left + PAN_ZONE && wrap.scrollLeft > 0)
          || (lastClientX >= rect.right - PAN_ZONE && wrap.scrollLeft < wrap.scrollWidth - wrap.clientWidth);
        if (inZone) {
          panRaf = requestAnimationFrame(loop);
        }
      }
    };
    panRaf = requestAnimationFrame(loop);
  };

  plot.onpointerdown = (event) => {
    if (event.pointerType === "mouse") return;
    if (state.scrub) return;
    if (typeof resolve.init === "function") {
      const ok = resolve.init();
      if (!ok) return;
    }
    event.preventDefault();
    try {
      plot.setPointerCapture(event.pointerId);
    } catch {}
    state.scrub = { pointerId: event.pointerId, plot };
    wrap = plot.parentElement;
    box = plot.getBoundingClientRect();
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    stepResolve(event.clientX, event.clientY);
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const inZone = (lastClientX <= rect.left + PAN_ZONE && wrap.scrollLeft > 0)
        || (lastClientX >= rect.right - PAN_ZONE && wrap.scrollLeft < wrap.scrollWidth - wrap.clientWidth);
      if (inZone) startPanLoop();
    }
  };

  plot.onpointermove = (event) => {
    if (!state.scrub || state.scrub.pointerId !== event.pointerId) return;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    stepResolve(event.clientX, event.clientY);
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const inZone = (lastClientX <= rect.left + PAN_ZONE && wrap.scrollLeft > 0)
        || (lastClientX >= rect.right - PAN_ZONE && wrap.scrollLeft < wrap.scrollWidth - wrap.clientWidth);
      if (inZone) startPanLoop();
      else stopPanLoop();
    }
  };

  plot.onpointerup = (event) => {
    if (!state.scrub || state.scrub.pointerId !== event.pointerId) return;
    stopPanLoop();
    const wasCancelled = isCancelled;
    const groupToOpen = currentGroup;
    const elementToOpen = currentElement;
    cleanup();
    try {
      plot.releasePointerCapture(event.pointerId);
    } catch {}
    if (wasCancelled) {
      announce("Nothing opened.");
      return;
    }
    if (groupToOpen && elementToOpen) {
      showCard(groupToOpen, elementToOpen, true);
    }
  };

  plot.onpointercancel = (event) => {
    if (!state.scrub || state.scrub.pointerId !== event.pointerId) return;
    cleanup();
    try {
      plot.releasePointerCapture(event.pointerId);
    } catch {}
  };

  plot.onlostpointercapture = () => {
    cleanup();
  };
}

function scrubStripResolver(strip) {
  let ticks = [];
  let n = 0;
  let originX = 0;
  let step = 1;

  const resolver = (clientX) => {
    if (n === 0) return null;
    const index = Math.min(n - 1, Math.max(0, Math.round((clientX - originX) / step)));
    const element = ticks[index];
    if (!element) return null;
    const group = groupByRef(Number(element.dataset.groupRef));
    if (!group) return null;
    const isDim = element.classList.contains("is-dim");
    const caption = `${index + 1} of ${n}${isDim ? " · outside the slice" : ""}`;
    return { group, element, caption };
  };

  resolver.init = () => {
    ticks = [...strip.children];
    n = ticks.length;
    if (n === 0) return false;
    const firstRect = ticks[0].getBoundingClientRect();
    const lastRect = ticks[n - 1].getBoundingClientRect();
    originX = firstRect.left + firstRect.width / 2;
    const span = (lastRect.left + lastRect.width / 2) - originX;
    step = n > 1 ? span / (n - 1) : 1;
    return true;
  };

  resolver.pan = (scrolled) => {
    originX -= scrolled;
  };

  return resolver;
}

function scrubDotResolver(svg) {
  let marks = [];
  const Y_WEIGHT = 0.35;

  const resolver = (clientX, clientY) => {
    if (marks.length === 0) return null;
    let bestD2 = Infinity;
    for (const mark of marks) {
      const dx = clientX - mark.cx;
      const dy = (clientY - mark.cy) * Y_WEIGHT;
      mark.d2 = dx * dx + dy * dy;
      if (mark.d2 < bestD2) {
        bestD2 = mark.d2;
      }
    }
    const candidates = marks.filter((m) => m.d2 - bestD2 < 0.25);
    candidates.sort((a, b) => {
      const groupA = groupByRef(a.ref);
      const groupB = groupByRef(b.ref);
      const rankA = (groupA && groupA.health && HEALTH_RANK[groupA.health.band]) || 0;
      const rankB = (groupB && groupB.health && HEALTH_RANK[groupB.health.band]) || 0;
      if (rankB !== rankA) return rankB - rankA;
      return a.ref - b.ref;
    });
    const winner = candidates[0];
    const group = groupByRef(winner.ref);
    if (!group) return null;
    const caption = componentFact("leadership", group.health.components.leadership);
    return { group, element: winner.node, caption };
  };

  resolver.init = () => {
    const dots = [...svg.querySelectorAll(".dot")].filter((d) => !d.classList.contains("is-dim"));
    marks = dots.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        node,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        ref: Number(node.dataset.groupRef),
      };
    });
    return marks.length > 0;
  };

  resolver.pan = (scrolled) => {
    for (const mark of marks) {
      mark.cx -= scrolled;
    }
  };

  return resolver;
}

/* ------------------------------------------------------------- self boot -- */

/* The production wrapper renders the fragment with data-source="dashboard-prod-read"
 * and appends the JSON island, so the island boots itself. The development
 * router marks its root data-manual-boot="true" and calls boot() with its own
 * payload instead; nothing here fetches anything in either case. */
/**
 * The last honest state: the island could not start at all.
 *
 * A dashboard that renders NOTHING is the one outcome this whole design refuses. Every
 * panel distinguishes a real zero from an unavailable read precisely so a viewer is never
 * left guessing -- and then a blank page tells them less than any of those states would.
 * It also reads as "the page is broken" rather than "the data did not arrive", which sends
 * the reader to the wrong person.
 *
 * This renders without touching the model, because the model is what failed. It uses the
 * same hollow dashed treatment as every other unavailable state, so it looks like a state
 * the dashboard knows how to be in, not like wreckage.
 */
function renderBootFailure(root, detail) {
  while (root.firstChild) root.removeChild(root.firstChild);

  const panel = document.createElement("section");
  panel.className = "boot-failure is-unavailable";
  panel.setAttribute("role", "alert");

  const heading = document.createElement("h2");
  heading.textContent = "Connect Health couldn't load.";
  panel.appendChild(heading);

  const lead = document.createElement("p");
  lead.textContent =
    "This isn't a report of zero groups, and it isn't a sign that anything in Rock is " +
    "wrong. The dashboard couldn't read its data, so it is showing you nothing rather " +
    "than showing you a number it cannot stand behind.";
  panel.appendChild(lead);

  const next = document.createElement("p");
  next.textContent = "Tell the team that built this, and include the detail below.";
  panel.appendChild(next);

  const code = document.createElement("code");
  code.className = "boot-failure-detail";
  code.textContent = detail;
  panel.appendChild(code);

  root.appendChild(panel);
}

if (typeof document !== "undefined") {
  const autoBoot = () => {
    const root = document.getElementById("connect-field");
    if (!root) return;
    if (root.dataset.manualBoot === "true") return;
    if (root.dataset.source !== "dashboard-prod-read") return;

    let payload = null;
    let parseDetail = null;
    try {
      const island = document.getElementById("connect-field-data");
      if (!island) parseDetail = "the data island element is missing from the page";
      else if (island.type !== "application/json") parseDetail = `the data island has type "${island.type}"`;
      else payload = JSON.parse(island.textContent);
    } catch (error) {
      // The overwhelmingly likely cause is a Lava command that did not run, leaving a
      // hole where a JSON value belongs. Say so: the raw parser message alone sends
      // people looking for a typo in a file that is fine.
      parseDetail =
        `the data island isn't valid JSON (${error && error.message}). ` +
        "The usual cause is that registered-read isn't an enabled Lava command on " +
        "this block, so its output is missing entirely.";
      payload = null;
    }

    if (parseDetail) {
      renderBootFailure(root, parseDetail);
      return;
    }

    // boot is async, so a throw inside it becomes an unhandled rejection that the browser
    // swallows and the page stays empty. That is exactly how this shipped blank once.
    try {
      Promise.resolve(boot(root, payload)).catch((error) =>
        renderBootFailure(root, `the island failed while rendering (${error && error.message})`)
      );
    } catch (error) {
      renderBootFailure(root, `the island failed while starting (${error && error.message})`);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoBoot);
  else autoBoot();
}
