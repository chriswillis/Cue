# How Cue works

Cue is a static web app: TypeScript and CSS, built by Vite, with no server. Everything happens in the browser. Your text is the single source of truth: slides, settings and layout are all derived from the markdown in the editor.

## The big picture

```mermaid
flowchart TB
  Store[("storage.ts<br/>deck library (IndexedDB)<br/>+ .md files on disk")]
  Share["share.ts<br/>encrypted #link"]
  Editor["editor.ts<br/>CodeMirror: your markdown"]
  Inspector["inspector.ts<br/>Design panel"]
  Parser["parser.ts<br/>text → slides, line roles, settings"]
  Markdown["markdown.ts<br/>markdown-it + extensions"]
  Themes["themes.ts · typefaces.ts<br/>flexoki.ts · fonts.ts"]
  Render["render.ts<br/>slide → DOM, autolayout, fit"]
  Views["main.ts views<br/>strip · preview · overview"]
  Present["present.ts<br/>fullscreen"]
  Presenter["presenter.ts<br/>second window"]

  Store <-- "open · autosave" --> Editor
  Share <-- "link in · Share out" --> Editor
  Inspector -- "rewrites front matter" --> Editor
  Editor -- "every change" --> Parser
  Parser --> Render
  Markdown --> Render
  Themes --> Render
  Render --> Views
  Render --> Present
  Editor <-. "BroadcastChannel" .-> Presenter
```

- **One page, two apps.** `index.html` loads `main.ts`. If the URL starts with `#presenter`, it boots the presenter window; otherwise it boots the editor. Each editor tab makes up a channel id when it loads and passes it as `#presenter&ch=…`, so two Cue tabs never drive each other's presenter windows.
- **Text in, slides out.** The editor holds the markdown. The parser splits it into slides and works out which lines are on the slide. The renderer turns each slide into DOM using a theme.
- **No stored state besides the text.** Theme, fonts, colors and aspect ratio live in the front matter at the top of the text. The Design panel edits that block, so undo, save and share include settings automatically.

## What happens on every keystroke

```mermaid
sequenceDiagram
  participant You
  participant Editor as editor.ts
  participant Main as main.ts
  participant Render as render.ts
  participant Store as storage.ts
  participant Pres as Presenter window

  You->>Editor: type
  Editor->>Editor: parsedField re-parses the text<br/>decorations recolor lines
  Editor->>Main: onChange(text)
  Note over Main: three debounced timers
  Main->>Render: after 90 ms: renderAll()<br/>(only changed slides re-render)
  Render-->>Main: slide nodes, fitted
  Main->>Main: update strip, preview,<br/>overview, Design panel, stage
  Main->>Store: after 600 ms: autosave<br/>(library + .md file if open)
  Main->>Pres: after 300 ms: postMessage(state)
```

## From markdown to a slide

```mermaid
flowchart TD
  A["Slide text<br/>(visible lines only)"] --> B["markdown.ts<br/>md.render(prepare(text))"]
  B --> C["toBlocks()<br/>headings · images · text"]
  C --> D["extractLabels()<br/>kickers · ###### footnotes"]
  D --> E["analyze()<br/>title · subtitle · sections · images"]
  E --> F{"chooseLayout()<br/>or // layout: hint"}
  F --> G["Build DOM<br/>section.slide.theme-x.layout-y"]
  G --> H["applyLook()<br/>colors, fonts, size → CSS variables"]
  H --> I["fit()<br/>figures, code, step type down,<br/>grow sparse slides, hang punctuation"]
  I --> J["mount() scales the 1920 px slide<br/>to any frame with a CSS transform"]
```

Every slide is laid out at a fixed logical size (1920 × 1080 for 16:9) and scaled down with a CSS transform wherever it appears. Type is designed once in pixels and looks the same in thumbnails, the preview, the presenter window and fullscreen.

### Layouts

`chooseLayout()` reads the shape of the content:

| Content | Layout |
| --- | --- |
| a `#` title alone | cover |
| a smaller heading alone | section |
| heading + text | content |
| one short tabbed paragraph | statement |
| a tabbed `>` quote | quote |
| text + image(s) | split |
| repeated subheadings | columns (or `// layout: timeline`) |
| several images | gallery |
| one image alone | full |

## How styling is layered

```mermaid
flowchart LR
  T["themes.ts<br/>type scale, fonts, margins"] -- "themeCSS() → .theme-id { --step-1 … }" --> CSS
  L["applyLook()<br/>palette for this slide"] -- "inline --bg --fg --title --accent…" --> CSS
  CSS["styles/slide.css<br/>layouts + per-theme personality"] --> S["What you see"]
```

1. **Theme variables.** Each theme compiles to CSS custom properties on `.theme-<id>`: the type steps (`--step-0` … `--step-4`), fonts, margins, label style (`--label-case`, `--label-caps`).
2. **Per-slide variables.** `applyLook()` writes colors, and any font, size or type-control overrides (`contrast`, `leading`, `weight`, `labels`, `numerals`), inline on each slide. That's how patterns that change per slide, gradients and your Design panel overrides work.
3. **slide.css** uses only variables, so one set of layout rules serves every theme. Theme quirks are added as `.theme-nothing.layout-section …` rules near the bottom, then the signature details of a few themes, then callouts, code colors, charts and timers.

Things to know when editing slide.css:

- **Resets live in `:where()`.** `:where(.slide) :where(p, ul, ol, dl, pre, blockquote) { margin: 0 }` has zero specificity, so the `.s-body > * + *` spacing rules always win. A reset like `.slide p { margin: 0 }` would silently remove the gap between paragraphs.
- **Tracking scales with size.** Headings use `letter-spacing: calc(var(--display-tracking) * var(--track-k))`, with `--track-k` from 1 (titles, figures) down to 0.2 (h5/h6), and word spacing gives back what the tracking takes.
- **Lines are 2 px or more** for anything decorative. Slides are shown scaled down (a thumbnail is about a quarter size), so 1 px textures and grids disappear.
- **`--grow`** (set by fit) multiplies the slide's base font size: body text grows, titles don't, because they're set in explicit steps.

The editor chrome (toolbar, menu, panels) is styled separately in `styles/app.css`.

## Saving and sharing

```mermaid
flowchart TD
  Edit["Edit"] --> Auto["autosave (600 ms)"]
  Auto --> Lib[("IndexedDB 'cue'<br/>decks store: one record per deck<br/>kv store: current-deck")]
  Auto -->|"Chrome/Edge, file open"| File["your .md file<br/>(File System Access API)"]
  Lib --> Recent["Menu → Recent"]
  Share["Share"] --> Enc["deflate-raw → AES-GCM-256 → base64url"]
  Enc --> Link["https://…/Cue/#v1k.key.data<br/>(or #v1p.salt.data with a password)"]
  Link -->|"recipient opens"| Shared["Shared mode:<br/>nothing saved until 'Save a copy'"]
```

- **Deck library** (`storage.ts`). Every deck is a record `{ id, name, text, createdAt, savedAt, handle? }`. `handle` is the file on disk when there is one. New decks are only saved after the first real edit. A deck without a file is named after its first `#` heading until you rename it by hand; a real `.md` file is never renamed that way.
- **Download all decks** (menu). Zips every deck in the library as `.md` files (`zip.ts`, stored, no compression). It's how people keep a copy: browser storage can be cleared.
- **Share links** (`share.ts`). The deck lives in the URL fragment (after `#`), which browsers never send to a server. Raw HTML in markdown is turned off, so a shared deck can't run code.
- **After a link opens** (`main.ts`). The fragment is removed from the address bar, and the deck is kept in `sessionStorage` (this tab only, never the library) so a reload doesn't lose it. Edits to a shared deck highlight "Save a copy", and leaving the page asks first (`beforeunload`).
- **Content-Security-Policy.** Added to the built `index.html` only, by a small plugin in `vite.config.ts` (the dev server needs inline scripts). `index.html` also sets `referrer: no-referrer`.

## Shipping it

```mermaid
flowchart LR
  Mac["Your Mac<br/>~/Documents/GitHub/Cue"] -- "commit + push<br/>(GitHub Desktop)" --> GH["github.com/chriswillis/Cue"]
  GH -- ".github/workflows/deploy.yml<br/>npm ci → build → smoke test" --> Pages["GitHub Pages"]
  Pages --> Site["https://cewillis.com/Cue/"]
```

`vite.config.ts` stamps the version (from `package.json`) and the commit into the build. They show at the bottom of the menu.

Before publishing, the workflow runs a **smoke test** (`npm run smoke`, `scripts/smoke.mjs`). It serves `dist/` under `/Cue/`, opens it in headless Chrome with an empty profile and checks that the sample deck fills the editor, the strip and the preview, and that the presenter window shows the slide. Any page error, Content-Security-Policy violation or missing file fails the deploy, so a broken build never reaches the live site. It's the only place the production CSP is exercised automatically: `npm run dev` has no CSP.

## The files

| File | What it does |
| --- | --- |
| `index.html` | The page, meta and Open Graph tags. Loads `src/main.ts`. |
| `src/main.ts` | App shell: boot, render loop, menu, views, saving, deck library, presenter sync. **Start here.** |
| `src/editor.ts` | CodeMirror setup, line roles, slide colors, badges, ⇥ marks, Tab/Enter keys. |
| `src/parser.ts` | Text → slides: which lines show, which are notes, front matter → settings. |
| `src/markdown.ts` | The markdown dialect (markdown-it + highlight, sup/sub, footnotes, math, tasks, callouts, code fences…). |
| `src/highlight.ts` | Syntax colors for code (Lezer parsers). Loaded on demand, only when a deck has code in a known language. |
| `src/render.ts` | Slide DOM, autolayout, fit-to-slide (shrink, grow, figures, code, hanging punctuation), header/footer slots, timers, scaling. |
| `src/chart.ts` | `// chart: bar` / `line`: a slide's table drawn as SVG. |
| `src/complete.ts` | Editor autocomplete: front matter, `//` directives, fence languages, callouts. |
| `src/guide.ts` | The Markdown guide panel, with examples that insert at the cursor. |
| `src/themes.ts` | Every theme as data, compiled to CSS variables. |
| `src/typefaces.ts`, `src/fonts.ts` | Bundled fonts and their best weights. |
| `src/flexoki.ts` | The Flexoki palette, color patterns and swatches. |
| `src/badges.ts` | The editor's blue → gold slide colors. |
| `src/inspector.ts` | The Design panel. |
| `src/storage.ts` | IndexedDB deck library and real files. |
| `src/zip.ts` | A tiny zip writer for "Download all decks". |
| `src/share.ts`, `src/share-ui.ts` | Encrypted share links and the Share dialog. |
| `src/present.ts` | Fullscreen Present mode. |
| `src/presenter.ts` | The presenter window (notes, next slide, timer). |
| `src/icons.ts` | Inline SVG icons. |
| `src/styles/slide.css` | How slides look: type, layouts, themes. |
| `src/styles/app.css` | How the app looks: toolbar, editor, panels, menu. |
| `src/sample.md` | The welcome deck: a product tour, one feature per slide, with notes that explain each. |
| `scripts/smoke.mjs` | The smoke test the deploy runs on the built site. |

## Recipes

**Add a menu command.** Add `<button role="menuitem" data-act="my-thing">…</button>` to the menu in `shellHTML()` (`main.ts`). Then add `case 'my-thing':` to the click handler in the "events" section.

**Add a theme.** Copy a `define({...})` block in `themes.ts` and change its id, name, group, fonts and palettes. It shows up in the Design panel automatically. Extra styling goes in `slide.css` as `.theme-yourid …`.

**Add a font.** `npm install @fontsource-variable/<name>`, import its CSS in `fonts.ts`, and add an entry in `typefaces.ts`.

**Add a layout.** Add the name to `Layout` and `LAYOUTS` in `render.ts`, return it from `chooseLayout()` (or pick it with `// layout: name`), and style `.layout-name` in `slide.css`.

**Add a deck setting.** Add it to `Settings` and the defaults in `parser.ts`, read and write it in `toSettings()` and `serializeFrontMatter()`, use it in `render.ts`, and add a control in `inspector.ts`.

**Add markdown syntax.** Add a markdown-it plugin or rule in `markdown.ts`, and style its output in `slide.css`. Add an example to `guide.ts`, and a suggestion to `complete.ts` if it has something to remember.

**Add a slide directive** (like `// timer:`). Add a regex next to `RE_LAYOUT` in `parser.ts`, store it on `SlideSource`, use it in `renderSlide()`, and add it to the slide cache keys in `main.ts` (`keyFor`) and `inspector.ts` (`syncThumbs`), or edits to it won't re-render.

**Add a code language.** `npm install @lezer/<language>`, then add its fence names to `PARSERS` in `highlight.ts`.

**Retire a theme.** Remove its `define()` and add it to `THEME_ALIASES` in `themes.ts` with the theme and fonts that replace it, so old decks keep their look.

## Debugging

- Run `npm run dev` and open http://localhost:5173.
- In the browser console, `__cue` is a handle to the running app: `__cue.slides`, `__cue.parsed`, `__cue.goto(3)`, `__cue.updateSettings({ theme: 'nothing' })`.
- DevTools → Application → IndexedDB → `cue` shows the deck library.
- `npm run build` runs the TypeScript checker first. If it fails, the error says which file and line.
- `npm run smoke` after a build tells you what the deploy would see. If a deploy fails on GitHub, open the run under the repo's **Actions** tab: the smoke step lists each check (`ok`, `FAIL`, `skip`) and the errors it caught.
