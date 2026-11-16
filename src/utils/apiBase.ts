/**
 * Resolves relative `/api/...` paths against an optional remote backend origin
 * configured via `VITE_API_BASE_URL` (for Capacitor Android/tablet builds) or
 * stored override in localStorage (`autotrack_api_base_url`).
 * Defaults to same-origin relative paths when running inside the web host.
 */
export function getApiBaseUrl(): string {
  const envBase =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : '';

  if (envBase) {
    return envBase.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem('autotrack_api_base_url')?.trim() || '';
      if (stored && /^https?:\/\//i.test(stored)) {
        return stored.replace(/\/+$/, '');
      }
    } catch {
      // Ignore storage access restrictions
    }
  }

  return '';
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
