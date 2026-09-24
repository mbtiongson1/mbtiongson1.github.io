/* Shared hover/tooltip primitive (#236, #252).
 *
 * Operator ruling, 2026-09-02: hover carries the detail *by default*. The old DESIGN.md line
 * "never require hover" is stale; the real rule is hover-by-default, with per-mark exceptions
 * justified by hover cost (lag, touch, target size) -- and an opted-out mark shows its value
 * visibly instead of hiding it behind a pointer. This module is the one shared contract every
 * surface's marks attach to: same trigger/hit-area shape, same tooltip vocabulary (themed per
 * surface, identical DOM structure), same content ordering (label, value, comparison, unit),
 * same dismissal/delay behavior, and a keyboard + touch equivalent for every mouse trigger.
 *
 * Nothing here fetches, stores, or logs (contract Sec1) -- pure DOM and event wiring.
 *
 * Exports
 *   TOOLTIP_SHOW_DELAY_MS, TOOLTIP_HIDE_DELAY_MS   the one shared timing vocabulary
 *   tooltipContent({ label, value, comparison, unit, swatchToken }) -> DOM node, fixed order
 *   placeNear(popover, host, anchor, { gap, edge })                 -> viewport-clamped position
 *   mountTooltipLayer(root, { surface })                            -> controller (below)
 *   mountTooltipDelegate(root, { surface, selector, content, tone }) -> delegated variant,
 *     for a host whose triggers are rebuilt/mutated on every render rather than attached once
 *
 * Controller: { element, attach(trigger, opts), show(trigger, content), hide(opts), destroy() }
 *   attach(trigger, { render, pin = true }) wires one trigger to the layer:
 *     - pointerenter/focus schedule a show after TOOLTIP_SHOW_DELAY_MS
 *     - pointerleave/blur schedule a hide after TOOLTIP_HIDE_DELAY_MS, unless pinned
 *     - click/tap (when pin is true) toggles a pinned tooltip -- the touch equivalent, since a
 *       touch device cannot hover. A trigger whose click already does something else (a link,
 *       a drill-down) passes pin: false and keeps its own click handler; focus + Enter still
 *       reaches the same content via the keyboard path.
 *     - Escape, or a click/tap outside the trigger and the bubble, dismisses a pinned tooltip.
 *   `render` is a function returning a DOM node, a string, or a tooltipContent() call.
 */

const EDGE = 8;
const GAP = 8;

export const TOOLTIP_SHOW_DELAY_MS = 100;
export const TOOLTIP_HIDE_DELAY_MS = 150;

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = String(text);
  return node;
}

/* The fixed vocabulary: label, then value, then comparison, then unit -- in that DOM order,
 * which is also the reading order a screen reader announces the bubble in. A tile or table
 * cell's own always-visible layout (value beside its unit, DESIGN.md's quiet-KPI rule) is a
 * separate, unchanged concern from what this supplementary hover bubble says. */
export function tooltipContent({ label = null, value = null, comparison = null, unit = null, swatchToken = null } = {}) {
  const card = document.createElement("div");
  card.className = "dashboard-tip__card";

  const head = document.createElement("div");
  head.className = "dashboard-tip__head";
  if (swatchToken) {
    const swatch = document.createElement("span");
    swatch.className = "dashboard-tip__swatch";
    swatch.style.background = String(swatchToken).startsWith("--") ? `var(${swatchToken})` : String(swatchToken);
    head.append(swatch);
  }
  if (label !== null && label !== undefined && label !== "") head.append(textNode("span", "dashboard-tip__label", label));
  if (head.childElementCount) card.append(head);

  if (value !== null && value !== undefined && value !== "") card.append(textNode("p", "dashboard-tip__value", value));
  if (comparison !== null && comparison !== undefined && comparison !== "") card.append(textNode("p", "dashboard-tip__compare", comparison));
  if (unit !== null && unit !== undefined && unit !== "") card.append(textNode("span", "dashboard-tip__unit", unit));

  return card;
}

/* Fixed-position placement, clamped inside the host island rather than inside the viewport.
 * Prefers below-and-right-aligned to the anchor and flips above when there is no room below.
 * `anchor` is an Element (its bounding box is used) or a { x, y } point.
 *
 * The clamp is the host's box intersected with the viewport, not the viewport alone. An island
 * is never the whole page: on a Rock page it sits inside chrome that paints over it -- the left
 * nav rail owns the first ~80px, and a bubble clamped only to the viewport is placed legally at
 * left: 36 and then covered. That is how #275 first landed on prod: the prose had been moved
 * into the tooltips and 44px of every line sat behind Rock's nav rail. Clamping to the host
 * keeps a bubble inside the surface that owns it, on any host, without the module needing to
 * know anything about Rock. `within` overrides the host explicitly; by default it is the
 * element the bubble was mounted into. A host narrower than the bubble falls back to the host's
 * leading edge, which overflows outward rather than pinning the bubble's text out of view. */
/* A pointer event's own coordinates, or null when the event has none to give. A keyboard-driven
 * click reports 0,0 with pointerType "", and taking that literally would throw a bubble into the
 * top-left corner of the screen. */
/* HOW FAR IN THE HOST'S OWN CHROME REACHES from the left edge, measured rather than assumed.
 *
 * The host clamp below keeps a bubble inside the element it was mounted into, which is the right
 * rule and is usually enough: on a Rock page the island starts exactly where the left nav ends.
 * It stops being enough the moment that nav OVERLAYS the content instead of pushing it, which is
 * what it does at a narrower window and under browser zoom -- the island then starts at 0, the
 * clamp happily allows 12, and the bubble slides under the nav with its first words hidden. The
 * left edge of the readable area is a fact about the page, so it is read off the page.
 *
 * Probed at the bubble's own vertical centre, because chrome is not always full height, and
 * capped at a third of the viewport so a full-width fixed overlay can never squeeze a bubble
 * off the other side. Elements inside the bubble's own host are skipped: an island's sticky
 * console is not chrome to hide from, it is the page. */
function leftChromeEdge(doc, within, midY) {
  if (!doc || typeof doc.elementsFromPoint !== "function") return 0;
  const view = doc.defaultView || window;
  let edge = 0;
  for (const node of doc.elementsFromPoint(2, midY) || []) {
    if (node === doc.documentElement || node === doc.body) continue;
    if (within instanceof Element && (node === within || within.contains(node))) continue;
    const position = view.getComputedStyle(node).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const rect = node.getBoundingClientRect();
    if (rect.left <= 2 && rect.right > edge) edge = rect.right;
  }
  return Math.min(edge, Math.round(view.innerWidth / 3));
}

function pointOf(event) {
  if (!event || typeof event.clientX !== "number" || typeof event.clientY !== "number") return null;
  if (!event.clientX && !event.clientY) return null;
  return { x: event.clientX, y: event.clientY };
}

export function placeNear(popover, anchor, { gap = GAP, edge = EDGE, within = null, point = null } = {}) {
  if (!popover) return;
  const box = anchor instanceof Element
    ? anchor.getBoundingClientRect()
    : { top: anchor?.y ?? 0, bottom: anchor?.y ?? 0, left: anchor?.x ?? 0, right: anchor?.x ?? 0 };
  const tip = popover.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  const host = within instanceof Element ? within : popover.parentElement;
  const hostBox = host && host !== document.body && host !== document.documentElement
    ? host.getBoundingClientRect()
    : null;
  /* The host clamp only ever tightens the viewport clamp -- a host scrolled partly off-screen,
   * or wider than the window, must not push a bubble out of the window to satisfy it. */
  const chromeLeft = leftChromeEdge(popover.ownerDocument || document, host, Math.round(point ? point.y : (box.top + box.bottom) / 2));
  const minLeft = Math.max(hostBox ? Math.max(edge, hostBox.left + edge) : edge, chromeLeft + edge);
  const maxRight = hostBox ? Math.min(viewportWidth - edge, hostBox.right - edge) : viewportWidth - edge;
  const minTop = hostBox ? Math.max(edge, hostBox.top + edge) : edge;
  const maxBottom = hostBox ? Math.min(viewportHeight - edge, hostBox.bottom - edge) : viewportHeight - edge;

  /* THE CARD OPENS AT THE CURSOR when there is a cursor to open at.
   *
   * Anchoring to the trigger's own box is only a reading when the trigger IS the mark. It stops
   * being one twice over on a dashboard: a full-width bar row puts its right edge most of a
   * screen from the bar the reader is pointing at, and a donut wedge's bounding box is the
   * better part of the whole circle, so "below the box" is below the entire chart. Both opened
   * the card somewhere the reader was not looking, which reads as a different mark's card.
   *
   * The pointer is the one position that is always the right one, because it is by definition
   * where the reader's attention is. It is taken ONCE, at open, so the card then sits still to
   * be read rather than trailing the cursor around. Keyboard focus carries no pointer and keeps
   * the element anchor, which is correct for it: nobody is pointing at anything. */
  const anchorTop = point ? point.y : box.top;
  const anchorBottom = point ? point.y : box.bottom;
  let top = anchorBottom + gap;
  if (top + tip.height > maxBottom) {
    const above = anchorTop - gap - tip.height;
    top = above >= minTop ? above : Math.max(minTop, maxBottom - tip.height);
  }
  let left = point ? point.x + gap : box.right - tip.width;
  if (!point && left < minLeft) left = box.left;
  /* Opening below-right of the cursor is the default because that is where there is usually
   * room; against either far edge it flips to the other side of the cursor rather than being
   * clamped down on top of it. */
  if (point && left + tip.width > maxRight) left = point.x - gap - tip.width;
  /* Math.max last, so a bubble wider than the clamp overflows the trailing edge and keeps its
   * leading edge -- where the label and the first word of every line are -- on screen. */
  left = Math.max(minLeft, Math.min(left, maxRight - tip.width));

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
}

/* One delegated bubble per layer, appended to `root`. A layer is cheap enough to mount once
 * per island and share across every widget that wants a tooltip -- delegation from `root`
 * survives widgets re-rendering on every filter change, the same reason exec-overview's
 * original tooltip listeners were delegated rather than per-node. */
export function mountTooltipLayer(root, { surface = "dashboard" } = {}) {
  if (!root) return null;
  const bubble = document.createElement("div");
  bubble.className = "dashboard-tip";
  bubble.id = `dashboard-tip-${surface}`;
  bubble.setAttribute("role", "tooltip");
  /* `data-open` rather than the `hidden` attribute: `hidden` forces `display:none`, which
   * cannot be transitioned, and every surface's own bubble (exec-overview's former .tip-bubble
   * among them) already faded a bubble in and out on open/close. */
  bubble.dataset.open = "false";
  /* The pin state belongs in the DOM, not only in this closure. A pinned bubble is a different
   * object to a hovering one -- it stays put, it can be read at leisure, and its text can be
   * selected -- and a surface cannot express any of that without a hook. Without this every
   * island that sets `pointer-events: none` on the bubble (which all of them do, so it never
   * eats a hover meant for the mark underneath) silently makes its own pinned bubble
   * unselectable. */
  bubble.dataset.pinned = "false";
  root.appendChild(bubble);

  let active = null;
  let pinned = false;
  let showTimer = null;
  let hideTimer = null;

  const clearTimers = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  };

  const open = (trigger, render, point = null) => {
    clearTimers();
    const content = typeof render === "function" ? render() : render;
    bubble.replaceChildren();
    if (content instanceof Node) bubble.append(content);
    else if (content !== null && content !== undefined && content !== "") bubble.textContent = String(content);
    else return;
    active = trigger;
    bubble.dataset.open = "true";
    if (trigger && trigger.setAttribute) trigger.setAttribute("aria-describedby", bubble.id);
    placeNear(bubble, trigger, { point });
  };

  const close = ({ immediate = false } = {}) => {
    if (pinned && !immediate) return;
    clearTimers();
    const wasActive = active;
    active = null;
    pinned = false;
    bubble.dataset.pinned = "false";
    bubble.dataset.open = "false";
    if (wasActive && wasActive.removeAttribute) wasActive.removeAttribute("aria-describedby");
  };

  const scheduleOpen = (trigger, render, point = null) => {
    clearTimers();
    showTimer = setTimeout(() => open(trigger, render, point), TOOLTIP_SHOW_DELAY_MS);
  };
  const scheduleClose = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (pinned) return;
    hideTimer = setTimeout(() => close(), TOOLTIP_HIDE_DELAY_MS);
  };

  function attach(trigger, { render, pin = true } = {}) {
    if (!trigger || typeof render === "undefined") return;
    /* Focus has no pointer, so it keeps the element anchor: a keyboard reader is not pointing at
     * anything and a bubble that lands wherever the mouse was left would be worse than one
     * pinned to the row. */
    trigger.addEventListener("pointerenter", (event) => scheduleOpen(trigger, render, pointOf(event)));
    trigger.addEventListener("pointerleave", scheduleClose);
    trigger.addEventListener("focus", () => scheduleOpen(trigger, render));
    trigger.addEventListener("blur", scheduleClose);
    if (pin) {
      trigger.addEventListener("click", (event) => {
        if (pinned && active === trigger) { close({ immediate: true }); return; }
        event.preventDefault?.();
        open(trigger, render);
        pinned = true;
        bubble.dataset.pinned = "true";
      });
    }
  }

  /* The safety net under `pointerleave`.
   *
   * A trigger only reports a leave when the pointer walks off it. It never reports one when
   * the trigger itself walks off the POINTER, which is what a filter re-render does: the row
   * under the cursor is replaced or shifted, no leave is ever dispatched, and the bubble it
   * opened stands there over a pointer that is now somewhere else entirely. That is the
   * "tooltips are too sticky, they still show when you are not hovering" report.
   *
   * `pointerover` fires once per element the pointer enters, not once per pixel, so this is a
   * cheap check and not a pointermove tax. An unpinned bubble closes as soon as the pointer is
   * over neither its trigger nor the bubble; a pinned one is left alone, because a pin is the
   * reader asking for exactly that. */
  root.ownerDocument.addEventListener("pointerover", (event) => {
    if (!active || pinned || bubble.dataset.open !== "true") return;
    const target = event.target;
    if (active.contains?.(target) || bubble.contains(target)) return;
    scheduleClose();
  }, true);
  /* A trigger torn out by a re-render can never send a leave at all. Nothing else will ever
   * close this bubble, so do not wait for the grace period. */
  root.ownerDocument.addEventListener("pointermove", () => {
    if (active && !active.isConnected) close({ immediate: true });
  }, true);
  root.ownerDocument.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close({ immediate: true });
  });
  root.ownerDocument.addEventListener("click", (event) => {
    if (!pinned || !active) return;
    const target = event.target;
    if (active.contains?.(target) || bubble.contains(target)) return;
    close({ immediate: true });
  }, true);

  return {
    element: bubble,
    attach,
    show: (trigger, content, point = null) => open(trigger, () => content, point),
    hide: (opts) => close(opts),
    pin: () => { pinned = true; bubble.dataset.pinned = "true"; },
    isPinned: () => pinned,
    destroy() { clearTimers(); bubble.remove(); },
  };
}

/* Attribute-delegated variant for a host whose triggers are rebuilt or mutated on every
 * render -- exec-overview's combo rows and donut segments redraw on every filter change, and
 * a per-node attach() would either leak listeners on discarded nodes or miss ones created
 * after mount. One delegated listener set on `root`, keyed by `selector`, covers a trigger
 * the moment it exists in the DOM, the same shape exec-overview's own tooltip IIFE used
 * before this module existed. Built on the same bubble, delay, and positioning as
 * mountTooltipLayer -- only the wiring differs. */
export function mountTooltipDelegate(root, { surface = "dashboard", selector, content, tone = null } = {}) {
  if (!root || !selector || typeof content !== "function") return null;
  const layer = mountTooltipLayer(root, { surface });
  if (!layer) return null;

  const triggerFrom = (event) => {
    const node = event.target instanceof Element ? event.target : null;
    return node ? node.closest(selector) : null;
  };

  let active = null;
  let showTimer = null;
  let hideTimer = null;

  const open = (trigger, point = null) => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    active = trigger;
    if (typeof tone === "function") layer.element.dataset.tone = tone(trigger) || "default";
    layer.show(trigger, content(trigger), point);
  };
  const closeNow = () => { active = null; layer.hide({ immediate: true }); };
  const scheduleOpen = (trigger, point = null) => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => open(trigger, point), TOOLTIP_SHOW_DELAY_MS);
  };
  const scheduleClose = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    /* A pin is the reader asking for the bubble to stay put, so the pointer walking off the
     * trigger must not take it away. attach()'s scheduleClose has always returned here; this
     * one did not, and it closed through `immediate: true`, which is the one flag that
     * overrides the layer's own pin guard -- so on Exec Overview clicking an (i) held the
     * bubble only until the pointer moved a few pixels. Escape and a second click on the
     * trigger still call closeNow directly, because those ARE the reader un-pinning. */
    if (layer.isPinned()) return;
    hideTimer = setTimeout(closeNow, TOOLTIP_HIDE_DELAY_MS);
  };

  root.addEventListener("pointerover", (event) => {
    const trigger = triggerFrom(event);
    /* `trigger !== active` alone is not the right guard: it exists to avoid re-scheduling a
     * show for the bubble already showing, but a click outside is dismissed by the layer's own
     * document handler, which knows nothing about this closure's `active`. The trigger the
     * reader just dismissed therefore stayed "active" here while the bubble was shut, and
     * hovering that same (i) again did nothing at all. Ask the bubble, not the bookkeeping. */
    if (!trigger) return;
    if (trigger === active && layer.element.dataset.open === "true") return;
    scheduleOpen(trigger, pointOf(event));
  });
  root.addEventListener("pointerout", (event) => {
    const trigger = triggerFrom(event);
    if (trigger && trigger === active && !trigger.contains(event.relatedTarget)) scheduleClose();
  });
  root.addEventListener("focusin", (event) => {
    const trigger = triggerFrom(event);
    if (trigger) scheduleOpen(trigger);
  });
  root.addEventListener("focusout", (event) => {
    if (triggerFrom(event) === active) scheduleClose();
  });
  /* Touch equivalent: a tap toggles a pinned tooltip, exactly like attach()'s default pin
   * behavior. Skipped for a trigger whose click already does something else -- there, the tap's
   * own action *is* the touch equivalent, and the content already says so.
   *
   * `onclick` DETECTS ONLY HALF OF THOSE. A trigger wired with addEventListener -- which is
   * every mark on a surface built without inline handlers -- reports `onclick === null`, so the
   * tap both pinned a bubble and ran the surface's own action. On a click-to-filter dashboard
   * that means the page re-renders, the trigger is discarded, and the pin is left holding a node
   * that no longer exists. `data-tip-pin="off"` is the explicit opt-out: a trigger says whether
   * its own click is the action, rather than this module guessing from a property. */
  root.addEventListener("click", (event) => {
    const trigger = triggerFrom(event);
    if (!trigger || trigger.tagName === "A" || trigger.onclick) return;
    if (trigger.dataset && trigger.dataset.tipPin === "off") return;
    if (layer.isPinned() && active === trigger) { closeNow(); return; }
    open(trigger);
    layer.pin();
  });
  root.ownerDocument.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) closeNow();
  });
  const view = root.ownerDocument.defaultView;
  if (view) {
    const reposition = () => { if (active) placeNear(layer.element, active); };
    view.addEventListener("scroll", reposition, { passive: true, capture: true });
    view.addEventListener("resize", reposition, { passive: true });
  }

  /* `destroy` releases the bubble the delegate mounted. Without it a caller that tears its
   * surface down -- a shell unmounting one dashboard to mount another -- leaves an orphan
   * bubble in the DOM and a layer holding document-level listeners. `hide` alone was enough
   * while every consumer lived for the life of the page; a mountable island does not. */
  return {
    hide: closeNow,
    destroy() { closeNow(); layer.destroy(); },
  };
}
