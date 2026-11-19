import { BusinessSettings, InventoryItem, JobCard, RecurringMaintenance } from '../types';

const DATA_CACHE_NAME = 'autotrack-data-v1';
const JOB_CARDS_CACHE_URL = '/__offline-cache/job-cards.json';
const INVENTORY_CACHE_URL = '/__offline-cache/inventory.json';
const SCHEDULES_CACHE_URL = '/__offline-cache/schedules.json';
const SETTINGS_CACHE_URL = '/__offline-cache/settings.json';

interface CachedEnvelope<T> {
  cachedAt: string | null;
  data: T | null;
}

function isCacheableAppUrl(pathname: string, search: string): boolean {
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/__offline-cache/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/node_modules/') ||
    pathname === '/sw.js' ||
    /\.(ts|tsx)$/i.test(pathname)
  ) {
    return false;
  }
  if (search) {
    const params = new URLSearchParams(search);
    if (params.has('v') || params.has('t') || params.has('import')) {
      return false;
    }
  }
  return true;
}

function collectLoadedAssetUrls(): string[] {
  if (typeof window === 'undefined') return [];
  const urls = new Set<string>(['/', '/index.html']);

  document.querySelectorAll('script[src], link[href]').forEach((el) => {
    const attr = el.getAttribute('src') || el.getAttribute('href');
    if (!attr || !attr.startsWith('/')) return;
    try {
      const parsed = new URL(attr, window.location.origin);
      if (parsed.origin === window.location.origin && isCacheableAppUrl(parsed.pathname, parsed.search)) {
        urls.add(parsed.pathname + parsed.search);
      }
    } catch {
      // Ignore malformed attribute URL
    }
  });

  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    resources.forEach((entry) => {
      try {
        const parsed = new URL(entry.name);
        if (
          parsed.origin === window.location.origin &&
          isCacheableAppUrl(parsed.pathname, parsed.search)
        ) {
          urls.add(parsed.pathname + parsed.search);
        }
      } catch {
        // Ignore invalid resource URL
      }
    });
  }

  return Array.from(urls);
}

export async function warmStaticAssetsInSw(registration?: ServiceWorkerRegistration | null): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const worker = registration?.active || navigator.serviceWorker.controller;
  if (!worker) return;

  const urls = collectLoadedAssetUrls();
  if (urls.length > 0) {
    worker.postMessage({ type: 'PRECACHE_ASSETS', urls });
  }
}

export async function registerWorkshopServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    if (typeof caches !== 'undefined') {
      void caches.delete('autotrack-static-v1').catch(() => false);
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    void registration.update().catch(() => null);

    if (registration.active) {
      void warmStaticAssetsInSw(registration);
    }

    navigator.serviceWorker.ready
      .then((readyReg) => warmStaticAssetsInSw(readyReg))
      .catch(() => null);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void warmStaticAssetsInSw(registration);
    });

    return registration;
  } catch (err) {
    console.warn('Service Worker registration skipped:', err);
    return null;
  }
}

async function putCacheJson(url: string, data: unknown): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(DATA_CACHE_NAME);
    const body = JSON.stringify({
      cachedAt: new Date().toISOString(),
      data,
    });
    await cache.put(
      url,
      new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Source': 'autotrack-client-sync',
        },
      })
    );
  } catch (err) {
    console.warn('Offline data cache write warning:', err);
  }
}

export async function syncRecordsToServiceWorker(payload: {
  jobCards?: JobCard[];
  inventory?: InventoryItem[];
  schedules?: RecurringMaintenance[];
  settings?: BusinessSettings;
}): Promise<void> {
  const writes: Promise<void>[] = [];
  if (Array.isArray(payload.jobCards)) {
    writes.push(putCacheJson(JOB_CARDS_CACHE_URL, payload.jobCards));
  }
  if (Array.isArray(payload.inventory)) {
    writes.push(putCacheJson(INVENTORY_CACHE_URL, payload.inventory));
  }
  if (Array.isArray(payload.schedules)) {
    writes.push(putCacheJson(SCHEDULES_CACHE_URL, payload.schedules));
  }
  if (payload.settings) {
    writes.push(putCacheJson(SETTINGS_CACHE_URL, payload.settings));
  }
  await Promise.allSettled(writes);

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SYNC_OFFLINE_RECORDS',
      jobCards: payload.jobCards,
      inventory: payload.inventory,
      schedules: payload.schedules,
      settings: payload.settings,
    });
  }
}

async function readCacheJson<T>(url: string): Promise<{ cachedAt: string | null; data: T | null }> {
  if (typeof caches === 'undefined') {
    return { cachedAt: null, data: null };
  }
  try {
    const cache = await caches.open(DATA_CACHE_NAME);
    const match = await cache.match(url);
    if (!match) return { cachedAt: null, data: null };
    const parsed = (await match.json()) as CachedEnvelope<T>;
    return {
      cachedAt: parsed?.cachedAt || null,
      data: parsed?.data ?? null,
    };
  } catch {
    return { cachedAt: null, data: null };
  }
}

export async function readOfflineCachedJobCards(): Promise<{
  cachedAt: string | null;
  jobCards: JobCard[] | null;
}> {
  const { cachedAt, data } = await readCacheJson<JobCard[]>(JOB_CARDS_CACHE_URL);
  return {
    cachedAt,
    jobCards: Array.isArray(data) ? data : null,
  };
}

export async function readOfflineCachedAllRecords(): Promise<{
  cachedAt: string | null;
  jobCards: JobCard[] | null;
  inventory: InventoryItem[] | null;
  schedules: RecurringMaintenance[] | null;
  settings: BusinessSettings | null;
}> {
  const [jobsRes, invRes, schedRes, setRes] = await Promise.all([
    readCacheJson<JobCard[]>(JOB_CARDS_CACHE_URL),
    readCacheJson<InventoryItem[]>(INVENTORY_CACHE_URL),
    readCacheJson<RecurringMaintenance[]>(SCHEDULES_CACHE_URL),
    readCacheJson<BusinessSettings>(SETTINGS_CACHE_URL),
  ]);

  return {
    cachedAt: jobsRes.cachedAt || invRes.cachedAt || schedRes.cachedAt || setRes.cachedAt,
    jobCards: Array.isArray(jobsRes.data) ? jobsRes.data : null,
    inventory: Array.isArray(invRes.data) ? invRes.data : null,
    schedules: Array.isArray(schedRes.data) ? schedRes.data : null,
    settings: setRes.data && typeof setRes.data === 'object' ? setRes.data : null,
  };
}
