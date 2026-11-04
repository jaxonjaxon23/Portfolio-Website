// tools/content-snapshot.mjs — writes content.js from the LIVE CMS content.
// content.js is the fallback the site (and api/) use if Supabase can't be
// reached, so it should match what the CMS last saved. The build refreshes the
// deployed copy on every deploy; run `npm run snapshot` to refresh the repo copy.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function fetchLiveContent() {
  const cfg = await readFile(path.join(ROOT, 'supabase-config.js'), 'utf8');
  const url = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(cfg) || [])[1];
  const key = (/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(cfg) || [])[1];
  const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/content?id=eq.1&select=data',
    { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  const d = rows && rows[0] && rows[0].data;
  if (!d || !Array.isArray(d.projects)) throw new Error('no content');
  return d;
}

export function contentJs(d) {
  const site = {
    location: d.location || {}, bio: d.bio || {}, projects: d.projects || [],
    positions: d.positions || {}, entityPos: d.entityPos === undefined ? null : d.entityPos,
  };
  return '// SITE CONTENT — fallback copy of what the CMS (admin.html) saves to Supabase.\n' +
    '// The site loads the live content at start-up and only uses this file if that\n' +
    '// fails. Regenerated from the live content on every deploy; `npm run snapshot`\n' +
    '// refreshes this repo copy. Edit content in the CMS, not here.\n' +
    '// Gallery items: { type: "image"|"video"|"vimeo"|"youtube", src, w?, alt?, dims? }\n\n' +
    'window.SITE_CONTENT = ' + JSON.stringify(site, null, 2) + ';\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const js = contentJs(await fetchLiveContent());
  await writeFile(path.join(ROOT, 'content.js'), js);
  console.log('content.js updated from the live CMS content (' + Math.round(js.length / 1024) + ' KB)');
}
