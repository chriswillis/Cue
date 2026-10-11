// Smoke test for the built site. Run after `npm run build`:
//
//   npm run smoke
//
// It serves dist/ under /Cue/ (like GitHub Pages), opens it in headless
// Chrome and fails if:
//   - the page throws (e.g. a const used before it's declared in main.ts)
//   - the Content-Security-Policy blocks something (only the build has a CSP)
//   - a file is missing (404) or fails to load
//   - the sample deck doesn't render slides into the strip and the preview
//   - the presenter window doesn't open and show the current slide
//
// It uses the Chrome installed on the machine (GitHub's runners have one).
// To use another Chromium, set CHROME_PATH=/path/to/chrome.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const BASE = '/Cue/';
const TIMEOUT = 15_000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** A tiny static server for dist/, mounted at /Cue/ like the live site. */
function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === '/' || path === BASE.slice(0, -1)) {
      res.writeHead(302, { Location: BASE }).end();
      return;
    }
    if (!path.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(DIST, path.slice(BASE.length)));
    if (!file.startsWith(DIST.replace(/[\\/]$/, '') + sep) && file !== DIST) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Collect everything that went wrong on a page. */
function watch(page, label, origin, problems) {
  const add = (msg) => problems.push(`[${label}] ${msg}`);
  const missing = new Set();
  page.on('pageerror', (err) => add(`page error: ${err.message}`));
  page.on('console', (m) => {
    // A 404 is reported once, below, with its URL
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) add(`console error: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.url().startsWith(origin) && r.status() >= 400) {
      missing.add(r.url());
      add(`HTTP ${r.status()}: ${r.url()}`);
    }
  });
  page.on('requestfailed', (r) => {
    if (r.url().startsWith(origin) && !missing.has(r.url())) add(`failed to load: ${r.url()} (${r.failure()?.errorText})`);
  });
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + BASE;

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
);
// A fresh profile: no saved decks, so Cue opens the sample deck.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Report CSP violations by name (Chrome also logs them as console errors).
await context.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.error(`CSP blocked ${e.blockedURI || 'inline code'} (${e.violatedDirective})`);
  });
});

const problems = [];
const checks = [];
// Checks run in order; after one fails the rest are skipped, so a crash
// fails in seconds instead of waiting out every timeout.
const check = async (name, fn) => {
  if (problems.length) {
    checks.push(`skip  ${name}`);
    return;
  }
  try {
    await fn();
    checks.push(`ok    ${name}`);
  } catch (err) {
    checks.push(`FAIL  ${name}`);
    problems.push(`${name}: ${err.message.split('\n')[0]}`);
  }
};

try {
  const page = await context.newPage();
  watch(page, 'editor', origin, problems);

  await check('page loads', async () => {
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT });
  });

  await check('editor shows the sample deck', async () => {
    await page.locator('.cm-content').waitFor({ timeout: TIMEOUT });
    const text = await page.locator('.cm-content').innerText();
    if (!text.trim()) throw new Error('the editor is empty');
  });

  await check('slides render in the strip', async () => {
    const thumbs = page.locator('.strip-list .thumb .slide');
    await thumbs.first().waitFor({ timeout: TIMEOUT });
    const n = await thumbs.count();
    if (n < 2) throw new Error(`expected several slides, found ${n}`);
    const words = (await thumbs.first().innerText()).trim();
    if (!words) throw new Error('the first slide has no text');
  });

  await check('preview shows a slide', async () => {
    await page.locator('.preview-frame .slide').first().waitFor({ timeout: TIMEOUT });
  });

  await check('presenter window opens and shows the slide', async () => {
    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: TIMEOUT }),
      page.locator('button[data-act="presenter"]').click(),
    ]);
    watch(popup, 'presenter', origin, problems);
    await popup.locator('.pv-current .slide').waitFor({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

  // Let late errors (fonts, debounced renders and saves) surface
  await page.waitForTimeout(1000);
} finally {
  await browser.close();
  server.close();
}

console.log(`Smoke test: ${url}\n` + checks.join('\n'));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + [...new Set(problems)].map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\nAll good.');
