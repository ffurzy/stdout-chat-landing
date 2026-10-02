#!/usr/bin/env node
// Renders img/og/<slug>.png (1200×630) for every entry in pages.json with headless Chrome.
// Run from the landing root:  node scripts/og/render.mjs            (all pages)
//                              node scripts/og/render.mjs void guides (only these slugs)
// Needs Google Chrome on this Mac; fonts come from ../../fonts (self-hosted woff2).
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(new URL('../..', import.meta.url).pathname);
const tpl = readFileSync(resolve(root, 'scripts/og/template.html'), 'utf8');
const pages = JSON.parse(readFileSync(resolve(root, 'scripts/og/pages.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
mkdirSync(resolve(root, 'img/og'), { recursive: true });

for (const p of pages) {
  if (only.size && !only.has(p.slug)) continue;
  const html = tpl.replace('{{eyebrow}}', p.eyebrow).replace('{{title}}', p.title).replace('{{sub}}', p.sub);
  // the temp html must live next to the template so the ../../fonts urls resolve
  const tmp = resolve(root, `scripts/og/.render-${p.slug}.html`);
  writeFileSync(tmp, html);
  const out = resolve(root, `img/og/${p.slug}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', `--screenshot=${out}`, `file://${tmp}`], { stdio: 'ignore' });
  execFileSync('rm', [tmp]);
  console.log(`${p.slug}.png  ${Math.round(statSync(out).size / 1024)} KB`);
}
