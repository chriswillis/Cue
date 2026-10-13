/**
 * `// layout: cycle` — repeated subheadings drawn as a loop of arrows.
 *
 * Like chart.ts, the geometry is worked out here in slide pixels (slides are
 * always 1920 wide, so the numbers are fixed) and drawn as SVG; the labels
 * are real HTML around it, so they use the theme's type and fit() can shrink
 * them. Colors come from CSS variables, so every theme and appearance works.
 *
 * Two styles:
 *  - chevron: thick ring segments, each ending in an arrow tip, numbered
 *  - line:    a hairline circle, a hollow dot per step, small arrowheads
 *             between them (the quieter, bookish themes)
 */

export interface CycleStep {
  head: HTMLElement | null;
  kicker: HTMLElement | null;
  body: HTMLElement[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Most steps a cycle holds before it falls back to columns. */
export const CYCLE_MAX = 7;

/** Themes whose cycle is drawn with hairlines and dots instead of thick arrows. */
const LINE_THEMES = new Set(['nothing', 'quiet', 'copenhagen', 'milano', 'garamond', 'paris', 'editorial']);

export const cycleStyle = (themeId: string): 'chevron' | 'line' => (LINE_THEMES.has(themeId) ? 'line' : 'chevron');

const f = (n: number) => n.toFixed(1);

export function cycleDiagram(steps: CycleStep[], box: Box, opts: { style: 'chevron' | 'line'; base: number; focus?: number[]; center?: HTMLElement[] }): HTMLElement {
  const { w, h } = box;
  const n = steps.length;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(h * 0.3, w * 0.21);
  const T = R * 0.34; // ring thickness (chevron)
  const r1 = R - T / 2;
  const r2 = R + T / 2;
  const at = (r: number, a: number) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  const step = (Math.PI * 2) / n;
  const angle = (i: number) => -Math.PI / 2 + i * step;
  const lit = (i: number) => !opts.focus || opts.focus.includes(i + 1);

  const parts: string[] = [];
  let labelR: number;
  if (opts.style === 'chevron') {
    const gap = Math.max(8, T * 0.14) / R;
    const tip = (T * 0.42) / R;
    for (let i = 0; i < n; i++) {
      const a0 = angle(i) - step / 2 + gap / 2;
      const a1 = angle(i) + step / 2 - gap / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M${at(r2, a0)} A${f(r2)} ${f(r2)} 0 ${large} 1 ${at(r2, a1)} L${at(R, a1 + tip)} L${at(r1, a1)} A${f(r1)} ${f(r1)} 0 ${large} 0 ${at(r1, a0)} L${at(R, a0 + tip)} Z`;
      const [nx, ny] = at(R, angle(i) + tip / 2).split(' ');
      parts.push(
        `<g class="cy-seg cy-s${i}${lit(i) ? '' : ' is-dim'}" style="--i:${i};--k:${n > 1 ? f((i / (n - 1)) * 100) : 0}">` +
          `<path class="cy-arc" d="${d}"/>` +
          `<text class="cy-num" x="${nx}" y="${ny}" font-size="${f(T * 0.4)}" text-anchor="middle" dominant-baseline="central">${i + 1}</text></g>`,
      );
    }
    labelR = r2 + opts.base * 0.7;
  } else {
    const dot = Math.max(10, opts.base * 0.22);
    const s = Math.max(10, opts.base * 0.26); // arrowhead size
    parts.push(`<circle class="cy-ring" cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}"/>`);
    for (let i = 0; i < n; i++) {
      // An arrowhead halfway to the next step, pointing along the circle (clockwise)
      const m = angle(i) + step / 2;
      const tx = -Math.sin(m);
      const ty = Math.cos(m);
      const px = cx + R * Math.cos(m) + tx * s * 0.4;
      const py = cy + R * Math.sin(m) + ty * s * 0.4;
      const nx = Math.cos(m) * s * 0.7;
      const ny = Math.sin(m) * s * 0.7;
      parts.push(`<path class="cy-arrow" d="M${f(px - tx * s + nx)} ${f(py - ty * s + ny)} L${f(px)} ${f(py)} L${f(px - tx * s - nx)} ${f(py - ty * s - ny)}"/>`);
    }
    for (let i = 0; i < n; i++) {
      parts.push(`<circle class="cy-dot${lit(i) ? '' : ' is-dim'}" cx="${at(R, angle(i)).split(' ')[0]}" cy="${at(R, angle(i)).split(' ')[1]}" r="${f(dot)}"/>`);
    }
    labelR = R + dot + opts.base * 0.6;
  }

  const root = document.createElement('div');
  root.className = `s-cycle is-${opts.style} n-${n}`;
  root.style.cssText = `left:${box.x}px;top:${box.y}px;width:${w}px;height:${h}px`;
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="cy-svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" aria-hidden="true">${parts.join('')}</svg>`;
  root.appendChild(tpl.content);

  steps.forEach((s, i) => {
    const a = angle(i);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = cx + labelR * c;
    const y = cy + labelR * sn;
    const ax = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'mid';
    const ay = sn > 0.3 ? 'start' : sn < -0.3 ? 'end' : 'mid';
    // As wide as the room on its side of the circle allows
    const room = ax === 'start' ? w - x : ax === 'end' ? x : 2 * Math.min(x, w - x);
    const label = document.createElement('div');
    label.className = `s-cycle-step ax-${ax} ay-${ay}${lit(i) ? '' : ' is-dim'}`;
    label.style.left = `${f(x)}px`;
    label.style.top = `${f(y)}px`;
    label.style.maxWidth = `${f(Math.max(160, Math.min(room - 4, w * (ax === 'mid' ? 0.46 : 0.4))))}px`;
    const num = document.createElement('span');
    num.className = 's-cycle-num';
    num.textContent = String(i + 1).padStart(2, '0');
    label.append(num, ...[s.kicker, s.head].filter((e): e is HTMLElement => !!e));
    if (s.body.length) {
      const body = document.createElement('div');
      body.className = 's-cycle-body';
      body.append(...s.body);
      label.appendChild(body);
    }
    root.appendChild(label);
  });

  if (opts.center?.length) {
    const c = document.createElement('div');
    c.className = 's-cycle-center';
    c.style.cssText = `left:${f(cx)}px;top:${f(cy)}px;max-width:${f((opts.style === 'chevron' ? r1 : R) * 1.6)}px`;
    c.append(...opts.center);
    root.appendChild(c);
  }
  return root;
}
