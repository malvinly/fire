import { coastContributionTotal } from '../engine/defaults';
import type { Plan } from '../engine/types';

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
  const n = Number(text.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  if (kind === 'int') return Math.round(n);
  return kind === 'percent' ? n / 100 : n;
}

/** A money box's text while it isn't being edited: thousands separators, no symbol ("300,000"). */
export function moneyText(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** "your" for the default name "You", otherwise the possessive ("Alex’s"). */
export function whose(name: string): string {
  return /^you$/i.test(name.trim()) ? 'your' : `${name}’s`;
}

/** "you are" for the default name "You", otherwise "Alex is". */
export function nameIs(name: string): string {
  return /^you$/i.test(name.trim()) ? 'you are' : `${name} is`;
}

/**
 * The year typed into the year picker, or null until it is a whole year within [min, max]. Digits on the way
 * to a year ("20", "204") are kept as text but not applied (D84).
 */
export function parseYearText(text: string, min: number, max: number): number | null {
  const v = parseFieldText(text, 'number');
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** The year picker's text once the year changes from outside to `value`: kept if it already reads as that year (D84). */
export function yearTextFor(text: string, value: number, min: number, max: number): string {
  return parseYearText(text, min, max) === value ? text : String(value);
}

/**
 * Why a typed value can't be accepted (impossible values are blocked, D76), or null.
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

/** "a", "a and b", "a, b and c". */
export function andList(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What a Coast plan does in its stop year: stop saving, or, when anything is kept while coasting (D94), cut back. */
export function coastVerb(plan: Plan): 'stop saving' | 'cut back saving' {
  return coastContributionTotal(plan) > 0 ? 'cut back saving' : 'stop saving';
}
