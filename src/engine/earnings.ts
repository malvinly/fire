import type { EarningsYear } from './types';

/**
 * Parses an SSA earnings record. Accepts either the XML statement download from my Social Security
 * (<osss:Earnings startYear="1999" ...><osss:FicaEarnings>12345</osss:FicaEarnings>) or pasted text with one
 * "year amount" pair per line (e.g. copied from the statement table: "1999   $12,345   $12,345").
 * For pasted tables the first dollar amount after the year is used (the Social Security column comes first).
 */
export function parseEarnings(text: string): EarningsYear[] {
  const byYear = new Map<number, number>();
  if (/FicaEarnings/i.test(text)) {
    const re = /startYear="(\d{4})"[\s\S]*?<[^>]*FicaEarnings>\s*([\d.,]+)\s*</gi;
    for (const m of text.matchAll(re)) byYear.set(Number(m[1]), toNumber(m[2]));
  } else {
    for (const line of text.split(/\r?\n/)) {
      // Multi-year range rows ("1981-1990 $123,456") can't be split into years; skip them.
      if (/^\s*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}/.test(line)) continue;
      // An amount is digits with comma thousands separators ("62,889") or plain digits, so a comma-separated
      // row ("2021,62889,62889") is not read as one run-together number.
      const m = line.match(/^\s*((?:19|20)\d{2})\b\D*?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/);
      if (m) byYear.set(Number(m[1]), toNumber(m[2]));
    }
  }
  return [...byYear].map(([year, amount]) => ({ year, amount })).sort((a, b) => a.year - b.year);
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, '')) || 0;
}
