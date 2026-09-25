/* Closed DashboardProdRead response adapter for the Grow Continuity island.
 *
 * The Rock wrapper server-renders the registered production reads into one
 * passive JSON island. This module validates every envelope and every row
 * against the registry's declared result fields (BUILD-CONTRACT section 3)
 * before it maps anything into the view model (BUILD-CONTRACT section 8). A
 * response that is absent, refused, or malformed becomes a named read failure
 * carrying the reason it failed; it never collapses into a zero. The adapter
 * accepts empty successful domain reads when no occurrences have run yet, but
 * a held batch missing its continuity ladder is still malformed downstream.
 *
 * Three readings are kept apart on purpose and must never collapse into each
 * other:
 *
 *   null      baseline, or not applicable. Session 1 has no previous session,
 *             so newOrReentry, droppedSincePrevious, perfectThroughSession and
 *             uniqueReachToDate are all null there (contract section 8.1). The
 *             view writes the word "baseline", never 0.
 *   "?"       Rock does not carry this yet: the ghost of ADR 0018. Never a
 *             dash, never a zero, never the word Unavailable.
 *   failure   { reason, queryId, kind }. The whole chapter that depends on the
 *             query renders as a named read failure and says why.
 *
 * Pure module: no DOM, no globals, no network of any kind, deterministic for a
 * given payload. The island never reaches out; it reads what the wrapper has
 * already rendered onto the page.
 */

export const STATE = { OK: "ok", UNAVAILABLE: "unavailable" };

export const DASHBOARD_ID = "favor-exec-grow";
export const SCHEMA_VERSION = 1;

/* The fictional flag reads exactly this, and nothing else. */
export const FICTIONAL_NOTICE = "Fictional prototype data.";

/* ADR 0018: a not-yet-measured reading is this glyph. It is not a dash, it is
 * not a zero, and it is not the same thing as a read failure. */
export const GHOST = "?";

export const QUERY_IDS = Object.freeze([
  "grow-session-attendance",
  "grow-session-continuity",
  "grow-completion-tiers",
  "grow-core-pipeline",
  "grow-graduate-census",
  "grow-agreement",
  "grow-calendar",
]);

/* Registry bounds, contract section 3. `registered-read` refuses rather
 * than truncates, so a row count above the bound means the response did not
 * come from the registered resource and cannot be trusted. */
export const RESPONSE_LIMITS = Object.freeze({
  "grow-session-attendance": 400,
  "grow-session-continuity": 400,
  "grow-completion-tiers": 400,
  "grow-core-pipeline": 100,
  "grow-graduate-census": 20,
  "grow-agreement": 50,
  "grow-calendar": 50,
});

/* The six state words, exactly. The view asserts the word is present as text,
 * never colour alone (plan section 13 check 5). */
export const STATE_WORDS = Object.freeze({
  HEALTHY: "Healthy",
  WATCH: "Watch",
  THIN: "Thin",
  CRITICAL: "Critical",
  NOT_STARTED: "Not started",
  NOT_ENOUGH_HISTORY: "Not enough history",
});

/* Plan section 6.5. These two are the only hand-set numbers in the health
 * model, and the plan sets them: every cut point is a quartile of the season's
 * own completed batches, re-derived on every read. */
export const MIN_SESSIONS_TO_JUDGE = 2;
export const MIN_BATCHES_TO_DERIVE = 4;

/* Plan section 6.4 categories: the only values `grow-agreement.category` may
 * carry. A sixth value means the SQL drifted from the mapping. */
const AGREEMENT_CATEGORIES = Object.freeze([
  "agree", "boardAhead", "groupAhead", "onBoardNotInGroup", "inGroupNotOnBoard",
]);

/* Rock's ConnectionState is an enum integer, and the landed SQL passes it
 * through unmapped: 0 Active, 1 Inactive, 2 FutureFollowUp, 3 Connected. It is
 * part of the query's grain rather than a filter, so Active is counted as open
 * while Inactive and Connected stay their own quiet rows. Reading it as a
 * string would have refused every live pipeline response. */
export const CONNECTION_STATE = Object.freeze({ ACTIVE: 0, INACTIVE: 1, FUTURE_FOLLOW_UP: 2, CONNECTED: 3 });
const CONNECTION_STATE_CODES = new Set(Object.values(CONNECTION_STATE));

/* Plan D8. Steps are schema, not data, until they are data: they appear once,
 * in the colophon, and nowhere else. */
export const STEPS_SENTENCE = "Native Steps will replace the graduate attributes once person Step records exist.";

/* Projection of `ops/grow-courses.json`, the course registry. The runtime reads
 * the registry as data (plan section 6.3) and nothing here is guessed at run
 * time: labels, planned session counts, opportunity ids, schedule ids, status
 * labels and the board link pattern all come from that file. Hues are
 * deliberately absent -- course identity hues are island-local CSS (contract
 * section 5), never data, and never a state. */
export const COURSE_REGISTRY = Object.freeze({
  campuses: ["MNL", "BNE", "SEL", "ALL"],
  seasons: ["2026"],
  scheduleCategoryId: 483,
  connectionTypeIds: [2, 26],
  boardPagePattern: "/page/407?ConnectionOpportunityId={opportunityId}",
  courses: [
    { slug: "build", label: "Build", family: "core", sessionsPlanned: 2, connectionOpportunityId: 8, scheduleIds: [335], statusLabels: { 3: "New signup", 7: "Attended session 1", 8: "Attended session 2", 20: "Attended Saturday session 1", 113: "Build graduated" }, batches: [{ season: "2026", campus: "MNL", groupId: 32477, kind: "graduation", label: "Build Graduation 2026-06-20" }] },
    { slug: "favor-dna", label: "Favor DNA", family: "core", sessionsPlanned: 2, connectionOpportunityId: 4, scheduleIds: [], statusLabels: { 3: "New signup", 7: "Attended session 1", 8: "Graduated", 20: "Attended Saturday session 1" }, batches: [] },
    { slug: "upnext", label: "UPNext", family: "core", sessionsPlanned: null, connectionOpportunityId: 37, scheduleIds: [], statusLabels: { 162: "New signup", 163: "Participating" }, batches: [] },
    { slug: "healthy-relationships", label: "Healthy Relationships", family: "elective", sessionsPlanned: 4, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 32479, firstOccurrence: "2026-06-09", lastOccurrence: "2026-06-30" }] },
    { slug: "stewarding-your-finances", label: "Stewarding Your Finances", family: "elective", sessionsPlanned: 3, connectionOpportunityId: null, scheduleIds: [336], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 42383, firstOccurrence: "2026-07-28", lastOccurrence: "2026-08-11", completionStatus: "pending-schedule-reconciliation" }] },
    { slug: "favored-and-free", label: "Favored & Free", family: "elective", sessionsPlanned: 5, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 32478, firstOccurrence: "2026-05-21", lastOccurrence: "2026-06-18" }] },
    { slug: "prophetic-culture", label: "Prophetic Culture", family: "elective", sessionsPlanned: 4, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 32480, firstOccurrence: "2026-05-19", lastOccurrence: "2026-05-26" }] },
    { slug: "bible-masterclass", label: "Bible Masterclass", family: "elective", sessionsPlanned: 2, connectionOpportunityId: null, scheduleIds: [476], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 32475, firstOccurrence: "2026-05-19", lastOccurrence: "2026-05-26" }, { season: "2026", campus: "MNL", groupId: null, scheduleId: 476, firstOccurrence: "2026-09-29", plannedDates: ["2026-09-29", "2026-10-06", "2026-10-13"] }] },
    { slug: "bible-essentials", label: "Bible Essentials", family: "elective", sessionsPlanned: 3, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 96607, groupTypeId: 46 }] },
    { slug: "gifts-of-the-holy-spirit", label: "Gifts of the Holy Spirit", family: "elective", sessionsPlanned: 4, connectionOpportunityId: null, scheduleIds: [475], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 96604, groupTypeId: 46, scheduleId: 475, firstOccurrence: "2026-08-25", plannedDates: ["2026-08-25", "2026-09-01", "2026-09-08", "2026-09-15"] }] },
    { slug: "presence-filled-life", label: "Presence-Filled Life", family: "elective", sessionsPlanned: 4, connectionOpportunityId: null, scheduleIds: [478], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 96605, groupTypeId: 46, scheduleId: 478, plannedDates: ["2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17"] }] },
    { slug: "influencing-your-world", label: "Influencing Your World", family: "elective", sessionsPlanned: 4, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 96608, groupTypeId: 46 }] },
    { slug: "freedom-encounter", label: "Freedom Encounter", family: "elective", sessionsPlanned: 1, connectionOpportunityId: null, scheduleIds: [479], statusLabels: {}, batches: [{ season: "2026", campus: "MNL", groupId: 96606, groupTypeId: 46, scheduleId: 479, plannedDates: ["2026-12-12"] }] },
    { slug: "before-forever", label: "Before Forever", family: "elective", sessionsPlanned: 1, connectionOpportunityId: 31, scheduleIds: [], statusLabels: {}, batches: [] },
    { slug: "spiritual-disciplines", label: "Spiritual Disciplines", family: "elective", sessionsPlanned: 1, connectionOpportunityId: null, scheduleIds: [337], statusLabels: {}, batches: [] },
    { slug: "deliverance-masterclass", label: "Deliverance Masterclass", family: "elective", sessionsPlanned: 1, connectionOpportunityId: null, scheduleIds: [], statusLabels: {}, batches: [] },
    { slug: "how-to-read-my-bible", label: "How to Read My Bible", family: "elective", sessionsPlanned: 1, connectionOpportunityId: null, scheduleIds: [477], statusLabels: {}, batches: [] },
  ],
});

const COURSE_BY_SLUG = new Map(COURSE_REGISTRY.courses.map((course) => [course.slug, course]));
const COURSE_BY_GROUP_ID = new Map();
const COURSE_BY_SCHEDULE_ID = new Map();
const COURSE_BY_OPPORTUNITY_ID = new Map();
const BATCH_BY_GROUP_ID = new Map();
/* A batch not yet begun carries no Rock group, only the schedule that will produce
 * one -- bible-masterclass's second batch (grow-source.mjs:119) is exactly this
 * shape. This is the other half of a batch's identity, alongside groupRef, so the
 * season rail can tell "batch finished" from "batch not yet started" even for a
 * course whose registry lists more than one batch. */
const BATCH_BY_SCHEDULE_ID = new Map();
for (const course of COURSE_REGISTRY.courses) {
  for (const batch of course.batches) {
    if (Number.isSafeInteger(batch.groupId)) {
      COURSE_BY_GROUP_ID.set(batch.groupId, course);
      BATCH_BY_GROUP_ID.set(batch.groupId, batch);
    }
    if (Number.isSafeInteger(batch.scheduleId)) BATCH_BY_SCHEDULE_ID.set(batch.scheduleId, batch);
  }
  for (const scheduleId of course.scheduleIds) COURSE_BY_SCHEDULE_ID.set(scheduleId, course);
  if (Number.isSafeInteger(course.connectionOpportunityId)) {
    COURSE_BY_OPPORTUNITY_ID.set(course.connectionOpportunityId, course);
  }
}

const UPNEXT_OPPORTUNITY_ID = COURSE_BY_SLUG.get("upnext").connectionOpportunityId;

/* ---------------------------------------------------------------- shapes -- */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/* Text safe to carry into the view: bounded, printable, and free of the `//`
 * separator Rock group names use to append a person's name. A string carrying
 * one is a name that escaped the SQL, so the row is malformed and the whole
 * source is refused. Grow reads no group names at all, so unlike Connect there
 * is no exemption to this rule anywhere in this adapter. */
function isSafeText(value, max = 200) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !value.includes("//") &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/* Rock hands instants back either as an ISO date or as a full timestamp. Both
 * are read; only the date part is ever displayed. */
function isIsoInstant(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value) &&
    isIsoDate(value.slice(0, 10))
  );
}

/* ------------------------------------------------------- field contracts -- */

/* These mirror BUILD-CONTRACT section 3, which mirrors the landed SQL. A row
 * must carry exactly these fields: a missing field and an unexpected extra
 * field are both malformed, because either one means the response did not come
 * from the registered resource this adapter was written against. A rename here
 * would ghost a whole section silently, which is precisely what the exact-key
 * check exists to prevent. */
const FIELD_SPECS = Object.freeze({
  /* `attended` here is THE ROOM -- a row count of DidAttend = 1 -- and
   * `people` beside it is COUNT(DISTINCT PersonId). Contract section 3.1. */
  "grow-session-attendance": Object.freeze({
    groupRef: "ref",
    occurrenceDate: "date",
    /* Only occurrences that were HELD are numbered. A cancelled occurrence
     * still emits a row, with a null sessionIndex, so the cancellation stays
     * visible without shifting every later session's number. */
    sessionIndex: "nullableSessionIndex",
    attended: "count",
    people: "count",
    /* A Rock bit, converted to int by the SQL: 0 or 1, never a boolean. */
    didNotOccur: "bit",
  }),
  /* `attended` here is PEOPLE -- COUNT(DISTINCT PersonId) -- and there is no
   * separate `people` field. The ladder is forced to be a person read by its
   * own invariant: returned and new are person-set cardinalities, so their sum
   * is |S_n| and nothing else. Contract section 3.1. */
  "grow-session-continuity": Object.freeze({
    groupRef: "ref",
    sessionIndex: "sessionIndex",
    attended: "count",
    returnedFromPrevious: "count",
    newOrReentry: "nullableCount",
    droppedSincePrevious: "nullableCount",
    perfectThroughSession: "nullableCount",
    uniqueReachToDate: "nullableCount",
  }),
  "grow-completion-tiers": Object.freeze({
    groupRef: "ref",
    sessionsAttended: "tierIndex",
    people: "count",
    sessionsHeld: "count",
    uniqueReach: "count",
  }),
  "grow-core-pipeline": Object.freeze({
    opportunityId: "ref",
    statusId: "ref",
    connectionState: "connectionStateCode",
    opportunityName: "text",
    statusOrder: "order",
    requests: "count",
    oldestCreated: "nullableInstant",
    newestModified: "nullableInstant",
  }),
  "grow-graduate-census": Object.freeze({
    /* People with no campus recorded group into one row whose campus is null,
     * which the surface renders as a ghost rather than as a campus. */
    campusShortCode: "nullableCampusCode",
    buildGraduates: "count",
    dnaGraduates: "count",
    completedBoth: "count",
    bibleMasterclass: "count",
  }),
  "grow-agreement": Object.freeze({
    opportunityId: "ref",
    category: "agreementCategory",
    people: "count",
  }),
  "grow-calendar": Object.freeze({
    scheduleId: "ref",
    scheduleName: "text",
    iCalendarContent: "nullableIcalText",
    effectiveStartDate: "nullableInstant",
    effectiveEndDate: "nullableInstant",
    isActive: "bit",
  }),
});

function validField(kind, value) {
  switch (kind) {
    case "ref": return Number.isSafeInteger(value) && value > 0;
    case "sessionIndex": return Number.isSafeInteger(value) && value >= 1 && value <= 400;
    case "nullableSessionIndex": return value === null || (Number.isSafeInteger(value) && value >= 1 && value <= 400);
    /* A completion tier of 0 sessions attended is a legal group-summary row,
     * so zero is allowed here where a session index's is not. */
    case "tierIndex": return Number.isSafeInteger(value) && value >= 0 && value <= 400;
    case "count": return Number.isSafeInteger(value) && value >= 0;
    case "nullableCount": return value === null || (Number.isSafeInteger(value) && value >= 0);
    case "order": return Number.isSafeInteger(value) && value >= 0;
    case "flag": return typeof value === "boolean";
    /* Rock stores these as `bit` and the SQL converts to int, so 0 and 1 are
     * the only readings. A boolean here would mean the response did not come
     * from the registered resource. */
    case "bit": return value === 0 || value === 1;
    case "text": return isSafeText(value);
    /* An iCalendar body is multi-line by nature, so the printable guard is
     * relaxed for CR and LF only. */
    case "nullableIcalText": return value === null || validField("icalText", value);
    case "icalText": return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 8000 &&
      /* This guard keeps a scheme-qualified URL (http://, https://, javascript://, ...) out of
       * the field -- it has to test for colon-slash-slash, not bare "//". Every Rock iCalendar
       * body opens with a PRODID line ("-//github.com/SparkDevNetwork/Rock//NONSGML Rock//EN")
       * that carries "//" three times over but never "://", so a bare "//" test rejected every
       * calendar row Rock will ever produce. */
      !/:\/\//.test(value) &&
      !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    );
    case "campusCode": return typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value);
    case "nullableCampusCode": return value === null || (typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value));
    case "date": return isIsoDate(value);
    case "nullableInstant": return value === null || isIsoInstant(value);
    case "connectionStateCode": return CONNECTION_STATE_CODES.has(value);
    case "agreementCategory": return typeof value === "string" && AGREEMENT_CATEGORIES.includes(value);
    default: return false;
  }
}

/* ------------------------------------------------------ response reading -- */

/* Contract section 8 freezes `kind` at these two words. "Not registered on
 * this host" and "registered and declined to answer" are still different
 * facts, and operators fix them in different places, so the distinction is
 * carried in the reason sentence rather than in a third kind. */
export const KIND = Object.freeze({ REFUSED: "REFUSED", MALFORMED: "MALFORMED" });

function sentence(text) {
  const trimmed = String(text).trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * A named read failure for one query, in the exact contract section 8 shape.
 * Never a zero, never a ghost: the whole chapter that depends on this query
 * renders as a failure and says why.
 */
export function unavailableSource(queryId, kind, detail) {
  const reason = kind === KIND.REFUSED
    ? `Rock would not answer ${queryId}${detail ? `: ${sentence(detail)}` : "."} Being turned down is not a zero, and it is not the same as looking and finding none.`
    : `What came back for ${queryId} was not the shape this page expects${detail ? ` (${detail})` : ""}. It is held back rather than turned into a number we could not stand behind.`;
  return { reason, queryId, kind };
}

/* A refusal object states why it refused. Each of these carriers is read, in
 * order, and only when the value is safe printable text. */
function refusalDetail(value) {
  for (const key of ["reason", "message", "error", "detail", "code"]) {
    const carried = value[key];
    if (typeof carried === "string" && isSafeText(carried, 400)) return carried;
  }
  return null;
}

function refused(queryId, detail) {
  return { status: STATE.UNAVAILABLE, rows: [], unavailable: unavailableSource(queryId, KIND.REFUSED, detail) };
}

function malformed(queryId, detail) {
  return { status: STATE.UNAVAILABLE, rows: [], unavailable: unavailableSource(queryId, KIND.MALFORMED, detail) };
}

/* One row per declared grain (plan section 6). A repeated grain means two runs
 * were stitched together, or a GROUP BY drifted. */
function rowKey(queryId, row) {
  switch (queryId) {
    /* A cancelled occurrence is unnumbered, and two of them on one date are a
     * legal shape, so only the numbered sessions are checked for a repeated
     * grain -- two rows claiming to be the same session of the same group. */
    case "grow-session-attendance": return row.sessionIndex === null ? null : `${row.groupRef}:${row.sessionIndex}`;
    case "grow-session-continuity": return `${row.groupRef}:${row.sessionIndex}`;
    case "grow-completion-tiers": return `${row.groupRef}:${row.sessionsAttended}`;
    case "grow-core-pipeline": return `${row.opportunityId}:${row.statusId}:${row.connectionState}`;
    case "grow-graduate-census": return `${row.campusShortCode}`;
    case "grow-agreement": return `${row.opportunityId}:${row.category}`;
    case "grow-calendar": return `${row.scheduleId}`;
    default: return null;
  }
}

/* Checks that follow from what the landed SQL guarantees about a row, rather
 * than from its field types. A row that breaks one of these did not come from
 * the registered resource, however well-typed it looks. */
function rowIntegrity(queryId, row) {
  if (queryId === "grow-session-attendance") {
    /* Only held occurrences are numbered, and every held occurrence is. The two
     * halves of that rule are checked in both directions, because a cancelled
     * night that kept its session number would shift every later number and a
     * held night without one would vanish from the ladder. */
    if (row.didNotOccur === 1 && row.sessionIndex !== null) {
      return "a cancelled occurrence carries a session number, which would shift every later session";
    }
    if (row.didNotOccur === 0 && row.sessionIndex === null) {
      return "an occurrence that was held carries no session number";
    }
  }
  if (queryId === "grow-completion-tiers" && row.sessionsAttended > row.sessionsHeld) {
    return "a tier counts more sessions attended than the group held";
  }
  return null;
}

/**
 * Validate one registered query's response and return its rows.
 *
 * `gateReason` is the operator-authored sentence the wrapper carries in its
 * `unavailable` map for a source with no approved resolver on this host. It is
 * used only when the response itself is absent from the payload.
 */
export function readResponse(queryId, value, gateReason) {
  const limit = RESPONSE_LIMITS[queryId];
  if (limit === undefined) {
    return malformed(queryId, "this page does not know that query at all");
  }

  if (value === undefined || value === null) {
    const detail = isSafeText(gateReason, 400)
      ? gateReason
      : "this Rock server is not set up to answer it, so the response was absent from the island payload";
    return refused(queryId, detail);
  }
  if (!isRecord(value)) {
    return malformed(queryId, "what came back was not readable data");
  }
  /* The deployed DashboardProdRead runtime answers success as exactly
   * {"status":"ok","queryId":...,"rows":[...]} and a refusal as
   * {"status":"refused","queryId":...,"code":...}. There is no top-level `ok`
   * boolean; requiring one classified every live response, full rows included,
   * as refused, and the whole Connect page rendered Unavailable (measured on
   * prod, 2026-09-01). `status` is the contract. */
  if (value.status !== "ok") {
    return refused(queryId, refusalDetail(value));
  }
  if (!hasExactKeys(value, ["status", "queryId", "rows"])) {
    return malformed(queryId, "the success envelope carries missing or unexpected keys");
  }
  if (value.queryId !== queryId) {
    return malformed(queryId, "the response belongs to a different query");
  }
  if (!Array.isArray(value.rows)) {
    return malformed(queryId, "Rock said the read succeeded but sent no rows");
  }
  if (value.rows.length > limit) {
    return malformed(queryId, `${value.rows.length} rows came back, more than the ${limit} this page is allowed to accept`);
  }
  /* An `ok` envelope with empty rows is valid data (e.g. future / unheld courses,
   * a filtered campus with no occurrences yet, or all-time records with zero matches).
   * Transport or viewer fence refusal must arrive as an explicit unavailable gate
   * or a non-ok envelope, never inferred from an empty row array. */

  const specs = FIELD_SPECS[queryId];
  const fields = Object.keys(specs);
  const rows = [];
  const seen = new Set();

  for (let index = 0; index < value.rows.length; index += 1) {
    const row = value.rows[index];
    if (!isRecord(row) || !hasExactKeys(row, fields)) {
      return malformed(queryId, `row ${index} does not carry the fields this page expects`);
    }
    for (const field of fields) {
      if (!validField(specs[field], row[field])) {
        return malformed(queryId, `row ${index} has an unexpected value in ${field}`);
      }
    }
    const fault = rowIntegrity(queryId, row);
    if (fault !== null) {
      return malformed(queryId, `row ${index} ${fault}`);
    }
    const key = rowKey(queryId, row);
    if (key !== null) {
      if (seen.has(key)) {
        return malformed(queryId, `row ${index} repeats a grain the query emits once`);
      }
      seen.add(key);
    }
    rows.push({ ...row });
  }

  return { status: STATE.OK, rows, unavailable: null, bounded: rows.length === limit };
}

/* ---------------------------------------------------- ladder invariants -- */

/**
 * The plan section 6.1 invariants, checked on every rung of every group.
 *
 * Returns null when every rung holds, or one named read failure when any rung
 * does not. Kill criterion K1: a ladder is right or it is withheld. A
 * partially wrong ladder is worse than no ladder, because a pastor cannot see
 * which rung lied.
 */
export function validateContinuity(rows) {
  const queryId = "grow-session-continuity";
  const byGroup = new Map();
  for (const row of rows) {
    const bucket = byGroup.get(row.groupRef);
    if (bucket) bucket.push(row);
    else byGroup.set(row.groupRef, [row]);
  }

  for (const [groupRef, unsorted] of byGroup) {
    const ladder = [...unsorted].sort((left, right) => left.sessionIndex - right.sessionIndex);
    /* Session numbering is a dense rank by date within the run, so a ladder
     * that starts at 2 or skips 3 is not a ladder this page can read. */
    for (let position = 0; position < ladder.length; position += 1) {
      if (ladder[position].sessionIndex !== position + 1) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} is missing session ${position + 1} from its ladder`);
      }
    }

    let smallestAttended = Infinity;
    let previous = null;
    for (const rung of ladder) {
      const n = rung.sessionIndex;
      smallestAttended = Math.min(smallestAttended, rung.attended);

      if (n === 1) {
        /* Contract section 8.1: session 1 carries returned = attended and null
         * for the other four. A zero there would read as "nobody returned",
         * which is a statement about a session that does not exist. */
        if (rung.returnedFromPrevious !== rung.attended) {
          return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session 1 does not carry returnedFromPrevious equal to attended`);
        }
        for (const field of ["newOrReentry", "droppedSincePrevious", "perfectThroughSession", "uniqueReachToDate"]) {
          if (rung[field] !== null) {
            return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session 1 carries a number in ${field} where the baseline is null`);
          }
        }
        previous = rung;
        continue;
      }

      for (const field of ["newOrReentry", "droppedSincePrevious", "perfectThroughSession", "uniqueReachToDate"]) {
        if (rung[field] === null) {
          return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} leaves ${field} null past the baseline`);
        }
      }
      /* returned + new = attended. The one invariant that forces the ladder to
       * be a person read: both terms are person-set cardinalities, so their sum
       * is the size of the session's person set and nothing else. */
      if (rung.returnedFromPrevious + rung.newOrReentry !== rung.attended) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} has returned plus new not equal to attended`);
      }
      if (rung.returnedFromPrevious > previous.attended) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} has more people returning than session ${n - 1} held`);
      }
      /* dropped = |S(n-1) - S(n)|, which is forced to be attended(n-1) minus
       * the returners. It is checked rather than trusted because a drift here
       * is exactly the arithmetic a reader would act on. */
      if (rung.droppedSincePrevious !== previous.attended - rung.returnedFromPrevious) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} has a dropped count its own returned count contradicts`);
      }
      if (rung.perfectThroughSession > smallestAttended) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} claims more people in every session than the smallest session held`);
      }
      if (previous.sessionIndex > 1 && rung.perfectThroughSession > previous.perfectThroughSession) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} claims more perfect attenders than session ${n - 1}`);
      }
      /* uniqueReach(n) >= attended(n) starts at n = 2, because session 1's
       * cumulative fields are null by the reading decision in section 8.1. */
      if (rung.uniqueReachToDate < rung.attended) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} reaches fewer people in total than it held that night`);
      }
      if (previous.sessionIndex > 1 && rung.uniqueReachToDate < previous.uniqueReachToDate) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} session ${n} reaches fewer people in total than session ${n - 1}`);
      }
      previous = rung;
    }
  }
  return null;
}

/* ---------------------------------------------------- calendar expansion -- */

function icalDate(token) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(String(token).trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/* A Rock Schedule's dates live in the iCalendar text the wrapper already put on
 * the page, so they are expanded here rather than asked for. Bounded on
 * purpose: an unbounded RRULE is a page that never finishes drawing. Anything
 * this expander does not understand yields no dates, which the season rail
 * reads as a ghost -- never as "no sessions". */
export const CALENDAR_EXPANSION_LIMIT = 200;

/**
 * Expand the RDATE and RRULE text of one Rock Schedule into ISO dates.
 * Deterministic, sorted, de-duplicated, and never longer than the limit.
 */
export function expandSchedule(iCalendarContent, limit = CALENDAR_EXPANSION_LIMIT) {
  if (typeof iCalendarContent !== "string" || iCalendarContent.length === 0) return [];
  /* Unfold the RFC 5545 line continuations first: a folded RRULE that is read
   * line by line loses half its parts. */
  const unfolded = iCalendarContent.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const dates = new Set();
  let dtStart = null;

  for (const rawLine of unfolded.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1);

    if (name === "DTSTART" && dtStart === null) {
      dtStart = icalDate(value);
      if (dtStart) dates.add(dtStart);
      continue;
    }
    if (name === "RDATE") {
      for (const token of value.split(",")) {
        const iso = icalDate(token);
        if (iso) dates.add(iso);
      }
      continue;
    }
    if (name === "EXDATE") {
      for (const token of value.split(",")) {
        const iso = icalDate(token);
        if (iso) dates.delete(iso);
      }
      continue;
    }
    if (name === "RRULE") {
      const parts = new Map();
      for (const piece of value.split(";")) {
        const [key, raw] = piece.split("=");
        if (key && raw !== undefined) parts.set(key.trim().toUpperCase(), raw.trim());
      }
      const freq = (parts.get("FREQ") || "").toUpperCase();
      const step = { DAILY: 1, WEEKLY: 7 }[freq];
      if (step === undefined && freq !== "MONTHLY") continue; // not understood: no dates
      const interval = Math.max(1, Number.parseInt(parts.get("INTERVAL") || "1", 10) || 1);
      const until = parts.has("UNTIL") ? icalDate(parts.get("UNTIL")) : null;
      const count = parts.has("COUNT") ? Number.parseInt(parts.get("COUNT"), 10) : null;
      if (dtStart === null) continue; // an RRULE with no start expands to nothing
      const bound = Number.isSafeInteger(count) && count > 0 ? Math.min(count, limit) : limit;
      let cursor = dtStart;
      let emitted = 1;
      while (emitted < bound) {
        cursor = freq === "MONTHLY" ? addMonths(cursor, interval) : addDays(cursor, step * interval);
        if (until !== null && cursor > until) break;
        dates.add(cursor);
        emitted += 1;
        if (dates.size >= limit) break;
      }
    }
  }
  return [...dates].sort().slice(0, limit);
}

/* ------------------------------------------------------------- statistics -- */

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Linear-interpolated quantile of a sample, the same definition the plan's
 * quartile language assumes. The sample is sorted ascending, so for a set of
 * negative drops the lower quartile is the deeper end.
 */
export function quantile(values, fraction) {
  const sample = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((left, right) => left - right);
  if (sample.length === 0) return null;
  if (sample.length === 1) return sample[0];
  const position = (sample.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sample[lower];
  return sample[lower] + (position - lower) * (sample[upper] - sample[lower]);
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

/* ------------------------------------------------------- health, derived -- */

/**
 * Derive this season's health cut points from its own completed batches.
 *
 * Plan section 6.5 and ruling Q1: no threshold is hand-set. Below
 * MIN_BATCHES_TO_DERIVE completed batches there are no quartiles to speak of,
 * so `derived` is false and every batch reads "Not enough history" rather than
 * borrowing a number from a season that is not this one.
 */
export function deriveHealthCuts(completedBatches) {
  const retentions = [];
  const cliffs = [];
  for (const batch of completedBatches || []) {
    if (typeof batch.retention === "number" && Number.isFinite(batch.retention)) retentions.push(batch.retention);
    if (typeof batch.deepestDrop === "number" && Number.isFinite(batch.deepestDrop)) cliffs.push(batch.deepestDrop);
  }
  const batchesUsed = retentions.length;
  const derived = batchesUsed >= MIN_BATCHES_TO_DERIVE;
  const cut = (values, fraction) => {
    if (!derived) return null;
    const value = quantile(values, fraction);
    return value === null ? null : round(value, 4);
  };
  return {
    derived,
    batchesUsed,
    cuts: {
      RETENTION_CRITICAL: cut(retentions, 0.25),
      RETENTION_WATCH: cut(retentions, 0.5),
      CLIFF_THIN: cut(cliffs, 0.25),
      CLIFF_WATCH: cut(cliffs, 0.5),
      MIN_SESSIONS_TO_JUDGE,
      MIN_BATCHES_TO_DERIVE,
    },
  };
}

/**
 * The one state word for one batch, and the sentence that names the rule and
 * the cut point behind it.
 *
 * Composite order is fixed: Critical, then Thin, then Watch, else Healthy.
 * "Not started" wins over everything, including over a season with no history,
 * because a batch with one session held has nothing to be judged on regardless
 * of how good its numbers look.
 */
export function classifyBatchState(input) {
  const sessionsHeld = Number.isSafeInteger(input.sessionsHeld) ? input.sessionsHeld : 0;
  const retention = typeof input.retention === "number" && Number.isFinite(input.retention) ? input.retention : null;
  const deepestDrop = typeof input.deepestDrop === "number" && Number.isFinite(input.deepestDrop) ? input.deepestDrop : null;
  const cuts = isRecord(input.cuts) ? input.cuts : {};
  const derived = input.derived !== false;

  if (sessionsHeld < MIN_SESSIONS_TO_JUDGE) {
    const held = sessionsHeld === 1 ? "1 session" : `${sessionsHeld} sessions`;
    return {
      state: STATE_WORDS.NOT_STARTED,
      why: `${held} held; a batch is judged from ${MIN_SESSIONS_TO_JUDGE} sessions onward.`,
    };
  }
  if (!derived || cuts.RETENTION_CRITICAL === null || cuts.RETENTION_CRITICAL === undefined) {
    const used = Number.isSafeInteger(input.batchesUsed) ? input.batchesUsed : 0;
    return {
      state: STATE_WORDS.NOT_ENOUGH_HISTORY,
      why: `${used} completed ${used === 1 ? "batch" : "batches"} in this season and campus; ${MIN_BATCHES_TO_DERIVE} are needed before the quartiles decide anything.`,
    };
  }
  if (retention === null) {
    return {
      state: STATE_WORDS.NOT_ENOUGH_HISTORY,
      why: "This batch has no first-to-last retention to read, so no rule applies to it yet.",
    };
  }
  if (retention < cuts.RETENTION_CRITICAL) {
    return {
      state: STATE_WORDS.CRITICAL,
      why: `retention ${percent(retention)}, below this season's lower quartile of ${percent(cuts.RETENTION_CRITICAL)}.`,
    };
  }
  if (deepestDrop !== null && cuts.CLIFF_THIN !== null && deepestDrop <= cuts.CLIFF_THIN) {
    return {
      state: STATE_WORDS.THIN,
      why: `deepest drop ${percent(deepestDrop)}, at or beyond this season's lower quartile of ${percent(cuts.CLIFF_THIN)}.`,
    };
  }
  if (cuts.RETENTION_WATCH !== null && retention < cuts.RETENTION_WATCH) {
    return {
      state: STATE_WORDS.WATCH,
      why: `retention ${percent(retention)}, below this season's median of ${percent(cuts.RETENTION_WATCH)}.`,
    };
  }
  if (deepestDrop !== null && cuts.CLIFF_WATCH !== null && deepestDrop <= cuts.CLIFF_WATCH) {
    return {
      state: STATE_WORDS.WATCH,
      why: `deepest drop ${percent(deepestDrop)}, at or beyond this season's median of ${percent(cuts.CLIFF_WATCH)}.`,
    };
  }
  return {
    state: STATE_WORDS.HEALTHY,
    why: `retention ${percent(retention)}, at or above this season's median of ${percent(cuts.RETENTION_WATCH)}.`,
  };
}

/* ------------------------------------------------------------ URL grammar -- */

/* Contract section 2: exactly five keys, Connect's rules. `campus` is written
 * even when it is the default, because its absence does not mean "no filter" --
 * an absent campus is seeded from the viewer's server-resolved campus, so
 * omitting it turned a deliberate "All campuses" into the recipient's own
 * campus the moment the link was pasted somewhere else. */
export const URL_KEYS = Object.freeze(["campus", "season", "course", "batch", "mode"]);

const CAMPUS_VALUES = new Set(COURSE_REGISTRY.campuses);

function seasonVocabulary(options) {
  const seasons = new Set(COURSE_REGISTRY.seasons);
  for (const season of options.seasons || []) seasons.add(String(season));
  if (options.defaultSeason) seasons.add(String(options.defaultSeason));
  return seasons;
}

function registryBatchIds(courseSlug) {
  const ids = new Set();
  for (const course of COURSE_REGISTRY.courses) {
    if (courseSlug && courseSlug !== "all" && course.slug !== courseSlug) continue;
    for (const batch of course.batches) {
      if (Number.isSafeInteger(batch.groupId)) ids.add(batch.groupId);
    }
  }
  return ids;
}

/**
 * Read the five URL keys into a scope object.
 *
 * Connect's rules verbatim: an absent key means no filter, and a value the read
 * does not actually hold is dropped rather than matched to nothing. A URL that
 * names a course the registry never heard of reads as "all courses", not as an
 * empty page the viewer cannot clear.
 */
export function readUrlState(search, options = {}) {
  const raw = typeof search === "string" ? (search.startsWith("?") ? search.slice(1) : search) : "";
  const params = new URLSearchParams(raw);

  const serverCampus = typeof options.serverCampus === "string" ? options.serverCampus : null;
  const campusParam = (params.get("campus") || "").trim();
  let campus;
  if (campusParam && CAMPUS_VALUES.has(campusParam)) campus = campusParam;
  else if (serverCampus && CAMPUS_VALUES.has(serverCampus)) campus = serverCampus;
  else campus = "ALL";

  const seasons = seasonVocabulary(options);
  const defaultSeason = String(options.defaultSeason || COURSE_REGISTRY.seasons[0]);
  const seasonParam = (params.get("season") || "").trim();
  const season = seasonParam && seasons.has(seasonParam) ? seasonParam : defaultSeason;

  const courseParam = (params.get("course") || "").trim();
  const courseSlug = courseParam && COURSE_BY_SLUG.has(courseParam) ? courseParam : "all";

  /* A batch is kept only when the read actually holds it (plan section 7). When
   * the read failed there is no vocabulary to check against, so the registry's
   * own group ids are the fallback: a transient outage must not quietly rewrite
   * a shared link. */
  const held = Array.isArray(options.batchIds) && options.batchIds.length > 0
    ? new Set(options.batchIds.filter(Number.isSafeInteger))
    : registryBatchIds(courseSlug);
  const batchParam = (params.get("batch") || "").trim();
  const parsedBatch = /^\d+$/.test(batchParam) ? Number.parseInt(batchParam, 10) : null;
  const defaultBatchId = Number.isSafeInteger(options.defaultBatchId) ? options.defaultBatchId : null;
  const batchId = parsedBatch !== null && held.has(parsedBatch) ? parsedBatch : defaultBatchId;

  const mode = params.get("mode") === "classic" ? "classic" : "creative";

  return { campus, season, courseSlug, batchId, mode };
}

/**
 * Serialize a scope back into a query string: the non-default keys plus campus,
 * with `mode` written last. Returned without a leading `?` so the caller
 * composes the URL; the caller uses `replaceState`, never `pushState`, because
 * a filter click is not a new history entry.
 */
export function writeUrlSearch(scope, options = {}) {
  const state = isRecord(scope) ? scope : {};
  const defaultSeason = String(options.defaultSeason || COURSE_REGISTRY.seasons[0]);
  const defaultBatchId = Number.isSafeInteger(options.defaultBatchId) ? options.defaultBatchId : null;
  const params = new URLSearchParams();

  params.set("campus", CAMPUS_VALUES.has(state.campus) ? state.campus : "ALL");
  if (state.season && String(state.season) !== defaultSeason) params.set("season", String(state.season));
  if (state.courseSlug && state.courseSlug !== "all" && COURSE_BY_SLUG.has(state.courseSlug)) {
    params.set("course", state.courseSlug);
  }
  if (Number.isSafeInteger(state.batchId) && state.batchId !== defaultBatchId) {
    params.set("batch", String(state.batchId));
  }
  /* `mode` is written last, so a Classic link always ends in the one key a
   * reader is most likely to want to strip by hand. */
  if (state.mode === "classic") params.set("mode", "classic");

  return params.toString();
}

/* ------------------------------------------------------------ derivations -- */

function courseFor(groupRef) {
  return COURSE_BY_GROUP_ID.get(groupRef) || null;
}

function dateLabel(iso) {
  if (!isIsoDate(iso)) return GHOST;
  const date = new Date(`${iso}T00:00:00Z`);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  return `${date.getUTCDate()} ${month}`;
}

function boardHref(opportunityId) {
  return COURSE_REGISTRY.boardPagePattern.replace("{opportunityId}", String(opportunityId));
}

/* One entry per batch present in the attendance read: the shape every chapter
 * downstream reads from. `people` is the person read and drives retention and
 * the cliff; `attended` (the room) travels beside it but never mixes with it,
 * per contract section 3.1. */
function buildBatchIndex(attendanceRows) {
  const byGroup = new Map();
  for (const row of attendanceRows) {
    const bucket = byGroup.get(row.groupRef);
    if (bucket) bucket.push(row);
    else byGroup.set(row.groupRef, [row]);
  }

  const batches = [];
  for (const [groupRef, unsorted] of byGroup) {
    /* Two readings of one group's rows. `occurred` is the numbered sessions, in
     * session order: the ladder, the strip, retention and the cliff are all
     * built from these. `sessions` keeps the cancelled occurrences too, in date
     * order, because the season rail still has to show the night that was
     * called off. */
    const sessions = [...unsorted].sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate) || (left.sessionIndex || 0) - (right.sessionIndex || 0));
    const occurred = sessions
      .filter((row) => row.didNotOccur === 0 && row.sessionIndex !== null)
      .sort((left, right) => left.sessionIndex - right.sessionIndex);
    const course = courseFor(groupRef);
    const registryBatch = BATCH_BY_GROUP_ID.get(groupRef) || null;
    const completionStatus = registryBatch && registryBatch.completionStatus ? registryBatch.completionStatus : null;
    const isPendingReconciliation = completionStatus === "pending-schedule-reconciliation";
    const sessionsPlanned = course && Number.isSafeInteger(course.sessionsPlanned) ? course.sessionsPlanned : null;
    const sessionsHeld = occurred.length;

    let retention = null;
    if (sessionsHeld >= 2 && occurred[0].people > 0) {
      retention = round(occurred[sessionsHeld - 1].people / occurred[0].people, 4);
    }
    let deepestDrop = null;
    let deepestDropAtSession = null;
    for (let index = 1; index < occurred.length; index += 1) {
      const previous = occurred[index - 1].people;
      if (previous <= 0) continue;
      const drop = round((occurred[index].people - previous) / previous, 4);
      if (deepestDrop === null || drop < deepestDrop) {
        deepestDrop = drop;
        deepestDropAtSession = occurred[index].sessionIndex;
      }
    }

    const completed = isPendingReconciliation
      ? false
      : (sessionsPlanned === null ? sessionsHeld >= MIN_SESSIONS_TO_JUDGE : sessionsHeld >= sessionsPlanned);
    const running = isPendingReconciliation ? false : !completed;

    batches.push({
      groupRef,
      courseSlug: course ? course.slug : null,
      courseLabel: course ? course.label : GHOST,
      batchLabel: registryBatch && registryBatch.label ? registryBatch.label : GHOST,
      kind: registryBatch && registryBatch.kind ? registryBatch.kind : "session",
      campus: registryBatch && registryBatch.campus ? registryBatch.campus : GHOST,
      season: occurred.length > 0 ? occurred[0].occurrenceDate.slice(0, 4) : null,
      sessions,
      occurred,
      sessionsHeld,
      sessionsPlanned,
      completionStatus,
      running,
      completed,
      firstDate: occurred.length > 0 ? occurred[0].occurrenceDate : null,
      lastDate: occurred.length > 0 ? occurred[sessionsHeld - 1].occurrenceDate : null,
      retention,
      deepestDrop,
      deepestDropAtSession,
    });
  }
  return batches.sort((left, right) => String(right.lastDate).localeCompare(String(left.lastDate)) || left.groupRef - right.groupRef);
}

function tiersByGroup(rows) {
  const byGroup = new Map();
  for (const row of rows) {
    const bucket = byGroup.get(row.groupRef);
    if (bucket) bucket.push(row);
    else byGroup.set(row.groupRef, [row]);
  }
  return byGroup;
}

/* The tier rows and the group summary they carry have to agree: the tiers of
 * one group sum to its uniqueReach, and a tier cannot claim more sessions than
 * the group held (plan section 6.2, test 4). Shares divide by uniqueReach,
 * never by attended. */
function validateTiers(rows) {
  const queryId = "grow-completion-tiers";
  for (const [groupRef, group] of tiersByGroup(rows)) {
    const sessionsHeld = group[0].sessionsHeld;
    const uniqueReach = group[0].uniqueReach;
    let total = 0;
    for (const row of group) {
      if (row.sessionsHeld !== sessionsHeld || row.uniqueReach !== uniqueReach) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} disagrees with itself about how many sessions it held or how many people it reached`);
      }
      if (row.sessionsAttended > sessionsHeld) {
        return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} has a tier for more sessions than it held`);
      }
      if (row.sessionsAttended >= 1) total += row.people;
    }
    if (total !== uniqueReach) {
      return unavailableSource(queryId, KIND.MALFORMED, `group ${groupRef} has tiers summing to ${total} against a unique reach of ${uniqueReach}`);
    }
  }
  return null;
}

/* --------------------------------------------------------------- chapters -- */

function buildSeason(calendarResult, attendanceResult, batches, scope, today) {
  if (calendarResult.status !== STATE.OK) {
    return { cards: [], unavailable: calendarResult.unavailable };
  }
  /* Held sessions, keyed by course and date, so a planned date Rock has an
   * occurrence for is a session and a planned date it does not is a ghost. */
  const heldByKey = new Map();
  if (attendanceResult.status === STATE.OK) {
    for (const batch of batches) {
      for (const session of batch.sessions) {
        if (batch.courseSlug === null) continue;
        if (session.didNotOccur === 1) continue;
        heldByKey.set(`${batch.courseSlug}:${session.occurrenceDate}`, { batch, session });
      }
    }
  }

  const cards = new Map();
  for (const row of calendarResult.rows) {
    if (row.isActive === 0) continue;
    const course = COURSE_BY_SCHEDULE_ID.get(row.scheduleId) || null;
    const courseSlug = course ? course.slug : null;
    const dates = expandSchedule(row.iCalendarContent);
    const inSeason = dates.filter((iso) => iso.slice(0, 4) === scope.season);
    inSeason.forEach((iso, index) => {
      const key = `${courseSlug === null ? `schedule-${row.scheduleId}` : courseSlug}:${iso}`;
      const held = courseSlug === null ? undefined : heldByKey.get(`${courseSlug}:${iso}`);
      /* A held date belongs to the Rock group that recorded it; a planned date with
       * no occurrence yet belongs to the schedule that will eventually produce one.
       * Grouping "now" by this rather than by course keeps bible-masterclass's
       * finished batch and its not-yet-started batch apart (T7 companion fix). */
      const batchRef = held ? `group:${held.batch.groupRef}` : `schedule:${row.scheduleId}`;
      cards.set(key, {
        dateISO: iso,
        dateLabel: dateLabel(iso),
        courseSlug,
        courseLabel: course ? course.label : row.scheduleName,
        batchRef,
        kind: held ? held.batch.kind : "planned",
        sessionIndex: held ? held.session.sessionIndex : index + 1,
        sessionsPlanned: course && Number.isSafeInteger(course.sessionsPlanned) ? course.sessionsPlanned : GHOST,
        isToday: today !== null && iso === today,
        ghost: held === undefined,
      });
    });
  }

  /* An occurrence Rock recorded is a session whether or not a schedule names
   * its date, so attendance is the second source of the rail, never a
   * contradiction of the first. */
  for (const batch of batches) {
    if (batch.courseSlug === null || batch.season !== scope.season) continue;
    for (const session of batch.sessions) {
      const key = `${batch.courseSlug}:${session.occurrenceDate}`;
      cards.set(key, {
        dateISO: session.occurrenceDate,
        dateLabel: dateLabel(session.occurrenceDate),
        courseSlug: batch.courseSlug,
        courseLabel: batch.courseLabel,
        batchRef: `group:${batch.groupRef}`,
        kind: session.didNotOccur === 1 ? "did-not-occur" : batch.kind,
        sessionIndex: session.sessionIndex,
        sessionsPlanned: batch.sessionsPlanned === null ? GHOST : batch.sessionsPlanned,
        isToday: today !== null && session.occurrenceDate === today,
        ghost: session.didNotOccur === 1,
      });
    }
  }

  const ordered = [...cards.values()].sort((left, right) => left.dateISO.localeCompare(right.dateISO) || String(left.courseSlug).localeCompare(String(right.courseSlug)));
  return { cards: ordered, now: buildNow(ordered, today), unavailable: null };
}

/* Whole days from `from` to `to`, both ISO dates. Both are plain calendar dates
 * in Asia/Manila with no clock on them, so they are compared as UTC midnights
 * and no timezone ever shifts the answer by a day. */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/* -------------------------------------------------------- happening now -- */

/* The rail is every dated session in the slice, in date order, which answers
 * "what is the season" and not "what is running tonight". This derives the
 * second reading from the same cards, so the two can never disagree: a course
 * is RUNNING when the slice holds a session on or before today and another one
 * after it, and the course that OPENS NEXT is the earliest later session
 * belonging to no running course.
 *
 * Everything here is read off cards Rock produced. A planned date with no
 * occurrence stays a ghost and is still counted as a date, because the date is
 * real even when the attendance is not; `sessionsHeld` counts only the
 * non-ghost cards, so a running course never claims a night it cannot show.
 * With no today (`options.today` absent or malformed) there is no now to
 * derive, and this returns null rather than guessing one. */
function buildNow(ordered, today) {
  if (today === null) return null;
  /* Grouped by BATCH, not by course: a course can have two batches in flight
   * (bible-masterclass has one that ended 2026-05-26 and one starting 2026-09-29,
   * grow-source.mjs:119), and merging their sessions under one course entry would
   * report a finished batch and a not-yet-started one as a single course "running"
   * with sessionsHeld/sessionsDated summed across two separate runs. batchRef is
   * the card's Rock group when one has recorded attendance, or its schedule when
   * the batch has not started one yet (see where cards are built, above). */
  const byBatch = new Map();
  for (const card of ordered) {
    if (card.courseSlug === null || card.batchRef === null) continue;
    if (!byBatch.has(card.batchRef)) byBatch.set(card.batchRef, []);
    byBatch.get(card.batchRef).push(card);
  }

  const running = [];
  const runningBatchRefs = new Set();
  for (const [batchRef, cards] of byBatch) {
    const past = cards.filter((card) => card.dateISO <= today);
    const ahead = cards.filter((card) => card.dateISO > today);
    if (past.length === 0 || ahead.length === 0) continue;
    runningBatchRefs.add(batchRef);
    const next = ahead[0];
    running.push({
      batchRef,
      courseSlug: cards[0].courseSlug,
      courseLabel: cards[0].courseLabel,
      sessionsHeld: past.filter((card) => !card.ghost && card.kind !== "did-not-occur").length,
      sessionsDated: past.length,
      sessionsPlanned: cards[0].sessionsPlanned,
      nextDateISO: next.dateISO,
      nextDateLabel: next.dateLabel,
      nextSessionIndex: next.sessionIndex,
      nextIsGhost: next.ghost,
      daysAway: daysBetween(today, next.dateISO),
    });
  }
  running.sort((left, right) => left.nextDateISO.localeCompare(right.nextDateISO));

  let opensNext = null;
  for (const card of ordered) {
    if (card.dateISO <= today || card.courseSlug === null || card.batchRef === null || runningBatchRefs.has(card.batchRef)) continue;
    opensNext = {
      batchRef: card.batchRef,
      courseSlug: card.courseSlug,
      courseLabel: card.courseLabel,
      dateISO: card.dateISO,
      dateLabel: card.dateLabel,
      sessionIndex: card.sessionIndex,
      daysAway: daysBetween(today, card.dateISO),
    };
    break;
  }

  return { today, running, opensNext };
}

function buildBatchChapter(batch, continuityResult, continuityFault, tiersRows, scope) {
  const base = {
    courseSlug: batch ? batch.courseSlug : null,
    courseLabel: batch ? batch.courseLabel : GHOST,
    batchLabel: batch ? batch.batchLabel : GHOST,
    campus: batch ? batch.campus : GHOST,
    sessionsHeld: batch ? batch.sessionsHeld : GHOST,
    sessionsPlanned: batch && batch.sessionsPlanned !== null ? batch.sessionsPlanned : GHOST,
    running: batch ? batch.running : false,
    peopleReached: GHOST,
    rungs: [],
    insight: "",
    unavailable: null,
  };

  if (continuityFault !== null) return { ...base, unavailable: continuityFault };
  if (continuityResult.status !== STATE.OK) return { ...base, unavailable: continuityResult.unavailable };
  if (batch === null) {
    const course = scope && scope.courseSlug && scope.courseSlug !== "all" ? COURSE_BY_SLUG.get(scope.courseSlug) : null;
    return {
      ...base,
      courseSlug: course ? course.slug : null,
      courseLabel: course ? course.label : GHOST,
      campus: scope && scope.campus !== "ALL" ? scope.campus : GHOST,
      sessionsPlanned: course && Number.isSafeInteger(course.sessionsPlanned) ? course.sessionsPlanned : GHOST,
      insight: course
        ? `${course.label} has no occurrences recorded for this season and campus yet.`
        : "No batch in this season and campus has an occurrence to read yet.",
      unavailable: null,
    };
  }

  const dateByIndex = new Map(batch.occurred.map((row) => [row.sessionIndex, row.occurrenceDate]));
  const ladder = continuityResult.rows
    .filter((row) => row.groupRef === batch.groupRef)
    .sort((left, right) => left.sessionIndex - right.sessionIndex);

  if (ladder.length === 0) {
    return {
      ...base,
      unavailable: unavailableSource("grow-session-continuity", KIND.MALFORMED, `the continuity read carries no ladder for group ${batch.groupRef}, which the attendance read says held ${batch.sessionsHeld} sessions`),
    };
  }

  const rungs = ladder.map((row) => {
    const iso = dateByIndex.get(row.sessionIndex) || null;
    return {
      sessionIndex: row.sessionIndex,
      dateISO: iso,
      dateLabel: iso === null ? GHOST : dateLabel(iso),
      attended: row.attended,
      returnedFromPrevious: row.returnedFromPrevious,
      newOrReentry: row.newOrReentry,
      droppedSincePrevious: row.droppedSincePrevious,
      perfectThroughSession: row.perfectThroughSession,
      uniqueReachToDate: row.uniqueReachToDate,
    };
  });

  const last = rungs[rungs.length - 1];
  const tierSummary = tiersRows.length > 0 ? tiersRows[0] : null;
  let peopleReached = GHOST;
  if (last.uniqueReachToDate !== null) peopleReached = last.uniqueReachToDate;
  else if (tierSummary) peopleReached = tierSummary.uniqueReach;
  else if (rungs.length === 1) peopleReached = last.attended;

  const finishers = tierSummary
    ? (tiersRows.find((row) => row.sessionsAttended === tierSummary.sessionsHeld) || { people: 0 }).people
    : GHOST;
  const cliff = batch.deepestDropAtSession === null
    ? null
    : rungs.find((rung) => rung.sessionIndex === batch.deepestDropAtSession) || null;

  const sentences = [];
  if (cliff && cliff.droppedSincePrevious !== null) {
    sentences.push(`Session ${cliff.sessionIndex} lost the most people: ${cliff.droppedSincePrevious} did not come back.`);
  } else {
    sentences.push(`No session has lost people yet${batch.running ? " so far" : ""}.`);
  }
  if (last.perfectThroughSession !== null) {
    sentences.push(`${last.perfectThroughSession} have been in every session${batch.running ? " so far" : ""}.`);
  }
  if (batch.completionStatus === "pending-schedule-reconciliation") {
    sentences.push("Schedule reconciliation is pending for this batch.");
  } else {
    sentences.push(finishers === GHOST
      ? `How many finished all ${base.sessionsPlanned} is not something Rock carries yet (${GHOST}).`
      : `${finishers} attended all ${tierSummary.sessionsHeld} sessions held${batch.running ? " so far" : ""}.`);
  }

  return { ...base, peopleReached, rungs, insight: sentences.join(" ") };
}

function buildCompletion(batch, tiersResult, tiersFault, tiersRows) {
  const isPending = batch && batch.completionStatus === "pending-schedule-reconciliation";
  const base = {
    tiers: [],
    uniqueReach: GHOST,
    sessionsHeld: GHOST,
    soFar: batch ? batch.running : false,
    insight: isPending ? "Schedule reconciliation is pending for this batch." : "",
    unavailable: null,
  };
  if (tiersFault !== null) return { ...base, unavailable: tiersFault };
  if (tiersResult.status !== STATE.OK) return { ...base, unavailable: tiersResult.unavailable };
  if (batch === null) {
    return { ...base, unavailable: null };
  }
  if (tiersRows.length === 0) {
    return { ...base, sessionsHeld: batch.sessionsHeld, unavailable: null };
  }

  const sessionsHeld = tiersRows[0].sessionsHeld;
  const uniqueReach = tiersRows[0].uniqueReach;
  const tiers = tiersRows
    .filter((row) => row.sessionsAttended >= 1)
    .sort((left, right) => left.sessionsAttended - right.sessionsAttended)
    .map((row) => {
      const isTopTier = isPending ? false : row.sessionsAttended === sessionsHeld;
      let label;
      if (isPending) {
        label = row.sessionsAttended === 1 ? "1 session attended" : `${row.sessionsAttended} sessions attended`;
      } else if (isTopTier) {
        label = batch.running ? `all ${sessionsHeld} so far` : `all ${sessionsHeld}`;
      } else {
        label = `${row.sessionsAttended} of ${sessionsHeld}`;
      }
      return {
        sessionsAttended: row.sessionsAttended,
        people: row.people,
        /* Shares divide by uniqueReach, never by attended (plan section 6.2). */
        shareOfReach: uniqueReach > 0 ? round(row.people / uniqueReach, 4) : GHOST,
        isTopTier,
        label,
      };
    });

  return { ...base, tiers, uniqueReach, sessionsHeld, insight: base.insight };
}

function buildPipelines(pipelineResult, agreementResult) {
  if (pipelineResult.status !== STATE.OK) {
    return [{
      opportunityId: null,
      label: GHOST,
      courseSlug: null,
      openRequests: GHOST,
      stages: [],
      agreement: null,
      boardLink: null,
      unavailable: pipelineResult.unavailable,
    }];
  }

  const byOpportunity = new Map();
  for (const row of pipelineResult.rows) {
    const bucket = byOpportunity.get(row.opportunityId);
    if (bucket) bucket.push(row);
    else byOpportunity.set(row.opportunityId, [row]);
  }

  const agreementByOpportunity = new Map();
  if (agreementResult.status === STATE.OK) {
    for (const row of agreementResult.rows) {
      const bucket = agreementByOpportunity.get(row.opportunityId) || {};
      bucket[row.category] = row.people;
      agreementByOpportunity.set(row.opportunityId, bucket);
    }
  }

  const pipelines = [];
  for (const [opportunityId, rows] of byOpportunity) {
    const course = COURSE_BY_OPPORTUNITY_ID.get(opportunityId) || null;
    const statusLabels = course ? course.statusLabels : {};
    /* Active is open. Inactive and Connected are their own quiet rows and are
     * never folded into the open count (plan section 6). */
    const openRequests = rows
      .filter((row) => row.connectionState === CONNECTION_STATE.ACTIVE)
      .reduce((total, row) => total + row.requests, 0);

    const stages = rows
      .filter((row) => row.connectionState === CONNECTION_STATE.ACTIVE)
      .sort((left, right) => left.statusOrder - right.statusOrder || left.statusId - right.statusId)
      .map((row) => ({
        statusId: row.statusId,
        label: statusLabels[row.statusId] || `Status ${row.statusId}`,
        statusOrder: row.statusOrder,
        count: row.requests,
      }));

    /* A missing agreement read is a ghost, not a zero and not a failure: the
     * five categories are simply not carried, so the section draws `?`. */
    let agreement = null;
    if (agreementResult.status === STATE.OK) {
      const carried = agreementByOpportunity.get(opportunityId) || {};
      agreement = {};
      for (const category of AGREEMENT_CATEGORIES) {
        agreement[category] = Number.isSafeInteger(carried[category]) ? carried[category] : GHOST;
      }
    }

    pipelines.push({
      opportunityId,
      label: rows[0].opportunityName,
      courseSlug: course ? course.slug : null,
      openRequests,
      stages,
      agreement,
      boardLink: { href: boardHref(opportunityId), entityId: opportunityId },
      unavailable: null,
    });
  }

  return pipelines.sort((left, right) => left.opportunityId - right.opportunityId);
}

function buildBridge(censusResult, pipelines) {
  if (censusResult.status !== STATE.OK) {
    return {
      buildGraduates: GHOST,
      dnaGraduates: GHOST,
      completedBoth: GHOST,
      upnextOpen: GHOST,
      grains: { allTimeRecord: [], todaysBoard: [] },
      unavailable: censusResult.unavailable,
    };
  }

  const total = (field) => censusResult.rows.reduce((sum, row) => sum + row[field], 0);
  const buildGraduates = total("buildGraduates");
  const dnaGraduates = total("dnaGraduates");
  const completedBoth = total("completedBoth");
  const bibleMasterclass = total("bibleMasterclass");
  const upnext = pipelines.find((pipeline) => pipeline.opportunityId === UPNEXT_OPPORTUNITY_ID) || null;

  return {
    buildGraduates,
    dnaGraduates,
    completedBoth,
    upnextOpen: upnext ? upnext.openRequests : GHOST,
    /* Two grains, labelled, never on one axis (plan D4). The all-time record is
     * an attribute count that has been accumulating for years; today's board is
     * what is open right now. */
    grains: {
      allTimeRecord: [
        { label: "Build graduates", value: buildGraduates },
        { label: "Favor DNA graduates", value: dnaGraduates },
        { label: "Completed both", value: completedBoth },
        { label: "Bible Masterclass", value: bibleMasterclass },
      ],
      todaysBoard: pipelines
        .filter((pipeline) => pipeline.opportunityId !== null)
        .map((pipeline) => ({ label: pipeline.label, value: pipeline.openRequests })),
    },
    unavailable: null,
  };
}

function buildCourses(batches, tiersResult, tiersFault, tiersByGroupId, health) {
  return batches.map((batch) => {
    const tiers = tiersByGroupId.get(batch.groupRef) || [];
    const tiersUsable = tiersResult.status === STATE.OK && tiersFault === null && tiers.length > 0;
    const isPending = batch.completionStatus === "pending-schedule-reconciliation";
    const sessionsHeld = tiersUsable ? tiers[0].sessionsHeld : batch.sessionsHeld;
    const uniqueReach = tiersUsable ? tiers[0].uniqueReach : null;
    const finishedAll = tiersUsable && !isPending
      ? (tiers.find((row) => row.sessionsAttended === sessionsHeld) || { people: 0 }).people
      : GHOST;

    const strip = [];
    const plannedLength = batch.sessionsPlanned === null
      ? batch.occurred.length
      : Math.max(batch.sessionsPlanned, batch.occurred.length);
    const byIndex = new Map(batch.occurred.map((row) => [row.sessionIndex, row]));
    for (let index = 1; index <= plannedLength; index += 1) {
      const session = byIndex.get(index);
      /* A session Rock has no occurrence for, and a session it recorded as not
       * having happened, both have no number to show. They draw a ghost, never
       * a zero: nobody is being reported as having stayed away. */
      if (session === undefined || session.didNotOccur === 1) {
        strip.push({ sessionIndex: index, attended: GHOST, ghost: true });
      } else {
        strip.push({ sessionIndex: index, attended: session.people, ghost: false });
      }
    }

    const verdict = classifyBatchState({
      sessionsHeld: batch.sessionsHeld,
      retention: batch.retention,
      deepestDrop: batch.deepestDrop,
      cuts: health.cuts,
      derived: health.derived,
      batchesUsed: health.batchesUsed,
    });

    const course = batch.courseSlug ? COURSE_BY_SLUG.get(batch.courseSlug) : null;
    const act = course && Number.isSafeInteger(course.connectionOpportunityId)
      ? { href: boardHref(course.connectionOpportunityId), label: `Open the ${course.label} board` }
      : null;

    return {
      courseSlug: batch.courseSlug,
      courseLabel: batch.courseLabel,
      batchLabel: batch.batchLabel,
      sessionStrip: strip,
      started: batch.occurred.length > 0 ? batch.occurred[0].people : GHOST,
      finishedAll,
      finishedAllShare: tiersUsable && !isPending && uniqueReach > 0 && finishedAll !== GHOST
        ? round(finishedAll / uniqueReach, 4)
        : GHOST,
      deepestDrop: batch.deepestDrop === null ? GHOST : batch.deepestDrop,
      deepestDropAtSession: batch.deepestDropAtSession === null ? GHOST : batch.deepestDropAtSession,
      state: verdict.state,
      why: verdict.why,
      act,
      soFar: batch.running,
    };
  });
}

const CHAPTER_SOURCES = Object.freeze([
  { chapter: "season", sources: ["grow-calendar", "grow-session-attendance"] },
  { chapter: "batch", sources: ["grow-session-continuity", "grow-session-attendance"] },
  { chapter: "completion", sources: ["grow-completion-tiers"] },
  { chapter: "pipelines", sources: ["grow-core-pipeline", "grow-agreement"] },
  { chapter: "bridge", sources: ["grow-graduate-census", "grow-core-pipeline"] },
  { chapter: "courses", sources: ["grow-session-attendance", "grow-completion-tiers"] },
]);

function buildColophon(read) {
  const sourcesByChapter = CHAPTER_SOURCES.map((entry) => {
    const sources = [...entry.sources];
    for (const queryId of entry.sources) {
      const result = read[queryId];
      /* A source that could not be read says so here, so the colophon is an
       * honest account of what this page was able to look at. */
      if (result && result.status !== STATE.OK) sources.push(result.unavailable.reason);
    }
    return { chapter: entry.chapter, sources };
  });
  return { sourcesByChapter, stepsSentence: STEPS_SENTENCE };
}

function emptyView(reason, scope) {
  const failure = { reason, queryId: null, kind: KIND.MALFORMED };
  return {
    meta: {
      fictional: false,
      scope,
      stamps: { attendanceRead: GHOST, boardRead: GHOST, calendarSource: GHOST },
    },
    season: { cards: [], unavailable: failure },
    batch: {
      courseSlug: null, courseLabel: GHOST, batchLabel: GHOST, campus: GHOST,
      sessionsHeld: GHOST, sessionsPlanned: GHOST, running: false, peopleReached: GHOST,
      rungs: [], insight: "", unavailable: failure,
    },
    completion: { tiers: [], uniqueReach: GHOST, sessionsHeld: GHOST, soFar: false, insight: "", unavailable: failure },
    pipelines: [{
      opportunityId: null, label: GHOST, courseSlug: null, openRequests: GHOST,
      stages: [], agreement: null, boardLink: null, unavailable: failure,
    }],
    bridge: {
      buildGraduates: GHOST, dnaGraduates: GHOST, completedBoth: GHOST, upnextOpen: GHOST,
      grains: { allTimeRecord: [], todaysBoard: [] }, unavailable: failure,
    },
    courses: [],
    health: {
      derived: false,
      batchesUsed: 0,
      cuts: {
        RETENTION_CRITICAL: null, RETENTION_WATCH: null, CLIFF_THIN: null, CLIFF_WATCH: null,
        MIN_SESSIONS_TO_JUDGE, MIN_BATCHES_TO_DERIVE,
      },
    },
    colophon: { sourcesByChapter: [], stepsSentence: STEPS_SENTENCE },
  };
}

/* ------------------------------------------------------------------ view -- */

/**
 * Validate one Grow island payload and build the view model of BUILD-CONTRACT
 * section 8.
 *
 * Always returns the full shape. A payload that is not the closed production
 * shape returns a view whose every chapter is a named read failure saying why;
 * it never throws, and it never substitutes a zero or a ghost for a read that
 * failed.
 *
 * `options.search` is the page's query string, `options.serverCampus` the
 * viewer's server-resolved campus, and `options.today` an ISO date used only to
 * mark the season rail's today and to default the season.
 */
export function buildView(payload, options = {}) {
  const today = isIsoDate(options.today) ? options.today : null;
  const defaultSeason = String(options.defaultSeason || (today ? today.slice(0, 4) : COURSE_REGISTRY.seasons[0]));
  const serverCampus = isRecord(payload) && typeof payload.campus === "string" ? payload.campus : options.serverCampus;
  const fallbackScope = readUrlState(options.search, { serverCampus, defaultSeason });

  if (!isRecord(payload)) {
    return emptyView("The Grow page did not receive any data from Rock at all, so there is nothing to read. Nothing here is a zero.", fallbackScope);
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return emptyView(`The data this page received is a version it cannot read (${JSON.stringify(payload.schemaVersion)}, where it expects ${SCHEMA_VERSION}). It is held back rather than half-read.`, fallbackScope);
  }
  if (payload.dashboardId !== DASHBOARD_ID) {
    return emptyView(`The data this page received belongs to a different page (${JSON.stringify(payload.dashboardId)}, where it expects ${DASHBOARD_ID}), so none of it is shown here.`, fallbackScope);
  }

  const gates = isRecord(payload.unavailable) ? payload.unavailable : {};
  const responses = isRecord(payload.responses) ? payload.responses : {};
  const read = {};
  for (const queryId of QUERY_IDS) {
    read[queryId] = readResponse(queryId, responses[queryId], gates[queryId]);
  }

  const attendanceResult = read["grow-session-attendance"];
  const continuityResult = read["grow-session-continuity"];
  const tiersResult = read["grow-completion-tiers"];

  /* Kill criterion K1: one bad rung withholds every ladder rather than drawing
   * a partially wrong one. */
  const continuityFault = continuityResult.status === STATE.OK ? validateContinuity(continuityResult.rows) : null;
  const tiersFault = tiersResult.status === STATE.OK ? validateTiers(tiersResult.rows) : null;

  const allBatches = attendanceResult.status === STATE.OK ? buildBatchIndex(attendanceResult.rows) : [];
  const seasonsHeld = [...new Set(allBatches.map((batch) => batch.season).filter(Boolean))];
  const scope = readUrlState(options.search, {
    serverCampus,
    defaultSeason,
    seasons: seasonsHeld,
    batchIds: allBatches.map((batch) => batch.groupRef),
  });

  const inSeason = allBatches.filter((batch) => batch.season === scope.season);
  const inScope = scope.courseSlug === "all" ? inSeason : inSeason.filter((batch) => batch.courseSlug === scope.courseSlug);

  /* The default batch is the most recent one with an occurrence, which is what
   * a pastor on a Tuesday afternoon is asking about. */
  const defaultBatch = inScope.length > 0 ? inScope[0] : null;
  const selected = (scope.batchId !== null ? inScope.find((batch) => batch.groupRef === scope.batchId) : null) || defaultBatch;
  scope.batchId = selected ? selected.groupRef : null;

  /* Plan section 6.5: the cut points come from the completed batches of the
   * season and campus in scope. Campus is a server-side query parameter, so the
   * payload is already campus-scoped and the season is filtered here. */
  const health = deriveHealthCuts(inScope.filter((batch) => batch.completed));

  const tiersByGroupId = tiersResult.status === STATE.OK ? tiersByGroup(tiersResult.rows) : new Map();
  const selectedTiers = selected ? (tiersByGroupId.get(selected.groupRef) || []) : [];

  const pipelines = buildPipelines(read["grow-core-pipeline"], read["grow-agreement"]);

  const attendanceStamp = attendanceResult.status === STATE.OK
    ? attendanceResult.rows.reduce((latest, row) => (row.occurrenceDate > latest ? row.occurrenceDate : latest), "0000-00-00")
    : GHOST;
  const boardStamp = read["grow-core-pipeline"].status === STATE.OK
    ? read["grow-core-pipeline"].rows.reduce((latest, row) => (row.newestModified !== null && row.newestModified.slice(0, 10) > latest ? row.newestModified.slice(0, 10) : latest), "0000-00-00")
    : GHOST;
  const calendarStamp = read["grow-calendar"].status === STATE.OK
    ? `Rock Schedule category ${COURSE_REGISTRY.scheduleCategoryId}`
    : GHOST;

  return {
    meta: {
      fictional: payload.mode === "fictional",
      scope: {
        campus: scope.campus,
        season: scope.season,
        courseSlug: scope.courseSlug,
        batchId: scope.batchId,
      },
      stamps: {
        attendanceRead: attendanceStamp === "0000-00-00" ? GHOST : attendanceStamp,
        boardRead: boardStamp === "0000-00-00" ? GHOST : boardStamp,
        calendarSource: calendarStamp,
      },
    },
    season: buildSeason(read["grow-calendar"], attendanceResult, allBatches, scope, today),
    batch: buildBatchChapter(selected, continuityResult, continuityFault, selectedTiers, scope),
    completion: buildCompletion(selected, tiersResult, tiersFault, selectedTiers),
    pipelines,
    bridge: buildBridge(read["grow-graduate-census"], pipelines),
    courses: buildCourses(inScope, tiersResult, tiersFault, tiersByGroupId, health),
    health,
    colophon: buildColophon(read),
  };
}
