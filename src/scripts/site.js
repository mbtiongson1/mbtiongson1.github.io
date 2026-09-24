// Progressive enhancement only. Every section, link, and image works without this file.
document.documentElement.classList.add('js');

// Favor Home lens switch: swaps between real captures of the island's four lenses.
const stage = document.querySelector('[data-lens-stage]');
if (stage) {
  const lenses = {
    age: 'a donut of 5,995 people and a ruled legend by age band',
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
    const alt = `The Favor, by People island from the staff homepage, ${lens} lens: ${lenses[lens]}. Every count is invented.`;
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
