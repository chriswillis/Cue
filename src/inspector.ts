import type { ColorPair, Settings, SlideSource } from './parser';
import { renderSlide, fit, mount, LAYOUTS, SLOT_PRESETS, fillSlot } from './render';
import { THEMES, THEME_GROUPS, getTheme } from './themes';
import { TYPEFACES, getTypeface } from './typefaces';
import { PATTERNS, SWATCH_ROWS, previewCSS, getPattern } from './flexoki';
import { icons } from './icons';

/**
 * The Design panel: theme, fonts, size, colors (light + dark), header and
 * footer slots, aspect ratio and the current slide's layout. Every change is
 * written to the document's front matter by the host via `update`.
 */

export interface InspectorHost {
  settings(): Settings;
  slide(): SlideSource;
  deckTitle(): string;
  total(): number;
  current(): number;
  update(patch: Partial<Settings>): void;
  setLayout(layout: string): void;
}

type ColorKey = 'titleColor' | 'bodyColor' | 'background';

const BG_PATTERNS = ['vivid', 'bright', 'pastel', 'muted', 'jewel', 'tint', 'metro', 'metro-light', 'alt-night', 'alt-day'];
const TEXT_PATTERNS = ['titles-light', 'titles-dark', 'metro-ink'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function inspectorHTML(): string {
  const fontOptions = (role: 'title' | 'body') =>
    `<option value="">Theme default</option>` +
    (['sans', 'serif', 'mono'] as const)
      .map((k) => `<optgroup label="${k === 'sans' ? 'Sans serif' : k === 'serif' ? 'Serif' : 'Monospace'}">${TYPEFACES.filter((t) => t.kind === k)
        .map((t) => `<option value="${t.id}">${t.name}</option>`)
        .join('')}</optgroup>`)
      .join('') + `<!--${role}-->`;
  const colorRow = (key: ColorKey, label: string) => `
    <div class="ins-row color-row">
      <span class="ins-row-label">${label}</span>
      <button class="swatch" data-color="${key}" data-mode="0" aria-label="${label} color, light"></button>
      <button class="swatch" data-color="${key}" data-mode="1" aria-label="${label} color, dark"></button>
    </div>`;
  return `
    <div class="ins-head"><h2>Design</h2><button class="icon-btn" data-act="close-inspector" aria-label="Close">${icons.close}</button></div>
    <div class="ins-tabs seg full" role="tablist">
      <button role="tab" data-tab="themes">Themes</button><button role="tab" data-tab="style">Style</button><button role="tab" data-tab="slide">Slide</button>
    </div>
    <div class="ins-scroll">
      <section class="ins-group" data-pane="themes">
        <div class="theme-grid">
          ${THEME_GROUPS.map(
            (g) => `<div class="tg-label">${g}</div><div class="tg-row">${THEMES.filter((t) => t.group === g)
              .map((t) => `<button class="theme-tile" data-theme="${t.id}" aria-pressed="false" title="${esc(t.description)}"><div class="frame"></div><span>${t.name}</span></button>`)
              .join('')}</div>`,
          ).join('')}
        </div>
        <p class="ins-hint theme-desc"></p>
      </section>

      <section class="ins-group" data-pane="style">
        <div class="ins-label">Fonts</div>
        <label class="ins-row"><span class="ins-row-label">Title</span><select class="ins-select" data-font="titleFont">${fontOptions('title')}</select></label>
        <label class="ins-row"><span class="ins-row-label">Body</span><select class="ins-select" data-font="bodyFont">${fontOptions('body')}</select></label>
        <div class="ins-row"><span class="ins-row-label">Size</span>
          <div class="seg full">${['S', 'M', 'L', 'XL'].map((z) => `<button data-size="${z}">${z}</button>`).join('')}</div>
        </div>
      </section>

      <section class="ins-group" data-pane="style">
        <div class="ins-label">Colors</div>
        <div class="ins-row"><span class="ins-row-label">Appearance</span>
          <div class="seg full"><button data-appearance="light">Light</button><button data-appearance="dark">Dark</button></div>
        </div>
        <div class="ins-row color-head"><span></span><span>Light</span><span>Dark</span></div>
        ${colorRow('titleColor', 'Titles')}
        ${colorRow('bodyColor', 'Body')}
        ${colorRow('background', 'Background')}
        <div class="ins-row"><span></span><button class="ins-btn" data-act="reset-colors">Reset colors</button></div>
      </section>

      <section class="ins-group" data-pane="style">
        <div class="ins-label ins-label-row">Header &amp; footer <button class="ins-link" data-act="reset-slots">Reset</button></div>
        <div class="hf-grid" role="group" aria-label="Header and footer slots">
          ${[0, 1, 2].map((i) => `<button class="hf-slot" data-slot="header:${i}"></button>`).join('')}
          <div class="hf-body"></div>
          ${[0, 1, 2].map((i) => `<button class="hf-slot" data-slot="footer:${i}"></button>`).join('')}
        </div>
        <div class="hf-editor">
          <select class="ins-select hf-preset" aria-label="Slot content">
            ${SLOT_PRESETS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')}
            <option value="__custom">Custom text…</option>
          </select>
          <input class="ins-input hf-text" type="text" placeholder="Text, or {title} {number} {count} {date}" />
        </div>
      </section>

      <section class="ins-group" data-pane="style">
        <div class="ins-label">Aspect ratio</div>
        <div class="seg full">
          <button data-aspect="16:9">16:9</button><button data-aspect="16:10">16:10</button><button data-aspect="4:3">4:3</button><button data-aspect="9:16">9:16</button>
        </div>
      </section>

      <section class="ins-group" data-pane="slide">
        <div class="ins-label">This slide's layout</div>
        <select class="ins-select layout-select" aria-label="Layout for this slide">
          <option value="auto">Auto</option>${LAYOUTS.map((l) => `<option value="${l}">${cap(l)}</option>`).join('')}
        </select>
        <p class="ins-hint">Auto picks a layout from your content. Choosing one adds a <code>// layout:</code> line to the slide.</p>
      </section>

      <section class="ins-group syntax" data-pane="slide">
        <div class="ins-label">Markdown guide</div>
        <dl>
          <dt><code>---</code></dt><dd>Start a new slide</dd>
          <dt><code># Title</code></dt><dd>Headings always show on the slide</dd>
          <dt><code>⇥ Text</code></dt><dd>Press Tab at the start of a line to show it on the slide</dd>
          <dt><code>Text</code></dt><dd>Lines without a tab are speaker notes</dd>
          <dt><code>![](url)</code></dt><dd>Images on their own line become content blocks</dd>
          <dt><code>### A</code> <code>### B</code></dt><dd>Repeated subheadings become columns</dd>
          <dt><code>#### Act one</code> <code>## Title</code></dt><dd>A heading right above a bigger one becomes a small label</dd>
          <dt><code>###### Note</code></dt><dd>At the end of a slide: a footnote</dd>
          <dt><code>// dark</code></dt><dd>Show this slide dark (or <code>// light</code>, <code>// invert</code>)</dd>
          <dt><code>// note</code></dt><dd>Comment, hidden everywhere</dd>
          <dt><code>⇥ &gt; Quote</code></dt><dd>A quote alone gets the quote layout</dd>
          <dt><code>==text==</code></dt><dd>Highlight</dd>
          <dt><code>m^2</code> <code>H~2~O</code></dt><dd>Superscript and subscript</dd>
          <dt><code>- [ ]</code> <code>- [x]</code></dt><dd>Task list</dd>
          <dt><code>Term</code> <code>: Definition</code></dt><dd>Definition list</dd>
          <dt><code>[^Note]</code></dt><dd>Footnote, shown at the bottom of the slide</dd>
          <dt><code>$x^2$</code> <code>$$…$$</code></dt><dd>Math</dd>
        </dl>
      </section>
    </div>
    <div class="color-pop" hidden role="dialog" aria-label="Choose a color"></div>`;
}

export class Inspector {
  private root: HTMLElement;
  private host: InspectorHost;
  private thumbKey = '';
  private slot = 'footer:0';
  private pop: HTMLElement;
  private popTarget: { key: ColorKey; mode: 0 | 1 } | null = null;
  private tab = 'themes';

  constructor(root: HTMLElement, host: InspectorHost) {
    this.root = root;
    this.host = host;
    root.innerHTML = inspectorHTML();
    this.pop = root.querySelector('.color-pop')!;
    try {
      this.tab = localStorage.getItem('cue.inspectorTab') || 'themes';
    } catch {
      /* ignore */
    }
    this.showTab(this.tab);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('input', (e) => this.onInput(e));
    document.addEventListener('mousedown', (e) => {
      if (!this.pop.hidden && !this.pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('.swatch')) this.closePop();
    });
  }

  showTab(tab: string): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== tab));
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.root.querySelector('.ins-scroll')!.scrollTop = 0;
    this.closePop();
    try {
      localStorage.setItem('cue.inspectorTab', tab);
    } catch {
      /* ignore */
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /* -------------------------------------------------------------- */

  sync(): void {
    if (!this.open) return;
    const s = this.host.settings();
    const theme = getTheme(s.theme);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;

    this.syncThumbs(s);
    this.root.querySelectorAll<HTMLElement>('.theme-tile').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.theme === theme.id)));
    q('.theme-desc').textContent = `${theme.name}: ${theme.description}`;

    // Fonts
    this.root.querySelectorAll<HTMLSelectElement>('[data-font]').forEach((sel) => {
      const key = sel.dataset.font as 'titleFont' | 'bodyFont';
      const themeFace = getTypeface(key === 'titleFont' ? theme.display : theme.body);
      sel.options[0].textContent = `Theme default — ${themeFace?.name ?? 'Theme'}`;
      sel.value = s[key] ?? '';
    });
    this.pressed('[data-size]', (b) => b.dataset.size === s.size);

    // Colors
    this.pressed('[data-appearance]', (b) => b.dataset.appearance === s.appearance);
    this.root.querySelectorAll<HTMLElement>('.swatch').forEach((sw) => {
      const key = sw.dataset.color as ColorKey;
      const mode = Number(sw.dataset.mode) as 0 | 1;
      const value = this.effective(s, key, mode);
      sw.style.setProperty('--sw', previewCSS(value));
      sw.classList.toggle('is-custom', !!s[key][mode]);
      sw.classList.toggle('is-active-mode', (mode === 1) === (s.appearance === 'dark'));
      sw.title = `${s[key][mode] ? 'Custom' : 'Theme'}: ${getPattern(value)?.name ?? value}`;
    });

    // Header & footer
    const header = s.header ?? theme.header;
    const footer = s.footer ?? theme.footer;
    const ctx = { title: this.host.deckTitle() || 'Title', index: this.host.current(), total: this.host.total() };
    this.root.querySelectorAll<HTMLElement>('.hf-slot').forEach((b) => {
      const [where, i] = b.dataset.slot!.split(':');
      const tpl = (where === 'header' ? header : footer)[Number(i)] ?? '';
      b.textContent = tpl ? fillSlot(tpl, ctx) : '';
      b.title = tpl || 'Empty';
      b.setAttribute('aria-pressed', String(b.dataset.slot === this.slot));
      b.setAttribute('aria-label', `${where} ${['left', 'center', 'right'][Number(i)]}: ${tpl || 'empty'}`);
    });
    const [where, i] = this.slot.split(':');
    const cur = (where === 'header' ? header : footer)[Number(i)] ?? '';
    const preset = SLOT_PRESETS.some((p) => p.value === cur) ? cur : '__custom';
    q<HTMLSelectElement>('.hf-preset').value = preset;
    const text = q<HTMLInputElement>('.hf-text');
    if (document.activeElement !== text) text.value = cur;
    text.hidden = preset !== '__custom';

    this.pressed('[data-aspect]', (b) => b.dataset.aspect === s.aspect);
    q<HTMLSelectElement>('.layout-select').value = this.host.slide().layoutHint ?? 'auto';
  }

  /** Theme thumbnails show the current slide in each theme's own defaults. */
  private syncThumbs(s: Settings): void {
    const src = this.host.slide();
    const key = JSON.stringify([src.visibleMd, src.layoutHint, src.index, s.aspect, this.host.deckTitle()]);
    if (key === this.thumbKey) return;
    this.thumbKey = key;
    this.root.querySelectorAll<HTMLElement>('.theme-tile').forEach((tile) => {
      const t = getTheme(tile.dataset.theme!);
      const settings: Settings = { ...s, theme: t.id, appearance: t.defaultAppearance, titleFont: null, bodyFont: null, size: 'M', titleColor: [null, null], bodyColor: [null, null], background: [null, null], header: null, footer: null };
      const node = renderSlide(src, { settings, deckTitle: this.host.deckTitle(), total: this.host.total() });
      fit(node);
      mount(tile.querySelector('.frame')!, node, settings);
    });
  }

  invalidateThumbs(): void {
    this.thumbKey = '';
  }

  private pressed(sel: string, test: (b: HTMLElement) => boolean): void {
    this.root.querySelectorAll<HTMLElement>(sel).forEach((b) => b.setAttribute('aria-pressed', String(test(b))));
  }

  private effective(s: Settings, key: ColorKey, mode: 0 | 1): string {
    const own = s[key][mode];
    if (own) return own;
    const p = getTheme(s.theme)[mode ? 'dark' : 'light'];
    if (key === 'background') return p.bg;
    if (key === 'bodyColor') return p.fg;
    return s.bodyColor[mode] ?? p.title ?? p.fg;
  }

  /* -------------------------------------------------------------- */

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('button');
    if (!btn) return;
    if (btn.dataset.tab) {
      this.showTab(btn.dataset.tab);
    } else if (btn.classList.contains('theme-tile')) {
      const theme = getTheme(btn.dataset.theme!);
      this.host.update({ theme: theme.id, appearance: theme.defaultAppearance, titleFont: null, bodyFont: null, titleColor: [null, null], bodyColor: [null, null], background: [null, null] });
    } else if (btn.dataset.size) {
      this.host.update({ size: btn.dataset.size as Settings['size'] });
    } else if (btn.dataset.appearance) {
      this.host.update({ appearance: btn.dataset.appearance as Settings['appearance'] });
    } else if (btn.dataset.aspect) {
      this.host.update({ aspect: btn.dataset.aspect as Settings['aspect'] });
    } else if (btn.classList.contains('swatch')) {
      this.openPop(btn, btn.dataset.color as ColorKey, Number(btn.dataset.mode) as 0 | 1);
    } else if (btn.dataset.act === 'reset-colors') {
      this.host.update({ titleColor: [null, null], bodyColor: [null, null], background: [null, null] });
    } else if (btn.dataset.act === 'reset-slots') {
      this.host.update({ header: null, footer: null });
    } else if (btn.dataset.slot) {
      this.slot = btn.dataset.slot;
      this.sync();
      const sel = this.root.querySelector<HTMLSelectElement>('.hf-preset')!;
      sel.focus();
    } else if (btn.dataset.pick !== undefined && this.popTarget) {
      this.setColor(this.popTarget.key, this.popTarget.mode, btn.dataset.pick || null);
      this.closePop();
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.matches('[data-font]')) {
      const sel = t as HTMLSelectElement;
      this.host.update({ [sel.dataset.font!]: sel.value || null } as Partial<Settings>);
    } else if (t.matches('.layout-select')) {
      this.host.setLayout((t as HTMLSelectElement).value);
    } else if (t.matches('.hf-preset')) {
      const v = (t as HTMLSelectElement).value;
      if (v === '__custom') {
        const input = this.root.querySelector<HTMLInputElement>('.hf-text')!;
        input.hidden = false;
        input.focus();
        return;
      }
      this.setSlot(v);
    } else if (t.matches('.pop-custom')) {
      if (this.popTarget) this.setColor(this.popTarget.key, this.popTarget.mode, (t as HTMLInputElement).value.toUpperCase());
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLElement;
    if (t.matches('.hf-text')) this.setSlot((t as HTMLInputElement).value);
  }

  private setSlot(value: string): void {
    const s = this.host.settings();
    const theme = getTheme(s.theme);
    const [where, i] = this.slot.split(':') as ['header' | 'footer', string];
    const slots = [...(s[where] ?? theme[where])];
    slots[Number(i)] = value.replace(/\|/g, '/');
    this.host.update({ [where]: slots } as Partial<Settings>);
  }

  private setColor(key: ColorKey, mode: 0 | 1, value: string | null): void {
    const pair = [...this.host.settings()[key]] as ColorPair;
    pair[mode] = value;
    this.host.update({ [key]: pair } as Partial<Settings>);
  }

  /* -------------------------------------------------------------- */
  /* Color popover                                                    */
  /* -------------------------------------------------------------- */

  private openPop(anchor: HTMLElement, key: ColorKey, mode: 0 | 1): void {
    this.popTarget = { key, mode };
    const s = this.host.settings();
    const current = s[key][mode];
    const patterns = (key === 'background' ? BG_PATTERNS : TEXT_PATTERNS).map((id) => PATTERNS.find((p) => p.id === id)!);
    const sw = (value: string, label: string) =>
      `<button class="pop-sw${current === value ? ' is-on' : ''}" data-pick="${value}" style="--sw:${previewCSS(value)}" title="${esc(label)}" aria-label="${esc(label)}"></button>`;
    const hex = current && !current.startsWith('pattern:') ? current : '#FFFCF0';
    this.pop.innerHTML = `
      <div class="pop-head">${key === 'background' ? 'Background' : key === 'titleColor' ? 'Titles' : 'Body'} · ${mode ? 'Dark' : 'Light'}</div>
      <button class="pop-default${current ? '' : ' is-on'}" data-pick="">Theme default</button>
      <div class="pop-label">Flexoki</div>
      <div class="pop-grid">${SWATCH_ROWS.map((r) => r.colors.map((c) => sw(c, c)).join('')).join('')}</div>
      <div class="pop-label">${key === 'background' ? 'Changes every slide' : 'Changes every slide'}</div>
      <div class="pop-patterns">${patterns.map((p) => sw(`pattern:${p.id}`, p.name)).join('')}</div>
      <label class="pop-custom-row"><span>Custom</span><input class="pop-custom" type="color" value="${/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#FFFCF0'}" /></label>`;
    this.pop.hidden = false;
    const ar = anchor.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    const top = Math.min(ar.bottom - rr.top + 6, rr.height - this.pop.offsetHeight - 8);
    this.pop.style.top = `${Math.max(8, top)}px`;
  }

  private closePop(): void {
    this.pop.hidden = true;
    this.popTarget = null;
  }
}
