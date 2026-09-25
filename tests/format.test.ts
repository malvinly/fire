// Parsing what is typed into number fields (D72).
import { describe, expect, test } from 'vitest';
import { examplePlan } from '../src/engine/defaults';
import { andList, coastVerb, fieldBlock, moneyText, nameIs, parseFieldText, parseYearText, whose, yearTextFor } from '../src/ui/format';

describe('shared wording', () => {
  test('lists read "a", "a and b", "a, b and c"', () => {
    expect(andList([])).toBe('');
    expect(andList(['a'])).toBe('a');
    expect(andList(['a', 'b'])).toBe('a and b');
    expect(andList(['a', 'b', 'c'])).toBe('a, b and c');
  });

  test('a Coast plan "stops saving" unless anything is kept while coasting, then it "cuts back saving" (D94)', () => {
    const plan = examplePlan(2026);
    expect(coastVerb(plan)).toBe('stop saving');
    plan.spouse.coastContributions.hsa = 1;
    expect(coastVerb(plan)).toBe('cut back saving');
  });
});

describe('number fields', () => {
  test('whole-number fields round what is typed', () => {
    expect(parseFieldText('96.5', 'int')).toBe(97);
    expect(parseFieldText('2026.4', 'int')).toBe(2026);
    expect(parseFieldText('62.5', 'int')).toBe(63);
  });

  test('percent fields store a fraction; money keeps cents; empty and junk are recognized', () => {
    expect(parseFieldText('4.5', 'percent')).toBeCloseTo(0.045, 12);
    expect(parseFieldText('1234.56', 'money')).toBe(1234.56);
    expect(parseFieldText('  ', 'money')).toBeNull();
    expect(parseFieldText('abc', 'money')).toBeUndefined();
  });

  test('money boxes accept thousands separators and a dollar sign, and show separators when not edited (D90)', () => {
    expect(parseFieldText('300,000', 'money')).toBe(300_000);
    expect(parseFieldText('$1,234.5', 'money')).toBe(1234.5);
    expect(moneyText(300_000)).toBe('300,000');
    expect(moneyText(1234.5)).toBe('1,234.5');
    expect(moneyText(null)).toBe('');
  });
});

describe('the default name "You" reads as a pronoun (D90)', () => {
  test('possessive and "is"', () => {
    expect(whose('You')).toBe('your');
    expect(whose('you')).toBe('your');
    expect(whose('Alex')).toBe('Alex’s');
    expect(nameIs('You')).toBe('you are');
    expect(nameIs('Alex')).toBe('Alex is');
  });
});

describe('blocked values (D76)', () => {
  test('values outside a field’s limits are refused with a message in the units typed', () => {
    expect(fieldBlock(-1, 'money', { min: 0 })).toBe('Must be at least $0.');
    expect(fieldBlock(1.5, 'percent', { min: 0, max: 1 })).toBe('Must be at most 100%.');
    expect(fieldBlock(-5, 'money', { min: 0, rangeMessage: 'No debts here.' })).toBe('No debts here.');
    expect(fieldBlock(30, 'int', { check: (v) => (v <= 42 ? 'Too young.' : null) })).toBe('Too young.');
    expect(fieldBlock(0.5, 'percent', { min: 0, max: 1 })).toBeNull();
  });
});

describe('year picker (D84)', () => {
  test('a typed year is applied only once it is a whole year in range', () => {
    expect(parseYearText('2040', 2026, 2080)).toBe(2040);
    expect(parseYearText('2026', 2026, 2080)).toBe(2026);
    expect(parseYearText('2080', 2026, 2080)).toBe(2080);
    // Digits on the way to a year, and years outside the plan, are not applied.
    expect(parseYearText('2', 2026, 2080)).toBeNull();
    expect(parseYearText('204', 2026, 2080)).toBeNull();
    expect(parseYearText('2025', 2026, 2080)).toBeNull();
    expect(parseYearText('2081', 2026, 2080)).toBeNull();
    expect(parseYearText('20400', 2026, 2080)).toBeNull();
    expect(parseYearText('2040.5', 2026, 2080)).toBeNull();
    expect(parseYearText('', 2026, 2080)).toBeNull();
    expect(parseYearText('abc', 2026, 2080)).toBeNull();
  });

  test('a year changed from outside (− / +, "Back to earliest") replaces the typed text unless it already reads as that year', () => {
    expect(yearTextFor('204', 2041, 2026, 2080)).toBe('2041'); // half-typed text gives way to the new year
    expect(yearTextFor('2039', 2041, 2026, 2080)).toBe('2041');
    expect(yearTextFor('2041', 2041, 2026, 2080)).toBe('2041');
    expect(yearTextFor('02041', 2041, 2026, 2080)).toBe('02041'); // the year just typed stays as typed
  });
});
