// remote-content.js — SITE read path.
// If Supabase is configured, load the single content row and apply it over the
// bundled content.js (which stays as an offline fallback). Always dispatches
// 'remote-content-ready' so the app boot never hangs.
//
// Uses a plain REST fetch fired the moment this script runs. (supabase-js held
// the request back until its auth bootstrap finished, which queued behind the
// in-browser Babel compile — on slower phones that blew the 6s budget and the
// site booted from the stale bundle, so CMS saves looked like they never
// happened.) The last good copy is cached so a slow network still gets
// recent content instead of the bundle.

(function () {
  var CACHE_KEY = 'remote-content-cache-v1';

  // The CMS content is the single source of truth: text, images, order, widths,
  // preview counts, diagram node positions and the large entity's offset.
  function apply(data) {
    if (!data || typeof data !== 'object') return;
    if (!(data.location || data.bio || data.projects)) return;
    var cur = window.SITE_CONTENT || {};
    window.SITE_CONTENT = {
      location:  data.location || cur.location || {},
      bio:       data.bio || cur.bio || {},
      projects:  Array.isArray(data.projects) ? data.projects : (cur.projects || []),
      positions: data.positions || cur.positions || {},
      entityPos: 'entityPos' in data ? data.entityPos : (cur.entityPos || null),
    };
    window.PROJECTS = window.SITE_CONTENT.projects;
  }

  // Leftovers from the old in-page editing tools (orders, preview counts,
  // positions saved in this browser). Nothing reads them any more.
  try {
    var OLD = /^(diagram-node-pos|gallery-order-|preview-count-|index-project-order|project-column-order|large-entity-pos|project-links-|image-sizes-|gallery-widths-)/;
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && OLD.test(k)) localStorage.removeItem(k);
    }
  } catch (_) {}

  function done() {
    window.__remoteReady = true;
    try { window.dispatchEvent(new Event('remote-content-ready')); } catch (_) {}
  }

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (_) { return null; }
  }

  var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
  if (!url || !key || !window.fetch) { done(); return; }

  var settled = false;
  function finish(data) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (data) apply(data);
    done();
  }

  // safety: never let a slow network block the site for more than 6s
  var timer = setTimeout(function () { finish(cached()); }, 6000);

  fetch(url.replace(/\/+$/, '') + '/rest/v1/content?id=eq.1&select=data', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
    cache: 'no-store',
  })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (rows) {
      var data = rows && rows[0] && rows[0].data;
      if (data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {} }
      finish(data || null);
    })
    .catch(function () { finish(cached()); });
})();
