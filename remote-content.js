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
  // Index-based order permutations from layout.js. Once the CMS has saved
  // ordering into the content itself (data.ordersBaked), these would scramble
  // it, so they are dropped.
  var ORDER_KEY_RE = /^(index-project-order-v1|gallery-order-)/;

  function apply(data) {
    if (!data || typeof data !== 'object') return;
    if (data.location || data.bio || data.projects) {
      window.SITE_CONTENT = {
        location: data.location || (window.SITE_CONTENT && window.SITE_CONTENT.location) || {},
        bio:      data.bio      || (window.SITE_CONTENT && window.SITE_CONTENT.bio)      || {},
        projects: Array.isArray(data.projects) ? data.projects
                 : ((window.SITE_CONTENT && window.SITE_CONTENT.projects) || []),
      };
      window.PROJECTS = window.SITE_CONTENT.projects;
    }
    // diagram node positions + entity position live in the layout system.
    // Supabase is the source of truth: clear any stale LOCAL override so a
    // browser that previously nudged something by hand doesn't shadow what
    // was saved from the CMS (this is what makes edits global, not per-device).
    window.BAKED_LAYOUT = window.BAKED_LAYOUT || {};
    if (data.positions && typeof data.positions === 'object') {
      window.BAKED_LAYOUT['diagram-node-pos-v1'] = JSON.stringify(data.positions);
      try { localStorage.removeItem('diagram-node-pos-v1'); } catch (_) {}
    }
    if (data.entityPos && typeof data.entityPos === 'object') {
      window.BAKED_LAYOUT['large-entity-pos-v1'] = JSON.stringify(data.entityPos);
      try { localStorage.removeItem('large-entity-pos-v1'); } catch (_) {}
    }
    if (data.ordersBaked) {
      Object.keys(window.BAKED_LAYOUT).forEach(function (k) {
        if (ORDER_KEY_RE.test(k)) delete window.BAKED_LAYOUT[k];
      });
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && ORDER_KEY_RE.test(k)) localStorage.removeItem(k);
        }
      } catch (_) {}
    }
  }

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
