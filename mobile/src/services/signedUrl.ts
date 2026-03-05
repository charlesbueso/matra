// ============================================================
// MATRA — Signed URL Service
// ============================================================
// Resolves private DO Spaces storage keys to time-limited
// presigned URLs. Caches results for 30 minutes and batches
// concurrent requests.
// ============================================================

import { invokeFunction } from './supabase';

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (server signs for 1 hour)

// Batch pending keys to avoid many individual requests
let pendingKeys = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchPromise: Promise<void> | null = null;
let batchResolve: (() => void) | null = null;

function scheduleBatch() {
  if (batchTimer) return;
  batchPromise = new Promise((resolve) => {
    batchResolve = resolve;
  });
  batchTimer = setTimeout(flushBatch, 50);
}

async function flushBatch() {
  const keys = [...pendingKeys];
  pendingKeys = new Set();
  batchTimer = null;
  const resolve = batchResolve!;
  batchResolve = null;
  batchPromise = null;

  if (keys.length === 0) {
    resolve();
    return;
  }

  try {
    const result = await invokeFunction<{ urls: Record<string, string> }>(
      'get-signed-urls',
      { keys },
    );
    const now = Date.now();
    for (const [key, url] of Object.entries(result.urls)) {
      cache.set(key, { url, expiresAt: now + CACHE_TTL });
    }
  } catch (err) {
    console.warn('[signedUrl] Failed to resolve signed URLs:', err);
  }

  resolve();
}

/**
 * Resolve a storage key (or legacy CDN URL) to a presigned URL.
 * Returns null if the key is falsy.
 * Returned URLs are cached for 30 minutes.
 */
export async function getSignedUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Queue for batch resolution
  pendingKeys.add(key);
  scheduleBatch();
  await batchPromise;

  return cache.get(key)?.url ?? null;
}

/**
 * Resolve multiple storage keys to presigned URLs at once.
 * More efficient than calling getSignedUrl individually.
 */
export async function getSignedUrls(keys: (string | null | undefined)[]): Promise<Map<string, string>> {
  const validKeys = keys.filter((k): k is string => !!k);
  const now = Date.now();
  const result = new Map<string, string>();
  const toFetch: string[] = [];

  for (const key of validKeys) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      result.set(key, cached.url);
    } else {
      toFetch.push(key);
    }
  }

  if (toFetch.length > 0) {
    try {
      const response = await invokeFunction<{ urls: Record<string, string> }>(
        'get-signed-urls',
        { keys: toFetch },
      );
      for (const [key, url] of Object.entries(response.urls)) {
        cache.set(key, { url, expiresAt: now + CACHE_TTL });
        result.set(key, url);
      }
    } catch (err) {
      console.warn('[signedUrl] Failed to resolve signed URLs:', err);
    }
  }

  return result;
}

/** Invalidate a single cache entry (e.g. after re-uploading an avatar) */
export function invalidateSignedUrl(key: string) {
  cache.delete(key);
}

/** Clear the signed URL cache (e.g. on sign-out) */
export function clearSignedUrlCache() {
  cache.clear();
}
