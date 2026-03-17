import { db } from '@/lib/db';

export interface ZimEntry {
  title: string;
  description: string;
  articleCount: number;
  language: string;
  path: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const COMMON_IPS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.100', '192.168.0.100'];
const COMMON_PORTS = [8080, 8888, 9090];

export async function autoDetectKiwix(): Promise<string | null> {
  for (const ip of COMMON_IPS) {
    for (const port of COMMON_PORTS) {
      const url = `http://${ip}:${port}`;
      try {
        const ok = await testConnection(url);
        if (ok) return url;
      } catch { /* continue */ }
    }
  }
  return null;
}

export async function testConnection(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/catalog/v2/root.xml`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('<feed') || text.includes('opds');
  } catch {
    return false;
  }
}

export async function fetchCatalog(baseUrl: string): Promise<ZimEntry[]> {
  const res = await fetch(`${baseUrl}/catalog/v2/root.xml`, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const entries = doc.querySelectorAll('entry');
  const results: ZimEntry[] = [];

  for (const entry of entries) {
    const title = entry.querySelector('title')?.textContent?.trim() ?? '';
    const description = entry.querySelector('summary')?.textContent?.trim() ?? '';
    const articleCount = parseInt(entry.querySelector('articleCount')?.textContent ?? '0') || 0;
    const language = entry.querySelector('language')?.textContent?.trim() ?? '';
    const link = entry.querySelector('link[type="text/html"]');
    const path = link?.getAttribute('href') ?? '';
    if (title) results.push({ title, description, articleCount, language, path });
  }

  return results;
}

export async function searchArticles(baseUrl: string, query: string): Promise<SearchResult[]> {
  const res = await fetch(`${baseUrl}/search?pattern=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });

  // Try JSON response first
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((item: Record<string, string>) => ({
        title: item.title ?? '',
        url: item.url ?? item.path ?? '',
        snippet: item.snippet ?? item.description ?? '',
      }));
    }
  }

  // Fall back to HTML parsing
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const results: SearchResult[] = [];
  const links = doc.querySelectorAll('a');
  for (const a of links) {
    const href = a.getAttribute('href');
    const title = a.textContent?.trim();
    if (href && title && !href.startsWith('#') && !href.startsWith('javascript')) {
      results.push({ title, url: href, snippet: '' });
    }
  }
  return results.slice(0, 20);
}

export async function fetchArticle(baseUrl: string, path: string): Promise<string> {
  // Check cache first
  const cacheKey = `kiwixArticle:${path}`;
  const cached = await db.settings.get(cacheKey);
  if (cached?.value && typeof cached.value === 'string') return cached.value;

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const html = await res.text();

  // Sanitize: strip script and style tags
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, link[rel="stylesheet"]').forEach((el) => el.remove());

  const body = doc.body?.innerHTML ?? '';

  // Cache the sanitized content
  await db.settings.put({ key: cacheKey, value: body });

  return body;
}
