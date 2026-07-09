// remote-content.js — SITE read path.
// If Supabase is configured, load the single content row and apply it over the
// bundled content.js (which stays as an offline fallback). Always dispatches
// 'remote-content-ready' so the app boot never hangs.

(function () {
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
  }

  function done() {
    window.__remoteReady = true;
    try { window.dispatchEvent(new Event('remote-content-ready')); } catch (_) {}
  }

  var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
  if (!url || !key || !window.supabase) { done(); return; }

  // safety: never let a slow network block the site for more than 6s
  var timed = false;
  var timer = setTimeout(function () { timed = true; done(); }, 6000);

  try {
    var client = window.supabase.createClient(url, key);
    window.__sbClient = client;
    client.from('content').select('data').eq('id', 1).single()
      .then(function (res) {
        if (timed) return;
        clearTimeout(timer);
        if (res && res.data && res.data.data) apply(res.data.data);
        done();
      })
      .catch(function () { if (!timed) { clearTimeout(timer); done(); } });
  } catch (e) {
    if (!timed) { clearTimeout(timer); done(); }
  }
})();
