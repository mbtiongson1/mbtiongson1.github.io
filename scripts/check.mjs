import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const { projects } = JSON.parse(await readFile(path.join(root, 'data/projects.json'), 'utf8'));
const { worlds } = JSON.parse(await readFile(path.join(root, 'data/worlds.json'), 'utf8'));
const pages = ['index.html', ...worlds.map((w) => `worlds/${w.slug}/index.html`)];
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
for (const page of pages) {
  const html = await readFile(path.join(dist, page), 'utf8');
  for (const world of worlds) assert(html.includes(`/worlds/${world.slug}/`), `${page}: missing ${world.name} route`);
  assert(!html.includes('{{'), `${page}: unresolved template slot`);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const [pathname, fragment] = match[1].split('#');
    const file = path.join(dist, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
    assert(await exists(file), `${page}: missing ${pathname}`);
    if (fragment && pathname === `/${page.replace(/index.html$/, '')}`) assert(html.includes(`id="${fragment}"`), `${page}: missing #${fragment}`);
  }
}
const atlas = await readFile(path.join(dist, 'worlds/field-atlas/index.html'), 'utf8');
for (const project of projects) {
  assert(atlas.includes(`id="${project.id}"`), `Atlas missing ${project.title}`);
  assert(atlas.includes(project.disclosure.replaceAll('&', '&amp;').replaceAll('—', '—')), `Atlas missing disclosure: ${project.title}`);
}
assert(atlas.includes('sandbox="allow-scripts allow-downloads"'), 'Demo iframe lacks sandbox');
assert(atlas.includes('aria-label="Project index"'), 'Named project index missing');
for (const world of worlds.filter((w) => w.status === 'coming-next')) {
  const html = await readFile(path.join(dist, `worlds/${world.slug}/index.html`), 'utf8');
  assert(html.includes('not yet built'), `${world.name} must be an honest placeholder`);
}
const demoDir = path.join(dist, 'assets/demos/people-compiled');
const demoFiles = await readdir(demoDir);
assert(!demoFiles.some((name) => name.includes('-live.') || name.includes('source')), 'Disallowed demo content');
const demo = await readFile(path.join(demoDir, 'favor-people-compiled.html'), 'utf8');
assert(demo.includes('"fictional":true') && demo.includes('Fictional prototype data.'), 'Demo lacks fictional flag');
assert(!/\bfetch\s*\(|\bXMLHttpRequest\s*\(|\bWebSocket\s*\(/.test(demo), 'Demo makes network requests');
for (const media of projects.map((p) => p.media).filter(Boolean)) {
  assert(await exists(path.join(dist, `${media.src.slice(1)}.json`)), `Missing image provenance: ${media.src}`);
}
for (const name of ['texture-grain.webp', 'texture-paper.webp']) assert(await exists(path.join(demoDir, `${name}.json`)), `Missing texture provenance: ${name}`);
console.log(`PASS: ${pages.length} static routes, all six world links, ${projects.length} records/disclosures, local assets, demo boundary and image provenance`);
