// Parsing what is typed into number fields (fix 10).
import { describe, expect, test } from 'vitest';
import { fieldBlock, parseFieldText } from '../src/ui/format';

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

describe('blocked values (fix 16)', () => {
  test('values outside a field’s limits are refused with a message in the units typed', () => {
    expect(fieldBlock(-1, 'money', { min: 0 })).toBe('Must be at least $0.');
    expect(fieldBlock(1.5, 'percent', { min: 0, max: 1 })).toBe('Must be at most 100%.');
    expect(fieldBlock(-5, 'money', { min: 0, rangeMessage: 'No debts here.' })).toBe('No debts here.');
    expect(fieldBlock(30, 'int', { check: (v) => (v <= 42 ? 'Too young.' : null) })).toBe('Too young.');
    expect(fieldBlock(0.5, 'percent', { min: 0, max: 1 })).toBeNull();
  });
});
