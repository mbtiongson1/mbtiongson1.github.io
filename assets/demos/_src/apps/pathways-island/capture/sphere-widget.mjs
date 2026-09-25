import { readProjectedSphere, STATE as SOURCE_STATE } from "./sphere-source.mjs";
import { layoutSphere, relationshipRows, sliceSphere, sphereGraph } from "./sphere-view.mjs";

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const measureText = (measure) => {
  if (!measure || measure.value === null) return "—";
  return measure.value.toLocaleString("en-US");
};
const dateText = (row) => row.from || row.untilExclusive
  ? `${row.from || "unknown start"} → ${row.untilExclusive || "current"}`
  : "date unknown";

function unavailable(host, reason = "Sphere data is unavailable. Nothing is shown as zero.") {
  host.replaceChildren();
  const panel = make("section", "sphere-panel sphere-panel--unavailable");
  panel.append(make("h3", null, "Sphere unavailable"), make("p", null, reason));
  host.append(panel);
  return { destroy() {} };
}

function button(label, pressed = false) {
  const node = make("button", "sphere-button", label);
  node.type = "button";
  node.setAttribute("aria-pressed", String(pressed));
  return node;
}

function buildLedger(view, selectedId, onSelect) {
  const wrap = make("div", "sphere-ledger");
  const table = make("table");
  const caption = make("caption", null, "Every relationship in this bounded view. Structural and proxy evidence is not recorded development.");
  const head = make("thead");
  const hr = make("tr");
  for (const label of ["From", "To", "Relationship", "Evidence", "Basis", "Date", "Depth"]) hr.append(make("th", null, label));
  head.append(hr);
  const body = make("tbody");
  for (const row of relationshipRows(view)) {
    const tr = make("tr");
    tr.dataset.selected = String(row.id === selectedId);
    const source = make("td", null, row.source);
    const targetCell = make("td");
    const target = button(row.target, row.id === selectedId);
    target.classList.add("sphere-ledger__target");
    target.addEventListener("click", () => onSelect(row.id));
    targetCell.append(target);
    const evidence = make("span", `sphere-evidence sphere-evidence--${row.evidence}`, row.evidence);
    const evidenceCell = make("td"); evidenceCell.append(evidence);
    for (const cell of [source, targetCell, make("td", null, row.relationship), evidenceCell,
      make("td", null, row.basis.replaceAll("-", " ")), make("td", null, dateText(row)), make("td", "num", String(row.depth))]) tr.append(cell);
    body.append(tr);
  }
  table.append(caption, head, body);
  wrap.append(table);
  if (!view.edges.length) wrap.append(make("p", "sphere-empty", "No relationships are available in this bounded view."));
  return wrap;
}

function buildPending(graph) {
  const details = make("details", "sphere-pending");
  details.append(make("summary", null, `Pending evidence · ${graph.pendingSignals.length}`));
  const list = make("ul");
  for (const signal of graph.pendingSignals) {
    const item = make("li");
    item.append(make("strong", null, signal.label), make("span", null, ` ${signal.measurementState.replaceAll("-", " ")} · owner: ${signal.captureOwnerRole.replaceAll("-", " ")}`));
    list.append(item);
  }
  if (!graph.pendingSignals.length) list.append(make("li", null, "No pending categories in this capture."));
  details.append(list);
  return details;
}

function buildMeasures(graph) {
  const labels = [
    ["directDistinctPeople", "Direct people"],
    ["directLeaderCount", "Direct leaders"],
    ["structuralReach", "Structural reach"],
    ["recordedDevelopment", "Recorded development"],
  ];
  const strip = make("dl", "sphere-measures");
  for (const [key, label] of labels) {
    const item = make("div");
    item.append(make("dt", null, label), make("dd", null, measureText(graph.measures[key])));
    const measure = graph.measures[key];
    item.append(make("span", null, measure.state.replaceAll("-", " ")));
    strip.append(item);
  }
  return strip;
}

/** Mount one Creative Sphere explorer. Input must already be the terminal public projection. */
export function mountSphere(host, projected, { mode = "creative", announce = () => {} } = {}) {
  const source = readProjectedSphere(projected);
  if (source.status !== SOURCE_STATE.OK) return unavailable(host);
  let graph;
  try { graph = sphereGraph(source.graph); } catch { return unavailable(host); }

  host.replaceChildren();
  const panel = make("section", "sphere-panel");
  panel.dataset.mode = mode === "classic" ? "classic" : "creative";
  const heading = make("div", "sphere-heading");
  const titles = make("div");
  const eyebrow = make("p", "sphere-eyebrow", "People Pathways · leadership relationships");
  const initialLeader = graph.nodes.find((node) => node.id === graph.initialRoot);
  const title = make("h3", null, `${initialLeader?.label || "Selected leader"}'s sphere`);
  const copy = make("p", "sphere-intro", "See current leadership structure and explicitly recorded development without turning proximity into a spiritual score. Hop distance means relationship depth, never maturity.");
  titles.append(eyebrow, title, copy);
  const notice = make("p", "sphere-notice", graph.notice);
  heading.append(titles, notice);

  const toolbar = make("div", "sphere-toolbar");
  const rootLabel = make("label", null, "Center leader");
  const picker = make("select", "sphere-picker");
  const leaders = graph.nodes.filter((node) => node.kind === "leader").sort((a, b) => a.label.localeCompare(b.label));
  for (const leader of leaders) {
    const option = make("option", null, leader.label); option.value = leader.id; picker.append(option);
  }
  picker.value = graph.initialRoot;
  rootLabel.append(picker);
  const depthLabel = make("label", null, "Depth");
  const depth = document.createElement("input");
  depth.type = "range"; depth.min = "1"; depth.max = "3"; depth.value = String(graph.scope.depthLimit);
  const depthOutput = make("output", null, depth.value);
  depthLabel.append(depth, depthOutput);
  toolbar.append(rootLabel, depthLabel);

  const scope = make("div", "sphere-scope");
  const scopeTitle = make("p", "sphere-scope__title");
  const counts = make("p", "sphere-scope__counts");
  scope.append(scopeTitle, counts);

  const fallback = make("div", "sphere-fallback"); fallback.hidden = true;
  fallback.append(make("strong", null, "Classic equivalent active"), make("p", null, "The complete relationship ledger remains available; no value is replaced by an empty canvas."));
  const explorer = make("div", "sphere-explorer");
  const field = make("div", "sphere-field");
  const surface = make("div", "sphere-scene-surface");
  const sceneHost = make("div", "sphere-scene");
  const labels = make("div", "sphere-labels");
  surface.append(sceneHost, labels);
  const legend = make("div", "sphere-legend");
  legend.append(make("span", "sphere-key sphere-key--explicit", "Recorded"), make("span", "sphere-key sphere-key--structural", "Structural / proxy"), make("span", "sphere-key sphere-key--cohort", "Protected cohort"));
  field.append(surface, legend);
  const inspector = make("aside", "sphere-inspector");
  const selectedType = make("span", "sphere-selected-type");
  const selectedName = make("strong", "sphere-selected-name");
  const selectedRole = make("p", "sphere-selected-role");
  const evidenceTitle = make("h4", null, "Selected evidence");
  const evidenceDetail = make("p", "sphere-evidence-detail");
  const reset = button("Reset camera");
  inspector.append(selectedType, selectedName, selectedRole, evidenceTitle, evidenceDetail, reset,
    make("p", "sphere-care", "Non-leaders remain anonymous cohorts. Shared membership is a structural proxy, not proof of discipleship or causation."));
  explorer.append(field, inspector);
  const ledgerMount = make("div", "sphere-ledger-mount");
  panel.append(heading, toolbar, scope, fallback, explorer, ledgerMount, buildMeasures(graph), buildPending(graph));
  host.append(panel);

  let root = graph.initialRoot;
  let selectedEdge = null;
  let view = null;
  let scene = null;
  let scenePromise = null;
  let disposed = false;

  function inspect(edgeId = null) {
    selectedEdge = edgeId;
    const edge = view.edges.find((item) => item.id === edgeId);
    const nodeId = edge ? (edge.target === root && edge.relationship === "co-leads" ? edge.source : edge.target) : root;
    const node = view.nodes.find((item) => item.id === nodeId) || view.nodes[0];
    selectedType.textContent = node.kind === "leader" ? "Selected leader" : "Anonymous cohort";
    selectedName.textContent = node.label;
    selectedRole.textContent = node.role;
    evidenceDetail.textContent = edge
      ? `${edge.relationshipLabel}. ${edge.provenance}; ${edge.basis.replaceAll("-", " ")}; ${edge.from || "date unknown"}.`
      : "Center of this bounded view. Select a relationship in the ledger to inspect its evidence.";
    scene?.select(node.id);
    ledgerMount.replaceChildren(buildLedger(view, selectedEdge, (id) => { inspect(id); announce("Sphere relationship selected."); }));
  }

  function render() {
    view = sliceSphere(graph, { root, depth: Number(depth.value) });
    const rootNode = view.nodes.find((node) => node.id === root);
    title.textContent = `${rootNode.label}'s sphere`;
    scopeTitle.textContent = `${graph.scope.lens.replaceAll("-", " ")} · depth ${depth.value}`;
    counts.textContent = `${view.direct} direct leaders · ${view.further} further leaders · ${view.edges.length} relationships`;
    depthOutput.textContent = depth.value;
    scene?.setView(view, layoutSphere(view));
    scene?.reset();
    inspect(selectedEdge && view.edges.some((edge) => edge.id === selectedEdge) ? selectedEdge : null);
  }

  function setMode(next) {
    panel.dataset.mode = next;
    scene?.pause(next !== "creative");
    if (next === "creative") void ensureScene();
  }

  function failScene() {
    fallback.hidden = false;
    creative.disabled = true;
    setMode("classic");
  }

  async function ensureScene() {
    if (scene || scenePromise || disposed || panel.dataset.mode !== "creative") return scenePromise;
    scenePromise = import("./sphere-scene.mjs?v=20260909_002").then(({ createScene }) => {
      if (disposed) return;
      scene = createScene({ host: sceneHost, labels, onSelect: (id) => {
        const edge = view.edges.find((item) => item.target === id || (item.relationship === "co-leads" && item.source === id));
        inspect(edge?.id || null);
      }, onFailure: failScene });
      scene.setView(view, layoutSphere(view)); scene.reset(); scene.select(root);
    }).catch(failScene);
    return scenePromise;
  }

  picker.addEventListener("change", () => { root = picker.value; selectedEdge = null; render(); });
  depth.addEventListener("input", render);
  reset.addEventListener("click", () => scene?.reset());
  render();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 768px)").matches || mode === "classic") setMode("classic");
  else void ensureScene();

  return { destroy() { disposed = true; scene?.destroy(); scene = null; host.replaceChildren(); }, setMode };
}

/** Classic composition uses the same normalized graph and ledger, without initializing WebGL. */
export function mountSphereClassic(host, projected) {
  return mountSphere(host, projected, { mode: "classic" });
}
