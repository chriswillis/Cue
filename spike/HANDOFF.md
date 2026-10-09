# Handoff: Poster slides and generated backgrounds

**Status:** paused after two exploration rounds (2026-10-08). The prototype works and passes its rules, but the visual quality isn't consistent enough to ship. Nothing in `src/` depends on this folder.

**Goal:** a **Poster** slide type for title slides. It generates SVG art in a Swiss-school style, and the title is laid out so it fits the art. The same engine would later make subtle **generated backgrounds** for ordinary slides.

**Inspiration:** Nikolaj Sokolowski's poster mode ([nikolaj-sokolowski.de](https://nikolaj-sokolowski.de/)) and [Book of Shapes](https://bookofshapes.com/). Read the licensing note before you borrow anything.

---

## 1. Files

| Path | What it is |
|---|---|
| `spike/poster.ts` | The generator, about 500 lines. It has no DOM dependency except the `measure` callback you pass in. |
| `spike/poster.html` | A test page with controls for title, theme, mode, aspect, stage, seed, Shuffle and background mode. It also exposes `render()`, `renderBg()` and `stats()` on `window`. |
| `spike/samples/*.png` | Contact sheets from both rounds (see §7). |
| `spike/HANDOFF.md` | This file. |

To run it:

```bash
npm run dev
# open http://localhost:5173/spike/poster.html
```

The page shows posters at half size. Change any control to redraw, and press **Shuffle** for a new seed. In the browser console you can also call:

```js
await render({ seed: 42, theme: 'garamond', appearance: 'light', aspect: '16:9', title: 'Field notes', sub: 'Spring offsite', stage: 'glyph' })
await renderBg({ seed: 7, theme: 'basel', appearance: 'dark', heading: 'Three rules', body: '…', stage: 'orbit' })
await stats({ n: 500, theme: 'swiss', appearance: 'light', aspect: '16:9', titles: ['Write the talk.', 'Quarterly review'] })
```

The spike imports `src/flexoki.ts`, `src/themes.ts`, `src/typefaces.ts` and `src/fonts.ts`. `tsconfig.json` only includes `src/`, so `npm run build` ignores this folder.

---

## 2. How it works

Each poster goes through four steps, and the result is the same every time for a given seed.

```
seed ─► roll ─► shapes ─► occupancy map ─► largest empty rectangle ─► fit title ─► check rules
          ▲                                                                            │
          └──────────────── re-roll with derived seed (max 24 attempts) ◄── violation ─┘
```

1. **Roll** a grid and a stage (a composition) from fixed pools, using `rng(seed * 7919 + attempt * 104729)`, which is xorshift32.
   - **Landscape grid:** 8 or 12 columns and 4 or 6 rows.
   - **Portrait grid:** 4 or 6 columns and 8 or 12 rows.
   - **Margins:** 11.5% and 9.5% of the slide's short side.
   - **Colors:** come from the theme (§4). Every shape is positioned in **grid units**, so all the art sits on grid lines.
2. **Occupancy:** mark which parts of the slide the art covers on a 64×N map (N ≈ 36 at 16:9). Each shape has a `hit(x, y)` function, and each cell's center is tested against it.
3. **Largest empty rectangle:** a histogram-stack search over the empty cells inside the margins. Wide rectangles score higher, because titles read horizontally. In portrait the preference is weaker.
4. **Fit the title:** binary search for the largest font size whose balanced line wrap fits the box. It's measured in the DOM with the theme's display font, weight and letter spacing.

Then the rules below are checked. If any fails, the generator rolls again with a seed derived from the original. After 24 failures it returns the last attempt along with its list of violations.

## 3. Rules (`generate()` in `poster.ts`)

| Rule | Check | Threshold |
|---|---|---|
| **R1 Alignment** | The text box's left edge lies on a column line it shares with the margin (column 0) or with one of the art's anchor columns | must hold |
| R1 Width | The text box spans enough columns | ≥ 3 (landscape), ≥ 2 (portrait) |
| R1 Rows | The text block's top sits on a row line (upper half of the slide), or its bottom does (lower half) | always applied, adjusted rather than checked |
| **R2 Legibility** | Title font size | ≥ 8.5% of the slide's short side |
| **R3 Balance** | How much of the slide the art covers | between 12% and 62% |
| R3 Whitespace | Box area minus title area, as a share of the slide | ≤ 34% |
| **R5 Overlap** | Share of the title box's cells that are covered by art | ≤ 6% |
| R5 Contrast | WCAG contrast between title color and background | ≥ 3:1 (large text) |

The left-edge alignment rule made the biggest visual difference between the two rounds. Titles stopped floating and started lining up with the art's edges. Compare `samples/round1-first-pass.png` with `samples/round1.png`.

## 4. Colors (`paletteFromTheme`)

The poster colors come from the current theme, in its current light or dark mode:

- `bg` and `text` are the theme's background and title colors. A per-slide pattern resolves to slide 0 for now; see the known issues.
- `a` is the theme accent. If the accent isn't a Flexoki hue (New York's black, for example), a random hue is used.
- `b` is a split complement 3–5 hues away on Flexoki's 8-hue wheel, at step 400 (light) or 300 (dark).
- `c` is a lighter tint of the accent's hue, at 300 (light) or 200 (dark).

Every color comes from Flexoki, as the project requires.

## 5. Stages (compositions)

All of these are our own constructions from generic geometry.

| Stage | Construction | Verdict |
|---|---|---|
| `sun` | 1–2 discs anchored at grid intersections, often running off the edge | ✅ strong |
| `orbit` | concentric rings around an edge or corner point | ✅ strong |
| `quarters` | 2–4 quarter discs pivoting on grid intersections | ⚠️ sometimes clipped awkwardly at the slide edge |
| `rhythm` | bars with width progressions (Fibonacci, symmetric, alternating) | ⚠️ the thinnest bars look like glitches; set a minimum width |
| `halftone` | dot field whose dot size grows across the area (horizontally, vertically or radially) | ✅ strong |
| `weave` | truchet quarter-arc tiles, sometimes with a disc | ✅ strong |
| `cubes` | isometric cube field in 3 tones with some cubes missing, clipped to its area | ✅ good; can crowd the title |
| `contour` | value-noise-displaced parallel lines | ⚠️ clamping makes lines bunch up at the area's edges; fade the displacement out near the edges instead |
| `bloom` | phyllotaxis (golden angle) dot spiral | ✅ good |
| `blocks` | 2–3 overlapping rectangles with `multiply` (light) or `screen` (dark) blending | ❌ muddy on light themes; needs real overprint colors, not blend modes |
| `tilt` | grid of square outlines rotated by noise, more toward one side | ✅ good |
| `glyph` | giant first letter of the title in the theme's display font, cropped by the slide edge | ✅ the most "poster" stage; occupancy uses a bounding box, which is coarse |

## 6. Background mode (`background()`)

- **Placement:** the art goes in the space the content leaves, either a strip to the right of the content box or a band below it, whichever is larger. It's drawn at `opacity` (0.16 in the samples).
- **Content box:** the caller passes `keepClear` as a rectangle in slide pixels. In the real app this should be the measured bounds of `.s-inner` content after layout.
- **Rule:** the art may overlap `keepClear` by at most 2%. If it can't, it re-rolls, and after 24 failures it falls back to a plain background.

## 7. Results

The samples are in `spike/samples/`:

- `round1-first-pass.png`, `round1.png`: 6 stages and a free Flexoki palette, before and after the alignment rule.
- `round2-stages.png`: all 12 stages in Swiss, alternating light and dark.
- `round2-themes.png`: one poster per iA-style theme, using the theme's colors and fonts.
- `round2-portrait.png`: 9:16.
- `round2-backgrounds.png`: background mode behind content slides.

**Rule suite** (`stats()`): 13 titles from "Hello" to a 60-character sentence, 500 seeds each.

| Config | Pass | Avg tries | Avg ms | Max ms |
|---|---|---|---|---|
| Swiss light 16:9 | 500/500 | 1.20 | 3.1 | 26 |
| Garamond light 16:9 | 500/500 | 1.20 | 3.0 | 31 |
| New York dark 4:3 | 500/500 | 1.45 | 3.6 | 37 |
| Tokyo dark 9:16 | 500/500 | 1.87 | 4.6 | 41 |

"Pass" means the rules hold, not that the poster looks good. Re-rolling can also change the stage, which hides weak stages. In portrait, `glyph` and `cubes` are rarely chosen because they usually fail. Before shipping, measure the first-try pass rate for each stage.

## 8. Known issues (priority order)

1. **Weak stages:** `blocks` (muddy color), `rhythm` (hairline bars) and `contour` (bunching). Fix them or remove them from the pool.
2. **Per-slide color patterns:** themes like LA, Vancouver, Milano, Tokyo and Paris change colors per slide, but the poster only uses slide 0's. Pass the slide index into `resolveColor`.
3. **Stage choice when pinned:** if someone picks a stage and it can't pass, the result should fall back gracefully to the normal cover layout, not show a poster that breaks the rules.
4. **Coarse occupancy:** the 64-column map lets thin art like rings and contours sit closer to the text than it looks. Consider padding each shape's `hit` by about half a cell.
5. **Glyph occupancy** uses a bounding box. Fine for now; a canvas alpha test would be more accurate.
6. **Subtitle:** it's placed under the title and checked by no rule. Add it to the text block for R3 and R5.
7. **Long titles:** they shrink toward the R2 minimum. Above roughly 60 characters, fall back to the normal cover layout.
8. **Determinism across browsers:** the layout depends on font metrics from DOM measurement, so it can differ slightly between browsers. Accept this, or snap sizes to steps.

## 9. Integration plan (proposed, not started)

**Markdown syntax**, which keeps the markdown the single source of truth and keeps share links deterministic:

```md
// layout: poster
// poster: 4821 bloom        ← seed, optional stage; written by Shuffle/Lock
# Field notes
### Spring offsite
```

**Rendering**
- Add `poster` to `Layout` in `src/render.ts`, plus a `renderPoster()` branch. It inserts the SVG as `.s-art` behind `.s-inner`, positions the `h1` and subtitle absolutely, and skips `fit()`.
- **Measuring:** reuse the measure host from `render.ts`.
- **Cache key:** seed, stage, size, theme, appearance, title font and the title text.
- **Where it shows:** the SVG is inline, so it works unchanged in present mode, the presenter window, Print/PDF and share links.

**Design panel** (Slide tab)
- Layout = Poster
- Stage picker (Any plus each stage)
- **Shuffle**, which writes a new seed
- **Lock**, which keeps the current seed
- A live thumbnail strip of 6 seeds to choose from

**Backgrounds**
- Front matter `art: "<stage|any> / <opacity>"`, plus a deck seed.
- Each slide's seed is `deckSeed + index`.
- `keepClear` is measured from the laid-out slide, so render backgrounds after `fit()`.
- Skip slides with images.

**Tests**
- Headless Playwright: 500 seeds for every theme × aspect. Assert all rules pass, generation is under 50 ms, and the first-try rate for each stage is at least 60%.
- Snapshot contact sheets for a quick visual review.

**Estimate:** about a day for Poster slides, and about half a day more for backgrounds, after the weak stages are fixed.

## 10. Licensing note (Book of Shapes)

The Book of Shapes licence lets people use **downloaded SVGs** freely. It does not cover redistributing them "as patterns", or "a template library or a generator built from them". The **pattern definitions (node graphs) and the site's code are not licensed**. Three patterns that recreate existing works (Joy Division, Joy Division Mesh, Brockmann Beethoven Arcs) can be studied but not published.

**What this means for us:**
- Don't copy their patterns, their node graphs, their parameter values or their pattern names.
- Generic geometry (circles, rings, truchet tiles, halftones, phyllotaxis, isometric grids, noise fields) is fair game, and that's all this spike uses.
- Keep our stage names our own.

## 11. Bridge to the node-architecture exploration

The current generator is plain functions: `stage(ctx) → Shape[]`. A node graph would make stages composable data instead of code, the way Book of Shapes describes its approach: "points on a grid, add noise, connect, filter, stack".

| Today | As nodes |
|---|---|
| `Grid` | `grid` source node (cols, rows, margins) giving a point set |
| shape builders (`disc`, `halftone`, …) | generator nodes: points → primitives |
| `noise2`, rotation in `tilt`, displacement in `contours` | modifier nodes: jitter, displace, rotate, scale by field |
| clip in `cubes` | `mask` / `clip` node |
| stacking shapes in a stage | `stack` / `layer` node with blend mode |
| stage picker | named preset graphs, with some parameters marked public (sliders) |
| `occupancy`, rules, refinement loop | stays outside the graph, as a layout solver that consumes the graph's `hit()` |

Two contracts to keep when moving to nodes:

1. Every node output can answer `hit(x, y)` (or rasterize to the occupancy map), so the rule solver keeps working.
2. Every node takes a `seed` input derived from its parent, so graphs stay deterministic.

That suggests a clean split: the **node graph produces art**, and the **poster solver places text** around it. The poster work can resume on top of whatever node system comes out of the next exploration.
