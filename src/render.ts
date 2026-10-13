import { md, prepare } from './markdown';
import { SIZE_SCALE, type Settings, type SlideSource } from './parser';
import { getTheme, stepVars, labelVars, type Palette } from './themes';
import { getTypeface } from './typefaces';
import { resolveColor } from './flexoki';
import { chartSVG } from './chart';
import { cycleDiagram, cycleStyle, CYCLE_MAX } from './cycle';
import { webTarget, webFrame } from './web';

/**
 * Slide rendering + autolayout.
 *
 * Every slide is laid out at a fixed logical size (1920 wide for landscape)
 * and scaled with a CSS transform wherever it is shown. Type is therefore
 * designed once, in pixels, and looks identical in thumbnails, the preview,
 * the presenter window and fullscreen.
 */

export { md };

/*
 * HOW ONE SLIDE IS MADE (renderSlide)
 *   1. markdown → HTML (markdown.ts), then split into blocks: headings,
 *      images and text (toBlocks).
 *   2. Labels: a small heading right above a bigger one becomes a kicker;
 *      ###### at the end becomes a footnote (extractLabels).
 *   3. analyze() finds the title, subtitle, sections (repeated headings) and
 *      images. chooseLayout() picks a layout from that shape, unless the
 *      slide says `// layout: x`.
 *   4. The DOM is built with classes like `theme-swiss layout-split`; the
 *      actual look lives in styles/slide.css plus per-theme CSS variables.
 *   5. applyLook() resolves colors, fonts and size into inline CSS variables.
 *   6. fit() (called by the caller) shrinks the type step by step until
 *      nothing overflows.
 *
 * TO ADD A LAYOUT: add its name to Layout and LAYOUTS, return it from
 * chooseLayout() (or let people pick it with // layout:), add a `case` in
 * renderSlide if it needs special DOM, and style `.layout-yourname` in
 * slide.css.
 */

export type Layout =
  | 'cover'
  | 'section'
  | 'content'
  | 'statement'
  | 'quote'
  | 'split'
  | 'columns'
  | 'timeline'
  | 'gallery'
  | 'full'
  | 'number'
  | 'cycle'
  | 'agenda'
  | 'web'
  | 'blank';

/** Layouts people can pick with `// layout:` (web comes from `// web:`, blank from nothing). */
export const LAYOUTS: Layout[] = ['cover', 'section', 'content', 'statement', 'quote', 'split', 'columns', 'timeline', 'cycle', 'number', 'agenda', 'gallery', 'full'];

export const ASPECTS: Record<Settings['aspect'], { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '16:10': { w: 1920, h: 1200 },
  '4:3': { w: 1600, h: 1200 },
  '9:16': { w: 1080, h: 1920 },
};

interface Block {
  kind: 'heading' | 'image' | 'text';
  level: number;
  el: HTMLElement;
  /** A small label heading written directly above this one */
  kicker?: HTMLElement;
}

interface Section {
  head: HTMLElement | null;
  kicker: HTMLElement | null;
  body: HTMLElement[];
  images: HTMLElement[];
}

interface Analysis {
  title: HTMLElement[]; // heading + optional subtitle heading
  intro: HTMLElement[]; // text directly under the title
  sections: Section[];
  images: HTMLElement[];
  text: HTMLElement[];
  imageFirst: boolean;
  titleLevel: number;
}

function toBlocks(html: string): Block[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const blocks: Block[] = [];
  for (const node of Array.from(tpl.content.children) as HTMLElement[]) {
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) {
      blocks.push({ kind: 'heading', level: Number(tag[1]), el: node });
    } else if (tag === 'P' && node.children.length >= 1 && Array.from(node.childNodes).every((c) => (c as HTMLElement).tagName === 'IMG' || (c.nodeType === 3 && !c.textContent!.trim()))) {
      // A paragraph that contains only image(s): one block per image
      for (const img of Array.from(node.querySelectorAll('img'))) blocks.push({ kind: 'image', level: 0, el: wrapImage(img) });
    } else {
      blocks.push({ kind: 'text', level: 0, el: node });
    }
  }
  return blocks;
}

/** A heading turned into a small label paragraph (kicker or footnote). */
function asLabel(h: HTMLElement, cls: string): HTMLElement {
  const p = document.createElement('p');
  p.className = cls;
  p.innerHTML = h.innerHTML;
  return p;
}

/**
 * Two label conventions:
 *  - Kicker: a heading directly above a bigger heading (`#### Act one` then
 *    `## Nothing, defined`) becomes a small label above it.
 *  - Footnote: `######` headings at the very end of a slide become a small
 *    line at the bottom.
 */
function extractLabels(blocks: Block[]): { blocks: Block[]; foot: HTMLElement[] } {
  const foot: HTMLElement[] = [];
  // Markdown footnotes ([^1]) render as a section at the very end
  const notes = blocks.filter((b) => b.el.matches('section.footnotes'));
  blocks = blocks.filter((b) => !notes.includes(b));
  while (blocks.length > 1) {
    const last = blocks[blocks.length - 1];
    if (last.kind !== 'heading' || last.level !== 6) break;
    foot.unshift(asLabel(last.el, 's-footnote'));
    blocks = blocks.slice(0, -1);
  }
  foot.push(...notes.map((b) => b.el));
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = blocks[i + 1];
    if (b.kind === 'heading' && !b.kicker && n?.kind === 'heading' && n.level < b.level) {
      n.kicker = asLabel(b.el, 's-kicker');
      continue;
    }
    out.push(b);
  }
  return { blocks: out, foot };
}

/** A block's elements, with its kicker first. */
const withKicker = (b: Block): HTMLElement[] => (b.kicker ? [b.kicker, b.el] : [b.el]);

/* ------------------------------------------------------------------ */
/* Figures: "$4.2M", "118%", "1,200"                                    */
/* ------------------------------------------------------------------ */

interface Figure {
  prefix: string;
  /** The number as written: "4.2", "1,200" */
  num: string;
  suffix: string;
  value: number;
  decimals: number;
  /** Thousands separator ("," or "." or none) and decimal mark, as written */
  group: string;
  dec: string;
}

/** "$4.2M" → prefix "$", 4.2, suffix "M". Letters before the number (Q1, H2) make it a label, not a figure. */
function parseFigure(text: string): Figure | null {
  const m = /^([^\p{L}\d\s.,-]*)(-?[\d.,]*\d)(\D*)$/u.exec(text.trim());
  if (!m) return null;
  const ns = m[2];
  const dot = ns.lastIndexOf('.');
  const comma = ns.lastIndexOf(',');
  let dec = '.';
  let group = '';
  if (dot >= 0 && comma >= 0) {
    dec = dot > comma ? '.' : ',';
    group = dec === '.' ? ',' : '.';
  } else if (comma >= 0) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(ns)) group = ',';
    else dec = ',';
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(ns)) {
    group = '.';
    dec = ',';
  }
  const norm = (group ? ns.split(group).join('') : ns).replace(dec, '.');
  const value = Number(norm);
  if (!Number.isFinite(value)) return null;
  return { prefix: m[1], num: ns, suffix: m[3], value, decimals: norm.includes('.') ? norm.split('.')[1].length : 0, group, dec };
}

/** A number written the same way as `f`: same decimals, separators. */
function formatLike(v: number, f: Pick<Figure, 'decimals' | 'group' | 'dec'>): string {
  const [int, frac] = Math.abs(v).toFixed(f.decimals).split('.');
  const grouped = f.group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, f.group) : int;
  return `${v < 0 && Number(Math.abs(v).toFixed(f.decimals)) !== 0 ? '-' : ''}${grouped}${frac ? f.dec + frac : ''}`;
}

/** A title that is just a figure, short and without spaces: "$4.2M", "118%", "3×". */
function isFigure(text: string): boolean {
  const f = text.length <= 12 && !/\s/.test(text) ? parseFigure(text) : null;
  return !!f && f.prefix.length <= 3 && f.suffix.length <= 4;
}

/** "$2.9M → $4.2M": a figure that grew (or shrank). */
function growthOf(text: string): [Figure, Figure] | null {
  const m = /^(\S+)\s*(?:→|->|⟶|–>|—>)\s*(\S+)$/.exec(text.trim());
  if (!m || !isFigure(m[1]) || !isFigure(m[2])) return null;
  return [parseFigure(m[1])!, parseFigure(m[2])!];
}

/**
 * Big figures: set the unit or symbol smaller than the number, so "$4.2M"
 * reads as a number with a unit, and wrap the number so `// count` can run it.
 * Only plain-text heads are touched.
 */
function splitUnits(h: HTMLElement, from?: Figure): Figure | null {
  if (h.children.length) return null;
  const f = parseFigure(h.textContent ?? '');
  if (!f) return null;
  const span = (text: string, cls: string) => {
    const e = document.createElement('span');
    e.className = cls;
    e.textContent = text;
    return e;
  };
  const num = span(f.num, 's-num');
  Object.assign(num.dataset, { value: String(f.value), decimals: String(f.decimals), group: f.group, dec: f.dec });
  if (from) num.dataset.from = String(from.value);
  h.replaceChildren(...[f.prefix && span(f.prefix, 's-unit is-prefix'), num, f.suffix && span(f.suffix, 's-unit is-suffix')].filter((x): x is HTMLElement => !!x));
  return f;
}

/** How full a meter is, 0..1, for a figure: a percentage, or a fraction already. */
function meterValue(f: Figure | null): number | null {
  if (!f) return null;
  if (f.suffix.includes('%')) return Math.max(0, Math.min(1, f.value / 100));
  return f.value >= 0 && f.value <= 1 && !f.suffix ? f.value : null;
}

/** A ring drawn as two circles; --p (0..1) is how much of it is filled. */
function ringSVG(cls: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><circle class="m-track" cx="50" cy="50" r="46"/><circle class="m-fill" cx="50" cy="50" r="46" pathLength="1"/></svg>`;
  return tpl.content.firstElementChild as HTMLElement;
}

/** Opening punctuation that should hang in the margin. */
const HANGING = /^[“‘"'«„(\[]/;

/**
 * Hanging punctuation: a leading quote or bracket goes in a span that fit()
 * pulls left by its own width, so the letters line up with the margin.
 */
function markHanging(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .s-body > p, .s-section-body > p, .s-intro > p').forEach((e) => {
    if (e.closest('blockquote, .s-footnotes')) return;
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node && !node.data.trim()) node = walker.nextNode() as Text | null;
    if (!node || !HANGING.test(node.data.trimStart())) return;
    // Only when the punctuation really starts the line
    if (node.data !== node.data.trimStart() || node.parentElement?.closest('sup, sub, code')) return;
    const span = document.createElement('span');
    span.className = 's-hang';
    span.textContent = node.data[0];
    node.data = node.data.slice(1);
    node.parentNode!.insertBefore(span, node);
  });
}

/** `photo.jpg#bottom`, `#top-left` or `#30,70` (percent): where a cropped image is anchored. */
function focalPoint(src: string): string {
  const hash = /#([\w,.%-]+)$/.exec(src)?.[1]?.toLowerCase();
  if (!hash) return '';
  const pct = /^(\d{1,3})%?,(\d{1,3})%?$/.exec(hash);
  if (pct) return `${Math.min(100, +pct[1])}% ${Math.min(100, +pct[2])}%`;
  const words = hash.split('-').filter((w) => ['top', 'bottom', 'left', 'right', 'center'].includes(w));
  return words.length && words.length === hash.split('-').length ? words.join(' ') : '';
}

function wrapImage(img: HTMLImageElement): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 's-figure';
  const focus = focalPoint(img.getAttribute('src') ?? '');
  if (focus) img.style.objectPosition = focus;
  img.loading = 'eager';
  img.decoding = 'async';
  img.draggable = false;
  fig.appendChild(img);
  if (img.title) {
    const cap = document.createElement('figcaption');
    cap.textContent = img.title;
    fig.appendChild(cap);
    img.removeAttribute('title');
  }
  return fig;
}

function analyze(blocks: Block[]): Analysis {
  const a: Analysis = { title: [], intro: [], sections: [], images: [], text: [], imageFirst: false, titleLevel: 0 };
  let i = 0;
  const firstContent = blocks.find((b) => b.kind !== 'heading');
  a.imageFirst = firstContent?.kind === 'image' && blocks[0]?.kind === 'image';

  // Which heading level, if any, repeats enough to form sections?
  const levelCounts = new Map<number, number>();
  blocks.forEach((b) => b.kind === 'heading' && levelCounts.set(b.level, (levelCounts.get(b.level) ?? 0) + 1));
  const first = blocks[0];

  let sectionLevel = 0;
  for (const [lvl, n] of [...levelCounts.entries()].sort((x, y) => x[0] - y[0])) {
    const isTitleLevel = first?.kind === 'heading' && first.level === lvl && n === 1;
    if (!isTitleLevel && n >= 2) {
      sectionLevel = lvl;
      break;
    }
  }

  // Title: first heading (images may precede it), unless it belongs to the sections
  const ti = blocks.findIndex((b) => b.kind !== 'image');
  const tb = blocks[ti];
  if (tb?.kind === 'heading' && tb.level !== sectionLevel) {
    const taken = [tb];
    tb.el.classList.add('s-title');
    a.title.push(...withKicker(tb));
    a.titleLevel = tb.level;
    // A directly following, smaller, non-section heading is a subtitle
    const next = blocks[ti + 1];
    if (next?.kind === 'heading' && next.level > tb.level && next.level !== sectionLevel) {
      next.el.classList.add('s-subtitle');
      a.title.push(next.el);
      taken.push(next);
    }
    blocks = blocks.filter((b) => !taken.includes(b));
  }

  if (sectionLevel) {
    // Anything before the first section heading is intro
    for (; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'heading' && b.level === sectionLevel) break;
      if (b.kind === 'image') a.images.push(b.el);
      else a.intro.push(...withKicker(b));
    }
    for (; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'heading' && b.level === sectionLevel) {
        a.sections.push({ head: b.el, kicker: b.kicker ?? null, body: [], images: [] });
      } else {
        const sec = a.sections[a.sections.length - 1];
        if (b.kind === 'image') sec.images.push(b.el);
        else sec.body.push(...withKicker(b));
      }
    }
    return a;
  }

  for (; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'image') a.images.push(b.el);
    else a.text.push(...withKicker(b));
  }
  return a;
}

function textLength(els: HTMLElement[]): number {
  return els.reduce((n, e) => n + (e.textContent?.length ?? 0), 0);
}

/** The title heading itself (a.title also holds its kicker and subtitle). */
const titleOf = (a: Analysis) => a.title.find((e) => e.classList.contains('s-title')) ?? null;

function chooseLayout(a: Analysis, src: SlideSource): Layout {
  let hint = src.layoutHint;
  if (src.web) return 'web';
  if ((hint === 'timeline' || hint === 'cycle') && a.sections.length < 2) hint = undefined; // needs repeated headings
  if (hint === 'cycle' && a.sections.length > CYCLE_MAX) hint = 'columns';
  if (hint === 'number' && !a.title.length) hint = undefined;
  if (hint && (LAYOUTS as string[]).includes(hint)) return hint as Layout;
  const hasTitle = a.title.length > 0;
  const nImg = a.images.length;
  const nText = a.text.length + a.intro.length;

  if (a.sections.length >= 2) return 'columns';
  // A title that is only a figure ("$4.2M", "38% → 52%") is a big number,
  // except a lone year ("## 2026"), which reads as a section
  const t = titleOf(a)?.textContent?.trim() ?? '';
  if (hasTitle && !nImg && !a.sections.length && (isFigure(t) || growthOf(t)) && a.text.every((e) => e.tagName === 'P') && textLength(a.text) < 200) {
    const alone = !nText && a.title.length === 1 && !src.count && !src.meter;
    if (!(alone && /^\d{4}$/.test(t))) return 'number';
  }
  if (!hasTitle && !nText && !nImg) return 'blank';
  if (!nText && !nImg) return a.titleLevel === 1 || src.index === 0 ? 'cover' : 'section';
  if (nImg && !hasTitle && !nText) return nImg === 1 ? 'full' : 'gallery';
  if (nImg >= 1 && !nText && hasTitle) return nImg === 1 ? 'split' : 'gallery';
  if (nImg >= 1) return 'split';
  if (!hasTitle) {
    const only = a.text.length === 1 ? a.text[0] : null;
    const quote = (e?: HTMLElement) => e?.tagName === 'BLOCKQUOTE' && !e.classList.contains('s-callout');
    if (quote(only ?? undefined) || (a.text.length === 2 && quote(a.text[0]))) return 'quote';
    if (textLength(a.text) < 180 && a.text.every((e) => e.tagName === 'P')) return 'statement';
  }
  return 'content';
}

function el(tag: string, cls: string, children: (HTMLElement | null)[] = []): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

/** A section slide, for agendas: its title and where it is in the deck. */
export interface SectionEntry {
  title: string;
  index: number;
}

export interface RenderOptions {
  settings: Settings;
  deckTitle: string;
  total: number;
  /** The deck's section slides, for `// layout: agenda` */
  sections?: SectionEntry[];
}

export function renderSlide(src: SlideSource, opts: RenderOptions): HTMLElement {
  const { settings } = opts;
  const size = ASPECTS[settings.aspect];
  const html = md.render(prepare(src.visibleMd));
  const { blocks, foot } = extractLabels(toBlocks(html));
  const a = analyze(blocks);
  let layout = chooseLayout(a, src);
  // A timer alone is a statement-sized countdown
  if (src.timer && layout === 'blank') layout = 'statement';
  const portrait = size.h > size.w;
  const tooMany = src.layoutHint === 'cycle' && a.sections.length > CYCLE_MAX;

  // `// dark`, `// light` or `// invert` flips this one slide
  const flipped = settings.appearance === 'dark' ? 'light' : 'dark';
  const appearance = src.look === 'invert' ? flipped : (src.look ?? settings.appearance);
  const look: Settings = appearance === settings.appearance ? settings : { ...settings, appearance };

  const theme = getTheme(settings.theme);
  const classes = [
    'slide',
    `theme-${theme.id}`,
    `appearance-${appearance}`,
    `layout-${layout}`,
    layout === 'timeline' && 'layout-columns',
    portrait && 'is-portrait',
    a.imageFirst && 'media-first',
    src.imageFit === 'contain' && 'img-contain',
    (settings.align ?? theme.titleAlign) === 'center' && 'align-center',
    theme.headlineScale === 'uniform' && 'scale-uniform',
    tooMany && 'is-crowded',
    src.focus && 'has-focus',
  ].filter(Boolean);
  const slide = el('section', classes.join(' '));
  slide.style.width = `${size.w}px`;
  slide.style.height = `${size.h}px`;
  applyLook(slide, look, src.index);
  slide.dataset.index = String(src.index);
  slide.dataset.layout = layout;
  if (src.count) slide.dataset.count = src.count;

  const inner = el('div', 's-inner');
  slide.appendChild(inner);

  const head = a.title.length ? el('header', 's-head', a.title) : null;
  const media = (imgs: HTMLElement[]) => {
    if (!imgs.length) return null;
    const m = el('div', `s-media n-${Math.min(imgs.length, 6)}`, imgs);
    return m;
  };
  /** `// focus: 2`: is step i (0-based) one of the bright ones? */
  const lit = (i: number) => !src.focus || src.focus.includes(i + 1);
  // The text area, in slide pixels (for layouts drawn in JS: cycle, number rings)
  const [mx, my] = theme.margin;
  const innerW = size.w - mx * 2;
  const innerH = size.h - my * 2;
  const colW = (innerW - theme.gutter * 11) / 12;

  switch (layout) {
    case 'columns':
    case 'timeline': {
      if (head) inner.appendChild(head);
      if (a.intro.length || a.images.length) inner.appendChild(el('div', 's-intro', a.intro));
      const n = a.sections.length;
      const cols = el('div', `s-columns n-${Math.min(n, 6)}`);
      // Short numeric heads (0, 42%, $3M) read as figures: set them big
      const figure = (t: string) => t.length <= 6 && /\d/.test(t) && !/\s/.test(t);
      if (layout === 'columns' && a.sections.every((s) => figure(s.head?.textContent?.trim() ?? ''))) {
        cols.classList.add('is-figures');
        a.sections.forEach((s) => s.head && splitUnits(s.head));
      }
      a.sections.forEach((s, i) => {
        const sec = el('div', `s-section${lit(i) ? '' : ' is-dim'}`, [media(s.images), s.kicker, s.head, el('div', 's-section-body', s.body)]);
        cols.appendChild(sec);
      });
      inner.appendChild(cols);
      if (a.images.length) inner.appendChild(media(a.images)!);
      break;
    }
    case 'cycle': {
      // Landscape: title and intro on the left third, the loop beside them.
      // Portrait, or no title: the loop takes the width.
      const short = a.intro.length === 1 && a.intro[0].tagName === 'P' && textLength(a.intro) <= 48;
      if (head) inner.appendChild(head);
      if (a.intro.length && !short) inner.appendChild(el('div', 's-intro', a.intro));
      const side = !portrait && (head || (a.intro.length && !short));
      const box = side
        ? { x: mx + 4 * (colW + theme.gutter), y: my, w: innerW - 4 * (colW + theme.gutter), h: innerH }
        : portrait && head
          ? { x: mx, y: Math.round(size.h * 0.3), w: innerW, h: Math.round(size.h * 0.7) - my }
          : { x: mx, y: my, w: innerW, h: innerH };
      slide.classList.toggle('has-side', !!side);
      const steps = a.sections.map((s) => ({ head: s.head, kicker: s.kicker, body: s.body }));
      slide.appendChild(cycleDiagram(steps, box, { style: cycleStyle(theme.id), base: theme.base, focus: src.focus, center: short ? a.intro : undefined }));
      break;
    }
    case 'number': {
      // One figure, as big as it fits. A kicker above, a caption below.
      const title = titleOf(a);
      const growth = title ? growthOf(title.textContent ?? '') : null;
      let fig: Figure | null = null;
      if (title) {
        title.classList.add('s-number');
        if (growth) title.textContent = `${growth[1].prefix}${growth[1].num}${growth[1].suffix}`;
        fig = splitUnits(title, growth?.[0]);
      }
      const extra: HTMLElement[] = [];
      if (growth) {
        const [from, to] = growth;
        const sameUnit = from.prefix === to.prefix && from.suffix === to.suffix;
        let change = '';
        if (sameUnit && to.suffix.includes('%')) {
          const d = to.value - from.value;
          change = `${d >= 0 ? '+' : '−'}${formatLike(Math.abs(d), to)} pts `;
        } else if (sameUnit && from.value !== 0) {
          const pct = ((to.value - from.value) / Math.abs(from.value)) * 100;
          change = `${pct >= 0 ? '+' : '−'}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}% `;
        }
        const p = el('p', `s-number-from ${to.value >= from.value ? 'is-up' : 'is-down'}`);
        p.textContent = `${change}from ${from.prefix}${from.num}${from.suffix}`;
        extra.push(p);
      }
      const p = src.meter ? meterValue(fig) : null;
      const body = a.text.length ? el('div', 's-body', a.text) : null;
      if (p !== null && src.meter === 'ring' && title) {
        const d = Math.round(Math.min(innerH * 0.86, innerW * (portrait ? 0.92 : 0.46)));
        const ring = el('div', 's-meter is-ring', [ringSVG('s-meter-svg'), title]);
        ring.style.setProperty('--d', `${d}px`);
        ring.style.setProperty('--p', p.toFixed(4));
        ring.dataset.p = String(p);
        const rest = a.title.filter((e) => e !== title);
        inner.append(ring, el('div', 's-number-text', [...rest, ...extra, body]));
        slide.classList.add('has-ring');
      } else {
        if (head) inner.appendChild(head);
        inner.append(...extra);
        if (p !== null) {
          const bar = el('div', 's-meter is-bar', [el('div', 'm-fill')]);
          bar.style.setProperty('--p', p.toFixed(4));
          bar.dataset.p = String(p);
          inner.appendChild(bar);
        }
        if (body) inner.appendChild(body);
      }
      break;
    }
    case 'agenda': {
      if (head) inner.appendChild(head);
      // Your own list wins; otherwise the deck's section slides
      const list = a.text.find((e) => /^[OU]L$/.test(e.tagName));
      const own = list ? (Array.from(list.children) as HTMLElement[]).map((li) => li.innerHTML) : null;
      const sections = opts.sections ?? [];
      const items = own ?? sections.map((s) => escapeHTML(s.title));
      const others = a.text.filter((e) => e !== list);
      if (others.length) inner.appendChild(el('div', 's-intro', others));
      // Where are we? The next section after this slide is current; the ones before it are done.
      // An agenda before every section (the opening one) or after all of them highlights nothing.
      let current = -1;
      if (src.focus) current = src.focus[0] - 1;
      else if (!own) {
        const before = sections.filter((s) => s.index < src.index).length;
        if (before > 0 && before < sections.length) current = before;
      }
      if (items.length) {
        const ol = el('ol', `s-agenda n-${Math.min(items.length, 12)}${items.length > 6 ? ' is-long' : ''}${current >= 0 ? ' has-current' : ''}`);
        items.forEach((html, i) => {
          const li = el('li', `s-agenda-item${i === current ? ' is-current' : ''}${current >= 0 && i < current ? ' is-done' : ''}`);
          li.innerHTML = `<span class="s-agenda-num">${String(i + 1).padStart(2, '0')}</span><span class="s-agenda-title">${html}</span>`;
          ol.appendChild(li);
        });
        inner.appendChild(ol);
      } else {
        const p = el('p', 's-agenda-empty');
        p.textContent = 'Section slides (a heading on its own) are listed here.';
        inner.appendChild(p);
      }
      break;
    }
    case 'web': {
      const target = src.web ? webTarget(src.web) : null;
      const frame = el('div', 's-web');
      const poster = a.images[0]?.querySelector('img');
      if (poster) frame.appendChild(el('div', 's-web-poster', [poster]));
      const card = el('div', 's-web-card');
      const host = el('div', 's-web-host');
      const note = el('p', 's-web-note');
      if (target) {
        Object.assign(frame.dataset, { src: target.src, host: target.host });
        if (target.isolate) frame.dataset.isolate = '1';
        host.textContent = target.host;
        note.textContent = 'Live when presenting';
        const open = document.createElement('a');
        open.className = 's-web-open';
        open.href = target.url;
        open.textContent = 'Open in new tab ↗';
        card.append(host, note, open);
      } else {
        host.textContent = 'No page to show';
        note.textContent = 'Use a full address starting with https://';
        card.append(host, note);
      }
      frame.appendChild(card);
      const text = [...a.intro, ...a.text];
      if (!head && !text.length) {
        slide.classList.add('is-bleed');
        slide.insertBefore(frame, inner);
      } else {
        if (head) inner.appendChild(head);
        if (text.length) inner.appendChild(el('div', 's-body', text));
        const bar = el('div', 's-web-bar');
        bar.textContent = target?.host ?? '';
        frame.prepend(bar);
        inner.appendChild(frame);
      }
      break;
    }
    case 'split': {
      const textCol = el('div', 's-text', [head, a.intro.length || a.text.length ? el('div', 's-body', [...a.intro, ...a.text]) : null]);
      inner.appendChild(textCol);
      const m = media(a.images);
      if (m) {
        m.classList.add('s-bleed');
        slide.appendChild(m);
      }
      break;
    }
    case 'full': {
      const m = media(a.images);
      if (m) {
        m.classList.add('s-full');
        slide.insertBefore(m, inner);
      }
      if (head || a.text.length) {
        slide.classList.add('has-overlay');
        inner.appendChild(el('div', 's-overlay', [head, a.text.length ? el('div', 's-body', a.text) : null]));
      }
      break;
    }
    case 'gallery': {
      if (head) inner.appendChild(head);
      if (a.text.length) inner.appendChild(el('div', 's-body', a.text));
      const m = media(a.images);
      if (m) inner.appendChild(m);
      break;
    }
    default: {
      if (head) inner.appendChild(head);
      let body = [...a.intro, ...a.text];
      // Paragraphs leading into one list: group the lede so themes can set it beside the list
      const last = body[body.length - 1];
      if (layout === 'content' && body.length >= 2 && /^[OU]L$/.test(last.tagName) && body.slice(0, -1).every((e) => e.tagName === 'P')) {
        body = [el('div', 's-lede', body.slice(0, -1)), last];
      }
      if (body.length) inner.appendChild(el('div', 's-body', body));
      if (a.images.length) inner.appendChild(media(a.images)!);
    }
  }

  if (src.chart) drawChart(inner, src.chart, size.w - theme.margin[0] * 2, Math.round(size.h * (portrait ? 0.34 : 0.5)), Math.round(Math.max(22, theme.base * 0.6)));
  if (src.timer) addTimer(slide, inner, src.timer, layout, innerH);

  if (foot.length) {
    const target = slide.querySelector<HTMLElement>('.s-text, .s-overlay, .s-number-text') ?? inner;
    target.appendChild(el('footer', 's-footnotes', foot));
  }

  if (layout === 'statement' && textLength(a.text) <= 64) slide.classList.add('is-short');

  markHanging(inner);

  // Quote attribution: a trailing paragraph starting with a dash
  if (layout === 'quote') {
    const last = inner.querySelector('.s-body > p:last-child');
    if (last && /^[—–-]\s?/.test(last.textContent ?? '')) last.classList.add('s-cite');
  }

  if (layout !== 'cover' && layout !== 'full' && !slide.classList.contains('is-bleed')) {
    const ctx = { title: settings.short || opts.deckTitle, index: src.index, total: opts.total };
    const header = chrome('s-header', settings.header ?? theme.header, ctx);
    const footer = chrome('s-foot', settings.footer ?? theme.footer, ctx);
    if (header) slide.appendChild(header);
    if (footer) slide.appendChild(footer);
  }

  // Links in slides open in a new tab
  slide.querySelectorAll('a').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });

  return slide;
}

const escapeHTML = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Layouts where a timer is the point of the slide; elsewhere a bar timer keeps quiet. */
const TIMER_SLIDES = new Set(['statement', 'section', 'cover', 'blank']);

/**
 * `// timer:` digits, plus a ring around them or a bar along the bottom edge.
 * On a slide with other content, a bar timer sets its digits small, beside the bar.
 */
function addTimer(slide: HTMLElement, inner: HTMLElement, timer: NonNullable<SlideSource['timer']>, layout: Layout, innerH: number): void {
  const t = el('div', `s-timer is-${timer.style}`);
  const seconds = timer.until !== undefined ? secondsUntil(timer.until) : timer.seconds!;
  if (timer.until !== undefined) t.dataset.until = String(timer.until);
  else t.dataset.seconds = String(timer.seconds);
  if (timer.next) t.dataset.next = '1';
  const digits = el('span', 's-timer-digits');
  digits.textContent = formatTimer(seconds);
  t.appendChild(digits);
  slide.classList.add('has-timer');
  if (timer.style === 'ring') {
    t.prepend(ringSVG('s-timer-ring'));
    t.style.setProperty('--p', '1');
    // Alone, the ring is the slide; with a title or text, it sits beside them (below, in portrait)
    const alone = !inner.children.length;
    const portrait = slide.classList.contains('is-portrait');
    const width = parseFloat(slide.style.width);
    t.style.setProperty('--d', `${Math.round(alone ? innerH * 0.86 : portrait ? width * 0.62 : Math.min(innerH * 0.8, width * 0.4))}px`);
    slide.classList.add(alone ? 'timer-alone' : 'timer-beside');
    inner.appendChild(t);
    return;
  }
  if (timer.style === 'bar') {
    const bar = el('div', 's-timer-bar', [el('div', 'm-fill')]);
    bar.style.setProperty('--p', '1');
    slide.appendChild(bar);
    if (!TIMER_SLIDES.has(layout)) {
      t.classList.add('is-quiet');
      slide.appendChild(t);
      return;
    }
  }
  (inner.querySelector('.s-body') ?? inner).appendChild(t);
}

/** Seconds from now until a clock time (minutes after midnight); a time long gone means tomorrow. */
function secondsUntil(minutes: number, now = new Date()): number {
  const at = new Date(now);
  at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  let s = (at.getTime() - now.getTime()) / 1000;
  if (s < -12 * 3600) s += 24 * 3600;
  return Math.max(0, s);
}

/** The first table on the slide becomes a chart; its caption stays above it. */
function drawChart(inner: HTMLElement, kind: 'bar' | 'line', width: number, height: number, label: number): void {
  const table = inner.querySelector('table');
  if (!table) return;
  const svg = chartSVG(table, kind, width, height, label);
  if (!svg) return;
  const fig = el('figure', `s-chart is-${kind}`);
  const caption = table.querySelector('caption')?.textContent?.trim();
  if (caption) {
    const cap = el('figcaption', 's-chart-caption');
    cap.textContent = caption;
    fig.appendChild(cap);
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = svg;
  fig.appendChild(tpl.content);
  table.replaceWith(fig);
}

/** 300 → "5:00" */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* ------------------------------------------------------------------ */
/* Activate: what runs only while a slide is presented                 */
/* ------------------------------------------------------------------ */

export interface ActivateOptions {
  /** When the slide was first shown (performance.now()); timers carry on from there through edits */
  start?: number;
  /** Play entrance motion (`// count`). Off when the same slide is only re-rendered. */
  animate?: boolean;
  /** A `// timer: … next` reached zero */
  onDone?: () => void;
  /** Webviews: load the page, ask first (shared decks), or keep the placeholder */
  web?: 'live' | 'ask' | 'off';
}

/**
 * Everything on a slide that moves runs from here, and only on the slide
 * being presented (the Stage and the presenter window's current slide).
 * Every other copy (preview, strip, overview, theme previews, print) keeps
 * the still end state: final numbers, full rings, webview placeholders.
 * Returns a function that stops it all.
 */
export function activate(slide: HTMLElement, opts: ActivateOptions = {}): () => void {
  const stops: (() => void)[] = [];
  const still = reducedMotion();
  stops.push(runTimers(slide, opts.start ?? performance.now(), opts.onDone));
  if (opts.animate && !still && slide.dataset.count) stops.push(runCount(slide, slide.dataset.count as 'count' | 'roll'));
  if (opts.web && opts.web !== 'off') hydrateWeb(slide, opts.web === 'ask');
  return () => stops.forEach((s) => s());
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Countdowns. Digits tick four times a second; rings and bars move every
 * frame. A timer that was running when its slide came up can advance the
 * deck at zero (`next`); one that was already at zero never does, so you
 * can always go back to it.
 */
function runTimers(slide: HTMLElement, start: number, onDone?: () => void): () => void {
  const timers = Array.from(slide.querySelectorAll<HTMLElement>('.s-timer'));
  if (!timers.length) return () => {};
  const bar = slide.querySelector<HTMLElement>('.s-timer-bar');
  // Wall-clock time of `start`, for "until 14:45"
  const startWall = Date.now() - (performance.now() - start);
  const state = timers.map((t) => {
    const until = t.dataset.until;
    const end = until !== undefined ? startWall + secondsUntil(Number(until), new Date(startWall)) * 1000 : startWall + Number(t.dataset.seconds) * 1000;
    const total = Math.max(1, (end - startWall) / 1000);
    const left0 = (end - Date.now()) / 1000;
    return { t, end, total, armed: left0 > 0 && t.dataset.next === '1', digits: t.querySelector('.s-timer-digits') ?? t, shown: '' };
  });
  let doneTimer = 0;
  const tick = (frame: boolean) => {
    for (const s of state) {
      const left = (s.end - Date.now()) / 1000;
      const p = Math.max(0, Math.min(1, left / s.total)).toFixed(4);
      s.t.style.setProperty('--p', p);
      if (bar) bar.style.setProperty('--p', p);
      if (frame) continue;
      const text = formatTimer(left);
      if (text !== s.shown) s.digits.textContent = s.shown = text;
      s.t.classList.toggle('is-done', left <= 0);
      if (left <= 0 && s.armed && onDone) {
        s.armed = false;
        // A moment on 0:00 before moving on
        doneTimer = window.setTimeout(onDone, 600);
      }
    }
  };
  tick(false);
  const id = window.setInterval(() => tick(false), 250);
  let raf = 0;
  const smooth = !reducedMotion() && (bar || slide.querySelector('.s-timer-ring'));
  const loop = () => {
    tick(true);
    raf = requestAnimationFrame(loop);
  };
  if (smooth) raf = requestAnimationFrame(loop);
  return () => {
    clearInterval(id);
    cancelAnimationFrame(raf);
    clearTimeout(doneTimer);
  };
}

const COUNT_MS = 1600;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);

/**
 * `// count`: figures count up from zero (or from the first value of
 * "$2.9M → $4.2M"), keeping their decimals and separators. Meters fill in step.
 * `// count: roll`: each digit rolls into place like an odometer.
 */
function runCount(slide: HTMLElement, mode: 'count' | 'roll'): () => void {
  const nums = Array.from(slide.querySelectorAll<HTMLElement>('.s-num[data-value]'));
  const meters = Array.from(slide.querySelectorAll<HTMLElement>('.s-meter[data-p]'));
  if (!nums.length) return () => {};
  if (mode === 'roll') return rollDigits(nums, meters);
  const items = nums.map((e) => {
    const fmt = { decimals: Number(e.dataset.decimals), group: e.dataset.group ?? '', dec: e.dataset.dec || '.' };
    const to = Number(e.dataset.value);
    const from = Number(e.dataset.from ?? 0);
    // Hold the final width so the unit after the number doesn't jitter
    e.style.minWidth = `${e.offsetWidth}px`;
    return { e, fmt, to, from, final: e.textContent ?? '' };
  });
  const mfrom = meters.map((m) => {
    const p = Number(m.dataset.p);
    const n = items[0];
    // A meter starts where its number starts
    return n && n.to ? Math.max(0, Math.min(1, p * (n.from / n.to))) : 0;
  });
  const t0 = performance.now();
  let raf = 0;
  const frame = () => {
    const k = Math.min(1, (performance.now() - t0) / COUNT_MS);
    const x = easeOut(k);
    for (const it of items) it.e.textContent = k >= 1 ? it.final : formatLike(it.from + (it.to - it.from) * x, it.fmt);
    meters.forEach((m, i) => m.style.setProperty('--p', (mfrom[i] + (Number(m.dataset.p) - mfrom[i]) * x).toFixed(4)));
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

function rollDigits(nums: HTMLElement[], meters: HTMLElement[]): () => void {
  nums.forEach((e) => {
    const final = e.textContent ?? '';
    e.setAttribute('aria-label', final);
    const digits = [...final].filter((c) => /\d/.test(c)).length;
    let d = 0;
    e.replaceChildren(
      ...[...final].map((c) => {
        if (!/\d/.test(c)) {
          const s = document.createElement('span');
          s.className = 's-reel-char';
          s.textContent = c;
          return s;
        }
        const reel = document.createElement('span');
        reel.className = 's-reel';
        // The hidden digit sets the reel's size; the strip of 21 digits rolls over it, ending on it
        const ghost = document.createElement('span');
        ghost.className = 's-reel-ghost';
        ghost.textContent = c;
        const strip = document.createElement('span');
        strip.className = 's-reel-strip';
        strip.setAttribute('aria-hidden', 'true');
        for (const ch of '0123456789'.repeat(2) + c) {
          const s = document.createElement('span');
          s.textContent = ch;
          strip.appendChild(s);
        }
        // Earlier digits spin a little longer, so the number settles right to left like a counter
        strip.style.setProperty('--d', `${(digits - d) * 90}ms`);
        d++;
        reel.append(ghost, strip);
        return reel;
      }),
    );
  });
  meters.forEach((m) => m.style.setProperty('--p', '0'));
  // Next frame: let the strips start at 0, then roll them to their digit
  const raf = requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      nums.forEach((e) => e.classList.add('is-rolling'));
      meters.forEach((m) => {
        m.classList.add('is-filling');
        m.style.setProperty('--p', m.dataset.p ?? '0');
      });
    }),
  );
  return () => cancelAnimationFrame(raf);
}

/**
 * Webviews: swap each placeholder for the live page, behind a shield that
 * keeps clicks and keys for the slides (Stage lifts it with I).
 * `ask`: show a button first (decks opened from a shared link).
 */
function hydrateWeb(slide: HTMLElement, ask: boolean): void {
  slide.querySelectorAll<HTMLElement>('.s-web[data-src]').forEach((box) => {
    const { src, host, isolate } = box.dataset as { src: string; host: string; isolate?: string };
    const load = () => {
      box.querySelector('.s-web-frame')?.remove();
      box.appendChild(webFrame(src, host, isolate === '1'));
      const shield = el('div', 's-web-shield');
      const hint = el('span', 's-web-hint');
      hint.textContent = 'Press I to use the page';
      shield.appendChild(hint);
      box.appendChild(shield);
      box.classList.add('is-live');
    };
    if (!ask) return load();
    const card = box.querySelector('.s-web-card');
    const btn = document.createElement('button');
    btn.className = 's-web-load';
    btn.type = 'button';
    btn.textContent = `Load ${host}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      load();
    });
    card?.querySelector('.s-web-note')?.replaceChildren(document.createTextNode('This deck came from a link. Load the page?'));
    card?.appendChild(btn);
  });
}

/* ------------------------------------------------------------------ */
/* Look: palette (resolved per slide), font and size overrides         */
/* ------------------------------------------------------------------ */

function applyLook(slide: HTMLElement, settings: Settings, index: number): void {
  const theme = getTheme(settings.theme);
  const dark = settings.appearance === 'dark' ? 1 : 0;
  const base: Palette = theme[settings.appearance];
  const pick = (override: [string | null, string | null], fallback: string) => override[dark] ?? fallback;
  const bodyValue = pick(settings.bodyColor, base.fg);
  const values: Record<string, string> = {
    bg: pick(settings.background, base.bg),
    fg: bodyValue,
    title: pick(settings.titleColor, settings.bodyColor[dark] ? bodyValue : (base.title ?? base.fg)),
    muted: base.muted,
    accent: base.accent,
    rule: base.rule,
    surface: base.surface,
  };
  const st = slide.style;
  // Backgrounds that change color every slide: charts switch to shades of the text color
  slide.classList.toggle('bg-pattern', values.bg.startsWith('pattern:'));
  for (const [k, v] of Object.entries(values)) {
    const { color, image } = resolveColor(v, index);
    st.setProperty(`--${k}`, color);
    if (k === 'bg') st.setProperty('--bg-image', image);
  }
  const tf = getTypeface(settings.titleFont ?? undefined);
  if (tf) {
    st.setProperty('--font-display', tf.stack);
    st.setProperty('--display-weight', String(tf.titleWeight));
    st.setProperty('--display-tracking', tf.titleTracking);
    st.setProperty('--display-variation', 'normal');
  }
  const bf = getTypeface(settings.bodyFont ?? undefined);
  if (bf) {
    st.setProperty('--font-body', bf.stack);
    st.setProperty('--body-weight', String(bf.bodyWeight));
  }
  st.setProperty('--size-k', String(SIZE_SCALE[settings.size] ?? 1));

  // Type controls (front matter: contrast, leading, weight, labels, numerals)
  const setVars = (vars: string[]) => vars.forEach((v) => {
    const i = v.indexOf(':');
    st.setProperty(v.slice(0, i), v.slice(i + 1));
  });
  if (settings.contrast && settings.contrast !== 'standard') {
    const k = settings.contrast === 'subtle' ? 0.7 : 1.3;
    setVars(stepVars(theme, 1 + (theme.ratio - 1) * k));
  }
  if (settings.leading && settings.leading !== 'normal') {
    const lead = theme.bodyLeading + (settings.leading === 'tight' ? -0.12 : 0.14);
    st.setProperty('--body-leading', String(Math.max(1.15, Math.round(lead * 100) / 100)));
  }
  if (settings.weight) {
    const face = getTypeface(settings.titleFont ?? theme.display);
    const [lo, hi] = face?.weights ?? [100, 900];
    const want = { light: 300, regular: 430, bold: 720 }[settings.weight];
    st.setProperty('--display-weight', String(Math.min(hi, Math.max(lo, want))));
  }
  if (settings.labels) {
    setVars(labelVars(settings.labels === 'caps' ? 'uppercase' : settings.labels === 'small-caps' ? 'small-caps' : 'none'));
    if (settings.labels === 'normal') st.setProperty('--label-tracking', '0.01em');
    else if (theme.labelCase === 'none') st.setProperty('--label-tracking', '0.08em');
  }
  if (settings.numerals) {
    st.setProperty('--numerals', settings.numerals === 'oldstyle' ? 'oldstyle-nums proportional-nums' : 'lining-nums proportional-nums');
  }
}

/* ------------------------------------------------------------------ */
/* Header and footer slots                                             */
/* Templates: {title} {number} {count} {date}, anything else is text.   */
/* ------------------------------------------------------------------ */

export const SLOT_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Nothing' },
  { value: '{title}', label: 'Deck title' },
  { value: '{number}', label: 'Slide number' },
  { value: '{count}', label: 'Slide number of total' },
  { value: '{date}', label: 'Date' },
];

export function fillSlot(tpl: string, ctx: { title: string; index: number; total: number }): string {
  return tpl
    .replace(/\{title\}/g, ctx.title)
    .replace(/\{number\}/g, String(ctx.index + 1).padStart(2, '0'))
    .replace(/\{count\}/g, `${ctx.index + 1} / ${ctx.total}`)
    .replace(/\{date\}/g, new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
}

function chrome(cls: string, slots: string[], ctx: { title: string; index: number; total: number }): HTMLElement | null {
  if (!slots.some(Boolean)) return null;
  const bar = el('div', `s-chrome ${cls}`);
  slots.slice(0, 3).forEach((tpl, i) => {
    const span = el('span', `s-slot s-slot-${['left', 'center', 'right'][i]}${tpl.trim() === '{number}' ? ' is-number' : ''}`);
    span.textContent = fillSlot(tpl, ctx);
    bar.appendChild(span);
  });
  return bar;
}

/* ------------------------------------------------------------------ */
/* Fit-to-slide: steps the type scale down until nothing overflows.    */
/* ------------------------------------------------------------------ */

const FIT_STEPS = [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6, 0.55];

function overflows(slide: HTMLElement): boolean {
  const inner = slide.querySelector<HTMLElement>('.s-inner');
  if (!inner) return false;
  // Children overflow into the container's scrollable area (glyph overhang from
  // tight display leading is ignored by only measuring the container).
  if (inner.scrollHeight > inner.clientHeight + 2 || inner.scrollWidth > inner.clientWidth + 2) return true;
  // A cycle's labels sit around the loop: each must stay inside the loop's box
  const cycle = slide.querySelector<HTMLElement>('.s-cycle');
  if (cycle) {
    const b = cycle.getBoundingClientRect();
    for (const l of Array.from(cycle.querySelectorAll<HTMLElement>('.s-cycle-step, .s-cycle-center'))) {
      const r = l.getBoundingClientRect();
      if (r.left < b.left - 2 || r.right > b.right + 2 || r.top < b.top - 2 || r.bottom > b.bottom + 2) return true;
    }
  }
  return false;
}

let measureHost: HTMLElement | null = null;

function host(): HTMLElement {
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
    document.body.appendChild(measureHost);
  }
  return measureHost;
}

export function fit(slide: HTMLElement): void {
  const h = host();
  h.appendChild(slide);
  slide.style.setProperty('--fit', '1');
  fitFigures(slide);
  fitCode(slide);
  let step = 1;
  for (step of FIT_STEPS) {
    slide.style.setProperty('--fit', String(step));
    if (!overflows(slide)) break;
  }
  if (step === 1) grow(slide);
  fitNumber(slide);
  // Still too much at the smallest step (or a cycle with too many steps): the editor and strip flag it
  if (overflows(slide) || slide.classList.contains('is-crowded')) slide.dataset.overflow = '1';
  else delete slide.dataset.overflow;
  hang(slide);
  trimSlots(slide);
  h.removeChild(slide);
}

/** Layouts whose body text may grow when the slide is mostly empty. */
const GROWS = new Set(['content', 'columns', 'split']);
const GROW_STEPS = [1.24, 1.16, 1.08];

/** How much of the text area the content fills, 0..1. */
function fill(slide: HTMLElement): number {
  const inner = slide.querySelector<HTMLElement>('.s-inner');
  if (!inner) return 1;
  const cs = getComputedStyle(inner);
  const pt = parseFloat(cs.paddingTop);
  const avail = inner.clientHeight - pt - parseFloat(cs.paddingBottom);
  let top = Infinity;
  let bottom = 0;
  // offsetTop is relative to .s-inner, the nearest positioned ancestor
  const measure = (e: HTMLElement) => {
    top = Math.min(top, e.offsetTop);
    bottom = Math.max(bottom, e.offsetTop + e.offsetHeight);
  };
  for (const child of Array.from(inner.children) as HTMLElement[]) {
    // Columns stretch to the bottom of the slide: measure the sections inside
    if (child.classList.contains('s-columns')) (Array.from(child.children) as HTMLElement[]).forEach(measure);
    else measure(child);
  }
  return avail > 0 && top < Infinity ? (bottom - top) / avail : 1;
}

/**
 * Sparse slides: when the content uses less than half the height, body text
 * steps up (titles stay put, so they match from slide to slide).
 */
function grow(slide: HTMLElement): void {
  slide.style.removeProperty('--grow');
  if (!GROWS.has(slide.dataset.layout ?? '') || slide.querySelector('.is-figures, .s-chart, .s-timer') || fill(slide) > 0.5) return;
  for (const g of GROW_STEPS) {
    slide.style.setProperty('--grow', String(g));
    fitCode(slide);
    if (!overflows(slide) && fill(slide) <= 0.8) return;
  }
  slide.style.removeProperty('--grow');
  fitCode(slide);
}

/**
 * All big figures on a slide share one size: the largest at which the widest fits.
 * A big-number slide's figure works the same way, on its own.
 */
function fitNumber(slide: HTMLElement): void {
  const big = slide.querySelector<HTMLElement>('.s-number');
  if (!big) return;
  big.style.removeProperty('--num-k');
  const box = big.parentElement!;
  // Inside a ring, the figure has the ring's inner width to itself
  const room = box.classList.contains('is-ring') ? box.clientWidth * 0.72 : big.clientWidth;
  if (big.scrollWidth > room + 1) big.style.setProperty('--num-k', ((room / big.scrollWidth) * 0.98).toFixed(3));
}

function fitFigures(slide: HTMLElement): void {
  fitNumber(slide);
  const heads = slide.querySelectorAll<HTMLElement>('.is-figures .s-section > :is(h1, h2, h3, h4, h5, h6)');
  if (!heads.length) return;
  const cols = heads[0].closest<HTMLElement>('.s-columns')!;
  cols.style.removeProperty('--fig-k');
  let k = 1;
  heads.forEach((e) => {
    if (e.scrollWidth > e.clientWidth + 1) k = Math.min(k, e.clientWidth / e.scrollWidth);
  });
  if (k < 1) cols.style.setProperty('--fig-k', (k * 0.98).toFixed(3));
}

/** Code shrinks (to 60%) to keep its lines whole; past that it wraps. */
function fitCode(slide: HTMLElement): void {
  slide.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    pre.style.removeProperty('--code-k');
    pre.classList.remove('is-wrapped');
    const ratio = pre.clientWidth && pre.scrollWidth > pre.clientWidth + 1 ? (pre.clientWidth - 2) / pre.scrollWidth : 1;
    if (ratio >= 1) return;
    // The padding doesn't shrink with the text, so aim a little lower
    const k = Math.max(0.6, ratio * 0.96);
    pre.style.setProperty('--code-k', k.toFixed(3));
    if (pre.scrollWidth > pre.clientWidth + 1) pre.classList.add('is-wrapped');
  });
}

/** Pull each hanging mark left by its own width (in em, so it scales). */
function hang(slide: HTMLElement): void {
  slide.querySelectorAll<HTMLElement>('.s-hang').forEach((s) => {
    const parent = s.parentElement!;
    if (getComputedStyle(parent.closest('h1, h2, h3, h4, p, li') ?? parent).textAlign === 'center') {
      s.style.marginLeft = '';
      return;
    }
    const size = parseFloat(getComputedStyle(s).fontSize) || 1;
    s.style.marginLeft = `${(-s.getBoundingClientRect().width / size).toFixed(3)}em`;
  });
}

/** Header and footer text that doesn't fit is cut at the last whole word. */
function trimSlots(slide: HTMLElement): void {
  slide.querySelectorAll<HTMLElement>('.s-slot').forEach((slot) => {
    const full = slot.dataset.full ?? slot.textContent ?? '';
    slot.dataset.full = full;
    slot.textContent = full;
    if (slot.scrollWidth <= slot.clientWidth + 1) return;
    const words = full.split(/\s+/);
    while (words.length > 1) {
      words.pop();
      slot.textContent = `${words.join(' ').replace(/[\s,;:.–—-]+$/, '')}…`;
      if (slot.scrollWidth <= slot.clientWidth + 1) return;
    }
  });
}

export function renderDeck(slides: SlideSource[], opts: Omit<RenderOptions, 'total'>): HTMLElement[] {
  const render = (s: SlideSource, sections?: SectionEntry[]) => {
    const node = renderSlide(s, { ...opts, total: slides.length, sections });
    fit(node);
    return node;
  };
  // Agendas list the section slides, so they're made after everything else
  const nodes: (HTMLElement | null)[] = slides.map((s) => (isAgenda(s) ? null : render(s)));
  const sections = sectionList(nodes);
  const done = nodes.map((n, i) => n ?? render(slides[i], sections));
  numberSections(done);
  return done;
}

/** Agendas need the deck's sections before they can be made. */
export const isAgenda = (s: SlideSource) => s.layoutHint === 'agenda' && !s.web;

/**
 * The deck's section slides, in order, from rendered slides (null: not made yet).
 * Breaks (a section with a timer) and a closing slide ("Thanks", "Questions") aren't topics.
 */
export function sectionList(nodes: (HTMLElement | null)[]): SectionEntry[] {
  const out: SectionEntry[] = [];
  nodes.forEach((n, i) => {
    if (n?.dataset.layout !== 'section' || n.classList.contains('has-timer') || (i === nodes.length - 1 && i > 0)) return;
    const title = n.querySelector('.s-title')?.textContent?.trim();
    if (title) out.push({ title, index: i });
  });
  return out;
}

/** Give each section slide its ordinal (`--section`), for themes that show it. */
export function numberSections(slides: HTMLElement[]): void {
  let n = 0;
  for (const s of slides) {
    if (s.dataset.layout === 'section') s.style.setProperty('--section', String(++n));
  }
}

/** Put a logical-size slide inside a frame and scale it to the frame's width. */
export function mount(frame: HTMLElement, slide: HTMLElement, settings: Settings): void {
  const size = ASPECTS[settings.aspect];
  frame.replaceChildren(slide);
  frame.style.aspectRatio = `${size.w} / ${size.h}`;
  frame.style.setProperty('--slide-w', String(size.w));
  slide.style.transformOrigin = '0 0';
  const apply = () => {
    const w = frame.clientWidth;
    if (w) slide.style.transform = `scale(${w / size.w})`;
  };
  apply();
  const ro = (frame as any).__ro as ResizeObserver | undefined;
  ro?.disconnect();
  const obs = new ResizeObserver(apply);
  obs.observe(frame);
  (frame as any).__ro = obs;
}

/** Scale to fit inside a box (both dimensions), centered. Used for fullscreen. */
export function mountContain(box: HTMLElement, slide: HTMLElement, settings: Settings): void {
  const size = ASPECTS[settings.aspect];
  box.replaceChildren(slide);
  slide.style.position = 'absolute';
  slide.style.transformOrigin = '0 0';
  const apply = () => {
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const s = Math.min(bw / size.w, bh / size.h);
    const x = (bw - size.w * s) / 2;
    const y = (bh - size.h * s) / 2;
    slide.style.left = '0';
    slide.style.top = '0';
    slide.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  apply();
  const ro = (box as any).__ro as ResizeObserver | undefined;
  ro?.disconnect();
  const obs = new ResizeObserver(apply);
  obs.observe(box);
  (box as any).__ro = obs;
}

export function renderNotes(notesMd: string): string {
  return md.render(prepare(notesMd));
}
