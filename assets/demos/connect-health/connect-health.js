(function (host) {
  "use strict";

  const BAND_ORDER = Object.freeze(["critical", "thin", "watch", "healthy", "unknown"]);
  const BAND_RANK = Object.freeze({ critical: 5, thin: 4, watch: 3, healthy: 2, unknown: 1 });
  const DAY_ORDER = Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  const HEALTH_LABELS = Object.freeze({
    all: "All signals",
    critical: "Critical",
    thin: "Thin",
    watch: "Watch",
    healthy: "Healthy",
    unknown: "Unknown",
  });
  const HEALTH_COPY = Object.freeze({
    critical: "leadership or sustained attendance needs a closer look",
    thin: "load or rhythm is running hot",
    watch: "pressure worth preventing before it grows",
    healthy: "measured signals are inside the working range",
    unknown: "activity is not measured in this fixture window",
  });
  const DEFAULT_FILTERS = Object.freeze({
    campus: "all",
    health: "all",
    age: "all",
    meeting: "all",
    locality: "all",
    day: "all",
  });

  function copyFilters(filters) {
    return { ...DEFAULT_FILTERS, ...(filters || {}) };
  }

  function round(value, places) {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function formatSigned(value) {
    if (value > 0) return `+${formatNumber(value)}`;
    return formatNumber(value);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function labelForGroup(group) {
    const match = String(group?.id || "").match(/(\d+)$/);
    return `Fictional group ${match ? match[1].padStart(3, "0") : "000"}`;
  }

  function labelForLocality(value) {
    if (value === "unmapped") return "Unmapped";
    const match = String(value || "").match(/(\d+)$/);
    return `Locality ${match ? match[1].padStart(2, "0") : "00"}`;
  }

  function labelForCampus(value, data) {
    if (value === "all") return "All campuses";
    return data?.campuses?.find((campus) => campus.id === value)?.label || value;
  }

  function healthBandFor(group) {
    if (group.leaders === 0) return "critical";
    const leadershipLoad = group.members / group.leaders;
    const leadershipBand = leadershipLoad >= 15 ? "thin" : leadershipLoad >= 12 ? "watch" : "healthy";
    const activity = summarizeAttendance(group.attendance);
    let activityBand = "healthy";
    if (activity.observedWeeks === 0) activityBand = "unknown";
    else if (activity.silentStreak >= 3) activityBand = "critical";
    else if (activity.silentStreak >= 2) activityBand = "thin";
    else if (activity.loggedRate < 0.67) activityBand = "watch";

    if (activityBand === "unknown") return "unknown";
    let band = BAND_RANK[leadershipBand] >= BAND_RANK[activityBand] ? leadershipBand : activityBand;
    if (band === "healthy" && group.collecting === true) band = "watch";
    return band;
  }

  function summarizeAttendance(attendance) {
    const weeks = Array.isArray(attendance) ? [...attendance].sort((a, b) => String(a.week).localeCompare(String(b.week))) : [];
    const observedWeeks = weeks.length;
    const recordedWeeks = weeks.filter((week) => week.state === "recorded").length;
    const cancelledWeeks = weeks.filter((week) => week.state === "cancelled").length;
    const notLoggedWeeks = weeks.filter((week) => week.state === "not-logged").length;
    let silentStreak = 0;
    for (let index = weeks.length - 1; index >= 0; index -= 1) {
      if (weeks[index].state !== "not-logged") break;
      silentStreak += 1;
    }
    return {
      weeks,
      observedWeeks,
      recordedWeeks,
      cancelledWeeks,
      notLoggedWeeks,
      attendanceRows: sum(weeks.map((week) => Number(week.attendance))),
      loggedRate: observedWeeks ? round((recordedWeeks + cancelledWeeks) / observedWeeks, 4) : null,
      silentStreak,
    };
  }

  function capacityReading(group) {
    if (group.capacity === null || group.capacity === undefined) {
      return { state: "unknown", label: "Not set", detail: "capacity not set" };
    }
    if (group.openSeats !== null && group.openSeats !== undefined && group.openSeats <= 0) {
      return { state: "full", label: group.openSeats < 0 ? "Over" : "Full", detail: `${formatSigned(group.openSeats)} net seats` };
    }
    return {
      state: "open",
      label: `${formatNumber(group.openSeats)} open`,
      detail: `${formatNumber(group.capacity)} capacity`,
    };
  }

  function deriveGroup(raw) {
    const attendance = summarizeAttendance(raw.attendance);
    const health = healthBandFor(raw);
    const leadershipLoad = raw.leaders > 0 ? round(raw.members / raw.leaders, 2) : null;
    const reasons = [];
    if (raw.leaders === 0) {
      reasons.push("No leader is recorded.");
    } else if (leadershipLoad >= 15) {
      reasons.push(`${leadershipLoad} members per leader.`);
    } else if (leadershipLoad >= 12) {
      reasons.push(`${leadershipLoad} members per leader is at the watch line.`);
    }
    if (attendance.observedWeeks === 0) {
      reasons.push("No meeting is recorded in this fixture window.");
    } else if (attendance.silentStreak >= 3) {
      reasons.push(`${attendance.silentStreak} observed weeks end without attendance entered.`);
    } else if (attendance.silentStreak >= 2) {
      reasons.push(`${attendance.silentStreak} observed weeks end without attendance entered.`);
    } else if (attendance.loggedRate < 0.67) {
      reasons.push(`Attendance is entered for ${Math.round(attendance.loggedRate * 100)}% of observed weeks.`);
    }
    if (health === "healthy" && raw.collecting === true) {
      reasons.unshift("Still collecting members; meeting rhythm is not established.");
    }
    if (!reasons.length) reasons.push("Healthy across the measured signals.");

    return {
      ...raw,
      attendance,
      health: {
        band: health,
        reasons,
        leadershipLoad,
        activityBand: attendance.observedWeeks === 0
          ? "unknown"
          : attendance.silentStreak >= 3
            ? "critical"
            : attendance.silentStreak >= 2
              ? "thin"
              : attendance.loggedRate < 0.67 ? "watch" : "healthy",
      },
      capacityReading: capacityReading(raw),
    };
  }

  function matchesFilters(group, filters) {
    const selected = copyFilters(filters);
    return (selected.campus === "all" || group.campus === selected.campus)
      && (selected.health === "all" || group.health.band === selected.health)
      && (selected.age === "all" || group.age === selected.age)
      && (selected.meeting === "all" || group.location === selected.meeting)
      && (selected.locality === "all" || group.locality === selected.locality)
      && (selected.day === "all" || group.day === selected.day);
  }

  function filterGroups(groups, filters, focusedId = null) {
    return groups.filter((group) => matchesFilters(group, filters) && (!focusedId || group.id === focusedId));
  }

  function summarizeGroups(groups) {
    const bands = Object.fromEntries(BAND_ORDER.map((band) => [band, 0]));
    groups.forEach((group) => { bands[group.health.band] += 1; });
    const knownSeatGroups = groups.filter((group) => group.openSeats !== null && group.openSeats !== undefined);
    return {
      groupCount: groups.length,
      bands,
      members: sum(groups.map((group) => group.members)),
      leaders: sum(groups.map((group) => group.leaders)),
      netSeats: sum(knownSeatGroups.map((group) => group.openSeats)),
      knownSeatGroups: knownSeatGroups.length,
      localityCount: new Set(groups.map((group) => group.locality)).size,
    };
  }

  function queueScore(group) {
    if (group.leaders === 0) return 1000;
    if (group.attendance.silentStreak >= 3) return 900;
    if (group.attendance.silentStreak >= 2) return 800;
    if (group.health.band === "critical") return 700;
    if (group.health.band === "thin") return 600;
    if (group.health.band === "watch") return 500;
    if (group.capacity === null || group.capacity === undefined) return 300;
    if (group.openSeats <= 0) return 250;
    return 100 - Math.min(group.health.leadershipLoad || 0, 99);
  }

  function sortQueue(groups) {
    return [...groups].sort((left, right) => queueScore(right) - queueScore(left) || BAND_RANK[right.health.band] - BAND_RANK[left.health.band] || right.members - left.members || left.id.localeCompare(right.id));
  }

  function modeState(mode) {
    const selected = mode === "classic" ? "classic" : "creative";
    return {
      mode: selected,
      creativeVisible: selected === "creative",
      classicVisible: selected === "classic",
    };
  }

  const API = Object.freeze({
    BAND_ORDER,
    BAND_RANK,
    DEFAULT_FILTERS,
    copyFilters,
    deriveGroup,
    filterGroups,
    healthBandFor,
    matchesFilters,
    summarizeAttendance,
    summarizeGroups,
    sortQueue,
    modeState,
  });

  host.ConnectHealth = API;
  if (!host.document || !host.document.getElementById) return;

  const root = host.document.getElementById("connect-health");
  const dataNode = host.document.getElementById("connect-health-data");
  if (!root || !dataNode) return;

  let fixture;
  try {
    fixture = JSON.parse(dataNode.textContent || "{}");
  } catch (error) {
    renderFailure(root, "The local fixture could not be read.");
    return;
  }

  const data = {
    ...fixture,
    groups: Array.isArray(fixture.groups) ? fixture.groups.map(deriveGroup) : [],
  };
  const state = {
    mode: "creative",
    consoleOpen: false,
    focusedId: null,
    filters: copyFilters(),
  };
  const prefersReducedMotion = typeof host.matchMedia === "function" && host.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const elements = {
    root,
    creative: root.querySelector("#creative-view"),
    classic: root.querySelector("#classic-view"),
    scopeSummary: root.querySelector("#scope-summary"),
    scopeTags: root.querySelector("#scope-tags"),
    scopeReset: root.querySelector(".scope-reset"),
    stampScope: root.querySelector("#stamp-scope"),
    stampCount: root.querySelector("#stamp-count"),
    stampAsOf: root.querySelector("#stamp-asof"),
    stampWindow: root.querySelector("#stamp-window"),
    filterConsole: root.querySelector("#filter-console"),
    live: root.querySelector("#live-region"),
    focusPanel: root.querySelector("#focus-panel"),
    summaryMetrics: root.querySelector("#summary-metrics"),
    signalBoard: root.querySelector("#signal-board"),
    signalNote: root.querySelector("#signal-note"),
    signalMeta: root.querySelector("#signal-meta"),
    fieldstrip: root.querySelector("#fieldstrip"),
    fieldstripCount: root.querySelector("#fieldstrip-count"),
    plotboard: root.querySelector("#plotboard"),
    pressureChart: root.querySelector("#pressure-chart"),
    pressureAside: root.querySelector("#pressure-aside"),
    rhythmGrid: root.querySelector("#rhythm-grid"),
    queue: root.querySelector("#queue"),
    queueMeta: root.querySelector("#queue-meta"),
    classicHealthTable: root.querySelector("#classic-health-table"),
    classicGroupTable: root.querySelector("#classic-group-table"),
    classicLocalityTable: root.querySelector("#classic-locality-table"),
    classicHealthCount: root.querySelector("#classic-health-count"),
    classicGroupCount: root.querySelector("#classic-group-count"),
    filterCountNote: root.querySelector("#filter-count-note"),
  };

  const campusLabel = (value) => labelForCampus(value, data);
  const query = (selector) => root.querySelector(selector);

  function renderFailure(container, message) {
    const target = container.querySelector("#dashboard-content") || container;
    target.innerHTML = `<section class="empty-state"><strong>Local readout unavailable.</strong><br>${escapeHTML(message)}</section>`;
  }

  function renderFilterButton(container, option, selected, action, currentFilters, field) {
    const active = selected === option.value;
    const optionCount = option.count;
    const disabled = option.value !== "all" && optionCount === 0;
    const classes = ["filter-chip"];
    if (option.band) classes.push(`band-${option.band}`);
    container.insertAdjacentHTML("beforeend", `<button type="button" class="${classes.join(" ")}" data-action="filter" data-filter="${escapeHTML(field)}" data-value="${escapeHTML(option.value)}" aria-pressed="${active}"${disabled ? " disabled" : ""}>
      <span class="filter-chip-label">${escapeHTML(option.label)}</span><span class="filter-chip-count">${formatNumber(optionCount)}</span>
    </button>`);
  }

  function filterBase(field) {
    const base = copyFilters(state.filters);
    base[field] = "all";
    return filterGroups(data.groups, base, null);
  }

  function normalizeFilters() {
    for (const field of ["locality", "day"]) {
      if (state.filters[field] === "all") continue;
      const available = new Set(filterBase(field).map((group) => group[field]));
      if (!available.has(state.filters[field])) state.filters[field] = "all";
    }
  }

  function renderFilters() {
    const containers = {
      campus: query("#campus-filters"),
      health: query("#health-filters"),
      age: query("#age-filters"),
      meeting: query("#meeting-filters"),
    };
    Object.values(containers).forEach((container) => { if (container) container.innerHTML = ""; });

    const allCount = filterGroups(data.groups, state.filters, null).length;
    const campusOptions = [{ value: "all", label: "All", count: filterBase("campus").length }, ...data.campuses.map((campus) => ({
      value: campus.id,
      label: campus.label,
      count: filterBase("campus").filter((group) => group.campus === campus.id).length,
    }))];
    campusOptions.forEach((option) => renderFilterButton(containers.campus, option, state.filters.campus, "filter", state.filters, "campus"));

    const healthOptions = [{ value: "all", label: "All signals", count: filterBase("health").length }, ...BAND_ORDER.map((band) => ({
      value: band,
      label: HEALTH_LABELS[band],
      band,
      count: filterBase("health").filter((group) => group.health.band === band).length,
    }))];
    healthOptions.forEach((option) => renderFilterButton(containers.health, option, state.filters.health, "filter", state.filters, "health"));

    const ages = [...new Set(data.groups.map((group) => group.age))].sort((a, b) => a.localeCompare(b));
    const ageOptions = [{ value: "all", label: "All ages", count: filterBase("age").length }, ...ages.map((age) => ({
      value: age,
      label: age,
      count: filterBase("age").filter((group) => group.age === age).length,
    }))];
    ageOptions.forEach((option) => renderFilterButton(containers.age, option, state.filters.age, "filter", state.filters, "age"));

    const meetings = [...new Set(data.groups.map((group) => group.location))].sort((a, b) => a.localeCompare(b));
    const meetingOptions = [{ value: "all", label: "All modes", count: filterBase("meeting").length }, ...meetings.map((meeting) => ({
      value: meeting,
      label: meeting,
      count: filterBase("meeting").filter((group) => group.location === meeting).length,
    }))];
    meetingOptions.forEach((option) => renderFilterButton(containers.meeting, option, state.filters.meeting, "filter", state.filters, "meeting"));

    renderSelect(query("#locality-filter"), "locality", "All localities", [...new Set(filterBase("locality").map((group) => group.locality))].sort(), state.filters.locality, labelForLocality);
    renderSelect(query("#day-filter"), "day", "All days", DAY_ORDER.filter((day) => filterBase("day").some((group) => group.day === day)), state.filters.day, (value) => value);

    if (elements.filterCountNote) {
      elements.filterCountNote.innerHTML = `<strong>${formatNumber(allCount)} groups</strong> in the current slice.${state.focusedId ? " Group focus is active." : ""}`;
    }
  }

  function renderSelect(select, field, allLabel, values, selected, labeler) {
    if (!select) return;
    const validValues = new Set(values);
    if (selected !== "all" && !validValues.has(selected)) {
      state.filters[field] = "all";
      selected = "all";
    }
    const options = [`<option value="all">${escapeHTML(allLabel)}</option>`].concat(values.map((value) => `<option value="${escapeHTML(value)}"${value === selected ? " selected" : ""}>${escapeHTML(labeler(value))}</option>`));
    select.innerHTML = options.join("");
    select.value = selected;
  }

  function renderHeader(visible, summary) {
    const campus = state.filters.campus === "all" ? "All campuses" : campusLabel(state.filters.campus);
    elements.stampScope.textContent = campus;
    elements.stampCount.textContent = formatNumber(summary.groupCount);
    elements.stampAsOf.textContent = data.snapshot || "Local fixture";
    elements.stampWindow.textContent = `${data.weeks.length} weeks`;

    const scopeText = state.focusedId
      ? `Focused on ${labelForGroup(data.groups.find((group) => group.id === state.focusedId) || { id: state.focusedId })}`
      : `${campus} · ${formatNumber(summary.groupCount)} fictional groups`;
    elements.scopeSummary.textContent = scopeText;
    elements.scopeTags.innerHTML = activeTags();
    elements.scopeReset.hidden = !hasActiveScope();
  }

  function activeTags() {
    const tags = [];
    if (state.filters.campus !== "all") tags.push(["Campus", campusLabel(state.filters.campus)]);
    if (state.filters.health !== "all") tags.push(["Health", HEALTH_LABELS[state.filters.health]]);
    if (state.filters.age !== "all") tags.push(["Age", state.filters.age]);
    if (state.filters.meeting !== "all") tags.push(["Mode", state.filters.meeting]);
    if (state.filters.locality !== "all") tags.push(["Place", labelForLocality(state.filters.locality)]);
    if (state.filters.day !== "all") tags.push(["Day", state.filters.day]);
    if (state.focusedId) tags.push(["Focus", labelForGroup(data.groups.find((group) => group.id === state.focusedId) || { id: state.focusedId })]);
    return tags.map(([label, value]) => `<span class="scope-tag"><strong>${escapeHTML(label)}</strong> ${escapeHTML(value)}</span>`).join("");
  }

  function hasActiveScope() {
    return Object.values(state.filters).some((value) => value !== "all") || Boolean(state.focusedId);
  }

  function renderSummary(visible, summary) {
    const metrics = [
      ["Groups", summary.groupCount, "in slice"],
      ["Active members", summary.members, "members"],
      ["Leaders", summary.leaders, "on record"],
      ["Net open seats", summary.netSeats, `${summary.knownSeatGroups}/${summary.groupCount || 0} capacities set`],
    ];
    elements.summaryMetrics.innerHTML = metrics.map(([label, value, unit]) => `<div class="summary-metric"><span class="summary-metric-label">${escapeHTML(label)}</span><strong class="summary-metric-value">${formatNumber(value)}</strong><span class="summary-metric-unit">${escapeHTML(unit)}</span></div>`).join("");
    elements.signalNote.textContent = `${formatNumber(summary.groupCount)} fictional groups in this slice. Click a signal line or a mark to focus the same local field.`;
    elements.signalMeta.textContent = `${BAND_ORDER.length} health bands · ${formatNumber(summary.localityCount)} localities represented`;
  }

  function renderSignal(visible, summary) {
    if (!visible.length) {
      elements.signalBoard.innerHTML = `<div class="empty-state">No groups match this slice. Reset the console to see the whole local field.</div>`;
      elements.fieldstrip.innerHTML = "";
      elements.fieldstripCount.textContent = "0 marks";
      return;
    }
    elements.signalBoard.innerHTML = BAND_ORDER.map((band) => {
      const count = summary.bands[band];
      const disabled = count === 0;
      const selected = state.filters.health === band && !state.focusedId;
      return `<button type="button" class="signal-line band-${band}" data-action="health-filter" data-value="${band}" aria-pressed="${selected}"${disabled ? " disabled" : ""}>
        <span class="signal-line-label">${escapeHTML(HEALTH_LABELS[band])}</span>
        <span class="signal-line-copy">${disabled ? "No groups in this slice" : `<strong>${formatNumber(count)} group${count === 1 ? "" : "s"}</strong> · ${escapeHTML(HEALTH_COPY[band])}`}</span>
        <span class="signal-line-count">${formatNumber(count)}</span>
      </button>`;
    }).join("");

    const ordered = [...visible].sort((left, right) => BAND_RANK[right.health.band] - BAND_RANK[left.health.band] || left.id.localeCompare(right.id));
    elements.fieldstrip.innerHTML = ordered.map((group, index) => `<button type="button" class="field-tick band-${group.health.band}" data-action="focus-group" data-value="${escapeHTML(group.id)}" data-index="${index}" aria-pressed="${state.focusedId === group.id}" aria-label="Focus ${escapeHTML(labelForGroup(group))}, ${escapeHTML(HEALTH_LABELS[group.health.band])}, ${formatNumber(group.members)} active members"></button>`).join("");
    elements.fieldstripCount.textContent = `${formatNumber(ordered.length)} marks`;
  }

  function renderFocus(visible) {
    const focused = state.focusedId ? data.groups.find((group) => group.id === state.focusedId) : null;
    if (!focused) {
      elements.focusPanel.hidden = true;
      elements.focusPanel.innerHTML = "";
      return;
    }
    const health = HEALTH_LABELS[focused.health.band];
    const attendanceText = focused.attendance.observedWeeks === 0
      ? "No observed weeks"
      : `${Math.round(focused.attendance.loggedRate * 100)}% logged · ${focused.attendance.silentStreak} silent trailing`;
    elements.focusPanel.hidden = false;
    elements.focusPanel.innerHTML = `<div class="focus-panel-inner">
      <div>
        <p class="focus-kicker">Focused group · one local record</p>
        <h3>${escapeHTML(labelForGroup(focused))} <span class="state-chip band-${focused.health.band}">${escapeHTML(health)}</span></h3>
        <p class="focus-meta">${escapeHTML(campusLabel(focused.campus))} · ${escapeHTML(focused.age)} · ${escapeHTML(focused.location)} · ${escapeHTML(labelForLocality(focused.locality))}</p>
        <div class="focus-facts">
          ${focusFact("Members", formatNumber(focused.members))}
          ${focusFact("Leaders", formatNumber(focused.leaders))}
          ${focusFact("Load", focused.health.leadershipLoad === null ? "Unled" : `${focused.health.leadershipLoad} / leader`)}
          ${focusFact("Seats", focused.openSeats === null ? "Not set" : formatSigned(focused.openSeats))}
          ${focusFact("Rhythm", attendanceText)}
        </div>
        <p class="focus-reason"><strong>Why it reads ${escapeHTML(health.toLowerCase())}:</strong> ${escapeHTML(focused.health.reasons.join(" "))}</p>
      </div>
      <button type="button" class="focus-close" data-action="clear-focus">Clear focus</button>
    </div>`;
  }

  function focusFact(label, value) {
    return `<span class="focus-fact"><span class="focus-fact-label">${escapeHTML(label)}</span><span class="focus-fact-value">${escapeHTML(value)}</span></span>`;
  }

  function aggregateLocalities(groups) {
    const byLocality = new Map();
    groups.forEach((group) => {
      const key = group.locality;
      if (!byLocality.has(key)) byLocality.set(key, { locality: key, groups: [], bands: Object.fromEntries(BAND_ORDER.map((band) => [band, 0])), members: 0, leaders: 0, netSeats: 0, knownSeats: 0 });
      const aggregate = byLocality.get(key);
      aggregate.groups.push(group);
      aggregate.bands[group.health.band] += 1;
      aggregate.members += group.members;
      aggregate.leaders += group.leaders;
      if (group.openSeats !== null && group.openSeats !== undefined) {
        aggregate.netSeats += group.openSeats;
        aggregate.knownSeats += 1;
      }
    });
    return [...byLocality.values()].sort((left, right) => (right.bands.critical + right.bands.thin) - (left.bands.critical + left.bands.thin) || right.groups.length - left.groups.length || left.locality.localeCompare(right.locality));
  }

  function renderPlotboard(visible) {
    const localities = aggregateLocalities(visible);
    if (!localities.length) {
      elements.plotboard.innerHTML = `<div class="empty-state">No locality cells in this slice.</div>`;
      return;
    }
    elements.plotboard.innerHTML = localities.map((locality, index) => {
      const total = locality.groups.length || 1;
      const stack = BAND_ORDER.map((band) => locality.bands[band] ? `<i class="band-${band}" style="width:${(locality.bands[band] / total) * 100}%"></i>` : "").join("");
      const pressure = locality.bands.critical + locality.bands.thin;
      const selected = state.filters.locality === locality.locality && !state.focusedId;
      return `<button type="button" class="locality-cell" data-action="locality-filter" data-value="${escapeHTML(locality.locality)}" aria-pressed="${selected}" aria-label="Filter to ${escapeHTML(labelForLocality(locality.locality))}, ${formatNumber(total)} groups">
        <span class="locality-index">L-${String(index + 1).padStart(2, "0")}</span>
        <strong class="locality-name">${escapeHTML(labelForLocality(locality.locality))}</strong>
        <span class="locality-count">${formatNumber(total)} group${total === 1 ? "" : "s"} · ${formatNumber(locality.members)} members</span>
        <span class="locality-stack" aria-hidden="true">${stack}</span>
        <span class="locality-stats"><span><strong>${formatNumber(pressure)}</strong> pressure</span><span>${locality.knownSeats ? formatSigned(locality.netSeats) : "—"} seats</span></span>
      </button>`;
    }).join("");
  }

  function renderPressure(visible) {
    const ranked = [...visible].sort((left, right) => (right.health.leadershipLoad === null ? 999 : right.health.leadershipLoad) - (left.health.leadershipLoad === null ? 999 : left.health.leadershipLoad) || BAND_RANK[right.health.band] - BAND_RANK[left.health.band] || left.id.localeCompare(right.id));
    const top = ranked.slice(0, 10);
    const knownLoads = visible.filter((group) => group.health.leadershipLoad !== null).map((group) => group.health.leadershipLoad);
    const maxLoad = Math.max(12, ...knownLoads, 1);
    elements.pressureChart.innerHTML = top.length ? top.map((group) => {
      const ratio = group.health.leadershipLoad;
      const width = ratio === null ? 100 : Math.min(100, (ratio / maxLoad) * 100);
      const value = ratio === null ? "unled" : `${ratio} / leader`;
      return `<button type="button" class="pressure-row band-${group.health.band}" data-action="focus-group" data-value="${escapeHTML(group.id)}" aria-pressed="${state.focusedId === group.id}">
        <span><span class="pressure-group-name">${escapeHTML(labelForGroup(group))}</span><span class="pressure-group-meta">${escapeHTML(group.age)} · ${escapeHTML(labelForLocality(group.locality))}</span></span>
        <span class="pressure-track" aria-hidden="true"><i style="width:${width}%"></i></span>
        <span class="pressure-value">${escapeHTML(value)}</span>
      </button>`;
    }).join("") : `<div class="empty-state">No leadership marks in this slice.</div>`;

    const unled = visible.filter((group) => group.leaders === 0).length;
    const hot = visible.filter((group) => group.health.leadershipLoad !== null && group.health.leadershipLoad >= 15).length;
    const watch = visible.filter((group) => group.health.leadershipLoad !== null && group.health.leadershipLoad >= 12 && group.health.leadershipLoad < 15).length;
    elements.pressureAside.innerHTML = `<h3>Reading key</h3><p>The rail is ordered by <strong>members per leader</strong>. It does not blend attendance or capacity into this one view.</p><dl><dt>No leader recorded</dt><dd>${formatNumber(unled)}</dd><dt>Thin load ≥ 15</dt><dd>${formatNumber(hot)}</dd><dt>Watch load ≥ 12</dt><dd>${formatNumber(watch)}</dd></dl>`;
  }

  function renderRhythm(visible) {
    elements.rhythmGrid.innerHTML = DAY_ORDER.map((day) => {
      const groups = visible.filter((group) => group.day === day);
      const bands = Object.fromEntries(BAND_ORDER.map((band) => [band, 0]));
      groups.forEach((group) => { bands[group.health.band] += 1; });
      const selected = state.filters.day === day && !state.focusedId;
      const stack = BAND_ORDER.map((band) => bands[band] ? `<i class="band-${band}" style="width:${(bands[band] / Math.max(groups.length, 1)) * 100}%"></i>` : "").join("");
      return `<button type="button" class="rhythm-day" data-action="day-filter" data-value="${escapeHTML(day)}" aria-pressed="${selected}"${groups.length ? "" : " disabled"}>
        <span class="rhythm-day-label">${escapeHTML(day.slice(0, 3))}</span>
        <strong class="rhythm-day-count">${formatNumber(groups.length)}</strong>
        <span class="rhythm-day-share">${groups.length ? `${Math.round((groups.length / Math.max(visible.length, 1)) * 100)}% of slice` : "no groups"}</span>
        <span class="rhythm-bar" aria-hidden="true">${stack}</span>
      </button>`;
    }).join("");
  }

  function renderQueue(visible) {
    const ranked = sortQueue(visible).slice(0, 8);
    elements.queueMeta.textContent = `${formatNumber(ranked.length)} of ${formatNumber(visible.length)} in the current slice`;
    if (!ranked.length) {
      elements.queue.innerHTML = `<div class="queue-empty">No groups match this slice.</div>`;
      return;
    }
    elements.queue.innerHTML = ranked.map((group, index) => `<button type="button" class="queue-row" data-action="focus-group" data-value="${escapeHTML(group.id)}" aria-pressed="${state.focusedId === group.id}">
      <span class="queue-index">${String(index + 1).padStart(2, "0")}</span>
      <span><span class="queue-name">${escapeHTML(labelForGroup(group))}</span><span class="queue-meta">${escapeHTML(campusLabel(group.campus))} · ${escapeHTML(group.age)} · ${escapeHTML(group.location)}</span></span>
      <span class="queue-why"><span class="queue-reason-label">why now</span>${escapeHTML(queueReason(group))}</span>
      <span class="state-chip band-${group.health.band}">${escapeHTML(HEALTH_LABELS[group.health.band])}</span>
    </button>`).join("");
  }

  function queueReason(group) {
    if (group.leaders === 0) return "No leader is recorded.";
    if (group.attendance.silentStreak >= 3) return `${group.attendance.silentStreak} weeks without attendance entered.`;
    if (group.attendance.silentStreak >= 2) return `${group.attendance.silentStreak} weeks without attendance entered.`;
    if (group.health.leadershipLoad >= 15) return `${group.health.leadershipLoad} members per leader.`;
    if (group.health.band === "watch") return "A watch signal is worth preventing early.";
    if (group.capacity === null || group.capacity === undefined) return "Capacity is not set in the fixture.";
    if (group.openSeats <= 0) return group.openSeats < 0 ? "Active members exceed stated capacity." : "No open seats remain.";
    return "A measured signal to keep on the radar.";
  }

  function renderClassic(visible, summary) {
    elements.classicHealthCount.textContent = `${formatNumber(summary.groupCount)} groups`;
    elements.classicGroupCount.textContent = `${formatNumber(summary.groupCount)} rows`;
    elements.classicHealthTable.innerHTML = `<table class="classic-table health-table"><thead><tr><th scope="col">Signal</th><th scope="col" class="number">Groups</th><th scope="col">Share of slice</th><th scope="col">Reading</th></tr></thead><tbody>${BAND_ORDER.map((band) => {
      const count = summary.bands[band];
      const share = summary.groupCount ? Math.round((count / summary.groupCount) * 100) : 0;
      return `<tr><th scope="row"><button type="button" class="group-button" data-action="health-filter" data-value="${band}" aria-pressed="${state.filters.health === band && !state.focusedId}"><span class="health-name"><i class="health-dot band-${band}" aria-hidden="true"></i>${escapeHTML(HEALTH_LABELS[band])}</span></button></th><td class="number">${formatNumber(count)}</td><td><span class="table-bar" aria-hidden="true"><i style="width:${share}%"></i></span></td><td class="muted-cell">${escapeHTML(HEALTH_COPY[band])}</td></tr>`;
    }).join("")}</tbody></table>`;

    elements.classicGroupTable.innerHTML = visible.length ? `<table class="classic-table group-table"><thead><tr><th scope="col">Group</th><th scope="col">Signal</th><th scope="col">Campus</th><th scope="col">Age</th><th scope="col">Mode</th><th scope="col">Meet-up</th><th scope="col" class="number">Members</th><th scope="col" class="number">Leaders</th><th scope="col" class="number">Seats</th></tr></thead><tbody>${visible.map((group) => `<tr><th scope="row"><button type="button" class="group-button" data-action="focus-group" data-value="${escapeHTML(group.id)}" aria-pressed="${state.focusedId === group.id}">${escapeHTML(labelForGroup(group))}</button></th><td><span class="state-chip band-${group.health.band}">${escapeHTML(HEALTH_LABELS[group.health.band])}</span></td><td>${escapeHTML(campusLabel(group.campus))}</td><td>${escapeHTML(group.age)}</td><td>${escapeHTML(group.location)}</td><td>${escapeHTML(group.day)} · ${escapeHTML(group.time)}</td><td class="number">${formatNumber(group.members)}</td><td class="number">${formatNumber(group.leaders)}</td><td class="number">${group.openSeats === null || group.openSeats === undefined ? "—" : formatSigned(group.openSeats)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">No groups match this slice.</div>`;

    const localities = aggregateLocalities(visible);
    elements.classicLocalityTable.innerHTML = localities.length ? `<table class="classic-table"><thead><tr><th scope="col">Locality</th><th scope="col" class="number">Groups</th><th scope="col" class="number">Members</th><th scope="col" class="number">Pressure</th><th scope="col" class="number">Net seats</th></tr></thead><tbody>${localities.map((locality) => `<tr><th scope="row"><button type="button" class="group-button" data-action="locality-filter" data-value="${escapeHTML(locality.locality)}" aria-pressed="${state.filters.locality === locality.locality && !state.focusedId}">${escapeHTML(labelForLocality(locality.locality))}</button></th><td class="number">${formatNumber(locality.groups.length)}</td><td class="number">${formatNumber(locality.members)}</td><td class="number">${formatNumber(locality.bands.critical + locality.bands.thin)}</td><td class="number">${locality.knownSeats ? formatSigned(locality.netSeats) : "—"}</td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">No locality rows in this slice.</div>`;
  }

  function syncMode() {
    const view = modeState(state.mode);
    state.mode = view.mode;
    root.dataset.mode = view.mode;
    queryAll(".mode-button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.value === view.mode));
      button.classList.toggle("is-active", button.dataset.value === view.mode);
    });
    elements.creative.hidden = !view.creativeVisible;
    elements.classic.hidden = !view.classicVisible;
  }

  function syncConsole() {
    root.dataset.console = state.consoleOpen ? "open" : "closed";
    elements.filterConsole.setAttribute("aria-hidden", String(!state.consoleOpen));
    const toggle = query(".console-toggle");
    toggle.setAttribute("aria-expanded", String(state.consoleOpen));
    toggle.querySelector(".console-toggle-mark").textContent = state.consoleOpen ? "−" : "+";
  }

  function queryAll(selector) {
    return [...root.querySelectorAll(selector)];
  }

  function announce(message) {
    elements.live.textContent = "";
    host.requestAnimationFrame ? host.requestAnimationFrame(() => { elements.live.textContent = message; }) : (elements.live.textContent = message);
  }

  function focusGroup(id) {
    const group = data.groups.find((item) => item.id === id);
    if (!group) return;
    state.focusedId = id;
    renderAll();
    announce(`${labelForGroup(group)} focused. ${HEALTH_LABELS[group.health.band]} signal. Press Escape or Clear focus to return.`);
    const focusPanel = elements.focusPanel;
    if (focusPanel && !prefersReducedMotion && typeof focusPanel.scrollIntoView === "function") {
      focusPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function clearFocus() {
    if (!state.focusedId) return;
    state.focusedId = null;
    renderAll();
    announce("Group focus cleared. The current filter slice is restored.");
  }

  function resetAll() {
    state.filters = copyFilters();
    state.focusedId = null;
    renderAll();
    announce("Filters reset. Showing the whole fictional field.");
  }

  function setFilter(field, value, message) {
    state.filters[field] = value;
    state.focusedId = null;
    renderAll();
    announce(message || `${field} filter set to ${value}.`);
  }

  function renderAll() {
    normalizeFilters();
    const visible = filterGroups(data.groups, state.filters, state.focusedId);
    const summary = summarizeGroups(visible);
    renderHeader(visible, summary);
    renderFilters();
    renderSummary(visible, summary);
    renderSignal(visible, summary);
    renderFocus(visible);
    renderPlotboard(visible);
    renderPressure(visible);
    renderRhythm(visible);
    renderQueue(visible);
    renderClassic(visible, summary);
    syncMode();
    syncConsole();
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    if (action === "mode") {
      if (state.mode === target.dataset.value) return;
      state.mode = target.dataset.value;
      syncMode();
      renderAll();
      announce(`${state.mode === "creative" ? "Creative reading" : "Classic register"} selected.`);
      return;
    }
    if (action === "toggle-console") {
      state.consoleOpen = !state.consoleOpen;
      syncConsole();
      if (state.consoleOpen) query("#campus-filters button")?.focus();
      return;
    }
    if (action === "close-console") {
      state.consoleOpen = false;
      syncConsole();
      query(".console-toggle")?.focus();
      return;
    }
    if (action === "reset") {
      resetAll();
      return;
    }
    if (action === "clear-focus") {
      clearFocus();
      return;
    }
    if (action === "focus-group") {
      focusGroup(target.dataset.value);
      return;
    }
    if (action === "filter") {
      const field = target.dataset.filter;
      const value = state.filters[field] === target.dataset.value ? "all" : target.dataset.value;
      setFilter(field, value, `${field} filter updated. ${value === "all" ? "Showing all values." : `Showing ${target.textContent.trim()}.`}`);
      return;
    }
    if (action === "health-filter") {
      const value = state.filters.health === target.dataset.value ? "all" : target.dataset.value;
      setFilter("health", value, value === "all" ? "Health filter cleared." : `${HEALTH_LABELS[value]} groups selected.`);
      return;
    }
    if (action === "locality-filter") {
      const value = state.filters.locality === target.dataset.value ? "all" : target.dataset.value;
      setFilter("locality", value, value === "all" ? "Locality filter cleared." : `${labelForLocality(value)} selected.`);
      return;
    }
    if (action === "day-filter") {
      const value = state.filters.day === target.dataset.value ? "all" : target.dataset.value;
      setFilter("day", value, value === "all" ? "Day filter cleared." : `${value} groups selected.`);
    }
  });

  root.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-filter]");
    if (!select) return;
    const field = select.dataset.filter;
    setFilter(field, select.value, select.value === "all" ? `${field} filter cleared.` : `${select.value} selected.`);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.focusedId) {
      event.preventDefault();
      clearFocus();
      return;
    }
    const tick = event.target.closest(".field-tick");
    if (!tick) return;
    const ticks = queryAll(".field-tick");
    const index = Number(tick.dataset.index);
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(ticks.length - 1, index + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = ticks.length - 1;
    if (nextIndex !== index) {
      event.preventDefault();
      ticks[nextIndex].focus();
    }
  });

  renderAll();
  const isNarrow = typeof host.matchMedia === "function" && host.matchMedia("(max-width: 900px)").matches;
  state.consoleOpen = !isNarrow;
  syncConsole();
})(typeof window !== "undefined" ? window : globalThis);
