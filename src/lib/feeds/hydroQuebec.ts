import type { FeedAdapter, OsintEvent } from './types';
import { fetchWithProxy } from './corsProxy';
import { haversineDistance } from '@/lib/utils';

const FEED_URLS = [
  'https://pannes.hydroquebec.com/pannes/donnees/v3_0/bismarkers2.json',
  'https://pannes.hydroquebec.com/pannes/donnees/v3_0/bismarkers.json',
  'https://services.hydroquebec.com/pannes/donnees/v3_0/bismarkers2.json',
];
const MONTREAL_CENTER = { lat: 45.5017, lng: -73.5673 };
const MAX_RADIUS_KM = 50;

interface HydroMarker {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  nbClient?: number;
  nb_clients?: number;
  cause?: string;
  causeEn?: string;
  dateDebut?: string;
  date_debut?: string;
  dateFinPrevue?: string;
  date_fin_prevue?: string;
}

function severityFromCustomerCount(count: number): number {
  if (count >= 10000) return 4;
  if (count >= 1000) return 3;
  if (count >= 100) return 2;
  return 1;
}

function parseMarkers(data: unknown): HydroMarker[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['panpiMarkers', 'markers', 'data', 'results']) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val;
    }
  }
  return [];
}

async function fetchJson(): Promise<unknown> {
  for (const url of FEED_URLS) {
    try {
      const res = await fetchWithProxy(url);
      const text = await res.text();
      if (!text.startsWith('{') && !text.startsWith('[')) continue; // skip HTML error pages
      return JSON.parse(text);
    } catch {
      continue;
    }
  }
  throw new Error('All Hydro-QC endpoints failed');
}

export const hydroAdapter: FeedAdapter = {
  feedId: 'hydro',
  pollIntervalMs: 120000,

  async fetch(): Promise<OsintEvent[]> {
    const json = await fetchJson();
    const markers = parseMarkers(json);
    const events: OsintEvent[] = [];

    for (const m of markers) {
      const lat = m.lat ?? m.latitude;
      const lng = m.lng ?? m.longitude;
      if (lat == null || lng == null) continue;

      const dist = haversineDistance(MONTREAL_CENTER.lat, MONTREAL_CENTER.lng, lat, lng);
      if (dist > MAX_RADIUS_KM) continue;

      const customers = m.nbClient ?? m.nb_clients ?? 0;
      const cause = m.cause ?? m.causeEn ?? 'Unknown';
      const startTime = m.dateDebut ?? m.date_debut;
      const restoreTime = m.dateFinPrevue ?? m.date_fin_prevue;

      const timestamp = startTime ? new Date(startTime).getTime() : Date.now();
      const expiresAt = restoreTime ? new Date(restoreTime).getTime() : undefined;

      events.push({
        source: 'hydro',
        normalizedType: 'outage',
        severity: severityFromCustomerCount(customers),
        title: `Power outage — ${customers.toLocaleString()} customers`,
        description: `Power outage affecting ${customers.toLocaleString()} customers. Cause: ${cause}`,
        region: `${dist.toFixed(1)} km from Montréal`,
        lat,
        lng,
        timestamp,
        expiresAt,
      });
    }

    return events;
  },
};
