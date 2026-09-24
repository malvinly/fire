export function money(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

/** $1.23M / $456K style for cards and axes. */
export function moneyShort(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function percent(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

/**
 * What a number field holds for the text typed into it: null when empty, undefined when it isn't a number yet.
 * Percent fields store a fraction; whole-number fields round (a fractional year or age breaks the plan).
 */
export function parseFieldText(text: string, kind: 'money' | 'percent' | 'int' | 'number'): number | null | undefined {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  if (kind === 'int') return Math.round(n);
  return kind === 'percent' ? n / 100 : n;
}

/**
 * Why a typed value can't be accepted (pending-work decision 6: impossible values are blocked, D76), or null.
 * `min`/`max` are in stored units; the message shows them as typed (percent × 100).
 */
export function fieldBlock(v: number, kind: 'money' | 'percent' | 'int' | 'number', opts: {
  min?: number; max?: number; rangeMessage?: string; check?: (v: number) => string | null;
}): string | null {
  const shown = (x: number) => (kind === 'percent' ? `${+(x * 100).toFixed(3)}%` : kind === 'money' ? money(x) : String(x));
  if (opts.min !== undefined && v < opts.min) return opts.rangeMessage ?? `Must be at least ${shown(opts.min)}.`;
  if (opts.max !== undefined && v > opts.max) return opts.rangeMessage ?? `Must be at most ${shown(opts.max)}.`;
  return opts.check?.(v) ?? null;
}
