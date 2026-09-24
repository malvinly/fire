import { expect, test } from 'vitest';
import { parseEarnings } from '../src/engine/earnings';

test('parses pasted statement rows, taking the Social Security column', () => {
  const text = `Work Year  Taxed Social Security Earnings  Taxed Medicare Earnings
2021  $62,889  $62,889
2022  66,421   66,421
junk line
2023	$69,560	$69,560`;
  expect(parseEarnings(text)).toEqual([
    { year: 2021, amount: 62_889 },
    { year: 2022, amount: 66_421 },
    { year: 2023, amount: 69_560 },
  ]);
});

test('parses the SSA XML statement format', () => {
  const xml = `<osss:EarningsRecord>
  <osss:Earnings startYear="2019" endYear="2019"><osss:FicaEarnings>55848</osss:FicaEarnings><osss:MedicareEarnings>55848</osss:MedicareEarnings></osss:Earnings>
  <osss:Earnings startYear="2020" endYear="2020">
    <osss:FicaEarnings>57590</osss:FicaEarnings>
  </osss:Earnings></osss:EarningsRecord>`;
  expect(parseEarnings(xml)).toEqual([
    { year: 2019, amount: 55_848 },
    { year: 2020, amount: 57_590 },
  ]);
});

test('skips multi-year range rows instead of reading the second year as dollars', () => {
  expect(parseEarnings('1981-1990  $123,456\n1991  $20,000')).toEqual([{ year: 1991, amount: 20_000 }]);
});
