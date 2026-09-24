import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const release = process.argv.includes('--release');
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
}))).flat();

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const css = await readFile(path.join(dist, 'styles/site.css'), 'utf8');
const js = await readFile(path.join(dist, 'scripts/site.js'), 'utf8');
const visible = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<[^>]+>/g, ' ');

// Hierarchy: identity, then Favor Home, Favor Dashboards, Gaia, then the quiet archive.
const order = ['id="top"', 'id="favor-home"', 'id="favor-dashboards"', 'id="gaia"', 'id="ml"', 'id="earlier"', 'id="about"'].map((id) => html.indexOf(id));
assert(order.every((index) => index > 0), 'A primary section is missing');
assert(order.every((index, i) => i === 0 || index > order[i - 1]), 'Sections are out of order: opening → Favor Home → Dashboards → Gaia → machine learning → tools → about');
assert(/<section class="opening"[\s\S]*?class="home-stage"[\s\S]*?<\/section>/.test(html), 'The Favor Home artifact must sit in the opening viewport');
assert(/<section class="chapter chapter--home"[\s\S]*?data-lens-stage[\s\S]*?<\/section>/.test(html), 'The Favor, by People island belongs inside the Favor Home chapter');
assert.equal((html.match(/class="chapter /g) || []).length, 4, 'Exactly four primary bodies of work');
for (const layer of ['Research', 'Registry', 'Runtime']) assert(html.includes(`<span class="p-step">${layer}.</span>`), `Gaia must read as Research → Registry → Runtime (${layer})`);
assert(html.indexOf('>Research.<') < html.indexOf('>Registry.<') && html.indexOf('>Registry.<') < html.indexOf('>Runtime.<'), 'Gaia layers out of order');
for (const step of ['Truth', 'Legibility', 'Action', 'Proof']) assert(html.includes(`<span class="p-step">${step}.</span>`), `Dashboards principle missing: ${step}`);

// Voice and naming: first person, no concept branding, the formal name only in metadata and the footer.
const banned = [/field atlas/i, /screening room/i, /project reel/i, /\bon screen\b/i, /world[- ]select/i, /choose another lens/i, /all worlds/i, /expedition/i, /founder story/i, /marcus built/i, /what marcus/i, /\bMRBT\b/, /\bworlds?\b/i];
for (const [label, text] of [['index.html', visible], ['site.css', css], ['site.js', js]]) {
  for (const pattern of banned) assert(!pattern.test(text), `${label}: retired public language ${pattern}`);
}
assert((visible.match(/\bI\b|\bI'm\b|\bmy\b/g) || []).length >= 15, 'Primary copy should be first person');
assert((visible.match(/Marcus Rafael B\. Tiongson/g) || []).length === 1 && /<footer[\s\S]*Marcus Rafael B\. Tiongson/.test(html), 'Formal name belongs in the footer only');

// Retired experimental sources stay in the repository but never ship.
for (const slug of ['field-atlas', 'screening-room', 'arcade-marquee', 'dada-contact-sheet', 'vu-meter-bridge', 'classic-index']) {
  assert(!(await exists(path.join(dist, 'worlds', slug))), `Retired route shipped: ${slug}`);
  assert(!(await exists(path.join(dist, 'styles', `${slug}.css`))), `Retired stylesheet shipped: ${slug}`);
}
assert(await exists(path.join(root, 'archive/experimental-worlds/pages/field-atlas.html')), 'Archived source for the earlier explorations should remain in the repository');
assert(!(await exists(path.join(dist, 'data'))), 'No catalogue data ships');
// Live demos: static fictional-data builds only, never a production host or a remote request.
const demoFiles = (await walk(path.join(dist, 'assets/demos'))).filter((file) => /\.(html|js|css|json)$/i.test(file));
for (const file of demoFiles) {
  const text = await readFile(file, 'utf8');
  assert(!/rock-preview|rock\.favor\.church|connect\.favor\.church|ROCKPROD|dashboard_prod_read/i.test(text), `Demo leaks internal infrastructure: ${path.relative(dist, file)}`);
}
for (const [, slug] of html.matchAll(/data-demo="([^"]+)"/g)) assert(await exists(path.join(dist, 'assets/demos', slug, 'index.html')), `Missing demo: ${slug}`);

// Links: https only, new tabs isolated, and nothing pointing into private Favor repositories.
for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  assert(href, `Anchor without href: ${tag}`);
  assert(/^(#|\/|https:\/\/)/.test(href), `Unsafe link: ${href}`);
  if (tag.includes('target="_blank"')) assert(tag.includes('rel="noopener noreferrer"'), `New-tab link without rel: ${href}`);
  assert(!/github\.com\/favorchurch/i.test(href), `Private repository linked (404s for visitors): ${href}`);
  if (href.startsWith('#')) assert(html.includes(`id="${href.slice(1)}"`), `Broken fragment: ${href}`);
}
assert(!/<iframe/i.test(html), 'No static frames: live demos load only on request, from local fictional builds');

// Publication boundary: no production hosts, internal identifiers or network calls.
for (const [label, text] of [['index.html', html], ['site.js', js]]) {
  assert(!/rock-preview|rock\.favor\.church|dashboard_prod_read|DashboardProdRead|RockDashboardBackups|E:\\\\www/i.test(text), `${label}: internal infrastructure leaked`);
}
assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(js), 'Site script must make no network requests');
for (const figure of ['class="home-stage"', 'data-lens-stage', 'class="suite"']) {
  const block = html.slice(html.indexOf(figure), html.indexOf('</figure>', html.indexOf(figure)));
  assert(block.includes('class="boundary"') && /invented numbers/i.test(block), `Favor artifact lacks an adjacent boundary: ${figure}`);
}

// Provenance: every shipped raster has a sidecar, cites no local machine path, and every image in the page exists.
const rasters = (await walk(path.join(dist, 'assets/media'))).filter((file) => /\.(webp|png|jpe?g|avif)$/i.test(file));
for (const file of rasters) {
  const sidecar = `${file}.json`;
  assert(await exists(sidecar), `Missing provenance: ${path.relative(dist, file)}`);
  const { prompt } = JSON.parse(await readFile(sidecar, 'utf8'));
  assert(typeof prompt === 'string' && prompt.length > 40, `Thin provenance: ${path.relative(dist, file)}`);
  assert(!/\/Users\/|C:\\\\/.test(prompt), `Provenance cites a local machine path: ${path.relative(dist, file)}`);
  if (file.includes(`${path.sep}favor${path.sep}`)) assert(/fictional|invented/i.test(prompt), `Favor raster must be fictional-data evidence: ${path.relative(dist, file)}`);
}
const referenced = [...html.matchAll(/src="(\/assets\/media\/[^"]+)"/g)].map((match) => match[1]);
const lensImages = ['age', 'connection', 'gender', 'campus'].map((lens) => `/assets/media/favor/home-favor-by-people-${lens}.webp`);
for (const url of [...referenced, ...lensImages]) assert(await exists(path.join(dist, url)), `Missing image: ${url}`);
for (const file of rasters) {
  const url = `/${path.relative(dist, file).split(path.sep).join('/')}`;
  assert(referenced.includes(url) || lensImages.includes(url), `Unreferenced raster ships: ${url}`);
}

// Accessibility floor: named landmarks, one h1, described images, keyboard-reachable enhancement.
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Exactly one h1');
assert(html.includes('class="skip-link" href="#main"') && html.includes('<main id="main">'), 'Skip link must reach main');
for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) assert(/\salt="[^"]{12,}"/.test(tag), `Image needs a real description: ${tag.slice(0, 100)}`);
assert(/data-lens-switch[^>]*hidden|hidden[^>]*data-lens-switch/.test(html), 'Lens switch stays hidden until the script can run it (no-JS fallback)');
assert(css.includes('prefers-reduced-motion:reduce') && css.includes(':focus-visible'), 'Reduced motion and focus styles are required');
assert(await exists(path.join(dist, '404.html')), '404 page missing');

if (release) {
  // Release: nothing provisional, and the page stays light.
  assert(!/\b(TODO|TBD|FIXME|lorem ipsum)\b|\[placeholder\]/i.test(visible), 'Release blocked: provisional copy');
  const total = (await Promise.all((await walk(dist)).filter((file) => !file.includes(`${path.sep}demos${path.sep}`)).map(async (file) => (await stat(file)).size))).reduce((a, b) => a + b, 0);
  assert(total < 4_500_000, `Release blocked: dist is ${(total / 1e6).toFixed(2)} MB (budget 4.5 MB)`);
  for (const file of rasters) assert((await stat(file)).size < 300_000, `Release blocked: oversized raster ${path.relative(dist, file)}`);
  const design = await readFile(path.join(root, 'DESIGN.md'), 'utf8');
  assert(!/field atlas|six[- ]world/i.test(design.split('\n').slice(0, 12).join('\n')), 'Release blocked: DESIGN.md still describes the retired system');
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert(!/six independently art-directed/i.test(readme), 'Release blocked: README still describes the retired system');
}

console.log(`PASS${release ? ' (release)' : ''}: hierarchy, first-person voice, retired language absent, ${rasters.length} rasters with provenance, link and publication boundaries, accessibility floor`);
