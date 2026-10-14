// tools/build.mjs — Vercel build step (`npm run build`, see vercel.json).
// The site used to ship raw JSX and compile it in every visitor's browser with
// Babel Standalone (a ~3 MB download plus 1–3 s of work on a phone). This
// compiles the JSX once at deploy time instead:
//   1. copies the site into public/ (Vercel's output directory)
//   2. compiles every *.jsx to public/build/<name>.js (React classic runtime —
//      same globals and load order as before)
//   3. in public/app.html and public/admin.html, swaps the text/babel tags for
//      the compiled files and drops the Babel Standalone script.
// The repo itself is untouched, so local previews keep working without a build.

import { transformAsync } from '@babel/core';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
// never deployed as static files
const SKIP = new Set(['.git', '.claude', '.vercel', 'node_modules', 'public', 'api', 'tools',
  'package.json', 'package-lock.json', 'vercel.json', 'supabase-setup.sql', 'README.md', '.gitignore', '.gitattributes']);

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'build'), { recursive: true });

const entries = await readdir(ROOT, { withFileTypes: true });
const compiled = {};
for (const e of entries) {
  if (SKIP.has(e.name)) continue;
  const src = path.join(ROOT, e.name);
  if (e.isFile() && e.name.endsWith('.jsx')) {
    const code = await readFile(src, 'utf8');
    const out = await transformAsync(code, {
      filename: e.name, sourceType: 'script', babelrc: false, configFile: false, compact: false,
      presets: [['@babel/preset-react', { runtime: 'classic' }]],
    });
    const name = e.name.replace(/\.jsx$/, '.js');
    await writeFile(path.join(OUT, 'build', name), out.code);
    compiled[e.name] = 'build/' + name + '?v=' + createHash('sha1').update(out.code).digest('hex').slice(0, 10);
    continue;
  }
  await cp(src, path.join(OUT, e.name), { recursive: true });
}

const BABEL_TAG = /<script[^>]*@babel\/standalone[^>]*><\/script>\s*/g;
const JSX_TAG = /<script type="text\/babel" src="([^"]+\.jsx)"><\/script>/g;
for (const page of ['app.html', 'admin.html']) {
  const file = path.join(OUT, page);
  let html = await readFile(file, 'utf8');
  let swapped = 0;
  html = html.replace(JSX_TAG, (m, src) => {
    if (!compiled[src]) throw new Error(page + ' references ' + src + ', which was not compiled');
    swapped++;
    return '<script src="' + compiled[src] + '"></script>';
  });
  html = html.replace(BABEL_TAG, '');
  if (/text\/babel/.test(html)) throw new Error(page + ' still has text/babel scripts');
  await writeFile(file, html);
  console.log(page + ': ' + swapped + ' scripts precompiled');
}
console.log('compiled ' + Object.keys(compiled).length + ' JSX files → public/build/');
