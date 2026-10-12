# Handoff: Cue

Read this first when you pick up the project in a new session. For how the code works, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status (2026-10-11):** alpha 0.1.0, live and in daily use. Steps 1–6 of "Next up" are committed. **The themes, markdown and typography round (section 9) is built and tested, waiting for Chris to review and commit.** Everything below is built, committed and deployed unless it's listed under "Next up", "Ideas and open threads" or section 9.

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
npm run smoke      # opens dist/ in headless Chrome and checks it works
```

- **Stack:** Vite **8** (rolldown), TypeScript, CodeMirror 6, markdown-it 15, KaTeX, Fontsource fonts. No framework, no server.
- **Deploy:** every push to `main` runs `.github/workflows/deploy.yml` (Node 22; checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5). It runs `npm ci`, `npm run build`, then `npm run smoke`; if the smoke test fails, nothing is published and the live site stays as it was. Pages source is set to **GitHub Actions**, HTTPS is enforced, and the custom domain comes from the account's user site.
- **Version:** `package.json` holds `version`. `vite.config.ts` injects `__APP_VERSION__` and `__APP_COMMIT__` (from `GITHUB_SHA`, or `git rev-parse` locally). They show at the bottom of the menu.
- `base: './'`, so the build works from any subfolder.

## 3. How we've been working

- **Edits:** Claude edits files directly in the connected `Cue` folder, then Chris reviews and commits in GitHub Desktop. Don't commit or push for him. At the end, tell him which files changed.
- **Before editing:** check `git status` and compare the files with your last known version, because Chris sometimes edits or commits in between (for example `src/sample.md`).
- **Testing:**
  - Headless Playwright against a dev server, with screenshots of slides in several themes, light and dark.
  - Chris's own `localhost:5173` can be checked in the desktop app's browser pane.
  - Run `tsc --noEmit`, a build and `npm run smoke` before handing over.
  - **Smoke test** (`scripts/smoke.mjs`): serves `dist/` under `/Cue/` like GitHub Pages, opens it in a fresh headless Chrome profile (so the sample deck loads) and fails on a page error, a CSP violation, a 404, an empty strip or preview, or a presenter window that doesn't show the slide. After the first failure it skips the rest, so a crash fails in about 15 seconds. It uses the machine's installed Chrome through `playwright-core` (no browser download); set `CHROME_PATH` to use another Chromium. In the cloud container: `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run smoke`.
- **Comment-only changes:** compare the compiled output before and after with `esbuild --minify-whitespace`.
- **Vite 8 on his Mac:** the device sandbox is linux-arm64 and can't run his `node_modules` (rolldown native binding). Build-test in a copy in the cloud container with his `package-lock.json`.

## 4. Conventions

- **Nothing is the default theme** (for now, since 2026-10-12): `DEFAULT_SETTINGS.theme` in `parser.ts` and the `getTheme()` fallback. Decks with front matter keep their theme; a deck without one opens in Nothing.
- **The sample deck is the product tour.** `src/sample.md` shows one feature per slide, and each slide's notes explain how it's done. Its voice: behind every great presentation lies a great story; Cue helps you write it, stays out of your way, and builds a design people will love and remember. Keep figures on it true (the "by the numbers" slide counts themes and layouts) and label example data as such.

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
- Autocomplete (`complete.ts`) for front matter keys and values, `//` directives, fence languages and callout types.
- A slide that doesn't fit even at the smallest type step gets an orange ring on its badge and thumbnail, and "Too much for one slide" under the preview.

**Layouts**

- cover, section, content, statement, quote, split, columns, timeline, gallery, full.
- Kickers (a small heading above a bigger one) and `######` footnotes.
- Big-figure columns: when every column head is a short number. Figures never wrap; they share one size (the largest at which the widest fits), and units are set smaller (`$4.2M`).
- `fit()` steps type down until nothing overflows, and steps body text up (`--grow`, up to 1.24) on sparse content, columns and split slides. Titles keep their size.
- Slide directives: `// layout: x`, `// dark` / `light` / `invert`, `// image: contain`, `// chart: bar|line`, `// timer: 5:00`.

**Themes**

- 16 themes in 5 groups by feel: **Plain** (Swiss, Zurich, Plex), **Book** (Garamond, Editorial, Paris, Basel), **Loud** (New York, Poster, San Francisco), **Color** (LA, Tokyo, Milano), **Quiet** (Quiet, Copenhagen, Nothing).
- Vancouver and Helvetica were merged into LA and Swiss (`THEME_ALIASES` in `themes.ts`): old decks open in the survivor with the old fonts.
- Signature details in `slide.css` ("Signature moves"): Swiss (a big red number on section slides; the grid lines behind it were removed), Editorial (column rules, date at top right), Poster (top band, huge section numbers), Basel (titles on a band of ink, in the iA section). Editorial's dark ground is warm gray and San Francisco's is deep purple.
- **Tried and rejected (2026-10-11), don't redo:** signature details for Garamond (drop cap, centered running head and folio), Paris (italic titles, blue ink), Plex (bracketed labels), Tokyo (lettered station badge) and Milano (gold frame); tinted dark grounds for Plex, Garamond, Copenhagen and Quiet; four new themes, Riso, Archive, Blueprint and Signal. Chris compared each before and after and kept the originals. Kept: Swiss, Editorial, Basel, Poster, San Francisco, and the Vancouver and Helvetica merges.
- **Nothing:**
  - Hanken Grotesk 300/400, IBM Plex Mono labels, hairlines.
  - A Red-400 accent (#D14D41) in light and dark, used for a hollow circle mark.
  - `**bold**` is red, not heavier.

**Design panel**

- Theme thumbnails.
- Title and body fonts (28 faces), size S–XL, appearance.
- Type controls, each a front matter key written only when set: `contrast`, `weight`, `leading`, `align`, `labels` (caps / small caps / plain), `numerals`.
- Colors: Flexoki swatches, patterns, or custom, set separately for light and dark.
- Three-slot header and footer with `{title} {number} {count} {date}`, and a `short:` title for `{title}`. Slots that don't fit are cut at a word.
- Aspect ratio and a per-slide layout.
- The Markdown guide (`guide.ts`): every option as a grouped example (Slides, Layouts, Data and code, Text, Slide settings) that inserts at the cursor when clicked. It shows on the Design panel's Slide tab and in its own panel (the ? button, or menu → Markdown guide). **New** opens it automatically so a blank deck starts with examples to click (not on screens 760 px or narrower, where it would cover the editor; not for Load sample deck).

**Markdown**

- All of iA's syntax: highlight, sup/sub, task lists, definition lists, footnotes (numbered per slide), math (KaTeX), merged table cells, table captions, `<img>`.
- Callouts (`> [!NOTE]` and the four other GitHub kinds), code with Flexoki syntax colors and line focus (` ```js {2,4} `), charts from tables, timers, image captions from the title and focal points (`photo.jpg#bottom`).
- Code never shows ligatures, keeps whole lines (it shrinks to 60% before wrapping) and uses the full width; so do tables, math and charts. Text keeps an 8-column measure.

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
- **Margin resets must be `:where()` (2026-10-11).** `.slide p { margin: 0 }` outranked `.s-body > * + *`, so paragraphs, and lists or quotes after a paragraph, had no gap. The resets now have zero specificity.
- **1 px lines vanish in thumbnails.** Slides are shown at a quarter size or less, so any texture or grid needs lines of 2 px or more.
- **Hanging punctuation skips list items:** a hung quote mark collided with the bullet.
- **The parser drops the whole front matter while a line in it is half typed** (no colon yet), so `complete.ts` finds the front matter block itself.
- **Syntax colors arrive after the first render.** `highlight.ts` is a separate chunk; when it loads, `onHighlighterReady` clears the slide cache and re-renders (main window and presenter window).
- **The presenter channel id is per page load, not in `sessionStorage`** (the plan said sessionStorage). Duplicating a tab copies its sessionStorage, which would bring the cross-talk back. A reload sends `bye` (now on `pagehide`), which closes the old presenter window anyway.

## 7. Next up: agreed plan

Agreed with Chris on 2026-10-09, after reviewing a list of UX and security suggestions. Build in this order. **Steps 1–6 are built and committed.** Import of a zip or several `.md` files (end of step 2) is not built yet. **Step 7 is next.** Step 2b (moving to `cue.cewillis.com`) needs import first.

1. ✅ **Shared links: hide the key, keep the deck.**
   - After a share link decrypts, remove the `#v1k…` / `#v1p…` fragment from the address bar with `history.replaceState`. `clearHash()` already exists in `main.ts`; today it only runs on error or when leaving shared mode.
   - So a reload doesn't lose the shared deck, keep it in `sessionStorage` for that tab only, never in the library, and restore it on reload.
   - When the tab has unsaved edits to a shared deck, warn before leaving (`beforeunload`). The prompt should point to **Save a copy**.
   - Be honest about limits: this can't remove the key from browser history, chat apps or synced devices that already saw the link.
2. ✅ **Export all decks.** (import still to do) A menu item, "Download all decks", saves a zip of `.md` files from the IndexedDB library. Data loss is Cue's biggest real risk: Safari's 7-day rule, cleared browser data, switching computers. Import (a zip or several `.md` files) can follow. It also unlocks step 7.
2b. **Move to cue.cewillis.com.** Give Cue its own origin, the real security boundary. Today Cue shares `cewillis.com` with everything else there, including analytics or embeds on the main site, and any of those scripts could read Cue's IndexedDB. A subdomain gets its own storage and channels.
   - **Do import first.** Storage doesn't move with the address, so people need to download their decks at the old address and load them at the new one. For Chris's own decks, copying and pasting the text works too. Best done while Cue is still in alpha.
   - **DNS** (Chris, at his domain host): a CNAME record `cue` → `chriswillis.github.io`.
   - **GitHub:** in the Cue repo, Settings → Pages → Custom domain: `cue.cewillis.com`. When the certificate is issued, tick **Enforce HTTPS**. No CNAME file is needed when deploying with Actions.
   - **Code:** update the absolute URLs in `index.html` (`og:url`, `og:image`, `twitter:image`), plus the README, this file and `docs/ARCHITECTURE.md`. The build itself is address-independent (`base: './'`).
   - **Old share links:** GitHub should redirect `cewillis.com/Cue/…` to the new address, and browsers keep the `#…` fragment through a redirect. Test an old `#v1k…` link after the switch.
   - **Warn before, not after.** Once the redirect is live, the old address can't be opened any more, so decks stored there become unreachable. Before switching, ship a banner at the old address ("Cue is moving to cue.cewillis.com. Download all decks first."), give it some time, then switch.
3. ✅ **Per-tab presenter channel.** (id per page load; see Gotchas) Two Cue tabs currently cross-talk with each other's presenter windows (`CHANNEL = 'cue-presenter'` in `presenter.ts`).
   - Create a random channel id per editor tab (in `sessionStorage`) and pass it to the presenter window in its URL (`#presenter&ch=…`). Ignore messages from other channels.
   - This is a bug fix, not a security boundary: anything on the same origin can already read IndexedDB. The real boundary is step 2b, Cue's own subdomain.
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
6. ✅ **Smoke test on every deploy.** (`scripts/smoke.mjs`, `npm run smoke`; see Testing) In `.github/workflows/deploy.yml`, before publishing: build, serve `dist/`, open it in headless Chromium, and fail if there's a page error or no slides render (e.g. check `.slide` nodes in the strip). This would have caught the blank-page crash from the version number (`REPO` used before initialization).
7. **Home Screen app (manifest).** Add `manifest.webmanifest`, icons, `apple-touch-icon` and `display: standalone`.
   - **iPhone catch:** a Home Screen web app gets its **own storage**, separate from Safari, so decks made in Safari won't appear in it. Export/import (step 2) is how people move them, and the Alpha note should say so.
   - Skip an offline service worker at first. A wrong caching rule on a site that redeploys often leaves people stuck on an old version.
8. **Later:**
   - In shared mode, show a placeholder for remote images ("Load images from example.com"), because remote images can track who opens a deck.
   - Trap focus in the Share and password dialogs, and return focus afterwards.
   - Load KaTeX only when a deck contains math. Present, the presenter window and print must still get it.
   - Expose `__cue` only in development (`import.meta.env.DEV`). This is housekeeping, not security. (The smoke test doesn't use `__cue`, so this won't break it.)
   - Warn when two tabs edit the same deck: on save, check whether `savedAt` changed underneath, because the last save wins today.

**Decided, don't revisit:**

- Keep both the two-step delete and the Undo toast, at least for deleting the open deck.
- Keep the share-link design as it is: AES-GCM-256, PBKDF2 600k, AAD-bound `v1k`/`v1p`, fragment-only, 20 MB decompress cap, `html: false`.

## 8. Ideas and open threads

- **Posters / generated backgrounds:** paused. See `spike/HANDOFF.md`. Chris wants to explore a node-based generator in the style of [Book of Shapes](https://bookofshapes.com/) next.
- **More minimal / "textural" themes:** Chris asked for "some more" and gave one (Nothing). Four I designed without a brief (Riso, Archive, Blueprint, Signal) were rejected; new themes should start from Chris's briefs: name, description, typography and screenshots.
- **Bundle size:** the main JS chunk is about 1.3 MB minified, 430 KB gzipped (KaTeX, CodeMirror, markdown-it); fonts load per face, only when used. Syntax colors are a separate 310 KB chunk loaded only for decks with code. See step 8 of the plan.
- **Charts:** bar and line only, up to 4 series, no hover (slides are presented, not explored). Ideas: horizontal bars for long labels, a stacked option, small multiples.

## 9. Themes, markdown and typography round (2026-10-11, pending commit)

From an audit of all 18 themes, light and dark, with a stress deck. Chris picked every item; all are built:

- **Fixes:** paragraph spacing (the `:where()` resets), big figures that broke mid-number, code width/wrapping/ligatures, footnotes in sentence case, display math at step 1 and start-aligned, size-aware tracking with word spacing, footer titles cut at a word plus `short:`.
- **Type:** sparse slides grow, real small caps (`labelCase: 'small-caps'`, available to themes and as the `labels` setting), optical sizes for Fraunces (now `full.css`), hanging punctuation on headings and paragraphs, 9 new faces (Instrument Sans, Geist, Bricolage Grotesque, Archivo, Atkinson Hyperlegible Next, Source Serif 4, Literata, Martian Mono, Geist Mono), and the six type controls.
- **Themes:** regrouped, two merged, signature details for four themes, two new dark grounds. After a before/after review Chris kept those and rejected the rest (see section 5).
- **Markdown:** callouts, syntax colors and line focus, image fit/focus/captions, smaller units in figures, charts, timers.
- **Editor:** autocomplete, the too-full warning, the Markdown guide panel.

Tested in headless Chromium: every theme light and dark on the sample deck and a stress deck, portrait 9:16, the alias decks, the Design panel, the guide and autocomplete; `tsc`, build and `npm run smoke` pass. Not tested on Chris's Mac: Helvetica and System (they fall back to Inter on Linux), and Safari.
