import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
  type Chart, type ChartOptions, type Plugin,
} from 'chart.js';
import { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import type { YearRecord } from '../engine/types';
import { money, moneyShort } from './format';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, Filler, Tooltip);

/** Reads the CSS color tokens so charts follow light/dark mode. */
export function useTheme() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return {
      surface: v('--surface'), text: v('--text'), text2: v('--text-2'), muted: v('--muted'), grid: v('--grid'), axis: v('--axis'),
      band: [v('--band-1'), v('--band-2'), v('--band-3')],
      series: [v('--series-1'), v('--series-2'), v('--series-3'), v('--series-4'), v('--series-5')],
    };
  };
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setTheme(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme;
}
export type Theme = ReturnType<typeof useTheme>;

/** Plain names for the three percentile lines (Fidelity: average / below / significantly below average). */
export const BAND_LABELS = {
  p50: 'Typical market (half do better)',
  p25: 'Below average (1 in 4 do worse)',
  p10: 'Bad market (1 in 10 do worse)',
};

export interface Marker {
  year: number;
  label: string;
}

/** Vertical hairlines with small labels for key moments (retirement, 59½, 65, Social Security…). */
function markerPlugin(markers: Marker[], theme: Theme): Plugin<'line'> {
  return {
    id: 'markers',
    afterDatasetsDraw(chart: Chart) {
      const x = chart.scales.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
      const labels = chart.data.labels as number[];
      const placed: { x: number; row: number }[] = [];
      for (const m of [...markers].sort((a, b) => a.year - b.year)) {
        const idx = labels.indexOf(m.year);
        if (idx < 0) continue;
        const px = x.getPixelForValue(idx);
        ctx.strokeStyle = theme.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, top);
        ctx.lineTo(px, bottom);
        ctx.stroke();
        const w = ctx.measureText(m.label).width;
        let row = 0;
        while (placed.some((p) => p.row === row && Math.abs(p.x - px) < w + 8)) row++;
        placed.push({ x: px, row });
        ctx.fillStyle = theme.text2;
        ctx.fillText(m.label, Math.min(px + 3, chart.chartArea.right - w), top + 11 + row * 13);
      }
      ctx.restore();
    },
  };
}

function baseOptions(theme: Theme): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 4 } },
    scales: {
      x: { grid: { display: false }, border: { color: theme.axis }, ticks: { color: theme.muted, maxRotation: 0, autoSkipPadding: 16 } },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid },
        border: { display: false },
        ticks: { color: theme.muted, callback: (v) => moneyShort(Number(v)) },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.surface, titleColor: theme.text, bodyColor: theme.text2, borderColor: theme.axis, borderWidth: 1,
        padding: 10, boxPadding: 4, usePointStyle: true,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y)}` },
      },
    },
  };
}

export function BandsChart({ years, bands, markers, theme, zoom }: {
  years: number[];
  bands: { p50: number[]; p25: number[]; p10: number[] };
  markers: Marker[];
  theme: Theme;
  /** Scale the y-axis to the below-average line; the average line continues off the top. */
  zoom: boolean;
}) {
  const options = baseOptions(theme);
  const zoomMax = Math.max(...bands.p25) * 1.1;
  if (zoom && zoomMax > 0) options.scales!.y = { ...options.scales!.y, max: niceCeil(zoomMax) };
  const line = (label: string, data: number[], color: string, extra = {}) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2, ...extra,
  });
  return (
    <div className="chart-box">
      <Line
        data={{
          labels: years,
          datasets: [
            line(BAND_LABELS.p50, bands.p50, theme.band[0]),
            line(BAND_LABELS.p25, bands.p25, theme.band[1]),
            line(BAND_LABELS.p10, bands.p10, theme.band[2], { fill: { target: 0, above: 'transparent', below: hexAlpha(theme.band[1], 0.1) } }),
          ],
        }}
        options={options}
        plugins={[markerPlugin(markers, theme)]}
      />
    </div>
  );
}

const ACCOUNTS: { key: keyof YearRecord['balances']; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'taxable', label: 'Brokerage' },
  { key: 'pretax', label: '401(k)/IRA' },
  { key: 'roth', label: 'Roth' },
  { key: 'hsa', label: 'HSA' },
];

export function accountLegend(theme: Theme) {
  return ACCOUNTS.map((a, i) => ({ label: a.label, color: theme.series[i] }));
}

export function AccountsChart({ records, theme }: { records: YearRecord[]; theme: Theme }) {
  const opts = baseOptions(theme) as unknown as ChartOptions<'bar'>;
  opts.scales!.x = { ...opts.scales!.x, stacked: true };
  opts.scales!.y = { ...opts.scales!.y, stacked: true };
  return (
    <div className="chart-box">
      <Bar
        data={{
          labels: records.map((r) => r.year),
          datasets: ACCOUNTS.map((a, i) => ({
            label: a.label,
            data: records.map((r) => r.balances[a.key]),
            backgroundColor: theme.series[i],
            borderColor: theme.surface,
            borderWidth: { top: 1, bottom: 1, left: 0, right: 0 },
            borderSkipped: false,
            maxBarThickness: 24,
            categoryPercentage: 0.9,
            barPercentage: 1,
          })),
        }}
        options={opts}
      />
    </div>
  );
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(x))) / 2;
  return Math.ceil(x / step) * step;
}

function hexAlpha(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
