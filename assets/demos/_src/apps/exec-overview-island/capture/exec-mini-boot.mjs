/**
 * Exec Overview Mini — Page 12 compact island boot.
 *
 * A zoomed-down piece of the same Executive Overview product: same data model,
 * same category order, same colors, same labels, same hover mechanics, same
 * handling of Unknown, same population rules, same campus boundaries, no OPEN
 * Access segment.
 *
 * Modes: Age Distribution (default), Connection Status, Gender Profile, Campus Share.
 *
 * The full Exec Overview lives at /exec; this mini is the front door.
 *
 * Projected Unique Sunday Attendance is NOT rendered here (#724 revision) — it
 * lives beside Sunday Stats in rock-pages, themed with that panel's own look,
 * because it answers a Sunday Stats question, not a demographics one.
 *
 * Issue #724, #664, #665.
 */

import {
  AGES, AGE_LABELS, AGE_COLORS,
  CONNECTION_ORDER, CONNECTION_COLORS,
  GENDER_ORDER, GENDER_COLORS,
  CAMPUS_ORDER, CAMPUS_COLORS, CAMPUS_LABELS, CAMPUSES,
  format,
  readResponse, aggregate, itemsFrom, sum, connectionSemantic,
} from "./exec-overview-shared.mjs";
import { mountTooltipDelegate, tooltipContent } from "./dashboard-tooltip.mjs";

const QUERY_DEMOGRAPHICS = "exec-overview-demographics";

const SOURCE_LABELS = {
  age: "Favor Age Bands",
  connection: "Rock Core Demographics",
  gender: "Rock Core Demographics",
  campus: "Favor Campus Roster",
};

// Page 12 is a compact front-door read: the legend column has no room for
// "Young Adults 18–25" without pushing count/percent off the card. The short
// form is the visible label everywhere on this mini; the full AGE_LABELS
// text (with ranges) surfaces on hover instead, via data-tip-label.
const AGE_LABELS_SHORT = {
  kids: "Kids",
  youth: "Youth",
  youngAdults: "YA",
  adults: "Adults",
  seasoned: "Seasoned",
  unknown: "Unknown",
};

/* ---------------------------------------------------------------- DOM helpers */

const byId = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- Payload */

function readPayload() {
  try {
    const el = document.getElementById("exec-mini-data");
    if (!el) return null;
    const payload = JSON.parse(el.textContent || "{}");
    if (payload.schemaVersion !== 1 || payload.dashboardId !== "favor-exec-mini") return null;
    return {
      campus: CAMPUSES.has(payload.campus) ? payload.campus : "MNL",
      demographics: readResponse(
        payload.responses?.demographics,
        QUERY_DEMOGRAPHICS,
        ["campusShortCode", "connectionStatus", "gender", "ageBand", "uniquePeople"],
      ),
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- State */

const payload = readPayload();
const DEFAULT_CAMPUS = payload?.campus || "MNL";
let currentCampus = DEFAULT_CAMPUS;
let currentMode = "age"; // age | connection | gender | campus

/* ---------------------------------------------------------------- Filtering */

function campusMatches(row) {
  return currentCampus === "ALL" || row.campusShortCode === currentCampus;
}

function rowsForSlice(rows) {
  return rows.filter((row) => campusMatches(row));
}

/* ---------------------------------------------------------------- Model */

function miniModel() {
  if (!payload || !payload.demographics.available) {
    return { available: false, total: 0, ages: [], connection: [], genders: [], campuses: [] };
  }
  const allRows = payload.demographics.rows;
  const rows = rowsForSlice(allRows);
  const globalRows = allRows; // Campus Share always shows all campuses

  return {
    available: true,
    total: sum(rows, "uniquePeople") ?? 0,
    ages: itemsFrom(aggregate(rows, "ageBand"), AGES, AGE_COLORS),
    connection: itemsFrom(aggregate(rows, "connectionStatus"), CONNECTION_ORDER, CONNECTION_COLORS),
    genders: itemsFrom(aggregate(rows, "gender"), GENDER_ORDER, GENDER_COLORS),
    campuses: itemsFrom(
      aggregate(globalRows, "campusShortCode"),
      CAMPUS_ORDER,
      CAMPUS_COLORS,
    ).map((item) => ({
      ...item,
      code: item.name,
      name: CAMPUS_LABELS[item.name] || item.name,
    })),
  };
}

/* ---------------------------------------------------------------- Donut SVG */

const CIRCUMFERENCE = 339.292; // 2 * π * 54

// Full descriptive label (with age ranges) for hover/tooltip text; the age
// dimension's visible legend label uses AGE_LABELS_SHORT instead.
function tipLabelFor(item, dimensionKind) {
  return dimensionKind === "age" ? (AGE_LABELS[item.name] || item.name) : item.name;
}

function renderDonut(container, items, dimensionKind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("class", "donut-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Distribution chart");

  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("cx", "60");
  track.setAttribute("cy", "60");
  track.setAttribute("r", "54");
  track.setAttribute("class", "donut-circle donut-track");
  svg.appendChild(track);

  let used = 0;
  for (const item of items) {
    const pct = item.pct || 0;
    const dash = (pct / 100) * CIRCUMFERENCE;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "60");
    circle.setAttribute("cy", "60");
    circle.setAttribute("r", "54");
    circle.setAttribute("class", "donut-circle");
    circle.setAttribute("stroke", item.color);
    circle.style.strokeDasharray = `${dash} ${CIRCUMFERENCE}`;
    circle.style.strokeDashoffset = `${-(used / 100) * CIRCUMFERENCE}`;
    circle.setAttribute("data-tip-label", tipLabelFor(item, dimensionKind));
    circle.setAttribute("data-tip-value", format(item.count));
    circle.setAttribute("data-tip-unit", "people");
    circle.setAttribute("data-tip-compare", `${pct.toFixed(1)}%`);
    circle.setAttribute("tabindex", "0");
    svg.appendChild(circle);
    used += pct;
  }

  const label = document.createElement("div");
  label.className = "donut-center-label";
  const total = items.reduce((s, i) => s + i.count, 0);
  label.innerHTML = `<span class="donut-center-total">${format(total)}</span><span class="donut-center-unit">People</span>`;

  container.replaceChildren(svg, label);
}

/* ---------------------------------------------------------------- Legend rows */

function renderLegend(container, items, dimensionKind) {
  container.replaceChildren();
  if (!items.length) {
    const row = document.createElement("div");
    row.className = "combo-row";
    row.textContent = "Unavailable";
    container.appendChild(row);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = `combo-row${item.unknown ? " unknown" : ""}`;
    row.setAttribute("data-tip-label", tipLabelFor(item, dimensionKind));
    row.setAttribute("data-tip-value", format(item.count));
    row.setAttribute("data-tip-unit", "people");
    row.setAttribute("data-tip-compare", `${item.pct.toFixed(1)}%`);
    row.tabIndex = 0;

    const name = document.createElement("span");
    name.className = "combo-row__name";
    const swatch = document.createElement("span");
    swatch.className = "combo-row__swatch";
    swatch.style.background = item.color;
    const displayName = dimensionKind === "age" ? (AGE_LABELS_SHORT[item.name] || item.name) : item.name;
    name.append(swatch, document.createTextNode(displayName));

    if (dimensionKind === "connection") {
      const semantic = connectionSemantic(item.name, item.pct);
      if (semantic) {
        const dot = document.createElement("span");
        dot.className = `semantic-dot semantic--${semantic.state}`;
        dot.title = `${item.name}: ${semantic.label}`;
        name.appendChild(dot);
      }
    }

    const track = document.createElement("span");
    track.className = "combo-row__track";
    const fill = document.createElement("span");
    fill.className = "combo-row__fill";
    fill.style.width = `${Math.max(0, Math.min(100, item.pct || 0))}%`;
    fill.style.background = item.color;
    track.appendChild(fill);

    const count = document.createElement("span");
    count.className = "combo-row__count";
    count.textContent = format(item.count);

    const pct = document.createElement("span");
    pct.className = "combo-row__pct";
    pct.textContent = `${item.pct.toFixed(1)}%`;

    row.append(name, track, count, pct);
    container.appendChild(row);
  }
}

/* ---------------------------------------------------------------- Render */

function render() {
  const model = miniModel();
  const donutContainer = byId("exec-mini-donut");
  const legendContainer = byId("exec-mini-legend");
  const titleEl = byId("exec-mini-title");
  const totalEl = byId("exec-mini-total");
  const scopeEl = byId("exec-mini-scope");
  const sourceEl = byId("exec-mini-source");

  if (!donutContainer || !legendContainer) return;

  let items, dimensionKind, title;
  switch (currentMode) {
    case "connection":
      items = model.connection;
      dimensionKind = "connection";
      title = "Connection Status";
      break;
    case "gender":
      items = model.genders;
      dimensionKind = "gender";
      title = "Gender Profile";
      break;
    case "campus":
      items = model.campuses;
      dimensionKind = "campus";
      title = "Campus Share";
      break;
    default: // age
      items = model.ages;
      dimensionKind = "age";
      title = "Age Distribution";
  }

  if (titleEl) titleEl.textContent = title;
  if (sourceEl) sourceEl.textContent = SOURCE_LABELS[currentMode] || SOURCE_LABELS.age;
  if (totalEl) totalEl.textContent = `Active People ${model.available ? format(model.total) : "—"}`;
  if (scopeEl) scopeEl.textContent = CAMPUS_LABELS[currentCampus] || currentCampus;

  if (model.available && items.length) {
    renderDonut(donutContainer, items, dimensionKind);
    renderLegend(legendContainer, items, dimensionKind);
  } else {
    donutContainer.innerHTML = `<div class="mini-unavailable">Unavailable</div>`;
    legendContainer.innerHTML = "";
  }

  // Update campus buttons
  document.querySelectorAll("[data-mini-campus]").forEach((btn) => {
    const val = btn.dataset.miniCampus;
    const selected = val === currentCampus;
    btn.classList.toggle("is-active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });

  // Update mode buttons
  document.querySelectorAll("[data-mini-mode]").forEach((btn) => {
    const val = btn.dataset.miniMode;
    const selected = val === currentMode;
    btn.classList.toggle("is-active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });

  // Update CTA href with campus state
  const cta = byId("exec-mini-cta");
  if (cta) {
    const params = new URLSearchParams();
    if (currentCampus !== "ALL") params.set("campus", currentCampus.toLowerCase());
    cta.href = `/exec${params.toString() ? "?" + params : ""}`;
  }
}

/* ---------------------------------------------------------------- Event binding */

// Mode switcher
document.querySelectorAll("[data-mini-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentMode = btn.dataset.miniMode;
    render();
  });
});

// Campus buttons
document.querySelectorAll("[data-mini-campus]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentCampus = btn.dataset.miniCampus;
    render();
    // Dispatch favor:campus-change for interop with Sunday Stats and other Page 12 components
    document.dispatchEvent(new CustomEvent("favor:campus-change", { detail: { key: currentCampus } }));
  });
});

// Reset
const resetBtn = byId("exec-mini-reset");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    currentCampus = DEFAULT_CAMPUS;
    currentMode = "age";
    render();
    document.dispatchEvent(new CustomEvent("favor:campus-change", { detail: { key: currentCampus } }));
  });
}

// Listen for favor:campus-change from other Page 12 components
document.addEventListener("favor:campus-change", (event) => {
  const key = event?.detail?.key;
  if (!key || key === currentCampus) return;
  if (CAMPUSES.has(key)) {
    currentCampus = key;
    render();
  }
});

/* ---------------------------------------------------------------- Boot */

render();
const miniRoot = document.getElementById("exec-mini-island");
if (miniRoot) {
  mountTooltipDelegate(miniRoot, {
    surface: "exec-overview",
    selector: "[data-tip-label]",
    content: (trigger) => tooltipContent({
      label: trigger.dataset.tipLabel,
      value: trigger.dataset.tipValue || null,
      comparison: trigger.dataset.tipCompare || null,
      unit: trigger.dataset.tipUnit || null,
    }),
  });
}
