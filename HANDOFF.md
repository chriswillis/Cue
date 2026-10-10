# Handoff: Cue

Read this first when you pick up the project in a new session. For how the code works, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status (2026-10-09):** alpha 0.1.0, live and in daily use. Steps 1–5 of "Next up" are built and tested locally, waiting for Chris to review and commit. Everything below is built, committed and deployed unless it's listed under "Next up" or "Ideas and open threads".

---

## 1. What Cue is

A browser app where you write a markdown script, and Cue turns it into designed slides, with good typography, color and grid, and no dragging of boxes.

- **Site:** https://cewillis.com/Cue/ (`chriswillis.github.io/Cue/` redirects there)
- **Repo:** https://github.com/chriswillis/Cue, public, branch `main`
- **Owner:** Chris Willis (cdub). Designer. Commits with **GitHub Desktop**, and is learning the code.
- **Local folder:** `~/Documents/GitHub/Cue` (it used to be called `MarkdownEditor`)

## 2. Run, build, ship

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit, then vite build → dist/
```

- **Stack:** Vite **8** (rolldown), TypeScript, CodeMirror 6, markdown-it 15, KaTeX, Fontsource fonts. No framework, no server.
- **Deploy:** every push to `main` runs `.github/workflows/deploy.yml` (Node 22; checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5). Pages source is set to **GitHub Actions**, HTTPS is enforced, and the custom domain comes from the account's user site.
- **Version:** `package.json` holds `version`. `vite.config.ts` injects `__APP_VERSION__` and `__APP_COMMIT__` (from `GITHUB_SHA`, or `git rev-parse` locally). They show at the bottom of the menu.
- `base: './'`, so the build works from any subfolder.

## 3. How we've been working

- **Edits:** Claude edits files directly in the connected `Cue` folder, then Chris reviews and commits in GitHub Desktop. Don't commit or push for him. At the end, tell him which files changed.
- **Before editing:** check `git status` and compare the files with your last known version, because Chris sometimes edits or commits in between (for example `src/sample.md`).
- **Testing:**
  - Headless Playwright against a dev server, with screenshots of slides in several themes, light and dark.
  - Chris's own `localhost:5173` can be checked in the desktop app's browser pane.
  - Run `tsc --noEmit` and a build before handing over.
- **Comment-only changes:** compare the compiled output before and after with `esbuild --minify-whitespace`.
- **Vite 8 on his Mac:** the device sandbox is linux-arm64 and can't run his `node_modules` (rolldown native binding). Build-test in a copy in the cloud container with his `package-lock.json`.

## 4. Conventions

- **The text is the only state.** Deck settings live in the front matter. Only non-default values are written (`serializeFrontMatter`). The Design panel edits the front matter; it never stores settings anywhere else.
- **Flexoki for every color.** That covers themes, editor slide colors and UI accents (`src/flexoki.ts`).
  - When tinting toward a neutral, mix in **oklab**, not oklch. oklch mixing made blue tints drift green.
- **Slides are 1920 px wide** (or 1600 / 1080 depending on aspect) and scaled with transforms. `fit()` steps the type down when content overflows.
- **Writing rules**:
  - Headings, tab-indented lines, images, tables and fences go on the slide; everything else is speaker notes.
  - `---` starts a new slide.
  - `//` lines are comments. They also carry directives: `// layout: x`, `// dark`, `// light`, `// invert`.
- **Copy style:** sentence case, plain and short. No "draft" jargon in the UI.
- **Security:** markdown `html: false`, because shared links carry other people's markdown. `<img>` lines are converted to markdown images instead. The built site has a Content-Security-Policy (added by `vite.config.ts`, build only) and `referrer: no-referrer`. If you add a feature that loads from another origin (fonts, fetch, workers), update the CSP or it will silently break in production but not in `npm run dev`.

## 5. Features, briefly

**Editor**

- CodeMirror with line roles and a slide-number badge on each slide.
- On-slide text is colored by the slide's place in the deck, **blue → purple → magenta → red → orange → gold** (`badges.ts`), with a faint ⇥ on tabbed lines. Notes are plain ink; comments are grey italics.
- The cursor takes the current slide's color.
- Enter keeps the tab; Enter on a line that's only a tab drops it.

**Layouts**

- cover, section, content, statement, quote, split, columns, timeline, gallery, full.
- Kickers (a small heading above a bigger one) and `######` footnotes.
- Big-figure columns: when every column head is a short number.

**Themes**

- 18 themes. iA's 12 (New York, Basel, San Francisco, LA, Copenhagen, Vancouver, Tokyo, Milano, Zurich, Paris, Helvetica, Garamond), plus Swiss, Editorial, Plex, Poster, Quiet and Nothing.
- **Nothing:**
  - Hanken Grotesk 300/400, IBM Plex Mono labels, hairlines.
  - A Red-400 accent (#D14D41) in light and dark, used for a hollow circle mark.
  - `**bold**` is red, not heavier.

**Design panel**

- Theme thumbnails.
- Title and body fonts (19 faces), size S–XL, appearance.
- Colors: Flexoki swatches, patterns, or custom, set separately for light and dark.
- Three-slot header and footer with `{title} {number} {count} {date}`.
- Aspect ratio, a per-slide layout, and the Markdown guide.

**Markdown**

- All of iA's syntax: highlight, sup/sub, task lists, definition lists, footnotes (numbered per slide), math (KaTeX), merged table cells, table captions, `<img>`.

**Saving**

- A deck library in IndexedDB, with **Recent** in the menu.
- Browser-only decks are named after their first `#` heading until renamed by hand. Files on disk are never renamed silently. **New** starts empty, so the editor placeholder shows.
- **Download all decks**: a zip of every library deck as `.md` (`src/zip.ts`).
- Two-step delete: × turns into a red trash can, then the row fades out, with Undo.
- Real `.md` files via the File System Access API in Chromium. Cue asks for persistent storage.

**Sharing**

- Deflate, then AES-GCM-256, then base64url in the URL fragment. The key travels in the link, or you set a password (PBKDF2, 600k iterations).
- Opening a link puts the app in shared mode; nothing is saved until "Save a copy".
- After it opens, the fragment is removed from the address bar and the deck is kept in `sessionStorage` (`cue.shared`, this tab only) so reloads keep it, edits included. Edits highlight "Save a copy"; closing the shared deck (×) or leaving the page with edits asks first.

**Presenting**

- Fullscreen stage (⌘↵).
- Presenter window (⌘⇧↵) with notes, next slide and a timer, synced over a BroadcastChannel. Each editor tab uses its own channel (`#presenter&ch=<id>`), so two tabs don't cross-talk.
- Print to PDF.

**Chrome**

- An ALPHA pill with a short note, a credit line and the version in the menu, and an Open Graph card (`public/og.png`).

## 6. Gotchas we hit

- **Code at module level runs before `boot()`'s first `await`.** `shellHTML()` runs synchronously, so any `const` it uses must be declared above `boot()` or inside the function. That caused a blank page once (`REPO` before initialization).
- **Safari clears site data after about 7 days without a visit.** Adding Cue to the Home Screen avoids it. The Alpha note tells people.
- **Programmatic text swaps must not count as edits.** `loadText()` sets a `loading` flag; otherwise switching decks would bump `savedAt` and reorder Recent.
- **Fit only measures `.s-inner`.** Measuring children misfires because glyphs overhang tight line heights.
- **Bodoni Moda** uses `wght.css`, not `opsz.css`; the latter gave odd spacing.
- **Rename** uses `FileSystemFileHandle.move()`, which only exists in Chromium; elsewhere it falls back to a toast.
- **Share links made on localhost only open on the same machine.** Make share links from the live site.
- **The TDZ trap again (2026-10-09):** `SHARED_KEY` was first declared below `boot()` and broke reloading a shared deck. It now sits at the top of `main.ts`. Anything `boot()` reads before its first `await` must be declared above the `boot()` call.
- **The presenter channel id is per page load, not in `sessionStorage`** (the plan said sessionStorage). Duplicating a tab copies its sessionStorage, which would bring the cross-talk back. A reload sends `bye` (now on `pagehide`), which closes the old presenter window anyway.

## 7. Next up: agreed plan

Agreed with Chris on 2026-10-09, after reviewing a list of UX and security suggestions. Build in this order. **Steps 1–5 are built (2026-10-09, pending commit).** Import of a zip or several `.md` files (end of step 2) is not built yet. **Step 6 is next.**

1. ✅ **Shared links: hide the key, keep the deck.**
   - After a share link decrypts, remove the `#v1k…` / `#v1p…` fragment from the address bar with `history.replaceState`. `clearHash()` already exists in `main.ts`; today it only runs on error or when leaving shared mode.
   - So a reload doesn't lose the shared deck, keep it in `sessionStorage` for that tab only, never in the library, and restore it on reload.
   - When the tab has unsaved edits to a shared deck, warn before leaving (`beforeunload`). The prompt should point to **Save a copy**.
   - Be honest about limits: this can't remove the key from browser history, chat apps or synced devices that already saw the link.
2. ✅ **Export all decks.** (import still to do) A menu item, "Download all decks", saves a zip of `.md` files from the IndexedDB library. Data loss is Cue's biggest real risk: Safari's 7-day rule, cleared browser data, switching computers. Import (a zip or several `.md` files) can follow. It also unlocks step 7.
3. ✅ **Per-tab presenter channel.** (id per page load; see Gotchas) Two Cue tabs currently cross-talk with each other's presenter windows (`CHANNEL = 'cue-presenter'` in `presenter.ts`).
   - Create a random channel id per editor tab (in `sessionStorage`) and pass it to the presenter window in its URL (`#presenter&ch=…`). Ignore messages from other channels.
   - This is a bug fix, not a security boundary: anything on `cewillis.com` can already read IndexedDB. If cewillis.com ever hosts other people's pages, move Cue to its own subdomain.
4. ✅ **Name decks from the first heading.**
   - New decks shouldn't start as `# Untitled`. Use the editor placeholder: an empty `# ` isn't a heading to the parser.
   - Set the deck name from the first `#` heading once it has text, without counting it as an edit (use the `loading` flag).
   - Only rename decks that live in the browser. **Never silently rename a real `.md` file on disk.**
5. ✅ **Small hardening.**
   - Add `<meta name="referrer" content="no-referrer">` to `index.html`. This covers slide links and images, so per-link `noreferrer` isn't needed.
   - In `share-ui.ts` (`askPassword` / `showLinkError`), put messages in with `textContent`, not `innerHTML`.
   - Add a Content-Security-Policy **to the production build only**, via a Vite `transformIndexHtml` hook, because Vite's dev server injects inline scripts. Suggested policy:
     - `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'`
     - `style-src` needs `'unsafe-inline'`: slide colors and the editor's line colors are inline styles.
     - `frame-ancestors` doesn't work in a meta tag.
6. **Smoke test on every deploy.** In `.github/workflows/deploy.yml`, before publishing: build, serve `dist/`, open it in headless Chromium, and fail if there's a page error or no slides render (e.g. check `.slide` nodes in the strip). This would have caught the blank-page crash from the version number (`REPO` used before initialization).
7. **Home Screen app (manifest).** Add `manifest.webmanifest`, icons, `apple-touch-icon` and `display: standalone`.
   - **iPhone catch:** a Home Screen web app gets its **own storage**, separate from Safari, so decks made in Safari won't appear in it. Export/import (step 2) is how people move them, and the Alpha note should say so.
   - Skip an offline service worker at first. A wrong caching rule on a site that redeploys often leaves people stuck on an old version.
8. **Later:**
   - In shared mode, show a placeholder for remote images ("Load images from example.com"), because remote images can track who opens a deck.
   - Trap focus in the Share and password dialogs, and return focus afterwards.
   - Load KaTeX only when a deck contains math. Present, the presenter window and print must still get it.
   - Expose `__cue` only in development (`import.meta.env.DEV`). This is housekeeping, not security.
   - Warn when two tabs edit the same deck: on save, check whether `savedAt` changed underneath, because the last save wins today.

**Decided, don't revisit:**

- Keep both the two-step delete and the Undo toast, at least for deleting the open deck.
- Keep the share-link design as it is: AES-GCM-256, PBKDF2 600k, AAD-bound `v1k`/`v1p`, fragment-only, 20 MB decompress cap, `html: false`.

## 8. Ideas and open threads

- **Posters / generated backgrounds:** paused. See `spike/HANDOFF.md`. Chris wants to explore a node-based generator in the style of [Book of Shapes](https://bookofshapes.com/) next.
- **Slides from iA's examples that Cue doesn't do yet:** a live timer slide; native charts.
- **More minimal / "textural" themes:** Chris asked for "some more" and gave one (Nothing). Expect more theme briefs in the same format: name, description, typography and screenshots.
- **Bundle size:** the main chunk is about 700 KB (fonts, KaTeX, CodeMirror). See step 8 of the plan.

## 9. Starting a new session

Paste something like this:

> We're continuing work on Cue, my markdown presentation app. The project is in my connected folder `Cue`. Read `HANDOFF.md` and `docs/ARCHITECTURE.md` first, check `git status`, then let's build step 6 of "Next up" in HANDOFF.md (or: help me with …).
