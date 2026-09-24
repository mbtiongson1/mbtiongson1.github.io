import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const local = (url) => /^\/[a-z0-9/_.-]*$/i.test(url) && !url.includes('..');
const external = (url) => /^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/?#&=._~%+-]*)?$/i.test(url);

const page = await read('src/pages/index.html');
if (page.includes('{{')) throw new Error('index.html: unresolved template slot');

// Every image is dimensioned and described before it can ship.
for (const [tag] of page.matchAll(/<img\b[^>]*>/g)) {
  for (const attr of ['src', 'alt', 'width', 'height']) {
    if (!new RegExp(`\\s${attr}="[^"]+"`).test(tag)) throw new Error(`Image missing ${attr}: ${tag.slice(0, 120)}`);
  }
}
// Local references must resolve against the source tree; external ones must be https.
for (const [, url] of page.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
  if (url.startsWith('/')) {
    if (!local(url)) throw new Error(`Unsafe local URL: ${url}`);
    const relative = url.replace(/^\/(styles|scripts)\//, 'src/$1/').replace(/^\//, '');
    if (!(await exists(path.join(root, relative)))) throw new Error(`Missing local file: ${url}`);
  } else if (!external(url)) {
    throw new Error(`External URL must be plain https: ${url}`);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const dir of ['fonts', 'media', 'chart', 'demos']) await cp(path.join(root, 'assets', dir), path.join(out, 'assets', dir), { recursive: true });
await cp(path.join(root, 'assets', 'mark.svg'), path.join(out, 'assets', 'mark.svg'));
await cp(path.join(root, 'src', 'styles'), path.join(out, 'styles'), { recursive: true });
await cp(path.join(root, 'src', 'scripts'), path.join(out, 'scripts'), { recursive: true });
await writeFile(path.join(out, 'index.html'), page);
await writeFile(path.join(out, '404.html'), await read('src/pages/404.html'));
await writeFile(path.join(out, '.nojekyll'), '');
console.log('Built index.html, 404.html, styles, scripts and reviewed assets into dist/');
