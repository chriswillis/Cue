# Handoff: Cue

Read this first when you pick up the project in a new session. For how the code works, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status (2026-10-09):** alpha 0.1.0, live and in daily use. Everything below is built, committed and deployed unless it's listed under "Ideas and open threads".

---

## 1. What Cue is

A browser clone of [iA Presenter](https://ia.net/presenter). You write a markdown script, and Cue turns it into designed slides, with good typography, color and grid, and no dragging of boxes.

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
- **Writing rules** (iA Presenter's):
  - Headings, tab-indented lines, images, tables and fences go on the slide; everything else is speaker notes.
  - `---` starts a new slide.
  - `//` lines are comments. They also carry directives: `// layout: x`, `// dark`, `// light`, `// invert`.
- **Copy style:** sentence case, plain and short. No "draft" jargon in the UI.
- **Security:** markdown `html: false`, because shared links carry other people's markdown. `<img>` lines are converted to markdown images instead.

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
- Two-step delete: × turns into a red trash can, then the row fades out, with Undo.
- Real `.md` files via the File System Access API in Chromium. Cue asks for persistent storage.

**Sharing**

- Deflate, then AES-GCM-256, then base64url in the URL fragment. The key travels in the link, or you set a password (PBKDF2, 600k iterations).
- Opening a link puts the app in shared mode; nothing is saved until "Save a copy".

**Presenting**

- Fullscreen stage (⌘↵).
- Presenter window (⌘⇧↵) with notes, next slide and a timer, synced over a BroadcastChannel.
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

## 7. Ideas and open threads

- **Name new decks from the first heading.** New decks start as `# Untitled`, so they all read "Untitled" in Recent until renamed. Offered to Chris but not built.
- **Posters / generated backgrounds:** paused. See `spike/HANDOFF.md`. Chris wants to explore a node-based generator in the style of [Book of Shapes](https://bookofshapes.com/) next.
- **Slides from iA's examples that Cue doesn't do yet:** a live timer slide; native charts.
- **Undo toast on delete:** possibly redundant now that delete asks to confirm. Kept for now; ask Chris.
- **More minimal / "textural" themes:** Chris asked for "some more" and gave one (Nothing). Expect more theme briefs in the same format: name, description, typography and screenshots.
- **Bundle size:** the main chunk is about 700 KB (fonts, KaTeX, CodeMirror). Math could be loaded lazily.
- **Home Screen / PWA:** a manifest and icons would make "Add to Home Screen" nicer on iPhone.

## 8. Starting a new session

Paste something like this:

> We're continuing work on Cue, my markdown presentation app. The project is in my connected folder `Cue`. Read `HANDOFF.md` and `docs/ARCHITECTURE.md` first, check `git status`, then help me with: …
