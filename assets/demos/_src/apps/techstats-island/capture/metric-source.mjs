import {
  KIDS_LEADERS_UNIQUE_START_DATE,
  METRIC_CATALOG,
  METRIC_GUID_BY_ISLAND_KEY,
  UNIQUE_VOLUNTEER_GUID,
} from "./metric-catalog.generated.mjs";

const CAMPUS_ENTITY_TYPE_ID = 67;
const SCHEDULE_ENTITY_TYPE_ID = 54;
const CORE_KEYS = METRIC_CATALOG.filter((metric) => metric.core).map((metric) => metric.key);

// Rock's OData endpoint rejects an "or" chain past roughly twenty terms on
// MetricValuePartitions (verified live: 16 ids OK, 20 rejected), so the value
// ids are never OR-chained at all -- the partitions ride inline on the value
// rows via $expand. $expand alone drops YValue from the projection, so every
// expanded read must also pass an explicit $select naming YValue.
const VALUE_SELECT = "Id,MetricId,MetricValueDateTime,YValue,Note,MetricValuePartitions";
const METRIC_VALUES_PAGE_SIZE = 500;
const PREVIEW_DISABLED_PREFIX = "__preview_disabled__:";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertMetricValuesNotTruncated(rows, queryLabel) {
  if (rows.length >= METRIC_VALUES_PAGE_SIZE) {
    throw new Error(`MetricValues response reached the page limit (${METRIC_VALUES_PAGE_SIZE}) for ${queryLabel}; refusing a potentially truncated result.`);
  }
}

function isoDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ""));
  return match ? match[1] : "";
}

function dateFromIso(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function shiftDate(value, days) {
  const date = dateFromIso(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reportDateFor(serviceDate) {
  return shiftDate(serviceDate, 1);
}

function serviceDateForRequestedDate(value) {
  const date = isoDate(value);
  const parsed = dateFromIso(date);
  if (!parsed) return "";
  return shiftDate(date, -parsed.getUTCDay());
}

// The current report is Manila's in-progress Sunday, irrespective of the
// visitor's browser timezone or whether anyone has entered a MetricValue yet.
export function currentManilaServiceDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const fields = Object.fromEntries(parts
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return serviceDateForRequestedDate(`${fields.year}-${fields.month}-${fields.day}`);
}

function valueOf(object, ...names) {
  if (!object || typeof object !== "object") return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(object, name)) return object[name];
  }
  return undefined;
}

function numericValue(row) {
  const candidate = valueOf(row, "YValue", "yValue", "Value", "value", "XValue", "xValue");
  if (candidate === null || candidate === undefined || String(candidate).trim() === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function queryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return query.toString();
}

async function getJson(fetchImpl, path, params = {}) {
  const query = queryString(params);
  const response = await fetchImpl(`/api/${path}${query ? `?${query}` : ""}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Metric source request failed (${response.status}).`);
  return response.json();
}

function orGuidFilter(guids) {
  return guids.map((guid) => `Guid eq guid'${guid}'`).join(" or ");
}

// Rock's OData layer also enforces a filter-expression node count limit of
// 100, which is stricter than the "or" chain limit below and applies to the
// whole expression. Verified live on prod: 9 MetricId terms plus 6 enumerated
// single-day windows is rejected with "The node count limit of '100' has been
// exceeded". So a multi-week window is expressed as one contiguous range, not
// as one window per Sunday.
function valuesFilter(metricIds, dates = [], range = null) {
  const metricFilter = metricIds.map((id) => `MetricId eq ${id}`).join(" or ");
  const dateFilters = range
    ? [`MetricValueDateTime ge datetime'${range.start}T00:00:00' and MetricValueDateTime lt datetime'${range.end}T00:00:00'`]
    : dates.filter(Boolean).map((date) =>
      `MetricValueDateTime ge datetime'${date}T00:00:00' and MetricValueDateTime lt datetime'${shiftDate(date, 1)}T00:00:00'`
    );
  return [`(${metricFilter})`, dateFilters.length ? `(${dateFilters.join(" or ")})` : ""].filter(Boolean).join(" and ");
}

function orFilter(field, values) {
  return values.map((value) => `${field} eq ${value}`).join(" or ");
}

// Rock rejects an "or" chain past roughly twenty terms (verified live on
// MetricValuePartitions and MetricPartitions alike: 16 OK, 20 rejected on
// one, 26 on the other), so id lists are split at a size that clears both.
const OR_CHAIN_LIMIT = 16;

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function loadPartitionRows(fetchImpl, ids) {
  const pages = await Promise.all(chunks(ids, OR_CHAIN_LIMIT).map((page) => getJson(fetchImpl, "MetricPartitions", {
    $filter: orFilter("Id", page),
    $select: "Id,Label,EntityTypeId",
    $top: String(page.length),
  })));
  return pages.flatMap((rows) => asArray(rows));
}

function partitionsOf(row) {
  return asArray(valueOf(row, "MetricValuePartitions", "metricValuePartitions"));
}

function partitionClassification(row, definitions, campusId) {
  const relations = partitionsOf(row);
  if (relations.length === 0) return { kind: "unpartitioned" };

  const classified = relations.map((relation) => ({
    relation,
    definition: definitions.get(Number(relation.MetricPartitionId)),
  }));
  const campus = classified.filter(({ definition }) =>
    definition && (Number(definition.EntityTypeId) === CAMPUS_ENTITY_TYPE_ID || String(definition.Label || "").toLowerCase() === "campus")
  );
  if (!campus.length || campus.some(({ relation }) => Number(relation.EntityId) !== Number(campusId))) {
    return { kind: "other-campus" };
  }

  const scheduleEntry = classified.find(({ definition }) =>
    definition && (Number(definition.EntityTypeId) === SCHEDULE_ENTITY_TYPE_ID || String(definition.Label || "").toLowerCase() === "schedule")
  );
  if (!scheduleEntry) return { kind: "campus" };
  const scheduleEntityId = Number(scheduleEntry.relation.EntityId);
  const hasSchedule = Number.isFinite(scheduleEntityId) && scheduleEntityId > 0;
  return { kind: "schedule", hasSchedule, scheduleEntityId: hasSchedule ? scheduleEntityId : null };
}

function aggregateDateDetails(rows, definitions, campusId, date) {
  const dated = rows.filter((row) => isoDate(valueOf(row, "MetricValueDateTime", "metricValueDateTime")) === date);
  const candidates = dated.map((row) => ({ row, kind: partitionClassification(row, definitions, campusId) }));
  const scheduled = candidates.filter((candidate) => candidate.kind.kind === "schedule");
  const campus = candidates.filter((candidate) => candidate.kind.kind === "campus");
  const unpartitioned = candidates.filter((candidate) => candidate.kind.kind === "unpartitioned");

  // A schedule-partitioned row with no EntityId is a whole-day rollup. When it
  // coexists with rows that DO carry a schedule EntityId, the rollup double-counts
  // the breakdown and is dropped. Multiple rows without schedule EntityIds are not
  // positively identifiable as disjoint line items: unique-count metrics such as
  // volunteers must not sum per-team rows that can overlap.
  const withSchedule = scheduled.filter((candidate) => candidate.kind.hasSchedule);
  const effectiveScheduled = withSchedule.length ? withSchedule : scheduled;
  const selected = effectiveScheduled.length ? effectiveScheduled : campus.length ? campus : unpartitioned;

  if (!selected.length) return { value: null, lower: null, upper: null, kind: "unavailable", scheduleCount: null };
  if (selected.length === 1) {
    const value = numericValue(selected[0].row);
    // scheduleCount only means something when this single row is itself
    // schedule-partitioned. A campus-wide or unpartitioned rollup row can be
    // the only observation for a date without that date having exactly one
    // service -- it just means nobody split the entry by schedule.
    const soleKind = selected[0].kind;
    const scheduleCount = soleKind.kind === "schedule" && soleKind.hasSchedule ? 1 : null;
    return { value, lower: value, upper: value, kind: "single-observation", scheduleCount };
  }
  if (effectiveScheduled.length) {
    const scheduleIds = new Set(effectiveScheduled.map(({ kind }) => kind.scheduleEntityId));
    if (scheduleIds.size !== effectiveScheduled.length) {
      return { value: null, lower: null, upper: null, kind: "overlapping-line-items", scheduleCount: null };
    }
    const values = effectiveScheduled.map(({ row }) => numericValue(row));
    if (!values.every((value) => value !== null)) {
      return { value: null, lower: null, upper: null, kind: "incomplete-service-sum", scheduleCount: null };
    }
    const upper = values.reduce((sum, value) => sum + value, 0);
    return {
      value: upper,
      lower: Math.max(...values),
      upper,
      kind: "service-sum",
      scheduleCount: scheduleIds.size,
    };
  }
  // Multiple campus-only or unpartitioned rows cannot be safely disambiguated.
  return { value: null, lower: null, upper: null, kind: "ambiguous-line-items", scheduleCount: null };
}

function aggregateDate(rows, definitions, campusId, date) {
  return aggregateDateDetails(rows, definitions, campusId, date).value;
}

// One request for the whole catalogue. Rock accepts this bounded Guid filter,
// so the previous per-metric fan-out is unnecessary.
async function loadDefinitions(fetchImpl) {
  const rows = asArray(await getJson(fetchImpl, "Metrics", {
    $filter: orGuidFilter(METRIC_CATALOG.map((metric) => metric.guid)),
    $select: "Id,Guid,Title",
    $top: String(METRIC_CATALOG.length),
  }));
  const byGuid = new Map(rows
    .filter((row) => row?.Id && row?.Guid)
    .map((row) => [String(row.Guid).toLowerCase(), row.Id]));
  return METRIC_CATALOG
    .map((metric) => {
      const id = byGuid.get(metric.guid.toLowerCase());
      return id ? { ...metric, id } : null;
    })
    .filter(Boolean);
}

// One request for every metric on every requested date, partitions included.
async function loadMetricRows(fetchImpl, definitions, dates, { expand = true, range = null } = {}) {
  if (!definitions.length) return [];
  const params = {
    $filter: valuesFilter(definitions.map((metric) => metric.id), dates, range),
    $orderby: "MetricValueDateTime desc, Id desc",
    $top: String(METRIC_VALUES_PAGE_SIZE),
  };
  if (expand) {
    params.$expand = "MetricValuePartitions";
    params.$select = VALUE_SELECT;
  } else {
    params.$select = "Id,MetricId,MetricValueDateTime,YValue";
  }
  const rows = asArray(await getJson(fetchImpl, "MetricValues", params));
  assertMetricValuesNotTruncated(rows, range ? "range read" : "date read");
  const byMetricId = new Map(definitions.map((metric) => [Number(metric.id), []]));
  for (const row of rows) {
    // Preview synchronization tombstones stale placeholder rows in Note
    // instead of deleting them. Production rows are never marked this way.
    if (String(valueOf(row, "Note", "note") || "").startsWith(PREVIEW_DISABLED_PREFIX)) continue;
    const bucket = byMetricId.get(Number(valueOf(row, "MetricId", "metricId")));
    if (bucket) bucket.push(row);
  }
  return definitions.map((metric) => ({ metric, rows: byMetricId.get(Number(metric.id)) || [] }));
}

// One request for the partition definitions referenced by the loaded rows.
async function loadPartitionDefinitions(fetchImpl, entries) {
  const ids = [...new Set(entries
    .flatMap(({ rows }) => rows)
    .flatMap((row) => partitionsOf(row))
    .map((relation) => Number(relation.MetricPartitionId))
    .filter((id) => Number.isFinite(id)))];
  if (!ids.length) return new Map();
  const rows = await loadPartitionRows(fetchImpl, ids);
  return new Map(rows.filter((row) => row?.Id).map((row) => [Number(row.Id), row]));
}

function latestCommonCoreDate(entries) {
  const datesByKey = new Map(entries.map(({ metric, rows }) => [
    metric.key,
    new Set(rows.map((row) => isoDate(valueOf(row, "MetricValueDateTime", "metricValueDateTime"))).filter(Boolean)),
  ]));
  const anchorDates = datesByKey.get(CORE_KEYS[0]) || new Set();
  const common = [...anchorDates].filter((date) =>
    CORE_KEYS.every((key) => datesByKey.get(key)?.has(date))
  );
  const sorted = common.sort();
  return sorted[sorted.length - 1] || "";
}

// A core metric is only ever read at the anchor Sunday: the anchor IS the
// latest Sunday all three core metrics reported, so a gap there is a real gap.
// Everything else reports on its own cadence -- CIW Chinese last reported
// 2026-07-12 and CIW Hands Raised 2026-08-16 against a 2026-08-30 anchor -- so
// tying them to the anchor blanked live observations that exist. They now walk
// back up to four Sundays and carry the date they actually came from, so the
// view can label it instead of implying it is this week's number. Past the
// window the metric is unavailable; nothing older is ever shown unlabelled.
const NON_CORE_LOOKBACK_DAYS = 28;

function lookbackServiceDates(serviceDate, days) {
  const dates = [];
  for (let offset = 0; offset <= days; offset += 7) {
    const date = shiftDate(serviceDate, -offset);
    if (date) dates.push(date);
  }
  return dates;
}

function resolveWithLookback(rows, partitionDefinitions, campusId, serviceDate) {
  const observed = [];
  for (const date of lookbackServiceDates(serviceDate, NON_CORE_LOOKBACK_DAYS)) {
    const value = aggregateDate(rows, partitionDefinitions, campusId, date);
    if (value !== null) observed.push({ date, value });
  }
  if (!observed.length) return { value: null, previous: null, asOf: "", previousDate: "" };
  const [current, earlier] = observed;
  return {
    value: current.value,
    previous: earlier ? earlier.value : null,
    asOf: current.date === serviceDate ? "" : current.date,
    previousDate: earlier?.date || "",
  };
}

function isDateBoundMetric(metric) {
  return metric.core || metric.key === "kids_leaders_unique";
}

function makeReport(entries, partitionDefinitions, campusId, serviceDate) {
  const previousDate = shiftDate(serviceDate, -7);
  const metrics = [];
  for (const { metric, rows } of entries) {
    const resolved = isDateBoundMetric(metric)
      ? {
        value: aggregateDate(rows, partitionDefinitions, campusId, serviceDate),
        previous: aggregateDate(rows, partitionDefinitions, campusId, previousDate),
        asOf: "",
        previousDate,
      }
      : resolveWithLookback(rows, partitionDefinitions, campusId, serviceDate);
    const dimensions = {};
    if (resolved.previous !== null) dimensions.prev = resolved.previous;
    if (resolved.previousDate && resolved.previous !== null) dimensions.prevDate = resolved.previousDate;
    if (resolved.asOf) dimensions.asOf = resolved.asOf;
    metrics.push({
      MetricKey: metric.key,
      MetricGuid: metric.guid,
      Value: resolved.value,
      Dimensions: dimensions,
    });
  }

  // Metric 74 is a sum of per-service Kids Leader headcounts. Before the
  // semantic cutover, one leader serving multiple services could appear more
  // than once. Keep that upper-bound point for continuity, but carry the
  // mathematically defensible range: at least the largest service, at most the
  // service sum. From the cutover onward, Metric 126 is the verified
  // person-deduplicated source and replaces Metric 74 in attendance.
  const kidsMetric = metrics.find((metric) => metric.MetricKey === "kids_leaders");
  const uniqueMetric = metrics.find((metric) => metric.MetricKey === "kids_leaders_unique");
  const kidsEntry = entries.find((entry) => entry.metric.key === "kids_leaders");
  const uniqueEntry = entries.find((entry) => entry.metric.key === "kids_leaders_unique");
  if (kidsMetric && kidsEntry) {
    if (serviceDate >= KIDS_LEADERS_UNIQUE_START_DATE && uniqueMetric?.Value !== null && uniqueEntry) {
      kidsMetric.Value = uniqueMetric.Value;
      kidsMetric.MetricGuid = uniqueMetric.MetricGuid;
      kidsMetric.Dimensions = { calculationKind: "verified-unique" };
      if (previousDate >= KIDS_LEADERS_UNIQUE_START_DATE) {
        const previous = aggregateDate(uniqueEntry.rows, partitionDefinitions, campusId, previousDate);
        if (previous !== null) {
          kidsMetric.Dimensions.prev = previous;
          kidsMetric.Dimensions.prevDate = previousDate;
        }
      }
    } else {
      const detail = aggregateDateDetails(kidsEntry.rows, partitionDefinitions, campusId, serviceDate);
      kidsMetric.Dimensions = {
        calculationKind: "reconstructed-service-sum",
        lowerBound: detail.lower,
        upperBound: detail.upper,
      };
    }
  }
  // #740: True Attendance's multiplier needs the number of services that
  // actually reported seated_adults this week, not Sunday Inputs Settings'
  // standing scheduleNames list (which keeps stale/deactivated schedule
  // names indefinitely -- see #740 for the MNL Crowne/Filoil incident this
  // fixes). Only set when the data itself is unambiguously schedule-partitioned;
  // otherwise downstream falls back to Settings.
  const seatedAdultsMetric = metrics.find((metric) => metric.MetricKey === "seated_adults");
  const seatedAdultsEntry = entries.find((entry) => entry.metric.key === "seated_adults");
  if (seatedAdultsMetric && seatedAdultsEntry) {
    const detail = aggregateDateDetails(seatedAdultsEntry.rows, partitionDefinitions, campusId, serviceDate);
    if (detail.scheduleCount !== null) {
      seatedAdultsMetric.Dimensions.scheduleCount = detail.scheduleCount;
    }
  }

  const publicMetrics = metrics.filter((metric) => metric.MetricKey !== "kids_leaders_unique");
  return {
    Report: {
      Campus: "MNL",
      ServiceDate: `${serviceDate}T00:00:00`,
      ReportDate: `${reportDateFor(serviceDate)}T00:00:00`,
      Status: "metric-backed",
      TemplateVersionId: 1,
    },
    Metrics: publicMetrics,
    Sections: [],
    Narratives: [],
    Media: [],
    Discrepancies: [],
  };
}

const SEATED_ADULTS_GUID = METRIC_GUID_BY_ISLAND_KEY.get("seated_adults");

// #740: True Attendance's multiplier needs the number of services that
// actually reported seated_adults for a SPECIFIC report date, independent of
// loadMetricBackedReport()'s full metric fan-out. That fan-out is skipped
// whenever a report's Metrics already carry canonical MetricGuid tags
// (techstats-boot.mjs's hasCanonicalMetrics(), true for essentially every
// report with real Rock-ingested data, published or not) -- so scheduleCount
// from makeReport() above never reaches those views at all. This is a
// deliberately minimal, single-metric/single-date read so every report view
// can get a correct serviceCount, not just the ones whose Metrics happen to
// need the full fan-out anyway.
export async function loadScheduleCountsForDates({ serviceDates = [], fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const dates = [...new Set(asArray(serviceDates).map(isoDate).filter(Boolean))].sort();
  if (!dates.length) return {};
  const [metricRows, campusRows] = await Promise.all([
    getJson(fetchImpl, "Metrics", { $filter: `Guid eq guid'${SEATED_ADULTS_GUID}'`, $select: "Id,Guid", $top: "1" }),
    getJson(fetchImpl, "Campuses", { $filter: "ShortCode eq 'MNL'", $select: "Id,ShortCode", $top: "1" }),
  ]);
  const metricId = asArray(metricRows)[0]?.Id;
  const campusId = asArray(campusRows)[0]?.Id;
  if (!metricId || !campusId) return Object.fromEntries(dates.map((date) => [date, null]));
  const rows = asArray(await getJson(fetchImpl, "MetricValues", {
    $filter: valuesFilter([metricId], [], {
      start: dates[0],
      end: shiftDate(dates[dates.length - 1], 1),
    }),
    $expand: "MetricValuePartitions",
    $select: VALUE_SELECT,
    $top: String(METRIC_VALUES_PAGE_SIZE),
  }));
  assertMetricValuesNotTruncated(rows, "historical schedule-count range");
  const partitionDefinitions = await loadPartitionDefinitions(fetchImpl, [{ rows }]);
  return Object.fromEntries(dates.map((date) => [
    date,
    aggregateDateDetails(rows, partitionDefinitions, campusId, date).scheduleCount,
  ]));
}

export async function loadScheduleCountForDate({ serviceDate = "", fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  if (!serviceDate) return null;
  const counts = await loadScheduleCountsForDates({ serviceDates: [serviceDate], fetchImpl });
  return counts[isoDate(serviceDate)] ?? null;
}

export async function loadMetricBackedReport({ requestedDate = "", allowEmpty = false, metricKeys = null, fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const allDefinitions = await loadDefinitions(fetchImpl);
  const definitions = Array.isArray(metricKeys)
    ? allDefinitions.filter((metric) => metricKeys.includes(metric.key))
    : allDefinitions;
  if (!definitions.length) return null;

  // The seed read only has to answer "which is the latest complete Sunday",
  // so it is limited to the core definitions and skipped entirely when the
  // caller already named a date.
  let serviceDate = serviceDateForRequestedDate(requestedDate);
  if (!serviceDate) {
    const coreDefinitions = definitions.filter((metric) => metric.core);
    const seedRows = await loadMetricRows(fetchImpl, coreDefinitions, [], { expand: false });
    serviceDate = latestCommonCoreDate(seedRows);
  }
  if (!serviceDate) return null;

  // Two reads, because the windows differ and a single filter covering both
  // exceeds Rock's OData node count limit (see valuesFilter).
  const dates = [serviceDate, shiftDate(serviceDate, -7)];
  const coreDefinitions = definitions.filter((metric) => isDateBoundMetric(metric));
  const nonCoreDefinitions = definitions.filter((metric) => !isDateBoundMetric(metric));
  const lookbackWindow = {
    start: shiftDate(serviceDate, -NON_CORE_LOOKBACK_DAYS),
    end: shiftDate(serviceDate, 1),
  };
  const [coreEntries, nonCoreEntries, campusRows] = await Promise.all([
    loadMetricRows(fetchImpl, coreDefinitions, dates),
    loadMetricRows(fetchImpl, nonCoreDefinitions, [], { range: lookbackWindow }),
    getJson(fetchImpl, "Campuses", { $filter: "ShortCode eq 'MNL'", $select: "Id,ShortCode", $top: "1" }),
  ]);
  // Keep catalog order so the report's metric order does not depend on which
  // read a metric came from.
  const rowsByKey = new Map([...coreEntries, ...nonCoreEntries].map((entry) => [entry.metric.key, entry]));
  const entries = definitions.map((metric) => rowsByKey.get(metric.key) || { metric, rows: [] });
  const campus = asArray(campusRows)[0];
  if (!campus?.Id) return null;

  const partitionDefinitions = await loadPartitionDefinitions(fetchImpl, entries);
  const report = makeReport(entries, partitionDefinitions, campus.Id, serviceDate);
  const currentCount = report.Metrics.filter((metric) => metric.Value !== null).length;
  return currentCount || allowEmpty ? report : null;
}

const HISTORY_YEARS = 4;

export async function loadVolunteerHistory({ serviceDate = "", fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  try {
    const endYear = Number(String(serviceDate || "").slice(0, 4)) || new Date().getFullYear();
    const startYear = endYear - (HISTORY_YEARS - 1);
    const defs = asArray(await getJson(fetchImpl, "Metrics", {
      $filter: `Guid eq guid'${UNIQUE_VOLUNTEER_GUID}'`,
      $select: "Id,Guid",
      $top: "1",
    }));
    const metricId = defs[0]?.Id;
    if (!metricId) return [];

    // Metric 124 has one row per team in historical weeks. Fetch a quarter at
    // a time so a four-year history never truncates at Rock's OData row limit.
    const windows = [];
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 3) {
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const nextYear = month === 10 ? year + 1 : year;
        const nextMonth = month === 10 ? 1 : month + 3;
        const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
        windows.push([start, end]);
      }
    }
    const responses = await Promise.all(windows.map(async ([start, end]) => {
      const rows = asArray(await getJson(fetchImpl, "MetricValues", {
        $filter: `MetricId eq ${metricId} and MetricValueDateTime ge datetime'${start}T00:00:00' and MetricValueDateTime lt datetime'${end}T00:00:00'`,
        $select: "Id,MetricValueDateTime,YValue,Note",
        $orderby: "MetricValueDateTime asc, Id asc",
        $top: String(METRIC_VALUES_PAGE_SIZE),
      }));
      assertMetricValuesNotTruncated(rows, `history window ${start}–${end}`);
      return rows;
    }));

    // Older weeks are stored as one Metric 124 row per serving team; newer
    // weeks have a single unpartitioned unique-volunteer rollup. Use the rollup
    // when present. A team-only week is unavailable because those unique counts
    // can overlap; the Note is only a signal that identifies those rows.
    const byDate = new Map();
    for (const row of responses.flatMap(asArray)) {
      if (String(valueOf(row, "Note", "note") || "").startsWith(PREVIEW_DISABLED_PREFIX)) continue;
      const date = isoDate(valueOf(row, "MetricValueDateTime", "metricValueDateTime"));
      const value = numericValue(row);
      if (!date || value === null) continue;
      const point = byDate.get(date) || { teamValues: [], rollupTotal: null };
      if (String(valueOf(row, "Note", "note") || "").startsWith("team=")) {
        point.teamValues.push(value);
      } else {
        point.rollupTotal = (point.rollupTotal || 0) + value;
      }
      byDate.set(date, point);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([Date, point]) => {
        if (point.rollupTotal !== null) {
          return {
            Date,
            Value: point.rollupTotal,
            LowerBound: point.rollupTotal,
            UpperBound: point.rollupTotal,
            CalculationKind: "verified-rollup",
          };
        }
        if (!point.teamValues.length) {
          return { Date, Value: null, LowerBound: null, UpperBound: null, CalculationKind: "unavailable" };
        }
        const upper = point.teamValues.reduce((sum, value) => sum + value, 0);
        return {
          Date,
          Value: upper,
          LowerBound: Math.max(...point.teamValues),
          UpperBound: upper,
          CalculationKind: "reconstructed-team-sum",
        };
      });
  } catch (error) {
    console.error("TechStats volunteer history read failed:", error);
    return [];
  }
}

export function serviceDateForMetricRequest(value) {
  return serviceDateForRequestedDate(value);
}

// `?date=` parity for the live signups fetch: no date requested loads (the
// root view), and an explicit `?date=` loads too but only when it resolves
// to the same Sunday the no-date URL would load -- an older Sunday must not
// show live-in-progress signup counts. `now` is injectable so this is
// testable without depending on the real clock.
export function shouldLoadLiveSignupsForDate(requestedDate, now = new Date()) {
  if (!requestedDate) return true;
  const requestedSunday = serviceDateForRequestedDate(requestedDate);
  const currentSunday = currentManilaServiceDate(now);
  return Boolean(requestedSunday) && requestedSunday === currentSunday;
}

export const metricCatalog = METRIC_CATALOG;
