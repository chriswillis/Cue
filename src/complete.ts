/**
 * Autocomplete for the parts of Cue's markdown that are hard to remember:
 *   front matter     keys, then their values (themes, fonts, sizes…)
 *   // directives    layout, dark/light/invert, image, chart, timer
 *   ``` fences       languages with syntax colors
 *   > [!             callout kinds
 *
 * Plain prose never gets suggestions. CodeMirror's autocomplete package draws
 * the list; app.css styles it under "Autocomplete".
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { THEMES } from './themes';
import { TYPEFACES } from './typefaces';
import { LAYOUTS } from './render';
import { TYPE_OPTIONS } from './parser';

const opt = (label: string, detail?: string, apply?: string): Completion => ({ label, detail, apply: apply ?? label, type: 'keyword' });

const FM_KEYS: Completion[] = [
  opt('theme', 'Look of the deck', 'theme: '),
  opt('appearance', 'light or dark', 'appearance: '),
  opt('aspect', '16:9, 16:10, 4:3, 9:16', 'aspect: '),
  opt('title-font', 'Font for titles', 'title-font: '),
  opt('body-font', 'Font for text', 'body-font: '),
  opt('size', 'S, M, L, XL', 'size: '),
  opt('contrast', 'Title size contrast', 'contrast: '),
  opt('leading', 'Line spacing', 'leading: '),
  opt('weight', 'Title weight', 'weight: '),
  opt('align', 'Titles left or centered', 'align: '),
  opt('labels', 'Caps, small caps or plain', 'labels: '),
  opt('numerals', 'Lining or old style', 'numerals: '),
  opt('short', 'Short title for {title}', 'short: '),
  opt('header', 'left | center | right', 'header: '),
  opt('footer', 'left | center | right', 'footer: '),
  opt('title-color', 'light / dark', 'title-color: '),
  opt('body-color', 'light / dark', 'body-color: '),
  opt('background', 'light / dark', 'background: '),
];

const FM_VALUES: Record<string, Completion[]> = {
  theme: THEMES.map((t) => opt(t.id, t.name)),
  appearance: ['light', 'dark'].map((v) => opt(v)),
  aspect: ['16:9', '16:10', '4:3', '9:16'].map((v) => opt(v)),
  'title-font': TYPEFACES.map((t) => opt(t.id, t.name)),
  'body-font': TYPEFACES.map((t) => opt(t.id, t.name)),
  size: ['S', 'M', 'L', 'XL'].map((v) => opt(v)),
  ...Object.fromEntries(Object.entries(TYPE_OPTIONS).map(([k, vs]) => [k, (vs as readonly string[]).map((v) => opt(v))])),
  header: ['{title}', '{number}', '{count}', '{date}', 'none'].map((v) => opt(v)),
  footer: ['{title}', '{number}', '{count}', '{date}', 'none'].map((v) => opt(v)),
};

const DIRECTIVES: Completion[] = [
  opt('layout: ', 'Pick this slide’s layout'),
  opt('dark', 'Show this slide dark'),
  opt('light', 'Show this slide light'),
  opt('invert', 'Flip this slide’s appearance'),
  opt('image: contain', 'Show whole images, uncropped'),
  opt('chart: bar', 'Draw the table as bars'),
  opt('chart: line', 'Draw the table as lines'),
  opt('timer: 5:00', 'A countdown when presenting'),
];

const LANGS = ['js', 'ts', 'jsx', 'tsx', 'python', 'css', 'html', 'json', 'rust', 'go', 'java', 'c', 'cpp', 'yaml'].map((v) => opt(v));
const CALLOUTS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].map((v) => opt(v, undefined, `${v}]`));

function inFrontMatter(ctx: CompletionContext, lineNo: number): boolean {
  const doc = ctx.state.doc;
  if (lineNo < 2 || !/^\s*-{3,}\s*$/.test(doc.line(1).text)) return false;
  for (let n = 2; n <= Math.min(doc.lines, 40); n++) {
    if (/^\s*-{3,}\s*$/.test(doc.line(n).text)) return lineNo < n;
  }
  return false;
}

/**
 * Suggestions start after the first typed character (or Ctrl+Space), and
 * stop once the word is complete, so Enter is never swallowed: after ``` it
 * still makes a new line, and `// dark` needs only one Enter.
 */
function offer(ctx: CompletionContext, typed: string, options: Completion[], validFor: RegExp): CompletionResult | null {
  if (!typed && !ctx.explicit) return null;
  if (options.some((o) => o.label === typed)) return null;
  return { from: ctx.pos - typed.length, options, validFor };
}

function source(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  // Front matter (between the --- lines at the top). Found here rather than
  // from the parser, which ignores a block while a line in it is half typed.
  if (inFrontMatter(ctx, line.number)) {
    const kv = /^\s*([\w-]+)\s*:\s*([^\s]*)$/.exec(before);
    if (kv) {
      const values = FM_VALUES[kv[1].toLowerCase()];
      return values ? offer(ctx, kv[2], values, /^[\w:{}-]*$/) : null;
    }
    const key = /^\s*([\w-]*)$/.exec(before);
    if (key) return offer(ctx, key[1], FM_KEYS, /^[\w-]*$/);
    return null;
  }

  // // layout: x
  const lay = /^\s*\/\/\s*layout\s*:\s*(\w*)$/i.exec(before);
  if (lay) return offer(ctx, lay[1], ['auto', ...LAYOUTS].map((l) => opt(l)), /^\w*$/);
  // // directive
  const dir = /^\s*\/\/\s?([\w]*)$/.exec(before);
  if (dir) return offer(ctx, dir[1], DIRECTIVES, /^\w*$/);
  // ```lang
  const fence = /^\t?\s*(```|~~~)(\w*)$/.exec(before);
  if (fence) return offer(ctx, fence[2], LANGS, /^\w*$/);
  // > [!NOTE]
  const call = /^\t?\s*>\s*\[!(\w*)$/.exec(before);
  if (call) return offer(ctx, call[1], CALLOUTS, /^\w*$/);
  return null;
}

export const completion: Extension = autocompletion({ override: [source], icons: false, activateOnTyping: true });
