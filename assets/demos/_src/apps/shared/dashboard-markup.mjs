/* Executive Markup V2 -- the host side (#598).
 *
 * The pen beside the palette, the LIVE / CANVAS / PAUSED state on the island root, and the
 * lazy loader for the drawing micro-app (apps/markup-app, built to markup-app.js). Nothing
 * heavy lives here: a viewer who never clicks the pen never parses Excalidraw. The app is
 * loaded as a same-origin <script type="module"> from the shared asset root the moment the
 * pen is pressed, and it announces itself on `window.FavorMarkup`.
 *
 * Contract §1 still holds for this module: it never fetches, stores, or logs. Snapshot
 * persistence is the app's, configured from the server-rendered index this module reads
 * (tools/markup_index.py emits it into every wrapper, type Guid included) and from
 * `data-markup-*` attributes on the island root. The dashboard's own DOM is only ever read (to freeze it) and never edited
 * beyond the pen and the `data-markup` state attribute.
 *
 * Replaces the V1 module of #257 (widget-anchored ink and semantic signals); the plan that
 * described it carries a SUPERSEDED banner. */

export const MARKUP_SCHEMA_VERSION = 2;
export const MARKUP_APP_VERSION = "2.1.5";
export const DEFAULT_ASSET_ROOT = new URL("../_markup/", location.href).href;
export const APP_ENTRY = "markup-app.js";
export const APP_STYLESHEET = "markup-app.css";
export const INDEX_SELECTOR = "[data-markup-snapshots]";
export const STATES = Object.freeze(["live", "freezing", "canvas", "paused", "saving", "viewing"]);
export const PEN_LABEL = "Mark up this dashboard";
export const PEN_OPEN_LABEL = "Markup is open";
export const LOAD_TIMEOUT_MS = 30000;
export const DARK_THEMES = Object.freeze(["favor-dark", "favor-indigo"]);

const PEN_PATH = "M4 20l4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20zM14 6.5l3.5 3.5";

/** [a-z0-9-] only; the key names files, so it must never carry a slash or a space. */
export function surfaceKey(value) {
  return String(value || "dashboard").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

export function assetUrl(assetRoot, name, version = MARKUP_APP_VERSION) {
  const root = String(assetRoot || DEFAULT_ASSET_ROOT).replace(/\/+$/, "");
  return `${root}/${name}?v=${encodeURIComponent(version)}`;
}

export function themeTone(theme) {
  return DARK_THEMES.includes(String(theme || "")) ? "dark" : "light";
}

export function prefersReducedMotion(win) {
  const w = win || (typeof window !== "undefined" ? window : null);
  if (!w || typeof w.matchMedia !== "function") return false;
  try { return !!w.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function decode(value) {
  if (typeof value !== "string") return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

/* The server-rendered index: one <script type="application/json" data-markup-snapshots> per
 * wrapper, filled by Rock's binaryfile entity command at page load. Empty text means the
 * BinaryFileType is not provisioned in this environment -- the pen still works, saving says so
 * honestly. (No Lava opener may appear anywhere in this file, comments included: Exec Overview
 * inlines it into a Lava-rendered block, and Rock would run it.) */
export function readIndex(root, surfaceId = null) {
  /* tools/markup_index.py inserts the index as the last element of the wrapper's
   * <div class="block-content">, a sibling of (not a descendant of) the island's own root
   * div -- every non-inlined wrapper closes its root before that trailing block. Querying
   * root's owner document (falling back to the global document) finds it either way.
   *
   * A page normally carries one index. When it carries more than one -- a shell page that
   * renders several islands -- taking the first one hands this island another surface's board
   * list, whose rows it then filters away to nothing: a gallery that is always empty after a
   * reload, with no error anywhere (#793). Ask for this surface's index by name first. */
  const doc = (root && root.ownerDocument) || (typeof document !== "undefined" ? document : null);
  let node = null;
  /* `surfaceKey` has already reduced the id to [a-z0-9-], so it needs no escaping here. */
  if (doc && /^[a-z0-9-]+$/.test(String(surfaceId || ""))) {
    node = doc.querySelector(`${INDEX_SELECTOR}[data-markup-surface="${surfaceId}"]`);
  }
  if (!node && doc) node = doc.querySelector(INDEX_SELECTOR);
  /* The BinaryFileType Guid arrives on the element (data-markup-type), so this module carries no
   * Guid literal of its own -- tools/markup_index.py is its one home. */
  const out = { provisioned: false, rows: [], viewer: null, surface: null, typeGuid: null };
  if (!node) return out;
  out.viewer = decode(node.getAttribute("data-markup-viewer")) || null;
  out.surface = node.getAttribute("data-markup-surface") || null;
  const custom = node.getAttribute("data-markup-type");
  if (custom) out.typeGuid = custom;
  const text = (node.textContent || "").trim();
  if (!text) return out;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) { out.rows = parsed; out.provisioned = true; }
  } catch { /* a malformed index is the same as no index: nothing to list, nothing provisioned */ }
  return out;
}

export function renderPenButton(doc, { label = PEN_LABEL } = {}) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "markup-pen";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("data-markup-omit", "");
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "markup-pen__icon");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PEN_PATH);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);

  const tooltip = doc.createElement("span");
  tooltip.className = "markup-pen__tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.id = "markup-pen-tip";
  button.setAttribute("aria-describedby", "markup-pen-tip");
  const text = doc.createElement("span");
  text.className = "markup-pen__label";
  text.textContent = "Markup";
  const desc = doc.createElement("span");
  desc.className = "markup-pen__desc";
  desc.textContent = "Draw & annotate over the dashboard";
  tooltip.append(text, desc);

  button.append(svg, tooltip);
  return button;
}

/* Load the micro-app once. The stylesheet and the module are same-origin static assets; the
 * module sets window.FavorMarkup and fires `favor-markup:ready`. The font path is handed to
 * Excalidraw before its code runs so it looks beside markup-app.js for its woff2 files. */
export function createLoader({ doc = document, win = window, assetRoot = DEFAULT_ASSET_ROOT, version = MARKUP_APP_VERSION, timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  let pending = null;
  const load = () => {
    if (win.FavorMarkup && typeof win.FavorMarkup.mount === "function") return Promise.resolve(win.FavorMarkup);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const root = new URL(String(assetRoot || DEFAULT_ASSET_ROOT).replace(/\/+$/, "") + "/", doc.baseURI).href.replace(/\/+$/, "");
      win.EXCALIDRAW_ASSET_PATH = `${root}/`;
      let settled = false;
      const finish = (fn, value) => { if (settled) return; settled = true; win.clearTimeout(timer); win.removeEventListener("favor-markup:ready", onReady); fn(value); };
      const onReady = () => { if (win.FavorMarkup) finish(resolve, win.FavorMarkup); };
      const timer = win.setTimeout(() => { pending = null; finish(reject, new Error("The markup tools took too long to load.")); }, timeoutMs);
      win.addEventListener("favor-markup:ready", onReady);
      if (!doc.querySelector(`link[data-markup-app="${APP_STYLESHEET}"]`)) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = assetUrl(root, APP_STYLESHEET, version);
        link.setAttribute("data-markup-app", APP_STYLESHEET);
        doc.head.append(link);
      }
      const script = doc.createElement("script");
      script.type = "module";
      script.src = assetUrl(root, APP_ENTRY, version);
      script.setAttribute("data-markup-app", APP_ENTRY);
      script.addEventListener("error", () => { pending = null; script.remove(); finish(reject, new Error("The markup tools could not be loaded.")); });
      script.addEventListener("load", () => { if (win.FavorMarkup) onReady(); });
      doc.head.append(script);
    });
    return pending;
  };
  return {
    load,
    preload() {
      if (win.FavorMarkup || pending) return;
      void load().catch(() => {});
    },
  };
}

/* Mount the pen and wire the session.
 *
 * `host` is where the pen lives (beside the theme swatch; an island may move it between the
 * desktop rail and the mobile console with `remount`). `frame` is the element to freeze --
 * the island root. `context()` returns the provenance stamped on a save: mode, theme, a filter
 * summary, the URL, the title. `announce(text)` mirrors the app's status words into the
 * island's own live region. */
export function mountMarkup(root, {
  surface,
  host = null,
  frame = null,
  context = null,
  announce = null,
  assetRoot = null,
  version = MARKUP_APP_VERSION,
  storageKind = null,
  doc = null,
  win = null,
  loader = null,
} = {}) {
  if (!root || !surface || !surface.id) return null;
  const d = doc || root.ownerDocument || document;
  const w = win || d.defaultView || window;
  const key = surfaceKey(surface.id);
  const index = readIndex(root, key);
  const resolvedRoot = assetRoot || root.getAttribute("data-markup-assets") || DEFAULT_ASSET_ROOT;
  const kind = storageKind || root.getAttribute("data-markup-storage") || "rock";
  const load = loader || createLoader({ doc: d, win: w, assetRoot: resolvedRoot, version });

  const button = renderPenButton(d);
  let state = "live";
  let controller = null;
  let opening = false;

  const setState = (next) => {
    state = STATES.includes(next) ? next : "live";
    if (state === "live") delete root.dataset.markup; else root.dataset.markup = state;
    button.setAttribute("aria-pressed", String(state !== "live"));
    button.setAttribute("aria-busy", String(opening));
    const label = state === "live" ? PEN_LABEL : PEN_OPEN_LABEL;
    button.setAttribute("aria-label", label);
    button.classList.toggle("is-busy", opening);
  };

  const hostOptions = () => ({
    surface: { id: key, title: surface.title || surface.id },
    frame: () => (typeof frame === "function" ? frame() : frame) || root,
    context: () => {
      const base = { mode: root.dataset.mode || null, theme: root.dataset.theme || null, filterSummary: null, url: w.location ? w.location.href : "", title: d.title || "" };
      if (typeof context !== "function") return base;
      try { return { ...base, ...(context() || {}) }; } catch { return base; }
    },
    theme: () => themeTone(root.dataset.theme),
    storage: { kind: kind === "memory" ? "memory" : "rock", typeGuid: index.typeGuid, index: index.rows, viewer: index.viewer, provisioned: index.provisioned },
    viewer: index.viewer,
    reducedMotion: prefersReducedMotion(w),
    onState: setState,
    announce: typeof announce === "function" ? announce : undefined,
  });

  const ensure = async () => {
    if (controller) return controller;
    opening = true;
    setState(state);
    try {
      const app = await load.load();
      controller = app.mount(hostOptions());
      return controller;
    } finally {
      opening = false;
      setState(state);
    }
  };

  /* THE WAIT, SAID HONESTLY.
   *
   * The engine is a real download, so a press that beats it has to be answered by something
   * other than a dead button. This is styled in markup-base.css, which ships with the island
   * rather than with the engine -- a loading state that arrives with the thing it is covering
   * for would be no use at all.
   *
   * The copy names what is actually happening. The V2.1 draft of this card said "Freezing
   * View" / "Preparing your canvas", which described the OLD architecture where pressing the
   * pen froze the dashboard; under instant ink nothing is frozen until Save, so that card would
   * have announced a thing that was not happening. The progress bar is indeterminate on purpose:
   * the module gives no byte counts, and a bar that invents a percentage is a lie a reader can
   * catch. */
  const showInstantVeil = () => {
    if (!d.createElement) return;
    let veil = d.querySelector ? d.querySelector("#favor-markup-instant-veil") : null;
    if (!veil) {
      veil = d.createElement("div");
      veil.id = "favor-markup-instant-veil";
      veil.className = "fm-instant-veil";
      veil.setAttribute("role", "status");
      veil.setAttribute("aria-live", "polite");
      veil.innerHTML = `
        <div class="fm-loading-card">
          <span class="fm-state fm-state--canvas">
            <span class="fm-state__dot" aria-hidden="true"></span>
            Opening markup
          </span>
          <h3 class="fm-loading-card__title">Getting the pens out</h3>
          <p class="fm-loading-card__detail">Loading the drawing tools. The dashboard stays exactly as it is.</p>
          <div class="fm-progress-bar" role="progressbar" aria-label="Loading the drawing tools" aria-valuetext="Loading">
            <div class="fm-progress-bar__fill fm-progress-bar__fill--animated"></div>
          </div>
        </div>
      `;
      if (d.body && d.body.append) d.body.append(veil);
      else if (root.append) root.append(veil);
    }
    return veil;
  };

  const hideInstantVeil = () => {
    const veil = d.querySelector ? d.querySelector("#favor-markup-instant-veil") : null;
    if (veil && veil.remove) veil.remove();
  };

  const fail = (error) => {
    hideInstantVeil();
    setState("live");
    if (typeof announce === "function") announce(error && error.message ? error.message : "The markup tools could not be loaded.");
  };

  /* Show the wait only when there is going to be one. A pen warmed by hover or focus opens in
   * the same frame, and flashing a loading card over an instant action is worse than showing
   * nothing: it reads as a stutter. The delay before the card appears is the same judgement --
   * a fetch that lands in 120ms should never have announced itself. */
  const VEIL_DELAY_MS = 180;
  const withVeil = (run) => {
    const warm = !!(w.FavorMarkup && typeof w.FavorMarkup.mount === "function");
    let timer = null;
    if (!warm) {
      timer = w.setTimeout(() => { showInstantVeil(); }, VEIL_DELAY_MS);
      if (typeof announce === "function") announce("Loading the drawing tools…");
    }
    /* On success the veil is NOT torn down here: the controller exists but has not painted yet,
     * so removing it now would show a bare dashboard for a frame before the canvas arrives. The
     * app removes it itself on mount, which is the moment there is something to hand over to.
     * On failure there is nothing coming, so it goes immediately. */
    return run().then(
      (value) => { if (timer) w.clearTimeout(timer); return value; },
      (error) => { if (timer) w.clearTimeout(timer); hideInstantVeil(); throw error; },
    );
  };

  const open = () => {
    if (state !== "live" || opening) return;
    withVeil(ensure).then((c) => { setState("canvas"); c.open(); }, fail);
  };
  const openSnapshot = (id) => {
    if (opening) return;
    withVeil(ensure).then((c) => { setState("viewing"); c.openSnapshot(String(id)); }, fail);
  };
  const close = () => { hideInstantVeil(); if (controller) controller.close(); setState("live"); };

  button.addEventListener("click", () => { if (state === "live") open(); });

  /* THE ENGINE LOADS ON INTENT, NEVER ON ARRIVAL.
   *
   * V2.1 warmed the engine from `requestIdleCallback` on every page load, so every reader of
   * every dashboard paid for Excalidraw whether or not they ever drew. Measured on staging
   * (2026-09-22): 1.8 MB of transfer per page view, and because the markup assets are served
   * `no-store, must-revalidate` it was paid again on every view rather than once. It cost the
   * reader nothing in time -- the fetch began 3.3s after first paint and produced no long task --
   * but it is a lot of somebody's bandwidth for a feature most page views never touch.
   *
   * Hover and focus still warm it, which is the honest version of the same idea: those are
   * intent, not arrival, and a pointer reaches a button before a click does, so a deliberate
   * press is usually still instant. A press that beats the fetch gets the veil below rather
   * than a dead button. */
  button.addEventListener("pointerenter", () => { if (typeof load.preload === "function") load.preload(); }, { once: true });
  button.addEventListener("focus", () => { if (typeof load.preload === "function") load.preload(); }, { once: true });

  const place = (target) => {
    // Keep markup icon visible outside mobile filter consoles: if target is inside the filter drawer, stay on root
    const inDrawer = target && target.closest && (target.closest(".palette-slot") || target.closest(".filter-sidebar"));
    const where = (!inDrawer && (target || host)) || root;
    if (!where) return;
    button.remove();
    const swatch = where.querySelector ? where.querySelector(":scope > .theme-swatch") : null;
    if (swatch) where.insertBefore(button, swatch);
    else where.append(button);
  };
  place(host);
  setState("live");

  return {
    button,
    state: () => state,
    open,
    openSnapshot,
    close,
    remount: place,
    destroy() {
      hideInstantVeil();
      if (controller) { controller.destroy(); controller = null; }
      button.remove();
      delete root.dataset.markup;
    },
  };
}
