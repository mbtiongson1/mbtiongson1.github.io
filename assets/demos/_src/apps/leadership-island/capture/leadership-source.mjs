/* Leadership — the data layer (#600, slice C)
 * ===========================================================================================
 * Pure functions over a DashboardProdRead bundle. No DOM, no fetch, no globals, so every rule
 * that decides what a number MEANS is testable without a browser (tests/test_leadership_source.mjs).
 *
 * The rendering module holds no arithmetic of its own. If a number on the page cannot be traced
 * to a function here, that is a bug in the seam rather than a shortcut.
 *
 * ------------------------------------------------------------------------------ the two rules
 *
 * 1. PEOPLE, NOT TAGS. Leading three Connect Groups is one leader. Every headline count is a
 *    distinct-person count, which is why the headline is derived from the ROSTER (person grain)
 *    and never by summing `people-leader-tier` (which is grouped by branch and tier, so a person
 *    who leads on both ladders appears in two rows and summing double-counts them).
 *
 * 2. AGE COMES FROM THE GROUP, NOT THE LEADER. A 24-year-old leading a Youth group counts as
 *    Youth. This is #601's `groupAge`, and it is deliberately NOT the `age` key Pathways uses,
 *    which is person-derived. The two never cross a tab boundary (ADR 0022, deny by default).
 *
 * --------------------------------------------------------------------------- failing closed
 *
 * `adapt()` validates every response against the exact field list in ops/dashboard-prod-read.json
 * and routes anything refused, malformed, or missing into `unavailable` WITH ITS REASON. A
 * reading with no data renders as an absence that keeps its place in the layout and says why
 * (ADR 0018). It never becomes zero, and it never silently disappears.
 */

import { tableSection, kpiSection, filterSummaryLine, UNAVAILABLE_MARK } from "./dashboard-view.mjs?v=20260918_001";

export const DASHBOARD_ID = "favor-leadership";

/* The exact result field list of each registered query. Kept here as a closed contract so a
 * schema drift on prod surfaces as a named unavailability rather than as `undefined` rendering
 * as a blank cell. ops/dashboard-prod-read.json is canonical; this must match it. */
export const QUERY_FIELDS = Object.freeze({
  "people-leader-tier": Object.freeze([
    "campusShortCode", "branch", "tier", "teamName", "uniquePeople",
  ]),
  "people-leader-span-of-care": Object.freeze([
    "campusShortCode", "tier", "sectionRef", "parentRef", "sectionLabel", "ageBand",
    "sectionLeaders", "connectLeaders", "leafGroups", "peopleUnderneath",
    "distinctPeopleUnderneath",
  ]),
  "people-ministry-structure": Object.freeze([
    "campusShortCode", "teamRef", "parentRef", "teamName", "overallHeads", "unitHeads",
    "teamLeads", "captains", "potentialCaptains", "volunteers", "activeMembers",
  ]),
  "people-serving-signups": Object.freeze([
    "campusShortCode", "connectionTypeId", "areaName", "statusName", "requests",
  ]),
  "people-connect-capacity": Object.freeze([
    "campusShortCode", "band", "people", "inGroup", "inGroupPersonBand", "groups", "memberships",
  ]),
  /* `gender` and `groupAge` were added 2026-09-18 (#638) so the peg's two composition readings
   * can be drawn from prod. `groupAge` is GROUP-derived -- the band of the context group, not of
   * the person -- and is null for every ministry row, which the page draws as a ghost. */
  "people-leader-roster": Object.freeze([
    "campusShortCode", "personRef", "displayName", "branch", "tier", "contextRef", "contextLabel",
    "gender", "groupAge",
  ]),
});

export const QUERY_IDS = Object.freeze(Object.keys(QUERY_FIELDS));

/* The roster is paged. If a response comes back exactly at the cap it may be truncated, and a
 * truncated roster would make every headline count quietly low. The headline refuses rather
 * than under-reports; see `headline()`. */
export const ROSTER_ROW_LIMIT = 2000;

/* ------------------------------------------------------------------------------- vocabulary --
 * The machine-readable twin of ops/leadership-vocabulary.json and
 * docs/leadership-ubiquitous-language.md (#601), compiled in because an island cannot read ops/
 * at runtime. Every tier token, label and ladder position is defined once, here.
 *
 * Both ladders are listed BOTTOM-UP and are never re-sorted by magnitude. The shape of the
 * pyramid is the reading; sorting it would destroy the only thing it says. */
export const TIERS = Object.freeze({
  "connect": { label: "Connect Leader", branch: "connect", rank: 0,
    note: "Includes Assistant Leaders: both roles are flagged IsLeader on the Connect Group type." },
  "regional": { label: "Regional Leader", branch: "connect", rank: 1 },
  "cluster": { label: "Cluster Head", branch: "connect", rank: 2 },
  "section": { label: "Section Overseer", branch: "connect", rank: 3,
    note: "No such role exists in Rock. The tier is the leader of a section group whose name carries no separator — the campus-and-age-band tier above Cluster." },
  "lay-pastor": { label: "Lay Pastor", branch: null, rank: 0,
    note: "Beside the Connect ladder, not on it. Disjoint from Section Overseer: different group types, different roles, and no one on prod holds both." },
  "ministry-potential-captain": { label: "Potential Captain", branch: "ministry", rank: 0,
    note: "The named pipeline into Captain. Counted as bench depth, never as an appointed leader." },
  "ministry-captain": { label: "Captain", branch: "ministry", rank: 1,
    note: "Not flagged IsLeader in Rock. A Captain is a leader in Favor's language and is not one in Rock's schema, so every Leadership query resolves this tier by role Guid rather than by the flag." },
  "ministry-team-lead": { label: "Team Lead", branch: "ministry", rank: 2 },
  "ministry-unit-head": { label: "Unit Head", branch: "ministry", rank: 3 },
  "ministry-overall-head": { label: "Overall Head", branch: "ministry", rank: 4 },
});

export const CONNECT_LADDER = Object.freeze(["connect", "regional", "cluster", "section"]);
export const MINISTRY_LADDER = Object.freeze([
  "ministry-potential-captain", "ministry-captain", "ministry-team-lead",
  "ministry-unit-head", "ministry-overall-head",
]);

/* Potential Captain is bench, not appointment: it is drawn on the ladder and excluded from
 * "leaders in view". Captain IS counted, because a Captain carries responsibility in Favor's
 * language even though Rock does not flag the role — the peg counts them and so does this page.
 * Both choices are stated on the surface rather than left to be inferred from a total. */
export const HEADLINE_EXCLUDED_TIERS = Object.freeze(["ministry-potential-captain"]);

export const BRANCHES = Object.freeze({
  connect: { label: "Connect", description: "The pastoral care structure: how everyone is cared for in groups." },
  ministry: { label: "Ministry", description: "The serving structure: the teams that run services and events." },
});

/* Campus order is fixed suite-wide: Manila, Brisbane, Seoul, then church-wide (#351). */
export const CAMPUSES = Object.freeze([
  { id: "MNL", label: "Manila" },
  { id: "BNE", label: "Brisbane" },
  { id: "SEL", label: "Seoul" },
  { id: "ALL", label: "All campuses" },
]);

export function tierLabel(tier) {
  return TIERS[tier] ? TIERS[tier].label : String(tier || "");
}

export function ladderFor(branch) {
  if (branch === "connect") return CONNECT_LADDER;
  if (branch === "ministry") return MINISTRY_LADDER;
  return [];
}

/* --------------------------------------------------------------------------- the adapter ---- */

const NUMERIC = new Set([
  "uniquePeople", "sectionRef", "parentRef", "sectionLeaders", "connectLeaders", "leafGroups",
  "peopleUnderneath", "distinctPeopleUnderneath", "teamRef", "overallHeads", "unitHeads",
  "teamLeads", "captains", "potentialCaptains", "volunteers", "activeMembers",
  "connectionTypeId", "requests", "people", "inGroup", "inGroupPersonBand", "groups",
  "memberships", "personRef", "contextRef",
]);

function coerceRow(row, fields) {
  const out = {};
  for (const field of fields) {
    const value = row[field];
    if (NUMERIC.has(field)) out[field] = value === null || value === undefined ? null : Number(value);
    else out[field] = value === null || value === undefined ? null : String(value);
  }
  return out;
}

/* A closed adapter. Anything it cannot prove is well-formed becomes a named unavailability
 * rather than a partially-rendered reading. The reason strings are written to be READ BY A
 * MEMBER OF STAFF on the page, not by a developer in a console. */
export function adapt(bundle, { pending = false } = {}) {
  const responses = {};
  const unavailable = {};
  const source = bundle && typeof bundle === "object" ? bundle : {};
  const declared = source.unavailable && typeof source.unavailable === "object" ? source.unavailable : {};
  const raw = source.responses && typeof source.responses === "object" ? source.responses : {};

  for (const queryId of QUERY_IDS) {
    if (declared[queryId]) {
      unavailable[queryId] = String(declared[queryId]);
      continue;
    }
    const response = raw[queryId];
    if (!response) {
      /* PENDING is not UNAVAILABLE (#764). Before the deferred fetch has even been asked for,
       * every queryId looks identical to a genuine refusal unless the caller says so. A read
       * that is merely in flight must never carry the "not included" reason a reader would
       * take as a settled absence -- that copy is reserved for a bundle that was truly fetched
       * and truly came back without this query. */
      if (!pending) unavailable[queryId] = "This reading was not included in the page's data.";
      continue;
    }
    if (response.status !== "ok") {
      unavailable[queryId] = response.reason
        ? String(response.reason)
        : "Rock refused this read. Nothing is shown rather than something wrong.";
      continue;
    }
    if (!Array.isArray(response.rows)) {
      unavailable[queryId] = "Rock answered in a shape this page does not recognise.";
      continue;
    }
    const fields = QUERY_FIELDS[queryId];
    const first = response.rows[0];
    if (first) {
      const missing = fields.filter((field) => !(field in first));
      if (missing.length) {
        unavailable[queryId] =
          `Rock returned this read without ${missing.join(", ")}. The query and the page disagree about its shape, so nothing is shown.`;
        continue;
      }
    }
    responses[queryId] = {
      rows: response.rows.map((row) => coerceRow(row, fields)),
      truncated: queryId === "people-leader-roster" && response.rows.length >= ROSTER_ROW_LIMIT,
    };
  }
  /* The bundle's own `mode` is carried through, because the page has to be able to SAY whether
   * what it is drawing came from Rock. Without it every provenance mark on the surface has to
   * assume, and a live reading that assumes "fixture" is the mis-label that matters least --
   * while a fixture that assumes "live" is the one that gets a made-up number quoted in a
   * meeting. Anything other than the literal "live" is treated as not live. */
  const mode = source.mode === "live" ? "live" : "fixture";
  return { responses, unavailable, mode, pending: Boolean(pending) };
}

export function rowsOf(adapted, queryId) {
  const entry = adapted.responses[queryId];
  return entry ? entry.rows : null;
}

/* --------------------------------------------------------------------------------- filters --- */

export const DEFAULT_FILTERS = Object.freeze({
  campus: "MNL",
  branch: "",
  tier: "",
  groupAge: "",
  /* The peg carries GENDER in its own filter bar, and the gender donut is one of the three
   * marks a reader clicks to narrow the page (#638). It is a roster column now (#641), so it
   * is a filter like any other rather than a reading with no handle on it. */
  gender: "",
  team: "",
  section: "",
  query: "",
  /* The peg's scope toggle, preserved because it separates two genuinely different questions.
   * ON  — "All roles of matching leaders": find the people who match, then show everything they
   *        do. Answers "what else do these people carry?"
   * OFF — "Only matching roles": show only the tags that match the filter. Answers "show me
   *        Connect tags."
   * A reader who filters to Connect and then asks the first question is not asking the second. */
  allRoles: true,
  /* Chapter 4's one assumption, and it is a control rather than a constant precisely so that it
   * cannot masquerade as a fact. */
  groupSize: 12,
});

export const FILTER_KEYS = Object.freeze(Object.keys(DEFAULT_FILTERS));

export function normalizeFilters(input = {}) {
  const out = { ...DEFAULT_FILTERS };
  const given = input && typeof input === "object" ? input : {};
  const campus = String(given.campus || "").toUpperCase();
  if (CAMPUSES.some((c) => c.id === campus)) out.campus = campus;
  if (given.branch === "connect" || given.branch === "ministry") out.branch = given.branch;
  if (given.tier && TIERS[given.tier]) out.tier = given.tier;
  for (const key of ["groupAge", "gender", "team", "section", "query"]) {
    if (given[key] !== undefined && given[key] !== null) out[key] = String(given[key]).slice(0, 120);
  }
  if (given.allRoles !== undefined) out.allRoles = Boolean(given.allRoles);
  /* An ABSENT group size keeps the default; only a value actually supplied is clamped. Coercing
   * null through Number() yields 0, which the clamp would floor to the minimum — so a URL with
   * no groupSize would silently plan every band at four people per group. */
  if (given.groupSize !== undefined && given.groupSize !== null && given.groupSize !== "") {
    const size = Number(given.groupSize);
    if (Number.isFinite(size)) out.groupSize = Math.min(30, Math.max(4, Math.round(size)));
  }
  /* A tier that belongs to a different branch than the one selected is contradictory, not
   * narrower. The tier wins and the branch follows it, because a reader who picked a tier picked
   * the more specific thing. */
  if (out.tier && out.branch && TIERS[out.tier].branch && TIERS[out.tier].branch !== out.branch) {
    out.branch = TIERS[out.tier].branch;
  }
  return out;
}

export function activeFilterCount(filters) {
  const f = normalizeFilters(filters);
  let n = 0;
  /* `query` is excluded on purpose: it is a find, not a filter (leadership-boot.mjs). Counting it
   * would put a number on the console's badge for something that hides nothing, and offer a
   * "clear" chip for a narrowing that never happened. */
  for (const key of ["branch", "tier", "groupAge", "gender", "team", "section"]) if (f[key]) n += 1;
  if (!f.allRoles) n += 1;
  return n;
}

/* Only non-default keys are written, and `campus` is written unconditionally: an absent campus
 * would be seeded from the viewer's own campus, so a pasted link must not become the recipient's
 * campus instead of the sender's. Same rule Grow and Connect already follow. */
export function serializeState(filters, params = new URLSearchParams()) {
  const f = normalizeFilters(filters);
  params.set("campus", f.campus);
  for (const key of ["branch", "tier", "groupAge", "gender", "team", "section", "query"]) {
    if (f[key]) params.set(key, f[key]); else params.delete(key);
  }
  if (!f.allRoles) params.set("allRoles", "0"); else params.delete("allRoles");
  if (f.groupSize !== DEFAULT_FILTERS.groupSize) params.set("groupSize", String(f.groupSize));
  else params.delete("groupSize");
  return params;
}

export function parseState(params) {
  const read = (key) => (params && typeof params.get === "function" ? params.get(key) : null);
  return normalizeFilters({
    campus: read("campus"),
    branch: read("branch"),
    tier: read("tier"),
    groupAge: read("groupAge"),
    gender: read("gender"),
    team: read("team"),
    section: read("section"),
    query: read("query"),
    allRoles: read("allRoles") === null ? undefined : read("allRoles") !== "0",
    groupSize: read("groupSize"),
  });
}

/* --------------------------------------------------------------------------- roster + people --
 * The roster is the person grain, so it is the only honest source for "how many PEOPLE". */

function matchesCampus(row, campus) {
  return campus === "ALL" || row.campusShortCode === campus;
}

/* ------------------------------------------------------------------------ matching text ----
 *
 * FOLDING IS LENGTH-PRESERVING, one character in for one character out. The find-in-page
 * highlight maps positions in the folded string straight back onto the original text node, so a
 * fold that changed the length -- `normalize("NFD")` is the obvious one, it turns one accented
 * character into two -- would silently mark the wrong span. Every substitution below is a single
 * character, which is also why the accent list is written out rather than derived. */
const FOLD_FROM = "\u00e1\u00e0\u00e2\u00e4\u00e3\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u00f1\u00e7";
const FOLD_TO   = "aaaaaeeeeiiiiooooouuuunc";

export function foldText(value) {
  let out = "";
  for (const ch of String(value == null ? "" : value).toLowerCase()) {
    const at = FOLD_FROM.indexOf(ch);
    out += at < 0 ? ch : FOLD_TO[at];
  }
  return out;
}

/* Within one insertion, deletion or substitution. Bounded and early-exiting, because it runs per
 * token per candidate row and the roster is hundreds of rows wide. */
function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (short.length === long.length) { i += 1; j += 1; } else { j += 1; }
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

/* FUZZY, BUT NOT LIMITLESS. Three things a reader actually does, and nothing beyond them:
 *
 *   1. types a fragment                 -> plain substring, the common case, checked first
 *   2. types the words out of order     -> every token must be found, order does not matter
 *   3. mistypes one letter of a name    -> a token of four or more may miss a word by one edit
 *
 * A short token is held to the letter on purpose. A subsequence or edit-distance match on two or
 * three characters matches most of a roster, and a search that returns everything is the same as
 * a search that returns nothing -- worse, because it looks like it worked. */
export function fuzzyMatch(needle, haystack) {
  const n = foldText(needle).trim();
  if (!n) return true;
  const hay = foldText(haystack);
  if (hay.includes(n)) return true;
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  return n.split(/\s+/).filter(Boolean).every((token) => {
    if (hay.includes(token)) return true;
    if (token.length < 4) return false;
    return words.some((word) => withinOneEdit(token, word));
  });
}

/* --------------------------------------------------------- local widget filter/sort/page (#766)
 *
 * The two Leadership structure tables (care, ministry) carry LOCAL filters, sort and pagination
 * that are separate from the console's global filters. These are pure and unit-tested here
 * (the same "if a rule decides what a reader sees, it belongs where a test can reach it"
 * discipline as the rest of this module); leadership-boot.mjs owns only the DOM the reader
 * touches and the panelFilterState object these are called against. */

/* Local sort for the two structure tables (repo rule: sortable headers on every table).
 * Plain-value comparison -- both sort by numbers or short labels, never by a DOM node. */
export function sortByKey(rows, key, dir) {
  if (!key) return rows;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key]; const bv = b[key];
    if (typeof av === "number" || typeof bv === "number") return sign * ((av ?? -Infinity) - (bv ?? -Infinity));
    return sign * String(av ?? "").localeCompare(String(bv ?? ""), "en", { numeric: true });
  });
}

/* The exact local filter + sort careStructurePanel() applies to what it draws, factored out so
 * buildView()'s export can compute the SAME rows rather than keep a second copy that could
 * drift: an export must reflect the widget's current local view, not the global one. */
export function applyCareLocal(care, f) {
  if (!care) return null;
  let rows = care;
  if (f.section) rows = rows.filter((r) => r.tier !== "cluster" || r.label === f.section);
  if (f.band) rows = rows.filter((r) => r.band === f.band);
  if (f.head) rows = rows.filter((r) => fuzzyMatch(f.head, r.label));
  if (f.region) rows = rows.filter((r) => r.tier !== "regional" || r.label === f.region);
  return sortByKey(rows, f.sortKey, f.sortDir);
}

/* Same contract as applyCareLocal(), for ministryStructurePanel(). */
export function applyMinistryLocal(teams, f) {
  if (!teams) return null;
  let rows = teams;
  if (f.head) rows = rows.filter((t) => t.label === f.head);
  if (f.team) rows = rows.filter((t) => fuzzyMatch(f.team, t.label));
  if (f.scope) rows = rows.filter((t) => t.label === f.scope);
  return sortByKey(rows, f.sortKey, f.sortDir);
}

/* Pagination for the two Leadership structure tables (page size 10/50/100). The EXPORTED view
 * (buildView's careRows/teamRows) always carries the full local-filtered-and-sorted set --
 * pagination is a screen convenience only, never a reason an Excel export is short a row. */
export const PAGE_SIZES = Object.freeze([10, 50, 100]);

export function paginate(rows, f) {
  const pageSize = PAGE_SIZES.includes(f.pageSize) ? f.pageSize : PAGE_SIZES[0];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, f.page || 1), totalPages);
  const start = (page - 1) * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), page, pageSize, totalPages, total: rows.length };
}

function rowMatches(row, f, bandOf) {
  if (f.branch && row.branch !== f.branch) return false;
  if (f.tier && row.tier !== f.tier) return false;
  if (f.team && row.branch === "ministry" && row.contextLabel !== f.team) return false;
  if (f.section && String(row.contextRef) !== String(f.section)) return false;
  if (f.groupAge && bandOf(row) !== f.groupAge) return false;
  if (f.gender && row.gender !== f.gender) return false;
  /* `query` is deliberately NOT read here any more. It used to narrow the roster, which made the
   * console's own promise -- "search the whole dashboard" -- false in the plainest way: typing a
   * team name changed one panel of fourteen and left the other thirteen alone, so the reader
   * concluded the search had not worked. It is a FIND now, owned by the page rather than by the
   * data: it marks every match wherever it appears and steps between them. Nothing is hidden, so
   * a match in a panel the reader was not thinking about is still there to be found. */
  return true;
}

/* Filter the roster, honouring the scope toggle.
 *
 * `bandOf` resolves a roster row's GROUP-derived age band by looking up the section it sits in.
 * It is injected rather than computed here so the caller can build the section index once. */
export function filterRoster(rows, filters, { bandOf = () => "" } = {}) {
  const f = normalizeFilters(filters);
  const scoped = rows.filter((row) => matchesCampus(row, f.campus));
  const matched = scoped.filter((row) => rowMatches(row, f, bandOf));
  if (!f.allRoles) return matched;
  /* "All roles of matching leaders": widen from the matching TAGS back out to everything those
   * PEOPLE hold. The campus fence is not widened — a Manila reading stays a Manila reading. */
  const people = new Set(matched.map((row) => row.personRef));
  return scoped.filter((row) => people.has(row.personRef));
}

export function distinctPeople(rows, { exclude = HEADLINE_EXCLUDED_TIERS } = {}) {
  const set = new Set();
  for (const row of rows) {
    if (exclude.includes(row.tier)) continue;
    set.add(row.personRef);
  }
  return set;
}

/* The six headline counts, all distinct people.
 *
 * Returns `null` when the roster is unavailable or may be truncated. A headline that silently
 * under-reports is worse than one that says it cannot answer: every other number on the page is
 * read against it. */
export function headline(adapted, rows) {
  const entry = adapted.responses["people-leader-roster"];
  if (!entry) return null;
  if (entry.truncated) return null;

  const connect = distinctPeople(rows.filter((r) => r.branch === "connect"));
  const ministry = distinctPeople(rows.filter((r) => r.branch === "ministry"));
  const both = new Set([...connect].filter((id) => ministry.has(id)));
  const ministryOnly = new Set([...ministry].filter((id) => !connect.has(id)));
  const all = distinctPeople(rows);

  return {
    leaders: all.size,
    connect: connect.size,
    ministry: ministry.size,
    both: both.size,
    ministryOnly: ministryOnly.size,
  };
}

/* ------------------------------------------------------------------------------- the ladders --
 * Built from the roster so "people, not tags" holds at every tier: a person leading three
 * Connect Groups contributes one to `connect`, not three. */
export function ladder(rows, branch) {
  const order = ladderFor(branch);
  const seen = new Map(order.map((tier) => [tier, new Set()]));
  for (const row of rows) {
    if (row.branch !== branch) continue;
    const bucket = seen.get(row.tier);
    if (bucket) bucket.add(row.personRef);
  }
  return order.map((tier) => ({
    tier,
    label: tierLabel(tier),
    people: seen.get(tier).size,
    note: TIERS[tier].note || null,
    bench: HEADLINE_EXCLUDED_TIERS.includes(tier),
  }));
}

/* Lay Pastor sits beside the Connect ladder rather than on it, so it is returned separately and
 * drawn separately. Folding it in would assert a rung that does not exist. */
export function besideLadder(rows) {
  const people = new Set(rows.filter((r) => r.tier === "lay-pastor").map((r) => r.personRef));
  return { tier: "lay-pastor", label: tierLabel("lay-pastor"), people: people.size,
           note: TIERS["lay-pastor"].note };
}

/* Connect roles across age bands: read ACROSS a band to see how deep its tree goes. Many Connect
 * Leaders and few Regional Leaders means no middle layer — that band's cluster head is carrying
 * everyone directly. */
export function connectByBand(rows, bandOf) {
  const bands = new Map();
  for (const row of rows) {
    if (row.branch !== "connect") continue;
    const band = bandOf(row) || "Unbanded";
    if (!bands.has(band)) bands.set(band, new Map(CONNECT_LADDER.map((t) => [t, new Set()])));
    const bucket = bands.get(band).get(row.tier);
    if (bucket) bucket.add(row.personRef);
  }
  return [...bands.entries()]
    .map(([band, tiers]) => ({
      band,
      tiers: CONNECT_LADDER.map((tier) => ({ tier, label: tierLabel(tier), people: tiers.get(tier).size })),
      total: CONNECT_LADDER.reduce((sum, tier) => sum + tiers.get(tier).size, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/* Leaders per team and per section, from the roster, so both are distinct-person counts that
 * reconcile against the headline. */
export function leadersByContext(rows, branch) {
  const groups = new Map();
  for (const row of rows) {
    if (row.branch !== branch) continue;
    if (!row.contextLabel) continue;
    const key = row.contextLabel;
    if (!groups.has(key)) groups.set(key, { label: key, ref: row.contextRef, people: new Set() });
    groups.get(key).people.add(row.personRef);
  }
  return [...groups.values()]
    .map((g) => ({ label: g.label, ref: g.ref, people: g.people.size }))
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------- chapter 2: span of care --
 *
 * The load number is People underneath ÷ Connect Leaders, and it is the sort default because it
 * is the only column that says who is actually carrying most.
 *
 * TWO CAVEATS TRAVEL WITH `peopleUnderneath`, AND THEY PUSH IN OPPOSITE DIRECTIONS. A person in
 * two of a leader's groups is counted twice (so the figure runs high), and people not yet on any
 * roster are excluded entirely (so it runs low). Both are rendered; neither is buried. */
export function careStructure(adapted, filters) {
  const rows = rowsOf(adapted, "people-leader-span-of-care");
  if (!rows) return null;
  const f = normalizeFilters(filters);
  return rows
    .filter((row) => matchesCampus(row, f.campus))
    .filter((row) => !f.groupAge || row.ageBand === f.groupAge)
    .filter((row) => !f.section || String(row.sectionRef) === String(f.section))
    .map((row) => ({
      ref: row.sectionRef,
      parent: row.parentRef,
      tier: row.tier,
      tierLabel: tierLabel(row.tier),
      label: row.sectionLabel || `Section ${row.sectionRef}`,
      band: row.ageBand || "All ages",
      sectionLeaders: row.sectionLeaders,
      connectLeaders: row.connectLeaders,
      leafGroups: row.leafGroups,
      people: row.peopleUnderneath,
      distinctPeople: row.distinctPeopleUnderneath,
      /* null, not zero, when there is no leader to divide by. A section with 180 people and no
       * Connect Leader has an undefined load, not a load of nothing, and the difference is the
       * entire reading (ADR 0018). */
      load: row.connectLeaders > 0 ? row.peopleUnderneath / row.connectLeaders : null,
      /* The honest width of the figure: memberships minus distinct people is exactly how many
       * double-counts the number carries. */
      doubleCounted: Math.max(0, row.peopleUnderneath - row.distinctPeopleUnderneath),
    }))
    .sort((a, b) => (b.load ?? Infinity) - (a.load ?? Infinity) || b.people - a.people);
}

/* Resolve a roster row's GROUP-derived age band.
 *
 * TWO LOOKUPS, BECAUSE THE TWO CONNECT TIERS CARRY THE BAND DIFFERENTLY, and getting this wrong
 * silently files every Connect Leader under "Unbanded" — which is exactly what chapter 1's
 * roles-across-age-groups reading exists to show, so the failure would look like a finding.
 *
 *   * A SECTION row (regional, cluster, section) points at a group that span-of-care also
 *     returns, so its band comes from that query's `ageBand` — the authoritative walk up the
 *     parent chain.
 *   * A CONNECT LEAF row points at a leaf, which span-of-care does not return at all. But a leaf
 *     is stored as `<age band> // <leader name>`, and people-leader-roster.sql emits the part
 *     BEFORE the separator as `contextLabel` for exactly this tier. So the label already is the
 *     band, and it is used only when it matches a band the section query actually knows —
 *     never as a free-text guess.
 *
 * Anything neither lookup resolves returns "", and the island draws it as Unbanded rather than
 * assigning it to a band it cannot prove. */
export function bandIndex(adapted) {
  const rows = rowsOf(adapted, "people-leader-span-of-care") || [];
  const byRef = new Map(rows.map((row) => [String(row.sectionRef), row.ageBand || ""]));
  const known = new Set(rows.map((row) => row.ageBand).filter(Boolean));
  return (row) => {
    if (!row) return "";
    /* THE ROSTER'S OWN BAND COMES FIRST (#638). people-leader-roster.sql now walks the section
     * tree itself and returns `groupAge` per row, which is what the two lookups below were
     * approximating from another query's results. Measured on prod through the live page:
     * the lookups resolved 128 of 778 rows, `groupAge` resolves 473, and on all 128 rows where
     * both have a value they AGREE -- zero disagreements. So this is strictly more coverage of
     * the same answer, not a second opinion, and it is why the age readings showed 105 leaders
     * banded out of 508 when the data had 417 of them.
     *
     * The two lookups stay as a fallback rather than being deleted: they resolve from
     * span-of-care, so a section row whose group sits outside the band tree the SQL walks is
     * still placed instead of falling to Unbanded. */
    if (row.groupAge) return row.groupAge;
    if (row.contextRef != null) {
      const found = byRef.get(String(row.contextRef));
      if (found) return found;
    }
    if (row.contextLabel && known.has(row.contextLabel)) return row.contextLabel;
    return "";
  };
}

/* The filter's band list is the UNION of both sources, for the same reason bandIndex reads both:
 * offering only span-of-care's bands would hide a band that exists in the roster and nowhere
 * else, and a filter that cannot select a value the page is drawing is worse than no filter. */
export function bandsAvailable(adapted) {
  const sections = rowsOf(adapted, "people-leader-span-of-care") || [];
  const roster = rowsOf(adapted, "people-leader-roster") || [];
  return [...new Set([
    ...sections.map((row) => row.ageBand),
    ...roster.map((row) => row.groupAge),
  ].filter(Boolean))].sort();
}

/* ------------------------------------------------------- chapter 2/3: the ministry structure --
 *
 * Rolled up to the Overall Head here rather than in SQL, so that chapter 3 can still ask the
 * opposite question of the same rows: which teams have NOBODY. */
export function ministryTeams(adapted, filters) {
  const rows = rowsOf(adapted, "people-ministry-structure");
  if (!rows) return null;
  const f = normalizeFilters(filters);
  return rows
    .filter((row) => matchesCampus(row, f.campus))
    .filter((row) => !f.team || row.teamName === f.team)
    .map((row) => ({
      ref: row.teamRef,
      parent: row.parentRef,
      label: row.teamName || `Team ${row.teamRef}`,
      overallHeads: row.overallHeads,
      unitHeads: row.unitHeads,
      teamLeads: row.teamLeads,
      captains: row.captains,
      potentialCaptains: row.potentialCaptains,
      volunteers: row.volunteers,
      members: row.activeMembers,
      /* A team with no appointed leader at ANY tier. Rendered distinctly from a team with few
       * leaders, because they are different problems with different first moves. */
      leaderless: row.overallHeads + row.unitHeads + row.teamLeads + row.captains === 0,
      /* Bench depth: who is actually in line. Potential Captain is the rung the peg omits and
       * the one this column most wants. */
      bench: row.potentialCaptains,
    }))
    .sort((a, b) => a.volunteers - b.volunteers || a.label.localeCompare(b.label));
}

/* ---------------------------------------------------------- chapter 3: serving sign-ups ------
 *
 * THE ONE THING THIS FUNCTION REFUSES TO DO IS GUESS WHAT "PLACED" MEANS. Placement is not
 * uniformly expressible on this schema: nine of eleven serving areas run a ladder ending in
 * `Serving`, while `MNL | VOL | Worship` — the largest, at 439 of 628 requests — uses instrument
 * names as statuses and has no terminal placement status at all.
 *
 * A computed `placed` column would return 0 for Worship and the page would read "439 people
 * signed up to play and none was placed", which is false and would be the most actionable-looking
 * row in the chapter. So an area whose placed rung is not mapped renders its total WITH its
 * placed count explicitly unknown and the reason beside it. A tall bar with an unknown placed
 * count is a different fact from one with a placed count of nothing.
 *
 * `areaRegistry` is ops/serving-areas.json, passed in rather than imported so the mapping stays
 * reviewable data instead of becoming code. */
export function servingAreas(adapted, filters, areaRegistry) {
  const rows = rowsOf(adapted, "people-serving-signups");
  if (!rows) return null;
  const f = normalizeFilters(filters);
  /* ops/serving-areas.json keys its areas BY NAME, so the index is rebuilt by connection type
   * id — which is what the query emits and the only handle that survives a rename. */
  const registry = new Map(
    Object.entries((areaRegistry && areaRegistry.areas) || {})
      .map(([name, area]) => [String(area.connectionTypeId), { ...area, name }])
  );
  const areas = new Map();
  for (const row of rows) {
    if (!matchesCampus(row, f.campus)) continue;
    const key = String(row.connectionTypeId);
    if (!areas.has(key)) {
      const known = registry.get(key) || null;
      areas.set(key, {
        ref: row.connectionTypeId,
        label: row.areaName || (known && known.name) || `Area ${row.connectionTypeId}`,
        statuses: [],
        requests: 0,
        placed: null,
        placedStatuses: known && Array.isArray(known.placedStatuses) ? known.placedStatuses : [],
        placementResolvable: known ? known.placementResolvable !== false : false,
        unresolvedReason: known ? known.unresolvedReason || null : "This area is not in the reviewed serving-area list, so its ladder has no mapped placement rung.",
      });
    }
    const area = areas.get(key);
    area.statuses.push({ name: row.statusName, requests: row.requests });
    area.requests += row.requests;
  }
  for (const area of areas.values()) {
    area.statuses.sort((a, b) => b.requests - a.requests);
    if (area.placementResolvable && area.placedStatuses.length) {
      area.placed = area.statuses
        .filter((s) => area.placedStatuses.includes(s.name))
        .reduce((sum, s) => sum + s.requests, 0);
    }
  }
  return [...areas.values()].sort((a, b) => b.requests - a.requests);
}

/* ------------------------------------------------------------ chapter 4: the Raise chain -----
 *
 *     People → In a group → Not yet → Spare seats → New groups → RAISE
 *
 * Computed here, on the page, from `people-connect-capacity`, so every step is inspectable and
 * the one assumption — target group size — is a reader-adjustable control rather than a constant
 * baked into SQL.
 *
 * THE TWO SIDES OF THIS CHAIN COME FROM DIFFERENT FACTS AND CANNOT BOTH COME FROM ONE.
 * `people` is person-derived (someone not in a group has no group to take a band from);
 * `inGroup` is group-derived (so this chapter and chapter 1 agree about the same person).
 * `inGroupPersonBand` counts the same in-a-group population by person age, so `drift` below is
 * the exact size of the mismatch per band. It is rendered, never resolved silently. */
export function raiseChain(adapted, filters) {
  const rows = rowsOf(adapted, "people-connect-capacity");
  if (!rows) return null;
  const f = normalizeFilters(filters);
  const size = f.groupSize;
  const bands = rows
    .filter((row) => matchesCampus(row, f.campus))
    .filter((row) => !f.groupAge || row.band === f.groupAge)
    .map((row) => {
      const notYet = Math.max(0, row.people - row.inGroupPersonBand);
      /* Seats are a MEMBERSHIP fact: two memberships fill two seats, so occupancy is measured in
       * memberships and not in distinct people. */
      const spare = Math.max(0, row.groups * size - row.memberships);
      const unabsorbed = Math.max(0, notYet - spare);
      const newGroups = Math.ceil(unabsorbed / size);
      return {
        band: row.band,
        people: row.people,
        inGroup: row.inGroup,
        inGroupPersonBand: row.inGroupPersonBand,
        drift: row.inGroup - row.inGroupPersonBand,
        groups: row.groups,
        memberships: row.memberships,
        notYet,
        spare,
        newGroups,
        /* One Connect Leader per new group. Regional and Cluster capacity is NOT modelled: the
         * ratio that would drive it is not a fact this repository holds, and inventing one would
         * put a guess inside the number the page calls "the only number to plan against". */
        raise: newGroups,
      };
    })
    .sort((a, b) => b.notYet - a.notYet || a.band.localeCompare(b.band));

  /* The CHAIN's totals run on the PERSON grain throughout, so People − In a group = Not yet
   * actually holds on the page. Mixing the two grains inside one row would leave a reader
   * looking at three numbers that do not add up, which reads as a bug rather than as the honest
   * caveat it is. The group-derived figure is not discarded: it is carried per band as
   * `inGroup`, and the difference is surfaced as `drift`. */
  const total = bands.reduce((acc, b) => ({
    people: acc.people + b.people,
    inGroup: acc.inGroup + b.inGroupPersonBand,
    notYet: acc.notYet + b.notYet,
    spare: acc.spare + b.spare,
    newGroups: acc.newGroups + b.newGroups,
    raise: acc.raise + b.raise,
  }), { people: 0, inGroup: 0, notYet: 0, spare: 0, newGroups: 0, raise: 0 });

  return { size, bands, total };
}

/* --------------------------------------------------------------------------- the roster view --
 * One row per PERSON, with every role they hold folded in — which is the peg's reading and the
 * reason the roster exists at all.
 *
 * ADR 0023: names are permitted here and only here. `personRef` is what sorting, filtering and
 * linking use, so no URL, export or markup snapshot ever needs to carry the name. */
export function rosterPeople(rows, bandOf) {
  const people = new Map();
  for (const row of rows) {
    if (!people.has(row.personRef)) {
      people.set(row.personRef, {
        ref: row.personRef,
        name: row.displayName,
        campus: row.campusShortCode,
        roles: [],
        branches: new Set(),
        bands: new Set(),
      });
    }
    const person = people.get(row.personRef);
    person.roles.push({
      branch: row.branch,
      tier: row.tier,
      label: tierLabel(row.tier),
      context: row.contextLabel,
      contextRef: row.contextRef,
    });
    if (row.branch) person.branches.add(row.branch);
    const band = bandOf(row);
    if (band) person.bands.add(band);
  }
  return [...people.values()]
    .map((person) => ({
      ...person,
      branches: [...person.branches],
      bands: [...person.bands],
      roleCount: person.roles.length,
      /* Ladder order, never magnitude: a person's roles read top rung first so the highest
       * responsibility they carry is the first thing on the row. */
      roles: person.roles.sort((a, b) => (TIERS[b.tier]?.rank ?? 0) - (TIERS[a.tier]?.rank ?? 0)),
    }))
    .sort((a, b) => b.roleCount - a.roleCount || a.name.localeCompare(b.name));
}

export function teamsAvailable(adapted) {
  const rows = rowsOf(adapted, "people-ministry-structure") || [];
  return [...new Set(rows.map((row) => row.teamName).filter(Boolean))].sort();
}

export function sectionsAvailable(adapted) {
  const rows = rowsOf(adapted, "people-leader-span-of-care") || [];
  return rows
    .filter((row) => row.tier === "cluster")
    .map((row) => ({ ref: String(row.sectionRef), label: row.sectionLabel || `Cluster ${row.sectionRef}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------------------- the view ----
 * The shared view contract (apps/shared/dashboard-view.mjs). It is what the export rail, the
 * copy prompt, and the package builder all read, so the artifact a reader takes away carries
 * exactly the rows the page is showing, and nothing else.
 *
 * ONE SECTION IS MARKED personLevel AND IT IS THE ROSTER. ADR 0023 permits names to be DRAWN on
 * this surface; it does not permit them to become a file. `personLevel: true` makes the export
 * machinery skip that section outright rather than partially copy it, which is the difference
 * between a rule and a hope.
 *
 * The section boundaries are stated per section rather than inherited, because the default claim
 * -- "aggregate rows only, no person data" -- is NOT true of every table here. A Connect Group
 * Section's label IS a person's name on this schema, so the care structure carries its own
 * sentence instead of the default one. */
/* careRows / teamRows: the widget's own current LOCAL view (its local filter + sort already
 * applied), when the caller has one. #766: an export must carry the rows a reader is actually
 * looking at, not the page's global filter alone -- passing the pre-computed local rows here
 * (rather than re-deriving a second filter here) keeps one seam owning "what does this widget
 * show", so the panel and its export can never quietly drift apart. Omitting either falls back
 * to the global-filter-only reading, unchanged for every existing caller. */
export function buildView({
  adapted, filters, rows, areaRegistry, generatedAt = null, fictional = false,
  careRows = null, teamRows = null,
} = {}) {
  const f = normalizeFilters(filters);
  const sections = [];
  const counts = adapted && rows ? headline(adapted, rows) : null;

  if (counts) {
    sections.push(kpiSection("leadership-headline", "Leaders in view", [
      { label: "Leaders in view", value: counts.leaders, unit: "people" },
      { label: "Connect", value: counts.connect, unit: "people" },
      { label: "Ministry", value: counts.ministry, unit: "people" },
      { label: "Lead in both", value: counts.both, unit: "people" },
      { label: "Ministry only", value: counts.ministryOnly, unit: "people" },
    ]));
  }

  const care = careRows !== null ? careRows : (adapted ? careStructure(adapted, f) : null);
  if (care && care.length) {
    sections.push(tableSection("leadership-care",
      "Pastoral care structure",
      [
        { key: "section", label: "Section" },
        { key: "tier", label: "Tier" },
        { key: "band", label: "Age group" },
        { key: "connectLeaders", label: "Connect Leaders", kind: "number" },
        { key: "groups", label: "Groups", kind: "number" },
        { key: "people", label: "People underneath", kind: "number" },
        { key: "load", label: "Load", kind: "number" },
      ],
      care.map((row) => ({
        section: row.label,
        tier: row.tierLabel,
        band: row.band,
        connectLeaders: row.connectLeaders,
        groups: row.leafGroups,
        people: row.people,
        load: row.load === null ? UNAVAILABLE_MARK : row.load.toFixed(1),
      })),
      {
        /* The default claim is not true here, and a button that made it would be lying: on this
         * schema a section's label IS a person's name. */
        boundary: "Aggregate rows. Section labels carry a leader's name, because that is how Rock stores them.",
      }));
  }

  const teams = teamRows !== null ? teamRows : (adapted ? ministryTeams(adapted, f) : null);
  if (teams && teams.length) {
    sections.push(tableSection("leadership-ministry",
      "Ministry care structure",
      [
        { key: "team", label: "Team" },
        { key: "overallHeads", label: "Overall Heads", kind: "number" },
        { key: "unitHeads", label: "Unit Heads", kind: "number" },
        { key: "teamLeads", label: "Team Leads", kind: "number" },
        { key: "captains", label: "Captains", kind: "number" },
        { key: "bench", label: "Bench", kind: "number" },
        { key: "volunteers", label: "Volunteers", kind: "number" },
      ],
      teams.map((team) => ({
        team: team.label,
        overallHeads: team.overallHeads,
        unitHeads: team.unitHeads,
        teamLeads: team.teamLeads,
        captains: team.captains,
        bench: team.bench,
        volunteers: team.volunteers,
      }))));
  }

  const areas = adapted ? servingAreas(adapted, f, areaRegistry) : null;
  if (areas && areas.length) {
    sections.push(tableSection("leadership-signups",
      "Ministry sign-ups by area",
      [
        { key: "area", label: "Area" },
        { key: "requests", label: "Sign-ups", kind: "number" },
        { key: "placed", label: "Placed", kind: "number" },
      ],
      areas.map((area) => ({
        area: area.label,
        requests: area.requests,
        /* Unknown stays unknown in the artifact too. A zero here would travel into a
         * spreadsheet and outlive every caveat the page draws around it. */
        placed: area.placed === null ? UNAVAILABLE_MARK : area.placed,
      }))));
  }

  const chain = adapted ? raiseChain(adapted, f) : null;
  if (chain && chain.bands.length) {
    sections.push(tableSection("leadership-raise",
      "Leaders to raise",
      [
        { key: "band", label: "Age group" },
        { key: "people", label: "People", kind: "number" },
        { key: "inGroup", label: "In a group", kind: "number" },
        { key: "notYet", label: "Not yet", kind: "number" },
        { key: "spare", label: "Spare seats", kind: "number" },
        { key: "newGroups", label: "New groups", kind: "number" },
        { key: "raise", label: "Raise", kind: "number" },
      ],
      chain.bands.map((band) => ({
        band: band.band,
        people: band.people,
        inGroup: band.inGroupPersonBand,
        notYet: band.notYet,
        spare: band.spare,
        newGroups: band.newGroups,
        raise: band.raise,
      })),
      { boundary: `Aggregate rows, at a target group size of ${chain.size} people.` }));
  }

  if (adapted && adapted.responses["people-leader-roster"] && rows && rows.length) {
    sections.push(tableSection("leadership-roster",
      "Roster",
      [{ key: "name", label: "Name" }, { key: "roles", label: "Roles held", kind: "number" }],
      [],
      {
        /* Drawn on the page, never taken off it. `personLevel` makes the export machinery skip
         * this section rather than copy part of it (ADR 0023 P4). */
        personLevel: true,
        boundary: "Person rows. Shown on this page only; never exported, copied, or packaged.",
      }));
  }

  return {
    schemaVersion: 1,
    surface: { id: DASHBOARD_ID, title: "Leadership", route: "exec/people", tab: "leadership" },
    mode: "creative",
    url: typeof window !== "undefined" ? window.location.href : "",
    filters: { ...f },
    filterSummary: filterSummaryLine(
      { campus: f.campus, branch: f.branch, tier: f.tier, groupAge: f.groupAge, team: f.team },
      { campus: "Campus", branch: "Branch", tier: "Tier", groupAge: "Age group", team: "Team" },
    ),
    generatedAt,
    fictional,
    sections,
  };
}
