// The colour choice starts from the system preference (D91).
import { afterEach, describe, expect, test } from 'vitest';
import { systemTheme } from '../src/ui/theme';

const g = globalThis as { matchMedia?: unknown };

afterEach(() => { delete g.matchMedia; });

describe('theme choice', () => {
  test('follows the system preference', () => {
    g.matchMedia = (q: string) => ({ matches: q.includes('dark') });
    expect(systemTheme()).toBe('dark');
    g.matchMedia = () => ({ matches: false });
    expect(systemTheme()).toBe('light');
  });

  test('dark where the preference cannot be asked', () => {
    expect(systemTheme()).toBe('dark');
  });
});
