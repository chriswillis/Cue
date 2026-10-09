/**
 * Slide colors in the editor: a warm-up from cool to warm across the deck.
 *
 *   blue — a cold start · purple — warming up · magenta — getting warmer
 *   red — when things get hot · orange — a sweet end · gold — the afterglow
 *
 * A slide's color comes from its position in the deck (first slide blue, last
 * slide gold), blended smoothly between the six Flexoki hues. It marks the
 * slide's number badge, its on-slide lines and the cursor. Only the writer
 * sees it: slides, themes and exports are untouched.
 */
import { c } from './flexoki';

const HUES = ['blue', 'purple', 'magenta', 'red', 'orange', 'yellow'] as const;

/** Light mode uses the 600 inks (readable on paper), dark mode the 400s. */
const LIGHT = HUES.map((h) => c(h, 600));
const DARK = HUES.map((h) => c(h, 400));

function blend(palette: string[], t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (palette.length - 1);
  const i = Math.min(Math.floor(x), palette.length - 2);
  const f = Math.round((x - i) * 100);
  if (f <= 0) return palette[i];
  if (f >= 100) return palette[i + 1];
  return `color-mix(in oklch, ${palette[i]} ${100 - f}%, ${palette[i + 1]})`;
}

/** Where a slide sits in the deck, 0 (first) to 1 (last). */
const position = (index: number, total: number) => (total <= 1 ? 0 : index / (total - 1));

/**
 * CSS custom properties for a slide: `--sl` (light) and `--sd` (dark).
 * The stylesheet picks one as `--slide` for the current color scheme.
 */
export function slideVars(index: number, total: number): string {
  const t = position(index, total);
  return `--sl: ${blend(LIGHT, t)}; --sd: ${blend(DARK, t)}`;
}
