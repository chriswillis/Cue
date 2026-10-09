/**
 * The curated, bundled type library. Every face is open-licensed (SIL OFL)
 * and self-hosted, except the two system entries, which use the fonts that
 * ship with the operating system (with a bundled fallback).
 *
 * `titleWeight` / `titleTracking` are what a face looks best at when it is
 * chosen as a title font, so overriding a theme's font never produces a
 * faux-bold or badly spaced headline.
 */

export interface Typeface {
  id: string;
  name: string;
  kind: 'sans' | 'serif' | 'mono';
  stack: string;
  titleWeight: number;
  titleTracking: string;
  bodyWeight: number;
}

export const TYPEFACES: Typeface[] = [
  { id: 'system', name: 'System', kind: 'sans', stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable', 'Segoe UI', 'Inter Variable', system-ui, sans-serif", titleWeight: 700, titleTracking: '-0.025em', bodyWeight: 400 },
  { id: 'helvetica', name: 'Helvetica', kind: 'sans', stack: "'Helvetica Neue', Helvetica, 'Inter Variable', Arial, sans-serif", titleWeight: 700, titleTracking: '-0.03em', bodyWeight: 400 },
  { id: 'inter', name: 'Inter', kind: 'sans', stack: "'Inter Variable', system-ui, sans-serif", titleWeight: 680, titleTracking: '-0.03em', bodyWeight: 400 },
  { id: 'inter-tight', name: 'Inter Tight', kind: 'sans', stack: "'Inter Tight Variable', 'Inter Variable', system-ui, sans-serif", titleWeight: 680, titleTracking: '-0.032em', bodyWeight: 400 },
  { id: 'dm-sans', name: 'DM Sans', kind: 'sans', stack: "'DM Sans Variable', system-ui, sans-serif", titleWeight: 600, titleTracking: '-0.03em', bodyWeight: 400 },
  { id: 'montserrat', name: 'Montserrat', kind: 'sans', stack: "'Montserrat Variable', system-ui, sans-serif", titleWeight: 650, titleTracking: '-0.025em', bodyWeight: 400 },
  { id: 'space-grotesk', name: 'Space Grotesk', kind: 'sans', stack: "'Space Grotesk Variable', system-ui, sans-serif", titleWeight: 700, titleTracking: '-0.045em', bodyWeight: 420 },
  { id: 'hanken-grotesk', name: 'Hanken Grotesk', kind: 'sans', stack: "'Hanken Grotesk Variable', system-ui, sans-serif", titleWeight: 300, titleTracking: '-0.025em', bodyWeight: 400 },
  { id: 'noto-sans', name: 'Noto Sans', kind: 'sans', stack: "'Noto Sans Variable', system-ui, sans-serif", titleWeight: 650, titleTracking: '-0.025em', bodyWeight: 400 },
  { id: 'plex-sans', name: 'IBM Plex Sans', kind: 'sans', stack: "'IBM Plex Sans', system-ui, sans-serif", titleWeight: 500, titleTracking: '-0.02em', bodyWeight: 400 },
  { id: 'noto-serif', name: 'Noto Serif', kind: 'serif', stack: "'Noto Serif Variable', Georgia, serif", titleWeight: 500, titleTracking: '-0.02em', bodyWeight: 400 },
  { id: 'newsreader', name: 'Newsreader', kind: 'serif', stack: "'Newsreader Variable', Georgia, serif", titleWeight: 480, titleTracking: '-0.018em', bodyWeight: 400 },
  { id: 'eb-garamond', name: 'EB Garamond', kind: 'serif', stack: "'EB Garamond Variable', Garamond, Georgia, serif", titleWeight: 500, titleTracking: '-0.01em', bodyWeight: 400 },
  { id: 'cormorant', name: 'Cormorant', kind: 'serif', stack: "'Cormorant Variable', Garamond, Georgia, serif", titleWeight: 600, titleTracking: '-0.01em', bodyWeight: 500 },
  { id: 'bodoni-moda', name: 'Bodoni Moda', kind: 'serif', stack: "'Bodoni Moda Variable', Didot, Georgia, serif", titleWeight: 500, titleTracking: '-0.02em', bodyWeight: 400 },
  { id: 'fraunces', name: 'Fraunces', kind: 'serif', stack: "'Fraunces Variable', Georgia, serif", titleWeight: 800, titleTracking: '-0.03em', bodyWeight: 400 },
  { id: 'instrument-serif', name: 'Instrument Serif', kind: 'serif', stack: "'Instrument Serif', Georgia, serif", titleWeight: 400, titleTracking: '-0.012em', bodyWeight: 400 },
  { id: 'plex-mono', name: 'IBM Plex Mono', kind: 'mono', stack: "'IBM Plex Mono', ui-monospace, monospace", titleWeight: 500, titleTracking: '-0.03em', bodyWeight: 400 },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', kind: 'mono', stack: "'JetBrains Mono Variable', ui-monospace, monospace", titleWeight: 650, titleTracking: '-0.03em', bodyWeight: 400 },
];

export function getTypeface(id: string | undefined): Typeface | undefined {
  return id ? TYPEFACES.find((t) => t.id === id) : undefined;
}

export function stackOf(id: string): string {
  return getTypeface(id)?.stack ?? id;
}
