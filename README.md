# Jaxon Stickler — Portfolio (Vercel + Supabase + GitHub)

Static site with a live CMS. Content is stored in **Supabase** and edited from
**`admin.html`** — log in from anywhere, hit Save, and the change is live on the
next refresh. No re-uploading files. The repo lives on **GitHub** and deploys to
**Vercel** automatically.

---

## One-time setup (about 15 minutes)

### 1. Supabase (the content backend)
1. Create a free account at **supabase.com** → **New project**. Pick a region
   near your visitors and save the database password it gives you.
2. When it's ready: **SQL Editor → New query** → paste all of
   **`supabase-setup.sql`** → **Run**. (Creates the content table + image bucket
   + security rules.)
3. **Authentication → Users → Add user** → create YOUR login (email + password).
   This is the account you'll sign into the CMS with.
4. **Settings → API** → copy two values into **`supabase-config.js`**:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`  (safe to commit — it's a public key)

### 2. GitHub (the repo)
1. Create a new GitHub repository.
2. Put **all the files in this folder** at the repo root (via GitHub Desktop is
   easiest — drag them into the local repo folder, commit, publish). `index.html`
   must be at the top level, not inside a subfolder.

### 3. Vercel (hosting)
1. Create a free account at **vercel.com** → **Add New… → Project**.
2. **Import** your GitHub repo. No build settings needed — it's a static site, so
   leave Framework Preset as **Other** and just click **Deploy**.
3. You get a live URL like `your-project.vercel.app`. Every future `git push`
   redeploys automatically.

That's it. The site is live and reads its content from Supabase.

---

## Editing the site

Go to **`https://your-project.vercel.app/admin.html`** and sign in with the
Supabase user you created.

- **Site & Bio** — location + timezone (drives the clock), name, role, statement,
  "working on" items (each can have a hover image), contact details.
- **Projects** — edit text, drag-reorder galleries (first item = index thumbnail),
  drag-drop new images/videos, paste YouTube/Vimeo URLs, add or delete projects.
- **Diagram** — drag nodes to position projects on the About-page constellation.
- **Index order** — drag to set the column order on the Index page.
- **Publish** — click **Save changes**. New images upload to Supabase storage,
  then all content is saved. Refresh the site to see it live.

Images you upload through the CMS are served from Supabase; the images that
shipped with the site are still served as static files from the repo. Both work
side by side.

---

## Keep the free Supabase project awake

Free Supabase projects **pause after 7 days with no activity**, which would make
the site's content fail to load until you unpause it. Prevent that with a free
uptime pinger:

- Easiest: **UptimeRobot** (free) → add an HTTP monitor pointing at your Vercel
  URL every few days. Loading the site queries Supabase, which resets the timer.

---

## How it fits together

- `supabase-config.js` — your Supabase URL + anon key (you fill this in).
- `remote-content.js` — the site reads content from Supabase on load; falls back
  to the bundled `content.js` if Supabase is unreachable.
- `content.js` — offline fallback snapshot of the content (safe to leave as-is).
- `admin*.{html,jsx}` — the CMS. Only you use it (sign-in required to save).
- `index.html` + `.jsx`/`.js` — the site itself.
- `supabase-setup.sql` — the one-time database setup.

## Notes

- Must be served over http(s) (Vercel does this). Won't work by double-clicking
  `index.html` from disk.
- The anon key is meant to be public; your data is protected by the security
  rules in `supabase-setup.sql` (anyone can read, only your signed-in account can
  write).
