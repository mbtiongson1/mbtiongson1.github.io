/**
 * Rock loads the vendored chart.min.js as a classic script before this module.
 * Chart.js therefore stays self-hosted and is consumed through globalThis.Chart;
 * it is not dynamically imported because the vendored build is not an ES module.
 */
import { renderReport, renderMarkdown, escapeHtml, formatNumber, buildViewFromBundle } from "./render.mjs?v=20260922_1034";
import { buildChartConfig, buildVolunteerChartConfig, resolveSermonTitle, get2026SundayForWeek, getWeekNumberForDate } from "./charts.mjs?v=20260922_1034";
import { restToBundle } from "./rest-to-bundle.mjs?v=20260922_1034";
import { currentManilaServiceDate, loadMetricBackedReport, loadScheduleCountForDate, loadScheduleCountsForDates, loadVolunteerHistory, serviceDateForMetricRequest, shouldLoadLiveSignupsForDate } from "./metric-source.mjs?v=20260922_1034";
import { loadLiveSignups } from "./signups-source.mjs?v=20260922_1034";
import { groupSermonMedia, sermonsToMedia, extractYouTubeId } from "./editor-sermons.mjs?v=20260922_1034";
import { fetchCanonicalServiceTimes } from "./service-times-source.mjs?v=20260922_1034";
import { loadSundayInputsSettings } from "./sunday-settings-source.mjs";
import { createExportRegistry, bindExportDelegation, exportCanvasToPng } from "./dashboard-export.mjs?v=20260922_1034";
import { mountCopyPrompt, mountPackageControl, buildDashboardPackage } from "./dashboard-prompt.mjs?v=20260922_1034";
import { mountTooltipLayer, tooltipContent } from "./dashboard-tooltip.mjs?v=20260922_1034";
import { UNAVAILABLE_TITLE } from "./classic-widgets.mjs?v=20260922_1034";
import { formatClock, motionMs, mountStatus, trackHostChrome } from "./dashboard-status.mjs?v=20260922_1034";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_1034";
import { attachBreadcrumbsInteractions } from "./dashboard-breadcrumbs.mjs?v=20260922_1034";

/* Executive Markup (#598): one pen per page, re-docked on every redraw. */
let markup = null;

// Ensure latest techstats.css is loaded without browser cache staleness
(function ensureFreshCss() {
  if (typeof document === "undefined") return;
  const existing = document.querySelector('link[href*="techstats.css"]');
  if (existing) {
    /* demo: keep local stylesheet */
  }
})();

// Dismiss any open info tooltip, inline popover, or pinned volunteer popover on click outside or Escape
(function initGlobalInfoDismiss() {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".metric-info-popover") && !e.target.closest(".metric-info-btn")) {
      const p = document.querySelector(".metric-info-popover");
      if (p) p.remove();
    }
    if (!e.target.closest(".volunteer-pinned-popover") && !e.target.closest('[data-chart="volunteers"]')) {
      const vp = document.querySelector(".volunteer-pinned-popover");
      if (vp) vp.remove();
    }
    if (!e.target.closest(".inline-popover") && !e.target.closest(".inline-edit-btn")) {
      const ip = document.querySelector(".inline-popover");
      // Sunday Services & Preachers modal is dismissed only via its close button or on save/discard
      if (ip && !ip.classList.contains("inline-popover--services") && e.target.isConnected) {
        ip.remove();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const p = document.querySelector(".metric-info-popover");
      if (p) p.remove();
      const vp = document.querySelector(".volunteer-pinned-popover");
      if (vp) vp.remove();
      const ip = document.querySelector(".inline-popover");
      if (ip) ip.remove();
      const overlay = document.querySelector(".techstats-confirm-overlay");
      if (overlay) overlay.remove();
    }
  });
})();

/* One tooltip layer for the whole report (#236, #252): the report re-renders on every bundle
 * refresh (a week change, a filter), so this is created once and reused, the same singleton
 * shape classic-widgets.mjs uses for the identical reason. */
let sharedTooltipLayer = null;
function tooltipLayer() {
  if (typeof document === "undefined") return null;
  if (!sharedTooltipLayer) sharedTooltipLayer = mountTooltipLayer(document.body, { surface: "techstats" });
  return sharedTooltipLayer;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value) {
  if (!ISO_DATE.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return parsed;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isoDateValue(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ""));
  return match ? match[1] : "";
}

// A report payload is canonical when its metric rows are tagged with the
// MetricGuid the renderer maps against. Older plugin builds project the raw
// entity instead, which carries no guid and uses retired metric keys — those
// rows cannot be mapped, so the metric fan-out has to supply the numbers.
function hasCanonicalMetrics(reportData) {
  const metrics = reportData?.Metrics;
  if (!Array.isArray(metrics) || metrics.length === 0) return false;
  return metrics.some((metric) => {
    const guid = metric?.MetricGuid ?? metric?.metricGuid;
    return typeof guid === "string" && guid.trim() !== "";
  });
}

function currentMondayIso() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return isoDate(today);
}

function markFreshness(bundle, isHistoricalView) {
  const reportDate = bundle?.identity?.report_date || "";
  bundle.identity.is_stale = !isHistoricalView && (!reportDate || reportDate < currentMondayIso());
  return bundle;
}

function mondayOf(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return isoDate(date);
}

function shiftWeeks(value, weeks) {
  const date = parseIsoDate(mondayOf(value));
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + (weeks * 7));
  return isoDate(date);
}

export function reportEndpoint(search = "") {
  const date = new URLSearchParams(search).get("date");
  return parseIsoDate(date)
    ? `/api/TechStats/report?date=${encodeURIComponent(date)}`
    : "/api/TechStats/latest";
}

export function recentMondayDates(anchorDate, count = 7) {
  const anchor = mondayOf(anchorDate);
  if (!anchor || !Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => shiftWeeks(anchor, index - count + 1));
}

export function archiveMonday(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const first = new Date(Date.UTC(year, month - 1, 1));
  first.setUTCDate(1 + ((8 - first.getUTCDay()) % 7));
  return isoDate(first);
}

function read(object, pascalName, camelName) {
  if (!object || typeof object !== "object") return undefined;
  return object[pascalName] ?? object[camelName];
}

export function hasCoreObservations(report) {
  const metrics = report?.Metrics;
  if (!Array.isArray(metrics)) return false;
  return metrics.some((metric) => {
    const key = metric?.MetricKey ?? metric?.metricKey;
    const value = metric?.Value ?? metric?.value;
    return (key === "seated_adults" || key === "kids_attended" || key === "total_attendance") &&
      value !== null && value !== undefined && String(value).trim() !== "";
  });
}

export function mergePublishedActiveBase({ reportData, metricReport, requestedDate = "" } = {}) {
  if (!reportData || !hasCanonicalMetrics(reportData) || !requestedDate) return reportData;
  const publishedCampus = String(
    read(reportData?.Report, "Campus", "campus") || read(reportData, "Campus", "campus") || "MNL",
  ).toUpperCase();
  if (publishedCampus !== "MNL") return reportData;
  const activeBaseMetric = metricReport?.Metrics?.find((metric) =>
    (metric?.MetricKey ?? metric?.metricKey) === "manila_active_base");
  if (!activeBaseMetric) return reportData;
  const publishedMetrics = Array.isArray(reportData.Metrics) ? reportData.Metrics : [];
  return {
    ...reportData,
    Metrics: [
      ...publishedMetrics.filter((metric) => (metric?.MetricKey ?? metric?.metricKey) !== "manila_active_base"),
      activeBaseMetric,
    ],
  };
}

export function shouldUseMetricReport({
  metricReport,
  reportData,
  requestedDate = "",
} = {}) {
  if (!metricReport) return false;
  if (!reportData) return true;

  const customServiceDate = isoDateValue(read(reportData?.Report, "ServiceDate", "serviceDate"));
  const metricServiceDate = isoDateValue(read(metricReport?.Report, "ServiceDate", "serviceDate"));

  if (!customServiceDate) return true;
  // An explicit ?date= request asks for that specific week's snapshot or live draft
  if (requestedDate) return true;
  // If the published report covers the exact same service date, merge live canonical metrics
  if (customServiceDate === metricServiceDate) return true;
  // On root view (no date requested), only preempt an older published report if the new Sunday
  // actually has live core attendance observations. An empty shell (e.g. Sunday morning before
  // services take place) must not replace last week's complete report with blank fields.
  return hasCoreObservations(metricReport);
}

export function serializeNarratives(narratives = {}, hiddenKeys = new Set()) {
  return Object.entries(narratives)
    .filter(([sectionKey]) => !hiddenKeys.has(sectionKey.toLowerCase()))
    .map(([SectionKey, Markdown]) => ({ SectionKey, Markdown }));
}

function editorialPayload(workingBundle) {
  const identity = workingBundle?.identity || {};
  const highlight = identity.highlight_metric || {};
  return {
    Venue: identity.venue ?? "",
    ServiceTag: identity.service_tag ?? "",
    Weather: identity.weather ?? "",
    ServiceTimes: Array.isArray(identity.service_times) ? identity.service_times : [],
    HighlightMetric: {
      value: highlight.value ?? "",
      label: highlight.label ?? "",
      detail: highlight.detail ?? "",
    },
  };
}

function editableMediaPayload(workingBundle, hiddenKeys = new Set()) {
  const media = Array.isArray(workingBundle?.media) ? workingBundle.media : [];
  const value = (item, pascalName, camelName, snakeName) => read(item, pascalName, camelName) ?? item?.[snakeName];
  const isGuid = (val) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(val || "").trim());
  return media
    .filter((item) => {
      const sectionKey = String(value(item, "SectionKey", "sectionKey", "section_key") || "media").toLowerCase();
      if (hiddenKeys.has(sectionKey)) return false;
      const guid = value(item, "BinaryFileGuid", "binaryFileGuid", "binary_file_guid");
      const videoId = value(item, "VideoId", "videoId", "video_id");
      // Rock's backend ValidateMedia requires:
      // "Each media item requires either a YouTube video id or an existing Binary File GUID."
      return Boolean((guid && isGuid(guid)) || (videoId && /^[a-zA-Z0-9_-]{11}$/.test(String(videoId).trim())));
    })
    .map((item, index) => {
      const guid = value(item, "BinaryFileGuid", "binaryFileGuid", "binary_file_guid");
      const videoId = value(item, "VideoId", "videoId", "video_id");
      return {
        SectionKey: value(item, "SectionKey", "sectionKey", "section_key") || "media",
        BinaryFileGuid: (guid && isGuid(guid)) ? String(guid).trim() : null,
        Caption: value(item, "Caption", "caption", "caption") || "",
        Kind: value(item, "Kind", "kind", "kind") || "",
        VideoId: videoId ? String(videoId).trim() : null,
        ServiceTime: value(item, "ServiceTime", "serviceTime", "service_time") || "",
        SermonTitle: value(item, "SermonTitle", "sermonTitle", "sermon_title") || "",
        Speaker: value(item, "Speaker", "speaker", "speaker") || "",
        SortOrder: value(item, "SortOrder", "sortOrder", "order") ?? index + 1,
      };
    });
}

function rawSectionKeyFor(reportData, normalizedKey) {
  const sections = read(reportData, "Sections", "sections");
  const match = Array.isArray(sections) && sections.find((section) =>
    String(read(section, "Key", "key") || "").toLowerCase() === normalizedKey.toLowerCase());
  return match ? String(read(match, "Key", "key")) : normalizedKey;
}

function normalizedHiddenKeys(reportData, hiddenSections = new Set()) {
  return new Set([...hiddenSections].map((key) => rawSectionKeyFor(reportData, key).toLowerCase()));
}

export function buildDraftPayload({ workingBundle, reportData, hiddenSections = new Set() }) {
  const report = read(reportData, "Report", "report") || {};
  const hiddenKeys = normalizedHiddenKeys(reportData, hiddenSections);
  return {
    ReportDate: workingBundle.identity.report_date,
    ServiceDate: workingBundle.identity.service_date,
    TemplateVersionId: read(report, "TemplateVersionId", "templateVersionId"),
    ...editorialPayload(workingBundle),
    Narratives: serializeNarratives(workingBundle.narratives || {}, hiddenKeys),
    Media: editableMediaPayload(workingBundle),
  };
}

function frozenAttendancePayload(workingBundle) {
  const model = workingBundle?.attendance_model || {};
  return {
    schemaVersion: 1,
    campus: workingBundle?.identity?.campus || "MNL",
    serviceDate: workingBundle?.identity?.service_date || null,
    available: model.available === true,
    headcount: model.headcount ?? null,
    projectedUnique: model.projected_unique ?? null,
    projectedLow: model.projected_low ?? null,
    projectedHigh: model.projected_high ?? null,
    serviceCount: model.service_count ?? null,
    visibleServiceNames: Array.isArray(model.visible_service_names) ? model.visible_service_names : null,
    settingsVersion: model.settings_version ?? null,
    settingsSource: model.settings_source || "sunday-inputs",
    modelYear: model.model_year ?? 2026,
    multiplier: model.multiplier ?? null,
    basis: model.basis ?? null,
    sampleSize: model.sample_size ?? null,
    confidence: model.confidence ?? null,
    previousProjectedUnique: model.previous_projected_unique ?? null,
    previousServiceCount: model.previous_service_count ?? null,
    delta: model.delta ?? null,
    previousComparable: model.previous_comparable === true,
    reason: model.reason || null,
  };
}

export function buildPublishPayload({ workingBundle, reportData, hiddenSections = new Set() }) {
  const hiddenKeys = normalizedHiddenKeys(reportData, hiddenSections);
  return {
    ReportDate: workingBundle.identity.report_date,
    ...editorialPayload(workingBundle),
    PublishedSettings: frozenAttendancePayload(workingBundle),
    Narratives: serializeNarratives(workingBundle.narratives || {}, hiddenKeys),
    Media: editableMediaPayload(workingBundle, hiddenKeys),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeButton(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  return button;
}

function messageElement(title, detail) {
  const main = document.createElement("main");
  main.className = "techstats-report";
  const section = document.createElement("section");
  section.className = "narrative";
  const inner = document.createElement("div");
  inner.className = "section-inner";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = detail;
  inner.append(heading, paragraph);
  section.append(inner);
  main.append(section);
  return main;
}

function bootTechStats(root) {
  const canEdit = root.dataset.canEdit === "true";
  const includeDevInspector = root.dataset.devOnly === "true" ||
    globalThis.location?.hostname === "staging.example.invalid";
  const state = {
    bundle: null,
    workingBundle: null,
    reportData: null,
    selectedDate: new URLSearchParams(globalThis.location.search).get("date"),
    latestDate: null,
    chartInstances: [],
    editing: false,
    dirty: false,
    hiddenSections: new Set(),
    currentUrl: globalThis.location.href,
    // The UX bar (#587): the report date the charts last animated for. Charts animate once
    // when a week arrives and never replay for an edit, a discard, or a hidden section.
    chartsAnimatedFor: null,
  };

  root.replaceChildren();
  const chrome = document.createElement("header");
  chrome.className = "report-chrome";
  const navigator = document.createElement("nav");
  navigator.className = "report-navigator";
  navigator.setAttribute("aria-label", "Report navigation");

  // Week navigation is one compact control -- step back, pick a date, step forward -- and it
  // rides in the hero's utility rail rather than owning a bar of its own. The week pills it
  // replaces listed seven Mondays to reach what the date picker reaches in one tap.
  const previous = makeButton("Prev", "nav-step nav-step--prev");
  previous.setAttribute("aria-label", "Previous weekly report");
  const next = makeButton("Next", "nav-step nav-step--next");
  next.setAttribute("aria-label", "Next weekly report");

  const archiveLabel = document.createElement("label");
  archiveLabel.className = "nav-archive";
  const archiveIcon = document.createElement("span");
  archiveIcon.className = "nav-archive__icon";
  archiveIcon.setAttribute("aria-hidden", "true");
  archiveIcon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
  archiveLabel.append(archiveIcon, " ");
  const archive = document.createElement("input");
  archive.type = "date";
  archive.className = "nav-archive__date";
  archive.setAttribute("aria-label", "Jump to a specific service date");
  archive.title = "Pick a date to view that week's report";
  archiveLabel.append(archive);

  const version = document.createElement("span");
  version.className = "template-version";
  version.append("Template ");
  const versionValue = document.createElement("strong");
  versionValue.textContent = "1.4.6";
  version.append(versionValue);

  const legacyLink = document.createElement("a");
  legacyLink.className = "legacy-version-link";
  legacyLink.href = "#";
  legacyLink.target = "_blank";
  legacyLink.rel = "noopener noreferrer";
  legacyLink.title = "View legacy TechStats dashboard";
  legacyLink.textContent = "Legacy (v1.0) ↗";
  version.append(" · ", legacyLink);

  navigator.append(previous, archiveLabel, next);

  // The rail is one persistent node with its listeners already bound. Every redraw moves it
  // into the freshly rendered hero, so nothing is re-created and nothing is re-wired.
  const utilityRail = document.createElement("div");
  utilityRail.className = "report-utility-rail";
  utilityRail.append(navigator, version);
  chrome.append(utilityRail);

  let editorToolbar = null;
  let editButton = null;
  let cancelButton = null;
  let publishButton = null;
  let editorStatus = null;
  if (canEdit) {
    // Edit is the entry point, so it rides in the hero rail beside the date control. The
    // discard / publish cluster belongs to an edit session and is in the DOM only while
    // one is open -- a viewer who is not editing sees no editor chrome at all.
    editButton = makeButton("Edit", "editor-btn editor-btn--edit");
    editButton.setAttribute("aria-label", "Edit this report");
    utilityRail.append(editButton);

    editorToolbar = document.createElement("div");
    editorToolbar.className = "editor-toolbar";
    editorToolbar.setAttribute("role", "toolbar");
    editorToolbar.setAttribute("aria-label", "Report editor controls");
    editorToolbar.hidden = true;
    const label = document.createElement("span");
    label.className = "editor-toolbar__label";
    label.textContent = "Editing";
    const controls = document.createElement("div");
    controls.className = "editor-controls";
    cancelButton = makeButton("Discard", "editor-btn editor-btn--discard");
    publishButton = makeButton("Publish", "editor-btn editor-btn--publish");
    controls.append(cancelButton, publishButton);
    editorToolbar.append(label, controls);
    chrome.append(editorToolbar);
  }

  const reportShell = document.createElement("div");
  reportShell.className = "report-shell";
  reportShell.setAttribute("aria-live", "polite");
  root.append(chrome, reportShell);
  // The UX bar (#587): one visible status chip for every announce(), and its own live region
  // (this island has no --console-top measurement, so the chip measures Rock's chrome itself).
  const statusLive = document.createElement("p");
  statusLive.className = "ux-live";
  statusLive.setAttribute("role", "status");
  statusLive.setAttribute("aria-live", "polite");
  root.append(statusLive);
  const status = mountStatus(root, { live: statusLive });
  trackHostChrome(root);
  syncHeroFit();
  globalThis.addEventListener?.("resize", syncHeroFit, { passive: true });

  // The export rail and the copy prompt both announce what just happened (a save, a copy,
  // a download) into this island's existing status region. Editors already get one
  // (editorStatus, above); a read-only viewer gets the same idiom so announce() always has
  // somewhere to write without ever touching reportShell, whose whole content is replaced on
  // every redraw.
  if (!editorStatus) {
    editorStatus = document.createElement("span");
    editorStatus.className = "export-status sr-only";
    editorStatus.setAttribute("role", "status");
    editorStatus.setAttribute("aria-live", "polite");
    chrome.append(editorStatus);
  }

  // Rock renders its own header and nav above this island, so the hero's "full viewport" is the
  // height that is actually left below that chrome -- not 100svh. A hero that is a full 100svh
  // TALL but starts below the chrome overhangs the fold by exactly the chrome's height, which is
  // what sliced the headline numbers in half at 1440x900. Publish the measured offset, and a
  // coarse fit tier the stylesheet retunes its vertical rhythm from. A media query cannot see
  // this offset, so it would under-compact by precisely the amount that causes the bug.
  function syncHeroFit() {
    const hero = root.querySelector(".report-hero");
    const offset = Math.max(0, Math.round(
      (hero ? hero.getBoundingClientRect().top : root.getBoundingClientRect().top) + (globalThis.scrollY || 0),
    ));
    root.style.setProperty("--hero-offset", `${offset}px`);
    const available = (globalThis.innerHeight || 0) - offset;
    root.dataset.heroFit = available < 700 ? "tight" : available < 860 ? "compact" : "roomy";
  }

  function setEditorState(busy = false) {
    if (!canEdit) return;
    // The discard / publish toolbar exists only for the duration of an edit session.
    editorToolbar.hidden = !state.editing;
    editButton.disabled = busy || state.editing || !state.bundle;
    editButton.hidden = state.editing;
    if (cancelButton) cancelButton.disabled = busy;
    if (publishButton) {
      publishButton.disabled = busy;
      publishButton.setAttribute("aria-busy", String(busy));
    }
  }

  function setEditorStatus(message, isError = false) {
    if (!editorStatus) return;
    editorStatus.textContent = message;
    editorStatus.dataset.state = isError ? "error" : "ready";
  }

  function renderNavigator() {
    const anchor = mondayOf(state.selectedDate || state.bundle?.identity?.report_date);
    previous.disabled = !anchor;
    next.disabled = !anchor || Boolean(state.latestDate && anchor >= state.latestDate);
    if (anchor) archive.value = anchor;
    const rawVer = state.bundle?.identity?.template_version;
    versionValue.textContent = (rawVer && rawVer !== "1" && rawVer !== "1.0") ? rawVer : "1.4.6";
  }

  function destroyCharts() {
    for (const chart of state.chartInstances) chart.destroy();
    state.chartInstances = [];
  }

  /* Chart motion policy (#587): a chart draws itself once, when its week arrives, over the
   * focal beat. Every later redraw of the same week (an inline edit, a discard, a hidden
   * section, a volunteer view switch) lands finished, because replaying a 1s build for a value
   * that changed by three is the kill criterion "charts fully replay after minor changes".
   * Reduced motion draws finished every time. */
  function chartAnimation() {
    const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const week = state.bundle?.identity?.report_date || state.selectedDate || "";
    const firstDrawOfWeek = state.chartsAnimatedFor !== week;
    if (reducedMotion || !firstDrawOfWeek) return false;
    const duration = motionMs(root, "--motion-focal", 550);
    return duration > 0 ? { duration, easing: "easeOutQuart" } : false;
  }

  function drawCharts() {
    if (!state.workingBundle || typeof globalThis.Chart !== "function") return;
    const animation = chartAnimation();
    for (const [name, originalConfig] of Object.entries(buildChartConfig(state.workingBundle))) {
      const canvas = reportShell.querySelector(`[data-chart="${name}"]`);
      if (!canvas) continue;
      const config = clone(originalConfig);
      config.options.animation = animation;
      state.chartInstances.push(new globalThis.Chart(canvas, config));
    }
    state.chartsAnimatedFor = state.bundle?.identity?.report_date || state.selectedDate || "";
  }

  function drawVolunteerChart(mode = "year") {
    if (!state.workingBundle || typeof globalThis.Chart !== "function") return;
    const canvas = reportShell.querySelector('[data-chart="volunteers"]');
    if (!canvas) return;
    const figure = canvas.closest(".volunteer-chart-figure") || canvas.parentElement;
    const existingIndex = state.chartInstances.findIndex((c) => c.canvas === canvas);
    if (existingIndex >= 0) {
      state.chartInstances[existingIndex].destroy();
      state.chartInstances.splice(existingIndex, 1);
    }
    const config = clone(buildVolunteerChartConfig(state.workingBundle, mode));
    config.options.animation = chartAnimation();
    const chart = new globalThis.Chart(canvas, config);
    state.chartInstances.push(chart);

    canvas.onclick = (evt) => {
      const elements = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
      const existingPopover = figure.querySelector(".volunteer-pinned-popover");
      if (!elements || !elements.length) {
        if (existingPopover) existingPopover.remove();
        return;
      }
      const firstPoint = elements[0];
      const datasetIndex = firstPoint.datasetIndex;
      const index = firstPoint.index;
      const label = chart.data.labels[index];
      const val = chart.data.datasets[datasetIndex]?.data[index];
      if (val === null || val === undefined) return;

      let weekNum = 0;
      let date = "";
      if (mode === "year") {
        weekNum = Number(String(label).replace(/^W/, ""));
        date = get2026SundayForWeek(weekNum);
      } else {
        date = String(label);
        weekNum = getWeekNumberForDate(date);
      }

      const rawSermon = resolveSermonTitle(date, state.workingBundle);
      const [sermonTitle, speaker] = rawSermon ? rawSermon.split("//").map((s) => s.trim()) : [`Week ${weekNum}`, ""];

      const ds2026 = chart.data.datasets.find((d) => d.label === "2026");
      const ds2025 = chart.data.datasets.find((d) => d.label === "2025");
      const ds2024 = chart.data.datasets.find((d) => d.label === "2024");
      const ds2023 = chart.data.datasets.find((d) => d.label === "2023");

      const val2026 = ds2026?.data[index] ?? null;
      const val2025 = ds2025?.data[index] ?? null;
      const val2024 = ds2024?.data[index] ?? null;
      const val2023 = ds2023?.data[index] ?? null;

      const diff2025 = (typeof val2026 === "number" && typeof val2025 === "number") ? val2026 - val2025 : null;
      const diff2024 = (typeof val2026 === "number" && typeof val2024 === "number") ? val2026 - val2024 : null;
      const diff2023 = (typeof val2026 === "number" && typeof val2023 === "number") ? val2026 - val2023 : null;

      if (existingPopover) existingPopover.remove();

      const popover = document.createElement("div");
      popover.className = "volunteer-pinned-popover";
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", `Volunteer details for Week ${weekNum}`);
      popover.innerHTML = `
        <div class="volunteer-pinned-popover__header">
          <span class="volunteer-pinned-popover__tag">Week ${weekNum} · ${escapeHtml(date)}</span>
          <button type="button" class="volunteer-pinned-popover__close" aria-label="Close details">×</button>
        </div>
        <div class="volunteer-pinned-popover__body">
          <h4 class="volunteer-pinned-popover__title">${escapeHtml(sermonTitle)}</h4>
          ${speaker ? `<p class="volunteer-pinned-popover__speaker">Speaker: <strong>${escapeHtml(speaker)}</strong></p>` : ""}
          
          <div class="volunteer-pinned-popover__multiyear-grid">
            <div class="popover-year-row is-2026">
              <span class="popover-year-label">2026 Volunteers</span>
              <strong class="popover-year-val tabular-figures">${val2026 !== null ? `${formatNumber(val2026)} vols` : (val !== null ? `${formatNumber(val)} vols` : "—")}</strong>
            </div>
            ${val2025 !== null ? `
            <div class="popover-year-row">
              <span class="popover-year-label">2025 Baseline</span>
              <span class="popover-year-val tabular-figures">${formatNumber(val2025)} vols</span>
              ${diff2025 !== null ? `<span class="popover-diff ${diff2025 >= 0 ? "diff-up" : "diff-down"}">${diff2025 >= 0 ? "+" + diff2025 : diff2025}</span>` : ""}
            </div>` : ""}
            ${val2024 !== null ? `
            <div class="popover-year-row">
              <span class="popover-year-label">2024 Baseline</span>
              <span class="popover-year-val tabular-figures">${formatNumber(val2024)} vols</span>
              ${diff2024 !== null ? `<span class="popover-diff ${diff2024 >= 0 ? "diff-up" : "diff-down"}">${diff2024 >= 0 ? "+" + diff2024 : diff2024}</span>` : ""}
            </div>` : ""}
            ${val2023 !== null ? `
            <div class="popover-year-row">
              <span class="popover-year-label">2023 Baseline</span>
              <span class="popover-year-val tabular-figures">${formatNumber(val2023)} vols</span>
              ${diff2023 !== null ? `<span class="popover-diff ${diff2023 >= 0 ? "diff-up" : "diff-down"}">${diff2023 >= 0 ? "+" + diff2023 : diff2023}</span>` : ""}
            </div>` : ""}
          </div>
        </div>
        <div class="volunteer-pinned-popover__footer">
          <a href="?date=${encodeURIComponent(date)}" class="volunteer-pinned-popover__cta">
            <span>View Week ${weekNum} Report</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </a>
        </div>
      `;

      popover.querySelector(".volunteer-pinned-popover__close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        popover.remove();
      });

      figure.append(popover);
    };
  }

  function rawSectionKey(normalizedKey) {
    const sections = read(state.reportData, "Sections", "sections");
    const match = Array.isArray(sections) && sections.find((section) =>
      String(read(section, "Key", "key") || "").toLowerCase() === normalizedKey.toLowerCase());
    return match ? String(read(match, "Key", "key")) : normalizedKey;
  }

  function narrativeKeyFor(sectionKey) {
    return Object.keys(state.workingBundle.narratives || {}).find((key) =>
      key.toLowerCase() === sectionKey.toLowerCase()) || rawSectionKey(sectionKey);
  }

  function discardChanges() {
    clearTimeout(autoSaveTimer);
    state.dirty = false;
    state.editing = false;
    state.workingBundle = clone(state.bundle);
    state.hiddenSections.clear();
    clearPopovers();
    hideDock();
    setEditorState();
    setEditorStatus("Changes discarded");
    showToast("Changes discarded.");
    drawReport();
  }

  function handleDiscard() {
    if (!state.dirty) {
      clearTimeout(autoSaveTimer);
      state.editing = false;
      state.workingBundle = clone(state.bundle);
      state.hiddenSections.clear();
      clearPopovers();
      hideDock();
      setEditorState();
      setEditorStatus("Editing cancelled");
      drawReport();
      return;
    }
    showConfirmModal({
      title: "Discard changes?",
      message: "Are you sure you want to discard your changes? All unsaved edits will be reverted.",
      confirmLabel: "Yes, Discard",
      confirmKind: "danger",
      onConfirm: discardChanges,
    });
  }

  function handlePublish() {
    collectEditor();
    showConfirmModal({
      title: "Save changes?",
      message: "Are you sure you want to save and publish these changes to TechStats?",
      confirmLabel: "Yes, Publish Now",
      confirmKind: "primary",
      onConfirm: async () => {
        setEditorState(true);
        const dockSaveBtn = dockEl?.querySelector(".techstats-dock-btn--save");
        if (dockSaveBtn) dockSaveBtn.disabled = true;
        setEditorStatus("Publishing...", false);
        try {
          await postJson("/api/TechStats/publish", publishPayload());
          state.dirty = false;
          state.editing = false;
          clearPopovers();
          hideDock();
          setEditorStatus("Published");
          showToast("Changes published successfully!");
          await loadReport();
        } catch (error) {
          if (dockSaveBtn) dockSaveBtn.disabled = false;
          setEditorStatus(error instanceof Error ? error.message : "Report could not be published.", true);
          showToast(error instanceof Error ? error.message : "Publish failed.", true);
          setEditorState();
        }
      },
    });
  }

  let dockEl = null;
  let autoSaveTimer = null;

  function ensureDock() {
    if (dockEl && document.body.contains(dockEl)) return dockEl;
    if (dockEl) dockEl.remove();
    dockEl = document.createElement("div");
    dockEl.className = "techstats-dock";
    dockEl.setAttribute("role", "region");
    dockEl.setAttribute("aria-label", "Save changes bar");
    dockEl.innerHTML = `
      <div class="techstats-dock__content">
        <div class="techstats-dock__status">
          <span class="techstats-dock__pulse"></span>
          <div class="techstats-dock__text-wrap">
            <strong class="techstats-dock__label">Save Changes?</strong>
            <span class="techstats-dock__subtext">Draft auto-saved</span>
          </div>
        </div>
        <div class="techstats-dock__actions">
          <button type="button" class="techstats-dock-btn techstats-dock-btn--discard">Discard</button>
          <button type="button" class="techstats-dock-btn techstats-dock-btn--save">Yes</button>
        </div>
      </div>
    `;
    document.body.appendChild(dockEl);

    dockEl.querySelector(".techstats-dock-btn--discard").addEventListener("click", handleDiscard);
    dockEl.querySelector(".techstats-dock-btn--save").addEventListener("click", handlePublish);

    return dockEl;
  }

  function updateDock(isSaved = false) {
    if (!canEdit) return;
    const dock = ensureDock();
    if (state.dirty) {
      dock.classList.add("is-visible");
      const subtext = dock.querySelector(".techstats-dock__subtext");
      const pulse = dock.querySelector(".techstats-dock__pulse");
      if (subtext) subtext.textContent = isSaved ? "Draft auto-saved" : "Saving draft...";
      if (pulse) pulse.dataset.saved = String(isSaved);
    } else {
      dock.classList.remove("is-visible");
    }
  }

  function hideDock() {
    if (dockEl) dockEl.classList.remove("is-visible");
  }

  function markDirty(saveDraftNow = true) {
    state.dirty = true;
    state.editing = true;
    setEditorState();
    updateDock(false);
    setEditorStatus("Draft saving...");
    if (saveDraftNow) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        try {
          await postJson("/api/TechStats/draft", draftPayload());
          setEditorStatus("Draft saved");
          updateDock(true);
        } catch (err) {
          console.warn("Draft save notice:", err);
          setEditorStatus("Draft saved locally");
          updateDock(true);
        }
      }, 600);
    }
  }

  function showToast(message, isError = false) {
    const existing = document.querySelector(".techstats-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = `techstats-toast ${isError ? "techstats-toast--error" : ""}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("is-visible"), 10);
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showConfirmModal({ title, message, confirmLabel, confirmKind = "primary", onConfirm }) {
    const existing = document.querySelector(".techstats-confirm-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "techstats-confirm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    overlay.innerHTML = `
      <div class="techstats-confirm-modal">
        <div class="techstats-confirm-modal__icon techstats-confirm-modal__icon--${confirmKind}">
          ${confirmKind === "danger" ? `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          `}
        </div>
        <h3 class="techstats-confirm-modal__title">${escapeHtml(title)}</h3>
        <p class="techstats-confirm-modal__text">${escapeHtml(message)}</p>
        <div class="techstats-confirm-modal__actions">
          <button type="button" class="techstats-confirm-btn techstats-confirm-btn--secondary">Cancel</button>
          <button type="button" class="techstats-confirm-btn techstats-confirm-btn--${confirmKind}">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    overlay.querySelector(".techstats-confirm-btn--secondary").addEventListener("click", () => {
      overlay.remove();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector(`.techstats-confirm-btn--${confirmKind}`).addEventListener("click", () => {
      overlay.remove();
      onConfirm?.();
    });

    document.body.appendChild(overlay);
  }

  function clearPopovers() {
    document.querySelectorAll(".inline-popover").forEach((p) => p.remove());
  }

  function positionPopover(popover, anchorBtn) {
    document.body.appendChild(popover);
    const rect = anchorBtn.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);
    if (left < 12) left = 12;
    if (left + popoverRect.width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverRect.width - 12);
    }

    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;

    let top = rect.bottom + 8;
    let maxHeight = spaceBelow;

    if (spaceBelow < 280 && spaceAbove > spaceBelow) {
      maxHeight = spaceAbove;
      top = Math.max(12, rect.top - Math.min(popoverRect.height || 450, spaceAbove) - 8);
    } else if (spaceBelow < 280 && spaceAbove <= 280) {
      top = 16;
      maxHeight = window.innerHeight - 32;
    } else {
      maxHeight = Math.min(spaceBelow, window.innerHeight - 32);
    }

    popover.style.position = "fixed";
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.maxHeight = `${Math.max(220, maxHeight)}px`;
    popover.style.zIndex = "99999";
  }

  function openInlineNarrativeEditor(anchorBtn) {
    const card = (anchorBtn && anchorBtn.closest && anchorBtn.closest(".dashboard-context-card")) || reportShell.querySelector('[data-card="weekly-context"]');
    if (!card) return;
    const btn = card.querySelector('.inline-edit-btn[data-edit-target="narrative"]') || anchorBtn;
    const existingBox = card.querySelector(".context-card-editor-box");
    if (existingBox) {
      const val = state.workingBundle.narratives?.executive_summary || "";
      const mdDiv = document.createElement("div");
      mdDiv.className = "context-card-markdown";
      mdDiv.innerHTML = renderMarkdown(val || "No narrative available for this report.");
      existingBox.replaceWith(mdDiv);
      if (btn) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span>Edit Notes</span>
        `;
      }
      return;
    }

    const currentVal = state.workingBundle.narratives?.executive_summary ||
      state.workingBundle.narratives?.cover ||
      state.workingBundle.narratives?.dashboard || "";

    const mdElem = card.querySelector(".context-card-markdown");
    const editorBox = document.createElement("div");
    editorBox.className = "context-card-editor-box";
    editorBox.innerHTML = `
      <textarea class="context-card-textarea" rows="5" placeholder="Enter weekly executive notes, weather context, celebrations, or highlights...">${escapeHtml(currentVal)}</textarea>
      <div class="context-card-editor-footer">
        <span class="context-editor-tip">Markdown supported (**bold**, *italic*, - lists) · Auto-saving as draft</span>
        <button type="button" class="context-card-done-btn">Done Editing</button>
      </div>
    `;

    const textarea = editorBox.querySelector("textarea");
    textarea.addEventListener("input", () => {
      const val = textarea.value;
      if (!state.workingBundle.narratives) state.workingBundle.narratives = {};
      state.workingBundle.narratives.executive_summary = val;
      state.workingBundle.narratives.cover = val;
      state.workingBundle.narratives.dashboard = val;
      markDirty();
    });

    editorBox.querySelector(".context-card-done-btn").addEventListener("click", () => {
      const val = textarea.value;
      const mdDiv = document.createElement("div");
      mdDiv.className = "context-card-markdown";
      mdDiv.innerHTML = renderMarkdown(val || "No narrative available for this report.");
      editorBox.replaceWith(mdDiv);
      if (btn) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span>Edit Notes</span>
        `;
      }
    });

    if (mdElem) mdElem.replaceWith(editorBox);
    else card.appendChild(editorBox);

    if (btn) {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Editing Notes...</span>
      `;
    }
    textarea.focus();
  }

  function openVenuePopover(anchorBtn) {
    clearPopovers();
    const identity = state.workingBundle.identity || {};
    const currentVenue = identity.venue || "";
    const venues = ["Crowne Plaza", "Filoil", "Ynares", "Metrotent", "Podium", "Others"];
    const isPreset = ["Crowne Plaza", "Filoil", "Ynares", "Metrotent", "Podium"].includes(currentVenue);

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--venue";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Location / Venue");

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Location / Venue</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <div class="inline-chips-grid">
          ${venues.map((v) => `<button type="button" class="inline-chip ${v === currentVenue || (!isPreset && v === "Others") ? "is-active" : ""}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("")}
        </div>
        <input type="text" class="inline-popover__input inline-venue-custom" placeholder="Enter custom venue" value="${escapeHtml(isPreset ? "" : currentVenue)}" style="display: ${isPreset ? "none" : "block"}; margin-top: 8px;">
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", () => popover.remove());

    const customInput = popover.querySelector(".inline-venue-custom");
    const chips = popover.querySelectorAll(".inline-chip");

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        const val = chip.dataset.val;
        if (val === "Others") {
          customInput.style.display = "block";
          customInput.focus();
          identity.venue = customInput.value.trim() || "Others";
        } else {
          customInput.style.display = "none";
          identity.venue = val;
        }
        const venueEl = reportShell.querySelector(".context-pill__venue") || anchorBtn.closest(".context-pill")?.querySelector("strong");
        if (venueEl) venueEl.textContent = identity.venue;
        markDirty();
      });
    });

    customInput.addEventListener("input", () => {
      identity.venue = customInput.value.trim() || "Others";
      const venueEl = reportShell.querySelector(".context-pill__venue") || anchorBtn.closest(".context-pill")?.querySelector("strong");
      if (venueEl) venueEl.textContent = identity.venue;
      markDirty();
    });

    positionPopover(popover, anchorBtn);
  }

  function openTagPopover(anchorBtn) {
    clearPopovers();
    const identity = state.workingBundle.identity || {};
    const currentTag = identity.service_tag || "";
    const tagPresets = [
      "No-frills Sunday",
      "Guest Speaker",
      "Communion Sunday",
      "Baptism Sunday",
      "Child Dedication",
      "Themed Sunday",
      "Encounter Weekend",
      "Custom",
    ];
    const isPreset = tagPresets.filter((t) => t !== "Custom").includes(currentTag);

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--tag";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Service Theme / Tag");

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Service Theme / Tag</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <div class="inline-chips-grid">
          ${tagPresets.map((t) => `<button type="button" class="inline-chip ${t === currentTag || (!isPreset && t === "Custom") ? "is-active" : ""}" data-val="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
        </div>
        <input type="text" class="inline-popover__input inline-tag-custom" placeholder="Enter custom theme tag" value="${escapeHtml(isPreset ? "" : currentTag)}" style="display: ${isPreset ? "none" : "block"}; margin-top: 8px;">
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", () => popover.remove());

    const customInput = popover.querySelector(".inline-tag-custom");
    const chips = popover.querySelectorAll(".inline-chip");

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        const val = chip.dataset.val;
        if (val === "Custom") {
          customInput.style.display = "block";
          customInput.focus();
          identity.service_tag = customInput.value.trim() || "Custom";
        } else {
          customInput.style.display = "none";
          identity.service_tag = val;
        }
        const tagEl = reportShell.querySelector(".context-pill__tag") || anchorBtn.closest(".context-pill")?.querySelector("span:not(.context-pill__icon)");
        if (tagEl) tagEl.textContent = identity.service_tag;
        markDirty();
      });
    });

    customInput.addEventListener("input", () => {
      identity.service_tag = customInput.value.trim() || "Custom";
      const tagEl = reportShell.querySelector(".context-pill__tag") || anchorBtn.closest(".context-pill")?.querySelector("span:not(.context-pill__icon)");
      if (tagEl) tagEl.textContent = identity.service_tag;
      markDirty();
    });

    positionPopover(popover, anchorBtn);
  }

  function openWeatherPopover(anchorBtn) {
    clearPopovers();
    const identity = state.workingBundle.identity || {};
    const currentWeather = identity.weather || "";
    const weatherPresets = [
      { label: "☀️ Sunny", value: "☀️ Sunny" },
      { label: "⛅ Partly Cloudy", value: "⛅ Partly Cloudy" },
      { label: "☁️ Cloudy", value: "☁️ Cloudy" },
      { label: "🌧️ Rainy", value: "🌧️ Rainy" },
      { label: "⛈️ Thunderstorms", value: "⛈️ Thunderstorms" },
      { label: "Custom", value: "Custom" },
    ];
    const matchedPreset = weatherPresets.find((p) => p.value !== "Custom" && (p.value.toLowerCase() === currentWeather.toLowerCase() || currentWeather.toLowerCase().includes(p.label.toLowerCase())));
    const isPreset = Boolean(matchedPreset);

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--weather";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Weather Report");

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Weather Report</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <div class="inline-chips-grid">
          ${weatherPresets.map((p) => `<button type="button" class="inline-chip ${(matchedPreset && matchedPreset.value === p.value) || (!isPreset && p.value === "Custom") ? "is-active" : ""}" data-val="${escapeHtml(p.value)}">${escapeHtml(p.label)}</button>`).join("")}
        </div>
        <input type="text" class="inline-popover__input inline-weather-custom" placeholder="Enter weather (e.g. ☀️ Sunny)" value="${escapeHtml(currentWeather)}" style="display: ${isPreset ? "none" : "block"}; margin-top: 8px;">
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", () => popover.remove());

    const customInput = popover.querySelector(".inline-weather-custom");
    const chips = popover.querySelectorAll(".inline-chip");

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        const val = chip.dataset.val;
        if (val === "Custom") {
          customInput.style.display = "block";
          customInput.focus();
          identity.weather = customInput.value.trim();
        } else {
          customInput.style.display = "none";
          identity.weather = val;
          customInput.value = val;
        }
        const weatherEl = reportShell.querySelector(".context-pill__weather") || anchorBtn.closest(".context-pill")?.querySelector("span:not(.context-pill__icon)");
        if (weatherEl) weatherEl.textContent = identity.weather || "No data available";
        markDirty();
      });
    });

    customInput.addEventListener("input", () => {
      identity.weather = customInput.value.trim();
      const weatherEl = reportShell.querySelector(".context-pill__weather") || anchorBtn.closest(".context-pill")?.querySelector("span:not(.context-pill__icon)");
      if (weatherEl) weatherEl.textContent = identity.weather || "No data available";
      markDirty();
    });

    positionPopover(popover, anchorBtn);
    if (!isPreset) {
      customInput.focus();
    }
  }

  function openHighlightPopover(anchorBtn) {
    clearPopovers();
    const identity = state.workingBundle.identity || {};
    const hl = identity.highlight_metric || { value: "", label: "Sunday Attendance Share", detail: "" };

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--highlight";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Highlight Metric Banner");

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Highlight Ratio / Banner</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <label class="inline-field-label">Value</label>
        <input type="text" class="inline-popover__input inline-hl-val" placeholder="e.g. 45.2%" value="${escapeHtml(hl.value || "")}">
        <label class="inline-field-label">Label</label>
        <input type="text" class="inline-popover__input inline-hl-lbl" placeholder="e.g. Sunday Attendance Share" value="${escapeHtml(hl.label || "Sunday Attendance Share")}">
        <label class="inline-field-label">Detail / Calculation Note</label>
        <input type="text" class="inline-popover__input inline-hl-det" placeholder="e.g. True Attendance ÷ dated Active Manila Base" value="${escapeHtml(hl.detail || "")}">
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", () => popover.remove());

    const valInput = popover.querySelector(".inline-hl-val");
    const lblInput = popover.querySelector(".inline-hl-lbl");
    const detInput = popover.querySelector(".inline-hl-det");

    function syncHl() {
      if (!identity.highlight_metric) identity.highlight_metric = {};
      identity.highlight_metric.value = valInput.value;
      identity.highlight_metric.label = lblInput.value;
      identity.highlight_metric.detail = detInput.value;
      const card = reportShell.querySelector('[data-card="highlight-metric"]');
      if (card) {
        const v = card.querySelector(".highlight-card-value");
        const d = card.querySelector(".highlight-card-detail");
        const k = card.querySelector(".highlight-card-kicker");
        if (v) v.textContent = identity.highlight_metric.value || "No data available";
        if (d) d.textContent = identity.highlight_metric.detail || "";
        if (k && k.firstChild) k.firstChild.textContent = identity.highlight_metric.label || "Sunday Attendance Share ";
      }
      markDirty();
    }

    valInput.addEventListener("input", syncHl);
    lblInput.addEventListener("input", syncHl);
    detInput.addEventListener("input", syncHl);

    positionPopover(popover, anchorBtn);
    valInput.focus();
  }

  function openThumbnailPopover(anchorBtn) {
    clearPopovers();
    const allMedia = Array.isArray(state.workingBundle.media) ? state.workingBundle.media : [];
    let recapMedia = allMedia.find((m) => m && (m.kind === "recap" || m.is_recap || /recap/i.test(m.caption || "")));

    if (!recapMedia) {
      recapMedia = {
        section_key: "media",
        kind: "recap",
        is_recap: true,
        caption: "Sunday Service Recap",
        thumbnail_url: "",
        thumbnail: "",
        url: "",
        video_id: null,
        binary_file_guid: null,
      };
      if (!Array.isArray(state.workingBundle.media)) state.workingBundle.media = [];
      state.workingBundle.media.unshift(recapMedia);
    }

    const currentThumb = recapMedia.thumbnail_url || recapMedia.thumbnail || recapMedia.url || "";

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--thumbnail";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Recap Thumbnail Image");
    popover.addEventListener("click", (e) => e.stopPropagation());

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Service Recap Thumbnail</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <label class="inline-field-label">Upload Image File</label>
        <input type="file" accept="image/*" class="inline-thumb-file" style="margin-bottom: 8px;">
        <div class="inline-thumb-status" style="display: none; font-size: 0.78rem; color: var(--muted, #64748b); margin-bottom: 8px;"></div>
        <label class="inline-field-label">Or Image / YouTube URL</label>
        <input type="url" class="inline-popover__input inline-thumb-url" placeholder="https://..." value="${escapeHtml(currentThumb.startsWith('data:') ? '' : currentThumb)}">
        <div class="inline-thumb-preview-wrap" style="margin-top: 10px; padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
          <img class="inline-thumb-preview" src="${escapeHtml(currentThumb)}" alt="Recap preview" style="max-width: 100%; max-height: 140px; border-radius: 6px; object-fit: cover; display: ${currentThumb ? 'block' : 'none'}; margin: 0 auto;">
          <span class="inline-thumb-preview-empty" style="display: ${currentThumb ? 'none' : 'block'}; font-size: 0.78rem; color: #64748b;">No thumbnail selected</span>
        </div>
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", (e) => {
      e.stopPropagation();
      popover.remove();
    });

    const fileInput = popover.querySelector(".inline-thumb-file");
    const statusText = popover.querySelector(".inline-thumb-status");
    const urlInput = popover.querySelector(".inline-thumb-url");
    const previewImg = popover.querySelector(".inline-thumb-preview");
    const previewEmpty = popover.querySelector(".inline-thumb-preview-empty");

    function applyThumb(thumbUrl, guid = null, videoId = null) {
      recapMedia.thumbnail_url = thumbUrl;
      recapMedia.thumbnail = thumbUrl;
      recapMedia.url = thumbUrl;
      recapMedia.kind = "recap";
      recapMedia.is_recap = true;
      if (guid) recapMedia.binary_file_guid = guid;
      if (videoId) recapMedia.video_id = videoId;

      if (thumbUrl) {
        previewImg.src = thumbUrl;
        previewImg.style.display = "block";
        previewEmpty.style.display = "none";
      } else {
        previewImg.src = "";
        previewImg.style.display = "none";
        previewEmpty.style.display = "block";
      }

      const heroCard = reportShell.querySelector(".report-hero");
      if (heroCard) {
        if (thumbUrl) {
          heroCard.style.setProperty("--hero-bg-image", `url('${thumbUrl}')`);
          heroCard.style.backgroundImage = `url('${thumbUrl}')`;
          heroCard.dataset.hasMedia = "true";
        } else {
          heroCard.style.removeProperty("--hero-bg-image");
          heroCard.style.backgroundImage = "";
          heroCard.dataset.hasMedia = "false";
        }
      }
      markDirty();
    }

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const localDataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });
      applyThumb(localDataUrl);

      if (statusText) {
        statusText.style.display = "block";
        statusText.textContent = "Uploading image to Rock...";
      }

      try {
        const uploadForm = new FormData();
        uploadForm.append("file", file, file.name || "recap-thumbnail.jpg");
        const uploadResponse = await fetch(
          `/FileUploader.ashx?isBinaryFile=T&fileTypeGuid=6cbea3b0-e983-40c1-9712-bd3fa2466eae&fileName=${encodeURIComponent(file.name || "recap-thumbnail.jpg")}`,
          {
            method: "POST",
            credentials: "same-origin",
            body: uploadForm,
          },
        );
        if (!uploadResponse.ok) {
          throw new Error(`Rock could not store the image (${uploadResponse.status}).`);
        }
        const record = await uploadResponse.json();
        const guid = record.Guid || record.guid;
        if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(guid || ""))) {
          throw new Error("Rock did not return a Binary File GUID.");
        }
        // ReportMedia is created only when Publish runs, so the TechStats media route
        // intentionally 404s during the edit session. Use Rock's direct BinaryFile route
        // for the immediate preview; the published report will resolve through TechStats.
        const previewUrl = `/GetFile.ashx?guid=${guid}`;
        applyThumb(previewUrl, guid);
        urlInput.value = previewUrl;
        if (statusText) {
          statusText.textContent = "Uploaded and saved to Rock!";
          setTimeout(() => { if (statusText) statusText.style.display = "none"; }, 2500);
        }
      } catch (err) {
        console.warn("Could not save BinaryFile to Rock REST, keeping preview:", err);
        if (statusText) {
          statusText.textContent = "Preview ready (saved locally).";
        }
      }
    });

    urlInput.addEventListener("input", () => {
      const val = urlInput.value.trim();
      const vId = extractYouTubeId(val);
      const thumb = vId ? `https://i.ytimg.com/vi/${vId}/maxresdefault.jpg` : val;
      applyThumb(thumb, null, vId || null);
    });

    positionPopover(popover, anchorBtn);
  }

  function openServicesPopover(anchorBtn) {
    clearPopovers();
    const identity = state.workingBundle.identity || {};
    const standardTimes = Array.isArray(identity.service_times) ? identity.service_times : [];
    let currentSermons = groupSermonMedia(state.workingBundle.media, standardTimes);

    // Ensure every sermon card has at least one service_time slot
    currentSermons.forEach((s) => {
      if (!Array.isArray(s.service_times) || s.service_times.length === 0) {
        s.service_times = [""];
      }
    });
    if (currentSermons.length === 0) {
      currentSermons.push({ title: "", speaker: "", video_id: "", service_times: [""] });
    }

    const popover = document.createElement("div");
    popover.className = "inline-popover inline-popover--services";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Sunday Services & Preachers");

    // Modal stays open during editing; only the close button or save/discard dismisses it
    popover.addEventListener("click", (e) => e.stopPropagation());

    popover.innerHTML = `
      <div class="inline-popover__header">
        <span class="inline-popover__title">Sunday Services &amp; Preachers</span>
        <button type="button" class="inline-popover__close" aria-label="Close">×</button>
      </div>
      <div class="inline-popover__body">
        <p class="inline-popover__desc">Configure Sunday service times, preachers, sermon titles, and livestreams. Add another service to set up a new preacher.</p>
        <div class="sermon-editor-list"></div>
        <button type="button" class="sermon-add-btn" style="margin-top: 10px;">+ Add Another Service &amp; Preacher</button>
      </div>
    `;

    popover.querySelector(".inline-popover__close").addEventListener("click", (e) => {
      e.stopPropagation();
      popover.remove();
    });

    const container = popover.querySelector(".sermon-editor-list");

    function syncSermons() {
      const cards = container.querySelectorAll(".sermon-editor-card");
      const updatedSermons = [];
      const allTimes = [];

      cards.forEach((card) => {
        const title = card.querySelector(".sermon-input--title")?.value.trim() || "";
        const speaker = card.querySelector(".sermon-input--speaker")?.value.trim() || "";
        const rawVid = card.querySelector(".sermon-input--video")?.value.trim() || "";
        const videoId = extractYouTubeId(rawVid);

        const vidInput = card.querySelector(".sermon-input--video");
        if (vidInput && rawVid && rawVid !== videoId && videoId) {
          vidInput.value = videoId;
        }

        const timeInputs = [...card.querySelectorAll(".sermon-time-input")];
        const times = timeInputs.map((inp) => inp.value.trim());

        times.forEach((t) => {
          if (t && !allTimes.includes(t)) allTimes.push(t);
        });

        updatedSermons.push({
          title,
          speaker,
          video_id: videoId,
          service_times: times.length > 0 ? times : [""],
        });
      });

      currentSermons = updatedSermons;
      if (allTimes.length > 0) {
        identity.service_times = allTimes;
      }
      state.workingBundle.media = sermonsToMedia(currentSermons, state.workingBundle.media);
      const timesEl = reportShell.querySelector(".context-pill__times") || anchorBtn.closest(".context-pill")?.querySelector("span:not(.context-pill__icon)");
      if (timesEl) timesEl.textContent = allTimes.join(" · ") || (identity.service_times?.join(" · ") || "No data available");

      const firstWithSpeaker = currentSermons.find((s) => s.speaker || s.title);
      if (firstWithSpeaker) {
        if (firstWithSpeaker.speaker) identity.speaker = firstWithSpeaker.speaker;
        if (firstWithSpeaker.title) {
          identity.title = firstWithSpeaker.title;
          identity.sermon_title = firstWithSpeaker.title;
        }
      }
      markDirty();
    }

    function renderSermonCards() {
      container.replaceChildren();
      currentSermons.forEach((sermon, sIdx) => {
        const card = document.createElement("div");
        card.className = "sermon-editor-card";

        const header = document.createElement("div");
        header.className = "sermon-editor-card__header";
        const preacherDisplay = sermon.speaker ? ` · ${escapeHtml(sermon.speaker)}` : "";
        const titleDisplay = sermon.title ? ` (${escapeHtml(sermon.title)})` : "";
        header.innerHTML = `
          <h4 class="sermon-editor-card__title">Service ${sIdx + 1}${preacherDisplay}${titleDisplay}</h4>
          <button type="button" class="sermon-editor-card__remove-btn" title="Remove this service and preacher">Remove Service</button>
        `;

        header.querySelector(".sermon-editor-card__remove-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          currentSermons.splice(sIdx, 1);
          if (currentSermons.length === 0) {
            currentSermons.push({ title: "", speaker: "", video_id: "", service_times: [""] });
          }
          renderSermonCards();
          syncSermons();
        });

        const grid = document.createElement("div");
        grid.className = "sermon-editor-card__grid";
        grid.innerHTML = `
          <div class="editor-field">
            <label>Preacher / Speaker</label>
            <input type="text" class="editor-input sermon-input--speaker" placeholder="e.g. Pastor James Aiton" value="${escapeHtml(sermon.speaker || "")}">
          </div>
          <div class="editor-field">
            <label>Sermon Title <span class="field-optional" style="font-weight: normal; color: var(--muted, #64748b);">(optional)</span></label>
            <input type="text" class="editor-input sermon-input--title" placeholder="e.g. Living in Babylon" value="${escapeHtml(sermon.title || "")}">
          </div>
          <div class="editor-field">
            <label>YouTube Video ID / URL <span class="field-optional" style="font-weight: normal; color: var(--muted, #64748b);">(optional)</span></label>
            <input type="text" class="editor-input sermon-input--video" placeholder="e.g. https://youtu.be/... or ID" value="${escapeHtml(sermon.video_id || "")}">
          </div>
        `;

        function updateCardTitle() {
          const spk = grid.querySelector(".sermon-input--speaker")?.value.trim() || "";
          const ttl = grid.querySelector(".sermon-input--title")?.value.trim() || "";
          const spkText = spk ? ` · ${spk}` : "";
          const ttlText = ttl ? ` (${ttl})` : "";
          header.querySelector(".sermon-editor-card__title").textContent = `Service ${sIdx + 1}${spkText}${ttlText}`;
        }

        grid.querySelector(".sermon-input--speaker").addEventListener("input", (e) => {
          updateCardTitle();
          syncSermons();
        });
        grid.querySelector(".sermon-input--title").addEventListener("input", (e) => {
          updateCardTitle();
          syncSermons();
        });
        grid.querySelector(".sermon-input--video").addEventListener("input", syncSermons);

        const timesSection = document.createElement("div");
        timesSection.className = "sermon-times-section";
        timesSection.innerHTML = `
          <div class="sermon-times-header">
            <span class="sermon-times-label">Service Time(s) for this Preacher:</span>
          </div>
          <div class="sermon-times-list"></div>
        `;

        const timesList = timesSection.querySelector(".sermon-times-list");

        function renderTimes() {
          timesList.replaceChildren();
          const times = (Array.isArray(sermon.service_times) && sermon.service_times.length > 0)
            ? sermon.service_times
            : [""];
          times.forEach((tVal, tIdx) => {
            const pill = document.createElement("div");
            pill.className = "sermon-time-pill";
            pill.innerHTML = `
              <input type="text" class="editor-input sermon-time-input" placeholder="e.g. 10:00 AM" value="${escapeHtml(tVal)}">
              ${times.length > 1 ? `<button type="button" class="sermon-time-remove" title="Remove time">×</button>` : ""}
            `;
            pill.querySelector("input").addEventListener("input", (e) => {
              sermon.service_times[tIdx] = e.target.value.trim();
              syncSermons();
            });
            pill.querySelector(".sermon-time-remove")?.addEventListener("click", (e) => {
              e.stopPropagation();
              sermon.service_times.splice(tIdx, 1);
              renderTimes();
              syncSermons();
            });
            timesList.appendChild(pill);
          });

          const addTimeBtn = document.createElement("button");
          addTimeBtn.type = "button";
          addTimeBtn.className = "sermon-time-add-btn";
          addTimeBtn.textContent = "+ Add another time for this preacher";
          addTimeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!Array.isArray(sermon.service_times)) sermon.service_times = [];
            sermon.service_times.push("");
            renderTimes();
            const lastInp = timesList.querySelector(".sermon-time-pill:last-of-type input");
            lastInp?.focus();
          });
          timesList.appendChild(addTimeBtn);
        }

        renderTimes();
        card.append(header, grid, timesSection);
        container.appendChild(card);
      });
    }

    renderSermonCards();

    popover.querySelector(".sermon-add-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      currentSermons.push({ title: "", speaker: "", video_id: "", service_times: [""] });
      renderSermonCards();
      const lastCard = container.querySelector(".sermon-editor-card:last-child");
      const targetInp = lastCard?.querySelector(".sermon-input--speaker") || lastCard?.querySelector(".sermon-time-input");
      targetInp?.focus();
      syncSermons();
    });

    positionPopover(popover, anchorBtn);
  }

  function collectEditor(showErrors = true) {
    const openTextarea = reportShell.querySelector(".context-card-textarea");
    if (openTextarea) {
      const val = openTextarea.value;
      if (!state.workingBundle.narratives) state.workingBundle.narratives = {};
      state.workingBundle.narratives.executive_summary = val;
      state.workingBundle.narratives.cover = val;
      state.workingBundle.narratives.dashboard = val;
    }
    return true;
  }


  function drawReport() {
    destroyCharts();
    reportShell.setAttribute("aria-busy", "true");
    reportShell.innerHTML = renderReport(state.workingBundle, { includeDevInspector });
    const freshBc = reportShell.querySelector(".suite-breadcrumbs");
    if (freshBc) attachBreadcrumbsInteractions(freshBc);
    if (!canEdit) reportShell.querySelectorAll('.inline-edit-btn').forEach((button) => button.remove());
    // The export rail (xlsx / copy / png) is delegated once from the island root
    // (bindExportDelegation, below); a freshly rendered widget's buttons already carry the
    // data-export/data-widget attributes the delegated listener reads, so nothing is bound
    // here. The copy prompt is a DOM builder, not a string, so its host is mounted fresh on
    // every redraw the same way the rest of this function re-wires freshly rendered markup.
    // Dock the persistent utility rail (week stepper, date picker, version, Edit) into the
    // hero the renderer just produced. Moving the live node keeps every listener intact; if a
    // state screen rendered instead, the rail stays in the chrome so navigation never vanishes.
    const utilityHost = reportShell.querySelector("[data-hero-utility-host]");
    (utilityHost || chrome).prepend(utilityRail);
    chrome.dataset.docked = utilityHost ? "hero" : "chrome";
    syncHeroFit();

    const copyPromptHost = reportShell.querySelector("[data-copy-prompt-host]");
    if (copyPromptHost) mountCopyPrompt(copyPromptHost, { view: buildView, announce, align: "end" });
    // Executive Markup (#598): the pen sits on the lower left of the report.
    if (!markup) {
      markup = mountMarkup(root, {
        surface: { id: "techstats", title: "Sunday Report" },
        host: root,
        frame: root,
        context: () => ({ mode: null, theme: root.dataset.theme || null, filterSummary: null, url: window.location.href, title: document.title }),
        announce,
      });
    }
    const packageControlHost = reportShell.querySelector("[data-package-control-host]");
    if (packageControlHost) mountPackageControl(packageControlHost, { surfaceId: "techstats-metrics", align: "end" });
    for (const btn of reportShell.querySelectorAll('[data-action="scroll-to-top"]')) {
      btn.addEventListener("click", () => {
        globalThis.scrollTo({ top: 0, behavior: "smooth" });
        if (document.documentElement) document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
        if (document.body) document.body.scrollTo({ top: 0, behavior: "smooth" });
        const scrollParent = root.closest(".page-content, .rock-body, main, body, #content-wrapper") || root;
        if (scrollParent && typeof scrollParent.scrollTo === "function") {
          scrollParent.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
    for (const btn of reportShell.querySelectorAll('[data-action="toggle-all-months"]')) {
      btn.addEventListener("click", () => {
        const container = btn.closest(".monthly-ledger-section");
        if (!container) return;
        const detailsList = container.querySelectorAll("details.month-group-card");
        const anyClosed = Array.from(detailsList).some((d) => !d.open);
        detailsList.forEach((d) => (d.open = anyClosed));
      });
    }
    for (const btn of reportShell.querySelectorAll('.volunteer-switch-btn')) {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view || "year";
        reportShell.querySelectorAll('.volunteer-switch-btn').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const figcaption = reportShell.querySelector('.volunteer-chart-figure figcaption');
        if (figcaption) {
          figcaption.textContent = view === 'week'
            ? 'Continuous weekly volunteer counts across the season.'
            : 'Volunteer counts across 52 weeks (2023–2026). Toggle above for 34-week continuous trajectory.';
        }
        drawVolunteerChart(view);
      });
    }
    if (canEdit) {
      for (const btn of reportShell.querySelectorAll('.inline-edit-btn')) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          const target = btn.dataset.editTarget;
          if (target === "narrative") openInlineNarrativeEditor(btn);
          else if (target === "venue") openVenuePopover(btn);
          else if (target === "tag") openTagPopover(btn);
          else if (target === "weather") openWeatherPopover(btn);
          else if (target === "highlight") openHighlightPopover(btn);
          else if (target === "thumbnail") openThumbnailPopover(btn);
          else if (target === "services") openServicesPopover(btn);
        });
      }

      for (const pill of reportShell.querySelectorAll('.report-cover__context-bar .context-pill')) {
        pill.style.cursor = "pointer";
        pill.addEventListener("click", (e) => {
          if (e.target.closest('.inline-edit-btn') || e.target.closest('.inline-popover')) return;
          const editBtn = pill.querySelector('.inline-edit-btn');
          if (editBtn) {
            e.stopPropagation();
            editBtn.click();
          }
        });
      }
    }
    for (const btn of reportShell.querySelectorAll('.service-stream-chip')) {
      btn.addEventListener("click", () => {
        reportShell.querySelectorAll('.service-stream-chip').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const vId = btn.dataset.videoId;
        const caption = btn.dataset.caption;
        const watchUrl = btn.dataset.watchUrl;

        const iframe = reportShell.querySelector('#attendance-video-iframe');
        if (iframe && vId) {
          const currentSrc = iframe.getAttribute('src') || '';
          if (!currentSrc.includes(vId)) {
            iframe.src = `https://www.youtube-nocookie.com/embed/${vId}`;
          }
          if (caption) iframe.title = caption;
        }
        const captionElem = reportShell.querySelector('#attendance-video-caption-text');
        if (captionElem && caption) captionElem.textContent = caption;
        const watchLink = reportShell.querySelector('#attendance-video-watch-link');
        if (watchLink && watchUrl) watchLink.href = watchUrl;
      });
    }

    // Hover-by-default for a missing metric (#236, #252): the cell already shows the same
    // unavailable mark Classic mode's tables use; the reason it is unavailable -- not zero --
    // was previously reachable nowhere but a mouse's own memory of the shipped meaning.
    const missingLayer = tooltipLayer();
    if (missingLayer) {
      for (const cell of reportShell.querySelectorAll('[data-missing="true"]')) {
        const rowLabel = cell.closest("tr")?.querySelector(".metric-title, .month-table__date")?.textContent?.trim() || null;
        cell.tabIndex = 0;
        cell.setAttribute("aria-label", rowLabel ? `${rowLabel}: ${UNAVAILABLE_TITLE}` : UNAVAILABLE_TITLE);
        missingLayer.attach(cell, { render: () => tooltipContent({ label: rowLabel, value: UNAVAILABLE_TITLE }) });
      }
    }

    // Wire up clickable (i) info tooltips
    for (const btn of reportShell.querySelectorAll('.metric-info-btn')) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const existing = document.querySelector(".metric-info-popover");
        const title = btn.dataset.infoTitle || "Metric Calculation";
        if (existing) {
          const isSame = existing.dataset.triggerTitle === title;
          existing.remove();
          if (isSame) return;
        }

        const desc = btn.dataset.infoDesc || "";
        const popover = document.createElement("div");
        popover.className = "metric-info-popover";
        popover.dataset.triggerTitle = title;
        popover.setAttribute("role", "dialog");
        popover.setAttribute("aria-label", title);
        popover.innerHTML = `
          <div class="metric-info-popover__header">
            <span class="metric-info-popover__title">${title}</span>
            <button type="button" class="metric-info-popover__close" aria-label="Close">×</button>
          </div>
          <div class="metric-info-popover__body">
            <p>${desc}</p>
          </div>
        `;

        popover.querySelector(".metric-info-popover__close").addEventListener("click", (ev) => {
          ev.stopPropagation();
          popover.remove();
        });

        document.body.appendChild(popover);
        const rect = btn.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 6;
        let left = rect.left + window.scrollX + (rect.width / 2) - (popoverRect.width / 2);

        if (left < 12) left = 12;
        if (left + popoverRect.width > window.innerWidth - 12) {
          left = window.innerWidth - popoverRect.width - 12;
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
      });
    }
    drawCharts();
    reportShell.setAttribute("aria-busy", "false");
    setEditorState();
  }

  function showLoading() {
    destroyCharts();
    reportShell.setAttribute("aria-busy", "true");
    // The skeleton is the real hero geometry with its values blanked, so the page does not
    // reflow when the report arrives. Values read "—" rather than a shimmering bar, because an
    // unavailable number must never look like a rendered one.
    reportShell.innerHTML = `
      <div class="report-skeleton" aria-label="Loading Sunday Report">
        <div class="report-cover report-hero" data-has-media="false">
          <div class="report-hero__scrim" aria-hidden="true"></div>
          <div class="section-inner report-hero__inner">
            <div class="report-hero__rail">
              <div class="skeleton-line" style="width: 220px; height: 14px;"></div>
              <div class="report-hero__utility" data-hero-utility-host></div>
            </div>
            <div class="report-hero__identity">
              <div class="skeleton-line skeleton-line--display" style="width: 320px; height: 40px; margin-bottom: 0.75rem;"></div>
              <div class="skeleton-line" style="width: 280px; height: 16px;"></div>
            </div>
            <div class="report-cover__context-bar">
              <div class="skeleton-line" style="width: 150px; height: 28px; border-radius: 999px;"></div>
              <div class="skeleton-line" style="width: 190px; height: 28px; border-radius: 999px;"></div>
              <div class="skeleton-line" style="width: 130px; height: 28px; border-radius: 999px;"></div>
            </div>
            <div class="headline-kpi-section">
              <div class="headline-kpi-grid">
                ${["True Attendance", "Total Volunteers", "Hands Raised"].map((label) => `
                <article class="headline-kpi-card">
                  <h2 class="headline-kpi-card__label">${label}</h2>
                  <p class="headline-kpi-card__value tabular-figures">—</p>
                  <p class="headline-kpi-card__sublabel">Loading this week's observation</p>
                </article>`).join("")}
              </div>
            </div>
          </div>
        </div>
        <div class="report-skeleton__section" style="padding: 2rem 0;">
          <div class="section-inner">
            <div class="skeleton-line" style="width: 220px; height: 24px; margin-bottom: 1.5rem;"></div>
            <div class="skeleton-line" style="width: 100%; height: 180px; border-radius: 8px;"></div>
          </div>
        </div>
      </div>
    `;
    const skeletonHost = reportShell.querySelector("[data-hero-utility-host]");
    if (skeletonHost) skeletonHost.prepend(utilityRail);
    setEditorState(true);
  }

  function showState(title, detail) {
    destroyCharts();
    reportShell.replaceChildren(messageElement(title, detail));
    reportShell.setAttribute("aria-busy", "false");
    // The state screen has no hero to dock into, so navigation returns to the chrome rather
    // than disappearing with the report that failed to load.
    chrome.prepend(utilityRail);
    chrome.dataset.docked = "chrome";
    state.bundle = null;
    state.workingBundle = null;
    renderNavigator();
    setEditorState();
  }

  /* Week navigation and refresh (#587 recovery): when a report is already on the page it
   * stays there, under the busy veil, while the next one loads; a failure hands it back with
   * a Retry rather than blanking a good reading into "Report unavailable". The skeleton is
   * only for the first load, when there is nothing yet to keep. The stepper is disabled while
   * a load is in flight so a double tap cannot queue two navigations. */
  function setNavigatorBusy(busy) {
    utilityRail.setAttribute("aria-busy", String(busy));
    if (busy) { previous.disabled = true; next.disabled = true; }
  }

  async function loadReport() {
    const kept = state.bundle && !state.dirty
      ? { bundle: state.bundle, working: state.workingBundle, url: state.currentUrl, selectedDate: state.bundle.identity?.report_date || null }
      : null;
    if (kept) {
      reportShell.classList.add("ux-busy");
      reportShell.setAttribute("aria-busy", "true");
      setEditorState(true);
      status.busy("Reading the Sunday observation…");
    } else {
      showLoading();
    }
    setNavigatorBusy(true);
    try {
      const requestedDate = new URLSearchParams(globalThis.location.search).get("date") || "";
      // The root view is always Manila's current Sunday: its own Metrics/Report
      // are never trusted as "this week" (see useMetricReport below), but the
      // fetch still runs unconditionally because it is the only source of the
      // combo chart's multi-week ChartSeries history.
      const currentServiceDate = serviceDateForMetricRequest(requestedDate) || currentManilaServiceDate();
      const reportPromise = fetch(reportEndpoint(globalThis.location.search), {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const signupsPromise = shouldLoadLiveSignupsForDate(requestedDate)
        ? loadLiveSignups({}).catch((error) => {
            console.error("TechStats live signups read failed:", error);
            return null;
          })
        : Promise.resolve(null);
      const historyPromise = loadVolunteerHistory({
        serviceDate: currentServiceDate,
      }).catch((error) => {
        console.error("TechStats volunteer history read failed:", error);
        return [];
      });

      const [response, liveSignups, volunteerHistory] = await Promise.all([
        reportPromise,
        signupsPromise,
        historyPromise,
      ]);
      if (response && (response.status === 401 || response.status === 403)) {
        showState("Not authorized", "You do not have permission to view Tech Stats.");
        return;
      }
      if (response && !response.ok && response.status !== 404) throw new Error(`Report request failed (${response.status}).`);

      const reportData = response?.ok ? await response.json() : null;
      // Whether the metric fan-out is needed is a property of the payload, not
      // of the host it came from: a report whose metrics carry their MetricGuid
      // is already canonical and is used as-is (one request). A report that is
      // missing, empty, or carries only untagged rows cannot be mapped to the
      // metric catalogue, so the fan-out supplies the numbers instead.
      let metricReport = null;
      try {
        if (!hasCanonicalMetrics(reportData) || !requestedDate) {
          metricReport = await loadMetricBackedReport({
            requestedDate: currentServiceDate,
            allowEmpty: !requestedDate,
          });
        }
      } catch (error) {
        // The custom report remains the safe fallback when generic REST access is unavailable.
        console.error("TechStats metric-backed report failed:", error);
      }
      let activeBaseReport = null;
      if (reportData && hasCanonicalMetrics(reportData) && requestedDate) {
        try {
          // A canonical published/API payload can omit this computed metric.
          // Read only the dated Active Base alongside it, then merge that one
          // authoritative observation before restToBundle() derives the share.
          activeBaseReport = await loadMetricBackedReport({
            requestedDate: currentServiceDate,
            metricKeys: ["manila_active_base"],
            allowEmpty: true,
          });
        } catch (error) {
          console.error("TechStats active-base read failed:", error);
        }
      }

      const customServiceDate = isoDateValue(read(reportData?.Report, "ServiceDate", "serviceDate"));
      const metricServiceDate = isoDateValue(read(metricReport?.Report, "ServiceDate", "serviceDate"));
      const useMetricReport = shouldUseMetricReport({
        metricReport,
        reportData,
        requestedDate,
      });
      if (!reportData && !metricReport) {
        showState("No report yet", "No published Tech Stats report exists for this Monday.");
        return;
      }

      // Which numbers are authoritative and which chart history exists are two
      // different questions. The published report is the ONLY source of the
      // combo chart's multi-week ChartSeries — the metric fan-out knows one
      // Sunday — so that history rides along even when the snapshot's own
      // ServiceDate is weeks behind the live one. Its Metrics/Report are still
      // discarded: mapComboSeries appends the live Sunday to the snapshot's
      // labels, it never restates a published week as this week.
      const publishedChartSeries = read(reportData, "ChartSeries", "chartSeries");
      const mergedPublishedReport = mergePublishedActiveBase({
        reportData,
        metricReport: metricReport || activeBaseReport,
        requestedDate,
      });
      if (mergedPublishedReport !== reportData) {
        // A published report is the source of its snapshot and editorial
        // content. Only add/replace the computed denominator so restToBundle()
        // can derive the share from the same dated report input.
        state.reportData = mergedPublishedReport;
      } else if (useMetricReport && reportData && customServiceDate === metricServiceDate) {
        state.reportData = {
          ...reportData,
          Metrics: metricReport.Metrics,
          Report: { ...reportData.Report, ...metricReport.Report },
        };
      } else if (useMetricReport && publishedChartSeries) {
        state.reportData = { ...metricReport, ChartSeries: publishedChartSeries };
      } else {
        state.reportData = useMetricReport ? metricReport : reportData;
      }
      if (useMetricReport && liveSignups) {
        state.reportData = { ...state.reportData, Signups: liveSignups };
      }
      if (volunteerHistory && volunteerHistory.length) {
        state.reportData = { ...state.reportData, VolunteerHistory: volunteerHistory };
      }

      const publishedSettings = read(state.reportData, "PublishedSettings", "publishedSettings") ||
        read(state.reportData?.Report, "PublishedSettings", "publishedSettings");
      let attendanceOptions = {};
      if (publishedSettings) {
        // Frozen reports never re-read Sunday Inputs Settings. The published
        // payload carries the resolved service count, multiplier basis, and
        // resulting metric inputs from the moment Publish was clicked.
        attendanceOptions = { publishedSettings };
      } else {
        const campus = read(state.reportData?.Report, "Campus", "campus") ||
          read(state.reportData, "Campus", "campus") || "MNL";
        try {
          const settings = await loadSundayInputsSettings({ campus });
          attendanceOptions = { settings };
          // #740: scheduleNames is only ever read for venue "custom" -- in
          // "all" mode Settings itself ignores it for selection (see
          // sunday-settings-source.mjs), so a stale/deactivated schedule name
          // left in the standing config can't be trusted for the multiplier.
          // This report's OWN date/campus submitted-schedule count is ground
          // truth and works for every view, not only the ones whose Metrics
          // happen to route through the full metric fan-out.
          if (settings?.venue === "all") {
            const reportServiceDate = isoDateValue(read(state.reportData?.Report, "ServiceDate", "serviceDate"));
            try {
              const scheduleCount = await loadScheduleCountForDate({ serviceDate: reportServiceDate });
              if (Number.isSafeInteger(scheduleCount)) attendanceOptions.serviceCount = scheduleCount;
            } catch (error) {
              console.error("TechStats schedule count read failed:", error);
            }
          }
        } catch (error) {
          console.error("TechStats Sunday Inputs Settings read failed:", error);
          attendanceOptions = { settings: null };
        }
      }

      const publishedChart = read(state.reportData, "ChartSeries", "chartSeries") || {};
      const publishedCombo = read(publishedChart, "Combo", "combo") || {};
      const historicalLabels = Array.isArray(publishedCombo.labels)
        ? publishedCombo.labels.map(isoDateValue).filter(Boolean)
        : [];
      let historicalServiceCounts = {};
      if (historicalLabels.length) {
        try {
          historicalServiceCounts = await loadScheduleCountsForDates({ serviceDates: historicalLabels });
        } catch (error) {
          // Historical rows remain visible with explicit unavailable service context;
          // they never borrow today's service configuration.
          console.error("TechStats historical schedule-count read failed:", error);
        }
      }
      state.bundle = markFreshness(
        restToBundle(state.reportData, { ...attendanceOptions, historicalServiceCounts }),
        new URLSearchParams(globalThis.location.search).has("date"),
      );
      state.workingBundle = clone(state.bundle);
      if (!Array.isArray(state.bundle.identity.service_times) || !state.bundle.identity.service_times.length) {
        // No editor has ever entered ServiceTimes for this report yet -- default
        // to the campus's real Sunday schedule instead of a placeholder. Still
        // fully editable afterward via the "Sunday Service Times" popover.
        const canonical = await fetchCanonicalServiceTimes(currentServiceDate).catch(() => ({ times: [] }));
        if (canonical.times.length) {
          state.bundle.identity.service_times = canonical.times;
          state.workingBundle.identity.service_times = canonical.times;
        }
      }
      state.selectedDate = state.bundle.identity.report_date || state.selectedDate;
      if (!new URLSearchParams(globalThis.location.search).has("date")) {
        state.latestDate = state.selectedDate;
      }
      state.editing = false;
      state.dirty = false;
      state.hiddenSections.clear();
      state.currentUrl = globalThis.location.href;
      reportShell.classList.remove("ux-busy");
      setNavigatorBusy(false);
      renderNavigator();
      drawReport();
      /* A refresh or a week step ends with an explicit, timestamped completion. The first load
       * is not a refresh: the hero already names the week, so assistive tech hears it and the
       * chip stays quiet rather than greeting every page open with a toast. */
      if (kept) status.done(`Sunday Report refreshed · ${formatClock()}`);
      else status.quiet(`Sunday Report loaded for ${state.selectedDate || "this week"}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The report could not be loaded.";
      reportShell.classList.remove("ux-busy");
      setNavigatorBusy(false);
      if (kept) {
        const wanted = state.selectedDate;
        state.bundle = kept.bundle;
        state.workingBundle = kept.working;
        state.selectedDate = kept.selectedDate || state.selectedDate;
        state.currentUrl = kept.url;
        globalThis.history.replaceState({}, "", kept.url);
        reportShell.setAttribute("aria-busy", "false");
        renderNavigator();
        setEditorState();
        status.fail(`${wanted || "That week"} could not be loaded. Showing the last report.`, {
          action: { label: "Retry", run: () => navigate(wanted) },
        });
        return;
      }
      showState("Report unavailable", detail);
      status.fail("Report unavailable. Try another week or reload.", {
        action: { label: "Reload", run: () => loadReport() },
      });
    }
  }

  function confirmNavigation() {
    return !state.dirty || globalThis.confirm("Discard unsaved Tech Stats changes?");
  }

  function navigate(date) {
    if (!parseIsoDate(date) || !confirmNavigation()) return;
    const url = new URL(globalThis.location.href);
    url.searchParams.set("date", date);
    globalThis.history.pushState({}, "", url);
    state.selectedDate = date;
    loadReport();
  }

  async function postJson(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    let detail = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      detail = body.error || body.Message || body.message || detail;
    } catch {
      // Keep the deterministic status-only message for non-JSON failures.
    }
    throw new Error(detail);
  }

  function draftPayload() {
    return buildDraftPayload({ workingBundle: state.workingBundle, reportData: state.reportData, hiddenSections: state.hiddenSections });
  }

  function publishPayload() {
    return buildPublishPayload({ workingBundle: state.workingBundle, reportData: state.reportData, hiddenSections: state.hiddenSections });
  }

  previous.addEventListener("click", () => {
    const anchor = state.selectedDate || state.bundle?.identity?.report_date;
    const date = shiftWeeks(anchor, -1);
    if (date) navigate(date);
  });
  next.addEventListener("click", () => {
    const anchor = state.selectedDate || state.bundle?.identity?.report_date;
    const date = shiftWeeks(anchor, 1);
    if (date) navigate(date);
  });
  archive.addEventListener("change", () => {
    if (!archive.value) return;
    const picked = mondayOf(archive.value);
    if (picked) navigate(picked);
  });

  if (canEdit) {
    editButton.addEventListener("click", () => {
      state.editing = true;
      setEditorState();
      const narrativeBtn = reportShell.querySelector('.inline-edit-btn[data-edit-target="narrative"]');
      if (narrativeBtn) {
        narrativeBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        openInlineNarrativeEditor(narrativeBtn);
      }
      setEditorStatus("Editing notes inline");
    });
    cancelButton.addEventListener("click", handleDiscard);
    publishButton.addEventListener("click", handlePublish);
  }

  globalThis.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  globalThis.addEventListener("popstate", () => {
    if (!confirmNavigation()) {
      globalThis.history.pushState({}, "", state.currentUrl);
      return;
    }
    state.selectedDate = new URLSearchParams(globalThis.location.search).get("date");
    loadReport();
  });

  // The view, the export rail, and the copy prompt (#214, #216, #220) -- everything below
  // reads state.workingBundle live at click time (D7), never a snapshot taken here.
  function buildView() {
    return buildViewFromBundle(state.workingBundle, {
      url: globalThis.location.href,
      canEdit,
      fictional: false,
    });
  }

  function announce(message) {
    setEditorStatus(message);
    status.announce(message);
  }

  // Every table() accessor below reads a fresh view rather than closing over one, so a click
  // always exports exactly what the widget renders right now, including any unsaved edit.
  function sectionTable(id) {
    return () => {
      const section = (buildView().sections || []).find((candidate) => candidate.id === id);
      return section ? { id: section.id, title: section.heading, columns: section.columns || [], rows: section.rows || [] } : null;
    };
  }

  const exportRegistry = createExportRegistry();
  exportRegistry.register("techstats-attendance-share", {
    title: "Sunday attendance share",
    table: sectionTable("techstats-attendance-share"),
  });
  exportRegistry.register("techstats-metrics-history", {
    title: "Historical data ledger",
    table: sectionTable("techstats-metrics-history"),
  });
  exportRegistry.register("techstats-volunteers", {
    title: "Volunteer history",
    table: sectionTable("techstats-volunteers"),
    // The live canvas, not a re-render: whichever of the year-overlay / week-by-week views
    // is currently drawn (the volunteer-view-switch handler above) is what gets saved.
    png: () => {
      const canvas = reportShell.querySelector('canvas[data-chart="volunteers"]');
      return canvas ? exportCanvasToPng(canvas) : Promise.reject(new Error("no volunteer chart is drawn"));
    },
  });
  exportRegistry.register("techstats-weekly-delta", {
    title: "This week · Sunday stats",
    table: sectionTable("techstats-weekly-delta"),
    png: () => {
      const canvas = reportShell.querySelector('canvas[data-chart="combo"]');
      return canvas ? exportCanvasToPng(canvas) : Promise.reject(new Error("no combo chart is drawn"));
    },
  });
  exportRegistry.register("techstats-signups", {
    title: "Live signups & registrations",
    table: sectionTable("techstats-signups"),
  });
  // The masthead's package control needs a registry entry too (bindExportDelegation looks
  // one up for every data-export click, package included) -- a tiny aggregate summary is
  // enough to satisfy that, since the real payload comes from options.package below.
  exportRegistry.register("techstats-metrics", {
    title: "TechStats",
    table: () => {
      const included = (buildView().sections || []).filter((section) => !section.personLevel).length;
      return {
        id: "techstats-metrics",
        title: "TechStats",
        columns: [{ key: "metric", label: "Summary" }, { key: "value", label: "Value" }],
        rows: [{ metric: "Sections included in the package", value: included }],
      };
    },
  });
  bindExportDelegation(root, exportRegistry, {
    view: buildView,
    announce,
    package: () => buildDashboardPackage(buildView()),
  });

  renderNavigator();
  loadReport();
}

if (typeof document !== "undefined") {
  const start = () => {
    const root = document.querySelector("#techstats-root");
    if (root && !root.dataset.booted) {
      root.dataset.booted = "true";
      try {
        bootTechStats(root);
      } catch (err) {
        console.error("Sunday Report fatal error while booting:", err);
        const fallback = document.createElement("div");
        fallback.className = "report-boot-error";
        fallback.style.cssText = "max-width: 640px; margin: 3rem auto; padding: 2rem; background: #fffdf9; border: 1px solid #e2e8f0; border-radius: 12px; font-family: system-ui, sans-serif;";
        fallback.innerHTML = `<h2 style="margin:0 0 8px; color:#0f172a;">Sunday Report</h2><p style="color:#64748b; margin:0 0 16px;">Something went wrong loading this report.</p><pre style="background:#f1f5f9; padding:12px; border-radius:6px; font-size:12px; overflow-x:auto;">${escapeHtml(err && err.message ? err.message : String(err))}</pre>`;
        root.replaceChildren(fallback);
      }
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
