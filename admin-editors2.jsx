// admin-editors2.jsx — site/bio/location/diagram/index editors for the CMS.

const { useState: useA2State } = React;

// ---- diagram geometry (mirrors diagram.jsx) ----
const A_FX = (x) => (x / 1728) * 100;
const A_FY = (y) => (y / 1117) * 100;
const A_DEFAULT_NODES = [
  { x: A_FX(935.5), y: A_FY(814.5) }, { x: A_FX(1046.5), y: A_FY(588.5) },
  { x: A_FX(1024.5), y: A_FY(713.5) }, { x: A_FX(857.5), y: A_FY(744.5) },
  { x: A_FX(857.5), y: A_FY(356.5) }, { x: A_FX(1377.5), y: A_FY(343.5) },
  { x: A_FX(1430.5), y: A_FY(467.5) }, { x: A_FX(1151.5), y: A_FY(498.5) },
  { x: A_FX(1011.5), y: A_FY(575.5) }, { x: A_FX(922.5), y: A_FY(690.5) },
  { x: A_FX(1157.5), y: A_FY(719.5) }, { x: A_FX(751.5), y: A_FY(888.5) },
  { x: A_FX(801.5), y: A_FY(178.5) }, { x: A_FX(1399.5), y: A_FY(165.5) },
  { x: A_FX(520), y: A_FY(500) }, { x: A_FX(1520), y: A_FY(640) },
  { x: A_FX(620), y: A_FY(750) }, { x: A_FX(1600), y: A_FY(820) },
];
const A_AXIS = {
  mainH: { y: A_FY(519), x1: A_FX(698), x2: A_FX(1554) },
  mainV: { x: A_FX(1126), y1: A_FY(91), y2: A_FY(947) },
  yLeg: { x: A_FX(698), y1: A_FY(391), y2: A_FY(646.5) },
  xLeg: { y: A_FY(947), x1: A_FX(998), x2: A_FX(1253.5) },
};
function defaultPosFor(index) { return A_DEFAULT_NODES[index % A_DEFAULT_NODES.length]; }

// ---- Location editor ----
function LocationEditor({ location, onPatch }) {
  const [now, setNow] = useA2State('');
  React.useEffect(() => {
    const fmt = () => { try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: location.tz }).format(new Date()); } catch (_) { return '—'; } };
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, [location.tz]);
  return (
    <Card>
      <Field label="Current location (city)" hint="Shown as “Current Location: …” in the bio bubble.">
        <Text value={location.city} onChange={(v) => onPatch({ city: v })} placeholder="Berlin" />
      </Field>
      <Field label="Timezone (drives the live clock)">
        <select className="ad-select" value={location.tz} onChange={(e) => onPatch({ tz: e.target.value })}>
          {window.TZONES.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </Field>
      <div style={{ marginTop: 6, padding: '12px 14px', background: 'var(--panel2)', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
        <span>Current Location: {location.city || '—'}</span>
        <span style={{ color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>{now}</span>
      </div>
    </Card>
  );
}

// ---- Bio editor ----
function WorkingEditor({ items, imgMap, onChange, onAddImage }) {
  const list = items || [];
  const set = (i, patch) => onChange(list.map((it, j) => j === i ? { ...it, ...patch } : it));
  return (
    <div>
      {list.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Area value={it.text} rows={2} onChange={(v) => set(i, { text: v })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              {it.img
                ? <React.Fragment>
                    <Thumb src={it.img} imgMap={imgMap} style={{ width: 40, height: 40, borderRadius: 6 }} />
                    <button className="ad-btn ghost" style={{ padding: '5px 10px' }} onClick={() => set(i, { img: '' })}>Remove hover image</button>
                  </React.Fragment>
                : <label className="ad-btn ghost" style={{ padding: '5px 10px', cursor: 'pointer' }}>
                    Add hover image
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files[0]; if (f) onAddImage(f, (path) => set(i, { img: path })); e.target.value = ''; }} />
                  </label>}
            </div>
          </div>
          <button className="ad-btn danger" style={{ padding: '6px 10px' }} onClick={() => onChange(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="ad-btn ghost" onClick={() => onChange(list.concat([{ text: '', img: '' }]))}>+ Add “working on” item</button>
    </div>
  );
}

function BioEditor({ bio, imgMap, onPatch, onAddImage }) {
  const set = (k, v) => onPatch({ [k]: v });
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name"><Text value={bio.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Role"><Text value={bio.role} onChange={(v) => set('role', v)} /></Field>
      </div>
      <Field label="Statement" hint="Blank lines create paragraph breaks."><Area value={bio.statement} rows={6} onChange={(v) => set('statement', v)} /></Field>
      <Field label="“Open to” line (optional)"><Text value={bio.openTo} onChange={(v) => set('openTo', v)} /></Field>
      <Field label="Working on" hint="Each item can have a hover image (shows beside the cursor on the About page).">
        <WorkingEditor items={bio.working} imgMap={imgMap} onChange={(v) => set('working', v)} onAddImage={onAddImage} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Email"><Text value={bio.email} onChange={(v) => set('email', v)} /></Field>
        <Field label="Instagram handle"><Text value={bio.instagram} onChange={(v) => set('instagram', v)} /></Field>
      </div>
      <Field label="Instagram URL"><Text value={bio.instagramUrl} onChange={(v) => set('instagramUrl', v)} /></Field>
    </Card>
  );
}

// ---- Diagram position picker ----
function DiagramPicker({ projects, positions, onMove }) {
  const ref = React.useRef(null);
  const dragId = React.useRef(null);
  const lineCol = 'rgba(255,255,255,0.5)';
  React.useEffect(() => {
    const onMoveEv = (e) => {
      if (!dragId.current || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      onMove(dragId.current, x, y);
    };
    const onUp = () => { dragId.current = null; };
    window.addEventListener('mousemove', onMoveEv);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMoveEv); window.removeEventListener('mouseup', onUp); };
  }, [onMove]);
  const [hot, setHot] = useA2State(null);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '1728 / 1117', background: '#0e0f11', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', userSelect: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <line x1={A_AXIS.mainH.x1} y1={A_AXIS.mainH.y} x2={A_AXIS.mainH.x2} y2={A_AXIS.mainH.y} stroke={lineCol} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        <line x1={A_AXIS.mainV.x} y1={A_AXIS.mainV.y1} x2={A_AXIS.mainV.x} y2={A_AXIS.mainV.y2} stroke={lineCol} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        <line x1={A_AXIS.yLeg.x} y1={A_AXIS.yLeg.y1} x2={A_AXIS.yLeg.x} y2={A_AXIS.yLeg.y2} stroke={lineCol} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        <line x1={A_AXIS.xLeg.x1} y1={A_AXIS.xLeg.y} x2={A_AXIS.xLeg.x2} y2={A_AXIS.xLeg.y} stroke={lineCol} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {[['CURSED', A_AXIS.yLeg.x, A_FY(370), '-50%,-100%'], ['BLESSED', A_AXIS.yLeg.x, A_FY(660), '-50%,0'], ['FOR US', A_AXIS.xLeg.x1, A_AXIS.xLeg.y, '-100%,-50%'], ['FOR OUR ENEMIES', A_AXIS.xLeg.x2, A_AXIS.xLeg.y, '0,-50%']].map(([t, x, y, tr]) => (
        <div key={t} style={{ position: 'absolute', left: x + '%', top: y + '%', transform: 'translate(' + tr + ')', fontSize: 8, color: 'var(--dim)', whiteSpace: 'nowrap', padding: '0 6px' }}>{t}</div>
      ))}
      {projects.map((p, i) => {
        const pt = positions[p.id] || defaultPosFor(i);
        const isHot = hot === p.id;
        return (
          <div key={p.id}
            onMouseDown={(e) => { e.preventDefault(); dragId.current = p.id; }}
            onMouseEnter={() => setHot(p.id)} onMouseLeave={() => setHot(null)}
            style={{ position: 'absolute', left: pt.x + '%', top: pt.y + '%', width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: '50%', background: isHot ? 'var(--accent)' : '#fff', cursor: 'grab', boxShadow: isHot ? '0 0 0 4px rgba(124,255,178,0.25)' : 'none' }}>
            {isHot && <div style={{ position: 'absolute', left: 18, top: -2, whiteSpace: 'nowrap', fontSize: 11, background: 'rgba(0,0,0,0.85)', padding: '2px 7px', borderRadius: 5, pointerEvents: 'none' }}>{p.title}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---- Index column order ----
function IndexOrderEditor({ projects, imgMap, onReorder }) {
  const [dragFrom, setDragFrom] = useA2State(null);
  const [over, setOver] = useA2State(null);
  const move = (from, to) => {
    if (from == null || to == null || from === to) return;
    const next = projects.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorder(next);
  };
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {projects.map((p, i) => {
        const thumb = (p.gallery || []).find((g) => g.type === 'image');
        return (
          <div key={p.id}
            draggable onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => { e.preventDefault(); setOver(i); }}
            onDrop={() => { move(dragFrom, i); setDragFrom(null); setOver(null); }}
            onDragEnd={() => { setDragFrom(null); setOver(null); }}
            style={{ width: 132, cursor: 'grab', opacity: dragFrom === i ? 0.4 : 1, border: '2px solid ' + (over === i ? 'var(--accent)' : 'transparent'), borderRadius: 10, padding: 6, background: 'var(--panel)' }}>
            <div style={{ aspectRatio: '3 / 4', borderRadius: 6, overflow: 'hidden', background: '#000', marginBottom: 6 }}>
              {thumb ? <Thumb src={thumb.src} imgMap={imgMap} style={{ width: '100%', height: '100%' }} /> : <div style={{ width: '100%', height: '100%' }} />}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.3 }}>{i + 1}. {p.title}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Entity position (global; the large About-page vector entity) ----
const ENTITY_DEFAULT = { left: -40, top: -712 }; // matches LARGE_ENTITY_DEFAULT bottom-anchor roughly
function EntityPositionEditor({ pos, onChange }) {
  const p = pos || ENTITY_DEFAULT;
  const nudge = (dx, dy) => onChange({ left: p.left + dx, top: p.top + dy });
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 }}>
          <span />
          <button onClick={() => nudge(0, -10)} style={entBtnStyle}>▲</button>
          <span />
          <button onClick={() => nudge(-10, 0)} style={entBtnStyle}>◀</button>
          <button onClick={() => onChange(null)} title="Reset to default" style={{ ...entBtnStyle, fontSize: 11 }}>↺</button>
          <button onClick={() => nudge(10, 0)} style={entBtnStyle}>▶</button>
          <span />
          <button onClick={() => nudge(0, 10)} style={entBtnStyle}>▼</button>
          <span />
        </div>
        <div style={{ color: 'var(--dim)', fontSize: 12, lineHeight: 1.7 }}>
          Nudges the large vector entity on the About page.<br />
          Current offset: left {Math.round(p.left)}px, top {Math.round(p.top)}px.<br />
          Saved to Supabase with the rest of your changes — click <b>Save</b> above.
        </div>
      </div>
    </Card>
  );
}
const entBtnStyle = {
  width: 34, height: 34, borderRadius: 7, border: '1px solid var(--line)', background: 'var(--panel2)',
  color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1,
};

Object.assign(window, {
  A_DEFAULT_NODES, defaultPosFor, ENTITY_DEFAULT,
  LocationEditor, BioEditor, DiagramPicker, IndexOrderEditor, EntityPositionEditor,
});
