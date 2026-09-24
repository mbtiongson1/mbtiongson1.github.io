import { normalizeMode, serializeFilters, parseListParam, formatCell, themeName, AGGREGATE_ONLY_TITLE } from "./dashboard-view.mjs";
import { mountExportRail, createExportRegistry, bindExportDelegation } from "./dashboard-export.mjs";
import { mountCopyPrompt, mountPackageControl, buildDashboardPackage } from "./dashboard-prompt.mjs";
import { mountThemeSwatch } from "./dashboard-theme.mjs";
import { classicWidget, kpiStrip, dataTable, pivotTable, unavailablePanel, bindInfoDismissal, syncModeSwitch } from "./classic-widgets.mjs";
import { mountTooltipDelegate, tooltipContent } from "./dashboard-tooltip.mjs";
import { mountBreadcrumbs } from "./dashboard-breadcrumbs.mjs";
import { mountStatus, markChanged, motionMs, trackHostChrome } from "./dashboard-status.mjs";
import { mountMarkup } from "./dashboard-markup.mjs";
import {
  AGES, AGE_LABELS, AGE_COLORS,
  CAMPUSES, CAMPUS_LABELS, CAMPUS_COLORS, CAMPUS_ORDER,
  CONNECTION_COLORS, CONNECTION_TARGETS,
  GENDER_COLORS, GENDERS,
  number, format, percent, clamp,
  readResponse, aggregate, itemsFrom, sum, connectionSemantic, isOpenAccessRow,
} from "./exec-overview-shared.mjs";

const QUERY_DEMOGRAPHICS = "exec-overview-demographics";
const QUERY_PULSE = "exec-overview-pulse";
const CAMPUS_COLUMN_LABELS = {MNL:"Manila",BNE:"Brisbane",SEL:"Seoul",UNASSIGNED:"Unassigned"};
const CIRCUMFERENCE = 439.823;

const byId = (id) => document.getElementById(id);
const prefersReducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readPayload() {
  try {
    const payload = JSON.parse(byId("exec-overview-data")?.textContent || "{}");
    if (payload.schemaVersion !== 1 || payload.dashboardId !== "favor-exec-landing" || !CAMPUSES.has(payload.campus)) throw new Error();
    return {
      campus: payload.campus,
      // The fixture payload says so about itself; the Lava-rendered production payload has no
      // such key. Every artifact and prompt repeats this flag, so a fixture render can never be
      // mistaken for a Rock reading downstream.
      fictional: payload.fictional === true,
      demographics: readResponse(payload.responses?.demographics, QUERY_DEMOGRAPHICS, ["campusShortCode","connectionStatus","gender","ageBand","uniquePeople"]),
      pulse: readResponse(payload.responses?.pulse, QUERY_PULSE, ["campusShortCode","ageBand","gender","totalPeople","totalLeaders","connectCount","servingCount","attendanceCount","milestoneCount"]),
    };
  } catch {
    return {campus:"MNL", fictional:false, demographics:{available:false,rows:[]}, pulse:{available:false,rows:[]}};
  }
}

const payload = readPayload();
// The URL is the complete address of the view (#215 D5): a pasted link must reproduce
// exactly what its author saw, so it wins over the server-rendered payload.campus, and
// every value is validated against the same closed sets the filter buttons use -- an
// unrecognized or hand-edited query value is silently dropped rather than trusted.
const bootParams = new URLSearchParams(location.search);
const urlCampus = String(bootParams.get("campus") || "").trim().toUpperCase();
let currentCampus = CAMPUSES.has(urlCampus) ? urlCampus : payload.campus;
let currentMode = normalizeMode(bootParams.get("mode"));
// Age and gender are multi-select: an exec comparing "youngAdults + adults" or
// "Women + Men" (distinct from "All", which also counts Unknown) is a real
// question, not a single-pick one. Empty set means no filter on that axis.
const selectedAges = new Set(parseListParam(bootParams, "age").filter((age) => AGES.includes(age)));
const selectedGenders = new Set(parseListParam(bootParams, "gender").map((value) => value.toLowerCase()).filter((value) => GENDERS.has(value)));

function campusMatches(row) {
  return currentCampus === "ALL" || row.campusShortCode === currentCampus;
}

function ageMatches(row) {
  return selectedAges.size === 0 || selectedAges.has(row.ageBand);
}

function genderMatches(row) {
  return selectedGenders.size === 0 || selectedGenders.has(String(row.gender).toLowerCase());
}

function ageLabel(age, campus = currentCampus) {
  if (age === "adults") return campus === "BNE" ? "Adults 26–64" : campus === "ALL" ? "Adults 26–49 (MNL/SEL), 26–64 (BNE)" : "Adults 26–49";
  if (age === "seasoned") return campus === "BNE" ? "Seasoned 65+" : campus === "ALL" ? "Seasoned 50+ (MNL/SEL), 65+ (BNE)" : "Seasoned 50+";
  return AGE_LABELS[age] || age;
}

function selectedAgeLabels() { return [...selectedAges].map((age) => ageLabel(age)); }
function selectedGenderLabels() { return [...selectedGenders].map((g) => g === "women" ? "Women" : "Men"); }

/* One human sentence for the active slice. The masthead, the pulse chapter meta, every export's
 * provenance line, and both prompts read this same line, so they cannot describe different views. */
function filterSummary() {
  const ages = selectedAgeLabels(), genders = selectedGenderLabels();
  return [
    CAMPUS_LABELS[currentCampus],
    ages.length ? ages.join(", ") : "All ages",
    genders.length ? genders.join(" + ") : "All people",
  ].join(" · ");
}

function rowsForSlice(rows) {
  return rows.filter((row) => isOpenAccessRow(row) && campusMatches(row) && ageMatches(row) && genderMatches(row));
}

function unavailable(id, foot, reason = "Unavailable for this slice") {
  const node = byId(id); if (node) { node.textContent = "—"; node.classList.add("skeleton-value"); }
  const footer = byId(foot); if (footer) footer.textContent = reason;
}

function badge(id, label, state) {
  const node = byId(id); if (!node) return;
  node.textContent = label;
  node.className = `state-badge ${state}`;
}

function fill(id, value, healthy = false) {
  const node = byId(id); if (!node) return;
  node.style.width = `${clamp(value)}%`;
  node.classList.toggle("healthy", healthy);
}

function setPulseCard(prefix, value, footer, fillValue, badgeLabel, badgeState) {
  const kpi = byId(`pulse-${prefix}-kpi`); if (kpi) { kpi.textContent = value; kpi.classList.remove("skeleton-value"); }
  const foot = byId(`pulse-${prefix}-foot`); if (foot) foot.textContent = footer;
  fill(`pulse-${prefix}-fill`, fillValue, badgeState === "healthy");
  badge(`pulse-${prefix}-badge`, badgeLabel, badgeState);
}

function pulseRows() {
  if (!payload.pulse.available) return null;
  return rowsForSlice(payload.pulse.rows);
}

/* The six vital signs, computed once from pulseRows() and read by both modes. Creative paints
 * cards from it, Classic tiles from it; neither derives a number the other cannot see. The
 * registered pulse query returns one aggregate row per campus/age/gender and no dated series,
 * so there is deliberately nothing here to draw a sparkline from. */
function pulseModel() {
  const rows = pulseRows();
  const empty = {
    available: false, total: null, leaders: null, ratio: null,
    attendance: null, attendanceShare: null, connect: null, belongingShare: null,
    serving: null, servingShare: null, milestones: null, movementShare: null,
    coverageState: "unknown", belongingState: "unknown",
  };
  if (!rows) return empty;
  const total = sum(rows,"totalPeople");
  let leaders = sum(rows,"totalLeaders");
  if (payload.demographics.available) {
    const demoRows = rowsForSlice(payload.demographics.rows);
    const demoLeaders = sum(demoRows.filter((r) => r.connectionStatus === "Leader"), "uniquePeople");
    if (demoLeaders !== null) leaders = demoLeaders;
  }
  const attendance = sum(rows,"attendanceCount"), connect = sum(rows,"connectCount"), serving = sum(rows,"servingCount"), milestones = sum(rows,"milestoneCount");
  if ([total,leaders,attendance,connect,serving,milestones].some((value)=>value===null)) return empty;
  const ratio = leaders > 0 ? total / leaders : null;
  const belongingShare = percent(connect,total);
  return {
    available: true, total, leaders, ratio,
    attendance, attendanceShare: percent(attendance,total),
    connect, belongingShare,
    serving, servingShare: percent(serving,total),
    milestones, movementShare: percent(milestones,total),
    coverageState: ratio === null ? "unknown" : ratio <= 6.7 ? "healthy" : ratio <= 10 ? "watch" : "attention",
    belongingState: "healthy",
  };
}

function renderPulse() {
  const model = pulseModel();
  if (!model.available) {
    const reason = "Live aggregate unavailable";
    for (const prefix of ["coverage","att","belonging","serving","movement"]) {
      unavailable(`pulse-${prefix}-kpi`, `pulse-${prefix}-foot`, reason); fill(`pulse-${prefix}-fill`,0); badge(`pulse-${prefix}-badge`,"Unavailable","unavail");
    }
  } else {
    const ratio = model.ratio;
    setPulseCard("coverage", ratio === null ? "—" : `1 : ${ratio.toFixed(1)}`, "Active people per leader · Target 1 : 6.7", ratio ? (6.7 / ratio) * 100 : 0, ratio === null ? "Unavailable" : model.coverageState === "healthy" ? "Healthy" : model.coverageState === "watch" ? "Watch" : "Attention", ratio === null ? "unavail" : model.coverageState);
    setPulseCard("att",format(model.attendance),"Distinct people with any attendance record · last 28 days",model.attendanceShare,"Observed","healthy");
    setPulseCard("belonging",model.belongingShare===null?"—":`${model.belongingShare.toFixed(1)}%`,model.connect !== null ? `${format(model.connect)} active in Connect` : "People in an active Connect group",model.belongingShare,"Observed","healthy");
    setPulseCard("serving",format(model.serving),"Active Ministry Team group members",model.servingShare,"Observed","healthy");
    setPulseCard("movement",format(model.milestones),"Completed ConnectionRequest records · last 30 days",model.movementShare,"Observed","healthy");
  }
  unavailable("pulse-giving-kpi","pulse-giving-foot","Unavailable · no approved giving query"); fill("pulse-giving-fill",0); badge("pulse-giving-badge","Unavailable","unavail");
  const meta = byId("pulse-chapter-meta");
  if (meta) meta.textContent = `6 vital signs · ${filterSummary()}`;
}

function directoryHref(dimensionKind, item) {
  if (!item || item.unknown) return null;
  const params = new URLSearchParams();
  if (dimensionKind === "connection") {
    params.set("connection", item.name);
    if (currentCampus !== "ALL") params.set("campus", currentCampus);
  } else if (dimensionKind === "age") {
    params.set("age", item.name);
    if (currentCampus !== "ALL") params.set("campus", currentCampus);
  } else if (dimensionKind === "gender") {
    const g = String(item.name).toLowerCase();
    if (g === "women" || g === "men") params.set("gender", g);
    else return null;
    if (currentCampus !== "ALL") params.set("campus", currentCampus);
  } else if (dimensionKind === "campus") {
    const code = item.code || item.name;
    if (code && code !== "UNASSIGNED" && code !== "ALL") {
      params.set("campus", code);
    } else {
      return null;
    }
  } else {
    return null;
  }
  return `/people/directory?${params}`;
}

/* Built as DOM rather than interpolated into innerHTML. `item.name` is a Rock value --
 * a connection status or a campus short code, both staff-editable -- so a template
 * string here is a stored-XSS vector on a staff-authenticated page. textContent makes
 * a name with markup in it render as the name it is. */
function comboRow(className, name, swatch, fillColor, fillPct, count, pct, semantic = null, tooltip = null, href = null) {
  const row=document.createElement(href?"a":"div");row.className=className;
  if(href){row.href=href;row.target="_blank";row.rel="noopener noreferrer";}
  if(tooltip){
    row.dataset.tipLabel=tooltip.label;
    if(tooltip.value!=null)row.dataset.tipValue=tooltip.value;
    if(tooltip.comparison)row.dataset.tipCompare=tooltip.comparison;
    if(tooltip.unit)row.dataset.tipUnit=tooltip.unit;
    if(!href)row.tabIndex=0;
  }
  const label=document.createElement("span");label.className="combo-row__name";
  if(swatch){const mark=document.createElement("i");mark.className="combo-row__swatch";mark.style.background=swatch;label.appendChild(mark);}
  label.appendChild(document.createTextNode(name));
  if(semantic){
    const dot=document.createElement("span");
    dot.className=`semantic-dot semantic--${semantic.state}`;
    dot.title=semantic.note;
    dot.setAttribute("aria-label",`${name}: ${semantic.label}`);
    label.appendChild(dot);
  }
  const track=document.createElement("div");track.className="combo-row__track";
  if(fillColor!==null){const fill=document.createElement("span");fill.className="combo-row__fill";fill.style.background=fillColor;fill.style.width=`${fillPct}%`;track.appendChild(fill);}
  const countCell=document.createElement("span");countCell.className="combo-row__count";countCell.textContent=count;
  const pctCell=document.createElement("strong");pctCell.className="combo-row__pct";pctCell.textContent=pct;
  if(href){
    const arrow=document.createElement("span");arrow.className="combo-row__arrow";arrow.setAttribute("aria-hidden","true");arrow.textContent="↗";
    row.append(label,track,countCell,pctCell,arrow);
  } else {
    row.append(label,track,countCell,pctCell);
  }
  return row;
}

function renderBars(containerId, items, dimensionKind = null, labelOf = null) {
  const container=byId(containerId); if(!container)return;
  container.replaceChildren();
  if(!items.length){container.appendChild(comboRow("combo-row unknown is-unlinked","Unavailable",null,null,0,"—","—"));return;}
  for(const item of items){
    const displayName=labelOf?labelOf(item.name):String(item.name);
    const isConn=dimensionKind==="connection";
    const semantic=isConn?connectionSemantic(item.name,item.pct):null;
    const href=directoryHref(dimensionKind,item);
    const compareParts=[`${item.pct.toFixed(1)}%`];
    if(semantic)compareParts.push(semantic.note);
    if(href)compareParts.push("Click to open in Directory ↗");
    const tooltip={label:displayName,value:format(item.count),unit:"people",comparison:compareParts.join(" · ")};
    container.appendChild(comboRow(
      item.unknown||!href?"combo-row unknown is-unlinked":"combo-row",
      displayName, item.color, item.color, clamp(item.pct),
      format(item.count), `${item.pct.toFixed(1)}%`,
      semantic,
      tooltip,
      href,
    ));
  }
}

// Each circle's HTML stroke is a positional default; a filter can shrink or reorder
// `items` (e.g. filtering to one age band leaves a one-item list), so the item that
// lands at a given index is not always the category that circle was drawn for. Set
// stroke from the item's own semantic color every render instead of trusting position.
function updateDonut(ids,items,dimensionKind=null,labelOf=null){let used=0;ids.forEach((id,index)=>{const node=byId(id);if(!node)return;const item=items[index];const pct=item?.pct||0;const dash=pct/100*CIRCUMFERENCE;node.style.strokeDasharray=`${dash} ${CIRCUMFERENCE}`;node.style.strokeDashoffset=`${-(used/100)*CIRCUMFERENCE}`;if(item){node.style.stroke=item.color;const displayName=labelOf?labelOf(item.name):String(item.name);const href=directoryHref(dimensionKind,item);node.dataset.tipLabel=displayName;node.dataset.tipValue=format(item.count);node.dataset.tipUnit="people";node.dataset.tipCompare=href?`${pct.toFixed(1)}% · Click to open in Directory ↗`:`${pct.toFixed(1)}%`;node.setAttribute("aria-label",`${displayName}: ${format(item.count)} people (${pct.toFixed(1)}%)`);node.style.pointerEvents="auto";node.tabIndex=0;if(href){node.onclick=()=>window.open(href,"_blank","noopener,noreferrer");node.style.cursor="pointer";}else{node.onclick=null;node.style.cursor="default";}}used+=pct;});}

/* The demographic atlas, computed once. Creative draws donuts and bar rows from these items;
 * Classic pivots the same items and the same shares. `campuses` deliberately ignores the campus
 * filter, exactly as the Creative Campus Share card does -- a campus split of the campus you
 * already picked would be one bar at 100%. */
function atlasModel() {
  const allDemographics = payload.demographics.available ? payload.demographics.rows : [];
  const churchwideRows = allDemographics.filter(isOpenAccessRow);
  const rows = rowsForSlice(churchwideRows);
  const globalRows = churchwideRows.filter((row) => ageMatches(row) && genderMatches(row));
  return {
    available: payload.demographics.available,
    allDemographics: churchwideRows,
    rows,
    globalRows,
    sidebarLocalRows: churchwideRows.filter((row) => campusMatches(row) && genderMatches(row)),
    sidebarGlobalRows: churchwideRows.filter((row) => genderMatches(row)),
    total: sum(rows,"uniquePeople") ?? 0,
    campusTotal: sum(globalRows,"uniquePeople") ?? 0,
    connection: itemsFrom(aggregate(rows,"connectionStatus"),["Crowd","Core","New","Leader"],CONNECTION_COLORS),
    ages: itemsFrom(aggregate(rows,"ageBand"),AGES,AGE_COLORS),
    genders: itemsFrom(aggregate(rows,"gender"),["Women","Men","Unknown"],GENDER_COLORS),
    campuses: itemsFrom(aggregate(globalRows,"campusShortCode"),CAMPUS_ORDER,CAMPUS_COLORS).map((item)=>({...item,code:item.name,name:CAMPUS_LABELS[item.name]||item.name})),
  };
}

function renderAtlas() {
  const model = atlasModel();
  const {total, campusTotal, available, connection, ages, genders} = model;
  const campusItems = model.campuses;
  for(const id of ["atlas-hero-kpi","donut-conn-total","donut-age-total","donut-gen-total"]){const node=byId(id);if(node)node.textContent=available?format(total):"—";}
  const stamp=byId("atlas-hero-stamp");if(stamp)stamp.textContent=`Counted Church Base (${CAMPUS_LABELS[currentCampus]})`;
  const lead=byId("atlas-hero-lead");if(lead)lead.textContent="Active, living, non-system person records.";
  renderBars("conn-bars-container",connection,"connection"); updateDonut(["donut-conn-crowd","donut-conn-core","donut-conn-new","donut-conn-leader"],connection,"connection");
  renderBars("age-bars-container",ages,"age",(name)=>ageLabel(name));updateDonut(["donut-age-1","donut-age-2","donut-age-3","donut-age-4","donut-age-5","donut-age-6"],ages,"age",(name)=>ageLabel(name));
  renderBars("gender-bars-container",genders,"gender");updateDonut(["donut-gen-women","donut-gen-men","donut-gen-unk"],genders,"gender");
  renderBars("camp-bars-container",campusItems,"campus");updateDonut(["donut-camp-mnl","donut-camp-bne","donut-camp-sel","donut-camp-unassigned"],campusItems,"campus");if(byId("donut-camp-total"))byId("donut-camp-total").textContent=available?format(campusTotal):"—";
  if(byId("conn-foot-summary"))byId("conn-foot-summary").textContent=available?`${coreCrowdShare(connection).toFixed(1)}% in Core or Crowd · Target: 15-35-35-15`:"Unavailable";
  const young=youngAdultShare(ages);const unknown=unknownAgeShare(ages);if(byId("age-foot-summary"))byId("age-foot-summary").textContent=available?`${young.toFixed(1)}% Young Adults (18–25)`:"Unavailable";if(byId("age-foot-unknown"))byId("age-foot-unknown").textContent=available?`${unknown.toFixed(1)}% unrecorded age`:"Unavailable";
  const women=genders.find((item)=>item.name==="Women")?.pct||0,men=genders.find((item)=>item.name==="Men")?.pct||0;if(byId("gender-foot-summary"))byId("gender-foot-summary").textContent=available?`${women.toFixed(1)}% Women · ${men.toFixed(1)}% Men`:"Unavailable";if(byId("camp-foot-summary"))byId("camp-foot-summary").textContent=available?`${activeCampusCount(campusItems)} active campuses`:"Unavailable";if(byId("camp-foot-scope"))byId("camp-foot-scope").textContent=CAMPUS_LABELS[currentCampus];
  renderSidebarAges(model.sidebarLocalRows,model.sidebarGlobalRows,sum(model.sidebarLocalRows,"uniquePeople")||0);
  const campusAllRows=model.allDemographics.filter((row)=>campusMatches(row));const allTotal=sum(campusAllRows,"uniquePeople")||0;const allGender=aggregate(campusAllRows,"gender");const womenCount=allGender.get("Women")||0,menCount=allGender.get("Men")||0;if(byId("btn-gen-all-tag"))byId("btn-gen-all-tag").textContent=allTotal?format(allTotal):"—";if(byId("btn-gen-women-tag"))byId("btn-gen-women-tag").textContent=allTotal?`${percent(womenCount,allTotal).toFixed(1)}%`:"—";if(byId("btn-gen-men-tag"))byId("btn-gen-men-tag").textContent=allTotal?`${percent(menCount,allTotal).toFixed(1)}%`:"—";fill("btn-gen-women-fill",percent(womenCount,allTotal));fill("btn-gen-men-fill",percent(menCount,allTotal));
  const directoryCta=byId("pulse-coverage-cta");if(directoryCta){const params=new URLSearchParams({connection:"Leader"});if(currentCampus!=="ALL")params.set("campus",currentCampus);directoryCta.href=`/people/directory?${params}`;}
}

/* The three computed insights the Creative card feet already carry, named once so the Classic
 * widget notes say exactly what the Creative footers say. */
function coreCrowdShare(connection) { return connection.filter((item)=>item.name==="Core"||item.name==="Crowd").reduce((value,item)=>value+item.pct,0); }
function youngAdultShare(ages) { return ages.find((item)=>item.name==="youngAdults")?.pct||0; }
function unknownAgeShare(ages) { return ages.find((item)=>item.name==="unknown")?.pct||0; }
function activeCampusCount(campusItems) { return campusItems.filter((item)=>!item.unknown&&item.count>0).length; }

function renderSidebarAges(rows,globalRows,total){const local=aggregate(rows,"ageBand"),global=aggregate(globalRows,"ageBand"),globalTotal=sum(globalRows,"uniquePeople")||0;const tbody=byId("sidebar-age-tbody");if(!tbody)return;tbody.innerHTML=AGES.map((age)=>{const share=percent(local.get(age)||0,total),baseline=percent(global.get(age)||0,globalTotal),ratio=share!==null&&baseline?share/baseline:null;return `<tr data-age="${age}" class="${selectedAges.has(age)?'is-selected':''}" aria-pressed="${selectedAges.has(age)}"><td><span class="swatch-dot" style="background:${AGE_COLORS[age]}"></span>${ageLabel(age)}</td><td>${share===null?'—':share.toFixed(1)+'%'}</td><td><span class="ratio-idx ${ratio!==null&&ratio>=1?'over':'under'}">${ratio===null?'—':ratio.toFixed(2)+'×'}</span></td></tr>`}).join('');tbody.querySelectorAll('tr').forEach((row)=>row.addEventListener('click',()=>{const age=row.dataset.age;if(selectedAges.has(age))selectedAges.delete(age);else selectedAges.add(age);writeUrl();renderAll()}));}

/* ------------------------------------------------------------------ Classic mode (#217) --
 *
 * Classic is a second renderer over the SAME filtered slice, not a second dashboard. Every
 * number below comes from pulseModel() and atlasModel() -- the functions the Creative chapters
 * render from -- so the two compositions cannot disagree and no second filter model exists.
 * Nothing here registers a query or derives a series the reads do not return.
 *
 * The Creative chapters are hidden in Classic rather than destroyed (.creative-only), so
 * switching back is instant and identical, and the filter console's own facets stay live in
 * both modes because renderAtlas() keeps running.
 */

const SURFACE = { id: "favor-exec-landing", title: "Executive Overview", route: "exec" };
// The exec runtime is inlined into the server-rendered block rather than served as versioned
// assets, so the block has no assetVersion to read. Its template identity is stated here and
// travels with every artifact and prompt; bump it when the composition changes.
const TEMPLATE_VERSION = "favor-exec-landing/block-2026-09-06.1";

// One title per exportable widget. The Classic widget head, the Creative rail, the view
// section, and the export file name all read this map, so a rename cannot half-land.
const WIDGETS = {
  "exec-pulse": "Church pulse",
  "exec-base": "Counted church base",
  "exec-people": "Favor, by people",
  "exec-links": "Go deeper",
  "exec-conn": "Connection status",
  "exec-age": "Age distribution",
  "exec-gender": "Gender profile",
  "exec-campus": "Campus share",
};

const PULSE_INFO = "6 vital signs, read from the campus, age, and gender slice showing now, the same rows the Creative chapter paints. The registered pulse query returns one aggregate row per campus, age band and gender and carries no dated rows, so these tiles have no sparkline and no trend column: an honest trend needs a new registered query, and this phase doesn't add one. Leader coverage is the only reading with an approved target (derived from the 15% Leader target in Connection status -> 1 : 6.7); the rest are observations. Giving pacing has no approved query at all and stays unavailable.";
const BASE_INFO = "Active, living, non-system person records. The counted base honours campus, age, and gender. The church-wide base honours age and gender only; it's the denominator the campus row-group of the pivot below uses, which is why the two numbers differ whenever a campus is selected.";
const PEOPLE_INFO = "One pivot over the same active base the Creative atlas draws. Connection status carries an approved target distribution of 15% Leader, 35% Core, 35% Crowd, and 15% New (15-35-35-15, which derives the 1 : 6.7 people-per-leader target). Connection status, age band and gender are counted inside the current slice and share the counted-base denominator. The campus row-group ignores the campus filter, exactly as the Creative Campus Share card does. A campus split of the campus you already picked would be one row at 100%, so it sums to the church-wide base instead of the slice total. A person is counted once in every row-group. Unknown is retained as its own row and never folded into a total.";
const LINKS_INFO = "The destinations the Go Deeper chapter lists, read from the page itself rather than kept in a second list here. Planned destinations are surfaces that do not exist yet: they carry no route, so the address cell reads unavailable rather than pointing somewhere broken.";
const PEOPLE_CAPTION = "Unique active people in the current slice. Connection status, age band and gender are counted inside the slice; the campus row-group ignores the campus filter and sums to the church-wide base at the current age and gender slice.";
const LINKS_CAPTION = "Destinations listed in the Go Deeper chapter of this dashboard. Planned destinations have no route yet.";

/* ---------------------------------------------------------------- view sections (#214 §7a) */

const KPI_TABLE_COLUMNS = [
  { key: "reading", label: "Reading" },
  { key: "value", label: "Value" },
  { key: "unit", label: "Unit" },
  { key: "state", label: "State" },
  { key: "meaning", label: "What it means" },
];

/* A quiet KPI strip is not a table, so its export is derived: one row per tile, carrying the
 * same formatted value the tile shows plus the state and the (i) copy behind it. */
function kpiTable(section) {
  return {
    id: section.id,
    title: section.title,
    columns: KPI_TABLE_COLUMNS,
    rows: (section.kpis || []).map((kpi) => ({
      reading: kpi.label,
      value: formatCell(kpi.value, kpi.kind || "text"),
      unit: kpi.unit || null,
      state: kpi.state || "neutral",
      meaning: kpi.note || null,
    })),
  };
}

function pulseKpis(model) {
  return [
    {
      label: "People per leader",
      value: model.ratio === null ? null : `1 : ${model.ratio.toFixed(1)}`,
      unit: "active people per leader",
      delta: model.available && model.ratio !== null ? "Target 1 : 6.7" : "",
      state: model.coverageState,
      note: "Active people divided by people in the Leader connection status cohort. Target 1 : 6.7 is derived from the 15% Leader target in Connection Status.",
    },
    {
      label: "28-day attendance reach",
      value: model.attendance,
      kind: "number",
      unit: "people",
      delta: model.attendanceShare === null ? "" : `${model.attendanceShare.toFixed(1)}% of the people in scope`,
      state: "neutral",
      note: "Distinct active people in scope with any attendance record in the last 28 days. This isn't Sunday service headcount; Sunday Report holds service totals. No approved target exists for this reading, so the tile carries no state.",
    },
    {
      label: "Connect belonging",
      value: model.belongingShare,
      kind: "percent",
      unit: "of the people in scope",
      delta: model.connect !== null ? `${format(model.connect)} active in Connect` : "",
      state: "neutral",
      note: "Distinct active people in an active Connect group, divided by active people in the selected scope. Current membership, not recent attendance. No approved target exists for this reading, so the tile carries no target state.",
    },
    {
      label: "Active ministry team members",
      value: model.serving,
      kind: "number",
      unit: "people",
      delta: model.servingShare === null ? "" : `${model.servingShare.toFixed(1)}% of the people in scope`,
      state: "neutral",
      note: "Distinct active people who are active, non-archived members of active Ministry Team groups. This is membership, not recent rosters, accepted assignments, or confirmed serving.",
    },
    {
      label: "Giving pacing",
      value: null,
      unit: null,
      delta: "",
      state: "unknown",
      note: "Reserved for an approved giving metric contract. No production query is registered for giving on this surface, so this reading stays unavailable rather than showing an estimate. The dash isn't a zero.",
    },
    {
      label: "Completed connection requests",
      value: model.milestones,
      kind: "number",
      unit: "requests",
      delta: model.available ? "Last 30 days" : "",
      state: "neutral",
      note: "Completed ConnectionRequest records modified in the last 30 days. One person can contribute more than one request, and this isn't yet restricted to named People Pathway milestones.",
    },
  ];
}

function pulseNote(model) {
  if (!model.available) return "";
  const parts = [];
  if (model.ratio !== null) parts.push(`One leader for every ${model.ratio.toFixed(1)} active people (Target 1 : 6.7)`);
  if (model.belongingShare !== null) {
    const countStr = model.connect !== null ? ` (${format(model.connect)} people)` : "";
    parts.push(`${model.belongingShare.toFixed(1)}% belong to a Connect group${countStr}`);
  }
  if (!parts.length) return "";
  return `${parts.join(" · ")}. Coverage is the only vital sign reading here with an approved target; the rest are observations.`;
}

function pulseSection(model) {
  const section = {
    id: "exec-pulse",
    heading: WIDGETS["exec-pulse"],
    title: WIDGETS["exec-pulse"],
    kind: "kpi",
    kpis: pulseKpis(model),
    note: pulseNote(model),
  };
  if (!model.available) section.unavailable = "The pulse aggregate didn't come back for this slice, so all 6 readings are unavailable, not zero.";
  return section;
}

function baseKpis(model) {
  const campusShare = model.campusTotal > 0 ? (model.total * 100) / model.campusTotal : null;
  return [
    {
      label: "Counted church base",
      value: model.available ? model.total : null,
      kind: "number",
      unit: "people",
      delta: model.available && campusShare !== null ? `${campusShare.toFixed(1)}% of the church-wide base` : "",
      state: "neutral",
      note: "Active, living, non-system person records inside the campus, age, and gender slice showing now.",
    },
    {
      label: "Church-wide base",
      value: model.available ? model.campusTotal : null,
      kind: "number",
      unit: "people",
      delta: model.available ? "Campus filter not applied" : "",
      state: "neutral",
      note: "The same age and gender slice across every campus. The campus row-group of the pivot is a share of this number, not of the counted base.",
    },
    {
      label: "Active campuses",
      value: model.available ? activeCampusCount(model.campuses) : null,
      kind: "number",
      unit: "campuses",
      delta: "",
      state: "neutral",
      note: "Campuses holding at least one person in the church-wide base at this age and gender slice. Unassigned records stay explicit and are never counted as a campus.",
    },
  ];
}

function baseSection(model) {
  const section = {
    id: "exec-base",
    heading: WIDGETS["exec-base"],
    title: WIDGETS["exec-base"],
    kind: "kpi",
    kpis: baseKpis(model),
    note: model.available && currentCampus !== "ALL" && model.campusTotal > 0
      ? `${CAMPUS_LABELS[currentCampus]} holds ${((model.total * 100) / model.campusTotal).toFixed(1)}% of the church-wide base at this age and gender slice.`
      : "",
  };
  if (!model.available) section.unavailable = "The demographic aggregate didn't come back, so the base is unavailable, not zero.";
  return section;
}

/* Campus columns are the campuses actually present in the slice: one column when a campus is
 * selected, every campus that appears when ALL is. An empty slice simply has no campus column. */
function campusCodesInSlice(rows) {
  const present = new Set(rows.map((row) => String(row.campusShortCode ?? "UNASSIGNED")));
  const ordered = CAMPUS_ORDER.filter((code) => present.has(code));
  for (const code of [...present].sort()) if (!ordered.includes(code)) ordered.push(code);
  return ordered;
}

/* aggregate() collapses one dimension; this collapses two, so a pivot cell is a real
 * dimension-by-campus count rather than a share of a share. */
function crossTab(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const count = number(row.uniquePeople);
    if (count === null) continue;
    const key = String(row[field] ?? "Unknown");
    const code = String(row.campusShortCode ?? "UNASSIGNED");
    if (!map.has(key)) map.set(key, new Map());
    const inner = map.get(key);
    inner.set(code, (inner.get(code) || 0) + count);
  }
  return map;
}

function pivotGroupRows(groupLabel, items, cross, codes, labelOf) {
  return items.map((item) => {
    const row = {
      group: groupLabel,
      dimension: labelOf ? labelOf(item.name) : item.name,
      total: item.count,
      share: item.pct,
    };
    const inner = cross.get(item.name) || null;
    for (const code of codes) row[`campus_${code}`] = inner ? (inner.get(code) || 0) : 0;
    return row;
  });
}

function peopleSection(model) {
  const codes = campusCodesInSlice(model.rows);
  const columns = [
    { key: "group", label: "Row group" },
    { key: "dimension", label: "Dimension" },
    ...codes.map((code) => ({ key: `campus_${code}`, label: CAMPUS_COLUMN_LABELS[code] || code, kind: "number" })),
    { key: "total", label: "Total", kind: "number" },
    { key: "share", label: "Share", kind: "percent" },
  ];
  const groups = [
    { label: "Connection status", rows: pivotGroupRows("Connection status", model.connection, crossTab(model.rows, "connectionStatus"), codes) },
    { label: "Age band", rows: pivotGroupRows("Age band", model.ages, crossTab(model.rows, "ageBand"), codes, (name) => ageLabel(name)) },
    { label: "Gender", rows: pivotGroupRows("Gender", model.genders, crossTab(model.rows, "gender"), codes) },
    {
      label: "Campus share",
      // The campus row-group is the campus-filter-free reading, so a campus cell is only
      // filled on its own campus. A zero off the diagonal is a true zero, not a refusal.
      rows: model.campuses.map((item) => {
        const row = { group: "Campus share", dimension: item.name, total: item.count, share: item.pct };
        for (const code of codes) row[`campus_${code}`] = code === item.code ? item.count : 0;
        return row;
      }),
    },
  ];
  const sliceByCampus = aggregate(model.rows, "campusShortCode");
  const totalRow = {
    group: "Total",
    dimension: "All people in this slice",
    total: model.available ? model.total : null,
    share: model.available && model.total > 0 ? 100 : null,
  };
  for (const code of codes) totalRow[`campus_${code}`] = model.available ? (sliceByCampus.get(code) || 0) : null;

  const section = {
    id: "exec-people",
    heading: WIDGETS["exec-people"],
    title: WIDGETS["exec-people"],
    kind: "pivot",
    columns,
    rows: [...groups.flatMap((group) => group.rows), totalRow],
    groups,
    totalRow,
    note: model.available
      ? `${coreCrowdShare(model.connection).toFixed(1)}% in Core or Crowd · Target: 15% Leader · 35% Core · 35% Crowd · 15% New · ${youngAdultShare(model.ages).toFixed(1)}% Young Adults (18–25) · ${unknownAgeShare(model.ages).toFixed(1)}% with no recorded age.`
      : "",
  };
  if (!model.available) section.unavailable = "The demographic aggregate didn't come back for this slice, so no composition can be shown. This isn't an empty church.";
  return section;
}

/* The router cards are the source of truth for where a reader can go next, so the Classic
 * table reads them from the page instead of keeping a second list that would drift. */
function linksSection() {
  const rows = [];
  const grid = document.querySelector("#exec-overview-island .dir-grid");
  const cards = grid ? grid.querySelectorAll(".dir-card") : [];
  for (const card of cards) {
    const heading = card.querySelector("h3");
    const blurb = card.querySelector("p");
    const status = card.querySelector(".dir-status");
    const href = card.getAttribute("href");
    rows.push({
      destination: heading ? heading.textContent.trim() : null,
      answers: blurb ? blurb.textContent.trim() : null,
      status: status ? status.textContent.trim() : "Planned",
      route: href || null,
    });
  }
  const live = rows.filter((row) => String(row.status).toLowerCase() === "live").length;
  return {
    id: "exec-links",
    heading: WIDGETS["exec-links"],
    title: WIDGETS["exec-links"],
    kind: "links",
    columns: [
      { key: "destination", label: "Destination" },
      { key: "answers", label: "What it answers" },
      { key: "status", label: "Status" },
      { key: "route", label: "Route" },
    ],
    rows,
    note: rows.length ? `${live} of ${rows.length} destinations are live; the rest are planned and carry no route yet.` : "",
  };
}

/* Every widget in the §7a inventory, as one list, rebuilt from live state on every call --
 * which is what makes an export read what the reader is looking at (D7). */
function buildSections() {
  const pulse = pulseModel();
  const atlas = atlasModel();
  return [pulseSection(pulse), baseSection(atlas), peopleSection(atlas), linksSection()];
}

function connTable(items) {
  return {
    id: "exec-conn",
    title: WIDGETS["exec-conn"],
    columns: [
      { key: "dimension", label: "Connection status" },
      { key: "people", label: "People", kind: "number" },
      { key: "share", label: "Share", kind: "percent" },
      { key: "target", label: "Target", kind: "percent" },
      { key: "state", label: "Status" },
    ],
    rows: items.map((item) => {
      const semantic = connectionSemantic(item.name, item.pct);
      return {
        dimension: item.name,
        people: item.count,
        share: item.pct,
        target: CONNECTION_TARGETS[item.name] ?? null,
        state: semantic ? semantic.label : (item.unknown ? "Unknown" : "Neutral"),
      };
    }),
    note: "Target distribution: 15% Leader · 35% Core · 35% Crowd · 15% New (15-35-35-15). Semantics: Green (Healthy / on target), Yellow (Watch), Red (Attention). People per leader target (1 : 6.7) is derived from the 15% Leader target.",
  };
}

function itemTable(id, dimensionLabel, items, labelOf) {
  return {
    id,
    title: WIDGETS[id] || id,
    columns: [
      { key: "dimension", label: dimensionLabel },
      { key: "people", label: "People", kind: "number" },
      { key: "share", label: "Share", kind: "percent" },
    ],
    rows: items.map((item) => ({
      dimension: labelOf ? labelOf(item.name) : item.name,
      people: item.count,
      share: item.pct,
    })),
  };
}

function packageSummaryTable() {
  const sections = buildSections();
  const people = sections.find((section) => section.id === "exec-people");
  const pulse = sections.find((section) => section.id === "exec-pulse");
  return {
    id: "package",
    title: "Executive Overview package",
    columns: [
      { key: "measure", label: "Measure" },
      { key: "count", label: "Count", kind: "number" },
    ],
    rows: [
      { measure: "Sections in this package", count: sections.length },
      { measure: "Readings in the pulse strip", count: (pulse && pulse.kpis ? pulse.kpis.length : 0) },
      { measure: "Rows in the people pivot", count: (people && people.rows ? people.rows.length : 0) },
      { measure: "Widgets carrying an export rail", count: exportRegistry.ids().filter((id) => id !== SURFACE.id).length },
    ],
  };
}

/* One accessor behind every rail button. It recomputes rather than closing over a snapshot,
 * so a click after three filter changes exports the third view, not the first (D7). */
function exportTable(id) {
  if (id === SURFACE.id) return packageSummaryTable();
  if (id === "exec-conn" || id === "exec-age" || id === "exec-gender" || id === "exec-campus") {
    const model = atlasModel();
    if (id === "exec-conn") return connTable(model.connection);
    if (id === "exec-age") return itemTable(id, "Age band", model.ages, (name) => ageLabel(name));
    if (id === "exec-gender") return itemTable(id, "Gender", model.genders);
    return itemTable(id, "Campus", model.campuses);
  }
  const section = buildSections().find((candidate) => candidate.id === id);
  if (!section) return null;
  return section.kind === "kpi" ? kpiTable(section) : section;
}

/* ---------------------------------------------------------------- the control grammar (#220) */

/* Generated from the console that is actually on the page, never hand-written: the selectors
 * below are queried here, so a control that moved or was renamed cannot survive as a line in
 * an agent's prompt. Cached only once the age rows exist, because they render with the atlas. */
let controlGrammarCache = null;
function controlGrammar() {
  const attributesOf = (selector, attribute) =>
    [...document.querySelectorAll(selector)].map((node) => node.getAttribute(attribute)).filter(Boolean);
  const modeSelector = "#exec-overview-island .mode-switch__btn[data-mode]";
  const campusSelector = "#exec-overview-island [data-filter=\"campus\"]";
  const genderSelector = "#exec-overview-island [data-filter=\"gender\"]";
  const ageSelector = "#exec-overview-island #sidebar-age-tbody tr[data-age]";
  const ages = attributesOf(ageSelector, "data-age");
  const grammar = [
    {
      id: "mode",
      kind: "segmented",
      label: "Display mode",
      selector: modeSelector,
      values: attributesOf(modeSelector, "data-mode"),
      effect: "Switches the whole surface between the Creative reading and the Classic table reading; both render the same filtered slice, so a selection survives the switch.",
    },
    {
      id: "campus",
      kind: "button-group",
      label: "Campus",
      selector: campusSelector,
      values: attributesOf(campusSelector, "data-val"),
      effect: "Scopes every reading to one campus, or to all campuses; exactly one value is active at a time.",
    },
    {
      id: "gender",
      kind: "button-group",
      label: "Gender",
      selector: genderSelector,
      values: attributesOf(genderSelector, "data-val"),
      effect: "Adds or removes a gender from the slice. Women and Men can both be selected; all clears the axis and counts Unknown as well.",
    },
    {
      id: "age",
      kind: "table-rows",
      label: "Age band",
      selector: ageSelector,
      values: ages,
      effect: "Clicking a row adds or removes that age band. Selecting none means every band, Unknown included.",
    },
    {
      id: "reset",
      kind: "button-group",
      label: "Reset all filters",
      selector: "#exec-overview-island #btn-reset-filters",
      values: ["reset"],
      effect: "Returns the surface to Manila, all ages and all people. It doesn't change the display mode.",
    },
    {
      id: "sidebar",
      kind: "toggle",
      label: "Filter console",
      selector: "#exec-overview-island #btn-toggle-sidebar",
      effect: "Hides or shows the filter console itself. Hiding it keeps every active filter; it only reclaims the width.",
    },
  ];
  if (ages.length) controlGrammarCache = grammar;
  return controlGrammarCache || grammar;
}

/* ---------------------------------------------------------------- the view (#214 §10, #221) */

function buildView() {
  return {
    surface: SURFACE,
    mode: currentMode,
    /* The palette the reader is actually looking at, so a rebuilt report matches the view it
     * came from (#248). Read off the root rather than off the control, because the root is
     * the switch: the attribute is the state, and it is right even before the swatch mounts. */
    theme: byId("exec-overview-island")?.dataset.theme || null,
    url: location.href,
    filters: {
      campus: currentCampus.toLowerCase(),
      age: [...selectedAges],
      gender: [...selectedGenders],
      mode: currentMode,
    },
    filterSummary: filterSummary(),
    templateVersion: TEMPLATE_VERSION,
    // The one permitted Date use: artifact time, at artifact time. No reading on this page is
    // derived from the clock.
    generatedAt: new Date().toISOString(),
    fictional: payload.fictional,
    sections: buildSections(),
    controls: controlGrammar(),
  };
}

/* ---------------------------------------------------------------- rails, prompt, package */

const exportRegistry = createExportRegistry();

/* The UX bar (#587): every announce() is said twice, once to the live region for assistive
 * tech and once as the status chip for everyone else. status is mounted lazily because the
 * island root is not on the page until the shell has rendered. */
let status = null;
function statusChip() {
  if (!status) status = mountStatus(byId("exec-overview-island"), { live: byId("exec-overview-live") });
  return status;
}
function announce(message) {
  statusChip().announce(message);
}
/* A filter change is explained by the stations it changed, not by a toast on every click:
 * the affected chapters (or Classic widgets) settle once, and the live region says what the
 * view now shows. First render is not a change and gets neither. */
let lastFilterKey = null;
function filterKey() {
  return [currentCampus, [...selectedGenders].sort().join("+"), [...selectedAges].sort().join("+")].join("|");
}
function describeFilters() {
  const campusBtn = document.querySelector(`[data-filter="campus"][data-val="${currentCampus.toLowerCase()}"], [data-filter="campus"][data-val="${currentCampus}"]`);
  const campus = campusBtn ? campusBtn.textContent.trim() : currentCampus;
  const genders = selectedGenders.size ? [...selectedGenders].join(" and ") : "all genders";
  const ages = selectedAges.size ? `${selectedAges.size} age band${selectedAges.size === 1 ? "" : "s"}` : "all ages";
  return `Showing ${campus}, ${genders}, ${ages}.`;
}
function noteFilterChange() {
  const key = filterKey();
  if (lastFilterKey === null) { lastFilterKey = key; return; }
  if (key === lastFilterKey) return;
  lastFilterKey = key;
  statusChip().quiet(describeFilters());
  const island = byId("exec-overview-island");
  if (!island) return;
  const targets = currentMode === "classic"
    ? island.querySelectorAll(".classic-grid .cw, .classic-grid .kpi-strip")
    : island.querySelectorAll(".pulse-card, .chapter.creative-only");
  markChanged(targets);
}

/* No widget on this surface passes a png() accessor, and that is the honest outcome rather
 * than an omission: Classic here is all tables (plan §15 -- a DOM table has no faithful
 * image), and the Creative donuts cannot round-trip either, because the shared serializer
 * rewrites the style attribute it clones and carries neither stroke-dashoffset nor the
 * CSS rotation the arcs are drawn with. Every rail therefore renders the disabled PNG
 * control with a title that says why. */
function mountRail(host, id) {
  if (!host) return;
  mountExportRail(host, { registry: exportRegistry, id, title: WIDGETS[id] || id, table: () => exportTable(id) });
}

function drawnIcon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({
    class: "xrail__icon", viewBox: "0 0 16 16", width: "14", height: "14", fill: "none",
    stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round",
    "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
  })) svg.setAttribute(name, value);
  for (const definition of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", definition);
    svg.append(path);
  }
  return svg;
}

const MOBILE = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 768px)") : null;

let themeSwatch = null;
let currentPaletteHost = null;

function resolvePaletteHost() {
  const root = byId("exec-overview-island");
  if (!MOBILE || !MOBILE.matches) return root;
  const sidebar = byId("filter-sidebar");
  if (!sidebar) return root;
  const form = byId("filter-form") || sidebar;
  let slot = sidebar.querySelector(".palette-slot");
  if (!slot) {
    slot = document.createElement("fieldset");
    slot.className = "filter-fieldset palette-slot";
    const legend = document.createElement("legend");
    legend.className = "filter-legend";
    const title = document.createElement("span");
    title.textContent = "Palette";
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "how the board looks";
    legend.appendChild(title);
    legend.appendChild(sub);
    slot.appendChild(legend);
    form.appendChild(slot);
  }
  return slot;
}

function mountPalette() {
  const root = byId("exec-overview-island");
  if (!root) return;
  const host = resolvePaletteHost();
  if (currentPaletteHost === host) return;
  if (themeSwatch?.element) themeSwatch.element.remove();
  const slot = root.querySelector(".palette-slot");
  if (slot && host !== slot) slot.remove();
  currentPaletteHost = host;
  themeSwatch = mountThemeSwatch(host, {
    root,
    surface: SURFACE.id,
    onChange: (theme) => announce(theme ? `${themeName(theme)} palette.` : "Default palette."),
  });
  mountPen(root, host);
}

/* Executive Markup (#598): the pen sits beside the palette and travels with it between the
 * desktop rail and the mobile console. The module is lazy; nothing loads until it is pressed. */
let markup = null;
function mountPen(root, host) {
  if (markup) { markup.remount(host); return; }
  markup = mountMarkup(root, {
    surface: { id: "exec-overview", title: SURFACE.title },
    host,
    frame: root,
    context: () => ({ mode: root.dataset.mode || null, theme: root.dataset.theme || null, filterSummary: null, url: window.location.href, title: document.title }),
    announce,
  });
}

let paletteListenerBound = false;
function bindPaletteBreakpoint() {
  if (paletteListenerBound || !MOBILE) return;
  paletteListenerBound = true;
  MOBILE.addEventListener("change", mountPalette);
}

function mountSurfaceTools() {
  const root = byId("exec-overview-island");
  if (!root) return;

  // Creative rails: the same control group, in the same corner, on every chapter and card head.
  mountRail(byId("pulse-rail"), "exec-pulse");
  mountRail(byId("atlas-rail"), "exec-base");
  mountRail(byId("conn-rail"), "exec-conn");
  mountRail(byId("age-rail"), "exec-age");
  mountRail(byId("gender-rail"), "exec-gender");
  mountRail(byId("camp-rail"), "exec-campus");

  /* align: "end" -- both controls now sit at the end edge of the masthead, so their popovers
   * and tips anchor to that edge instead of running off the other side of the page. */
  const promptHost = byId("exec-copy-prompt");
  if (promptHost) mountCopyPrompt(promptHost, { view: buildView, announce, align: "end" });

  exportRegistry.register(SURFACE.id, { title: SURFACE.title, table: () => packageSummaryTable() });
  const packageHost = byId("exec-package-rail");
  if (packageHost) mountPackageControl(packageHost, { surfaceId: SURFACE.id, align: "end" });

  /* The palette control sits sticky bottom-left on desktop (> 768px). On mobile (<= 768px),
   * per ADR 0020 and docs/guides/mobile-bottom-edge.md, it moves inside the filter console
   * as its last row. The host follows the breakpoint, preserving the user's chosen palette.
   * No transport is passed -- see dashboard-theme.mjs for why the Rock write stays unwired
   * until #267 settles a transport that doesn't cross the islands-never-fetch contract. */
  mountPalette();
  bindPaletteBreakpoint();

  // One delegated listener on the island root outlives every re-render of every rail.
  bindExportDelegation(root, exportRegistry, {
    view: buildView,
    announce,
    package: () => buildDashboardPackage(buildView()),
  });
  bindInfoDismissal(root);

  // The exec boot is inlined into one classic script and exports nothing, so a fixture render
  // publishes the view builder on the island element for the dev workbench and the #222 field
  // tests. A production payload never carries `fictional`, so production publishes no seam.
  if (payload.fictional) root.dashboardView = buildView;
}

/* ---------------------------------------------------------------- the Classic composition */

function renderClassic() {
  const grid = byId("exec-classic-grid");
  if (!grid) return;
  if (currentMode !== "classic") { grid.replaceChildren(); return; }

  const pulse = pulseSection(pulseModel());
  const atlas = atlasModel();
  const base = baseSection(atlas);
  const people = peopleSection(atlas);
  const links = linksSection();
  const nodes = [];

  const pulseWidget = classicWidget({ id: "cw-exec-pulse", title: WIDGETS["exec-pulse"], question: "What needs attention now?", info: PULSE_INFO });
  if (pulse.unavailable) pulseWidget.body.append(unavailablePanel(pulse.unavailable));
  pulseWidget.body.append(kpiStrip(pulse.kpis, { label: "Church pulse readings" }));
  pulseWidget.setNote(pulse.note);
  mountRail(pulseWidget.railHost, "exec-pulse");
  nodes.push(pulseWidget.root);

  const baseWidget = classicWidget({ id: "cw-exec-base", title: WIDGETS["exec-base"], question: "How many people, total?", info: BASE_INFO });
  if (base.unavailable) baseWidget.body.append(unavailablePanel(base.unavailable));
  baseWidget.body.append(kpiStrip(base.kpis, { label: "Base readings" }));
  baseWidget.setNote(base.note);
  mountRail(baseWidget.railHost, "exec-base");
  nodes.push(baseWidget.root);

  const peopleWidget = classicWidget({ id: "cw-exec-people", title: WIDGETS["exec-people"], question: "How is the base composed, per campus?", info: PEOPLE_INFO });
  if (people.unavailable) {
    peopleWidget.body.append(unavailablePanel(people.unavailable));
  } else {
    peopleWidget.body.append(pivotTable(people, {
      rowGroups: people.groups,
      groupKey: "group",
      inlineBarKey: "total",
      caption: PEOPLE_CAPTION,
      totalRow: people.totalRow,
    }));
  }
  peopleWidget.setNote(people.note);
  mountRail(peopleWidget.railHost, "exec-people");
  nodes.push(peopleWidget.root);

  const linksWidget = classicWidget({ id: "cw-exec-links", title: WIDGETS["exec-links"], question: "Where do I go for the team view?", info: LINKS_INFO });
  linksWidget.body.append(dataTable(links, { caption: LINKS_CAPTION }));
  linksWidget.setNote(links.note);
  mountRail(linksWidget.railHost, "exec-links");
  nodes.push(linksWidget.root);

  grid.replaceChildren(...nodes);
}

function renderFilterTags(containerId, items, onRemove) {
  const container = byId(containerId);
  if (!container) return;
  if (!items.length) { container.innerHTML = ""; return; }
  container.innerHTML = items.map(({key, label}) => `<span class="filter-tag">${label}<button type="button" class="filter-tag__remove" data-key="${key}" aria-label="Remove ${label} filter">×</button></span>`).join("");
  container.querySelectorAll(".filter-tag__remove").forEach((btn) => btn.addEventListener("click", () => { onRemove(btn.dataset.key); writeUrl(); renderAll(); }));
}

function renderState(){
  const scope=byId("scope-label");if(scope)scope.textContent=CAMPUS_LABELS[currentCampus];
  const campusSub=byId("sidebar-campus-sub");if(campusSub)campusSub.textContent=CAMPUS_LABELS[currentCampus];
  const genderLabels=selectedGenderLabels(), ageLabels=selectedAgeLabels();
  const filter=byId("filter-summary-label");if(filter)filter.textContent=`${genderLabels.length?genderLabels.join(' + '):'All People'} · ${ageLabels.length?ageLabels.join(', '):'All Ages'}`;
  document.querySelectorAll('[data-filter="campus"]').forEach((button)=>{const selected=button.dataset.val.toUpperCase()===currentCampus;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-filter="gender"]').forEach((button)=>{const val=button.dataset.val;const selected=val==='all'?selectedGenders.size===0:selectedGenders.has(val);button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
  if(byId("sidebar-gender-sub"))byId("sidebar-gender-sub").textContent=genderLabels.length?genderLabels.join(' + '):'All People';
  renderFilterTags("age-filter-tags",[...selectedAges].map((age)=>({key:age,label:ageLabel(age)})),(key)=>selectedAges.delete(key));
  renderFilterTags("gender-filter-tags",[...selectedGenders].map((g)=>({key:g,label:g==='women'?'Women':'Men'})),(key)=>selectedGenders.delete(key));
  // Mode switch: aria-pressed and the island's data-mode attribute are derived from
  // currentMode on every render, not only inside the click handler, so a URL-driven
  // boot (mode=classic pasted into a fresh tab) starts in the right visual state too.
  // Exec's switch is static markup, not JS-built, so it keeps its first paint without a
  // module having run. It still hands the pressed bookkeeping to the shared helper (#237),
  // which is the half the three islands were each re-deriving.
  const island=byId("exec-overview-island");if(island)island.dataset.mode=currentMode;
  syncModeSwitch(island || document, currentMode);
  // A fixture render says so on the page, not only in the workbench chrome around it.
  const fixture=byId("fixture-label");if(fixture)fixture.textContent=payload.fictional?"Fictional prototype data":"Live Rock aggregate data";
}
/* One render pass, both compositions. The Creative chapters keep rendering in Classic because
 * the filter console reads from them -- the gender meters and the age table are written by
 * renderAtlas -- and because a hidden chapter that is already current makes switching back
 * instant. renderClassic() empties its grid in Creative rather than leaving a stale table
 * behind the curtain. */
function renderAll(){renderState();renderPulse();renderAtlas();renderClassic();noteFilterChange();}
function writeUrl(){
  const params=serializeFilters({
    campus:currentCampus.toLowerCase(),
    age:selectedAges,
    gender:selectedGenders,
    mode:currentMode==='classic'?'classic':'',
  },{into:new URLSearchParams()});
  const url=new URL(location.href);
  url.search=params.toString();
  history.replaceState({},'',url);
}

document.querySelectorAll('[data-filter="campus"]').forEach((button)=>button.addEventListener('click',()=>{currentCampus=button.dataset.val.toUpperCase();writeUrl();renderAll();}));
document.querySelectorAll('[data-filter="gender"]').forEach((button)=>button.addEventListener('click',()=>{const val=button.dataset.val;if(val==='all')selectedGenders.clear();else if(selectedGenders.has(val))selectedGenders.delete(val);else selectedGenders.add(val);writeUrl();renderAll();}));
byId("btn-reset-filters")?.addEventListener('click',()=>{currentCampus='MNL';selectedGenders.clear();selectedAges.clear();writeUrl();renderAll();});
document.querySelectorAll('.mode-switch__btn').forEach((button)=>button.addEventListener('click',()=>{
  const next=normalizeMode(button.dataset.mode);
  currentMode=next;
  const island=byId("exec-overview-island");
  /* The one authored moment (grammar §14). Its length is the --motion-state token, which
   * reduced motion zeroes, so the class comes off the same frame the CSS would have. */
  const beat=island?motionMs(island,'--motion-state',180):0;
  if(island&&beat>0){
    island.classList.add('is-mode-switching');
    window.setTimeout(()=>island.classList.remove('is-mode-switching'),beat);
  }
  writeUrl();
  renderAll();
}));
const updateBackdrop = () => {
  const layout = byId("app-layout");
  const backdrop = byId("filter-backdrop");
  if (backdrop && layout) {
    backdrop.classList.toggle("is-active", !layout.classList.contains("is-collapsed"));
  }
  const root = byId("exec-overview-island");
  if (root && layout) {
    root.dataset.console = layout.classList.contains("is-collapsed") ? "closed" : "open";
  }
};
updateBackdrop();
const closeFilters = () => {
  const layout = byId("app-layout");
  if (layout && !layout.classList.contains("is-collapsed")) {
    layout.classList.add("is-collapsed");
    byId("btn-toggle-sidebar")?.setAttribute("aria-expanded", "false");
    updateBackdrop();
  }
};
byId("btn-sidebar-back")?.addEventListener("click", closeFilters);
byId("filter-backdrop")?.addEventListener("click", closeFilters);
document.addEventListener("click", (e) => {
  // Opening the Rock hamburger menu or header collapse immediately hides the filter console
  if (e.target.closest && e.target.closest(".navbar-toggle, [data-toggle='collapse'], .navigation-trigger, .navbar-header")) {
    closeFilters();
    return;
  }
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
    const layout = byId("app-layout");
    if (layout && !layout.classList.contains("is-collapsed")) {
      const sidebar = byId("filter-sidebar");
      const toggleBtn = byId("btn-toggle-sidebar");
      if (sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
        closeFilters();
      }
    }
  }
});
byId("btn-toggle-sidebar")?.addEventListener('click',()=>{const layout=byId("app-layout");layout?.classList.toggle('is-collapsed');const collapsed=layout?.classList.contains('is-collapsed');byId("btn-toggle-sidebar").setAttribute('aria-expanded',String(!collapsed));updateBackdrop();});
if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
  const layout = byId("app-layout");
  layout?.classList.add("is-collapsed");
  byId("btn-toggle-sidebar")?.setAttribute("aria-expanded", "false");
  updateBackdrop();
}
/* Normalise the address bar to the state that was actually parsed, before anything
 * reads `location.href`. Without this a pasted URL carrying an unknown campus, a
 * stale key or a typo is quoted verbatim into every copy prompt and into the xlsx
 * Provenance sheet's Address row, while the Filter keys row beside it reports the
 * real state -- one artifact making two different claims about the same view. */
writeUrl();
renderAll();
mountSurfaceTools();
/* Mounted as the masthead's own first child, never nested inside .masthead__title: the
 * bar's full-bleed CSS centers against its containing block, and .masthead__title is an
 * asymmetric flex sibling of .masthead__aside, not centered on the viewport the way
 * .masthead itself is. Nesting it there clips and misaligns the bar. */
const execBreadcrumbHost = document.querySelector("#exec-overview-island .shell");
if (execBreadcrumbHost && !document.querySelector("#exec-overview-island .suite-breadcrumbs")) {
  mountBreadcrumbs(execBreadcrumbHost, { currentSurface: "exec-overview" });
  execBreadcrumbHost.insertBefore(execBreadcrumbHost.lastElementChild, execBreadcrumbHost.firstElementChild);
}
trackHostChrome(document.getElementById("exec-overview-island"));

/* Rock renders its own fixed chrome above the island, and the sticky filter sidebar sits
 * underneath it. Measuring the host's bar beats hard-coding a height that differs between
 * the workbench (no chrome) and production (an orange nav): without this the sidebar's head
 * is hidden behind the nav in production and looks perfect in the workbench, which is the
 * worst kind of difference to debug. The measurement is capped so a full-height fixed overlay
 * can never collapse the sidebar to nothing. */
(function hostChrome() {
  const island = document.getElementById("exec-overview-island");
  if (!island || typeof document.elementsFromPoint !== "function") return;

  function offset() {
    let lowest = 0;
    const probe = document.elementsFromPoint(Math.round(window.innerWidth / 2), 2) || [];
    for (const node of probe) {
      if (node === document.documentElement || node === document.body) continue;
      if (island === node || island.contains(node)) continue;
      const position = window.getComputedStyle(node).position;
      if (position !== "fixed" && position !== "sticky") continue;
      const rect = node.getBoundingClientRect();
      if (rect.top <= 2 && rect.bottom > lowest) lowest = rect.bottom;
    }
    return Math.min(lowest, Math.round(window.innerHeight * 0.35));
  }

  function apply() {
    island.style.setProperty("--console-top", `${Math.round(offset()) + 16}px`);
  }

  apply();
  // Rock's chrome can settle after first paint, so measure again once the page is quiet,
  // and whenever the viewport changes.
  window.setTimeout(apply, 400);
  window.addEventListener("resize", apply, { passive: true });
})();

/* Tooltips (#236, #252): the shared dashboard-tooltip.mjs delegate variant.
   Listeners are delegated from the island root because combo rows and donut segments
   re-render on every filter change, and per-node listeners would be lost with the nodes that
   carried them -- the same reason this was delegated before dashboard-tooltip.mjs existed. */
mountTooltipDelegate(document.getElementById("exec-overview-island") || document.body, {
  surface: "exec-overview",
  // Two trigger shapes share one bubble: `data-tip-*` is a data mark (combo rows, donut
  // segments) in the shared label/value/comparison/unit order; `data-tooltip` is the (i)
  // buttons' explanatory sentence, the same click-optional standing rule as Classic's
  // .info-disc, carried over unchanged rather than force-fit into the four-part vocabulary.
  selector: "[data-tip-label], [data-tooltip]",
  content: (trigger) => (trigger.dataset.tipLabel
    ? tooltipContent({
      label: trigger.dataset.tipLabel,
      value: trigger.dataset.tipValue || null,
      comparison: trigger.dataset.tipCompare || null,
      unit: trigger.dataset.tipUnit || null,
    })
    : trigger.getAttribute("data-tooltip")),
  tone: (trigger) => (trigger.closest(".hero-card") ? "hero" : "default"),
});
