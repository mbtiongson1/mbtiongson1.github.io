import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/arcade-marquee.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../dist/worlds/arcade-marquee/index.html', import.meta.url), 'utf8');
const records = JSON.parse(await readFile(new URL('../data/projects.json', import.meta.url), 'utf8')).projects;
const minTargetMatch = css.match(/--tap-target-min:\s*(\d+(?:\.\d+)?)rem;/);
assert(minTargetMatch, 'route CSS must define its shared minimum target token');
const minTargetRem = Number(minTargetMatch[1]);
assert(minTargetRem >= 2.75, `--tap-target-min is ${minTargetRem}rem; minimum is 2.75rem / 44px`);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ruleBodies(selector) {
  const pattern = new RegExp(`(?:^|[\\n}])\\s*${escapeRegex(selector)}\\s*\\{([^{}]*)\\}`, 'g');
  return [...css.matchAll(pattern)].map((match) => match[1]);
}

function minHeightRem(value, selector) {
  const token = value.trim().match(/^var\(--tap-target-min\)$/);
  if (token) return minTargetRem;
  const rem = value.trim().match(/^(\d+(?:\.\d+)?)rem$/);
  if (rem) return Number(rem[1]);
  const px = value.trim().match(/^(\d+(?:\.\d+)?)px$/);
  if (px) return Number(px[1]) / 16;
  assert.fail(`${selector} has unsupported min-height declaration: ${value}`);
}

const targets = [
  ['skip link', '.skip-link'],
  ['portfolio brand link', '.maker-lockup'],
  ['world navigation links', '.world-navigation a'],
  ['project-index disclosure summary', '.project-index summary'],
  ['project links', '.project-index a'],
  ['attract-mode button', '.attract-toggle'],
  ['artifact-opening links', '.artifact-open'],
  ['image artifact links', '.image-artifact a'],
  ['footer link', '.arcade-footer a'],
];

for (const [name, selector] of targets) {
  const declarations = ruleBodies(selector).flatMap((body) => [...body.matchAll(/min-height\s*:\s*([^;]+);/g)].map((match) => match[1]));
  assert(declarations.length > 0, `${name} (${selector}) needs an explicit minimum hit height`);
  for (const value of declarations) {
    assert(
      minHeightRem(value, selector) >= minTargetRem,
      `${name} (${selector}) has ${value}; minimum is ${minTargetRem}rem / 44px`,
    );
  }
}

const worldNav = html.match(/<nav class="world-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
assert(worldNav, 'built page must contain the portfolio-world navigation');
assert.equal((worldNav.match(/<a\b/g) ?? []).length, 6, 'all six world links must remain available');
assert.match(html, /<a class="skip-link"/);
assert.match(html, /<a class="maker-lockup"/);
assert.match(html, /<summary class="rail-heading"/);
assert.equal((html.match(/data-project-link=/g) ?? []).length, records.length, 'every catalog record needs a project link');
assert.match(html, /<button class="attract-toggle"/);
assert.match(html, /<a href="\/"[^>]*>Back to all worlds<\/a>/);
assert((html.match(/class="artifact-open"/g) ?? []).length > 0, 'artifact-opening links must exist');
assert((html.match(/<figure class="image-artifact">/g) ?? []).length > 0, 'linked image artifacts must exist');

console.log(`PASS: all ${targets.length} interactive-target groups have explicit min-heights of at least 2.75rem / 44px; built route retains its world links, project links, artifact links, and controls.`);
