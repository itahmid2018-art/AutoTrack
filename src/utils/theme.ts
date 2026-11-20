export type AppTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'autotrack_theme_mode_v1';

export function normalizeTheme(raw: unknown): AppTheme {
  return raw === 'light' ? 'light' : 'dark';
}

export function toggleThemeValue(current: AppTheme): AppTheme {
  return current === 'dark' ? 'light' : 'dark';
}

export function loadStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

export function saveStoredTheme(theme: AppTheme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota / privacy mode write errors
  }
}

export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', theme === 'dark' ? '#09090b' : '#ffffff');
  }
}
