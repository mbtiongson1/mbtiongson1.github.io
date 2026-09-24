import { fixture, validateGraph, sliceGraph, layoutGraph, relationshipRows } from './graph.mjs';
const $ = id => document.getElementById(id);
const graph = validateGraph(JSON.parse($('study-data').textContent) || fixture);
const rootElement = document.querySelector('.sphere-study');
const compact = matchMedia('(max-width: 768px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLive = graph.mode === 'live-study';
let root = graph.initialRoot, depth = 2, lens = isLive ? 'structural' : 'development';
let selected = root, selectedEdge = null, collapsed = [], mode = 'classic';
let scene = null, view = null, failure = null, initializing = null;
$('data-notice').textContent = graph.notice;
$('inspection').open = !compact.matches;
if (isLive) {
  $('development').disabled = true;
  $('development').title = 'Explicit development relationships are not measured in this live study';
}
for (const node of graph.nodes.filter(n => n.kind === 'leader')) {
  const option = document.createElement('option');
  option.value = node.id; option.textContent = node.label;
  $('leader-picker').append(option);
}
function setMode(next) {
  mode = next;
  rootElement.dataset.mode = next;
  $('creative').setAttribute('aria-pressed', String(next === 'creative'));
  $('classic').setAttribute('aria-pressed', String(next === 'classic'));
  if (next === 'classic') $('field').append($('ledger-section'));
  else document.querySelector('.workspace').after($('ledger-section'));
  scene?.pause(next === 'classic' || !!failure);
  if (!scene && !failure) $('renderer-status').textContent = 'Classic reading · 3D loads only when chosen';
}
function cell(tr, text) {
  const td = document.createElement('td'); td.textContent = text; tr.append(td); return td;
}
function inspect(id, edgeId = null, interaction = false) {
  const node = view.nodes.find(n => n.id === id); if (!node) return;
  selected = id; selectedEdge = edgeId;
  const evidence = view.edges.find(e => e.id === edgeId) ||
    (id === root ? null : view.edges.find(e => e.target === id || e.relationship === 'co-leads' && e.source === id));
  $('selection-type').textContent = node.kind === 'leader' ? 'Selected leader' : 'Anonymous cohort';
  $('selected-name').textContent = node.label;
  $('selected-role').textContent = node.role;
  $('evidence-title').textContent = evidence ? evidence.relationship === 'develops' ? 'Recorded intentional development' :
    evidence.relationship === 'co-leads' ? 'Shared current leadership context' : 'Current role + group membership' : 'Center of the selected sphere';
  $('evidence-detail').textContent = evidence ? evidence.provenance :
    'Select a relationship to read its evidence. Distance means relationship hops, never personal maturity. Counts above describe this whole bounded view.';
  $('follow').disabled = node.kind !== 'leader' || id === root;
  $('collapse').disabled = node.kind !== 'leader';
  $('collapse').textContent = collapsed.includes(id) ? 'Expand this branch' : 'Collapse this branch';
  $('profile').hidden = !node.profileUrl;
  if (node.profileUrl) $('profile').href = isLive ? `#` : node.profileUrl;
  for (const row of $('ledger').children) row.dataset.selected = String(edgeId ? row.dataset.edge === edgeId : row.dataset.target === id);
  for (const button of $('relationship-list').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(edgeId ? button.dataset.edge === edgeId : button.dataset.target === id));
  }
  scene?.select(id);
  if (interaction) {
    $('inspection').open = true;
    if (compact.matches) {
      $('inspection').querySelector('summary').focus({ preventScroll: true });
      $('inspection').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }
}
function render() {
  view = sliceGraph(graph, { root, depth, lens, collapsed });
  $('leader-picker').value = root;
  $('depth').value = String(depth); $('depth-output').textContent = String(depth);
  $('development').setAttribute('aria-pressed', String(lens === 'development'));
  $('structural').setAttribute('aria-pressed', String(lens === 'structural'));
  const node = graph.nodes.find(n => n.id === root);
  $('sphere-title').textContent = `${node.label}'s sphere`;
  $('scope-caption').textContent = `${lens === 'development' ? 'Recorded development · fictional' : 'Structural proximity · not development'} · depth ${depth}`;
  $('direct-value').textContent = String(view.direct);
  $('further-value').textContent = String(view.further);
  $('direct-label').textContent = 'direct leaders';
  $('summary').textContent = `${view.nodes.length} marks · ${view.edges.length} relationships in this bounded view. ${isLive ?
    'Current production read, captured ' + graph.asOf + '. Expansion stays inside the loaded study slice.' : lens === 'development' ?
    'Fictional future-state evidence. Hops are not proof of leaders raised.' : 'Fictional current-state structure. Shared membership does not establish discipleship.'}`;
  $('ledger').replaceChildren(); $('relationship-list').replaceChildren();
  for (const [i, row] of relationshipRows(view).entries()) {
    const edge = view.edges[i];
    // Co-leadership is symmetric; retain original evidence while making the non-root person inspectable.
    const targetId = edge.target === root && edge.relationship === 'co-leads' ? edge.source : edge.target;
    const target = view.nodes.find(n => n.id === targetId);
    const source = targetId === edge.target ? row.source : row.target;
    const relationship = edge.relationship === 'develops' ? 'Develops' : edge.relationship === 'co-leads' ? 'Co-leads' : 'Structural sphere';
    const evidence = edge.evidence === 'explicit' ? 'Recorded' : 'Structural';
    const tr = document.createElement('tr'); tr.dataset.edge = edge.id; tr.dataset.target = targetId;
    cell(tr, source);
    const button = document.createElement('button'); button.textContent = target.label;
    button.addEventListener('click', () => inspect(targetId, edge.id, true)); cell(tr, '').append(button);
    cell(tr, relationship);
    const span = document.createElement('span'); span.className = `evidence-tag ${edge.evidence}`; span.textContent = evidence;
    cell(tr, '').append(span); cell(tr, String(target.depth)); $('ledger').append(tr);
    const li = document.createElement('li'), action = document.createElement('button');
    action.dataset.edge = edge.id; action.dataset.target = targetId; action.setAttribute('aria-pressed', 'false');
    const from = document.createElement('span'); from.className = 'relationship-source'; from.textContent = `${source} · ${relationship.toLowerCase()}`;
    const name = document.createElement('strong'); name.textContent = target.label;
    const meta = document.createElement('span'); meta.className = 'relationship-meta';
    const tag = span.cloneNode(true), hop = document.createElement('span'); hop.textContent = `Depth ${target.depth}`;
    meta.append(tag, hop); action.append(from, name, meta);
    action.addEventListener('click', () => inspect(targetId, edge.id, true)); li.append(action); $('relationship-list').append(li);
  }
  $('empty-ledger').hidden = view.edges.length > 0;
  scene?.setView(view, layoutGraph(view));
  if (!view.nodes.some(n => n.id === selected)) { selected = root; selectedEdge = null; }
  inspect(selected, selectedEdge);
}
function fallback(reason) {
  failure = reason;
  $('fallback').hidden = false; $('fallback-reason').textContent = reason;
  $('renderer-status').textContent = 'Classic equivalent active · no data lost';
  $('creative').disabled = true;
  scene?.pause(true); setMode('classic');
}
async function ensureScene() {
  if (scene || failure) return;
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      const { createScene } = await import('./dist/scene.js');
      scene = createScene({ host: $('scene'), labels: $('labels'), onSelect: id => inspect(id, null, true), onFailure: fallback });
      scene.setView(view, layoutGraph(view)); scene.reset(); scene.select(selected);
      scene.pause(mode === 'classic');
      $('renderer-status').textContent = 'Three.js r180 · WebGL2 · renders on demand';
    } catch {
      fallback('3D could not initialize. The complete relationship reading and selection controls remain available.');
    }
  })();
  return initializing;
}
$('leader-picker').addEventListener('change', () => { root = $('leader-picker').value; selected = root; selectedEdge = null; collapsed = []; render(); scene?.reset(); });
for (const key of ['development', 'structural']) $(key).addEventListener('click', () => { lens = key; collapsed = []; selected = root; selectedEdge = null; render(); scene?.reset(); });
$('depth').addEventListener('input', () => { depth = Number($('depth').value); render(); scene?.reset(); });
$('follow').addEventListener('click', () => { root = selected; selectedEdge = null; collapsed = []; render(); scene?.reset(); });
$('collapse').addEventListener('click', () => { collapsed = collapsed.includes(selected) ? collapsed.filter(n => n !== selected) : [...collapsed, selected]; render(); });
$('classic').addEventListener('click', () => setMode('classic'));
$('creative').addEventListener('click', () => { setMode('creative'); void ensureScene(); });
$('fallback-ledger').addEventListener('click', () => { $('ledger-title').focus(); $('ledger-title').scrollIntoView({ behavior: 'instant' }); });
render();
if (reduced || new URLSearchParams(location.search).has('fallback')) {
  fallback(reduced ? 'Reduced-motion preference respected. Explore the same relationships without initializing a moving camera.' : '3D is deliberately disabled for this fallback test. All relationship controls remain available.');
} else if (compact.matches) setMode('classic');
else { setMode('creative'); await ensureScene(); }
window.addEventListener('pagehide', () => { scene?.destroy(); scene = null; initializing = null; }, { once: false });
window.addEventListener('pageshow', e => { if (e.persisted && mode === 'creative') void ensureScene(); });
