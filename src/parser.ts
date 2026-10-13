/**
 * Turns a markdown script into a list of slides.
 *
 * Rules (modeled on how iA Presenter reads text):
 *   ---            on its own line starts a new slide
 *   # Heading      headings always show on the slide
 *   <tab>text      lines starting with a tab show on the slide
 *   ![](image)     images on their own line show on the slide
 *   ``` / |table|  fenced code and tables show on the slide
 *   // comment     hidden everywhere; `// layout: split` picks a layout
 *   anything else  speaker notes, only visible to the presenter
 *
 * A YAML-ish front matter block at the very top stores deck settings.
 */

/*
 * The parser runs on every keystroke (inside the editor state, see
 * editor.ts), so it's a single fast pass over the lines with no markdown
 * parsing: it only decides, line by line, which role a line has and which
 * slide it belongs to. Real markdown rendering happens later, per slide.
 *
 * TO ADD A SLIDE DIRECTIVE like `// dark`: add a regex next to RE_LAYOUT,
 * read it in the comment branch of parse(), store it on SlideSource and use
 * it in render.ts.
 * TO ADD A SETTING: add it to Settings and DEFAULTS, then read/write it in
 * toSettings() and serializeFrontMatter(). Only non-default values are written.
 */

import { THEME_ALIASES } from './themes';
import { withoutCharts } from './datatype';

export type LineRole =
  | 'frontmatter'
  | 'separator'
  | 'heading'
  | 'visible'
  | 'image'
  | 'code'
  | 'note'
  | 'comment'
  | 'blank';

export type Size = 'S' | 'M' | 'L' | 'XL';
/** Type controls. null everywhere means "the theme's own choice". */
export type Contrast = 'subtle' | 'standard' | 'dramatic';
export type Leading = 'tight' | 'normal' | 'loose';
export type TitleWeight = 'light' | 'regular' | 'bold';
export type Align = 'start' | 'center';
export type Labels = 'caps' | 'small-caps' | 'normal';
export type Numerals = 'lining' | 'oldstyle';
/** [light, dark]; null means "use the theme's value". */
export type ColorPair = [string | null, string | null];

export interface Settings {
  theme: string;
  appearance: 'light' | 'dark';
  aspect: '16:9' | '16:10' | '4:3' | '9:16';
  titleFont: string | null;
  bodyFont: string | null;
  size: Size;
  titleColor: ColorPair;
  bodyColor: ColorPair;
  background: ColorPair;
  /** Three slot templates each (left, center, right); null = theme default. */
  header: string[] | null;
  footer: string[] | null;
  /** A short deck title for {title} in headers and footers; null = the first # heading. */
  short: string | null;
  contrast: Contrast | null;
  leading: Leading | null;
  weight: TitleWeight | null;
  align: Align | null;
  labels: Labels | null;
  numerals: Numerals | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'nothing',
  appearance: 'light',
  aspect: '16:9',
  titleFont: null,
  bodyFont: null,
  size: 'M',
  titleColor: [null, null],
  bodyColor: [null, null],
  background: [null, null],
  header: null,
  footer: null,
  short: null,
  contrast: null,
  leading: null,
  weight: null,
  align: null,
  labels: null,
  numerals: null,
};

/** The values each type control accepts, in the order the Design panel shows them. */
export const TYPE_OPTIONS = {
  contrast: ['subtle', 'standard', 'dramatic'],
  leading: ['tight', 'normal', 'loose'],
  weight: ['light', 'regular', 'bold'],
  align: ['start', 'center'],
  labels: ['caps', 'small-caps', 'normal'],
  numerals: ['lining', 'oldstyle'],
} as const;
export type TypeKey = keyof typeof TYPE_OPTIONS;

export interface SlideSource {
  index: number;
  /** 0-based line numbers, inclusive start, exclusive end */
  startLine: number;
  endLine: number;
  visibleMd: string;
  notesMd: string;
  layoutHint?: string;
  /** `// dark`, `// light` or `// invert`: this slide's appearance */
  look?: 'dark' | 'light' | 'invert';
  /** `// image: contain` shows whole images (logos, diagrams) instead of cropping */
  imageFit?: 'contain' | 'cover';
  /** `// chart: bar` or `line`: the slide's table is drawn as a chart */
  chart?: 'bar' | 'line';
  /** `// timer: 5:00 ring next`: a countdown (see Timer) */
  timer?: Timer;
  /** `// count` or `// count: roll`: figures count up when the slide is shown */
  count?: 'count' | 'roll';
  /** `// number: ring` or `bar`: a percentage drawn as a meter */
  meter?: 'ring' | 'bar';
  /** `// web: https://…`: a live web page, shown when presenting */
  web?: string;
  /** `// focus: 2` or `2,4-5`: these steps stay bright, the rest fade (1-based) */
  focus?: number[];
}

/**
 * `// timer: 5:00`, `// timer: 90` (seconds), `// timer: 5 min` or
 * `// timer: until 14:45`, plus any of `ring`, `bar` (the visual) and `next`
 * (go to the next slide at 0:00).
 */
export interface Timer {
  /** A duration in seconds */
  seconds?: number;
  /** Or a clock time to count down to, in minutes after midnight */
  until?: number;
  style: 'digits' | 'ring' | 'bar';
  next: boolean;
}

/** Everything about a slide that changes how it renders: the cache key. */
export function renderKey(s: SlideSource): string {
  return JSON.stringify([s.visibleMd, s.layoutHint, s.look, s.imageFit, s.chart, s.timer, s.count, s.meter, s.web, s.focus, s.index]);
}

export interface ParsedDoc {
  settings: Settings;
  frontMatter: { from: number; to: number } | null; // line range, exclusive end
  roles: LineRole[];
  slideOfLine: number[];
  slides: SlideSource[];
  title: string;
}

export const SIZE_SCALE: Record<Size, number> = { S: 0.88, M: 1, L: 1.12, XL: 1.26 };

const RE_SEPARATOR = /^\s*-{3,}\s*$/;
const RE_HEADING = /^#{1,6}\s+\S/;
const RE_IMAGE = /^(!\[[^\]]*\]\([^)]*\)|<img\s[^>]*>)\s*$/i;
const RE_CAPTION = /^\[[^\]^][^\]]*\]\s*$/;
/** Reference link and footnote definitions: `[id]: url`, `[^id]: text`. */
const RE_DEFINITION = /^\s{0,3}\[\^?[^\]]+\]:\s+\S/;
const RE_FENCE = /^(```|~~~)/;
const RE_TABLE = /^\|.*\|\s*$/;
const RE_COMMENT = /^\s*\/\//;
const RE_LAYOUT = /^\s*\/\/\s*layout\s*:\s*([\w-]+)/i;
const RE_LOOK = /^\s*\/\/\s*(dark|light|invert)\s*$/i;
const RE_IMAGE_FIT = /^\s*\/\/\s*image\s*:\s*(contain|cover)\s*$/i;
const RE_CHART = /^\s*\/\/\s*chart\s*:\s*(bar|column|line)\s*$/i;
const RE_TIMER = /^\s*\/\/\s*timer\s*:\s*(.+?)\s*$/i;
const RE_COUNT = /^\s*\/\/\s*count(?:\s*:\s*(up|count|roll))?\s*$/i;
const RE_METER = /^\s*\/\/\s*number\s*:\s*(ring|bar)\s*$/i;
const RE_WEB = /^\s*\/\/\s*web\s*:\s*(\S+)\s*$/i;
const RE_FOCUS = /^\s*\/\/\s*focus\s*:\s*([\d\s,–-]+)$/i;
const RE_FM_LINE = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/;

/** The text after `// timer:`. Unknown words make it not a timer. */
export function parseTimer(text: string): Timer | undefined {
  const t: Timer = { style: 'digits', next: false };
  const rest = text
    .toLowerCase()
    .replace(/\b(ring|bar|next)\b/g, (w) => {
      if (w === 'next') t.next = true;
      else t.style = w as Timer['style'];
      return ' ';
    })
    .trim();
  const until = /^until\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(rest);
  if (until) {
    let h = Number(until[1]);
    const m = Number(until[2] ?? 0);
    if (until[3] === 'pm' && h < 12) h += 12;
    if (until[3] === 'am' && h === 12) h = 0;
    if (h > 23 || m > 59) return undefined;
    t.until = h * 60 + m;
    return t;
  }
  const d = /^(\d{1,3})(?::(\d{1,2})|\s*(m|min|mins|minutes?))?$/.exec(rest);
  if (!d) return undefined;
  t.seconds = d[2] !== undefined ? Number(d[1]) * 60 + Number(d[2]) : d[3] ? Number(d[1]) * 60 : Number(d[1]);
  return t.seconds > 0 ? t : undefined;
}

/** `2`, `2,4` or `2-4` → [2], [2, 4], [2, 3, 4] */
function parseFocus(text: string): number[] | undefined {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^\s*(\d{1,2})\s*(?:[–-]\s*(\d{1,2}))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Math.min(Number(m[2] ?? a), a + 20);
    for (let i = a; i <= b; i++) if (i > 0) out.add(i);
  }
  return out.size ? [...out].sort((x, y) => x - y) : undefined;
}

function parseFrontMatter(lines: string[]): { end: number; values: Record<string, string> } | null {
  if (lines.length < 2 || !RE_SEPARATOR.test(lines[0])) return null;
  const values: Record<string, string> = {};
  for (let i = 1; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    if (RE_SEPARATOR.test(line)) {
      return Object.keys(values).length ? { end: i + 1, values } : null;
    }
    if (line.trim() === '') continue;
    const m = RE_FM_LINE.exec(line);
    if (!m) return null;
    values[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
  }
  return null;
}

function parsePair(v: string | undefined): ColorPair {
  if (!v) return [null, null];
  const [a, b] = v.split('/').map((x) => x.trim());
  const norm = (x: string | undefined) => (!x || x === '-' ? null : x);
  return [norm(a), norm(b ?? a)];
}

function parseSlots(v: string | undefined): string[] | null {
  if (v === undefined) return null;
  if (/^(true|yes|on)$/i.test(v)) return null;
  if (/^(false|no|off|none)$/i.test(v)) return ['', '', ''];
  const parts = v.split('|').map((x) => x.trim());
  while (parts.length < 3) parts.push('');
  return parts.slice(0, 3);
}

function toSettings(values: Record<string, string>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (values.theme) s.theme = values.theme.toLowerCase().replace(/\s+/g, '');
  const alias = THEME_ALIASES[s.theme];
  if (values.appearance === 'dark' || values.appearance === 'light') s.appearance = values.appearance;
  if (['16:9', '16:10', '4:3', '9:16'].includes(values.aspect)) s.aspect = values.aspect as Settings['aspect'];
  if (values['title-font']) s.titleFont = values['title-font'];
  if (values['body-font']) s.bodyFont = values['body-font'];
  if (alias) {
    // A merged theme: its successor, with the fonts that set it apart
    s.theme = alias.theme;
    if (!s.titleFont && alias.titleFont) s.titleFont = alias.titleFont;
    if (!s.bodyFont && alias.bodyFont) s.bodyFont = alias.bodyFont;
  }
  if (['S', 'M', 'L', 'XL'].includes((values.size ?? '').toUpperCase())) s.size = values.size.toUpperCase() as Size;
  s.titleColor = parsePair(values['title-color']);
  s.bodyColor = parsePair(values['body-color']);
  s.background = parsePair(values.background);
  s.header = parseSlots(values.header);
  s.footer = parseSlots(values.footer);
  if (values.short) s.short = values.short;
  for (const key of Object.keys(TYPE_OPTIONS) as TypeKey[]) {
    const v = (values[key] ?? '').toLowerCase().replace(/\s+/g, '-');
    if ((TYPE_OPTIONS[key] as readonly string[]).includes(v)) (s as any)[key] = v;
  }
  return s;
}

/** Only values that differ from the theme are written, so files stay tidy. */
export function serializeFrontMatter(s: Settings): string {
  const lines = [`theme: ${s.theme}`, `appearance: ${s.appearance}`, `aspect: ${s.aspect}`];
  if (s.titleFont) lines.push(`title-font: ${s.titleFont}`);
  if (s.bodyFont) lines.push(`body-font: ${s.bodyFont}`);
  if (s.size !== 'M') lines.push(`size: ${s.size}`);
  const pair = (key: string, p: ColorPair) => {
    if (p[0] || p[1]) lines.push(`${key}: "${p[0] ?? '-'} / ${p[1] ?? '-'}"`);
  };
  pair('title-color', s.titleColor);
  pair('body-color', s.bodyColor);
  pair('background', s.background);
  const slots = (key: string, v: string[] | null) => {
    if (!v) return;
    lines.push(v.every((x) => !x) ? `${key}: none` : `${key}: "${v.map((x) => x.replace(/\|/g, '/')).join(' | ')}"`);
  };
  slots('header', s.header);
  slots('footer', s.footer);
  if (s.short) lines.push(`short: "${s.short.replace(/"/g, "'")}"`);
  for (const key of Object.keys(TYPE_OPTIONS) as TypeKey[]) if (s[key]) lines.push(`${key}: ${s[key]}`);
  return `---\n${lines.join('\n')}\n---`;
}

export function parse(text: string): ParsedDoc {
  const lines = text.split('\n');
  const roles: LineRole[] = new Array(lines.length);
  const slideOfLine: number[] = new Array(lines.length);

  const fm = parseFrontMatter(lines);
  let start = 0;
  if (fm) {
    for (let i = 0; i < fm.end; i++) {
      roles[i] = 'frontmatter';
      slideOfLine[i] = 0;
    }
    start = fm.end;
  }

  const slides: SlideSource[] = [];
  let visible: string[] = [];
  let notes: string[] = [];
  let needBreak = false;
  let notesBreak = false;
  let layoutHint: string | undefined;
  let look: SlideSource['look'];
  let imageFit: SlideSource['imageFit'];
  let chart: SlideSource['chart'];
  let timer: SlideSource['timer'];
  let count: SlideSource['count'];
  let meter: SlideSource['meter'];
  let web: SlideSource['web'];
  let focus: SlideSource['focus'];
  let slideStart = start;
  let fence: { marker: string; visible: boolean } | null = null;

  const pushVisible = (line: string) => {
    if (needBreak && visible.length) visible.push('');
    needBreak = false;
    visible.push(line);
  };
  const pushNote = (line: string) => {
    if (notesBreak && notes.length) notes.push('');
    notesBreak = false;
    notes.push(line);
  };
  const flush = (end: number) => {
    slides.push({
      index: slides.length,
      startLine: slideStart,
      endLine: end,
      visibleMd: visible.join('\n').trim(),
      notesMd: notes.join('\n').trim(),
      layoutHint,
      look,
      imageFit,
      chart,
      timer,
      count,
      meter,
      web,
      focus,
    });
    visible = [];
    notes = [];
    needBreak = false;
    notesBreak = false;
    layoutHint = undefined;
    look = undefined;
    imageFit = undefined;
    chart = undefined;
    timer = undefined;
    count = undefined;
    meter = undefined;
    web = undefined;
    focus = undefined;
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    slideOfLine[i] = slides.length;

    // Inside a fenced code block
    if (fence) {
      roles[i] = fence.visible ? 'code' : 'note';
      const body = raw.startsWith('\t') ? raw.slice(1) : raw;
      if (fence.visible) visible.push(body);
      else notes.push(raw);
      if (body.trim().startsWith(fence.marker)) fence = null;
      continue;
    }

    if (RE_SEPARATOR.test(raw)) {
      roles[i] = 'separator';
      flush(i);
      slideStart = i + 1;
      slideOfLine[i] = slides.length; // separator belongs to the next slide
      continue;
    }

    if (raw.trim() === '') {
      roles[i] = 'blank';
      needBreak = true;
      notesBreak = true;
      continue;
    }

    if (RE_COMMENT.test(raw)) {
      roles[i] = 'comment';
      const m = RE_LAYOUT.exec(raw);
      if (m) layoutHint = m[1].toLowerCase();
      const l = RE_LOOK.exec(raw);
      if (l) look = l[1].toLowerCase() as SlideSource['look'];
      const f = RE_IMAGE_FIT.exec(raw);
      if (f) imageFit = f[1].toLowerCase() as SlideSource['imageFit'];
      const ch = RE_CHART.exec(raw);
      if (ch) chart = ch[1].toLowerCase() === 'line' ? 'line' : 'bar';
      const tm = RE_TIMER.exec(raw);
      if (tm) timer = parseTimer(tm[1]) ?? timer;
      const co = RE_COUNT.exec(raw);
      if (co) count = co[1]?.toLowerCase() === 'roll' ? 'roll' : 'count';
      const me = RE_METER.exec(raw);
      if (me) meter = me[1].toLowerCase() as SlideSource['meter'];
      const we = RE_WEB.exec(raw);
      if (we) web = we[1];
      const fo = RE_FOCUS.exec(raw);
      if (fo) focus = parseFocus(fo[1]);
      continue;
    }

    const tabbed = raw.startsWith('\t');
    const line = tabbed ? raw.slice(1) : raw;
    const trimmed = line.trimStart();

    if (RE_FENCE.test(trimmed)) {
      const marker = trimmed.slice(0, 3);
      roles[i] = 'code';
      fence = { marker, visible: true };
      pushVisible(line);
      continue;
    }
    if (RE_HEADING.test(trimmed)) {
      roles[i] = 'heading';
      // headings always start a fresh block
      needBreak = true;
      pushVisible(trimmed);
      needBreak = true;
      continue;
    }
    if (RE_IMAGE.test(trimmed)) {
      roles[i] = 'image';
      needBreak = true;
      pushVisible(trimmed);
      needBreak = true;
      continue;
    }
    if (RE_TABLE.test(trimmed)) {
      roles[i] = 'visible';
      pushVisible(trimmed);
      continue;
    }
    // A [Caption] line directly above or below a table belongs to it
    if (RE_CAPTION.test(trimmed)) {
      const near = (n: number) => RE_TABLE.test((lines[n] ?? '').replace(/^\t/, '').trimStart());
      if (near(i - 1) || near(i + 1)) {
        roles[i] = 'visible';
        pushVisible(trimmed);
        continue;
      }
    }
    if (tabbed) {
      roles[i] = 'visible';
      pushVisible(line);
      continue;
    }
    roles[i] = 'note';
    needBreak = true;
    pushNote(raw);
  }
  flush(lines.length);

  // Drop a trailing empty slide (e.g. document ending in ---) but always keep one.
  while (slides.length > 1) {
    const last = slides[slides.length - 1];
    if (last.visibleMd || last.notesMd) break;
    slides.pop();
  }
  // Lines after the last kept slide map to it.
  const lastIdx = slides.length - 1;
  for (let i = 0; i < slideOfLine.length; i++) if (slideOfLine[i] > lastIdx) slideOfLine[i] = lastIdx;

  // Link and footnote definitions apply to every slide, wherever they're written
  const defs = lines.filter((l, i) => i >= start && roles[i] !== 'code' && RE_DEFINITION.test(l.replace(/^\t/, ''))).map((l) => l.replace(/^\t/, ''));
  if (defs.length) {
    const block = defs.join('\n');
    for (const s of slides) if (/\[/.test(s.visibleMd)) s.visibleMd += `\n\n${block}`;
  }

  let title = '';
  for (const s of slides) {
    const m = /^#\s+(.+)$/m.exec(s.visibleMd);
    if (m) {
      title = withoutCharts(m[1].replace(/[*_`]/g, ''));
      break;
    }
  }

  return {
    settings: toSettings(fm?.values ?? {}),
    frontMatter: fm ? { from: 0, to: fm.end } : null,
    roles,
    slideOfLine,
    slides,
    title,
  };
}
