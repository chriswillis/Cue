/**
 * Charts from tables: `// chart: bar` (or `line`) on a slide turns its table
 * into an SVG chart drawn in the theme's colors and type. The table stays the
 * source, so the text is still the only state.
 *
 *   | Quarter | Revenue |       first column: categories (x axis)
 *   |---------|--------:|       other columns: one series each (up to 4)
 *   | Q1      | $1.2M   |       values keep their own format for labels
 *
 * Marks follow the house rules: one baseline at zero, recessive gridlines,
 * values labeled at the bar cap or line end, a legend only for 2+ series.
 * Sizes are logical slide pixels (a 1920 px slide), like everything else.
 */

export type ChartKind = 'bar' | 'line';

interface Cell {
  text: string;
  value: number;
}

interface Data {
  categories: string[];
  series: { name: string; cells: Cell[] }[];
  /** prefix and suffix of the first value, for axis ticks: "$", "M" */
  prefix: string;
  suffix: string;
}

/** "$12.4M" → 12.4, "−5%" → -5, "1,200" → 1200. NaN when there's no number. */
function num(text: string): { value: number; prefix: string; suffix: string } {
  const t = text.trim().replace(/−/g, '-');
  const m = /^([^\d.,-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(t);
  if (!m) return { value: NaN, prefix: '', suffix: '' };
  return { value: Number(m[2].replace(/,/g, '')), prefix: m[1].trim(), suffix: m[3].trim() };
}

function read(table: HTMLTableElement): Data | null {
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent?.trim() ?? ''));
  if (rows.length < 3) return null;
  const [head, ...body] = rows;
  const series = head.slice(1, 5).map((name, j) => ({ name, cells: body.map((r) => ({ text: r[j + 1] ?? '', value: num(r[j + 1] ?? '').value })) }));
  const usable = series.filter((s) => s.cells.some((c) => Number.isFinite(c.value)));
  if (!usable.length) return null;
  const first = num(usable[0].cells.find((c) => Number.isFinite(c.value))!.text);
  return { categories: body.map((r) => r[0] ?? ''), series: usable, prefix: first.prefix, suffix: first.suffix };
}

/** Round tick steps: 1, 2, 2.5, 5 × 10ⁿ, about four of them. */
function ticks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const fmtTick = (v: number, d: Data) => (v === 0 ? '0' : `${d.prefix}${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${d.suffix}`);

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/**
 * The chart as an SVG string. width/height are logical slide pixels; text
 * sizes come from the slide's own type (passed in so the chart matches).
 */
export function chartSVG(table: HTMLTableElement, kind: ChartKind, width: number, height: number, label: number): string | null {
  const d = read(table);
  if (!d) return null;
  const multi = d.series.length > 1;
  const legendH = multi ? label * 2.4 : 0;
  const values = d.series.flatMap((s) => s.cells.map((c) => c.value)).filter(Number.isFinite);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const t = ticks(lo, hi);
  const yMin = t[0];
  const yMax = t[t.length - 1];

  // Plot area: room on the left for tick labels, below for categories
  const tickW = Math.max(...t.map((v) => fmtTick(v, d).length)) * label * 0.62 + label;
  const left = tickW;
  const right = kind === 'line' ? label * 5 : label;
  const top = legendH + label * 1.8; // value labels above the tallest bar
  const bottom = label * 2.4;
  const pw = width - left - right;
  const ph = height - top - bottom;
  const y = (v: number) => top + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
  const n = d.categories.length;
  const band = pw / n;
  const cx = (i: number) => left + band * (i + 0.5);

  const parts: string[] = [];
  // Gridlines and tick labels (recessive), baseline at zero (stronger)
  for (const v of t) {
    parts.push(`<line class="c-grid${v === 0 ? ' is-zero' : ''}" x1="${left}" x2="${left + pw}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="c-tick" x="${left - label * 0.6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${esc(fmtTick(v, d))}</text>`);
  }
  // Category labels
  d.categories.forEach((c, i) => {
    parts.push(`<text class="c-cat" x="${cx(i)}" y="${top + ph + label * 1.5}" text-anchor="middle">${esc(c)}</text>`);
  });

  if (kind === 'bar') {
    const k = d.series.length;
    const gap = 4; // surface gap between touching bars
    const barW = Math.min(120, (band * 0.62 - gap * (k - 1)) / k);
    const r = Math.min(8, barW / 4);
    d.series.forEach((s, j) => {
      s.cells.forEach((c, i) => {
        if (!Number.isFinite(c.value)) return;
        const x = cx(i) - (k * barW + gap * (k - 1)) / 2 + j * (barW + gap);
        const y0 = y(0);
        const y1 = y(c.value);
        const h = Math.abs(y0 - y1);
        const up = c.value >= 0;
        // Rounded at the data end, square at the baseline
        const rr = Math.min(r, h);
        const path = up
          ? `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + barW - rr} Q${x + barW},${y1} ${x + barW},${y1 + rr} V${y0} Z`
          : `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + barW - rr} Q${x + barW},${y1} ${x + barW},${y1 - rr} V${y0} Z`;
        parts.push(`<path class="c-mark c-s${j}" d="${path}"><title>${esc(`${d.categories[i]}, ${s.name}: ${c.text}`)}</title></path>`);
        // Value at the cap (only one series, or few bars, to keep it sparing)
        if (k === 1 || n * k <= 12) {
          parts.push(`<text class="c-value" x="${x + barW / 2}" y="${up ? y1 - label * 0.55 : y1 + label * 1.2}" text-anchor="middle">${esc(c.text)}</text>`);
        }
      });
    });
  } else {
    d.series.forEach((s, j) => {
      const pts = s.cells.map((c, i) => (Number.isFinite(c.value) ? [cx(i), y(c.value)] : null)).filter((p): p is number[] => !!p);
      if (!pts.length) return;
      parts.push(`<polyline class="c-line c-s${j}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`);
      const lastIdx = s.cells.map((c) => Number.isFinite(c.value)).lastIndexOf(true);
      const [lx, ly] = pts[pts.length - 1];
      parts.push(`<circle class="c-dot c-s${j}" cx="${lx}" cy="${ly}" r="10"/>`);
      // The end value, labeled once
      parts.push(`<text class="c-value" x="${lx + label * 0.9}" y="${ly}" dominant-baseline="middle">${esc(s.cells[lastIdx].text)}</text>`);
    });
  }

  // Legend for two or more series: a swatch beside each name
  if (multi) {
    let x = left;
    d.series.forEach((s, j) => {
      parts.push(`<rect class="c-key c-s${j}" x="${x}" y="${label * 0.25}" width="${label * 0.9}" height="${label * 0.9}" rx="3"/>`);
      parts.push(`<text class="c-legend" x="${x + label * 1.3}" y="${label * 0.7}" dominant-baseline="middle">${esc(s.name)}</text>`);
      x += label * 2.6 + s.name.length * label * 0.6;
    });
  }

  const title = `${kind === 'bar' ? 'Bar' : 'Line'} chart of ${d.series.map((s) => s.name).join(', ')} by ${table.querySelector('th')?.textContent?.trim() || 'category'}`;
  return `<svg class="c-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}" style="--c-label:${label}px">${parts.join('')}</svg>`;
}
