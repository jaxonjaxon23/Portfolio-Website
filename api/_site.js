// api/_site.js — shared helpers for the crawler-facing routes (page.js, llms.js,
// sitemap.js). The site itself is drawn by JavaScript from Supabase content, so
// search engines and AI crawlers that don't run JS saw almost nothing. These
// routes build plain HTML/text from the SAME live content the CMS saves, so it
// never goes stale. (Files starting with "_" are not deployed as functions.)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shared = require('../shared.js');   // same text rules as the site

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
  } else {
    content = bundledContent() || { location: {}, bio: {}, projects: [] };   // snapshot of the live content
  }
  return { content, updatedAt };
}

// ---------------------------------------------------------------- text helpers
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = shared.plain;
const paras = (s) => plain(s).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const oneLine = (s, n) => {
  const t = plain(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};
const titleCase = shared.displayTitle;
const abs = (src) => { try { return new URL(src, SITE + '/').href; } catch (_) { return ''; } };
const projectUrl = (p) => SITE + '/work/' + encodeURIComponent(p.id);
const images = (p) => (p.gallery || []).filter((g) => g && g.type === 'image' && g.src);
const credits = (p) => [p.year, plain(p.client), plain(p.collab)].map((x) => (x || '').trim()).filter(Boolean);
const artist = (c) => (c.bio && c.bio.name) || 'Jaxon Stickler';
// image description: the CMS caption, else "<Project> by <name> — image N" (same as the site)
const altText = (c, p, g) => shared.altText(p.title, artist(c), g, (p.gallery || []).indexOf(g));

// Instagram + the "Other profiles" CMS field (one URL per line; not shown on the site)
function profiles(c) {
  const b = c.bio || {};
  const list = [b.instagramUrl].concat(String(b.profiles || '').split(/\s+/));
  return Array.from(new Set(list.map((u) => (u || '').trim()).filter((u) => /^https?:\/\//i.test(u))));
}

// CV text: the CMS field if filled in, otherwise cv.md from the repo
function cvText(c) {
  const t = c.bio && c.bio.cvText && String(c.bio.cvText).trim();
  if (t) return t;
  try { return read('cv.md'); } catch (_) { return ''; }
}

// Share-preview image: a JPEG made by api/og.js from the project's first image
// The site-wide default is a screenshot of the projects page (assets/og/home.jpg,
// re-take it with tools/og-shot.ps1 when the design changes).
const ogImage = (id) => (!id || id === 'home') ? SITE + '/assets/og/home.jpg'
  : SITE + '/og/' + encodeURIComponent(id) + '.jpg';

// Minimal Markdown → HTML for the CV ("#"/"##"/"###" headings, "- " lists, paragraphs)
function mdToHtml(md) {
  const out = []; let list = false;
  const close = () => { if (list) { out.push('</ul>'); list = false; } };
  String(md || '').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (!t) { close(); return; }
    if (h) { close(); const lv = Math.min(3, h[1].length + 1); out.push('<h' + lv + '>' + esc(h[2]) + '</h' + lv + '>'); return; }
    if (/^[-*]\s+/.test(t)) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + esc(t.replace(/^[-*]\s+/, '')) + '</li>'); return; }
    close(); out.push('<p>' + esc(t) + '</p>');
  });
  close();
  return out.join('');
}

// Client / collaborator credits as HTML with links (same rules as the site's
// CreditText — both come from shared.js)
let suggestedCredits = null;
function suggested() {
  if (!suggestedCredits) {
    try {
      const sandbox = { window: {} };
      vm.runInNewContext(read('credit-links.js'), sandbox, { timeout: 1000 });
      suggestedCredits = sandbox.window.SUGGESTED_CREDITS || {};
    } catch (_) { suggestedCredits = {}; }
  }
  return suggestedCredits;
}
const creditLinks = (p) => shared.creditLinks(p, suggested());
const creditHtml = (text, p) => shared.creditParts(text, creditLinks(p))
  .map((x) => x.href ? '<a href="' + esc(x.href) + '" rel="noopener">' + esc(x.text) + '</a>' : esc(x.text)).join('');

module.exports = { SITE, read, loadContent, esc, plain, paras, oneLine, titleCase, abs, projectUrl, images, credits,
  artist, altText, profiles, cvText, ogImage, mdToHtml, creditHtml, creditLinks };
