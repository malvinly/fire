// Parsing what is typed into number fields (fix 10).
import { describe, expect, test } from 'vitest';
import { parseFieldText } from '../src/ui/format';

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
