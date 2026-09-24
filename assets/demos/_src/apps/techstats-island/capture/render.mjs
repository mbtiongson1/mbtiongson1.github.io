import {
  CROSS_CAMPUS_METRIC_KEYS,
  METRIC_GUID_BY_ISLAND_KEY,
  PROD_METRIC_IDENTITY,
  PROD_REFERENCE_IDENTITY,
} from "./metric-catalog.generated.mjs";
import { resolveSermonTitle } from "./charts.mjs";
import { AGGREGATE_ONLY_TITLE, kpiSection, tableSection } from "./dashboard-view.mjs?v=20260922_1034";
import { exportRailMarkup } from "./dashboard-export.mjs?v=20260922_1034";
import { renderBreadcrumbsHtml } from "./dashboard-breadcrumbs.mjs?v=20260922_1034";

// A rail is a plain string of buttons (exportRailMarkup); this wraps it in the group the
// grammar names (docs/design/classic-grammar.md §9) and gives it the widget's title as its
// accessible name. bindExportDelegation (techstats-boot.mjs) does the clicking; nothing here
// attaches a listener, so this string renders identically whether it came from the live
// island or the fictional workbench.
function railMarkup(id, title, { hasPng = false } = {}) {
  return `<div class="xrail" role="group" aria-label="Export ${escapeHtml(title)}">` +
    `${exportRailMarkup({ id, title, hasPng })}</div>`;
}

export const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

// Rock identity for one audit row. Nothing here is hand-written: the Guid comes
// from the Sunday Inputs registry via the generated catalog, and the metric Id
// and category path come from committed policy that
// tools/verify_prod_metric_identity.py re-checks against prod.
function auditIdentity(key) {
  const rendered = PROD_METRIC_IDENTITY.get(key);
  if (rendered) {
    return {
      prod_id: String(rendered.prodId),
      category: rendered.category,
      guid: METRIC_GUID_BY_ISLAND_KEY.get(key) || "",
      status_label: `\u2713 Published on Prod (ID: ${rendered.prodId})`,
      campus_note: CROSS_CAMPUS_METRIC_KEYS.has(key)
        ? "This metric is also filed under Brisbane and Seoul; the MNL campus partition filter is what makes it a Manila number."
        : "",
    };
  }
  const reference = PROD_REFERENCE_IDENTITY.get(key);
  if (reference) {
    return {
      prod_id: `${reference.prodId} (reference only)`,
      category: reference.category || "Not filed under any Rock category",
      guid: reference.guid,
      status_label: `Reference only (ID: ${reference.prodId})`,
      campus_note: "",
    };
  }
  return {
    prod_id: "\u2014",
    category: "Derived on the island \u00b7 no Rock metric",
    guid: "",
    status_label: "Derived display value",
    campus_note: "",
  };
}

// Sink-side guard for any href rendered as an in-app navigation (Task 5,
// code review round 2/3): mapSignups (rest-to-bundle.mjs) also carries
// Href/PublicHref through from the STORED report payload
// (/api/TechStats/report / /api/TechStats/latest), which is not
// exclusively deriveSignupLinks' output and is not trustworthy input. A
// prefix test like `startsWith("/") && !startsWith("//")` leaks: the real
// URL parser resolves `/\\evil.com`, `/\t/evil.com`, and `/\n/evil.com`
// to `https://evil.com` (whitespace control characters get stripped during
// parsing, backslashes get normalized to forward slashes).
//
// Round 3: checking the origin of the INPUT (parsed WITH an authority) and
// then emitting `pathname+search+hash` is not enough either -- the browser
// re-parses that emitted string with NO authority, where a leading `//`
// means protocol-relative, and dot-segment normalization can produce
// exactly that from a legitimately-on-origin input:
//   "/.//evil.example.com/phish"       -> emits "//evil.example.com/phish"
//   "/..//evil.example.com/phish"      -> emits "//evil.example.com/phish"
//   "/%2e//evil.example.com"           -> emits "//evil.example.com"
//   "/a/../..//evil.example.com/phish" -> emits "//evil.example.com/phish"
// The origin check on the input genuinely passes for all four (the parsed
// authority really is SAFE_INTERNAL_HREF_BASE) -- enumerating shapes like
// this is exactly the failure mode a prefix test already had, one level
// deeper. The fix validates the OUTPUT instead of the input: round-trip
// the emitted string through the parser again, against a DIFFERENT base,
// and assert the resulting origin is still that different base. That
// states the actual invariant -- "this string, resolved against ANY
// origin, stays on that origin" -- rather than enumerating hostile
// shapes, and it closes this whole class, not just the four inputs above.
//
// Only path-relative in-app hrefs are allowed here today (what
// deriveSignupLinks produces: /form-insights?..., /ExternalWorkflowEntry/...,
// /Registration?..., /signups). Media URLs (render.mjs render of
// watch_url/thumbnail) need an allowed-scheme (https://youtube.com, etc.)
// variant of this same idea -- tracked separately as issue #190 -- so this
// export is named/shaped so that variant can reuse it later; it does not
// exist yet and this function does not attempt to serve that case.
const SAFE_INTERNAL_HREF_BASE = "https://techstats.invalid";
const PROBE_HREF_BASE = "https://probe.invalid";

export function internalHref(raw, { warnLabel } = {}) {
  const value = String(raw ?? "");
  if (value === "") return "";
  if (!value.startsWith("/")) return rejectHref(value, warnLabel);
  let parsed;
  try {
    parsed = new URL(value, SAFE_INTERNAL_HREF_BASE);
  } catch {
    return rejectHref(value, warnLabel);
  }
  if (parsed.origin !== SAFE_INTERNAL_HREF_BASE) return rejectHref(value, warnLabel);
  const out = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  // Round 3 fix: prove `out` cannot escape an arbitrary origin when a
  // browser later resolves it with no authority of its own, instead of
  // trusting that pathname/search/hash reserialization is inert.
  let probe;
  try {
    probe = new URL(out, PROBE_HREF_BASE);
  } catch {
    return rejectHref(value, warnLabel);
  }
  if (probe.origin !== PROBE_HREF_BASE) return rejectHref(value, warnLabel);

  return out;
}

function rejectHref(rawValue, warnLabel) {
  // T5c: only warn on an actual rejection of a non-empty value -- the
  // deliberate "" no-link case (Schedule rows, unrecognized SourceKind)
  // must stay silent, or this becomes noise nobody reads.
  console.warn(
    `TechStats: rejected a non-internal href${warnLabel ? ` (${warnLabel})` : ""}: ${JSON.stringify(rawValue)}`,
  );
  return "";
}

const asArray = (value) => (Array.isArray(value) ? value : []);
const metricLabel = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const formatNumber = (value) => typeof value === "number"
  ? new Intl.NumberFormat("en").format(value)
  : "Not reported";

const formatDate = (value) => {
  if (!value) return "Not reported";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

function renderAsOf(value, className) {
  if (!value) return "";
  return `<span class="${className}">As of ${escapeHtml(formatDate(value))}</span>`;
}

export function parseInlineMarkdown(text) {
  if (!text) return "";
  let out = text;
  // Bold (**bold** or __bold__)
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic (*italic* or _italic_)
  out = out.replace(/\*([^\*]+?)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+?)_/g, "<em>$1</em>");
  // Inline code (`code`)
  out = out.replace(/`([^`]+?)`/g, "<code>$1</code>");
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, p1, p2) => {
    const cleanUrl = p2.replace(/&amp;/g, "&");
    if (/^(https?:\/\/|mailto:|\/)/i.test(cleanUrl)) {
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${p1}</a>`;
    }
    return p1;
  });
  return out;
}

export function renderMarkdown(src) {
  if (!src) return "";
  let text = String(src).trim();
  if (!text) return "";

  // 1. Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Escape raw HTML entities first for complete safety
  text = escapeHtml(text);

  // 3. Process block elements: headers, blockquotes, lists, paragraphs
  const lines = text.split("\n");
  const output = [];
  let inUl = false;
  let inOl = false;

  function closeLists() {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    // Headers (###, ##, #)
    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    const h2Match = /^##\s+(.+)$/.exec(trimmed);
    const h1Match = /^#\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      closeLists();
      output.push(`<h4>${parseInlineMarkdown(h3Match[1])}</h4>`);
      continue;
    }
    if (h2Match) {
      closeLists();
      output.push(`<h3>${parseInlineMarkdown(h2Match[1])}</h3>`);
      continue;
    }
    if (h1Match) {
      closeLists();
      output.push(`<h2>${parseInlineMarkdown(h1Match[1])}</h2>`);
      continue;
    }

    // Blockquotes (> text or &gt; text)
    const bqMatch = /^(?:&gt;|>)\s*(.+)$/.exec(trimmed);
    if (bqMatch) {
      closeLists();
      output.push(`<blockquote>${parseInlineMarkdown(bqMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered List (- item or * item)
    const ulMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (inOl) { output.push("</ol>"); inOl = false; }
      if (!inUl) { output.push("<ul>"); inUl = true; }
      output.push(`<li>${parseInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered List (1. item)
    const olMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (!inOl) { output.push("<ol>"); inOl = true; }
      output.push(`<li>${parseInlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    closeLists();
    output.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
  }
  closeLists();

  return output.join("\n");
}

function discrepancyFor(bundle, metricKey) {
  return (bundle.discrepancies || []).find((item) => item.metric_key === metricKey);
}

function discrepancyMarker(discrepancy) {
  if (!discrepancy) return "";
  const explanation = discrepancy.explanation || "";
  return `<details class="discrepancy-detail"><summary aria-label="Discrepancy: ${escapeHtml(explanation)}"><span class="discrepancy" aria-hidden="true">!</span><span class="sr-only">Show discrepancy details</span></summary><span class="discrepancy-explanation">${escapeHtml(explanation)}</span></details>`;
}

function metricCell(bundle, key) {
  const metric = bundle.metrics?.[key] || { value: null, missing: true };
  const discrepancy = discrepancyFor(bundle, key);
  const missing = metric.missing || metric.value === null || metric.value === undefined;
  const marker = discrepancyMarker(discrepancy);
  return `<td class="tabular-figures${discrepancy ? " has-discrepancy" : ""}"${missing ? ' data-missing="true"' : ""}><span class="metric-value">${escapeHtml(formatNumber(metric.value))}</span>${marker}</td>`;
}

function metricRows(bundle, keys) {
  return keys.map((key) => `<tr data-metric="${escapeHtml(key)}"><th scope="row">${escapeHtml(metricLabel(key))}</th>${metricCell(bundle, key)}</tr>`).join("");
}

export function renderDeltaChip(delta) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return `<span class="delta-chip delta-chip--flat delta-chip--empty" aria-label="No change data">—</span>`;
  }
  const num = Number(delta);
  if (num > 0) {
    const formatted = `+${new Intl.NumberFormat("en").format(num)}`;
    return `<span class="delta-chip delta-chip--up" aria-label="Increase of ${escapeHtml(formatted)}"><span class="delta-chip__icon" aria-hidden="true">↑</span><span class="delta-chip__val">${escapeHtml(formatted)}</span></span>`;
  }
  if (num < 0) {
    const formatted = `${new Intl.NumberFormat("en").format(num)}`;
    return `<span class="delta-chip delta-chip--down" aria-label="Decrease of ${escapeHtml(formatted)}"><span class="delta-chip__icon" aria-hidden="true">↓</span><span class="delta-chip__val">${escapeHtml(formatted)}</span></span>`;
  }
  return `<span class="delta-chip delta-chip--flat" aria-label="No change"><span class="delta-chip__icon" aria-hidden="true">→</span><span class="delta-chip__val">0</span></span>`;
}

const METRIC_EXPLANATIONS = {
  sunday_share: "Sunday Attendance Share measures True Attendance divided by the dated canonical Active Base for the report campus. Raw Attendance remains the operational summed headcount; it is not the numerator for this share.",
  total_attendance: "Raw Attendance: Adults, Kids Attendance, and Kids Leaders summed together across the visible Sunday services — not deduplicated, unlike True Attendance.",
  headcount: "Raw Attendance: Adults, Kids Attendance, and Kids Leaders summed together for the visible Sunday services — not deduplicated, unlike True Attendance.",
  projected_unique: "True Attendance: Auditorium Adults × Unique Multiplier(year, service count), plus Kids Attendance and Kids Leaders as-is. Service count comes from Sunday Inputs Settings. 2026 model — 1 service: 100% (exact) · 2 services: 92.07% (observed, n=29) · 3 services: 81.03% (modeled) · 4 services: 72.10% (observed, n=5). This is a proxy estimate, not person-level identity validation.",
  seated_adults: "Adult auditorium in-person headcount across all Sunday services.",
  kids_attended: "Children checked in across all Favor Kids classrooms on Sunday.",
  kids_leaders: "Volunteer leaders serving in Favor Kids spaces.",
  volunteers: "Total Unique Volunteers: Deduplicated headcount of all individuals serving on any ministry team this Sunday. Reconstructed team-summed weeks are labelled separately and carry a possible range.",
  new_people_bags: "Physical welcome lounge gift bags handed out to first-time guests.",
  talked_to: "Direct 1-on-1 greeter guest welcome conversations logged.",
  orange_cards: "Physical guest information connection cards received.",
  hands_raised: "Altar call first-time decisions / salvations recorded across all services.",
  response_lounge: "First-time guests hosted in the Response Lounge.",
  ciw_attendees: "Correctional Institute for Women weekly in-person attendees count.",
  ciw_chinese: "CIW Chinese fellowship weekly attendance.",
  ciw_hands_raised: "CIW altar call decisions / salvations recorded.",
  volunteer_ratio: "Volunteer Serving Ratio: Total Unique Volunteers ÷ Total Sunday Attendance (Auditorium Adults + Kids Attendance + Kids Leaders).",
  orange_conversion: "Orange Card Conversion Rate: Physical Cards Received ÷ Welcome Bags Handed Out.",
};

export function renderInfoButton(key, customTitle = "", customDesc = "") {
  const desc = customDesc || METRIC_EXPLANATIONS[key] || "";
  if (!desc) return "";
  const title = customTitle || metricLabel(key);
  return `<button type="button" class="metric-info-btn" data-info-title="${escapeHtml(title)}" data-info-desc="${escapeHtml(desc)}" aria-label="Learn how ${escapeHtml(title)} is calculated" title="Info on ${escapeHtml(title)}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></button>`;
}

const FALLBACK_DELTA_ROWS = [
  { key: "attendees", label: "Total In-Person Attendance", primaryKey: "total_attendance" },
  { key: "volunteers", label: "Volunteers (period-canonical)", primaryKey: "volunteers" },
  { key: "new_people_bags", label: "New People Bags", primaryKey: "new_people_bags" },
  { key: "talked_to", label: "Talked To", primaryKey: "visitors" },
  { key: "orange_cards", label: "Orange Cards", primaryKey: "orange_cards" },
  { key: "hands_raised", label: "Hands Raised", primaryKey: "hands_raised" },
  { key: "response_lounge", label: "Response Lounge", primaryKey: "response_lounge" },
];

// The single source for "this week's verified Sunday metrics, W/W and Y/Y": both the
// on-page delta table and the (off-DOM) KPI/table export accessors read this same array,
// so an export can never drift from what the widget renders (#214 D7).
export function resolveDeltaTable(bundle) {
  return bundle.delta_table || FALLBACK_DELTA_ROWS.map((fallback) => {
    const metric = bundle.metrics?.[fallback.primaryKey] || bundle.metrics?.[fallback.key] || { value: null, missing: true };
    return {
      key: fallback.key,
      primary_key: fallback.primaryKey,
      label: fallback.label,
      value: metric.value,
      missing: metric.missing || metric.value === null,
      as_of: "",
      wow_delta: null,
      yoy_value: null,
      yoy_delta: null,
    };
  });
}

function renderDeltaTableRows(bundle) {
  const deltaTable = resolveDeltaTable(bundle);

  return deltaTable.map((row) => {
    const discrepancy = discrepancyFor(bundle, row.primary_key) || discrepancyFor(bundle, row.key);
    const missing = row.missing || row.value === null || row.value === undefined;
    const marker = discrepancyMarker(discrepancy);

    const yoyValHtml = row.yoy_value !== null && row.yoy_value !== undefined
      ? `<span class="metric-value">${escapeHtml(formatNumber(row.yoy_value))}</span>`
      : `<span class="metric-value metric-value--missing">—</span>`;
    const yoyChipHtml = row.yoy_delta !== null && row.yoy_delta !== undefined
      ? renderDeltaChip(row.yoy_delta)
      : "";

    const wowHtml = row.wow_adjacent === false ? "" : renderDeltaChip(row.wow_delta);
    return `<tr data-metric="${escapeHtml(row.key)}"><th scope="row" class="delta-table__metric-name"><span class="metric-title">${escapeHtml(row.label)}</span> ${renderInfoButton(row.key, row.label)}</th><td class="tabular-figures delta-table__this-week${discrepancy ? " has-discrepancy" : ""}"${missing ? ' data-missing="true"' : ""}><span class="metric-value">${escapeHtml(formatNumber(row.value))}</span>${row.calculation_kind ? renderCalculationBadge(row.calculation_kind) : ""}${renderRange(row.lower_bound, row.upper_bound)}${renderAsOf(row.as_of, "metric-as-of")}${marker}</td><td class="tabular-figures delta-table__wow">${wowHtml}</td><td class="tabular-figures delta-table__yoy"><span class="yoy-cell">${yoyValHtml}${yoyChipHtml ? ` ${yoyChipHtml}` : ""}</span></td></tr>`;
  }).join("");
}

// One editorial framing for every section on the report: Favorvetica title, a hairline rule,
// then the subtitle. Attendance, Volunteers, Signups, Media, and Notes all route through here,
// so the sections read as one system instead of each inventing its own header.
function renderSectionHeading(id, title, description = "") {
  return `<header class="section-heading"><h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</header>`;
}

// 13px stroke icons for the hero context pills. Drawn at the same weight as the inline pencil
// that sits beside them, so one pill never mixes an emoji with a drawn mark.
const PILL_ICONS = {
  venue: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>`,
  times: `<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline>`,
  tag: `<path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path><circle cx="7.5" cy="7.5" r="1.3"></circle>`,
  weather: `<circle cx="12" cy="12" r="4.2"></circle><path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"></path>`,
};

function pillIcon(name) {
  return `<svg class="context-pill__icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PILL_ICONS[name]}</svg>`;
}

const PENCIL_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;

function renderContextPill(kind, valueHtml, editTarget, editTitle, editLabel, extraClass = "") {
  return `<div class="context-pill${extraClass}">${pillIcon(kind)}<span class="context-pill__${kind}">${valueHtml}</span><button type="button" class="inline-edit-btn" data-edit-target="${escapeHtml(editTarget)}" title="${escapeHtml(editTitle)}" aria-label="${escapeHtml(editLabel)}">${PENCIL_SVG}</button></div>`;
}

// The recap video is the hero's backdrop and its caption. renderAttendance resolves the same
// item so it can exclude it from the stream list; both call this rather than re-deriving it.
export function resolveRecapMedia(bundle) {
  const allMedia = asArray(bundle.media);
  return allMedia.find((m) => m && (m.kind === "recap" || m.is_recap || /recap/i.test(m.caption || "") || /recap/i.test(m.service_name || "")))
    || allMedia.find((m) => m && (m.video_id || m.url))
    || allMedia[0]
    || null;
}

function renderCiwStats(bundle) {
  const rows = bundle.ciw_delta_table || [];
  if (!rows.length) return "";
  const selectedWeekUnavailable = "No observation this week";
  return `
  <section class="ciw-stats" aria-labelledby="ciw-heading">
    <header class="ciw-stats__header">
      <h3 id="ciw-heading">CIW</h3>
      <p>Correctional Institute for Women selected-week observations. Older values are not promoted without their observation date.</p>
    </header>
    <div class="ciw-stats__grid">
      ${rows.map((row) => `
        <article class="ciw-stat" data-metric="${escapeHtml(row.key)}">
          <span class="ciw-stat__label">${escapeHtml(row.label)} ${renderInfoButton(row.key, row.label)}</span>
          <strong class="ciw-stat__value tabular-figures">${row.value === null || row.value === undefined ? selectedWeekUnavailable : escapeHtml(formatNumber(row.value))}</strong>
          ${renderAsOf(row.as_of, "ciw-stat__as-of")}
          <dl class="ciw-stat__comparisons">
            ${row.wow_adjacent === false ? "" : `<div><dt>W/W</dt><dd>${renderDeltaChip(row.wow_delta)}</dd></div>`}
            <div><dt>Y/Y</dt><dd>${row.yoy_value === null || row.yoy_value === undefined ? "—" : `${escapeHtml(formatNumber(row.yoy_value))} ${renderDeltaChip(row.yoy_delta)}`}</dd></div>
          </dl>
        </article>`).join("")}
    </div>
  </section>`;
}

function sermonMedia(bundle) {
  return (bundle.media || []).find((item) => [item.kind, item.type, item.role]
    .some((value) => String(value || "").toLowerCase().includes("sermon")));
}

export function renderCover(bundle) {
  const identity = bundle.identity || {};
  const venue = identity.venue || "No data available";
  const serviceTimes = Array.isArray(identity.service_times) && identity.service_times.length > 0 ? identity.service_times.join(" · ") : "No data available";
  const serviceTag = identity.service_tag || "No data available";
  const weather = identity.weather || "No data available";

  const serviceDateIso = identity.service_date || "";
  const reportDateIso = identity.report_date || "";
  const isPreAug24 = Boolean((serviceDateIso && serviceDateIso < "2026-08-23") || (reportDateIso && reportDateIso < "2026-08-24"));

  const legacyBannerHtml = isPreAug24 ? `
      <div class="legacy-archive-banner" role="region" aria-label="Legacy archive notification">
        <div class="legacy-archive-banner__icon">⚠️</div>
        <div class="legacy-archive-banner__text">
          <strong>Historical Record Notice (Pre-August 24, 2026):</strong>
          <span>Metrics for dates before August 24, 2026 reflect unverified legacy schemas in this new template. For the official canonical numbers for this Sunday, view the <a href="#?date=${encodeURIComponent(reportDateIso || serviceDateIso)}" target="_blank" rel="noopener noreferrer">Legacy TechStats Dashboard (v1.0) ↗</a>.</span>
        </div>
      </div>` : "";

  const sermonTitle = identity.sermon_title || identity.title || "";
  const weekLabel = serviceDateIso ? `Week of ${formatDate(serviceDateIso)}` : (identity.period_label || "Weekly Sunday Report");
  const breadcrumbsHtml = renderBreadcrumbsHtml({ currentSurface: "sunday-report" });

  // One hero region carries wayfinding, identity, service context, and the headline numbers
  // over the recap still. The recap image is the hero's ground, so its own attendance stat and
  // the separate "Headline Numbers" band it used to sit under are both gone.
  const recap = resolveRecapMedia(bundle);
  const recapVideoId = recap ? (recap.video_id || extractYouTubeId(recap.url || recap.src || "")) : null;
  const recapThumbUrl = recap?.thumbnail_url || recap?.url || (recapVideoId ? `https://i.ytimg.com/vi/${recapVideoId}/maxresdefault.jpg` : "");
  const recapCaption = recap?.caption || (serviceDateIso ? `${formatDate(serviceDateIso)} Sunday Recap` : "Sunday Service Recap");
  const recapWatchUrl = recapVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(recapVideoId)}` : "";
  const heroStyle = recapThumbUrl ? ` style="--hero-bg-image: url('${escapeHtml(recapThumbUrl)}');"` : "";

  return `
  <div class="report-cover__breadcrumbs-bar">${breadcrumbsHtml}</div>
  <header class="report-cover report-hero" data-has-media="${recapThumbUrl ? "true" : "false"}"${heroStyle}>
    <div class="report-hero__scrim" aria-hidden="true"></div>
    <div class="section-inner report-hero__inner">
      <div class="report-hero__rail">
        <div class="report-hero__utility" data-hero-utility-host>
          <div class="copy-prompt-host" data-copy-prompt-host></div>
          <div class="package-control-host" data-package-control-host></div>
        </div>
      </div>

      <div class="report-hero__identity">
        <h1 class="report-cover__title">Sunday Report</h1>
        <p class="report-hero__meta">
          <span class="report-cover__week-badge">${escapeHtml(weekLabel)}</span>
          <span class="report-hero__campus">${escapeHtml(identity.campus || "MNL")}</span>
          <span class="status-badge">${escapeHtml(identity.status || "Published")}</span>
        </p>
        ${sermonTitle ? `<div class="report-hero__service-row"><span class="service-pill">Service</span> <strong>${escapeHtml(sermonTitle)}</strong>${identity.speaker ? ` <span class="speaker-name">by ${escapeHtml(identity.speaker)}</span>` : ""}</div>` : ""}
      </div>

      <div class="report-cover__context-bar">
        ${renderContextPill("venue", escapeHtml(venue), "venue", "Edit venue on the spot", "Edit venue")}
        ${renderContextPill("times", escapeHtml(serviceTimes), "services", "Edit services & service details on the spot", "Edit services")}
        ${renderContextPill("tag", escapeHtml(serviceTag), "tag", "Edit service theme tag on the spot", "Edit theme tag", " context-pill--tag")}
        ${renderContextPill("weather", escapeHtml(weather), "weather", "Edit weather report on the spot", "Edit weather", " context-pill--weather")}
      </div>

      <div class="report-hero__recap">
        <p class="report-hero__recap-caption">
          <span class="report-hero__recap-label">Service recap</span>
          <span id="hero-stream-title">${escapeHtml(recapCaption)}</span>
        </p>
        <div class="report-hero__recap-actions">
          ${recapWatchUrl ? `<a id="hero-stream-watch-btn" href="${escapeHtml(recapWatchUrl)}" target="_blank" rel="noopener noreferrer" class="watch-youtube-button">
            <svg class="youtube-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            <span>Watch on YouTube</span>
          </a>` : `<span class="report-hero__recap-empty">No recap recording uploaded</span>`}
          <button type="button" class="inline-edit-btn inline-edit-btn--pill" data-edit-target="thumbnail" title="Upload or change the recap image" aria-label="Change recap image">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>Recap image</span>
          </button>
        </div>
      </div>

      ${renderHeadlineKpis(bundle)}
      ${legacyBannerHtml}

      <a class="report-hero__more" href="#report-body">
        <span>Full report</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </a>
    </div>
  </header>
  <div id="report-body" tabindex="-1"></div>`;
}

// True Attendance is the headline: consolidated onto the same rich reading the
// Page 12 homepage's Sunday Stats mini already proved out (2026-09-21, operator
// request) -- a share-of-raw-attendance bar plus a Raw Attendance / Estimated
// Range / Vs Prior Sunday breakdown, instead of a fourth flat card. Raw
// Attendance keeps its number here rather than owning a headline slot of its
// own; the report shows three headline KPIs now, not four.
function renderTrueAttendanceCard(bundle) {
  const deltaTable = resolveDeltaTable(bundle);
  const projectedRow = deltaTable.find((r) => r.key === "projected_unique" || r.primary_key === "projected_unique");
  const model = bundle.attendance_model || {};
  const sample = model.sample_size ? ` · n=${model.sample_size}` : "";
  const basisLine = model.available
    ? `${model.service_count} ${model.service_count === 1 ? "service" : "services"} · ${model.basis || "approved model"}${sample}`
    : `Unavailable · ${model.reason || "Sunday Inputs Settings or the approved model is unavailable"}`;
  const formattedVal = model.available && projectedRow?.value != null ? formatNumber(projectedRow.value) : "—";
  const pct = model.available && model.headcount ? Math.max(0, Math.min(100, (model.projected_unique / model.headcount) * 100)) : null;
  const rangeText = model.available && model.projected_low != null && model.projected_high != null
    ? `${formatNumber(model.projected_low)} to ${formatNumber(model.projected_high)}`
    : "—";
  const rawText = model.headcount != null ? formatNumber(model.headcount) : "—";
  const priorChip = projectedRow?.wow_delta !== null && projectedRow?.wow_delta !== undefined
    ? renderDeltaChip(projectedRow.wow_delta)
    : '<span class="metric-value--missing">—</span>';

  return `
        <article class="headline-kpi-card headline-kpi-card--hero" data-kpi="kpi-projected-unique">
          <h2 class="headline-kpi-card__label">True Attendance ${renderInfoButton("projected_unique", "True Attendance")}</h2>
          <p class="headline-kpi-card__value tabular-figures">${escapeHtml(formattedVal)}</p>
          <p class="headline-kpi-card__sublabel">${escapeHtml(basisLine)}</p>
          <div class="headline-kpi-bar" aria-hidden="true">
            <div class="headline-kpi-bar__track"><div class="headline-kpi-bar__fill" style="width:${pct !== null ? pct.toFixed(1) : 0}%"></div></div>
            <div class="headline-kpi-bar__scale"><span>True Attendance${pct !== null ? ` ${pct.toFixed(1)}%` : ""}</span><span>Raw Attendance 100%</span></div>
          </div>
          <div class="headline-kpi-subrows">
            <div class="headline-kpi-subrow"><span class="headline-kpi-subrow__label">Raw Attendance</span><span class="headline-kpi-subrow__value tabular-figures">${escapeHtml(rawText)}</span></div>
            <div class="headline-kpi-subrow"><span class="headline-kpi-subrow__label">Estimated Range</span><span class="headline-kpi-subrow__value tabular-figures">${escapeHtml(rangeText)}</span></div>
            <div class="headline-kpi-subrow"><span class="headline-kpi-subrow__label">Vs Prior Sunday</span>${priorChip}</div>
          </div>
        </article>`;
}

export function renderHeadlineKpis(bundle) {
  const deltaTable = resolveDeltaTable(bundle);
  const getRow = (key, pKey) => deltaTable.find((r) => r.key === key || r.primary_key === pKey || r.key === pKey);

  const volRow = getRow("volunteers", "volunteers");
  const handsRow = getRow("hands_raised", "hands_raised");

  const kpis = [
    {
      id: "kpi-volunteers",
      label: "Total Volunteers",
      sublabel: "Unique serving contributors",
      value: volRow?.value,
      wow: volRow?.wow_delta,
      yoyVal: volRow?.yoy_value,
      yoyDelta: volRow?.yoy_delta,
      metricKey: "volunteers",
    },
    {
      id: "kpi-salvations",
      label: "Hands Raised",
      sublabel: "Altar call hands raised",
      value: handsRow?.value,
      wow: handsRow?.wow_delta,
      yoyVal: handsRow?.yoy_value,
      yoyDelta: handsRow?.yoy_delta,
      metricKey: "hands_raised",
    },
  ];

  return `
  <div class="headline-kpi-section" aria-label="Headline numbers for this Sunday">
    <div class="headline-kpi-grid">
      ${renderTrueAttendanceCard(bundle)}
      ${kpis.map((kpi) => {
        const formattedVal = kpi.value !== null && kpi.value !== undefined ? formatNumber(kpi.value) : "—";
        const wowChip = kpi.wow !== null && kpi.wow !== undefined ? renderDeltaChip(kpi.wow) : '<span class="metric-value--missing">—</span>';
        const yoyChip = kpi.yoyDelta !== null && kpi.yoyDelta !== undefined ? renderDeltaChip(kpi.yoyDelta) : "";
        const yoyFormatted = kpi.yoyVal !== null && kpi.yoyVal !== undefined ? formatNumber(kpi.yoyVal) : "—";
        return `
        <article class="headline-kpi-card" data-kpi="${escapeHtml(kpi.id)}">
          <h2 class="headline-kpi-card__label">${escapeHtml(kpi.label)} ${renderInfoButton(kpi.metricKey, kpi.label)}</h2>
          <p class="headline-kpi-card__value tabular-figures">${escapeHtml(formattedVal)}</p>
          <p class="headline-kpi-card__sublabel">${escapeHtml(kpi.sublabel)}</p>
          <div class="headline-kpi-card__deltas">
            <span class="headline-kpi-delta">
              <span class="headline-kpi-delta__label">W/W</span>
              ${wowChip}
            </span>
            <span class="headline-kpi-delta">
              <span class="headline-kpi-delta__label">Y/Y</span>
              <span class="headline-kpi-delta__prev">${escapeHtml(yoyFormatted)}</span>
              ${yoyChip}
            </span>
          </div>
        </article>`;
      }).join("")}
    </div>
  </div>`;
}

export function renderAttendance(bundle) {
  const identity = bundle.identity || {};
  const allMedia = asArray(bundle.media);

  // The recap item is the report hero's backdrop (renderCover). It is excluded here so the
  // stream list below never repeats it.
  const recapItem = allMedia.find((m) => m && (m.kind === "recap" || m.is_recap || /recap/i.test(m.caption || "") || /recap/i.test(m.service_name || "")));
  const streamItems = allMedia.filter((m) => m && m !== recapItem && (m.video_id || m.url));

  // Full Service Streams for the Sunday Streams & Media section
  const displayStreams = streamItems.length > 0 ? streamItems : allMedia.filter((m) => m && (m.video_id || m.url));
  const streamCount = displayStreams.length;
  const primaryStream = displayStreams[0] || null;
  const streamVideoId = primaryStream ? (primaryStream.video_id || extractYouTubeId(primaryStream.url || primaryStream.src || "")) : null;
  const hasStreamVideo = Boolean(streamVideoId);
  const streamCaption = primaryStream?.caption || "No livestream data available";
  const streamWatchUrl = streamVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(streamVideoId)}` : "";

  // Check if displayStreams have DISTINCT separate videos or timestamps (e.g. Aug 16 scenario)
  const uniqueVideoKeys = new Set(displayStreams.map(s => {
    const vid = s.video_id || extractYouTubeId(s.url || s.src || "");
    const time = s.timestamp || s.start_time || "";
    return `${vid}:${time}`;
  }));
  const hasDistinctStreams = displayStreams.length > 1 && uniqueVideoKeys.size > 1;

  const serviceCountHint = hasDistinctStreams
    ? `${streamCount} distinct service streams &bull; Click to switch`
    : hasStreamVideo
    ? `1 full Sunday livestream recording &bull; Click to expand`
    : `No livestream stream recorded`;

  return `
  <section class="attendance-feature" aria-labelledby="attendance-heading">
    <div class="section-inner">
      ${renderSectionHeading("attendance-heading", "Attendance & Recordings", "The Sunday service recordings behind this week's attendance, with every service time kept separate.")}

      ${hasStreamVideo ? `
      <div class="attendance-video-container">
        <details class="attendance-video-details">
          <summary class="attendance-video-summary">
            <span class="video-summary-title">▶ Sunday Streams &amp; Media (${escapeHtml(formatDate(identity.service_date))})</span>
            <span class="video-summary-hint">${serviceCountHint}</span>
          </summary>
          <div class="attendance-video-player">
            ${hasDistinctStreams ? `
            <div class="service-stream-selector" role="tablist" aria-label="Select Sunday service time">
              <div class="service-stream-header">
                <span class="service-selector-label">Multi-Service Recordings:</span>
              </div>
              <div class="service-stream-chips">
                ${displayStreams.map((svc, idx) => {
                  const sVid = svc.video_id || extractYouTubeId(svc.url || "");
                  const sTitle = svc.sermon_title ? ` — ${svc.sermon_title}` : "";
                  const sSpeaker = svc.speaker ? ` (${svc.speaker})` : "";
                  const sCaption = svc.caption || svc.title || `${svc.service_name || `Service ${idx + 1}`}${sTitle}${sSpeaker} // Favor Church`;
                  const sWatch = svc.watch_url || (sVid ? `https://www.youtube.com/watch?v=${sVid}` : "");
                  const sThumb = svc.thumbnail_url || (sVid ? `https://i.ytimg.com/vi/${sVid}/maxresdefault.jpg` : "");
                  return `
                  <button type="button" 
                    role="tab" 
                    class="service-stream-chip ${idx === 0 ? 'is-active' : ''}" 
                    data-video-id="${escapeHtml(sVid)}" 
                    data-caption="${escapeHtml(sCaption)}" 
                    data-thumb="${escapeHtml(sThumb)}" 
                    data-watch-url="${escapeHtml(sWatch)}" 
                    aria-selected="${idx === 0 ? 'true' : 'false'}">
                    <span class="chip-play-icon">▶</span>
                    <span class="chip-service-time">${escapeHtml(svc.service_name || `Service ${idx + 1}`)}</span>
                    ${sTitle ? `<span class="chip-service-title">${escapeHtml(sTitle)}</span>` : ""}
                    ${sSpeaker ? `<span class="chip-service-speaker">${escapeHtml(sSpeaker)}</span>` : ""}
                  </button>`;
                }).join('')}
              </div>
            </div>
            ` : ""}
            <div class="video-embed-wrapper">
              <iframe 
                id="attendance-video-iframe"
                src="https://www.youtube-nocookie.com/embed/${escapeHtml(streamVideoId)}" 
                title="${escapeHtml(streamCaption)}" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen 
                loading="lazy">
              </iframe>
            </div>
            <div class="video-player-caption">
              <strong id="attendance-video-caption-text">${escapeHtml(streamCaption)}</strong> &bull; Service Date: ${escapeHtml(formatDate(identity.service_date))} &bull; ${escapeHtml(identity.venue || "No data available")}
              <a id="attendance-video-watch-link" href="${escapeHtml(streamWatchUrl)}" target="_blank" rel="noopener noreferrer" class="video-external-link">
                Open on YouTube ↗
              </a>
            </div>
          </div>
        </details>
      </div>
      ` : `
      <div class="attendance-video-container attendance-video-container--empty">
        <div class="attendance-video-empty-notice">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-video-icon">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
          <span>No livestream recording uploaded for this date.</span>
        </div>
      </div>
      `}

    </div>
  </section>`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const match = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/.exec(url);
  return match ? match[1] : null;
}

function historyDateKey(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || "").trim());
  return match ? match[1] : "";
}

function getMonthName(value) {
  const text = String(value || "").trim();
  const shortMatch = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.exec(text);
  if (shortMatch) {
    const map = {
      jan: "January", feb: "February", mar: "March", apr: "April",
      may: "May", jun: "June", jul: "July", aug: "August",
      sep: "September", oct: "October", nov: "November", dec: "December",
    };
    return map[shortMatch[1].toLowerCase()] || shortMatch[1];
  }
  const isoMatch = /^(\d{4})-(\d{2})/.exec(text);
  if (isoMatch) {
    const monthNum = Number(isoMatch[2]);
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    if (monthNum >= 1 && monthNum <= 12) return months[monthNum - 1];
  }
  return "Selected Period";
}

function isReconstructedCalculation(kind) {
  return false;
}

function renderCalculationBadge(kind) {
  return "";
}

function renderRange(lower, upper) {
  return "";
}

function renderCalculationLegend() {
  return "";
}

// Exported so the export rail / view builder can flatten the exact same points and
// month-groups the ledger tables render, instead of re-deriving the shape and risking drift.
export function computePeaksAndGroups(combo, historicalAttendanceModels = {}) {
  const labels = combo.labels || [];
  const adults = combo.seated_adults || [];
  const kids = combo.kids_attended || [];
  const leaders = combo.kids_leaders || [];
  const vols = combo.volunteers || [];
  const newP = combo.new_people || [];
  const hands = combo.hands_raised || [];
  const lounge = combo.response_lounge || [];

  const points = labels.map((lbl, i) => {
    const sa = adults[i] ?? null;
    const ka = kids[i] ?? null;
    const kl = leaders[i] ?? null;
    const attendanceParts = [sa, ka, kl];
    const total = attendanceParts.every((part) => typeof part === "number")
      ? attendanceParts.reduce((sum, part) => sum + part, 0)
      : null;
    return {
      index: i,
      label: lbl,
      month: getMonthName(lbl),
      seated_adults: sa,
      kids_attended: ka,
      kids_leaders: kl,
      kids_leaders_quality: combo.kids_leaders_quality?.[i] || "verified-unique",
      kids_leaders_lower: combo.kids_leaders_lower?.[i] ?? null,
      kids_leaders_upper: combo.kids_leaders_upper?.[i] ?? null,
      total_attendance: total,
      projected_unique: historicalAttendanceModels[historyDateKey(lbl)]?.projected_unique ?? null,
      projected_low: historicalAttendanceModels[historyDateKey(lbl)]?.projected_low ?? null,
      projected_high: historicalAttendanceModels[historyDateKey(lbl)]?.projected_high ?? null,
      projected_available: historicalAttendanceModels[historyDateKey(lbl)]?.available === true,
      service_count: historicalAttendanceModels[historyDateKey(lbl)]?.service_count ?? null,
      projected_reason: historicalAttendanceModels[historyDateKey(lbl)]?.reason || null,
      volunteers: vols[i] ?? null,
      volunteers_quality: combo.volunteers_quality?.[i] || "verified-rollup",
      volunteers_lower: combo.volunteers_lower?.[i] ?? null,
      volunteers_upper: combo.volunteers_upper?.[i] ?? null,
      new_people: newP[i] ?? null,
      hands_raised: hands[i] ?? null,
      response_lounge: lounge[i] ?? null,
    };
  });

  // Calculate peaks
  let peakAtt = { value: -1, label: "" };
  let peakVol = { value: -1, label: "" };
  let peakNewP = { value: -1, label: "" };
  let peakHands = { value: -1, label: "" };

  for (const pt of points) {
    if (!isReconstructedCalculation(pt.kids_leaders_quality) && pt.total_attendance !== null && pt.total_attendance > peakAtt.value) {
      peakAtt = { value: pt.total_attendance, label: pt.label };
    }
    if (!isReconstructedCalculation(pt.volunteers_quality) && pt.volunteers !== null && pt.volunteers > peakVol.value) {
      peakVol = { value: pt.volunteers, label: pt.label };
    }
    if (pt.new_people !== null && pt.new_people > peakNewP.value) {
      peakNewP = { value: pt.new_people, label: pt.label };
    }
    if (pt.hands_raised !== null && pt.hands_raised > peakHands.value) {
      peakHands = { value: pt.hands_raised, label: pt.label };
    }
  }

  // Group by month (ordered descending so most recent months appear at the top)
  const monthGroupsAsc = [];
  let currentMonth = null;
  let currentGroup = null;

  for (const pt of points) {
    if (pt.month !== currentMonth) {
      if (currentGroup) monthGroupsAsc.push(currentGroup);
      currentMonth = pt.month;
      currentGroup = { month: currentMonth, points: [] };
    }
    currentGroup.points.push(pt);
  }
  if (currentGroup) monthGroupsAsc.push(currentGroup);

  // Reverse so newest month is first, and newest week within each month is first
  const monthGroups = monthGroupsAsc.slice().reverse().map((g) => ({
    month: g.month,
    points: g.points.slice().reverse(),
  }));

  return { points, monthGroups, peakAtt, peakVol, peakNewP, peakHands };
}

function renderPeaksSummary(peaks, bundle) {
  if (!peaks || (peaks.peakAtt.value <= 0 && peaks.peakVol.value <= 0)) return "";

  // Only display the milestone achievement banner if the CURRENT week achieved a peak
  const serviceDate = bundle?.identity?.service_date || "";
  const currentTotal = bundle?.metrics?.total_attendance?.value ?? null;
  const currentVol = bundle?.metrics?.volunteers?.value ?? null;
  const currentNewP = bundle?.metrics?.new_people_bags?.value ?? null;
  const currentHands = bundle?.metrics?.hands_raised?.value ?? null;

  const dateObj = serviceDate ? new Date(`${serviceDate}T00:00:00`) : null;
  const dateLabel = dateObj && !isNaN(dateObj)
    ? `${dateObj.getDate()} ${dateObj.toLocaleString("en-US", { month: "short" })}`
    : "";

  const isCurrentAttPeak = peaks.peakAtt.value > 0 && Boolean(dateLabel) && peaks.peakAtt.label === dateLabel;
  const isCurrentVolPeak = peaks.peakVol.value > 0 && Boolean(dateLabel) && peaks.peakVol.label === dateLabel;
  const isCurrentNewPPeak = peaks.peakNewP.value > 0 && Boolean(dateLabel) && peaks.peakNewP.label === dateLabel;
  const isCurrentHandsPeak = peaks.peakHands.value > 0 && Boolean(dateLabel) && peaks.peakHands.label === dateLabel;

  if (!isCurrentAttPeak && !isCurrentVolPeak && !isCurrentNewPPeak && !isCurrentHandsPeak) {
    return "";
  }

  return `
  <div class="peaks-milestone-bar" role="region" aria-label="Key Performance Peaks">
    <div class="peak-item">
      <span class="peak-item__icon" aria-hidden="true">🏆</span>
      <div class="peak-item__info">
        <span class="peak-item__label">Peak Attendance</span>
        <strong class="peak-item__val">${escapeHtml(formatNumber(peaks.peakAtt.value))}</strong>
        <span class="peak-item__date">${escapeHtml(peaks.peakAtt.label)}</span>
      </div>
    </div>
    <div class="peak-item">
      <span class="peak-item__icon" aria-hidden="true">👥</span>
      <div class="peak-item__info">
        <span class="peak-item__label">Peak Volunteers</span>
        <strong class="peak-item__val">${escapeHtml(formatNumber(peaks.peakVol.value))}</strong>
        <span class="peak-item__date">${escapeHtml(peaks.peakVol.label)}</span>
      </div>
    </div>
    <div class="peak-item">
      <span class="peak-item__icon" aria-hidden="true">🎁</span>
      <div class="peak-item__info">
        <span class="peak-item__label">Peak New People</span>
        <strong class="peak-item__val">${escapeHtml(formatNumber(peaks.peakNewP.value))}</strong>
        <span class="peak-item__date">${escapeHtml(peaks.peakNewP.label)}</span>
      </div>
    </div>
    <div class="peak-item">
      <span class="peak-item__icon" aria-hidden="true">❤️</span>
      <div class="peak-item__info">
        <span class="peak-item__label">Peak Hands Raised</span>
        <strong class="peak-item__val">${escapeHtml(formatNumber(peaks.peakHands.value))}</strong>
        <span class="peak-item__date">${escapeHtml(peaks.peakHands.label)}</span>
      </div>
    </div>
  </div>`;
}

function ledgerValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? formatNumber(value) : "Unavailable";
}

function serviceLabel(value) {
  return Number.isSafeInteger(value) && value > 0
    ? `${value} ${value === 1 ? "service" : "services"}`
    : "Unavailable";
}

function renderMonthlyGroupedTable(bundle, peaksInfo) {
  const { monthGroups, peakAtt, peakVol, peakNewP, peakHands } = peaksInfo;
  if (!monthGroups || monthGroups.length === 0) return "";

  // Identify current selected month from service date
  const serviceDate = bundle.identity?.service_date || "";
  const currentSelectedMonth = getMonthName(serviceDate);

  const monthSectionsHtml = monthGroups.map((group) => {
    const isCurrentMonth = group.month.toLowerCase() === currentSelectedMonth.toLowerCase();
    const pts = group.points;
    const validTrue = pts.filter((p) => p.projected_available && p.projected_unique !== null);
    const avgTrue = validTrue.length ? Math.round(validTrue.reduce((sum, p) => sum + p.projected_unique, 0) / validTrue.length) : null;
    const validRaw = pts.filter((p) => p.total_attendance !== null && !isReconstructedCalculation(p.kids_leaders_quality));
    const avgRaw = validRaw.length ? Math.round(validRaw.reduce((sum, p) => sum + p.total_attendance, 0) / validRaw.length) : null;
    const validVols = pts.filter((p) => p.volunteers !== null && !isReconstructedCalculation(p.volunteers_quality));
    const avgVols = validVols.length ? Math.round(validVols.reduce((sum, p) => sum + p.volunteers, 0) / validVols.length) : null;

    const rowsHtml = pts.map((p) => {
      const isPeakAtt = p.total_attendance === peakAtt.value && peakAtt.value > 0;
      const isPeakVol = p.volunteers === peakVol.value && peakVol.value > 0;
      const isPeakNewP = p.new_people === peakNewP.value && peakNewP.value > 0;
      const isPeakHands = p.hands_raised === peakHands.value && peakHands.value > 0;
      const sermonTitle = resolveSermonTitle(p.label, bundle);
      const sermonText = sermonTitle ? sermonTitle.split("//")[0].trim() : "";

      return `
      <tr class="${isPeakAtt ? "row--peak" : ""}">
        <th scope="row" class="month-table__date" title="${escapeHtml(sermonTitle || p.label)}">
          <span class="month-date-val">${escapeHtml(p.label)}</span>
          ${sermonText ? `<span class="month-sermon-title" title="${escapeHtml(sermonTitle)}">${escapeHtml(sermonText)}</span>` : ""}
        </th>
        <td class="tabular-figures month-table__true ${p.projected_available ? "" : "metric-value--missing"}">
          <strong>${escapeHtml(ledgerValue(p.projected_unique))}</strong>
        </td>
        <td class="tabular-figures month-table__att ${isPeakAtt ? "val--peak" : ""}">
          <strong>${escapeHtml(ledgerValue(p.total_attendance))}</strong>
          ${isPeakAtt ? '<span class="badge-peak">★ Peak</span>' : ""}
        </td>
        <td class="tabular-figures month-table__services">${escapeHtml(serviceLabel(p.service_count))}</td>
        <td class="tabular-figures">${escapeHtml(ledgerValue(p.seated_adults))}</td>
        <td class="tabular-figures">${escapeHtml(formatNumber(p.kids_attended))}</td>
        <td class="tabular-figures">${escapeHtml(formatNumber(p.kids_leaders))}</td>
        <td class="tabular-figures month-table__vols ${isPeakVol ? "val--peak" : ""}">
          ${escapeHtml(formatNumber(p.volunteers))}
          ${isPeakVol ? '<span class="badge-peak">★ Peak</span>' : ""}
        </td>
        <td class="tabular-figures ${isPeakNewP ? "val--peak" : ""}">
          ${escapeHtml(formatNumber(p.new_people))}
          ${isPeakNewP ? '<span class="badge-peak">★</span>' : ""}
        </td>
        <td class="tabular-figures ${isPeakHands ? "val--peak" : ""}">
          ${escapeHtml(formatNumber(p.hands_raised))}
          ${isPeakHands ? '<span class="badge-peak">★</span>' : ""}
        </td>
        <td class="tabular-figures">${escapeHtml(formatNumber(p.response_lounge))}</td>
      </tr>`;
    }).join("");

    return `
    <details class="month-group-card ${isCurrentMonth ? "is-current-month" : "is-older-month"}" ${isCurrentMonth ? "open" : ""}>
      <summary class="month-group-header">
        <div class="month-group-header-left">
          <span class="month-toggle-indicator" aria-hidden="true">▶</span>
          <h4 class="month-group-title">📅 ${escapeHtml(group.month)} 2026 ${isCurrentMonth ? '<span class="badge-current-month">Current Month</span>' : ""}</h4>
        </div>
        <div class="month-group-stats">
          ${avgTrue !== null ? `<span>Avg True Attendance: <strong>${escapeHtml(formatNumber(avgTrue))}</strong></span>` : ""}
          ${avgRaw !== null ? `<span>Avg Raw Attendance: <strong>${escapeHtml(formatNumber(avgRaw))}</strong></span>` : ""}
          ${avgVols !== null ? `<span>Avg Volunteers: <strong>${escapeHtml(formatNumber(avgVols))}</strong></span>` : ""}
        </div>
      </summary>
      <div class="table-scroll">
        <table class="month-grouped-table">
          <caption class="sr-only">${escapeHtml(group.month)} 2026 Sunday attendance ledger: true attendance estimate, raw attendance, service count, adults, kids, leaders, volunteers, new people, hands raised, and response lounge, one row per Sunday.</caption>
          <thead>
            <tr>
              <th scope="col">Sunday</th>
              <th scope="col">True Attendance</th>
              <th scope="col">Raw Attendance</th>
              <th scope="col">Services</th>
              <th scope="col">Adults</th>
              <th scope="col">Kids</th>
              <th scope="col">Leaders</th>
              <th scope="col">Volunteers</th>
              <th scope="col">New People</th>
              <th scope="col">Hands Raised</th>
              <th scope="col">Lounge</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </details>`;
  }).join("");

  return `
  <div class="monthly-ledger-section">
    <div class="monthly-ledger-toolbar">
      <div>
        <h3 class="monthly-ledger-title">Historical Data Ledger (Grouped by Month)</h3>
        <p class="monthly-ledger-desc">Showing <strong>${escapeHtml(currentSelectedMonth)}</strong> by default. Click any month header to expand/collapse other months.</p>
      </div>
      <div class="monthly-ledger-actions">
        <button type="button" class="toggle-all-months-button" data-action="toggle-all-months" aria-label="Toggle all months expand or collapse">
          <span>Expand/Collapse All</span>
        </button>
        ${railMarkup("techstats-metrics-history", "Historical data ledger", { hasPng: false })}
      </div>
    </div>
    ${renderCalculationLegend()}
    <div class="monthly-groups-container">
      ${monthSectionsHtml}
    </div>
  </div>`;
}

function renderVolunteerMonthlyTable(bundle, peaksInfo) {
  const { monthGroups, peakVol } = peaksInfo;
  if (!monthGroups || monthGroups.length === 0) return "";

  const serviceDate = bundle.identity?.service_date || "";
  const currentSelectedMonth = getMonthName(serviceDate);

  const monthSectionsHtml = monthGroups.map((group) => {
    const isCurrentMonth = group.month.toLowerCase() === currentSelectedMonth.toLowerCase();
    const pts = group.points;
    const validVols = pts.filter((p) => p.volunteers !== null && !isReconstructedCalculation(p.volunteers_quality));
    const avgVols = validVols.length ? Math.round(validVols.reduce((sum, p) => sum + p.volunteers, 0) / validVols.length) : null;
    const maxMonthVol = validVols.length ? Math.max(...validVols.map((p) => p.volunteers)) : null;

    const rowsHtml = pts.map((p) => {
      const isPeakVol = p.volunteers === peakVol.value && peakVol.value > 0;
      const volDiff = avgVols !== null && p.volunteers !== null ? p.volunteers - avgVols : null;
      const ratio = typeof p.total_attendance === "number" && typeof p.volunteers === "number" && p.total_attendance > 0
        ? Math.round((p.volunteers / p.total_attendance) * 1000) / 10
        : null;
      const sermonTitle = resolveSermonTitle(p.label, bundle);
      const sermonText = sermonTitle ? sermonTitle.split("//")[0].trim() : "";

      return `
      <tr class="${isPeakVol ? "row--peak" : ""}">
        <th scope="row" class="month-table__date" title="${escapeHtml(sermonTitle || p.label)}">
          <span class="month-date-val">${escapeHtml(p.label)}</span>
          ${sermonText ? `<span class="month-sermon-title" title="${escapeHtml(sermonTitle)}">${escapeHtml(sermonText)}</span>` : ""}
        </th>
        <td class="tabular-figures month-table__vols ${isPeakVol ? "val--peak" : ""}">
          <strong>${escapeHtml(formatNumber(p.volunteers))}</strong>
          ${isPeakVol ? '<span class="badge-peak">★ YTD Peak</span>' : ""}
        </td>
        <td class="tabular-figures">${volDiff !== null ? renderDeltaChip(volDiff) : "—"}</td>
        <td class="tabular-figures">${escapeHtml(formatNumber(p.total_attendance))}</td>
        <td class="tabular-figures">${ratio !== null ? `${ratio}%` : "—"}</td>
      </tr>`;
    }).join("");

    return `
    <details class="month-group-card ${isCurrentMonth ? "is-current-month" : "is-older-month"}" ${isCurrentMonth ? "open" : ""}>
      <summary class="month-group-header">
        <div class="month-group-header-left">
          <span class="month-toggle-indicator" aria-hidden="true">▶</span>
          <h4 class="month-group-title">📅 ${escapeHtml(group.month)} 2026 ${isCurrentMonth ? '<span class="badge-current-month">Current Month</span>' : ""}</h4>
        </div>
        <div class="month-group-stats">
          ${avgVols !== null ? `<span>Month Avg: <strong>${escapeHtml(formatNumber(avgVols))} Vols</strong></span>` : ""}
          ${maxMonthVol !== null ? `<span>Month Peak: <strong>${escapeHtml(formatNumber(maxMonthVol))} Vols</strong></span>` : ""}
        </div>
      </summary>
      <div class="table-scroll">
        <table class="month-grouped-table">
          <caption class="sr-only">${escapeHtml(group.month)} 2026 volunteer ledger: unique volunteer headcount against that month's average, Sunday attendance, and the volunteer/attendance ratio, one row per Sunday.</caption>
          <thead>
            <tr>
              <th scope="col">Sunday</th>
              <th scope="col">Volunteers</th>
              <th scope="col">Vs Month Avg</th>
              <th scope="col">Sunday Attendance</th>
              <th scope="col">Vol/Att Ratio</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </details>`;
  }).join("");

  return `
  <div class="monthly-ledger-section">
    <div class="monthly-ledger-toolbar">
      <div>
        <h3 class="monthly-ledger-title">Volunteer History (Grouped by Month)</h3>
        <p class="monthly-ledger-desc">Showing <strong>${escapeHtml(currentSelectedMonth)}</strong> by default. Click any month header to expand/collapse other months.</p>
      </div>
      <div class="monthly-ledger-actions">
        <button type="button" class="toggle-all-months-button" data-action="toggle-all-months" aria-label="Toggle all volunteer months expand or collapse">
          <span>Expand/Collapse All</span>
        </button>
        ${railMarkup("techstats-volunteers", "Volunteer history", { hasPng: true })}
      </div>
    </div>
    ${renderCalculationLegend()}
    <div class="monthly-groups-container">
      ${monthSectionsHtml}
    </div>
  </div>`;
}

export function renderVolunteerChart(bundle) {
  const volMetric = bundle.metrics?.volunteers;
  const volVal = volMetric?.value;
  const volunteerRow = asArray(bundle.delta_table).find((row) => row.key === "volunteers") || {};
  const prevVal = volunteerRow.wow_prior ?? null;
  const delta = volunteerRow.wow_delta ?? null;
  const yoyDelta = volunteerRow.yoy_delta ?? null;
  const comparisonUnavailable = "Not comparable";

  const combo = bundle.chart_series?.combo || {};
  const peaksInfo = computePeaksAndGroups(combo, bundle.historical_attendance_models);
  const volunteerLedgerHtml = renderVolunteerMonthlyTable(bundle, peaksInfo);

  return `
  <section class="time-series-chart is-centered" aria-labelledby="volunteer-heading">
    <div class="section-inner">
      <div class="volunteer-header-centered">
        ${renderSectionHeading("volunteer-heading", "Volunteer Observation", "A multi-year trend overlay (2023–2026) and week-by-week view of the people making Sundays possible.")}
        
        <div class="volunteer-view-switch" role="group" aria-label="Volunteer comparison view mode">
          <button type="button" class="volunteer-switch-btn is-active" data-view="year" aria-pressed="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>Year-by-Year (2023–2026 Overlay)</span>
          </button>
          <button type="button" class="volunteer-switch-btn" data-view="week" aria-pressed="false">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>Week-by-Week (34 Weeks)</span>
          </button>
        </div>
      </div>
      
      <div class="time-series-chart__summary">
        <div class="volunteer-stat-cards">
          <div class="volunteer-stat-card">
            <span class="volunteer-stat-card__label">This Week ${renderInfoButton("volunteers", "This Week Volunteers", "The published unique volunteer weekly rollup. Earlier team-summed reconstructions are labelled separately.")}</span>
            <span class="volunteer-stat-card__value tabular-figures">${volVal === null || volVal === undefined ? "—" : escapeHtml(formatNumber(volVal))}</span>
          </div>
          <div class="volunteer-stat-card">
            <span class="volunteer-stat-card__label">Previous Week ${renderInfoButton("prev_volunteers", "Previous Week Volunteers", "Deduplicated unique volunteer count from the previous Sunday.")}</span>
            <span class="volunteer-stat-card__value tabular-figures">${prevVal === null ? comparisonUnavailable : escapeHtml(formatNumber(prevVal))}</span>
          </div>
          <div class="volunteer-stat-card">
            <span class="volunteer-stat-card__label">W/W Change ${renderInfoButton("volunteer_wow", "Volunteer W/W Change", "Week-over-Week difference in unique volunteer headcount.")}</span>
            <div class="volunteer-stat-card__indicator">${delta === null ? comparisonUnavailable : renderDeltaChip(delta)}</div>
          </div>
          <div class="volunteer-stat-card">
            <span class="volunteer-stat-card__label">Y/Y Change ${renderInfoButton("volunteer_yoy", "Volunteer Y/Y vs 2025", "Same-week historical volunteer comparison against 2025 (52 weeks ago).")}</span>
            <div class="volunteer-stat-card__indicator">${yoyDelta === null ? comparisonUnavailable : renderDeltaChip(yoyDelta)}</div>
          </div>
        </div>
      </div>

      ${renderCalculationLegend()}
      <figure class="volunteer-chart-figure">
        <div class="chart-frame">
          <canvas data-chart="volunteers" aria-label="Volunteer multi-year comparison"></canvas>
        </div>
        <figcaption>Volunteer counts across 52 weeks (2023–2026). Toggle above for 34-week continuous trajectory.</figcaption>
      </figure>

      ${volunteerLedgerHtml}
    </div>
  </section>`;
}

export function renderDashboard(bundle) {
  const deltaRowsHtml = renderDeltaTableRows(bundle);
  const ciwStatsHtml = renderCiwStats(bundle);
  const combo = bundle.chart_series?.combo || {};
  const peaksInfo = computePeaksAndGroups(combo, bundle.historical_attendance_models);
  const peaksHtml = renderPeaksSummary(peaksInfo, bundle);
  const monthlyLedgerHtml = renderMonthlyGroupedTable(bundle, peaksInfo);

  const highlight = bundle.identity?.highlight_metric || {
    value: null,
    label: "Sunday Attendance Share",
    detail: "No canonical active Manila base is available",
  };
  const narrativeSummary = bundle.narratives?.executive_summary ||
    bundle.narratives?.cover ||
    bundle.narratives?.dashboard ||
    bundle.narratives?.sunday_dashboard ||
    "No narrative available for this report.";

  return `
  <section class="metric-dashboard" aria-labelledby="dashboard-heading">
    <div class="section-inner">
      <div class="dashboard-header-row">
        <div>
          ${renderSectionHeading("dashboard-heading", "Sunday Dashboard", "Response, connection, and engagement signals across the entire season.")}
        </div>
      </div>

      <div class="dashboard-context-banner">
        <div class="dashboard-context-card" data-card="weekly-context">
          <div class="context-card-header">
            <span class="context-card-kicker">Weekly Context &amp; Highlights</span>
            <button type="button" class="inline-edit-btn inline-edit-btn--pill" data-edit-target="narrative" title="Edit weekly notes on the spot" aria-label="Edit weekly context notes">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Edit Notes</span>
            </button>
          </div>
          <div class="context-card-markdown">${renderMarkdown(narrativeSummary)}</div>
        </div>
        <div class="dashboard-highlight-card" data-card="highlight-metric">
          <div class="highlight-card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span class="highlight-card-kicker">${escapeHtml(highlight.label || "Sunday Attendance Share")} ${renderInfoButton("sunday_share", "Sunday Attendance Share")}</span>
            <button type="button" class="inline-edit-btn inline-edit-btn--pill" data-edit-target="highlight" title="Edit highlight metric" aria-label="Edit highlight metric">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          </div>
          <strong class="highlight-card-value">${escapeHtml(highlight.value ?? "No data available")}</strong>
          ${highlight.label === "Sunday Attendance Share" && highlight.range_low !== null && highlight.range_low !== undefined && highlight.range_high !== null && highlight.range_high !== undefined
            ? `<span class="highlight-card-range">Estimated range · ${(highlight.range_low * 100).toFixed(1)}%–${(highlight.range_high * 100).toFixed(1)}%</span>`
            : ""}
          <span class="highlight-card-detail">${escapeHtml(highlight.detail || "No canonical MetricValue available")}</span>
        </div>
      </div>

      ${peaksHtml}

      <div class="metric-dashboard__layout">
        <div class="delta-table-container">
          <div class="delta-table-wrapper table-scroll" tabindex="0" role="region" aria-label="This Week 7-row Sunday Stats delta comparison table">
            <div class="delta-table-header-strip">
              <span class="delta-table-caption-title">This Week · Sunday Stats</span>
              <span class="rock-db-read-only-badge" title="Metrics are automatically derived from live Rock DB MetricValues and cannot be hand-edited.">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>Rock DB Sourced · Read-Only</span>
              </span>
              ${railMarkup("techstats-weekly-delta", "This week · Sunday stats", { hasPng: true })}
            </div>
            <table class="delta-table">
              <caption class="sr-only">This Week 7-row Sunday Stats W/W and Y/Y performance comparison</caption>
              <thead>
                <tr>
                  <th scope="col" class="delta-table__th-metric">Metric</th>
                  <th scope="col" class="delta-table__th-value">This Week</th>
                  <th scope="col" class="delta-table__th-wow">W/W Change</th>
                  <th scope="col" class="delta-table__th-yoy">Same Week Last Year (Y/Y)</th>
                </tr>
              </thead>
              <tbody>${deltaRowsHtml}</tbody>
            </table>
          </div>
        </div>

        <figure class="dashboard-chart">
          <div class="chart-frame chart-frame--combo">
            <canvas data-chart="combo" aria-label="Sunday attendance and engagement combo trend"></canvas>
          </div>
          <figcaption>Sunday attendance stacked columns (left axis, 0–4,000) and engagement lines (right axis, 0–500) with milestone peaks highlighted.</figcaption>
        </figure>
      </div>

      ${ciwStatsHtml}

      <div class="sunday-inputs-cta-strip">
        <div class="inputs-cta-info">
          <div class="inputs-cta-badge">📝 Rock RMS Intake</div>
          <p class="inputs-cta-text">Need to input or adjust Sunday metrics? Submit verified attendance, volunteers, and next steps via Sunday Inputs.</p>
        </div>
        <a href="#" target="_blank" rel="noopener noreferrer" class="sunday-inputs-btn" aria-label="Open Sunday Inputs page on Rock RMS">
          <span>Input Your Numbers Here</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>

      ${monthlyLedgerHtml}
    </div>
  </section>`;
}

export function renderSignups(bundle) {
  const signups = bundle.signups || [];
  const activeCount = signups.filter((s) => s.state === "active").reduce((sum, s) => sum + (s.count || 0), 0);
  const activeDelta = signups.filter((s) => s.state === "active").reduce((sum, s) => sum + (s.delta || 0), 0);

  const rows = signups.map((signup) => {
    const state = String(signup.state || "not reported").toLowerCase();
    const isActive = state === "active";
    // T5b (code review round 2): `signup.href`/`signup.publicHref` are not
    // exclusively deriveSignupLinks' output -- mapSignups also carries them
    // through from the STORED report payload, which is not trustworthy
    // input. renderSignups is the sink, so the guard lives here, once, not
    // duplicated in mapSignups.
    const href = internalHref(signup.href, { warnLabel: `signup "${signup.name}" href` });
    const publicHref = internalHref(signup.publicHref, { warnLabel: `signup "${signup.name}" publicHref` });
    const nameHtml = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(signup.name)}</a>`
      : escapeHtml(signup.name);
    const globeHtml = publicHref
      ? `<a class="signup-public-link" href="${escapeHtml(publicHref)}" target="_blank" rel="noopener noreferrer" aria-label="Open public sign-up page for ${escapeHtml(signup.name)}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </a>`
      : "";
    return `
    <tr data-state="${escapeHtml(state)}">
      <th scope="row" class="signup-name-cell">
        <strong>${nameHtml}</strong>${globeHtml}
        ${signup.dates ? `<span class="signup-dates">${escapeHtml(signup.dates)}</span>` : ""}
      </th>
      <td class="tabular-figures signup-count-cell">
        <strong>${escapeHtml(formatNumber(signup.count))}</strong>
      </td>
      <td class="tabular-figures signup-delta-cell">
        ${renderDeltaChip(signup.delta)}
      </td>
      <td>
        <span class="signup-badge signup-badge--${escapeHtml(state)}">
          ${isActive ? '<span class="pulse-dot"></span>' : ""}
          ${escapeHtml(signup.state || "Active")}
        </span>
      </td>
    </tr>`;
  }).join("");

  const table = rows
    ? `
    <div class="signup-summary-bar">
      <div class="signup-stat-pill">
        <span class="signup-stat-pill__label">Active Registrations:</span>
        <strong class="signup-stat-pill__value">${escapeHtml(formatNumber(activeCount))}</strong>
        ${activeDelta !== 0 ? renderDeltaChip(activeDelta) : ""}
      </div>
      <div class="signup-stat-pill">
        <span class="signup-stat-pill__label">Open Forms:</span>
        <strong class="signup-stat-pill__value">${signups.filter((s) => s.state === "active").length}</strong>
      </div>
    </div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Live signup snapshot">
      <table class="signup-data-table">
        <caption class="sr-only">Live signup and registration snapshot: every tracked form or campaign with its live count, week-over-week change, and status.</caption>
        <thead>
          <tr>
            <th scope="col">Registration Form / Event</th>
            <th scope="col">Live Count</th>
            <th scope="col">W/W Change</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : `<p class="empty-state">No active signup snapshots were registered for this week.</p>`;

  const campus = bundle?.identity?.campus || "MNL";
  const signupsBoardHref = `/signups-index?signupsCampus=${encodeURIComponent(campus)}`;

  return `
  <section class="signup-table" aria-labelledby="signups-heading">
    <div class="section-inner">
      <div class="dashboard-header-row">
        <div>
          <p class="section-kicker">Next Steps & Engagement</p>
          ${renderSectionHeading("signups-heading", "Live Signups & Registrations", "Current registrations and active campaign response forms, frozen with this weekly snapshot.")}
        </div>
        <div class="header-actions-group">
          <a href="${escapeHtml(signupsBoardHref)}" target="_blank" rel="noopener noreferrer" class="signups-board-link-button" aria-label="Open full Live Signups Board on Signups Index">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>Live Signups Board ↗</span>
          </a>
          ${railMarkup("techstats-signups", "Live signups & registrations", { hasPng: false })}
        </div>
      </div>
      ${table}
    </div>
  </section>`;
}

export function renderNarrative(bundle) {
  const entries = Object.entries(bundle.narratives || {});
  if (!entries.length) return "";
  return `
  <section class="narrative" aria-labelledby="narrative-heading">
    <div class="section-inner">
      ${renderSectionHeading("narrative-heading", "Notes & Executive Summary", "The week's written record: what the numbers do not say on their own.")}
      ${entries.map(([key, value]) => `
        <div class="narrative-block" data-narrative="${escapeHtml(key)}">
          <h3 class="narrative-key-heading">${escapeHtml(metricLabel(key))}</h3>
          <div class="narrative-markdown">${renderMarkdown(value)}</div>
        </div>
      `).join("")}
    </div>
  </section>`;
}

export function renderAlert(bundle) {
  const alerts = (bundle.alerts || []).concat(bundle.alert ? [bundle.alert] : []);
  if (!alerts.length) return "";
  return `
  <section class="alert" role="status">
    <div class="section-inner">
      <div class="alert__content">
        <h2>Report alert</h2>
        ${alerts.map((alert) => `
          <div class="alert-item">
            ${renderMarkdown(typeof alert === "string" ? alert : alert.message || "")}
          </div>
        `).join("")}
      </div>
    </div>
  </section>`;
}

// How each media entry announces itself. A recap and a Taglish cut are not
// services, so they never carry a service time.
const MEDIA_KIND_LABELS = {
  livestream: "Livestream",
  recap: "Recap",
  taglish: "Taglish",
  custom: "Uploaded",
};

export function renderMedia(bundle) {
  const mediaList = bundle.media || [];
  if (!mediaList.length) return "";

  // Deduplicate streams that share the same video_id while preserving the recap/replay
  const uniqueItems = [];
  const seenVideoIds = new Set();

  for (const item of mediaList) {
    if (!item) continue;
    const vId = item.video_id || item.videoId || extractYouTubeId(item.url || item.src || "");
    if (vId) {
      if (seenVideoIds.has(vId) && !item.is_recap && item.kind !== "recap") {
        continue; // skip duplicate shared stream cards
      }
      seenVideoIds.add(vId);
    }
    uniqueItems.push(item);
  }

  // Every video earns a tile: each streamed service, its recap, and the
  // Taglish cut. A Sunday with two services therefore shows more than four.
  const items = uniqueItems;
  const count = items.length;
  const serviceCount = items.filter((item) => MEDIA_KIND_LABELS[item?.kind] === undefined
    ? false
    : item.kind === "livestream").length;

  const cards = items.map((media, index) => {
    const videoId = media.video_id || media.videoId;
    const isYouTube = Boolean(media.is_youtube || videoId);
    const watchUrl = media.watch_url || media.url || (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : "");
    const thumbUrl = media.thumbnail_url || media.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : media.url || media.src || "");
    const caption = media.caption || media.title || `Sunday Stream ${index + 1}`;
    const altText = media.alt || caption;
    // What the entry is, then when it happened. Only a streamed service has a
    // time; a recap is not a service and is labelled as such rather than being
    // given a plausible-looking one.
    const kindLabel = MEDIA_KIND_LABELS[media.kind] || (isYouTube ? "YouTube Stream" : "Media Highlight");
    const serviceName = media.service_time
      ? `${kindLabel} · ${media.service_time}`
      : (MEDIA_KIND_LABELS[media.kind] ? kindLabel : (media.service_name || media.service || kindLabel));
    // YouTube only generates maxresdefault for some uploads — two of the three
    // videos for 2026-08-23 have none, and hot-linking one that does not exist
    // renders a blank tile. hqdefault always exists, so it is the fallback.
    const thumbFallback = videoId
      ? ` onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg'"`
      : "";
    const durationBadge = media.duration ? `<span class="media-card__duration">${escapeHtml(media.duration)}</span>` : "";
    const dateText = media.date ? formatDate(media.date) : "";
    const summary = media.summary || media.description || "";

    return `<div class="media-card" tabindex="0" data-media-id="${escapeHtml(videoId || String(index))}">
      <a href="${escapeHtml(watchUrl || "#")}" class="media-card__link"${watchUrl ? ' target="_blank" rel="noopener noreferrer"' : ""} aria-label="Watch ${escapeHtml(caption)}${isYouTube ? " on YouTube" : ""}">
        <div class="media-card__thumbnail-wrapper">
          <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(altText)}" class="media-card__thumbnail" loading="lazy"${thumbFallback}>
          <div class="media-card__badge" aria-hidden="true">
            <svg class="play-icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          ${durationBadge}
        </div>
        <figcaption class="media-card__caption">
          <span class="media-card__service">${escapeHtml(serviceName)}</span>
          <strong class="media-card__title">${escapeHtml(caption)}</strong>
        </figcaption>
      </a>
      <div class="media-card__popup" role="tooltip" aria-hidden="true">
        <div class="media-card__popup-header">
          <span class="media-card__popup-tag">${escapeHtml(kindLabel)}</span>
          ${dateText ? `<time class="media-card__popup-date">${escapeHtml(dateText)}</time>` : ""}
        </div>
        <h4 class="media-card__popup-title">${escapeHtml(caption)}</h4>
        ${summary ? `<p class="media-card__popup-desc">${escapeHtml(summary)}</p>` : ""}
        ${watchUrl ? `<div class="media-card__popup-action"><span class="media-card__popup-btn">Watch on YouTube &rarr;</span></div>` : ""}
      </div>
    </div>`;
  }).join("");

  const summaryLine = serviceCount > 0
    ? `${serviceCount === 1 ? "One streamed service" : `${serviceCount} streamed services`}, with recaps and the Taglish cut.`
    : "Service livestreams, media captures, and weekly highlights.";

  const mediaContent = count > 0 ? cards : `<div class="media-empty-card"><p>No livestream broadcast recorded for this Sunday gathering. In-person attendance and team metrics remain fully verified.</p></div>`;
  return `<section class="media" aria-labelledby="media-heading"><div class="section-inner">${renderSectionHeading("media-heading", "Sunday Streams & Media", summaryLine)}<div class="media-grid" data-count="${count}" data-services="${serviceCount}">${mediaContent}</div></div></section>`;
}

function renderDashboardChangelog() {
  const updates = [
    ["21 Sep 2026 · Sunday Report 1.4.4: True Attendance consolidated to three KPIs", "“Headcount” was mislabeling the summed Adults + Kids + Kids Leaders total, not the host team's raw tally, so it's renamed Raw Attendance everywhere. Raw Attendance no longer gets its own headline card: True Attendance now carries the same richer reading as the Page 12 homepage mini — a share-of-raw-attendance bar plus Raw Attendance, Estimated Range, and Vs Prior Sunday detail — so the report shows three headline numbers, not four."],
    ["14 Sep 2026 · Sunday Report 1.4.1: one hero", "The masthead, the date picker, and the three headline numbers now share one full-bleed recap hero. The duplicate Total Attendance stat is gone, editor buttons appear only while editing, and every section carries the same heading frame."],
    ["6 Sep 2026 · Live signups Manila campus scoping", "The Live Signups feed and full board link now explicitly request the Manila (MNL) campus board, preserving active snapshots across multi-campus board defaults."],
    ["2 Sep 2026 · Shared export rail & two-target copy prompt", "The four CSV buttons became a shared export rail (Excel, copy-as-table, and chart PNGs where a live canvas draws one) that always exports the rows you're currently looking at. Copy AI Prompt is now Copy prompt: one popover offering a computer-use prompt and a Claude/Codex deep-dive, plus a Package download of the full machine-readable reading."],
  ];
  const rows = updates.map(([title, detail]) => `<li><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></li>`).join("");
  return `<section class="dashboard-changelog" aria-labelledby="dashboard-changelog-heading"><div class="section-inner dashboard-changelog__inner"><header><h2 id="dashboard-changelog-heading">What’s changed</h2><p>A few quiet improvements to make the weekly view easier to trust.</p></header><ul>${rows}</ul></div></section>`;
}

export function renderMetricAuditInspector(bundle) {
  const metrics = bundle.metrics || {};
  const currentTotalAtt = metrics.total_attendance?.value ?? null;
  const currentAdults = metrics.seated_adults?.value ?? null;
  const currentKids = metrics.kids_attended?.value ?? null;
  const currentLeaders = metrics.kids_leaders?.value ?? null;
  const currentVols = metrics.volunteers?.value ?? null;
  const currentNewP = metrics.new_people_bags?.value ?? null;
  const currentTalked = metrics.talked_to?.value ?? null;
  const currentCards = metrics.orange_cards?.value ?? null;
  const currentHands = metrics.hands_raised?.value ?? null;
  const currentLounge = metrics.response_lounge?.value ?? null;
  const currentCiwAttendees = metrics.ciw_attendees?.value ?? null;
  const currentCiwChinese = metrics.ciw_chinese?.value ?? null;
  const currentCiwHandsRaised = metrics.ciw_hands_raised?.value ?? null;

  // Display copy only. Rock identity -- metric Id, category path, Guid -- comes
  // from metric-catalog.generated.mjs so this table cannot drift from the
  // registry the way the hand-maintained version did: every category path in
  // it was wrong ("Weekly Metrics > SUNDAY > ..." is not a path that exists in
  // Rock), and one status claimed a repair that never happened.
  const AUDIT_DISPLAY = [
    // Non-published / Action Items FIRST for immediate reviewer clarity
    {
      key: "sunday_share",
      name: "Sunday Attendance Share",
      source: "Attendance / Manila Active Base",
      formula: "True Attendance / dated canonical Active Base",
      value: metrics.sunday_share?.value !== null && metrics.sunday_share?.value !== undefined
        ? `${(metrics.sunday_share.value * 100).toFixed(1)}%`
        : "No data available",
      status: "action-derived",
      status_label: "Derived display value · calculated directly",
      action_note: "Derived dynamically from canonical attendance and active base observations."
    },
    {
      key: "orange_conversion",
      name: "Orange Card Conversion Rate",
      source: "Cards / New People Bags",
      formula: "Physical Cards / New People Bags",
      value: currentNewP !== null && currentCards !== null && currentNewP > 0 ? `${((currentCards / currentNewP) * 100).toFixed(1)}%` : "No data available",
      status: "action-derived",
      status_label: "Derived display value · calculated directly",
      action_note: "Derived dynamically when both canonical observations are present."
    },
    {
      key: "volunteer_ratio",
      name: "Volunteer Serving Density",
      source: "Volunteers / Total Attendance",
      formula: "Unique Volunteers / Total Sunday Attendance",
      value: metrics.volunteer_ratio?.value !== null && metrics.volunteer_ratio?.value !== undefined
        ? `${(metrics.volunteer_ratio.value * 100).toFixed(1)}%`
        : "No data available",
      status: "action-derived",
      status_label: "Derived display value · follows unique volunteer count",
      action_note: "Unavailable in any week where the unique-volunteer count is unavailable, rather than falling back to a differently-defined volunteer count."
    },
    {
      key: "total_attendance",
      name: "Total Sunday Attendance",
      source: "Derived from canonical observations",
      formula: "Auditorium Adults + Kids Attendance + Kids Leaders, only when all three are reported",
      value: formatNumber(currentTotalAtt),
      status: "action-derived",
      status_label: "Derived display value · legacy rollup is not campus-scoped",
      action_note: "The island derives this figure from Auditorium Adults, Kids Attendance, and Kids Leaders canonical observations (legacy rollup is not campus-scoped)."
    },
    // Published / Existing Production Metrics (Muted & Greyed Out)
    {
      key: "seated_adults",
      name: "HOST Service Attendance",
      source: "Auditorium In-Person Headcount",
      formula: "Auditorium Headcount",
      value: formatNumber(currentAdults),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "kids_attended",
      name: "KIDS Attendance",
      source: "Kids Check-In Roster",
      formula: "Kids Check-In Headcount",
      value: formatNumber(currentKids),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "kids_leaders",
      name: "KIDS Leaders",
      source: "Serving Kids Volunteers Check-In",
      formula: "Kids Leaders Check-In Headcount",
      value: formatNumber(currentLeaders),
      status: "published",
      action_note: "Active in Rock production as \"MNL Kids Volunteers\". No mutation needed."
    },
    {
      key: "volunteers",
      name: "Sunday Volunteers",
      source: "Total Unique Volunteers observation",
      formula: "Unique Volunteers Rollup",
      value: formatNumber(currentVols),
      status: "published",
      status_label: "✓ Canonical unique-volunteer metric",
      action_note: "Historical team counts are retained evidence, not a rendering source."
    },
    {
      key: "new_people_bags",
      name: "PPL New People Bags",
      source: "Welcome Lounge Bag Distribution",
      formula: "Welcome Bag Count",
      value: formatNumber(currentNewP),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "talked_to",
      name: "GRT Talked To (Visitors)",
      source: "Greeter Welcome Log",
      formula: "Greeter Welcome Count",
      value: formatNumber(currentTalked),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "orange_cards",
      name: "PPL Physical Orange Cards",
      source: "Visitor Cards Received",
      formula: "Orange Card Count",
      value: formatNumber(currentCards),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "hands_raised",
      name: "GRT Hands Raised (Salvations)",
      source: "Altar Call Deciders Count",
      formula: "Auditorium Altar Call Count",
      value: formatNumber(currentHands),
      status: "published",
      action_note: "Distinct from CIW Hands Raised; resolved by stable Guid."
    },
    {
      key: "response_lounge",
      name: "GRT Response Lounge Hosted",
      source: "Lounge Attendance Log",
      formula: "Gospel Lounge Count",
      value: formatNumber(currentLounge),
      status: "published",
      action_note: "Active in Rock production. No mutation needed."
    },
    {
      key: "ciw_attendees",
      name: "CIW Attendees",
      source: "CIW weekly observation",
      formula: "CIW In-Person Headcount",
      value: formatNumber(currentCiwAttendees),
      status: "published",
      action_note: "Resolved by stable Guid; distinct from Sunday attendance."
    },
    {
      key: "ciw_chinese",
      name: "CIW Chinese",
      source: "CIW weekly observation",
      formula: "CIW Fellowship Headcount",
      value: formatNumber(currentCiwChinese),
      status: "published",
      action_note: "Resolved by stable Guid."
    },
    {
      key: "ciw_hands_raised",
      name: "CIW Hands Raised",
      source: "CIW weekly observation",
      formula: "CIW Altar Call Count",
      value: formatNumber(currentCiwHandsRaised),
      status: "published",
      action_note: "Resolved by stable Guid; distinct from Sunday service hands raised."
    }
  ];

  const AUDIT_ITEMS = AUDIT_DISPLAY.map((item) => {
    const identity = auditIdentity(item.key);
    return {
      ...item,
      ...identity,
      status_label: item.status_label || identity.status_label,
      action_note: identity.campus_note ? `${item.action_note} ${identity.campus_note}` : item.action_note,
    };
  });

  const rowsHtml = AUDIT_ITEMS.map((item) => {
    const isAction = item.status.startsWith("action");
    const rowClass = isAction ? "audit-row--action" : "audit-row--published";

    return `
    <tr class="${rowClass}" data-status="${escapeHtml(item.status)}">
      <th scope="row" class="audit-name-cell">
        <div class="audit-name-wrapper">
          ${isAction ? '<span class="audit-action-indicator" title="Requires review / provisioning">⚡</span>' : '<span class="audit-published-dot" title="Already active on prod">●</span>'}
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <code class="audit-key">${escapeHtml(item.key)}</code>
      </th>
      <td class="audit-cat-cell">
        <span class="audit-category">${escapeHtml(item.category)}</span>
        <code class="audit-guid" title="${escapeHtml(item.guid)}">${escapeHtml(item.guid)}</code>
      </td>
      <td class="audit-formula-cell">
        <span class="audit-formula">${escapeHtml(item.formula)}</span>
        <small class="audit-source">${escapeHtml(item.source)}</small>
      </td>
      <td class="tabular-figures audit-val-cell">
        <strong>${escapeHtml(item.value)}</strong>
      </td>
      <td class="audit-status-cell">
        <span class="audit-badge audit-badge--${escapeHtml(item.status)}">
          ${escapeHtml(item.status_label)}
        </span>
      </td>
      <td class="audit-notes-cell">
        <span class="audit-action-note">${escapeHtml(item.action_note)}</span>
      </td>
    </tr>`;
  }).join("");

  return `
  <section class="metric-audit-section" aria-labelledby="audit-heading" data-dev-only="true">
    <div class="section-inner">
      <div class="dev-only-callout-banner">
        <div class="dev-only-badge">
          <span class="dev-pulse-dot"></span>
          <span>DEV / LOCAL REVIEW ONLY · EXCLUDED FROM PROD ROCK</span>
        </div>
        <p class="dev-only-desc">
          This inspection ledger only renders on the local workbench and preview testbeds. It verifies Rock metric bindings so reviewers can instantly spot new or missing metrics before production release.
        </p>
      </div>

      <div class="dashboard-header-row" style="margin-top: 1.5rem;">
        <div>
          <p class="section-kicker">Reviewer Architecture &amp; Governance</p>
          ${renderSectionHeading("audit-heading", "Metric Catalog & Production Readiness", "Read-back ledger showing which definitions and Aug 23 observations are ready, missing, or blocked before production.")}
        </div>
        <div class="audit-summary-pill">
          <span class="audit-pill-highlight">⚠ Production gaps remain</span>
          <span class="audit-pill-sep">/</span>
          <span class="audit-pill-muted">✓ Existing definitions shown below</span>
        </div>
      </div>

      <div class="table-scroll" tabindex="0" role="region" aria-label="Metric Catalog and Production Readiness Ledger">
        <table class="audit-data-table">
          <thead>
            <tr>
              <th scope="col">Metric &amp; Key</th>
              <th scope="col">Rock Category &amp; Stable Guid</th>
              <th scope="col">Calculation Formula / Source</th>
              <th scope="col">Current Value</th>
              <th scope="col">Production Status</th>
              <th scope="col">Reviewer Action Note</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

export function renderReport(bundle, options = {}) {
  const includeDevInspector = options.includeDevInspector === true;
  const rendererByType = {
    // renderCover composes the headline numbers into the hero itself, so it is the whole band.
    "report-cover": renderCover,
    "attendance-feature": renderAttendance,
    "metric-dashboard": renderDashboard,
    "time-series-chart": renderVolunteerChart,
    "signup-table": renderSignups,
    narrative: renderNarrative,
    alert: renderAlert,
    media: renderMedia,
  };
  const sections = (bundle.sections || []).slice().sort((a, b) => a.order - b.order)
    .map((section) => rendererByType[section.type]?.(bundle) || "").join("");
  const auditInspector = includeDevInspector ? renderMetricAuditInspector(bundle) : "";
  const isStale = bundle.identity?.is_stale === true;
  const staleBanner = isStale ? `
    <section class="stale-data-banner" role="status" aria-label="Stale data notice">
      <div>
        <strong>Data snapshot is stale</strong>
        <span>Last report: ${escapeHtml(formatDate(bundle.identity?.report_date))}. Current Sunday numbers have not been published yet.</span>
      </div>
      <a href="#" target="_blank" rel="noopener noreferrer">Submit Sunday Inputs ↗</a>
    </section>` : "";

  return `
  <main class="techstats-report" data-stale="${isStale ? "true" : "false"}" data-template-version="${escapeHtml(bundle.identity?.template_version || "")}">
    ${staleBanner}
    ${sections}
    ${renderDashboardChangelog()}
    ${auditInspector}
    <button type="button" class="back-to-top-button" data-action="scroll-to-top" onclick="window.scrollTo({top:0,behavior:'smooth'});if(document.documentElement)document.documentElement.scrollTo({top:0,behavior:'smooth'});if(document.body)document.body.scrollTo({top:0,behavior:'smooth'});" aria-label="Scroll back to top">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
      <span>Top</span>
    </button>
  </main>`;
}

/* ---------------------------------------------------------------------------------------
 * Pure view-model builders (#214, #216, #220). Every function below returns plain,
 * JSON-safe data -- the exact rows the widgets above render, never a re-derived shape --
 * so the export rail, the copy prompt, and the package can never drift from the page (D7).
 * Nothing here touches the DOM: these run in plain Node against a bundle fixture, and both
 * techstats-boot.mjs (the live, Rock-backed island) and the fictional workbench
 * (apps/techstats-island/index.html, which never imports techstats-boot.mjs, so it never
 * triggers that module's self-boot / live fetch) build their view from the same functions.
 * ------------------------------------------------------------------------------------- */

const METRICS_HISTORY_COLUMNS = [
  { key: "sunday", label: "Sunday" },
  { key: "projected_unique", label: "Projected unique / True attendance", kind: "number" },
  { key: "total_attendance", label: "Raw attendance", kind: "number" },
  { key: "service_count", label: "Services" },
  { key: "seated_adults", label: "Adults", kind: "number" },
  { key: "kids_attended", label: "Kids", kind: "number" },
  { key: "kids_leaders", label: "Kids leaders", kind: "number" },
  { key: "volunteers", label: "Volunteers", kind: "number" },
  { key: "new_people", label: "New people", kind: "number" },
  { key: "hands_raised", label: "Hands raised", kind: "number" },
  { key: "response_lounge", label: "Response lounge", kind: "number" },
];

// The Historical Data Ledger groups weeks by month and opens only the current month by
// default, but every month's rows are already rendered (collapsed, not absent) -- so the
// export is every point in the same newest-month-first, newest-week-first order the ledger
// displays, not a re-fetch of "this month only" (#214 D7).
export function metricsHistoryRows(bundle) {
  const combo = bundle?.chart_series?.combo || {};
  const { monthGroups } = computePeaksAndGroups(combo, bundle?.historical_attendance_models);
  const rows = [];
  for (const group of monthGroups) {
    for (const point of group.points) {
      rows.push({
        sunday: point.label,
        projected_unique: point.projected_unique,
        total_attendance: point.total_attendance,
        service_count: serviceLabel(point.service_count),
        seated_adults: point.seated_adults,
        kids_attended: point.kids_attended,
        kids_leaders: point.kids_leaders,
        volunteers: point.volunteers,
        new_people: point.new_people,
        hands_raised: point.hands_raised,
        response_lounge: point.response_lounge,
      });
    }
  }
  return rows;
}

const ATTENDANCE_SHARE_COLUMNS = [
  { key: "metric", label: "Metric" },
  { key: "projected_unique", label: "Projected unique / True attendance", kind: "number" },
  { key: "raw_attendance", label: "Raw attendance", kind: "number" },
  { key: "active_manila_base", label: "Active Manila Base", kind: "number" },
  { key: "share", label: "Sunday Attendance Share", kind: "percent" },
  { key: "share_low", label: "Estimated range low", kind: "percent" },
  { key: "share_high", label: "Estimated range high", kind: "percent" },
];

export function attendanceShareRows(bundle) {
  const presentation = bundle?.presentation_metrics || {};
  const model = bundle?.attendance_model || {};
  return [{
    metric: "Sunday Attendance Share",
    projected_unique: model.available ? model.projected_unique : null,
    raw_attendance: model.headcount ?? null,
    active_manila_base: presentation.activeManilaBase ?? null,
    share: presentation.sundayShare ?? null,
    share_low: presentation.sundayShareLow ?? null,
    share_high: presentation.sundayShareHigh ?? null,
  }];
}

const VOLUNTEER_HISTORY_COLUMNS = [
  { key: "sunday", label: "Sunday" },
  { key: "volunteers", label: "Volunteers", kind: "number" },
  { key: "vs_month_avg", label: "Vs month avg", kind: "number" },
  { key: "total_attendance", label: "Sunday attendance", kind: "number" },
  { key: "vol_att_ratio", label: "Vol/att ratio", kind: "percent" },
];

// Mirrors renderVolunteerMonthlyTable's per-row math (month average, delta against it, and
// the volunteer/attendance ratio) exactly, from the same computePeaksAndGroups() points, so
// the exported table can never show different numbers than the on-page ledger.
export function volunteerHistoryRows(bundle) {
  const combo = bundle?.chart_series?.combo || {};
  const { monthGroups } = computePeaksAndGroups(combo);
  const rows = [];
  for (const group of monthGroups) {
    const validVols = group.points.filter((p) => p.volunteers !== null && !isReconstructedCalculation(p.volunteers_quality));
    const avgVols = validVols.length
      ? Math.round(validVols.reduce((sum, p) => sum + p.volunteers, 0) / validVols.length)
      : null;
    for (const point of group.points) {
      const ratio = typeof point.total_attendance === "number" && typeof point.volunteers === "number" && point.total_attendance > 0
        ? Math.round((point.volunteers / point.total_attendance) * 1000) / 10
        : null;
      rows.push({
        sunday: point.label,
        volunteers: point.volunteers,
        vs_month_avg: avgVols !== null && point.volunteers !== null ? point.volunteers - avgVols : null,
        total_attendance: point.total_attendance,
        vol_att_ratio: ratio,
      });
    }
  }
  return rows;
}

const WEEKLY_METRICS_COLUMNS = [
  { key: "metric", label: "Metric" },
  { key: "this_week", label: "This week", kind: "number" },
  { key: "wow_change", label: "W/W change", kind: "number" },
  { key: "yoy_value", label: "Same week last year", kind: "number" },
  { key: "yoy_change", label: "Y/Y change", kind: "number" },
];

// The same array the on-page "This Week · Sunday Stats" table renders
// (resolveDeltaTable), reshaped for a TableSpec / KPI tile rather than a <tr>.
export function weeklyMetricsRows(bundle) {
  return resolveDeltaTable(bundle).map((row) => ({
    metric: row.label,
    this_week: row.value ?? null,
    wow_change: row.wow_adjacent === false ? null : row.wow_delta ?? null,
    yoy_value: row.yoy_value ?? null,
    yoy_change: row.yoy_delta ?? null,
  }));
}

const SIGNUPS_COLUMNS = [
  { key: "event", label: "Registration form / event" },
  { key: "count", label: "Live count", kind: "number" },
  { key: "delta", label: "W/W change", kind: "number" },
  { key: "status", label: "Status" },
];

// Every signup snapshot the section renders -- not filtered to "active"; the summary pills
// above the table are the only place that narrows to active, the table itself shows all.
export function signupsRows(bundle) {
  return asArray(bundle?.signups).map((signup) => ({
    event: signup.name ?? "",
    count: typeof signup.count === "number" ? signup.count : null,
    delta: typeof signup.delta === "number" ? signup.delta : null,
    status: signup.state || "not reported",
  }));
}

// Sermon titles and YouTube ids only -- no speaker, no href (D8: aggregate/public-facing
// content only). Prefers the identity-level sermon list; falls back to non-recap media the
// same way generateAiPrompt's prompt text does.
export function sermonLinks(bundle) {
  const identitySermons = asArray(bundle?.identity?.sermons);
  if (identitySermons.length) {
    return identitySermons.map((sermon) => ({
      title: sermon.title || "Sunday Service",
      youtubeId: sermon.youtube_id || sermon.videoId || null,
    }));
  }
  return asArray(bundle?.media)
    .filter((item) => item && item.kind !== "recap")
    .map((item) => ({
      title: item.title || item.caption || "Sunday Service",
      youtubeId: item.youtube_id || null,
    }));
}

function techstatsControls(canEdit) {
  const controls = [
    {
      id: "date-archive", kind: "select", label: "Jump to date",
      selector: ".nav-archive__date",
      effect: "Pick a service date to load that week's report.",
    },
    {
      id: "report-step", kind: "button-group", label: "Step report",
      selector: ".nav-step--prev, .nav-step--next",
      effect: "Step to the previous or next weekly report.",
    },
    {
      id: "volunteer-view", kind: "segmented", label: "Volunteer trend view",
      selector: ".volunteer-switch-btn", values: ["year", "week"],
      effect: "Switch the volunteer chart between a year-over-year overlay and a continuous week-by-week trajectory.",
    },
  ];
  if (canEdit) {
    controls.push({
      id: "edit-report", kind: "toggle", label: "Edit report",
      selector: ".editor-btn--edit",
      effect: "Enter edit mode to adjust venue, services, narrative, and the highlight metric before saving a draft or publishing.",
    });
  }
  return controls;
}

// The pure view-model builder (#214, #220/#221): everything the copy prompt, the package,
// and the export rail need, built once from a bundle plus a handful of caller-supplied facts
// a pure function cannot know on its own (the page address, whether the viewer can edit).
// No DOM, no fetch, no Date.now() outside the one permitted generatedAt stamp -- runnable
// and unit-tested in plain Node (tests/test_techstats_view.mjs).
export function buildViewFromBundle(bundle, options = {}) {
  const identity = bundle?.identity || {};
  const narratives = bundle?.narratives || {};
  const now = options.now instanceof Date ? options.now : new Date();
  const filters = {
    date: identity.service_date || identity.report_date || "",
    campus: identity.campus || "MNL",
  };
  const filterParts = [];
  if (filters.date) filterParts.push(`Week of ${filters.date}`);
  filterParts.push(`Campus: ${filters.campus}`);

  const weeklyRows = weeklyMetricsRows(bundle);
  const narrative = narratives.executive_summary || narratives.cover || narratives.dashboard || narratives.sunday_dashboard || "";
  const sermons = sermonLinks(bundle);
  // Older payloads carry the sentinel "1" / "1.0" rather than a real template id; the on-page
  // navigator (renderNavigator, techstats-boot.mjs) falls back to the shipped template for the
  // same reason, and every artifact should say the same version the page just showed.
  const rawTemplateVersion = identity.template_version;
  const templateVersion = rawTemplateVersion && rawTemplateVersion !== "1" && rawTemplateVersion !== "1.0"
    ? rawTemplateVersion
    : "1.4.3";

  const sections = [
    kpiSection(
      "techstats-verified-metrics",
      "Verified Sunday metrics",
      weeklyRows.map((row) => ({ label: row.metric, value: row.this_week, delta: row.wow_change })),
    ),
    tableSection(
      "techstats-weekly-delta",
      "This week · Sunday stats",
      WEEKLY_METRICS_COLUMNS,
      weeklyRows,
      { note: "Week-over-week and same-week-last-year comparison for the seven headline Sunday metrics." },
    ),
    tableSection(
      "techstats-attendance-share",
      "Sunday attendance share",
      ATTENDANCE_SHARE_COLUMNS,
      attendanceShareRows(bundle),
      { note: "Projected unique attendance divided by the canonical Active Manila Base; raw attendance is retained as context." },
    ),
    tableSection(
      "techstats-metrics-history",
      "Historical data ledger",
      METRICS_HISTORY_COLUMNS,
      metricsHistoryRows(bundle),
      { note: "Every recorded Sunday, grouped by month in the ledger above, newest week first." },
    ),
    tableSection(
      "techstats-volunteers",
      "Volunteer history",
      VOLUNTEER_HISTORY_COLUMNS,
      volunteerHistoryRows(bundle),
      { note: "Unique volunteer headcount per Sunday against each month's average." },
    ),
    tableSection(
      "techstats-signups",
      "Live signups & registrations",
      SIGNUPS_COLUMNS,
      signupsRows(bundle),
      { note: "Every registration form or campaign tracked for this snapshot, active or closed." },
    ),
    {
      id: "techstats-executive-summary",
      heading: "Weekly context & executive summary",
      kind: "prose",
      text: narrative || "",
      unavailable: narrative ? undefined : "No narrative was recorded for this report.",
    },
    {
      id: "techstats-sermons",
      heading: "Sunday services",
      kind: "links",
      columns: [
        { key: "title", label: "Service" },
        { key: "youtubeId", label: "YouTube ID" },
      ],
      rows: sermons,
      unavailable: sermons.length ? undefined : "No service media was recorded for this report.",
    },
  ];

  return {
    surface: { id: "techstats-metrics", title: "TechStats", route: "TechStatsNew" },
    mode: "creative",
    url: options.url || "",
    filters,
    filterSummary: filterParts.join(" · "),
    templateVersion,
    generatedAt: now.toISOString(),
    fictional: Boolean(options.fictional),
    sections,
    controls: techstatsControls(Boolean(options.canEdit)),
  };
}
