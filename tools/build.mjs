// tools/build.mjs — Vercel build step (`npm run build`, see vercel.json).
// Turns the repo into the deployed site in public/ (Vercel's output directory):
//   1. copies the site files into public/
//   2. compiles every *.jsx (React classic runtime — same globals as before)
//   3. measures every image and makes smaller copies of it:
//        thumbs/  640px  — the projects board (images show ~250px wide)
//        sizes/   1280px / 1920px — project pages, picked by the browser
//      File names include a hash of the image's bytes, so they can be cached
//      forever: a changed image gets a new name.
//   4. app.html: React (self-hosted, was unpkg) goes into build/vendor-<hash>.js
//      and every site script, in page order, into one minified
//      build/site-<hash>.js — 2 requests instead of ~17, and both cacheable
//      for a year because a change gives them a new name. The Tweaks panel
//      (design-tool only) is replaced by a tiny stub (tools/tweaks-stub.js).
//   5. admin.html: precompiled JSX, production React.
// The repo itself is untouched, so local previews keep working without a build.

import { transformAsync } from '@babel/core';
import { transform as esbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchLiveContent, contentJs } from './content-snapshot.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
const hash = (s, n = 10) => createHash('sha1').update(s).digest('hex').slice(0, n);
// never deployed as static files
const SKIP = new Set(['.git', '.claude', '.vercel', 'node_modules', 'public', 'api', 'tools',
  'package.json', 'package-lock.json', 'vercel.json', 'supabase-setup.sql', 'README.md', '.gitignore', '.gitattributes']);

// the live CMS content: the deployed content.js fallback is refreshed from it,
// and every image it uses gets measured and copied (step 3)
let live = null;
try { live = await fetchLiveContent(); } catch (e) { console.warn('live content unavailable (' + e.message + ') — using the repo content.js'); }

await rm(OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });   // retries: files can be briefly locked on Windows/OneDrive
await mkdir(path.join(OUT, 'build'), { recursive: true });

// ---- 1 + 2: copy files, compile JSX ------------------------------------------
const entries = await readdir(ROOT, { withFileTypes: true });
const compiledCode = {};   // 'x.jsx' -> compiled source
const compiledUrl = {};    // 'x.jsx' -> 'build/x.js?v=hash' (used by admin.html)
for (const e of entries) {
  if (SKIP.has(e.name)) continue;
  const src = path.join(ROOT, e.name);
  if (e.isFile() && e.name.endsWith('.jsx')) {
    const out = await transformAsync(await readFile(src, 'utf8'), {
      filename: e.name, sourceType: 'script', babelrc: false, configFile: false, compact: false,
      presets: [['@babel/preset-react', { runtime: 'classic' }]],
    });
    const name = e.name.replace(/\.jsx$/, '.js');
    await writeFile(path.join(OUT, 'build', name), out.code);
    compiledCode[e.name] = out.code;
    compiledUrl[e.name] = 'build/' + name + '?v=' + hash(out.code);
    continue;
  }
  await cp(src, path.join(OUT, e.name), { recursive: true });
}

if (live) await writeFile(path.join(OUT, 'content.js'), contentJs(live));

// ---- 3: image sizes and smaller copies ----------------------------------------
// Every image the site shows (live CMS content + bundled content.js), so the
// page can reserve each image's shape before it loads, and show a copy no
// bigger than it needs. Never fails the build: an image without copies just
// falls back to the original.
async function processImages() {
  const { default: sharp } = await import('sharp');
  const vm = await import('node:vm');
  const srcs = new Set();
  const addGallery = (c) => ((c && c.projects) || []).forEach((p) => (p.gallery || []).forEach((g) => {
    if (g && g.type === 'image' && g.src) srcs.add(g.src);
  }));
  // bio "working on" hover images use the small copies too
  const addBio = (c) => ((c && c.bio && c.bio.working) || []).forEach((w) => { if (w && w.img) srcs.add(w.img); });
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(await readFile(path.join(ROOT, 'content.js'), 'utf8'), sandbox);
    addGallery(sandbox.window.SITE_CONTENT); addBio(sandbox.window.SITE_CONTENT);
  } catch (_) {}
  if (live) { addGallery(live); addBio(live); }

  const THUMB_W = 640;          // covers a 250px board column on a 2.5x screen
  const SIZES = [1280, 1920];   // project pages: phones/1x laptops, then larger screens
  await mkdir(path.join(OUT, 'thumbs'), { recursive: true });
  await mkdir(path.join(OUT, 'sizes'), { recursive: true });
  const dims = {}, thumbs = {}, sizes = {};
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
      const animated = m.pages > 1;                           // GIF / animated WebP
      dims[src] = animated ? [m.width, m.pageHeight || m.height]
        : (m.orientation || 1) >= 5 ? [m.height, m.width] : [m.width, m.height];   // EXIF-rotated
      const base = hash(src + '|' + hash(buf), 16);           // new bytes → new name
      const copy = async (w, dir, quality) => {
        const name = dir + '/' + base + (dir === 'sizes' ? '-' + w : '') + '.webp';
        await sharp(buf, { failOn: 'none', animated, limitInputPixels: false }).rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: animated ? 70 : quality, effort: 4 }).toFile(path.join(OUT, name));
        return name;
      };
      // animated → animated WebP (keeps every frame; a 16.9 MB GIF → ~1.9 MB)
      thumbs[src] = await copy(Math.min(THUMB_W, dims[src][0]), 'thumbs', 78);
      const list = [];
      if (animated) {
        // GIFs are huge for what they show: always swap in an animated WebP at
        // the GIF's own size (max 1280px) — e.g. the 16.9 MB Tank GIF
        const w = Math.min(SIZES[0], dims[src][0]);
        list.push([w, await copy(w, 'sizes', 70)]);
      } else {
        for (const w of SIZES) {
          if (dims[src][0] > w * 1.15) list.push([w, await copy(w, 'sizes', 80)]);   // only when clearly smaller
        }
      }
      if (list.length) sizes[src] = list;
    } catch (_) { /* unknown size / no copy: the page falls back to the original */ }
  };
  const list = [...srcs];
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(one));
  console.log('images: measured ' + Object.keys(dims).length + ' of ' + list.length +
    ', made ' + Object.keys(thumbs).length + ' small copies and ' +
    Object.values(sizes).reduce((n, l) => n + l.length, 0) + ' screen-size copies');
  return { dims, thumbs, sizes };
}

let mediaJs = 'window.MEDIA_DIMS = {};\nwindow.MEDIA_THUMBS = {};\nwindow.MEDIA_SIZES = {};\n';
try {
  const { dims, thumbs, sizes } = await processImages();
  mediaJs = 'window.MEDIA_DIMS = ' + JSON.stringify(dims) + ';\nwindow.MEDIA_THUMBS = ' + JSON.stringify(thumbs) +
    ';\nwindow.MEDIA_SIZES = ' + JSON.stringify(sizes) + ';\n';
} catch (e) { console.warn('images skipped: ' + e.message); }

// ---- 4: app.html — vendor + one site bundle ------------------------------------
const SCRIPT_TAG = /[ \t]*<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>[ \t]*\r?\n?/g;
const reactFile = (pkg, file) => readFile(path.join(ROOT, 'node_modules', pkg, 'umd', file), 'utf8');

const vendor = (await reactFile('react', 'react.production.min.js')) + '\n;\n' +
  (await reactFile('react-dom', 'react-dom.production.min.js')) + '\n';
const vendorName = 'build/vendor-' + hash(vendor) + '.js';
await writeFile(path.join(OUT, vendorName), vendor);

{
  const file = path.join(OUT, 'app.html');
  let html = await readFile(file, 'utf8');
  const parts = [];
  let first = -1;
  html = html.replace(SCRIPT_TAG, (tag, pre, src, post, offset) => {
    if (/^https?:/.test(src)) {
      if (!/\/(react|react-dom)@|@babel\/standalone/.test(src)) throw new Error('app.html: unexpected external script ' + src);
    } else {
      const isJsx = /text\/babel/.test(pre + post);
      let code;
      if (src === 'tweaks-panel.jsx') code = '';   // swapped for the stub below
      else if (isJsx) {
        if (!(src in compiledCode)) throw new Error('app.html references ' + src + ', which was not compiled');
        code = compiledCode[src];
      }
      parts.push({ src, code });
    }
    if (first < 0) first = offset;
    return first === offset ? '%%SCRIPTS%%\n' : '';
  });
  const chunks = [];
  for (const p of parts) {
    const code = p.src === 'tweaks-panel.jsx'
      ? await readFile(path.join(ROOT, 'tools', 'tweaks-stub.js'), 'utf8')
      : p.code != null ? p.code
      : await readFile(path.join(p.src === 'content.js' ? OUT : ROOT, p.src), 'utf8');   // content.js: the fresh snapshot
    chunks.push('/* ' + p.src + ' */\n' + code + '\n;');
    if (p.src === 'content.js') chunks.push('/* media sizes (build) */\n' + mediaJs);
  }
  // one classic script, same order and globals as the separate tags it replaces
  const { code: site } = await esbuild(chunks.join('\n'), { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' });
  const siteName = 'build/site-' + hash(site) + '.js';
  await writeFile(path.join(OUT, siteName), site);
  html = html.replace('%%SCRIPTS%%', '<script src="' + vendorName + '"></script>\n<script src="' + siteName + '"></script>');
  if (/text\/babel|unpkg\.com/.test(html)) throw new Error('app.html still loads babel/unpkg scripts');
  await writeFile(file, html);
  console.log('app.html: ' + parts.length + ' scripts → ' + siteName + ' (' + Math.round(site.length / 1024) + ' KB) + ' + vendorName);
}

// ---- 5: admin.html — precompiled JSX, production React --------------------------
{
  const file = path.join(OUT, 'admin.html');
  let html = await readFile(file, 'utf8');
  let swapped = 0, reactDone = false;
  html = html.replace(SCRIPT_TAG, (tag, pre, src, post) => {
    if (/@babel\/standalone/.test(src)) return '';
    if (/\/(react|react-dom)@/.test(src)) {
      if (reactDone) return '';
      reactDone = true;
      return '<script src="' + vendorName + '"></script>\n';
    }
    if (/text\/babel/.test(pre + post)) {
      if (!compiledUrl[src]) throw new Error('admin.html references ' + src + ', which was not compiled');
      swapped++;
      return '<script src="' + compiledUrl[src] + '"></script>\n';
    }
    return tag;
  });
  if (/text\/babel/.test(html)) throw new Error('admin.html still has text/babel scripts');
  await writeFile(file, html);
  console.log('admin.html: ' + swapped + ' scripts precompiled, production React');
}
