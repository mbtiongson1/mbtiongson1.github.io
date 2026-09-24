/* Renderer-independent, privacy-projected fictional graph. No Rock IDs or raw people. */
export const fixture = {
  schemaVersion: 1, mode: 'fictional', initialRoot: 'eden',
  notice: 'Fictional prototype data. Development relationships demonstrate a future recording contract.',
  nodes: [
    ['eden', 'Eden Vale', 'Connect & ministry leader'],
    ['mara', 'Mara Sol', 'Connect leader'], ['jonah', 'Jonah Reed', 'Ministry leader'],
    ['theo', 'Theo Finch', 'Connect leader'], ['ava', 'Ava North', 'Ministry leader'],
    ['luca', 'Luca Wren', 'Connect leader'], ['iris', 'Iris Lake', 'Connect leader'],
    ['noa', 'Noa Field', 'Team lead'], ['remy', 'Remy Day', 'Connect leader'],
    ['cleo', 'Cleo Hart', 'Team lead'], ['asa', 'Asa Cove', 'Connect leader'],
    ['sage', 'Sage Elm', 'Connect leader'], ['kit', 'Kit Brook', 'Team lead'],
    ['olive', 'Olive Ray', 'Connect leader'], ['finn', 'Finn West', 'Ministry leader'],
  ].map(([id, label, role]) => ({ id, kind: 'leader', label, role, campus: 'MNL', profileUrl: null })),
  edges: [],
};
const branches = [
  ['eden','mara'], ['eden','jonah'], ['eden','theo'], ['eden','ava'],
  ['mara','luca'], ['mara','iris'], ['jonah','noa'], ['jonah','remy'],
  ['theo','cleo'], ['ava','asa'], ['luca','sage'], ['iris','kit'],
  ['remy','olive'], ['asa','finn'],
];
for (const [source, target] of branches) fixture.edges.push({
  id: `dev-${source}-${target}`, source, target, relationship: 'develops', evidence: 'explicit',
  provenance: 'Fictional verified development record', temporal: 'current',
  startedOn: '2026-08-12', timeBasis: 'asserted-effective-date',
});
for (let i = 0; i < 15; i++) {
  const source = fixture.nodes[i].id;
  const target = `cohort-${i}`;
  fixture.nodes.push({ id: target, kind: 'aggregate', label: `${5 + i % 9} people`,
    count: 5 + i % 9, role: 'Anonymous development cohort', campus: 'MNL', profileUrl: null });
  fixture.edges.push({ id: `dev-${source}-${target}`, source, target, relationship: 'develops',
    evidence: 'explicit', provenance: 'Fictional verified development records · identities removed before rendering',
    temporal: 'current', startedOn: null, timeBasis: 'unknown' });
}
for (let i = 0; i < 8; i++) {
  const source = fixture.nodes[i].id;
  const target = `context-${i}`;
  fixture.nodes.push({ id: target, kind: 'aggregate', label: `${12 + i * 3} people`,
    count: 12 + i * 3, role: i % 2 ? 'Ministry team' : 'Connect group', campus: 'MNL', profileUrl: null });
  fixture.edges.push({ id: `structure-${source}`, source, target, relationship: 'structural-sphere',
    evidence: 'structural', provenance: 'Fictional active role + membership · not evidence of discipleship',
    temporal: 'current', startedOn: null, timeBasis: 'unknown' });
  if (i > 0) fixture.edges.push({ id: `peer-${i}`, source: 'eden', target: source,
    relationship: 'co-leads', evidence: 'structural', provenance: 'Fictional shared current leadership context',
    temporal: 'current', startedOn: null, timeBasis: 'unknown' });
}

export function validateGraph(g) {
  if (g?.schemaVersion !== 1 || !['fictional', 'live-study'].includes(g.mode)) throw Error('Unsupported graph');
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges) || g.nodes.length > 180 || g.edges.length > 360) throw Error('Graph budget exceeded');
  const ids = new Set();
  for (const n of g.nodes) {
    if (!/^[a-z0-9-]{1,64}$/.test(n.id) || ids.has(n.id)) throw Error('Invalid node key');
    ids.add(n.id);
    if (!['leader', 'aggregate'].includes(n.kind) || typeof n.label !== 'string' || n.label.length > 120) throw Error('Invalid node');
    if (n.kind === 'aggregate' && (n.profileUrl || (n.count != null && (!Number.isInteger(n.count) || n.count < 5)))) throw Error('Unsafe aggregate');
    if (Object.keys(n).some(k => !['id','kind','label','role','campus','count','profileUrl'].includes(k))) throw Error('Unexpected identity field');
    if (n.profileUrl != null && !/^\/Person\/\d+$/.test(n.profileUrl)) throw Error('Invalid profile URL');
  }
  for (const e of g.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) throw Error('Invalid edge endpoint');
    if (!['explicit','structural'].includes(e.evidence)) throw Error('Invalid evidence');
    if (!['develops','structural-sphere','co-leads'].includes(e.relationship)) throw Error('Invalid relationship');
    if (e.relationship === 'develops' && e.evidence !== 'explicit') throw Error('Proximity is not development');
    if (g.mode === 'live-study' && e.evidence !== 'structural') throw Error('Live study has no development feed');
  }
  if (!ids.has(g.initialRoot)) throw Error('Missing root');
  return g;
}

export function sliceGraph(graph, { root, depth = 2, lens = 'development', collapsed = [] }) {
  const allowed = graph.edges.filter(e => lens === 'development' ? e.evidence === 'explicit' : e.evidence === 'structural');
  const levels = new Map([[root, 0]]), parents = new Map(), hidden = new Set(collapsed);
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor], level = levels.get(id);
    if (level >= Math.min(3, Math.max(1, depth)) || hidden.has(id)) continue;
    const neighbors = allowed.filter(e => e.source === id || e.relationship === 'co-leads' && e.target === id)
      .map(e => ({ edge: e, next: e.source === id ? e.target : e.source }))
      .sort((a,b) => a.next.localeCompare(b.next));
    for (const { next } of neighbors) {
      if (!levels.has(next)) { levels.set(next, level + 1); parents.set(next, id); queue.push(next); }
    }
  }
  const nodes = graph.nodes.filter(n => levels.has(n.id)).map(n => ({ ...n, depth: levels.get(n.id), parent: parents.get(n.id) || null }));
  const edges = allowed.filter(e => levels.has(e.source) && levels.has(e.target) &&
    (e.relationship === 'co-leads' ? !hidden.has(e.source) || !hidden.has(e.target) : !hidden.has(e.source)));
  const direct = nodes.filter(n => n.kind === 'leader' && n.depth === 1).length;
  const further = nodes.filter(n => n.kind === 'leader' && n.depth > 1).length;
  return { root, lens, nodes, edges, direct, further, depth: Math.max(0, ...levels.values()) };
}

function unit(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
/* Fixed branch sectors: depth reveal never moves an already-visible mark.
 * Radius is hop distance under the chosen relation lens, NOT spiritual maturity. */
export function layoutGraph(view) {
  const positions = new Map([[view.root, [0,0,0]]]);
  const siblings = view.nodes.filter(n => n.depth === 1).sort((a,b) => a.id.localeCompare(b.id));
  const branchAngles = new Map(siblings.map((n,i) => [n.id, i * Math.PI * 2 / Math.max(1,siblings.length) + .2]));
  for (const n of [...view.nodes].sort((a,b) => a.depth-b.depth || a.id.localeCompare(b.id))) {
    if (n.depth === 0) continue;
    let ancestor = n;
    while (ancestor.depth > 1) ancestor = view.nodes.find(p => p.id === ancestor.parent);
    const base = branchAngles.get(ancestor.id) || 0;
    const angle = base + (n.depth > 1 ? (unit(n.id) - .5) * .65 : 0);
    const radius = [0,2.55,4.55,6.35][n.depth];
    const latitude = (unit(n.id+'z') - .5) * 1.3;
    positions.set(n.id, [Math.cos(angle)*Math.cos(latitude)*radius, Math.sin(angle)*Math.cos(latitude)*radius, Math.sin(latitude)*radius]);
  }
  return positions;
}

export function relationshipRows(view) {
  const names = new Map(view.nodes.map(n => [n.id,n.label]));
  return view.edges.map(e => ({ source: names.get(e.source), target: names.get(e.target),
    relationship: e.relationship, evidence: e.evidence, provenance: e.provenance, depth: view.nodes.find(n=>n.id===e.target).depth }));
}
