// project-page.jsx — single project: info panel + reorderable/resizable gallery.
// Exposes window.ProjectPage

const { useState: usePPState, useRef: usePPRef, useEffect: usePPEffect } = React;

// Parse [text](url) markdown links inline
function RichText({ text }) {
  if (!text) return null;
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[2]} target="_blank" rel="noopener" data-clickable
        style={{ color: '#8FB8FF', textDecoration: 'underline', textUnderlineOffset: 2 }}>{m[1]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span style={{ whiteSpace: 'pre-wrap' }}>{parts}</span>;
}

// Compact thumbnail grid for quick reordering (shown in info panel when unlocked)
function ReorderGrid({ order, gallery, onReorder }) {
  const [dragFrom, setDragFrom] = usePPState(null);
  const [dragOver, setDragOver] = usePPState(null);

  const onDrop = (e, idx) => {
    e.preventDefault();
    if (dragFrom === null || dragFrom === idx) { setDragFrom(null); setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(idx, 0, moved);
    onReorder(next);
    setDragFrom(null); setDragOver(null);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 6, letterSpacing: '0.06em' }}>DRAG TO REORDER</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {order.map((origIdx, dispIdx) => {
          const item = gallery[origIdx];
          const isImg = item && item.type === 'image';
          return (
            <div key={origIdx} draggable
              onDragStart={() => setDragFrom(dispIdx)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(dispIdx); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, dispIdx)}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              style={{
                width: 54, height: 40, cursor: 'grab', position: 'relative',
                overflow: 'hidden', borderRadius: 3, flexShrink: 0,
                opacity: dragFrom === dispIdx ? 0.25 : 1,
                outline: dragOver === dispIdx && dragFrom !== dispIdx
                  ? '2px solid rgba(255,255,255,0.8)' : '1px solid rgba(255,255,255,0.12)',
              }}>
              {isImg
                ? <img src={item.src} draggable="false"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
                    {item && item.type === 'vimeo' ? 'vimeo' : 'vid'}
                  </div>
              }
              <div style={{
                position: 'absolute', bottom: 1, right: 2, fontSize: 8,
                color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', lineHeight: 1,
              }}>{dispIdx + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Resize drag handle (bottom-right of each gallery item)
function ResizeHandle({ onMouseDown }) {
  return (
    <div onMouseDown={onMouseDown} draggable="false"
      style={{
        position: 'absolute', bottom: 6, right: 6, width: 18, height: 18,
        cursor: 'ew-resize', background: 'rgba(255,255,255,0.22)',
        borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 5, userSelect: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
    >
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <line x1="1" y1="4" x2="9" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        <polyline points="6,1.5 9,4 6,6.5" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function ProjectInfo({ p, top, locked, order, onReorder, sizes, onStartResize, galleryRef, mobile = false }) {
  const linksKey = 'project-links-' + p.id;
  const [extraLinks, setExtraLinks] = usePPState(() => {
    try { return JSON.parse(window.layoutGet(linksKey)) || []; } catch (_) { return []; }
  });
  const [linkLabel, setLinkLabel] = usePPState('');
  const [linkUrl, setLinkUrl]   = usePPState('');

  const saveLinks = (next) => {
    setExtraLinks(next);
    try { localStorage.setItem(linksKey, JSON.stringify(next)); } catch (_) {}
  };
  const addLink = () => {
    if (!linkUrl.trim()) return;
    saveLinks([...extraLinks, { label: linkLabel.trim() || linkUrl.trim(), url: linkUrl.trim() }]);
    setLinkLabel(''); setLinkUrl('');
  };
  const removeLink = (i) => saveLinks(extraLinks.filter((_, j) => j !== i));

  const inputStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4, color: '#fff', fontSize: 11, padding: '4px 8px',
    width: '100%', fontFamily: FONT, outline: 'none', marginBottom: 4,
  };

  return (
    <div style={mobile ? {
      position: 'relative', width: '100%', boxSizing: 'border-box',
      background: 'rgba(0,0,0,var(--bubble-op,1))', borderRadius: 0,
      padding: '20px', fontFamily: FONT, color: '#fff',
      fontSize: 12, lineHeight: 1.5, zIndex: 1,
    } : {
      position: 'fixed', left: 24, top, width: 345,
      maxHeight: 'calc(100vh - ' + (top + 38) + 'px)',
      overflowY: 'auto', background: 'rgba(0,0,0,var(--bubble-op,1))', borderRadius: 15,
      padding: '22px 24px', fontFamily: FONT, color: '#fff',
      fontSize: 12, lineHeight: 1.5, zIndex: 24,
    }}>
      <div style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{p.title}</div>
      <div>{p.year}</div>
      {p.medium && (
        <div style={{ opacity: 0.7, marginTop: 12 }}>[{p.medium}]</div>
      )}
      {p.client && (
        <div style={{ opacity: 0.6, marginTop: 6 }}>
          Client: <RichText text={p.client} />
        </div>
      )}
      {p.desc && (
        <div style={{ marginTop: 14, opacity: 0.92 }}>
          <RichText text={p.desc} />
        </div>
      )}

      {/* Project-data links */}
      {p.links && p.links.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {p.links.map((l, i) => (
            <div key={i}>
              <a href={l.url} target="_blank" rel="noopener" data-clickable
                style={{ color: '#8FB8FF', textDecoration: 'underline', fontSize: 12 }}>{l.label || l.url}</a>
            </div>
          ))}
        </div>
      )}

      {/* Author-added extra links */}
      {extraLinks.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {extraLinks.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <a href={l.url} target="_blank" rel="noopener" data-clickable
                style={{ color: '#8FB8FF', textDecoration: 'underline', fontSize: 12, flex: 1, wordBreak: 'break-all' }}>{l.label}</a>
              {!locked && (
                <span onClick={() => removeLink(i)}
                  style={{ cursor: 'pointer', opacity: 0.4, fontSize: 11, userSelect: 'none', flexShrink: 0 }}>×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Authoring tools (shown when unlocked) */}
      {!locked && (
        <React.Fragment>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 6, letterSpacing: '0.06em' }}>ADD LINK</div>
            <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Label" style={inputStyle} />
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…" style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
            <button data-clickable onClick={addLink}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 4, color: '#fff', fontSize: 11, padding: '4px 14px',
                cursor: 'pointer', fontFamily: FONT }}>Add</button>
          </div>

          {p.gallery && p.gallery.length > 1 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 10, opacity: 0.4, letterSpacing: '0.06em' }}>REORDER IMAGES</div>
              <ReorderGrid order={order} gallery={p.gallery} onReorder={onReorder} />
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

function ProjectPage({ p, locationStyle, locked, mobile = false }) {
  const orderKey = 'gallery-order-' + p.id;
  const sizesKey = 'gallery-widths-' + p.id;

  const [order, setOrder] = usePPState(() => {
    try {
      const saved = JSON.parse(window.layoutGet(orderKey));
      if (Array.isArray(saved) && saved.length === p.gallery.length) return saved;
    } catch (_) {}
    return p.gallery.map((_, i) => i);
  });

  const [sizes, setSizes] = usePPState(() => {
    try { return JSON.parse(window.layoutGet(sizesKey)) || {}; } catch (_) { return {}; }
  });

  const [dragFrom, setDragFrom] = usePPState(null);
  const [dragOver, setDragOver] = usePPState(null);
  const galleryRef = usePPRef(null);

  // Eased (smooth) vertical wheel scrolling for the gallery
  usePPEffect(() => {
    let targetY = window.scrollY, animating = false, raf = 0;
    const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const tick = () => {
      const cur = window.scrollY;
      const next = cur + (targetY - cur) * 0.13;
      if (Math.abs(targetY - cur) < 0.5) { window.scrollTo(0, targetY); animating = false; return; }
      window.scrollTo(0, next); raf = requestAnimationFrame(tick);
    };
    const onWheel = (e) => {
      if (e.ctrlKey) return;            // let pinch-zoom through
      if (!animating) targetY = window.scrollY;
      targetY = Math.max(0, Math.min(maxY(), targetY + e.deltaY));
      e.preventDefault();
      if (!animating) { animating = true; raf = requestAnimationFrame(tick); }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => { window.removeEventListener('wheel', onWheel); cancelAnimationFrame(raf); };
  }, [p.id]);

  const gallery = order.map((i) => p.gallery[i]);

  if (mobile) {
    return (
      <div style={{ paddingBottom: 100 }}>
        <BioShort locationStyle={locationStyle} mobile contact={false} />
        <ProjectInfo
          p={p} top={0} locked={locked} mobile
          order={order} onReorder={handleReorder}
          sizes={sizes} onStartResize={startResize}
          galleryRef={galleryRef}
        />
        <div ref={galleryRef} style={{ padding: '12px 16px', paddingBottom: 80 }}>
          {gallery.map((item, displayIdx) => {
            const origIdx = order[displayIdx];
            return (
              <div key={origIdx} style={{ marginBottom: 10 }}>
                <GalleryItem item={item} rounded />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const handleReorder = (next) => {
    setOrder(next);
    try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch (_) {}
  };

  const onDrop = (e, idx) => {
    e.preventDefault();
    if (dragFrom === null || dragFrom === idx) { setDragFrom(null); setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(idx, 0, moved);
    handleReorder(next);
    setDragFrom(null); setDragOver(null);
  };

  const startResize = (origIdx, e) => {
    e.stopPropagation(); e.preventDefault();
    const container = galleryRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const startX = e.clientX;
    const startPct = sizes[origIdx] != null ? sizes[origIdx] : 100;
    const onMove = (me) => {
      const dx = me.clientX - startX;
      const newPct = Math.max(15, Math.min(100, startPct + (dx / containerW) * 100));
      const next = { ...sizes, [origIdx]: Math.round(newPct) };
      setSizes(next);
      try { localStorage.setItem(sizesKey, JSON.stringify(next)); } catch (_) {}
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div>
      <BioShort locationStyle={locationStyle} top={19} contact={false} />
      <ProjectInfo
        p={p} top={252} locked={locked}
        order={order} onReorder={handleReorder}
        sizes={sizes} onStartResize={startResize}
        galleryRef={galleryRef}
      />

      <div ref={galleryRef}
        style={{ marginLeft: 408, marginRight: 24, paddingTop: 19, paddingBottom: 120, maxWidth: 1180 }}>
        {gallery.map((item, displayIdx) => {
          const origIdx = order[displayIdx];
          const widthPct = sizes[origIdx] != null ? sizes[origIdx] : 100;
          return (
            <div
              key={origIdx}
              draggable={!locked}
              onDragStart={!locked ? () => setDragFrom(displayIdx) : undefined}
              onDragOver={!locked ? (e) => { e.preventDefault(); setDragOver(displayIdx); } : undefined}
              onDragLeave={!locked ? () => setDragOver(null) : undefined}
              onDrop={!locked ? (e) => onDrop(e, displayIdx) : undefined}
              onDragEnd={!locked ? () => { setDragFrom(null); setDragOver(null); } : undefined}
              style={{
                marginBottom: 14,
                width: widthPct + '%',
                position: 'relative',
                cursor: !locked ? (dragFrom !== null ? 'grabbing' : 'grab') : 'default',
                opacity: !locked && dragFrom === displayIdx ? 0.35 : 1,
                outline: !locked && dragOver === displayIdx && dragFrom !== null && dragFrom !== displayIdx
                  ? '1px solid rgba(255,255,255,0.45)' : '1px solid transparent',
                transition: 'opacity 0.15s ease, outline-color 0.1s ease',
              }}
            >
              <GalleryItem item={item} />
              {!locked && <ResizeHandle onMouseDown={(e) => startResize(origIdx, e)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ProjectPage = ProjectPage;
