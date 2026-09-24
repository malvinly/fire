// Parsing what is typed into number fields (D72).
import { describe, expect, test } from 'vitest';
import { fieldBlock, parseFieldText, parseYearText, yearTextFor } from '../src/ui/format';

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
