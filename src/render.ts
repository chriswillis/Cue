import { md, prepare } from './markdown';
import { SIZE_SCALE, type Settings, type SlideSource } from './parser';
import { getTheme, type Palette } from './themes';
import { getTypeface } from './typefaces';
import { resolveColor } from './flexoki';

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
  | 'blank';

export const LAYOUTS: Layout[] = ['cover', 'section', 'content', 'statement', 'quote', 'split', 'columns', 'timeline', 'gallery', 'full'];

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

function wrapImage(img: HTMLImageElement): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 's-figure';
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

function chooseLayout(a: Analysis, hint: string | undefined, index: number): Layout {
  if (hint === 'timeline' && a.sections.length < 2) hint = undefined; // needs repeated headings
  if (hint && (LAYOUTS as string[]).includes(hint)) return hint as Layout;
  const hasTitle = a.title.length > 0;
  const nImg = a.images.length;
  const nText = a.text.length + a.intro.length;

  if (a.sections.length >= 2) return 'columns';
  if (!hasTitle && !nText && !nImg) return 'blank';
  if (!nText && !nImg) return a.titleLevel === 1 || index === 0 ? 'cover' : 'section';
  if (nImg && !hasTitle && !nText) return nImg === 1 ? 'full' : 'gallery';
  if (nImg >= 1 && !nText && hasTitle) return nImg === 1 ? 'split' : 'gallery';
  if (nImg >= 1) return 'split';
  if (!hasTitle) {
    const only = a.text.length === 1 ? a.text[0] : null;
    if (only?.tagName === 'BLOCKQUOTE' || (a.text.length === 2 && a.text[0].tagName === 'BLOCKQUOTE')) return 'quote';
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

export interface RenderOptions {
  settings: Settings;
  deckTitle: string;
  total: number;
}

export function renderSlide(src: SlideSource, opts: RenderOptions): HTMLElement {
  const { settings } = opts;
  const size = ASPECTS[settings.aspect];
  const html = md.render(prepare(src.visibleMd));
  const { blocks, foot } = extractLabels(toBlocks(html));
  const a = analyze(blocks);
  const layout = chooseLayout(a, src.layoutHint, src.index);
  const portrait = size.h > size.w;

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
    theme.titleAlign === 'center' && 'align-center',
    theme.headlineScale === 'uniform' && 'scale-uniform',
  ].filter(Boolean);
  const slide = el('section', classes.join(' '));
  slide.style.width = `${size.w}px`;
  slide.style.height = `${size.h}px`;
  applyLook(slide, look, src.index);
  slide.dataset.index = String(src.index);
  slide.dataset.layout = layout;

  const inner = el('div', 's-inner');
  slide.appendChild(inner);

  const head = a.title.length ? el('header', 's-head', a.title) : null;
  const media = (imgs: HTMLElement[]) => {
    if (!imgs.length) return null;
    const m = el('div', `s-media n-${Math.min(imgs.length, 6)}`, imgs);
    return m;
  };

  switch (layout) {
    case 'columns':
    case 'timeline': {
      if (head) inner.appendChild(head);
      if (a.intro.length || a.images.length) inner.appendChild(el('div', 's-intro', a.intro));
      const n = a.sections.length;
      const cols = el('div', `s-columns n-${Math.min(n, 6)}`);
      // Short numeric heads (0, 42%, $3M) read as figures: set them big
      const figure = (t: string) => t.length <= 6 && /\d/.test(t) && !/\s/.test(t);
      if (layout === 'columns' && a.sections.every((s) => figure(s.head?.textContent?.trim() ?? ''))) cols.classList.add('is-figures');
      a.sections.forEach((s) => {
        const sec = el('div', 's-section', [media(s.images), s.kicker, s.head, el('div', 's-section-body', s.body)]);
        cols.appendChild(sec);
      });
      inner.appendChild(cols);
      if (a.images.length) inner.appendChild(media(a.images)!);
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

  if (foot.length) {
    const target = slide.querySelector<HTMLElement>('.s-text, .s-overlay') ?? inner;
    target.appendChild(el('footer', 's-footnotes', foot));
  }

  if (layout === 'statement' && textLength(a.text) <= 64) slide.classList.add('is-short');

  // Quote attribution: a trailing paragraph starting with a dash
  if (layout === 'quote') {
    const last = inner.querySelector('.s-body > p:last-child');
    if (last && /^[—–-]\s?/.test(last.textContent ?? '')) last.classList.add('s-cite');
  }

  if (layout !== 'cover' && layout !== 'full') {
    const ctx = { title: opts.deckTitle, index: src.index, total: opts.total };
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
  return inner.scrollHeight > inner.clientHeight + 2 || inner.scrollWidth > inner.clientWidth + 2;
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
  for (const step of FIT_STEPS) {
    slide.style.setProperty('--fit', String(step));
    if (!overflows(slide)) break;
  }
  h.removeChild(slide);
}

export function renderDeck(slides: SlideSource[], opts: Omit<RenderOptions, 'total'>): HTMLElement[] {
  const nodes = slides.map((s) => {
    const node = renderSlide(s, { ...opts, total: slides.length });
    fit(node);
    return node;
  });
  numberSections(nodes);
  return nodes;
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
