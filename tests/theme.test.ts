import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  loadStoredTheme,
  normalizeTheme,
  saveStoredTheme,
  toggleThemeValue,
} from '../src/utils/theme.ts';

test('normalizeTheme and toggleThemeValue handle dark/light transitions safely', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme(null), 'dark');
  assert.equal(normalizeTheme('sepia'), 'dark');

  assert.equal(toggleThemeValue('dark'), 'light');
  assert.equal(toggleThemeValue('light'), 'dark');
});

test('loadStoredTheme and saveStoredTheme persist user preference in localStorage', () => {
  const store = new Map<string, string>();
  const prevWindow = (globalThis as { window?: unknown }).window;

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };

  try {
    assert.equal(loadStoredTheme(), 'dark');
    saveStoredTheme('light');
    assert.equal(store.get(THEME_STORAGE_KEY), 'light');
    assert.equal(loadStoredTheme(), 'light');

    saveStoredTheme('dark');
    assert.equal(store.get(THEME_STORAGE_KEY), 'dark');
    assert.equal(loadStoredTheme(), 'dark');
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});

test('applyThemeToDocument toggles .dark class, dataset, colorScheme, and theme-color meta', () => {
  const classes = new Set<string>(['dark']);
  let metaColor = '#09090b';
  const prevDocument = (globalThis as { document?: unknown }).document;

  (globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: {
        toggle: (cls: string, force?: boolean) => {
          const shouldAdd = force === undefined ? !classes.has(cls) : force;
          if (shouldAdd) classes.add(cls);
          else classes.delete(cls);
          return shouldAdd;
        },
      },
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
    },
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]'
        ? {
            setAttribute: (_attr: string, val: string) => {
              metaColor = val;
            },
          }
        : null,
  };

  try {
    applyThemeToDocument('light');
    assert.equal(classes.has('dark'), false);
    assert.equal((globalThis.document.documentElement as any).dataset.theme, 'light');
    assert.equal((globalThis.document.documentElement as any).style.colorScheme, 'light');
    assert.equal(metaColor, '#ffffff');

    applyThemeToDocument('dark');
    assert.equal(classes.has('dark'), true);
    assert.equal((globalThis.document.documentElement as any).dataset.theme, 'dark');
    assert.equal((globalThis.document.documentElement as any).style.colorScheme, 'dark');
    assert.equal(metaColor, '#09090b');
  } finally {
    (globalThis as { document?: unknown }).document = prevDocument;
  }
});
