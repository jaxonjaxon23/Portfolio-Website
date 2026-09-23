// admin-app.jsx — portfolio CMS shell: auth, tabs, state, export.

const { useState: useMState, useEffect: useMEffect, useRef: useMRef } = React;

// ---------------------------------------------------------------------------
// Auth + saving run through Supabase. Fill in supabase-config.js, then create
// your login user in the Supabase dashboard (Authentication → Users → Add user).
// ---------------------------------------------------------------------------
const SB = (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const clone = (o) => JSON.parse(JSON.stringify(o));

// layout.js carries index-based order permutations (Index column order and
// per-project gallery order) that the live site applied ON TOP of the content,
// so reordering in the CMS came out scrambled. Fold them into the data once so
// the editor shows what visitors actually see; the saved doc is then flagged
// `ordersBaked` and the site stops applying them.
function bakeLegacyOrders(c) {
  const B = window.BAKED_LAYOUT || {};
  const perm = (key, arr) => {
    try {
      const s = JSON.parse(B[key]);
      const valid = Array.isArray(s) && s.length === arr.length && new Set(s).size === arr.length
        && s.every((i) => Number.isInteger(i) && i >= 0 && i < arr.length);
      if (valid) return s.map((i) => arr[i]);
    } catch (_) {}
    return arr;
  };
  const projects = perm('index-project-order-v1', c.projects || [])
    .map((p) => ({ ...p, gallery: perm('gallery-order-' + p.id, p.gallery || []) }));
  return { ...c, projects };
}

const friendlySaveError = (msg) => {
  if (/row-level security|permission denied|JWT|not authorized|401|403/i.test(msg || '')) {
    return 'Not allowed to save — your login may have expired. Log out, sign in again, then save.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg || '')) return 'Network error — check your connection and try again.';
  return msg || 'Unknown error';
};

// thumbnail-size presets offered when adding a new project ("layout")
const LAYOUT_PRESETS = {
  portrait:  { w: 220, h: 300, label: 'Portrait' },
  landscape: { w: 300, h: 200, label: 'Landscape' },
  square:    { w: 240, h: 240, label: 'Square' },
  tall:      { w: 200, h: 320, label: 'Tall' },
};

function Login({ onOk }) {
  const [email, setEmail] = useMState('');
  const [pw, setPw] = useMState('');
  const [err, setErr] = useMState('');
  const [busy, setBusy] = useMState(false);
  const submit = async () => {
    if (!SB) { setErr('Supabase not configured — fill in supabase-config.js'); return; }
    setBusy(true); setErr('');
    const { error } = await SB.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(error.message || 'Sign-in failed'); else onOk();
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 22 }}>Portfolio CMS</div>
        <input className="ad-input" type="email" autoFocus placeholder="Email" value={email}
          onChange={(e) => { setEmail(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ textAlign: 'center', marginBottom: 10 }} />
        <input className="ad-input" type="password" placeholder="Password" value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ textAlign: 'center', borderColor: err ? 'var(--danger)' : undefined }} />
        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}
        <button className="ad-btn" disabled={busy} style={{ width: '100%', marginTop: 14 }} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useMState(false);
  const [authReady, setAuthReady] = useMState(!SB);
  const [content, setContent] = useMState(() => bakeLegacyOrders(clone(window.SITE_CONTENT)));
  const [positions, setPositions] = useMState(() => {
    // start from baked diagram positions, fill any missing from defaults
    let baked = {};
    try { baked = JSON.parse((window.BAKED_LAYOUT && window.BAKED_LAYOUT['diagram-node-pos-v1']) || '{}'); } catch (_) {}
    const map = {};
    (window.SITE_CONTENT.projects || []).forEach((p, i) => { map[p.id] = baked[p.id] || window.defaultPosFor(i); });
    return map;
  });
  const imgMapRef = useMRef({}); // path -> { url, file, isVideo }
  const [entityPos, setEntityPos] = useMState(() => {
    try { return JSON.parse((window.BAKED_LAYOUT && window.BAKED_LAYOUT['large-entity-pos-v1']) || 'null'); } catch (_) { return null; }
  });
  const [, force] = useMState(0);
  const rerender = () => force((n) => n + 1);
  const [tab, setTab] = useMState('site');
  const [selId, setSelId] = useMState(null);
  const [busy, setBusy] = useMState(false);
  // 'loading' | 'ok' | 'error' — whether the LIVE content was loaded. Editing on
  // top of the bundled fallback and saving would overwrite the live site.
  const [loadState, setLoadState] = useMState(SB ? 'loading' : 'ok');
  const [loadErr, setLoadErr] = useMState('');
  const [status, setStatus] = useMState(null); // { kind: 'ok' | 'err', text }
  const savedSnap = useMRef(null); // JSON of the last loaded/saved state

  const snapOf = (c, pos, ent) => JSON.stringify({ c, pos, ent });

  // Load the LIVE published content so the editor starts from what's
  // currently on the site (not just the bundle).
  const loadLive = () => {
    if (!SB) return;
    setLoadState('loading'); setLoadErr('');
    SB.from('content').select('data').eq('id', 1).single().then((res) => {
      if (res.error) throw new Error(res.error.message);
      return (res.data && res.data.data) || {};
    }).catch(() =>
      // A stale stored login makes even this public read fail — retry anonymously.
      fetch(window.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/content?id=eq.1&select=data', {
        headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY },
        cache: 'no-store',
      }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((rows) => (rows && rows[0] && rows[0].data) || {})
    ).then((d) => {
      let pos = positions, ent = entityPos;
      let c = (d.location || d.bio || d.projects)
        ? { location: d.location || {}, bio: d.bio || {}, projects: Array.isArray(d.projects) ? d.projects : [] }
        : clone(window.SITE_CONTENT);
      if (!d.ordersBaked) c = bakeLegacyOrders(c);
      if (d.positions) pos = { ...positions, ...d.positions };
      if ('entityPos' in d) ent = d.entityPos;
      setContent(c); setPositions(pos); setEntityPos(ent);
      savedSnap.current = snapOf(c, pos, ent);
      setLoadState('ok');
    }).catch((e) => {
      setLoadErr((e && e.message) || 'Unknown error');
      setLoadState('error');
    });
  };

  // Check existing Supabase session + load live content.
  useMEffect(() => {
    if (!SB) { savedSnap.current = snapOf(content, positions, entityPos); return; }
    SB.auth.getSession().then(({ data }) => {
      if (data && data.session) setAuthed(true);
      setAuthReady(true);
    });
    const { data: sub } = SB.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    loadLive();
    return () => { try { sub.subscription.unsubscribe(); } catch (_) {} };
  }, []);

  const newImagePaths = Object.keys(imgMapRef.current).filter((path) =>
    content.projects.some((p) => (p.gallery || []).some((g) => g.src === path))
    || ((content.bio && content.bio.working) || []).some((w) => w.img === path));
  const dirty = loadState === 'ok' && savedSnap.current != null
    && (snapOf(content, positions, entityPos) !== savedSnap.current || newImagePaths.length > 0);

  // Warn before leaving with unsaved edits; Ctrl/Cmd+S saves.
  const publishRef = useMRef(null);
  useMEffect(() => {
    const onBefore = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (publishRef.current) publishRef.current();
      }
    };
    window.addEventListener('beforeunload', onBefore);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('beforeunload', onBefore); window.removeEventListener('keydown', onKey); };
  }, [dirty]);

  // auto-hide the success message
  useMEffect(() => {
    if (!status || status.kind !== 'ok') return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  if (SB && !authReady) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>Loading…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;
  if (loadState === 'loading') return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>Loading live content…</div>;

  const projects = content.projects;
  const patchProject = (id, patch) => setContent((c) => ({ ...c, projects: c.projects.map((p) => p.id === id ? { ...p, ...patch } : p) }));

  // register a File at a target path; returns the path
  const registerImage = (file, dir) => {
    const base = window.slugify(file.name.replace(/\.[^.]+$/, '')) + (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    let path = 'images/' + dir + '/' + base;
    let n = 1;
    const taken = (pp) => projects.some((p) => (p.gallery || []).some((g) => g.src === pp)) || imgMapRef.current[pp];
    while (taken(path)) { path = 'images/' + dir + '/' + base.replace(/(\.[^.]+)?$/, '-' + n + '$1'); n++; }
    imgMapRef.current[path] = { url: URL.createObjectURL(file), file, isVideo: window.isVideoName(file.name) };
    return path;
  };

  const addImagesToProject = (id, files) => {
    const items = files.map((f) => ({ type: window.isVideoName(f.name) ? 'video' : 'image', src: registerImage(f, id) }));
    setContent((c) => ({ ...c, projects: c.projects.map((p) => p.id === id ? { ...p, gallery: (p.gallery || []).concat(items) } : p) }));
  };

  const addBioImage = (file, cb) => { const path = registerImage(file, 'wip'); cb(path); rerender(); };

  const addProject = (title, year, layoutKey) => {
    const preset = LAYOUT_PRESETS[layoutKey] || LAYOUT_PRESETS.portrait;
    let id = window.slugify(title);
    let n = 1; while (projects.some((p) => p.id === id)) { id = window.slugify(title) + '-' + n; n++; }
    const np = { id, title: title || 'Untitled', year: year || '', keywords: [], client: '', desc: '',
      main: { src: '', w: preset.w, h: preset.h }, sats: [], gallery: [] };
    setContent((c) => ({ ...c, projects: c.projects.concat([np]) }));
    setPositions((m) => ({ ...m, [id]: window.defaultPosFor(projects.length) }));
    setSelId(id); setTab('projects');
  };

  const deleteProject = (id) => {
    if (!confirm('Delete this project? It disappears from the live site when you save.')) return;
    setContent((c) => ({ ...c, projects: c.projects.filter((p) => p.id !== id) }));
    setSelId(null);
  };

  // ---- save to Supabase ----
  // Upload any new image Files to storage, swap their temp srcs for public URLs,
  // then upsert the whole content doc (incl. diagram positions) into one row.
  const publish = async () => {
    if (busy) return;
    if (!SB) { setStatus({ kind: 'err', text: 'Supabase not configured — fill in supabase-config.js' }); return; }
    if (loadState !== 'ok' && !confirm(
      "The live content never loaded, so you're editing the older bundled copy.\n\n" +
      'Saving will REPLACE everything on the live site with what is shown here. Continue?')) return;
    setBusy(true); setStatus(null);
    try {
      const { data: sess } = await SB.auth.getSession();
      if (!sess || !sess.session) throw new Error('JWT: no session');

      const map = imgMapRef.current;
      const replace = {};
      for (const path of newImagePaths) {
        if (!map[path] || !map[path].file) continue;
        const key = path.replace(/^images\//, '');
        const up = await SB.storage.from('images').upload(key, map[path].file, { upsert: true, contentType: map[path].file.type || undefined });
        if (up.error) throw new Error('Image upload failed: ' + up.error.message);
        const { data: pub } = SB.storage.from('images').getPublicUrl(key);
        replace[path] = pub.publicUrl;
      }
      const swap = (c) => {
        const out = clone(c);
        (out.projects || []).forEach((p) => (p.gallery || []).forEach((g) => { if (replace[g.src]) g.src = replace[g.src]; }));
        ((out.bio && out.bio.working) || []).forEach((w) => { if (replace[w.img]) w.img = replace[w.img]; });
        return out;
      };
      const out = swap(content);
      const posObj = {};
      projects.forEach((p, i) => { posObj[p.id] = positions[p.id] || window.defaultPosFor(i); });

      const doc = { location: out.location, bio: out.bio, projects: out.projects, positions: posObj, entityPos: entityPos, ordersBaked: true };
      // .select() makes the write report back, so a silently-blocked write (0 rows) is caught
      const { data: row, error } = await SB.from('content')
        .upsert({ id: 1, data: doc, updated_at: new Date().toISOString() })
        .select('updated_at').single();
      if (error) throw new Error(error.message);
      if (!row) throw new Error('permission denied: nothing was written');

      // Point local state at the uploaded URLs so re-saving won't re-upload.
      // Functional update keeps any edits made while the upload was running.
      setContent((c) => swap(c));
      Object.keys(replace).forEach((path) => { delete map[path]; });
      savedSnap.current = snapOf(out, positions, entityPos);
      setLoadState('ok');
      setStatus({ kind: 'ok', text: 'Saved — live now. Refresh the site to see it.' });
    } catch (e) {
      setStatus({ kind: 'err', text: 'Save failed: ' + friendlySaveError(e && e.message) });
    } finally {
      setBusy(false);
    }
  };
  publishRef.current = publish;

  const newImageCount = newImagePaths.length;

  const TABS = [['site', 'Site & Bio'], ['projects', 'Projects'], ['diagram', 'Diagram'], ['index', 'Index order'], ['publish', 'Publish']];
  const sel = projects.find((p) => p.id === selId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header tab={tab} setTab={setTab} tabs={TABS} busy={busy} dirty={dirty}
        onSave={publish}
        onLogout={async () => {
          if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
          if (SB) { try { await SB.auth.signOut(); } catch (_) {} }
          setAuthed(false);
        }} />
      {loadState === 'error' &&
        <div className="ad-banner">
          <span><b>Couldn't load the live content</b> ({loadErr}). You're looking at the older bundled copy — saving now would overwrite the live site.</span>
          <button className="ad-btn ghost" onClick={() => { if (!dirty || confirm('Reload the live content? Edits made here will be discarded.')) loadLive(); }}>Retry</button>
        </div>}
      <SaveDock dirty={dirty} busy={busy} status={status} onSave={publish} onDismiss={() => setStatus(null)} />
      <div style={{ flex: 1, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '28px 28px 120px' }}>

        {tab === 'site' &&
          <div>
            <SectionTitle sub="The live clock follows the timezone. The bio bubble appears on the About and Index pages.">Site & Bio</SectionTitle>
            <div style={{ marginBottom: 18 }}><window.LocationEditor location={content.location} onPatch={(patch) => setContent((c) => ({ ...c, location: { ...c.location, ...patch } }))} /></div>
            <window.BioEditor bio={content.bio} imgMap={imgMapRef.current} onAddImage={addBioImage}
              onPatch={(patch) => setContent((c) => ({ ...c, bio: { ...c.bio, ...patch } }))} />
          </div>}

        {tab === 'projects' &&
          <div>
            <SectionTitle sub="Edit a project's text and gallery, or add a new one. Drag gallery items to reorder; the first item is the index thumbnail.">Projects</SectionTitle>
            <AddProjectBar onAdd={addProject} />
            <div style={{ display: 'flex', gap: 20, marginTop: 18, alignItems: 'flex-start' }}>
              <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {projects.map((p) => (
                  <button key={p.id} onClick={() => setSelId(p.id)}
                    style={{ textAlign: 'left', background: selId === p.id ? 'var(--panel2)' : 'transparent', border: '1px solid ' + (selId === p.id ? 'var(--line)' : 'transparent'), borderRadius: 8, padding: '9px 11px', cursor: 'pointer', color: 'inherit' }}>
                    <div style={{ fontSize: 13 }}>{p.title || '(untitled)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim2)' }}>{p.year} · {(p.gallery || []).length} items</div>
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {sel
                  ? <window.ProjectEditor project={sel} imgMap={imgMapRef.current}
                      onPatch={(patch) => patchProject(sel.id, patch)}
                      onAddImages={(files) => addImagesToProject(sel.id, files)}
                      onDelete={() => deleteProject(sel.id)} />
                  : <Card><div style={{ color: 'var(--dim)' }}>Select a project on the left to edit it, or add a new one above.</div></Card>}
              </div>
            </div>
          </div>}

        {tab === 'diagram' &&
          <div>
            <SectionTitle sub="Drag any node to set where that project sits on the About-page constellation. Hover a node to see its name.">Diagram positions</SectionTitle>
            <window.DiagramPicker projects={projects} positions={positions}
              onMove={(id, x, y) => setPositions((m) => ({ ...m, [id]: { x, y } }))} />
            <div style={{ height: 20 }} />
            <SectionTitle sub="This is the large animated entity that overlays the About page.">Entity position</SectionTitle>
            <window.EntityPositionEditor pos={entityPos} onChange={setEntityPos} />
          </div>}

        {tab === 'index' &&
          <div>
            <SectionTitle sub="Drag to set the left-to-right order of the columns on the Index page.">Index order</SectionTitle>
            <window.IndexOrderEditor projects={projects} imgMap={imgMapRef.current}
              onReorder={(next) => setContent((c) => ({ ...c, projects: next }))} />
          </div>}

        {tab === 'publish' &&
          <div>
            <SectionTitle sub="Saves everything to your Supabase project. Changes go live on the site immediately — just refresh.">Publish</SectionTitle>
            <Card>
              <div style={{ marginBottom: 16, lineHeight: 1.7 }}>
                <div><b>{projects.length}</b> projects</div>
                <div><b>{newImageCount}</b> new image/video file(s) to upload this save</div>
              </div>
              <button className="ad-btn" disabled={busy} onClick={publish}>{busy ? 'Saving…' : 'Save changes (publish live)'}</button>
              <ol style={{ margin: '20px 0 0 18px', color: 'var(--dim)', lineHeight: 1.9, maxWidth: 640 }}>
                <li>Click <b>Save</b> — new images upload to Supabase storage, then all content is saved.</li>
                <li>Refresh the live site — your changes are already there.</li>
                <li>No file uploads to the server needed. Edit from anywhere you can log in.</li>
              </ol>
            </Card>
          </div>}

      </div>
    </div>
  );
}

function Header({ tab, setTab, tabs, onLogout, onSave, busy, dirty }) {
  return (
    <div className="ad-header">
      <div className="ad-header-in">
        <span style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>CMS</span>
        <div className="ad-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ background: tab === id ? 'var(--panel2)' : 'transparent', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', whiteSpace: 'nowrap', color: tab === id ? '#fff' : 'var(--dim)', fontWeight: tab === id ? 600 : 400 }}>{label}</button>
          ))}
        </div>
        <button className="ad-btn" disabled={busy} onClick={onSave} title="Save (Ctrl/⌘ + S)" style={{ padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {dirty && !busy && <span className="ad-dot" />}
          {busy ? 'Saving…' : 'Save'}
        </button>
        <a href="index.html" target="_blank" style={{ color: 'var(--dim)', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>View site ↗</a>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>Log out</button>
      </div>
    </div>
  );
}

// Floating save bar: slides up while there are unsaved edits, and reports the
// result of the last save. Always reachable, whatever tab or scroll position.
function SaveDock({ dirty, busy, status, onSave, onDismiss }) {
  const show = dirty || busy || !!status;
  const err = status && status.kind === 'err';
  let text = 'Unsaved changes';
  if (busy) text = 'Saving — uploading files and publishing…';
  else if (status) text = status.text;
  return (
    <div className={'ad-dock' + (show ? ' on' : '') + (err ? ' err' : '') + (status && status.kind === 'ok' && !dirty ? ' ok' : '')} role="status" aria-live="polite">
      <span className="ad-dock-light" />
      <span className="ad-dock-text">{text}</span>
      {(dirty || err) &&
        <button className="ad-btn" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : err ? 'Try again' : 'Save changes'}</button>}
      {status && !busy &&
        <button className="ad-dock-x" onClick={onDismiss} aria-label="Dismiss">✕</button>}
      {!status && !busy && <span className="ad-dock-kbd">Ctrl/⌘ S</span>}
    </div>
  );
}

function AddProjectBar({ onAdd }) {
  const [open, setOpen] = useMState(false);
  const [title, setTitle] = useMState('');
  const [year, setYear] = useMState('');
  const [layout, setLayout] = useMState('portrait');
  if (!open) return <button className="ad-btn ghost" onClick={() => setOpen(true)}>+ Add new project</button>;
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <Field label="Title"><Text value={title} onChange={setTitle} placeholder="NEW PROJECT" /></Field>
        <Field label="Year"><Text value={year} onChange={setYear} placeholder="2026" /></Field>
      </div>
      <Field label="Index thumbnail layout">
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(LAYOUT_PRESETS).map((k) => (
            <button key={k} onClick={() => setLayout(k)}
              style={{ flex: 1, cursor: 'pointer', borderRadius: 8, padding: 10, background: layout === k ? 'var(--panel2)' : 'transparent', border: '1px solid ' + (layout === k ? 'var(--accent)' : 'var(--line)'), color: 'inherit' }}>
              <div style={{ width: LAYOUT_PRESETS[k].w / 6, height: LAYOUT_PRESETS[k].h / 6, background: 'var(--dim2)', margin: '0 auto 8px', borderRadius: 2 }} />
              <div style={{ fontSize: 11 }}>{LAYOUT_PRESETS[k].label}</div>
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ad-btn" onClick={() => { onAdd(title, year, layout); setOpen(false); setTitle(''); setYear(''); }}>Create</button>
        <button className="ad-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </Card>
  );
}

ReactDOM.createRoot(document.getElementById('admin-root')).render(<App />);
