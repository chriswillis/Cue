/**
 * Flexoki by Steph Ango (https://stephango.com/flexoki), MIT licensed.
 * Every color in the app's slide themes comes from this palette.
 */

export const BASE = {
  paper: '#FFFCF0',
  50: '#F2F0E5',
  100: '#E6E4D9',
  150: '#DAD8CE',
  200: '#CECDC3',
  300: '#B7B5AC',
  400: '#9F9D96',
  500: '#878580',
  600: '#6F6E69',
  700: '#575653',
  800: '#403E3C',
  850: '#343331',
  900: '#282726',
  950: '#1C1B1A',
  black: '#100F0F',
} as const;

export type Hue = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta';
export type Step = 50 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950;

export const HUES: Hue[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];

export const ACCENT: Record<Hue, Record<Step, string>> = {
  red: { 50: '#FFE1D5', 100: '#FFCABB', 150: '#FDB2A2', 200: '#F89A8A', 300: '#E8705F', 400: '#D14D41', 500: '#C03E35', 600: '#AF3029', 700: '#942822', 800: '#6C201C', 850: '#551B18', 900: '#3E1715', 950: '#261312' },
  orange: { 50: '#FFE7CE', 100: '#FED3AF', 150: '#FCC192', 200: '#F9AE77', 300: '#EC8B49', 400: '#DA702C', 500: '#CB6120', 600: '#BC5215', 700: '#9D4310', 800: '#71320D', 850: '#59290D', 900: '#40200D', 950: '#27180E' },
  yellow: { 50: '#FAEEC6', 100: '#F6E2A0', 150: '#F1D67E', 200: '#ECCB60', 300: '#DFB431', 400: '#D0A215', 500: '#BE9207', 600: '#AD8301', 700: '#8E6B01', 800: '#664D01', 850: '#503D02', 900: '#3A2D04', 950: '#241E08' },
  green: { 50: '#EDEECF', 100: '#DDE2B2', 150: '#CDD597', 200: '#BEC97E', 300: '#A0AF54', 400: '#879A39', 500: '#768D21', 600: '#66800B', 700: '#536907', 800: '#3D4C07', 850: '#313D07', 900: '#252D09', 950: '#1A1E0C' },
  cyan: { 50: '#DDF1E4', 100: '#BFE8D9', 150: '#A2DECE', 200: '#87D3C3', 300: '#5ABDAC', 400: '#3AA99F', 500: '#2F968D', 600: '#24837B', 700: '#1C6C66', 800: '#164F4A', 850: '#143F3C', 900: '#122F2C', 950: '#101F1D' },
  blue: { 50: '#E1ECEB', 100: '#C6DDE8', 150: '#ABCFE2', 200: '#92BFDB', 300: '#66A0C8', 400: '#4385BE', 500: '#3171B2', 600: '#205EA6', 700: '#1A4F8C', 800: '#163B66', 850: '#133051', 900: '#12253B', 950: '#101A24' },
  purple: { 50: '#F0EAEC', 100: '#E2D9E9', 150: '#D3CAE6', 200: '#C4B9E0', 300: '#A699D0', 400: '#8B7EC8', 500: '#735EB5', 600: '#5E409D', 700: '#4F3685', 800: '#3C2A62', 850: '#31234E', 900: '#261C39', 950: '#1A1623' },
  magenta: { 50: '#FEE4E5', 100: '#FCCFDA', 150: '#F9B9CF', 200: '#F4A4C2', 300: '#E47DA8', 400: '#CE5D97', 500: '#B74583', 600: '#A02F6F', 700: '#87285E', 800: '#641F46', 850: '#4F1B39', 900: '#39172B', 950: '#24131D' },
};

export const c = (hue: Hue, step: Step) => ACCENT[hue][step];

/* ------------------------------------------------------------------ */
/* Background and title-color patterns                                 */
/* A color value is either a plain color or `pattern:<id>`, which      */
/* resolves per slide (cycling colors, alternating, or gradients).     */
/* ------------------------------------------------------------------ */

export interface Pattern {
  id: string;
  name: string;
  kind: 'cycle' | 'gradient';
  values: string[]; // colors, or CSS gradients for kind=gradient
}

const cycle = (step: Step, order: Hue[]) => order.map((h) => c(h, step));
const LOUD: Hue[] = ['magenta', 'orange', 'cyan', 'purple', 'red', 'blue', 'green', 'yellow'];
const SOFT: Hue[] = ['cyan', 'blue', 'purple', 'magenta', 'red', 'orange', 'yellow', 'green'];
const JEWEL: Hue[] = ['red', 'green', 'blue', 'purple', 'orange', 'cyan', 'magenta'];
// Tokyo Metro-ish order: Ginza orange, Marunouchi red, Tozai sky, Chiyoda green,
// Yurakucho gold, Hanzomon purple, Namboku emerald, Fukutoshin magenta-brown
const METRO: Hue[] = ['orange', 'red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'magenta'];

export const PATTERNS: Pattern[] = [
  { id: 'vivid', name: 'Vivid colors', kind: 'cycle', values: cycle(600, LOUD) },
  { id: 'bright', name: 'Bright colors', kind: 'cycle', values: cycle(400, LOUD) },
  { id: 'pastel', name: 'Pastels', kind: 'cycle', values: cycle(100, SOFT) },
  { id: 'muted', name: 'Muted colors', kind: 'cycle', values: cycle(700, SOFT) },
  { id: 'jewel', name: 'Jewel tones', kind: 'cycle', values: cycle(800, JEWEL) },
  { id: 'tint', name: 'Light tints', kind: 'cycle', values: cycle(50, JEWEL) },
  { id: 'metro', name: 'Metro gradients', kind: 'gradient', values: METRO.map((h) => `linear-gradient(to bottom, ${c(h, 400)}, ${c(h, 700)})`) },
  { id: 'metro-light', name: 'Metro tints', kind: 'gradient', values: METRO.map((h) => `linear-gradient(to bottom, ${c(h, 50)}, ${c(h, 150)})`) },
  { id: 'metro-ink', name: 'Metro inks', kind: 'cycle', values: cycle(600, METRO) },
  { id: 'alt-night', name: 'Night alternating', kind: 'cycle', values: [BASE.black, c('blue', 950)] },
  { id: 'alt-day', name: 'Day alternating', kind: 'cycle', values: [BASE.paper, c('blue', 50)] },
  { id: 'titles-dark', name: 'Colorful (dark)', kind: 'cycle', values: cycle(400, LOUD) },
  { id: 'titles-light', name: 'Colorful (light)', kind: 'cycle', values: cycle(600, LOUD) },
];

export function getPattern(value: string): Pattern | null {
  if (!value.startsWith('pattern:')) return null;
  return PATTERNS.find((p) => p.id === value.slice(8)) ?? null;
}

/** Resolve a color value for a given slide index. */
export function resolveColor(value: string, index: number): { color: string; image: string } {
  const p = getPattern(value);
  if (!p) return { color: value, image: 'none' };
  const v = p.values[index % p.values.length];
  if (p.kind === 'gradient') {
    const first = /#[0-9a-f]{6}/i.exec(v)?.[0] ?? '#000';
    return { color: first, image: v };
  }
  return { color: v, image: 'none' };
}

/** A small CSS preview (for swatches) of any color value. */
export function previewCSS(value: string): string {
  const p = getPattern(value);
  if (!p) return value;
  if (p.kind === 'gradient') {
    const stops = p.values.slice(0, 5).map((g) => /#[0-9a-f]{6}/i.exec(g)?.[0]);
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }
  return `linear-gradient(90deg, ${p.values.slice(0, 6).join(', ')})`;
}

/** Swatches offered in the color popovers. */
export const SWATCH_ROWS: { label: string; colors: string[] }[] = [
  { label: 'Neutrals', colors: [BASE.paper, BASE[50], BASE[150], BASE[300], BASE[600], BASE[800], BASE[950], BASE.black] },
  { label: '50', colors: HUES.map((h) => c(h, 50)) },
  { label: '200', colors: HUES.map((h) => c(h, 200)) },
  { label: '400', colors: HUES.map((h) => c(h, 400)) },
  { label: '600', colors: HUES.map((h) => c(h, 600)) },
  { label: '800', colors: HUES.map((h) => c(h, 800)) },
];
