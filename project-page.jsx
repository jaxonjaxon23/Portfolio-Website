// project-page.jsx — single project: info panel + gallery.
// Order, image widths (item.w) and links all come from the CMS content.
// Exposes window.ProjectPage

const { useEffect: usePPEffect } = React;

const LINK_STYLE = { color: '#8FB8FF', textDecoration: 'underline', textUnderlineOffset: 2 };

// Text parts → React: [{ text, href? }] from shared.js (safe links only)
function Linked({ parts }) {
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((x, i) => x.href
        ? <a key={i} href={x.href} target="_blank" rel="noopener" data-clickable style={LINK_STYLE}>{x.text}</a>
        : <React.Fragment key={i}>{x.text}</React.Fragment>)}
    </span>);
}

// Description: [text](url) links inline
function RichText({ text }) {
  if (!text) return null;
  return <Linked parts={window.SiteShared.richParts(text)} />;
}

// Client / collaborator credits: names from the project's CMS "Credit links"
// (plus credit-links.js) become links wherever they appear, "@handle" links to
// Instagram, and [text](url) still works. Same rules as the crawler pages.
function CreditText({ text, project }) {
  if (!text || !String(text).trim()) return null;
  const links = window.SiteShared.creditLinks(project, window.SUGGESTED_CREDITS);
  return <Linked parts={window.SiteShared.creditParts(text, links)} />;
}

function ProjectInfo({ p, top, mobile = false }) {
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
      <h1 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: '0.02em' }}>{p.title}</h1>
      <div>{p.year}</div>
      {p.medium && (
        <div style={{ opacity: 0.7, marginTop: 12 }}>[{p.medium}]</div>
      )}
      {p.client && (
        <div style={{ opacity: 0.6, marginTop: 6 }}>
          Client: <CreditText text={p.client} project={p} />
        </div>
      )}
      {p.collab && (
        <div style={{ opacity: 0.6, marginTop: 2 }}>
          Collaborators: <CreditText text={p.collab} project={p} />
        </div>
      )}
      {p.desc && (
        <div style={{ marginTop: 14, opacity: 0.92 }}>
          <RichText text={p.desc} />
        </div>
      )}
      {p.links && p.links.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {p.links.map((l, i) => {
            const href = window.SiteShared.safeHref(l.url);
            return (
              <div key={i}>
                {href
                  ? <a href={href} target="_blank" rel="noopener" data-clickable style={{ ...LINK_STYLE, fontSize: 12 }}>{l.label || l.url}</a>
                  : <span>{l.label || l.url}</span>}
              </div>);
          })}
        </div>
      )}
    </div>
  );
}

function ProjectPage({ p, locationStyle, mobile = false }) {
  // Eased vertical wheel scrolling (same engine and feel as the projects
  // board, in every browser).
  usePPEffect(() => {
    const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const scroller = createSmoothScroller(() => window.scrollY, (y) => window.scrollTo(0, y), maxY);
    // let scrollable panels under the cursor (e.g. a long info panel) scroll natively
    const nestedCanScroll = (el, dy) => {
      for (; el && el !== document.body; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
        }
      }
      return false;
    };
    const onWheel = (e) => {
      if (e.ctrlKey) return;                                 // pinch-zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (nestedCanScroll(e.target, e.deltaY)) return;
      e.preventDefault();
      scroller.by(wheelPx(e.deltaY, e.deltaMode, window.innerHeight));
    };
    const onScroll = () => scroller.sync();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      scroller.stop();
    };
  }, [p.id]);

  const gallery = p.gallery || [];

  if (mobile) {
    return (
      <div style={{ paddingBottom: 100 }}>
        <div style={{ position: 'relative', overflow: 'visible' }}>
          <BioShort locationStyle={locationStyle} mobile contact={false} />
          <window.MobileEntityAnchor which="small" />
        </div>
        <ProjectInfo p={p} top={0} mobile />
        <div style={{ padding: '12px 16px', paddingBottom: 80 }}>
          {gallery.map((item, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <GalleryItem item={item} rounded eager={i < 2} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <BioShort locationStyle={locationStyle} top={19} contact={false} />
      <ProjectInfo p={p} top={252} />
      <div style={{ marginLeft: 408, marginRight: 24, marginInlineStart: 'auto', paddingTop: 19, paddingBottom: 120, maxWidth: 1180 }}>
        {gallery.map((item, i) => (
          // width: the CMS's per-image size (100% = full gallery width)
          <div key={i} style={{ marginBottom: 14, width: (item.w != null ? item.w : 100) + '%', marginLeft: 'auto', position: 'relative' }}>
            <GalleryItem item={item} eager={i < 2} />
          </div>
        ))}
      </div>
    </div>
  );
}

window.ProjectPage = ProjectPage;
