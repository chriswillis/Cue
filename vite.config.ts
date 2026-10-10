import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** The commit being built: GitHub Actions provides it; locally, ask git. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Content-Security-Policy for the built site only: Vite's dev server injects
 * inline scripts that this policy would block. Notes:
 *  - style-src needs 'unsafe-inline': slide colors and the editor's line
 *    colors are inline styles.
 *  - img-src allows any https image, because slides can show images by URL.
 *  - frame-ancestors can't be set from a meta tag (GitHub Pages sends no headers).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'cue-csp',
    apply: 'build',
    // Right after <meta charset>, ahead of every script and stylesheet it governs
    transformIndexHtml: (html) => html.replace(/<meta charset="utf-8" \/>/, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  base: './',
  plugins: [contentSecurityPolicy()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
});
