import type { FeedAdapter, OsintEvent } from './types';
import { fetchWithProxy } from './corsProxy';
import { db } from '@/lib/db';

const PRIMARY_URL = 'https://rss1.naad-adna.pelmorex.com/';
const BACKUP_URL = 'https://rss.naad-adna.pelmorex.com/';
const MAX_ENTRIES = 10;

const MONTREAL_BBOX = {
  latMin: 45.3, latMax: 45.7,
  lngMin: -73.9, lngMax: -73.4,
};

const CAP_SEVERITY_MAP: Record<string, number> = {
  Unknown: 0,
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};

function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function isQuebecAlert(capDoc: Document): boolean {
  const areas = capDoc.querySelectorAll('area');
  for (const area of areas) {
    // Check geocodes for Quebec (FIPS code starts with "24")
    const geocodes = area.querySelectorAll('geocode');
    for (const gc of geocodes) {
      const value = textContent(gc.querySelector('value'));
      if (value.startsWith('24')) return true;
    }

    // Check polygon intersects Montreal bbox
    const polygon = textContent(area.querySelector('polygon'));
    if (polygon && polygonIntersectsBbox(polygon)) return true;
  }
  return false;
}

function polygonIntersectsBbox(polygon: string): boolean {
  const points = polygon.split(/\s+/).map((pair) => {
    const [lat, lng] = pair.split(',').map(Number);
    return { lat, lng };
  });
  return points.some(
    (p) =>
      !isNaN(p.lat) && !isNaN(p.lng) &&
      p.lat >= MONTREAL_BBOX.latMin && p.lat <= MONTREAL_BBOX.latMax &&
      p.lng >= MONTREAL_BBOX.lngMin && p.lng <= MONTREAL_BBOX.lngMax
  );
}

function extractCoordinates(capDoc: Document): { lat?: number; lng?: number } {
  // Try circle element first (format: "lat,lng radius")
  const areas = capDoc.querySelectorAll('area');
  for (const area of areas) {
    const circle = textContent(area.querySelector('circle'));
    if (circle) {
      const [coords] = circle.split(' ');
      const [lat, lng] = coords.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    // Try polygon centroid
    const polygon = textContent(area.querySelector('polygon'));
    if (polygon) {
      const points = polygon.split(/\s+/).map((p) => {
        const [lat, lng] = p.split(',').map(Number);
        return { lat, lng };
      }).filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
      if (points.length > 0) {
        const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
        const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
        return { lat, lng };
      }
    }
  }
  return {};
}

async function fetchAtomFeed(): Promise<string> {
  try {
    const res = await fetchWithProxy(PRIMARY_URL);
    return await res.text();
  } catch {
    const res = await fetchWithProxy(BACKUP_URL);
    return await res.text();
  }
}

export const naadAdapter: FeedAdapter = {
  feedId: 'naad',
  pollIntervalMs: 60000,

  async fetch(): Promise<OsintEvent[]> {
    const xml = await fetchAtomFeed();
    const parser = new DOMParser();
    const feedDoc = parser.parseFromString(xml, 'application/xml');
    const entries = feedDoc.querySelectorAll('entry');
    const events: OsintEvent[] = [];

    const entriesToProcess = Array.from(entries).slice(0, MAX_ENTRIES);

    for (const entry of entriesToProcess) {
      const entryId = textContent(entry.querySelector('id'));
      const updated = textContent(entry.querySelector('updated'));
      const link = entry.querySelector('link')?.getAttribute('href');
      const title = textContent(entry.querySelector('title'));
      const summary = textContent(entry.querySelector('summary'));
      const timestamp = updated ? new Date(updated).getTime() : Date.now();

      // Skip if already in database
      const existing = await db.cachedAlerts
        .where('source').equals('naad')
        .filter((a) => a.description === summary && a.issuedAt === timestamp)
        .first();
      if (existing) continue;

      // Fetch full CAP-CP XML if link available
      if (link) {
        try {
          const capXml = await fetchWithProxy(link);
          const capText = await capXml.text();
          const capDoc = parser.parseFromString(capText, 'application/xml');

          // Filter to Quebec
          if (!isQuebecAlert(capDoc)) continue;

          const severity = textContent(capDoc.querySelector('severity'));
          const headline = textContent(capDoc.querySelector('headline'));
          const description = textContent(capDoc.querySelector('description'));
          const areaDesc = textContent(capDoc.querySelector('areaDesc'));
          const expires = textContent(capDoc.querySelector('expires'));
          const coords = extractCoordinates(capDoc);

          events.push({
            source: 'naad',
            normalizedType: 'alert',
            severity: CAP_SEVERITY_MAP[severity] ?? 0,
            title: headline || title,
            description: description || summary,
            region: areaDesc || 'Quebec',
            lat: coords.lat,
            lng: coords.lng,
            timestamp,
            expiresAt: expires ? new Date(expires).getTime() : undefined,
            url: link,
            rawData: JSON.stringify({ entryId, severity, headline }),
          });
        } catch {
          // CAP fetch failed — use Atom entry data as fallback
          events.push({
            source: 'naad',
            normalizedType: 'alert',
            severity: 1,
            title,
            description: summary,
            region: 'Quebec',
            timestamp,
            url: link,
          });
        }
      }
    }

    return events;
  },
};
