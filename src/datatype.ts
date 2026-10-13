/**
 * Inline charts with the Datatype font (Frank Tisellano, SIL OFL): typed as
 * text, drawn by the font's ligatures. They sit in a line of text and take its
 * size, weight and color.
 *
 *   {l:20,45,60,55,80}   sparkline, up to 20 points
 *   {b:30,60,45,80}      bars, up to 20
 *   {p:62}               pie, one value
 *
 * Values are whole numbers from 0 to 100, with no spaces. Anything else stays
 * plain text, so a typo shows what you typed instead of a wrong chart.
 * The font and its license are in src/fonts/; the CSS is `.s-dt` in slide.css.
 */

/** One chart, anywhere in a string. */
export const DATATYPE = /\{([blp]):(\d{1,3}(?:,\d{1,3}){0,19})\}/g;

const NAMES = { l: 'Sparkline', b: 'Bar chart', p: 'Pie chart' } as const;

/** The chart's values, or null if Datatype can't draw it (out of range, a pie with two values). */
export function chartValues(kind: string, list: string): number[] | null {
  const values = list.split(',').map(Number);
  if (values.some((v) => v > 100)) return null;
  if (kind === 'p' && values.length !== 1) return null;
  return values;
}

/** What a screen reader says instead of the braces and numbers. */
export function chartLabel(kind: 'l' | 'b' | 'p', values: number[]): string {
  return kind === 'p' ? `${NAMES.p}: ${values[0]}%` : `${NAMES[kind]}: ${values.join(', ')}`;
}

/** Text with its charts taken out, for places that show plain text (the deck title, the agenda). */
export function withoutCharts(text: string): string {
  return text.replace(DATATYPE, (all, kind: string, list: string) => (chartValues(kind, list) ? '' : all)).replace(/\s{2,}/g, ' ').trim();
}
