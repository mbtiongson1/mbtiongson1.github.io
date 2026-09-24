import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const local = (url) => typeof url === 'string' && /^\/[a-z0-9/_-]+(?:\.[a-z0-9]+)?$/i.test(url) && !url.includes('..');
const fill = (template, values) => template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Unknown template slot: ${key}`);
  return values[key];
});

const { projects, schemaVersion: projectVersion } = JSON.parse(await read('data/projects.json'));
const { worlds, schemaVersion: worldVersion } = JSON.parse(await read('data/worlds.json'));
if (projectVersion !== 1 || worldVersion !== 1) throw new Error('Unsupported catalog version');
if (!Array.isArray(projects) || !projects.length || !Array.isArray(worlds) || worlds.length !== 6) throw new Error('Expected projects and six worlds');
const unique = (values) => new Set(values).size === values.length;
if (!unique(projects.map((p) => p.id)) || !unique(worlds.map((w) => w.slug))) throw new Error('Duplicate project or world slug');
for (const project of projects) {
  if (!/^[a-z0-9-]+$/.test(project.id) || project.visibility !== 'public') throw new Error(`Unpublishable project: ${project.id}`);
  for (const key of ['title', 'kind', 'summary', 'context', 'disclosure']) if (!project[key]) throw new Error(`Missing ${key}: ${project.id}`);
  if (!project.media && !project.demo && !project.live) throw new Error(`Project has no artifact or verified public link: ${project.id}`);
  for (const item of [project.media?.src, project.demo?.url].filter(Boolean)) {
    if (!local(item)) throw new Error(`Unsafe or nonlocal artifact URL: ${item}`);
    await stat(path.join(root, item.slice(1)));
  }
  if (project.media && (!project.media.alt || !project.media.caption || !project.media.width || !project.media.height)) throw new Error(`Incomplete image record: ${project.id}`);
  if (project.demo && (project.demo.type !== 'local-html' || !project.demo.label)) throw new Error(`Incomplete demo record: ${project.id}`);
  if (project.live && (!/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/?#&=._~%-]*)?$/i.test(project.live.url) || !project.live.label || !/^\d{4}-\d{2}-\d{2}$/.test(project.live.verifiedAt))) throw new Error(`Unverified live link: ${project.id}`);
}
for (const world of worlds) {
  if (!/^[a-z0-9-]+$/.test(world.slug) || !['live', 'coming-next'].includes(world.status)) throw new Error(`Invalid world: ${world.slug}`);
}
const href = (world) => `/worlds/${world.slug}/`;
const worldNav = (current) => worlds.map((world) => `<a href="${href(world)}"${world.slug === current ? ' aria-current="page"' : ''}><span>${escape(world.name)}</span>${world.status === 'coming-next' ? '<small>In preparation</small>' : ''}</a>`).join('');
const indexLinks = projects.map((p) => `<li><a href="#${escape(p.id)}" data-project-link="${escape(p.id)}"><span class="index-pin" aria-hidden="true"></span><span class="index-title">${escape(p.title)}</span><span class="index-kind">${escape(p.kind)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h15m-6-6 6 6-6 6"/></svg></a></li>`).join('');
const externalIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M6 5h9v9"/></svg>';
const projectLink = (p) => (p.demo ? `<a class="artifact-open" href="${escape(p.demo.url)}" target="_blank" rel="noopener noreferrer">${escape(p.demo.label)} ${externalIcon}<span class="sr-only"> (opens in a new tab)</span></a>` : p.media ? `<a class="artifact-open" href="${escape(p.media.src)}" target="_blank" rel="noopener noreferrer">View full-size image ${externalIcon}<span class="sr-only"> (opens in a new tab)</span></a>` : '') + (p.live ? `<a class="artifact-open" href="${escape(p.live.url)}" target="_blank" rel="noopener noreferrer">${escape(p.live.label)} ${externalIcon}<span class="sr-only"> (opens in a new tab)</span></a>` : '');
const projectArtifact = (p) => p.demo ? `<div class="demo-window"><div class="demo-window-bar"><span>Interactive / fictional prototype data</span><span>Compiled HTML</span></div><iframe src="${escape(p.demo.url)}${p.demo.previewAnchor ? `#${escape(p.demo.previewAnchor)}` : ''}" title="${escape(p.title)} — interactive fictional-data prototype" loading="eager" sandbox="allow-scripts allow-downloads" referrerpolicy="no-referrer"></iframe></div>` : p.media ? `<figure class="image-artifact"><a href="${escape(p.media.src)}" target="_blank" rel="noopener noreferrer" aria-label="Open full-size image for ${escape(p.title)} in a new tab"><img src="${escape(p.media.src)}" width="${p.media.width}" height="${p.media.height}" alt="${escape(p.media.alt)}" loading="lazy" decoding="async"></a><figcaption>${escape(p.media.caption)}</figcaption></figure>` : `<p class="live-artifact-note">External public website · No local image or embed.</p>`;
const projectSection = (p, lead = false) => `<section class="project-section${lead ? ' project-section--lead' : ''}" id="${escape(p.id)}" aria-labelledby="title-${escape(p.id)}" data-project="${escape(p.id)}"><div class="project-heading"><div><h2 id="title-${escape(p.id)}">${escape(p.title)}</h2><p class="project-kind">${escape(p.kind)}</p></div>${projectLink(p)}</div>${lead ? '' : `<p class="project-summary">${escape(p.summary)}</p>`}<p class="disclosure"><strong>About this artifact</strong> ${escape(p.disclosure)}</p>${projectArtifact(p)}${lead ? `<p class="project-summary">${escape(p.summary)}</p>` : ''}<p class="project-context">${escape(p.context)}</p></section>`;

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'worlds'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
await cp(path.join(root, 'src', 'styles'), path.join(out, 'styles'), { recursive: true });
await cp(path.join(root, 'src', 'scripts'), path.join(out, 'scripts'), { recursive: true });
await cp(path.join(root, 'data'), path.join(out, 'data'), { recursive: true });
const caseStudy = await read('src/pages/work/gaia-skill-tree.html');
await mkdir(path.join(out, 'work', 'gaia-skill-tree'), { recursive: true });
await writeFile(path.join(out, 'work', 'gaia-skill-tree', 'index.html'), caseStudy);
const hub = await read('src/pages/hub.html');
const selected = worlds[0];
const departures = worlds.slice(1).map((world) => `<li><a href="${href(world)}"><span class="departure-name">${escape(world.name)}</span><span class="departure-note">${escape(world.description)}</span><span class="departure-status">Enter experience <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h15m-6-6 6 6-6 6"/></svg></span></a></li>`).join('');
await writeFile(path.join(out, 'index.html'), fill(hub, { WORLD_NAV: worldNav(''), FEATURE_HREF: href(selected), DEPARTURES: departures, PROJECT_COUNT: String(projects.length) }));
const field = await read('src/pages/field-atlas.html');
const next = await read('src/pages/coming-next.html');
for (const world of worlds) {
  const templatePath = `src/pages/worlds/${world.slug}.html`;
  let template;
  try { template = await read(templatePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    template = world.slug === 'field-atlas' ? field : next;
  }
  const html = fill(template, {
    WORLD_NAV: worldNav(world.slug),
    WORLD_NAME: escape(world.name),
    WORLD_DESCRIPTION: escape(world.description),
    PROJECT_INDEX: indexLinks,
    PROJECT_LEAD: projectSection(projects[0], true),
    PROJECT_REST: projects.slice(1).map((p) => projectSection(p)).join(''),
    PROJECT_LINKS: projects.map((p) => `<li><a href="/worlds/field-atlas/#${escape(p.id)}">${escape(p.title)}<span>${escape(p.kind)}</span></a></li>`).join('')
  });
  const directory = path.join(out, 'worlds', world.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
}
await writeFile(path.join(out, '.nojekyll'), '');
console.log(`Built ${worlds.length + 1} routes and ${projects.length} shared project records into dist/`);
