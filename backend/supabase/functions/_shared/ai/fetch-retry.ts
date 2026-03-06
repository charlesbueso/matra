// ============================================================
// MATRA — Fetch with Retry
// ============================================================
// Shared retry wrapper for AI provider API calls.
// Handles transient network errors (TLS drops, DNS failures)
// and retryable HTTP status codes (429, 500, 502, 503, 504).
//
// Forces HTTP/1.1 to avoid Deno HTTP/2 connection-reuse bugs
// ("peer closed connection without sending TLS close_notify").
// ============================================================

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;

// Force HTTP/1.1 to prevent Deno's HTTP/2 multiplexing from reusing
// stale TLS connections. HTTP/2 ignores Connection: close, so the only
// reliable fix is to disable it entirely via a custom HttpClient.
// deno-lint-ignore no-explicit-any
const httpClient = (Deno as any).createHttpClient({ http2: false });

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // Network/TLS errors surface as TypeError in Deno
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch with exponential backoff retry for transient failures.
 * Retries on network errors and 429/5xx responses.
 */
export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = new Headers(init?.headers);
      headers.set('Connection', 'close');

      // deno-lint-ignore no-explicit-any
      const response = await fetch(input, { ...init, headers, client: httpClient } as any);

      if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
        return response;
      }

      // Drain response body before retrying so the connection is released
      await response.body?.cancel();

      // Use Retry-After header if present, otherwise exponential backoff
      const retryAfter = response.headers.get('retry-after');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_DELAY_MS * Math.pow(2, attempt);

      console.warn(
        `[fetch-retry] HTTP ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[fetch-retry] Network error: ${(error as Error).message}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}
