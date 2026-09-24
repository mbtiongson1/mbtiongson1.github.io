import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const local = (url) => typeof url === 'string' && /^\/[a-z0-9/_-]+(?:\.[a-z0-9]+)?$/i.test(url) && !url.includes('..');
const external = (url) => typeof url === 'string' && /^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/?#&=._~%-]*)?$/i.test(url);
const fill = (template, values) => template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Unknown template slot: ${key}`);
  return values[key];
});
const exists = async (relative) => {
  try { await stat(path.join(root, relative)); return true; } catch { return false; }
};

const { projects, schemaVersion: projectVersion } = JSON.parse(await read('data/projects.json'));
const { worlds, schemaVersion: worldVersion } = JSON.parse(await read('data/worlds.json'));
if (projectVersion !== 1 || worldVersion !== 1) throw new Error('Unsupported catalog version');
if (!Array.isArray(projects) || !projects.length || !Array.isArray(worlds) || worlds.length !== 6) throw new Error('Expected a shared project archive and six retained world records');
const unique = (values) => new Set(values).size === values.length;
if (!unique(projects.map((p) => p.id)) || !unique(worlds.map((w) => w.slug))) throw new Error('Duplicate project or world slug');
const homeWorlds = worlds.filter((world) => world.status === 'home');
if (homeWorlds.length !== 1 || homeWorlds[0].slug !== 'screening-room' || worlds.filter((world) => world.status === 'disabled').length !== 5) {
  throw new Error('Screening Room must be the single built world; all five other world sources stay disabled');
}
for (const world of worlds) {
  if (!/^[a-z0-9-]+$/.test(world.slug) || !['home', 'disabled'].includes(world.status)) throw new Error(`Invalid world status: ${world.slug}`);
  const source = world.slug === 'field-atlas' ? 'src/pages/field-atlas.html' : `src/pages/worlds/${world.slug}.html`;
  if (!(await exists(source))) throw new Error(`Missing retained source for ${world.slug}: ${source}`);
}
const homeWorld = homeWorlds[0];
const caseStudySources = new Map([
  ['/work/gaia-skill-tree/', 'src/pages/work/gaia-skill-tree.html'],
]);

for (const project of projects) {
  if (!/^[a-z0-9-]+$/.test(project.id) || project.visibility !== 'public') throw new Error(`Unpublishable project: ${project.id}`);
  for (const key of ['title', 'kind', 'summary', 'context', 'disclosure']) if (!project[key]) throw new Error(`Missing ${key}: ${project.id}`);
  const links = Array.isArray(project.links) ? project.links : [];
  if (!project.media && !project.demo && !project.live && !project.caseStudy && !links.length) throw new Error(`Project has no local artifact, case study, or verified public link: ${project.id}`);
  for (const item of [project.media?.src, project.demo?.url].filter(Boolean)) {
    if (!local(item)) throw new Error(`Unsafe or nonlocal artifact URL: ${item}`);
    await stat(path.join(root, item.slice(1)));
  }
  if (project.caseStudy) {
    if (!local(project.caseStudy.url) || !project.caseStudy.label) throw new Error(`Incomplete local case-study link: ${project.id}`);
    const caseSource = caseStudySources.get(project.caseStudy.url);
    if (!caseSource || !(await exists(caseSource))) throw new Error(`Missing case-study source for ${project.id}: ${project.caseStudy.url}`);
  }
  if (project.media && (!project.media.alt || !project.media.caption || !project.media.width || !project.media.height)) throw new Error(`Incomplete image record: ${project.id}`);
  if (project.demo && (project.demo.type !== 'local-html' || !project.demo.label || !project.demo.frameLabel)) throw new Error(`Incomplete local demo record: ${project.id}`);
  if (project.live && (!external(project.live.url) || !project.live.label || !/^\d{4}-\d{2}-\d{2}$/.test(project.live.verifiedAt))) throw new Error(`Unverified live link: ${project.id}`);
  if (links.some((link) => !external(link.url) || !link.label || !/^\d{4}-\d{2}-\d{2}$/.test(link.verifiedAt))) throw new Error(`Unverified source or supporting link: ${project.id}`);
}

const indexLinks = projects.map((project) => `<li><a href="#${escape(project.id)}" data-project-link="${escape(project.id)}"><span class="index-pin" aria-hidden="true"></span><span class="index-title">${escape(project.title)}</span><span class="index-kind">${escape(project.kind)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h15m-6-6 6 6-6 6"/></svg></a></li>`).join('');
const externalIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15 15 5M6 5h9v9"/></svg>';
const actionLink = (url, label, externalLink = false) => `<a class="artifact-open" href="${escape(url)}"${externalLink ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)} ${externalIcon}${externalLink ? '<span class="sr-only"> (opens in a new tab)</span>' : ''}</a>`;
const projectLink = (project) => {
  const actions = [];
  if (project.demo) actions.push(actionLink(project.demo.url, project.demo.label, true));
  if (project.media) actions.push(actionLink(project.media.src, 'View full-size image', true));
  if (project.live) actions.push(actionLink(project.live.url, project.live.label, true));
  if (project.caseStudy) actions.push(actionLink(project.caseStudy.url, project.caseStudy.label));
  for (const link of project.links || []) actions.push(actionLink(link.url, link.label, true));
  return actions.length ? `<div class="project-actions">${actions.join('')}</div>` : '';
};
const projectArtifact = (project) => {
  if (project.demo) return `<div class="demo-window"><div class="demo-window-bar"><span>${escape(project.demo.frameLabel)}</span><span>Local HTML / sandboxed</span></div><iframe src="${escape(project.demo.url)}${project.demo.previewAnchor ? `#${escape(project.demo.previewAnchor)}` : ''}" title="${escape(project.title)} — ${escape(project.demo.frameLabel)}" loading="lazy" sandbox="allow-scripts allow-downloads" referrerpolicy="no-referrer"></iframe></div>`;
  if (project.media) return `<figure class="image-artifact"><a href="${escape(project.media.src)}" target="_blank" rel="noopener noreferrer" aria-label="Open full-size image for ${escape(project.title)} in a new tab"><img src="${escape(project.media.src)}" width="${project.media.width}" height="${project.media.height}" alt="${escape(project.media.alt)}" loading="lazy" decoding="async"></a><figcaption>${escape(project.media.caption)}</figcaption></figure>`;
  const noteLabel = project.live ? 'Public site / open the actual product' : 'Source / no embedded service';
  const note = project.live ? `${project.title} is available from its public site. This portfolio does not embed or proxy the external service.` : `${project.title} is documented as a repository link. No production service or private system is connected here.`;
  return `<div class="live-artifact-note"><span class="note-label">${escape(noteLabel)}</span><strong>${escape(project.title)}</strong><p>${escape(note)}</p></div>`;
};
const projectSection = (project, lead = false) => `<section class="project-section${lead ? ' project-section--lead' : ''}" id="${escape(project.id)}" aria-labelledby="title-${escape(project.id)}" data-project="${escape(project.id)}"><div class="project-heading"><div><h2 id="title-${escape(project.id)}">${escape(project.title)}</h2><p class="project-kind">${escape(project.kind)}</p></div>${projectLink(project)}</div>${project.role ? `<p class="project-role">${escape(project.role)}</p>` : ''}${lead ? '' : `<p class="project-summary">${escape(project.summary)}</p>`}<p class="disclosure"><strong>About this artifact</strong> ${escape(project.disclosure)}</p>${projectArtifact(project)}${lead ? `<p class="project-summary">${escape(project.summary)}</p>` : ''}<p class="project-context">${escape(project.context)}</p></section>`;

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'data'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
await cp(path.join(root, 'data', 'projects.json'), path.join(out, 'data', 'projects.json'));

const publishStyles = ['screening-room.css', 'portfolio-home.css', 'gaia-skill-tree-case-study.css'];
const publishScripts = ['screening-room.js', 'portfolio-systems.js', 'gaia-skill-tree-case-study.js'];
await mkdir(path.join(out, 'styles'), { recursive: true });
await mkdir(path.join(out, 'scripts'), { recursive: true });
for (const name of publishStyles) if (await exists(`src/styles/${name}`)) await cp(path.join(root, 'src/styles', name), path.join(out, 'styles', name));
for (const name of publishScripts) if (await exists(`src/scripts/${name}`)) await cp(path.join(root, 'src/scripts', name), path.join(out, 'scripts', name));

const homeTemplate = await read(`src/pages/worlds/${homeWorld.slug}.html`);
const homeHtml = fill(homeTemplate, {
  PROJECT_INDEX: indexLinks,
  PROJECT_LEAD: projectSection(projects[0], true),
  PROJECT_REST: projects.slice(1).map((project) => projectSection(project)).join(''),
  PROJECT_COUNT: String(projects.length),
});
await writeFile(path.join(out, 'index.html'), homeHtml);

const caseStudyProjects = projects.filter((project) => project.caseStudy);
for (const project of caseStudyProjects) {
  const source = caseStudySources.get(project.caseStudy.url);
  const directory = path.join(out, project.caseStudy.url.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), await read(source));
}

await writeFile(path.join(out, '.nojekyll'), '');
console.log(`Built the Screening Room portfolio at / plus ${caseStudyProjects.length} case-study route(s); retained ${worlds.filter((world) => world.status === 'disabled').length} disabled world sources; rendered ${projects.length} project records.`);
