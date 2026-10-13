# Handoff: Cue

Read this first when you pick up the project in a new session. For how the code works, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status (2026-10-12):** alpha 0.1.0, live and in daily use. Steps 1–6 of "Next up" are committed. **The new slide types (section 10) are committed. Inline charts with Datatype (section 11) are built and tested, waiting for Chris to review and commit.** Everything below is built, committed and deployed unless it's listed under "Next up", "Ideas and open threads" or section 11.

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

- cover, section, content, statement, quote, split, columns, timeline, gallery, full, plus (section 10) number, cycle, agenda and web.
- Kickers (a small heading above a bigger one) and `######` footnotes.
- Big-figure columns: when every column head is a short number. Figures never wrap; they share one size (the largest at which the widest fits), and units are set smaller (`$4.2M`).
- `fit()` steps type down until nothing overflows, and steps body text up (`--grow`, up to 1.24) on sparse content, columns and split slides. Titles keep their size.
- Slide directives: `// layout: x`, `// dark` / `light` / `invert`, `// image: contain`, `// chart: bar|line`, `// timer: 5:00 [ring|bar] [next]` or `until 14:45`, `// count[: roll]`, `// number: ring|bar`, `// web: https://…`, `// focus: 2`.

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
- **app.css styles every `svg` as an 18 px icon** (2026-10-12). Slide SVGs must set their own `width`/`height` (`.c-svg`, `.cy-svg`, the ring meters) and `stroke: none` where they draw text, or they render as tiny stroked icons.
- **An absolutely positioned grid item measures from its grid area** (2026-10-12). `.s-timer` has `grid-column: 1 / -1`, so `right: var(--mx)` landed two margins in; `right: 0` sits on the margin.
- **YouTube embeds need a referrer** (error 153 "video player configuration error" without one). `web.ts` sends only Cue's origin (`strict-origin`) to youtube-nocookie.com and no referrer anywhere else.
- **Zurich's one headline size uses `!important`** on every heading, so a heading that isn't a title (the big number, cycle labels) needs its own `!important` override at the end of slide.css.
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

## 10. New slide types (2026-10-12, committed)

Inspired by Beautiful.ai's Action Number, Timer, Webview and Arrow Cycle templates, done Cue's way: written as text, laid out automatically. Chris picked all four plus an agenda, `// web: URL` as the webview syntax, and timer visuals as opt-in. All built as planned; what's below is how they ended up.

0. **`activate(slide, opts)`** in `render.ts` replaced `startTimers()`. The Stage and the presenter window call it on their copy of the current slide; it runs timers, count-ups and webviews and returns a stop function. Every other copy stays still (final numbers, full rings, placeholders). See ARCHITECTURE, "What runs while presenting".
1. **Timer ring and bar.** `parseTimer()` in `parser.ts` reads `5:00`, `90`, `5 min` or `until 14:45` (also `2:45pm`), plus `ring`, `bar`, `next` in any order. `SlideSource.timer` is now an object (`Timer`), not seconds.
   - Ring alone: centered, 86% of the text height. With a title or text (`timer-beside`): the words take six columns and the ring sits on the right margin; in portrait, below them.
   - Bar: a band on the slide's bottom edge. On a slide with other content (anything but statement, section or cover), the digits are set small on the footer line, centered (no theme uses the center footer slot).
   - `next` only fires for a timer that was running when its slide came up. A duration timer restarts when you go back to its slide (as before), so it runs its full time again before moving on; an `until` timer that has passed never moves you on.
   - Ring stroke weight per theme: `--ring-w` (Nothing 0.8, Quiet and bookish themes 1.2, Poster, New York and LA 4).
2. **Big number.** `chooseLayout()` picks `number` for a title that is only a figure (`isFigure()`: up to 12 characters, no spaces, 3-character prefix, 4-character suffix) or a growth (`growthOf()`: `A → B`, also `->`). A lone 4-digit year stays a section, so decks with `## 2026` section slides don't change (checked: the sample deck and every example render the same layouts as before).
   - The figure fits its width (`fitNumber()`, `--num-k`), with units smaller (`splitUnits()` now also wraps the number in `.s-num` with its value, decimals and separators, which is what `// count` animates; that works on figure columns too).
   - Growth shows the new value big, and "+45% from $2.9M" under it (percentage points for percentages).
   - `// number: ring` puts a percentage inside a ring with the words beside it; `bar` draws a meter under it. Both fill in step with `// count`.
   - `// count: roll`: each digit is a reel of 21 digits, 1.4em apart, clipped to the digit's height; leftmost settles last.
3. **Arrow cycle.** `src/cycle.ts`. Geometry in slide pixels: ring radius `min(h × 0.3, w × 0.21)` of the box beside the title (the right eight columns in landscape; below the title in portrait). Labels are HTML, anchored by which side of the circle they're on, as wide as that side allows. `overflows()` also checks the labels stay inside the cycle's box, so `fit()` shrinks them.
   - Chevron style everywhere except Nothing, Quiet, Copenhagen, Milano, Garamond, Paris and Editorial, which get the line style (hairline circle, hollow dots, small arrowheads, "01" labels).
   - Chevrons are the accent deepening toward the title color step by step (`--k`); on pattern backgrounds, shades of the text color.
   - More than 7 steps: falls back to columns with the too-full ring (`is-crowded`).
4. **Webview.** `src/web.ts`. https only, no credentials in the URL. A page on Cue's own site (cewillis.com, while Cue lives at cewillis.com/Cue) is framed without `allow-same-origin`, so it runs in an opaque origin and can't read the deck library or lift its sandbox; any other site gets its own origin. The bar and the card's address are set without letter spacing. Placeholder card (domain, "Live when presenting", "Open in new tab ↗"); an image on the slide becomes its poster. Framed with a thin domain bar under a title, edge to edge alone (`is-bleed`, no header or footer).
   - CSP: `frame-src https:` added in `vite.config.ts`.
   - Live only on the Stage. Shield over the page; `I` lifts it (`is-interacting` on the stage) and focuses the page; a click beside it or Esc (when the page doesn't have focus) puts it back. Stage clicks ignore buttons now too.
   - Shared decks: `stage.askWeb = sharedMode`, so the card shows "Load example.com" first.
5. **Agenda.** `// layout: agenda`. Lists the section slides (`sectionList()`), leaving out breaks (a section with a timer) and a section that's the last slide. The section after the agenda is lit and the earlier ones step back; an agenda before all sections (the opening one) or after all of them lights nothing. A tabbed list on the slide replaces the automatic one. `// focus: n` overrides. More than six items go in two columns.
6. **`// focus: 2`** (also `2,4` and `2-4`): dims the other steps in cycles, columns and timelines, and picks the current agenda item.
7. Guide examples, autocomplete for every new directive, and the sample deck (cycle, growth with `// count`, an agenda before part three, a webview of cewillis.com, the questions timer now a ring; "by the numbers" says 14 layouts).

**Tested** in headless Chromium: all 16 themes light and dark, 9:16, live Present mode (count, roll, ring meter, timer ring, webview load, `I` and click-out), a shared link (asks before loading), Zurich's uniform headlines. `tsc`, build and `npm run smoke` pass. **Not tested:** Safari (`color-mix()` with `calc()` percentages in the cycle colors needs Safari 16.2+), real presenting on a second screen, and sites other than YouTube and example.com inside the webview.

**Later ideas:** `// qr` (a QR code for the slide's link, made in the browser), `// layout: process` (a straight row of chevrons), hub and spoke (most of the cycle's geometry), `// focus` on agenda-style builds for lists.

## 11. Inline charts with Datatype (2026-10-12, built, pending commit)

Charts the size of a word, from [Datatype](https://franktisellano.github.io/datatype/), a variable font by Frank Tisellano (SIL OFL). Its ligatures turn typed text into a chart, so no drawing code is needed.

- **Syntax:** `{l:…}` sparkline, `{b:…}` bars, `{p:62}` pie. Whole numbers 0–100, comma-separated, no spaces, up to 20 values (a pie takes one). Anything else stays plain text: over 100, spaces, 21 values, a pie with two values, and anything in code.
- **Where:** `src/datatype.ts` holds the regex, `chartLabel()` (the `aria-label`, e.g. "Sparkline: 10, 30, 25") and `withoutCharts()`. An inline rule in `markdown.ts` (before `emphasis`) turns a match into `<span class="s-dt" role="img" aria-label="…">` with the text unchanged. `{` already stops markdown-it's text rule, so the rule sees it.
- **Font:** `src/fonts/Datatype.woff2` (v1.000, the full axes: `wdth` 0–100, `wght` 100–900) plus `Datatype-OFL.txt`. Self-hosted because Google Fonts only serves `wdth` 50–100. Bundled by Vite, so the CSP (`font-src 'self'`) needed no change.
- **CSS:** `.s-dt` in `slide.css`, unscoped so it also works in notes. It inherits size, weight (line thickness) and color, and resets everything that would change the letters before the ligatures form: `text-transform`, small caps, `letter-spacing`, numerals, other features, `font-variation-settings`. `font-stretch: 50%` is Datatype's default spacing.
- **Kept out of plain text:** the deck title (`{title}` in footers) and agenda entries use `withoutCharts()`. A column head that holds a chart isn't treated as a big figure. `textLength()` counts a chart as about 4 characters, so it doesn't push a slide toward a denser layout.
- **Guide and sample:** "Chart in a line" in the guide's Data and code group. Two sample slides after the bar chart, both labeled as example data: "Charts the size of a word" (a sparkline and a pie in a sentence; the notes credit Frank Tisellano) and "Trends at a glance" (a table with a 12-week sparkline and a share pie per region; each sparkline is scaled from its own low to high).
- **In table cells** charts are set at 1.5× the cell's text (`.slide td .s-dt`), so a sparkline reads as the row's picture.

**Tested** in headless Chromium: a stress deck (cover title, kicker, heading, body, list, table cells, column heads, statement, section, agenda, footer, and the cases that must stay plain text) in Nothing, Swiss, Garamond, Poster, Editorial, LA and Tokyo, light and dark; the sample deck in split view and Present mode. `tsc`, build and `npm run smoke` pass. **Not tested:** Safari, Firefox and a screen reader.

**Ideas:** autocomplete for `{l:`; a preview of the chart in the editor; scaling real numbers (`{l:1210,1380,…}`) to 0–100 automatically, sparklines from their own low to high and bars from zero.
