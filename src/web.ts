/**
 * `// web: https://…` — a live web page on a slide.
 *
 * Slides only ever show a placeholder card. The page itself loads when the
 * slide is presented (activate() in render.ts), in a sandboxed iframe, so the
 * strip, the theme previews and print never load 30 copies of someone's site.
 *
 * Shared decks carry other people's markdown, so a page from a shared link
 * waits for a click ("Load example.com") before it loads anything.
 */

export interface WebTarget {
  /** What the iframe loads (an embed URL for known services) */
  src: string;
  /** What "Open in new tab" opens: the page as written */
  url: string;
  /** For the card and the bar: example.com */
  host: string;
  /**
   * The page is on Cue's own site (cewillis.com while Cue lives at cewillis.com/Cue).
   * It's still shown, but in an opaque origin, so it can't reach the deck library.
   */
  isolate: boolean;
}

/** Returns null for anything that isn't a plain https page on another site. */
export function webTarget(raw: string): WebTarget | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.replace(/^www\./, '');
  const isolate = typeof location !== 'undefined' && u.origin === location.origin;
  return { src: embedURL(u), url: u.href, host, isolate };
}

/** Video and design services have a page made for framing; use it. */
function embedURL(u: URL): string {
  const host = u.hostname.replace(/^(www|m)\./, '');
  const id = (s: string | null | undefined) => (s && /^[\w-]{4,64}$/.test(s) ? s : null);
  const path = u.pathname.split('/').filter(Boolean);
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const v = host === 'youtu.be' ? id(path[0]) : path[0] === 'watch' ? id(u.searchParams.get('v')) : ['shorts', 'embed', 'live'].includes(path[0]) ? id(path[1]) : null;
    if (v) {
      const t = Number.parseInt(u.searchParams.get('t') ?? u.searchParams.get('start') ?? '', 10);
      return `https://www.youtube-nocookie.com/embed/${v}?rel=0${t > 0 ? `&start=${t}` : ''}`;
    }
  }
  if (host === 'vimeo.com' && /^\d+$/.test(path[0] ?? '')) return `https://player.vimeo.com/video/${path[0]}`;
  if (host === 'loom.com' && path[0] === 'share' && id(path[1])) return `https://www.loom.com/embed/${path[1]}`;
  if (host === 'figma.com' && ['file', 'design', 'proto', 'board', 'slides'].includes(path[0] ?? '')) {
    return `https://www.figma.com/embed?embed_host=cue&url=${encodeURIComponent(u.href)}`;
  }
  if (host === 'docs.google.com' && path[0] === 'presentation' && path[1] === 'd' && id(path[2])) {
    return `https://docs.google.com/presentation/d/${path[2]}/embed`;
  }
  return u.href;
}

/** Make the live iframe for a placeholder. `isolate`: a page on Cue's own site (see WebTarget). */
export function webFrame(src: string, host: string, isolate = false): HTMLIFrameElement {
  const f = document.createElement('iframe');
  f.className = 's-web-frame';
  f.src = src;
  f.title = host;
  // Its own origin, scripts and forms (polls, demos), popups for links. Never top navigation.
  // A page on Cue's own site keeps the sandbox's opaque origin instead: with allow-same-origin
  // it would share Cue's storage and could lift its own sandbox.
  f.setAttribute('sandbox', isolate ? 'allow-scripts allow-forms allow-popups allow-presentation' : 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
  f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  // No referrer, except where a player refuses to play without one (YouTube): then only Cue's address, never the deck
  f.referrerPolicy = /(^|\.)youtube-nocookie\.com$/.test(new URL(src).hostname) ? 'strict-origin' : 'no-referrer';
  f.loading = 'eager';
  return f;
}
