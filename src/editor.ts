import { EditorState, StateField, type Extension, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, type DecorationSet, keymap, drawSelection, highlightActiveLine, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess, insertNewlineAndIndent } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { parse, type ParsedDoc } from './parser';
import { slideColor } from './badges';

/** The parsed deck lives in editor state so it's always in sync with the text. */
export const parsedField = StateField.define<ParsedDoc>({
  create: (state) => parse(state.doc.toString()),
  update: (value, tr) => (tr.docChanged ? parse(tr.state.doc.toString()) : value),
});

const ROLE_CLASS: Record<string, string> = {
  frontmatter: 'cm-l-fm',
  separator: 'cm-l-sep',
  heading: 'cm-l-heading cm-l-show',
  visible: 'cm-l-show',
  image: 'cm-l-image cm-l-show',
  code: 'cm-l-code cm-l-show',
  note: 'cm-l-note',
  comment: 'cm-l-comment',
  blank: '',
};

/** Index of the slide that holds the cursor. */
function cursorSlide(state: EditorState): number {
  const line = state.doc.lineAt(state.selection.main.head).number - 1;
  return state.field(parsedField).slideOfLine[line] ?? 0;
}

const SKIP_FOR_BADGE = new Set(['frontmatter', 'separator', 'blank', 'comment']);

function buildDecorations(state: EditorState): DecorationSet {
  const parsed = state.field(parsedField);
  const active = cursorSlide(state);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;

  // The first written line of each slide carries its number badge.
  const badgeLine = new Map<number, number>(); // line index -> slide index
  for (const s of parsed.slides) {
    for (let ln = s.startLine; ln < s.endLine; ln++) {
      if (!SKIP_FOR_BADGE.has(parsed.roles[ln])) {
        badgeLine.set(ln, s.index);
        break;
      }
    }
  }

  for (let i = 1; i <= doc.lines; i++) {
    const role = parsed.roles[i - 1];
    const slide = badgeLine.get(i - 1);
    let cls = ROLE_CLASS[role] ?? '';
    if (!cls && slide === undefined) continue;
    const line = doc.line(i);
    if (line.text.startsWith('\t') && role !== 'separator') cls += ' cm-l-tab';
    const attrs: Record<string, string> = {};
    if (slide !== undefined) {
      cls += ' cm-l-badge' + (slide === active ? ' is-active' : '');
      attrs['data-slide'] = String(slide + 1);
      attrs.style = `--badge: ${slideColor(slide)}`;
    }
    attrs.class = cls.trim();
    builder.add(line.from, line.from, Decoration.line({ attributes: attrs }));
  }
  return builder.finish();
}

const decorationsField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: (deco, tr) =>
    tr.docChanged || (tr.selection && cursorSlide(tr.state) !== cursorSlide(tr.startState)) ? buildDecorations(tr.state) : deco,
  provide: (f) => EditorView.decorations.from(f),
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700' },
  { tag: t.heading2, fontWeight: '700' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.processingInstruction, color: 'var(--ed-mark)', fontWeight: '400' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--ed-link)' },
  { tag: t.url, color: 'var(--ed-mark)' },
  { tag: t.quote, fontStyle: 'italic' },
  { tag: t.contentSeparator, color: 'var(--ed-mark)' },
  { tag: [t.meta, t.comment], color: 'var(--ed-mark)' },
]);

function enterKey(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return insertNewlineAndIndent(view);
  const line = state.doc.lineAt(sel.head);
  if (/^[\t ]+$/.test(line.text) && sel.head === line.to) {
    view.dispatch({ changes: { from: line.from, to: line.to, insert: '\n' }, selection: { anchor: line.from + 1 }, scrollIntoView: true, userEvent: 'input' });
    return true;
  }
  if (line.text.startsWith('\t')) {
    // Continue with exactly the same leading tabs, nothing else
    const tabs = /^\t+/.exec(line.text)![0];
    view.dispatch(state.replaceSelection('\n' + tabs), { scrollIntoView: true, userEvent: 'input' });
    return true;
  }
  view.dispatch(state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input' });
  return true;
}

export interface EditorHooks {
  onChange: (text: string) => void;
  onCursorSlide: (index: number) => void;
}

export function createEditor(parent: HTMLElement, text: string, hooks: EditorHooks): EditorView {
  let lastSlide = -1;
  const extensions: Extension[] = [
    parsedField,
    decorationsField,
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(4),
    indentUnit.of('\t'),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(highlight),
    placeholder('# Start with a title\n\nThen write what you want to say…'),
    keymap.of([
      // Tab always inserts/removes a leading tab: that's how text goes on a slide
      { key: 'Tab', run: indentMore, shift: indentLess, preventDefault: true },
      // Enter keeps the tab (so on-slide lists continue); Enter on a line that is
      // only a tab drops it, so a blank line takes you back to writing notes.
      { key: 'Enter', run: enterKey },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) hooks.onChange(u.state.doc.toString());
      if (u.docChanged || u.selectionSet) {
        const line = u.state.doc.lineAt(u.state.selection.main.head).number - 1;
        const idx = u.state.field(parsedField).slideOfLine[line] ?? 0;
        if (idx !== lastSlide || u.docChanged) {
          lastSlide = idx;
          hooks.onCursorSlide(idx);
        }
      }
    }),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences', 'aria-label': 'Script' }),
  ];
  return new EditorView({ parent, state: EditorState.create({ doc: text, extensions }) });
}

export function setText(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 } });
}

export function getParsed(view: EditorView): ParsedDoc {
  return view.state.field(parsedField);
}

/** Move the cursor to the first content line of a slide and scroll it into view. */
export function revealSlide(view: EditorView, index: number): void {
  const parsed = getParsed(view);
  const slide = parsed.slides[index];
  if (!slide) return;
  const doc = view.state.doc;
  let lineNo = Math.min(slide.startLine + 1, doc.lines);
  // skip leading blank lines
  while (lineNo < doc.lines && doc.line(lineNo).text.trim() === '' && lineNo - 1 < slide.endLine) lineNo++;
  const pos = doc.line(lineNo).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 80 }) });
  view.focus();
}
