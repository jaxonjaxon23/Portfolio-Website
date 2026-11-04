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

await rm(OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });   // retries: files can be briefly locked on Windows/OneDrive
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

// ---- image sizes -----------------------------------------------------------
// Measure every image the site shows (live CMS content + bundled content.js)
// so the page can reserve each image's shape before it loads — no layout jumps.
// Reads only the start of each file (enough for the header). Never fails the build.
async function measureImages() {
  const { default: sharp } = await import('sharp');
  const srcs = new Set();
  let liveContent = null;
  const add = (c) => (c && c.projects || []).forEach((p) => (p.gallery || []).forEach((g) => {
    if (g && g.type === 'image' && g.src) srcs.add(g.src);
  }));
  try {
    const vm = await import('node:vm');
    const sandbox = { window: {} };
    vm.runInNewContext(await readFile(path.join(ROOT, 'content.js'), 'utf8'), sandbox);
    add(sandbox.window.SITE_CONTENT);
  } catch (_) {}
  try {
    const cfg = await readFile(path.join(ROOT, 'supabase-config.js'), 'utf8');
    const url = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(cfg) || [])[1];
    const key = (/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(cfg) || [])[1];
    const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/content?id=eq.1&select=data',
      { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(10000) });
    const rows = await r.json();
    liveContent = rows && rows[0] && rows[0].data;
    add(liveContent);
  } catch (e) { console.warn('image sizes: live content unavailable (' + e.message + ')'); }

  // bio "working on" hover images use the small copies too
  const addBio = (c) => ((c && c.bio && c.bio.working) || []).forEach((w) => { if (w && w.img) srcs.add(w.img); });
  try {
    const vm = await import('node:vm');
    const sandbox = { window: {} };
    vm.runInNewContext(await readFile(path.join(ROOT, 'content.js'), 'utf8'), sandbox);
    addBio(sandbox.window.SITE_CONTENT);
  } catch (_) {}
  if (liveContent) addBio(liveContent);

  // Small copies: the projects page shows images ~250px wide, but the files
  // are ~2000px — 8× the pixels to download, decode and hold in memory. A
  // 640px WebP covers a 250px column on a high-density (2.5×) screen.
  const THUMB_W = 640;
  await mkdir(path.join(OUT, 'thumbs'), { recursive: true });
  const dims = {}, thumbs = {};
  const list = [...srcs];
  const one = async (src) => {
    try {
      let buf;
      if (/^https?:\/\//i.test(src)) {
        const r = await fetch(src, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return;
        buf = Buffer.from(await r.arrayBuffer());
      } else {
        buf = await readFile(path.join(ROOT, decodeURIComponent(src.replace(/^\/+/, ''))));
      }
      const m = await sharp(buf, { failOn: 'none' }).metadata();
      if (!m.width || !m.height) return;
      dims[src] = (m.orientation || 1) >= 5 ? [m.height, m.width] : [m.width, m.height];   // EXIF-rotated
      const animated = m.pages > 1;                           // GIF / animated WebP
      if (animated) dims[src] = [m.width, m.pageHeight || m.height];
      const name = 'thumbs/' + createHash('sha1').update(src).digest('hex').slice(0, 16) + '.webp';
      // animated → animated WebP (keeps every frame; e.g. a 16.9 MB GIF → ~1.9 MB)
      await sharp(buf, { failOn: 'none', animated }).rotate()
        .resize({ width: Math.min(THUMB_W, dims[src][0]), withoutEnlargement: true })
        .webp({ quality: animated ? 70 : 78 }).toFile(path.join(OUT, name));
      thumbs[src] = name;
    } catch (_) { /* unknown size / no copy: the page falls back to the original */ }
  };
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(one));
  console.log('images: measured ' + Object.keys(dims).length + ' of ' + list.length +
    ', made ' + Object.keys(thumbs).length + ' small copies');
  return { dims, thumbs };
}

let dimsTag = '';
try {
  const { dims, thumbs } = await measureImages();
  const js = 'window.MEDIA_DIMS = ' + JSON.stringify(dims) + ';\nwindow.MEDIA_THUMBS = ' + JSON.stringify(thumbs) + ';\n';
  await writeFile(path.join(OUT, 'media-dims.js'), js);
  dimsTag = '<script src="media-dims.js?v=' + createHash('sha1').update(js).digest('hex').slice(0, 10) + '"></script>\n';
} catch (e) { console.warn('image sizes skipped: ' + e.message); }

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
  if (page === 'app.html' && dimsTag) html = html.replace(/(<script src="content\.js"><\/script>\r?\n)/, '$1' + dimsTag);
  if (/text\/babel/.test(html)) throw new Error(page + ' still has text/babel scripts');
  await writeFile(file, html);
  console.log(page + ': ' + swapped + ' scripts precompiled');
}
console.log('compiled ' + Object.keys(compiled).length + ' JSX files → public/build/');
