// Builds src/data/market.json from Robert Shiller's ie_data.xls and Aswath Damodaran's histretSP.xls.
//
// Usage:  npm run data:build              (downloads the raw files into data/raw/ if missing)
//         npm run data:build -- --refresh (re-downloads them)
//
// Shiller's download URL changes whenever he updates the file. If the download fails or looks stale,
// copy the current "DOWNLOAD" link from https://shillerdata.com/ into SHILLER_URL below.
//
// Each output row is one calendar year measured January-to-January:
//   stocks    S&P 500 total return (Shiller "Real Total Return Price" re-inflated with CPI)
//   bonds     10-year Treasury total return (Shiller "Real Total Bond Returns" re-inflated with CPI)
//   cash      1928+: Damodaran 3-month T-bill (average rate for the year)
//             pre-1928: January GS10 yield as pure income (no price change) — see docs/DECISIONS.md
//   inflation CPI January-to-January
//   bondYield      January 10-year Treasury yield (Shiller GS10), for taxing bond interest (D82)
//   dividendYield  January S&P 500 dividend yield (Shiller D / P), for taxing dividends (D82)
// All values are nominal decimals (0.05 = 5%).

import * as XLSX from 'xlsx';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SHILLER_URL =
  'https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/downloads/70fec4f5-727f-4e53-b5f1-179af109c5fa/ie_data.xls';
const DAMODARAN_URL = 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls';
const RAW_DIR = 'data/raw';
const OUT = 'src/data/market.json';

async function fetchIfMissing(url: string, path: string, refresh: boolean): Promise<Buffer> {
  if (refresh || !existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log(`downloaded ${path}`);
  }
  return readFileSync(path);
}

function sheetRows(buf: Buffer, sheet: string): unknown[][] {
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" not found; sheets: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
}

// Shiller Data sheet columns (0-based): 0 Date (1871.01 = Jan 1871), 1 S&P price P, 2 dividend D (12 months),
// 4 CPI, 6 GS10 (%), 9 Real Total Return Price, 18 Real Total Bond Returns (index).
interface January { price: number; dividend: number; cpi: number; gs10: number; stockIdx: number; bondIdx: number }

function shillerJanuaries(rows: unknown[][]): Map<number, January> {
  const out = new Map<number, January>();
  for (const r of rows) {
    const date = r[0];
    if (typeof date !== 'number') continue;
    const year = Math.floor(date);
    const month = Math.round((date - year) * 100);
    if (month !== 1) continue;
    const [price, dividend, cpi, gs10, stockIdx, bondIdx] = [r[1], r[2], r[4], r[6], r[9], r[18]];
    if ([price, dividend, cpi, gs10, stockIdx, bondIdx].every((v) => typeof v === 'number')) {
      out.set(year, {
        price: price as number,
        dividend: dividend as number,
        cpi: cpi as number,
        gs10: gs10 as number,
        stockIdx: stockIdx as number,
        bondIdx: bondIdx as number,
      });
    }
  }
  return out;
}

// Damodaran "Returns by year" sheet: column 0 year, column 3 3-month T-bill.
function damodaranTbills(rows: unknown[][]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (typeof r[0] === 'number' && r[0] >= 1928 && r[0] < 2200 && typeof r[3] === 'number') out.set(r[0], r[3]);
  }
  return out;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  mkdirSync(RAW_DIR, { recursive: true });
  const shiller = await fetchIfMissing(SHILLER_URL, `${RAW_DIR}/ie_data.xls`, refresh);
  const damodaran = await fetchIfMissing(DAMODARAN_URL, `${RAW_DIR}/histretSP.xls`, refresh);

  const jan = shillerJanuaries(sheetRows(shiller, 'Data'));
  const tbill = damodaranTbills(sheetRows(damodaran, 'Returns by year'));

  const years: {
    year: number;
    stocks: number;
    bonds: number;
    cash: number;
    inflation: number;
    bondYield: number;
    dividendYield: number;
  }[] = [];
  const firstYear = Math.min(...jan.keys());
  for (let y = firstYear; jan.has(y) && jan.has(y + 1); y++) {
    const a = jan.get(y)!;
    const b = jan.get(y + 1)!;
    const inflation = b.cpi / a.cpi - 1;
    const stocks = (b.stockIdx / a.stockIdx) * (1 + inflation) - 1;
    const bonds = (b.bondIdx / a.bondIdx) * (1 + inflation) - 1;
    let cash: number;
    if (y >= 1928) {
      const t = tbill.get(y);
      if (t === undefined) break; // Damodaran not yet updated for this year: stop so every row is complete
      cash = t;
    } else {
      cash = a.gs10 / 100;
    }
    years.push({
      year: y,
      stocks: round(stocks),
      bonds: round(bonds),
      cash: round(cash),
      inflation: round(inflation),
      bondYield: round(a.gs10 / 100),
      dividendYield: round(a.dividend / a.price),
    });
  }

  const out = {
    description:
      'Annual nominal US returns, January-to-January, and the January 10-year Treasury and S&P 500 dividend yields. See scripts/build-market-data.ts.',
    sources: {
      stocksBondsInflation: 'Robert J. Shiller, ie_data.xls (https://shillerdata.com/)',
      cash1928Plus: 'Aswath Damodaran, histretSP.xls 3-month T-bill (https://pages.stern.nyu.edu/~adamodar/)',
      cashPre1928: 'Shiller January GS10 long-term yield used as income-only cash return (approximation)',
      yields: 'Shiller January GS10 long-term yield (bondYield) and dividend D / price P (dividendYield)',
    },
    generated: new Date().toISOString().slice(0, 10),
    firstYear: years[0].year,
    lastYear: years[years.length - 1].year,
    years,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${OUT}: ${out.firstYear}-${out.lastYear} (${years.length} years)`);
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
