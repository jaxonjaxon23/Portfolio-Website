// admin-app.jsx — portfolio CMS shell: auth, tabs, state, export.

const { useState: useMState, useEffect: useMEffect, useRef: useMRef } = React;

// ---------------------------------------------------------------------------
// CHANGE THIS PASSWORD. Note: this is light obscurity, not real security — the
// site is static so anyone determined can read the source. Don't link to
// admin.html from the public site, and keep the password to yourself.
const ADMIN_PASSWORD = 'studio';
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));

// thumbnail-size presets offered when adding a new project ("layout")
const LAYOUT_PRESETS = {
  portrait:  { w: 220, h: 300, label: 'Portrait' },
  landscape: { w: 300, h: 200, label: 'Landscape' },
  square:    { w: 240, h: 240, label: 'Square' },
  tall:      { w: 200, h: 320, label: 'Tall' },
};

function Login({ onOk }) {
  const [pw, setPw] = useMState('');
  const [err, setErr] = useMState(false);
  const submit = () => {
    if (pw === ADMIN_PASSWORD) { try { sessionStorage.setItem('cms-auth', '1'); } catch (_) {} onOk(); }
    else setErr(true);
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 22 }}>Portfolio CMS</div>
        <input className="ad-input" type="password" autoFocus placeholder="Password" value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ textAlign: 'center', borderColor: err ? 'var(--danger)' : undefined }} />
        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>Wrong password</div>}
        <button className="ad-btn" style={{ width: '100%', marginTop: 14 }} onClick={submit}>Enter</button>
      </div>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useMState(() => { try { return sessionStorage.getItem('cms-auth') === '1'; } catch (_) { return false; } });
  const [content, setContent] = useMState(() => clone(window.SITE_CONTENT));
  const [positions, setPositions] = useMState(() => {
    // start from baked diagram positions, fill any missing from defaults
    let baked = {};
    try { baked = JSON.parse((window.BAKED_LAYOUT && window.BAKED_LAYOUT['diagram-node-pos-v1']) || '{}'); } catch (_) {}
    const map = {};
    (window.SITE_CONTENT.projects || []).forEach((p, i) => { map[p.id] = baked[p.id] || window.defaultPosFor(i); });
    return map;
  });
  const imgMapRef = useMRef({}); // path -> { url, file, isVideo }
  const [, force] = useMState(0);
  const rerender = () => force((n) => n + 1);
  const [tab, setTab] = useMState('site');
  const [selId, setSelId] = useMState(null);
  const [busy, setBusy] = useMState(false);

  if (!authed) return <Login onOk={() => setAuthed(true)} />;

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
    if (!confirm('Delete this project? This cannot be undone (until you re-export).')) return;
    setContent((c) => ({ ...c, projects: c.projects.filter((p) => p.id !== id) }));
    setSelId(null);
  };

  // ---- export ----
  const buildContentJs = () => {
    const header =
      '// SITE CONTENT — single source of truth for the portfolio.\n' +
      '// Edited by admin.html (the CMS). projects.js + the bio components read from\n' +
      '// window.SITE_CONTENT.\n' +
      '// Gallery items: { type: "image"|"video"|"vimeo"|"youtube", src }\n\n';
    return header + 'window.SITE_CONTENT = ' + JSON.stringify(content, null, 2) + ';\n';
  };
  const buildLayoutJs = () => {
    // keep only id-keyed stable layout data; ordering is driven by the arrays
    const baked = window.BAKED_LAYOUT || {};
    const out = {};
    Object.keys(baked).forEach((k) => {
      if (/^(preview-count-|large-entity-pos|project-links-)/.test(k)) out[k] = baked[k];
    });
    const posObj = {};
    projects.forEach((p, i) => { posObj[p.id] = positions[p.id] || window.defaultPosFor(i); });
    out['diagram-node-pos-v1'] = JSON.stringify(posObj);
    const header =
      '// BAKED LAYOUT SNAPSHOT — generated by the CMS. Ordering now lives in the\n' +
      '// content arrays, so index/gallery order keys are intentionally omitted.\n' +
      '// Captured: ' + new Date().toISOString() + '\n';
    return header + 'window.BAKED_LAYOUT = ' + JSON.stringify(out, null, 2) + ';\n\n' +
      'window.layoutGet = function (key) {\n' +
      '  try { var v = localStorage.getItem(key); if (v !== null && v !== undefined) return v; } catch (_) {}\n' +
      '  if (window.BAKED_LAYOUT && Object.prototype.hasOwnProperty.call(window.BAKED_LAYOUT, key)) return window.BAKED_LAYOUT[key];\n' +
      '  return null;\n};\n';
  };

  const publish = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      zip.file('content.js', buildContentJs());
      zip.file('layout.js', buildLayoutJs());
      const map = imgMapRef.current;
      let added = 0;
      Object.keys(map).forEach((path) => {
        // only include images still referenced somewhere
        const used = projects.some((p) => (p.gallery || []).some((g) => g.src === path))
          || (content.bio.working || []).some((w) => w.img === path);
        if (used && map[path].file) { zip.file(path, map[path].file); added++; }
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'portfolio-update.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6000);
      setBusy(false);
      alert('Downloaded portfolio-update.zip\n\nIt contains:\n• content.js (your text + image references)\n• layout.js (diagram positions)\n• ' + added + ' new image file(s) in images/…\n\nUnzip it and upload these into your site folder, replacing the old content.js and layout.js. Done!');
    } catch (e) {
      setBusy(false);
      alert('Export failed: ' + e.message);
    }
  };

  const newImageCount = Object.keys(imgMapRef.current).filter((path) =>
    projects.some((p) => (p.gallery || []).some((g) => g.src === path)) || (content.bio.working || []).some((w) => w.img === path)
  ).length;

  const TABS = [['site', 'Site & Bio'], ['projects', 'Projects'], ['diagram', 'Diagram'], ['index', 'Index order'], ['publish', 'Publish']];
  const sel = projects.find((p) => p.id === selId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header tab={tab} setTab={setTab} tabs={TABS} onLogout={() => { try { sessionStorage.removeItem('cms-auth'); } catch (_) {} setAuthed(false); }} />
      <div style={{ flex: 1, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '28px 28px 80px' }}>

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
          </div>}

        {tab === 'index' &&
          <div>
            <SectionTitle sub="Drag to set the left-to-right order of the columns on the Index page.">Index order</SectionTitle>
            <window.IndexOrderEditor projects={projects} imgMap={imgMapRef.current}
              onReorder={(next) => setContent((c) => ({ ...c, projects: next }))} />
          </div>}

        {tab === 'publish' &&
          <div>
            <SectionTitle sub="Generates the files to upload to your server. Nothing leaves your computer until you upload them.">Publish</SectionTitle>
            <Card>
              <div style={{ marginBottom: 16, lineHeight: 1.7 }}>
                <div><b>{projects.length}</b> projects</div>
                <div><b>{newImageCount}</b> new image/video file(s) added this session</div>
              </div>
              <button className="ad-btn" disabled={busy} onClick={publish}>{busy ? 'Building…' : 'Download update package (.zip)'}</button>
              <ol style={{ margin: '20px 0 0 18px', color: 'var(--dim)', lineHeight: 1.9, maxWidth: 640 }}>
                <li>Click the button — you get <code>portfolio-update.zip</code>.</li>
                <li>Unzip it. Inside: <code>content.js</code>, <code>layout.js</code>, and an <code>images/</code> folder with any new files.</li>
                <li>Upload these into your site folder on the server, replacing the old <code>content.js</code> and <code>layout.js</code> and merging the <code>images/</code> folder.</li>
                <li>Refresh the site — your changes are live.</li>
              </ol>
            </Card>
          </div>}

      </div>
    </div>
  );
}

function Header({ tab, setTab, tabs, onLogout }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(11,12,13,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--line2)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', gap: 22, height: 56 }}>
        <span style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>CMS</span>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ background: tab === id ? 'var(--panel2)' : 'transparent', border: 'none', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', color: tab === id ? '#fff' : 'var(--dim)', fontWeight: tab === id ? 600 : 400 }}>{label}</button>
          ))}
        </div>
        <a href="index.html" target="_blank" style={{ color: 'var(--dim)', fontSize: 12, textDecoration: 'none' }}>View site ↗</a>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 12, cursor: 'pointer' }}>Log out</button>
      </div>
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
