/**
 * SPIKE v2: rule-based generative posters (title slides) and backgrounds.
 *
 * 1. Roll:   stage (composition), grid, sizes and layers from fixed pools;
 *            colors come from the current theme (+ one Flexoki complement).
 * 2. Refine: re-roll until no rule is violated (max 24 tries):
 *      R1 the text box spans ≥ 3 columns and its left edge shares a line with
 *         the margin or the art; its top/bottom sits on a row line
 *      R2 the title is at least 8.5% of the slide height
 *      R3 art covers 12–62% of the slide; text leaves no excessive white space
 *      R5 the title box overlaps the art by < 6%, and title/background contrast ≥ 3:1
 * Background mode inverts R3: art avoids a given content box and is drawn faint.
 * Everything is deterministic for a seed.
 */
import { ACCENT, BASE, HUES, type Hue, type Step } from '../src/flexoki';

/* ---------------- deterministic random + noise ---------------- */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
type R = ReturnType<typeof rng>;

/** Smooth 2D value noise in [-1, 1]. */
function noise2(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}

/* ---------------- grid ---------------- */
interface Grid { W: number; H: number; cols: number; rows: number; mx: number; my: number; cw: number; rh: number }
const gx = (g: Grid, c: number) => g.mx + c * g.cw;
const gy = (g: Grid, r: number) => g.my + r * g.rh;
const f = (n: number) => n.toFixed(1);

/* ---------------- shapes ---------------- */
interface Shape {
  kind: string;
  svg: string;
  hit: (x: number, y: number) => boolean;
  anchors: [number, number][]; // grid coordinates the shape is aligned to
}
const inRect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function disc(g: Grid, c: number, r: number, radCols: number, fill: string): Shape {
  const cx = gx(g, c), cy = gy(g, r), rad = radCols * g.cw;
  return { kind: 'disc', svg: `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="${fill}"/>`, hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2, anchors: [[c, r]] };
}

function rings(g: Grid, c: number, r: number, n: number, stepCols: number, stroke: string): Shape {
  const cx = gx(g, c), cy = gy(g, r), step = stepCols * g.cw, w = step * 0.42;
  let svg = '';
  for (let i = 1; i <= n; i++) svg += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(i * step)}" fill="none" stroke="${stroke}" stroke-width="${f(w)}"/>`;
  const max = n * step + w / 2;
  return { kind: 'rings', svg, hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= max ** 2, anchors: [[c, r]] };
}

function quarter(g: Grid, c: number, r: number, radCols: number, corner: number, fill: string): Shape {
  const cx = gx(g, c), cy = gy(g, r), rad = radCols * g.cw;
  const sx = corner === 0 || corner === 3 ? 1 : -1, sy = corner < 2 ? 1 : -1;
  const d = `M${f(cx)},${f(cy)} L${f(cx + sx * rad)},${f(cy)} A${f(rad)},${f(rad)} 0 0 ${sx * sy > 0 ? 1 : 0} ${f(cx)},${f(cy + sy * rad)} Z`;
  return { kind: 'quarter', svg: `<path d="${d}" fill="${fill}"/>`, hit: (x, y) => (x - cx) * sx >= 0 && (y - cy) * sy >= 0 && (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2, anchors: [[c, r]] };
}

function bars(g: Grid, R: R, c0: number, r0: number, c1: number, r1: number, vertical: boolean, fill: string): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const len = vertical ? x1 - x0 : y1 - y0;
  const seq = R.pick([[1, 1, 2, 3, 5], [5, 3, 2, 1, 1], [1, 2, 3, 2, 1], [3, 1, 3, 1, 3], [2, 2, 2, 2, 2, 2]]);
  const unit = len / (seq.reduce((a, b) => a + b, 0) * 2 - seq[seq.length - 1]);
  let svg = '', p = 0;
  for (const s of seq) {
    const w = s * unit;
    svg += vertical ? `<rect x="${f(x0 + p)}" y="${f(y0)}" width="${f(w)}" height="${f(y1 - y0)}" fill="${fill}"/>` : `<rect x="${f(x0)}" y="${f(y0 + p)}" width="${f(x1 - x0)}" height="${f(w)}" fill="${fill}"/>`;
    p += w * 2;
  }
  return { kind: 'bars', svg, hit: inRect(x0, y0, x1, y1), anchors: [[c0, r0], [c1, r1]] };
}

function halftone(g: Grid, c0: number, r0: number, c1: number, r1: number, fill: string, dir: number): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const pitch = g.cw / 3;
  let svg = '';
  for (let y = y0 + pitch / 2; y < y1; y += pitch)
    for (let x = x0 + pitch / 2; x < x1; x += pitch) {
      const t = dir === 0 ? (x - x0) / (x1 - x0) : dir === 1 ? (y - y0) / (y1 - y0) : 1 - Math.hypot(x - x1, y - y1) / Math.hypot(x1 - x0, y1 - y0);
      svg += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pitch * 0.46 * (0.12 + 0.88 * Math.max(0, t)))}"/>`;
    }
  return { kind: 'halftone', svg: `<g fill="${fill}">${svg}</g>`, hit: inRect(x0, y0, x1, y1), anchors: [[c0, r0], [c1, r1]] };
}

function truchet(g: Grid, R: R, c0: number, r0: number, c1: number, r1: number, stroke: string): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const t = g.cw / 2, h = t / 2;
  let d = '';
  for (let y = y0; y < y1 - 1; y += t)
    for (let x = x0; x < x1 - 1; x += t)
      d += R.chance(0.5)
        ? `M${f(x + h)},${f(y)}A${f(h)},${f(h)} 0 0 1 ${f(x)},${f(y + h)}M${f(x + t)},${f(y + h)}A${f(h)},${f(h)} 0 0 0 ${f(x + h)},${f(y + t)}`
        : `M${f(x + h)},${f(y)}A${f(h)},${f(h)} 0 0 0 ${f(x + t)},${f(y + h)}M${f(x)},${f(y + h)}A${f(h)},${f(h)} 0 0 1 ${f(x + h)},${f(y + t)}`;
  return { kind: 'truchet', svg: `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(t * 0.18)}" stroke-linecap="round"/>`, hit: inRect(x0, y0, x1, y1), anchors: [[c0, r0], [c1, r1]] };
}

/** Isometric cube field: three tones per cube. */
function cubes(g: Grid, R: R, c0: number, r0: number, c1: number, r1: number, top: string, left: string, right: string): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const s = g.cw * R.pick([0.5, 0.75]); // edge length
  const w = s * Math.sqrt(3), hh = s;
  let a = '', b = '', cc = '';
  for (let row = -1, y = y0; y < y1 + hh; row++, y += hh * 1.5)
    for (let x = x0 + (row % 2 ? w / 2 : 0); x < x1 + w; x += w) {
      if (R.chance(0.12)) continue; // missing cubes make the field breathe
      const cx = x, cy = y;
      a += `M${f(cx)},${f(cy - hh)}L${f(cx + w / 2)},${f(cy - hh / 2)}L${f(cx)},${f(cy)}L${f(cx - w / 2)},${f(cy - hh / 2)}Z`;
      b += `M${f(cx - w / 2)},${f(cy - hh / 2)}L${f(cx)},${f(cy)}L${f(cx)},${f(cy + hh)}L${f(cx - w / 2)},${f(cy + hh / 2)}Z`;
      cc += `M${f(cx + w / 2)},${f(cy - hh / 2)}L${f(cx)},${f(cy)}L${f(cx)},${f(cy + hh)}L${f(cx + w / 2)},${f(cy + hh / 2)}Z`;
    }
  const id = `clip${Math.floor(R.next() * 1e9)}`;
  return {
    kind: 'cubes',
    svg: `<clipPath id="${id}"><rect x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"/></clipPath><g clip-path="url(#${id})"><path d="${a}" fill="${top}"/><path d="${b}" fill="${left}"/><path d="${cc}" fill="${right}"/></g>`,
    hit: inRect(x0, y0, x1, y1),
    anchors: [[c0, r0], [c1, r1]],
  };
}

/** Noise-displaced contour lines. */
function contours(g: Grid, R: R, c0: number, r0: number, c1: number, r1: number, stroke: string): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const n = noise2(R.int(1, 1e6));
  const gap = g.rh / R.pick([5, 7, 9]), amp = g.rh * R.pick([0.35, 0.6, 0.9]), sc = 1 / (g.cw * R.pick([1.5, 2.5, 4]));
  let d = '';
  for (let y = y0; y <= y1 + 0.5; y += gap) {
    let first = true;
    for (let x = x0; x <= x1 + 0.5; x += g.cw / 8) {
      const yy = Math.min(y1, Math.max(y0, y + amp * n(x * sc, y * sc * 0.6)));
      d += `${first ? 'M' : 'L'}${f(x)},${f(yy)}`;
      first = false;
    }
  }
  return { kind: 'contours', svg: `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(gap * 0.28)}" stroke-linejoin="round"/>`, hit: inRect(x0, y0, x1, y1), anchors: [[c0, r0], [c1, r1]] };
}

/** Phyllotaxis bloom: golden-angle dot spiral. */
function bloom(g: Grid, c: number, r: number, radCols: number, fill: string): Shape {
  const cx = gx(g, c), cy = gy(g, r), rad = radCols * g.cw;
  const N = 420, ga = Math.PI * (3 - Math.sqrt(5));
  let svg = '';
  for (let i = 1; i < N; i++) {
    const t = i / N, rr = rad * Math.sqrt(t), a = i * ga;
    svg += `<circle cx="${f(cx + rr * Math.cos(a))}" cy="${f(cy + rr * Math.sin(a))}" r="${f(rad * 0.012 + rad * 0.03 * t)}"/>`;
  }
  return { kind: 'bloom', svg: `<g fill="${fill}">${svg}</g>`, hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2, anchors: [[c, r]] };
}

/** Overlapping blocks with a multiply/screen blend: Swiss layering. */
function blocks(g: Grid, R: R, colors: string[], dark: boolean): Shape[] {
  const out: Shape[] = [];
  const n = R.int(2, 3);
  let c = R.pick([Math.floor(g.cols / 2), Math.floor(g.cols / 2) + 1]);
  for (let i = 0; i < n; i++) {
    const wc = R.int(2, 4), r0 = R.int(0, g.rows - 2), r1 = Math.min(g.rows, r0 + R.int(2, g.rows));
    const c1 = Math.min(g.cols, c + wc);
    const x0 = gx(g, c), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
    out.push({ kind: 'block', svg: `<rect x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}" fill="${colors[i % colors.length]}" style="mix-blend-mode:${dark ? 'screen' : 'multiply'}"/>`, hit: inRect(x0, y0, x1, y1), anchors: [[c, r0], [c1, r1]] });
    c = Math.max(Math.floor(g.cols / 2) - 1, Math.min(g.cols - 2, c + R.pick([-1, 1, 2])));
  }
  return out;
}

/** Tilted squares: a grid of squares whose rotation drifts with noise. */
function tilt(g: Grid, R: R, c0: number, r0: number, c1: number, r1: number, stroke: string): Shape {
  const x0 = gx(g, c0), y0 = gy(g, r0), x1 = gx(g, c1), y1 = gy(g, r1);
  const n = noise2(R.int(1, 1e6)), s = g.cw * 0.5, pad = s * 0.18;
  let svg = '';
  for (let y = y0; y + s <= y1 + 0.5; y += s)
    for (let x = x0; x + s <= x1 + 0.5; x += s) {
      const t = (x - x0) / (x1 - x0);
      const a = n(x / (g.cw * 2), y / (g.cw * 2)) * 50 * t;
      svg += `<rect x="${f(x + pad)}" y="${f(y + pad)}" width="${f(s - 2 * pad)}" height="${f(s - 2 * pad)}" transform="rotate(${a.toFixed(1)} ${f(x + s / 2)} ${f(y + s / 2)})"/>`;
    }
  return { kind: 'tilt', svg: `<g fill="none" stroke="${stroke}" stroke-width="${f(s * 0.07)}">${svg}</g>`, hit: inRect(x0, y0, x1, y1), anchors: [[c0, r0], [c1, r1]] };
}

/** A giant glyph (first letter of the title or a numeral), cropped by the slide edge. */
function glyph(g: Grid, R: R, char: string, font: string, weight: number, fill: string): Shape {
  const size = g.H * R.pick([1.1, 1.35, 1.6]);
  const c = R.pick([g.cols - 4, g.cols - 5, Math.floor(g.cols / 2)]);
  const x = gx(g, c), base = g.H * R.pick([0.86, 0.95, 1.08]);
  const w = size * 0.72;
  const top = base - size * 0.74;
  return {
    kind: 'glyph',
    svg: `<text x="${f(x)}" y="${f(base)}" font-family="${font.replace(/"/g, "'")}" font-weight="${weight}" font-size="${f(size)}" fill="${fill}" letter-spacing="-0.04em">${char.replace(/[<&]/g, '')}</text>`,
    hit: inRect(x, Math.max(0, top), Math.min(g.W, x + w), g.H),
    anchors: [[c, 0]],
  };
}

/* ---------------- colors ---------------- */
export interface PosterPalette { bg: string; ink: string; a: string; b: string; c: string; text: string; dark: boolean }

function findHue(hex: string): { hue: Hue; step: Step } | null {
  const h = hex.toUpperCase();
  for (const hue of HUES) for (const [step, v] of Object.entries(ACCENT[hue])) if (v.toUpperCase() === h) return { hue, step: Number(step) as Step };
  return null;
}

/** Derive a poster palette from theme colors: bg, title ink, accent + a Flexoki complement. */
export function paletteFromTheme(t: { bg: string; title: string; accent: string; muted: string }, dark: boolean, R: R): PosterPalette {
  const found = findHue(t.accent);
  const stepA: Step = dark ? 400 : 600;
  const hue = found?.hue ?? R.pick(HUES);
  const a = found ? t.accent : ACCENT[hue][stepA];
  const offset = R.pick([3, 4, 5]); // split complements read better than strict opposites
  const hueB = HUES[(HUES.indexOf(hue) + offset) % 8];
  const b = ACCENT[hueB][dark ? 300 : 400];
  const c = ACCENT[hue][dark ? 200 : 300];
  return { bg: t.bg, ink: t.title, a, b, c, text: t.title, dark };
}

export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ---------------- stages ---------------- */
interface Ctx { g: Grid; R: R; p: PosterPalette; title: string; font: string; weight: number }
type Stage = (x: Ctx) => Shape[];
const half = (g: Grid) => Math.floor(g.cols / 2);
const third = (g: Grid) => Math.floor(g.cols / 3);
const twoThirds = (g: Grid) => Math.floor((g.cols * 2) / 3);

export const STAGES: Record<string, Stage> = {
  sun: ({ g, R, p }) => {
    const c = R.pick([g.cols - 3, g.cols - 2, g.cols]);
    const r = R.pick([1, 2, g.rows - 1, g.rows]);
    const s = [disc(g, c, r, R.pick([3, 4, 5]), p.a)];
    if (R.chance(0.7)) s.push(disc(g, c + R.pick([-2, -1, 1]), r + R.pick([-1, 1]), R.pick([1, 1.5, 2]), p.b));
    return s;
  },
  orbit: ({ g, R, p }) => [rings(g, R.pick([g.cols - 2, g.cols]), R.pick([0, g.rows, Math.floor(g.rows / 2)]), R.int(4, 7), R.pick([0.7, 0.9, 1.1]), p.a)],
  quarters: ({ g, R, p }) => {
    const s: Shape[] = [];
    const c0 = R.pick([half(g), twoThirds(g)]);
    for (let i = 0; i < R.int(2, 4); i++) s.push(quarter(g, c0 + i * 2, R.pick([0, g.rows]), R.pick([2, 3, 4]), R.int(0, 3), [p.a, p.b, p.c][i % 3]));
    return s;
  },
  rhythm: ({ g, R, p }) => {
    const vertical = R.chance(0.5);
    return [vertical ? bars(g, R, R.pick([half(g), third(g) + 1]), 0, g.cols, g.rows, true, p.a) : bars(g, R, 0, 0, g.cols, R.pick([2, 3]), false, p.a)];
  },
  halftone: ({ g, R, p }) => [halftone(g, R.pick([half(g), third(g) + 1]), 0, g.cols, g.rows, p.a, R.int(0, 2))],
  weave: ({ g, R, p }) => {
    const c0 = R.pick([half(g), twoThirds(g)]);
    const s = [truchet(g, R, c0, 0, g.cols, g.rows, p.a)];
    if (R.chance(0.5)) s.unshift(disc(g, c0, R.pick([1, g.rows - 1]), 2, p.b));
    return s;
  },
  cubes: ({ g, R, p }) => [cubes(g, R, R.pick([half(g), twoThirds(g)]), 0, g.cols, g.rows, p.c, p.a, p.ink)],
  contour: ({ g, R, p }) => (R.chance(0.5) ? [contours(g, R, half(g), 0, g.cols, g.rows, p.a)] : [contours(g, R, 0, Math.ceil(g.rows / 2), g.cols, g.rows, p.a)]),
  bloom: ({ g, R, p }) => [bloom(g, R.pick([g.cols - 3, g.cols - 2]), R.pick([Math.floor(g.rows / 2), g.rows - 1]), R.pick([3, 4]), p.a)],
  blocks: ({ g, R, p }) => blocks(g, R, [p.a, p.b, p.c], p.dark),
  tilt: ({ g, R, p }) => [tilt(g, R, R.pick([half(g), twoThirds(g)]), 0, g.cols, g.rows, p.a)],
  glyph: ({ g, R, p, title, font, weight }) => {
    const ch = (title.match(/[A-Za-z0-9]/)?.[0] ?? 'A').toUpperCase();
    const s = [glyph(g, R, ch, font, weight, p.a)];
    if (R.chance(0.4)) s.unshift(disc(g, g.cols - 1, 1, 1.2, p.b));
    return s;
  },
};
export const STAGE_NAMES = Object.keys(STAGES);

/* ---------------- occupancy + largest empty rectangle ---------------- */
function occupancy(g: Grid, shapes: Shape[], N = 64) {
  const M = Math.round((N * g.H) / g.W);
  const occ: Uint8Array[] = [];
  for (let j = 0; j < M; j++) {
    const row = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) * g.W) / N, y = ((j + 0.5) * g.H) / M;
      row[i] = shapes.some((s) => s.hit(x, y)) ? 1 : 0;
    }
    occ.push(row);
  }
  return { occ, N, M };
}

function largestEmpty(g: Grid, o: ReturnType<typeof occupancy>) {
  const { occ, N, M } = o;
  const i0 = Math.ceil((g.mx / g.W) * N), i1 = Math.floor(((g.W - g.mx) / g.W) * N);
  const j0 = Math.ceil((g.my / g.H) * M), j1 = Math.floor(((g.H - g.my) / g.H) * M);
  const portrait = g.H > g.W;
  const h = new Array(N).fill(0);
  let best = { score: 0, i: 0, j: 0, w: 0, hh: 0 };
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) h[i] = occ[j][i] ? 0 : h[i] + 1;
    const stack: number[] = [];
    for (let i = i0; i <= i1; i++) {
      const cur = i === i1 ? 0 : h[i];
      while (stack.length && h[stack[stack.length - 1]] >= cur) {
        const top = stack.pop()!;
        const height = h[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : i0;
        const width = i - left;
        const ar = (width * g.W) / N / ((height * g.H) / M);
        // titles read horizontally: prefer landscape boxes (less so on portrait slides)
        const score = width * height * (ar >= (portrait ? 0.9 : 1.2) ? 1 : 0.55);
        if (score > best.score) best = { score, i: left, j: j - height + 1, w: width, hh: height };
      }
      stack.push(i);
    }
  }
  const cw = g.W / N, ch = g.H / M;
  return { x: best.i * cw, y: best.j * ch, w: best.w * cw, h: best.hh * ch };
}

function overlapFraction(o: ReturnType<typeof occupancy>, W: number, H: number, box: { x: number; y: number; w: number; h: number }) {
  const { occ, N, M } = o;
  let hit = 0, all = 0;
  for (let j = Math.floor((box.y / H) * M); j < Math.min(M, Math.ceil(((box.y + box.h) / H) * M)); j++)
    for (let i = Math.floor((box.x / W) * N); i < Math.min(N, Math.ceil(((box.x + box.w) / W) * N)); i++) {
      all++;
      hit += occ[j]?.[i] ?? 0;
    }
  return all ? hit / all : 0;
}

/* ---------------- text fitting ---------------- */
export type Measure = (text: string, size: number, width: number) => { w: number; h: number };

function fitTitle(measure: Measure, text: string, box: { w: number; h: number }, min: number, max: number) {
  let lo = min, hi = max, fit = 0;
  for (let k = 0; k < 14 && hi - lo > 1; k++) {
    const mid = (lo + hi) / 2;
    const m = measure(text, mid, box.w);
    if (m.w <= box.w + 0.5 && m.h <= box.h) { fit = mid; lo = mid; } else hi = mid;
  }
  return fit;
}

/* ---------------- poster ---------------- */
export interface Poster {
  svg: string;
  title: { x: number; y: number; w: number; size: number; color: string };
  sub: { x: number; y: number; size: number };
  meta: { seed: number; stage: string; tries: number; violations: string[]; coverage: number; ms: number };
}

export interface PosterInput {
  seed: number;
  W: number;
  H: number;
  title: string;
  measure: Measure;
  theme: { bg: string; title: string; accent: string; muted: string };
  dark: boolean;
  font: string;
  weight: number;
  stage?: string;
}

export function generate(inp: PosterInput): Poster {
  const t0 = performance.now();
  const { seed, W, H, title, measure } = inp;
  const portrait = H > W;
  let last: Poster | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const R = rng(seed * 7919 + attempt * 104729);
    const cols = portrait ? R.pick([4, 6]) : R.pick([8, 12]);
    const rows = portrait ? R.pick([8, 12]) : R.pick([4, 6]);
    const mx = Math.min(W, H) * 0.115, my = Math.min(W, H) * 0.095;
    const g: Grid = { W, H, cols, rows, mx, my, cw: (W - 2 * mx) / cols, rh: (H - 2 * my) / rows };
    const p = paletteFromTheme(inp.theme, inp.dark, R);
    const stageName = inp.stage ?? R.pick(STAGE_NAMES);
    let shapes = STAGES[stageName]({ g, R, p, title, font: inp.font, weight: inp.weight });
    if (portrait) shapes = shapes.map((s) => s); // same vocabulary; the grid already adapts

    const v: string[] = [];
    const o = occupancy(g, shapes);
    let filled = 0;
    for (const row of o.occ) for (const x of row) filled += x;
    const coverage = filled / (o.N * o.M);
    const free = largestEmpty(g, o);

    // R1: snap to columns; the left edge must share a line with the margin or the art
    const c0 = Math.ceil((free.x - mx) / g.cw - 0.3), c1 = Math.floor((free.x + free.w - mx) / g.cw + 0.15);
    const lines = new Set<number>([0, ...shapes.flatMap((s) => s.anchors.map(([c]) => Math.round(c)))]);
    const cands = [...lines].filter((c) => c >= c0 && c <= c1 - (portrait ? 2 : 3)).sort((a, b) => a - b);
    if (!cands.length) v.push('R1 no shared line');
    const cl = cands[0] ?? c0;
    if (c1 - cl < (portrait ? 2 : 3)) v.push('R1 text box too narrow');
    const box = { x: gx(g, cl), y: free.y, w: (c1 - cl) * g.cw, h: free.h };
    const inner = { w: box.w - g.cw * 0.3, h: box.h * 0.8 };

    // R2/R3: fill the open space with the title
    const size = fitTitle(measure, title, inner, H * 0.04, Math.min(W, H) * 0.34);
    if (size < Math.min(W, H) * 0.085) v.push('R2 title too small');
    if (coverage < 0.12) v.push('R3 too little art');
    if (coverage > 0.62) v.push('R3 too much art');
    const m = measure(title, size, inner.w);
    const textH = m.h + size * 0.55;
    if ((box.w * box.h - m.w * textH) / (W * H) > 0.34) v.push('R3 excessive white space');

    // R1: vertical alignment to a row line
    const lower = box.y + box.h / 2 > H / 2;
    let ty: number;
    if (lower) {
      let r = rows;
      while (r > 0 && gy(g, r) > box.y + box.h + 1) r--;
      ty = Math.max(box.y, gy(g, r) - textH);
    } else {
      let r = 0;
      while (r < rows && gy(g, r) < box.y - 1) r++;
      ty = Math.min(gy(g, r), box.y + Math.max(0, box.h - textH));
    }

    // R5: legibility
    const textBox = { x: box.x, y: ty, w: m.w, h: textH };
    if (overlapFraction(o, W, H, textBox) > 0.06) v.push('R5 title overlaps art');
    if (contrast(p.text, p.bg) < 3) v.push('R5 low contrast');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${p.bg}"/>${shapes.map((s) => s.svg).join('')}</svg>`;
    last = {
      svg,
      title: { x: box.x, y: ty, w: inner.w, size, color: p.text },
      sub: { x: box.x, y: ty + m.h + size * 0.2, size: Math.max(Math.min(W, H) * 0.028, size * 0.2) },
      meta: { seed, stage: stageName, tries: attempt + 1, violations: v, coverage, ms: 0 },
    };
    if (!v.length) break;
  }
  last!.meta.ms = performance.now() - t0;
  return last!;
}

/* ---------------- background mode ---------------- */
/**
 * Faint art that keeps clear of the slide's content box (in slide px). The art
 * lives in the space the content leaves: a strip to the right or a band below,
 * whichever is larger, so it frames the content instead of fighting it.
 */
export function background(inp: Omit<PosterInput, 'title' | 'measure'> & { keepClear: { x: number; y: number; w: number; h: number }; opacity: number }): string {
  const { W, H, seed, keepClear: k } = inp;
  const wrap = (bg: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/><g opacity="${inp.opacity}">${body}</g></svg>`;
  for (let attempt = 0; attempt < 24; attempt++) {
    const R = rng(seed * 31337 + attempt * 7);
    const cols = 12, rows = 6, mx = W * 0.065, my = H * 0.09;
    const g: Grid = { W, H, cols, rows, mx, my, cw: (W - 2 * mx) / cols, rh: (H - 2 * my) / rows };
    const p = paletteFromTheme(inp.theme, inp.dark, R);
    const cStart = Math.min(cols, Math.ceil((k.x + k.w - mx) / g.cw) + 1);
    const rStart = Math.min(rows, Math.ceil((k.y + k.h - my) / g.rh) + 1);
    const right = (cols - cStart) * rows >= (rows - rStart) * cols;
    const [c0, r0, c1, r1] = right ? [cStart, 0, cols, rows] : [0, rStart, cols, rows];
    if (c1 - c0 < 2 || r1 - r0 < 1) return wrap(p.bg, '');
    const pool: (() => Shape[])[] = [
      () => [halftone(g, c0, r0, c1, r1, p.a, right ? 0 : 1)],
      () => [contours(g, R, c0, r0, c1, r1, p.a)],
      () => [truchet(g, R, c0, r0, c1, r1, p.a)],
      () => [cubes(g, R, c0, r0, c1, r1, p.c, p.a, p.ink)],
      () => [tilt(g, R, c0, r0, c1, r1, p.a)],
      () => [bars(g, R, c0, r0, c1, r1, right, p.a)],
      () => [rings(g, cols, rows, R.int(4, 7), R.pick([0.7, 0.9]), p.a)],
      () => [bloom(g, cols, rows, R.pick([3, 4]), p.a)],
      () => [disc(g, cols, rows, R.pick([3, 4]), p.a), disc(g, cols - 2, rows - 1, 1, p.b)],
    ];
    const shapes = (inp.stage ? pool[['halftone', 'contour', 'weave', 'cubes', 'tilt', 'rhythm', 'orbit', 'bloom', 'sun'].indexOf(inp.stage)] ?? R.pick(pool) : R.pick(pool))();
    const o = occupancy(g, shapes);
    if (overlapFraction(o, W, H, k) <= 0.02) return wrap(p.bg, shapes.map((x) => x.svg).join(''));
  }
  return wrap(inp.theme.bg, '');
}
