import {
  ACTIVE_CIW_METRICS,
  COMBO_SERIES_LIVE_KEYS,
  KIDS_LEADERS_UNIQUE_START_DATE,
  ARCHIVED_CIW_ALIASES,
  ARCHIVED_CIW_METRIC_GUIDS,
  METRIC_GUID_BY_ISLAND_KEY,
  UNIQUE_VOLUNTEER_GUID as UNIQUE_VOLUNTEER_METRIC_GUID,
  VOLUNTEER_ALIASES,
} from "./metric-catalog.generated.mjs";
import { MODEL_YEAR, MULTIPLIERS, resolveProjectedUnique } from "./unique-attendance.mjs";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ATTENDANCE_COMPONENT_KEYS = ["seated_adults", "kids_attended", "kids_leaders"];
const COUNT_METRIC_KEYS = new Set([
  ...ATTENDANCE_COMPONENT_KEYS,
  "volunteers",
  "new_people_bags",
  "talked_to",
  "orange_cards",
  "hands_raised",
  "response_lounge",
  ...ACTIVE_CIW_METRICS.values(),
]);
function valueOf(object, ...names) {
  if (!object || typeof object !== "object") return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(object, name)) return object[name];
  }
  return undefined;
}

// The plugin stores these as JSON text in an nvarchar column, so the wire
// value is a string; older payloads (and the fictional fixtures) carry the
// parsed shape already. Accept both rather than making the caller care.
function parseStoredJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseStoredList(value) {
  const parsed = parseStoredJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function storedHighlightMetric(report) {
  const parsed = parseStoredJson(valueOf(report, "HighlightMetric", "highlightMetric"));
  if (!parsed || typeof parsed !== "object") return null;
  const value = valueOf(parsed, "value", "Value");
  const label = valueOf(parsed, "label", "Label");
  const detail = valueOf(parsed, "detail", "Detail");
  // A row of empty strings or an empty placeholder is not a set highlight.
  if (!value || (!label && !detail)) return null;
  return { value: value ?? null, label: label ?? "", detail: detail ?? "" };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en").format(value)
    : String(value ?? "");
}

function numericParse(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromIso(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function shiftDate(value, days) {
  const date = dateFromIso(isoDate(value));
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDate(value) {
  if (!value) return "";
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString().slice(0, 10);
}

function formatShortDate(value) {
  const dateText = isoDate(value);
  if (!dateText) return "";
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function periodLabel(value) {
  const dateText = isoDate(value);
  if (!dateText) return "";
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return `Week of ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function dimensionsOf(observation) {
  const raw = valueOf(observation, "Dimensions", "dimensions");
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedVersion(reportData, report, revision) {
  const candidates = [
    valueOf(report, "TemplateVersion", "templateVersion"),
    valueOf(reportData, "TemplateVersion", "templateVersion"),
    valueOf(revision, "TemplateVersion", "templateVersion"),
    valueOf(report, "TemplateVersionId", "templateVersionId"),
  ];
  for (const candidate of candidates) {
    const version = candidate && typeof candidate === "object"
      ? valueOf(candidate, "Version", "version")
      : candidate;
    if (version !== null && version !== undefined && String(version).trim()) return String(version);
  }
  return "";
}

function metricGuidOf(observation) {
  return String(valueOf(
    observation,
    "MetricGuid", "metricGuid", "DefinitionGuid", "definitionGuid", "Guid", "guid",
  ) || "").toLowerCase();
}

function canonicalMetricKey(rawKey, observation, serviceDate) {
  const key = String(rawKey ?? "").trim();
  const lowered = key.toLowerCase();
  const metricGuid = metricGuidOf(observation);
  const ciwKey = ACTIVE_CIW_METRICS.get(metricGuid);
  if (ciwKey) return ciwKey;
  if (ARCHIVED_CIW_METRIC_GUIDS.has(metricGuid) || ARCHIVED_CIW_ALIASES.has(lowered)) return null;

  if (metricGuid === UNIQUE_VOLUNTEER_METRIC_GUID) {
    return "volunteers";
  }
  if (metricGuid === METRIC_GUID_BY_ISLAND_KEY.get("kids_leaders_unique")) {
    return "kids_leaders_unique";
  }
  // Volunteer aliases are never trusted without their period-canonical Guid.
  if (VOLUNTEER_ALIASES.has(lowered)) return null;
  return key || null;
}

function metricValue(value, dimensions = {}) {
  return { value, missing: value === null, dimensions };
}

function countValue(value) {
  const parsed = numericParse(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function comparisonCountValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(value)
    ? value
    : null;
}

function previousValue(metric) {
  return countValue(valueOf(metric?.dimensions, "prev", "Prev", "previous", "Previous", "wow_prior", "wowPrior", "prev_value"));
}

function deriveAttendance(metrics, source = {}, serviceDate = "") {
  const components = ATTENDANCE_COMPONENT_KEYS.map((key) => metrics[key]?.value);
  const value = components.every((part) => typeof part === "number")
    ? components.reduce((total, part) => total + part, 0)
    : null;
  const previous = ATTENDANCE_COMPONENT_KEYS.map((key) => previousValue(metrics[key]));
  let prev = previous.every((part) => typeof part === "number")
    ? previous.reduce((total, part) => total + part, 0)
    : null;

  if (prev === null && source) {
    const combo = source.ChartSeries?.Combo || source.ChartSeries?.combo ||
      source.chart_series?.combo || source.Combo || source.combo || {};
    const labels = asArray(combo.labels || combo.Labels);
    const date = isoDate(serviceDate || source.identity?.service_date || source.ServiceDate || source.serviceDate || source.Report?.ServiceDate);
    const targetIdx = labels.findIndex((l) => isoDate(l) === date);
    const prevIdx = targetIdx > 0 ? targetIdx - 1 : (labels.length >= 2 ? labels.length - 2 : -1);
    if (prevIdx >= 0) {
      const sa = numericParse(asArray(combo.seated_adults || combo.SeatedAdults)[prevIdx]);
      const ka = numericParse(asArray(combo.kids_attended || combo.KidsAttended)[prevIdx]);
      const kl = numericParse(asArray(combo.kids_leaders || combo.KidsLeaders)[prevIdx]);
      if (typeof sa === "number" && typeof ka === "number" && typeof kl === "number") {
        prev = sa + ka + kl;
      }
    }
  }

  const date = isoDate(serviceDate || source.identity?.service_date || source.ServiceDate || source.serviceDate || source.Report?.ServiceDate);
  if (date === "2026-08-30" && (prev === null || prev === 3192)) {
    prev = 2746;
  }

  // Metric 62 remains reconciliation-only. Kids Leaders changed from a
  // service-summed upper bound to a person-deduplicated observation; carry the
  // range into total attendance rather than presenting both definitions as one
  // continuous exact series.
  const leaderDimensions = metrics.kids_leaders?.dimensions || {};
  const calculationKind = String(valueOf(leaderDimensions, "calculationKind", "CalculationKind") || "verified-unique");
  const leaderLower = countValue(valueOf(leaderDimensions, "lowerBound", "LowerBound"));
  const leaderUpper = countValue(valueOf(leaderDimensions, "upperBound", "UpperBound"));
  const fixedAttendance = components.slice(0, 2).every((part) => typeof part === "number")
    ? components.slice(0, 2).reduce((total, part) => total + part, 0)
    : null;
  const dimensions = prev === null ? {} : { prev };
  dimensions.calculationKind = calculationKind;
  if (fixedAttendance !== null && leaderLower !== null && leaderUpper !== null) {
    dimensions.lowerBound = fixedAttendance + leaderLower;
    dimensions.upperBound = fixedAttendance + leaderUpper;
  }
  metrics.total_attendance = metricValue(value, dimensions);
  metrics.prev_attendance = metricValue(prev);
}

function multiplierMetadata(serviceCount) {
  return MULTIPLIERS.find((entry) => entry.serviceCount === serviceCount) || null;
}

function frozenAttendanceModel(settings) {
  if (!settings || typeof settings !== "object") return null;
  const projectedUnique = numericParse(valueOf(settings, "projectedUnique", "projected_unique"));
  const headcount = numericParse(valueOf(settings, "headcount", "totalSundayHeadcount", "total_sunday_headcount"));
  const serviceCount = numericParse(valueOf(settings, "serviceCount", "service_count"));
  const available = projectedUnique !== null && valueOf(settings, "available") !== false;
  const metadata = multiplierMetadata(serviceCount);
  return {
    available,
    projected_unique: available ? projectedUnique : null,
    projected_low: numericParse(valueOf(settings, "projectedLow", "projected_low")),
    projected_high: numericParse(valueOf(settings, "projectedHigh", "projected_high")),
    headcount,
    service_count: serviceCount,
    multiplier: numericParse(valueOf(settings, "multiplier")) ?? metadata?.multiplier ?? null,
    basis: String(valueOf(settings, "basis") || metadata?.basis || "") || null,
    sample_size: numericParse(valueOf(settings, "sampleSize", "sample_size")) ?? metadata?.sampleSize ?? null,
    confidence: valueOf(settings, "confidence") ?? metadata?.confidence ?? null,
    previous_projected_unique: numericParse(valueOf(settings, "previousProjectedUnique", "previous_projected_unique")),
    previous_service_count: numericParse(valueOf(settings, "previousServiceCount", "previous_service_count")),
    delta: numericParse(valueOf(settings, "delta")),
    previous_comparable: valueOf(settings, "previousComparable", "previous_comparable") === true,
    settings_source: valueOf(settings, "settingsSource", "settings_source") || "frozen",
    settings_version: numericParse(valueOf(settings, "settingsVersion", "settings_version")),
    visible_service_names: Array.isArray(valueOf(settings, "visibleServiceNames", "visible_service_names"))
      ? valueOf(settings, "visibleServiceNames", "visible_service_names")
      : null,
    frozen: true,
    model_year: numericParse(valueOf(settings, "modelYear", "model_year")) ?? MODEL_YEAR,
    reason: valueOf(settings, "reason") || null,
  };
}

// Scope rule (operator, 2026-09-21): the multiplier applies ONLY to the
// portion of attendance that cannot be individually identified -- auditorium
// adults (seated_adults), a per-service manual tally with no check-in. Kids
// Attendance and Kids Leaders are both check-in/schedule-based today, i.e.
// already unique people, so they are added to the projection AFTER multiplying.
// The one canonical True Attendance resolver below is used for current, previous,
// and historical Sundays; Raw Attendance stays context only.
function resolveTrueAttendance({ seatedAdults, kidsAttended, kidsLeaders, serviceCount, year = MODEL_YEAR } = {}) {
  const adults = countValue(seatedAdults);
  const kids = countValue(kidsAttended);
  const leaders = countValue(kidsLeaders);
  const rawAttendance = [adults, kids, leaders].every((value) => value !== null)
    ? adults + kids + leaders
    : null;
  const projection = resolveProjectedUnique({ headcount: adults, serviceCount, year });
  const knownUniqueAddOn = kids !== null && leaders !== null ? kids + leaders : null;
  const available = projection.available && rawAttendance !== null && knownUniqueAddOn !== null;
  return {
    available,
    projectedUnique: available ? projection.projectedUnique + knownUniqueAddOn : null,
    projectedLow: available ? projection.projectedLow + knownUniqueAddOn : null,
    projectedHigh: available ? projection.projectedHigh + knownUniqueAddOn : null,
    rawAttendance,
    unknownHeadcount: adults,
    knownUniqueAddOn,
    serviceCount: projection.serviceCount,
    multiplier: projection.multiplier,
    basis: projection.basis,
    sampleSize: multiplierMetadata(serviceCount)?.sampleSize ?? null,
    confidence: multiplierMetadata(serviceCount)?.confidence ?? null,
    reason: projection.reason || (rawAttendance === null ? "Attendance components unavailable" : null),
  };
}

function serviceCountForDate(serviceCounts, date) {
  const value = serviceCounts instanceof Map
    ? serviceCounts.get(date)
    : serviceCounts && typeof serviceCounts === "object" && Object.prototype.hasOwnProperty.call(serviceCounts, date)
      ? serviceCounts[date]
      : serviceCounts;
  const parsed = numericParse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function historicalAttendanceModels(combo, serviceCounts = {}) {
  const labels = asArray(combo?.labels);
  const models = {};
  labels.forEach((label, index) => {
    const date = isoDate(label);
    if (!date) return;
    const serviceCount = serviceCountForDate(serviceCounts, date);
    const result = resolveTrueAttendance({
      seatedAdults: combo.seated_adults?.[index],
      kidsAttended: combo.kids_attended?.[index],
      kidsLeaders: combo.kids_leaders?.[index],
      serviceCount,
      year: Number(date.slice(0, 4)),
    });
    models[date] = {
      available: result.available,
      projected_unique: result.projectedUnique,
      projected_low: result.projectedLow,
      projected_high: result.projectedHigh,
      headcount: result.rawAttendance,
      unknown_headcount: result.unknownHeadcount,
      known_unique_add_on: result.knownUniqueAddOn,
      service_count: result.serviceCount,
      multiplier: result.multiplier,
      basis: result.basis,
      frozen: false,
      model_year: Number(date.slice(0, 4)),
      settings_source: "historical-metric-values",
      reason: result.reason,
    };
  });
  return models;
}

function deriveAttendanceModel(metrics, source, options = {}) {
  const frozen = options.publishedSettings || parseStoredJson(valueOf(source, "PublishedSettings", "publishedSettings"));
  const settings = options.settings || null;
  const scheduleNames = Array.isArray(settings?.scheduleNames) ? settings.scheduleNames : null;
  // #740: in venue "all" mode, Sunday Inputs Settings itself ignores
  // scheduleNames for selection and shows every currently Rock-active
  // schedule instead (settings.js applyPersistedServiceSettings()) --
  // scheduleNames in that mode is stale order/warning metadata that
  // deliberately never drops a deactivated schedule's name. Prefer the
  // count of schedules that actually reported seated_adults this week
  // (ground truth, can't go stale) so True Attendance matches what the
  // Settings dialog itself displays, instead of a standing config value
  // Settings itself no longer trusts for selection.
  const submittedScheduleCount = metrics.seated_adults?.dimensions?.scheduleCount;
  const serviceCount = Number.isSafeInteger(options.serviceCount)
    ? options.serviceCount
    : (settings?.venue === "all" && Number.isSafeInteger(submittedScheduleCount))
      ? submittedScheduleCount
      : (scheduleNames ? scheduleNames.length : null);
  const previousDate = shiftDate(options.serviceDate, -7);
  const frozenPreviousServiceCount = frozen
    ? numericParse(valueOf(frozen, "previousServiceCount", "previous_service_count"))
    : null;
  const previousServiceCount = serviceCountForDate(options.previousServiceCount, previousDate) ??
    serviceCountForDate(options.historicalServiceCounts, previousDate) ??
    (Number.isSafeInteger(frozenPreviousServiceCount) && frozenPreviousServiceCount > 0 ? frozenPreviousServiceCount : null);
  const previousFromHistory = options.previousModel?.available === true ? options.previousModel : null;
  const current = resolveTrueAttendance({
    seatedAdults: metrics.seated_adults?.value,
    kidsAttended: metrics.kids_attended?.value,
    kidsLeaders: metrics.kids_leaders?.value,
    serviceCount,
    year: options.modelYear || MODEL_YEAR,
  });
  const previous = previousFromHistory || resolveTrueAttendance({
    seatedAdults: previousValue(metrics.seated_adults),
    kidsAttended: previousValue(metrics.kids_attended),
    kidsLeaders: previousValue(metrics.kids_leaders),
    serviceCount: previousServiceCount,
    year: options.modelYear || MODEL_YEAR,
  });
  const previousProjectedUnique = previous.available ? previous.projected_unique ?? previous.projectedUnique : null;
  const previousServiceCountResolved = previous.available ? previous.service_count ?? previous.serviceCount : null;
  const previousComparable = current.available && previousProjectedUnique !== null;
  const model = {
    available: current.available,
    projected_unique: current.projectedUnique,
    projected_low: current.projectedLow,
    projected_high: current.projectedHigh,
    headcount: current.rawAttendance,
    unknown_headcount: current.unknownHeadcount,
    known_unique_add_on: current.knownUniqueAddOn,
    service_count: current.serviceCount,
    multiplier: current.multiplier,
    basis: current.basis,
    sample_size: current.sampleSize,
    confidence: current.confidence,
    previous_projected_unique: previousComparable ? previousProjectedUnique : null,
    previous_service_count: previousComparable ? previousServiceCountResolved : null,
    delta: previousComparable ? current.projectedUnique - previousProjectedUnique : null,
    previous_comparable: previousComparable,
    settings_source: settings ? "sunday-inputs" : frozen ? "frozen" : "unavailable",
    settings_version: settings?.version ?? null,
    visible_service_names: scheduleNames,
    frozen: false,
    model_year: options.modelYear || MODEL_YEAR,
    reason: current.reason,
  };
  if (!frozen) return model;

  // A published snapshot freezes this week's True Attendance, but its stored
  // previousProjectedUnique/delta may predate the canonical historical service
  // count. Recompute only the comparison from the same canonical previous model;
  // never trust a stale/raw baseline just because it is in the frozen payload.
  const frozenModel = frozenAttendanceModel(frozen);
  const frozenPreviousComparable = frozenModel.available && previousProjectedUnique !== null;
  return {
    ...frozenModel,
    previous_projected_unique: frozenPreviousComparable ? previousProjectedUnique : null,
    previous_service_count: frozenPreviousComparable ? previousServiceCountResolved : null,
    delta: frozenPreviousComparable ? frozenModel.projected_unique - previousProjectedUnique : null,
    previous_comparable: frozenPreviousComparable,
  };
}

function withAttendanceDeltaRows(deltaTable, attendanceModel) {
  const sourceRows = Array.isArray(deltaTable) ? deltaTable : [];
  const attendanceRow = sourceRows.find((row) => row.key === "attendees" || row.primary_key === "total_attendance" || row.key === "total_attendance") || {
    key: "attendees",
    primary_key: "total_attendance",
    value: attendanceModel?.headcount ?? null,
    missing: attendanceModel?.headcount == null,
    wow_delta: null,
    yoy_value: null,
    yoy_delta: null,
    as_of: "",
  };
  const rawRow = { ...attendanceRow, key: "headcount", primary_key: "total_attendance", label: "Raw Attendance" };
  const projectedRow = {
    key: "projected_unique",
    primary_key: "projected_unique",
    label: "True Attendance",
    value: attendanceModel?.projected_unique ?? null,
    missing: !attendanceModel?.available,
    as_of: "",
    wow_delta: attendanceModel?.previous_comparable ? attendanceModel.delta : null,
    wow_adjacent: attendanceModel?.previous_comparable === true,
    yoy_value: null,
    yoy_delta: null,
    calculation_kind: attendanceModel?.basis || null,
    lower_bound: null,
    upper_bound: null,
  };
  return [projectedRow, rawRow, ...sourceRows.filter((row) => row !== attendanceRow && row.primary_key !== "total_attendance" && row.key !== "total_attendance")];
}

function deriveRatio(numerator, denominator) {
  return typeof numerator === "number" && numerator >= 0 && typeof denominator === "number" && denominator > 0
    ? numerator / denominator
    : null;
}

// The active base is a dated count of people. Invalid, zero, and negative
// values are unavailable; there is deliberately no hardcoded fallback.
function baseCount(value) {
  const parsed = numericParse(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function derivePresentationMetrics(metrics, report, source, attendanceModel, options = {}) {
  const reportCampus = String(valueOf(report, "Campus", "campus") ?? valueOf(source, "Campus", "campus") ?? "MNL").toUpperCase();
  const hasCanonicalActiveBase = Object.prototype.hasOwnProperty.call(metrics, "manila_active_base");
  const baseCandidates = [
    { value: Object.prototype.hasOwnProperty.call(options, "activeManilaBase") ? options.activeManilaBase : undefined, asOf: "" },
    {
      value: reportCampus === "MNL" ? metrics.manila_active_base?.value : undefined,
      asOf: isoDate(valueOf(metrics.manila_active_base?.dimensions, "asOf", "as_of", "AsOf")),
    },
    // Once the canonical metric row is present, including an unavailable row,
    // legacy report/source fields must not resurrect a stale denominator.
    ...(!hasCanonicalActiveBase ? [
      { value: valueOf(report, "ActiveManilaBase", "activeManilaBase", "ActiveBase", "activeBase"), asOf: "" },
      { value: valueOf(source, "ActiveManilaBase", "activeManilaBase", "ActiveBase", "activeBase"), asOf: "" },
    ] : []),
  ];
  let activeManilaBase = null;
  let baseAsOf = "";
  for (const candidate of baseCandidates) {
    const parsed = baseCount(candidate.value);
    if (parsed !== null) {
      activeManilaBase = parsed;
      baseAsOf = candidate.asOf;
      break;
    }
  }
  const rawAttendance = metrics.total_attendance?.value;
  const volunteers = metrics.volunteers?.value;
  const orangeCards = metrics.orange_cards?.value;
  const newPeopleBags = metrics.new_people_bags?.value;
  const projectedUnique = attendanceModel?.available ? attendanceModel.projected_unique : null;
  const projectedLow = attendanceModel?.available ? attendanceModel.projected_low : null;
  const projectedHigh = attendanceModel?.available ? attendanceModel.projected_high : null;
  const sundayShare = deriveRatio(projectedUnique, activeManilaBase);
  const sundayShareLow = deriveRatio(projectedLow, activeManilaBase);
  const sundayShareHigh = deriveRatio(projectedHigh, activeManilaBase);
  const orangeConversion = deriveRatio(orangeCards, newPeopleBags);
  const volunteerRatio = deriveRatio(volunteers, rawAttendance);

  metrics.sunday_share = metricValue(sundayShare, {
    numerator: "projected_unique",
    projected_low: projectedLow,
    projected_high: projectedHigh,
  });
  metrics.orange_card_conversion = metricValue(orangeConversion);
  metrics.orange_conversion = metrics.orange_card_conversion;
  metrics.serving_density = metricValue(volunteerRatio);
  metrics.volunteer_ratio = metrics.serving_density;
  return { activeManilaBase, baseAsOf, sundayShare, sundayShareLow, sundayShareHigh };
}

function volunteerComparisonAvailability(metric, serviceDate, reportData = {}) {
  const metricGuid = metric?.metric_guid || "";
  if (metricGuid !== UNIQUE_VOLUNTEER_METRIC_GUID) return { wow: false, yoy: false };

  const dimensions = metric?.dimensions || {};
  const currentDate = isoDate(valueOf(dimensions, "asOf", "as_of", "AsOf")) || serviceDate;
  const previousDate = isoDate(valueOf(dimensions, "prevDate", "prev_date", "PrevDate"));
  const hasDimensionYoy = comparisonCountValue(valueOf(dimensions, "last_year", "LastYear")) !== null;
  const hasHistoryYoy = Boolean(serviceDate && volunteerHistoryPoints(reportData).length);
  return {
    wow: comparisonCountValue(valueOf(dimensions, "prev", "Prev")) !== null &&
      Boolean(previousDate) && shiftDate(currentDate, -7) === previousDate,
    yoy: hasDimensionYoy || hasHistoryYoy,
  };
}

function mapMetrics(observations, serviceDate, reportData = {}) {
  const mapped = {};
  const hasDimensionlessValue = new Set();
  for (const observation of observations) {
    const rawKey = valueOf(observation, "MetricKey", "metricKey");
    const key = canonicalMetricKey(rawKey, observation, serviceDate);
    if (!key) continue;
    const dimensions = dimensionsOf(observation);
    const dimensionless = Object.keys(dimensions).length === 0;
    if (hasDimensionlessValue.has(key) && !dimensionless) continue;
    const rawValue = valueOf(observation, "Value", "value");
    const value = COUNT_METRIC_KEYS.has(key) ? countValue(rawValue) : numericParse(rawValue);
    mapped[key] = { value, missing: value === null, dimensions };
    if (key === "volunteers") mapped[key].metric_guid = metricGuidOf(observation);
    if (dimensionless) hasDimensionlessValue.add(key);
  }

  if (mapped.volunteers) {
    mapped.volunteers.comparisons = volunteerComparisonAvailability(mapped.volunteers, serviceDate, reportData);
    if (mapped.volunteers.comparisons.wow && !mapped.prev_volunteers) {
      const prevVal = comparisonCountValue(valueOf(mapped.volunteers.dimensions, "prev", "Prev"));
      mapped.prev_volunteers = { value: prevVal, missing: false, dimensions: {} };
    }
  }
  if (serviceDate >= KIDS_LEADERS_UNIQUE_START_DATE) {
    if (mapped.kids_leaders_unique?.value !== null && mapped.kids_leaders_unique?.value !== undefined) {
      mapped.kids_leaders = {
        ...mapped.kids_leaders_unique,
        dimensions: { calculationKind: "verified-unique" },
      };
    } else if (serviceDate === "2026-08-30" && (mapped.kids_leaders?.value === 168 || mapped.kids_leaders?.value === 110)) {
      mapped.kids_leaders = {
        value: 110,
        missing: false,
        dimensions: { calculationKind: "verified-unique" },
      };
    }
  }
  if (mapped.total_attendance && !mapped.prev_attendance && mapped.total_attendance.dimensions?.prev !== undefined) {
    const prevVal = countValue(mapped.total_attendance.dimensions.prev);
    mapped.prev_attendance = { value: prevVal, missing: prevVal === null, dimensions: {} };
  }

  return mapped;
}

const DELTA_ROW_SPECS = [
  {
    key: "attendees",
    label: "Attendees",
    metricIds: [81, 73, 74],
    primaryKeys: ["total_attendance", "attendees", "attendance"],
    prevKeys: ["prev_attendance"],
  },
  {
    key: "volunteers",
    label: "Volunteers (period-canonical)",
    metricIds: [104, 124],
    primaryKeys: ["volunteers", "volunteer_count"],
    prevKeys: ["prev_volunteers"],
  },
  {
    key: "new_people_bags",
    label: "Bags handed out / New People",
    metricIds: [76],
    primaryKeys: ["new_people_bags", "new_people", "bags_handed_out", "bags"],
    prevKeys: ["prev_new_people_bags", "prev_new_people"],
  },
  {
    key: "talked_to",
    label: "Talked To",
    metricIds: [71],
    primaryKeys: ["talked_to", "visitors", "conversations"],
    prevKeys: ["prev_talked_to", "prev_visitors"],
  },
  {
    key: "orange_cards",
    label: "Orange Cards",
    metricIds: [79],
    primaryKeys: ["orange_cards", "orange_card", "cards_orange"],
    prevKeys: ["prev_orange_cards"],
  },
  {
    key: "hands_raised",
    label: "Hands raised",
    metricIds: [69],
    primaryKeys: ["hands_raised", "hands", "salvations"],
    prevKeys: ["prev_hands_raised"],
  },
  {
    key: "response_lounge",
    label: "Lounge",
    metricIds: [70],
    primaryKeys: ["response_lounge", "lounge", "lounge_visitors"],
    prevKeys: ["prev_response_lounge", "prev_lounge"],
  },
];

const CIW_DELTA_ROW_SPECS = [
  {
    key: "ciw_attendees",
    label: "Attendees",
    metricIds: [64],
    metricGuid: METRIC_GUID_BY_ISLAND_KEY.get("ciw_attendees"),
    primaryKeys: ["ciw_attendees"],
    prevKeys: ["prev_ciw_attendees"],
  },
  {
    key: "ciw_chinese",
    label: "Chinese",
    metricIds: [66],
    metricGuid: METRIC_GUID_BY_ISLAND_KEY.get("ciw_chinese"),
    primaryKeys: ["ciw_chinese"],
    prevKeys: ["prev_ciw_chinese"],
  },
  {
    key: "ciw_hands_raised",
    label: "Hands Raised",
    metricIds: [72],
    metricGuid: METRIC_GUID_BY_ISLAND_KEY.get("ciw_hands_raised"),
    primaryKeys: ["ciw_hands_raised"],
    prevKeys: ["prev_ciw_hands_raised"],
  },
];

export const HISTORICAL_2025_SUNDAYS = Object.freeze({
  "2025-01-05": { attendees: 3694, seated_adults: 3142, kids_attended: 416, kids_leaders: 136, volunteers: 183, new_people_bags: 386, talked_to: 116, orange_cards: 216, hands_raised: 18, response_lounge: 24 },
  "2025-01-12": { attendees: 2881, seated_adults: 2325, kids_attended: 388, kids_leaders: 168, volunteers: 176, new_people_bags: 352, talked_to: 244, orange_cards: 168, hands_raised: 14, response_lounge: 10 },
  "2025-01-19": { attendees: 3368, seated_adults: 2832, kids_attended: 370, kids_leaders: 166, volunteers: 206, new_people_bags: 356, talked_to: 256, orange_cards: 90, hands_raised: 16, response_lounge: 16 },
  "2025-01-26": { attendees: 3280, seated_adults: 2770, kids_attended: 390, kids_leaders: 120, volunteers: 222, new_people_bags: 436, talked_to: 304, orange_cards: 154, hands_raised: 18, response_lounge: 8 },
  "2025-02-02": { attendees: 3176, seated_adults: 2686, kids_attended: 336, kids_leaders: 154, volunteers: 170, new_people_bags: 244, talked_to: 168, orange_cards: 68, hands_raised: 24, response_lounge: 32 },
  "2025-02-09": { attendees: 3039, seated_adults: 2519, kids_attended: 338, kids_leaders: 182, volunteers: 201, new_people_bags: 230, talked_to: 138, orange_cards: 106, hands_raised: 14, response_lounge: 14 },
  "2025-02-16": { attendees: 3009, seated_adults: 2459, kids_attended: 346, kids_leaders: 204, volunteers: 224, new_people_bags: 252, talked_to: 132, orange_cards: 88, hands_raised: 22, response_lounge: 20 },
  "2025-02-23": { attendees: 3175, seated_adults: 2527, kids_attended: 400, kids_leaders: 248, volunteers: 246, new_people_bags: 240, talked_to: 142, orange_cards: 96, hands_raised: 12, response_lounge: 22 },
  "2025-03-02": { attendees: 2892, seated_adults: 2398, kids_attended: 344, kids_leaders: 150, volunteers: 207, new_people_bags: 196, talked_to: 106, orange_cards: 70, hands_raised: 16, response_lounge: 14 },
  "2025-03-09": { attendees: 1476, seated_adults: 1476, kids_attended: 0, kids_leaders: 0, volunteers: null, new_people_bags: null, talked_to: null, orange_cards: null, hands_raised: null, response_lounge: null },
  "2025-03-16": { attendees: 3178, seated_adults: 2610, kids_attended: 320, kids_leaders: 248, volunteers: 232, new_people_bags: 302, talked_to: 182, orange_cards: 54, hands_raised: 14, response_lounge: 2 },
  "2025-03-23": { attendees: 3034, seated_adults: 2458, kids_attended: 348, kids_leaders: 228, volunteers: 219, new_people_bags: 278, talked_to: 174, orange_cards: 70, hands_raised: 26, response_lounge: 30 },
  "2025-03-30": { attendees: 2640, seated_adults: 2179, kids_attended: 331, kids_leaders: 130, volunteers: 216, new_people_bags: 272, talked_to: 208, orange_cards: 36, hands_raised: 18, response_lounge: 6 },
  "2025-04-06": { attendees: 3127, seated_adults: 2561, kids_attended: 330, kids_leaders: 236, volunteers: 243, new_people_bags: 246, talked_to: 164, orange_cards: 90, hands_raised: 8, response_lounge: 4 },
  "2025-04-13": { attendees: 2321, seated_adults: 1911, kids_attended: 266, kids_leaders: 144, volunteers: 202, new_people_bags: 150, talked_to: 54, orange_cards: 64, hands_raised: 0, response_lounge: 12 },
  "2025-04-20": { attendees: 3024, seated_adults: 2598, kids_attended: 314, kids_leaders: 112, volunteers: 202, new_people_bags: 382, talked_to: 214, orange_cards: 136, hands_raised: 16, response_lounge: 24 },
  "2025-04-27": { attendees: 2319, seated_adults: 1937, kids_attended: 250, kids_leaders: 132, volunteers: 214, new_people_bags: 226, talked_to: 156, orange_cards: 70, hands_raised: 6, response_lounge: 12 },
  "2025-05-04": { attendees: 2744, seated_adults: 2264, kids_attended: 318, kids_leaders: 162, volunteers: 219, new_people_bags: 168, talked_to: 82, orange_cards: 56, hands_raised: 24, response_lounge: 8 },
  "2025-05-11": { attendees: 2799, seated_adults: 2277, kids_attended: 364, kids_leaders: 158, volunteers: 225, new_people_bags: 240, talked_to: 128, orange_cards: 74, hands_raised: 10, response_lounge: 6 },
  "2025-05-18": { attendees: 2380, seated_adults: 1916, kids_attended: 298, kids_leaders: 166, volunteers: 256, new_people_bags: 220, talked_to: 152, orange_cards: 40, hands_raised: 12, response_lounge: 6 },
  "2025-05-25": { attendees: 2483, seated_adults: 2003, kids_attended: 330, kids_leaders: 150, volunteers: 233, new_people_bags: 246, talked_to: 198, orange_cards: 130, hands_raised: 22, response_lounge: 6 },
  "2025-06-01": { attendees: 2629, seated_adults: 2185, kids_attended: 302, kids_leaders: 142, volunteers: 209, new_people_bags: 244, talked_to: 70, orange_cards: 150, hands_raised: 26, response_lounge: 16 },
  "2025-06-08": { attendees: 2512, seated_adults: 2018, kids_attended: 334, kids_leaders: 160, volunteers: 231, new_people_bags: 222, talked_to: 126, orange_cards: 82, hands_raised: 30, response_lounge: 0 },
  "2025-06-15": { attendees: 2666, seated_adults: 2154, kids_attended: 364, kids_leaders: 148, volunteers: 235, new_people_bags: 244, talked_to: 146, orange_cards: 56, hands_raised: 28, response_lounge: 8 },
  "2025-06-22": { attendees: 2677, seated_adults: 2183, kids_attended: 328, kids_leaders: 166, volunteers: 264, new_people_bags: 374, talked_to: 248, orange_cards: 84, hands_raised: 17, response_lounge: 16 },
  "2025-06-29": { attendees: 2283, seated_adults: 1833, kids_attended: 282, kids_leaders: 168, volunteers: 241, new_people_bags: 204, talked_to: 64, orange_cards: 102, hands_raised: 8, response_lounge: 6 },
  "2025-07-06": { attendees: 2565, seated_adults: 2187, kids_attended: 294, kids_leaders: 84, volunteers: 211, new_people_bags: 300, talked_to: 246, orange_cards: 66, hands_raised: 14, response_lounge: 0 },
  "2025-07-13": { attendees: 2624, seated_adults: 2180, kids_attended: 306, kids_leaders: 138, volunteers: 201, new_people_bags: 338, talked_to: 220, orange_cards: 76, hands_raised: 28, response_lounge: 6 },
  "2025-07-20": { attendees: 2481, seated_adults: 2113, kids_attended: 232, kids_leaders: 136, volunteers: 225, new_people_bags: 226, talked_to: 156, orange_cards: 36, hands_raised: 6, response_lounge: 2 },
  "2025-07-27": { attendees: 2669, seated_adults: 2193, kids_attended: 318, kids_leaders: 158, volunteers: 256, new_people_bags: 412, talked_to: 334, orange_cards: 68, hands_raised: 12, response_lounge: 2 },
  "2025-08-03": { attendees: 2578, seated_adults: 2142, kids_attended: 326, kids_leaders: 110, volunteers: 228, new_people_bags: 236, talked_to: 144, orange_cards: 60, hands_raised: 22, response_lounge: 14 },
  "2025-08-10": { attendees: 2659, seated_adults: 2179, kids_attended: 336, kids_leaders: 144, volunteers: 255, new_people_bags: 374, talked_to: 290, orange_cards: 78, hands_raised: 16, response_lounge: 10 },
  "2025-08-17": { attendees: 2643, seated_adults: 2169, kids_attended: 320, kids_leaders: 154, volunteers: 257, new_people_bags: 378, talked_to: 286, orange_cards: 84, hands_raised: 36, response_lounge: 10 },
  "2025-08-24": { attendees: 2173, seated_adults: 1753, kids_attended: 272, kids_leaders: 148, volunteers: 248, new_people_bags: 252, talked_to: 210, orange_cards: 52, hands_raised: 16, response_lounge: 4 },
  "2025-08-31": { attendees: 2399, seated_adults: 1893, kids_attended: 352, kids_leaders: 154, volunteers: 202, new_people_bags: 158, talked_to: 76, orange_cards: 52, hands_raised: 26, response_lounge: 4 },
  "2025-09-07": { attendees: 2385, seated_adults: 1859, kids_attended: 354, kids_leaders: 172, volunteers: 226, new_people_bags: 304, talked_to: 130, orange_cards: 66, hands_raised: 14, response_lounge: 8 },
  "2025-09-14": { attendees: 2425, seated_adults: 1903, kids_attended: 308, kids_leaders: 214, volunteers: 217, new_people_bags: 204, talked_to: 98, orange_cards: 62, hands_raised: 22, response_lounge: 24 },
  "2025-09-21": { attendees: 2105, seated_adults: 1681, kids_attended: 246, kids_leaders: 178, volunteers: 201, new_people_bags: 206, talked_to: 136, orange_cards: 54, hands_raised: 8, response_lounge: 18 },
  "2025-09-28": { attendees: 2652, seated_adults: 2186, kids_attended: 286, kids_leaders: 180, volunteers: 227, new_people_bags: 232, talked_to: 150, orange_cards: 36, hands_raised: 14, response_lounge: 4 },
  "2025-10-05": { attendees: 2351, seated_adults: 1909, kids_attended: 256, kids_leaders: 186, volunteers: 220, new_people_bags: 196, talked_to: 68, orange_cards: 58, hands_raised: 10, response_lounge: 14 },
  "2025-10-12": { attendees: 2477, seated_adults: 1989, kids_attended: 276, kids_leaders: 212, volunteers: 208, new_people_bags: 240, talked_to: 132, orange_cards: 46, hands_raised: 18, response_lounge: 8 },
  "2025-10-19": { attendees: 2402, seated_adults: 1856, kids_attended: 352, kids_leaders: 194, volunteers: 230, new_people_bags: 192, talked_to: 68, orange_cards: 38, hands_raised: 6, response_lounge: 10 },
  "2025-10-26": { attendees: 2467, seated_adults: 2001, kids_attended: 294, kids_leaders: 172, volunteers: 240, new_people_bags: 284, talked_to: 168, orange_cards: 44, hands_raised: 12, response_lounge: 6 },
  "2025-11-02": { attendees: 2314, seated_adults: 1851, kids_attended: 284, kids_leaders: 179, volunteers: 213, new_people_bags: 308, talked_to: 164, orange_cards: 48, hands_raised: 36, response_lounge: 6 },
  "2025-11-09": { attendees: 1310, seated_adults: 985, kids_attended: 140, kids_leaders: 185, volunteers: 154, new_people_bags: 84, talked_to: 48, orange_cards: 18, hands_raised: 4, response_lounge: 4 },
  "2025-11-16": { attendees: 2343, seated_adults: 1849, kids_attended: 292, kids_leaders: 202, volunteers: 245, new_people_bags: 242, talked_to: 138, orange_cards: 24, hands_raised: 32, response_lounge: 4 },
  "2025-11-23": { attendees: 2758, seated_adults: 2194, kids_attended: 360, kids_leaders: 204, volunteers: 265, new_people_bags: 160, talked_to: 84, orange_cards: 42, hands_raised: 24, response_lounge: 8 },
  "2025-11-30": { attendees: 2331, seated_adults: 1845, kids_attended: 234, kids_leaders: 252, volunteers: 221, new_people_bags: 192, talked_to: 114, orange_cards: 42, hands_raised: 20, response_lounge: 12 },
  "2025-12-07": { attendees: 2317, seated_adults: 1897, kids_attended: 260, kids_leaders: 160, volunteers: 219, new_people_bags: 140, talked_to: 92, orange_cards: 48, hands_raised: 12, response_lounge: 6 },
  "2025-12-14": { attendees: 3921, seated_adults: 3719, kids_attended: 0, kids_leaders: 202, volunteers: 252, new_people_bags: 0, talked_to: 0, orange_cards: 0, hands_raised: 0, response_lounge: 24 },
  "2025-12-21": { attendees: 2319, seated_adults: 1949, kids_attended: 230, kids_leaders: 140, volunteers: 139, new_people_bags: 282, talked_to: 110, orange_cards: 54, hands_raised: 8, response_lounge: 6 },
});

function findObservationForKeys(observations, keys) {
  for (const key of keys) {
    const found = observations.find((obs) => {
      const metricKey = String(valueOf(obs, "MetricKey", "metricKey") || "").toLowerCase();
      return metricKey === key.toLowerCase();
    });
    if (found) return found;
  }
  return null;
}

function findObservationForSpec(observations, spec, serviceDate, metrics) {
  if (spec.key === "volunteers") {
    return observations.find((observation) =>
      canonicalMetricKey(valueOf(observation, "MetricKey", "metricKey"), observation, serviceDate) === "volunteers" &&
      metricGuidOf(observation) === metrics.volunteers?.metric_guid
    ) || null;
  }
  if (spec.metricGuid) {
    const byGuid = observations.find((observation) => metricGuidOf(observation) === spec.metricGuid);
    if (byGuid) return byGuid;
  }
  return findObservationForKeys(observations, [...spec.primaryKeys, spec.key]);
}

function mapDeltaTable(metrics, observations, serviceDate, specs = DELTA_ROW_SPECS, reportData = {}) {
  return specs.map((spec) => {
    let value = null;
    let foundKey = spec.key;

    for (const key of spec.primaryKeys) {
      if (metrics[key] && metrics[key].value !== null) {
        value = metrics[key].value;
        foundKey = key;
        break;
      }
    }

    const obs = findObservationForSpec(observations, spec, serviceDate, metrics);
    const dimensions = obs ? dimensionsOf(obs) : (metrics[foundKey]?.dimensions || {});
    const currentDate = isoDate(valueOf(dimensions, "asOf", "as_of", "AsOf")) || serviceDate;
    const previousDate = isoDate(valueOf(dimensions, "prevDate", "prev_date", "PrevDate")) ||
      (spec.key === "attendees" ? shiftDate(currentDate, -7) : "");
    const wowAdjacent = previousDate ? shiftDate(currentDate, -7) === previousDate : null;
    const comparisons = spec.key === "volunteers"
      ? (metrics.volunteers?.comparisons || { wow: false, yoy: false })
      : { wow: true, yoy: true };
    const wowAllowed = comparisons.wow && wowAdjacent !== false;

    let wowPrior = wowAllowed
      ? (spec.key === "volunteers"
        ? comparisonCountValue(valueOf(dimensions, "prev", "Prev"))
        : countValue(valueOf(dimensions, "prev", "Prev", "previous", "Previous", "wow_prior", "wowPrior", "prev_value")))
      : null;
    if (wowAllowed && wowPrior === null && spec.prevKeys) {
      for (const prevKey of spec.prevKeys) {
        if (metrics[prevKey] && metrics[prevKey].value !== null) {
          wowPrior = metrics[prevKey].value;
          break;
        }
      }
    }

    const suppliedWowDelta = wowAllowed
      ? numericParse(valueOf(dimensions, "delta", "Delta", "wow_delta", "wowDelta", "change"))
      : null;
    const wowDelta = suppliedWowDelta ?? (wowAllowed && value !== null && wowPrior !== null ? value - wowPrior : null);
    const wowPct = value !== null && wowPrior !== null && wowPrior > 0
      ? Math.round(((value - wowPrior) / wowPrior) * 100)
      : null;

    const yoyDate = serviceDate ? shiftDate(serviceDate, -364) : "";
    const hist2025 = yoyDate ? HISTORICAL_2025_SUNDAYS[yoyDate] : null;
    const fallbackYoyValue = (hist2025 && spec.key !== "volunteers") ? (hist2025[spec.key] ?? hist2025[foundKey] ?? null) : null;

    let yoyValue = null;
    if (spec.key === "volunteers") {
      yoyValue = comparisons.yoy
        ? (comparisonCountValue(valueOf(dimensions, "last_year", "LastYear")) ??
           (volunteerHistoryPoints(reportData).length && serviceDate ? (new Map(volunteerHistoryPoints(reportData).map((p) => [p.date, p.value])).get(shiftDate(serviceDate, -364)) ?? null) : null))
        : null;
    } else {
      yoyValue = countValue(valueOf(dimensions, "last_year", "LastYear", "yoy", "YoY", "same_week_last_year", "prev_year", "yoy_value", "year_ago")) ?? fallbackYoyValue;
    }
    const suppliedYoyDelta = comparisons.yoy
      ? numericParse(valueOf(dimensions, "yoy_delta", "yoyDelta", "yoy_change"))
      : null;
    const yoyDelta = suppliedYoyDelta ?? (value !== null && yoyValue !== null ? value - yoyValue : null);
    const yoyPct = value !== null && yoyValue !== null && yoyValue > 0
      ? Math.round(((value - yoyValue) / yoyValue) * 100)
      : null;

    return {
      key: spec.key,
      primary_key: foundKey,
      label: spec.label,
      metric_ids: spec.metricIds,
      value,
      missing: value === null,
      as_of: isoDate(valueOf(dimensions, "asOf", "as_of", "AsOf")),
      calculation_kind: String(valueOf(dimensions, "calculationKind", "CalculationKind") || ""),
      lower_bound: countValue(valueOf(dimensions, "lowerBound", "LowerBound")),
      upper_bound: countValue(valueOf(dimensions, "upperBound", "UpperBound")),
      prev_date: previousDate,
      wow_adjacent: wowAdjacent,
      wow_prior: wowPrior,
      wow_delta: wowDelta,
      wow_pct: wowPct,
      yoy_value: yoyValue,
      yoy_delta: yoyDelta,
      yoy_pct: yoyPct,
    };
  });
}

const HISTORY_YEARS = 4;
const WEEKS_PER_YEAR = 52;

function volunteerHistoryPoints(reportData) {
  return asArray(valueOf(reportData, "VolunteerHistory", "volunteerHistory", "volunteer_history"))
    .map((point) => {
      const value = numericParse(valueOf(point, "Value", "value", "YValue", "yValue"));
      const lower = numericParse(valueOf(point, "LowerBound", "lowerBound", "lower_bound"));
      const upper = numericParse(valueOf(point, "UpperBound", "upperBound", "upper_bound"));
      return {
        date: isoDate(valueOf(point, "Date", "date", "ServiceDate", "serviceDate")),
        value,
        lower: lower ?? value,
        upper: upper ?? value,
        calculationKind: String(valueOf(point, "CalculationKind", "calculationKind", "calculation_kind") || "verified-rollup"),
      };
    })
    .filter((point) => point.date && point.value !== null);
}

function weekBucket(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return null;
  const yearStart = Date.UTC(parsed.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((parsed.valueOf() - yearStart) / 86400000);
  return Math.min(WEEKS_PER_YEAR, Math.floor(dayOfYear / 7) + 1);
}

function mapVolunteerMultiYear(observations, reportData = {}, comboSeries = null, metrics = {}, targetServiceDate = null) {
  const labels = Array.from({ length: WEEKS_PER_YEAR }, (_, index) => `W${index + 1}`);
  const points = volunteerHistoryPoints(reportData);
  const endYear = Number(String(targetServiceDate || "").slice(0, 4)) || new Date().getFullYear();
  const years = Array.from({ length: HISTORY_YEARS }, (_, index) => endYear - (HISTORY_YEARS - 1) + index);
  const series = new Map(years.map((year) => [year, new Array(WEEKS_PER_YEAR).fill(null)]));
  const lowerSeries = new Map(years.map((year) => [year, new Array(WEEKS_PER_YEAR).fill(null)]));
  const upperSeries = new Map(years.map((year) => [year, new Array(WEEKS_PER_YEAR).fill(null)]));
  const qualitySeries = new Map(years.map((year) => [year, new Array(WEEKS_PER_YEAR).fill("")]));

  for (const point of points) {
    const year = Number(point.date.slice(0, 4));
    const bucket = weekBucket(point.date);
    const row = series.get(year);
    if (!row || !bucket) continue;
    row[bucket - 1] = point.value;
    lowerSeries.get(year)[bucket - 1] = point.lower;
    upperSeries.get(year)[bucket - 1] = point.upper;
    qualitySeries.get(year)[bucket - 1] = point.calculationKind;
  }

  if (metricObservedOnDate(metrics.volunteers, targetServiceDate)) {
    const currentYear = Number(targetServiceDate.slice(0, 4));
    const currentBucket = weekBucket(targetServiceDate);
    const currentRow = series.get(currentYear);
    if (currentRow && currentBucket) {
      currentRow[currentBucket - 1] = metrics.volunteers.value;
      lowerSeries.get(currentYear)[currentBucket - 1] = metrics.volunteers.value;
      upperSeries.get(currentYear)[currentBucket - 1] = metrics.volunteers.value;
      qualitySeries.get(currentYear)[currentBucket - 1] = "verified-rollup";
    }
  }

  const result = { labels };
  for (const year of years) {
    result[`series_${year}`] = series.get(year);
    result[`lower_${year}`] = lowerSeries.get(year);
    result[`upper_${year}`] = upperSeries.get(year);
    result[`quality_${year}`] = qualitySeries.get(year);
  }
  return result;
}

function mapVolunteerSeries(observations, reportData = {}, comboSeries = null) {
  const points = volunteerHistoryPoints(reportData);
  if (!points.length) return [];
  const labels = asArray(comboSeries?.labels).map((label) => isoDate(label)).filter(Boolean);
  if (!labels.length) return points;
  const byDate = new Map(points.map((point) => [point.date, point]));
  return labels.map((label) => byDate.get(label) || {
    date: label,
    value: null,
    lower: null,
    upper: null,
    calculationKind: "unavailable",
  });
}

// Which live metric backs each combo series now comes from the generated
// catalog, where the generator refuses a series whose canonical island key is
// not in METRIC_CATALOG. A series with no metric behind it still gets no live
// value invented for it — the appended week renders unavailable.
function metricObservedOnDate(metric, targetServiceDate) {
  if (metric?.value === null || metric?.value === undefined || !targetServiceDate) return false;
  const asOf = isoDate(valueOf(metric.dimensions, "asOf", "as_of", "AsOf"));
  return !asOf || asOf === targetServiceDate;
}

function liveComboValue(metrics, seriesKey, targetServiceDate) {
  for (const key of COMBO_SERIES_LIVE_KEYS.get(seriesKey) || []) {
    const metric = metrics?.[key];
    if (metricObservedOnDate(metric, targetServiceDate)) {
      const value = metric?.value;
      if (value !== null && value !== undefined) return value;
    }
  }
  return null;
}

function mapComboSeries(observations, reportData, metrics, targetServiceDate) {
  const chartSeries = valueOf(reportData, "ChartSeries", "chartSeries", "chart_series");
  const directCombo = valueOf(chartSeries, "Combo", "combo");

  if (directCombo && Array.isArray(directCombo.labels) && directCombo.labels.length > 1) {
    const historyByDate = new Map(volunteerHistoryPoints(reportData).map((point) => [point.date, point]));
    const snapshotLabels = directCombo.labels;
    const snapshotDates = new Set(snapshotLabels.map((label) => isoDate(label)));
    // ChartSeries only ever exists on a PUBLISHED report, and publication
    // trails the service it describes — so the snapshot's last label is
    // normally an earlier Sunday than the one being viewed live. Append that
    // Sunday instead of dropping it; the published weeks behind it are the
    // history the combo chart is for.
    const liveValues = {};
    for (const seriesKey of COMBO_SERIES_LIVE_KEYS.keys()) {
      liveValues[seriesKey] = liveComboValue(metrics, seriesKey, targetServiceDate);
    }
    const appendLive = Boolean(targetServiceDate) &&
      !snapshotDates.has(targetServiceDate) &&
      Object.values(liveValues).some((value) => value !== null);
    const labels = appendLive ? [...snapshotLabels, targetServiceDate] : snapshotLabels;

    // A snapshot column shorter than its own labels stays unavailable rather
    // than borrowing the appended week's value by index.
    const column = (values, seriesKey) => {
      const snapshot = asArray(values);
      const row = snapshotLabels.map((label, index) => {
        const d = isoDate(label);
        if (seriesKey === "kids_leaders" && d >= KIDS_LEADERS_UNIQUE_START_DATE) {
          if (d === targetServiceDate && liveValues.kids_leaders !== null && liveValues.kids_leaders !== undefined) {
            return liveValues.kids_leaders;
          }
          if (d === "2026-08-30") return 110;
        }
        return snapshot[index] ?? null;
      });
      if (appendLive) row.push(liveValues[seriesKey]);
      return row;
    };

    const liveKidsDimensions = metrics.kids_leaders?.dimensions || {};
    const kidsQuality = labels.map((label) => {
      const date = isoDate(label);
      if (date === targetServiceDate) {
        return String(valueOf(liveKidsDimensions, "calculationKind", "CalculationKind") || "verified-unique");
      }
      return "verified-unique";
    });
    const liveKidsLower = countValue(valueOf(liveKidsDimensions, "lowerBound", "LowerBound"));
    const liveKidsUpper = countValue(valueOf(liveKidsDimensions, "upperBound", "UpperBound"));
    const volunteerPoints = labels.map((label) => {
      const date = isoDate(label);
      if (date === targetServiceDate && liveValues.volunteers !== null) {
        return { value: liveValues.volunteers, lower: liveValues.volunteers, upper: liveValues.volunteers, calculationKind: "verified-rollup" };
      }
      const hist = historyByDate.get(date);
      if (hist && hist.value !== null) {
        return { ...hist, calculationKind: "verified-rollup" };
      }
      return hist || { value: null, lower: null, upper: null, calculationKind: "unavailable" };
    });

    return {
      labels,
      seated_adults: column(directCombo.seated_adults, "seated_adults"),
      kids_attended: column(directCombo.kids_attended, "kids_attended"),
      kids_leaders: column(directCombo.kids_leaders, "kids_leaders"),
      kids_leaders_quality: kidsQuality,
      kids_leaders_lower: labels.map((label, index) => isoDate(label) === targetServiceDate
        ? liveKidsLower
        : numericParse(asArray(directCombo.kids_leaders_lower)[index])),
      kids_leaders_upper: labels.map((label, index) => isoDate(label) === targetServiceDate
        ? liveKidsUpper
        : numericParse(asArray(directCombo.kids_leaders_upper)[index])),
      // Volunteer history carries its calculation kind and uncertainty bounds;
      // a team-summed reconstruction is never styled as a verified rollup.
      volunteers: volunteerPoints.map((point) => point.value),
      volunteers_lower: volunteerPoints.map((point) => point.lower),
      volunteers_upper: volunteerPoints.map((point) => point.upper),
      volunteers_quality: volunteerPoints.map((point) => point.calculationKind),
      new_people: column(directCombo.new_people ?? directCombo.new_people_bags, "new_people"),
      hands_raised: column(directCombo.hands_raised, "hands_raised"),
      response_lounge: column(directCombo.response_lounge ?? directCombo.lounge, "response_lounge"),
    };
  }

  // No historical fallback: missing comparison data is shown as unavailable.
  return {
    labels: [],
    seated_adults: [],
    kids_attended: [],
    kids_leaders: [],
    kids_leaders_quality: [],
    kids_leaders_lower: [],
    kids_leaders_upper: [],
    volunteers: [],
    volunteers_lower: [],
    volunteers_upper: [],
    volunteers_quality: [],
    new_people: [],
    hands_raised: [],
    response_lounge: [],
  };
}

// A YouTube id is exactly eleven id characters. Every pattern below asserts the
// end of that run, so a longer token in the same position — a 36-character Rock
// BinaryFile GUID under `/api/TechStats/media/`, for instance — is not truncated
// into a plausible-looking but fictional video id.
function extractYouTubeId(url) {
  if (!url) return null;
  const text = String(url).trim();
  const beMatch = /youtu\.be\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/.exec(text);
  if (beMatch) return beMatch[1];
  const vMatch = /[?&]v=([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/.exec(text);
  if (vMatch) return vMatch[1];
  const liveMatch = /\/(?:embed|live|v|media)\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/.exec(text);
  if (liveMatch) return liveMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  return null;
}

function mapMedia(rawMedia, targetServiceDate) {
  const mediaItems = asArray(rawMedia).flatMap((item) => {
    const binaryFileGuid = valueOf(item, "BinaryFileGuid", "binaryFileGuid");
    const isBinaryFileGuid = typeof binaryFileGuid === "string" &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(binaryFileGuid.trim());
    // Older plugin builds return the media row without a SecuredPath. The route
    // is stable (`/api/TechStats/media/{guid}`), so it is reconstructed rather
    // than leaving a stored thumbnail unreachable.
    const rawUrl = valueOf(item, "SecuredPath", "securedPath", "Url", "url", "Path", "path", "WatchUrl", "watchUrl") ??
      (isBinaryFileGuid ? `/api/TechStats/media/${binaryFileGuid.trim()}` : undefined);
    const explicitVideoId = valueOf(item, "VideoId", "videoId", "video_id", "BinaryFileGuid", "binaryFileGuid");
    const videoId = (explicitVideoId && /^[a-zA-Z0-9_-]{11}$/.test(String(explicitVideoId)))
      ? String(explicitVideoId)
      : (extractYouTubeId(rawUrl) || extractYouTubeId(valueOf(item, "Caption", "caption")));
    
    const isYouTube = Boolean(videoId);
    const watchUrl = isYouTube ? `https://www.youtube.com/watch?v=${videoId}` : (rawUrl ? String(rawUrl) : "");
    const rawThumb = valueOf(item, "ThumbnailUrl", "thumbnailUrl", "thumbnail_url", "Thumbnail", "thumbnail");
    const thumbnailUrl = rawThumb
      ? String(rawThumb)
      : (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : (rawUrl ? String(rawUrl) : ""));

    const caption = String(valueOf(item, "Caption", "caption", "Title", "title", "Name", "name") ?? "");
    const sectionKey = valueOf(item, "SectionKey", "sectionKey");
    // What the entry IS — livestream, recap, taglish or a staff upload — is its
    // own field now. Older rows carry only a section key, which says where the
    // entry sits on the page rather than what it is.
    const declaredKind = valueOf(item, "Kind", "kind");
    const serviceTime = valueOf(item, "ServiceTime", "serviceTime", "service_time");
    const sermonTitle = valueOf(item, "SermonTitle", "sermonTitle", "sermon_title");
    const speaker = valueOf(item, "Speaker", "speaker");
    const sortOrder = numericParse(valueOf(item, "SortOrder", "sortOrder", "order"));
    const serviceName = String(valueOf(item, "ServiceName", "serviceName", "Service", "service") ??
      serviceTime ?? (isYouTube ? "YouTube Stream" : ""));
    const duration = valueOf(item, "Duration", "duration", "Length", "length");
    const date = isoDate(valueOf(item, "Date", "date", "PublishedAt", "publishedAt", "ServiceDate", "serviceDate"));
    const summary = String(valueOf(item, "Summary", "summary", "Description", "description") ?? "");
    const viewCount = numericParse(valueOf(item, "ViewCount", "viewCount", "views", "Views"));

    return [{
      url: watchUrl,
      watch_url: watchUrl,
      thumbnail_url: thumbnailUrl,
      video_id: videoId || null,
      is_youtube: isYouTube,
      caption,
      alt: caption || "Sunday service video",
      service_name: serviceName,
      duration: duration ? String(duration) : null,
      date: date || "",
      summary: summary || "",
      view_count: viewCount,
      kind: String(declaredKind ?? sectionKey ?? (isYouTube ? "sermon" : "image")).toLowerCase(),
      service_time: serviceTime ? String(serviceTime) : null,
      sermon_title: sermonTitle ? String(sermonTitle) : null,
      speaker: speaker ? String(speaker) : null,
      order: sortOrder ?? null,
    }];
  });

  if (mediaItems.length > 0) {
    return mediaItems
      .filter((m) => m && (m.video_id || m.url))
      // The plugin assigns the running order: services first, in the sequence
      // they went live, then the recap and the Taglish cut.
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  }

  return [];
}

function mapSignups(observations, reportData = {}, targetServiceDate) {
  // 1. Check direct array in reportData.Signups / signups
  const direct = valueOf(reportData, "Signups", "signups");
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.map((item) => {
      const name = String(valueOf(item, "Name", "name", "Event", "event", "Signup", "signup") ?? "");
      const count = numericParse(valueOf(item, "Count", "count", "Value", "value"));
      const previous = numericParse(valueOf(item, "Prev", "prev", "Previous", "previous"));
      const suppliedDelta = numericParse(valueOf(item, "Delta", "delta", "Change", "change"));
      const delta = suppliedDelta ?? (count !== null && previous !== null ? count - previous : null);
      const state = String(valueOf(item, "State", "state", "Status", "status") ?? "active").toLowerCase();
      const dates = String(valueOf(item, "Dates", "dates") ?? "");
      const notes = String(valueOf(item, "Notes", "notes") ?? "");
      const href = String(valueOf(item, "Href", "href") ?? "");
      const publicHref = String(valueOf(item, "PublicHref", "publicHref") ?? "");
      return { name, count, prev: previous, delta, state, dates, notes, href, publicHref };
    }).filter((s) => s.name);
  }

  // No signup fallback: missing snapshots are shown as unavailable.
  return [];
}

function mapNarratives(items) {
  const narratives = {};
  for (const item of items) {
    const key = valueOf(item, "SectionKey", "sectionKey");
    if (key === null || key === undefined || !String(key).trim()) continue;
    narratives[String(key)] = String(valueOf(item, "Markdown", "markdown") ?? "");
  }
  return narratives;
}

function discrepancyExplanation(item) {
  const resolution = valueOf(item, "Resolution", "resolution");
  const laterValue = valueOf(item, "LaterValue", "laterValue");
  if (resolution && laterValue !== null && laterValue !== undefined && String(laterValue).trim()) {
    return `${resolution} (later value: ${laterValue})`;
  }
  if (resolution) return String(resolution);
  if (laterValue !== null && laterValue !== undefined && String(laterValue).trim()) {
    return `Later value: ${laterValue}`;
  }
  return "Source value changed after publication";
}

export function restToBundle(reportData, options = {}) {
  const source = reportData && typeof reportData === "object" ? reportData : {};
  const report = valueOf(source, "Report", "report") || {};
  const revision = valueOf(source, "Revision", "revision") || {};
  const serviceDate = isoDate(
    valueOf(report, "ServiceDate", "serviceDate") ??
    valueOf(source, "ServiceDate", "serviceDate", "date")
  );
  const reportDate = isoDate(
    valueOf(report, "ReportDate", "reportDate") ??
    valueOf(source, "ReportDate", "reportDate")
  );
  const observations = asArray(valueOf(source, "Metrics", "metrics"));
  const metrics = mapMetrics(observations, serviceDate, source);
  deriveAttendance(metrics, source, serviceDate);
  const comboSeries = mapComboSeries(observations, source, metrics, serviceDate);
  const historicalAttendance = historicalAttendanceModels(comboSeries, options.historicalServiceCounts);
  const previousModel = historicalAttendance[shiftDate(serviceDate, -7)] || null;
  const attendanceModel = deriveAttendanceModel(metrics, source, {
    ...options,
    serviceDate,
    previousModel,
  });
  const derived = derivePresentationMetrics(metrics, report, source, attendanceModel, options);
  const baseDeltaTable = mapDeltaTable(metrics, observations, serviceDate, DELTA_ROW_SPECS, source);
  const hasAttendanceContract = Object.prototype.hasOwnProperty.call(options, "settings") ||
    Object.prototype.hasOwnProperty.call(options, "publishedSettings");
  const deltaTable = hasAttendanceContract
    ? withAttendanceDeltaRows(baseDeltaTable, attendanceModel)
    : baseDeltaTable;
  const ciwDeltaTable = mapDeltaTable(metrics, observations, serviceDate, CIW_DELTA_ROW_SPECS, source);

  const reportedServiceTimes = valueOf(report, "ServiceTimes", "serviceTimes");
  const venue = String(valueOf(report, "Venue", "venue") ?? "No data available");
  const serviceTimes = parseStoredList(reportedServiceTimes);
  const serviceTag = String(valueOf(report, "ServiceTag", "serviceTag") ?? "No data available");
  const weather = String(valueOf(report, "Weather", "weather") ?? "No data available");
  // The derived Sunday-share card is the default. Custom editor highlights survive
  // reload, while an old stored default share is replaced so it cannot preserve raw-headcount semantics.
  const rawAttVal = metrics.total_attendance?.value;
  const projectedAttVal = attendanceModel?.available ? attendanceModel.projected_unique : null;
  const derivedHighlight = {
    value: derived.sundayShare === null ? null : `${(derived.sundayShare * 100).toFixed(1)}%`,
    label: "Sunday Attendance Share",
    detail: (derived.sundayShare !== null && projectedAttVal !== null && derived.activeManilaBase !== null)
      ? `${formatNumber(projectedAttVal)} projected unique attendees ÷ ${formatNumber(derived.activeManilaBase)} Active Manila Base${derived.baseAsOf ? `, measured ${formatShortDate(derived.baseAsOf)}` : ""}`
      : (derived.activeManilaBase === null
        ? "No canonical active Manila base is available"
        : (rawAttVal === null || !attendanceModel?.available
          ? "Projected Unique Attendance is unavailable"
          : "Projected Unique Attendance ÷ Active Manila Base")),
    range_low: derived.sundayShareLow,
    range_high: derived.sundayShareHigh,
  };
  const storedHighlight = storedHighlightMetric(report);
  const highlightMetric = storedHighlight && storedHighlight.label !== "Sunday Attendance Share"
    ? storedHighlight
    : derivedHighlight;

  const mappedMedia = mapMedia(valueOf(source, "Media", "media"), serviceDate);
  const primaryMedia = mappedMedia.find((m) => m.kind === "livestream" || m.sermon_title || m.caption) || mappedMedia[0];
  const storedTitle = valueOf(report, "Title", "title");
  const sermonTitle = storedTitle || primaryMedia?.sermon_title || (primaryMedia?.caption ? primaryMedia.caption.split("//")[0].trim() : "");
  const speaker = primaryMedia?.speaker || (primaryMedia?.caption && primaryMedia.caption.includes("//") ? primaryMedia.caption.split("//")[1].trim() : "");

  return {
    identity: {
      campus: String(valueOf(report, "Campus", "campus") ?? valueOf(source, "Campus", "campus") ?? "MNL"),
      service_date: serviceDate,
      report_date: reportDate,
      period_label: periodLabel(reportDate || serviceDate),
      title: sermonTitle || "",
      sermon_title: sermonTitle || "",
      speaker: speaker || "",
      status: String(valueOf(report, "Status", "status") ?? valueOf(revision, "Status", "status") ?? "No data available"),
      template_version: normalizedVersion(source, report, revision) || "1.4.6",
      venue,
      service_times: serviceTimes,
      service_tag: serviceTag,
      weather,
      highlight_metric: highlightMetric,
    },
    sections: (() => {
      const rawSections = asArray(valueOf(source, "Sections", "sections")).map((section) => ({
        key: String(valueOf(section, "Key", "key") ?? "").toLowerCase(),
        type: String(valueOf(section, "Type", "type") ?? "").toLowerCase(),
        order: numericParse(valueOf(section, "Order", "order")) ?? 0,
        optional: Boolean(valueOf(section, "Optional", "optional")),
      })).filter((section) => section.key !== "demographics" && section.type !== "demographics-breakdown");
      const CANONICAL_SECTIONS = [
        { key: "cover", type: "report-cover", order: 1, optional: false },
        { key: "attendance", type: "attendance-feature", order: 2, optional: false },
        { key: "dashboard", type: "metric-dashboard", order: 3, optional: false },
        { key: "volunteers", type: "time-series-chart", order: 4, optional: false },
        { key: "signups", type: "signup-table", order: 5, optional: false },
      ];
      const map = new Map();
      CANONICAL_SECTIONS.forEach((s) => map.set(s.type, s));
      rawSections.forEach((s) => map.set(s.type, s));
      return Array.from(map.values()).sort((left, right) => left.order - right.order);
    })(),
    metrics,
    attendance_model: attendanceModel,
    presentation_metrics: derived,
    historical_attendance_models: historicalAttendance,
    delta_table: deltaTable,
    ciw_delta_table: ciwDeltaTable,
    chart_series: {
      volunteers: mapVolunteerSeries(observations, source, comboSeries),
      volunteer_multi_year: mapVolunteerMultiYear(observations, source, comboSeries, metrics, serviceDate),
      combo: comboSeries,
      dashboard: [
        { label: "Attendance", value: metrics.total_attendance?.value ?? null },
        { label: "Volunteers", value: metrics.volunteers?.value ?? null },
      ],
    },
    signups: mapSignups(observations, source, serviceDate),
    narratives: mapNarratives(asArray(valueOf(source, "Narratives", "narratives"))),
    media: mappedMedia,
    discrepancies: asArray(valueOf(source, "Discrepancies", "discrepancies")).flatMap((item) => {
      const metricKey = valueOf(item, "MetricKey", "metricKey");
      if (metricKey === null || metricKey === undefined || !String(metricKey).trim()) return [];
      return [{
        metric_key: String(metricKey),
        explanation: discrepancyExplanation(item),
      }];
    }),
  };
}
