/* Public-only Sphere adapter.
 *
 * Server projection happens before this module sees a byte.  This module is a
 * defense-in-depth validator for the terminal viewer envelope; it has no
 * private-row mapper, redactor, network path, storage path, or source logger.
 */

export const SCHEMA_VERSION = 1;
const MAX_PUBLIC_COUNT = 100_000_000;
export const STATE = Object.freeze({ OK: "available", UNAVAILABLE: "unavailable" });
export const DASHBOARD_ID = "favor-exec-pathways";

const CAMPUSES = new Set(["MNL", "BNE", "SEL", "ALL"]);
const LENSES = new Set(["structural", "development", "context", "appointed"]);
const CONTEXT_KINDS = new Set(["connect-group", "connect-section", "ministry-team", "ministry", "organization-unit", "unknown"]);
const RELATIONSHIPS = new Set([
  "leads-context", "serves-in-context", "participates-in-context", "member-of", "co-leads",
  "structural-sphere", "context-linked-influence", "develops", "mentors", "entrusts", "succeeds",
]);
const EXPLICIT_RELATIONSHIPS = new Set(["develops", "mentors", "entrusts", "succeeds"]);
const PUBLIC_ROLE_KEYS = new Set(["connect", "connect-assistant", "regional", "cluster", "ministry-team", "lay-pastor"]);
const STRUCTURAL_RELATIONSHIPS = new Set(["leads-context", "member-of", "co-leads", "structural-sphere"]);
const SOURCE_FAMILIES = new Set([
  "development-relationship", "connect-membership", "ministry-membership", "leadership-role",
  "connection-status", "outcome-report", "history", "identity-merge", "unknown",
]);
const PUBLIC_SOURCE_FAMILIES = new Set([
  "development-relationship", "connect-membership", "ministry-membership", "leadership-role",
  "connection-status", "outcome-report", "history", "identity-merge", "unknown", "mixed",
]);
const PUBLIC_RELATIONSHIP_BASES = new Set([
  "appointed-role", "serving-membership", "participation-membership", "member-membership",
  "verified-development", "observed-membership", "mixed",
]);
const COVERAGE_STATES = new Set([
  "complete", "partial", "not-measured", "unresolved", "unavailable", "suppressed",
  "incoherent-capture", "historically-unknown",
]);
const MEASUREMENT_STATES = new Set([
  "observed", "observed-zero", "not-measured", "unresolved", "unavailable", "suppressed", "incoherent-capture",
]);
const DISCLOSURES = new Set(["aggregate", "suppressed", "not-measured", "unresolved", "unavailable"]);
const DATE_BASES = new Set(["unknown", "asserted-effective-date", "observed-interval", "verified-role-change", "verified-event", "imported-date", "capture-date"]);
const REASONS = new Set([
  "observed", "observed-zero", "small-cohort", "complementary-disclosure", "not-measured",
  "unresolved-link", "unavailable-source", "partial-scope", "incoherent-capture", "not-applicable",
]);
const SIGNAL_KINDS = new Set([
  "marriage-restoration", "relationship-win", "ministry-influence", "connect-influence", "development", "succession", "readiness",
]);
const CAPTURE_OWNER_ROLES = new Set(["connect-owner", "ministry-owner", "pathways-owner", "data-mapping-owner"]);
const PENDING_LABELS = Object.freeze({
  "marriage-restoration": "Marriage restoration — not yet recorded",
  "relationship-win": "Relationship win — not yet recorded",
  "ministry-influence": "Ministry link pending",
  "connect-influence": "Connect link pending",
  development: "Development — not yet recorded",
  succession: "Successor not recorded",
  readiness: "Readiness — not yet recorded",
});
const COHORT_LABELS = new Set([
  "People in this context", "Protected cohort", "People in this structural sphere",
  "Context-linked influence · proxy", "Recorded development cohort", "Unavailable cohort",
]);
const EDGE_LABELS = new Set([
  "Verified development record", "Current shared leadership context", "Current role and context membership",
  "Serving or participation context · proxy", "Observed context membership", "Verified context-linked outcome",
]);
const MEASURE_NAMES = Object.freeze([
  "directDistinctPeople", "directLeaderCount", "contextLinkedDistinctPeople", "structuralReach",
  "recordedDevelopment", "leadersRaised", "contextLinkedWins",
]);
const PUBLIC_KEY_PATTERNS = Object.freeze({
  leader: /^leader-[0-9a-f]{20}$/,
  cohort: /^cohort-[0-9a-f]{20}$/,
  context: /^context-[0-9a-f]{20}$/,
  edge: /^edge-[0-9a-f]{20}$/,
  pending: /^pending-[0-9a-f]{20}$/,
});
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  "personKey", "canonicalPersonKey", "sourceKeys", "rawName", "recordKeys", "aliasKey",
  "sourceId", "sourceIds", "personId", "personIds", "profilePath",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeKey(value) {
  return typeof value === "string" && value.length <= 96 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function typedKey(value, kind) {
  return typeof value === "string" && PUBLIC_KEY_PATTERNS[kind].test(value);
}

function printable(value, max = 200) {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isoInstant(value) {
  const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/.exec(value);
  if (!match || !isoDate(match[1])) return false;
  const [, , hour, minute, second] = match;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
}

function nullableIsoDate(value) {
  return value === null || isoDate(value);
}

function validNode(node) {
  if (!isRecord(node) || typeof node.kind !== "string") return false;
  if (node.kind === "leader") {
    if (!hasExactKeys(node, ["key", "kind", "displayName", "roleKeys", "statusLeader", "roleLeader", "eligibilityBasis", "discrepancy", "profileUrl", "depth", "parentKey"])) return false;
    if (!typedKey(node.key, "leader") || !printable(node.displayName) || !Array.isArray(node.roleKeys) || node.roleKeys.length > 16) return false;
    if (new Set(node.roleKeys).size !== node.roleKeys.length || !node.roleKeys.every(safeKey) || !node.roleKeys.every((key) => PUBLIC_ROLE_KEYS.has(key))) return false;
    if (typeof node.statusLeader !== "boolean" || typeof node.roleLeader !== "boolean") return false;
    if (node.roleLeader && node.roleKeys.length === 0) return false;
    if (!node.roleLeader && node.roleKeys.length > 0) return false;
    if (!node.statusLeader && !node.roleLeader) return false;
    if (!["status-only", "role-only", "role-and-status"].includes(node.eligibilityBasis)) return false;
    if (node.eligibilityBasis === "status-only" && (!node.statusLeader || node.roleLeader || node.discrepancy !== "status-only")) return false;
    if (node.eligibilityBasis === "role-only" && (node.statusLeader || !node.roleLeader || node.discrepancy !== "role-only")) return false;
    if (node.eligibilityBasis === "role-and-status" && (!node.statusLeader || !node.roleLeader || node.discrepancy !== null)) return false;
    if (!(node.discrepancy === null || node.discrepancy === "status-only" || node.discrepancy === "role-only")) return false;
    if (!(node.profileUrl === null || /^\/Person\/[1-9][0-9]{0,8}$/.test(node.profileUrl))) return false;
    return Number.isInteger(node.depth) && node.depth >= 0 && node.depth <= 3
      && (node.parentKey === null || typedKey(node.parentKey, "leader") || typedKey(node.parentKey, "cohort"));
  }
  if (node.kind === "cohort") {
    if (!hasExactKeys(node, ["key", "kind", "label", "count", "disclosure", "contextKey", "contextKind", "depth", "parentKey"])) return false;
    if (!typedKey(node.key, "cohort") || !COHORT_LABELS.has(node.label) || !DISCLOSURES.has(node.disclosure)) return false;
    if (!(node.count === null || (Number.isSafeInteger(node.count) && node.count >= 0 && node.count <= MAX_PUBLIC_COUNT))) return false;
    if (node.count !== null && node.count > 0 && node.count < 5) return false;
    if (node.count === null && !["suppressed", "not-measured", "unresolved", "unavailable"].includes(node.disclosure)) return false;
    if (node.count !== null && node.disclosure !== "aggregate") return false;
    if (!(node.contextKey === null || typedKey(node.contextKey, "context")) || !(node.contextKind === null || CONTEXT_KINDS.has(node.contextKind))) return false;
    return Number.isInteger(node.depth) && node.depth >= 0 && node.depth <= 3
      && (node.parentKey === null || typedKey(node.parentKey, "leader") || typedKey(node.parentKey, "cohort"));
  }
  return false;
}

function validMeasure(value) {
  if (!hasExactKeys(value, ["value", "state", "disclosure", "reason"])) return false;
  if (!(value.value === null || (Number.isSafeInteger(value.value) && value.value >= 0 && value.value <= MAX_PUBLIC_COUNT))) return false;
  if (!MEASUREMENT_STATES.has(value.state) || !DISCLOSURES.has(value.disclosure) || !REASONS.has(value.reason)) return false;
  if (value.state === "observed" && (value.value === null || value.value < 5)) return false;
  if (value.state === "observed" && value.disclosure !== "aggregate") return false;
  if (value.state === "observed-zero" && value.value !== 0) return false;
  if (value.state === "observed-zero" && value.disclosure !== "aggregate") return false;
  if (["suppressed", "not-measured", "unresolved", "unavailable", "incoherent-capture"].includes(value.state) && value.value !== null) return false;
  if (value.state === "suppressed" && value.disclosure !== "suppressed") return false;
  return !(value.value === null && value.disclosure === "aggregate");
}

function validEdge(edge, nodes, coverage, captureCoherent) {
  if (!hasExactKeys(edge, ["key", "source", "target", "relationship", "direction", "evidence", "sourceFamily", "basis", "dateBasis", "from", "untilExclusive", "sourceLabel", "contextKey", "revision"])) return false;
  if (!typedKey(edge.key, "edge") || !(typedKey(edge.source, "leader") || typedKey(edge.source, "cohort")) || !(typedKey(edge.target, "leader") || typedKey(edge.target, "cohort")) || edge.source === edge.target) return false;
  if (!nodes.has(edge.source) || !nodes.has(edge.target) || !RELATIONSHIPS.has(edge.relationship)) return false;
  if (!["source-to-target", "symmetric"].includes(edge.direction)) return false;
  if (!["explicit", "structural", "observed", "inferred", "mixed"].includes(edge.evidence)) return false;
  if (!PUBLIC_SOURCE_FAMILIES.has(edge.sourceFamily) || !PUBLIC_RELATIONSHIP_BASES.has(edge.basis)) return false;
  if ((edge.sourceFamily === "mixed") !== (edge.evidence === "mixed")) return false;
  if (edge.evidence === "mixed") {
    const coverageKey = EXPLICIT_RELATIONSHIPS.has(edge.relationship) ? "development" : "structural";
    if (coverage[coverageKey] !== "incoherent-capture") return false;
  }
  if (EXPLICIT_RELATIONSHIPS.has(edge.relationship) && (edge.evidence !== "explicit" || edge.direction !== "source-to-target" || edge.basis !== "verified-development" || !["development-relationship", "mixed"].includes(edge.sourceFamily))) return false;
  if (edge.relationship === "co-leads" && (edge.direction !== "symmetric" || edge.evidence === "explicit" || edge.basis !== "appointed-role" || !["connect-membership", "ministry-membership", "leadership-role", "unknown", "mixed"].includes(edge.sourceFamily))) return false;
  if (edge.relationship === "co-leads" && (nodes.get(edge.source).kind !== "leader" || nodes.get(edge.target).kind !== "leader")) return false;
  if (STRUCTURAL_RELATIONSHIPS.has(edge.relationship) && edge.evidence === "explicit") return false;
  if (!["co-leads"].includes(edge.relationship) && [...STRUCTURAL_RELATIONSHIPS, "serves-in-context", "participates-in-context", "context-linked-influence"].includes(edge.relationship) && edge.direction !== "source-to-target") return false;
  if (["serves-in-context", "participates-in-context", "context-linked-influence"].includes(edge.relationship) && edge.basis !== "serving-membership" && edge.basis !== "participation-membership" && edge.basis !== "member-membership" && edge.basis !== "appointed-role" && edge.basis !== "mixed") return false;
  if (["serves-in-context", "participates-in-context", "context-linked-influence"].includes(edge.relationship) && !["connect-membership", "ministry-membership", "mixed"].includes(edge.sourceFamily)) return false;
  if (["leads-context", "member-of", "structural-sphere"].includes(edge.relationship) && !["connect-membership", "ministry-membership", "leadership-role", "connection-status", "history", "unknown", "mixed"].includes(edge.sourceFamily)) return false;
  if (["leads-context", "member-of", "structural-sphere"].includes(edge.relationship) && !["appointed-role", "observed-membership", "mixed", "member-membership"].includes(edge.basis)) return false;
  if (!nodes.get(edge.source) || nodes.get(edge.source).kind !== "leader") return false;
  if (!nullableIsoDate(edge.from) || !nullableIsoDate(edge.untilExclusive)) return false;
  if (edge.from !== null && edge.untilExclusive !== null && edge.from >= edge.untilExclusive) return false;
  if (!DATE_BASES.has(edge.dateBasis)) return false;
  if (edge.dateBasis === "unknown" && (edge.from !== null || edge.untilExclusive !== null)) return false;
  if (edge.dateBasis !== "unknown" && edge.from === null && edge.untilExclusive === null) return false;
  if (captureCoherent === false && (edge.dateBasis !== "unknown" || edge.from !== null || edge.untilExclusive !== null)) return false;
  const edgeCoverage = EXPLICIT_RELATIONSHIPS.has(edge.relationship) ? coverage.development : coverage.structural;
  if (edgeCoverage !== "complete" && (edge.dateBasis !== "unknown" || edge.from !== null || edge.untilExclusive !== null)) return false;
  if (!EDGE_LABELS.has(edge.sourceLabel) || !(edge.contextKey === null || typedKey(edge.contextKey, "context"))) return false;
  if (["leads-context", "serves-in-context", "participates-in-context", "member-of", "co-leads", "structural-sphere", "context-linked-influence"].includes(edge.relationship) && edge.contextKey === null) return false;
  const expectedLabel = EXPLICIT_RELATIONSHIPS.has(edge.relationship)
    ? "Verified development record"
    : edge.relationship === "co-leads"
      ? "Current shared leadership context"
      : ["serves-in-context", "participates-in-context", "context-linked-influence"].includes(edge.relationship)
        ? "Serving or participation context · proxy"
        : edge.relationship === "member-of"
          ? "Observed context membership"
          : STRUCTURAL_RELATIONSHIPS.has(edge.relationship)
            ? "Current role and context membership"
            : edge.sourceLabel;
  if (edge.sourceLabel !== expectedLabel) return false;
  return Number.isInteger(edge.revision) && edge.revision >= 1 && edge.revision <= 1000000;
}

function walkForForbiddenFields(value) {
  if (Array.isArray(value)) {
    for (const child of value) walkForForbiddenFields(child);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PUBLIC_FIELDS.has(key)) throw new TypeError("projected Sphere contains a private identity field");
    walkForForbiddenFields(value[key]);
  }
}

/** Validate only the terminal public graph. Throws on malformed input. */
export function validatePublicGraph(graph) {
  if (!hasExactKeys(graph, ["schemaVersion", "mode", "notice", "scope", "capture", "coverage", "nodes", "edges", "measures", "pendingSignals"])) {
    throw new TypeError("Sphere payload is not the closed projected envelope");
  }
  if (graph.schemaVersion !== SCHEMA_VERSION || !["fictional", "live"].includes(graph.mode)) throw new TypeError("Sphere payload has an unsupported version or mode");
  if ((graph.mode === "fictional" && graph.notice !== "Fictional prototype data.") || (graph.mode === "live" && graph.notice !== "Live projected data.")) throw new TypeError("Sphere notice does not match the source mode");
  if (!hasExactKeys(graph.scope, ["campus", "rootKey", "lens", "depthLimit"]) || !CAMPUSES.has(graph.scope.campus) || !typedKey(graph.scope.rootKey, "leader") || !LENSES.has(graph.scope.lens) || !Number.isInteger(graph.scope.depthLimit) || graph.scope.depthLimit < 1 || graph.scope.depthLimit > 3) throw new TypeError("Sphere scope is not closed");
  if (!hasExactKeys(graph.capture, ["asOf", "sourceMode", "coherent"]) || !(graph.capture.asOf === null || isoInstant(graph.capture.asOf)) || graph.capture.sourceMode !== graph.mode || typeof graph.capture.coherent !== "boolean") throw new TypeError("Sphere capture is not closed");
  if (!hasExactKeys(graph.coverage, ["structural", "development", "history", "outcomes", "identity", "truncated"]) || !["structural", "development", "history", "outcomes", "identity"].every(key => COVERAGE_STATES.has(graph.coverage[key])) || typeof graph.coverage.truncated !== "boolean") throw new TypeError("Sphere coverage is not closed");
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 180 || !Array.isArray(graph.edges) || graph.edges.length > 360) throw new TypeError("Sphere graph exceeds its bounded shape");

  const nodes = new Map();
  for (const node of graph.nodes) {
    if (!validNode(node) || nodes.has(node.key)) throw new TypeError("Sphere node is malformed or duplicated");
    nodes.set(node.key, node);
  }
  if (!nodes.has(graph.scope.rootKey) || nodes.get(graph.scope.rootKey).kind !== "leader") throw new TypeError("Sphere root is not a named leader");
  if (graph.coverage.identity !== "complete") throw new TypeError("Sphere cannot name leaders without complete identity coverage");
  for (const node of nodes.values()) {
    if (node.kind === "cohort" && node.count !== null && graph.coverage.structural !== "complete" && ["People in this context", "People in this structural sphere", "Context-linked influence · proxy"].includes(node.label)) throw new TypeError("incomplete structural coverage cannot disclose a cohort count");
    if (node.kind === "cohort" && node.count !== null && graph.coverage.development !== "complete" && node.label === "Recorded development cohort") throw new TypeError("incomplete development coverage cannot disclose a cohort count");
    if (node.depth === 0 && node.parentKey !== null) throw new TypeError("Sphere root-depth node cannot have a parent");
    if (node.depth > 0 && (!nodes.has(node.parentKey) || nodes.get(node.parentKey).depth >= node.depth)) throw new TypeError("Sphere node parent is outside or not above the node");
  }
  for (const edge of graph.edges) if (!validEdge(edge, nodes, graph.coverage, graph.capture.coherent) || graph.edges.filter(candidate => candidate.key === edge.key).length !== 1) throw new TypeError("Sphere edge is malformed or duplicated");
  if (!hasExactKeys(graph.measures, MEASURE_NAMES)) throw new TypeError("Sphere measures are not the closed catalogue");
  for (const key of MEASURE_NAMES) if (!validMeasure(graph.measures[key])) throw new TypeError(`Sphere measure ${key} is malformed`);
  if (graph.coverage.structural !== "complete" && ["directDistinctPeople", "directLeaderCount", "contextLinkedDistinctPeople", "structuralReach"].some((key) => ["observed", "observed-zero"].includes(graph.measures[key].state))) throw new TypeError("incomplete structural coverage cannot claim an observed measure");
  if (graph.coverage.development !== "complete" && ["recordedDevelopment", "leadersRaised"].some((key) => ["observed", "observed-zero"].includes(graph.measures[key].state))) throw new TypeError("incomplete development coverage cannot claim an observed measure");
  if (graph.coverage.outcomes !== "complete" && ["observed", "observed-zero"].includes(graph.measures.contextLinkedWins.state)) throw new TypeError("incomplete outcome coverage cannot claim an observed measure");
  if (graph.capture.asOf === null && (graph.edges.length > 0 || MEASURE_NAMES.some((key) => ["observed", "observed-zero"].includes(graph.measures[key].state)))) throw new TypeError("a graph without capture time cannot claim current edges or measures");

  if (!Array.isArray(graph.pendingSignals) || graph.pendingSignals.length > 100) throw new TypeError("Sphere pending signals exceed their bound");
  const pendingKeys = new Set();
  for (const pending of graph.pendingSignals) {
    if (!hasExactKeys(pending, ["key", "signalKind", "contextKey", "expectedSourceFamily", "measurementState", "connectionState", "value", "label", "missingEvidence", "captureOwnerRole"])) throw new TypeError("Sphere pending signal is not closed");
    if (!typedKey(pending.key, "pending") || pendingKeys.has(pending.key) || !SIGNAL_KINDS.has(pending.signalKind) || !(pending.contextKey === null || typedKey(pending.contextKey, "context")) || !SOURCE_FAMILIES.has(pending.expectedSourceFamily) || !MEASUREMENT_STATES.has(pending.measurementState) || !["connected", "unresolved", "not-connected", "unavailable"].includes(pending.connectionState) || pending.value !== null || pending.label !== PENDING_LABELS[pending.signalKind] || !Array.isArray(pending.missingEvidence) || pending.missingEvidence.length < 1 || pending.missingEvidence.length > 8 || new Set(pending.missingEvidence).size !== pending.missingEvidence.length || !pending.missingEvidence.every(safeKey) || !CAPTURE_OWNER_ROLES.has(pending.captureOwnerRole)) throw new TypeError("Sphere pending signal is malformed");
    if (["observed", "observed-zero"].includes(pending.measurementState)) throw new TypeError("Sphere pending signal cannot be observed");
    if (pending.connectionState === "connected" && pending.contextKey === null) throw new TypeError("Sphere connected pending signal requires a context");
    if (pending.connectionState === "not-connected" && pending.contextKey !== null) throw new TypeError("Sphere not-connected pending signal cannot carry a context");
    pendingKeys.add(pending.key);
  }
  walkForForbiddenFields(graph);
  return graph;
}

/**
 * Read a projected payload without ever accepting private rows.  Refusal is
 * deliberately a named unavailable state, not an empty successful graph.
 */
export function readProjectedSphere(value) {
  try {
    return { status: STATE.OK, graph: validatePublicGraph(value), reason: null };
  } catch {
    return {
      status: STATE.UNAVAILABLE,
      graph: null,
      reason: "The Sphere projection was unavailable or malformed before the viewer received it.",
    };
  }
}

export const validateSpherePayload = validatePublicGraph;
export const validateProjectedGraph = validatePublicGraph;
export const readProjectedGraph = readProjectedSphere;
export const readResponse = readProjectedSphere;
