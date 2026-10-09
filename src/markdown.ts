/**
 * The Markdown dialect: CommonMark plus the iA Presenter extensions.
 *
 *   ==highlight==          <mark>
 *   100m^2  y^(a+b)^       superscript (bare run, or closed with ^)
 *   H~2~O   x~z  x~y,z~    subscript (bare run, or closed with ~); ~~strike~~ untouched
 *   - [ ] / - [x]          task lists
 *   Term / : definition    definition lists
 *   note[^id] / [^Inline]  footnotes, grouped at the bottom of the slide
 *   $x$ \(x\) $$…$$ \[…\]  math (KaTeX)
 *   | a || b |             a cell merged with the next (MultiMarkdown)
 *   [Caption]              a caption line directly above or below a table
 *   <img src alt title width height>  on its own line, as a safe image
 *
 * Raw HTML stays off: shared links can carry anyone's markdown.
 */
import MarkdownIt, { type StateInline, type StateCore, type Token } from 'markdown-it';
import katex from 'katex';
import texmath from 'markdown-it-texmath';
import mark from 'markdown-it-mark';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import 'katex/dist/katex.min.css';

export const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });

md.use(mark).use(deflist).use(footnote).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets'],
  katexOptions: { throwOnError: false, output: 'html' },
});

/* ---------------- footnotes: plain numbers, no back-links ---------------- */
md.renderer.rules.footnote_ref = (tokens, idx) => {
  const n = Number(tokens[idx].meta?.id ?? 0) + 1;
  return `<sup class="footnote-ref">${n}</sup>`;
};
md.renderer.rules.footnote_anchor = () => '';
md.renderer.rules.footnote_block_open = () => '<section class="footnotes"><ol class="footnotes-list">\n';
md.renderer.rules.footnote_block_close = () => '</ol></section>\n';
md.renderer.rules.footnote_open = () => '<li class="footnote-item">';

/* ---------------- superscript and subscript ---------------- */
const WORD = /[\p{L}\p{N}]/u;

function script(marker: '^' | '~', tag: 'sup' | 'sub') {
  return (state: StateInline, silent: boolean): boolean => {
    const src = state.src;
    const start = state.pos;
    if (src[start] !== marker) return false;
    // Must hang off something: x^2, not a free-standing caret or tilde
    if (start === 0 || /[\s[]/.test(src[start - 1]) || src[start + 1] === '[') return false;
    if (marker === '~' && (src[start + 1] === '~' || src[start - 1] === '~')) return false; // ~~strike~~
    let content = '';
    let end = -1;
    if (src[start + 1] === '(' && marker === '^') {
      // y^(a+b)^
      const close = src.indexOf(')^', start + 2);
      if (close > 0) {
        content = src.slice(start + 2, close);
        end = close + 2;
      }
    }
    if (end < 0) {
      // H~2~O, x~y,z~ : closed with the same marker, no whitespace inside
      const close = src.indexOf(marker, start + 1);
      const inner = close > 0 ? src.slice(start + 1, close) : '';
      if (inner && !/\s/.test(inner)) {
        content = inner;
        end = close + 1;
      }
    }
    if (end < 0) {
      // 100m^2, x~z : a bare run of letters and digits
      let p = start + 1;
      while (p < state.posMax && WORD.test(src[p])) p++;
      if (p === start + 1) return false;
      content = src.slice(start + 1, p);
      end = p;
    }
    if (!silent) {
      state.push(`${tag}_open`, tag, 1).markup = marker;
      const t = state.push('text', '', 0);
      t.content = content;
      state.push(`${tag}_close`, tag, -1).markup = marker;
    }
    state.pos = end;
    return true;
  };
}
md.inline.ruler.after('emphasis', 'sup', script('^', 'sup'));
md.inline.ruler.after('emphasis', 'sub', script('~', 'sub'));

/* ---------------- task lists ---------------- */
md.core.ruler.after('inline', 'tasks', (state: StateCore) => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
    const m = /^\[([ xX])\]\s+/.exec(inline.content);
    const first = inline.children?.[0];
    if (!m || !first || first.type !== 'text' || !first.content.startsWith(m[0].trimEnd())) continue;
    const done = m[1] !== ' ';
    first.content = first.content.slice(m[0].trimEnd().length).replace(/^\s+/, '');
    const box = new state.Token('html_inline', '', 0);
    box.content = `<span class="s-check${done ? ' is-done' : ''}" aria-hidden="true"></span>`;
    inline.children!.unshift(box);
    tokens[i - 2].attrJoin('class', done ? 's-task is-done' : 's-task');
  }
});

/* ---------------- tables: merged cells and captions ---------------- */
const CAPTION = /^\s*\[([^\]^][^\]]*)\]\s*$/;

/** Raw cells of a source table row, keeping empty ones (`||`). */
function rawCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/);
}

md.core.ruler.after('inline', 'table_extras', (state: StateCore) => {
  const lines = state.src.split('\n');
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Merged cells: an empty cell written as `||` joins the cell before it
    if (t.type === 'tr_open' && t.map) {
      const raw = rawCells(lines[t.map[0]] ?? '');
      let j = i + 1;
      let cell = 0;
      let last: Token | null = null;
      while (j < tokens.length && tokens[j].type !== 'tr_close') {
        const open = tokens[j];
        if (open.type === 'td_open' || open.type === 'th_open') {
          if (raw[cell] === '' && last) {
            last.attrSet('colspan', String(Number(last.attrGet('colspan') ?? 1) + 1));
            tokens.splice(j, 3); // open, inline, close
            cell++;
            continue;
          }
          last = open;
          cell++;
        }
        j++;
      }
    }

    // Caption below: a last body row that is only `[Caption]`
    if (t.type === 'table_close') {
      let k = i - 1;
      if (tokens[k]?.type === 'tbody_close') k--;
      if (tokens[k]?.type === 'tr_close') {
        let o = k;
        while (o > 0 && tokens[o].type !== 'tr_open') o--;
        const line = tokens[o].map ? lines[tokens[o].map![0]] : '';
        const m = CAPTION.exec(line ?? '');
        if (m) {
          tokens.splice(o, k - o + 1);
          let open = o;
          while (open > 0 && tokens[open].type !== 'table_open') open--;
          insertCaption(state, tokens, open, m[1]);
          i = o + 1;
        }
      }
    }

    // Caption above: a paragraph that is only `[Caption]` right before a table
    if (t.type === 'paragraph_open' && tokens[i + 3]?.type === 'table_open') {
      const m = CAPTION.exec(tokens[i + 1].content);
      if (m) {
        tokens.splice(i, 3);
        const open = findTableOpen(tokens, i);
        if (open >= 0) insertCaption(state, tokens, open, m[1]);
      }
    }
  }
});

function findTableOpen(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) if (tokens[i].type === 'table_open') return i;
  return -1;
}

function insertCaption(state: StateCore, tokens: Token[], tableOpen: number, text: string) {
  const open = new state.Token('html_block', '', 0);
  open.content = `<caption>${md.utils.escapeHtml(text)}</caption>\n`;
  tokens.splice(tableOpen + 1, 0, open);
  tokens[tableOpen].meta = { ...(tokens[tableOpen].meta ?? {}), caption: true };
}

/* ---------------- safe <img> lines ---------------- */
const IMG_LINE = /^(\s*)<img\s([^>]*?)\/?>\s*$/gim;

function attr(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

/** `<img src="a.png" alt="A">` on its own line → `![A](a.png)`. */
export function imgTagsToMarkdown(src: string): string {
  return src.replace(IMG_LINE, (_all, indent: string, attrs: string) => {
    const url = attr(attrs, 'src');
    if (!url) return _all;
    const alt = attr(attrs, 'alt').replace(/[[\]]/g, '');
    const title = attr(attrs, 'title').replace(/"/g, '');
    return `${indent}![${alt}](${url.replace(/ /g, '%20')}${title ? ` "${title}"` : ''})`;
  });
}

/**
 * Source rewrites before parsing, outside code fences:
 *  - `<img …>` lines become Markdown images
 *  - MultiMarkdown math `\\( … \\)` and `\\[ … \\]` become `\( … \)` and `\[ … \]`
 *  - iA inline footnotes `[^Some text.]` (no matching definition) become `^[Some text.]`
 */
export function prepare(src: string): string {
  const defined = new Set([...src.matchAll(/^\s{0,3}\[\^([^\]\s]+)\]:/gm)].map((m) => m[1]));
  let fence: string | null = null;
  return src
    .split('\n')
    .map((line) => {
      const f = /^\s*(```|~~~)/.exec(line);
      if (f) {
        if (!fence) fence = f[1];
        else if (line.trim().startsWith(fence)) fence = null;
        return line;
      }
      if (fence) return line;
      return imgTagsToMarkdown(line)
        .replace(/\\\\([()[\]])/g, '\\$1')
        .replace(/\[\^([^\]]+)\](?!:)/g, (all, label: string) => (defined.has(label) ? all : `^[${label}]`));
    })
    .join('\n');
}
