/* Leadership — the island (#600, slice C)
 * ===========================================================================================
 * Mounts into the People & Leaders shell (apps/people-shell/), and also stands alone in its own
 * dev harness. It exports the mountable contract and nothing else:
 *
 *     boot(root, bundle) -> Promise<void>
 *     teardown(root) -> void
 *
 * WHAT THIS FILE OWNS: the DOM, the console, the chapter composition, and the copy. Every number
 * it draws comes from leadership-source.mjs; there is no arithmetic here. If a figure on the page
 * cannot be traced to a function in the source module, the seam has been crossed.
 *
 * -------------------------------------------------------------------- the composition, and why
 *
 * The peg this is built from is twelve panels in a drag-to-reorder masonry grid. That is the
 * right set of CONTENT and the wrong SHAPE: a reader arriving at twelve peers has to work out
 * the reading order for themselves, every time, and the order was the author's best idea.
 *
 * So the same twelve readings are composed as FOUR CHAPTERS, each one a question, in the order
 * the questions actually hand off to each other:
 *
 *     1  Who carries responsibility?     the structure as it stands
 *     2  Where are we stretched?         the load on that structure
 *     3  Where are the gaps?             where it is thin or missing
 *     4  How many leaders must we raise? the one number to plan against
 *
 * The numbering is kept because the sequence carries information — chapter 4 is only meaningful
 * after chapter 3, and the copy refers back. Drag-to-reorder is dropped: it is per-browser state
 * nobody else sees, so two people reading "the dashboard" would be reading different pages.
 *
 * ------------------------------------------------------------------------------ the two hues
 *
 * Connect is BLUE (--secondary) and Ministry is ORANGE (--accent), everywhere, without exception.
 * The two ladders are the peg's spine and the whole surface depends on telling them apart at a
 * glance. Depth within a ladder is a lightness ramp off the branch hue, so a tier reads as "this
 * branch, that far up" rather than as its own colour.
 *
 * Load and shortage use the --state-* / --soft-* ramps and NEVER the branch hues. Identity and
 * polarity are different jobs; a stretched Connect cluster must not look like a Ministry team.
 */

import {
  adapt, rowsOf, bandIndex, bandsAvailable, teamsAvailable, sectionsAvailable,
  filterRoster, headline, ladder, besideLadder, connectByBand, leadersByContext,
  careStructure, ministryTeams, servingAreas, raiseChain, rosterPeople, buildView,
  applyCareLocal, applyMinistryLocal, paginate, PAGE_SIZES,
  normalizeFilters, serializeState, parseState, activeFilterCount, foldText, fuzzyMatch, distinctPeople,
  DEFAULT_FILTERS, CAMPUSES, BRANCHES, TIERS, CONNECT_LADDER, MINISTRY_LADDER, tierLabel,
} from "./leadership-source.mjs?v=20260922_793";
import { mountBreadcrumbs } from "./dashboard-breadcrumbs.mjs?v=20260922_793";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_793";
import { mountStatus, trackHostChrome } from "./dashboard-status.mjs?v=20260922_793";
import { preserveReservedKeys, themeName, UNAVAILABLE_MARK } from "./dashboard-view.mjs?v=20260922_793";
import { mountTooltipDelegate, tooltipContent } from "./dashboard-tooltip.mjs?v=20260922_793";
import { initialTheme, applyTheme, mountThemeSwatch } from "./dashboard-theme.mjs?v=20260922_793";
import { buildDashboardPackage, mountCopyPrompt, mountPackageControl } from "./dashboard-prompt.mjs?v=20260922_793";
import {
  bindExportDelegation, createExportRegistry, mountExportRail,
} from "./dashboard-export.mjs?v=20260922_793";
import { mountSectionNav } from "./dashboard-sectionnav.mjs?v=20260922_793";
import { mountZoom } from "./dashboard-zoom.mjs?v=20260922_793";
import { mountBoundedList } from "./bounded-legend.mjs?v=20260922_793";
import {
  arcChart, kpiStrip, modeSwitch, setClassicTooltipRoot, unavailablePanel,
} from "./classic-widgets.mjs?v=20260922_793";

const DASH = UNAVAILABLE_MARK;

/* Why Creative is disabled entirely (#638) rather than merely defaulted away: prod held the
 * whole surface under construction for this exact reason (see `holdingSurface` below), and the
 * operator's ruling was that Classic — Pas. John's Manila peg composition — ships as the one
 * reading, with Creative's five-chapter narrative kept as a named, cited follow-up rather than a
 * second live reading nobody asked for. `docs/plans/2026-09-18-leadership-creative-redesign-deferred.md`
 * is where that follow-up is scoped; it is written by a parallel effort and referenced rather
 * than duplicated here. */
const CREATIVE_DISABLED_REASON =
  "Creative is a planned follow-up. Classic ships first, because it is the reading our leaders "
  + "already know.";

const state = {
  root: null,
  bundle: null,
  adapted: null,
  areas: null,
  filters: { ...DEFAULT_FILTERS },
  markup: null,
  mode: "classic",
  status: null,
  tooltip: null,
  swatch: null,
  paletteHost: null,
  breakpointBound: false,
  exports: null,
  view: null,
  listeners: [],
  hashTimer: null,
  /* Shell furniture (#767, #768). Presentation only: neither holds a reading, a filter or a
   * byte that survives the page. */
  sectionNav: null,
  zoom: null,
  mountGeneration: 0,
  abortController: null,
  chromeStop: null,
};

/* ------------------------------------------------------------------------------- DOM helpers */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/* An SVG element. `el()` above cannot make one: createElement puts the node in the HTML
 * namespace, where an <svg><text> is parsed but never painted. */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  state.listeners.push([target, type, handler, options]);
}

const fmt = (n) => (n === null || n === undefined || !Number.isFinite(n) ? DASH : n.toLocaleString());
const fmt1 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? DASH : n.toFixed(1));

/* ------------------------------------------------------------------------------ the readout --
 * Every data mark on this page carries its reading as data attributes, and ONE delegated
 * listener turns them into the shared tooltip. Delegation rather than per-node attachment is
 * the only workable shape here: the whole page is rebuilt on every filter change, so a
 * per-node listener would either leak on discarded nodes or miss ones created after mount.
 *
 * The gesture is the suite's, not this island's: hover or focus opens, the pointer leaving
 * closes after the shared grace, a click PINS, and a second click, Escape, or a click elsewhere
 * releases. `dashboard-tooltip.mjs` implements all of it; this island supplies content and
 * never a variant. The pin is also the touch equivalent, because a finger has no hover and
 * covers what it points at.
 *
 * The bubble is SUPPLEMENTARY. Every value it carries is already drawn beside its mark, because
 * a reader must never have to hover to learn a number (DESIGN.md). What the bubble adds is the
 * thing that does not fit on the row: the caveat, the denominator, the reason a figure is
 * unknown. */
function tip(node, { label, value, comparison = null, unit = null, swatch = null } = {}) {
  node.dataset.tip = "1";
  /* A mark whose own click filters the page declines the pin: the tap's action IS the touch
   * equivalent, and pinning as well would leave a bubble anchored to a node the re-render has
   * already discarded. A mark that only reads -- a table cell carrying a caveat -- keeps it. */
  if (node.tagName === "BUTTON") node.dataset.tipPin = "off";
  node.dataset.tipLabel = label == null ? "" : String(label);
  node.dataset.tipValue = value == null ? "" : String(value);
  if (comparison) node.dataset.tipCompare = String(comparison);
  if (unit) node.dataset.tipUnit = String(unit);
  if (swatch) node.dataset.tipSwatch = String(swatch);
  return node;
}

/* PROSE NEVER OCCUPIES LAYOUT (DESIGN.md, standing rule 2026-09-10). Every explainer, legend,
 * caption clause and colophon on this surface lives behind a small `(i)` mark placed on the
 * thing it explains, opened by hover, focus or tap through the one shared readout, and closed
 * by Escape. The bubble is `fixed`, so the copy costs nothing at any viewport.
 *
 * The peg's "How to read" line is kept as CONTENT and dropped as LAYOUT. It is still the best
 * idea in the peg, and it is still on every panel: it is simply behind the mark now, which is
 * where a wall of words in front of a graphic belongs.
 *
 * THE ONE EXCEPTION IS AN ABSENCE. "Unavailable", a refused read, a section with no rows: those
 * stay in the layout where they cannot be missed, because an unavailable page must never look
 * like an empty church (ADR 0018). A reader must never have to hover to find out something is
 * missing. `ghost()` below is that exception and the only one. */
function infoMark(text, label) {
  const mark = el("button", "info-tip");
  mark.type = "button";
  mark.setAttribute("aria-label", label);
  const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  glyph.setAttribute("viewBox", "0 0 16 16");
  glyph.setAttribute("aria-hidden", "true");
  glyph.setAttribute("focusable", "false");
  for (const [tag, attrs] of [
    ["circle", { cx: 8, cy: 8, r: 7 }],
    ["line", { x1: 8, y1: 7, x2: 8, y2: 11.4 }],
    ["circle", { class: "dotcap", cx: 8, cy: 4.7, r: 0.4 }],
  ]) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    glyph.append(node);
  }
  mark.append(glyph);
  tip(mark, { label, value: null, comparison: text });
  return mark;
}

/* An absence that keeps its place in the layout and says why (ADR 0018). It is never a zero,
 * never an empty panel, and never hidden behind a hover. */
function ghost(reason) {
  const box = el("div", "lead-ghost");
  box.setAttribute("role", "note");
  box.append(el("span", "lead-ghost__mark", DASH), el("p", "lead-ghost__why", reason));
  return box;
}

/* PENDING is not UNAVAILABLE (#764). markPanelBodiesPending() sweeps every `.lead-panel__body`
 * and `.kpi-tile__value` into a skeleton the instant a deferred fetch starts, but the two
 * headline-level fallbacks in renderClassic() write directly into `.lead-main`'s KPI strip,
 * outside either selector, so they must carry their own honest pending state rather than
 * borrow unavailablePanel()'s "this is absent" copy while the read is merely in flight. */
function pendingNotice(headline) {
  const box = el("div", "lead-ghost lead-ghost--pending");
  box.setAttribute("role", "status");
  box.append(el("span", "lead-ghost__mark", DASH));
  const why = el("p", "lead-ghost__why", headline ? `${headline} · Reading the leadership structure…` : "Reading the leadership structure…");
  box.append(why);
  return box;
}

/* A panel is a heading, its PROVENANCE, its HOW-TO-READ, a rail, and its marks.
 *
 * The last two are the layers this surface was missing against the peg, and they are not
 * decoration -- they are the two questions a reader asks of any number they are about to act on:
 *
 *   WHERE IS THIS FROM? The peg stamps every panel `ROCK · 2 SEP 2026, 10AM` because it is a
 *   snapshot and the age of the figure is part of the figure. Ours is read live on page render,
 *   which is a stronger claim, so the chip says so rather than printing a timestamp the bundle
 *   does not carry (there is no per-query `generatedAt`; inventing one would be the worst of
 *   both). On the fictional harness it says FIXTURE, because a demo number must never be able to
 *   pass for a real one.
 *
 *   HOW DO I READ IT? Behind the `(i)` on the panel's title, in the same bubble every other
 *   reading on this surface uses. It was briefly printed in the layout, the way the peg prints
 *   it, and fourteen panels each carrying a three-line paragraph of guidance pushed the marks
 *   themselves down the page -- the reader paid for the explanation on every visit after the
 *   first, having read it once. Prose never occupies layout (DESIGN.md, standing rule
 *   2026-09-10); the one exception is an absence, which `ghost()` owns. The sentence is
 *   unchanged, and it is now on the title it explains rather than between the title and the
 *   marks. */
/* HOW OLD IS WHAT I AM LOOKING AT (operator request, 2026-09-21).
 *
 * This chip used to say "Rock · live" and promise, in its own tooltip, that "what you are
 * reading is what Rock holds right now". That has not been true since the aggregate reads
 * were memoised for ten minutes: four of this tab's six reads are served from a cache, so
 * the figure beside this chip can have been computed some minutes before the page opened.
 * The claim was the strongest one on the surface and the least accurate.
 *
 * It now states the age of the OLDEST read behind the bundle, because the page is only as
 * fresh as its stalest panel and an overstated freshness claim is the one a reader acts on.
 * `readAt` is written inside the Lava cache block, so it is when the entry was FILLED, not
 * when it was served. A bundle without it renders `?` rather than a guess (ADR 0018). */
function readAgeWords(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

function provenanceChip() {
  const live = state.adapted && state.adapted.mode === "live";
  const pending = Boolean(state.adapted && state.adapted.pending && !state.bundle);
  const age = live && state.bundle ? readAgeWords(state.bundle.readAt) : null;
  const chip = el("span", `lead-asof${pending ? " lead-asof--pending" : live ? " lead-asof--live" : " lead-asof--fixture"}`,
    pending ? "Pending" : live ? `Rock \u00b7 ${age || "?"}` : "Sample");
  tip(chip, {
    label: pending ? "Live reading pending" : live ? "Read from Rock" : "Sample data",
    value: pending
      ? "The Leadership readings have not settled yet."
      : live ? (age ? `Computed ${age}` : "When this was computed is unknown") : "Not real numbers",
    comparison: pending
      ? "This panel is ready to use while its Rock readings arrive. Pending is not unavailable."
      : live
        ? "Most readings here are held for ten minutes after they are computed, so everyone who opens the page in that window gets the same answer instead of each reader waiting for it to be worked out again. This is how long ago the oldest reading on the page was actually computed. The readings that name a person are never held, so those are always current. Reload to work them all out again."
        : "This is a practice copy of the dashboard. Every name and number here is made up, so none of it should be quoted or acted on.",
  });
  return chip;
}

function panel(title, { wide = false, info = null, exportId = null } = {}) {
  const section = el("section", `lead-panel${wide ? " lead-panel--wide" : ""}`);
  const head = el("div", "lead-panel__head");
  const heading = el("h3", "lead-panel__title", title);
  head.append(heading);
  /* The how-to sits ON the title, not under it: it explains this panel, so it belongs to the
   * panel's name rather than floating above the marks as a second paragraph. */
  if (info) head.append(infoMark(info, `How to read ${title}`));
  head.append(provenanceChip());
  const rail = el("div", "lead-panel__rail");
  head.append(rail);
  section.append(head);
  const body = el("div", "lead-panel__body");
  section.append(body);
  if (exportId) {
    mountExportRail(rail, {
      id: exportId,
      registry: state.exports,
      title,
      table: () => sectionById(exportId),
    });
  }
  return { section, body, head, rail };
}

/* The export rail reads the live view, so an artifact carries exactly the rows on screen. */
function sectionById(id) {
  const view = state.view;
  const found = view && Array.isArray(view.sections) ? view.sections.find((s) => s.id === id) : null;
  if (!found) throw new Error("That reading is not available to export right now.");
  return found;
}

function chapter(number, question, lede) {
  const section = el("section", "lead-chapter");
  section.id = `lead-chapter-${number}`;
  const head = el("header", "lead-chapter__head");
  const heading = el("h2", "lead-chapter__title");
  heading.append(el("span", "lead-chapter__no", String(number)), document.createTextNode(question));
  if (lede) heading.append(infoMark(lede, `About ${question}`));
  head.append(heading);
  section.append(head);
  const body = el("div", "lead-chapter__body");
  section.append(body);
  return { section, body };
}

/* --------------------------------------------------------------------------------- the marks */

/* A horizontal bar row. `tone` picks the ramp: a branch hue for identity, a state hue for
 * polarity. The value is always drawn as text beside the bar as well — a reader must never have
 * to measure a bar to read a number. */
function barRow(label, value, max, { tone = "connect", sub = null, onSelect = null, selected = false } = {}) {
  const row = el(onSelect ? "button" : "div", `lead-bar${selected ? " is-selected" : ""}`);
  if (onSelect) { row.type = "button"; on(row, "click", onSelect); }
  row.dataset.tone = tone;
  /* THE PEG'S BAR, not a labelled progress track. Three columns on one line -- the label
   * right-aligned against the bar, the bar itself, the value just past its end -- so a column
   * of bars reads as a ranked chart the eye can scan down, which is the whole job of the mark.
   *
   * What this replaces put the label and the value on a line ABOVE a full-width track, so every
   * bar started at the same x and ran the panel's whole width at a few pixels tall: the "thin
   * lines" reading. A bar's LENGTH is the comparison, and length is only comparable when every
   * bar shares a baseline and a scale. The value still prints as text beside it, because a
   * number is never left to a width alone (DESIGN.md). */
  row.append(el("span", "lead-bar__label", label));
  const track = el("div", "lead-bar__track");
  const fill = el("div", "lead-bar__fill");
  const width = max > 0 && Number.isFinite(value) ? Math.max(1.5, (value / max) * 100) : 0;
  fill.style.width = `${width}%`;
  if (!Number.isFinite(value)) fill.dataset.unknown = "true";
  track.append(fill);
  row.append(track);
  row.append(el("span", "lead-bar__value", fmt(value)));
  if (sub) row.append(el("span", "lead-bar__sub", sub));
  tip(row, {
    label,
    value: Number.isFinite(value) ? `${fmt(value)} ${value === 1 ? "person" : "people"}` : "Not available",
    comparison: sub,
    unit: max > 0 && Number.isFinite(value) ? `${Math.round((value / max) * 100)}% of the largest here` : null,
    swatch: tone === "ministry" ? "--accent" : tone === "critical" ? "--state-critical"
      : tone === "thin" ? "--state-thin" : "--secondary",
  });
  return row;
}

/* The ladder, drawn as a pyramid. Order is LOCKED to the ladder and is never sorted by
 * magnitude: the shape is the reading, and re-sorting it would destroy the only thing it says.
 * A tier with nobody on it still draws its rung — an empty rung is the most important thing this
 * mark can show. */
function pyramid(rungs, branch, onSelect) {
  const wrap = el("div", "lead-pyramid");
  wrap.dataset.branch = branch;
  const max = Math.max(1, ...rungs.map((r) => r.people));
  /* Top rung first, so the pyramid reads the way a hierarchy is drawn. */
  for (const rung of [...rungs].reverse()) {
    const item = el("button", `lead-rung${rung.bench ? " lead-rung--bench" : ""}${state.filters.tier === rung.tier ? " is-selected" : ""}`);
    item.type = "button";
    item.dataset.branch = branch;
    item.setAttribute("aria-pressed", String(state.filters.tier === rung.tier));
    on(item, "click", () => onSelect(rung.tier));

    const bar = el("span", "lead-rung__bar");
    bar.style.width = `${Math.max(8, (rung.people / max) * 100)}%`;
    if (rung.people === 0) bar.dataset.empty = "true";
    item.append(bar);

    const text = el("span", "lead-rung__text");
    text.append(el("span", "lead-rung__label", rung.label), el("span", "lead-rung__value", fmt(rung.people)));
    item.append(text);
    if (rung.bench) item.append(el("span", "lead-rung__tag", "bench, not appointed"));
    /* The tier notes are the sharpest content on this page — that Captain is not flagged
     * IsLeader, that Section Overseer has no role in Rock at all. They were on `title`, which
     * is unreachable by keyboard and by touch and unstyled everywhere. They belong in the
     * shared bubble, which all three can open. */
    tip(item, {
      label: rung.label,
      value: `${fmt(rung.people)} ${rung.people === 1 ? "person" : "people"}`,
      comparison: rung.note,
      unit: rung.bench ? "Bench. Not counted in the totals above." : null,
      swatch: branch === "ministry" ? "--accent" : "--secondary",
    });
    wrap.append(item);
  }
  return wrap;
}

/* A sortable table. Sorting is a presentation choice a reader makes, so it lives here and never
 * changes what the numbers mean. */
function table(columns, rows, { sortKey = null, onSort = null, onRow = null, caption = null } = {}) {
  const wrap = el("div", "lead-table");
  const node = el("table");
  if (caption) {
    const cap = el("caption", "lead-table__caption", caption);
    node.append(cap);
  }
  const thead = el("thead");
  const tr = el("tr");
  for (const column of columns) {
    const th = el("th");
    th.scope = "col";
    if (column.numeric) th.dataset.numeric = "true";
    if (onSort && column.key) {
      const button = el("button", "lead-sort", column.label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(sortKey === column.key));
      if (sortKey === column.key) button.dataset.active = "true";
      on(button, "click", () => onSort(column.key));
      th.append(button);
    } else {
      th.textContent = column.label;
    }
    if (column.title) th.title = column.title;
    tr.append(th);
  }
  thead.append(tr);
  node.append(thead);
  const tbody = el("tbody");
  for (const row of rows) {
    const line = el("tr");
    if (row.tone) line.dataset.tone = row.tone;
    if (onRow && row.selectValue !== undefined) {
      line.tabIndex = 0;
      line.dataset.selectable = "true";
      on(line, "click", () => onRow(row.selectValue));
      on(line, "keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRow(row.selectValue); }
      });
    }
    row.cells.forEach((cell, index) => {
      const td = el("td");
      if (columns[index] && columns[index].numeric) td.dataset.numeric = "true";
      if (cell && typeof cell === "object" && cell.node) td.append(cell.node);
      else td.textContent = cell === null || cell === undefined ? DASH : String(cell);
      /* A cell's caveat goes through the shared bubble rather than `title`, which no keyboard
       * or touch reader can reach and which no design system styles. */
      if (cell && typeof cell === "object" && cell.title) {
        tip(td, { label: columns[index] ? columns[index].label : "", value: cell.title });
      }
      line.append(td);
    });
    tbody.append(line);
  }
  node.append(tbody);
  wrap.append(node);
  if (!rows.length) wrap.append(ghost("Nothing matches the current filters. Clear one to widen the reading."));
  return wrap;
}

/* --------------------------------------------------------------------------------- the state */

function setFilters(patch, { announce = null } = {}) {
  state.filters = normalizeFilters({ ...state.filters, ...patch });
  writeHash();
  render();
  if (state.status && announce) state.status.announce(announce);
}

function writeHash() {
  const params = new URLSearchParams();
  serializeState(state.filters, params);
  /* Mode rides in the same fragment as the filters, alongside them rather than folded into
   * `normalizeFilters` — it changes which COMPOSITION renders, not which rows are counted, so it
   * does not belong to the filter contract `leadership-source.mjs` owns. Only a non-default
   * value is written, matching every other key `serializeState` already handles this way. */
  if (state.mode && state.mode !== "classic") params.set("mode", state.mode); else params.delete("mode");
  /* The shell owns `tab` and this island must never drop it. `writeHash` rebuilds the hash from
   * scratch, so without this the reader's first filter change would silently return them to the
   * default tab. With no shell present the call is a no-op (ADR 0022). */
  preserveReservedKeys(params);
  const text = params.toString();
  history.replaceState(null, "", text ? `#${text}` : "#");
}

function readHash() {
  const params = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  state.filters = parseState(params);
  /* `query` still rides the URL so a found page can be sent to someone, but it is the FIND's
   * term now rather than a filter -- it marks matches and never hides a row. */
  find.term = state.filters.query || "";
  /* Creative is disabled (#638): a pasted or bookmarked link asking for it still resolves to
   * Classic, the same way a stale `tier` for a branch no longer offered would. It never 404s and
   * it never silently renders the disabled reading. */
  state.mode = params.get("mode") === "creative" ? "classic" : "classic";
}

/* ------------------------------------------------------------------------------- the console */

const MOBILE = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(max-width: 1100px)")
  : { matches: false, addEventListener: null };

function field(label, control, { hint = null } = {}) {
  const wrap = el("div", "lead-field");
  const id = `lead-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  control.id = id;
  const labelNode = el("label", "lead-field__label", label);
  labelNode.htmlFor = id;
  wrap.append(labelNode, control);
  if (hint) wrap.append(el("span", "lead-field__hint", hint));
  return wrap;
}

function select(options, value, onChange) {
  const node = el("select", "lead-select");
  for (const option of options) {
    const item = el("option", null, option.label);
    item.value = option.value;
    if (String(option.value) === String(value)) item.selected = true;
    node.append(item);
  }
  on(node, "change", () => onChange(node.value));
  return node;
}

/* A FIELDSET IN THE CONSOLE, the same shape Grow uses: a legend that names the thing being
 * narrowed and, beside it, the one word that says what narrowing it does. The pair is the
 * explanation, so the console needs no prose of its own. */
function fieldset(title, sub, children, { modifier = null } = {}) {
  const box = el("fieldset", `filter-fieldset${modifier ? ` ${modifier}` : ""}`);
  const legend = el("legend", "filter-legend");
  legend.append(el("span", null, title));
  if (sub) legend.append(el("span", "sub", sub));
  box.append(legend);
  for (const child of children) if (child) box.append(child);
  return box;
}

/* TILES, NOT DROPDOWNS. A select hides every option but one, so a reader cannot see what the
 * choices are, how many there are, or which are unavailable, and each change costs open, hunt,
 * choose. A tile grid shows the whole vocabulary at once and answers in one press. A select
 * earns its place only where the list is genuinely long and unmemorable, which on this surface
 * is the cluster list and the team list. */
function tiles(items, { columns = 2, ariaLabel = null } = {}) {
  const grid = el("div", `lead-tiles lead-tiles--${columns}`);
  if (ariaLabel) { grid.setAttribute("role", "group"); grid.setAttribute("aria-label", ariaLabel); }
  /* The meter is scaled against the LARGEST option in its own group, not against the total.
   * These are facet counts -- what you would get if you pressed this -- and what a reader is
   * comparing is one option against its siblings. Against a total, a group whose options all sit
   * near a third of the page would draw three near-identical stubs and say nothing. */
  const peak = Math.max(0, ...items.map((i) => (Number.isFinite(i.count) ? i.count : 0)));
  for (const item of items) {
    const btn = el("button", `lead-tile${item.tone ? ` lead-tile--${item.tone}` : ""}`);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(Boolean(item.selected)));
    const top = el("span", "lead-tile__top");
    top.append(el("span", "lead-tile__label", item.label));
    if (item.count !== undefined && item.count !== null) {
      top.append(el("span", "lead-tile__count", Number.isFinite(item.count) ? fmt(item.count) : DASH));
    }
    btn.append(top);
    /* THE WEIGHT OF EACH CHOICE, before it is made. A console that lists twelve tiers and says
     * nothing about them makes a reader press each one to find the three that hold anybody, and
     * the nine empty presses all look like the page is broken. The meter answers first. */
    if (item.count !== undefined && item.count !== null) {
      const meter = el("span", "lead-tile__meter");
      const fill = el("span", "lead-tile__fill");
      const share = peak > 0 && Number.isFinite(item.count) ? item.count / peak : 0;
      fill.style.transform = `scaleX(${Math.max(item.count > 0 ? 0.02 : 0, share).toFixed(4)})`;
      meter.append(fill);
      btn.append(meter);
      /* An option that would empty the page says so in the layout rather than only in a number:
       * it stays pressable, because pressing it and seeing the ghost is a legitimate reading. */
      if (item.count === 0) btn.dataset.empty = "true";
    }
    if (item.title) btn.title = item.title;
    on(btn, "click", item.onSelect);
    grid.append(btn);
  }
  return grid;
}

/* The dedicated Leadership console: one sticky column, the same 320px width and the same
 * furniture every other Executive surface uses (Grow is the reference implementation).
 * Controls are grouped by the thing they narrow, because the grouping IS the explanation. */
function buildConsole() {
  const aside = el("aside", "filter-sidebar lead-console");
  aside.id = "lead-filter-sidebar";
  aside.setAttribute("role", "region");
  aside.setAttribute("aria-label", "Leadership filters");

  /* THE MODE SWITCH LIVES HERE, not in the masthead (#638). Display mode is a filter-console
   * control on every other surface in this repo -- Pathways appends it to `#filter-sidebar`
   * before the head, and Connect Field and Grow do the same -- because switching reading is the
   * same KIND of act as narrowing the rows, and both must survive the other. Leadership drew it
   * up beside Copy AI prompt, which put a reading control in the row of export affordances and
   * made this surface the only one where the switch was somewhere else. */
  aside.append(mountModeSwitch());

  const head = el("div", "sidebar-head");
  const back = el("button", "sidebar-back-btn", "Back");
  back.type = "button";
  back.id = "btn-sidebar-back";
  back.setAttribute("aria-label", "Close console");
  back.prepend(el("span", "back-arrow", "\u2190"));
  on(back, "click", () => closeConsole());
  head.append(back);
  head.append(el("h2", null, "Console"));
  const active = activeFilterCount(state.filters);
  head.append(el("span", "active-summary-pill", active ? `${active} active` : "All"));
  /* RESET SITS IN THE HEAD, opposite the count it clears, which is where Pathways, Connect Field
   * and Grow all keep it. It was a full-width primary button at the top of the console body --
   * the loudest control in the console, above every filter, for the one action a reader takes
   * least often and never first. Here it is a quiet text button that reads as the counterpart of
   * the pill beside it: "3 active" on the left, the way to make that zero on the right. */
  const reset = el("button", "reset-btn", "Reset all");
  reset.type = "button";
  reset.title = "Clears every filter. Campus stays, because it sets the scope of the whole page rather than filtering inside it.";
  on(reset, "click", () => setFilters({ ...DEFAULT_FILTERS, campus: state.filters.campus }, { announce: "Filters cleared" }));
  head.append(reset);
  aside.append(head);

  const body = el("form", "filter-form lead-console__body");
  body.setAttribute("role", "search");
  body.setAttribute("aria-label", "Leadership filters");
  on(body, "submit", (event) => event.preventDefault());
  aside.append(body);

  const bands = bandsAvailable(state.adapted);
  /* Offered in the roster's own order of frequency? No -- a fixed order, so the control does not
   * reshuffle under the reader every time a filter changes what is in view. */
  const genders = ["women", "men", "unknown"]
    .filter((g) => (rowsOf(state.adapted, "people-leader-roster") || []).some((row) => row.gender === g));
  const teams = teamsAvailable(state.adapted);
  const sections = sectionsAvailable(state.adapted);

  /* SEARCH LEADS, and it searches the whole dashboard: every chapter, every table, and every
   * name, not one table's column. It is the fastest way to a specific person or team, so it is
   * the first thing in the console rather than the last. */
  const search = el("input", "lead-input lead-search");
  search.type = "search";
  search.id = "lead-search";
  search.value = find.term;
  search.placeholder = "Name, team, cluster or section";
  search.setAttribute("aria-label", "Find on this page");
  const runFind = debounce(() => { applyFind(); state.filters.query = find.term; writeHash(); }, 180);
  on(search, "input", () => { find.term = search.value; runFind(); });
  /* Enter walks the matches, which is what Enter does in every find a reader has ever used.
   * Shift+Enter walks them backwards and Escape gives the page back. */
  on(search, "keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); gotoFind(event.shiftKey ? -1 : 1); return; }
    if (event.key === "Escape") { event.preventDefault(); search.value = ""; find.term = ""; applyFind(); state.filters.query = ""; writeHash(); }
  });

  const findBar = el("div", "lead-find-bar");
  const count = el("span", "lead-find-count");
  const nav = el("div", "lead-find-nav");
  const prev = el("button", "lead-find-btn", "Prev");
  prev.type = "button";
  prev.setAttribute("aria-label", "Previous match");
  on(prev, "click", () => gotoFind(-1));
  const next = el("button", "lead-find-btn", "Next");
  next.type = "button";
  next.setAttribute("aria-label", "Next match");
  on(next, "click", () => gotoFind(1));
  nav.append(prev, next);
  findBar.append(count, nav);
  body.append(fieldset("Search", "find on this page", [search, findBar]));

  /* WHAT EACH OPTION WOULD GIVE YOU. Every count below is the roster filtered by the CURRENT
   * state with this one dimension swapped for the option being drawn -- a facet count, the same
   * question the reader is about to ask by pressing it. It is deliberately not "how many rows
   * carry this value in the whole roster", which would promise a number the other filters then
   * take away. Thirteen passes over a few hundred rows, once per console build. */
  const rosterAll = rowsOf(state.adapted, "people-leader-roster") || [];
  const bandOf = bandIndex(state.adapted);
  const facet = (patch) => (rosterAll.length
    ? distinctPeople(filterRoster(rosterAll, { ...state.filters, ...patch }, { bandOf })).size
    : null);

  body.append(fieldset("Campus", "scope", [tiles(
    CAMPUSES.map((c) => ({
      label: c.id,
      title: c.label,
      count: facet({ campus: c.id }),
      selected: state.filters.campus === c.id,
      onSelect: () => setFilters({ campus: c.id }, { announce: `Campus: ${c.label}` }),
    })),
    { columns: 4, ariaLabel: "Campus" },
  )]));

  body.append(fieldset("Branch", "which structure", [tiles(
    [{ value: "", label: "Both" },
     ...Object.entries(BRANCHES).map(([id, b]) => ({ value: id, label: b.label, tone: id }))]
      .map((item) => ({
        label: item.label,
        tone: item.tone,
        count: facet({ branch: item.value, tier: "" }),
        selected: state.filters.branch === item.value,
        onSelect: () => setFilters({ branch: item.value, tier: "" }, {
          announce: item.value ? `Branch: ${item.label}` : "Both branches",
        }),
      })),
    { columns: 3, ariaLabel: "Branch" },
  )]));

  const tierIds = [...CONNECT_LADDER, "lay-pastor", ...MINISTRY_LADDER]
    .filter((tier) => !state.filters.branch || TIERS[tier].branch === state.filters.branch || tier === "lay-pastor");
  body.append(fieldset("Tier", "rung on the ladder", [tiles(
    [{ value: "", label: "Every tier" },
     ...tierIds.map((tier) => ({ value: tier, label: tierLabel(tier), tone: TIERS[tier].branch }))]
      .map((item) => ({
        label: item.label,
        tone: item.tone,
        count: facet({ tier: item.value }),
        selected: state.filters.tier === item.value,
        onSelect: () => setFilters({ tier: item.value }, {
          announce: item.value ? `Tier: ${item.label}` : "Every tier",
        }),
      })),
    { columns: 2, ariaLabel: "Tier" },
  )]));

  if (bands.length) {
    body.append(fieldset("Age group", "from the group, not the leader", [tiles(
      [{ value: "", label: "All ages" }, ...bands.map((b) => ({ value: b, label: b }))]
        .map((item) => ({
          label: item.label,
          count: facet({ groupAge: item.value }),
          selected: state.filters.groupAge === item.value,
          onSelect: () => setFilters({ groupAge: item.value }, {
            announce: item.value ? `Age group: ${item.label}` : "All ages",
          }),
        })),
      { columns: 2, ariaLabel: "Age group" },
    )]));
  }

  /* Gender. A three-value vocabulary, so tiles rather than a menu, same as Branch above. The
   * gender donut is clickable and this is the control that click writes to, so a reader who
   * clicked a wedge can see WHERE the page got narrowed and clear it from the same place. */
  if (genders.length) {
    body.append(fieldset("Gender", "as recorded in Rock", [tiles(
      [{ value: "", label: "Any gender" }, ...genders.map((g) => ({ value: g, label: GENDER_LABELS[g] || g }))]
        .map((item) => ({
          label: item.label,
          selected: state.filters.gender === item.value,
          onSelect: () => setFilters({ gender: item.value }, {
            announce: item.value ? `Gender: ${item.label}` : "Any gender",
          }),
        })),
      { columns: 3, ariaLabel: "Gender" },
    )]));
  }

  /* The two long lists stay selects, and that is the whole exception: sixty-nine clusters and
   * fifty-odd teams are a list to search, not a vocabulary to see. */
  body.append(fieldset("Cluster and team", "long lists, so these stay menus", [
    field("Cluster", select(
      [{ value: "", label: "Every cluster" }, ...sections.map((sec) => ({ value: sec.ref, label: sec.label }))],
      state.filters.section,
      (value) => setFilters({ section: value })
    )),
    field("Team", select(
      [{ value: "", label: "Every team" }, ...teams.map((t) => ({ value: t, label: t }))],
      state.filters.team,
      (value) => setFilters({ team: value })
    )),
  ]));

  /* `Reading` holds the two controls that change what a number MEANS rather than which rows are
   * counted, and they are separated for exactly that reason. */
  const scope = el("button", "toggle-btn lead-scope");
  scope.type = "button";
  scope.setAttribute("aria-pressed", String(state.filters.allRoles));
  scope.append(
    el("span", "lead-scope__state", state.filters.allRoles ? "All roles of matching leaders" : "Only matching roles"),
    el("span", "lead-scope__why", state.filters.allRoles
      ? "Showing everything these people carry."
      : "Showing only the roles that match.")
  );
  on(scope, "click", () => setFilters({ allRoles: !state.filters.allRoles }, {
    announce: state.filters.allRoles ? "Showing only matching roles" : "Showing all roles of matching leaders",
  }));

  const size = el("input", "lead-input lead-input--number");
  size.type = "number";
  size.min = "4"; size.max = "30"; size.step = "1";
  size.value = String(state.filters.groupSize);
  on(size, "change", () => setFilters({ groupSize: size.value }, { announce: `Target group size: ${size.value}` }));

  body.append(fieldset("Reading", "what the numbers mean", [
    field("Scope", scope),
    field("People per group", size, { hint: "Chapter 4's one assumption." }),
  ]));

  /* ON MOBILE THE PALETTE IS THE CONSOLE'S LAST ROW, never a floating object (ADR 0020, mobile
   * bottom-edge guide §7). On desktop it is the quiet pill at the lower left of the page, where
   * every other Executive surface keeps it: a preference set once does not belong above filters
   * a reader changes constantly. */
  if (MOBILE.matches) {
    const palette = el("fieldset", "filter-fieldset palette-slot");
    const legend = el("legend", "filter-legend");
    legend.append(el("span", null, "Palette"));
    legend.append(el("span", "sub", "how the board looks"));
    palette.append(legend);
    body.append(palette);
  }

  return aside;
}

/* The swatch is mounted once and re-hosted when the breakpoint changes: on desktop it sits at
 * the foot of the console column, on mobile it is the sheet's last row. Re-mounting it on every
 * render would drop the reader's focus mid-choice. */
function paletteHost() {
  if (!MOBILE.matches) return state.root;
  return state.root.querySelector(".palette-slot") || state.root;
}

function mountPalette() {
  const slot = paletteHost();
  if (!slot || state.paletteHost === slot) return;
  if (state.swatch && state.swatch.element) state.swatch.element.remove();
  // The console is rebuilt on every render, so a slot from the previous breakpoint can still be
  // in the tree. Remove it rather than leaving an empty Palette heading behind.
  const stale = state.root.querySelector(".palette-slot");
  if (stale && stale !== slot) stale.remove();
  state.paletteHost = slot;
  state.swatch = mountThemeSwatch(slot, {
    root: state.root,
    surface: "leadership",
    onChange: (theme) => state.status && state.status.announce(`Palette: ${themeName(theme)}`),
  });
  mountPen(slot);
}

/* THE PEN, beside the palette (#598). Leadership was the only live Executive surface without it:
 * every other one lets a reader draw on the page and save the board, and this one asked them to
 * screenshot it. Lazy by construction -- the drawing app is fetched from the shared asset root
 * the first time the pen is pressed, so a reader who never draws never parses any of it.
 *
 * `frame` is the island root, which is what gets frozen into the snapshot: the reading, without
 * the host's chrome around it. The context line travels with a saved board so it can say what
 * was on screen when it was drawn -- which mode, which palette, which filters, which URL --
 * because a marked-up chart with no idea what it was filtered to is a chart nobody can act on. */
function mountPen(host) {
  if (state.markup) { state.markup.remount(host); return; }
  state.markup = mountMarkup(state.root, {
    surface: { id: "leadership", title: "Leadership" },
    host,
    frame: state.root,
    context: () => ({
      mode: state.root?.dataset?.mode || null,
      theme: state.root?.dataset?.theme || null,
      filterSummary: filterSummary(),
      url: window.location.href,
      title: document.title,
    }),
    announce: (message) => state.status && state.status.announce(message),
  });
}

/* What the console's chips say, as one line, for a saved board's caption. */
function filterSummary() {
  const f = state.filters;
  const parts = [];
  if (f.campus && f.campus !== "ALL") parts.push(f.campus);
  if (f.branch) parts.push(BRANCHES[f.branch] ? BRANCHES[f.branch].label : f.branch);
  if (f.tier) parts.push(tierLabel(f.tier));
  if (f.groupAge) parts.push(f.groupAge);
  if (f.gender) parts.push(GENDER_LABELS[f.gender] || f.gender);
  if (f.team) parts.push(f.team);
  return parts.length ? parts.join(" \u00b7 ") : "All leaders on this campus";
}

function chips() {
  const wrap = el("div", "lead-chips");
  const active = [];
  const f = state.filters;
  if (f.branch) active.push(["Branch", BRANCHES[f.branch].label, () => setFilters({ branch: "", tier: "" })]);
  if (f.tier) active.push(["Tier", tierLabel(f.tier), () => setFilters({ tier: "" })]);
  if (f.groupAge) active.push(["Age group", f.groupAge, () => setFilters({ groupAge: "" })]);
  if (f.gender) active.push(["Gender", GENDER_LABELS[f.gender] || f.gender, () => setFilters({ gender: "" })]);
  if (f.team) active.push(["Team", f.team, () => setFilters({ team: "" })]);
  if (f.section) {
    const found = sectionsAvailable(state.adapted).find((s) => s.ref === String(f.section));
    active.push(["Cluster", found ? found.label : f.section, () => setFilters({ section: "" })]);
  }
  /* No Search chip: the chips are the things currently HIDING rows, and a find hides nothing.
   * Its own count and its Prev/Next live in the console beside the box that set it. */
  if (!f.allRoles) active.push(["Scope", "Only matching roles", () => setFilters({ allRoles: true })]);

  if (!active.length) {
    wrap.append(el("span", "lead-chips__empty", "No filters. Showing every leader on this campus."));
    return wrap;
  }
  for (const [label, value, clear] of active) {
    const chip = el("span", "lead-chip");
    chip.append(el("span", "lead-chip__label", label), el("span", "lead-chip__value", value));
    const remove = el("button", "filter-tag__remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Clear ${label} filter`);
    on(remove, "click", clear);
    chip.append(remove);
    wrap.append(chip);
  }
  return wrap;
}

/* ============================================================== FIND, NOT FILTER =============
 *
 * The console's search box promised "the whole dashboard" and delivered one panel: `query` was
 * read by `rowMatches`, which is roster grain, so typing a team name changed the roster and left
 * the other thirteen panels exactly as they were. A reader types, sees the page not move, and
 * concludes search is broken. It was not broken, it was answering a different question.
 *
 * It finds now. Every match on the rendered page is marked where it stands, the console says how
 * many there are, and Prev/Next walk them. Nothing is hidden, which is the point: a match in a
 * panel the reader was not thinking about is the most useful thing a search on a page like this
 * can produce, and a filter would have thrown it away.
 *
 * Marking does NOT re-render. The console is rebuilt on every render, so a search that rendered
 * took the focus out of the box the reader was still typing in -- which is the other half of why
 * it felt useless. Marking walks text nodes and splits them in place. */
const find = { term: "", marks: [], index: -1 };

const FIND_SKIP = "script, style, mark.lead-find, .lead-console, .console-toggle-bar, .lead-chip-host";

function clearFind() {
  if (!state.root) return;
  for (const mark of [...state.root.querySelectorAll("mark.lead-find")]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    /* normalize() stitches the three pieces splitText left behind back into one text node, so a
     * second search sees the original string rather than a run of fragments a term could fall
     * across and never match. */
    parent.normalize();
  }
  find.marks = [];
  find.index = -1;
}

function applyFind() {
  clearFind();
  const host = state.root && state.root.querySelector(".lead-main");
  const term = foldText(find.term).trim();
  if (!host || term.length < 2) { paintFindCount(); return; }

  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(FIND_SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  /* Collected first, THEN split. Splitting a text node while the walker is standing on it makes
   * the walker's own idea of the tree disagree with the document. */
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (let node of targets) {
    let at = foldText(node.nodeValue).indexOf(term);
    while (at >= 0) {
      const hit = node.splitText(at);
      const rest = hit.splitText(term.length);
      const mark = document.createElement("mark");
      mark.className = "lead-find";
      hit.parentNode.replaceChild(mark, hit);
      mark.append(hit);
      find.marks.push(mark);
      node = rest;
      at = foldText(node.nodeValue).indexOf(term);
    }
  }
  if (find.marks.length) { find.index = 0; find.marks[0].classList.add("is-current"); }
  paintFindCount();
}

/* The count is written straight into the console rather than through a render, for the same
 * reason the marking is: a render would take the focus out of the box. */
function paintFindCount() {
  if (!state.root) return;
  const out = state.root.querySelector(".lead-find-count");
  const nav = state.root.querySelectorAll(".lead-find-nav button");
  const total = find.marks.length;
  if (out) {
    out.textContent = !find.term.trim() ? "Type to search this page"
      : foldText(find.term).trim().length < 2 ? "Keep typing"
      : total === 0 ? "No matches on this page"
      : `${find.index + 1} of ${total}`;
    out.dataset.empty = String(!!find.term.trim() && total === 0);
  }
  for (const button of nav) button.disabled = total === 0;
}

function gotoFind(step) {
  if (!find.marks.length) return;
  const previous = find.marks[find.index];
  if (previous) previous.classList.remove("is-current");
  find.index = (find.index + step + find.marks.length) % find.marks.length;
  const target = find.marks[find.index];
  target.classList.add("is-current");
  /* Scrolled to clear the host's fixed chrome AND this surface's own sticky handle, because a
   * match parked under Rock's header is a match the reader cannot see. */
  const chrome = parseFloat(getComputedStyle(state.root).getPropertyValue("--console-top")) || 16;
  const top = window.scrollY + target.getBoundingClientRect().top - chrome - 72;
  window.scrollTo({ top: Math.max(0, top), behavior: state.reducedMotion ? "auto" : "smooth" });
  paintFindCount();
  if (state.status) state.status.announce(`Match ${find.index + 1} of ${find.marks.length}`);
}

/* One timer, so a fast typist pays for one pass over the page rather than one per keystroke. */
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, wait);
  };
}

function openConsole() {
  state.root.dataset.console = "open";
  const toggle = state.root.querySelector(".console-toggle-bar .toggle-btn");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  const backdrop = state.root.querySelector(".filter-backdrop");
  if (backdrop) backdrop.hidden = false;
  const first = state.root.querySelector(".lead-console select, .lead-console input");
  if (first) first.focus();
}

function closeConsole() {
  state.root.dataset.console = "closed";
  const toggle = state.root.querySelector(".console-toggle-bar .toggle-btn");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  const backdrop = state.root.querySelector(".filter-backdrop");
  if (backdrop) backdrop.hidden = true;
  if (toggle) toggle.focus();
}

/* --------------------------------------------------------------------------- the chapters --- */

function renderHeadline(host, rows) {
  const counts = headline(state.adapted, rows);
  const box = el("div", "lead-headline");

  if (!counts) {
    box.append(ghost(
      state.adapted.unavailable["people-leader-roster"]
      || "The roster came back at its row limit, so these counts could be short. They are withheld rather than shown low, because every other number on this page is read against them."
    ));
    host.append(box);
    return;
  }

  /* Value and label stay visible; the explainer goes behind the tile's own mark. A quiet KPI
   * shows its number without a pointer and keeps its prose off the layout (DESIGN.md). */
  const tiles = [
    ["Leaders in view", counts.leaders, "all", "Distinct people. Someone leading three Connect Groups is one leader. Captain counts here, and Potential Captain does not, because Potential Captain is bench rather than an appointment."],
    ["Connect", counts.connect, "connect", "People carrying pastoral care in the group structure, at any tier from Connect Leader up to Section Overseer."],
    ["Ministry", counts.ministry, "ministry", "People carrying a serving team, at any tier from Captain up to Overall Head."],
    ["Lead in both", counts.both, "both", "The people this church leans on twice. They hold responsibility in the care structure and on a serving team at the same time."],
    ["Ministry only", counts.ministryOnly, "ministry", "Serving leaders with no Connect responsibility. They lead a team, and nobody in the care structure is theirs."],
  ];
  for (const [label, value, tone, why] of tiles) {
    const tile = el("div", "lead-kpi");
    tile.dataset.tone = tone;
    const top = el("div", "lead-kpi__top");
    top.append(el("span", "lead-kpi__label", label), infoMark(why, `About ${label}`));
    tile.append(el("span", "lead-kpi__value", fmt(value)));
    tile.append(top);
    box.append(tile);
  }
  host.append(box);
}

/* CREATIVE, HELD (#638). The four chapters below (renderChapterOne..Four) and renderHeadline /
 * renderRoster's chapter framing are the Creative narrative this surface shipped as a beta with.
 * Classic — Pas. John's Manila peg composition, in renderClassic() further down — is what ships
 * now; this code stays in the file, unreachable while `state.mode` can never resolve to
 * "creative", because the redesign scoped in
 * docs/plans/2026-09-18-leadership-creative-redesign-deferred.md starts FROM this shape rather
 * than from nothing. Do not delete it and do not wire it back up without reading that plan. */
function renderChapterOne(host, rows) {
  const { section, body } = chapter(1, "Who carries responsibility?",
    "Favor organises people two ways and this page keeps them apart throughout. Connect is the pastoral care structure; Ministry is the serving structure. The same person often appears in both.");

  const connect = ladder(rows, "connect");
  const ministry = ladder(rows, "ministry");
  const beside = besideLadder(rows);

  const ladders = el("div", "lead-ladders");
  for (const [branch, rungs] of [["connect", connect], ["ministry", ministry]]) {
    const card = el("div", "lead-ladder");
    card.dataset.branch = branch;
    const branchTitle = el("h3", "lead-ladder__title", BRANCHES[branch].label);
    branchTitle.append(infoMark(BRANCHES[branch].description, `About ${BRANCHES[branch].label}`));
    card.append(branchTitle);
    card.append(pyramid(rungs, branch, (tier) =>
      setFilters({ tier: state.filters.tier === tier ? "" : tier, branch },
        { announce: state.filters.tier === tier ? "Every tier" : `Tier: ${tierLabel(tier)}` })));
    if (branch === "connect") {
      /* Lay Pastor is drawn BESIDE the ladder, never as a rung on it. The two were conflated
       * because the peg shows five Section Overseers and Rock holds five Lay Pastors; they are
       * different group types, different roles, and no one on prod holds both. Drawing it as a
       * rung would assert a hierarchy that does not exist. */
      const aside = el("div", "lead-ladder__beside");
      aside.append(el("span", "lead-ladder__beside-value", fmt(beside.people)));
      const asideLabel = el("span", "lead-ladder__beside-label", beside.label);
      asideLabel.append(infoMark(
        "Beside the Connect ladder rather than on it. Lay Pastor is a role on a different group "
        + "type, and nobody in Rock holds both this and Section Overseer. Drawing it as a rung "
        + "would assert a hierarchy that does not exist.",
        "About Lay Pastor"));
      aside.append(asideLabel);
      card.append(aside);
    }
    ladders.append(card);
  }

  const ladderPanel = panel("The two ladders", { wide: true,
    info: "Read the shape of each pyramid. A wide base with a thin middle is the usual warning sign, because it means the layer that should be carrying the leaders is missing. Click a rung to filter the whole page to it. Captain counts as a leader here. Rock does not flag the role as one, so every query on this page resolves it by role Guid instead, and without that all Captains would be invisible. Potential Captain is drawn as bench and left out of the totals above." });
  ladderPanel.body.append(ladders);
  body.append(ladderPanel.section);

  /* Connect roles across age bands. */
  const bands = connectByBand(rows, bandIndex(state.adapted));
  const bandPanel = panel("Connect roles across age groups", { wide: true,
    info: "Read across a band to see how deep its tree goes. Many Connect Leaders and few Regional Leaders means there is no middle layer, so that band's Cluster Head is carrying everyone directly. Age comes from the group, not the leader." });
  if (!bands.length) {
    bandPanel.body.append(ghost("No Connect roles match the current filters."));
  } else {
    const max = Math.max(1, ...bands.map((b) => b.total));
    for (const band of bands) {
      const row = el("div", "lead-bandrow");
      const head = el("div", "lead-bandrow__head");
      head.append(el("span", "lead-bandrow__label", band.band), el("span", "lead-bandrow__total", fmt(band.total)));
      row.append(head);
      const stack = el("div", "lead-stack");
      stack.style.width = `${Math.max(6, (band.total / max) * 100)}%`;
      for (const tier of band.tiers) {
        if (!tier.people) continue;
        const seg = el("button", "lead-stack__seg");
        seg.type = "button";
        seg.dataset.tier = tier.tier;
        seg.style.flexGrow = String(tier.people);
        seg.setAttribute("aria-label", `${tier.label}: ${fmt(tier.people)} in ${band.band}`);
        tip(seg, {
          label: tier.label,
          value: `${fmt(tier.people)} in ${band.band}`,
          comparison: `${Math.round((tier.people / band.total) * 100)}% of this band's Connect leadership`,
        });
        on(seg, "click", () => setFilters({ tier: tier.tier, branch: "connect", groupAge: band.band }));
        stack.append(seg);
      }
      row.append(stack);
      const legend = el("p", "lead-bandrow__legend",
        band.tiers.filter((t) => t.people).map((t) => `${t.label} ${t.people}`).join(" · ") || "No leaders in this band");
      row.append(legend);
      bandPanel.body.append(row);
    }
  }
  body.append(bandPanel.section);

  /* Leaders per team and per cluster, side by side — the pairing chapter 2 depends on.
   * Bounded rather than hard-cut (#765/#766): every team/cluster stays reachable through
   * "Show all (N)" instead of the list silently stopping at 14. */
  const perTeam = leadersByContext(rows, "ministry");
  const teamPanel = panel("Leaders per ministry team", {
    info: "This is leadership headcount, not volunteer headcount. Read it against the thin teams in chapter 3, because a team can have plenty of leaders and no volunteers, or the reverse." });
  if (!perTeam.length) teamPanel.body.append(ghost("No ministry teams match the current filters."));
  else {
    const max = Math.max(...perTeam.map((t) => t.people));
    for (const team of perTeam) {
      teamPanel.body.append(barRow(team.label, team.people, max, {
        tone: "ministry",
        selected: state.filters.team === team.label,
        onSelect: () => setFilters({ team: state.filters.team === team.label ? "" : team.label }),
      }));
    }
    mountBoundedList(teamPanel.body, { defaultCount: 10 });
  }
  body.append(teamPanel.section);

  const perCluster = leadersByContext(rows.filter((r) => r.tier === "cluster" || r.tier === "regional"), "connect");
  const clusterPanel = panel("Leaders per cluster", {
    info: "Pair this with span of care in chapter 2. Many leaders and few people means over-led, and the reverse means stretched. Neither is visible from this panel on its own." });
  if (!perCluster.length) clusterPanel.body.append(ghost("No clusters match the current filters."));
  else {
    const max = Math.max(...perCluster.map((c) => c.people));
    for (const cluster of perCluster) {
      clusterPanel.body.append(barRow(cluster.label, cluster.people, max, { tone: "connect" }));
    }
    mountBoundedList(clusterPanel.body, { defaultCount: 10 });
  }
  body.append(clusterPanel.section);

  host.append(section);
}

function renderChapterTwo(host) {
  const { section, body } = chapter(2, "Where are we stretched?",
    "The structure from chapter 1, with the load on it. The number that matters is not how many leaders a cluster has. It is how many people each of those leaders is carrying.");

  const care = careStructure(state.adapted, state.filters);
  const carePanel = panel("Pastoral care structure", { wide: true, exportId: "leadership-care",
    info: "One row per section of the Connect tree. The load is people underneath divided by Connect Leaders, and it is the number that says who is carrying most. A load shown as a dash means there are people underneath and no Connect Leader at all, which is a different problem from a high number. People underneath sums active membership across every leaf group beneath the section. Two caveats travel with it and they push in opposite directions: someone in two of a leader's groups is counted twice, and people not yet on any roster are not counted at all. The smaller figure beside each number is the same population counted once." });

  if (!care) {
    carePanel.body.append(ghost(state.adapted.unavailable["people-leader-span-of-care"] || "This reading is unavailable."));
  } else {
    const rows = care.map((row) => ({
      selectValue: row.ref,
      tone: row.load === null ? "critical" : row.load >= 20 ? "thin" : row.load >= 12 ? "watch" : "healthy",
      cells: [
        row.label,
        row.tierLabel,
        row.band,
        row.connectLeaders,
        row.leafGroups,
        { node: (() => {
            const wrap = el("span", "lead-people");
            wrap.append(el("span", "lead-people__n", fmt(row.people)));
            if (row.doubleCounted > 0) {
              wrap.append(el("span", "lead-people__caveat", `${fmt(row.distinctPeople)} distinct`));
            }
            return wrap;
          })(),
          title: `${fmt(row.people)} memberships across ${fmt(row.leafGroups)} groups; ${fmt(row.distinctPeople)} distinct people. The gap is people who belong to two of this section's groups.` },
        { node: (() => {
            const cell = el("span", "lead-load");
            cell.textContent = row.load === null ? DASH : fmt1(row.load);
            if (row.load === null) {
              tip(cell, {
                label: "Load",
                value: "Not available",
                comparison: "There are people underneath this section and no Connect Leader to divide by.",
                unit: "An undefined load, not a load of zero.",
              });
            } else {
              tip(cell, {
                label: "Load",
                value: `${fmt1(row.load)} people per Connect Leader`,
                comparison: `${fmt(row.people)} underneath ÷ ${fmt(row.connectLeaders)} leaders`,
              });
            }
            return cell;
          })() },
      ],
    }));
    carePanel.body.append(table(
      [
        { label: "Section", key: null },
        { label: "Tier", key: null },
        { label: "Age group", key: null },
        { label: "Connect Leaders", numeric: true },
        { label: "Groups", numeric: true },
        { label: "People underneath", numeric: true },
        { label: "Load", numeric: true, title: "People underneath ÷ Connect Leaders" },
      ],
      rows,
      { onRow: (ref) => setFilters({ section: String(state.filters.section) === String(ref) ? "" : String(ref) }) }
    ));
  }
  body.append(carePanel.section);

  /* Span of care as a bar chart, deliberately beside chapter 1's leaders-per-cluster: a tall bar
   * here next to a short bar there is the single most actionable pairing on the page. */
  const spanPanel = panel("Span of care, people per section", { wide: true,
    info: "A tall bar here beside a short bar in leaders per cluster above is where to add leadership first." });
  spanPanel.body.classList.add("lead-panel__body--columns");
  if (!care) spanPanel.body.append(ghost("Unavailable while the structure reading is unavailable."));
  else {
    const top = care.filter((r) => r.tier === "cluster").slice(0, 12);
    if (!top.length) spanPanel.body.append(ghost("No clusters match the current filters."));
    else {
      const max = Math.max(...top.map((r) => r.people));
      for (const row of top) {
        spanPanel.body.append(barRow(row.label, row.people, max, {
          tone: row.load === null ? "critical" : "connect",
          sub: row.load === null ? "no Connect Leader beneath" : `${fmt1(row.load)} per leader`,
          selected: String(state.filters.section) === String(row.ref),
          onSelect: () => setFilters({ section: String(state.filters.section) === String(row.ref) ? "" : String(row.ref) }),
        }));
      }
    }
  }
  body.append(spanPanel.section);

  /* Ministry care structure — rolled up to the Overall Head, which is the peg's reading. */
  const teams = ministryTeams(state.adapted, state.filters);
  const ministryPanel = panel("Ministry care structure", { wide: true, exportId: "leadership-ministry",
    info: "Bench depth by tier. Captains are who a Team Lead can hand to, and Potential Captains are who is next after them. A team with heads and no bench is one departure away from a gap." });
  if (!teams) {
    ministryPanel.body.append(ghost(state.adapted.unavailable["people-ministry-structure"] || "This reading is unavailable."));
  } else {
    const rows = [...teams]
      .sort((a, b) => b.members - a.members)
      .map((team) => ({
        selectValue: team.label,
        tone: team.leaderless ? "critical" : team.bench === 0 ? "watch" : "healthy",
        cells: [
          team.label,
          team.overallHeads, team.unitHeads, team.teamLeads, team.captains,
          { node: (() => {
              const cell = el("span", "lead-bench");
              cell.textContent = fmt(team.bench);
              if (team.bench === 0) cell.dataset.empty = "true";
              return cell;
            })(), title: team.bench === 0
              ? "No Potential Captains. Nobody is named as next in line on this team."
              : `${fmt(team.bench)} Potential Captains, the named pipeline into Captain.` },
          team.volunteers,
        ],
      }));
    ministryPanel.body.append(table(
      [
        { label: "Team" },
        { label: "Overall Heads", numeric: true },
        { label: "Unit Heads", numeric: true },
        { label: "Team Leads", numeric: true },
        { label: "Captains", numeric: true },
        { label: "Bench", numeric: true, title: "Potential Captains" },
        { label: "Volunteers", numeric: true },
      ],
      rows,
      { onRow: (team) => setFilters({ team: state.filters.team === team ? "" : team }) }
    ));
  }
  body.append(ministryPanel.section);

  host.append(section);
}

function renderChapterThree(host) {
  const { section, body } = chapter(3, "Where are the gaps?",
    "Two different shortages, and they need opposite responses. A team with people signing up and nobody placed has a follow-up problem. A team with nobody signing up at all has a different conversation ahead of it.");

  const areas = servingAreas(state.adapted, state.filters, state.areas);
  const signupPanel = panel("Ministry sign-ups by area", { wide: true, exportId: "leadership-signups",
    info: "A tall bar with a low placed count is a follow-up problem rather than an interest problem, and those are the fastest wins on this page. Placement is not expressed the same way in every area. Most run a ladder ending in Serving, while the largest area uses instrument names as statuses and has no terminal placement status at all. Rather than compute a placed figure that would read zero there, each area is read through its own ladder, and an area with no mapped rung shows its placement as unknown instead of as nothing." });

  if (!areas) {
    signupPanel.body.append(ghost(state.adapted.unavailable["people-serving-signups"] || "This reading is unavailable."));
  } else if (!areas.length) {
    signupPanel.body.append(ghost("No serving areas match the current filters."));
  } else {
    const max = Math.max(...areas.map((a) => a.requests));
    for (const area of areas) {
      const row = el("div", "lead-area");
      const bar = barRow(area.label, area.requests, max, { tone: "ministry" });
      row.append(bar);
      const outcome = el("p", "lead-area__outcome");
      if (area.placed === null) {
        outcome.dataset.unknown = "true";
        outcome.append(
          el("span", "lead-area__placed", DASH),
          el("span", "lead-area__why", area.unresolvedReason || "No status on this area means placed, so placement cannot be counted here.")
        );
      } else {
        const share = area.requests > 0 ? Math.round((area.placed / area.requests) * 100) : 0;
        outcome.append(
          el("span", "lead-area__placed", `${fmt(area.placed)} placed`),
          el("span", "lead-area__why", `${share}% of sign-ups reached a serving status.`)
        );
      }
      row.append(outcome);
      signupPanel.body.append(row);
    }
  }
  body.append(signupPanel.section);

  const teams = ministryTeams(state.adapted, state.filters);
  const thinPanel = panel("Teams that may need volunteers", { wide: true,
    info: "Thinnest first. A team with no leader at all is listed separately below, because that is a different problem with a different first move." });
  if (!teams) {
    thinPanel.body.append(ghost(state.adapted.unavailable["people-ministry-structure"] || "This reading is unavailable."));
  } else {
    const thin = teams.filter((t) => !t.leaderless).slice(0, 12);
    const rows = thin.map((team) => ({
      selectValue: team.label,
      tone: team.volunteers < 8 ? "thin" : team.volunteers < 20 ? "watch" : "healthy",
      cells: [
        team.label,
        team.volunteers,
        team.overallHeads + team.unitHeads + team.teamLeads + team.captains,
        team.bench,
        { node: el("span", "lead-tag", team.volunteers < 8 ? "Thin" : team.volunteers < 20 ? "Watch" : "Holding") },
      ],
    }));
    thinPanel.body.append(table(
      [
        { label: "Team" },
        { label: "Volunteers", numeric: true },
        { label: "Leaders", numeric: true },
        { label: "Bench", numeric: true },
        { label: "Status" },
      ],
      rows,
      { onRow: (team) => setFilters({ team: state.filters.team === team ? "" : team }) }
    ));

    /* Rendered distinctly from "few leaders", and never merged into the table above. A team with
     * three leaders and a team with none are not two points on one scale. */
    const leaderless = teams.filter((t) => t.leaderless);
    const noLeader = el("div", "lead-noleader");
    noLeader.append(el("h4", "lead-noleader__title", "Teams with no leader at all"));
    if (!leaderless.length) {
      noLeader.append(el("p", "lead-noleader__none", "None. Every active team has at least one appointed leader."));
    } else {
      const list = el("ul", "lead-noleader__list");
      for (const team of leaderless) {
        const item = el("li");
        item.append(el("span", "lead-noleader__team", team.label));
        item.append(el("span", "lead-noleader__count", `${fmt(team.volunteers)} volunteers, nobody appointed over them`));
        list.append(item);
      }
      noLeader.append(list);
    }
    thinPanel.section.append(noLeader);
  }
  body.append(thinPanel.section);

  host.append(section);
}

function renderChapterFour(host) {
  const { section, body } = chapter(4, "How many leaders must we raise?",
    "Everything above describes what exists. This is the only chapter that asks for a decision.");

  const chain = raiseChain(state.adapted, state.filters);
  const chainPanel = panel("The raise chain", { wide: true, exportId: "leadership-raise",
    info: "Left to right is the chain. Of everyone in a band, some already sit in a group, and the rest are not yet. Existing groups have spare seats that absorb part of that. Only what is left needs new groups, and those groups drive Raise. Raise is the only number here to plan against. People comes from each person's own age, while In a group comes from where their group sits in the Connect tree. The two cannot come from one fact, because someone not in a group has no group to take a band from. Target group size is an assumption, which is why it is a control on this page rather than a constant." });

  if (!chain) {
    chainPanel.body.append(ghost(state.adapted.unavailable["people-connect-capacity"] || "This reading is unavailable."));
    body.append(chainPanel.section);
    host.append(section);
    return;
  }

  const steps = [
    ["People", chain.total.people, "The active people on this campus."],
    ["In a group", chain.total.inGroup, "Already on a Connect Group roster."],
    ["Not yet", chain.total.notYet, "In no group at all."],
    ["Spare seats", chain.total.spare, `Unused seats at ${chain.size} per group.`],
    ["New groups", chain.total.newGroups, "What the remainder needs."],
    ["Raise", chain.total.raise, "Connect Leaders to appoint."],
  ];
  const flow = el("div", "lead-chain");
  steps.forEach(([label, value, why], index) => {
    const step = el("div", "lead-chain__step");
    if (index === steps.length - 1) step.dataset.terminal = "true";
    step.append(el("span", "lead-chain__value", fmt(value)));
    step.append(el("span", "lead-chain__label", label));
    step.append(el("span", "lead-chain__why", why));
    flow.append(step);
    if (index < steps.length - 1) {
      const arrow = el("span", "lead-chain__arrow");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      flow.append(arrow);
    }
  });
  chainPanel.body.append(flow);

  const rows = chain.bands.map((band) => ({
    selectValue: band.band,
    tone: band.raise > 6 ? "thin" : band.raise > 0 ? "watch" : "healthy",
    cells: [
      band.band, band.people, band.inGroupPersonBand, band.notYet, band.spare, band.newGroups,
      { node: (() => {
          const cell = el("span", "lead-raise", fmt(band.raise));
          return cell;
        })() },
    ],
  }));
  chainPanel.body.append(table(
    [
      { label: "Age group" },
      { label: "People", numeric: true, title: "From the person's own age" },
      { label: "In a group", numeric: true, title: "Counted on the same grain as People, so the row adds up. The group-derived figure is in the note below." },
      { label: "Not yet", numeric: true },
      { label: "Spare seats", numeric: true },
      { label: "New groups", numeric: true },
      { label: "Raise", numeric: true },
    ],
    rows,
    { onRow: (band) => setFilters({ groupAge: state.filters.groupAge === band ? "" : band }) }
  ));

  body.append(chainPanel.section);
  host.append(section);
}

function renderRoster(host, rows) {
  const { section, body } = chapter(5, "Who they are",
    "One row per person, every role they hold. This is the only place on the suite where a name is drawn.");

  const entry = state.adapted.responses["people-leader-roster"];
  const rosterPanel = panel("Roster", { wide: true,
    info: "Sorted by how many roles a person holds, so the people this church leans on hardest are at the top. Open a row to see every role. Names are shown on this dashboard and nowhere else in the suite. They are never exported, copied, or packaged." });

  if (!entry) {
    rosterPanel.body.append(ghost(state.adapted.unavailable["people-leader-roster"] || "This reading is unavailable."));
  } else {
    const people = rosterPeople(rows, bandIndex(state.adapted));
    if (!people.length) {
      rosterPanel.body.append(ghost("Nobody matches the current filters."));
    } else {
      const list = el("div", "lead-roster");
      for (const person of people.slice(0, 200)) {
        const item = el("details", "lead-person");
        const summary = el("summary", "lead-person__head");
        summary.append(el("span", "lead-person__name", person.name));
        const marks = el("span", "lead-person__marks");
        for (const branch of ["connect", "ministry"]) {
          if (!person.branches.includes(branch)) continue;
          const mark = el("span", "lead-person__branch", BRANCHES[branch].label);
          mark.dataset.branch = branch;
          marks.append(mark);
        }
        if (person.roles.some((r) => r.tier === "lay-pastor")) {
          marks.append(el("span", "lead-person__branch", "Lay Pastor"));
        }
        marks.append(el("span", "lead-person__roles", `${person.roleCount} ${person.roleCount === 1 ? "role" : "roles"}`));
        summary.append(marks);
        item.append(summary);

        const detail = el("ul", "lead-person__list");
        for (const role of person.roles) {
          const line = el("li", "lead-person__role");
          if (role.branch) line.dataset.branch = role.branch;
          line.append(el("span", "lead-person__tier", role.label));
          line.append(el("span", "lead-person__context", role.context || DASH));
          detail.append(line);
        }
        item.append(detail);
        list.append(item);
      }
      rosterPanel.body.append(list);
      if (people.length > 200) {
        rosterPanel.body.append(el("p", "lead-more",
          `${fmt(people.length)} match. Showing 200. Narrow with a filter or the search box to reach the rest.`));
      }
    }
  }
  body.append(rosterPanel.section);
  host.append(section);
}

/* -------------------------------------------------------------------- Classic (#638) -------- *
 * Pas. John's Manila peg, rebuilt as its own peer panels rather than translated into the
 * Creative chapters above. A flat grid, in the peg's own order, with the peg's own titles. No
 * chapter numbering: the peg was never a narrative with a beginning and an end, it was fourteen
 * facts a reader picks among, and numbering them would assert a sequence the peg does not have.
 *
 * Every panel still carries a "How to read" line through `panel()`'s own `(i)` mark -- the peg's
 * best idea survives the rebuild intact -- and every number below still resolves to a named
 * export of leadership-source.mjs. Nothing here computes a headline figure of its own; grouping
 * an already-sourced count by team-name family (panel 3) or age band (panels 1/4) is presentation,
 * the same job `connectByBand` already does for Creative, not a second arithmetic layer. */

/* Distinct people, bucketed by a per-row classifier, with anyone the classifier cannot place
 * (a null groupAge, a null gender) landing in `unknown` rather than being dropped. Shared by the
 * age-group and gender donuts, which differ only in which field they classify by. */
function distinctByField(rows, classify) {
  const seen = new Map();
  for (const row of rows) {
    const value = classify(row);
    if (!seen.has(row.personRef) || (!seen.get(row.personRef) && value)) seen.set(row.personRef, value || null);
  }
  const counts = new Map();
  let unknown = 0;
  for (const value of seen.values()) {
    if (!value) { unknown += 1; continue; }
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return { counts, unknown, total: seen.size };
}

/* Only tokens confirmed to exist in leadership.css's `:root`, never a hex: the palette was just
 * moved to the peg's own values in #642 and a hardcoded fallback would drift out from under it
 * the next time someone retunes a token. Age and gender each resolve to their OWN named ramp
 * when the label is one the ramp defines; anything else -- a ministry family, a band name the
 * ramp does not carry -- rotates through the generic identity/state tokens instead. */
const GENDER_TOKENS = { men: "--gender-men", women: "--gender-women", unknown: "--gender-unknown" };
/* Rock stores the column lower-case; a control and a chip are read by a person. "Unknown" is
 * capitalised like the others rather than punctuated as an absence, because a gender that is
 * genuinely not on file IS a value here -- it just is not a ghost, since the column is never
 * null (people-leader-roster.sql CASEs it). */
const GENDER_LABELS = { men: "Men", women: "Women", unknown: "Unknown" };

/* Group age band values are a closed, known set on prod -- confirmed against production, not
 * guessed from a substring: "MNL Youth", "MNL Young Adults", "MNL YP", "MNL UNI", "MNL Adults",
 * "MNL Seasoned", "MNL Deaf", "MNL Connect Groups". The old code fuzzy-matched keywords like
 * "youth"/"kid"/"season"/"matur" against the raw string, which both invented bands prod does not
 * have (kids, mature) and could not tell "MNL Youth" from a stray "MNL Youth Ministry" the same
 * way twice. This map is exact and campus-prefix-insensitive: strip the leading campus short
 * code (the only three that exist today), then look the remainder up verbatim. Anything that
 * does not survive the lookup is not coloured at all -- ageBandKey below returns null and the
 * row lands in the ghost "?" bucket with distinctByField's own unknown count, never a colour
 * that implies a band it is not. */
const CAMPUS_PREFIX = /^(?:MNL|BNE|SEL)\s+/;
const AGE_BAND_TOKENS = {
  "Youth": "--age-youth",
  "Young Adults": "--age-young-adults",
  "YP": "--age-young-adults",
  "UNI": "--age-young-adults",
  "Adults": "--age-adults",
  "Seasoned": "--age-seasoned",
  "Deaf": "--age-deaf",
  "Connect Groups": "--age-all-ages",
  /* Alias for the already-renamed display label (ageBandLabel turns "Connect Groups" into
   * "All ages" before colorFor ever sees it), so the colour lookup still resolves post-rename. */
  "All ages": "--age-all-ages",
};
/* "MNL Connect Groups" is campus-wide oversight, not an age band -- it reads as "All ages"
 * rather than as a fifth band, which is why the donut's own label transform (ageBandLabel)
 * renames it, distinct from ageBandKey which only resolves the colour token. */
const AGE_BAND_LABELS = { "Connect Groups": "All ages" };

function ageBandKey(raw) {
  const stripped = String(raw || "").replace(CAMPUS_PREFIX, "").trim();
  return stripped && Object.prototype.hasOwnProperty.call(AGE_BAND_TOKENS, stripped) ? stripped : null;
}

/* The display label for a recognised band -- "MNL Connect Groups" becomes "All ages", every
 * other band keeps its own full name (campus prefix included) exactly as Rock returns it. */
function ageBandLabel(raw) {
  const key = ageBandKey(raw);
  return (key && AGE_BAND_LABELS[key]) || raw;
}

/* Ministry team names carry the same campus short code as the age bands (MNL/BNE/SEL) and a
 * trailing " Team" -- "MNL Kids" -> "Kids", "MNL Youth Team" -> "Youth", "MNL Connect Team"
 * stays "Connect" because "Connect" itself is not "Team". "None" and anything that reduces to
 * empty after stripping both is not a family and returns null; callers ghost it, never fold it
 * into another family or drop it (BUG 2, ADR 0018). */
const TEAM_SUFFIX = /\s+Team$/;

function ministryFamily(rawLabel) {
  const label = String(rawLabel || "").trim();
  if (!label || label === "None") return null;
  const stripped = label.replace(CAMPUS_PREFIX, "").replace(TEAM_SUFFIX, "").trim();
  return stripped || null;
}

const GENERIC_RAMP = ["--secondary", "--accent", "--state-thin", "--state-critical", "--muted-ink", "--faint-ink"];

function colorFor(kind, label, index) {
  const low = String(label || "").toLowerCase();
  if (kind === "gender" && GENDER_TOKENS[low]) return GENDER_TOKENS[low];
  if (kind === "age") {
    const key = ageBandKey(label);
    if (key) return AGE_BAND_TOKENS[key];
    /* Null/unrecognised never reaches here in the age donut (ageDist's classify already
     * folds it into the ghost bucket via ageBandKey), but colorFor is shared by other kinds
     * too, so a defensive fallback still must not imply a band -- muted, not a ramp colour. */
    return "--muted-ink";
  }
  return GENERIC_RAMP[index % GENERIC_RAMP.length];
}

/* THE PEG'S PIE, not a chart with a caption list.
 *
 * Four things this mark does that a plain arc plus a legend does not, and each is the reason a
 * reader trusts it rather than glances at it:
 *
 *   1. THE HOLE CARRIES THE TOTAL. An arc answers "what share"; it cannot answer "of what".
 *      The peg prints the total large in the middle with a one-word caption under it, so the
 *      denominator is never somewhere else on the page.
 *   2. EVERY LEGEND ROW CARRIES ITS PERCENTAGE. "Adults 185" is a count; "185 · 44%" is the
 *      reading. Without the share the legend is a table of numbers the eye has to divide.
 *   3. THE LEGEND SITS UNDER THE ARC, not beside it. Beside, a 40-row ministry legend sets the
 *      height of the whole row and leaves the two donuts next to it floating in white space --
 *      the bloat. Under, the arc keeps its size, the legend flows in the panel's own width, and
 *      a long legend makes ONE panel tall instead of three.
 *   4. IT FILTERS. Slice and legend row are the same control: hover reads it, click narrows the
 *      whole page to it, click again clears. Selected keeps full colour and takes an ink stroke;
 *      everything else drops to a wash, so the page shows what the selection is made OF.
 *
 * An unknown bucket is a ghost row with its reason, never a wedge (ADR 0018): absence has no
 * share of a total it is absent from. */
const DONUT_FILTER_KEY = { age: "groupAge", gender: "gender", ministry: "team" };

function donutPanel(title, info, counts, unknown, total, { unknownReason = null, kind = "generic", centre = "leaders" } = {}) {
  const p = panel(title, { info });
  if (!total) { p.body.append(ghost("Nobody matches the current filters.")); return p.section; }
  const wrap = el("div", "lead-donut");
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const measured = entries.reduce((sum, [, v]) => sum + v, 0);
  const filterKey = DONUT_FILTER_KEY[kind] || null;
  const active = filterKey ? state.filters[filterKey] : "";
  /* The share is of the MEASURED total, not of everyone in view. A ghost bucket has no slice, so
   * dividing by a denominator that includes it would make the visible wedges add up to less than
   * 100% with nothing on screen accounting for the remainder. The ghost row prints its own count
   * against the full total instead, and says so. */
  const pct = (v) => (measured > 0 ? Math.round((v / measured) * 100) : 0);

  /* The arc's own bubble is authored HERE rather than left to the widget's default, so a wedge
   * and its legend row say the same sentence to the word -- including what a click does, which
   * the widget cannot know. The arc is the mark a reader reaches for first; it must be the one
   * that answers. */
  const slices = entries.map(([label, value], i) => ({
    key: label, label, value, color: colorFor(kind, label, i),
    valueText: `${fmt(value)} ${value === 1 ? "leader" : "leaders"}`,
    comparison: `${pct(value)}% of the ${fmt(measured)} measured here`,
    note: filterKey ? (active === label ? "Selected. Click to clear." : "Click to filter the page to this") : null,
  }));
  const chartWrap = el("div", "lead-donut__chart");
  /* `tooltip: false`: the widget mounts its bubble on document.body, outside this surface's
   * scoped stylesheet, so the arc was the one mark on the page whose hover arrived as raw
   * unstyled text while every other mark opened a card. The paths join this surface's own
   * delegate below instead, which also means one bubble for the whole page: moving from a
   * wedge to its legend row re-renders the card in place rather than handing off between two. */
  const svg = arcChart(slices, { mode: "creative", size: 168, tooltip: false, ariaLabel: `${title}, ${entries.length} groups` });

  /* The total in the hole. Appended here rather than inside the shared arcChart because it is
   * this surface's reading, not every surface's -- a Grow arc counts sessions, not leaders. */
  const hole = svgEl("text", { x: "84", y: "86", "text-anchor": "middle", class: "lead-donut__total" });
  hole.textContent = fmt(measured);
  const holeSub = svgEl("text", { x: "84", y: "99", "text-anchor": "middle", class: "lead-donut__totalsub" });
  holeSub.textContent = centre;
  svg.append(hole, holeSub);

  /* Slice = control. The shared widget already drew the path, the <title> and the themed
   * bubble; what it cannot know is what a click MEANS on this surface, so the binding is here. */
  const pathByKey = new Map();
  for (const path of svg.querySelectorAll("path[data-slice]")) {
    const key = path.dataset.slice;
    if (!key) continue;
    pathByKey.set(key, path);
    const slice = slices.find((item) => item.key === key);
    if (slice) {
      tip(path, {
        label: slice.label,
        value: slice.valueText,
        comparison: slice.comparison,
        unit: slice.note,
        swatch: slice.color,
      });
    }
    if (!filterKey) continue;
    path.classList.add("is-clickable");
    if (active) path.classList.add(active === key ? "is-on" : "is-dim");
    path.setAttribute("role", "button");
    path.setAttribute("aria-pressed", String(active === key));
    on(path, "click", () => setFilters({ [filterKey]: active === key ? "" : key }));
    on(path, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setFilters({ [filterKey]: active === key ? "" : key });
    });
  }
  chartWrap.append(svg);
  wrap.append(chartWrap);

  const legend = el("ul", "lead-donut__legend");
  entries.forEach(([label, value], i) => {
    const item = el("li", "lead-donut__item");
    const inner = filterKey ? el("button", "lead-donut__row") : el("span", "lead-donut__row");
    inner.dataset.sliceKey = label;
    if (filterKey) {
      inner.type = "button";
      inner.setAttribute("aria-pressed", String(active === label));
      on(inner, "click", () => setFilters({ [filterKey]: active === label ? "" : label }));
      if (active) inner.classList.add(active === label ? "is-on" : "is-dim");
    }
    const swatch = el("span", "lead-donut__swatch");
    swatch.style.setProperty("--c", `var(${colorFor(kind, label, i)})`);
    const share = el("span", "lead-donut__share");
    share.append(el("b", null, fmt(value)), document.createTextNode(` \u00b7 ${pct(value)}%`));
    inner.append(swatch, el("span", "lead-donut__label", label), share);
    tip(inner, {
      label,
      value: `${fmt(value)} ${value === 1 ? "leader" : "leaders"}`,
      comparison: `${pct(value)}% of the ${fmt(measured)} measured here`,
      unit: filterKey ? (active === label ? "Selected. Click to clear." : "Click to filter the page to this") : null,
      swatch: colorFor(kind, label, i),
    });
    item.append(inner);
    legend.append(item);
  });
  if (unknown > 0) {
    const item = el("li", "lead-donut__item lead-donut__item--ghost");
    const inner = el("span", "lead-donut__row");
    inner.append(
      el("span", "lead-donut__swatch lead-donut__swatch--ghost", DASH),
      el("span", "lead-donut__label", "Not measured"),
      el("span", "lead-donut__share", fmt(unknown)),
    );
    tip(inner, { label: "Not measured", value: `${fmt(unknown)} of ${fmt(total)} people`, comparison: unknownReason || "Not recorded for these rows." });
    item.append(inner);
    legend.append(item);
  }

  /* POINTING AT THE LEGEND LIGHTS UP THE ARC, not the row. The row is already the thing the
   * reader's eye is on; telling them where it is on the wheel is the only answer they do not
   * already have, and on a forty-family legend it is the difference between a list of names and
   * a chart. Focus does it too, so a keyboard walk down the legend draws the same reading.
   *
   * Delegated -- one set of listeners per panel, not per row. Every panel on this surface is
   * rebuilt from scratch on every filter change, and forty rows' worth of per-row listeners
   * would accumulate on `state.listeners` with each render. `pointerover` re-sets rather than
   * toggles, so crossing from a row's swatch to its label cannot flicker the highlight off. */
  if (pathByKey.size) {
    const clearHot = () => { for (const path of pathByKey.values()) path.classList.remove("is-hot"); };
    const hotFrom = (event) => {
      const row = event.target && event.target.closest ? event.target.closest(".lead-donut__row") : null;
      clearHot();
      const path = row && row.dataset.sliceKey ? pathByKey.get(row.dataset.sliceKey) : null;
      if (path) path.classList.add("is-hot");
    };
    on(legend, "pointerover", hotFrom);
    on(legend, "pointerleave", clearHot);
    on(legend, "focusin", hotFrom);
    on(legend, "focusout", clearHot);
  }

  wrap.append(legend);
  p.body.append(wrap);
  /* Bounded by default (#765). A compact legend shows ~5 rows; anything longer -- Ministry's
   * ~40 families chief among them -- gets an honest "Show all (N)" rather than stretching the
   * panel past its neighbours or hiding behind an inner scrollbar. Rank order and every
   * per-row listener above are untouched: items are only hidden, never rebuilt. */
  mountBoundedList(legend, { defaultCount: 5 });
  return p.section;
}

/* Panel 4, "Connect roles across age groups" -- the same stacked-band reading Creative's
 * chapter 1 draws, factored out so both compositions call one function rather than keeping two
 * copies of the same stack-and-legend markup in sync by hand. */
function connectByBandBody(rows) {
  const body = el("div", "lead-bandbody");
  const bands = connectByBand(rows, bandIndex(state.adapted));
  if (!bands.length) { body.append(ghost("No Connect roles match the current filters.")); return body; }
  const max = Math.max(1, ...bands.map((b) => b.total));
  for (const band of bands) {
    const row = el("div", "lead-bandrow");
    const head = el("div", "lead-bandrow__head");
    head.append(el("span", "lead-bandrow__label", band.band), el("span", "lead-bandrow__total", fmt(band.total)));
    row.append(head);
    const stack = el("div", "lead-stack");
    stack.style.width = `${Math.max(6, (band.total / max) * 100)}%`;
    for (const tier of band.tiers) {
      if (!tier.people) continue;
      const seg = el("button", "lead-stack__seg");
      seg.type = "button";
      seg.dataset.tier = tier.tier;
      seg.style.flexGrow = String(tier.people);
      seg.setAttribute("aria-label", `${tier.label}: ${fmt(tier.people)} in ${band.band}`);
      tip(seg, { label: tier.label, value: `${fmt(tier.people)} in ${band.band}`,
        comparison: `${Math.round((tier.people / band.total) * 100)}% of this band's Connect leadership` });
      on(seg, "click", () => setFilters({ tier: tier.tier, branch: "connect", groupAge: band.band }));
      stack.append(seg);
    }
    row.append(stack);
    row.append(el("p", "lead-bandrow__legend",
      band.tiers.filter((t) => t.people).map((t) => `${t.label} ${t.people}`).join(" · ") || "No leaders in this band"));
    body.append(row);
  }
  return body;
}

/* Panel 5, "Leaders by role" -- the one panel in Classic whose order is a SORT rather than the
 * ladder's own fixed rung order. Both ladders' rungs, combined and sorted descending, because a
 * wide base with a thin middle is the warning sign this specific panel exists to show, and
 * sorting alphabetically or by ladder position would hide the narrowing rather than show it. */
function leadersByRolePanel(rows) {
  const p = panel("Leaders by role", {
    info: "Widest at the top, narrowest at the bottom. A wide base with a thin middle is the warning sign: it means the layer that should be carrying the leaders is missing. Bench tiers (Potential Captain) are included and marked, because a thin bench is exactly the kind of gap this panel exists to surface." });
  const connect = ladder(rows, "connect").map((r) => ({ ...r, branch: "connect" }));
  const ministry = ladder(rows, "ministry").map((r) => ({ ...r, branch: "ministry" }));
  const rungs = [...connect, ...ministry].sort((a, b) => b.people - a.people);
  if (!rungs.length) { p.body.append(ghost("No roles match the current filters.")); return p.section; }
  const max = Math.max(1, ...rungs.map((r) => r.people));
  for (const rung of rungs) {
    p.body.append(barRow(rung.label, rung.people, max, {
      tone: rung.bench ? "thin" : rung.branch,
      sub: rung.bench ? "bench, not appointed" : null,
    }));
  }
  return p.section;
}

/* Panel 9, "Span of care -- people per cluster". PROMINENT and by design: on prod the largest
 * row is one cluster head carrying 523 people, and that row reading first, with the head's own
 * name beside the number, is the point of the panel. The name is drawn from `sectionLabel`,
 * which on this schema IS a Connect Group Section's name -- a person's name -- and ADR 0023 P4
 * names this exact reading as the permitted exception: drawn, never exported. */
function spanOfCarePanel() {
  const care = careStructure(state.adapted, state.filters);
  const p = panel("Span of care — people per cluster", { wide: true,
    info: "Sorted by load, widest first. The label is the cluster head's own name, because in Rock a Connect Group Section is named after the person who leads it. The longest bar is the person carrying the most people, and that is the first thing this panel is meant to tell you." });
  if (!care) { p.body.append(unavailablePanel(state.adapted.unavailable["people-leader-span-of-care"], { headline: "Span of care" })); return p.section; }
  const clusters = care.filter((r) => r.tier === "cluster");
  if (!clusters.length) { p.body.append(ghost("No clusters match the current filters.")); return p.section; }
  const max = Math.max(...clusters.map((r) => r.people));
  for (const row of clusters) {
    p.body.append(barRow(`${row.label} — ${row.tierLabel}`, row.people, max, {
      tone: row.load === null ? "critical" : "connect",
      sub: row.load === null ? "no Connect Leader beneath" : `${fmt1(row.load)} people per leader`,
    }));
  }
  mountBoundedList(p.body, { defaultCount: 10 });
  return p.section;
}

/* Panels 8 and 10 keep the peg's own in-widget filters (repo rule: local to the panel, never
 * global). Each is a small closure over its own filter state so re-render rebuilds it from
 * scratch along with everything else -- the same "rebuilt every render" contract the console and
 * every chapter already follow -- rather than surviving as detached DOM the rest of the page has
 * moved past. */
/* One list per table, read by BOTH the sort control and the table itself, so the options a
 * reader is offered can never drift from the columns they actually order. */
const CARE_COLUMNS = [
  { label: "Section", key: "label" }, { label: "Tier", key: "tierLabel" }, { label: "Age group", key: "band" },
  { label: "Connect Leaders", key: "connectLeaders", numeric: true }, { label: "Groups", key: "leafGroups", numeric: true },
  { label: "People underneath", key: "people", numeric: true }, { label: "Load", key: "load", numeric: true },
];
const MINISTRY_COLUMNS = [
  { label: "Team", key: "label" }, { label: "Overall Heads", key: "overallHeads", numeric: true },
  { label: "Unit Heads", key: "unitHeads", numeric: true }, { label: "Team Leads", key: "teamLeads", numeric: true },
  { label: "Captains", key: "captains", numeric: true }, { label: "Bench", key: "bench", numeric: true },
  { label: "Volunteers", key: "volunteers", numeric: true },
];

const panelFilterState = {
  care: { section: "", band: "", head: "", region: "", sortKey: "load", sortDir: "desc", page: 1, pageSize: 10 },
  ministry: { head: "", team: "", scope: "", sortKey: "members", sortDir: "desc", page: 1, pageSize: 10 },
};

/* SORT AS A NAMED CONTROL, beside the filters, not only on the column headers. The header click
 * stays and is still the fastest path once you know it is there, but a reader scanning a filter
 * row has no way to learn it exists, and on tables this wide the column that answers their
 * question is often off to the right. The pair says the reading in words: what it is sorted by,
 * and which end is on top. The direction's own label follows the column's type, because
 * "Highest first" is not what A to Z means. */
/* A SEARCH FIELD INSIDE A PANEL. Debounced, because every keystroke here re-renders all fourteen
 * panels: undebounced, a six-letter name cost six full rebuilds and the field lost its own focus
 * to the last of them while the reader was still typing. The value is held locally and written
 * through on the trailing edge, so the field stays live while the page catches up. */
function panelSearch(value, placeholder, commit) {
  const input = el("input", "lead-input");
  input.type = "search";
  input.value = value;
  input.placeholder = placeholder;
  const run = debounce((text) => commit(text), 200);
  on(input, "input", () => run(input.value));
  return input;
}

function sortField(name, columns, f, onChange) {
  const sortable = columns.filter((c) => c.key);
  const current = sortable.find((c) => c.key === f.sortKey) || sortable[0];
  const numeric = !!(current && current.numeric);
  const by = select(sortable.map((c) => ({ value: c.key, label: c.label })), f.sortKey, (v) => { f.sortKey = v; onChange(); });
  by.id = `lead-sort-${name}`;
  const wrap = el("div", "lead-field lead-field--sort");
  const label = el("label", "lead-field__label", "Sort");
  label.htmlFor = by.id;
  const row = el("div", "lead-sortrow");
  const dir = el("button", "lead-sortdir", numeric
    ? (f.sortDir === "desc" ? "Highest first" : "Lowest first")
    : (f.sortDir === "desc" ? "Z to A" : "A to Z"));
  dir.type = "button";
  dir.setAttribute("aria-label", `Sort direction: ${dir.textContent.toLowerCase()}. Press to flip it.`);
  on(dir, "click", () => { f.sortDir = f.sortDir === "desc" ? "asc" : "desc"; onChange(); });
  row.append(by, dir);
  wrap.append(label, row);
  return wrap;
}


function paginationControl(name, f, { total, page, pageSize, totalPages }, onChange) {
  if (total <= PAGE_SIZES[0]) return null;
  const bar = el("div", "lead-pagination");
  const sizeSelect = select(PAGE_SIZES.map((n) => ({ value: n, label: `${n} / page` })), pageSize, (v) => {
    f.pageSize = Number(v);
    f.page = 1;
    onChange();
  });
  sizeSelect.id = `lead-pagesize-${name}`;
  const sizeLabel = el("label", "lead-field__label", "Rows per page");
  sizeLabel.htmlFor = sizeSelect.id;
  const prev = el("button", "reset-btn reset-btn--inline", "Previous");
  prev.type = "button";
  prev.disabled = page <= 1;
  on(prev, "click", () => { f.page = Math.max(1, page - 1); onChange(); });
  const next = el("button", "reset-btn reset-btn--inline", "Next");
  next.type = "button";
  next.disabled = page >= totalPages;
  on(next, "click", () => { f.page = Math.min(totalPages, page + 1); onChange(); });
  const status = el("span", "lead-pagination__status", `Page ${fmt(page)} of ${fmt(totalPages)} · ${fmt(total)} rows`);
  status.setAttribute("aria-live", "polite");
  bar.append(sizeLabel, sizeSelect, prev, status, next);
  return bar;
}

function careStructurePanel() {
  const care = careStructure(state.adapted, state.filters);
  const p = panel("Pastoral Care Structure — Connect Clusters", { wide: true, exportId: "leadership-care",
    info: "One row per section of the Connect tree. Load is people underneath divided by Connect Leaders. A dash means people underneath and no Connect Leader to divide by, which is a different problem from a low number. The smaller figure beside a people count is the same population counted once; the gap is people who belong to two of this section's groups." });
  if (!care) { p.body.append(unavailablePanel(state.adapted.unavailable["people-leader-span-of-care"], { headline: "Pastoral care structure" })); return p.section; }

  const f = panelFilterState.care;
  const controls = el("div", "lead-panel-filters");
  const clusters = [...new Set(care.filter((r) => r.tier === "cluster").map((r) => r.label))].sort();
  const bands = [...new Set(care.map((r) => r.band).filter(Boolean))].sort();
  const regions = [...new Set(care.filter((r) => r.tier === "regional").map((r) => r.label))].sort();
  controls.append(field("Structure cluster", select([{ value: "", label: "Every cluster" }, ...clusters.map((c) => ({ value: c, label: c }))], f.section, (v) => { f.section = v; f.page = 1; render(); })));
  controls.append(field("Structure age group", select([{ value: "", label: "All ages" }, ...bands.map((b) => ({ value: b, label: b }))], f.band, (v) => { f.band = v; f.page = 1; render(); })));
  controls.append(field("Structure cluster head", panelSearch(f.head, "Name", (text) => { f.head = text; f.page = 1; render(); })));
  controls.append(field("Structure region", select([{ value: "", label: "Every region" }, ...regions.map((r) => ({ value: r, label: r }))], f.region, (v) => { f.region = v; f.page = 1; render(); })));
  controls.append(sortField("care", CARE_COLUMNS, f, render));
  /* Clearing the filters is not a request to lose the sort: the reader is widening what they are
   * looking at, not changing how it is ordered. The old reset dropped sortKey and sortDir on the
   * floor, which left the table unsorted until a header was clicked again. Page resets to 1: a
   * wider result set under an old page number could read as "everything vanished". */
  const clear = el("button", "reset-btn reset-btn--inline", "Clear filters");
  clear.type = "button";
  on(clear, "click", () => { panelFilterState.care = { ...panelFilterState.care, section: "", band: "", head: "", region: "", page: 1 }; render(); });
  controls.append(clear);
  p.body.append(controls);

  const rows = applyCareLocal(care, f);
  const { pageRows, ...pageInfo } = paginate(rows, f);

  const tableRows = pageRows.map((row) => ({
    selectValue: row.ref,
    tone: row.load === null ? "critical" : row.load >= 20 ? "thin" : row.load >= 12 ? "watch" : "healthy",
    cells: [
      row.label, row.tierLabel, row.band, row.connectLeaders, row.leafGroups,
      { node: (() => { const w = el("span", "lead-people"); w.append(el("span", "lead-people__n", fmt(row.people)));
          if (row.doubleCounted > 0) w.append(el("span", "lead-people__caveat", `${fmt(row.distinctPeople)} distinct`)); return w; })(),
        title: `${fmt(row.people)} memberships across ${fmt(row.leafGroups)} groups; ${fmt(row.distinctPeople)} distinct people.` },
      { node: (() => { const c = el("span", "lead-load"); c.textContent = row.load === null ? DASH : fmt1(row.load);
          tip(c, row.load === null
            ? { label: "Load", value: "Not available", comparison: "People underneath and no Connect Leader to divide by." }
            : { label: "Load", value: `${fmt1(row.load)} people per Connect Leader` }); return c; })() },
    ],
  }));
  p.body.append(table(
    CARE_COLUMNS,
    tableRows,
    {
      sortKey: f.sortKey,
      onSort: (key) => { f.sortDir = f.sortKey === key && f.sortDir === "desc" ? "asc" : "desc"; f.sortKey = key; f.page = 1; render(); },
      onRow: (ref) => setFilters({ section: String(state.filters.section) === String(ref) ? "" : String(ref) }),
    },
  ));
  const pagination = paginationControl("care", f, pageInfo, render);
  if (pagination) p.body.append(pagination);
  return p.section;
}

function ministryStructurePanel() {
  const teams = ministryTeams(state.adapted, state.filters);
  const p = panel("Ministry Care Structure — Teams & Leaders", { wide: true, exportId: "leadership-ministry",
    info: "Bench depth by tier. Captains are who a Team Lead can hand to; Potential Captains are who is next after them. A team with heads and no bench is one departure away from a gap." });
  if (!teams) { p.body.append(unavailablePanel(state.adapted.unavailable["people-ministry-structure"], { headline: "Ministry structure" })); return p.section; }

  const f = panelFilterState.ministry;
  const controls = el("div", "lead-panel-filters");
  const heads = [...new Set(teams.filter((t) => t.overallHeads > 0).map((t) => t.label))].sort();
  const teamNames = teams.map((t) => t.label).sort();
  controls.append(field("Structure overall head", select([{ value: "", label: "Every head" }, ...heads.map((h) => ({ value: h, label: h }))], f.head, (v) => { f.head = v; f.page = 1; render(); })));
  controls.append(field("Structure ministry", panelSearch(f.team, "Ministry name", (text) => { f.team = text; f.page = 1; render(); })));
  controls.append(field("Structure team in scope", select([{ value: "", label: "Every team" }, ...teamNames.map((t) => ({ value: t, label: t }))], f.scope, (v) => { f.scope = v; f.page = 1; render(); })));
  controls.append(sortField("ministry", MINISTRY_COLUMNS, f, render));
  const clear = el("button", "reset-btn reset-btn--inline", "Clear filters");
  clear.type = "button";
  on(clear, "click", () => { panelFilterState.ministry = { ...panelFilterState.ministry, head: "", team: "", scope: "", page: 1 }; render(); });
  controls.append(clear);
  p.body.append(controls);

  const rows = applyMinistryLocal(teams, f);
  const { pageRows, ...pageInfo } = paginate(rows, f);

  const tableRows = pageRows.map((team) => ({
    selectValue: team.label,
    tone: team.leaderless ? "critical" : team.bench === 0 ? "watch" : "healthy",
    cells: [team.label, team.overallHeads, team.unitHeads, team.teamLeads, team.captains,
      { node: (() => { const c = el("span", "lead-bench"); c.textContent = fmt(team.bench); if (team.bench === 0) c.dataset.empty = "true"; return c; })(),
        title: team.bench === 0 ? "No Potential Captains named." : `${fmt(team.bench)} Potential Captains.` },
      team.volunteers],
  }));
  p.body.append(table(
    MINISTRY_COLUMNS,
    tableRows,
    {
      sortKey: f.sortKey,
      onSort: (key) => { f.sortDir = f.sortKey === key && f.sortDir === "desc" ? "asc" : "desc"; f.sortKey = key; f.page = 1; render(); },
      onRow: (teamLabel) => setFilters({ team: state.filters.team === teamLabel ? "" : teamLabel }),
    },
  ));
  const pagination = paginationControl("ministry", f, pageInfo, render);
  if (pagination) p.body.append(pagination);
  return p.section;
}

/* Panel 12, "Leaders to raise for the people not yet in a group" -- the raise chain drawn as a
 * chain (matching Creative's chapter 4 markup, which already IS the peg's own chain shape) plus
 * the per-band table the peg carried beside it. */
function raiseChainPanel() {
  const chain = raiseChain(state.adapted, state.filters);
  const p = panel("Leaders to raise for the people not yet in a group", { wide: true, exportId: "leadership-raise",
    info: "Left to right is the chain. People in a band, minus those already in a group, minus what existing spare seats absorb, leaves what needs new groups. Raise is the only number here to plan against. Target group size is an assumption and is a control on this page rather than a constant." });
  if (!chain) { p.body.append(unavailablePanel(state.adapted.unavailable["people-connect-capacity"], { headline: "Raise chain" })); return p.section; }
  const steps = [
    ["People", chain.total.people, "The active people on this campus."],
    ["In a group", chain.total.inGroup, "Already on a Connect Group roster."],
    ["Not yet", chain.total.notYet, "In no group at all."],
    ["Spare seats", chain.total.spare, `Unused seats at ${chain.size} per group.`],
    ["New groups", chain.total.newGroups, "What the remainder needs."],
    ["Raise", chain.total.raise, "Connect Leaders to appoint."],
  ];
  const flow = el("div", "lead-chain");
  steps.forEach(([label, value, why], index) => {
    const step = el("div", "lead-chain__step");
    if (index === steps.length - 1) step.dataset.terminal = "true";
    step.append(el("span", "lead-chain__value", fmt(value)), el("span", "lead-chain__label", label), el("span", "lead-chain__why", why));
    flow.append(step);
    if (index < steps.length - 1) { const arrow = el("span", "lead-chain__arrow"); arrow.setAttribute("aria-hidden", "true"); arrow.textContent = "→"; flow.append(arrow); }
  });
  p.body.append(flow);
  const rows = chain.bands.map((band) => ({
    selectValue: band.band,
    tone: band.raise > 6 ? "thin" : band.raise > 0 ? "watch" : "healthy",
    cells: [band.band, band.people, band.inGroupPersonBand, band.notYet, band.spare, band.newGroups, fmt(band.raise)],
  }));
  p.body.append(table(
    [{ label: "Age group" }, { label: "People", numeric: true }, { label: "In a group", numeric: true },
     { label: "Not yet", numeric: true }, { label: "Spare seats", numeric: true }, { label: "New groups", numeric: true }, { label: "Raise", numeric: true }],
    rows,
    { onRow: (band) => setFilters({ groupAge: state.filters.groupAge === band ? "" : band }) },
  ));
  return p.section;
}

function servingAreasPanel() {
  const areas = servingAreas(state.adapted, state.filters, state.areas);
  const p = panel("Ministry sign-ups by area", { wide: true, exportId: "leadership-signups",
    info: "A tall bar with a low placed count is a follow-up problem, not an interest problem. Most areas run a ladder ending in Serving; the largest uses instrument names as statuses and has no terminal placement status, so its placement is drawn as unknown rather than as zero." });
  if (!areas) { p.body.append(unavailablePanel(state.adapted.unavailable["people-serving-signups"], { headline: "Serving sign-ups" })); return p.section; }
  if (!areas.length) { p.body.append(ghost("No serving areas match the current filters.")); return p.section; }
  const max = Math.max(...areas.map((a) => a.requests));
  for (const area of areas) {
    const row = el("div", "lead-area");
    row.append(barRow(area.label, area.requests, max, { tone: "ministry" }));
    const outcome = el("p", "lead-area__outcome");
    if (area.placed === null) {
      outcome.dataset.unknown = "true";
      outcome.append(el("span", "lead-area__placed", DASH), el("span", "lead-area__why", area.unresolvedReason || "No status on this area means placed, so placement cannot be counted here."));
    } else {
      const share = area.requests > 0 ? Math.round((area.placed / area.requests) * 100) : 0;
      outcome.append(el("span", "lead-area__placed", `${fmt(area.placed)} placed`), el("span", "lead-area__why", `${share}% of sign-ups reached a serving status.`));
    }
    row.append(outcome);
    p.body.append(row);
  }
  return p.section;
}

function volunteersNeededPanel() {
  const teams = ministryTeams(state.adapted, state.filters);
  const p = panel("Ministry teams that may need volunteers", { wide: true,
    info: "Thinnest first. A team with no leader at all is listed separately below: that is a different problem with a different first move." });
  if (!teams) { p.body.append(unavailablePanel(state.adapted.unavailable["people-ministry-structure"], { headline: "Ministry structure" })); return p.section; }
  const thin = teams.filter((t) => !t.leaderless).slice(0, 12);
  const rows = thin.map((team) => ({
    selectValue: team.label,
    tone: team.volunteers < 8 ? "thin" : team.volunteers < 20 ? "watch" : "healthy",
    cells: [team.label, team.volunteers, team.overallHeads + team.unitHeads + team.teamLeads + team.captains, team.bench,
      { node: el("span", "lead-tag", team.volunteers < 8 ? "Thin" : team.volunteers < 20 ? "Watch" : "Holding") }],
  }));
  p.body.append(table(
    [{ label: "Team" }, { label: "Volunteers", numeric: true }, { label: "Leaders", numeric: true }, { label: "Bench", numeric: true }, { label: "Status" }],
    rows,
    { onRow: (teamLabel) => setFilters({ team: state.filters.team === teamLabel ? "" : teamLabel }) },
  ));
  const leaderless = teams.filter((t) => t.leaderless);
  const noLeader = el("div", "lead-noleader");
  noLeader.append(el("h4", "lead-noleader__title", "Teams with no leader at all"));
  if (!leaderless.length) noLeader.append(el("p", "lead-noleader__none", "None. Every active team has at least one appointed leader."));
  else {
    const list = el("ul", "lead-noleader__list");
    for (const team of leaderless) {
      const item = el("li");
      item.append(el("span", "lead-noleader__team", team.label), el("span", "lead-noleader__count", `${fmt(team.volunteers)} volunteers, nobody appointed over them`));
      list.append(item);
    }
    noLeader.append(list);
  }
  p.section.append(noLeader);
  return p.section;
}

function rosterTablePanel(rows) {
  const p = panel("Roster", { wide: true,
    info: "Sorted by how many roles a person holds, so the people we lean on hardest are at the top. Names appear on this dashboard and nowhere else, and they never leave it: not in an export, a copied table, or a saved prompt." });
  const entry = state.adapted.responses["people-leader-roster"];
  if (!entry) { p.body.append(unavailablePanel(state.adapted.unavailable["people-leader-roster"], { headline: "Roster" })); return p.section; }
  const people = rosterPeople(rows, bandIndex(state.adapted));
  if (!people.length) { p.body.append(ghost("Nobody matches the current filters.")); return p.section; }
  const tableRows = people.slice(0, 200).map((person) => ({
    cells: [
      person.name,
      person.branches.map((b) => BRANCHES[b].label).join(", ") || DASH,
      { node: el("span", null, String(person.roleCount)) },
      person.roles.map((r) => r.label).join(" · "),
    ],
  }));
  p.body.append(table(
    [{ label: "Name" }, { label: "Branch" }, { label: "Roles", numeric: true }, { label: "Detail" }],
    tableRows,
    { sortKey: "roles" },
  ));
  if (people.length > 200) p.body.append(el("p", "lead-more", `${fmt(people.length)} match. Showing 200. Narrow with a filter or search to reach the rest.`));
  return p.section;
}

/* The composition itself: KPI strip, then the fourteen panels, in the peg's own order. A flat
 * grid of peers -- `.lead-classic-grid` in leadership.css -- not a masonry (that was per-browser
 * state nobody else saw) and not numbered chapters (that asserted a sequence the peg never had). */
const PENDING_PANELS = Object.freeze([
  ["Age group", false],
  ["Gender", false],
  ["Ministry", false],
  ["Connect roles across age groups", true],
  ["Leaders by role", false],
  ["Leaders per ministry team", false],
  ["Leaders per cluster", false],
  ["Pastoral Care Structure — Connect Clusters", true],
  ["Span of care — people per cluster", true],
  ["Ministry Care Structure — Teams & Leaders", true],
  ["Ministry sign-ups by area", true],
  ["Leaders to raise for the people not yet in a group", true],
  ["Ministry teams that may need volunteers", false],
  ["Roster", true],
]);

function pendingPanelBody() {
  const wrap = el("div", "lead-markskel");
  for (const width of ["92%", "71%", "54%", "38%"]) {
    const band = el("span", "skeleton lead-markskel__band");
    band.style.setProperty("--lead-markskel-w", width);
    wrap.append(band);
  }
  return wrap;
}

function renderPendingClassic(host) {
  host.append(pendingNotice("Leadership readings"));
  const kpis = kpiStrip([
    { label: "Leaders in view", value: null, note: "Distinct people carrying responsibility in the selected campus." },
    { label: "Connect", value: null, note: "Pastoral care structure, from Connect Leader to Section Overseer." },
    { label: "Ministry team", value: null, note: "Serving structure, from Overall Head to Captain." },
    { label: "Lead in both", value: null, note: "People who carry responsibility in both structures." },
    { label: "Ministry only", value: null, note: "Serving leaders with no Connect responsibility." },
    { label: "People in Connect Groups", value: null, note: "People already on a Connect Group roster." },
  ]);
  // Keep a bounded mark skeleton, not an unavailable dash, on every rerender while the same
  // read is still in flight. Labels, notes and the controls around them remain real.
  for (const value of kpis.querySelectorAll(".kpi-tile__value")) {
    value.classList.remove("is-unavail");
    value.removeAttribute("title");
    value.replaceChildren(el("span", "skeleton lead-markskel__value"));
  }
  host.append(kpis);
  const grid = el("div", "lead-classic-grid");
  for (const [title, wide] of PENDING_PANELS) {
    const p = panel(title, { wide });
    p.body.append(pendingPanelBody());
    grid.append(p.section);
  }
  host.append(grid);
}

function renderClassic(host, rows) {
  const counts = headline(state.adapted, rows);
  if (!counts) {
    if (state.adapted.pending) {
      // The shell is a real reading before the graph data is a real reading. Keep the headings,
      // explanatory marks, KPI labels and bounded chart frames in place; only their marks wait.
      renderPendingClassic(host);
    } else {
      host.append(unavailablePanel(
        state.adapted.unavailable["people-leader-roster"]
        || "The roster came back at its row limit, so these counts could be short. They are withheld rather than shown low.",
        { headline: "Leaders in view" }));
    }
    return;
  }
  const chainForKpi = raiseChain(state.adapted, state.filters);
  /* EVERY KPI CARRIES ITS SHARE. A count on its own is a number; a count with "43% of view" is a
   * reading, and the peg prints that second line on all six tiles because the six are not
   * independent -- Connect, Ministry, Both and Ministry-only are all cuts of Leaders in view,
   * and without the denominator a reader has to divide in their head to see it. The share is of
   * the leaders currently in view, so it re-reads as the filters narrow. */
  const share = (n) => (Number.isFinite(n) && Number.isFinite(counts.leaders) && counts.leaders > 0
    ? `${Math.round((n / counts.leaders) * 100)}% of view`
    : "");
  host.append(kpiStrip([
    { label: "Leaders in view", value: counts.leaders, delta: "100% of this campus",
      note: "Distinct people. Leading three Connect Groups is one leader." },
    { label: "Connect", value: counts.connect, delta: share(counts.connect),
      note: "Pastoral care structure, Connect Leader up to Section Overseer.", state: "neutral" },
    { label: "Ministry team", value: counts.ministry, delta: share(counts.ministry),
      note: "Serving structure, Captain up to Overall Head.", state: "neutral" },
    { label: "Lead in both", value: counts.both, delta: share(counts.both),
      note: "Hold responsibility in both structures at once." },
    { label: "Ministry only", value: counts.ministryOnly, delta: share(counts.ministryOnly),
      note: "Serving leaders with no Connect responsibility." },
    { label: "People in Connect Groups", value: chainForKpi ? chainForKpi.total.inGroup : null,
      delta: chainForKpi && Number.isFinite(counts.connect) && counts.connect > 0
        ? `avg ${(chainForKpi.total.inGroup / counts.connect).toFixed(1)} per Connect leader` : "",
      note: chainForKpi ? "Already on a Connect Group roster." : (state.adapted.pending ? "Reading the leadership structure…" : (state.adapted.unavailable["people-connect-capacity"] || "This reading is unavailable.")) },
  ]));

  const grid = el("div", "lead-classic-grid");
  host.append(grid);

  /* 1. Age group -- GHOST FOR ABSENCE (ADR 0018). groupAge is null for every ministry-only
   * leader (221 people on prod): they are drawn as a distinct "Not measured" slice with the
   * reason beside them, never dropped and never folded into a real band. A band value that IS
   * present but not one of the closed, confirmed set (ageBandKey) gets the same ghost
   * treatment rather than a colour that would imply it is a band it is not -- BUG 3. */
  const ageDist = distinctByField(rows, (row) => {
    const raw = bandIndex(state.adapted)(row);
    return ageBandKey(raw) ? ageBandLabel(raw) : null;
  });
  grid.append(donutPanel("Age group",
    "This is the age band of the group a leader looks after, not the leader's own age. Leaders who only serve on a ministry team have no group to take a band from, so they show as Not measured rather than quietly disappearing.",
    ageDist.counts, ageDist.unknown, ageDist.total,
    { kind: "age", unknownReason: "These leaders either serve on a ministry team only, so there is no group to take a band from, or their group sits in a band we have not confirmed yet. We hold the number back rather than colour it into the wrong band." }));

  /* 2. Gender -- ghosted the same way if any row's gender is missing. */
  const genderDist = distinctByField(rows, (row) => row.gender || null);
  grid.append(donutPanel("Gender",
    "Distinct leaders by gender on file in Rock.",
    genderDist.counts, genderDist.unknown, genderDist.total,
    { kind: "gender", unknownReason: "No gender on file for this person in Rock." }));

  /* 3. Ministry -- teams grouped into families by stripping the leading campus short code
   * (MNL/BNE/SEL) and a trailing " Team" from the team's own name; what remains is the family.
   * No prod team name contains " - ", so the old prefix-before-separator heuristic never once
   * split a real name and just returned the whole string back as its own family of one --
   * BUG 2. "None" and anything that reduces to empty after stripping is not a family: it draws
   * as its own ghost "?" slice with a reason, never dropped and never folded into a real
   * family (ADR 0018). Counts are `leadersByContext`'s, summed per family, never recomputed. */
  {
    const perTeam = leadersByContext(rows, "ministry");
    const families = new Map();
    let familyTotal = 0;
    let familyUnknown = 0;
    for (const t of perTeam) {
      const family = ministryFamily(t.label);
      if (!family) { familyUnknown += t.people; familyTotal += t.people; continue; }
      families.set(family, (families.get(family) || 0) + t.people);
      familyTotal += t.people;
    }
    grid.append(donutPanel("Ministry",
      "Where leadership sits by ministry, not where the volunteers are. Teams are grouped by family: the campus code and a trailing \"Team\" are stripped from the name in Rock, and what is left is the family. A leader is counted once per team they hold, so someone leading two teams appears in both. Click a slice to filter the page to that family.",
      families, familyUnknown, familyTotal,
      { unknownReason: "Team name is \"None\", or reduces to nothing once the campus code and \" Team\" are stripped, so it cannot be assigned a family." }));
  }

  /* 4. Connect roles across age groups. */
  {
    const p = panel("Connect roles across age groups", { wide: true,
      info: "Read across a band to see how deep its tree goes. Many Connect Leaders and few Regional Leaders means there is no middle layer. Age comes from the group, not the leader." });
    p.body.append(connectByBandBody(rows));
    grid.append(p.section);
  }

  /* 5. Leaders by role, descending. */
  grid.append(leadersByRolePanel(rows));

  /* 6. Leaders per ministry team. Bounded rather than hard-cut (#765/#766): every team stays
   * reachable through "Show all (N)" instead of the list silently stopping at 14. */
  {
    const perTeam = leadersByContext(rows, "ministry");
    const p = panel("Leaders per ministry team",
      { info: "Leadership headcount, not volunteer headcount. Pair with the thin-teams panel below: a team can have plenty of leaders and no volunteers, or the reverse." });
    if (!perTeam.length) p.body.append(ghost("No ministry teams match the current filters."));
    else {
      const max = Math.max(...perTeam.map((t) => t.people));
      for (const team of perTeam) p.body.append(barRow(team.label, team.people, max, { tone: "ministry",
        selected: state.filters.team === team.label, onSelect: () => setFilters({ team: state.filters.team === team.label ? "" : team.label }) }));
      mountBoundedList(p.body, { defaultCount: 10 });
    }
    grid.append(p.section);
  }

  /* 7. Leaders per cluster. */
  {
    const perCluster = leadersByContext(rows.filter((r) => r.tier === "cluster" || r.tier === "regional"), "connect");
    const p = panel("Leaders per cluster",
      { info: "Pair with span of care below. Many leaders and few people means over-led; the reverse means stretched." });
    if (!perCluster.length) p.body.append(ghost("No clusters match the current filters."));
    else {
      const max = Math.max(...perCluster.map((c) => c.people));
      for (const cluster of perCluster) p.body.append(barRow(cluster.label, cluster.people, max, { tone: "connect" }));
      mountBoundedList(p.body, { defaultCount: 10 });
    }
    grid.append(p.section);
  }

  /* 8. Pastoral Care Structure -- Connect Clusters, with its own in-widget filters. */
  grid.append(careStructurePanel());

  /* 9. Span of care -- people per cluster. Prominent by construction: `panel(..., { wide })`. */
  grid.append(spanOfCarePanel());

  /* 10. Ministry Care Structure -- Teams & Leaders, with its own in-widget filters. */
  grid.append(ministryStructurePanel());

  /* 11. Ministry sign-ups by area. */
  grid.append(servingAreasPanel());

  /* 12. Leaders to raise for the people not yet in a group. */
  grid.append(raiseChainPanel());

  /* 13. Ministry teams that may need volunteers. */
  grid.append(volunteersNeededPanel());

  /* 14. Roster. */
  grid.append(rosterTablePanel(rows));
}

/* ------------------------------------------------------------------------------ the colophon
 * A colophon is prose, so it does not occupy layout (DESIGN.md). It is one `(i)` on the surface
 * title, which is the thing it is about. */
function colophonText() {
  const campus = CAMPUSES.find((c) => c.id === state.filters.campus);
  const parts = [
    `Scope. ${campus ? campus.label : state.filters.campus}. Campus comes from each person's profile campus, so someone tagged at two campuses is counted at their primary one.`,
    "Counting. Every headline number counts distinct people. Someone leading three Connect Groups is one leader. Captain counts as a leader even though Rock does not flag the role as one. Potential Captain counts as bench and is left out of the totals.",
    "Age group. From where the group sits in the Connect tree, not the leader's own age, so a 24-year-old leading a Youth group counts as Youth. This is deliberately different from the age filter on Pathways, which is the person's own, and the two never carry across a tab switch.",
    "Names. Names are drawn on this dashboard and on no other surface in the suite. They never enter an export, a copied table, a saved prompt, or a link.",
  ];
  if (state.bundle && state.bundle.fictional) {
    parts.push("This data is made up. Every name and number on this page was created for practice, and none of it came from Rock.");
  }
  const pending = Object.keys(state.adapted.unavailable).length;
  if (pending) {
    parts.push(`Not shown. ${pending} ${pending === 1 ? "reading is" : "readings are"} unavailable. Each says why where it would have been drawn, rather than reading as zero.`);
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------------------- mode switch --
 * The shared `modeSwitch` widget (classic-widgets.mjs) drawn with its Creative half disabled
 * rather than removed. Removing it would say "there is only Classic"; disabling it with a reason
 * says "Creative exists, is coming, and is not yet trustworthy enough to ship" — which is the
 * true statement and the one the operator asked this surface to make (#638).
 *
 * A native `disabled` button is avoided on purpose: most browsers refuse it hover AND focus, so
 * the shared tooltip could never open and a reader would see a greyed control with no way to
 * learn why. Instead the button stays focusable and hoverable, carries `aria-disabled="true"`
 * (the accessible-name-safe way to say "present, not actionable"), and its click is caught and
 * swallowed in the CAPTURE phase, before `modeSwitch`'s own bubble-phase listener ever sees it —
 * so the control cannot become activating by accident if that widget's internals change. */
function mountModeSwitch() {
  const group = modeSwitch(state.mode, (next) => {
    if (next === state.mode || next === "creative") return;
    state.mode = next;
    writeHash();
    render();
  });
  const creativeBtn = group.querySelector('.mode-switch__btn[data-mode="creative"]');
  if (creativeBtn) {
    creativeBtn.classList.add("mode-switch__btn--disabled");
    creativeBtn.setAttribute("aria-disabled", "true");
    on(creativeBtn, "click", (event) => { event.stopImmediatePropagation(); event.preventDefault(); }, true);
    tip(creativeBtn, { label: "Creative", value: "Not available yet", comparison: CREATIVE_DISABLED_REASON });
  }
  return group;
}

/* ------------------------------------------------------------------------------- the render */

function render() {
  const root = state.root;
  const scroll = window.scrollY;
  const panelHost = root.querySelector(".lead-main");
  if (!panelHost) return;

  /* CLASSIC is the only mode a reader can ever reach right now (Creative is disabled above), but
   * the dataset attribute is still driven from `state.mode` rather than hard-coded, so the CSS
   * contract (`[data-mode="classic"]` squares everything off per #638) and a future lift of the
   * disable both work off one signal instead of two. */
  root.dataset.mode = state.mode;

  /* The console is rebuilt with the rest, so its selects always reflect the state the URL holds.
   * Its open/closed state lives on the root and survives, because a reader on mobile who changes
   * one filter has not asked for the sheet to close. */
  const consoleHost = root.querySelector(".lead-console-host");
  consoleHost.replaceChildren(buildConsole());

  const chipHost = root.querySelector(".lead-chip-host");
  chipHost.replaceChildren(chips());

  const tools = root.querySelector(".lead-masthead__tools");
  if (tools) {
    tools.replaceChildren();
    /* The copy prompt reads the view through an accessor rather than a snapshot, so it packages
     * what is on screen when the reader presses it. The roster section is marked personLevel and
     * is skipped by the packager outright: names are drawn here and never travel. */
    mountCopyPrompt(tools, {
      view: () => state.view,
      announce: (message) => state.status && state.status.announce(message),
      align: "end",
    });
    /* The package sits beside the prompt, both at the masthead's end edge: one artifact per
     * surface, not per widget, so it belongs to the page rather than to a chapter. */
    mountPackageControl(tools, { surfaceId: "favor-leadership", align: "end" });
    tools.append(infoMark(colophonText(), "About this dashboard"));
  }

  const count = activeFilterCount(state.filters);
  const badge = root.querySelector(".console-toggle-bar__count");
  if (badge) {
    badge.textContent = count ? String(count) : "";
    badge.hidden = count === 0;
  }

  const rosterRows = rowsOf(state.adapted, "people-leader-roster");
  const rows = rosterRows ? filterRoster(rosterRows, state.filters, { bandOf: bandIndex(state.adapted) }) : [];

  /* The view is rebuilt BEFORE the panels are, because each panel's export rail registers a
   * reader against it. An artifact then carries exactly the rows on screen, and never the rows
   * that were on screen one filter ago -- including each panel's own LOCAL filter and sort
   * (#766), not only the global console's. */
  const careLocal = state.adapted ? applyCareLocal(careStructure(state.adapted, state.filters), panelFilterState.care) : null;
  const teamsLocal = state.adapted ? applyMinistryLocal(ministryTeams(state.adapted, state.filters), panelFilterState.ministry) : null;
  state.view = buildView({
    adapted: state.adapted,
    filters: state.filters,
    rows,
    areaRegistry: state.areas,
    generatedAt: state.bundle && state.bundle.generatedAt,
    fictional: Boolean(state.bundle && state.bundle.fictional),
    careRows: careLocal,
    teamRows: teamsLocal,
  });

  panelHost.replaceChildren();
  if (state.mode === "creative") {
    /* UNREACHABLE while Creative is disabled (#638). Kept rather than deleted: the five-chapter
     * narrative below is the shape the deferred redesign starts from, not scrap. See
     * docs/plans/2026-09-18-leadership-creative-redesign-deferred.md for the follow-up that
     * decides what of this survives. */
    renderHeadline(panelHost, rows);
    renderChapterOne(panelHost, rows);
    renderChapterTwo(panelHost);
    renderChapterThree(panelHost);
    renderChapterFour(panelHost);
    renderRoster(panelHost, rows);
  } else {
    renderClassic(panelHost, rows);
  }
  mountPalette();
  /* The panels were just replaced, so every mark went with them. Re-run the find against what is
   * on screen NOW: a reader who filters while a search is open should still see their matches,
   * and should see the count fall to whatever survived the filter. */
  applyFind();
  window.scrollTo({ top: scroll });
}

function skeleton(root) {
  root.classList.add("lead");
  root.dataset.console = "closed";
  root.replaceChildren();

  if (!root.closest?.(".pshell")) {
    const trail = el("div", "lead-trail");
    mountBreadcrumbs(trail, { currentSurface: "pathways" });
    root.append(trail);
  }

  /* The masthead is a title, the question, and two marks. The glossary and the colophon are
   * prose, so neither occupies layout: both live behind the `(i)` on the title. */
  const head = el("header", "lead-masthead");
  const title = el("h1", "lead-masthead__title", "Leadership");
  title.append(infoMark(
    "Favor organises people two ways and this dashboard keeps them separate throughout. Connect "
    + "is the pastoral care structure, meaning how everyone is cared for in groups. Ministry is "
    + "the serving structure, meaning the teams that run services and events. The same person "
    + "often appears in both. A Connect Group is the smallest unit, a group of people cared for "
    + "by one or two Connect Leaders. A Region is a handful of those, overseen by a Regional "
    + "Leader. A Cluster is a group of regions, overseen by a Cluster Head. A Section Overseer "
    + "has oversight across a whole age band, and there is no such role in Rock: the tier is "
    + "whoever leads that band's own section group. A Lay Pastor sits beside the Connect ladder "
    + "rather than on it, and nobody holds both. A Ministry team is led by an Overall Head, then "
    + "Unit Heads, Team Leads, and Captains, with Potential Captain as the bench. Everything on "
    + "this page is clickable, and the chips under the title clear what you have chosen.",
    "How to read this dashboard"));
  head.append(title);
  head.append(el("p", "lead-masthead__question",
    "Who carries responsibility, where are we stretched, where are the gaps, and how many leaders must we raise?"));

  /* The masthead tools: the copy prompt, and the colophon behind its own mark. */
  const tools = el("div", "lead-masthead__tools");
  tools.id = "lead-masthead-tools";
  head.append(tools);
  /* THE FURNITURE BAND, beside the tools and deliberately NOT inside them. render() replaces
   * `.lead-masthead__tools` wholesale on every filter change; anything mounted there would be
   * rebuilt, and a zoom control rebuilt mid-read would silently snap the reader back to 100%.
   * This host is built once and survives every render, so presentation state lives as long as
   * the page does (#768). */
  const furniture = el("div", "lead-masthead__furniture");
  furniture.id = "lead-masthead-furniture";
  head.append(furniture);
  root.append(head);

  root.append(el("div", "lead-chip-host"));

  /* The console sits on the RIGHT, and the reading occupies the left.
   *
   * On a dashboard the reader's eye starts at the content, not at the controls: they arrive to
   * read a number and only then narrow it. A left rail puts the controls in the first place the
   * eye lands and pushes the reading to a second column that starts 20rem in. On the right the
   * chapters begin at the page's own left edge, where the breadcrumb trail and the masthead
   * already are, so the whole surface shares one text edge.
   *
   * DOM order puts the main column FIRST, so a keyboard or screen-reader pass reaches the
   * reading before the filters, and CSS does the placement. Ordering by appearance instead would
   * make every tab press walk twelve controls before the first number. */
  /* THE CONSOLE HANDLE, built here and inserted BEFORE the layout.
   *
   * It used to be appended last, after the layout and the backdrop. `position: sticky` sticks a
   * box inside its own scrolling ancestor only for as long as that box's PARENT is on screen --
   * and this one's flow position is past the end of a 7,700px page, so it stuck to nothing and
   * a desktop reader never saw it at all. Before the layout, it stays pinned beside the reading
   * the whole way down, which is where Pathways puts its own (`.sidebar-toggle-bar`). */
  const bar = el("div", "console-toggle-bar");
  const toggle = el("button", "toggle-btn");
  toggle.type = "button";
  toggle.id = "btn-toggle-sidebar";
  toggle.setAttribute("aria-controls", "lead-filter-sidebar");
  toggle.setAttribute("aria-expanded", "false");
  toggle.append(el("span", "toggle-btn__label", "Filter console"));
  const badge = el("span", "console-toggle-bar__count");
  badge.hidden = true;
  toggle.append(badge);
  const chevron = el("span", "chevron");
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "\u25B8";
  toggle.append(chevron);
  on(toggle, "click", () => {
    if (root.dataset.console === "open") closeConsole(); else openConsole();
  });
  bar.append(toggle);
  root.append(bar);

  const layout = el("div", "lead-layout");
  layout.append(el("div", "lead-main"));
  layout.append(el("div", "lead-console-host"));
  root.append(layout);

  const backdrop = el("div", "filter-backdrop");
  backdrop.id = "filter-backdrop";
  backdrop.hidden = true;
  on(backdrop, "click", () => closeConsole());
  root.append(backdrop);

  on(document, "keydown", (event) => {
    if (event.key === "Escape" && root.dataset.console === "open") closeConsole();
  });
}

/* -------------------------------------------------------------- the production hold (#638) --
 * WHY THIS EXISTS, AND WHEN IT LEAVES
 * ============================================================================================
 * Leadership shipped to prod as a beta on 2026-09-17 and is now being consolidated onto Pas.
 * John's Manila peg (#638): the stepped readings, the part-to-whole charts, the peg's own
 * composition grammar, and the readings that currently render as absences. That is a whole
 * body rewrite, not a patch, and the operator's ruling (2026-09-18) is that prod should say so
 * rather than keep serving a half-translated page to staff who will read it as the answer.
 *
 * So the surface HOLDS on production and stays live everywhere else. Preview is where the
 * rewrite is iterated, which is the whole point of the split: one asset, two readings, and the
 * reader on prod is told plainly which one they are looking at.
 *
 * THE GATE IS THE HOST, NOT THE BUILD. `techstats-boot.mjs` already discriminates this way and
 * for the same reason: preview and prod are deployed from identical bytes, so a build-time flag
 * would hold both. Reading the host is the only signal that can differ between them.
 *
 * TO LIFT IT: delete `PROD_HOST`, `holdingSurface`, this comment, and the two lines in `boot`
 * that call it. Nothing else references them. That is the whole removal, deliberately, so the
 * hold cannot rot into a permanent branch in the runtime.
 *
 * The data is NOT gated here. The wrapper's six reads still run on prod and their rows still
 * reach the page source, exactly as they did yesterday; holding the render neither adds nor
 * removes that exposure (ADR 0023). Gating the Lava needs a server-side environment signal the
 * wrapper does not have yet, and is tracked separately rather than smuggled into a hold. */

const PROD_HOST = "rock.example.invalid";

function onProduction() {
  return typeof globalThis !== "undefined" && globalThis.location?.hostname === PROD_HOST;
}

/* The drawing. It is a STATEMENT OF INTENT and carries no figures, because there is nothing
 * here it could yet truthfully count — the same rule the Multiplication watershed follows.
 *
 * What it draws is the grammar being restored: an ordered descent, where the narrowing itself
 * is the reading, beside a part-to-whole arc. Those are the two forms #638 says were designed
 * away, so the page that announces the rewrite shows them rather than describing them.
 *
 * One rung is drawn hollow. A tier nobody measures has to have a FORM from the first sketch or
 * it gets retrofitted later and reads as an error (ADR 0018). */
function holdingFigure() {
  const NS = "http://www.w3.org/2000/svg";
  const figure = document.createElement("figure");
  figure.className = "lead-hold__figure";

  const frame = document.createElementNS(NS, "svg");
  frame.setAttribute("viewBox", "0 0 620 250");
  frame.setAttribute("role", "img");
  frame.setAttribute("aria-label",
    "A stylised sketch of the two chart forms being restored. On the left, five bars step down "
    + "from widest to narrowest, so the narrowing itself is the reading; the fourth is drawn "
    + "hollow, meaning a tier nobody measures yet. On the right, a ring divided into three "
    + "unequal arcs. An illustration of the grammar, not a chart.");

  const add = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    frame.append(node);
    return node;
  };

  /* The descent. Widths narrow and each bar is indented under the one above, so the shape reads
   * as one ordered progression rather than five independent categories. */
  const STEPS = [
    { y: 28, w: 336, x: 8, hollow: false },
    { y: 70, w: 268, x: 34, hollow: false },
    { y: 112, w: 200, x: 60, hollow: false },
    { y: 154, w: 132, x: 86, hollow: true },
    { y: 196, w: 76, x: 112, hollow: false },
  ];
  for (const step of STEPS) {
    add("rect", {
      class: step.hollow ? "lead-hold__step lead-hold__step--unmeasured" : "lead-hold__step",
      x: step.x, y: step.y, width: step.w, height: 24, rx: 3,
    });
  }

  /* The part-to-whole arc: one ring, three unequal slices, drawn as stroked arcs so the ring
   * inherits its weight from the same scale as the bars. Geometry is hand-computed rather than
   * generated, because this figure must never look like it was fed data. */
  const CX = 505, CY = 127, R = 76;
  const point = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
  };
  const arc = (from, to, cls) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    add("path", {
      class: cls,
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    });
  };
  arc(3, 172, "lead-hold__arc lead-hold__arc--connect");
  arc(178, 292, "lead-hold__arc lead-hold__arc--ministry");
  arc(298, 357, "lead-hold__arc lead-hold__arc--both");

  figure.append(frame);
  return figure;
}

/* A page that is not ready should be SHORT. Finance Tithes set that shape and Multiplication
 * kept it, so Leadership keeps it too: a status word, a title, the question this dashboard
 * answers, one line about what is being built, the drawing, and one way out. Everything a
 * reader might want beyond that lives behind the mark, because prose does not occupy layout. */
function holdingSurface(root) {
  root.classList.add("lead", "lead--hold");
  root.replaceChildren();
  applyTheme(root, initialTheme({ root, surface: "leadership" }));

  if (!root.closest?.(".pshell")) {
    const trail = el("div", "lead-trail");
    mountBreadcrumbs(trail, { currentSurface: "pathways" });
    root.append(trail);
  }

  const head = el("header", "lead-hold");
  head.append(el("p", "lead-hold__status", "Status: under construction"));

  const title = el("h1", "lead-hold__title", "Leadership is being rebuilt");
  title.append(infoMark(
    "This dashboard shipped as a beta, and we are rebuilding its main body now. Several of its "
    + "charts read best as an ordered descent, where the narrowing itself is the point, and "
    + "several are part-to-whole shapes that a row of bars answers more slowly. The first "
    + "version flattened both, and left a few readings showing as blanks. That is what we are "
    + "fixing. Everything around it stays the same: the breadcrumbs, the filter console, the "
    + "palette, Classic mode, exports, and the copy prompt are all unchanged. While the work "
    + "runs, we are holding this page rather than serving you a half-finished one. Pathways and "
    + "Multiplication are unaffected and open from the tabs above.",
    "Why Leadership is holding"));
  head.append(title);

  head.append(el("p", "lead-hold__question", "Who carries responsibility now?"));
  head.append(el("p", "lead-hold__line",
    "We are rebuilding the body of this dashboard: its stepped readings, its part-to-whole "
    + "charts, and the figures that currently have no home."));

  const back = el("a", "lead-hold__back", "Return to Executive Dashboards");
  back.href = "/exec";
  head.append(back);

  root.append(head);
  root.append(holdingFigure());

  state.root = root;
  state.tooltip = mountTooltipDelegate(root, {
    surface: "leadership",
    selector: "[data-tip]",
    content: (node) => tooltipContent({
      label: node.dataset.tipLabel || null,
      comparison: node.dataset.tipCompare || null,
    }),
  });
}

/* ---------------------------------------------------------------------- the mountable contract */

/* Shared host chrome is measured by `trackHostChrome(root)` from #808. It writes
 * `--host-chrome-bottom` for the status chip and the Leadership console derives its own
 * `--console-top` from that same contract in CSS; there is no surface-specific viewport probe. */
/* ---------------------------------------------------- the deferred first paint (#543) --
 *
 * THE ONE NETWORK CALL THIS ISLAND MAKES. docs/decisions/0024-pathways-deferred-first-paint.md
 * is the exemption; ADR 0015's "islands never fetch" holds everywhere else on this surface.
 *
 * Why it exists: Rock sends the browser no byte of a page until the block that owns them has
 * rendered, and this tab's six registered-read calls ran in series before the first byte
 * left the server. Opening the Leadership tab is a real page load (the tab lives in the query
 * string so the server can render only that tab's reads), so every visit paid the whole bill
 * with nothing on screen. The wrapper now runs none of them on the page request and publishes
 * an address instead; the chrome paints and the readings land in it.
 *
 * What bounds it: the address comes from the page's own #leadership-deferred node and must be
 * RELATIVE -- a bare query string against the page the reader is already on. No host, no path,
 * no API. The response is the same page under the same Rock authorization, so it can only ever
 * contain what this reader was already entitled to read inline.
 *
 * This helper is duplicated from pathways-boot.mjs rather than shared. That is deliberate:
 * apps/shared/ may never contain a network call (ADR 0015, enforced by
 * tests/test_shared_modules.py with no exception mechanism by design), and moving twenty lines
 * there to avoid a copy would cost that guarantee for every island at once. Two small copies,
 * each fenced by its own island's declaration, is the cheaper trade.
 */
function deferredReadAddress() {
  const node = document.getElementById("leadership-deferred");
  if (!node || node.type !== "application/json") return null;
  let address = null;
  try {
    address = JSON.parse(node.textContent).dataUrl;
  } catch {
    return null;
  }
  /* A relative query string, and nothing else. "//host", "https://host" and "/some/path" are
   * all rejected here, so the only thing this island can read is the page it is already on. */
  return typeof address === "string" && address.startsWith("?") ? address : null;
}

/* The six registered reads, asked for ONE PER REQUEST and one at a time.
 *
 * SEQUENTIAL, NOT PARALLEL, AND THAT IS NOT A COMPROMISE. Rock runs on ASP.NET session
 * state, which holds a per-session lock for the length of each request, so six parallel
 * requests from one reader queue on the server anyway -- a burst that buys nothing and costs
 * six concurrent page renders.
 *
 * WHY THIS SURFACE RENDERS ONCE AT THE END AND PATHWAYS RENDERS AS IT GOES. Pathways has an
 * explicit chapter-to-query map (SECTION_READS), so it knows exactly which station a landed
 * read completes and can un-stub that one. Leadership has no such map: its fourteen panels
 * read the adapted shape, and which panel needs which query is expressed only inside each
 * panel builder. Rendering early here would show `adapt()`'s "not included in the page's
 * data" copy on every panel whose read is merely still in flight -- a wrong reading, not a
 * partial one. Writing a panel-to-query table in this file to avoid that would be a second
 * source of truth that drifts from the builders the first time a panel changes. So the reads
 * stream, the render waits, and what the reader gains here is the surface and the console
 * immediately plus one slow read no longer taking the other five down with it. */
const DEFERRED_READS = Object.freeze([
  "people-leader-tier",
  "people-ministry-structure",
  "people-connect-capacity",
  "people-serving-signups",
  "people-leader-span-of-care",
  "people-leader-roster",
]);

/* The campus the wrapper resolved, so a partial bundle is labelled with the scope actually
 * asked for rather than defaulting to Manila behind the reader's back. */
function deferredCampus() {
  const node = document.getElementById("leadership-deferred");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent).campus || null;
  } catch {
    return null;
  }
}

function isCurrentMount(root, generation) {
  return state.root === root && state.mountGeneration === generation;
}

async function fetchDeferredPart(address, queryId, { fresh = false, signal = null } = {}) {
  /* Nothing is configured beyond these two lines. fetch already defaults to same-origin, so
   * the reader's existing Rock session cookie rides along and nothing else does. The signal is
   * only a local cancellation handle: it never carries credentials or changes the read. */
  const response = await fetch(`${address}&q=${encodeURIComponent(queryId)}${fresh ? "&fresh=1" : ""}`, {
    cache: "no-store",
    headers: { Accept: "text/html" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`deferred leadership read answered ${response.status}`);
  /* Parsed inert with DOMParser: nothing in that document runs. */
  const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
  const island = parsed.getElementById("leadership-data");
  if (!island) throw new Error("deferred leadership read returned no data island");
  const payload = JSON.parse(island.textContent);
  if (!payload || payload.queryId !== queryId) throw new Error("deferred read answered a different query");
  /* The wrapper sends {readAt, payload}. readAt is written INSIDE the cache block, so for a
   * memoised read it is when the entry was filled, not when it was served. */
  const envelope = payload.response;
  if (!envelope || typeof envelope !== "object" || !("payload" in envelope)) {
    throw new Error("deferred read did not carry a read stamp");
  }
  return { response: envelope.payload, readAt: envelope.readAt || null };
}

async function fetchDeferredBundle(address, options = {}) {
  const root = options.root || state.root;
  const generation = options.generation ?? state.mountGeneration;
  const signal = options.signal || (state.abortController && state.abortController.signal);
  const current = () => !root || isCurrentMount(root, generation);
  const responses = {};
  const readAt = [];
  let failures = 0;
  for (const queryId of DEFERRED_READS) {
    if (!current()) return null;
    try {
      let part = await fetchDeferredPart(address, queryId, { signal });
      if (!current()) return null;
      /* A refusal is never accepted from the cache: four of this tab's six reads are memoised
       * for ten minutes, refusals included, so one transient timeout used to blank a panel
       * long after the cause had gone. fresh=1 runs the read with no cache around it. */
      if (part.response && part.response.status === "refused") {
        const freshOptions = { fresh: true };
        freshOptions.signal = signal;
        part = await fetchDeferredPart(address, queryId, freshOptions);
        if (!current()) return null;
      }
      responses[queryId] = part.response;
      if (part.readAt) readAt.push(part.readAt);
    } catch {
      if (!current()) return null;
      /* One read failing is not the page failing. Record the refusal, let that panel carry
       * its own reason through adapt(), and keep asking for the rest. */
      failures += 1;
      responses[queryId] = { status: "refused", queryId, code: "query-failed" };
    }
  }
  if (!current()) return null;
  if (failures === DEFERRED_READS.length) throw new Error("every deferred leadership read failed");
  /* THE OLDEST READ WINS. The page is only as fresh as its stalest panel, and an overstated
   * freshness claim is worse than none because it is the one a reader acts on. */
  const oldest = readAt
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0];
  return {
    schemaVersion: 1,
    dashboardId: "favor-leadership",
    mode: "live",
    campus: deferredCampus() || "MNL",
    responses,
    unavailable: {},
    readAt: readAt.length === Object.keys(responses).length && Number.isFinite(oldest)
      ? new Date(oldest).toISOString()
      : null,
  };
}

/* The serving-area map is static JSON the wrapper writes into the page; it costs no read, so
 * it stays on the page request and is picked up here rather than travelling with the bundle. */
function pageServingAreas() {
  const node = document.getElementById("leadership-serving-areas");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
}

/* REPO RULE (operator, 2026-09-21): when a skeleton is needed in order to lazy load, ONLY
 * THE GRAPHS AND BARS are skeleton. render() has already drawn the real surface -- the
 * breadcrumb trail, the masthead, every panel and its real heading, and the whole filter
 * console -- so this replaces only what lives INSIDE each panel: the marks. The reader can
 * already be filtering while the six reads run, and moving to this tab does not wait on a
 * full fetch. A skeleton over a control is a control you took away.
 *
 * Two earlier drafts got this wrong: one drew the masthead as shimmer, the other drew four
 * flat rows that looked nothing like the grid of headed panels that actually arrives.
 *
 * No number, label or axis goes in these: a placeholder a reader can mistake for a reading is
 * worse than an empty panel (ADR 0018). render() replaces each body when the bundle lands. */
function markPanelBodiesPending(root) {
  for (const body of root.querySelectorAll(".lead-panel__body")) {
    const wrap = el("div", "lead-markskel");
    /* Four descending bands read as "a chart is coming here" without claiming which chart.
     * The real panels hold bar rows, donuts and tables; a band is the honest common shape. */
    for (const width of ["92%", "71%", "54%", "38%"]) {
      const band = el("span", "skeleton lead-markskel__band");
      band.style.setProperty("--lead-markskel-w", width);
      wrap.append(band);
    }
    body.replaceChildren(wrap);
  }
  /* A tile's VALUE is a mark too. Its label is real and already correct, so only the number
   * is stubbed -- the reader still learns what this tile is going to tell them. */
  for (const value of root.querySelectorAll(".kpi-tile__value")) {
    value.classList.remove("is-unavail");
    value.removeAttribute("title");
    value.replaceChildren(el("span", "skeleton lead-markskel__value"));
  }
}

/* ------------------------------------------------------- shell furniture (#767, #768) ------
 * Two controls that belong to the PAGE rather than to any reading: the section navigator and
 * the zoom. Both are mounted once, after the first render, and neither is touched again by
 * render() — they hold presentation state only, and a control that resets itself every time a
 * filter changes is a control nobody trusts.
 *
 * Neither reads data. The navigator derives its menu from the headings already on screen and
 * re-derives it when `.lead-main` is replaced; the zoom scales `.lead-main` and nothing else,
 * so the console, the chip, the trail, this masthead and Rock's own chrome keep their size.
 */
function mountShellFurniture(root) {
  const main = root.querySelector(".lead-main");

  /* skeleton() rebuilds `.lead-masthead__furniture` and `.lead-main` from scratch on every
   * boot() call, including a Retry after a failed deferred read (`action: { run: () =>
   * boot(root, null) }` below). A leftover `state.zoom`/`state.sectionNav` from the PRIOR boot
   * still points at the now-detached old nodes; destroy it first so this mount is never
   * skipped against DOM that no longer exists on the page. */
  if (state.zoom && typeof state.zoom.destroy === "function") state.zoom.destroy();
  state.zoom = null;
  if (state.sectionNav && typeof state.sectionNav.destroy === "function") state.sectionNav.destroy();
  state.sectionNav = null;

  const furniture = root.querySelector(".lead-masthead__furniture");
  if (furniture && main) {
    state.zoom = mountZoom(furniture, {
      target: main,
      /* quiet() is the right voice here: the percentage is already printed on the middle button,
       * so a sighted reader has seen it. The chip would be a second copy of a sentence the
       * control itself is saying (ux-bar §5). */
      announce: (message) => state.status && state.status.quiet(message),
    });
  }

  if (main) {
    state.sectionNav = mountSectionNav(root, {
      host: root,
      watch: main,
      sectionSelector: ".lead-panel",
      headingSelector: ".lead-panel__title",
      idPrefix: "lead-section",
      label: "Sections",
      panelLabel: "Jump to a section",
      emptyText: "The readings have not arrived yet.",
      announce: (message) => state.status && state.status.quiet(message),
    });
  }
}

export async function boot(root = document.getElementById("leadership-root"), suppliedBundle = null) {
  if (!root) return;
  // A retry or an in-place tab remount can reuse the same DOM node. End the previous generation
  // before replacing it so its deferred reads cannot write into this mount's status or panels.
  if (state.root) teardown(state.root);
  if (state.abortController) state.abortController.abort();
  state.mountGeneration += 1;
  const generation = state.mountGeneration;
  state.abortController = typeof AbortController === "function" ? new AbortController() : null;
  /* THE HOLD IS LIFTED (#638). Production served `holdingSurface()` while the body of this
   * dashboard was rewritten, because a half-translated page that looks finished is worse
   * than a page that says it is being rebuilt. The rewrite has shipped and been read
   * against live Rock data on preview, so production renders the dashboard now.
   *
   * `holdingSurface` and `onProduction` are kept rather than deleted: they are how this
   * surface takes itself off the air, and the next time it needs to, the mechanism should
   * already exist and already be the one that was used before. */
  state.root = root;
  state.bundle = suppliedBundle || window.__FAVOR_LEADERSHIP_BUNDLE__ || null;

  readHash();
  /* The reader's stored palette choice, applied before first paint so the surface never flashes
   * a palette they did not pick. `initialTheme` reads the seed the host may have set and then
   * their own stored preference; a null result leaves the stylesheet's own default in place. */
  applyTheme(root, initialTheme({ root, surface: "leadership" }));
  skeleton(root);

  /* #543. The address is resolved here but NOT read yet: the whole surface renders first,
   * below, and only then are the six reads fetched. See markPanelBodiesPending(). */
  const deferredAddress = state.bundle ? null : deferredReadAddress();
  /* pending: true means "about to fetch, nothing asked for yet" -- distinct from a bundle that
   * was truly fetched and truly came back without a query (#764). */
  state.adapted = adapt(state.bundle, { pending: Boolean(deferredAddress) });
  state.areas = (state.bundle && state.bundle.servingAreas)
    || pageServingAreas()
    || window.__FAVOR_SERVING_AREAS__
    || null;

  state.status = mountStatus(root, { label: "Dismiss" });
  state.chromeStop = trackHostChrome(root);
  state.exports = createExportRegistry();
  /* One delegated listener for every rail on the surface, for the same reason the readout is
   * delegated: the panels are rebuilt on every filter change. The delegation refuses a section
   * that could carry a person before it writes a single byte. */
  bindExportDelegation(root, state.exports, {
    view: () => state.view,
    announce: (message) => state.status && state.status.announce(message),
    /* The .json package is one artifact for the whole surface, built from the same view the
     * copy prompt reads. The roster is personLevel, so the packager skips it: names are drawn
     * here and never travel (ADR 0023). */
    package: () => buildDashboardPackage(state.view),
  });
  /* One delegate for the whole surface. It is mounted BEFORE the first render and survives every
   * re-render, because it listens on the root rather than on the marks. */
  if (MOBILE.addEventListener && !state.breakpointBound) {
    state.breakpointBound = true;
    MOBILE.addEventListener("change", () => { state.paletteHost = null; render(); });
  }

  /* The shared Classic widgets (tables, sparklines) mount their own tooltip layer, and by
   * default they mount it on document.body -- outside this stylesheet's `.lead` scope, where
   * none of its `.dashboard-tip` rules can reach it. Pointing that layer at this root is what
   * makes an unavailable table cell open the same card as every other mark on the page instead
   * of a line of unstyled text. */
  setClassicTooltipRoot(root);

  state.tooltip = mountTooltipDelegate(root, {
    surface: "leadership",
    selector: "[data-tip]",
    content: (node) => tooltipContent({
      label: node.dataset.tipLabel || null,
      value: node.dataset.tipValue || null,
      comparison: node.dataset.tipCompare || null,
      unit: node.dataset.tipUnit || null,
      swatchToken: node.dataset.tipSwatch || null,
    }),
  });
  render();
  mountShellFurniture(root);

  /* THE SURFACE IS UP. Now, and only now, the reads. Everything a reader can act on is
   * already on screen and already working; the marks fill in behind them. */

  if (deferredAddress) {
    markPanelBodiesPending(root);
    if (state.status) state.status.busy("Reading the leadership structure\u2026");
    try {
      const bundle = await fetchDeferredBundle(deferredAddress);
      /* This mount may have been torn down (a tab switch away and back) while the read was in
       * flight -- `state` is a module singleton, so a stale promise from an earlier boot() must
       * never touch the CURRENT mount's status chip or re-render a root it no longer owns
       * (#764: this is how "Reading the leadership structure…" could get left stuck, or a
       * stale success could clear a newer mount's still-in-flight busy state). */
      if (!bundle || !isCurrentMount(root, generation)) return;
      state.bundle = bundle;
      state.adapted = adapt(state.bundle);
      state.areas = (state.bundle && state.bundle.servingAreas) || state.areas;
      render();
      if (state.status) state.status.quiet("Leadership loaded.");
    } catch {
      if (!isCurrentMount(root, generation)) return;
      /* The reads failed after the surface was already up. Put the null bundle back through
       * adapt(), which renders every reading as an absence WITH ITS REASON rather than
       * leaving a permanent shimmer, and offer the reader a way to try again. */
      state.bundle = null;
      state.adapted = adapt(null);
      render();
      if (state.status) {
        state.status.fail("The leadership readings could not be loaded.", {
          action: { label: "Retry", run: () => boot(root, null) },
        });
      }
    }
  }

  state.hashTimer = null;
  on(window, "hashchange", () => {
    const before = JSON.stringify(state.filters);
    readHash();
    if (JSON.stringify(state.filters) !== before) render();
  });
}

export function teardown(root = state.root) {
  // A stale shell generation may still call teardown with its detached host after a newer boot
  // has claimed the module singleton. It must not tear down that newer root.
  if (root && state.root && root !== state.root) return;
  state.mountGeneration += 1;
  if (state.abortController) state.abortController.abort();
  state.abortController = null;
  if (state.chromeStop) state.chromeStop();
  state.chromeStop = null;
  for (const [target, type, handler, options] of state.listeners) {
    target.removeEventListener(type, handler, options);
  }
  state.listeners = [];
  if (state.status && typeof state.status.destroy === "function") state.status.destroy();
  state.status = null;
  if (state.tooltip && typeof state.tooltip.destroy === "function") state.tooltip.destroy();
  state.tooltip = null;
  /* The Classic layer lives in this root, so it has to be released with it: the shell unmounting
   * this tab would otherwise leave the singleton pointing at a detached node. */
  setClassicTooltipRoot(null);
  if (state.swatch && state.swatch.element) state.swatch.element.remove();
  state.swatch = null;
  if (state.markup && typeof state.markup.destroy === "function") state.markup.destroy();
  state.markup = null;
  /* The navigator holds two observers and a document-level listener, and the zoom holds an
   * inline property on a node the shell is about to detach. Both are released here, or the next
   * boot() mounts a second copy over a surface the first one is still watching. */
  if (state.sectionNav && typeof state.sectionNav.destroy === "function") state.sectionNav.destroy();
  state.sectionNav = null;
  if (state.zoom && typeof state.zoom.destroy === "function") state.zoom.destroy();
  state.zoom = null;
  state.paletteHost = null;
  state.exports = null;
  state.view = null;
  if (state.hashTimer) clearTimeout(state.hashTimer);
  if (root) {
    root.replaceChildren();
    root.classList.remove("lead", "lead--hold");
    delete root.dataset.console;
  }
  state.root = null;
  state.bundle = null;
  state.adapted = null;
}
