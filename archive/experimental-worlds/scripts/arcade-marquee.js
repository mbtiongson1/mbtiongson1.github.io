const floor = document.querySelector('.arcade-floor');
const cabinet = document.querySelector('.cabinet-window');
const projectInformation = document.querySelector('#project-information');
const projectIndex = document.querySelector('#project-index');
const status = document.querySelector('#cabinet-status');
const toggle = document.querySelector('#attract-toggle');
const announcement = document.querySelector('#selection-announcement');
const links = [...document.querySelectorAll('[data-project-link]')];
const projects = [...document.querySelectorAll('.arcade-main [data-project]')];
const projectById = new Map(projects.map((project) => [project.dataset.project, project]));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobileLayout = window.matchMedia('(max-width: 760px)');
const hasIntersectionObserver = 'IntersectionObserver' in window;

const records = projects.map((section) => ({
  id: section.dataset.project,
  section,
  fallbackParent: section.parentElement,
  heading: section.querySelector('.project-heading'),
  summary: section.querySelector('.project-summary'),
  context: section.querySelector('.project-context'),
}));
const recordsReady = records.every((record) => record.id && record.heading && record.summary && record.context);

if (floor && cabinet && projectInformation && projectIndex && status && toggle && announcement && records.length > 0 && recordsReady && projectById.size === records.length) {
  let pointerInside = false;
  let focusInside = false;
  let inView = !hasIntersectionObserver;
  let attractEnabled = true;
  let timer = 0;
  let activeId = records[0].id;

  const initialHash = window.location.hash.slice(1);
  if (projectById.has(initialHash)) {
    activeId = initialHash;
    attractEnabled = false;
  }

  function applyIndexDisclosure() {
    if (!mobileLayout.matches) projectIndex.open = true;
    else if (!projectIndex.contains(document.activeElement)) projectIndex.open = false;
  }

  function updateStatus() {
    if (reducedMotion.matches) {
      status.textContent = 'Motion off · choose a project';
    } else if (document.visibilityState === 'hidden') {
      status.textContent = 'Paused in the background';
    } else if (!inView) {
      status.textContent = 'Paused while offscreen';
    } else if (pointerInside || focusInside) {
      status.textContent = 'Paused while you browse';
    } else if (attractEnabled) {
      status.textContent = 'Attract mode · previewing the archive';
    } else {
      status.textContent = 'Selected · choose another project';
    }

    toggle.hidden = reducedMotion.matches || records.length < 2;
    toggle.setAttribute('aria-pressed', String(attractEnabled));
    toggle.textContent = attractEnabled ? 'Attract mode on' : 'Attract mode off';
  }

  function selectProject(id, { manual = false, announce = false } = {}) {
    const record = records.find((item) => item.id === id);
    if (!record) return false;

    if (manual) {
      attractEnabled = false;
      window.clearTimeout(timer);
    }
    activeId = id;
    projectInformation.replaceChildren(record.heading, record.summary, record.context);

    for (const item of records) {
      const isSelected = item === record;
      item.section.hidden = !isSelected;
      if (isSelected) {
        if (item.section.parentElement !== cabinet) cabinet.append(item.section);
        item.section.setAttribute('aria-current', 'location');
      } else {
        item.section.removeAttribute('aria-current');
        if (item.section.parentElement === cabinet && item.fallbackParent !== cabinet) {
          item.fallbackParent.append(item.section);
        }
      }
    }

    for (const link of links) {
      if (link.dataset.projectLink === id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }

    if (announce) {
      const title = record.heading.querySelector('h2')?.textContent.trim();
      if (title) announcement.textContent = `${title} selected.`;
    }

    updateStatus();
    return true;
  }

  function canAdvance() {
    return attractEnabled
      && !reducedMotion.matches
      && document.visibilityState !== 'hidden'
      && inView
      && !pointerInside
      && !focusInside;
  }

  function scheduleAttractMode() {
    window.clearTimeout(timer);
    updateStatus();
    if (!canAdvance()) return;

    timer = window.setTimeout(() => {
      const index = records.findIndex((record) => record.id === activeId);
      const next = records[(index + 1) % records.length];
      if (next) selectProject(next.id);
      scheduleAttractMode();
    }, 8500);
  }

  applyIndexDisclosure();
  selectProject(activeId);
  document.documentElement.classList.add('arcade-enhanced');
  const library = document.querySelector('.project-library');
  if (library) library.hidden = true;
  scheduleAttractMode();

  const surface = document.querySelector('.arcade-main');
  surface?.addEventListener('pointerenter', () => {
    pointerInside = true;
    scheduleAttractMode();
  });
  surface?.addEventListener('pointerleave', () => {
    pointerInside = false;
    scheduleAttractMode();
  });
  surface?.addEventListener('focusin', () => {
    focusInside = true;
    scheduleAttractMode();
  });
  surface?.addEventListener('focusout', (event) => {
    if (!surface.contains(event.relatedTarget)) {
      focusInside = false;
      scheduleAttractMode();
    }
  });

  floor.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('a[data-project-link]');
    if (!link) return;
    const id = link.dataset.projectLink;
    const record = records.find((item) => item.id === id);
    if (!record || !selectProject(id, { manual: true, announce: true })) return;
    event.preventDefault();
    if (window.location.hash !== `#${id}`) {
      window.history.pushState({ projectId: id }, '', `#${id}`);
    }
    record.section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  });

  toggle.addEventListener('click', () => {
    attractEnabled = !attractEnabled;
    scheduleAttractMode();
  });

  window.addEventListener('popstate', () => {
    const id = window.location.hash.slice(1);
    if (projectById.has(id)) selectProject(id, { manual: true, announce: true });
    else selectProject(records[0].id, { manual: true, announce: true });
  });

  document.addEventListener('visibilitychange', scheduleAttractMode);

  const onMotionPreferenceChange = () => scheduleAttractMode();
  if (typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', onMotionPreferenceChange);
  } else {
    reducedMotion.addListener(onMotionPreferenceChange);
  }

  const onLayoutChange = () => applyIndexDisclosure();
  if (typeof mobileLayout.addEventListener === 'function') {
    mobileLayout.addEventListener('change', onLayoutChange);
  } else {
    mobileLayout.addListener(onLayoutChange);
  }

  if (hasIntersectionObserver) {
    const observer = new IntersectionObserver((entries) => {
      inView = Boolean(entries[0]?.isIntersecting);
      scheduleAttractMode();
    }, { threshold: 0.12 });
    const cabinetBay = document.querySelector('.cabinet-bay');
    if (cabinetBay) observer.observe(cabinetBay);
  }
}
