// admin-editors.jsx — editing panels + primitives for the portfolio CMS.
// Exposes editor components + a few helpers on window for admin-app.jsx.

const { useState: useAState, useRef: useARef, useEffect: useAEffect } = React;

// ---------------------------------------------------------------- helpers
function slugify(s) {
  return (s || '').toString().toLowerCase().trim()
    .replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function isVideoName(n) { return /\.(mp4|webm|mov|m4v)$/i.test(n); }
function isGifName(n) { return /\.gif$/i.test(n); }

const TZONES = [
  'Europe/Berlin', 'Europe/London', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Lisbon',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Vienna', 'Europe/Athens', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Mexico_City', 'America/Sao_Paulo', 'Australia/Melbourne', 'Australia/Sydney',
  'Australia/Perth', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong',
  'Asia/Singapore', 'Asia/Bangkok', 'Asia/Dubai', 'Asia/Kolkata', 'Pacific/Auckland',
  'Africa/Johannesburg', 'UTC',
];

// ---------------------------------------------------------------- primitives
function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label className="ad-field-label">{label}</label>}
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 5 }}>{hint}</div>}
    </div>
  );
}
function Text({ value, onChange, placeholder }) {
  return <input className="ad-input" value={value || ''} placeholder={placeholder || ''}
    onChange={(e) => onChange(e.target.value)} />;
}
function Area({ value, onChange, rows, placeholder }) {
  return <textarea className="ad-textarea" value={value || ''} placeholder={placeholder || ''}
    style={{ minHeight: (rows || 4) * 22 }} onChange={(e) => onChange(e.target.value)} />;
}
function Card({ children, style }) {
  return <div style={{ background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{children}</h2>
      {sub && <p style={{ color: 'var(--dim)', marginTop: 5, maxWidth: 620 }}>{sub}</p>}
    </div>
  );
}

// drop zone returning File[] (filtered to images/videos)
function ImageDrop({ onFiles, label }) {
  const [over, setOver] = useAState(false);
  const inputRef = useARef(null);
  const handle = (list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/') || isVideoName(f.name) || isGifName(f.name));
    if (files.length) onFiles(files);
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current && inputRef.current.click()}
      style={{
        border: '1.5px dashed ' + (over ? 'var(--accent)' : 'var(--line)'),
        borderRadius: 10, padding: '18px 14px', textAlign: 'center', cursor: 'pointer',
        color: over ? 'var(--accent)' : 'var(--dim)', background: over ? 'rgba(124,255,178,0.06)' : 'transparent',
        transition: 'all .15s ease',
      }}>
      {label || 'Drop images / videos here, or click to choose'}
      <input ref={inputRef} type="file" accept="image/*,video/*,.gif" multiple style={{ display: 'none' }}
        onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

// thumbnail that resolves new (in-memory) sources from the image map
function Thumb({ src, imgMap, style }) {
  const resolved = (imgMap && imgMap[src] && imgMap[src].url) || src;
  const item = imgMap && imgMap[src];
  const isVid = item ? item.isVideo : isVideoName(src || '');
  if (isVid) {
    return <video src={resolved} muted style={{ objectFit: 'cover', background: '#000', ...style }} />;
  }
  return <img src={resolved} alt="" draggable="false" style={{ objectFit: 'cover', background: '#222', ...style }} />;
}

// ---------------------------------------------------------------- gallery editor
function GalleryEditor({ project, imgMap, onAddImages, onChange }) {
  const gallery = project.gallery || [];
  const [dragFrom, setDragFrom] = useAState(null);
  const [over, setOver] = useAState(null);
  const [embedUrl, setEmbedUrl] = useAState('');
  const [mode, setMode] = useAState('arrange'); // 'arrange' | 'preview'
  const [nat, setNat] = useAState({}); // src -> { w, h }
  const REAL_COL = 1180; // desktop gallery column max width on the live site
  const setW = (i, w) => onChange(gallery.map((it, j) => j === i ? { ...it, w } : it));
  const noteNat = (src, w, h) => setNat((m) => (m[src] && m[src].w === w) ? m : { ...m, [src]: { w, h } });

  const move = (from, to) => {
    if (from == null || to == null || from === to) return;
    const next = gallery.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };
  const remove = (i) => { const next = gallery.slice(); next.splice(i, 1); onChange(next); };
  const setMain = (i) => {
    // make item i the main index thumbnail: move to front
    move(i, 0);
  };
  const addEmbed = () => {
    const u = embedUrl.trim();
    if (!u) return;
    let type = 'vimeo';
    if (/youtu\.?be|youtube\.com/.test(u)) type = 'youtube';
    let src = u;
    if (type === 'youtube') {
      const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
      if (m) src = 'https://www.youtube.com/embed/' + m[1];
    }
    onChange(gallery.concat([{ type, src }]));
    setEmbedUrl('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <label className="ad-field-label" style={{ margin: 0 }}>Gallery — first item is the index thumbnail</label>
        <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 8, padding: 3 }}>
          {[['arrange', 'Arrange'], ['preview', 'Page preview']].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 12px', fontSize: 12,
                background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#000' : 'var(--dim)', fontWeight: mode === m ? 600 : 400 }}>{lbl}</button>
          ))}
        </div>
      </div>

      {mode === 'arrange' &&
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 10, marginBottom: 14 }}>
        {gallery.map((it, i) => (
          <div key={i}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => { e.preventDefault(); setOver(i); }}
            onDrop={() => { move(dragFrom, i); setDragFrom(null); setOver(null); }}
            onDragEnd={() => { setDragFrom(null); setOver(null); }}
            style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'grab',
              border: '2px solid ' + (over === i ? 'var(--accent)' : (i === 0 ? 'rgba(124,255,178,0.5)' : 'transparent')),
              opacity: dragFrom === i ? 0.4 : 1, aspectRatio: '1 / 1', background: '#000',
            }}>
            {it.type === 'image' || it.type === 'video'
              ? <Thumb src={it.src} imgMap={imgMap} style={{ width: '100%', height: '100%' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{it.type}</div>}
            <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, background: 'rgba(0,0,0,0.7)', padding: '2px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: it.type === 'image' ? 'var(--dim)' : 'var(--accent)' }}>
              {i === 0 ? 'thumb' : it.type}
            </div>
            {it.w != null && it.w < 100 &&
            <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 9, background: 'rgba(0,0,0,0.7)', padding: '2px 5px', borderRadius: 4, color: 'var(--accent)' }}>{it.w}%</div>}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: 4, gap: 4 }}>
              {i !== 0 && <button onClick={() => setMain(i)} title="Make index thumbnail" style={miniBtn}>★</button>}
              <span style={{ flex: 1 }} />
              <button onClick={() => remove(i)} title="Remove" style={{ ...miniBtn, color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
        ))}
      </div>}

      {mode === 'preview' &&
      <div style={{ background: '#000', borderRadius: 10, padding: '18px 0', marginBottom: 14, maxHeight: 560, overflowY: 'auto' }}>
        <div style={{ margin: '0 auto', width: '78%' }}>
          {gallery.map((it, i) => {
            const w = it.w != null ? it.w : 100;
            const n = nat[it.src];
            const realPx = Math.round(REAL_COL * w / 100);
            const low = n && (it.type === 'image' || it.type === 'video') && n.w < realPx * 0.9;
            const resolved = (imgMap && imgMap[it.src] && imgMap[it.src].url) || it.src;
            const isVid = imgMap && imgMap[it.src] ? imgMap[it.src].isVideo : isVideoName(it.src || '');
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ width: w + '%' }}>
                  {it.type === 'image' && !isVid &&
                    <img src={resolved} alt="" draggable="false" onLoad={(e) => noteNat(it.src, e.target.naturalWidth, e.target.naturalHeight)}
                      style={{ width: '100%', display: 'block', borderRadius: 3 }} />}
                  {(it.type === 'video' || isVid) &&
                    <video src={resolved} autoPlay loop muted playsInline
                      ref={(el) => { if (el) { el.muted = true; el.volume = 0; } }}
                      onLoadedMetadata={(e) => { e.target.muted = true; e.target.volume = 0; noteNat(it.src, e.target.videoWidth, e.target.videoHeight); }}
                      style={{ width: '100%', display: 'block', borderRadius: 3 }} />}
                  {(it.type === 'vimeo' || it.type === 'youtube') &&
                    <div style={{ width: '100%', paddingBottom: '56.25%', position: 'relative', background: '#111', borderRadius: 3 }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{it.type} embed</div>
                    </div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, padding: '0 2px' }}>
                  <span style={{ fontSize: 10, color: 'var(--dim2)', width: 18 }}>{i + 1}</span>
                  <input type="range" min={15} max={100} step={1} value={w}
                    onChange={(e) => setW(i, parseInt(e.target.value, 10))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 11, color: 'var(--dim)', width: 34, textAlign: 'right' }}>{w}%</span>
                  {n && <span style={{ fontSize: 10, color: 'var(--dim2)', width: 62 }}>{n.w}×{n.h}</span>}
                  {low &&
                    <span title={'Source is ' + n.w + 'px wide but displays at ~' + realPx + 'px on the site — it will look soft/pixelated. Reduce the width.'}
                      style={{ fontSize: 10, color: '#ffcf5c', whiteSpace: 'nowrap' }}>⚠ upscaled</span>}
                  <button onClick={() => remove(i)} title="Remove" style={{ ...miniBtn, background: 'transparent', color: 'var(--danger)', width: 20 }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>}

      <ImageDrop onFiles={onAddImages} label="+ Add images or videos to this project" />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input className="ad-input" placeholder="Paste a YouTube or Vimeo URL to embed" value={embedUrl}
          onChange={(e) => setEmbedUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addEmbed()} />
        <button className="ad-btn ghost" onClick={addEmbed}>Add embed</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 8 }}>
        Page preview shows each item at the width it appears on the site. Drag a slider to resize; ⚠ upscaled means the file's resolution is lower than its display size and will look pixelated.
      </div>
    </div>
  );
}
const miniBtn = {
  width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer',
  background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12, lineHeight: 1, padding: 0,
};

// ---------------------------------------------------------------- project editor
function KeywordsEditor({ value, onChange }) {
  const list = value || [];
  const [draft, setDraft] = useAState('');
  const add = () => { const v = draft.trim(); if (v) { onChange(list.concat([v])); setDraft(''); } };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
        {list.map((k, i) => (
          <span key={i} className="ad-chip">{k}<button onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</button></span>
        ))}
        {list.length === 0 && <span style={{ color: 'var(--dim2)', fontSize: 12 }}>No keywords yet</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="ad-input" placeholder="Add a keyword" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="ad-btn ghost" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function ProjectEditor({ project, imgMap, onPatch, onAddImages, onDelete }) {
  const set = (k, v) => onPatch({ [k]: v });
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Title"><Text value={project.title} onChange={(v) => set('title', v)} /></Field>
        <Field label="Year"><Text value={project.year} onChange={(v) => set('year', v)} /></Field>
      </div>
      <Field label="Collaborator (optional)"><Text value={project.collab} onChange={(v) => set('collab', v)} placeholder="e.g. Amber McCartney" /></Field>
      <Field label="Client / context (optional)"><Text value={project.client} onChange={(v) => set('client', v)} /></Field>
      <Field label="Medium / materials (optional)"><Area value={project.medium} rows={2} onChange={(v) => set('medium', v)} /></Field>
      <Field label="Keywords"><KeywordsEditor value={project.keywords} onChange={(v) => set('keywords', v)} /></Field>
      <Field label="Description" hint="Blank lines create paragraph breaks.">
        <Area value={project.desc} rows={7} onChange={(v) => set('desc', v)} />
      </Field>
      <GalleryEditor project={project} imgMap={imgMap} onAddImages={onAddImages}
        onChange={(g) => set('gallery', g)} />
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--dim2)', fontSize: 12 }}>id: {project.id}</span>
        <button className="ad-btn danger" onClick={onDelete}>Delete project</button>
      </div>
    </Card>
  );
}

Object.assign(window, {
  slugify, fileToDataURL, isVideoName, isGifName, TZONES,
  Field, Text, Area, Card, SectionTitle, ImageDrop, Thumb,
  GalleryEditor, KeywordsEditor, ProjectEditor,
});
