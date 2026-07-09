// portfolio-parts.jsx — shared pieces for the Jaxon Stickler site.
// Exposes on window: FONT, GalleryItem, DepthBackground, CustomCursor,
//                    LocationSignifier, BioAbout, BioShort, Footer

const { useState: usePState, useEffect: usePEffect, useRef: usePRef } = React;

// Mobile detection hook — shared globally (other files use window.useMobile)
function useMobile() {
  const [m, setM] = usePState(() => window.innerWidth < 768);
  usePEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const DEPTH_BG = 'images/about/depth-bg.png';

// ---------------------------------------------------------------- gallery item
function GalleryItem({ item, rounded }) {
  const radius = rounded ? 4 : 0;
  if (item.type === 'video') {
    return (
      <video src={item.src} autoPlay loop muted playsInline
      ref={(el) => { if (el) { el.defaultMuted = true; el.muted = true; el.volume = 0; } }}
      onVolumeChange={(e) => { const el = e.currentTarget; if (!el.muted || el.volume !== 0) { el.muted = true; el.volume = 0; } }}
      onLoadedMetadata={(e) => { e.currentTarget.muted = true; e.currentTarget.volume = 0; }}
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: radius }}></video>);

  }
  if (item.type === 'vimeo') {
    const vimeoSrc = item.src + (item.src.includes('?') ? '&muted=1' : '?muted=1');
    return (
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: radius, overflow: 'hidden' }}>
        <iframe src={vimeoSrc}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; fullscreen; picture-in-picture" allowFullScreen></iframe>
      </div>);

  }
  if (item.type === 'youtube') {
    const ytSrc = item.src + (item.src.includes('?') ? '&' : '?') + 'rel=0';
    return (
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: radius, overflow: 'hidden' }}>
        <iframe src={ytSrc}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen></iframe>
      </div>);
  }
  return (
    <img src={item.src} alt="" draggable="false" loading="lazy" decoding="async"
    style={{ display: 'block', width: '100%', height: 'auto', borderRadius: radius }} />);

}

// ---------------------------------------------------------- depth cloud bg
// Mounts the WebGL2 cursor-lit point cloud (depth-cloud.js) behind everything.
function DepthCloud() {
  const ref = usePRef(null);
  usePEffect(() => {
    if (!ref.current || !window.initDepthCloud) return;
    const cleanup = window.initDepthCloud(ref.current);
    return cleanup;
  }, []);
  return (
    <canvas ref={ref} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      display: 'block', zIndex: -1, pointerEvents: 'none', background: '#000'
    }} />);

}

// ---------------------------------------------------------------- custom cursor (+)
function CustomCursor({ enabled = true }) {
  const ref = usePRef(null);
  usePEffect(() => {
    if (!enabled) return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    const styleEl = document.createElement('style');
    styleEl.textContent = '* { cursor: none !important; }';
    document.head.appendChild(styleEl);
    const onMove = (e) => {
      const t = e.target;
      const interactive = t && typeof t.closest === 'function' && t.closest('a, button, [data-clickable]');
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) scale(${interactive ? 0.5 : 1})`;
      el.style.opacity = interactive ? '1' : '0.65';
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      styleEl.remove();
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={ref} style={{
      position: 'fixed', top: 0, left: 0, width: 16, height: 16,
      pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'difference',
      opacity: 0.65, willChange: 'transform',
    }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, background: 'white', transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, background: 'white', transform: 'translateX(-50%)' }} />
    </div>);

}

// ---------------------------------------------- live "current location" signifier
// style: 'pulse' | 'clock' | 'both'
function LocationSignifier({ style = 'both', city, tz }) {
  const loc = (window.SITE_CONTENT && window.SITE_CONTENT.location) || {};
  city = city || loc.city || 'Berlin';
  tz = tz || loc.tz || 'Europe/Berlin';
  const [now, setNow] = usePState('');
  usePEffect(() => {
    if (style === 'pulse') return;
    const fmt = () => {
      try {
        return new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZone: tz
        }).format(new Date());
      } catch (_) {return '';}
    };
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, [style, tz]);

  const dot =
  <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7, marginRight: 7, verticalAlign: 'middle' }}>
      <span style={{
      position: 'absolute', inset: 0, borderRadius: '50%', background: '#7CFFB2',
      animation: 'locPulseRing 2s ease-out infinite'
    }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#7CFFB2' }} />
    </span>;


  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      {(style === 'pulse' || style === 'both') && dot}
      <span>Current Location: {city}</span>
      {(style === 'clock' || style === 'both') && now &&
      <span style={{ opacity: 0.6, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{now}</span>
      }
    </span>);

}

// ---------------------------------------------------------------- bio bubbles
const BUBBLE = {
  background: 'rgba(0,0,0,var(--bubble-op,1))', borderRadius: 15, color: '#fff',
  fontSize: 12, lineHeight: 1.5, fontFamily: FONT
};

// Top-of-bubble nav: About / state-glyph / Index. The middle glyph is a "+"
// normally and a "○" while a project is open. Self-contained — navigates via hash
// so it can be dropped into any bubble without prop threading.
function BubbleNav() {
  const cur = (location.hash.slice(1) || (window.innerWidth < 768 ? 'index' : 'about'));
  const isProject = cur && cur !== 'index' && cur !== 'about';
  const mobile = window.innerWidth < 768;
  const graphic = window.__navGraphic;
  const go = (v) => { location.hash = (v === 'about' ? '' : v); };
  const btn = (active) => ({
    fontFamily: FONT, color: '#fff', fontSize: 12, letterSpacing: '0.02em',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontWeight: 700, opacity: active ? 1 : 0.5,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, minHeight: 18 }}>
      {!mobile
        ? <button data-clickable style={btn(cur === 'about')} onClick={() => go('about')}>About</button>
        : <span style={{ width: 1 }} />}
      <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
        {graphic
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V13"/><path d="M12 13c0-5-6-8-10-7 0 5 4 8 10 7"/><path d="M12 13c0-5 6-8 10-7 0 5-4 8-10 7"/></svg>
          : <span style={{ fontSize: 15, lineHeight: 1, fontWeight: 400 }}>+</span>}
      </span>
      <button data-clickable style={btn(cur === 'index')} onClick={() => go('index')}>Index</button>
    </div>
  );
}

const BioAbout = React.forwardRef(function BioAbout({ locationStyle, mobile = false }, ref) {
  const italic = { opacity: 0.92 };
  const [wip1, setWip1] = usePState(false);
  const [wip2, setWip2] = usePState(false);
  const [mx, setMx] = usePState(0);
  const [my, setMy] = usePState(0);

  usePEffect(() => {
    const onMove = (e) => { setMx(e.clientX); setMy(e.clientY); };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const bio = (window.SITE_CONTENT && window.SITE_CONTENT.bio) || {};
  const working = Array.isArray(bio.working) ? bio.working : [];
  const [hovIdx, setHovIdx] = usePState(-1);
  return (
    <div ref={ref} style={mobile ? {
      ...BUBBLE, position: 'relative', width: '100%', boxSizing: 'border-box',
      padding: '22px 24px', zIndex: 1, borderRadius: 0,
    } : {
      ...BUBBLE, position: 'fixed', left: 24, top: 19, width: 345,
      maxHeight: 'calc(100vh - 38px)', overflowY: 'auto',
      padding: '22px 24px', zIndex: 25,
    }}>
      <BubbleNav />
      <div style={{ fontWeight: 700 }}>{bio.name || 'Jaxon Stickler'}</div>
      <div style={{ ...italic, marginBottom: 16 }}>{bio.role || 'Designer/Artist'}</div>

      <div style={{ ...italic, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{bio.statement || ''}</div>
      {bio.openTo &&
      <div style={{ ...italic, marginBottom: 18 }}>{bio.openTo}</div>
      }

      <div style={{ marginBottom: 18 }}>
        <LocationSignifier style={locationStyle} />
      </div>

      {working.length > 0 &&
      <div style={{ ...italic, marginBottom: 10 }}>Working on:</div>
      }
      {working.map((w, i) =>
      <div key={i}
        style={{ ...italic, fontWeight: 600, marginBottom: 12 }}
        onMouseEnter={() => setHovIdx(w.img ? i : -1)}
        onMouseLeave={() => setHovIdx(-1)}>
        {w.text}
      </div>
      )}
      <div style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V13"/><path d="M12 13c0-5-6-8-10-7 0 5 4 8 10 7"/><path d="M12 13c0-5 6-8 10-7 0 5-4 8-10 7"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9 6.5 6.5 0 1 1-6.5-6.5 4 4 0 1 0 4 4 2 2 0 1 1-2-2"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </div>

      <div>Contact:</div>
      <div>Email: <a href={'mailto:' + (bio.email || 'jaxonstickler@gmail.com')} data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.email || 'jaxonstickler@gmail.com'}</a></div>
      <div style={{ marginBottom: 22 }}>Instagram: <a href={bio.instagramUrl || 'https://instagram.com/jaxonstickler'} target="_blank" rel="noopener" data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.instagram || '@jaxonstickler'}</a></div>

      <a href={bio.cvFile || 'assets/Jaxon_Stickler_CV.pdf'} download="Jaxon_Stickler_CV.pdf" target="_blank" rel="noopener" data-clickable onClick={(e) => {
        // Try a real download via blob (works on hosted http/https). If the
        // environment blocks it (sandboxed preview iframe), fall back to
        // opening the PDF in a new tab so the visitor can still save it.
        // If even that is blocked, let the native href/download proceed.
        var canPop = false;
        try {
          fetch('assets/Jaxon_Stickler_CV.pdf').then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.blob();
          }).then(function (b) {
            var url = URL.createObjectURL(b);
            var a = document.createElement('a');
            a.href = url; a.download = 'Jaxon_Stickler_CV.pdf';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          }).catch(function () {
            try { window.open('assets/Jaxon_Stickler_CV.pdf', '_blank', 'noopener'); }
            catch (_) {}
          });
          e.preventDefault();
        } catch (_) {
          // leave default anchor behaviour
        }
      }} style={{
        color: 'rgba(255,255,255,0.75)', textDecoration: 'underline',
        textUnderlineOffset: 3, fontSize: 12, cursor: 'pointer'
      }}>Download CV</a>

      {hovIdx >= 0 && working[hovIdx] && working[hovIdx].img && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          left: Math.min(mx + 24, window.innerWidth - 202),
          top: Math.max(16, my - 50),
          width: 186,
          pointerEvents: 'none',
          zIndex: 9997,
          boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <img src={working[hovIdx].img}
            alt="" draggable="false" style={{ width: '100%', display: 'block' }} />
        </div>,
        document.body
      )}
    </div>);

});

function BioShort({ locationStyle, top = 19, mobile = false, contact = true }) {
  const bio = (window.SITE_CONTENT && window.SITE_CONTENT.bio) || {};
  return (
    <div style={mobile ? {
      ...BUBBLE, position: 'relative', width: '100%', boxSizing: 'border-box',
      padding: '22px 24px', zIndex: 1, borderRadius: 0,
    } : {
      ...BUBBLE, position: 'fixed', left: 24, top, width: 345,
      padding: '22px 24px', zIndex: 25,
    }}>
      <BubbleNav />
      <div style={{ fontWeight: 700 }}>{bio.name || 'Jaxon Stickler'}</div>
      <div>{bio.role || 'Designer/Artist'}</div>
      <div style={{ height: 16 }} />
      <div><LocationSignifier style={locationStyle} /></div>
      {contact && <React.Fragment>
        <div style={{ height: 16 }} />
        <div>Contact:</div>
        <div>Email: <a href={'mailto:' + (bio.email || 'jaxonstickler@gmail.com')} data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.email || 'jaxonstickler@gmail.com'}</a></div>
        <div>Instagram: <a href={bio.instagramUrl || 'https://instagram.com/jaxonstickler'} target="_blank" rel="noopener" data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.instagram || '@jaxonstickler'}</a></div>
      </React.Fragment>}
    </div>);

}

// ---------------------------------------------------------------- footer / nav
// navPosition: 'bottom-left' | 'top-right' | 'top-center'
function Footer({ left, navPosition = 'bottom-left' }) {
  const base = { fontFamily: FONT, color: '#fff', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', padding: 0, letterSpacing: '0.02em' };
  const posStyle = navPosition === 'top-right' ?
  { position: 'fixed', right: 32, top: 22, zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 } :
  navPosition === 'top-center' ?
  { position: 'fixed', left: '50%', top: 22, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 } :
  { position: 'fixed', left: 43, bottom: 26, zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 };
  const copyrightStyle = navPosition !== 'bottom-left' ?
  { position: 'fixed', left: 43, bottom: 26, zIndex: 40 } :
  null;
  return (
    <React.Fragment>
      <div style={posStyle}>
        {left.map((l, i) =>
        <button key={i} data-clickable onClick={l.onClick} style={base}>{l.label}</button>
        )}
        {navPosition === 'bottom-left' &&
        <span style={{ ...base, cursor: 'default', opacity: 0.85, marginLeft: left.length ? 60 : 0 }}>Jaxon Stickler 2026©</span>
        }
      </div>
      {navPosition !== 'bottom-left' &&
      <div style={{ ...copyrightStyle }}>
          <span style={{ ...base, cursor: 'default', opacity: 0.85 }}>Jaxon Stickler 2026©</span>
        </div>
      }
    </React.Fragment>);

}

// ---------------------------------------------------------------- vector entities
// Animated "living edges" entity — persistent overlay across every view.
function AnimatedEntity() {
  const isMob = useMobile();
  if (isMob) return null;
  return (
    <iframe src="entities/vector-entity-1.html" title="" scrolling="no"
    style={{
      position: 'fixed', left: 197, top: -133, width: 331, height: 468,
      border: 'none', background: 'transparent', zIndex: 30, pointerEvents: 'none'
    }} />);

}

// Large entity — About page only. Now the ANIMATED overlay (living tendrils),
// flipped 180° and sitting in FRONT of the info bubble (z 28 > bubble z 25).
// Rendered in an iframe wrapped by a draggable div (an iframe would otherwise
// swallow the drag); the iframe is sized so its 90vh SVG lands at ~503×712.
// Draggable when positions are unlocked; position persists in localStorage.
const LARGE_ENTITY_KEY = 'large-entity-pos-v1';
const LARGE_ENTITY_DEFAULT = { left: -40, bottom: 40 };

function LargeEntity({ locked = true }) {
  const isMob = useMobile();
  // null  → use the bottom-anchored default; {left,top} → user has dragged it
  const [pos, setPos] = usePState(() => {
    try {
      const s = JSON.parse(window.layoutGet(LARGE_ENTITY_KEY));
      if (s && typeof s.left === 'number' && typeof s.top === 'number') return s;
    } catch (_) {}
    return null;
  });
  const dragRef = usePRef(null);
  const elRef = usePRef(null);

  usePEffect(() => {
    if (locked) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({ left: e.clientX - d.offX, top: e.clientY - d.offY });
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setPos((p) => {try {localStorage.setItem(LARGE_ENTITY_KEY, JSON.stringify(p));} catch (_) {}return p;});
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {window.removeEventListener('mousemove', onMove);window.removeEventListener('mouseup', onUp);};
  }, [locked]);

  const onDown = (e) => {
    if (locked) return;
    e.preventDefault();
    const r = elRef.current.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - r.left, offY: e.clientY - r.top };
  };

  const nudge = (dx, dy) => {
    setPos((p) => {
      const base = p || { left: LARGE_ENTITY_DEFAULT.left, top: window.innerHeight - LARGE_ENTITY_DEFAULT.bottom - 792 };
      const next = { left: base.left + dx, top: base.top + dy };
      try { localStorage.setItem(LARGE_ENTITY_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };
  const resetPos = () => {
    setPos(null);
    try { localStorage.removeItem(LARGE_ENTITY_KEY); } catch (_) {}
  };

  if (isMob) return null;
  return (
    <div ref={elRef} onMouseDown={onDown}
    style={{
      position: 'fixed',
      left: pos ? pos.left : LARGE_ENTITY_DEFAULT.left,
      top: pos ? pos.top : undefined,
      bottom: pos ? undefined : LARGE_ENTITY_DEFAULT.bottom,
      width: 560, height: 792,
      transform: 'rotate(180deg)', transformOrigin: 'center',
      zIndex: 28,
      pointerEvents: locked ? 'none' : 'auto',
      cursor: locked ? 'default' : 'grab',
      opacity: 0.8,
      outline: locked ? 'none' : '1px dashed rgba(255,255,255,0.35)',
      outlineOffset: 4
    }}>
      <iframe src="entities/vector-entity-2.html" title="" scrolling="no"
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', display: 'block', pointerEvents: 'none' }} />
      {!locked &&
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(180deg)',
          display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gap: 3, pointerEvents: 'auto',
        }}>
          <span />
          <button onClick={() => nudge(0, -8)} style={nudgeBtnStyle}>▲</button>
          <span />
          <button onClick={() => nudge(-8, 0)} style={nudgeBtnStyle}>◀</button>
          <button onClick={resetPos} title="Reset position" style={{ ...nudgeBtnStyle, fontSize: 10 }}>↺</button>
          <button onClick={() => nudge(8, 0)} style={nudgeBtnStyle}>▶</button>
          <span />
          <button onClick={() => nudge(0, 8)} style={nudgeBtnStyle}>▼</button>
          <span />
        </div>}
    </div>);

}
const nudgeBtnStyle = {
  width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(0,0,0,0.75)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: 1,
};

LargeEntity.reset = function () {try {localStorage.removeItem(LARGE_ENTITY_KEY);} catch (_) {}};

// Memoize the persistent, prop-stable pieces so hovering a diagram node (which
// updates state up in App) doesn't reconcile the WebGL canvas or the animation
// iframe every time — keeps interaction snappy on low-end machines.
const DepthCloudMemo = React.memo(DepthCloud);
const AnimatedEntityMemo = React.memo(AnimatedEntity);
const LargeEntityMemo = React.memo(LargeEntity);
LargeEntityMemo.reset = LargeEntity.reset;
const BioAboutMemo = React.memo(BioAbout);

// Mobile-only entity anchors: small badges pinned to a bubble's corner,
// non-interactive, so the vector entities show up on phones without needing
// the desktop drag/viewport-fixed positioning.
function MobileEntityAnchor({ which }) {
  if (which === 'small') {
    return (
      <iframe src="entities/vector-entity-1.html" title="" scrolling="no" aria-hidden="true"
      style={{
        position: 'absolute', top: 4, right: -46, width: 118, height: 167,
        border: 'none', background: 'transparent', pointerEvents: 'none', zIndex: 2,
      }} />);
  }
  return (
    <iframe src="entities/vector-entity-2.html" title="" scrolling="no" aria-hidden="true"
    style={{
      position: 'absolute', bottom: 0, right: -60, width: 168, height: 238,
      transform: 'rotate(180deg)', transformOrigin: 'center',
      border: 'none', background: 'transparent', pointerEvents: 'none', opacity: 0.8, zIndex: 2,
    }} />);

}

Object.assign(window, {
  FONT, useMobile, GalleryItem, CustomCursor, LocationSignifier, BioShort, Footer, MobileEntityAnchor,
  DepthCloud: DepthCloudMemo,
  AnimatedEntity: AnimatedEntityMemo,
  LargeEntity: LargeEntityMemo,
  BioAbout: BioAboutMemo
});