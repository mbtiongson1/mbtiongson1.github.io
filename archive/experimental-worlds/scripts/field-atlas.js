// Optional chart-state enhancement. All project links and artifacts work without it.
const sections = [...document.querySelectorAll('[data-project]')];
const links = [...document.querySelectorAll('[data-project-link]')];
const route = document.querySelector('.break-route');
const setActive = (id) => {
  document.body.dataset.active = id;
  for (const link of links) {
    if (link.dataset.projectLink === id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (route && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    route.style.strokeDashoffset = id === 'people-compiled' ? '0' : id === 'watershed-study' ? '180' : id === 'automerge-overview' ? '380' : '580';
  }
};
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visible.length) setActive(visible[0].target.dataset.project);
  }, { rootMargin: '-12% 0px -45% 0px', threshold: [0, .2, .5] });
  for (const section of sections) observer.observe(section);
}
for (const link of links) link.addEventListener('click', () => setActive(link.dataset.projectLink));
