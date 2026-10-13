import type { Settings } from './parser';
import { mountContain, activate } from './render';

/**
 * Fullscreen audience view. Lives in the main window as an overlay so it can
 * reuse the already-rendered slides.
 */
export class Stage {
  private root: HTMLElement;
  private layers: HTMLElement;
  private hud: HTMLElement;
  private counter: HTMLElement;
  private slides: HTMLElement[] = [];
  private settings!: Settings;
  private hudTimer = 0;
  /** Stops what runs on the slide being shown: timers, count-ups, webviews (activate) */
  private stopActive: () => void = () => {};
  index = 0;
  /** Decks from a shared link ask before loading a webview */
  askWeb = false;
  isOpen = false;
  onChange: (index: number) => void = () => {};
  onClose: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'stage';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="stage-layers"></div>
      <div class="stage-hud" role="toolbar" aria-label="Presentation controls">
        <button class="hud-btn" data-act="prev" aria-label="Previous slide"><svg viewBox="0 0 20 20"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg></button>
        <span class="hud-count" aria-live="polite"></span>
        <button class="hud-btn" data-act="next" aria-label="Next slide"><svg viewBox="0 0 20 20"><path d="M7.5 4.5 13 10l-5.5 5.5"/></svg></button>
        <span class="hud-sep"></span>
        <button class="hud-btn" data-act="close" aria-label="Exit presentation"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15"/></svg></button>
      </div>`;
    this.layers = this.root.querySelector('.stage-layers')!;
    this.hud = this.root.querySelector('.stage-hud')!;
    this.counter = this.root.querySelector('.hud-count')!;
    document.body.appendChild(this.root);

    this.hud.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      e.stopPropagation();
      if (act === 'prev') this.go(this.index - 1);
      if (act === 'next') this.go(this.index + 1);
      if (act === 'close') this.close();
    });
    this.layers.addEventListener('click', (e) => {
      const x = (e as MouseEvent).clientX / window.innerWidth;
      if ((e.target as HTMLElement).closest('a, button')) return;
      // Using a webview: a click beside it hands control back to the slides
      if (this.interacting) return this.interact(false);
      this.go(this.index + (x < 0.3 ? -1 : 1));
    });
    this.root.addEventListener('mousemove', () => this.pokeHud());
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isOpen && this.wantsFullscreen) this.close();
    });
  }

  private wantsFullscreen = false;
  private timing = false;
  private timerStart = 0;
  /** True right after open(): the first slide plays its entrance too */
  private fresh = false;
  private interacting = false;

  open(slides: HTMLElement[], settings: Settings, index: number, fullscreen = true): void {
    this.slides = slides;
    this.settings = settings;
    this.isOpen = true;
    this.root.hidden = false;
    this.root.dataset.appearance = settings.appearance;
    document.documentElement.classList.add('is-presenting');
    this.wantsFullscreen = fullscreen;
    this.fresh = true;
    if (fullscreen && !document.fullscreenElement) {
      this.root.requestFullscreen?.().catch(() => (this.wantsFullscreen = false));
    }
    this.go(index, true);
    this.pokeHud();
  }

  update(slides: HTMLElement[], settings: Settings): void {
    if (!this.isOpen) return;
    this.slides = slides;
    this.settings = settings;
    this.go(Math.min(this.index, slides.length - 1), true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timing = false;
    this.root.hidden = true;
    this.interact(false);
    this.stopActive();
    this.layers.replaceChildren();
    document.documentElement.classList.remove('is-presenting');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.onClose();
  }

  go(i: number, instant = false, silent = false): void {
    if (!this.slides.length) return;
    const next = Math.max(0, Math.min(this.slides.length - 1, i));
    const changed = next !== this.index;
    this.index = next;
    const slide = this.slides[next].cloneNode(true) as HTMLElement;
    const layer = document.createElement('div');
    layer.className = 'stage-layer';
    this.layers.appendChild(layer);
    mountContain(layer, slide, this.settings);
    // A timer restarts when its slide comes back; an edit while presenting keeps it running
    if (changed || !this.timing) this.timerStart = performance.now();
    this.timing = true;
    this.interact(false);
    this.stopActive();
    this.stopActive = activate(slide, {
      start: this.timerStart,
      // Count-ups play when a slide arrives, not when an edit re-renders it
      animate: changed || this.fresh,
      onDone: () => {
        if (this.isOpen && this.index === next) this.go(next + 1);
      },
      web: this.askWeb ? 'ask' : 'live',
    });
    this.fresh = false;
    const bg = getComputedStyle(slide).getPropertyValue('--bg');
    this.root.style.setProperty('--stage-bg', bg || '#000');
    const old = Array.from(this.layers.children).filter((c) => c !== layer) as HTMLElement[];
    if (instant || !changed) {
      old.forEach((o) => o.remove());
    } else {
      layer.classList.add('is-entering');
      requestAnimationFrame(() => layer.classList.remove('is-entering'));
      setTimeout(() => old.forEach((o) => o.remove()), 260);
    }
    this.counter.textContent = `${next + 1} / ${this.slides.length}`;
    if (changed && !silent) this.onChange(next);
  }

  /**
   * A live webview sits behind a shield, so clicks and keys move the slides.
   * I lifts it (and focuses the page); a click beside the page or Esc puts it back.
   * While the page has focus its keys go to the page, so Esc only works after a click outside.
   */
  private interact(on: boolean): void {
    const frame = this.layers.lastElementChild?.querySelector<HTMLIFrameElement>('.s-web.is-live .s-web-frame');
    on = on && !!frame;
    this.interacting = on;
    this.root.classList.toggle('is-interacting', on);
    if (on) frame!.focus();
    else if (document.activeElement instanceof HTMLIFrameElement) (document.activeElement as HTMLElement).blur();
  }

  private pokeHud(): void {
    this.root.classList.add('show-hud');
    clearTimeout(this.hudTimer);
    this.hudTimer = window.setTimeout(() => this.root.classList.remove('show-hud'), 1800);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const k = e.key;
    let handled = true;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'j', 'l'].includes(k)) this.go(this.index + (e.shiftKey && k === ' ' ? -1 : 1));
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'k', 'h'].includes(k)) this.go(this.index - 1);
    else if (k === 'Home') this.go(0);
    else if (k === 'End') this.go(this.slides.length - 1);
    else if (k === 'Escape') {
      if (this.interacting) this.interact(false);
      else this.close();
    } else if ((k === 'i' || k === 'I') && !e.metaKey && !e.ctrlKey) this.interact(!this.interacting);
    else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.();
      this.wantsFullscreen = false;
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}
