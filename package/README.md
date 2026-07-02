# Jaxon Stickler — Portfolio

Static site. No build step, no backend. Plain HTML/CSS/JS with React + Babel
loaded from CDN at runtime. Includes a built-in CMS (`admin.html`) for editing
content without touching code.

---

## Deploy to your server

It's a static site — upload the whole folder to your web root and point the
domain at it. `index.html` is the entry point.

- Must be served over **http(s)** (any normal web server). It will **not** work
  by double-clicking `index.html` from disk — the scripts and WebGL background
  are blocked on `file://`.
- Visitors' browsers fetch React, Babel, and fonts from public CDNs, so an
  internet connection is required.
- The `.nojekyll` file matters only on GitHub Pages (ignore it elsewhere).

---

## Editing content — the CMS

Open **`admin.html`** in a browser (e.g. `https://your-site.com/admin.html`).

- **Password:** `studio` — change it by editing the `ADMIN_PASSWORD` line near
  the top of `admin-app.jsx`. (This is light obscurity, not real security: the
  site is static, so don't link to `admin.html` from the public site and keep
  the password to yourself.)

Tabs:
- **Site & Bio** — location + timezone (drives the live clock), name, role,
  statement, "working on" items (each can have a hover image), contact.
- **Projects** — edit any project's text and gallery; drag gallery items to
  reorder (the first item is the index thumbnail); add images/videos by drag &
  drop, or paste a YouTube/Vimeo URL; add brand-new projects (with a thumbnail
  layout choice); delete projects.
- **Diagram** — drag any node to set where that project sits on the About-page
  constellation.
- **Index order** — drag to set the left-to-right column order on the Index page.
- **Publish** — click **Download update package (.zip)**.

### Publishing your edits

The CMS never talks to the server (it can't — the server is static). Instead it
hands you the changed files to upload:

1. On the **Publish** tab, click **Download update package (.zip)**.
2. Unzip it. Inside: `content.js`, `layout.js`, and an `images/` folder with any
   new images/videos you added.
3. Upload those into your site folder on the server, **replacing** the old
   `content.js` and `layout.js` and **merging** the `images/` folder.
4. Refresh the site — your changes are live.

That's the one manual step. For occasional edits it takes about 30 seconds.

---

## How it fits together

- `content.js` — **all editable content** (location, bio, projects). Single
  source of truth, written by the CMS. Safe to hand-edit too.
- `layout.js` — diagram node positions (and a few other saved bits).
- `projects.js` — adapter that turns `content.js` into the data the site uses.
- `index.html` + the `.jsx`/`.js` files — the site itself.
- `admin*.{html,jsx}` — the CMS (only you use these; visitors never see them).

## Want instant, log-in-from-anywhere editing later?

That needs a small backend, which a purely static server can't run. The minimal
free add-on is a service like Supabase — the site can read content from it and
the CMS can save to it directly, removing the download-and-upload step. Ask and
it can be wired in without rebuilding the site.
