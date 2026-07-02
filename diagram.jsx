// diagram.jsx — the About/landing constellation diagram from Figma frame 3.
// A conceptual plot: vertical axis CURSED↔BLESSED, horizontal axis FOR US↔FOR OUR ENEMIES,
// a large crosshair, and 16 white project nodes. Nodes hover→readout, click→project.
// When unlocked (authoring), nodes drag freely; positions persist in localStorage.
// Exposes window.AboutDiagram

const { useState: useDState, useRef: useDRef, useCallback: useDCallback } = React;

// ----- geometry from Figma (frame 1728×1117), expressed as viewport percentages
const FX = (x) => (x / 1728) * 100;
const FY = (y) => (y / 1117) * 100;

// Default node positions: 14 exact Figma ellipse centres + 2 added for projects 15/16.
const DEFAULT_NODES = [
  { x: FX(935.5),  y: FY(814.5) },
  { x: FX(1046.5), y: FY(588.5) },
  { x: FX(1024.5), y: FY(713.5) },
  { x: FX(857.5),  y: FY(744.5) },
  { x: FX(857.5),  y: FY(356.5) },
  { x: FX(1377.5), y: FY(343.5) },
  { x: FX(1430.5), y: FY(467.5) },
  { x: FX(1151.5), y: FY(498.5) },
  { x: FX(1011.5), y: FY(575.5) },
  { x: FX(922.5),  y: FY(690.5) },
  { x: FX(1157.5), y: FY(719.5) },
  { x: FX(751.5),  y: FY(888.5) },
  { x: FX(801.5),  y: FY(178.5) },
  { x: FX(1399.5), y: FY(165.5) },
  { x: FX(520),    y: FY(500) },   // added — project 15
  { x: FX(1520),   y: FY(640) },   // added — project 16
  { x: FX(620),    y: FY(750) },   // added — project 17
  { x: FX(1600),   y: FY(820) },   // added — project 18
];

// Axis geometry (percentages)
const AXIS = {
  mainH: { y: FY(519), x1: FX(698), x2: FX(1554) },
  mainV: { x: FX(1126), y1: FY(91), y2: FY(947) },
  yLeg:  { x: FX(698), y1: FY(391), y2: FY(646.5) },     // CURSED(top) / BLESSED(bottom)
  xLeg:  { y: FY(947), x1: FX(998), x2: FX(1253.5) },    // FOR US(left) / FOR OUR ENEMIES(right)
};

const STORAGE_KEY = 'diagram-node-pos-v1';

// deterministic per-id offset so each node's hover-image sits at a fixed random angle,
// far enough out that the image never overlaps the node's glow.
function offsetFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  const angle = (h % 360) / 360 * Math.PI * 2;
  const dist = 150 + (h % 70);
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
}

// Projects whose hover image should appear toward the diagram centre instead of
// at a random outward angle (their landscape previews read better near the middle).
const CENTER_BIAS = { 'wind-sensor': true, 'rivers-dream': true };

// offset that points from a node toward the diagram centre (percent space → px).
function centerOffset(pt) {
  const cx = 65, cy = 46;                 // crosshair centre, in viewport %
  const vw = window.innerWidth, vh = window.innerHeight;
  let pxX = ((cx - pt.x) / 100) * vw;
  let pxY = ((cy - pt.y) / 100) * vh;
  const len = Math.hypot(pxX, pxY) || 1;
  const dist = 140;
  return { dx: (pxX / len) * dist, dy: (pxY / len) * dist };
}

// first image shown at the top of this project's index stack (respects saved reorder)
function topImageFor(p) {
  let order = p.gallery.map((_, i) => i);
  try {
    const s = JSON.parse(window.layoutGet('gallery-order-' + p.id));
    if (Array.isArray(s) && s.length === p.gallery.length) order = s;
  } catch (_) {}
  const ordered = order.map((i) => p.gallery[i]);
  const first = ordered[0];
  if (first && first.type === 'image') return first.src;
  const img = ordered.find((it) => it.type === 'image');
  return img ? img.src : null;
}

function loadPositions(projects) {
  let saved = {};
  try { saved = JSON.parse(window.layoutGet(STORAGE_KEY)) || {}; } catch (_) {}
  const map = {};
  projects.forEach((p, i) => {
    map[p.id] = saved[p.id] || DEFAULT_NODES[i % DEFAULT_NODES.length];
  });
  return map;
}

// Hover preview image. Sizes to a consistent target HEIGHT (so landscape and
// portrait previews carry equal visual weight), positions near the node, then
// clamps to the viewport so it can never clip off-screen.
function HoverImage({ src, pt, off }) {
  const boxRef = useDRef(null);
  const [c, setC] = useDState(null);
  const [w, setW] = useDState(186);
  const onImgLoad = useDCallback((e) => {
    const im = e.target;
    const aspect = (im.naturalWidth && im.naturalHeight)
      ? im.naturalWidth / im.naturalHeight : 0.72;
    const TARGET_H = 220, MIN_W = 150, MAX_W = 360;
    setW(Math.round(Math.max(MIN_W, Math.min(MAX_W, TARGET_H * aspect))));
  }, []);
  const measure = useDCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ww = el.offsetWidth || 186;
    const hh = el.offsetHeight || 140;
    const margin = 16;
    let cx = (pt.x / 100) * vw + off.dx;
    let cy = (pt.y / 100) * vh + off.dy;
    cx = Math.max(margin + ww / 2, Math.min(vw - margin - ww / 2, cx));
    cy = Math.max(margin + hh / 2, Math.min(vh - margin - hh / 2, cy));
    setC({ cx, cy });
  }, [pt.x, pt.y, off.dx, off.dy]);
  React.useLayoutEffect(() => { measure(); }, [measure, src, w]);
  return (
    <div ref={boxRef} style={{
      position: 'fixed',
      left: c ? c.cx : (pt.x + '%'),
      top: c ? c.cy : (pt.y + '%'),
      transform: 'translate(-50%, -50%)',
      width: w, pointerEvents: 'none', zIndex: 22,
      boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
      opacity: c ? 1 : 0,
      transition: 'opacity .15s ease',
    }}>
      <img src={src} alt="" draggable="false" onLoad={onImgLoad}
        style={{ width: '100%', display: 'block', borderRadius: 3 }} />
    </div>
  );
}

function _HoverImage_unused({ src, pt, off }) {
  const boxRef = useDRef(null);
  const [c, setC] = useDState(null);
  const measure = useDCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth || 186;
    const h = el.offsetHeight || 140;
    const margin = 16;
    let cx = (pt.x / 100) * vw + off.dx;
    let cy = (pt.y / 100) * vh + off.dy;
    cx = Math.max(margin + w / 2, Math.min(vw - margin - w / 2, cx));
    cy = Math.max(margin + h / 2, Math.min(vh - margin - h / 2, cy));
    setC({ cx, cy });
  }, [pt.x, pt.y, off.dx, off.dy]);
  React.useLayoutEffect(() => { measure(); }, [measure, src]);
  return (
    <div ref={boxRef} style={{
      position: 'fixed',
      left: c ? c.cx : (pt.x + '%'),
      top: c ? c.cy : (pt.y + '%'),
      transform: 'translate(-50%, -50%)',
      width: 186, pointerEvents: 'none', zIndex: 22,
      boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
      opacity: c ? 1 : 0,
      transition: 'opacity .15s ease',
    }}>
      <img src={src} alt="" draggable="false" onLoad={measure}
        style={{ width: '100%', display: 'block', borderRadius: 3 }} />
    </div>
  );
}

function EndDot({ x, y }) {
  return (
    <div style={{
      position: 'absolute', left: x + '%', top: y + '%',
      width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5,
      borderRadius: '50%', background: '#fff',
    }} />
  );
}

function AboutDiagram({ projects, locked, onOpen, onHover, hoveredId, mobile = false }) {
  const [pos, setPos] = useDState(() => loadPositions(projects));
  const dragId = useDRef(null);
  const layerRef = useDRef(null);
  const movedRef = useDRef(false);

  const persist = (next) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
  };

  const onPointerDown = useDCallback((e, id) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    dragId.current = id;
    movedRef.current = false;
  }, [locked]);

  React.useEffect(() => {
    if (locked) return;
    const onMove = (e) => {
      if (!dragId.current || !layerRef.current) return;
      const r = layerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      movedRef.current = true;
      setPos((prev) => ({ ...prev, [dragId.current]: { x, y } }));
    };
    const onUp = () => {
      if (dragId.current) { dragId.current = null; setPos((p) => { persist(p); return p; }); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [locked]);

  const lineCol = 'rgba(255,255,255,0.85)';
  const label = {
    position: 'absolute', fontFamily: FONT, fontSize: 8, color: '#fff',
    letterSpacing: '0.02em', whiteSpace: 'nowrap', pointerEvents: 'none',
  };

  return (
    <div ref={layerRef} style={mobile ? {
      position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
      transform: 'translateX(-15%)',
    } : {
      position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none',
    }}>
      {/* ---- axes (SVG, non-scaling stroke) ---- */}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <line x1={AXIS.mainH.x1} y1={AXIS.mainH.y} x2={AXIS.mainH.x2} y2={AXIS.mainH.y}
          stroke={lineCol} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={AXIS.mainV.x} y1={AXIS.mainV.y1} x2={AXIS.mainV.x} y2={AXIS.mainV.y2}
          stroke={lineCol} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={AXIS.yLeg.x} y1={AXIS.yLeg.y1} x2={AXIS.yLeg.x} y2={AXIS.yLeg.y2}
          stroke={lineCol} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={AXIS.xLeg.x1} y1={AXIS.xLeg.y} x2={AXIS.xLeg.x2} y2={AXIS.xLeg.y}
          stroke={lineCol} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* ---- axis end dots ---- */}
      <EndDot x={AXIS.mainH.x1} y={AXIS.mainH.y} /><EndDot x={AXIS.mainH.x2} y={AXIS.mainH.y} />
      <EndDot x={AXIS.mainV.x} y={AXIS.mainV.y1} /><EndDot x={AXIS.mainV.x} y={AXIS.mainV.y2} />
      <EndDot x={AXIS.yLeg.x} y={AXIS.yLeg.y1} /><EndDot x={AXIS.yLeg.x} y={AXIS.yLeg.y2} />
      <EndDot x={AXIS.xLeg.x1} y={AXIS.xLeg.y} /><EndDot x={AXIS.xLeg.x2} y={AXIS.xLeg.y} />

      {/* ---- axis labels ---- */}
      <div style={{ ...label, left: AXIS.yLeg.x + '%', top: FY(377.5) + '%', transform: 'translate(-50%,-100%)', textAlign: 'center' }}>CURSED</div>
      <div style={{ ...label, left: AXIS.yLeg.x + '%', top: FY(660) + '%', transform: 'translateX(-50%)', textAlign: 'center' }}>BLESSED</div>
      <div style={{ ...label, left: AXIS.xLeg.x1 + '%', top: AXIS.xLeg.y + '%', transform: 'translate(-100%,-50%)', paddingRight: 10 }}>FOR US</div>
      <div style={{ ...label, left: AXIS.xLeg.x2 + '%', top: AXIS.xLeg.y + '%', transform: 'translateY(-50%)', paddingLeft: 10 }}>FOR OUR ENEMIES</div>

      {/* ---- nodes ---- */}
      {projects.map((p) => {
        const pt = pos[p.id] || { x: 50, y: 50 };
        const hot = hoveredId === p.id;
        return (
          <div
            key={p.id}
            data-clickable={locked ? '' : undefined}
            onMouseEnter={() => locked && onHover(p)}
            onMouseLeave={() => locked && onHover(null)}
            onMouseDown={(e) => onPointerDown(e, p.id)}
            onClick={() => { if (locked && !movedRef.current) onOpen(p); }}
            style={{
              position: 'absolute', left: pt.x + '%', top: pt.y + '%',
              width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5,
              borderRadius: '50%',
              background: hot ? '#fff' : 'rgb(217,217,217)',
              cursor: locked ? 'pointer' : 'grab',
              pointerEvents: 'auto',
              transform: hot ? 'scale(1.5)' : 'scale(1)',
              boxShadow: hot
                ? '0 0 14px 3px rgba(255,255,255,0.9), 0 0 26px 8px rgba(255,255,255,0.4)'
                : '0 0 0 0 rgba(255,255,255,0)',
              transition: dragId.current === p.id ? 'none' : 'transform .2s ease, box-shadow .2s ease, background .2s ease',
            }}
          />
        );
      })}

      {/* ---- hover image: first project image, offset near the node, clamped on-screen ---- */}
      {(() => {
        if (!hoveredId) return null;
        const hp = projects.find((p) => p.id === hoveredId);
        if (!hp) return null;
        const firstImg = topImageFor(hp);
        if (!firstImg) return null;
        const pt = pos[hoveredId] || { x: 50, y: 50 };
        const off = CENTER_BIAS[hoveredId] ? centerOffset(pt) : offsetFor(hoveredId);
        return <HoverImage src={firstImg} pt={pt} off={off} />;
      })()}

      {/* ---- unlocked hint ---- */}
      {!locked && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          fontFamily: FONT, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)',
          background: 'rgba(0,0,0,0.55)', padding: '6px 14px', borderRadius: 20,
          pointerEvents: 'none', textTransform: 'uppercase',
        }}>Unlocked — drag nodes to position, then lock in Tweaks</div>
      )}
    </div>
  );
}

window.AboutDiagram = AboutDiagram;
window.resetDiagramPositions = function () { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} };
