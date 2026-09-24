/* Closed DashboardProdRead response adapter for the People Pathway island.
 *
 * The Rock wrapper embeds nine server-rendered command responses in one passive
 * JSON island. This module validates every envelope and row before mapping it to
 * the renderer's bundle. A malformed/refused response becomes unavailable; it
 * never becomes an empty successful result or a zero.
 *
 * The last three responses are the Classic People chapter's data contract
 * (issue 214 / sub-issue 224): the Favor People base, the leader counts by role,
 * and the display-only Leaders Directory.
 */

export const DASHBOARD_ID = "favor-exec-pathways";
export const QUERY_IDS = Object.freeze([
  "people-pathway-step-current",
  "people-pathway-step-alltime",
  "people-pathway-step-people",
  "people-pathway-transitions",
  "people-pathway-waterfall",
  "people-pathway-freshness",
  "people-pathway-front-door",
  "people-base-counts",
  "people-leader-counts",
  "people-leaders-directory",
]);

/* Rock migration cut-off, from dashboards/favor-exec-pathways.json's
 * dataProvenance block. It is configuration because it is a fact about the
 * data's history, not a drawing decision: when the window changes it changes
 * here and in the dashboard spec, and no chart code is touched. */
export const MIGRATION_THROUGH = "2026-08-01";

const CAMPUSES = new Set(["MNL", "BNE", "SEL", "ALL"]);
const LIFECYCLES = new Set(["New", "Crowd", "Core", "Leader"]);
const GENDERS = new Set(["women", "men", "unknown"]);
const AGE_BANDS = new Set(["kids", "youth", "youngAdults", "adults", "seasoned", "unknown"]);
const STATES = new Set(["observed", "attended", "enrolled", "active", "completed", "unfinished"]);
const KINDS = new Set(["entered", "progressed", "resumed", "completed", "unfinished", "stalled", "regressed", "leadership-prep", "became-leader"]);
const LIVE_STEPS = new Set(["npg", "build", "fdna", "baptized", "grow", "upnext", "connect", "serving", "clt", "leader", "favor-college", "fcx", "lay-pastor"]);
const RESPONSE_LIMITS = Object.freeze({
  "people-pathway-step-current": 5000,
  "people-pathway-step-alltime": 500,
  "people-pathway-step-people": 2000,
  "people-pathway-transitions": 5000,
  "people-pathway-waterfall": 200,
  "people-pathway-freshness": 600,
  "people-pathway-front-door": 40,
  "people-base-counts": 1000,
  "people-leader-counts": 2000,
  "people-leaders-directory": 2000,
});

/* --- Classic People chapter vocabulary (issue 214 / sub-issue 224) -------------
 *
 * A campus token on a ROW is a fact Rock reports, not the campus FILTER the page
 * was opened with, so it is not the four-value CAMPUSES set: it also carries
 * 'UNASSIGNED' for a person with no primary campus, and any campus short code the
 * organisation adds later. It is still closed in shape -- a short upper-case
 * token -- so nothing unbounded, punctuated, or person-shaped can arrive here.
 */
const CAMPUS_CODE_PATTERN = /^[A-Z0-9]{2,12}$/;

/* Freshness bands are 14-day buckets named by their first day, and the top band
 * is a cap that swallows everything older. The cap must therefore be a real band
 * start -- a multiple of 14 -- or the validator rejects it and one capped row
 * fails the whole freshness response. 400 was not (400 % 14 = 8), which is why
 * the Freshness chapter read "unavailable" on prod through 2026-09-09 while the
 * query itself was returning 64 perfectly good rows. 392 = 28 * 14. */
const FRESHNESS_CAP_DAYS = 392;

/* The leader-role tiers, in the order the Classic leader table reads them.
 * `resolves` records what the 2026-09-02 prod schema check found. A tier whose
 * flag is false emits no SQL row at all and is rendered as an explicit gap with
 * the recorded reason -- never as a zero, and never approximated from a name. */
const LEADER_ROLE_TIERS = Object.freeze([
  { id: "connect", label: "Connect leaders", resolves: true, gapReason: null },
  { id: "regional", label: "Regional leaders", resolves: true, gapReason: null },
  { id: "cluster", label: "Cluster leaders", resolves: true, gapReason: null },
  { id: "ministry-team", label: "Ministry Team leaders", resolves: true, gapReason: null },
  { id: "lay-pastor", label: "Lay Pastors", resolves: true, gapReason: null },
]);
const LEADER_ROLE_IDS = new Set(LEADER_ROLE_TIERS.map((tier) => tier.id));
const MINISTRY_TEAM_PREFIX = "ministry-team:";

/* Structural gaps that survive even when every query answers. These are facts
 * about the schema, not about a filter, so they are stated whether the response
 * arrived or not. */
const LEADER_STRUCTURAL_GAPS = Object.freeze([
  {
    role: "section-untiered",
    reason: "Some Connect Group Sections aren't named with the 'Region //' or 'Cluster //' convention. Their leaders resolve to no tier and are counted at no tier, because inventing a tier from a name that doesn't follow the convention would be a guess.",
  },
]);

/* Caveats the reader needs beside the leader table. They are notes, not gaps:
 * the number is real, it just does not mean quite what a reader might assume. */
const LEADER_NOTES = Object.freeze([
  "Rock flags both the Connect Group 'Leader' and 'Assistant Leader' roles as leader roles, so assistant leaders are counted as Connect leaders. The 2025 People PRD recorded the opposite; that caveat is stale on this schema.",
  "Some active Ministry Teams have no leader recorded in Rock. A team with no leader contributes no row, so a leaderless team is an absent team here rather than a zero.",
  "Lay Pastor is read from the Organization Unit 'Lay Pastor' role, which is who holds the role today. The People Pathway step of the same name still has no Rock data and stays a ghost step on the pathway map.",
  "Leaders are counted inside the same Favor People base the counts above total, so the Leader : person ratio compares like with like.",
]);

/* The closed directory tag vocabulary. Every token is backed by a value that
 * exists on prod; the markers that do not resolve are gaps, not absent tags. */
const DIRECTORY_TAGS = Object.freeze([
  { id: "dna-graduate", label: "DNA Graduate", source: "Person attribute DNAGraduate" },
  { id: "build-graduate", label: "Build Graduate", source: "Person attribute BuildGraduate" },
  { id: "baptized", label: "Baptized", source: "Person attribute BaptizedHere" },
  { id: "serving", label: "Serving", source: "Active Ministry Team membership" },
]);
const DIRECTORY_TAG_IDS = new Set(DIRECTORY_TAGS.map((tag) => tag.id));

const DIRECTORY_GAPS = Object.freeze([
  {
    tag: "clt",
    reason: "Connect Leadership Training has no Rock schema behind it beyond a self-report question attribute, so it isn't a directory tag. It stays a marked gap rather than an unticked box.",
  },
  {
    tag: "discipleship-path",
    reason: "The Discipleship Path step program is configured but no step has ever been recorded against it, so a step-derived tag would read as 'nobody has done anything'. No tag is derived from Steps.",
  },
  {
    tag: "baptized",
    reason: "Baptized is read from the 'Baptized Here' attribute because the Baptism Date attribute holds no values. It therefore records baptism at Favor, which is narrower than 'has been baptized'.",
  },
]);

/* The Favor age groups, in reading order, with the labels the Classic strip
 * prints. 'unknown' is a band, not an omission: a person with no birth date is
 * shown as unknown rather than folded into a band or dropped. */
const AGE_BANDS_ORDERED = Object.freeze([
  { id: "kids", label: "Kids" },
  { id: "youth", label: "Youth" },
  { id: "youngAdults", label: "Young Adults" },
  { id: "adults", label: "Adults" },
  { id: "seasoned", label: "Seasoned" },
  { id: "unknown", label: "Unknown" },
]);
const GENDERS_ORDERED = Object.freeze([
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
  { id: "unknown", label: "Unknown" },
]);
/* idealShare is the 15/35/35/15 reference the old People PRD carried, shown as a
 * quiet reference column beside the real shares. It is a target, never a claim
 * about what the data says. */
const LIFECYCLES_ORDERED = Object.freeze([
  { id: "Leader", label: "Leader", idealShare: 15 },
  { id: "Core", label: "Core", idealShare: 35 },
  { id: "Crowd", label: "Crowd", idealShare: 35 },
  { id: "New", label: "New", idealShare: 15 },
]);

/* Front Door Sunday touchpoints.
 *
 * The values come from the canonical Sunday Stats metric observations that
 * TechStatsNew already publishes, so Front Door and Sunday Stats cannot report
 * different numbers for the same Sunday. `rockMetric` is the definition the
 * count is read from and is shown to the reader; it is how a staff member
 * checks a figure against Sunday Inputs without asking anyone.
 *
 * The hues are lane separators, not cohort claims. Every lane is labelled in
 * text and in its aria-label, so no reading depends on telling them apart.
 */
const FRONT_DOOR_SIGNALS = Object.freeze([
  { key: "new-people", label: "New-people bags", token: "--cohort-core", rockMetric: "PPL New People", description: "Welcome bags handed to first-time guests." },
  { key: "hands-raised", label: "Hands raised", token: "--cohort-leader", rockMetric: "PPL Hands Raised", description: "First-time decisions counted at the response." },
  { key: "physical-cards", label: "Orange cards", token: "--cohort-new", rockMetric: "PPL Physical Cards", description: "Physical visitor cards collected." },
  { key: "response-lounge", label: "Response lounge", token: "--move-gain", rockMetric: "PPL Gospel Response Lounge", description: "Guests hosted in the lounge after the service." },
]);
const SIGNAL_KEYS = new Set(FRONT_DOOR_SIGNALS.map((signal) => signal.key));

/* --- Per-step state vocabulary (issue 451, 2026-09-09) ------------------------
 *
 * Two rules meet in this table, and both are about not lying with a number.
 *
 * 1. LABELS ARE ROCK'S OWN WORDS. Where a Connection board backs a step, the
 *    label is the literal name of that board's Kanban column, because that is
 *    what the staff member reading this page sees in Rock all week. The one
 *    deliberate exception is Build and Favor DNA, which SHARE one set of
 *    ConnectionStatus rows: the row Build sits in second-to-last is literally
 *    named "Attended Session 2 / [FDNA] Graduated", which is true on Favor DNA
 *    and false on Build, whose graduation is a different row entirely. So those
 *    two steps get a per-opportunity override -- printing Rock's raw text there
 *    would be actively wrong, not merely off-brand.
 *
 * 2. `?` AND `0` MEAN DIFFERENT THINGS, AND THE DIFFERENCE IS SCHEMA. A state
 *    declared `live` renders its count, and renders a literal 0 when nobody is
 *    in it -- an honest empty column. A state declared `ghost` renders `?`,
 *    because Rock holds nothing that could answer it and a 0 would read as
 *    "we measured this and found nobody" (ADR 0018).
 *
 * The single named exception to rule 2 is Serving's "Left the team", which is
 * declared live so that it renders a literal, deliberately implausible 0 beside
 * hundreds of active volunteers. A `?` there would look like every other
 * unmeasured value and be scanned past; a 0 that obviously cannot be true is
 * meant to make a people pastor stop and ask. That is the whole point of it,
 * and it is why this one is not a violation of ADR 0018 but a decision taken
 * against it on purpose (operator ruling, 2026-09-09).
 */
const STATE_SPECS = Object.freeze({
  npg: [
    { key: "attended", label: "Attended", schemaStatus: "live" },
  ],
  build: [
    { key: "enrolled", label: "New Signup", schemaStatus: "live" },
    { key: "active", label: "Attended Session 1", schemaStatus: "live" },
    { key: "completed", label: "Build Graduated", schemaStatus: "live", note: "All-time, from the Build Graduate attribute -- not this season's Graduates group." },
    { key: "unfinished", label: "Withdrawn from Course", schemaStatus: "live" },
  ],
  fdna: [
    { key: "enrolled", label: "New Signup", schemaStatus: "live" },
    { key: "active", label: "Attended Session 1", schemaStatus: "live" },
    { key: "completed", label: "FDNA Graduated", schemaStatus: "live", note: "All-time, from the DNA Graduate attribute." },
    { key: "unfinished", label: "Withdrawn from Course", schemaStatus: "live" },
  ],
  baptized: [
    { key: "enrolled", label: "Scheduled", schemaStatus: "live", note: "On a Water Baptism board. Only two of these people also carry the attribute, so this is a queue the completion number cannot yet explain." },
    { key: "completed", label: "Baptized at Favor", schemaStatus: "live" },
  ],
  grow: [
    { key: "enrolled", label: "Signed up", schemaStatus: "live", note: "Asked for a Grow course on any of the six course signup forms, all time. Verified on prod 2026-09-10: 355 unique people, 175 of whom appear in no Grow attendance row, because four courses have no cohort group to attend." },
    { key: "active", label: "In class", schemaStatus: "live", note: "Attended a Grow course in the last 90 days." },
    { key: "unfinished", label: "Offboarding", schemaStatus: "live" },
    { key: "completed", label: "Completed", schemaStatus: "ghost", note: "Grow courses record attendance but no completion. #327 owns it." },
  ],
  upnext: [
    { key: "enrolled", label: "New Signup", schemaStatus: "live" },
    { key: "active", label: "Participating", schemaStatus: "live" },
    { key: "completed", label: "Connected", schemaStatus: "live", note: "A state flag on the card, not a column of its own." },
  ],
  connect: [
    { key: "enrolled", label: "Signed up, not yet placed", schemaStatus: "live", note: "Asked for a Connect Group and is not in one today." },
    { key: "active", label: "In a Connect Group", schemaStatus: "live" },
  ],
  serving: [
    { key: "enrolled", label: "Volunteer signup", schemaStatus: "live", note: "A volunteer-to-serve form or an open board card, for someone not yet on a team." },
    { key: "active", label: "On a Ministry Team", schemaStatus: "live" },
    { key: "unfinished", label: "Left the team", schemaStatus: "live", note: "Deliberately zero: only one team's off-the-team workflow is used, so Rock cannot answer this yet. Shown as 0 rather than ? on purpose, because a 0 this implausible is meant to prompt the question." },
  ],
  clt: [
    { key: "enrolled", label: "Submitted the CLT form", schemaStatus: "live", note: "The form closes in under a second, so a submission is a sign-up, never an attainment." },
    { key: "active", label: "Attending training", schemaStatus: "ghost", note: "No session attendance is recorded for CLT anywhere in Rock." },
    { key: "completed", label: "Finished training", schemaStatus: "ghost", note: "Nothing in Rock records who finished CLT." },
  ],
  leader: [
    { key: "active", label: "Holding a leader role", schemaStatus: "live" },
  ],
  "favor-college": [
    { key: "enrolled", label: "Info Night / Application", schemaStatus: "live" },
    { key: "active", label: "Attending class", schemaStatus: "live", note: "Attended one of the six Year 1 groups in the last year. The window is the program's, not the page's: the term runs once a year." },
    { key: "completed", label: "Year 1 Graduate", schemaStatus: "live", note: "All-time, from the Favor College Year 1 Graduate attribute." },
  ],
  fcx: [
    { key: "enrolled", label: "Signed up", schemaStatus: "ghost", note: "FCx has no intake form. Its 13 members were added to the group in one batch." },
    { key: "active", label: "In the FCx group", schemaStatus: "live" },
    { key: "completed", label: "Completed", schemaStatus: "ghost", note: "No attendance has ever been scheduled for FCx and it has no graduate attribute, so nothing can distinguish finishing from joining." },
  ],
  "lay-pastor": [
    { key: "active", label: "Holding the Lay Pastor role", schemaStatus: "live" },
  ],
});

function stateSpecsFor(stepId) {
  const specs = STATE_SPECS[stepId];
  return specs ? specs.map((spec) => ({ ...spec })) : null;
}

const PATHWAYS = Object.freeze([
  {
    id: "foundational", label: "Foundational", description: "New to Crowd to Core: the front door through belonging and serving.", logo: "burst",
    steps: [
      { id: "front-door", label: "Front Door", persistence: "seasonal", grain: "aggregate", schemaStatus: "live", freshnessDays: 28, note: "Independent Sunday touchpoints, read from the Sunday Stats metrics. They overlap, so they never sum to people. Per-person identity starts at New People Gathering." },
      { id: "npg", label: "New People Gathering", persistence: "seasonal", schemaStatus: "live", freshnessDays: 90, note: "Read all-time: attending the New People Gathering is a milestone, so it is never trimmed to a window (issue 451)." },
      { id: "build", label: "Build", persistence: "seasonal", attainedOn: "completed", schemaStatus: "live", freshnessDays: 70, note: "Board-primary, read through the board's own status ladder per opportunity. Build and Favor DNA share status rows, so Build's second-to-last column reads 'Attended Session 2 / FDNA Graduated' in Rock and means only 'attended session 2' here." },
      { id: "fdna", label: "Favor DNA", persistence: "seasonal", attainedOn: "completed", schemaStatus: "live", freshnessDays: 70, note: "Same board and same shared status rows as Build, where the shared 'Attended Session 2 / FDNA Graduated' column genuinely is this step's graduation." },
      // Grow sits beside Build and Favor DNA because that is what it is: the same
      // classroom track, with Build and FDNA broken out of it for clarity. Reading
      // it after Baptisms implied a person does Grow later, which is not the ladder.
      { id: "grow", label: "Grow", persistence: "seasonal", schemaStatus: "live", freshnessDays: 90, note: "The nine Grow electives. Build and Favor DNA are Grow courses too, broken out as their own steps because staff read them separately (issue 446). Signed up aggregates all six course signup forms; in class is attendance, which is tracked by attendance rows and never by group membership (issue 451). Five official courses have no cohort group at all, so their attendance cannot be recorded anywhere yet (issue 459)." },
      { id: "baptized", label: "Baptisms", persistence: "seasonal", attainedOn: "completed", schemaStatus: "live", freshnessDays: 90, note: "Read from the 'Baptized Here' Person attribute, which records baptism at Favor. Narrower than 'has been baptized'. Baptism has no ongoing state -- it is an event, not a course. allTimeCount is the cumulative all-time pool regardless of window." },
      { id: "upnext", label: "UPNEXT Track", persistence: "seasonal", optional: true, schemaStatus: "live", freshnessDays: 56 },
      { id: "connect", label: "Connect Group", persistence: "current", schemaStatus: "live", freshnessDays: 90, campusNote: "Manila-only today" },
      { id: "serving", label: "Serving", persistence: "current", schemaStatus: "live", freshnessDays: 90 },
    ],
  },
  {
    id: "leadership-readiness", label: "Leadership Pathway", description: "Open doors before appointment: training for anyone leaning in.", note: "This pathway is about readiness, not appointment: it is open to anyone leaning in, and being on it doesn't mean someone leads yet.", logo: "spark",
    steps: [
      { id: "clt", label: "Connect Leadership Training", persistence: "seasonal", schemaStatus: "live", freshnessDays: 28, note: "The CLT form is a single step that closes in under a second and opens an UPNEXT card, so its submissions are sign-ups. Nothing in Rock records who attended or finished (issue 451)." },
      { id: "mlt", label: "Ministry Leader Training", persistence: "seasonal", schemaStatus: "ghost", freshnessDays: 28, uniqueCount: null, ghostNote: "No Rock schema yet. Reserved, not zero." },
    ],
  },
  {
    id: "active-leadership", label: "Active leadership and beyond", description: "Appointed leaders, Favor College, and the roads past it.", logo: "scallop",
    steps: [
      { id: "leader", label: "Leader", persistence: "invariant", schemaStatus: "live", freshnessDays: 0 },
      { id: "leaders-lab", label: "Leaders Lab", persistence: "seasonal", schemaStatus: "ghost", freshnessDays: 180, uniqueCount: null, ghostNote: "No Rock schema yet." },
      { id: "favor-college", label: "Favor College Year 1", persistence: "seasonal", attainedOn: "completed", schemaStatus: "live", freshnessDays: 365, note: "Reads attendance on the six Year 1 groups, which hold no members and never have, plus the Info Night and Application forms and the Year 1 Graduate attribute (issue 451)." },
      { id: "fcx", label: "Favor College X (FCX)", persistence: "seasonal", schemaStatus: "live", freshnessDays: 365, note: "Group membership is the only FCx signal that exists: no attendance has ever been scheduled, and there is no intake form or graduate attribute. Being in the group cannot yet be told apart from finishing (issue 451)." },
      { id: "people-care", label: "People Care Pathway", persistence: "seasonal", schemaStatus: "ghost", freshnessDays: 365, uniqueCount: null, ghostNote: "No Rock schema yet." },
      { id: "lay-pastor", label: "Lay Pastor", persistence: "invariant", schemaStatus: "live", freshnessDays: 0, note: "Read from the pinned Lay Pastor GroupTypeRole on the MNL Pastors group -- the same role people-leader-counts already resolves. Retired as a ghost under issue 446." },
      { id: "church-planting", label: "Church Planting", persistence: "invariant", schemaStatus: "ghost", freshnessDays: 0, uniqueCount: null, ghostNote: "No Rock schema yet." },
    ],
  },
]);

const FIELD_SPECS = Object.freeze({
  "people-pathway-step-current": {
    stepId: "step", lifecycle: "lifecycle", gender: "gender", ageBand: "age", stateKey: "state", uniquePeople: "count",
  },
  "people-pathway-step-alltime": {
    stepId: "step", uniquePeople: "count",
  },
  "people-pathway-step-people": {
    personRef: "personRef", displayName: "name", lifecycle: "lifecycle", gender: "gender", ageBand: "age", stepId: "step", stateKey: "state", sinceDate: "nullableDate",
  },
  "people-pathway-transitions": {
    personRef: "personRef", displayName: "name", stepId: "step", kind: "kind", movedDate: "nullableDate",
  },
  "people-pathway-waterfall": { kind: "nullableKind", stepId: "nullableStep", uniquePeople: "count", compareDate: "date" },
  "people-pathway-freshness": { stepId: "step", bandFromDays: "nullableBand", uniquePeople: "count" },
  "people-pathway-front-door": { signalKey: "signal", observedDate: "date", observedValue: "count" },
  "people-base-counts": {
    campusShortCode: "campusCode", ageBand: "age", gender: "gender", lifecycle: "lifecycle", uniquePeople: "count",
  },
  "people-leader-counts": {
    campusShortCode: "campusCode", leaderRole: "leaderRole", uniquePeople: "count",
  },
  "people-leaders-directory": {
    personRef: "personRef", displayName: "name", leaderRole: "directoryRole",
    teamNames: "nullableTeamNames", tags: "nullableTags",
    campusShortCode: "campusCode", sinceDate: "nullableDate",
  },
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeString(value, max = 200) {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function isStableIdentifier(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/* `ministry-team:<team name>` is the one open-ended leader role, and it is open
 * only in the team's own name. The name must be non-empty, free of the `,` the
 * island splits lists on, free of the `//` that marks a person-name convention,
 * and short. Anything else fails the row, and a failed row fails its response --
 * the whole reading degrades to unavailable rather than silently losing a team. */
function isTeamNameToken(value) {
  return isSafeString(value, 120)
    && value === value.trim()
    && !value.includes(",")
    && !value.includes("//");
}

function isLeaderRole(value) {
  if (typeof value !== "string") return false;
  if (LEADER_ROLE_IDS.has(value)) return value !== "ministry-team";
  if (!value.startsWith(MINISTRY_TEAM_PREFIX)) return false;
  return isTeamNameToken(value.slice(MINISTRY_TEAM_PREFIX.length));
}

function splitClosedList(value, isMember, max) {
  const parts = String(value).split(",");
  if (parts.length > max) return null;
  const seen = new Set();
  for (const part of parts) {
    if (!isMember(part) || seen.has(part)) return null;
    seen.add(part);
  }
  return parts;
}

function validField(kind, value) {
  if (kind === "step") return typeof value === "string" && LIVE_STEPS.has(value);
  if (kind === "lifecycle") return typeof value === "string" && LIFECYCLES.has(value);
  if (kind === "gender") return typeof value === "string" && GENDERS.has(value);
  if (kind === "age") return typeof value === "string" && AGE_BANDS.has(value);
  if (kind === "state") return typeof value === "string" && STATES.has(value);
  if (kind === "kind") return typeof value === "string" && KINDS.has(value);
  if (kind === "nullableKind") return value === null || (typeof value === "string" && KINDS.has(value));
  if (kind === "nullableStep") return value === null || (typeof value === "string" && LIVE_STEPS.has(value));
  if (kind === "signal") return typeof value === "string" && SIGNAL_KEYS.has(value);
  if (kind === "date") return isIsoDate(value);
  if (kind === "count") return Number.isSafeInteger(value) && value >= 0;
  if (kind === "personRef") return Number.isSafeInteger(value) && value > 0;
  if (kind === "name") return isSafeString(value, 200);
  if (kind === "nullableDate") return value === null || isIsoDate(value);
  if (kind === "nullableBand") return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= FRESHNESS_CAP_DAYS && value % 14 === 0);
  if (kind === "campusCode") return typeof value === "string" && CAMPUS_CODE_PATTERN.test(value);
  if (kind === "leaderRole") return isLeaderRole(value);
  if (kind === "directoryRole") return typeof value === "string" && LEADER_ROLE_IDS.has(value);
  if (kind === "nullableTeamNames") return value === null || (isSafeString(value, 2000) && splitClosedList(value, isTeamNameToken, 60) !== null);
  if (kind === "nullableTags") return value === null || (isSafeString(value, 200) && splitClosedList(value, (tag) => DIRECTORY_TAG_IDS.has(tag), DIRECTORY_TAG_IDS.size) !== null);
  return false;
}

function validateRows(queryId, rows) {
  const specs = FIELD_SPECS[queryId];
  if (!Array.isArray(rows) || rows.length > RESPONSE_LIMITS[queryId]) throw new TypeError("rows exceed the registered response shape");
  return rows.map((row) => {
    if (!isRecord(row) || !hasExactKeys(row, Object.keys(specs))) throw new TypeError("row is not a closed registered result");
    for (const [field, kind] of Object.entries(specs)) {
      if (!validField(kind, row[field])) throw new TypeError(`invalid ${queryId}.${field}`);
    }
    return { ...row };
  });
}

function readResponse(queryId, value) {
  try {
    if (!isRecord(value)) throw new TypeError("response is not an object");
    if (hasExactKeys(value, ["status", "queryId", "code"]) && value.status === "refused" && isStableIdentifier(value.queryId) && value.queryId === queryId && isStableIdentifier(value.code)) {
      return { status: "unavailable", rows: [], reason: "The registered production read was refused." };
    }
    if (!hasExactKeys(value, ["status", "queryId", "rows"]) || value.status !== "ok" || !isStableIdentifier(value.queryId) || value.queryId !== queryId) {
      throw new TypeError("response is not the registered success shape");
    }
    const rows = validateRows(queryId, value.rows);
    return { status: "available", rows, bounded: rows.length === RESPONSE_LIMITS[queryId] };
  } catch {
    return { status: "unavailable", rows: [], reason: "The registered production response was unavailable or malformed." };
  }
}

function emptySegments() {
  return {
    lifecycle: { new: 0, crowd: 0, core: 0, leader: 0 },
    gender: { women: 0, men: 0, unknown: 0 },
    age: { kids: 0, youth: 0, youngAdults: 0, adults: 0, seasoned: 0 },
    /* The state ladder is a stack dimension like the other three: every row of
     * the current read carries exactly one stateKey, so the state segments sum
     * to the step's unique count the same way lifecycle does. Ghost states are
     * absent here on purpose -- they have no count to stack, and the step's own
     * chips already say `?` for them (ADR 0018). */
    state: { observed: 0, enrolled: 0, attended: 0, active: 0, completed: 0, unfinished: 0 },
  };
}

function clonePathways() {
  return PATHWAYS.map((path) => ({
    ...path,
    steps: path.steps.map((step) => {
      const specs = stateSpecsFor(step.id);
      return specs ? { ...step, stateSpecs: specs } : { ...step };
    }),
  }));
}

/* Turns a step's declared state vocabulary into what the renderer prints.
 *
 * A state declared `live` always appears, and appears as 0 when no row arrived:
 * that is an honestly empty column, and the reader is entitled to see it. A
 * state declared `ghost` appears with a null count, which the renderer draws as
 * `?` -- Rock holds nothing that could answer it, so a 0 would be a claim we
 * have not earned (ADR 0018).
 *
 * A state key that arrives in the data but was never declared is still shown,
 * flagged `undeclared`, rather than dropped. Silently discarding people because
 * the config is behind the query is exactly the failure this whole pass exists
 * to stop.
 */
function readStates(step, counts) {
  const specs = step.stateSpecs;
  if (!specs) return null;
  const seen = new Set();
  const readings = specs.map((spec) => {
    seen.add(spec.key);
    return {
      key: spec.key,
      label: spec.label,
      note: spec.note || null,
      schemaStatus: spec.schemaStatus,
      count: spec.schemaStatus === "ghost" ? null : (counts[spec.key] || 0),
    };
  });
  for (const [key, count] of Object.entries(counts)) {
    if (seen.has(key)) continue;
    readings.push({ key, label: key, note: null, schemaStatus: "undeclared", count });
  }
  return readings;
}

function mapCurrent(pathways, result) {
  const byStep = new Map();
  if (result.status === "available") {
    for (const row of result.rows) {
      let item = byStep.get(row.stepId);
      if (!item) {
        item = { uniqueCount: 0, states: {}, segments: emptySegments() };
        byStep.set(row.stepId, item);
      }
      item.uniqueCount += row.uniquePeople;
      item.states[row.stateKey] = (item.states[row.stateKey] || 0) + row.uniquePeople;
      item.segments.lifecycle[row.lifecycle.toLowerCase()] += row.uniquePeople;
      item.segments.gender[row.gender] += row.uniquePeople;
      if (row.ageBand !== "unknown") item.segments.age[row.ageBand] += row.uniquePeople;
      if (row.stateKey in item.segments.state) item.segments.state[row.stateKey] += row.uniquePeople;
    }
  }
  for (const path of pathways) {
    for (const step of path.steps) {
      if (step.schemaStatus === "ghost" || step.grain === "aggregate") continue;
      const reading = byStep.get(step.id);
      if (result.status === "available") {
        Object.assign(step, reading || { uniqueCount: 0, states: {}, segments: emptySegments() });
        step.stateReadings = readStates(step, step.states || {});
      } else {
        step.availability = { status: "unavailable", reason: result.reason };
      }
    }
  }
}

/* Maps the all-time unbounded unique count per step onto the step objects.
 * Only applies to seasonal and current steps; aggregate/ghost/invariant steps
 * are skipped. allTimeCount stays null if the query was unavailable, so the
 * render layer can distinguish "no data yet" from a true zero. */
function mapAllTime(pathways, result) {
  const byStep = new Map();
  if (result.status === "available") {
    for (const row of result.rows) {
      byStep.set(row.stepId, (byStep.get(row.stepId) || 0) + row.uniquePeople);
    }
  }
  for (const path of pathways) {
    for (const step of path.steps) {
      if (step.schemaStatus === "ghost" || step.grain === "aggregate" || step.persistence === "invariant") continue;
      step.allTimeCount = result.status === "available" ? (byStep.get(step.id) ?? null) : null;
    }
  }
}

/* Surname redaction. Every person this island names is redacted -- attenders and
 * leaders alike. No full name renders anywhere on Pathways.
 *
 * ADR 0017's leader-name exemption is a Connect Field ruling and does not reach
 * this surface: a leader here is a row in a pathway, not a published contact, so
 * the operator's rule for this dashboard is that surnames are always initials.
 * Both readers of a name -- the person layer and the leaders directory -- go
 * through this one helper so the two can never drift apart.
 *
 * "John Ramos" -> "John R.". A trailing generational suffix is dropped rather
 * than initialised, because "John R. Jr." re-narrows the person the redaction
 * just widened. A single-token name has no surname to redact and is left alone.
 */
const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

export function shortName(displayName) {
  if (typeof displayName !== "string") return displayName;
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (parts.length < 2) return parts.join(" ");
  const surname = parts.pop();
  const initial = [...surname][0];
  return `${parts.join(" ")} ${initial.toUpperCase()}.`;
}

function mapPeople(peopleResult, transitionsResult) {
  if (peopleResult.status !== "available") return [];
  const people = new Map();
  for (const row of peopleResult.rows) {
    let person = people.get(row.personRef);
    if (!person) {
      // Redacted at the seam, not at render time: the full surname never enters
      // the bundle, so it cannot leak through an export, a copied prompt, or the
      // downloadable package.
      person = { ref: row.personRef, displayName: shortName(row.displayName), lifecycle: row.lifecycle.toLowerCase(), gender: row.gender, ageBand: row.ageBand, holdings: [], trajectory: [] };
      people.set(row.personRef, person);
    }
    if (person.displayName !== shortName(row.displayName) || person.lifecycle !== row.lifecycle.toLowerCase() || person.gender !== row.gender || person.ageBand !== row.ageBand) continue;
    person.holdings.push({ stepId: row.stepId, stateKey: row.stateKey, sinceDate: row.sinceDate });
  }
  if (transitionsResult.status === "available") {
    for (const row of transitionsResult.rows) {
      const person = people.get(row.personRef);
      if (!person || person.displayName !== shortName(row.displayName)) continue;
      person.trajectory.push({ stepId: row.stepId, kind: row.kind, date: row.movedDate });
    }
  }
  for (const person of people.values()) {
    person.trajectory.sort((left, right) => String(left.date || "9999-12-31").localeCompare(String(right.date || "9999-12-31")) || left.stepId.localeCompare(right.stepId));
  }
  return [...people.values()];
}

function mapFreshness(result) {
  if (result.status !== "available") return [];
  const rows = new Map();
  for (const row of result.rows) {
    let item = rows.get(row.stepId);
    if (!item) {
      const configured = PATHWAYS.flatMap((path) => path.steps).find((step) => step.id === row.stepId);
      item = { stepId: row.stepId, windowDays: configured?.freshnessDays || 90, densityBins: [], undatedPeople: 0 };
      rows.set(row.stepId, item);
    }
    if (row.bandFromDays === null) item.undatedPeople += row.uniquePeople;
    else {
      const capped = row.bandFromDays === FRESHNESS_CAP_DAYS;
      item.densityBins.push({
        fromDays: row.bandFromDays,
        toDays: row.bandFromDays + 13,
        capped,
        label: capped ? `${FRESHNESS_CAP_DAYS}+ days` : `${row.bandFromDays}–${row.bandFromDays + 13} days`,
        count: row.uniquePeople,
      });
    }
  }
  for (const item of rows.values()) {
    item.densityBins.sort((a, b) => a.fromDays - b.fromDays);
    item.datedPeople = item.densityBins.reduce((sum, bin) => sum + bin.count, 0);
    item.oldestBandFromDays = item.densityBins.length ? item.densityBins[item.densityBins.length - 1].fromDays : null;
    item.capped = item.densityBins.some((bin) => bin.capped);
  }
  return [...rows.values()];
}

/* Every live step in the configuration that this read carries no dated source for.
 *
 * A step with no row used to vanish from the chapter without a word, which reads
 * as "nothing is stale here" when the truth is "nothing here has a date to age
 * from". Naming them keeps the chapter's silence explicit (ADR 0018). */
function freshnessGaps(pathways, freshness) {
  const measured = new Set(freshness.map((row) => row.stepId));
  return pathways.flatMap((path) => path.steps)
    .filter((step) => step.schemaStatus === "live" && step.grain !== "aggregate" && step.persistence !== "invariant")
    .filter((step) => !measured.has(step.id))
    .map((step) => step.id);
}

/* Front Door: four independent Sunday observations, each with its own short
 * history. The query returns up to five observed Sundays per signal; a Sunday
 * with no observation is an absent row, so an unobserved week reads as
 * unobserved rather than as a zero. A signal that returned nothing at all keeps
 * a null value and says so; the renderer never prints 0 for "not counted".
 */
function frontDoorStep(pathways) {
  return pathways.flatMap((path) => path.steps).find((step) => step.id === "front-door") || null;
}

function mapFrontDoor(pathways, result) {
  const step = frontDoorStep(pathways);
  if (!step) return;
  if (result.status !== "available") {
    step.availability = { status: "unavailable", reason: result.reason };
    return;
  }
  const series = new Map(FRONT_DOOR_SIGNALS.map((signal) => [signal.key, []]));
  for (const row of result.rows) {
    const bucket = series.get(row.signalKey);
    if (bucket) bucket.push({ date: row.observedDate, value: row.observedValue });
  }
  let latestObserved = null;
  const signals = FRONT_DOOR_SIGNALS.map((signal) => {
    const observations = (series.get(signal.key) || [])
      .sort((left, right) => right.date.localeCompare(left.date));
    const latest = observations[0] || null;
    const previous = observations[1] || null;
    // The four-week average spans whatever was actually observed in the window,
    // and reports how many Sundays that was, so a short series is visibly short.
    const window = observations.slice(0, 4);
    const average = window.length
      ? Math.round(window.reduce((sum, item) => sum + item.value, 0) / window.length)
      : null;
    if (latest && (!latestObserved || latest.date > latestObserved)) latestObserved = latest.date;
    return {
      key: signal.key,
      label: signal.label,
      token: signal.token,
      rockMetric: signal.rockMetric,
      description: signal.description,
      value: latest ? latest.value : null,
      observedDate: latest ? latest.date : null,
      previousValue: previous ? previous.value : null,
      previousDate: previous ? previous.date : null,
      delta: latest && previous ? latest.value - previous.value : null,
      averageValue: average,
      averageWeeks: window.length,
      observations,
    };
  });
  step.aggregateSignals = signals;
  step.observedDate = latestObserved;
  step.signalsObserved = signals.filter((signal) => signal.value !== null).length;
}

function mapWaterfall(result, compareDate) {
  if (result.status !== "available") return null;
  const totals = new Map();
  for (const row of result.rows) {
    if (row.kind === null || row.stepId === null) continue;
    const key = row.kind;
    totals.set(key, (totals.get(key) || 0) + row.uniquePeople);
  }
  const movements = [...totals].map(([kind, count]) => ({
    kind,
    label: ({ entered: "Entered", progressed: "Progressed", completed: "Completed", "leadership-prep": "Entered leadership prep", "became-leader": "Became Leader", unfinished: "Unfinished", stalled: "Stalled", regressed: "Regressed", resumed: "Resumed" })[kind] || kind,
    delta: ["unfinished", "stalled", "regressed"].includes(kind) ? -count : count,
    affectsTotal: false,
  }));
  return {
    status: "partial",
    compareDate,
    anchorBeforeLabel: "Last Sunday",
    anchorNowLabel: "Now",
    anchorBefore: null,
    anchorNow: null,
    movements,
    unavailableKinds: [...KINDS].filter((kind) => !totals.has(kind)),
    note: "Bounded V1 movement rows are shown. Snapshot anchors and unrecoverable movement kinds are unavailable, so this isn't a complete reconciliation.",
  };
}

/* --- Classic People chapter mappers -------------------------------------------
 *
 * All three follow one rule: a refused or malformed response produces an
 * unavailable section with NO rows, never a section full of zeroes. The Classic
 * renderer prints the unavailable mark for an unavailable section, so a read that
 * did not happen can never be mistaken for a church with nobody in it.
 */
function availabilityOf(result) {
  return result.status === "available"
    ? { status: "available", reason: null }
    : { status: "unavailable", reason: result.reason };
}

function leaderGaps() {
  const unresolved = LEADER_ROLE_TIERS
    .filter((tier) => !tier.resolves)
    .map((tier) => ({ role: tier.id, reason: tier.gapReason }));
  return [...unresolved, ...LEADER_STRUCTURAL_GAPS.map((gap) => ({ ...gap }))];
}

function mapBaseCounts(result) {
  return {
    availability: availabilityOf(result),
    dimensions: {
      ageBands: AGE_BANDS_ORDERED.map((band) => ({ ...band })),
      genders: GENDERS_ORDERED.map((item) => ({ ...item })),
      lifecycles: LIFECYCLES_ORDERED.map((item) => ({ ...item })),
    },
    rows: result.status === "available"
      ? result.rows.map((row) => ({
        campus: row.campusShortCode,
        ageBand: row.ageBand,
        gender: row.gender,
        lifecycle: row.lifecycle,
        count: row.uniquePeople,
      }))
      : [],
  };
}

function mapLeaderCounts(result) {
  const rows = result.status === "available"
    ? result.rows.map((row) => {
      const team = row.leaderRole.startsWith(MINISTRY_TEAM_PREFIX)
        ? row.leaderRole.slice(MINISTRY_TEAM_PREFIX.length)
        : null;
      return {
        campus: row.campusShortCode,
        role: team === null ? row.leaderRole : "ministry-team",
        team,
        count: row.uniquePeople,
      };
    })
    : [];
  return {
    availability: availabilityOf(result),
    tiers: LEADER_ROLE_TIERS.map((tier) => ({ ...tier })),
    rows,
    gaps: leaderGaps(),
    notes: [...LEADER_NOTES],
  };
}

/* The directory is display-only person data (plan D8/D16). personLevel travels
 * with the section so every view model built from it inherits the flag and the
 * export rail refuses the section by construction rather than by remembering. */
function mapDirectory(result) {
  return {
    availability: availabilityOf(result),
    personLevel: true,
    tagVocabulary: DIRECTORY_TAGS.map((tag) => ({ ...tag })),
    gaps: DIRECTORY_GAPS.map((gap) => ({ ...gap })),
    page: {
      offset: 0,
      limit: RESPONSE_LIMITS["people-leaders-directory"],
      exhaustive: false,
    },
    rows: result.status === "available"
      ? result.rows.map((row) => ({
        ref: row.personRef,
        name: shortName(row.displayName),
        role: row.leaderRole,
        teams: row.teamNames === null ? [] : row.teamNames.split(","),
        tags: row.tags === null ? [] : row.tags.split(","),
        campus: row.campusShortCode,
        since: row.sinceDate,
      }))
      : [],
  };
}

const UNAVAILABLE_RESULT = Object.freeze({
  status: "unavailable",
  rows: [],
  reason: "Live Rock query pending. Reserved, not zero.",
});

export function fallbackBundle(campus = "MNL") {
  const resolvedCampus = CAMPUSES.has(campus) ? campus : "MNL";
  const pathways = clonePathways();
  for (const path of pathways) {
    for (const step of path.steps) {
      if (step.schemaStatus === "ghost") continue;
      step.availability = { status: "unavailable", reason: "Live Rock query pending. Reserved, not zero." };
    }
  }
  mapAllTime(pathways, UNAVAILABLE_RESULT);
  return {
    schemaVersion: 1,
    fictional: false,
    meta: {
      campus: resolvedCampus,
      compareAnchor: "last Sunday",
      migrationThrough: MIGRATION_THROUGH,
      compareDate: null,
      personLayerAuthorized: false,
      profileNote: "Profile links use the runtime person reference on this Rock host.",
      queryAvailability: Object.fromEntries(QUERY_IDS.map((queryId) => [queryId, { status: "unavailable", bounded: false, reason: "Live Rock query pending." }])),
      personPage: { offset: 0, limit: RESPONSE_LIMITS["people-pathway-step-people"], exhaustive: false },
      transitionPage: { limit: RESPONSE_LIMITS["people-pathway-transitions"], exhaustive: false },
    },
    pathways,
    people: [],
    waterfall: {
      status: "partial",
      compareDate: null,
      anchorBeforeLabel: "Last Sunday",
      anchorNowLabel: "Now",
      anchorBefore: null,
      anchorNow: null,
      movements: [],
      unavailableKinds: [...KINDS],
      note: "Live movement comparisons will populate once Sunday snapshots resolve.",
    },
    freshness: [],
    freshnessGaps: [],
    freshnessCapDays: FRESHNESS_CAP_DAYS,
    base: mapBaseCounts(UNAVAILABLE_RESULT),
    leaders: mapLeaderCounts(UNAVAILABLE_RESULT),
    directory: mapDirectory(UNAVAILABLE_RESULT),
  };
}

export function responsesToBundle(payload) {
  if (!isRecord(payload) || !hasExactKeys(payload, ["schemaVersion", "dashboardId", "campus", "responses"]) || payload.schemaVersion !== 1 || payload.dashboardId !== DASHBOARD_ID || !CAMPUSES.has(payload.campus) || !isRecord(payload.responses) || !hasExactKeys(payload.responses, QUERY_IDS)) {
    throw new TypeError("People Pathway island payload isn't the closed production shape");
  }
  const results = Object.fromEntries(QUERY_IDS.map((queryId) => [queryId, readResponse(queryId, payload.responses[queryId])]));
  const pathways = clonePathways();
  mapCurrent(pathways, results["people-pathway-step-current"]);
  mapAllTime(pathways, results["people-pathway-step-alltime"]);
  mapFrontDoor(pathways, results["people-pathway-front-door"]);
  const peopleResult = results["people-pathway-step-people"];
  const transitionsResult = results["people-pathway-transitions"];
  const waterfallResult = results["people-pathway-waterfall"];
  const comparisonDate = waterfallResult.rows.find((row) => isIsoDate(row.compareDate))?.compareDate || null;
  const freshness = mapFreshness(results["people-pathway-freshness"]);
  return {
    schemaVersion: 1,
    fictional: false,
    meta: {
      campus: payload.campus,
      compareAnchor: "last Sunday",
      migrationThrough: MIGRATION_THROUGH,
      compareDate: comparisonDate,
      personLayerAuthorized: peopleResult.status === "available",
      profileNote: "Profile links use the runtime person reference on this Rock host.",
      queryAvailability: Object.fromEntries(Object.entries(results).map(([queryId, result]) => [queryId, { status: result.status, bounded: result.bounded === true, reason: result.reason || null }])),
      personPage: { offset: 0, limit: RESPONSE_LIMITS["people-pathway-step-people"], exhaustive: false },
      transitionPage: { limit: RESPONSE_LIMITS["people-pathway-transitions"], exhaustive: false },
    },
    pathways,
    people: mapPeople(peopleResult, transitionsResult),
    waterfall: mapWaterfall(waterfallResult, comparisonDate),
    freshness,
    freshnessGaps: freshnessGaps(pathways, freshness),
    freshnessCapDays: FRESHNESS_CAP_DAYS,
    base: mapBaseCounts(results["people-base-counts"]),
    leaders: mapLeaderCounts(results["people-leader-counts"]),
    directory: mapDirectory(results["people-leaders-directory"]),
  };
}
