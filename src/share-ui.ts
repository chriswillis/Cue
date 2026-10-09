import { encodeDeck, linkLevel, shareSupported, PBKDF2_ITERATIONS, type SharedDeck } from './share';
import { icons } from './icons';

/**
 * Share dialog: builds a self-contained link to the current deck, with an
 * optional password, and explains when a link is too long to send safely.
 */

export interface ShareHost {
  deck(): SharedDeck;
  download(): void;
}

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtNum = (n: number) => n.toLocaleString();

const LEVEL_TEXT = {
  ok: 'Short enough for email, chat and text messages.',
  long: 'This is a long link. Some email, Slack and SMS apps cut links this long, so test it first or send the .md file.',
  'too-long': 'Too long for most email and chat apps. It still opens when pasted into a browser. To send it, download the .md file instead.',
  max: 'Too long for a link. Download the .md file and send that instead.',
} as const;

export function shareBaseURL(): string {
  return `${location.origin}${location.pathname}`;
}

function isLocal(): boolean {
  return /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === 'file:';
}

export class ShareDialog {
  private root: HTMLElement;
  private host: ShareHost;
  private anchor: HTMLElement;
  private seq = 0;
  private timer = 0;
  private url = '';

  constructor(anchor: HTMLElement, host: ShareHost) {
    this.anchor = anchor;
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'share-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Share a link');
    this.root.innerHTML = `
      <div class="sp-head"><h3>Share a link</h3><button class="icon-btn" data-sp="close" aria-label="Close">${icons.close}</button></div>
      <p class="sp-lede">The deck is compressed and encrypted in this browser and stored inside the link. Nothing is uploaded.</p>
      <label class="switch"><input type="checkbox" class="sp-pw-toggle" /><span class="track"></span><span>Protect with a password</span></label>
      <div class="sp-pw" hidden>
        <div class="sp-pw-row">
          <input class="ins-input sp-pw-input" type="password" placeholder="Password" autocomplete="new-password" spellcheck="false" />
          <button class="ins-btn sp-pw-show" type="button" data-sp="show">Show</button>
        </div>
        <p class="sp-hint">Send the password separately from the link. If it's lost, the deck can't be recovered.</p>
      </div>
      <div class="sp-link">
        <input class="ins-input sp-url" readonly aria-label="Share link" />
        <button class="btn primary sp-copy" data-sp="copy">Copy</button>
      </div>
      <div class="sp-meter" aria-hidden="true"><span></span></div>
      <div class="sp-meta"></div>
      <p class="sp-note"></p>
      <p class="sp-local" hidden>This link points to <strong>${location.host || 'a local file'}</strong>, so it only opens on this computer. Host the app (<code>npm run build</code>) to share with others.</p>
      <p class="sp-images" hidden>Images are linked by address, not embedded. People can only see them if the images are online.</p>
      <div class="sp-actions">
        <a class="sp-test" target="_blank" rel="noopener noreferrer">Test in a new tab</a>
        <button class="ins-btn" data-sp="download">Download .md</button>
      </div>`;
    document.body.appendChild(this.root);

    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-sp]')?.dataset.sp;
      if (act === 'close') this.close();
      if (act === 'copy') this.copy();
      if (act === 'download') this.host.download();
      if (act === 'show') {
        const input = this.q<HTMLInputElement>('.sp-pw-input');
        input.type = input.type === 'password' ? 'text' : 'password';
        (e.target as HTMLElement).textContent = input.type === 'password' ? 'Show' : 'Hide';
      }
    });
    this.q('.sp-pw-toggle').addEventListener('change', () => {
      const on = this.q<HTMLInputElement>('.sp-pw-toggle').checked;
      this.q('.sp-pw').hidden = !on;
      if (on) this.q<HTMLInputElement>('.sp-pw-input').focus();
      this.generate();
    });
    this.q('.sp-pw-input').addEventListener('input', () => {
      clearTimeout(this.timer);
      this.setPending('Encrypting…');
      this.timer = window.setTimeout(() => this.generate(), 450);
    });
    this.q('.sp-url').addEventListener('focus', (e) => (e.target as HTMLInputElement).select());
    document.addEventListener('mousedown', (e) => {
      if (!this.root.hidden && !this.root.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
    window.addEventListener('resize', () => this.place());
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.root.hidden = false;
    this.anchor.setAttribute('aria-expanded', 'true');
    this.q('.sp-local').hidden = !isLocal();
    this.q('.sp-images').hidden = !/!\[[^\]]*\]\(/.test(this.host.deck().markdown);
    this.place();
    if (!shareSupported()) {
      this.setPending('');
      this.q('.sp-note').textContent = 'This browser can’t create share links. Use a current version of Chrome, Edge, Safari or Firefox.';
      return;
    }
    this.generate();
  }

  close(): void {
    this.root.hidden = true;
    this.anchor.setAttribute('aria-expanded', 'false');
  }

  private place(): void {
    if (this.root.hidden) return;
    const r = this.anchor.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    this.root.style.width = `${width}px`;
    this.root.style.top = `${r.bottom + 8}px`;
    this.root.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, r.right - width))}px`;
  }

  private setPending(text: string): void {
    this.url = '';
    this.q<HTMLInputElement>('.sp-url').value = text;
    this.q<HTMLButtonElement>('.sp-copy').disabled = true;
    this.q('.sp-test').removeAttribute('href');
  }

  private async generate(): Promise<void> {
    const id = ++this.seq;
    const usePw = this.q<HTMLInputElement>('.sp-pw-toggle').checked;
    const pw = this.q<HTMLInputElement>('.sp-pw-input').value;
    if (usePw && !pw) {
      this.setPending('Type a password to create the link');
      this.q('.sp-meta').textContent = '';
      this.q('.sp-note').textContent = '';
      this.meter(0, 'ok');
      return;
    }
    this.setPending(usePw ? 'Encrypting…' : 'Creating link…');
    const deck = this.host.deck();
    try {
      const res = await encodeDeck(deck, usePw ? pw : undefined);
      if (id !== this.seq) return; // a newer request superseded this one
      const url = `${shareBaseURL()}#${res.fragment}`;
      const level = linkLevel(url.length);
      this.url = level === 'max' ? '' : url;
      this.q<HTMLInputElement>('.sp-url').value = level === 'max' ? 'Too long for a link' : url;
      this.q<HTMLButtonElement>('.sp-copy').disabled = level === 'max';
      this.q<HTMLButtonElement>('.sp-copy').textContent = 'Copy';
      const test = this.q<HTMLAnchorElement>('.sp-test');
      if (this.url) test.href = this.url;
      else test.removeAttribute('href');
      this.q('.sp-meta').textContent = `${fmtNum(url.length)} characters · ${fmtBytes(res.rawBytes)} compressed to ${fmtBytes(res.compressedBytes)}${usePw ? ` · PBKDF2 ×${fmtNum(PBKDF2_ITERATIONS)}` : ''}`;
      this.q('.sp-note').textContent = LEVEL_TEXT[level];
      this.meter(url.length, level);
    } catch (e) {
      if (id !== this.seq) return;
      this.setPending('');
      this.q('.sp-note').textContent = (e as Error).message;
    }
  }

  private meter(length: number, level: string): void {
    const bar = this.q('.sp-meter');
    bar.dataset.level = level;
    // Full bar = 8,000 characters, roughly where chat and email apps give up
    const pct = Math.min(100, (length / 8000) * 100);
    (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
    this.q('.sp-note').dataset.level = level;
  }

  private async copy(): Promise<void> {
    if (!this.url) return;
    const btn = this.q<HTMLButtonElement>('.sp-copy');
    try {
      await navigator.clipboard.writeText(this.url);
    } catch {
      const input = this.q<HTMLInputElement>('.sp-url');
      input.focus();
      input.select();
      document.execCommand('copy');
    }
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = 'Copy'), 1600);
  }
}

/* ------------------------------------------------------------------ */
/* Modal used when opening a link                                       */
/* ------------------------------------------------------------------ */

/** Ask for a password. Resolves to null if the person chooses not to open the deck. */
export function askPassword(error?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const m = modal(`
      <h3>This deck is password protected</h3>
      <p>Enter the password you were given with the link.</p>
      <form class="sm-form">
        <input class="ins-input sm-pw" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" />
        <p class="sm-error" role="alert">${error ?? ''}</p>
        <div class="sm-actions">
          <button type="button" class="ins-btn" data-sm="cancel">Open my own deck</button>
          <button type="submit" class="btn primary">Open</button>
        </div>
      </form>`);
    const input = m.querySelector<HTMLInputElement>('.sm-pw')!;
    input.focus();
    m.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value) return;
      const btn = m.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      btn.textContent = 'Unlocking…';
      btn.disabled = true;
      m.remove();
      resolve(input.value);
    });
    m.querySelector('[data-sm="cancel"]')!.addEventListener('click', () => {
      m.remove();
      resolve(null);
    });
  });
}

export function showLinkError(message: string): Promise<void> {
  return new Promise((resolve) => {
    const m = modal(`
      <h3>This link couldn’t be opened</h3>
      <p>${message}</p>
      <div class="sm-actions"><button type="button" class="btn primary" data-sm="ok">Open my own deck</button></div>`);
    m.querySelector('[data-sm="ok"]')!.addEventListener('click', () => {
      m.remove();
      resolve();
    });
  });
}

function modal(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  wrap.innerHTML = `<div class="sm-card" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  return wrap;
}
