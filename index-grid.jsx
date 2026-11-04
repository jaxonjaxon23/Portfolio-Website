// index-grid.jsx — horizontal-scrolling board of project columns.
// Exposes window.IndexGrid

const { useRef: useIRef, useEffect: useIEffect, useState: useIState } = React;

function TitleCard({ p }) {
  const isSuperflux = p.client && p.client.toLowerCase().includes('superflux');
  return (
    <div style={{
      border: 'none', borderRadius: 9,
      padding: '12px 14px', marginBottom: 10, background: '#000',
      fontFamily: FONT, color: '#fff', fontSize: 12, lineHeight: 1.45,
    }}>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 14, lineHeight: 1.2, letterSpacing: '0.02em' }}>{p.title}</div>
      <div style={{ opacity: 0.62, marginTop: 2 }}>{p.year}</div>
      {p.collab && (
        <div style={{ opacity: 0.55, marginTop: 3, fontSize: 11 }}>{p.collab}</div>
      )}
      {isSuperflux && (
        <div style={{ opacity: 0.55, marginTop: 5, fontSize: 11 }}>{p.client.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</div>
      )}
    </div>
  );
}

function KeywordsCard({ p }) {
  if (!p.keywords || !p.keywords.length) return null;
  return (
    <div style={{
      border: 'none', borderRadius: 9,
      padding: '11px 14px', marginBottom: 14, background: '#000',
      fontFamily: FONT, fontSize: 12, lineHeight: 1.5,
    }}>
      <div style={{ color: '#8FB8FF', marginBottom: 3 }}>key words:</div>
      <div style={{ color: '#8FB8FF', opacity: 0.92 }}>{p.keywords.join(', ')}</div>
    </div>
  );
}

// Mini drag-to-reorder thumbnail grid for per-column preview editing
function ThumbGrid({ order, gallery, onReorder }) {
  const [dragFrom, setDragFrom] = useIState(null);
  const [dragOver, setDragOver] = useIState(null);

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
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
              width: 44, height: 34, cursor: 'grab', position: 'relative',
              overflow: 'hidden', borderRadius: 2, flexShrink: 0,
              opacity: dragFrom === dispIdx ? 0.2 : 1,
              outline: dragOver === dispIdx && dragFrom !== dispIdx
                ? '2px solid rgba(255,255,255,0.8)' : '1px solid rgba(255,255,255,0.1)',
            }}>
            {isImg
              ? <img src={item.src} draggable="false"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
              : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
                  {item && item.type === 'vimeo' ? 'vim' : 'vid'}
                </div>
            }
            <div style={{
              position: 'absolute', bottom: 1, right: 2, fontSize: 7,
              color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', lineHeight: 1,
            }}>{dispIdx + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

const ProjectColumn = React.memo(function ProjectColumn({ p, cardMode, imageLimit, locked, onOpen, onHover, eager, near = true, lite = false }) {
  const orderKey = 'gallery-order-' + p.id;
  const countKey  = 'preview-count-' + p.id;

  const [order, setOrder] = useIState(() => {
    try {
      const s = JSON.parse(window.layoutGet(orderKey));
      if (Array.isArray(s) && s.length === p.gallery.length) return s;
    } catch (_) {}
    return p.gallery.map((_, i) => i);
  });

  const [previewCount, setPreviewCount] = useIState(() => {
    try {
      const s = parseInt(window.layoutGet(countKey), 10);
      if (!isNaN(s) && s > 0) return s;
    } catch (_) {}
    return null; // null = fall back to global imageLimit
  });

  const [editing, setEditing] = useIState(false);

  const effective = Math.min(
    previewCount !== null ? previewCount : imageLimit,
    lite ? window.LITE_IMAGES : Infinity,      // lite mode: fewer images per column
    p.gallery.length
  );

  const updateOrder = (next) => {
    setOrder(next);
    try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch (_) {}
  };

  const nudgeCount = (delta) => {
    const next = Math.max(1, Math.min(p.gallery.length, effective + delta));
    setPreviewCount(next);
    try { localStorage.setItem(countKey, String(next)); } catch (_) {}
  };

  const visibleItems = order.slice(0, effective).map((origIdx) => ({
    item: p.gallery[origIdx], origIdx,
  }));

  const btnBase = {
    fontFamily: FONT, fontSize: 10, background: 'none', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 3, color: '#fff', cursor: 'pointer', padding: '2px 7px', lineHeight: 1.5,
  };

  return (
    <div
      style={{ width: 252, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
      onMouseEnter={() => !editing && onHover(p)}
      onMouseLeave={() => !editing && onHover(null)}
    >
      {(cardMode === 'title' || cardMode === 'full') && (
        <div data-clickable onClick={() => onOpen(p)} style={{ cursor: 'pointer' }}>
          <TitleCard p={p} />
        </div>
      )}
      {cardMode === 'full' && <KeywordsCard p={p} />}

      {/* Per-column edit panel (author only, when unlocked) */}
      {!locked && (
        <div style={{ marginBottom: 8 }}>
          <button data-clickable onClick={() => setEditing(!editing)}
            style={{ ...btnBase, border: 'none', opacity: editing ? 1 : 0.38,
              padding: 0, letterSpacing: '0.05em', marginBottom: editing ? 6 : 0 }}>
            {editing ? '▲ done' : '✎ edit preview'}
          </button>

          {editing && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontFamily: FONT, fontSize: 10, opacity: 0.4, marginBottom: 6, letterSpacing: '0.06em' }}>
                PREVIEW COUNT
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <button data-clickable onClick={() => nudgeCount(-1)} style={btnBase}>−</button>
                <span style={{ fontFamily: FONT, fontSize: 12, color: '#fff', minWidth: 20, textAlign: 'center' }}>
                  {effective}
                </span>
                <button data-clickable onClick={() => nudgeCount(1)} style={btnBase}>+</button>
                <span style={{ fontFamily: FONT, fontSize: 10, opacity: 0.35 }}>/ {p.gallery.length}</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 10, opacity: 0.4, letterSpacing: '0.06em' }}>
                ORDER (first {effective} shown)
              </div>
              <ThumbGrid order={order} gallery={p.gallery} onReorder={updateOrder} />
            </div>
          )}
        </div>
      )}

      {/* Image column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibleItems.map(({ item, origIdx }) => (
          <div key={origIdx} data-clickable onClick={() => onOpen(p)}
            style={{ cursor: 'pointer', lineHeight: 0 }}>
            <GalleryItem item={item} rounded eager={eager} preload={near} thumb placeholder={!near} />
          </div>
        ))}
      </div>
    </div>
  );
});

function IndexGrid({ cardMode, imageLimit, locked, onOpen, onHover, isMobile = false, locationStyle, lite = false }) {
  const allProjects = window.PROJECTS;
  const orderKey = 'index-project-order-v1';

  const [projectOrder, setProjectOrder] = useIState(() => {
    try {
      const saved = JSON.parse(window.layoutGet(orderKey));
      if (Array.isArray(saved) && saved.length === allProjects.length) return saved;
    } catch (_) {}
    return allProjects.map((_, i) => i);
  });

  const [dragColFrom, setDragColFrom] = useIState(null);
  const [dragColOver, setDragColOver] = useIState(null);
  const [savedToast, setSavedToast] = useIState(false);
  const scrollRef = useIRef(null);
  const toastTimer = useIRef(null);
  const trackRef = useIRef(null);     // the row of columns
  const barRef = useIRef(null);       // custom scrollbar (glide mode)
  const thumbRef = useIRef(null);
  // Glide mode (desktop with mouse/trackpad): instead of scrolling the board,
  // the row of columns slides as one GPU layer (CSS transform) by fractional
  // pixels. Native scrolling rounds to whole pixels, so the slow end of a
  // glide stepped 1px, 0px, 0px, 1px… (visible judder at a perfect 60 fps),
  // and every scrolled frame had to repaint the board. Touch screens keep
  // native scrolling for its momentum.
  const glide = !isMobile && !(navigator.maxTouchPoints > 0);

  // Columns load their images once within ~1.5 screens of the view (so they're
  // ready before they appear) and swap them for same-size placeholders only
  // beyond ~3 screens, so the browser can free the decoded pixels. The gap
  // between the two distances stops columns flip-flopping near the edge.
  // Memory stays flat however far you scroll.
  const [nearCols, setNearCols] = useIState(() => new Set(allProjects.slice(0, 8).map((p) => p.id)));
  useIEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    // Columns coming into range load at once; columns leaving range are only
    // cleared once scrolling has stopped, so unloading never costs a frame mid-scroll.
    const far = new Set();
    let idle = 0;
    const flushFar = () => {
      if (!far.size) return;
      const gone = [...far]; far.clear();
      setNearCols((prev) => { const next = new Set(prev); gone.forEach((id) => next.delete(id)); return next; });
    };
    const onScroll = () => { clearTimeout(idle); idle = setTimeout(flushFar, 400); };
    root.addEventListener('scroll', onScroll, { passive: true });
    const loadIO = new IntersectionObserver((entries) => {
      const add = [];
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const id = e.target.getAttribute('data-col-id');
        far.delete(id); add.push(id);
      });
      if (add.length) setNearCols((prev) => add.every((id) => prev.has(id)) ? prev : new Set([...prev, ...add]));
    }, { root, rootMargin: '0px 150% 0px 150%' });
    const unloadIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const id = e.target.getAttribute('data-col-id');
        if (e.isIntersecting) far.delete(id); else far.add(id);
      });
      clearTimeout(idle); idle = setTimeout(flushFar, 400);
    }, { root, rootMargin: '0px 300% 0px 300%' });
    root.querySelectorAll('[data-col-id]').forEach((el) => { loadIO.observe(el); unloadIO.observe(el); });
    return () => { loadIO.disconnect(); unloadIO.disconnect(); root.removeEventListener('scroll', onScroll); clearTimeout(idle); };
  }, [projectOrder]);

  const flashSaved = () => {
    setSavedToast(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSavedToast(false), 1600);
  };

  const projects = projectOrder.map((i) => allProjects[i]);

  const onColDrop = (e, toIdx) => {
    e.preventDefault();
    if (dragColFrom === null || dragColFrom === toIdx) {
      setDragColFrom(null); setDragColOver(null); return;
    }
    const next = [...projectOrder];
    const [moved] = next.splice(dragColFrom, 1);
    next.splice(toIdx, 0, moved);
    setProjectOrder(next);
    try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch (_) {}
    flashSaved();
    setDragColFrom(null); setDragColOver(null);
  };

  const liteRef = useIRef(lite);
  liteRef.current = lite;

  // ---- glide mode: the row slides as one GPU layer (see `glide` above) ----
  // Wheel (either axis), trackpad, click-drag, scrollbar drag and arrow keys
  // all move a target; each frame the row eases toward it by a fractional
  // amount. At rest it snaps to the nearest device pixel so text stays crisp.
  useIEffect(() => {
    if (!glide) return;
    const el = scrollRef.current, track = trackRef.current, bar = barRef.current, thumb = thumbRef.current;
    if (!el || !track) return;
    let x = 0, target = 0, raf = 0, lastT = 0, max = 0, ease = SCROLL_EASE;
    let barW = 0, thumbW = 0;            // cached sizes: frames only write, never read layout
    const dpr = () => window.devicePixelRatio || 1;
    const drawBar = () => {
      if (thumb) thumb.style.transform = 'translate3d(' + (max > 0 ? (barW - thumbW) * (x / max) : 0) + 'px,0,0)';
    };
    const apply = () => {
      track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
      el.__glideX = x;                      // (read by tests / debug)
      drawBar();
    };
    const frame = (t) => {
      const dt = lastT ? Math.min(64, t - lastT) : 16.667;
      lastT = t;
      x += (target - x) * (1 - Math.pow(1 - ease, dt / 16.667));
      const settled = Math.abs(target - x) < 0.05;
      if (settled) x = Math.round(target * dpr()) / dpr();   // crisp at rest
      apply();
      if (settled) { raf = 0; lastT = 0; } else raf = requestAnimationFrame(frame);
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const clamp = (v) => Math.max(0, Math.min(max, v));
    const by = (delta, e) => { ease = e; target = clamp(target + delta); go(); };
    const jump = (v) => { cancelAnimationFrame(raf); raf = 0; lastT = 0; x = target = clamp(v); apply(); };
    const measure = () => {
      const full = track.offsetWidth || 1;
      max = Math.max(0, full - el.clientWidth);
      if (bar && thumb) {
        barW = bar.clientWidth;
        thumbW = max > 0 ? Math.max(40, barW * el.clientWidth / full) : 0;
        thumb.style.width = thumbW + 'px';
        bar.style.display = max > 0 ? '' : 'none';
      }
      target = clamp(target); x = clamp(x); apply();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(track); ro.observe(el);
    measure();

    const onWheel = (e) => {
      if (e.ctrlKey) return;                                   // pinch-zoom
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const raw = horizontal ? e.deltaX : e.deltaY;
      if (!raw) return;
      e.preventDefault();
      const delta = wheelPx(raw, e.deltaMode, el.clientWidth);
      // trackpads send many small, fractional steps: follow them closely;
      // mouse wheels send big notches: glide softly
      const trackpad = e.deltaMode === 0 && (Math.abs(raw) < 40 || raw % 1 !== 0 || horizontal);
      by(delta, trackpad ? 0.35 : SCROLL_EASE);
    };
    let dragging = null;   // { from: 'board' | 'bar', x0, start }
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (bar && bar.contains(e.target)) {
        const r = bar.getBoundingClientRect(), tw = thumbW;
        const onThumb = thumb.contains(e.target);
        if (!onThumb) jump(((e.clientX - r.left - tw / 2) / Math.max(1, r.width - tw)) * max);   // click track: jump there
        dragging = { from: 'bar', x0: e.clientX, start: x };
        e.preventDefault();
        return;
      }
      if (e.target.closest && (e.target.closest('[data-clickable]') || e.target.closest('[data-col-handle]'))) return;
      dragging = { from: 'board', x0: e.clientX, start: x };
      el.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.x0;
      if (dragging.from === 'bar') {
        const W = barW - thumbW;
        jump(dragging.start + (W > 0 ? dx / W * max : 0));
      } else jump(dragging.start - dx);
    };
    const onUp = () => { dragging = null; el.style.cursor = ''; };
    const onKey = (e) => {
      if (!el.offsetParent || e.target.closest && e.target.closest('input, textarea, select')) return;   // index hidden / typing
      const page = el.clientWidth * 0.8;
      const step = { ArrowRight: 160, ArrowLeft: -160, PageDown: page, PageUp: -page }[e.key];
      if (step) { e.preventDefault(); by(step, SCROLL_EASE); }
      else if (e.key === 'Home') { e.preventDefault(); by(-target, SCROLL_EASE); }
      else if (e.key === 'End') { e.preventDefault(); by(max - target, SCROLL_EASE); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [glide]);

  // ---- native mode (touch screens): eased wheel scrolling, drag to pan ----
  useIEffect(() => {
    if (glide) return;
    const el = scrollRef.current;
    if (!el) return;
    const scroller = createSmoothScroller(
      () => el.scrollLeft, (x) => { el.scrollLeft = x; }, () => el.scrollWidth - el.clientWidth);
    const stop = () => scroller.stop();
    const onWheel = (e) => {
      if (e.ctrlKey) return;            // let pinch-zoom through
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // sideways trackpad swipe: native
      e.preventDefault();
      // eased in lite mode too: the easing costs next to nothing, and
      // un-eased wheel steps (100px jumps) read as stutter on a mouse wheel
      scroller.by(wheelPx(e.deltaY, e.deltaMode, el.clientWidth));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const onBoardScroll = () => scroller.sync();
    el.addEventListener('scroll', onBoardScroll, { passive: true });
    let down = false, startX = 0, startScroll = 0;
    const onDown = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-clickable]')) return;
      if (e.target && e.target.closest && e.target.closest('[data-col-handle]')) return;
      down = true; startX = e.clientX; startScroll = el.scrollLeft;
      stop();
      el.style.cursor = 'grabbing';
    };
    const onMove = (e) => { if (!down) return; el.scrollLeft = startScroll - (e.clientX - startX); };
    const onUp = () => { down = false; el.style.cursor = ''; };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onBoardScroll);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stop();
    };
  }, [glide]);

  // Mobile: the bio card fills the first screen, so on a visitor's first visit
  // slide the board right to reveal a project, then back — shows it scrolls.
  useIEffect(() => {
    if (!isMobile) return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      if (localStorage.getItem('swipe-nudge-seen')) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch (_) {}
    const timers = [];
    let obs = null, cancelled = false;
    const cancel = () => { cancelled = true; };
    el.addEventListener('touchstart', cancel, { passive: true, once: true });
    const onVisible = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', onVisible); nudge(); } };
    const nudge = () => {
      // opened in a background tab: hold the nudge until someone can see it
      if (document.visibilityState !== 'visible') { document.addEventListener('visibilitychange', onVisible); return; }
      timers.push(setTimeout(() => {
        if (cancelled || el.scrollLeft > 0) return;
        try { localStorage.setItem('swipe-nudge-seen', '1'); } catch (_) {}
        el.scrollTo({ left: 72, behavior: 'smooth' });
        timers.push(setTimeout(() => { if (!cancelled) el.scrollTo({ left: 0, behavior: 'smooth' }); }, 750));
      }, 500));
    };
    // wait for the preloader to fade so the nudge is actually seen
    const pre = document.getElementById('preloader');
    if (!pre || pre.classList.contains('hidden')) nudge();
    else {
      obs = new MutationObserver(() => {
        if (pre.classList.contains('hidden')) { obs.disconnect(); obs = null; nudge(); }
      });
      obs.observe(pre, { attributes: true, attributeFilter: ['class'] });
    }
    return () => {
      timers.forEach(clearTimeout);
      if (obs) obs.disconnect();
      el.removeEventListener('touchstart', cancel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isMobile]);

  return (
    // Mobile: horizontal only, as originally designed. Desktop: overflowY auto
    // keeps tall columns reachable on short laptop screens.
    <div ref={scrollRef} style={{
      position: 'fixed', inset: 0, overflowX: glide ? 'hidden' : 'auto', overflowY: isMobile ? 'hidden' : 'auto',
      backgroundColor: 'var(--board-bg, rgba(8,9,10,0.62))', // thinned in alarm mode (app.html)
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
      backgroundSize: '26px 26px', cursor: 'grab',
    }}>
      <div ref={trackRef} style={{
        display: 'flex', alignItems: 'flex-start', gap: isMobile ? 20 : 60,
        padding: isMobile ? '20px 24px 80px 16px' : '40px 56px 80px 408px',
        minHeight: '100%', width: 'max-content',
        willChange: glide ? 'transform' : undefined,
      }}>
        {isMobile && (
          <div style={{ width: 300, flexShrink: 0, position: 'relative', overflow: 'visible' }}>
            <BioAbout locationStyle={locationStyle} mobile />
            <window.MobileEntityAnchor which="small" />
            <window.MobileEntityAnchor which="large" />
          </div>
        )}
        {projects.map((p, colIdx) => (
          <div key={p.id} data-col-id={p.id}
            draggable={!locked}
            onDragStart={!locked ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDragColFrom(colIdx); } : undefined}
            onDragOver={!locked ? (e) => { e.preventDefault(); setDragColOver(colIdx); } : undefined}
            onDragLeave={!locked ? () => setDragColOver(null) : undefined}
            onDrop={!locked ? (e) => onColDrop(e, colIdx) : undefined}
            onDragEnd={!locked ? () => { setDragColFrom(null); setDragColOver(null); } : undefined}
            style={{
              position: 'relative',
              opacity: dragColFrom === colIdx ? 0.35 : 1,
              outline: !locked && dragColOver === colIdx && dragColFrom !== null && dragColFrom !== colIdx
                ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
              transition: 'opacity 0.15s ease',
            }}>
            {!locked && (
              <div data-col-handle style={{
                position: 'absolute', top: -18, left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
                cursor: 'grab', color: 'rgba(255,255,255,0.3)',
                fontSize: 10, letterSpacing: '0.1em', userSelect: 'none',
              }}>⠿⠿⠿</div>
            )}
            <ProjectColumn
              p={p} cardMode={cardMode} imageLimit={imageLimit}
              locked={locked} onOpen={onOpen} onHover={onHover}
              eager={colIdx < 3} near={nearCols.has(p.id)} lite={lite}
            />
          </div>
        ))}
      </div>

      {glide && (
        // slim scrollbar for glide mode (the board itself no longer scrolls)
        <div ref={barRef} data-clickable style={{
          position: 'fixed', left: 8, right: 8, bottom: 2, height: 9, zIndex: 30, cursor: 'default',
        }}>
          <div ref={thumbRef} style={{
            position: 'absolute', left: 0, top: 0, height: 9, width: 0, borderRadius: 6,
            background: 'rgba(255,255,255,0.16)', willChange: 'transform',
          }} />
        </div>
      )}

      {!locked && (
        <div style={{
          position: 'fixed', bottom: 58, left: '50%', transform: 'translateX(-50%)',
          fontFamily: FONT, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.55)', padding: '5px 14px', borderRadius: 20,
          pointerEvents: 'none', textTransform: 'uppercase',
        }}>Unlocked — drag ⠿⠿⠿ handles to reorder columns · ✎ edit preview per column</div>
      )}

      {savedToast && (
        <div style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
          fontFamily: FONT, fontSize: 11, letterSpacing: '0.08em', color: '#000',
          background: '#fff', padding: '6px 16px', borderRadius: 20,
          pointerEvents: 'none', textTransform: 'uppercase', fontWeight: 600,
          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
        }}>Order saved ✓ — export layout to publish</div>
      )}
    </div>
  );
}

window.IndexGrid = IndexGrid;
