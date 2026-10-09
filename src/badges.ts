/**
 * Slide number badges. Each slide gets a soft Flexoki tint (the 200 step),
 * cycling through the accent hues so neighboring slides are easy to tell
 * apart. The same color marks the slide in the editor and in the strip.
 */
const BADGE_COLORS = [
  '#87D3C3', // cyan-200
  '#92BFDB', // blue-200
  '#C4B9E0', // purple-200
  '#F4A4C2', // magenta-200
  '#F89A8A', // red-200
  '#F9AE77', // orange-200
  '#ECCB60', // yellow-200
  '#BEC97E', // green-200
];

export function slideColor(index: number): string {
  return BADGE_COLORS[((index % BADGE_COLORS.length) + BADGE_COLORS.length) % BADGE_COLORS.length];
}
