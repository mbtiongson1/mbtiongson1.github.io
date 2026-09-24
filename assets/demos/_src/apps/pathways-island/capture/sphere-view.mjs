import { validatePublicGraph } from "./sphere-source.mjs";

const MAX_DEPTH = 3;
const EDGE_LABEL = Object.freeze({
  develops: "Develops",
  mentors: "Mentors",
  entrusts: "Entrusts",
  succeeds: "Succeeds",
  "co-leads": "Co-leads",
  "leads-context": "Leads context",
  "serves-in-context": "Serves in context",
  "participates-in-context": "Participates in context",
  "member-of": "Member of",
  "structural-sphere": "Structural sphere",
  "context-linked-influence": "Context-linked proxy",
});

function unit(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function nodeLabel(node) {
  if (node.kind === "leader") return node.displayName;
  if (node.count === null) return node.label;
  return `${node.count.toLocaleString("en-US")} people`;
}

function nodeRole(node) {
  if (node.kind === "leader") {
    if (node.roleKeys.length) return node.roleKeys.map((key) => key.replaceAll("-", " ")).join(" · ");
    return node.eligibilityBasis === "status-only" ? "Leader status" : "Current leader";
  }
  return node.disclosure === "suppressed" ? "Protected cohort · count withheld" : node.label;
}

/** Convert the terminal public projection into the renderer's immutable semantic model. */
export function sphereGraph(publicGraph) {
  validatePublicGraph(publicGraph);
  const graph = {
    schemaVersion: 1,
    mode: publicGraph.mode,
    notice: publicGraph.notice,
    initialRoot: publicGraph.scope.rootKey,
    scope: { ...publicGraph.scope },
    capture: { ...publicGraph.capture },
    coverage: { ...publicGraph.coverage },
    measures: structuredClone(publicGraph.measures),
    pendingSignals: structuredClone(publicGraph.pendingSignals),
    nodes: publicGraph.nodes.map((node) => Object.freeze({
      id: node.key,
      kind: node.kind === "leader" ? "leader" : "aggregate",
      label: nodeLabel(node),
      role: nodeRole(node),
      count: node.kind === "cohort" ? node.count : null,
      disclosure: node.kind === "cohort" ? node.disclosure : "named-leader",
      profileUrl: node.kind === "leader" ? node.profileUrl : null,
      source: node,
    })),
    edges: publicGraph.edges.map((edge) => Object.freeze({
      id: edge.key,
      source: edge.source,
      target: edge.target,
      relationship: edge.relationship,
      relationshipLabel: EDGE_LABEL[edge.relationship] || edge.relationship,
      evidence: edge.evidence,
      provenance: edge.sourceLabel,
      basis: edge.basis,
      sourceFamily: edge.sourceFamily,
      dateBasis: edge.dateBasis,
      from: edge.from,
      untilExclusive: edge.untilExclusive,
      contextKey: edge.contextKey,
    })),
  };
  return Object.freeze(graph);
}

/** Deterministic BFS over an already-projected graph; no identity or metric inference occurs here. */
export function sliceSphere(graph, { root = graph.initialRoot, depth = graph.scope.depthLimit, collapsed = [] } = {}) {
  const cap = Math.min(MAX_DEPTH, Math.max(1, Number(depth) || 1));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(root) || nodeById.get(root).kind !== "leader") throw new Error("Sphere root unavailable");
  const hidden = new Set(collapsed);
  const levels = new Map([[root, 0]]);
  const parents = new Map();
  const queue = [root];
  const adjacency = new Map();
  for (const edge of graph.edges) {
    const add = (from, to) => {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push({ edge, next: to });
    };
    add(edge.source, edge.target);
    if (edge.relationship === "co-leads") add(edge.target, edge.source);
  }
  for (const entries of adjacency.values()) entries.sort((a, b) => a.next.localeCompare(b.next) || a.edge.id.localeCompare(b.edge.id));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    const level = levels.get(id);
    if (level >= cap || hidden.has(id)) continue;
    for (const { next } of adjacency.get(id) || []) {
      if (!nodeById.has(next) || levels.has(next)) continue;
      levels.set(next, level + 1);
      parents.set(next, id);
      if (nodeById.get(next).kind === "leader") queue.push(next);
    }
  }
  const nodes = graph.nodes
    .filter((node) => levels.has(node.id))
    .map((node) => Object.freeze({ ...node, depth: levels.get(node.id), parent: parents.get(node.id) || null }));
  const visible = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target));
  const direct = nodes.filter((node) => node.kind === "leader" && node.depth === 1).length;
  const further = nodes.filter((node) => node.kind === "leader" && node.depth > 1).length;
  return Object.freeze({ root, lens: graph.scope.lens, nodes, edges, direct, further, depth: Math.max(0, ...levels.values()) });
}

/** Fixed branch sectors keep existing marks still when depth changes. Hop radius is not maturity. */
export function layoutSphere(view) {
  const positions = new Map([[view.root, [0, 0, 0]]]);
  const byId = new Map(view.nodes.map((node) => [node.id, node]));
  const branches = view.nodes.filter((node) => node.depth === 1).sort((a, b) => a.id.localeCompare(b.id));
  const angles = new Map(branches.map((node, index) => [node.id, index * Math.PI * 2 / Math.max(1, branches.length) + 0.2]));
  for (const node of [...view.nodes].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))) {
    if (node.depth === 0) continue;
    let ancestor = node;
    while (ancestor.depth > 1) ancestor = byId.get(ancestor.parent);
    const base = angles.get(ancestor.id) || 0;
    const angle = base + (node.depth > 1 ? (unit(node.id) - 0.5) * 0.65 : 0);
    const radius = [0, 2.55, 4.55, 6.35][node.depth];
    const latitude = (unit(`${node.id}z`) - 0.5) * 1.3;
    positions.set(node.id, [
      Math.cos(angle) * Math.cos(latitude) * radius,
      Math.sin(angle) * Math.cos(latitude) * radius,
      Math.sin(latitude) * radius,
    ]);
  }
  return positions;
}

export function relationshipRows(view) {
  const names = new Map(view.nodes.map((node) => [node.id, node.label]));
  const depth = new Map(view.nodes.map((node) => [node.id, node.depth]));
  return view.edges.map((edge) => Object.freeze({
    id: edge.id,
    source: names.get(edge.source),
    target: names.get(edge.target),
    relationship: edge.relationshipLabel,
    evidence: edge.evidence,
    basis: edge.basis,
    provenance: edge.provenance,
    from: edge.from,
    untilExclusive: edge.untilExclusive,
    depth: depth.get(edge.target),
  }));
}
