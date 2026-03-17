const DEFAULT_PROXY = 'https://api.allorigins.win/raw?url=';

export async function fetchWithProxy(
  url: string,
  options?: RequestInit
): Promise<Response> {
  if (!navigator.onLine) throw new Error('Offline');

  // Try direct fetch first (5s timeout — fail fast to try proxy)
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok || res.type === 'opaque') return res;
  } catch {
    // Direct fetch failed — fall through to proxy
  }

  // Fall back to CORS proxy (30s timeout — some feeds are slow)
  const proxyUrl = DEFAULT_PROXY + encodeURIComponent(url);
  return fetch(proxyUrl, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
}
