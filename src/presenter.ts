import { parse, type ParsedDoc } from './parser';
import { renderDeck, mount, renderNotes } from './render';

/**
 * Presenter view: a second window with your notes as a teleprompter, the
 * current and next slide, a timer and a clock. Kept in sync with the main
 * window over a BroadcastChannel.
 */

/**
 * Each editor tab talks to its own presenter window: the editor makes up an id
 * when it loads and passes it in the presenter's URL (#presenter&ch=…), so two
 * Cue tabs don't drive each other's presenter windows. This keeps tabs apart;
 * it isn't a security boundary (any page on this origin can read the decks).
 */
export const channelName = (id: string) => `cue-presenter:${id}`;

/** The presenter window's channel id, from its URL. */
function channelFromURL(): string {
  const id = new URLSearchParams(location.hash.slice(1)).get('ch') ?? '';
  return /^[\w-]{1,64}$/.test(id) ? id : 'default';
}

/**
 * Messages between the editor window and the presenter window.
 *   hello  presenter → editor: "I just opened, send me everything"
 *   state  editor → presenter: the full text and current slide
 *   goto   either way: the current slide changed
 *   bye    editor → presenter: the editor window is closing
 */
export type Msg =
  | { type: 'hello' }
  | { type: 'state'; text: string; index: number }
  | { type: 'goto'; index: number }
  | { type: 'bye' };

export function bootPresenter(): void {
  document.title = 'Presenter · Cue';
  document.documentElement.classList.add('presenter-mode');
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="pv">
      <header class="pv-bar">
        <div class="pv-timer">
          <span class="pv-elapsed" aria-label="Elapsed time">00:00</span>
          <button class="pv-btn" data-act="toggle" aria-label="Pause timer"><svg viewBox="0 0 20 20"><path class="i-pause" d="M7 5v10M13 5v10"/><path class="i-play" d="M7 4.5v11l9-5.5z"/></svg></button>
          <button class="pv-btn" data-act="reset" aria-label="Reset timer"><svg viewBox="0 0 20 20"><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 4v3h3"/></svg></button>
        </div>
        <div class="pv-count"><span class="pv-cur">1</span><span class="pv-of">/ 1</span></div>
        <div class="pv-right">
          <button class="pv-btn" data-act="smaller" aria-label="Smaller notes">A−</button>
          <button class="pv-btn" data-act="bigger" aria-label="Larger notes">A+</button>
          <span class="pv-clock"></span>
        </div>
      </header>
      <main class="pv-main">
        <section class="pv-notes" aria-label="Speaker notes"><div class="pv-notes-inner"></div></section>
        <aside class="pv-side">
          <div class="pv-label">Now</div>
          <div class="frame pv-frame pv-current"></div>
          <div class="pv-label">Next</div>
          <div class="frame pv-frame pv-next"></div>
          <nav class="pv-nav">
            <button class="pv-btn wide" data-act="prev">← Previous</button>
            <button class="pv-btn wide primary" data-act="next">Next →</button>
          </nav>
        </aside>
      </main>
      <div class="pv-waiting">Waiting for the editor window…</div>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => app.querySelector(s) as T;
  const ch = new BroadcastChannel(channelName(channelFromURL()));
  let parsed: ParsedDoc | null = null;
  let slides: HTMLElement[] = [];
  let index = 0;
  let notesSize = Number(localStorageGet('cue.notesSize') ?? 30);
  let running = true;
  let elapsed = 0;
  let lastTick = performance.now();

  const notesEl = $('.pv-notes-inner');
  const applyNotesSize = () => notesEl.style.setProperty('--notes-size', `${notesSize}px`);
  applyNotesSize();

  function show(i: number, broadcast = false) {
    if (!parsed) return;
    index = Math.max(0, Math.min(parsed.slides.length - 1, i));
    $('.pv-cur').textContent = String(index + 1);
    $('.pv-of').textContent = `/ ${parsed.slides.length}`;
    mount($('.pv-current'), slides[index].cloneNode(true) as HTMLElement, parsed.settings);
    const next = slides[index + 1];
    const nextFrame = $('.pv-next');
    if (next) mount(nextFrame, next.cloneNode(true) as HTMLElement, parsed.settings);
    else {
      nextFrame.style.aspectRatio = '';
      nextFrame.innerHTML = '<div class="pv-end">End of presentation</div>';
    }
    const notes = parsed.slides[index].notesMd;
    notesEl.innerHTML = notes ? renderNotes(notes) : '<p class="pv-empty">No notes for this slide.</p>';
    $('.pv-notes').scrollTop = 0;
    if (broadcast) ch.postMessage({ type: 'goto', index } satisfies Msg);
  }

  ch.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.type === 'state') {
      parsed = parse(m.text);
      slides = renderDeck(parsed.slides, { settings: parsed.settings, deckTitle: parsed.title });
      app.classList.add('is-ready');
      show(m.index);
    } else if (m.type === 'goto' && m.index !== index) {
      show(m.index);
    } else if (m.type === 'bye') {
      window.close();
    }
  };
  ch.postMessage({ type: 'hello' } satisfies Msg);

  app.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest('button')?.dataset.act;
    if (act === 'next') show(index + 1, true);
    if (act === 'prev') show(index - 1, true);
    if (act === 'toggle') {
      running = !running;
      lastTick = performance.now();
      app.classList.toggle('is-paused', !running);
    }
    if (act === 'reset') elapsed = 0;
    if (act === 'bigger' || act === 'smaller') {
      notesSize = Math.max(16, Math.min(64, notesSize + (act === 'bigger' ? 3 : -3)));
      localStorageSet('cue.notesSize', String(notesSize));
      applyNotesSize();
    }
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) show(index + 1, true);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) show(index - 1, true);
    else if (k === 'Home') show(0, true);
    else if (k === 'End' && parsed) show(parsed.slides.length - 1, true);
    else return;
    e.preventDefault();
  });

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  const tick = () => {
    const now = performance.now();
    if (running) elapsed += now - lastTick;
    lastTick = now;
    $('.pv-elapsed').textContent = fmt(elapsed);
    $('.pv-clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 500);
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
