// Dark or light colours: the operating system's preference on arrival, and the top-bar toggle to switch for
// this visit (D91). Nothing is remembered; the next visit starts from the system preference again.

export type ThemeChoice = 'dark' | 'light';

const PAGE_COLOR: Record<ThemeChoice, string> = { dark: '#1a1a19', light: '#fcfcfb' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the operating system prefers right now (dark where that can't be asked). */
export function systemTheme(): ThemeChoice {
  return typeof matchMedia === 'function' && !matchMedia(DARK_QUERY).matches ? 'light' : 'dark';
}

/** Switches the page to `theme` and tells the charts (they read the colours from CSS). */
export function applyTheme(theme: ThemeChoice) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_COLOR[theme]);
  window.dispatchEvent(new Event('themechange'));
}
