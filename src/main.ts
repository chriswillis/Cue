import './fonts';
import './styles/app.css';
import './styles/slide.css';
import type { EditorView } from '@codemirror/view';
import { createEditor, getParsed, revealSlide, setText } from './editor';
import { serializeFrontMatter, type ParsedDoc, type Settings, type SlideSource } from './parser';
import { renderSlide, fit, mount, renderNotes, numberSections, ASPECTS } from './render';
import { Inspector } from './inspector';
import { injectThemeCSS, getTheme } from './themes';
import { FileStore, kvGet, kvSet, download, supportsFS, type Draft } from './storage';
import { Stage } from './present';
import { bootPresenter, CHANNEL, type Msg } from './presenter';
import { icons } from './icons';
import { slideColor } from './badges';
import { parseShareFragment, decodeDeck, encodeDeck, ShareError, type SharedDeck } from './share';
import { ShareDialog, askPassword, showLinkError } from './share-ui';
import sample from './sample.md?raw';

injectThemeCSS();

if (location.hash === '#presenter') {
  bootPresenter();
} else {
  boot();
}

const BLANK_DOC = `---
theme: swiss
appearance: light
aspect: 16:9
---

# Untitled

`;

async function boot() {
  const app = document.getElementById('app')!;
  app.innerHTML = shellHTML();
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => app.querySelector(s) as T;
  const shell = $('.shell');

  /* ---------------- shared links ---------------- */
  // A deck opened from a link lives only in this tab until it is saved, so
  // the recipient's own draft and files are never overwritten.
  const sharedDeck = await openSharedLink();
  let sharedMode = !!sharedDeck;

  /* ---------------- state ---------------- */
  const files = new FileStore();
  if (!sharedMode) await files.restore();
  const draft = sharedMode ? undefined : await kvGet<Draft>('draft');
  // Reopen the last draft; start with the sample deck when there is none (or it's empty).
  const initialText = sharedDeck?.markdown ?? (draft?.text?.trim() ? draft.text : sample);
  if (sharedDeck) files.name = sharedDeck.name;
  else if (draft?.name) files.name = draft.name;

  let parsed: ParsedDoc;
  let slides: HTMLElement[] = [];
  let current = 0;
  let view: EditorView;
  const cache = new Map<string, HTMLElement>();
  const stage = new Stage();
  const channel = new BroadcastChannel(CHANNEL);
  let inspector: Inspector | null = null;

  /* ---------------- rendering ---------------- */
  const keyFor = (s: SlideSource, p: ParsedDoc) =>
    JSON.stringify([s.visibleMd, s.layoutHint, s.look, s.index, p.title, p.settings]);

  function renderAll() {
    parsed = getParsed(view);
    const opts = { settings: parsed.settings, deckTitle: parsed.title, total: parsed.slides.length };
    const nextCache = new Map<string, HTMLElement>();
    slides = parsed.slides.map((s) => {
      const key = keyFor(s, parsed);
      let node = cache.get(key);
      if (!node) {
        node = renderSlide(s, opts);
        fit(node);
      }
      nextCache.set(key, node);
      return node;
    });
    numberSections(slides);
    cache.clear();
    nextCache.forEach((v, k) => cache.set(k, v));
    current = Math.min(current, slides.length - 1);
    shell.dataset.appearance = parsed.settings.appearance;
    renderStrip();
    renderPreview();
    if (shell.dataset.view === 'slides') renderOverview();
    inspector?.sync();
    stage.update(slides, parsed.settings);
  }

  let renderTimer = 0;
  const scheduleRender = (delay = 90) => {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderAll, delay);
  };

  // Re-measure once web fonts arrive, since metrics change.
  document.fonts?.addEventListener?.('loadingdone', () => {
    cache.clear();
    scheduleRender(30);
  });

  function renderStrip() {
    const strip = $('.strip-list');
    const scroll = strip.scrollTop;
    strip.replaceChildren(
      ...slides.map((node, i) => {
        const b = document.createElement('button');
        b.className = 'thumb' + (i === current ? ' is-current' : '');
        b.dataset.i = String(i);
        b.setAttribute('aria-label', `Slide ${i + 1}`);
        b.innerHTML = `<span class="thumb-num" style="--badge: ${slideColor(i)}">${i + 1}</span><div class="frame"></div>`;
        mount(b.querySelector('.frame')!, node.cloneNode(true) as HTMLElement, parsed.settings);
        return b;
      }),
    );
    strip.scrollTop = scroll;
  }

  function markCurrent() {
    app.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('is-current', Number((t as HTMLElement).dataset.i) === current));
    const cur = app.querySelector('.strip-list .thumb.is-current') as HTMLElement | null;
    cur?.scrollIntoView({ block: 'nearest' });
  }

  function renderPreview() {
    const node = slides[current];
    if (!node) return;
    const frame = $('.preview-frame');
    mount(frame, node.cloneNode(true) as HTMLElement, parsed.settings);
    // Size the frame to fit the available box in both dimensions
    const box = $('.preview-stage');
    const { w, h } = ASPECTS[parsed.settings.aspect];
    const fitFrame = () => {
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      const width = Math.min(bw, (bh * w) / h);
      frame.style.width = `${Math.floor(width)}px`;
    };
    fitFrame();
    ((box as any).__ro as ResizeObserver | undefined)?.disconnect();
    const ro = new ResizeObserver(fitFrame);
    ro.observe(box);
    (box as any).__ro = ro;

    const src = parsed.slides[current];
    $('.pm-pos').textContent = `${current + 1} of ${slides.length}`;
    $('.pm-layout').textContent = node.dataset.layout === 'blank' ? 'Empty slide' : `${cap(node.dataset.layout!)} layout${src.layoutHint ? '' : ' · auto'}`;
    $('.preview-notes').innerHTML = src.notesMd ? renderNotes(src.notesMd) : '<p class="muted">No speaker notes. Paragraphs without a tab become notes.</p>';
  }

  function renderOverview() {
    const grid = $('.overview-grid');
    grid.replaceChildren(
      ...slides.map((node, i) => {
        const b = document.createElement('button');
        b.className = 'ov-card' + (i === current ? ' is-current' : '');
        b.dataset.i = String(i);
        b.innerHTML = `<div class="frame"></div><span class="ov-num">${i + 1}</span>`;
        mount(b.querySelector('.frame')!, node.cloneNode(true) as HTMLElement, parsed.settings);
        return b;
      }),
    );
  }

  function goto(i: number, opts: { reveal?: boolean; broadcast?: boolean } = {}) {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    if (next === current && !opts.reveal) return;
    current = next;
    markCurrent();
    renderPreview();
    inspector?.sync();
    if (opts.reveal) revealSlide(view, current);
    if (opts.broadcast) channel.postMessage({ type: 'goto', index: current } satisfies Msg);
  }

  /* ---------------- editor ---------------- */
  let saveTimer = 0;
  let broadcastTimer = 0;
  view = createEditor($('.editor'), initialText, {
    onChange: (text) => {
      setStatus('Edited');
      scheduleRender();
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => autosave(text), 600);
      clearTimeout(broadcastTimer);
      broadcastTimer = window.setTimeout(() => channel.postMessage({ type: 'state', text, index: current } satisfies Msg), 300);
    },
    onCursorSlide: (i) => {
      if (slides.length) goto(i);
      else current = i;
    },
  });
  renderAll();
  setDocName();
  setStatus(sharedMode ? 'Opened from a link' : draft ? 'Restored' : supportsFS ? 'Not saved yet' : 'Draft in browser');
  $('.shared-pill').hidden = !sharedMode;

  /** Turn a shared deck into the person's own: it becomes the browser draft. */
  async function leaveSharedMode() {
    if (!sharedMode) return;
    sharedMode = false;
    const previous = await kvGet<Draft>('draft');
    if (previous) await kvSet('draft-previous', previous);
    clearHash();
    $('.shared-pill').hidden = true;
  }

  window.addEventListener('hashchange', () => {
    try {
      if (parseShareFragment(location.hash)) location.reload();
    } catch {
      location.reload();
    }
  });

  const shareDialog = new ShareDialog($('[data-act="share"]'), {
    deck: () => ({ name: files.name, markdown: view.state.doc.toString() }),
    download: () => download(files.name, view.state.doc.toString()),
  });

  async function autosave(text: string) {
    if (sharedMode) {
      setStatus('Shared deck · edits aren’t saved');
      return;
    }
    await kvSet('draft', { text, name: files.name, savedAt: Date.now() } satisfies Draft);
    if (files.handle && (await files.canWriteSilently())) {
      try {
        await files.write(text);
        setStatus('Saved');
        return;
      } catch {
        /* fall back to draft status */
      }
    }
    setStatus(files.handle ? 'Draft saved · ⌘S to write file' : 'Draft saved in browser');
  }

  function setStatus(s: string) {
    $('.doc-status').textContent = s;
  }
  /* ---------------- rename ---------------- */
  const nameInput = $<HTMLInputElement>('.doc-name-input');
  const nameButton = $<HTMLButtonElement>('.doc-name-text');
  const stripExt = (n: string) => n.replace(/\.(md|markdown|txt)$/i, '');

  function startRename() {
    nameInput.value = stripExt(files.name);
    nameButton.hidden = true;
    nameInput.hidden = false;
    sizeNameInput();
    nameInput.focus();
    nameInput.select();
  }
  function sizeNameInput() {
    nameInput.style.width = `${Math.max(6, Math.min(40, nameInput.value.length + 2))}ch`;
  }
  async function finishRename(commit: boolean) {
    if (nameInput.hidden) return;
    nameInput.hidden = true;
    nameButton.hidden = false;
    // File-name safe: no path separators or reserved characters
    const clean = nameInput.value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!commit || !clean || clean === stripExt(files.name)) return;
    const ext = /\.(md|markdown|txt)$/i.exec(files.name)?.[0] ?? '.md';
    const result = await files.rename(clean + ext);
    if (result === 'unsupported') {
      toast('This browser can’t rename the file on disk. Use Save as… to save it under a new name.');
      return;
    }
    setDocName();
    if (!sharedMode) await kvSet('draft', { text: view.state.doc.toString(), name: files.name, savedAt: Date.now() } satisfies Draft);
    toast(files.handle ? `Renamed file to ${files.name}` : `Renamed to ${stripExt(files.name)}`);
  }
  nameInput.addEventListener('input', sizeNameInput);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishRename(true);
      view.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finishRename(false);
      view.focus();
    }
  });
  nameInput.addEventListener('blur', () => finishRename(true));

  function setDocName() {
    $('.doc-name-text').textContent = files.name.replace(/\.(md|markdown|txt)$/i, '');
    document.title = `${files.name.replace(/\.(md|markdown|txt)$/i, '')} · Cue`;
  }

  /* ---------------- settings live in front matter ---------------- */
  function updateSettings(patch: Partial<Settings>) {
    const p = getParsed(view);
    const s = { ...p.settings, ...patch };
    const fm = serializeFrontMatter(s);
    const doc = view.state.doc;
    if (p.frontMatter) {
      view.dispatch({ changes: { from: 0, to: doc.line(p.frontMatter.to).to, insert: fm } });
    } else {
      view.dispatch({ changes: { from: 0, to: 0, insert: fm + '\n\n' } });
    }
    renderAll();
  }

  function setLayoutHint(layout: string) {
    const p = getParsed(view);
    const s = p.slides[current];
    const doc = view.state.doc;
    // Look for an existing layout comment inside the slide
    for (let ln = s.startLine; ln < s.endLine; ln++) {
      const line = doc.line(ln + 1);
      if (/^\s*\/\/\s*layout\s*:/i.test(line.text)) {
        const to = layout === 'auto' ? Math.min(line.to + 1, doc.length) : line.to;
        view.dispatch({ changes: { from: line.from, to, insert: layout === 'auto' ? '' : `// layout: ${layout}` } });
        renderAll();
        return;
      }
    }
    if (layout === 'auto') return;
    // Insert after leading blank lines of the slide
    let ln = s.startLine;
    while (ln < s.endLine - 1 && doc.line(ln + 1).text.trim() === '') ln++;
    const at = doc.line(Math.min(ln + 1, doc.lines)).from;
    view.dispatch({ changes: { from: at, insert: `// layout: ${layout}\n` } });
    renderAll();
  }

  /* ---------------- inspector ---------------- */
  inspector = new Inspector($('.inspector'), {
    settings: () => parsed.settings,
    slide: () => parsed.slides[current],
    deckTitle: () => parsed.title,
    total: () => slides.length,
    current: () => current,
    update: (patch) => updateSettings(patch),
    setLayout: (layout) => setLayoutHint(layout),
  });

  function toggleInspector(force?: boolean) {
    const ins = $('.inspector');
    const open = force ?? ins.hidden;
    ins.hidden = !open;
    $('[data-act="theme"]').setAttribute('aria-expanded', String(open));
    if (open) inspector?.sync();
  }

  /* ---------------- views ---------------- */
  function setView(v: 'write' | 'split' | 'slides') {
    shell.dataset.view = v;
    app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    if (v === 'slides') renderOverview();
    else {
      renderPreview();
      requestAnimationFrame(() => view.focus());
    }
  }
  // Always start in Split view: script, slide strip and preview side by side.
  setView('split');

  /* ---------------- present ---------------- */
  stage.onChange = (i) => goto(i, { broadcast: true });
  stage.onClose = () => view.focus();

  function present(from = current) {
    if (!slides.length) return;
    stage.open(slides, parsed.settings, from);
  }

  function presenterView() {
    const w = window.open(`${location.pathname}${location.search}#presenter`, 'cue-presenter', 'popup,width=1280,height=800');
    if (!w) toast('Allow pop-ups for this site to open presenter view.');
    present();
  }

  channel.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.type === 'hello') channel.postMessage({ type: 'state', text: view.state.doc.toString(), index: current } satisfies Msg);
    if (m.type === 'goto') {
      if (stage.isOpen) stage.go(m.index, false, true);
      goto(m.index);
    }
  };
  window.addEventListener('beforeunload', () => channel.postMessage({ type: 'bye' } satisfies Msg));

  /* ---------------- file actions ---------------- */
  async function doOpen() {
    const r = await files.open();
    if (!r) return;
    await leaveSharedMode();
    setText(view, r.text);
    current = 0;
    setDocName();
    renderAll();
    await kvSet('draft', { text: r.text, name: files.name, savedAt: Date.now() } satisfies Draft);
    setStatus(files.handle ? 'Saved' : 'Opened · edits stay in browser');
  }
  async function doSave(as = false) {
    const text = view.state.doc.toString();
    const r = as ? await files.saveAs(text) : await files.save(text);
    if (r === 'cancelled') return;
    await leaveSharedMode();
    setDocName();
    await kvSet('draft', { text, name: files.name, savedAt: Date.now() } satisfies Draft);
    setStatus(r === 'file' ? 'Saved' : 'Downloaded');
    toast(r === 'file' ? `Saved ${files.name}` : `Downloaded ${files.name}`);
  }
  async function doNew() {
    const dirty = $('.doc-status').textContent !== 'Saved';
    if (dirty && !confirm('Start a new presentation? Unsaved changes to this one will be lost.')) return;
    await leaveSharedMode();
    await files.forget();
    setText(view, BLANK_DOC);
    current = 0;
    setDocName();
    renderAll();
    revealSlide(view, 0);
  }
  function doPrint() {
    const root = document.getElementById('print-root') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-root' }));
    const { w, h } = ASPECTS[parsed.settings.aspect];
    root.replaceChildren(
      ...slides.map((s) => {
        const page = document.createElement('div');
        page.className = 'print-page';
        page.appendChild(s.cloneNode(true));
        return page;
      }),
    );
    let style = document.getElementById('print-page-size');
    if (!style) style = document.head.appendChild(Object.assign(document.createElement('style'), { id: 'print-page-size' }));
    style.textContent = `@page { size: ${w}px ${h}px; margin: 0; }`;
    window.print();
  }

  /* ---------------- events ---------------- */
  app.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('button, [data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (btn.dataset.view) setView(btn.dataset.view as any);
    if (btn.classList.contains('thumb')) goto(Number(btn.dataset.i), { reveal: true, broadcast: true });
    if (btn.classList.contains('ov-card')) {
      goto(Number(btn.dataset.i), { broadcast: true });
      if ((e as MouseEvent).detail >= 2) present(Number(btn.dataset.i));
    }
    if (act !== 'menu' && !target.closest('.menu')) closeMenu();
    switch (act) {
      case 'play':
        present();
        break;
      case 'presenter':
        presenterView();
        break;
      case 'rename':
        startRename();
        break;
      case 'share':
        closeMenu();
        shareDialog.toggle();
        break;
      case 'leave-shared':
        clearHash();
        location.reload();
        break;
      case 'theme':
        toggleInspector();
        break;
      case 'close-inspector':
        toggleInspector(false);
        break;
      case 'menu':
        toggleMenu();
        break;
      case 'new':
        closeMenu();
        doNew();
        break;
      case 'open':
        closeMenu();
        doOpen();
        break;
      case 'save':
        closeMenu();
        doSave();
        break;
      case 'save-as':
        closeMenu();
        doSave(true);
        break;
      case 'download':
        closeMenu();
        download(files.name, view.state.doc.toString());
        break;
      case 'print':
        closeMenu();
        doPrint();
        break;
      case 'sample':
        closeMenu();
        if (confirm('Replace the current text with the sample deck?')) {
          setText(view, sample);
          current = 0;
          renderAll();
        }
        break;
      case 'credit':
        closeMenu(); // the link itself opens the repository in a new tab
        break;
      case 'help':
        closeMenu();
        toggleInspector(true);
        inspector?.showTab('slide');
        $('.syntax').scrollIntoView({ behavior: 'smooth' });
        break;
    }
  });
  app.addEventListener('dblclick', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.thumb, .preview-frame');
    if (t) present(t.dataset.i ? Number(t.dataset.i) : current);
  });

  function toggleMenu() {
    const m = $('.menu');
    m.hidden = !m.hidden;
    $('[data-act="menu"]').setAttribute('aria-expanded', String(!m.hidden));
  }
  function closeMenu() {
    $('.menu').hidden = true;
    $('[data-act="menu"]').setAttribute('aria-expanded', 'false');
  }

  window.addEventListener('keydown', (e) => {
    if (stage.isOpen) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      doSave(e.shiftKey);
    } else if (mod && k === 'o') {
      e.preventDefault();
      doOpen();
    } else if (mod && k === 'enter') {
      e.preventDefault();
      if (e.shiftKey) presenterView();
      else present();
    } else if (mod && k === 'p') {
      e.preventDefault();
      doPrint();
    } else if (mod && e.altKey && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      setView((['write', 'split', 'slides'] as const)[Number(e.key) - 1]);
    } else if (k === 'escape') {
      closeMenu();
      toggleInspector(false);
    }
  });

  (window as any).__cue = { share: { encodeDeck, decodeDeck, parseShareFragment }, view, get parsed() { return parsed; }, get slides() { return slides; }, goto, updateSettings, present, getTheme };
}

/* ---------------- helpers ---------------- */

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

/** If the URL carries a shared deck, decrypt it (asking for a password if needed). */
async function openSharedLink(): Promise<SharedDeck | null> {
  try {
    const link = parseShareFragment(location.hash);
    if (!link) return null;
    if (link.kind === 'key') return await decodeDeck(link);
    let error: string | undefined;
    for (;;) {
      const pw = await askPassword(error);
      if (pw === null) {
        clearHash();
        return null;
      }
      try {
        return await decodeDeck(link, pw);
      } catch (e) {
        if (e instanceof ShareError && e.reason === 'decrypt') {
          error = 'That password didn’t work. Check it and try again.';
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    await showLinkError(e instanceof ShareError ? e.message : 'Something went wrong while opening the link.');
    clearHash();
    return null;
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let toastTimer = 0;
function toast(msg: string) {
  let t = document.querySelector<HTMLElement>('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('is-on'), 2400);
}

function shellHTML(): string {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const M = mac ? '⌘' : 'Ctrl+';
  return `
  <div class="shell" data-view="split">
    <header class="bar">
      <div class="bar-left">
        <button class="icon-btn" data-act="menu" aria-label="File menu" aria-haspopup="menu" aria-expanded="false">${icons.menu}</button>
        <div class="doc-name"><button class="doc-name-text" data-act="rename" title="Rename presentation">Untitled</button><input class="doc-name-input" type="text" aria-label="Presentation name" spellcheck="false" maxlength="120" hidden /><span class="doc-status"></span></div>
        <div class="shared-pill" hidden>
          <span>Shared deck</span>
          <button data-act="save-as" title="Save this deck as your own file">Save a copy</button>
          <button data-act="leave-shared" aria-label="Close the shared deck and open your own">${icons.close}</button>
        </div>
        <div class="menu" role="menu" hidden>
          <button role="menuitem" data-act="new">${icons.file}<span>New</span></button>
          <button role="menuitem" data-act="open">${icons.open}<span>Open…</span><kbd>${M}O</kbd></button>
          <hr />
          <button role="menuitem" data-act="save">${icons.save}<span>Save</span><kbd>${M}S</kbd></button>
          <button role="menuitem" data-act="save-as"><span class="sp"></span><span>Save as…</span><kbd>${M}⇧S</kbd></button>
          <button role="menuitem" data-act="download"><span class="sp"></span><span>Download .md</span></button>
          <hr />
          <button role="menuitem" data-act="print">${icons.print}<span>Print or save as PDF</span><kbd>${M}P</kbd></button>
          <hr />
          <button role="menuitem" data-act="sample"><span class="sp"></span><span>Load sample deck</span></button>
          <button role="menuitem" data-act="help">${icons.help}<span>Markdown guide</span></button>
          <hr />
          <a role="menuitem" class="menu-credit" data-act="credit" href="https://github.com/chriswillis/Cue" target="_blank" rel="noopener" title="Cue on GitHub">Made with 🩷 by Chris Willis</a>
        </div>
      </div>
      <div class="seg views" role="tablist" aria-label="View">
        <button role="tab" data-view="write" title="Write (${M}⌥1)">Write</button>
        <button role="tab" data-view="split" title="Split (${M}⌥2)">Split</button>
        <button role="tab" data-view="slides" title="Slides (${M}⌥3)">Slides</button>
      </div>
      <div class="bar-right">
        <button class="btn ghost" data-act="share" aria-haspopup="dialog" aria-expanded="false" title="Share a link">${icons.share}<span>Share</span></button>
        <button class="btn ghost" data-act="theme" aria-expanded="false">${icons.theme}<span>Design</span></button>
        <button class="btn ghost" data-act="presenter" title="Presenter view (${M}⇧↵)">${icons.presenter}<span>Presenter</span></button>
        <button class="btn primary" data-act="play" title="Present (${M}↵)">${icons.play}<span>Present</span></button>
      </div>
    </header>

    <nav class="strip" aria-label="Slides"><div class="strip-list"></div></nav>

    <main class="editor-pane"><div class="editor"></div></main>

    <section class="preview-pane" aria-label="Slide preview">
      <div class="preview-stage"><div class="frame preview-frame" title="Double-click to present"></div></div>
      <div class="preview-meta"><span class="pm-layout"></span><span class="pm-pos"></span></div>
      <div class="preview-notes-wrap"><div class="pn-label">Speaker notes</div><div class="preview-notes"></div></div>
    </section>

    <section class="overview" aria-label="All slides"><div class="overview-grid"></div></section>

    <aside class="inspector" hidden aria-label="Design"></aside>
  </div>`;
}
