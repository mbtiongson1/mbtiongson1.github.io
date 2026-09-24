/* Closed DashboardProdRead response adapter for the Connect Field island.
 *
 * The Rock wrapper embeds the registered production reads in one passive JSON
 * island. This module validates every envelope and every row against the
 * registry's declared result fields before it maps anything to the render
 * model. A response that is missing, refused, or malformed becomes an
 * `unavailable` source carrying the reason it is unavailable. It never becomes
 * a zero, and it never becomes an empty-but-successful result: those two
 * readings are different facts about the church and the island draws them
 * differently.
 *
 * Stage 1 registers exactly two queries. Demand, retention and progression have no
 * approved resolver in this release, so they are unavailable
 * by construction — their reasons travel with the payload rather than being
 * invented here, and they are named as unavailable inputs on every health
 * object so that "not measured" is never read as "healthy".
 *
 * Pure module: no DOM, no network, no globals, deterministic for a given
 * payload.
 */

export const STATE = { OK: "ok", UNAVAILABLE: "unavailable" };

export const DASHBOARD_ID = "favor-exec-connect";
export const SCHEMA_VERSION = 1;

export const QUERY_IDS = Object.freeze([
  "connect-field-groups-current",
  "connect-field-attendance-weeks",
]);

/* Registry bounds. `registered-read` refuses rather than truncates, so a
 * row count above the bound means the response did not come from the
 * registered resource and cannot be trusted. */
const RESPONSE_LIMITS = Object.freeze({
  "connect-field-groups-current": 2000,
  "connect-field-attendance-weeks": 5000,
});

/* The three occurrence states the SQL is allowed to emit. A week with no
 * AttendanceOccurrence row emits no row at all: absence of a row means "no
 * occurrence record", which is neither a missed meeting nor an expected one.
 * Any fourth value means the SQL drifted from the mapping, so the whole
 * attendance source goes unavailable rather than being partially believed. */
const OCCURRENCE_STATES = new Set(["attendance-recorded", "did-not-occur", "not-logged"]);

/* Health vocabulary. `na` and `unavailable` never win a worst-component-wins
 * comparison; they are carried so the reader can see which components were
 * actually computed. */
export const HEALTH_BANDS = Object.freeze(["critical", "thin", "watch", "healthy", "unknown"]);
const BAND_RANK = Object.freeze({ healthy: 1, watch: 2, thin: 3, critical: 4, unknown: 0, na: 0, unavailable: 0 });

/* Declared thresholds. They are constants rather than inline numbers because
 * they are policy — when the church changes what "thin" means, it changes
 * here and every reading moves together. */
export const LEADER_LOAD_THIN = 15;      // members per leader
export const LEADER_LOAD_WATCH = 12;     // members per leader
export const SILENT_WEEKS_CRITICAL = 3;  // consecutive trailing weeks with nothing logged
export const SILENT_WEEKS_THIN = 2;
export const LOGGED_RATE_WATCH = 0.67;   // share of observed weeks that were logged at all
export const ROLLUP_THIN_SHARE = 0.25;
export const ROLLUP_WATCH_SHARE = 0.25;

/* Documented hard overrides, applied in fixed order before component comparison. */
export const OVERRIDES = Object.freeze([
  Object.freeze({
    id: "unled",
    when: (group) => {
      const g = group?.group || group;
      return g.leaderCount === 0;
    },
    band: "critical",
    reason: "No Leader or Assistant Leader on record.",
  }),
  Object.freeze({
    id: "silent",
    when: (group, components) => {
      const c = group?.components || components;
      return Boolean(c?.activity && c.activity.silentStreak >= SILENT_WEEKS_CRITICAL);
    },
    band: "critical",
    reason: `${SILENT_WEEKS_CRITICAL} weeks in a row with a meeting on record and no attendance entered.`,
  }),
  Object.freeze({
    id: "collecting",
    when: (group, components, signals, band) => {
      const g = group?.group || group;
      const b = group?.band || band;
      return g.collectingMembers === true && b === "healthy";
    },
    band: "watch",
    reason: "Still collecting members, not meeting in earnest yet.",
  }),
]);

/* Reasons for the four sources that have no approved resolver in this
 * release. The payload carries the operator-authored reason; these are the
 * fallbacks used only when the payload does not carry a usable string, so the
 * island still explains itself rather than showing a bare "unavailable". */
const DEFAULT_UNAVAILABLE = Object.freeze({
  demand: "We can't yet count how many people asked to join a group against how many places there are. Nothing here is a zero — we simply don't have this number yet.",
  map: "The Plotboard draws a real OpenStreetMap basemap and resolves any locality it doesn't already know, so it does reach the network for tiles and for locality lookup. This sentence is only shown if the map couldn't start in the browser at all, in which case the locality table below is the full record and nothing is missing from it.",
  retention: "We don't track how many people stay in a group over time. Nothing here is a zero — we simply don't have this number yet.",
  progression: "We don't track people moving between groups. Nothing here is a zero — we simply don't have this number yet.",
});

/* ---------------------------------------------------------------- shapes -- */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/* Text that is safe to carry into the render model: bounded, printable, and
 * free of `//`. The `//` guard is not cosmetic — the Connect group ancestry
 * stores `Region // <person name>` and `Cluster // <person name>`, so a string
 * containing `//` is a person's name that escaped the SQL. A row carrying one
 * is malformed and the source is refused. */
function isSafeText(value, max = 200) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !value.includes("//") &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/* A Connect Group's Rock name is `<age band> // <leader>`, so the ` // ` that
 * isSafeText refuses is exactly the separator a real group name contains.
 * Operator decision 2026-09-01: display the real name. This validator is the
 * ONLY place ` // ` is permitted, and it is used only for a group's own name and
 * its parent's -- every other text field keeps isSafeText, where the separator
 * remains a privacy guard on derived canopy labels. */
function isSafeName(value, max = 200) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/* ------------------------------------------------------- field contracts -- */

/* These mirror `ops/dashboard-prod-read.json`. The row must carry exactly
 * these fields — a missing field and an unexpected extra field are both
 * malformed, because either one means the response did not come from the
 * registered resource this adapter was written against. */
const FIELD_SPECS = Object.freeze({
  "connect-field-groups-current": Object.freeze({
    groupRef: "ref",
    groupName: "name",
    campusShortCode: "campusCode",
    parentGroupRef: "nullableRef",
    parentGroupName: "nullableName",
    canopyTier: "nullableText",
    canopyBand: "nullableText",
    ageGroup: "nullableText",
    ageRange: "nullableText",
    groupTypes: "nullableTokenList",
    couplesStage: "nullableTokenList",
    youthLevel: "nullableText",
    meetupDay: "nullableText",
    meetupTime: "nullableText",
    locality: "nullableText",
    locationType: "nullableText",
    collectingMembers: "nullableFlag",
    capacity: "nullableCount",
    activeMemberCount: "count",
    leaderCount: "count",
    openSeatCount: "nullableSeats",
    asOfDate: "date",
  }),
  "connect-field-attendance-weeks": Object.freeze({
    groupRef: "ref",
    weekStartDate: "date",
    occurrenceState: "occurrenceState",
    attendanceRowCount: "count",
    didNotOccurCount: "count",
    asOfDate: "date",
  }),
});

function validField(kind, value) {
  switch (kind) {
    case "ref": return Number.isSafeInteger(value) && value > 0;
    case "nullableRef": return value === null || (Number.isSafeInteger(value) && value > 0);
    case "campusCode": return typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value);
    /* Group.Name is NOT NULL in Rock, so the group's own name is required text
     * rather than nullable; a row without it is malformed, not a row to title
     * by its database id. */
    case "name": return isSafeName(value);
    case "nullableName": return value === null || isSafeName(value);
    case "nullableText": return value === null || isSafeText(value);
    /* A token list arrives as one comma-joined normalised string. It is
     * validated as text here and split by the adapter; the raw Rock string is
     * never trusted as a single label. */
    case "nullableTokenList": return value === null || isSafeText(value, 400);
    case "nullableFlag": return value === null || typeof value === "boolean";
    case "count": return Number.isSafeInteger(value) && value >= 0;
    case "nullableCount": return value === null || (Number.isSafeInteger(value) && value >= 0);
    /* Open seats can legitimately be negative if a group is over its stated
     * capacity, so only integrality is enforced; the value itself is the
     * query's to decide. */
    case "nullableSeats": return value === null || Number.isSafeInteger(value);
    case "date": return isIsoDate(value);
    case "occurrenceState": return typeof value === "string" && OCCURRENCE_STATES.has(value);
    default: return false;
  }
}

/* ------------------------------------------------------- response reading -- */

const KIND = { NOT_REGISTERED: "not-registered", REFUSED: "refused", MALFORMED: "malformed" };

/* Reason strings are sentences a staff member can act on, so a detail carried
 * from the response is terminated properly rather than run into the next
 * sentence. */
function sentence(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function unavailableSource(queryId, kind, detail) {
  let reason;
  if (kind === KIND.NOT_REGISTERED) {
    reason = `This Rock server isn't set up to answer ${queryId}${detail ? ` (${detail})` : ""}. Nothing came back, so nothing is known — and nothing here is a zero.`;
  } else if (kind === KIND.REFUSED) {
    reason = `Rock would not answer ${queryId}${detail ? `: ${sentence(detail)}` : "."} Being turned down isn't a zero, and it isn't the same as looking and finding none.`;
  } else {
    reason = `What came back for ${queryId} wasn't the shape this page expects${detail ? ` (${detail})` : ""}. It is held back rather than turned into a number we couldn't stand behind.`;
  }
  return { status: STATE.UNAVAILABLE, kind, rows: [], asOfDate: null, reason };
}

/* A refusal object states why it refused. Any of these carriers is read, in
 * order, and only if the value is safe printable text. */
function refusalDetail(value) {
  for (const key of ["reason", "message", "error", "detail", "code"]) {
    const carried = value[key];
    if (typeof carried === "string" && isSafeText(carried, 400)) return carried;
  }
  return null;
}

/* "Not registered" and "refused" are different facts: the first says the
 * resource does not exist on this host, the second says it exists and declined
 * to answer. Operators fix them in different places, so the island says which. */
function looksNotRegistered(value, detail) {
  const haystack = `${typeof value.code === "string" ? value.code : ""} ${detail || ""}`;
  return /not[ -]registered|unregistered|unknown (query|command|resource)|no such (query|command)|command (is )?absent|not found|unrecognized/i.test(haystack);
}

function readResponse(queryId, value) {
  const limit = RESPONSE_LIMITS[queryId];

  if (value === undefined || value === null) {
    return unavailableSource(queryId, KIND.NOT_REGISTERED, "the response was absent from the island payload");
  }
  if (!isRecord(value)) {
    return unavailableSource(queryId, KIND.MALFORMED, "what came back was not readable data");
  }
  /* The deployed DashboardProdRead runtime answers success as exactly
   * {"status":"ok","queryId":…,"rows":[…]} and a refusal as
   * {"status":"refused","queryId":…,"code":…} — there is no top-level `ok`
   * boolean. Requiring one classified every live response, full rows included,
   * as refused, and the whole page rendered Unavailable (measured on prod,
   * 2026-09-01). `status` is the contract; this must match the runtime and the
   * pathways adapter, never the other way around. */
  if (value.status !== "ok") {
    const detail = refusalDetail(value);
    const kind = looksNotRegistered(value, detail) ? KIND.NOT_REGISTERED : KIND.REFUSED;
    return unavailableSource(queryId, kind, detail);
  }
  if (!hasExactKeys(value, ["status", "queryId", "rows"])) {
    return unavailableSource(queryId, KIND.MALFORMED, "the success envelope carries missing or unexpected keys");
  }
  if (value.queryId !== queryId) {
    return unavailableSource(queryId, KIND.MALFORMED, "the response belongs to a different query");
  }
  if (!Array.isArray(value.rows)) {
    return unavailableSource(queryId, KIND.MALFORMED, "Rock said the read succeeded but sent no rows");
  }
  if (value.rows.length > limit) {
    return unavailableSource(queryId, KIND.MALFORMED, `${value.rows.length} rows came back, more than the ${limit} this page is allowed to accept`);
  }
  const specs = FIELD_SPECS[queryId];
  const fields = Object.keys(specs);
  const rows = [];
  const seen = new Set();
  let asOfDate = null;

  for (let index = 0; index < value.rows.length; index += 1) {
    const row = value.rows[index];
    if (!isRecord(row) || !hasExactKeys(row, fields)) {
      return unavailableSource(queryId, KIND.MALFORMED, `row ${index} doesn't carry the fields this page expects`);
    }
    for (const field of fields) {
      if (!validField(specs[field], row[field])) {
        return unavailableSource(queryId, KIND.MALFORMED, `row ${index} has an unexpected value in ${field}`);
      }
    }

    /* One response is one snapshot, so every row must agree about when it was
     * taken. Disagreement means two runs were stitched together. */
    if (asOfDate === null) asOfDate = row.asOfDate;
    else if (row.asOfDate !== asOfDate) {
      return unavailableSource(queryId, KIND.MALFORMED, `row ${index} disagrees with the rest of the response about asOfDate`);
    }

    if (queryId === "connect-field-groups-current") {
      /* Unknown capacity is unknown, never "no open seats" and never "full".
       * A row that claims open seats without a capacity has computed them from
       * something the contract does not declare. */
      if (row.capacity === null && row.openSeatCount !== null) {
        return unavailableSource(queryId, KIND.MALFORMED, `row ${index} reports open seats for a group with no known capacity`);
      }
      if (seen.has(row.groupRef)) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${row.groupRef} appears twice in a current snapshot`);
      }
      seen.add(row.groupRef);
    } else {
      /* The three occurrence states are defined by the evidence, so the
       * counts have to agree with the state they were derived from. */
      if (row.occurrenceState === "attendance-recorded" && row.attendanceRowCount < 1) {
        return unavailableSource(queryId, KIND.MALFORMED, `row ${index} says attendance was entered but carries none`);
      }
      if (row.occurrenceState === "not-logged" && (row.attendanceRowCount !== 0 || row.didNotOccurCount !== 0)) {
        return unavailableSource(queryId, KIND.MALFORMED, `row ${index} says attendance wasn't entered but carries attendance anyway`);
      }
      const key = `${row.groupRef}:${row.weekStartDate}`;
      if (seen.has(key)) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${row.groupRef} has two rows for the week of ${row.weekStartDate}`);
      }
      seen.add(key);
    }

    rows.push({ ...row });
  }

  return {
    status: STATE.OK,
    kind: null,
    rows,
    asOfDate,
    reason: null,
    bounded: rows.length === limit,
  };
}

/* ------------------------------------------------------------ derivations -- */

/* Multi-select Rock attributes store a comma-joined string with inconsistent
 * spacing and ordering, so the joined string is never a label. Split it, trim
 * it, drop the empties, dedupe it, and sort it, so that two groups with the
 * same selection always produce the same token list. */
function tokens(value) {
  if (typeof value !== "string") return [];
  const unique = new Set();
  for (const part of value.split(",")) {
    const token = part.trim();
    if (token.length > 0) unique.add(token);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function worst(bands) {
  let band = "healthy";
  for (const candidate of bands) {
    if (BAND_RANK[candidate] > BAND_RANK[band]) band = candidate;
  }
  return band;
}

/* Leadership coverage. Computable for every group, because leaderCount is a
 * non-nullable declared field. An unled group is the one hard critical in this
 * release: it is a fact, not a score. */
function leadershipComponent(group) {
  if (group.leaderCount === 0) {
    return { band: "critical", reason: "no leader on record", membersPerLeader: null };
  }
  const load = group.activeMemberCount / group.leaderCount;
  const membersPerLeader = round(load, 2);
  if (load >= LEADER_LOAD_THIN) {
    return { band: "thin", reason: `${membersPerLeader} members per leader`, membersPerLeader };
  }
  if (load >= LEADER_LOAD_WATCH) {
    return { band: "watch", reason: `${membersPerLeader} members per leader`, membersPerLeader };
  }
  return { band: "healthy", reason: `${membersPerLeader} members per leader`, membersPerLeader };
}

/* Capacity signal, only where capacity is actually known. Capacity is an
 * operating context signal, never a health component, so it never contributes
 * to the composite band. */
function capacitySignal(group) {
  if (group.capacity === null) {
    return { band: "unavailable", reason: "no capacity is set on this group in Rock", openSeatCount: group.openSeatCount };
  }
  if (group.activeMemberCount > group.capacity) {
    return { band: "over", reason: `${group.activeMemberCount} members against a capacity of ${group.capacity}`, openSeatCount: group.openSeatCount };
  }
  if (group.openSeatCount !== null && group.openSeatCount <= 0) {
    return { band: "full", reason: "no open seats", openSeatCount: group.openSeatCount };
  }
  if (group.openSeatCount === null) {
    return { band: "open", reason: `${group.activeMemberCount} members against a capacity of ${group.capacity}`, openSeatCount: group.openSeatCount };
  }
  return { band: "open", reason: `${group.openSeatCount} open seats`, openSeatCount: group.openSeatCount };
}
const capacityComponent = capacitySignal;

/* Activity evidence over the weeks that actually have an occurrence record.
 * A group with no occurrence rows at all has no evidence either way, so it is
 * unknown — never critical, and never healthy. */
function activityComponent(summary, sourceReason) {
  if (summary === null) {
    return {
      band: "unavailable",
      reason: sourceReason || "we couldn't load attendance from Rock",
      silentStreak: null,
      loggedRate: null,
      observedWeeks: null,
    };
  }
  if (summary.observedWeeks === 0) {
    return {
      band: "unavailable",
      reason: "no meeting on record anywhere in this window",
      silentStreak: 0,
      loggedRate: null,
      observedWeeks: 0,
    };
  }
  if (summary.silentStreak >= SILENT_WEEKS_CRITICAL) {
    return {
      band: "critical",
      reason: `${summary.silentStreak} weeks in a row with no attendance entered`,
      silentStreak: summary.silentStreak,
      loggedRate: summary.loggedRate,
      observedWeeks: summary.observedWeeks,
    };
  }
  if (summary.silentStreak >= SILENT_WEEKS_THIN) {
    return {
      band: "thin",
      reason: `${summary.silentStreak} weeks in a row with no attendance entered`,
      silentStreak: summary.silentStreak,
      loggedRate: summary.loggedRate,
      observedWeeks: summary.observedWeeks,
    };
  }
  if (summary.loggedRate < LOGGED_RATE_WATCH) {
    return {
      band: "watch",
      reason: `attendance entered for ${Math.round(summary.loggedRate * 100)}% of the ${summary.observedWeeks} weeks with a meeting on record`,
      silentStreak: summary.silentStreak,
      loggedRate: summary.loggedRate,
      observedWeeks: summary.observedWeeks,
    };
  }
  return {
    band: "healthy",
    reason: `attendance entered for ${Math.round(summary.loggedRate * 100)}% of the ${summary.observedWeeks} weeks with a meeting on record`,
    silentStreak: summary.silentStreak,
    loggedRate: summary.loggedRate,
    observedWeeks: summary.observedWeeks,
  };
}

/* Collecting members is an operating signal, not health. A group still
 * collecting members has not started meeting in earnest. */
function collectingSignal(group) {
  if (group.collectingMembers === null) {
    return { value: null, reason: "Rock doesn't say whether this group is still collecting members" };
  }
  if (group.collectingMembers === true) {
    return { value: true, reason: "still collecting members" };
  }
  return { value: false, reason: "not collecting members" };
}

function compositeLeadershipReason(leadership) {
  if (leadership.membersPerLeader === null) return "No Leader or Assistant Leader on record.";
  return `${leadership.membersPerLeader} members per leader.`;
}

function compositeActivityReason(activity) {
  if (activity.silentStreak !== null && activity.silentStreak >= SILENT_WEEKS_CRITICAL) {
    return `${activity.silentStreak} weeks in a row with a meeting on record and no attendance entered.`;
  }
  if (activity.silentStreak !== null && activity.silentStreak >= SILENT_WEEKS_THIN) {
    return `${activity.silentStreak} weeks in a row with a meeting on record and no attendance entered.`;
  }
  if (activity.loggedRate !== null && activity.loggedRate < LOGGED_RATE_WATCH) {
    return `Attendance entered for ${Math.round(activity.loggedRate * 100)}% of the ${activity.observedWeeks} weeks with a meeting on record.`;
  }
  if (activity.observedWeeks === 0) {
    return "No meeting on record anywhere in this window.";
  }
  const s = activity.reason || "";
  if (!s) return "We couldn't load attendance from Rock.";
  return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith(".") ? "" : ".");
}

function buildHealth(group, summary, attendanceReason, unavailableReasons) {
  const leadership = leadershipComponent(group);
  const activity = activityComponent(summary, attendanceReason);
  const retention = {
    band: "unavailable",
    reason: (unavailableReasons && unavailableReasons.retention) || DEFAULT_UNAVAILABLE.retention,
  };
  const progression = {
    band: "unavailable",
    reason: (unavailableReasons && unavailableReasons.progression) || DEFAULT_UNAVAILABLE.progression,
  };

  const components = {
    leadership,
    activity,
    retention,
    progression,
  };

  const signals = {
    capacity: capacitySignal(group),
    collecting: collectingSignal(group),
  };

  let band;
  let override = null;
  const reasons = [];

  // Composite order per §5.2:
  // 1. Override unled
  if (OVERRIDES[0].when(group, components, signals)) {
    override = OVERRIDES[0].id;
    band = OVERRIDES[0].band;
    reasons.push(OVERRIDES[0].reason);
  // 2. Override silent
  } else if (OVERRIDES[1].when(group, components, signals)) {
    override = OVERRIDES[1].id;
    band = OVERRIDES[1].band;
    reasons.push(OVERRIDES[1].reason);
  // 3. Unknown: activity.band === "unavailable"
  } else if (activity.band === "unavailable") {
    band = "unknown";
    reasons.push(compositeActivityReason(activity));
  // 4. Worst of leadership and activity
  } else {
    const candidateBand = worst([leadership.band, activity.band]);
    // 5. Override collecting: still collecting and band is Healthy -> Watch, reason first
    if (candidateBand === "healthy" && OVERRIDES[2].when(group, components, signals, candidateBand)) {
      override = OVERRIDES[2].id;
      band = OVERRIDES[2].band;
      reasons.push(OVERRIDES[2].reason);
    } else {
      band = candidateBand;
      if (candidateBand === leadership.band && candidateBand !== "healthy") {
        reasons.push(compositeLeadershipReason(leadership));
      }
      if (candidateBand === activity.band && candidateBand !== "healthy") {
        reasons.push(compositeActivityReason(activity));
      }
    }
  }

  // 6. partial = band === "healthy" && some component is unavailable
  const hasUnavailable = Object.values(components).some((c) => c.band === "unavailable");
  const partial = band === "healthy" && hasUnavailable;
  if (band === "healthy") {
    reasons.unshift(partial ? "Healthy on the signals we have." : "Healthy across all measured components.");
  }

  return {
    band,
    partial,
    override,
    reasons,
    components,
    signals,
  };
}

/* --------------------------------------------------------- weekly summary -- */

function summariseGroupWeeks(rows) {
  const ordered = [...rows].sort((left, right) => left.weekStartDate.localeCompare(right.weekStartDate));
  let attendanceRecordedWeeks = 0;
  let didNotOccurWeeks = 0;
  let notLoggedWeeks = 0;
  let attendanceRowCount = 0;
  for (const row of ordered) {
    if (row.occurrenceState === "attendance-recorded") attendanceRecordedWeeks += 1;
    else if (row.occurrenceState === "did-not-occur") didNotOccurWeeks += 1;
    else notLoggedWeeks += 1;
    attendanceRowCount += row.attendanceRowCount;
  }
  /* The silent streak is the trailing run of weeks that had an occurrence and
   * nothing logged against it. A week with no occurrence record breaks nothing
   * and proves nothing, so it simply is not in this list. */
  let silentStreak = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index].occurrenceState !== "not-logged") break;
    silentStreak += 1;
  }
  const observedWeeks = ordered.length;
  return {
    observedWeeks,
    attendanceRecordedWeeks,
    didNotOccurWeeks,
    notLoggedWeeks,
    attendanceRowCount,
    loggedRate: observedWeeks === 0 ? null : round((attendanceRecordedWeeks + didNotOccurWeeks) / observedWeeks, 4),
    silentStreak,
    firstWeekStartDate: observedWeeks === 0 ? null : ordered[0].weekStartDate,
    lastWeekStartDate: observedWeeks === 0 ? null : ordered[observedWeeks - 1].weekStartDate,
    weeks: ordered.map((row) => ({
      weekStartDate: row.weekStartDate,
      occurrenceState: row.occurrenceState,
      attendanceRowCount: row.attendanceRowCount,
      didNotOccurCount: row.didNotOccurCount,
    })),
  };
}

/* The church-wide weekly series. Every observed group-week is one observation;
 * a week where a group had no occurrence record contributes nothing, so the
 * denominator is what was observed rather than what was hoped for. */
function buildWeeks(rows) {
  const byWeek = new Map();
  for (const row of rows) {
    let week = byWeek.get(row.weekStartDate);
    if (!week) {
      week = {
        weekStartDate: row.weekStartDate,
        groupsObserved: 0,
        attendanceRecorded: 0,
        didNotOccur: 0,
        notLogged: 0,
        attendanceRowCount: 0,
        loggedRate: null,
      };
      byWeek.set(row.weekStartDate, week);
    }
    week.groupsObserved += 1;
    week.attendanceRowCount += row.attendanceRowCount;
    if (row.occurrenceState === "attendance-recorded") week.attendanceRecorded += 1;
    else if (row.occurrenceState === "did-not-occur") week.didNotOccur += 1;
    else week.notLogged += 1;
  }
  const weeks = [...byWeek.values()].sort((left, right) => left.weekStartDate.localeCompare(right.weekStartDate));
  for (const week of weeks) {
    week.loggedRate = week.groupsObserved === 0
      ? null
      : round((week.attendanceRecorded + week.didNotOccur) / week.groupsObserved, 4);
  }
  return weeks;
}

/* ------------------------------------------------------------- localities -- */

function localityRow(locality, notMapped) {
  return {
    locality,
    notMapped,
    groupCount: 0,
    leaderCount: 0,
    activeMemberCount: 0,
    capacityKnownCount: 0,
    capacityUnknownCount: 0,
    openSeatCount: 0,
    bands: { critical: 0, thin: 0, watch: 0, healthy: 0, unknown: 0 },
  };
}

/* Groups whose locality is free text that nobody filled in are counted, but
 * they are counted apart: folding them into a named locality would invent a
 * place, and dropping them would quietly shrink the denominator. They are
 * their own row, flagged `notMapped`, always last. */
function buildLocalities(groups) {
  const byLocality = new Map();
  const unmapped = localityRow(null, true);
  for (const group of groups) {
    let row = unmapped;
    if (group.locality !== null) {
      row = byLocality.get(group.locality);
      if (!row) {
        row = localityRow(group.locality, false);
        byLocality.set(group.locality, row);
      }
    }
    row.groupCount += 1;
    row.leaderCount += group.leaderCount;
    row.activeMemberCount += group.activeMemberCount;
    if (group.capacity === null) row.capacityUnknownCount += 1;
    else row.capacityKnownCount += 1;
    if (group.openSeatCount !== null && group.openSeatCount > 0) row.openSeatCount += group.openSeatCount;
    row.bands[group.health.band] += 1;
  }
  const rows = [...byLocality.values()].sort((left, right) => left.locality.localeCompare(right.locality));
  if (unmapped.groupCount > 0) rows.push(unmapped);
  return rows;
}

/* ------------------------------------------------------------ the payload -- */

function readUnavailableReasons(payload) {
  const carried = isRecord(payload) && isRecord(payload.unavailable) ? payload.unavailable : {};
  const reasons = {};
  for (const key of Object.keys(DEFAULT_UNAVAILABLE)) {
    const value = carried[key];
    reasons[key] = typeof value === "string" && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
      ? value
      : DEFAULT_UNAVAILABLE[key];
  }
  return reasons;
}

const NO_SCOPE_REASON = "Your account is allowed on this page but resolves no Connect campus scope. This is an access condition, not an empty field.";

function emptyModel(reason, unavailableReasons) {
  return {
    groups: [],
    localities: [],
    weeks: [],
    meta: { asOfDate: null, campuses: [], groupCount: null, accessNoScope: false },
    availability: {
      groups: STATE.UNAVAILABLE,
      attendance: STATE.UNAVAILABLE,
      demand: STATE.UNAVAILABLE,
      map: STATE.OK,
      retention: STATE.UNAVAILABLE,
      progression: STATE.UNAVAILABLE,
    },
    reasons: {
      groups: reason,
      attendance: reason,
      demand: unavailableReasons.demand,
      map: unavailableReasons.map,
      retention: unavailableReasons.retention,
      progression: unavailableReasons.progression,
    },
  };
}

/**
 * Validate one Connect Field island payload and build the render model.
 *
 * Always returns the full model shape. A payload that is not the closed
 * production shape returns a model whose sources are all unavailable and whose
 * reasons say why; it never throws, and it never substitutes a zero for an
 * absent fact.
 */
export function buildModel(payload) {
  const unavailableReasons = readUnavailableReasons(payload);

  if (!isRecord(payload)) {
    return emptyModel("The Connect Field page did not receive any data from Rock at all, so there's nothing to read. Nothing here is a zero.", unavailableReasons);
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return emptyModel(`The data this page received is a version it cannot read (${JSON.stringify(payload.schemaVersion)}, where it expects ${SCHEMA_VERSION}). It is held back rather than half-read.`, unavailableReasons);
  }
  if (payload.dashboardId !== DASHBOARD_ID) {
    return emptyModel(`The data this page received belongs to a different page (${JSON.stringify(payload.dashboardId)}, where it expects ${DASHBOARD_ID}), so none of it is shown here.`, unavailableReasons);
  }

  const responses = isRecord(payload.responses) ? payload.responses : {};
  const groupsResult = readResponse("connect-field-groups-current", responses["connect-field-groups-current"]);
  const attendanceResult = readResponse("connect-field-attendance-weeks", responses["connect-field-attendance-weeks"]);

  /* Attendance rows for groups that are not in the current snapshot are not an
   * error — a group can be archived between the two reads — but they are not
   * part of this picture either, so they are left out of both the per-group
   * summaries and the church-wide series rather than inflating a denominator
   * the groups list cannot explain. */
  const known = groupsResult.status === STATE.OK ? new Set(groupsResult.rows.map((row) => row.groupRef)) : null;
  const attendanceRows = attendanceResult.status === STATE.OK
    ? attendanceResult.rows.filter((row) => known === null || known.has(row.groupRef))
    : [];

  const weeksByGroup = new Map();
  for (const row of attendanceRows) {
    const bucket = weeksByGroup.get(row.groupRef);
    if (bucket) bucket.push(row);
    else weeksByGroup.set(row.groupRef, [row]);
  }

  const groups = groupsResult.status === STATE.OK
    ? groupsResult.rows
      .map((row) => {
        const summary = attendanceResult.status === STATE.OK
          ? summariseGroupWeeks(weeksByGroup.get(row.groupRef) || [])
          : null;
        const group = {
          groupRef: row.groupRef,
          groupName: row.groupName,
          campusShortCode: row.campusShortCode,
          parentGroupRef: row.parentGroupRef,
          parentGroupName: row.parentGroupName,
          canopyTier: row.canopyTier,
          canopyBand: row.canopyBand,
          ageGroup: row.ageGroup,
          ageRange: row.ageRange,
          groupTypes: tokens(row.groupTypes),
          couplesStages: tokens(row.couplesStage),
          youthLevel: row.youthLevel,
          meetupDay: row.meetupDay,
          meetupTime: row.meetupTime,
          locality: row.locality,
          locationType: row.locationType,
          collectingMembers: row.collectingMembers,
          capacity: row.capacity,
          activeMemberCount: row.activeMemberCount,
          leaderCount: row.leaderCount,
          openSeatCount: row.openSeatCount,
          asOfDate: row.asOfDate,
          attendance: summary,
          health: null,
        };
        group.health = buildHealth(group, summary, attendanceResult.reason, unavailableReasons);
        return group;
      })
      .sort((left, right) => left.groupRef - right.groupRef)
    : [];

  const CAMPUS_SORT_ORDER = { MNL: 1, BNE: 2, SEL: 3, ALL: 4 };
  const compareCampuses = (a, b) => {
    const rankA = CAMPUS_SORT_ORDER[String(a).toUpperCase()] || 99;
    const rankB = CAMPUS_SORT_ORDER[String(b).toUpperCase()] || 99;
    return rankA - rankB || String(a).localeCompare(String(b));
  };

  const campuses = [...groups.reduce((counts, group) => {
    counts.set(group.campusShortCode, (counts.get(group.campusShortCode) || 0) + 1);
    return counts;
  }, new Map())]
    .map(([shortCode, groupCount]) => ({ shortCode, groupCount }))
    .sort((left, right) => compareCampuses(left.shortCode, right.shortCode));

  const accessNoScope = payload.mode === "live" && groupsResult.status === STATE.OK && groups.length === 0;

  return {
    groups,
    localities: groupsResult.status === STATE.OK ? buildLocalities(groups) : [],
    weeks: attendanceResult.status === STATE.OK ? buildWeeks(attendanceRows) : [],
    meta: {
      asOfDate: groupsResult.asOfDate || attendanceResult.asOfDate || null,
      campuses,
      /* The denominator. Present whenever the groups read is usable — including
       * when it is honestly zero — and null when it is not, so nothing
       * downstream can divide by an absence. */
      groupCount: groupsResult.status === STATE.OK ? groups.length : null,
      accessNoScope,
    },
    availability: {
      groups: groupsResult.status,
      attendance: attendanceResult.status,
      demand: STATE.UNAVAILABLE,
      map: STATE.OK,
      retention: STATE.UNAVAILABLE,
      progression: STATE.UNAVAILABLE,
    },
    reasons: {
      groups: accessNoScope ? NO_SCOPE_REASON : groupsResult.reason,
      attendance: attendanceResult.reason,
      demand: unavailableReasons.demand,
      map: unavailableReasons.map,
      retention: unavailableReasons.retention,
      progression: unavailableReasons.progression,
    },
  };
}

/* ----------------------------------------------------------- rollups -- */

/**
 * Rollup health band and deciding pressure for an aggregate of groups.
 * Plan of record §5.3.
 */
export function rollupBands(histogram = {}, pressureCounts = {}) {
  const critical = Number(histogram.critical) || 0;
  const thin = Number(histogram.thin) || 0;
  const watch = Number(histogram.watch) || 0;
  const healthy = Number(histogram.healthy) || 0;

  const judged = critical + thin + watch + healthy;
  let band;
  let share = null;

  if (critical > 0) {
    band = "critical";
    share = judged > 0 ? round(critical / judged, 4) : 1;
  } else if (judged === 0) {
    band = "unknown";
    share = null;
  } else if (thin / judged >= ROLLUP_THIN_SHARE) {
    band = "thin";
    share = round(thin / judged, 4);
  } else if ((thin + watch) / judged >= ROLLUP_WATCH_SHARE) {
    band = "watch";
    share = round((thin + watch) / judged, 4);
  } else {
    band = "healthy";
    share = round(healthy / judged, 4);
  }

  let pressure = null;
  if (isRecord(pressureCounts)) {
    let maxCount = 0;
    for (const [key, count] of Object.entries(pressureCounts)) {
      if (typeof count === "number" && count > maxCount) {
        maxCount = count;
        pressure = key;
      }
    }
  }

  return { band, pressure, share };
}

