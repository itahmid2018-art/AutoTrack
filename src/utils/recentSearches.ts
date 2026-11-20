export const RECENT_JOB_SEARCHES_KEY = 'autotrack_recent_job_searches_v1';
export const MAX_RECENT_JOB_SEARCHES = 5;

function getSafeStorage(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (storage !== undefined) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeRecentJobIds(raw: unknown, maxItems = MAX_RECENT_JOB_SEARCHES): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export function recordRecentJobId(
  currentIds: string[],
  jobId: string,
  maxItems = MAX_RECENT_JOB_SEARCHES
): string[] {
  const cleaned = jobId.trim();
  if (!cleaned) return normalizeRecentJobIds(currentIds, maxItems);
  return normalizeRecentJobIds([cleaned, ...currentIds.filter((id) => id !== cleaned)], maxItems);
}

export function removeRecentJobId(currentIds: string[], jobId: string): string[] {
  const cleaned = jobId.trim();
  return currentIds.filter((id) => id !== cleaned);
}

export function loadRecentJobIds(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): string[] {
  const target = getSafeStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(RECENT_JOB_SEARCHES_KEY);
    if (!raw) return [];
    return normalizeRecentJobIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveRecentJobIds(
  jobIds: string[],
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): string[] {
  const normalized = normalizeRecentJobIds(jobIds);
  const target = getSafeStorage(storage);
  if (!target) return normalized;
  try {
    if (normalized.length === 0) {
      target.removeItem(RECENT_JOB_SEARCHES_KEY);
    } else {
      target.setItem(RECENT_JOB_SEARCHES_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
  return normalized;
}
