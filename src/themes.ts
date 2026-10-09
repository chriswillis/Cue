/**
 * Themes are data: a typeface pairing, a modular type scale and two palettes
 * (light + dark). Typographic values compile to CSS custom properties per
 * theme class; palettes are resolved per slide at render time so they can
 * cycle, alternate or use gradients, and so people can override them.
 *
 * Every color comes from Flexoki (see flexoki.ts). Sizes are logical pixels
 * on a 1920px-wide slide.
 */
/*
 * TO ADD A THEME: copy a define({...}) block below, give it a new id, name and
 * group, and adjust its fonts (ids from typefaces.ts), type scale and two
 * palettes. It appears in the Design panel automatically. Theme-specific
 * styling beyond these values goes in slide.css as `.theme-yourid …`.
 * New fonts: install a @fontsource package, import it in fonts.ts and add an
 * entry to typefaces.ts.
 */
import { BASE, c } from './flexoki';
import { stackOf } from './typefaces';

/** A palette value is a color or `pattern:<id>` (see flexoki.ts PATTERNS). */
export interface Palette {
  bg: string;
  fg: string;
  title?: string; // defaults to fg
  muted: string;
  accent: string;
  rule: string;
  surface: string;
}

export interface Theme {
  id: string;
  name: string;
  group: string;
  description: string;
  display: string; // typeface ids (typefaces.ts)
  body: string;
  label: string;
  mono: string;
  displayWeight: number;
  displayTracking: string;
  displayLeading: number;
  displayVariation: string;
  subtitleStyle: 'normal' | 'italic';
  subtitleWeight: number;
  bodyWeight: number;
  bodyLeading: number;
  base: number; // body size, px
  ratio: number; // modular scale ratio
  coverBoost: number; // extra size for the cover title
  headlineScale: 'varied' | 'uniform';
  margin: [number, number]; // [x, y]
  gutter: number;
  radius: number;
  titleAlign: 'start' | 'center';
  bullet: 'square' | 'dot' | 'dash';
  numerals: 'lining' | 'oldstyle';
  labelCase: 'uppercase' | 'none';
  labelTracking: string;
  defaultAppearance: 'light' | 'dark';
  header: string[]; // slot templates, see render.ts
  footer: string[];
  light: Palette;
  dark: Palette;
}

type ThemeSpec = Partial<Theme> & Pick<Theme, 'id' | 'name' | 'group' | 'description' | 'light' | 'dark'>;

const DEFAULTS: Omit<Theme, 'id' | 'name' | 'group' | 'description' | 'light' | 'dark'> = {
  display: 'inter',
  body: 'inter',
  label: 'inter',
  mono: 'jetbrains-mono',
  displayWeight: 680,
  displayTracking: '-0.03em',
  displayLeading: 1.0,
  displayVariation: 'normal',
  subtitleStyle: 'normal',
  subtitleWeight: 400,
  bodyWeight: 400,
  bodyLeading: 1.38,
  base: 46,
  ratio: 1.38,
  coverBoost: 1.5,
  headlineScale: 'varied',
  margin: [128, 104],
  gutter: 40,
  radius: 0,
  titleAlign: 'start',
  bullet: 'square',
  numerals: 'lining',
  labelCase: 'uppercase',
  labelTracking: '0.08em',
  defaultAppearance: 'light',
  header: ['', '', ''],
  footer: ['{title}', '', '{number}'],
};

const define = (spec: ThemeSpec): Theme => ({ ...DEFAULTS, ...spec });

const paper = BASE.paper;
const black = BASE.black;
const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Plain ink-on-paper palettes, reused by several themes. */
const inkLight = (accent: string): Palette => ({ bg: paper, fg: black, muted: BASE[600], accent, rule: BASE[150], surface: BASE[50] });
const inkDark = (accent: string): Palette => ({ bg: black, fg: BASE[100], muted: BASE[500], accent, rule: BASE[850], surface: BASE[950] });
/** Light text over strong, changing color. */
const onColor = (bg: string, accent: string = paper): Palette => ({ bg, fg: paper, muted: BASE[150], accent, rule: mix(paper, 40), surface: mix(black, 22) });
/** Dark text over soft, changing color. */
const onTint = (bg: string, accent: string = BASE[950], title?: string): Palette => ({ bg, fg: BASE[950], title, muted: BASE[700], accent, rule: mix(black, 18), surface: mix(paper, 55) });

export const THEMES: Theme[] = [
  /* ---------------------------------------------------------------- */
  /* Opinionated                                                       */
  /* ---------------------------------------------------------------- */
  define({
    id: 'newyork',
    name: 'New York',
    group: 'Opinionated',
    description: 'Inter Black on yellow. Headlines in very different sizes.',
    display: 'inter',
    displayWeight: 820,
    displayTracking: '-0.045em',
    displayLeading: 0.92,
    base: 46,
    ratio: 1.52,
    coverBoost: 1.45,
    margin: [112, 96],
    labelTracking: '0.06em',
    light: { bg: c('yellow', 300), fg: black, muted: BASE[800], accent: black, rule: black, surface: c('yellow', 200) },
    dark: { bg: black, fg: BASE[100], title: c('yellow', 300), muted: BASE[500], accent: c('yellow', 300), rule: BASE[800], surface: BASE[950] },
  }),
  define({
    id: 'basel',
    name: 'Basel',
    group: 'Opinionated',
    description: 'Noto Serif, white on black. Large serif headlines on a hard grid.',
    display: 'noto-serif',
    body: 'noto-serif',
    label: 'inter',
    displayWeight: 500,
    displayTracking: '-0.025em',
    displayLeading: 1.02,
    base: 44,
    ratio: 1.42,
    coverBoost: 1.5,
    bodyLeading: 1.4,
    bullet: 'dash',
    defaultAppearance: 'dark',
    light: inkLight(c('red', 600)),
    dark: { ...inkDark(c('red', 400)), fg: paper },
  }),

  /* ---------------------------------------------------------------- */
  /* Vibrant                                                           */
  /* ---------------------------------------------------------------- */
  define({
    id: 'sanfrancisco',
    name: 'San Francisco',
    group: 'Vibrant',
    description: 'The system font, bold. Every title in a different color.',
    display: 'system',
    body: 'system',
    label: 'system',
    displayWeight: 750,
    displayTracking: '-0.03em',
    ratio: 1.45,
    defaultAppearance: 'dark',
    light: { ...inkLight('pattern:titles-light'), title: 'pattern:titles-light' },
    dark: { ...inkDark('pattern:titles-dark'), title: 'pattern:titles-dark' },
  }),
  define({
    id: 'la',
    name: 'LA',
    group: 'Vibrant',
    description: 'Fraunces, soft and heavy. A new loud color on every slide.',
    display: 'fraunces',
    body: 'dm-sans',
    label: 'dm-sans',
    displayWeight: 820,
    displayTracking: '-0.035em',
    displayLeading: 0.95,
    displayVariation: "'SOFT' 100",
    bodyWeight: 450,
    base: 46,
    ratio: 1.5,
    coverBoost: 1.4,
    margin: [112, 96],
    radius: 18,
    bullet: 'dot',
    defaultAppearance: 'dark',
    light: onTint('pattern:pastel'),
    dark: onColor('pattern:vivid'),
  }),

  /* ---------------------------------------------------------------- */
  /* Pastels                                                           */
  /* ---------------------------------------------------------------- */
  define({
    id: 'copenhagen',
    name: 'Copenhagen',
    group: 'Pastels',
    description: 'DM Sans, Nordic and calm. Pastel titles, lots of air.',
    display: 'dm-sans',
    body: 'dm-sans',
    label: 'dm-sans',
    displayWeight: 520,
    displayTracking: '-0.035em',
    displayLeading: 1.02,
    bodyLeading: 1.45,
    base: 44,
    ratio: 1.4,
    margin: [144, 112],
    gutter: 48,
    radius: 12,
    bullet: 'dot',
    labelCase: 'none',
    labelTracking: '0.01em',
    defaultAppearance: 'dark',
    light: { bg: c('blue', 50), fg: BASE[900], title: c('blue', 700), muted: BASE[600], accent: c('blue', 600), rule: c('blue', 100), surface: paper },
    dark: { bg: BASE[950], fg: BASE[100], title: c('blue', 150), muted: BASE[500], accent: c('magenta', 200), rule: BASE[850], surface: BASE[900] },
  }),
  define({
    id: 'vancouver',
    name: 'Vancouver',
    group: 'Pastels',
    description: 'Montserrat over a soft color that changes every slide.',
    display: 'montserrat',
    body: 'montserrat',
    label: 'montserrat',
    displayWeight: 650,
    displayTracking: '-0.025em',
    displayLeading: 1.04,
    bodyLeading: 1.45,
    base: 40,
    ratio: 1.4,
    radius: 10,
    bullet: 'dot',
    labelTracking: '0.1em',
    defaultAppearance: 'dark',
    light: onTint('pattern:pastel'),
    dark: onColor('pattern:muted'),
  }),

  /* ---------------------------------------------------------------- */
  /* Colorful                                                          */
  /* ---------------------------------------------------------------- */
  define({
    id: 'tokyo',
    name: 'Tokyo',
    group: 'Colorful',
    description: 'Top-to-bottom gradients in the colors of metro lines.',
    display: 'inter-tight',
    body: 'inter',
    label: 'inter',
    displayWeight: 650,
    displayTracking: '-0.03em',
    base: 44,
    ratio: 1.42,
    radius: 8,
    defaultAppearance: 'dark',
    light: onTint('pattern:metro-light', 'pattern:metro-ink', 'pattern:metro-ink'),
    dark: onColor('pattern:metro'),
  }),
  define({
    id: 'milano',
    name: 'Milano',
    group: 'Colorful',
    description: 'Bodoni over jewel tones, gold details. Stylish and classy.',
    display: 'bodoni-moda',
    body: 'dm-sans',
    label: 'dm-sans',
    displayWeight: 500,
    displayTracking: '-0.02em',
    displayLeading: 1.0,
    subtitleStyle: 'italic',
    bodyWeight: 380,
    bodyLeading: 1.48,
    base: 40,
    ratio: 1.45,
    margin: [152, 120],
    gutter: 56,
    bullet: 'dash',
    labelTracking: '0.16em',
    defaultAppearance: 'dark',
    light: { ...onTint('pattern:tint', c('yellow', 700)), muted: BASE[600] },
    dark: onColor('pattern:jewel', c('yellow', 200)),
  }),

  /* ---------------------------------------------------------------- */
  /* Classics                                                          */
  /* ---------------------------------------------------------------- */
  define({
    id: 'zurich',
    name: 'Zurich',
    group: 'Classics',
    description: 'Minimal Swiss design. One headline size for every level.',
    display: 'inter',
    displayWeight: 560,
    displayTracking: '-0.022em',
    displayLeading: 1.06,
    headlineScale: 'uniform',
    base: 44,
    ratio: 1.36,
    bullet: 'dash',
    defaultAppearance: 'dark',
    light: inkLight(c('red', 600)),
    dark: { ...inkDark(c('red', 400)), fg: paper },
  }),
  define({
    id: 'paris',
    name: 'Paris',
    group: 'Classics',
    description: 'Cormorant, centered. The background alternates slide to slide.',
    display: 'cormorant',
    body: 'cormorant',
    label: 'dm-sans',
    displayWeight: 600,
    displayTracking: '-0.01em',
    displayLeading: 1.0,
    subtitleStyle: 'italic',
    subtitleWeight: 500,
    bodyWeight: 500,
    bodyLeading: 1.3,
    base: 52,
    ratio: 1.4,
    margin: [152, 120],
    titleAlign: 'center',
    bullet: 'dash',
    numerals: 'oldstyle',
    labelTracking: '0.14em',
    defaultAppearance: 'dark',
    light: { bg: 'pattern:alt-day', fg: BASE[950], muted: BASE[600], accent: c('red', 600), rule: BASE[200], surface: BASE[50] },
    dark: { bg: 'pattern:alt-night', fg: paper, muted: BASE[300], accent: c('red', 300), rule: BASE[800], surface: BASE[950] },
  }),

  /* ---------------------------------------------------------------- */
  /* Typographic                                                       */
  /* ---------------------------------------------------------------- */
  define({
    id: 'helvetica',
    name: 'Helvetica',
    group: 'Typographic',
    description: 'Swiss style, sans serif, with a strong and readable hierarchy.',
    display: 'helvetica',
    body: 'helvetica',
    label: 'helvetica',
    displayWeight: 700,
    displayTracking: '-0.035em',
    displayLeading: 0.98,
    base: 44,
    ratio: 1.5,
    coverBoost: 1.35,
    margin: [120, 100],
    light: inkLight(c('red', 600)),
    dark: { ...inkDark(c('red', 400)), fg: paper },
  }),
  define({
    id: 'garamond',
    name: 'Garamond',
    group: 'Typographic',
    description: 'EB Garamond. Renaissance book typography with rubric red.',
    display: 'eb-garamond',
    body: 'eb-garamond',
    label: 'eb-garamond',
    displayWeight: 500,
    displayTracking: '-0.01em',
    displayLeading: 1.04,
    subtitleStyle: 'italic',
    bodyLeading: 1.36,
    base: 50,
    ratio: 1.333,
    coverBoost: 1.7,
    margin: [152, 116],
    titleAlign: 'center',
    bullet: 'dash',
    numerals: 'oldstyle',
    labelTracking: '0.12em',
    light: { bg: paper, fg: BASE[950], muted: BASE[600], accent: c('red', 600), rule: BASE[200], surface: BASE[50] },
    dark: { bg: BASE[950], fg: BASE[100], muted: BASE[500], accent: c('red', 400), rule: BASE[800], surface: BASE[900] },
  }),

  /* ---------------------------------------------------------------- */
  /* Originals                                                         */
  /* ---------------------------------------------------------------- */
  define({
    id: 'swiss',
    name: 'Swiss',
    group: 'Originals',
    description: 'Inter Tight on a strict grid. Paper and ink, red accent.',
    display: 'inter-tight',
    displayWeight: 680,
    displayTracking: '-0.032em',
    light: inkLight(c('red', 600)),
    dark: inkDark(c('red', 400)),
  }),
  define({
    id: 'editorial',
    name: 'Editorial',
    group: 'Originals',
    description: 'Newsreader serif on warm paper. Old-style figures, orange ink.',
    display: 'newsreader',
    body: 'newsreader',
    label: 'plex-mono',
    mono: 'plex-mono',
    displayWeight: 480,
    displayTracking: '-0.018em',
    displayLeading: 1.04,
    subtitleStyle: 'italic',
    subtitleWeight: 380,
    bodyLeading: 1.36,
    base: 50,
    ratio: 1.3,
    coverBoost: 1.9,
    margin: [136, 108],
    gutter: 48,
    bullet: 'dash',
    numerals: 'oldstyle',
    labelTracking: '0.06em',
    light: { bg: BASE[50], fg: black, muted: BASE[600], accent: c('orange', 600), rule: BASE[200], surface: BASE[100] },
    dark: { bg: BASE[950], fg: BASE[100], muted: BASE[500], accent: c('orange', 400), rule: BASE[800], surface: BASE[900] },
  }),
  define({
    id: 'plex',
    name: 'Plex',
    group: 'Originals',
    description: 'IBM Plex with mono labels. Technical, calm, blue.',
    display: 'plex-sans',
    body: 'plex-sans',
    label: 'plex-mono',
    mono: 'plex-mono',
    displayWeight: 500,
    displayTracking: '-0.02em',
    displayLeading: 1.08,
    subtitleWeight: 300,
    bodyLeading: 1.42,
    base: 43,
    ratio: 1.3,
    coverBoost: 1.55,
    margin: [120, 100],
    radius: 4,
    labelTracking: '0.04em',
    light: { ...inkLight(c('blue', 600)), fg: BASE[950] },
    dark: inkDark(c('blue', 400)),
  }),
  define({
    id: 'poster',
    name: 'Poster',
    group: 'Originals',
    description: 'Space Grotesk, oversized. Blue and yellow, loud on purpose.',
    display: 'space-grotesk',
    body: 'space-grotesk',
    label: 'space-grotesk',
    displayWeight: 700,
    displayTracking: '-0.045em',
    displayLeading: 0.94,
    bodyWeight: 420,
    bodyLeading: 1.3,
    ratio: 1.45,
    coverBoost: 1.45,
    margin: [112, 96],
    gutter: 36,
    labelTracking: '0.06em',
    light: { bg: c('yellow', 50), fg: c('blue', 800), muted: c('blue', 600), accent: c('orange', 600), rule: c('yellow', 100), surface: c('yellow', 100) },
    dark: { bg: c('blue', 800), fg: paper, muted: c('blue', 150), accent: c('yellow', 300), rule: c('blue', 700), surface: c('blue', 850) },
  }),
  define({
    id: 'quiet',
    name: 'Quiet',
    group: 'Originals',
    description: 'Instrument Serif over Inter. Soft stone and green, lots of air.',
    display: 'instrument-serif',
    displayWeight: 400,
    displayTracking: '-0.012em',
    subtitleStyle: 'italic',
    bodyWeight: 380,
    bodyLeading: 1.48,
    base: 41,
    ratio: 1.45,
    coverBoost: 1.4,
    margin: [152, 120],
    gutter: 56,
    radius: 14,
    titleAlign: 'center',
    bullet: 'dot',
    labelCase: 'none',
    labelTracking: '0.01em',
    light: { bg: BASE[50], fg: BASE[900], muted: BASE[600], accent: c('green', 600), rule: BASE[150], surface: BASE[100] },
    dark: { bg: BASE[950], fg: BASE[100], muted: BASE[500], accent: c('green', 400), rule: BASE[850], surface: BASE[900] },
  }),

  /* ---------------------------------------------------------------- */
  /* Minimal                                                           */
  /* ---------------------------------------------------------------- */
  define({
    id: 'nothing',
    name: 'Nothing',
    group: 'Minimal',
    description: 'Museum-placard minimalism: bone ground, thin Hanken Grotesk at dramatic scale, mono field notes, hairlines and one red hollow circle.',
    display: 'hanken-grotesk',
    body: 'hanken-grotesk',
    label: 'plex-mono',
    mono: 'plex-mono',
    displayWeight: 300,
    displayTracking: '-0.035em',
    displayLeading: 0.98,
    subtitleWeight: 300,
    bodyWeight: 400,
    bodyLeading: 1.42,
    base: 36,
    ratio: 1.5,
    coverBoost: 1.75,
    margin: [120, 108],
    gutter: 48,
    bullet: 'dash',
    labelCase: 'uppercase',
    labelTracking: '0.14em',
    footer: ['', '', ''],
    light: { bg: BASE[50], fg: BASE[850], title: black, muted: BASE[600], accent: c('red', 400), rule: BASE[200], surface: BASE[100] },
    dark: { bg: black, fg: BASE[200], title: paper, muted: BASE[500], accent: c('red', 400), rule: BASE[800], surface: BASE[950] },
  }),
];

export const THEME_GROUPS = [...new Set(THEMES.map((t) => t.group))];

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const r = (n: number) => `${Math.round(n * 10) / 10}px`;

/** Typographic variables per theme class. Palettes are applied per slide. */
export function themeCSS(): string {
  return THEMES.map((t) => {
    const step = (n: number) => r(t.base * Math.pow(t.ratio, n));
    const vars = [
      `--font-display:${stackOf(t.display)}`,
      `--font-body:${stackOf(t.body)}`,
      `--font-label:${stackOf(t.label)}`,
      `--font-mono:${stackOf(t.mono)}`,
      `--display-weight:${t.displayWeight}`,
      `--display-tracking:${t.displayTracking}`,
      `--display-leading:${t.displayLeading}`,
      `--display-variation:${t.displayVariation}`,
      `--subtitle-style:${t.subtitleStyle}`,
      `--subtitle-weight:${t.subtitleWeight}`,
      `--body-weight:${t.bodyWeight}`,
      `--body-leading:${t.bodyLeading}`,
      `--step--1:${step(-1)}`,
      `--step-0:${step(0)}`,
      `--step-1:${step(1)}`,
      `--step-2:${step(2)}`,
      `--step-3:${step(3)}`,
      `--step-4:${step(4)}`,
      `--step-uniform:${step(3)}`,
      `--step-cover:${r(t.base * Math.pow(t.ratio, 4) * t.coverBoost)}`,
      `--label-size:${r(Math.max(20, t.base * 0.56))}`,
      `--mx:${t.margin[0]}px`,
      `--my:${t.margin[1]}px`,
      `--gutter:${t.gutter}px`,
      `--radius:${t.radius}px`,
      `--numerals:${t.numerals === 'oldstyle' ? 'oldstyle-nums proportional-nums' : 'lining-nums proportional-nums'}`,
      `--label-case:${t.labelCase}`,
      `--label-tracking:${t.labelTracking}`,
      t.bullet === 'square'
        ? '--bullet-w:0.3em;--bullet-h:0.3em;--bullet-r:0;--bullet-y:0.52em'
        : t.bullet === 'dot'
          ? '--bullet-w:0.26em;--bullet-h:0.26em;--bullet-r:50%;--bullet-y:0.56em'
          : '--bullet-w:0.55em;--bullet-h:0.06em;--bullet-r:0;--bullet-y:0.68em',
    ].join(';');
    return `.slide.theme-${t.id}{${vars}}`;
  }).join('\n');
}

export function injectThemeCSS(): void {
  const style = document.createElement('style');
  style.id = 'theme-css';
  style.textContent = themeCSS();
  document.head.appendChild(style);
}
