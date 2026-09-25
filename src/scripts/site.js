// Progressive enhancement only. Every section, link, and image works without this file.
document.documentElement.classList.add('js');

// Favor Home lens switch: swaps between real captures of the island's four lenses.
const stage = document.querySelector('[data-lens-stage]');
if (stage) {
  const lenses = {
    age: 'a people donut and a ruled legend by age band',
    connection: 'the same people by connection status: crowd, core, new, and leader',
    gender: 'the same people by gender',
    campus: 'people across the Manila, Brisbane, and Seoul campuses',
  };
  const image = stage.querySelector('[data-lens-image]');
  const group = stage.querySelector('[data-lens-switch]');
  const buttons = [...group.querySelectorAll('[data-lens]')];
  const src = (lens) => `/assets/media/favor/home-favor-by-people-${lens}.webp`;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const lens of Object.keys(lenses)) new Image().src = src(lens);
  group.hidden = false;
  const show = (lens) => {
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lens === lens)));
    const alt = `The Favor, by People island from the staff homepage, ${lens} lens: ${lenses[lens]}. Every count is invented, and redacted to blank bars.`;
    if (reduced.matches) { image.src = src(lens); image.alt = alt; return; }
    image.classList.add('is-swapping');
    window.setTimeout(() => {
      image.src = src(lens);
      image.alt = alt;
      image.decode().catch(() => {}).finally(() => image.classList.remove('is-swapping'));
    }, 180);
  };
  buttons.forEach((button) => button.addEventListener('click', () => show(button.dataset.lens)));
}

if ('IntersectionObserver' in window) {
  // Masthead: mark the chapter being read.
  const navLinks = [...document.querySelectorAll('[data-nav]')];
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const chapterObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.dataset.chapter;
      navLinks.forEach((link) => link.setAttribute('aria-current', String(link.dataset.nav === id)));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  chapters.forEach((chapter) => chapterObserver.observe(chapter));

  // Dashboards: the receipts margin follows the principle being read.
  const ledger = document.querySelector('.chapter--dash .ledger');
  const principles = [...document.querySelectorAll('[data-principle]')];
  const wide = window.matchMedia('(min-width: 1101px)');
  if (ledger && principles.length) {
    const receipts = [...ledger.querySelectorAll('[data-for]')];
    const principleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !wide.matches) continue;
        const id = entry.target.dataset.principle;
        ledger.classList.add('is-tracking');
        principles.forEach((item) => item.classList.toggle('is-active', item === entry.target));
        receipts.forEach((item) => item.classList.toggle('is-active', item.dataset.for === id));
      }
    }, { rootMargin: '-40% 0px -55% 0px' });
    principles.forEach((item) => principleObserver.observe(item));
    const suite = document.querySelector('.suite');
    if (suite) new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        ledger.classList.remove('is-tracking');
        principles.forEach((item) => item.classList.remove('is-active'));
      }
    }, { rootMargin: '-40% 0px -55% 0px' }).observe(suite);
  }
}

// Dashboard reel: plays the chosen live demo inline. Without this script each item opens its demo in a new tab.
const reelStage = document.querySelector('[data-reel-stage]');
if (reelStage) {
  const items = [...document.querySelectorAll('[data-demo]')];
  const frameBox = reelStage.querySelector('[data-reel-frame]');
  const name = reelStage.querySelector('[data-reel-name]');
  const open = reelStage.querySelector('[data-reel-open]');
  const start = reelStage.querySelector('[data-reel-start]');
  let current = items[0];
  const load = () => {
    const frame = document.createElement('iframe');
    frame.src = current.getAttribute('href');
    frame.title = `${current.querySelector('.reel-title').textContent}, live demo on invented data`;
    frame.loading = 'eager';
    frameBox.replaceChildren(frame);
  };
  const select = (item, play) => {
    current = item;
    items.forEach((other) => other.setAttribute('aria-current', String(other === item)));
    name.textContent = item.querySelector('.reel-title').textContent;
    open.href = item.getAttribute('href');
    if (play || frameBox.querySelector('iframe')) load();
  };
  items.forEach((item) => item.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    select(item, true);
    reelStage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  start.addEventListener('click', load);
  reelStage.hidden = false;
  select(current, false);

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'reel-navigate') {
      const { surface, tab, href } = event.data;
      const surfaceToDemo = {
        'exec-overview': 'exec-overview',
        'pathways': 'people-leaders',
        'leadership': 'people-leaders',
        'multiplication': 'people-leaders',
        'people': 'people-leaders',
        'connect-field': 'connect',
        'connect': 'connect',
        'grow': 'grow',
        'finance': 'finance',
        'events': 'events',
        'sunday-report': 'sunday-report',
      };
      let targetSlug = (tab && surfaceToDemo[tab]) || (surface && surfaceToDemo[surface]);
      if (!targetSlug && href) {
        if (href.includes('people') || href.includes('pathways') || href.includes('leadership') || href.includes('multiplication')) targetSlug = 'people-leaders';
        else if (href.includes('connect')) targetSlug = 'connect';
        else if (href.includes('grow')) targetSlug = 'grow';
        else if (href.includes('finance')) targetSlug = 'finance';
        else if (href.includes('events')) targetSlug = 'events';
        else if (href.includes('sunday') || href.includes('TechStats')) targetSlug = 'sunday-report';
        else if (href.includes('overview') || href === '/exec' || href === '/exec/') targetSlug = 'exec-overview';
      }
      if (!targetSlug) targetSlug = 'exec-overview';

      const targetItem = items.find((i) => i.dataset.demo === targetSlug) || items[0];
      let targetHref = targetItem.getAttribute('href');

      if (targetSlug === 'people-leaders') {
        const tabParam = tab || (href && href.match(/[?&]tab=([^&#]+)/)?.[1]) || (surface === 'leadership' ? 'leadership' : surface === 'multiplication' ? 'multiplication' : 'pathways');
        targetHref = `/assets/demos/people-leaders/?tab=${encodeURIComponent(tabParam)}`;
      }

      current = targetItem;
      items.forEach((other) => other.setAttribute('aria-current', String(other === targetItem)));
      name.textContent = targetItem.querySelector('.reel-title').textContent;
      open.href = targetHref;
      const frame = frameBox.querySelector('iframe');
      if (frame) {
        frame.src = targetHref;
        frame.title = `${targetItem.querySelector('.reel-title').textContent}, live demo on invented data`;
      } else {
        load();
      }
      reelStage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
