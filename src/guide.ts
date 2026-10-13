/**
 * The Markdown guide: one example per layout and feature. Clicking an
 * example inserts it at the cursor, so people learn by trying. It shows in
 * two places: its own panel (the ? button) and the Design panel's Slide tab.
 *
 * Examples use real tabs (\t) for on-slide lines, exactly as people type them.
 * TO ADD AN EXAMPLE: add an entry to GUIDE; `code` is what gets inserted.
 */
import { icons } from './icons';

interface Example {
  title: string;
  hint?: string;
  code: string;
}

const GUIDE: { group: string; items: Example[] }[] = [
  {
    group: 'Slides',
    items: [
      { title: 'New slide', hint: 'Three dashes on their own line', code: '---' },
      { title: 'Title slide', code: '# The title\n### A subtitle' },
      { title: 'On the slide, or in your notes', hint: 'Tab puts a line on the slide; the rest are notes', code: '## A heading\n\n\tThis line shows on the slide.\n\nThis one is a speaker note.' },
      { title: 'Small label above a title', code: '#### Part one\n## The title' },
      { title: 'Footnote', hint: 'At the end of a slide', code: '###### Source: annual survey, 2026' },
    ],
  },
  {
    group: 'Layouts',
    items: [
      { title: 'Columns', hint: 'Repeated subheadings', code: '## Three bets\n\n### Data\n\tOne store, hourly.\n\n### Tools\n\tFewer, better.\n\n### People\n\tAn owner for every metric.' },
      { title: 'Big numbers', hint: 'Short numbers as column heads', code: '## By the numbers\n\n### 38%\n\tRevenue growth\n\n### $4.2M\n\tNew revenue\n\n### 118%\n\tNet retention' },
      { title: 'Timeline', code: '// layout: timeline\n## Roadmap\n\n### Q1\n\tRebuild the data layer\n\n### Q2\n\tShip the editor\n\n### Q3\n\tOpen the API' },
      { title: 'Cycle', hint: 'Repeated subheadings in a loop, 2 to 7', code: '// layout: cycle\n## How we ship\n\tEvery quarter\n\n### Discover\n\tTalk to customers\n\n### Build\n\tSmall slices\n\n### Measure\n\tOne metric per bet\n\n### Learn\n\tWrite it down' },
      { title: 'Big number', hint: 'A title that is only a figure', code: '#### Revenue, FY26\n## $4.2M\n\tUp from $2.9M a year ago' },
      { title: 'Agenda', hint: 'Lists your section slides, and where you are', code: '// layout: agenda\n## Today' },
      { title: 'Web page', hint: 'Live when you present', code: '## Live demo\n// web: https://example.com' },
      { title: 'Statement', hint: 'One short line, no heading', code: '\tSay one thing per slide.' },
      { title: 'Quote', code: '\t> Typography exists to honor content.\n\n\t— Robert Bringhurst' },
      { title: 'Image beside text', code: '## Pictures make room\n\n\tText on one side, the picture on the other.\n\n![Dusk](samples/dusk.jpg)' },
      { title: 'Full-bleed image', code: '![](samples/tide.jpg)' },
      { title: 'Gallery', hint: 'Two to six images', code: '![](samples/ochre.jpg)\n![](samples/moss.jpg)\n![](samples/tide.jpg)' },
    ],
  },
  {
    group: 'Data and code',
    items: [
      { title: 'Table', code: '\t| Region | Revenue |\n\t|:--|--:|\n\t| Europe | $6.1M |\n\t| Asia | $3.8M |' },
      { title: 'Growth', hint: 'Counts up from one value to the other', code: '## $2.9M → $4.2M\n\tAnnual recurring revenue\n// count' },
      { title: 'Percentage as a ring', hint: 'or // number: bar', code: '## 72%\n\tOf teams use it every week\n// number: ring' },
      { title: 'Chart from a table', hint: 'bar or line', code: '// chart: bar\n## Revenue by quarter\n\n\t| Quarter | Revenue |\n\t|---|--:|\n\t| Q1 | $1.2M |\n\t| Q2 | $1.9M |\n\t| Q3 | $2.4M |' },
      { title: 'Code with focus', hint: 'The listed lines stay bright', code: '\t```js {2}\n\tconst deck = parse(script);\n\tpresent(deck);\n\t```' },
      { title: 'Math', code: '\t$$\n\te = mc^2\n\t$$' },
    ],
  },
  {
    group: 'Text',
    items: [
      { title: 'Callout', hint: 'NOTE, TIP, IMPORTANT, WARNING, CAUTION', code: '\t> [!TIP]\n\t> Rehearse twice.' },
      { title: 'Lists and tasks', code: '\t- A point\n\t- Another point\n\t- [x] Done\n\t- [ ] Not yet' },
      { title: 'Highlight, super and subscript', code: '\t==Remember this==, m^2 and H~2~O' },
      { title: 'Definition', code: '\tLatency\n\t: The time between asking and getting an answer.' },
      { title: 'Footnote in text', code: '\tA claim worth checking.[^Source: the annual report.]' },
    ],
  },
  {
    group: 'Slide settings',
    items: [
      { title: 'Dark slide', hint: 'Or // light, // invert', code: '// dark' },
      { title: 'Pick a layout', code: '// layout: split' },
      { title: 'Show whole images', hint: 'For logos and diagrams', code: '// image: contain' },
      { title: 'Focus a cropped image', hint: '#top, #bottom, #left, #right or #30,70', code: '![](samples/tide.jpg#bottom)' },
      { title: 'Countdown', hint: 'Runs when you present', code: '// timer: 5:00' },
      { title: 'Countdown in a ring', hint: 'or bar, along the bottom edge', code: '## Coffee break\n// timer: 10:00 ring' },
      { title: 'Break until a time', hint: 'next moves on at 0:00', code: '## Back at 2:45\n// timer: until 14:45 bar next' },
      { title: 'Count up', hint: 'Or // count: roll', code: '// count' },
      { title: 'Focus on one step', hint: 'Cycles, columns, timelines, agendas', code: '// focus: 2' },
      { title: 'Comment', hint: 'Hidden everywhere', code: '// A note to yourself' },
    ],
  },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
/** Tabs show as ⇥ in the examples, like the editor's tab marks. */
const show = (code: string) => esc(code).replace(/^\t/gm, '<span class="g-tab">⇥</span>');

/**
 * The examples, one section per group. `attrs` goes on each section (the
 * Design panel passes data-pane="slide" so they show on its Slide tab).
 */
export function guideGroupsHTML(attrs = ''): string {
  return GUIDE.map(
    (g, gi) => `<section class="ins-group guide-group" ${attrs}><div class="ins-label">${g.group}</div>${g.items
      .map((it, ii) => `<button class="g-item" data-g="${gi}:${ii}"><span class="g-title">${esc(it.title)}</span>${it.hint ? `<span class="g-hint">${esc(it.hint)}</span>` : ''}<pre class="g-code">${show(it.code)}</pre></button>`)
      .join('')}</section>`,
  ).join('');
}

/** The text an example button inserts, or null if it isn't one. */
export function guideCode(target: EventTarget | null): string | null {
  const b = (target as HTMLElement | null)?.closest?.<HTMLElement>('.g-item');
  if (!b?.dataset.g) return null;
  const [gi, ii] = b.dataset.g.split(':').map(Number);
  return GUIDE[gi]?.items[ii]?.code ?? null;
}

export class Guide {
  private root: HTMLElement;

  constructor(root: HTMLElement, insert: (code: string) => void) {
    this.root = root;
    root.innerHTML = `
      <div class="ins-head"><h2>Markdown guide</h2><button class="icon-btn" data-act="close-guide" aria-label="Close">${icons.close}</button></div>
      <p class="g-intro">Click an example to add it at the cursor.</p>
      <div class="ins-scroll">${guideGroupsHTML()}</div>`;
    root.addEventListener('click', (e) => {
      const code = guideCode(e.target);
      if (code) insert(code);
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(force?: boolean): void {
    this.root.hidden = !(force ?? this.root.hidden);
  }
}
