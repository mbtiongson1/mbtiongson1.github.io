import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const { projects } = await readJson('data/projects.json');
const { worlds } = await readJson('data/worlds.json');
const homeWorlds = worlds.filter((world) => world.status === 'home');
const disabledWorlds = worlds.filter((world) => world.status === 'disabled');
assert.equal(worlds.length, 6, 'Keep all six world records in source');
assert.equal(homeWorlds.length, 1, 'Exactly one active public experience');
assert.equal(homeWorlds[0].slug, 'screening-room', 'Screening Room owns the public root');
assert.equal(disabledWorlds.length, 5, 'Keep the other five worlds disabled');
assert(projects.length >= 8, 'The selected archive must represent more than the six old web/visual records');
assert.equal(projects[0].id, 'gaia-skill-tree', 'The flagship leads the reel');

for (const world of disabledWorlds) {
  const source = world.slug === 'field-atlas'
    ? path.join(root, 'src/pages/field-atlas.html')
    : path.join(root, `src/pages/worlds/${world.slug}.html`);
  assert(await exists(source), `Disabled world source must remain in the repository: ${world.slug}`);
  assert(!(await exists(path.join(dist, 'worlds', world.slug))), `Disabled world must not be built: ${world.slug}`);
}
assert(!(await exists(path.join(dist, 'data/worlds.json'))), 'Do not publish the retired world switcher registry');
for (const slug of ['field-atlas', 'arcade-marquee', 'dada-contact-sheet', 'vu-meter-bridge', 'classic-index']) {
  assert(!(await exists(path.join(dist, `styles/${slug}.css`))), `Disabled world CSS must not ship: ${slug}`);
  assert(!(await exists(path.join(dist, `scripts/${slug}.js`))), `Disabled world script must not ship: ${slug}`);
}
assert(!(await exists(path.join(dist, 'scripts/dada-contact-sheet.js'))), 'Disabled world scripts must not ship');

const home = await readFile(path.join(dist, 'index.html'), 'utf8');
assert(home.includes('mbtiongson1'), 'Portfolio wordmark uses the handle');
assert(!home.includes('MRBT'), 'Retired monogram is removed from the live homepage');
assert(home.includes('Founder story') && home.includes('Skills should carry their maker'), 'Founder story is present and findable');
assert(home.includes('Beyond the browser'), 'Non-website work has a dedicated section');
assert(!/href="\/worlds\//.test(home), 'No disabled world route is linked from the live homepage');
assert(!home.includes('One body of work.') && !home.includes('Six ways in.'), 'The old six-world lobby is not the public portfolio');
assert(!home.includes('{{'), 'Homepage has no unresolved template slot');

for (const project of projects) {
  assert(home.includes(`id="${escape(project.id)}"`), `Homepage omits ${project.id}`);
  assert(home.includes(escape(project.title)), `Homepage omits title ${project.title}`);
  assert(home.includes(escape(project.disclosure)), `Homepage omits adjacent disclosure for ${project.id}`);
  if (project.live) assert(home.includes(`href="${escape(project.live.url)}"`), `Homepage omits live link for ${project.id}`);
  for (const link of project.links || []) assert(home.includes(`href="${escape(link.url)}"`), `Homepage omits source/support link for ${project.id}`);
  if (project.caseStudy) assert(home.includes(`href="${escape(project.caseStudy.url)}"`), `Homepage omits the case study for ${project.id}`);
  if (project.media) {
    assert(home.includes(`src="${escape(project.media.src)}"`), `Homepage omits media for ${project.id}`);
    assert(await exists(path.join(dist, `${project.media.src.slice(1)}.json`)), `Missing image provenance: ${project.media.src}`);
  }
  if (project.demo) {
    assert(home.includes(`src="${escape(project.demo.url)}"`), `Homepage omits interactive demo for ${project.id}`);
    assert(home.includes('sandbox="allow-scripts allow-downloads"'), 'Local dashboard demo must remain sandboxed');
  }
}
assert(home.indexOf('id="gaia-skill-tree"') < home.indexOf('id="connect-health"'), 'The flagship precedes the dashboard demo');
assert(home.includes('data-rung-explorer') && home.includes('data-lab-explorer') && home.includes('data-lab="craft"') && home.includes('data-lab="diet"') && home.includes('data-protocol-explorer') && home.includes('terminal-replay'), 'Beyond-the-browser explainers are present');
assert(home.includes('https://research.gaiaskilltree.com/labs/infinite-skill-craft') && home.includes('https://research.gaiaskilltree.com/labs/context-diet'), 'Gaia Research live labs must be directly reachable');
assert(!/<iframe[^>]+src="https:\/\/(?:gaiaskilltree|research\.gaiaskilltree)/i.test(home), 'External Gaia sites must be links, not embedded frames');

const projectData = await readJson('data/projects.json');
const publishedData = await readJson('dist/data/projects.json');
assert.deepEqual(publishedData, projectData, 'The client-side reel must use the same reviewed project archive');
const localFiles = await readdir(path.join(dist, 'styles'));
assert(localFiles.includes('screening-room.css') && localFiles.includes('portfolio-home.css'), 'Screening Room styles are missing');
const scripts = await readdir(path.join(dist, 'scripts'));
assert(scripts.includes('screening-room.js') && scripts.includes('portfolio-systems.js'), 'Portfolio interaction scripts are missing');
const connect = projects.find((project) => project.id === 'connect-health');
const skillTree = projects.find((project) => project.id === 'gaia-skill-tree');
const research = projects.find((project) => project.id === 'gaia-research');
const heaven = projects.find((project) => project.id === 'skill-heaven');
assert(connect?.demo?.url === '/assets/demos/connect-health/index.html', 'Connect Health must use its local interactive demo');
assert(connect.disclosure.toLowerCase().includes('fictional') && connect.disclosure.toLowerCase().includes('not connected'), 'Connect Health disclosure must be adjacent and explicit');
assert(skillTree?.live?.url === 'https://gaiaskilltree.com/' && skillTree.caseStudy?.url === '/work/gaia-skill-tree/', 'Gaia Skill Tree must be the flagship with a full case study');
assert(skillTree.links?.some((link) => link.url === 'https://gaiaskilltree.com/u/mbtiongson1/'), 'The founder’s live Gaia skill-tree profile must be directly linked');
assert(research?.live?.url === 'https://research.gaiaskilltree.com/' && heaven?.live?.url === 'https://gaia-research.github.io/gaia-skill-heaven/', 'Gaia Research and Skill Heaven public links must be present');

const connectDir = path.join(dist, 'assets/demos/connect-health');
const connectFiles = await readdir(connectDir);
assert(connectFiles.includes('index.html') && connectFiles.includes('connect-health.js') && connectFiles.includes('connect-health.css'), 'Connect Health demo package is incomplete');
for (const file of connectFiles.filter((name) => /\.(?:html|css|js|json)$/i.test(name))) {
  const text = await readFile(path.join(connectDir, file), 'utf8');
  assert(!/https?:\/\//i.test(text), `Connect Health local demo must not make remote connections: ${file}`);
  assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|connect\.favor\.church|dashboard_prod_read|bundle-snapshot/i.test(text), `Connect Health demo leaks a production/network pathway: ${file}`);
}
const connectHtml = await readFile(path.join(connectDir, 'index.html'), 'utf8');
const connectCss = await readFile(path.join(connectDir, 'connect-health.css'), 'utf8');
assert(connectHtml.includes('FICTIONAL LOCAL DATA') && connectHtml.includes('NOT CONNECTED TO ROCK'), 'Connect Health demo must disclose synthetic/offline scope inside the iframe');
assert(connectCss.includes('@font-face') && connectCss.includes('font-favorvetica-normal-normal.otf') && connectCss.includes('font-favor-sans-normal-normal.otf'), 'Connect Health must load the local Favor display/body fonts');
for (const font of [
  'font-favorvetica-normal-normal.otf', 'font-favorvetica-bold-normal.otf',
  'font-favor-sans-normal-normal.otf', 'font-favor-sans-bold-normal.otf',
]) assert(await exists(path.join(dist, 'assets/demos/people-compiled', font)), `Shared local Favor font is missing: ${font}`);

const gaiaSource = path.join(root, 'src/pages/work/gaia-skill-tree.html');
const gaiaOutput = path.join(dist, 'work/gaia-skill-tree/index.html');
if (await exists(gaiaSource)) {
  assert(await exists(gaiaOutput), 'Full Gaia Skill Tree case study was not emitted');
  const caseHtml = await readFile(gaiaOutput, 'utf8');
  assert(caseHtml.includes('Creator and maintainer') || caseHtml.includes('Creator & maintainer'), 'Case study must name the documented owner role');
  assert(caseHtml.includes('https://gaiaskilltree.com/') && caseHtml.includes('https://gaiaskilltree.com/u/mbtiongson1/') && caseHtml.includes('https://github.com/gaia-research/gaia-skill-tree'), 'Case study must link to the real product, owner profile, and source');
  assert(caseHtml.includes('mbtiongson1') && !caseHtml.includes('MRBT'), 'Case-study identity must use the owner-selected handle');
  assert(!/href="\/worlds\//.test(caseHtml), 'Case study must not link disabled worlds');
  assert(!caseHtml.includes('{{'), 'Case study has no unresolved slots');
} else if (process.argv.includes('--release')) {
  assert.fail('Release blocked: full Gaia Skill Tree case study source is absent');
}

for (const project of projects.map((entry) => entry).filter((entry) => entry.demo)) {
  const demoPath = path.join(dist, project.demo.url.slice(1));
  assert(await exists(demoPath), `Missing local demo: ${project.demo.url}`);
}
const people = projects.find((project) => project.id === 'people-compiled');
if (people) {
  const peopleDir = path.join(dist, 'assets/demos/people-compiled');
  const peopleHtml = await readFile(path.join(peopleDir, 'favor-people-compiled.html'), 'utf8');
  assert(people.disclosure.toLowerCase().includes('fictional') && peopleHtml.includes('"fictional":true'), 'People demo must remain explicitly fictional');
  assert(!/\bfetch\s*\(|\bXMLHttpRequest\s*\(|\bWebSocket\s*\(/.test(peopleHtml), 'People demo must not make network requests');
  for (const name of ['texture-grain.webp', 'texture-paper.webp']) assert(await exists(path.join(peopleDir, `${name}.json`)), `Missing texture provenance: ${name}`);
}

const placeholders = /not yet built|in preparation \/ route reserved|preview route open/i.test(home);
assert(!placeholders, 'The live portfolio may not show a world placeholder');
if (process.argv.includes('--release')) {
  assert(await exists(gaiaSource) && await exists(gaiaOutput), 'Release requires the full flagship case study');
  assert(await exists(path.join(connectDir, 'index.html')), 'Release requires the offline interactive Connect Health demo');
}
console.log(`PASS: Screening Room root, ${projects.length} project records, ${disabledWorlds.length} preserved-but-unbuilt worlds, founder story, non-web explainers, local dashboard safety and media provenance`);
