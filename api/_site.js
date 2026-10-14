// api/_site.js — shared helpers for the crawler-facing routes (page.js, llms.js,
// sitemap.js). The site itself is drawn by JavaScript from Supabase content, so
// search engines and AI crawlers that don't run JS saw almost nothing. These
// routes build plain HTML/text from the SAME live content the CMS saves, so it
// never goes stale. (Files starting with "_" are not deployed as functions.)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://www.jaxonstickler.com';
const ROOT = process.cwd();

function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

// Supabase URL + public anon key, parsed from the same config file the browser uses
function supabaseConfig() {
  try {
    const src = read('supabase-config.js');
    const url = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(src) || [])[1];
    const key = (/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(src) || [])[1];
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
  } catch (_) { return null; }
}

// bundled content.js — offline fallback, same as the browser uses
function bundledContent() {
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(read('content.js'), sandbox, { timeout: 1000 });
    return sandbox.window.SITE_CONTENT || null;
  } catch (_) { return null; }
}

// Same ordering rules as the site: until the CMS has saved with ordersBaked,
// layout.js's index/gallery permutations still apply on top of the content.
function bakedOrders(content) {
  let B = {};
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(read('layout.js'), sandbox, { timeout: 1000 });
    B = sandbox.window.BAKED_LAYOUT || {};
  } catch (_) { return content; }
  const perm = (key, arr) => {
    try {
      const s = JSON.parse(B[key]);
      if (Array.isArray(s) && s.length === arr.length && new Set(s).size === arr.length &&
          s.every((i) => Number.isInteger(i) && i >= 0 && i < arr.length)) return s.map((i) => arr[i]);
    } catch (_) {}
    return arr;
  };
  return {
    ...content,
    projects: perm('index-project-order-v1', content.projects || [])
      .map((p) => ({ ...p, gallery: perm('gallery-order-' + p.id, p.gallery || []) })),
  };
}

async function loadContent() {
  let data = null, updatedAt = null;
  const cfg = supabaseConfig();
  if (cfg) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(cfg.url + '/rest/v1/content?id=eq.1&select=data,updated_at', {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows[0]) { data = rows[0].data; updatedAt = rows[0].updated_at; }
      }
    } catch (_) { /* fall back below */ }
  }
  let content;
  if (data && (data.bio || data.projects)) {
    content = { location: data.location || {}, bio: data.bio || {}, projects: Array.isArray(data.projects) ? data.projects : [] };
    if (!data.ordersBaked) content = bakedOrders(content);
  } else {
    content = bakedOrders(bundledContent() || { location: {}, bio: {}, projects: [] });
  }
  return { content, updatedAt };
}

// ---------------------------------------------------------------- text helpers
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "[label](url)" → "label"
const plain = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
const paras = (s) => plain(s).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const oneLine = (s, n) => {
  const t = plain(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};
// Titles are stored in caps; readable case for prose (keeps short acronyms like BC/USB)
const titleCase = (s) => (s && s === s.toUpperCase())
  ? s.replace(/[A-Z]+/g, (w) => (w.length <= 3 && !/^(ME|MY|OF|THE|AND|TO|IN|ON|A|AN|OR|FOR|AT|BY|IS|IT)$/.test(w))
    ? w : w[0] + w.slice(1).toLowerCase())
  : (s || '');
const abs = (src) => { try { return new URL(src, SITE + '/').href; } catch (_) { return ''; } };
const projectUrl = (p) => SITE + '/work/' + encodeURIComponent(p.id);
const images = (p) => (p.gallery || []).filter((g) => g && g.type === 'image' && g.src);
const credits = (p) => [p.year, plain(p.client), plain(p.collab)].map((x) => (x || '').trim()).filter(Boolean);

module.exports = { SITE, read, loadContent, esc, plain, paras, oneLine, titleCase, abs, projectUrl, images, credits };
