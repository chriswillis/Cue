# Cue

**Write the talk. The slides follow.**

A markdown presentation editor for the browser, inspired by the iA Presenter workflow: you write a script, and the slides design themselves from its structure. Typography, color and grid come from a small set of carefully tuned themes, so you never drag a text box.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, deploy anywhere
```

## Writing

| You type | What happens |
| --- | --- |
| `---` on its own line | Starts a new slide |
| `# Heading` | Headings always show on the slide |
| `⇥` Tab at the start of a line | That line shows on the slide |
| Plain paragraphs | Speaker notes, visible only to you |
| `![](image.jpg)` on its own line | An image block on the slide |
| `### A` … `### B` … | Repeated subheadings become columns |
| `#### Act one` directly above `## Title` | The smaller heading becomes a kicker, a small label above the title (also works above column heads) |
| `###### Sources` at the end of a slide | A footnote at the bottom of the slide |
| `// anything` | A comment, hidden everywhere |
| `// layout: split` | Overrides the automatic layout |
| `// dark`, `// light`, `// invert` | Shows this one slide in the other appearance |

In the editor, a blue dot in the margin marks every line the audience will see. Notes are dimmed.

### Markdown

Everything in [iA Presenter's Markdown guide](https://ia.net/presenter/support/basics/markdown) works, on slides and in notes:

- CommonMark: paragraphs, line breaks (two spaces or `\`), headings, lists (nested and multi-paragraph), blockquotes, inline code and fenced code, inline and reference links
- `**bold**` `__bold__`, `*italic*` `_italic_`, `~~strikethrough~~`, `==highlight==`
- Superscript `100m^2` or `y^(a+b)^`, subscript `x~z` or `H~2~O`
- Task lists `- [ ]` and `- [x]`, and definition lists (a term, then `: definition`)
- Footnotes: inline `text[^A note.]` or by reference `text[^id]` with `[^id]: A note.` anywhere in the file. They're numbered per slide and set at the bottom of the slide.
- Link and footnote definitions apply to every slide, wherever you write them (in notes too)
- Tables with alignment (`:--`, `:-:`, `--:`), merged cells (`| a || b |` joins a cell with the next), and a `[Caption]` line directly above or below
- Math with KaTeX: `$x+y^2$`, `\(x\)` or `\\(x\\)` inline; `$$…$$`, `\[…\]` or `\\[…\\]` for display
- `<img src="…" alt="…">` on its own line is treated as an image. Other HTML is ignored, which keeps shared links safe to open.

In Cue, list markers `-`, `+` and `*` follow standard Markdown: changing the marker starts a new list.

### Layouts (chosen automatically)

- **cover**: a `#` title alone, plus an optional subtitle heading
- **section**: a smaller heading alone
- **content**: a heading with text
- **statement**: one short tabbed paragraph with no heading
- **quote**: a tabbed `>` quote, with an optional `— attribution`
- **split**: text with one or more images. The image bleeds off the edge, and putting the image first flips the sides.
- **gallery**: several images
- **full**: one image alone, edge to edge
- **columns**: two or more subheadings of the same level. When every column head is a short number (`### 0`, `### 42%`), they're set as big figures.
- **timeline** (`// layout: timeline`): the columns hang from one horizontal line, with a dot for each entry. Use dates as the subheadings.

Long content steps the type scale down until it fits.

### Themes

Eighteen themes in eight groups, all in Flexoki colors, each with light and dark versions:

- **Opinionated:** New York, Basel
- **Vibrant:** San Francisco, LA
- **Pastels:** Copenhagen, Vancouver
- **Colorful:** Tokyo, Milano
- **Classics:** Zurich, Paris
- **Typographic:** Helvetica, Garamond
- **Originals:** Swiss, Editorial, Plex, Poster, Quiet
- **Minimal:** Nothing

The first twelve are interpretations of iA Presenter's built-in themes. Some change the background on every slide (LA, Vancouver, Milano), use gradients (Tokyo), alternate between two colors (Paris), color each title differently (San Francisco) or use one headline size throughout (Zurich).

**Nothing** is minimalism at museum-placard rigor: a bone ground, thin Hanken Grotesk at dramatically varied scale, uppercase mono field notes (kickers, subtitles, footnotes), hairline structure and one hollow circle as the recurring mark. Its one accent, Flexoki red-400, is kept for the circle, the timeline dots, list dashes, quote marks and links, and for `**bold**` text: in Nothing, emphasis is red at the surrounding weight, in headings too (`## Nothing, **designed**`). Section slides show their number in large thin figures. Prose slides rest the text on the bottom margin. A lede followed by a list sets the list beside the heading.

### Design panel

Open **Design** to change the look. Nothing in your text changes.

- **Themes:** live previews of the current slide in every theme
- **Style:**
  - title and body font, chosen from 19 bundled faces or System
  - size (S, M, L, XL)
  - appearance
  - title, body and background colors, set separately for light and dark: any Flexoki color, a pattern that changes every slide, or a custom color
  - header and footer slots
  - aspect ratio
- **Slide:** the current slide's layout and the markdown guide

### Settings

Settings are stored as front matter at the top of the file, so they travel with your markdown. Only values you've changed are written:

```yaml
---
theme: tokyo                       # any theme id
appearance: dark                   # light | dark
aspect: 16:9                       # 16:9 | 16:10 | 4:3 | 9:16
title-font: bodoni-moda            # optional, see src/typefaces.ts
body-font: inter
size: L                            # S | M | L | XL
title-color: "#100F0F / #DFB431"   # light / dark, "-" keeps the theme's
background: "pattern:pastel / -"   # a color or a pattern
header: " |  | {date}"             # left | center | right
footer: "{title} |  | {count}"     # {title} {number} {count} {date} or any text
---
```

## Saving

- In Chrome, Edge and Arc, **Open** and **Save** read and write real `.md` files on disk through the File System Access API. Once you've saved a file, later edits autosave to it.
- Every keystroke is also autosaved to the browser's IndexedDB, so a reload never loses work.
- Safari and Firefox fall back to file upload and **Download .md**.
- **Print or save as PDF** exports one slide per page.

## Sharing a link

**Share** puts the whole deck inside a link. Nothing is uploaded and no server is involved.

1. The markdown is compressed with `deflate-raw`. Compression has to come before encryption, because encrypted data doesn't compress.
2. It's encrypted with AES-GCM-256. A random 12-byte IV is placed in front of the ciphertext, and the link format is bound in as additional data, so changing the link makes decryption fail.
3. The result is base64url-encoded into the URL **fragment** (`#…`). Browsers never send fragments to the server, so hosting, logs and link-preview crawlers only see the bare page address.

There are two kinds of link:

- **Key in the link** (`#v1k.<key>.<data>`), the default. One click opens it. Anyone who has the link can read the deck.
- **Password** (`#v1p.<salt>.<data>`). The key is derived from a password with PBKDF2-SHA-256 at 600,000 iterations. Send the password separately.

Opening a link starts the deck in a **shared** state. Edits stay in that tab, and your own draft and files are never touched until you choose **Save a copy**. If saving a copy replaces your browser draft, the old draft is kept in IndexedDB as `draft-previous`.

**Link length:** Markdown compresses about 2.5–3.5×, so a link runs about 0.4–0.6 characters per byte of markdown. Under about 2,000 characters a link works in most email, chat and SMS apps. Between 2,000 and 8,000 the dialog warns that some apps may cut it short. Above 8,000 it suggests sending the `.md` file instead, and it won't make links over 2 MB. Links that expand to more than 20 MB are refused when opened.

A link only works for other people if the app is hosted somewhere they can reach. Links made on `localhost` only open on your own computer.

## Hosting

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The site is then at `https://<user>.github.io/<repo>/`. The build is fully static (`base: './'`), so `dist/` can also go to Netlify, Cloudflare Pages or any static host.

## Presenting

- **Present** (`⌘↵`): fullscreen. Use the arrows, space or a click to move, and `Esc` to exit.
- **Presenter** (`⌘⇧↵`): opens a second window with your notes as a teleprompter, the current and next slide, a timer and a clock. Navigating in either window keeps both in sync.

## Structure

```
src/
  parser.ts     markdown script → slides (visible vs. notes, front matter)
  render.ts     autolayout, slide DOM, fit-to-slide, scaling
  themes.ts     theme data → CSS custom properties
  styles/       slide.css (type, grid, layouts), app.css (editor chrome)
  inspector.ts  the Design panel
  flexoki.ts    the Flexoki palette, patterns and swatches
  typefaces.ts  the bundled font library
  editor.ts     CodeMirror 6 setup and line-role decorations
  storage.ts    File System Access + IndexedDB autosave
  share.ts      compress + encrypt decks into URL fragments
  share-ui.ts   the Share dialog and password prompt
  present.ts    fullscreen stage
  presenter.ts  presenter window (BroadcastChannel)
  sample.md     the welcome deck
```

All theme colors come from [Flexoki](https://stephango.com/flexoki) by Steph Ango (MIT): warm paper and ink neutrals, with accents chosen per theme.

All fonts are open source (SIL OFL) and self-hosted through Fontsource: Inter, Inter Tight, DM Sans, Hanken Grotesk, Montserrat, Space Grotesk, IBM Plex Sans and Mono, Noto Sans, Noto Serif, Newsreader, EB Garamond, Cormorant, Bodoni Moda, Fraunces, Instrument Serif and JetBrains Mono. System and Helvetica use the fonts already on your computer.
