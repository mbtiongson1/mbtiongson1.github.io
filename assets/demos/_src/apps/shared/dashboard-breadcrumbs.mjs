/* Shared Executive Suite wayfinding. Static markup only: navigation is ordinary same-origin links. */

export const SUITE_SURFACES = Object.freeze([
  Object.freeze({ id: "exec-overview", label: "Overview", fullTitle: "Executive Overview", route: "/assets/demos/exec-overview/" }),
  /* People is the one surface in the suite that is three dashboards behind one masthead
   * (ADR 0022). The trail says so: hovering or tabbing into People reveals the three, from
   * every dashboard that carries breadcrumbs, so a reader on Grow can reach Leadership without
   * landing on Pathways first and hunting for the lens bar. The tab is a query parameter
   * because the page renders only the open tab's reads (#543). */
  Object.freeze({
    id: "pathways",
    label: "People",
    fullTitle: "People & Leaders",
    route: "/assets/demos/people-leaders/",
    tabs: Object.freeze([
      Object.freeze({ id: "pathways", label: "Pathways", question: "Who is becoming ready?", route: "/assets/demos/people-leaders/?tab=pathways" }),
      Object.freeze({ id: "leadership", label: "Leadership", question: "Who carries responsibility now?", route: "/assets/demos/people-leaders/?tab=leadership" }),
      Object.freeze({ id: "multiplication", label: "Multiplication", question: "Who are those leaders building?", route: "/assets/demos/people-leaders/?tab=multiplication" }),
    ]),
  }),
  Object.freeze({ id: "connect-field", label: "Connect", fullTitle: "Connect Health", route: "/assets/demos/connect/" }),
  Object.freeze({ id: "grow", label: "Grow", fullTitle: "Grow Continuity", route: "/assets/demos/grow/" }),
  Object.freeze({ id: "finance", label: "Finance", fullTitle: "Finance Pulse", route: "/assets/demos/finance/" }),
  Object.freeze({ id: "events", label: "Events", fullTitle: "Events", route: "/assets/demos/events/" }),
  Object.freeze({ id: "sunday-report", label: "Sunday", fullTitle: "Sunday Report", route: "/assets/demos/sunday-report/" }),
]);

export const SUITE_ROOT = Object.freeze({
  label: "Executive Dashboards",
  prefix: "",
  route: "/assets/demos/exec-overview/",
  ariaLabel: "Executive Suite",
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currentId(value) {
  const id = String(value || "").trim();
  return SUITE_SURFACES.some((surface) => surface.id === id) ? id : "";
}

export function renderBreadcrumbsHtml({ currentSurface } = {}) {
  const active = currentId(currentSurface);
  const links = SUITE_SURFACES.map((surface, index) => {
    const isActive = surface.id === active;
    const current = isActive ? ' aria-current="page"' : "";
    const className = `suite-breadcrumbs__link${isActive ? " is-active" : ""}`;
    const targetRoute = String(surface.route || "").startsWith("/") ? surface.route : `/${surface.route || ""}`;
    const link = `<a href="/${escapeHtml(targetRoute.slice(1))}" class="${className}" data-surface="${escapeHtml(surface.id)}"${current}>${escapeHtml(surface.label)}</a>`;
    const separator = index ? '<span class="suite-breadcrumbs__sep" aria-hidden="true">·</span>' : "";
    if (!surface.tabs || !surface.tabs.length) return `${separator}${link}`;
    const tabs = surface.tabs.map((tab) => {
      // Rooted, and visibly so: the delivered block is scanned for a literal leading slash,
      // because a relative href resolves against the host page rather than the island.
      const tabRoute = String(tab.route || "").startsWith("/") ? tab.route : `/${tab.route || ""}`;
      return (
      `<a href="/${escapeHtml(tabRoute.slice(1))}" class="suite-breadcrumbs__tab" data-tab="${escapeHtml(tab.id)}">`
      + `<span class="suite-breadcrumbs__tab-label">${escapeHtml(tab.label)}</span>`
      + `<span class="suite-breadcrumbs__tab-question">${escapeHtml(tab.question)}</span></a>`
      );
    }).join("");
    return `${separator}<span class="suite-breadcrumbs__nest">${link}`
      + `<span class="suite-breadcrumbs__sub" role="group" aria-label="${escapeHtml(surface.fullTitle)}">${tabs}</span></span>`;
  }).join("");
  const rootRoute = String(SUITE_ROOT.route || "").startsWith("/") ? SUITE_ROOT.route : `/${SUITE_ROOT.route || ""}`;
  return `<nav class="suite-breadcrumbs" data-ux-host-chrome="suite" aria-label="${escapeHtml(SUITE_ROOT.ariaLabel)}"><ol class="suite-breadcrumbs__trail"><li class="suite-breadcrumbs__item suite-breadcrumbs__item--root"><a href="/${escapeHtml(rootRoute.slice(1))}" class="suite-breadcrumbs__root-link">${SUITE_ROOT.prefix ? `<span class="suite-breadcrumbs__prefix">${escapeHtml(SUITE_ROOT.prefix)}</span> ` : ""}${escapeHtml(SUITE_ROOT.label)}</a></li><li class="suite-breadcrumbs__divider" aria-hidden="true">/</li><li class="suite-breadcrumbs__item suite-breadcrumbs__item--siblings"><span class="suite-breadcrumbs__peers">${links}</span></li></ol></nav>`;
}

function element(documentRef, tag, className, text) {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountBreadcrumbs(container, { currentSurface } = {}) {
  if (!container || typeof container.ownerDocument?.createElement !== "function") return null;
  const existing = container.querySelector?.(".suite-breadcrumbs")
    || container.closest?.(".pshell")?.querySelector?.(".suite-breadcrumbs");
  if (existing) {
    attachBreadcrumbsInteractions(existing);
    return existing;
  }
  const documentRef = container.ownerDocument;
  const active = currentId(currentSurface);
  const nav = element(documentRef, "nav", "suite-breadcrumbs");
  nav.setAttribute("data-ux-host-chrome", "suite");
  nav.setAttribute("aria-label", SUITE_ROOT.ariaLabel);
  const trail = element(documentRef, "ol", "suite-breadcrumbs__trail");
  const rootItem = element(documentRef, "li", "suite-breadcrumbs__item suite-breadcrumbs__item--root");
  const rootLink = element(documentRef, "a", "suite-breadcrumbs__root-link");
  rootLink.href = SUITE_ROOT.route;
  const prefix = element(documentRef, "span", "suite-breadcrumbs__prefix", SUITE_ROOT.prefix);
  rootLink.append(...(SUITE_ROOT.prefix ? [prefix, documentRef.createTextNode(` ${SUITE_ROOT.label}`)] : [documentRef.createTextNode(SUITE_ROOT.label)]));
  rootItem.append(rootLink);
  trail.append(rootItem, element(documentRef, "li", "suite-breadcrumbs__divider", "/"));
  trail.children[1].setAttribute("aria-hidden", "true");
  const peersItem = element(documentRef, "li", "suite-breadcrumbs__item suite-breadcrumbs__item--siblings");
  const peers = element(documentRef, "span", "suite-breadcrumbs__peers");
  SUITE_SURFACES.forEach((surface, index) => {
    if (index) {
      const separator = element(documentRef, "span", "suite-breadcrumbs__sep", "·");
      separator.setAttribute("aria-hidden", "true");
      peers.append(separator);
    }
    const isActive = surface.id === active;
    const link = element(documentRef, "a", `suite-breadcrumbs__link${isActive ? " is-active" : ""}`, surface.label);
    link.href = surface.route;
    link.setAttribute("data-surface", surface.id);
    if (isActive) link.setAttribute("aria-current", "page");
    if (!surface.tabs || !surface.tabs.length) {
      peers.append(link);
      return;
    }
    const nest = element(documentRef, "span", "suite-breadcrumbs__nest");
    nest.append(link);
    const sub = element(documentRef, "span", "suite-breadcrumbs__sub");
    sub.setAttribute("role", "group");
    sub.setAttribute("aria-label", surface.fullTitle);
    for (const tab of surface.tabs) {
      const tabLink = element(documentRef, "a", "suite-breadcrumbs__tab");
      tabLink.href = tab.route;
      tabLink.setAttribute("data-tab", tab.id);
      tabLink.append(
        element(documentRef, "span", "suite-breadcrumbs__tab-label", tab.label),
        element(documentRef, "span", "suite-breadcrumbs__tab-question", tab.question),
      );
      sub.append(tabLink);
    }
    nest.append(sub);
    peers.append(nest);
  });
  peersItem.append(peers);
  trail.append(peersItem);
  nav.append(trail);
  container.append(nav);
  attachBreadcrumbsInteractions(nav);
  return nav;
}

export function attachBreadcrumbsInteractions(nav) {
  if (!nav || typeof nav.addEventListener !== "function") return;
  if (nav.dataset?.breadcrumbsBound === "true") return;
  if (nav.dataset) nav.dataset.breadcrumbsBound = "true";

  const trail = nav.querySelector?.(".suite-breadcrumbs__trail");
  if (!trail || typeof trail.addEventListener !== "function") return;

  // Mark all links draggable="false" to prevent native browser ghost drag
  nav.querySelectorAll?.("a").forEach?.((a) => {
    a.setAttribute?.("draggable", "false");
  });

  /* ------------------------------------------------------------------
   * 1. Touch Tap vs Mouse Click for People nest menu (#600)
   * Mouse clicks navigate directly to People Pathways (/exec/people).
   * Touch taps toggle the 3 choices (Pathways, Leadership, Multiplication).
   * ------------------------------------------------------------------ */
  const nest = nav.querySelector?.(".suite-breadcrumbs__nest");
  const peopleLink = nest?.querySelector?.('.suite-breadcrumbs__link[data-surface="pathways"]');

  let lastPointerType = "mouse";
  let lastTouchTime = 0;

  if (nest && peopleLink && typeof peopleLink.addEventListener === "function") {
    peopleLink.addEventListener("pointerdown", (e) => {
      lastPointerType = e.pointerType || "mouse";
    }, { passive: true });

    peopleLink.addEventListener("touchstart", () => {
      lastPointerType = "touch";
      lastTouchTime = Date.now();
    }, { passive: true });

    peopleLink.addEventListener("click", (e) => {
      const isTouch = lastPointerType === "touch" || (Date.now() - lastTouchTime < 600);
      if (isTouch) {
        // Tapping People on mobile: show/toggle the 3 choices
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !nest.classList.contains("is-open");
        nest.classList.toggle("is-open", willOpen);
        nest.setAttribute("aria-expanded", willOpen ? "true" : "false");
        trail.classList.toggle("has-open-nest", willOpen);
        const sub = nest.querySelector?.(".suite-breadcrumbs__sub");
        if (willOpen && sub) {
          sub.style.left = "";
          sub.style.right = "";
          try {
            const rect = sub.getBoundingClientRect();
            const winW = (typeof window !== "undefined" && window.innerWidth) || 375;
            if (rect.right > winW - 8) {
              sub.style.left = "auto";
              sub.style.right = "-0.35rem";
            }
          } catch {}
        }
      } else {
        // Mouse click: navigate directly to People Pathways (/exec/people)
        nest.classList.remove("is-open");
        nest.setAttribute("aria-expanded", "false");
        trail.classList.remove("has-open-nest");
      }
    });

    // Close menu when tapping outside
    nav.ownerDocument?.addEventListener?.("pointerdown", (e) => {
      if (nest && !nest.contains(e.target)) {
        nest.classList.remove("is-open");
        nest.setAttribute("aria-expanded", "false");
        trail.classList.remove("has-open-nest");
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
   * 2. Drag & Longpress Draggable Breadcrumbs
   * Longpress (or horizontal drag movement) activates smooth drag-to-scroll.
   * Suppresses link navigation when dragging occurred.
   * ------------------------------------------------------------------ */
  let isDown = false;
  let isDraggable = false;
  let isDragging = false;
  let dragOccurred = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let longpressTimer = null;

  function endDrag() {
    if (longpressTimer) {
      clearTimeout(longpressTimer);
      longpressTimer = null;
    }
    isDown = false;
    isDraggable = false;
    isDragging = false;
    nav.removeAttribute?.("data-dragging");
    nav.removeAttribute?.("data-draggable");
    trail.classList?.remove("is-dragging", "is-draggable");
    setTimeout(() => { dragOccurred = false; }, 60);
  }

  trail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    isDown = true;
    isDraggable = false;
    isDragging = false;
    dragOccurred = false;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = trail.scrollLeft || 0;

    // 250ms longpress activates draggable state with haptic feedback
    longpressTimer = setTimeout(() => {
      if (!isDown) return;
      isDraggable = true;
      nav.setAttribute?.("data-draggable", "true");
      trail.classList?.add("is-draggable");
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
      } catch {}
    }, 250);
  }, { passive: true });

  trail.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDragging && Math.hypot(dx, dy) > 8) {
      if (longpressTimer) {
        clearTimeout(longpressTimer);
        longpressTimer = null;
      }
      if (Math.abs(dx) > Math.abs(dy) || isDraggable) {
        isDragging = true;
        dragOccurred = true;
        nav.setAttribute?.("data-dragging", "true");
        trail.classList?.add("is-dragging");
      }
    }

    if (isDragging) {
      trail.scrollLeft = startScrollLeft - dx;
      if (e.cancelable) e.preventDefault();
    }
  });

  trail.addEventListener("pointerup", endDrag, { passive: true });
  trail.addEventListener("pointercancel", endDrag, { passive: true });

  // Suppress link navigation if a drag occurred, or notify parent reel if in iframe
  trail.addEventListener("click", (e) => {
    if (dragOccurred) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const link = e.target.closest("a");
    if (!link) return;
    const surface = link.dataset.surface;
    const tab = link.dataset.tab;
    const href = link.getAttribute("href");

    if (window.parent && window.parent !== window) {
      e.preventDefault();
      window.parent.postMessage({
        type: "reel-navigate",
        surface,
        tab,
        href
      }, "*");
    }
  }, true);
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  const bindExisting = () => {
    document.querySelectorAll?.(".suite-breadcrumbs")?.forEach?.((el) => {
      attachBreadcrumbsInteractions(el);
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindExisting, { once: true });
  } else {
    bindExisting();
  }

  // MutationObserver to automatically bind any dynamically rendered breadcrumbs
  if (typeof MutationObserver !== "undefined") {
    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node && node.nodeType === 1) {
              if (node.classList?.contains("suite-breadcrumbs")) {
                attachBreadcrumbsInteractions(node);
              } else if (node.querySelectorAll) {
                node.querySelectorAll(".suite-breadcrumbs").forEach((el) => {
                  attachBreadcrumbsInteractions(el);
                });
              }
            }
          }
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch {}
  }
}

