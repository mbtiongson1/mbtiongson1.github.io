import {
  buildView as buildGrowView, readUrlState, writeUrlSearch,
  COURSE_REGISTRY, GHOST, STATE_WORDS as SOURCE_STATE_WORDS,
} from "./grow-source.mjs?v=20260922_793";
import {
  bindExportDelegation, createExportRegistry, mountExportRail,
} from "./dashboard-export.mjs?v=20260922_793";
import { buildDashboardPackage, mountCopyPrompt, mountPackageControl } from "./dashboard-prompt.mjs?v=20260922_793";
import { mountThemeSwatch, syncIdentityAccent } from "./dashboard-theme.mjs?v=20260922_793";
import { assertAggregateSection, themeName } from "./dashboard-view.mjs?v=20260922_793";
import {
  bindInfoDismissal, classicWidget, dataTable, kpiStrip, modeSwitch,
  unavailablePanel as classicUnavailable,
} from "./classic-widgets.mjs?v=20260922_793";
import { mountTooltipDelegate, tooltipContent } from "./dashboard-tooltip.mjs?v=20260922_793";
import { mountStatus, markChanged, motionMs, trackHostChrome } from "./dashboard-status.mjs?v=20260922_793";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_793";
import "./dashboard-breadcrumbs.mjs?v=20260922_793";

/* exec/grow -- Grow Continuity - island runtime.
 *
 * Grow read batch by batch. The Rock block server-renders the markup fragment,
 * appends the passive JSON island (#grow-data), and loads this module; this
 * module hands that payload to grow-source.mjs, which returns the frozen
 * view-model of BUILD-CONTRACT section 8, and fills every mount below.
 *
 * This module reaches nothing and remembers nothing. It opens no network request
 * of any kind, touches no browser storage, and writes nothing to the developer
 * log -- the gate for all three is a mechanical grep over this file, so the names
 * are deliberately not written here either. Every number on the page comes from
 * what the server put in the data island and nothing else.
 *
 * WHERE THE LINE BETWEEN THE TWO FILES FALLS. grow-source.mjs owns every rule:
 * validation, the five URL keys, the health cut points, and the whole view-model.
 * This file owns the DOM and nothing else. In particular the URL rules are NOT
 * re-implemented here -- readUrl() and writeUrl() below are three lines of window
 * plumbing around the adapter's own readUrlState() and writeUrlSearch(), so the
 * address bar and the view can never drift into two different readings of the
 * same query string.
 *
 * THE ONE THING THAT IS EASIEST TO GET WRONG (contract 3.1). The ladder is a
 * PERSON read all the way down. `attended` on a rung is COUNT(DISTINCT PersonId),
 * because `returnedFromPrevious` and `newOrReentry` are person-set cardinalities
 * and their sum has to be the session's person set. The room read -- a row count
 * of check-ins -- lives in its own query and never appears on a rung. So the
 * contrast between the ladder and Completion shape is PER-SESSION against
 * CUMULATIVE, and it is not rooms against people. The design mock's completion
 * caption said "the session ladder counts the room, this counts people"; that
 * sentence is wrong and is not carried into this build.
 *
 * FOUR ABSENCES, FOUR RENDERINGS, NEVER INTERCHANGEABLE:
 *
 *   baseline      the word `baseline`. Session 1 has no previous session, so all
 *                 four of newOrReentry, droppedSincePrevious, perfectThroughSession
 *                 and uniqueReachToDate arrive null there (contract 8.1). Writing
 *                 0 would claim nobody was new on the first night.
 *   ghost         the string "?" in the model: Rock does not carry this yet
 *                 (ADR 0018). Rendered as `?` with a reachable (i) naming the
 *                 reason, and never as an em dash or the word Unavailable.
 *   read failure  { unavailable: { reason, queryId, kind } }. The whole chapter
 *                 renders as a named read failure carrying its query id. It never
 *                 degrades into a ghost, and it is never a zero.
 *   real zero     the numeral 0, in reading ink. We looked, and the answer is none.
 *
 * Health is a word before it is a colour: all six state words are written out as
 * text wherever a state appears. Course hue is identity only -- the course name is
 * written wherever its hue appears, a course hue is never a state, and a state hue
 * is never a course.
 *
 * Privacy: no person id, name, or contact value may enter this DOM, an export, the
 * package manifest, or any URL this file builds. Every link carries an opportunity
 * id, a group id, or a workflow type id and nothing else.
 */

/* ------------------------------------------------------------ vocabulary -- */

const SURFACE = Object.freeze({ id: "favor-exec-grow", title: "Grow Continuity", route: "exec/grow" });
const TEMPLATE_VERSION = new URL(import.meta.url).searchParams.get("v") || "dev";

/* Contract section 2. Exactly five keys, and nothing else is ever written. */
const URL_KEYS = Object.freeze(["campus", "season", "course", "batch", "mode"]);

const CAMPUS_LABEL = { MNL: "Manila", BNE: "Brisbane", SEL: "Seoul", ALL: "All campuses" };
const CAMPUS_SORT = { MNL: 1, BNE: 2, SEL: 3, ALL: 4 };

/* The six state words come from the adapter rather than being restated, so the
 * word the view asserts is present as text is the same string the model emits. */
const STATE_WORDS = Object.freeze(Object.values(SOURCE_STATE_WORDS));
const STATE_CLASS = {
  [SOURCE_STATE_WORDS.HEALTHY]: "chip--healthy",
  [SOURCE_STATE_WORDS.WATCH]: "chip--watch",
  [SOURCE_STATE_WORDS.THIN]: "chip--thin",
  [SOURCE_STATE_WORDS.CRITICAL]: "chip--critical",
  [SOURCE_STATE_WORDS.NOT_STARTED]: "chip--notstarted",
  [SOURCE_STATE_WORDS.NOT_ENOUGH_HISTORY]: "chip--nohistory",
};
/* Worst first, which is the order the fingerprints table sorts by. */
const STATE_SEVERITY = {
  [SOURCE_STATE_WORDS.CRITICAL]: 5,
  [SOURCE_STATE_WORDS.THIN]: 4,
  [SOURCE_STATE_WORDS.WATCH]: 3,
  [SOURCE_STATE_WORDS.NOT_ENOUGH_HISTORY]: 2,
  [SOURCE_STATE_WORDS.NOT_STARTED]: 1,
  [SOURCE_STATE_WORDS.HEALTHY]: 0,
};

/* Contract section 4: one buildSections() feeds both modes, and these are the ids. */
const CLASSIC_SECTIONS = Object.freeze([
  ["grow-kpis", "Grow readings", "kpi"],
  ["grow-continuity", "Session continuity", "table"],
  ["grow-completion", "Completion shape", "table"],
  ["grow-scoreboard", "Course scoreboard", "table"],
  ["grow-pipeline", "Core pipelines", "table"],
  ["grow-agreement", "Board and group agreement", "table"],
  ["grow-bridge", "Graduation bridge", "table"],
  ["grow-season", "This season", "table"],
]);

const MOBILE = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 768px)")
  : { matches: false, addEventListener: () => {} };

const state = {
  root: null,
  payload: null,
  view: null,
  /* Mirrors view.meta.scope. The adapter resolves it; this never invents it. */
  scope: { campus: "ALL", season: "", courseSlug: "all", batchId: null },
  mode: "creative",
  today: null,
  defaults: { season: "", batchId: null },
  reducedMotion: false,
  // The UX bar (#587): the shared status chip, mounted on first announce.
  status: null,
  controls: [],
  classicBound: false,
  mastheadMounted: false,
  themeSwatch: null,
  paletteHost: null,
  markup: null,
};

const exportRegistry = createExportRegistry();

/* ---------------------------------------------------------------- atoms -- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/* Compose a line of prose with emphasis without ever touching innerHTML. Every
 * value on this page came out of Rock, so the DOM is built from text nodes and
 * nothing here can be interpreted as markup. */
function rich(tag, className, parts) {
  const node = el(tag, className);
  for (const part of parts) {
    if (part === null || part === undefined || part === false) continue;
    if (typeof part === "string") node.append(document.createTextNode(part));
    else if (part instanceof Node) node.append(part);
    else if (part.strong !== undefined) node.append(el("strong", part.className || null, part.strong));
    else node.append(el("span", part.className || null, part.text));
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

function setText(id, text) {
  const target = mount(id);
  if (target) target.textContent = text === null || text === undefined ? GHOST : String(text);
  return target;
}

/* The UX bar (#587): every announce() is said twice, once to the live region for assistive
 * tech and once as the status chip for everyone else. Filter chatter passes visible: false
 * and is explained by the stations it changed instead (markChanged, in applySelection). */
function announce(message, { visible = true } = {}) {
  const live = mount("grow-live");
  if (live) live.textContent = message;
  if (!state.status && state.root) state.status = mountStatus(state.root, { live: null });
  if (state.status) state.status.announce(message, { visible });
}

const isGhost = (value) => value === GHOST;
const isBaseline = (value) => value === null || value === undefined;
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const fmt = (value) => (isNumber(value) ? value.toLocaleString("en-US") : String(value));
const pct = (part, whole) => (whole ? (100 * part) / whole : 0);
const round1 = (value) => Math.round(value * 10) / 10;

/* Every share and every drop the adapter emits is a FRACTION, not a percentage:
 * `round(finishedAll / uniqueReach, 4)`. One helper turns them into the one
 * written form this page uses, so no chapter can print 0.415% for 41.5%. */
const written = (fraction) => `${round1(fraction * 100)}%`;

/* The three renderings that must never be confusable, as three functions. Every
 * value slot on this page goes through exactly one of them. */

function ghostSpan(reason) {
  const node = el("span", "ghost", GHOST);
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `Not carried by Rock. ${reason}`);
  node.title = reason;
  return node;
}

function baselineSpan() {
  const node = el("span", "baseline", "baseline");
  node.title = "The first session has no previous session to compare against, so this measure does not apply yet. It is not a zero.";
  return node;
}

/* T7 -- the silhouette of the chart that failed to read, above the reason. THE TRAP:
 * this is the "unavailable" shape (hollow, dashed, never animated, untinted -- ADR
 * per grow.css:958), not connect-field's `.ghost-bar` loading skeleton (filled,
 * shimmering, "still working"). An unavailable panel is not loading; reusing the
 * shimmer here would claim the read is in flight when it has already failed. The
 * group carries the one accessible name; the bars inside are decorative, exactly
 * as connect-field's ghostRows() does it. */
function unavailableGhostBars(chapter, reason) {
  const wrap = el("div", "unavailable-ghosts");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `${chapter} could not be read. ${reason || ""}`.trim());
  for (let index = 0; index < 4; index += 1) {
    const bar = el("span", "unavailable-ghost-bar");
    bar.setAttribute("aria-hidden", "true");
    wrap.append(bar);
  }
  return wrap;
}

/* A read failure. Named, carrying its reason, its query id and its kind, and it
 * never degrades into a ghost or a zero. */
function renderUnavailable(hostId, unavailable, chapter) {
  const host = mount(hostId);
  if (!host) return false;
  if (!unavailable) {
    host.hidden = true;
    host.replaceChildren();
    return false;
  }
  const kind = unavailable.kind === "REFUSED" ? "The read was refused" : "The read came back malformed";
  host.hidden = false;
  host.replaceChildren(
    unavailableGhostBars(chapter, `${kind}. ${unavailable.reason || ""}`.trim()),
    el("h3", null, `${chapter} could not be read`),
    el("p", null, `${kind}. ${unavailable.reason || ""}`.trim()),
    rich("p", null, ["Query ", { text: unavailable.queryId || "unknown", className: "num" }, ". This is a failed read, not a zero and not a value Rock is missing."]),
  );
  return true;
}

/* Every "?" on this page has to be reachable through the chapter's own (i), so
 * the reasons are collected as the chapter renders and appended to its info-pop. */
function noteGhosts(sectionId, reasons) {
  const section = mount(sectionId);
  if (!section) return;
  const pop = section.querySelector(".info-pop");
  if (!pop) return;
  const existing = pop.querySelector(".info-ghosts");
  if (existing) existing.remove();
  const unique = [...new Set(reasons.filter(Boolean))];
  if (!unique.length) return;
  const node = el("p", "info-ghosts");
  node.append(el("strong", null, "What the question marks in this chapter mean: "));
  node.append(document.createTextNode(unique.join(" ")));
  pop.append(node);
}

/* The course hue, always applied together with the course name by the caller.
 * A card with no course in the registry gets no hue at all rather than a
 * var(--course-null) that resolves to nothing and paints the fallback. */
function courseStyle(node, slug) {
  if (!node || !slug) return node;
  node.style.setProperty("--c", `var(--course-${slug})`);
  node.style.setProperty("--c-text", `var(--course-${slug}-text)`);
  node.style.setProperty("--c-on", `var(--course-${slug}-on)`);
  return node;
}

/* Grow Multicolor is the one runtime theme with no fixed brand hue of its own:
 * it is the course ladder promoted to chrome. Filtering to a course pushes
 * that course's --course-* pair into the brand slots, so the masthead
 * highlight, focus ring, links and active console chips read in that
 * course's colour instead of the static Favor DNA violet / Build terracotta
 * pairing themes/favor-grow-multicolor.json ships for "All Grow". Cream,
 * Dark and Indigo keep their own fixed accent untouched -- this only ever
 * writes inline overrides while Multicolor (or no theme, which renders
 * identically) is the active palette, and clears them otherwise.
 *
 * The mechanism itself -- key -> three-rung ladder -> brand-chrome slots -- is
 * shared/dashboard-theme.mjs's syncIdentityAccent(); Grow's own job is just
 * resolving `key` (a real, registry-known course slug, or null). */
function syncMulticolorAccent() {
  if (!state.root) return;
  const slug = state.scope.courseSlug;
  const course = slug && slug !== "all"
    ? COURSE_REGISTRY.courses.find((entry) => entry.slug === slug)
    : null;
  syncIdentityAccent(state.root, {
    theme: state.root.dataset.theme || null,
    activeThemes: ["favor-grow-multicolor"],
    key: course ? slug : null,
    tokenPrefix: "course",
    slots: {
      "--accent": "mark",
      "--spectrum-lock": "mark",
      "--spectrum-lock-wash": { wash: 30 },
      "--accent-deep": "text",
      "--focus": "text",
      "--secondary": "text",
      "--selected-wash": { wash: 16 },
      "--hover-wash": { wash: 8 },
      "--on-accent": "on",
    },
  });
  /* A locked band is a 30% wash, so its text is ink rather than the ladder's on grade. */
  state.root.style.setProperty("--spectrum-lock-ink", course ? "var(--ink)" : "");
}

/* A state, written as a word first. The chip carries the word as text; the wash
 * only repeats it, so a reader who cannot separate the hues loses nothing. */
function stateChip(word) {
  const known = STATE_WORDS.includes(word) ? word : SOURCE_STATE_WORDS.NOT_ENOUGH_HISTORY;
  return el("span", `chip ${STATE_CLASS[known]}`, known);
}

/* ------------------------------------------------------------ URL state -- */

/* The five keys, Connect's rules, implemented once in grow-source.mjs and only
 * plumbed here: absent key means no filter; every value validated against what
 * the read actually holds and dropped if absent, never matched to nothing;
 * campus written unconditionally; mode written last and only when classic;
 * replaceState only, because a filter click is never a new history entry. */

function urlOptions() {
  return {
    serverCampus: state.scope.campus,
    defaultSeason: state.defaults.season || undefined,
    defaultBatchId: state.defaults.batchId,
  };
}

function readUrl() {
  const scope = readUrlState(window.location.search, urlOptions());
  state.mode = scope.mode === "classic" ? "classic" : "creative";
  return scope;
}

function writeUrl() {
  const query = writeUrlSearch({ ...state.scope, mode: state.mode }, urlOptions());
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  window.history.replaceState(window.history.state, "", url);
}

/* The adapter re-derives the whole view from the query string, so a filter click
 * is: mutate the scope, write the address, rebuild from the same payload, render.
 * Nothing downstream keeps a second copy of the selection. */
/* `search` is passed only at boot, where it must be the address exactly as it
 * arrived: an absent campus is the adapter's cue to seed the viewer's own campus
 * from the payload, and rebuilding from currentSearch() would have written ALL
 * into the query first and destroyed that cue. Every later rebuild is a filter
 * the reader chose, so it goes through currentSearch(). */
function rebuild(search) {
  state.view = safeBuild({ search: search === undefined ? currentSearch() : search });
  const resolved = (state.view.meta && state.view.meta.scope) || {};
  state.scope = {
    campus: resolved.campus || "ALL",
    season: resolved.season ? String(resolved.season) : "",
    courseSlug: resolved.courseSlug || "all",
    batchId: resolved.batchId === undefined ? null : resolved.batchId,
  };
}

function currentSearch() {
  const params = new URLSearchParams();
  params.set("campus", state.scope.campus || "ALL");
  if (state.scope.season) params.set("season", state.scope.season);
  if (state.scope.courseSlug && state.scope.courseSlug !== "all") params.set("course", state.scope.courseSlug);
  if (Number.isSafeInteger(state.scope.batchId)) params.set("batch", String(state.scope.batchId));
  if (state.mode === "classic") params.set("mode", "classic");
  return params.toString();
}

/* The default batch is whatever the adapter picks when the address names none:
 * the most recent batch with an occurrence, for the campus, season and course in
 * scope. It moves when the course or the season moves, so it is asked for again
 * rather than remembered, and it is asked of the adapter rather than guessed. */
function refreshDefaults() {
  const probe = new URLSearchParams();
  /* Campus is a server-side query parameter, so it is carried into the probe to
   * keep the probed default in the same slice as the render. */
  probe.set("campus", state.scope.campus || "ALL");
  if (state.scope.season) probe.set("season", state.scope.season);
  if (state.scope.courseSlug && state.scope.courseSlug !== "all") probe.set("course", state.scope.courseSlug);
  const probed = safeBuild({ search: probe.toString() });
  const scope = (probed.meta && probed.meta.scope) || {};
  state.defaults.season = scope.season ? String(scope.season) : state.defaults.season;
  state.defaults.batchId = scope.batchId === undefined ? null : scope.batchId;
}

function applySelection(mutate, message) {
  mutate();
  refreshDefaults();
  rebuild();
  writeUrl();
  renderAll();
  if (message) announce(message, { visible: false });
  if (state.root) {
    markChanged(state.mode === "classic"
      ? state.root.querySelectorAll(".cw, .kpi-strip")
      : state.root.querySelectorAll('[id^="station-"]:not(#station-colophon)'));
  }
}

/* ---------------------------------------------------------- the console -- */

function pushControl(control) {
  state.controls.push(control);
}

function buildModeSwitch() {
  const wrap = mount("mode-switch-mount");
  if (!wrap) return;
  wrap.replaceChildren();
  wrap.append(modeSwitch(state.mode, (next) => {
    /* The one authored moment. The class goes on BEFORE the render, so the
     * widgets this render builds start held back and ease in when it drops. */
    const beat = motionMs(state.root, "--motion-state", 180);
    if (beat > 0) {
      state.root.classList.add("is-mode-switching");
      window.setTimeout(() => { state.root.classList.remove("is-mode-switching"); }, beat);
    }
    applySelection(() => {
      state.mode = next;
      state.root.dataset.mode = next;
    }, next === "classic" ? "Classic mode." : "Creative mode.");
  }));
  /* Mode switch first, so the console describes itself in the order it is read. */
  pushControl({
    id: "mode",
    kind: "segmented",
    label: "Display mode",
    selector: "#mode-switch-mount .mode-switch__btn",
    values: ["Creative", "Classic"],
    effect: "Switches the whole page between the Creative reading and the Classic tables. Both read the same filters and are built from the same sections, so switching never loses the selection and the two modes cannot disagree about a number.",
  });
}

function optionButton(label, note, pressed, onClick, className) {
  const button = el("button", className || "opt-btn");
  button.type = "button";
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  button.append(el("span", null, label));
  if (note) button.append(el("small", null, note));
  button.addEventListener("click", onClick);
  return button;
}

/* Every control's vocabulary comes from the course registry the adapter itself
 * validates against, never from the rendered chapters: a filter that offers a
 * value the adapter would drop is a control that looks alive and does nothing. */
const COURSE_BY_GROUP_ID = new Map();
for (const course of COURSE_REGISTRY.courses) {
  for (const batch of course.batches) {
    if (Number.isSafeInteger(batch.groupId)) COURSE_BY_GROUP_ID.set(batch.groupId, course);
  }
}

function campusValues() {
  return [...COURSE_REGISTRY.campuses]
    .sort((a, b) => (CAMPUS_SORT[a] || 99) - (CAMPUS_SORT[b] || 99));
}

function seasonValues() {
  return [...COURSE_REGISTRY.seasons].sort().reverse();
}

function courseValues() {
  const held = new Set();
  for (const course of COURSE_REGISTRY.courses) {
    if (course.family === "core" || course.batches.some((batch) => batch.season === state.scope.season)) held.add(course.slug);
  }
  const courses = COURSE_REGISTRY.courses.filter((course) => held.has(course.slug));
  const core = courses.filter((course) => course.family === "core");
  const electives = courses.filter((course) => course.family !== "core");
  return [{ slug: "all", label: "All Grow" }, ...core, ...electives];
}

function batchRunLabel(batch) {
  if (batch.label && typeof batch.label === "string" && batch.label.trim()) {
    return batch.label.trim();
  }
  if (batch.firstOccurrence && batch.lastOccurrence) {
    return batch.firstOccurrence === batch.lastOccurrence
      ? batch.firstOccurrence
      : `${batch.firstOccurrence} to ${batch.lastOccurrence}`;
  }
  if (batch.firstOccurrence) {
    return batch.firstOccurrence;
  }
  if (Array.isArray(batch.plannedDates) && batch.plannedDates.length > 0) {
    return batch.plannedDates.length === 1
      ? batch.plannedDates[0]
      : `${batch.plannedDates[0]} to ${batch.plannedDates[batch.plannedDates.length - 1]}`;
  }
  return GHOST;
}

function batchSortDate(batch) {
  if (batch.firstOccurrence) return batch.firstOccurrence;
  if (Array.isArray(batch.plannedDates) && batch.plannedDates.length > 0) return batch.plannedDates[0];
  if (batch.lastOccurrence) return batch.lastOccurrence;
  return "";
}

function batchValues() {
  const entries = [];
  for (const course of COURSE_REGISTRY.courses) {
    if (state.scope.courseSlug !== "all" && course.slug !== state.scope.courseSlug) continue;
    for (const batch of course.batches) {
      if (batch.season !== state.scope.season) continue;
      /* A batch the registry names but Rock has no group for cannot be asked
       * about, so it is not offered. */
      if (!Number.isSafeInteger(batch.groupId)) continue;
      const run = batchRunLabel(batch);
      const label = state.scope.courseSlug === "all" ? `${course.label} - ${run}` : run;
      entries.push({
        id: batch.groupId,
        label,
        courseSlug: course.slug,
        date: batchSortDate(batch),
      });
    }
  }
  return entries.sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
}

function buildCampusRow() {
  const wrap = mount("campus-row");
  if (!wrap) return [];
  wrap.replaceChildren();
  const codes = campusValues();
  for (const code of codes) {
    const button = optionButton(code, null, state.scope.campus === code, () => applySelection(() => {
      state.scope.campus = code;
    }, `${CAMPUS_LABEL[code] || code} selected.`), "acronym-btn");
    button.setAttribute("aria-label", CAMPUS_LABEL[code] || code);
    button.title = CAMPUS_LABEL[code] || code;
    wrap.append(button);
  }
  return codes;
}

function buildSeasonRow() {
  const wrap = mount("season-btns");
  if (!wrap) return [];
  wrap.replaceChildren();
  const seasons = seasonValues();
  for (const season of seasons) {
    wrap.append(optionButton(season, null, state.scope.season === season, () => applySelection(() => {
      state.scope.season = season;
      /* A batch belongs to one season, so carrying it across would name a run
       * the new season does not have. The adapter would drop it; the console
       * says so by clearing it rather than leaving a dead chip behind. */
      state.scope.batchId = null;
    }, `${season} season selected.`)));
  }
  return seasons;
}

/* T5 -- course tile faces. The full course name lives in the hover/focus card and
 * in the accessible name; the tile face carries only the abbreviation, the way
 * campus chips already carry MNL/CAL/etc (see .acronym-btn above). */
const COURSE_ABBR = {
  "build": "BUILD",
  "favor-dna": "FDNA",
  "upnext": "UPNEXT",
  "healthy-relationships": "HR",
  "stewarding-your-finances": "SYF",
  "favored-and-free": "F&F",
  "prophetic-culture": "PC",
  "bible-masterclass": "BMC",
  "gifts-of-the-holy-spirit": "GotHS",
  "presence-filled-life": "PFL",
  "influencing-your-world": "IYW",
  "freedom-encounter": "FE",
  "before-forever": "BF",
  "spiritual-disciplines": "SD",
  "deliverance-masterclass": "DMC",
  "how-to-read-my-bible": "HRMB",
  "bible-essentials": "BE",
};

function courseTile(course, isPressed) {
  const btn = el("button", "course-tile");
  btn.type = "button";
  btn.setAttribute("aria-pressed", isPressed ? "true" : "false");
  btn.setAttribute("aria-label", course.label);
  courseStyle(btn, course.slug);
  const face = el("span", "course-tile__face", COURSE_ABBR[course.slug] || course.label);
  face.setAttribute("aria-hidden", "true");
  const name = el("span", "course-tile__name");
  name.append(el("span", "course-tile__title", course.label));
  btn.append(face, name);
  btn.addEventListener("click", () => applySelection(() => {
    state.scope.courseSlug = course.slug;
    state.scope.batchId = null;
  }, `${course.label} selected.`));
  return btn;
}

function buildCourseRow() {
  const wrap = mount("course-btns");
  if (!wrap) return [];
  wrap.replaceChildren();
  const allCourses = courseValues();
  const labels = allCourses.map((c) => c.label);

  const core = allCourses.filter((c) => {
    const reg = COURSE_REGISTRY.courses.find((x) => x.slug === c.slug);
    return reg && reg.family === "core";
  });
  const electives = allCourses.filter((c) => {
    if (c.slug === "all") return false;
    const reg = COURSE_REGISTRY.courses.find((x) => x.slug === c.slug);
    return !reg || reg.family !== "core";
  });

  // 1. All Grow button
  const allBtn = optionButton("All Grow", null, state.scope.courseSlug === "all", () => applySelection(() => {
    state.scope.courseSlug = "all";
    state.scope.batchId = null;
  }, "All Grow selected."));
  wrap.append(allBtn);

  // 2. Core pathway courses -- grouping kept, visible label dropped (T5): the
  // craft floor bans a bare kicker/eyebrow over a tile grid. An aria-label on
  // the subgroup keeps the grouping for screen-reader users.
  const coreGroup = el("div", "course-subgroup");
  coreGroup.setAttribute("role", "group");
  coreGroup.setAttribute("aria-label", "Core pathway courses");
  const coreGrid = el("div", "chip-grid-3");
  for (const course of core) {
    coreGrid.append(courseTile(course, state.scope.courseSlug === course.slug));
  }
  coreGroup.append(coreGrid);
  wrap.append(coreGroup);

  // 3. Elective courses -- same tile grid, same silent grouping. All 17 courses
  // fit at 3 columns, so the overflow <select> is retired rather than kept
  // around to reintroduce "Electives" as a visible heading.
  const elecGroup = el("div", "course-subgroup");
  elecGroup.setAttribute("role", "group");
  elecGroup.setAttribute("aria-label", "Elective courses");
  const elecGrid = el("div", "chip-grid-3");
  for (const course of electives) {
    elecGrid.append(courseTile(course, state.scope.courseSlug === course.slug));
  }
  elecGroup.append(elecGrid);
  wrap.append(elecGroup);

  return labels;
}

function buildBatchSelect() {
  const select = mount("sel-batch");
  if (!select) return [];
  const entries = batchValues();
  select.replaceChildren();

  if (entries.length === 0) {
    const emptyOpt = el("option", null, "No batches in this slice");
    emptyOpt.value = "";
    emptyOpt.disabled = true;
    emptyOpt.selected = true;
    select.append(emptyOpt);
    select.disabled = true;
  } else {
    select.disabled = false;
    for (const entry of entries) {
      const option = el("option", null, entry.label);
      option.value = String(entry.id);
      if (entry.id === state.scope.batchId) option.selected = true;
      select.append(option);
    }
  }

  select.onchange = () => applySelection(() => {
    const chosen = Number.parseInt(select.value, 10);
    state.scope.batchId = Number.isSafeInteger(chosen) ? chosen : null;
    if (state.scope.batchId !== null) {
      const course = COURSE_BY_GROUP_ID.get(state.scope.batchId);
      if (course) state.scope.courseSlug = course.slug;
    }
  }, "Batch selected.");

  const note = mount("filter-count-note");
  if (note) {
    note.textContent = entries.length
      ? `${entries.length} batch${entries.length === 1 ? "" : "es"} in this slice, newest first.`
      : "Rock holds no batch with a group id for this slice.";
  }

  return entries.map((entry) => entry.label);
}

function buildSidebar() {
  state.controls = [];
  buildModeSwitch();

  const head = mount("filter-sidebar")?.querySelector(".sidebar-head");
  if (head) {
    let reset = head.querySelector(".reset-btn");
    if (!reset) {
      reset = el("button", "reset-btn", "Reset");
      reset.type = "button";
      reset.id = "btn-sidebar-reset";
      head.append(reset);
    }
    const isFiltered = state.scope.campus !== "ALL" || (state.scope.courseSlug && state.scope.courseSlug !== "all") || (state.scope.batchId !== null && state.scope.batchId !== state.defaults.batchId);
    reset.hidden = !isFiltered;
    reset.onclick = () => applySelection(() => {
      state.scope.campus = "ALL";
      state.scope.courseSlug = "all";
      state.scope.batchId = null;
    }, "Filters reset. Showing the whole season.");
  }
  pushControl({
    id: "reset",
    kind: "action",
    label: "Reset filters",
    selector: ".sidebar-head .reset-btn",
    values: ["reset"],
    effect: "Returns campus to ALL, clears course and batch filters, and returns to the whole season.",
  });

  const campuses = buildCampusRow();
  pushControl({
    id: "campus",
    kind: "button-group",
    label: "Campus scope",
    selector: "#campus-row .acronym-btn",
    values: campuses,
    effect: "Single choice. ALL is the whole church and is always the last button. The campus is written into the address even when it is ALL, because an absent campus is seeded from the viewer's own campus and a pasted link must not quietly become the recipient's campus instead of the one it was shared from.",
  });

  const seasons = buildSeasonRow();
  pushControl({
    id: "season",
    kind: "button-group",
    label: "Season",
    selector: "#season-btns .opt-btn",
    values: seasons,
    effect: "Single choice over the years the course registry actually holds. The current season is the default and is left out of the address. Changing it clears the batch, because a batch belongs to one season.",
  });

  const courses = buildCourseRow();
  pushControl({
    id: "course",
    kind: "compound",
    label: "Course",
    selector: "#course-btns button",
    values: courses,
    effect: "Single choice, core courses first and then electives. All Grow is the default and is left out of the address. Choosing a course clears the batch, because a batch belongs to one course.",
  });

  const batches = buildBatchSelect();
  pushControl({
    id: "batch",
    kind: "select",
    label: "Batch",
    selector: "#sel-batch",
    values: batches,
    effect: "Single choice over the runs of the chosen course, newest first. The default is the most recent batch with at least one occurrence, so the ladder always opens on something that has actually happened, and the default is left out of the address.",
  });

  pushControl({
    id: "lifecycle",
    kind: "select",
    label: "Lifecycle",
    selector: "#sel-lifecycle",
    values: ["new", "crowd", "core", "leader"],
    effect: "Not measured on Grow batches: Grow attendance records do not carry person demographic dimensions in Rock.",
  });

  pushControl({
    id: "age",
    kind: "select",
    label: "Age band",
    selector: "#sel-age",
    values: ["kids", "youth", "youngAdults", "adults", "seasoned"],
    effect: "Not measured on Grow batches: Grow attendance records do not carry person demographic dimensions in Rock.",
  });

  pushControl({
    id: "gender",
    kind: "select",
    label: "Gender",
    selector: "#sel-gender",
    values: ["women", "men"],
    effect: "Not measured on Grow batches: Grow attendance records do not carry person demographic dimensions in Rock.",
  });

  const note = mount("filter-count-note");
  if (note) {
    note.textContent = batches.length
      ? `${batches.length} batch${batches.length === 1 ? "" : "es"} in this slice, newest first.`
      : "Rock holds no batch with a group id for this slice.";
  }
}

/* ---------------------------------------------------- chapter 0 masthead -- */

function renderMasthead() {
  const meta = (state.view && state.view.meta) || {};
  const scope = meta.scope || {};
  const stamps = meta.stamps || {};
  setText("stamp-scope", [
    CAMPUS_LABEL[scope.campus] || scope.campus || GHOST,
    scope.season ? `${scope.season} season` : null,
  ].filter(Boolean).join(" - "));

  const reasons = [];
  const stamp = (id, raw, what) => {
    const host = mount(id);
    if (!host) return;
    if (isGhost(raw) || isBaseline(raw)) {
      const why = `${what} carries no read time on this payload.`;
      reasons.push(why);
      host.replaceChildren(ghostSpan(why));
    } else host.textContent = String(raw);
  };
  stamp("stamp-attendance", stamps.attendanceRead, "The attendance read");
  stamp("stamp-board", stamps.boardRead, "The board read");
  stamp("stamp-calendar", stamps.calendarSource, "The calendar source");
  noteGhosts("grow-island", reasons);

  const flag = mount("flag-provenance");
  if (flag) flag.textContent = meta.fictional ? "Fictional prototype data." : "";

  const summary = mount("scope-summary");
  if (summary) summary.textContent = filterSummary();

  const reset = mount("btn-reset-filters");
  if (reset) {
    reset.hidden = state.scope.courseSlug === "all";
    reset.onclick = () => applySelection(() => {
      state.scope.courseSlug = "all";
      state.scope.batchId = null;
    }, "Showing the whole season.");
  }
  const pill = mount("active-summary");
  if (pill) pill.textContent = courseLabelOf(state.scope.courseSlug);
}

function courseLabelOf(slug) {
  if (!slug || slug === "all") return "All Grow";
  const course = COURSE_REGISTRY.courses.find((entry) => entry.slug === slug);
  return course ? course.label : slug;
}

/* The one filter line. The scope bar, the export provenance line and the package
 * manifest all read this, so the three can never describe different slices. */
function filterSummary() {
  const batch = state.view && state.view.batch ? state.view.batch : null;
  return [
    CAMPUS_LABEL[state.scope.campus] || state.scope.campus,
    state.scope.season ? `${state.scope.season} season` : null,
    courseLabelOf(state.scope.courseSlug),
    batch && batch.batchLabel && !isGhost(batch.batchLabel) ? batch.batchLabel : null,
  ].filter(Boolean).join(" - ");
}

/* -------------------------------------------------- chapter 1 the season -- */

/* Chapter 1 leads with tonight, not with January. `season.now` is derived in the
 * adapter from the same cards the rail prints, so the strip can never claim a
 * session the rail does not show. Each running course states the next date and
 * how far away it is, and offers the one action that is always supported from
 * here: scoping the page to that course. A ghost next session says so, because
 * a planned date Rock holds no occurrence for is still a real date. */
function renderNowStrip(now) {
  const host = mount("season-now");
  if (!host) return;
  host.replaceChildren();
  if (!now) {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const away = (days) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

  /* The session meter: one tick per planned session, held ticks solid in the course
   * hue, the rest hairline boxes, and one dashed ghost tick when Rock carries no
   * plan. The same three shapes as the scoreboard's .fp, so the vocabulary is
   * learnt once. The sentence beside it always carries the same reading; the mark
   * never reads alone. */
  const meter = (held, planned, label) => {
    const bar = el("span", "nowcard__meter");
    bar.setAttribute("role", "img");
    const heldCount = isNumber(held) ? held : 0;
    if (isNumber(planned) && planned > 0) {
      for (let index = 0; index < planned; index += 1) bar.append(el("i", index < heldCount ? null : "todo"));
      bar.setAttribute("aria-label", `${label}: ${heldCount} of ${planned} sessions held, ${Math.max(0, planned - heldCount)} still to come.`);
    } else {
      for (let index = 0; index < heldCount; index += 1) bar.append(el("i"));
      bar.append(el("i", "gh"));
      bar.setAttribute("aria-label", `${label}: ${heldCount} session${heldCount === 1 ? "" : "s"} held; Rock carries no session count for this course.`);
    }
    return bar;
  };

  const card = (kind, eyebrow, entry, detail, meterNode) => {
    const node = el("button", `nowcard nowcard--${kind}`);
    node.type = "button";
    courseStyle(node, entry.courseSlug);
    node.append(el("span", "nowcard__eyebrow", eyebrow));
    const name = el("span", "nowcard__course");
    name.append(el("span", "nowcard__dot"), el("span", null, entry.courseLabel));
    node.append(name, detail);
    if (meterNode) node.append(meterNode);
    node.setAttribute("aria-label", `${eyebrow}: ${entry.courseLabel}. ${detail.textContent}`);
    node.addEventListener("click", () => applySelection(() => {
      state.scope.courseSlug = entry.courseSlug;
      state.scope.batchId = null;
    }, `${entry.courseLabel} selected.`));
    return node;
  };

  for (const entry of now.running) {
    const detail = el("span", "nowcard__detail");
    const held = isGhost(entry.sessionsPlanned)
      ? `${entry.sessionsHeld} held`
      : `${entry.sessionsHeld} of ${entry.sessionsPlanned} held`;
    detail.append(el("b", null, `Next ${entry.nextDateLabel}`), document.createTextNode(` - ${away(entry.daysAway)}`));
    detail.append(el("span", "nowcard__held", `Session ${entry.nextSessionIndex}. ${held} so far.`));
    if (entry.nextIsGhost) {
      /* An absence stays in layout and stays legible: the short reason is visible,
       * the long one rides on the mark. */
      const why = `${entry.courseLabel} has a planned date here but no attendance occurrence in Rock yet, so the night is scheduled and nothing is recorded against it.`;
      detail.append(rich("span", "nowcard__ghost", [ghostSpan(why), " planned, no occurrence in Rock yet"]));
    }
    host.append(card("running", "Running now", entry, detail, meter(entry.sessionsHeld, entry.sessionsPlanned, entry.courseLabel)));
  }

  if (now.opensNext) {
    const detail = el("span", "nowcard__detail");
    detail.append(el("b", null, now.opensNext.dateLabel), document.createTextNode(` - ${away(now.opensNext.daysAway)}`));
    detail.append(el("span", "nowcard__held", `Session ${now.opensNext.sessionIndex}, the first night.`));
    const opening = COURSE_REGISTRY.courses.find((entry) => entry.slug === now.opensNext.courseSlug);
    host.append(card("next", "Opens next", now.opensNext, detail, meter(0, opening ? opening.sessionsPlanned : null, now.opensNext.courseLabel)));
  }

  if (!now.running.length && !now.opensNext) {
    /* An absence stays in the layout (ADR 0018): a season with nothing ahead of
     * it is a real answer, and it must not read as a page that failed to load. */
    const empty = el("p", "nowstrip__empty");
    empty.textContent = "Nothing is running tonight and Rock holds no later session in this slice.";
    host.append(empty);
  }
}

function renderSeason() {
  const season = (state.view && state.view.season) || {};
  if (renderUnavailable("season-unavailable", season.unavailable, "This season")) {
    fill("season-rail");
    renderNowStrip(null);
    setText("season-note", "");
    return;
  }
  renderNowStrip(season.now || null);
  const cards = Array.isArray(season.cards) ? season.cards : [];
  const rail = mount("season-rail");
  if (!rail) return;
  rail.replaceChildren();
  const reasons = [];

  for (const card of cards) {
    const node = el("button", "ev");
    node.type = "button";
    if (card.isToday) node.classList.add("ev--today");
    if (card.ghost) node.classList.add("ev--ghost");
    if (card.courseSlug && state.scope.courseSlug === card.courseSlug) node.classList.add("ev--selected");

    const date = el("span", "ev__date");
    if (card.isToday) date.append(el("b", null, "Today"), document.createTextNode(" - "));
    if (isGhost(card.dateLabel) || isBaseline(card.dateLabel)) {
      const why = `${card.courseLabel} has neither a Rock schedule nor an occurrence for this session, so there is no date to print.`;
      reasons.push(why);
      date.append(ghostSpan(why));
    } else date.append(document.createTextNode(card.dateLabel));

    const tag = courseStyle(el("span", "ev__tag"), card.courseSlug);
    if (card.courseSlug) tag.style.background = `var(--course-${card.courseSlug})`;
    tag.append(el("span", null, card.courseLabel));

    const sub = el("span", "ev__sub");
    if (card.kind === "did-not-occur") {
      sub.textContent = "This session did not happen";
    } else if (card.ghost) {
      /* A planned date Rock holds no occurrence for. The date is real; the
       * attendance is simply not there yet, and saying nobody came would be a
       * different and false claim. */
      const why = `${card.courseLabel} has a planned date here but no attendance occurrence in Rock yet, so there is nothing to count.`;
      reasons.push(why);
      sub.append(document.createTextNode("Planned, not yet held "), ghostSpan(why));
    } else if (isGhost(card.sessionsPlanned) || isBaseline(card.sessionsPlanned)) {
      sub.textContent = `Session ${card.sessionIndex}`;
    } else {
      sub.textContent = `Session ${card.sessionIndex} of ${card.sessionsPlanned}`;
    }

    node.append(date, tag, el("span", "ev__title", card.courseLabel), sub);
    node.setAttribute("aria-label", `${card.courseLabel}, ${isGhost(card.dateLabel) ? "no date in Rock" : card.dateLabel}. ${sub.textContent}`);
    if (card.courseSlug) {
      node.addEventListener("click", () => applySelection(() => {
        state.scope.courseSlug = card.courseSlug;
        state.scope.batchId = null;
      }, `${card.courseLabel} selected.`));
    } else {
      node.disabled = true;
    }
    rail.append(node);
  }

  setText("season-note", cards.length
    ? `${cards.length} dated session${cards.length === 1 ? "" : "s"} in this slice.`
    : "Rock holds no dated Grow session in this slice.");
  noteGhosts("station-season", reasons);
}

/* ------------------------------------------ chapter 2 the batch, the ladder -- */

function renderLadder() {
  const batch = (state.view && state.view.batch) || {};
  const title = mount("batch-title");
  if (title) {
    /* A batch label is built as "<course> <first date>", so pairing it with the
     * course label printed the course twice: "Prophetic Culture - Prophetic
     * Culture 2026-05-19". The course leads, and the label contributes only what
     * it adds to it -- the date window that tells two runs of one course apart. */
    let rest = isGhost(batch.batchLabel) || !batch.batchLabel ? "this batch" : batch.batchLabel;
    if (rest !== "this batch" && batch.courseLabel && rest.startsWith(batch.courseLabel)) {
      rest = rest.slice(batch.courseLabel.length).trim() || "this batch";
    }
    title.textContent = isGhost(batch.courseLabel) || !batch.courseLabel
      ? "The batch"
      : `${batch.courseLabel} - ${rest}`;
  }
  if (renderUnavailable("batch-unavailable", batch.unavailable, "The batch")) {
    fill("ladder");
    fill("ladder-legend");
    setText("batch-insight", "");
    setText("batch-note", "");
    return;
  }
  const rungs = Array.isArray(batch.rungs) ? batch.rungs : [];
  const ladder = courseStyle(mount("ladder"), batch.courseSlug);
  if (!ladder) return;
  ladder.replaceChildren();

  /* Every track is drawn against one scale so the rungs are comparable to each
   * other: the widest a rung can be is the people who were there plus the people
   * who left, which is the previous session's set. */
  const peak = Math.max(1, ...rungs.map((rung) => (
    (isNumber(rung.attended) ? rung.attended : 0)
    + (isNumber(rung.droppedSincePrevious) ? rung.droppedSincePrevious : 0)
  )));
  const reasons = [];

  for (const rung of rungs) {
    const row = el("div", "rung");
    row.tabIndex = 0;
    const label = el("div", "rung__label", `Session ${rung.sessionIndex}`);
    label.append(el("small", null, isGhost(rung.dateLabel) ? "no date in Rock" : rung.dateLabel));

    const track = el("div", "track");
    track.setAttribute("role", "img");
    const { attended, returnedFromPrevious: returned, newOrReentry: fresh } = rung;
    const dropped = rung.droppedSincePrevious;
    const perfect = rung.perfectThroughSession;

    /* Session 1 is baseline: one bar, no dropped box, no perfect tick. Rendering
     * a zero for any of the four null fields would be a claim nobody made. */
    if (isBaseline(fresh)) {
      const bar = el("div", "seg seg--first", `${fmt(attended)} attended`);
      bar.style.width = `${round1(pct(attended, peak))}%`;
      track.append(bar);
    } else {
      if (isNumber(returned)) {
        const bar = el("div", "seg seg--returned", `${fmt(returned)} returned`);
        bar.style.width = `${round1(pct(returned, peak))}%`;
        track.append(bar);
      }
      if (isNumber(fresh) && fresh > 0) {
        const bar = el("div", "seg seg--new");
        bar.append(el("span", "seg__n", fmt(fresh)));
        bar.style.width = `${round1(pct(fresh, peak))}%`;
        track.append(bar);
      }
      if (isNumber(dropped) && dropped > 0) {
        const box = el("div", "seg seg--dropped", fmt(dropped));
        box.style.flex = "1";
        track.append(box);
      }
      if (isNumber(perfect)) {
        /* The tick can never sit right of the returned edge: everyone who has
         * been in every session so far was, by definition, also in the previous
         * one, so a tick beyond that edge would be drawing an impossibility. */
        const capped = isNumber(returned) ? Math.min(perfect, returned) : perfect;
        const tick = el("div", "perfect");
        tick.style.left = `${round1(pct(capped, peak))}%`;
        tick.setAttribute("aria-hidden", "true");
        track.append(tick);
      }
    }

    /* The track's own reading, as its four numbers, for anyone who cannot see it. */
    track.setAttribute("aria-label", ladderReading(rung));

    const nums = el("div", "rung__nums");
    nums.append(rich("span", null, [{ strong: fmt(attended) }, " attended"]));
    if (isBaseline(fresh)) {
      nums.append(rich("span", null, [baselineSpan()]));
    } else {
      nums.append(rich("span", null, [{ strong: fmt(returned) }, ` from session ${rung.sessionIndex - 1}`]));
      nums.append(rich("span", null, [{ strong: fmt(fresh) }, " new or re-entry"]));
      if (!isBaseline(dropped)) nums.append(rich("span", null, [{ strong: fmt(dropped) }, " did not return"]));
      if (!isBaseline(perfect)) nums.append(rich("span", null, [{ strong: fmt(perfect) }, ` in all ${rung.sessionIndex}`]));
    }

    row.append(label, track, nums);
    ladder.append(row);
  }

  /* One shared reference line: session 1's attended count, drawn by the stylesheet
   * through every track at the same x from --bench, so the cliff is seen rather
   * than computed. It is arithmetic the tracks already use for their own widths. */
  const first = rungs.find((rung) => rung.sessionIndex === 1) || rungs[0];
  const benched = rungs.length > 1 && !!first && isNumber(first.attended) && first.attended > 0;
  ladder.classList.toggle("ladder--benched", benched);
  ladder.style.setProperty("--bench", benched ? String(round1(pct(first.attended, peak)) / 100) : "");
  const firstTrack = benched ? ladder.querySelector(".track") : null;
  if (firstTrack) {
    const mark = el("span", "ladder__benchmark", "Session 1 baseline");
    mark.setAttribute("aria-hidden", "true");
    firstTrack.append(mark);
  }

  const held = batch.sessionsHeld;
  const planned = batch.sessionsPlanned;
  const noteHost = mount("batch-note");
  if (noteHost) {
    noteHost.replaceChildren();
    if (isGhost(batch.peopleReached)) {
      const why = "The running count of everyone this batch has reached is not carried by this read.";
      reasons.push(why);
      noteHost.append(ghostSpan(why), document.createTextNode(" people reached - "));
    } else {
      noteHost.append(el("strong", null, fmt(batch.peopleReached)), document.createTextNode(" people reached - "));
    }
    noteHost.append(document.createTextNode(isGhost(planned)
      ? `${fmt(held)} session${held === 1 ? "" : "s"}${batch.running ? " so far" : ""}`
      : `${fmt(held)} of ${fmt(planned)} sessions${batch.running ? " so far" : ""}`));
    if (batch.campus && !isGhost(batch.campus)) {
      noteHost.append(document.createTextNode(` - ${CAMPUS_LABEL[batch.campus] || batch.campus}`));
    }
  }

  const insight = mount("batch-insight");
  if (insight) insight.textContent = batch.insight || "";

  const infoPop = state.root ? state.root.querySelector("#station-batch .info-pop") : null;
  if (infoPop) {
    let dyn = infoPop.querySelector(".info-pop__insight");
    if (batch.insight) {
      if (!dyn) {
        dyn = el("p", "info-pop__insight");
        infoPop.append(dyn);
      }
      dyn.textContent = batch.insight;
    } else if (dyn) {
      dyn.remove();
    }
  }

  renderLadderLegend(batch.courseSlug, benched);
  noteGhosts("station-batch", reasons);
}

/* The four numbers the track carries, as one sentence. People, never rooms. */
function ladderReading(rung) {
  const parts = [`Session ${rung.sessionIndex}`, `${fmt(rung.attended)} people attended`];
  if (isBaseline(rung.newOrReentry)) {
    parts.push("baseline, the first session has no previous session to compare against");
  } else {
    parts.push(`${fmt(rung.returnedFromPrevious)} returned from the previous session`);
    parts.push(`${fmt(rung.newOrReentry)} new or re-entry`);
    if (!isBaseline(rung.droppedSincePrevious)) parts.push(`${fmt(rung.droppedSincePrevious)} did not return`);
    if (!isBaseline(rung.perfectThroughSession)) parts.push(`${fmt(rung.perfectThroughSession)} have been in every session so far`);
  }
  return `${parts.join(". ")}.`;
}

/* The key repeats the mark's real form, in the order the marks appear, and carries
 * the batch's course hue itself: a legend swatch with no --c paints nothing. */
function renderLadderLegend(courseSlug, benched) {
  const legend = mount("ladder-legend");
  if (!legend) return;
  courseStyle(legend, courseSlug);
  legend.replaceChildren();
  const keys = [
    ["k1", "Returned from the previous session"],
    ["k2", "New or re-entry this session"],
    ["k3", "Did not return, drawn as absence and never as a bar"],
    ["k4", "In every session so far"],
  ];
  if (benched) keys.push(["k5", "Session 1 baseline, the same line through every rung"]);
  for (const [className, text] of keys) {
    const item = el("span");
    const swatch = el("i", className);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(text));
    legend.append(item);
  }
}

/* --------------------------------------------- chapter 3 completion shape -- */

function renderCompletion() {
  const completion = (state.view && state.view.completion) || {};
  if (renderUnavailable("completion-unavailable", completion.unavailable, "Completion shape")) {
    fill("completion-tiers");
    setText("completion-caption", "");
    setText("completion-note", "");
    return;
  }
  const tiers = Array.isArray(completion.tiers) ? completion.tiers : [];
  const batch = (state.view && state.view.batch) || {};
  const host = courseStyle(mount("completion-tiers"), batch.courseSlug);
  if (!host) return;
  host.replaceChildren();
  const reasons = [];

  for (const tier of tiers) {
    const row = el("div", tier.isTopTier ? "tier tier--top" : "tier");
    row.append(el("span", null, tier.label));
    const bar = el("div", "tier__bar");
    bar.tabIndex = 0;
    const fillBar = el("i");
    const hasShare = isNumber(tier.shareOfReach);
    fillBar.style.width = hasShare ? `${round1(tier.shareOfReach * 100)}%` : "0%";
    bar.append(fillBar);
    const val = el("span", "tier__val num", fmt(tier.people));
    if (hasShare) {
      val.append(el("small", null, written(tier.shareOfReach)));
      row.setAttribute("aria-label", `${tier.label}: ${fmt(tier.people)} people, ${written(tier.shareOfReach)} of the people this batch reached.`);
    } else {
      const why = "The share cannot be worked out without the count of people this batch reached, which this read does not carry.";
      reasons.push(why);
      const small = el("small");
      small.append(ghostSpan(why));
      val.append(small);
      row.setAttribute("aria-label", `${tier.label}: ${fmt(tier.people)} people, share not carried by Rock.`);
    }
    row.append(bar, val);
    host.append(row);
  }

  const noteHost = mount("completion-note");
  if (noteHost) {
    noteHost.replaceChildren();
    if (isGhost(completion.uniqueReach) || isBaseline(completion.uniqueReach)) {
      const why = "The count of everyone this batch reached is not carried by this read.";
      reasons.push(why);
      noteHost.append(ghostSpan(why), document.createTextNode(" people reached."));
    } else {
      noteHost.append(document.createTextNode(`${fmt(completion.uniqueReach)} people reached over ${fmt(completion.sessionsHeld)} session${completion.sessionsHeld === 1 ? "" : "s"}${completion.soFar ? " so far" : ""}.`));
    }
  }

  const caption = mount("completion-caption");
  if (caption) caption.textContent = "";

  const compInfoPop = state.root ? state.root.querySelector("#station-completion .info-pop") : null;
  if (compInfoPop) {
    let dyn = compInfoPop.querySelector(".info-pop__insight");
    if (completion.insight) {
      if (!dyn) {
        dyn = el("p", "info-pop__insight");
        compInfoPop.append(dyn);
      }
      dyn.textContent = completion.insight;
    } else if (dyn) {
      dyn.remove();
    }
  }
  noteGhosts("station-completion", reasons);
}

/* -------------------------------------------- chapter 4 the core pipelines -- */

function renderPipelines() {
  const pipelines = state.view && Array.isArray(state.view.pipelines) ? state.view.pipelines : [];
  const host = mount("pipelines");
  if (!host) return;
  host.replaceChildren();
  const reasons = [];
  const firstFailure = pipelines.find((pipeline) => pipeline && pipeline.unavailable);
  renderUnavailable("pipelines-unavailable", firstFailure ? firstFailure.unavailable : null, "A core pipeline");

  for (const pipeline of pipelines) {
    if (!pipeline || pipeline.unavailable) continue;
    const wrap = courseStyle(el("div", "pipe"), pipeline.courseSlug);
    const head = el("div", "pipe__head");
    const mark = courseStyle(el("span", "cm"), pipeline.courseSlug);
    if (pipeline.courseSlug) mark.style.background = `var(--course-${pipeline.courseSlug})`;
    mark.append(el("span", null, pipeline.label));
    const meta = el("span", "pipe__meta");
    meta.append(document.createTextNode(`${fmt(pipeline.openRequests)} open requests - `));
    if (pipeline.boardLink && pipeline.boardLink.href) {
      const link = el("a", null, `Open the ${pipeline.label} board`);
      link.href = pipeline.boardLink.href;
      meta.append(link);
    }
    head.append(mark, meta);

    const stages = el("div", "stages");
    for (const stage of Array.isArray(pipeline.stages) ? pipeline.stages : []) {
      const cell = el("div", isGhost(stage.count) ? "stage stage--ghost" : "stage");
      const big = el("b");
      if (isGhost(stage.count)) {
        const why = `${pipeline.label} has no ${stage.label} stage on its board, so there is no count to show. It is not a zero.`;
        reasons.push(why);
        big.append(ghostSpan(why));
      } else {
        big.classList.add("num");
        big.textContent = fmt(stage.count);
        const rule = el("i", "fill");
        rule.setAttribute("aria-hidden", "true");
        cell.append(rule);
      }
      cell.prepend(big);
      cell.append(el("small", null, stage.label));
      cell.tabIndex = 0;
      cell.setAttribute("aria-label", isGhost(stage.count)
        ? `${stage.label}: no count -- ${pipeline.label} has no ${stage.label} stage on its board.`
        : `${stage.label}: ${fmt(stage.count)}.`);
      stages.append(cell);
    }

    wrap.append(head, stages);
    if (pipeline.agreement) wrap.append(agreementBar(pipeline, reasons));
    host.append(wrap);
  }

  setText("pipelines-note", pipelines.length
    ? "Board occupancy today."
    : "No core pipeline in this slice.");
  noteGhosts("station-pipelines", reasons);
}

function agreementBar(pipeline, reasons) {
  const agreement = pipeline.agreement;
  const keys = [
    ["a1", agreement.agree, "board and stage group agree"],
    ["a2", agreement.groupAhead, "in a later stage group than the board"],
    ["a3", agreement.boardAhead, "further along the board than the group"],
    ["a4", agreement.onBoardNotInGroup, "on the board, not in a stage group"],
    ["a5", agreement.inGroupNotOnBoard, "in a stage group, no open request"],
  ];
  const total = keys.reduce((sum, [, count]) => sum + (isNumber(count) ? count : 0), 0);
  const wrap = el("div", "agree");
  const bar = el("div", "agree__bar");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${pipeline.label}: ${keys.map(([, count, word]) => `${isGhost(count) ? "not carried by Rock" : fmt(count)} ${word}`).join(", ")}.`);
  for (const [className, count] of keys) {
    if (!isNumber(count) || count <= 0) continue;
    const segment = el("i", className);
    segment.style.width = `${round1(pct(count, total))}%`;
    bar.append(segment);
  }
  const list = el("div", "agree__keys");
  for (const [, count, word] of keys) {
    if (isGhost(count)) {
      const why = `The ${word} count is not carried by the agreement read for ${pipeline.label}.`;
      reasons.push(why);
      list.append(rich("span", null, [ghostSpan(why), ` ${word}`]));
    } else {
      list.append(rich("span", null, [{ strong: fmt(count) }, ` ${word}`]));
    }
  }
  wrap.append(bar, list);
  return wrap;
}

/* ------------------------------------------------------ chapter 5 the bridge -- */

function renderBridge() {
  const bridge = (state.view && state.view.bridge) || {};
  if (renderUnavailable("bridge-unavailable", bridge.unavailable, "Graduation to next step")) {
    fill("bridge");
    setText("bridge-caption", "");
    setText("bridge-note", "");
    return;
  }
  const host = mount("bridge");
  if (!host) return;
  host.replaceChildren();
  const reasons = [];
  const nodes = [
    ["cm--build", "Build", bridge.buildGraduates, "graduates on record, all time", false],
    [null, "and", null, null, null],
    ["cm--dna", "Favor DNA", bridge.dnaGraduates, "graduates on record, all time", false],
    [null, "both", null, null, null],
    ["cm--ink", "Completed both", bridge.completedBoth, "people, the qualified base", true],
    [null, "next", null, null, null],
    ["cm--ink", "UPNext", bridge.upnextOpen, "open requests today", false],
  ];
  for (const [markClass, label, count, note, focus] of nodes) {
    if (!markClass) {
      host.append(el("div", "join", label));
      continue;
    }
    const node = el("div", focus ? "node node--focus" : "node");
    const mark = el("span", `cm ${markClass}`);
    mark.append(el("span", null, label));
    const big = el("b");
    if (isGhost(count) || isBaseline(count)) {
      const why = `${label} is not carried by the graduate census read.`;
      reasons.push(why);
      big.append(ghostSpan(why));
    } else {
      big.classList.add("num");
      big.textContent = fmt(count);
    }
    node.append(mark, big, el("small", null, note));
    host.append(node);
  }
  const caption = mount("bridge-caption");
  if (caption) caption.textContent = "";
  setText("bridge-note", "All-time graduates & current open requests.");
  noteGhosts("station-bridge", reasons);
}

/* ------------------------------------------ chapter 6 the course fingerprints -- */

function renderCourses() {
  const courses = state.view && Array.isArray(state.view.courses) ? state.view.courses : [];
  /* Every batch is read one at a time, so this chapter has no single read to
   * fail; a batch whose read failed simply does not appear in the array. */
  renderUnavailable("courses-unavailable", null, "Every course this season");
  const host = mount("courses-table");
  if (!host) return;
  host.replaceChildren();
  const reasons = [];

  /* Explicit table roles: on a narrow screen the stylesheet re-flows the rows into
   * one card per batch with display: block, which would otherwise drop the table
   * semantics a screen reader relies on. Each cell also names its column, so the
   * card reads "Started 118", not a bare figure. */
  const table = el("table", "fptable");
  table.setAttribute("role", "table");
  const head = el("thead");
  head.setAttribute("role", "rowgroup");
  const headRow = el("tr");
  headRow.setAttribute("role", "row");
  const COLUMNS = [
    ["Course", null], ["Sessions", null], ["Started", "n"], ["Finished all", "n"],
    ["Deepest drop", "n"], ["State", null], ["Why", null], ["Act", null],
  ];
  for (const [label, className] of COLUMNS) {
    const th = el("th", className, label);
    th.setAttribute("scope", "col");
    th.setAttribute("role", "columnheader");
    headRow.append(th);
  }
  head.append(headRow);

  const body = el("tbody");
  const ordered = [...courses].sort((left, right) => (
    (STATE_SEVERITY[right.state] || 0) - (STATE_SEVERITY[left.state] || 0)
    /* Then by the deepest drop. Drops are negative fractions, so the deepest is
     * the smallest number and it sorts first. */
    || (isNumber(left.deepestDrop) ? left.deepestDrop : 0) - (isNumber(right.deepestDrop) ? right.deepestDrop : 0)
  ));

  for (const course of ordered) {
    const row = el("tr");
    row.setAttribute("role", "row");
    const stateClass = STATE_CLASS[course.state];
    if (stateClass) row.dataset.state = stateClass.replace("chip--", "");

    /* The hue is a per-row chip beside the name, and the name is always written.
     * This is the one place on the page carrying more than two course hues, which
     * is exactly why the chip never travels without its label. */
    const nameCell = el("td", "course");
    const swatch = courseStyle(el("i", "huechip"), course.courseSlug);
    swatch.setAttribute("aria-hidden", "true");
    nameCell.append(swatch, document.createTextNode(course.courseLabel));
    nameCell.append(el("small", null, isGhost(course.batchLabel) ? "" : course.batchLabel || ""));

    const stripCell = el("td", "fpcell");
    const strip = courseStyle(el("div", "fp"), course.courseSlug);
    const bars = Array.isArray(course.sessionStrip) ? course.sessionStrip : [];
    const tallest = Math.max(1, ...bars.map((bar) => (isNumber(bar.attended) ? bar.attended : 0)));
    const reading = [];
    let hasGhostBar = false;
    for (const bar of bars) {
      const mark = el("i", bar.ghost ? "gh" : null);
      mark.style.height = bar.ghost ? "100%" : `${Math.max(6, round1(pct(bar.attended, tallest)))}%`;
      strip.append(mark);
      if (bar.ghost) hasGhostBar = true;
      reading.push(bar.ghost ? "a session with nothing recorded" : fmt(bar.attended));
    }
    if (hasGhostBar) {
      reasons.push(`A hollow bar in ${course.courseLabel} is a session Rock holds no attendance for, either because it has not happened yet or because it was recorded as not having happened. It is never a zero.`);
    }
    strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", `${course.courseLabel} by session: ${reading.join(", ")}.`);
    stripCell.append(strip);

    const startedCell = el("td", "n");
    if (isGhost(course.started)) {
      const why = `${course.courseLabel} has no first occurrence in Rock, so there is nobody counted as having started.`;
      reasons.push(why);
      startedCell.append(ghostSpan(why));
    } else startedCell.append(el("span", "num", fmt(course.started)));

    const finishedCell = el("td", "n");
    if (isGhost(course.finishedAll)) {
      const why = `${course.courseLabel} has no completion tiers to read yet, so how many finished every session is not known.`;
      reasons.push(why);
      finishedCell.append(ghostSpan(why));
    } else {
      /* Two quantities, two lanes: the count on its line, the share beneath it. */
      finishedCell.append(el("span", "num", fmt(course.finishedAll)));
      if (isNumber(course.finishedAllShare)) {
        finishedCell.append(el("small", null, `${written(course.finishedAllShare)} of reached`));
      }
    }

    const dropCell = el("td", "n");
    if (isGhost(course.deepestDrop) || isBaseline(course.deepestDrop)) {
      const why = `${course.courseLabel} has fewer than two sessions with attendance, so there is no drop to measure yet.`;
      reasons.push(why);
      dropCell.append(ghostSpan(why));
    } else {
      dropCell.append(el("span", "num", written(course.deepestDrop)));
      if (isNumber(course.deepestDropAtSession)) {
        dropCell.append(el("small", null, `at session ${course.deepestDropAtSession}`));
      }
    }

    const stateCell = el("td");
    stateCell.append(stateChip(course.state));

    const actCell = el("td", "act");
    if (course.act && course.act.href) {
      const link = el("a", null, course.act.label || "Open in Rock");
      link.href = course.act.href;
      actCell.append(link);
    }

    const cells = [nameCell, stripCell, startedCell, finishedCell, dropCell, stateCell,
      el("td", "why", course.why || ""), actCell];
    cells.forEach((cell, index) => {
      cell.setAttribute("role", "cell");
      cell.dataset.label = COLUMNS[index][0];
    });
    row.append(...cells);
    body.append(row);
  }

  body.setAttribute("role", "rowgroup");
  table.append(head, body);
  host.append(table);
  setText("courses-note", ordered.length
    ? `${ordered.length} batch${ordered.length === 1 ? "" : "es"} in this slice, worst state first.`
    : "No batch in this slice yet.");
  renderHealthInfo();
  noteGhosts("station-courses", reasons);
}

/* The cut points, named, behind the (i). No threshold on this page is hand-set:
 * they are re-derived from the completed batches on every read, so what the
 * reader sees behind the (i) is what actually decided the word. */
function renderHealthInfo() {
  const health = (state.view && state.view.health) || {};
  const host = mount("health-info");
  if (!host) return;
  const cuts = health.cuts || {};
  host.replaceChildren();
  host.append(el("p", null, "No threshold on this page is hand-set. Two rules decide the word: first-to-last retention, and the deepest single-session drop."));

  if (!health.derived) {
    host.append(el("p", null, `Fewer than ${fmt(cuts.MIN_BATCHES_TO_DERIVE ?? 4)} completed batches in this slice (${fmt(health.batchesUsed ?? 0)}), so no quartile is worth standing behind. Every batch reads "${SOURCE_STATE_WORDS.NOT_ENOUGH_HISTORY}", and none reads "${SOURCE_STATE_WORDS.HEALTHY}".`));
  } else {
    host.append(el("p", null, `Derived from ${fmt(health.batchesUsed ?? 0)} completed batches in this season and campus, and re-derived on every read.`));
    const list = el("ul");
    for (const [word, rule, cut] of [
      [SOURCE_STATE_WORDS.CRITICAL, "first-to-last retention below", cuts.RETENTION_CRITICAL],
      [SOURCE_STATE_WORDS.WATCH, "first-to-last retention below", cuts.RETENTION_WATCH],
      [SOURCE_STATE_WORDS.THIN, "deepest single-session drop at or beyond", cuts.CLIFF_THIN],
      [SOURCE_STATE_WORDS.WATCH, "deepest single-session drop at or beyond", cuts.CLIFF_WATCH],
    ]) {
      list.append(el("li", null, `${word}: ${rule} ${isNumber(cut) ? written(cut) : GHOST}.`));
    }
    list.append(el("li", null, `Nothing but "${SOURCE_STATE_WORDS.NOT_STARTED}" is said before ${fmt(cuts.MIN_SESSIONS_TO_JUDGE ?? 2)} sessions have been held.`));
    host.append(list);
  }
  host.append(el("p", null, `The six words are ${STATE_WORDS.join(", ")}. The word is the reading; colour only repeats it.`));
}

/* ---------------------------------------------------- chapter 7 colophon -- */

function renderColophon() {
  const colophon = (state.view && state.view.colophon) || {};
  const host = mount("colophon-body");
  if (!host) return;
  host.replaceChildren();
  for (const entry of Array.isArray(colophon.sourcesByChapter) ? colophon.sourcesByChapter : []) {
    const block = el("div");
    block.append(el("h3", null, entry.chapter));
    const list = el("ul");
    for (const source of entry.sources || []) list.append(el("li", null, source));
    block.append(list);
    host.append(block);
  }
  if (colophon.stepsSentence) host.append(el("p", null, colophon.stepsSentence));
  host.append(el("p", null, "Every count on this page is an aggregate. No person id, name, or contact value appears here, in an export, or in any address this page builds. Rock stays the record; this page only reads it."));
}

/* ----------------------------------------------------------- the sections -- */

/* One builder feeds both readings, so Creative and Classic can never disagree
 * about a number: they are two renderings of this one array. */
function buildSections() {
  const view = state.view;
  if (!view) {
    return CLASSIC_SECTIONS.map(([id, heading, kind]) => ({
      id, heading, title: heading, kind,
      unavailable: "The data island has not been read yet.",
    }));
  }

  const batch = view.batch || {};
  const completion = view.completion || {};
  const bridge = view.bridge || {};
  const season = view.season || {};
  const pipelines = Array.isArray(view.pipelines) ? view.pipelines : [];
  const courses = Array.isArray(view.courses) ? view.courses : [];

  /* A chapter that failed to read carries that failure into Classic verbatim,
   * with the query id, rather than becoming an empty table. */
  const orFailed = (source, id, heading, kind, extra) => (
    source && source.unavailable
      ? {
        id, heading, title: heading, kind,
        unavailable: `${source.unavailable.reason || "the read failed"} (query ${source.unavailable.queryId || "unknown"})`,
      }
      : { id, heading, title: heading, kind, ...extra }
  );

  const sections = [
    {
      id: "grow-kpis",
      heading: "Grow readings",
      title: "Grow readings",
      kind: "kpi",
      kpis: [
        { label: "People reached", value: batch.peopleReached },
        { label: "Sessions held", value: batch.sessionsHeld },
        { label: "Finished all", value: topTierOf(completion) },
        { label: "Build open", value: openOf(pipelines, "build") },
        { label: "Favor DNA open", value: openOf(pipelines, "favor-dna") },
        { label: "Build graduates", value: bridge.buildGraduates },
        { label: "Favor DNA graduates", value: bridge.dnaGraduates },
        { label: "Completed both", value: bridge.completedBoth },
        { label: "UPNext open", value: bridge.upnextOpen },
      ],
    },
    orFailed(batch, "grow-continuity", "Session continuity", "table", {
      columns: [
        { key: "session", label: "Session" },
        { key: "date", label: "Date" },
        { key: "attended", label: "Attended", kind: "number" },
        { key: "returned", label: "Returned from previous", kind: "number" },
        { key: "fresh", label: "New or re-entry", kind: "number" },
        { key: "dropped", label: "Did not return", kind: "number" },
        { key: "perfect", label: "In every session so far", kind: "number" },
      ],
      rows: (batch.rungs || []).map((rung) => ({
        session: `Session ${rung.sessionIndex}`,
        date: rung.dateLabel,
        attended: rung.attended,
        returned: rung.returnedFromPrevious,
        /* `baseline` travels as the word into the table, the clipboard and the
         * xlsx, because the shared formatter renders a null as an em dash and an
         * em dash is exactly the mark this surface never uses. */
        fresh: isBaseline(rung.newOrReentry) ? "baseline" : rung.newOrReentry,
        dropped: isBaseline(rung.droppedSincePrevious) ? "baseline" : rung.droppedSincePrevious,
        perfect: isBaseline(rung.perfectThroughSession) ? "baseline" : rung.perfectThroughSession,
      })),
      note: "Every number here is people, not rooms. Returned plus new is exactly what attended.",
    }),
    orFailed(completion, "grow-completion", "Completion shape", "table", {
      columns: [
        { key: "tier", label: "Sessions attended" },
        { key: "people", label: "People", kind: "number" },
        { key: "shareOfReach", label: "Share of people reached" },
      ],
      rows: (completion.tiers || []).map((tier) => ({
        tier: tier.label,
        people: tier.people,
        shareOfReach: isNumber(tier.shareOfReach) ? written(tier.shareOfReach) : GHOST,
      })),
      note: "One person counts once. Shares divide by the people this batch reached, never by attendance.",
    }),
    {
      id: "grow-scoreboard",
      heading: "Course scoreboard",
      title: "Course scoreboard",
      kind: "table",
      columns: [
        { key: "course", label: "Course", hue: "courseSlug" },
        { key: "batchLabel", label: "Batch" },
        { key: "started", label: "Started", kind: "number" },
        { key: "finishedAll", label: "Finished all", kind: "number" },
        { key: "deepestDrop", label: "Deepest drop" },
        { key: "growState", label: "State" },
        { key: "why", label: "Why" },
      ],
      rows: courses.map((course) => ({
        course: course.courseLabel,
        courseSlug: course.courseSlug,
        batchLabel: course.batchLabel,
        started: course.started,
        finishedAll: course.finishedAll,
        deepestDrop: isNumber(course.deepestDrop) ? written(course.deepestDrop) : GHOST,
        growState: course.state,
        why: course.why,
      })),
      note: "Sorted worst state first, then by deepest drop. The state word is the reading.",
    },
    {
      id: "grow-pipeline",
      heading: "Core pipelines",
      title: "Core pipelines",
      kind: "table",
      columns: [
        { key: "pipeline", label: "Pipeline" },
        { key: "stage", label: "Stage" },
        { key: "count", label: "Open requests at this stage", kind: "number" },
      ],
      rows: pipelines.flatMap((pipeline) => (pipeline.stages || []).map((stage) => ({
        pipeline: pipeline.label, stage: stage.label, count: stage.count,
      }))),
      note: "Board occupancy today. A stage a pipeline does not have reads ? and never 0.",
    },
    {
      id: "grow-agreement",
      heading: "Board and group agreement",
      title: "Board and group agreement",
      kind: "table",
      columns: [
        { key: "pipeline", label: "Pipeline" },
        { key: "agree", label: "Agree", kind: "number" },
        { key: "groupAhead", label: "Group ahead", kind: "number" },
        { key: "boardAhead", label: "Board ahead", kind: "number" },
        { key: "onBoardNotInGroup", label: "No stage group yet", kind: "number" },
        { key: "inGroupNotOnBoard", label: "No open request", kind: "number" },
      ],
      rows: pipelines.filter((pipeline) => pipeline.agreement).map((pipeline) => ({
        pipeline: pipeline.label, ...pipeline.agreement,
      })),
      note: "The two records are meant to agree. A gap is a workflow that did not finish, not a person who did not come.",
    },
    orFailed(bridge, "grow-bridge", "Graduation bridge", "table", {
      columns: [
        { key: "milestone", label: "Milestone" },
        { key: "people", label: "People", kind: "number" },
        { key: "grain", label: "Grain" },
      ],
      rows: [
        { milestone: "Build graduates", people: bridge.buildGraduates, grain: "All-time record on the person" },
        { milestone: "Favor DNA graduates", people: bridge.dnaGraduates, grain: "All-time record on the person" },
        { milestone: "Completed both", people: bridge.completedBoth, grain: "All-time record on the person" },
        { milestone: "UPNext open requests", people: bridge.upnextOpen, grain: "Today's board" },
      ],
      note: "Two grains, labelled on every row.",
    }),
    orFailed(season, "grow-season", "This season", "table", {
      columns: [
        { key: "date", label: "Date" },
        { key: "course", label: "Course" },
        { key: "session", label: "Session" },
        { key: "kind", label: "Kind" },
      ],
      rows: (season.cards || []).map((card) => ({
        date: card.dateLabel,
        course: card.courseLabel,
        session: isGhost(card.sessionsPlanned) || isBaseline(card.sessionsPlanned)
          ? String(card.sessionIndex)
          : `${card.sessionIndex} of ${card.sessionsPlanned}`,
        kind: card.kind || GHOST,
      })),
      note: "Rock is the only season source. A planned row is a date Rock holds no attendance occurrence for yet.",
    }),
  ];

  /* No section may ever carry a person-shaped column or value. This is asserted,
   * not remembered, because a section is exactly what the export rails and the
   * package serialise, and a person-shaped key would leave the page in a file. */
  for (const section of sections) assertAggregateSection(section);
  return sections;
}

/* The tiers arrive lowest first, so the people who finished everything are the
 * tier flagged isTopTier -- never tiers[0], which is the thinnest attendance. */
function topTierOf(completion) {
  const tiers = Array.isArray(completion.tiers) ? completion.tiers : [];
  const top = tiers.find((tier) => tier.isTopTier);
  return top ? top.people : GHOST;
}

function openOf(pipelines, slug) {
  const pipeline = pipelines.find((entry) => entry && entry.courseSlug === slug);
  return pipeline ? pipeline.openRequests : GHOST;
}

function sectionById(id) {
  return buildSections().find((section) => section.id === id) || null;
}

/* -------------------------------------------------------------- the view -- */

function filterValues() {
  const values = { mode: state.mode };
  /* Campus is always present, for the same reason it is always written into the
   * address: an absent campus is not "no filter", it is "the viewer's own". */
  values.campus = state.scope.campus || "ALL";
  if (state.scope.season) values.season = state.scope.season;
  if (state.scope.courseSlug && state.scope.courseSlug !== "all") values.course = state.scope.courseSlug;
  if (Number.isSafeInteger(state.scope.batchId)) values.batch = String(state.scope.batchId);
  return values;
}

/* The DashboardView contract: what the signed-in viewer is looking at right now,
 * composed client-side from live state. The only clock reading in this runtime
 * that is not the season rail's own `today` lives here, and only at export time. */
export function buildView() {
  return {
    surface: { ...SURFACE },
    mode: state.mode === "classic" ? "classic" : "creative",
    theme: (state.root && state.root.dataset.theme) || null,
    url: window.location.href,
    filters: filterValues(),
    filterSummary: filterSummary(),
    templateVersion: TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    fictional: Boolean(state.view && state.view.meta && state.view.meta.fictional),
    sections: buildSections(),
    controls: [...state.controls],
  };
}

/* ------------------------------------------------------------- classic -- */

function renderClassicGrid() {
  const host = mount("classic-mount");
  if (!host) return;
  const grid = el("div", "classic-grid");

  for (const section of buildSections()) {
    if (section.kind === "kpi") {
      const widget = classicWidget({
        id: `cw-${section.id}`,
        title: section.title,
        question: "What are the headline readings for this slice?",
        info: "Nine plain counts over the current slice, each one a count rather than a blended score. A reading Rock does not carry yet reads ? and says why; it is never a zero.",
      });
      widget.body.append(kpiStrip(section.kpis, { label: "Grow readings" }));
      mountRail(widget, section);
      grid.append(widget.root);
      continue;
    }
    const widget = classicWidget({
      id: `cw-${section.id}`,
      title: section.title,
      question: CLASSIC_QUESTION[section.id] || "",
      info: CLASSIC_INFO[section.id] || "",
    });
    const stack = el("div", "cw__stack");
    if (section.unavailable) {
      stack.append(classicUnavailable(section.unavailable));
    } else {
      stack.append(dataTable(section, { caption: section.note || null }));
      mountRail(widget, section);
      widget.body.classList.add("cw__body--table");
    }
    widget.body.append(stack);
    if (section.note) widget.setNote(section.note);
    grid.append(widget.root);
  }
  host.replaceChildren(grid);
}

const CLASSIC_QUESTION = {
  "grow-continuity": "Did the people in session 2 come from session 1?",
  "grow-completion": "How many people finished most or all of it?",
  "grow-scoreboard": "Which batches are holding, and which need a call?",
  "grow-pipeline": "Where are people on the two core boards?",
  "grow-agreement": "Do the board and the stage groups agree?",
  "grow-bridge": "How big is the base that has finished both?",
  "grow-season": "What is running now, and what opens next?",
};

const CLASSIC_INFO = {
  "grow-continuity": "Every number is people, never rooms: one person who checked in twice on one night counts once, which is why returned plus new is exactly what attended. Session 1 reads baseline in three columns because there is no previous session to compare it against, and baseline is not a zero.",
  "grow-completion": "One person counts once. The contrast with the continuity table is per-session against cumulative, not rooms against people: both count people. Shares divide by the people reached, never by attendance.",
  "grow-scoreboard": "Sorted worst state first, then by deepest drop. The six state words are the reading and are always written out. No threshold here is hand-set: the cut points are re-derived from the completed batches on every read.",
  "grow-pipeline": "Board occupancy today, never merged across the two pipelines: they are different journeys with different stages. A stage a pipeline does not have reads ? and never 0.",
  "grow-agreement": "The board and the stage groups are the two places the same workflows write the same fact, and they are meant to agree. A gap is a workflow that did not finish, not a person who did not come.",
  "grow-bridge": "Two grains, labelled on every row: the three graduate counts are all-time records on the person, the UPNext count is today's board.",
  "grow-season": "Rock is the only season source. A course with neither a schedule nor an occurrence gets a row that says so rather than a guessed date.",
};

function mountRail(widget, section) {
  if (!widget || !section || section.unavailable) return;
  mountExportRail(widget.railHost, {
    registry: exportRegistry,
    id: section.id,
    title: section.title || section.heading,
    table: () => sectionById(section.id),
  });
}

function packageSummaryTable() {
  const view = buildView();
  return {
    id: "grow-package",
    title: "Grow Continuity: package summary",
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
  mountCopyPrompt(host, { view: buildView, announce, align: "end" });
  exportRegistry.register(SURFACE.id, { title: SURFACE.title, table: packageSummaryTable });
  mountPackageControl(host, { surfaceId: SURFACE.id, align: "end" });
}

/* The console is a column beside the page on a wide screen and a sheet over it on
 * a narrow one. One flag drives both, and the flag lives on the layout rather
 * than in this module, so a reader who resizes never ends up with a sheet open
 * over a page that has room for the column. */
function bindSidebar() {
  const layout = mount("app-layout");
  const toggle = mount("btn-toggle-sidebar");
  const back = mount("btn-sidebar-back");
  const backdrop = mount("filter-backdrop");
  if (!layout) return;

  const set = (open) => {
    layout.dataset.console = open ? "open" : "closed";
    state.root.dataset.console = open ? "open" : "closed";
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (backdrop) backdrop.hidden = !(open && MOBILE.matches);
  };
  set(!MOBILE.matches);

  if (toggle) {
    toggle.addEventListener("click", () => {
      set(layout.dataset.console !== "open");
      announce(layout.dataset.console === "open" ? "Filter console open." : "Filter console closed.", { visible: false });
    });
  }
  if (back) back.addEventListener("click", () => set(false));
  if (backdrop) backdrop.addEventListener("click", () => set(false));
  MOBILE.addEventListener("change", (event) => set(!event.matches));
}

function ensureBindings() {
  if (state.classicBound || !state.root) return;
  state.classicBound = true;
  bindSidebar();
  bindExportDelegation(state.root, exportRegistry, {
    view: buildView,
    announce,
    package: () => buildDashboardPackage(buildView()),
  });
  bindInfoDismissal(state.root);
}

/* The palette sits where it sits on every executive surface: the shared sticky pill
 * at the foot of the page on a wide screen, and a row inside the console on a narrow
 * one.
 *
 * The pill is fixed to the viewport corner, so at 390px it floats over whatever the
 * page happens to have there -- on Grow that is the chapter index, which it covered.
 * Connect Field and Pathways both solve this by moving the swatch into the console as
 * its last row once the console becomes a sheet, and Grow now does the same thing
 * rather than a third thing.
 *
 * No prefs transport is wired. Without one the swatch keeps the reader's choice
 * to this page rather than writing it back to Rock, which is the right default
 * for a surface whose whole contract is that it only ever reads. */
function paletteHost() {
  if (!MOBILE.matches) return state.root;
  const sidebar = mount("filter-sidebar");
  if (!sidebar) return state.root;
  let slot = sidebar.querySelector(".palette-slot");
  if (!slot) {
    slot = el("fieldset", "filter-fieldset palette-slot");
    const legend = el("legend", "filter-legend");
    legend.append(el("span", null, "Palette"));
    legend.append(el("span", "sub", "how the page looks"));
    slot.append(legend);
    sidebar.append(slot);
  }
  return slot;
}

function mountPalette() {
  if (!state.root) return;
  const host = paletteHost();
  /* Remounting into the host it already has would tear the swatch down and rebuild it
   * on every render, losing focus mid-keyboard-navigation. */
  if (state.paletteHost === host) return;
  if (state.themeSwatch && state.themeSwatch.element) state.themeSwatch.element.remove();
  const stale = state.root.querySelector(".palette-slot");
  if (stale && host !== stale) stale.remove();
  state.paletteHost = host;
  state.themeSwatch = mountThemeSwatch(host, {
    root: state.root,
    surface: SURFACE.id,
    onChange: (theme) => {
      syncMulticolorAccent();
      announce(theme ? `${themeName(theme)} palette.` : "Default palette.");
    },
  });
}

/* ---------------------------------------------------------------- render -- */

function renderAll() {
  if (!state.root) return;
  state.root.dataset.mode = state.mode;
  buildSidebar();
  renderMasthead();
  /* Creative stations stay rendered in Classic mode; the stylesheet shows one
   * composition or the other, so a mode switch never tears a station down. */
  renderSeason();
  renderLadder();
  renderCompletion();
  renderPipelines();
  renderBridge();
  renderCourses();
  renderColophon();
  renderMastheadTools();
  renderClassicGrid();
  ensureBindings();
  syncMulticolorAccent();
}

/* ------------------------------------------------------------------ boot -- */

/* The adapter states that it never throws and always returns the full shape.
 * This wrapper exists anyway, because the alternative to a named read failure
 * here is a blank page with no reason on it, and that is the one outcome this
 * surface is built to make impossible. */
function safeBuild(options) {
  try {
    const view = buildGrowView(state.payload, { ...options, today: state.today });
    if (view && view.meta) return view;
    return failedRead("The Grow adapter returned nothing this page could read.");
  } catch (error) {
    return failedRead(`The Grow adapter could not read this payload: ${error && error.message ? error.message : "no reason given"}.`);
  }
}

function failedRead(reason) {
  const unavailable = { reason, queryId: "grow-source", kind: "MALFORMED" };
  return {
    meta: { fictional: false, scope: { campus: "ALL", season: "", courseSlug: "all", batchId: null }, stamps: {} },
    season: { cards: [], unavailable },
    batch: { rungs: [], unavailable },
    completion: { tiers: [], unavailable },
    pipelines: [],
    bridge: { unavailable },
    courses: [],
    health: { derived: false, batchesUsed: 0, cuts: {} },
    colophon: { sourcesByChapter: [], stepsSentence: "" },
  };
}

/**
 * Boot the Grow Continuity console into `root`, or into #grow-island when the
 * caller passes nothing.
 *
 * The sticky console sits under whatever fixed bar Rock renders above the
 * island. Measuring the host beats hard-coding a height that differs between the
 * workbench and production; the measurement is capped so a full-height overlay
 * can never collapse the console to nothing. Same shape as Connect Field's
 * `hostChromeOffset`/`applyHostChrome`. */
/* T6 -- content for the delegated tooltip. Each mark's own structure supplies the
 * label/value/comparison pieces where we have them; a mark with no richer shape
 * falls back to its own (or its nearest ancestor's) aria-label, which every mark
 * here already carries for screen readers. */
function growTipContent(trigger) {
  if (trigger.matches(".ev")) {
    return tooltipContent({
      label: trigger.querySelector(".ev__title")?.textContent || "",
      value: trigger.querySelector(".ev__date")?.textContent || "",
      comparison: trigger.querySelector(".ev__sub")?.textContent || "",
    });
  }
  if (trigger.matches(".nowcard")) {
    return tooltipContent({
      label: trigger.querySelector(".nowcard__eyebrow")?.textContent || "",
      value: trigger.querySelector(".nowcard__course")?.textContent || "",
      comparison: trigger.querySelector(".nowcard__detail")?.textContent || "",
    });
  }
  if (trigger.matches(".stage")) {
    return tooltipContent({
      label: trigger.querySelector("small")?.textContent || "",
      value: trigger.querySelector(".num")?.textContent || trigger.getAttribute("aria-label") || "",
    });
  }
  if (trigger.matches(".tier__bar")) {
    const row = trigger.closest(".tier");
    return tooltipContent({
      label: row ? row.textContent.split(/\d/)[0].trim() : "",
      value: row?.getAttribute("aria-label") || row?.querySelector(".tier__val")?.textContent || "",
    });
  }
  if (trigger.matches(".rung")) {
    return tooltipContent({
      label: trigger.querySelector(".rung__label")?.textContent || "",
      value: trigger.querySelector(".track")?.getAttribute("aria-label") || "",
    });
  }
  return tooltipContent({ label: trigger.getAttribute("aria-label") || trigger.getAttribute("title") || "" });
}

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

/*
 * `payload` is the parsed contents of the #grow-data island. When it is omitted
 * the island is read from the document; when it is missing, unparseable, or not
 * the shape the adapter accepts, every chapter renders a named read failure
 * rather than a zero.
 */
export async function boot(root, payload) {
  const host = root || document.getElementById("grow-island");
  if (!host) return;
  state.root = host;
  trackHostChrome(host);
  state.reducedMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  applyHostChrome();
  /* Rock's own fixed chrome can settle after first paint, so the sticky console
   * offset is measured again once the page is quiet and on every resize. */
  window.setTimeout(applyHostChrome, 400);
  window.addEventListener("resize", applyHostChrome, { passive: true });

  /* The season rail outlines today, so the runtime needs one clock reading. It
   * is taken once, here, and passed to the adapter rather than read again in any
   * chapter, so nothing on the page can be describing two different days.
   *
   * `data-today` pins that reading, and ONLY the development workbench sets it.
   * The fictional season has fixed dates while the wall clock does not, so
   * without a pin the workbench silently stops demonstrating "Running now" the
   * day the fictional season ends, and a screenshot taken after that date shows
   * an empty strip that says nothing about the code. The Rock wrapper never
   * emits this attribute, so production always reads the real clock. */
  const pinned = state.root && state.root.dataset ? state.root.dataset.today : null;
  state.today = /^\d{4}-\d{2}-\d{2}$/.test(pinned || "")
    ? pinned
    : new Date().toISOString().slice(0, 10);

  let supplied = payload;
  if (supplied === null || supplied === undefined) {
    try {
      const island = document.getElementById("grow-data");
      if (!island || island.type !== "application/json") throw new Error("the passive production data island is missing");
      supplied = JSON.parse(island.textContent);
    } catch {
      supplied = null;
    }
  }
  state.payload = supplied;

  /* The address as it arrived decides the mode; everything else is resolved by
   * the adapter from that same address, and adopted here rather than guessed. */
  state.mode = readUrlState(window.location.search, {}).mode === "classic" ? "classic" : "creative";
  rebuild(window.location.search);
  refreshDefaults();
  writeUrl();

  /* T6 -- one delegated tooltip layer for the whole island (#236, #252, same shape as
   * Connect Field and Exec Overview): every mark here is rebuilt on every filter change,
   * so a delegate from the root beats attaching per node and leaking listeners on
   * discarded ones. Covers the marks that carried only a native `title` before this:
   * the season rail (.ev), the batch ladder (.rung), the completion tiers (.tier__bar),
   * the pipeline stages (.stage) and the now-strip (.nowcard). Course tiles (T5) keep their
   * own bespoke .course-tile__name hover card instead -- it's grid-safe (never shifts the
   * 3-column layout the way a delegated bubble's own positioning could) and predates T6;
   * adding the delegate on top of it doubled the reveal on every tile. */
  mountTooltipDelegate(host, {
    surface: "grow",
    selector: ".ev, .nowcard, .stage, .tier__bar, .rung",
    content: growTipContent,
  });
  renderAll();
  mountPalette();
  // Executive Markup (#598): the pen sits on the lower left of the console, same shape as
  // TechStats and Connect Field.
  if (!state.markup) {
    state.markup = mountMarkup(host, {
      surface: { id: "grow", title: "Grow Continuity" },
      host,
      frame: host,
      context: () => ({ mode: state.mode, theme: host.dataset.theme || null, filterSummary: null, url: window.location.href, title: document.title }),
      announce,
    });
  }
  /* Crossing 768px moves the swatch between the sticky pill and the console row, the
   * same way Connect Field does it. Without this the reader who rotates a phone keeps
   * whichever host was resolved at boot. */
  MOBILE.addEventListener("change", mountPalette);
  /* mountPalette() resolves a seeded or stored theme choice synchronously
   * (dashboard-theme.mjs applyTheme), after renderAll() already ran the
   * first syncMulticolorAccent() against the pre-swatch default -- so the
   * restored theme needs one more pass to take effect on first paint. */
  syncMulticolorAccent();
}

/* Development router: the workbench sets data-manual-boot and calls boot() with
 * its own fictional payload. On the Rock page the block server-renders the shell
 * and the data island together, so the module boots itself the moment it loads. */
if (typeof document !== "undefined") {
  const host = document.getElementById("grow-island");
  if (host && host.dataset.manualBoot !== "true") boot(host);
}

export { URL_KEYS, STATE_WORDS, CLASSIC_SECTIONS, buildSections, readUrl, writeUrl };
