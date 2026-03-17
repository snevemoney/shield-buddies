import type { FeedAdapter, OsintEvent } from './types';
import { db } from '@/lib/db';

const BBOX = { lamin: 44.5, lomin: -74.6, lamax: 46.5, lomax: -72.4 };
const BASE_URL = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

let currentInterval = 30000;

export const openSkyAdapter: FeedAdapter = {
  feedId: 'opensky',
  get pollIntervalMs() { return currentInterval; },

  async fetch(): Promise<OsintEvent[]> {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(15000) });

    if (res.status === 429) {
      currentInterval = 120000; // back off to 2 minutes
      throw new Error('OpenSky rate limited (429)');
    }

    // Reset to normal interval on success
    currentInterval = 30000;

    const data = await res.json() as { time: number; states: unknown[][] | null };
    if (!data.states) return [];

    // Clear previous flight entries before inserting fresh positions
    await db.cachedAlerts.where('source').equals('opensky').delete();

    const now = Date.now();
    const events: OsintEvent[] = [];

    for (const s of data.states) {
      const onGround = s[8] as boolean;
      if (onGround) continue;

      const icao24 = (s[0] as string) ?? '';
      const callsign = ((s[1] as string) ?? '').trim();
      const originCountry = (s[2] as string) ?? '';
      const lng = s[5] as number | null;
      const lat = s[6] as number | null;
      const altitude = s[7] as number | null; // meters
      const velocity = s[9] as number | null; // m/s
      const trueTrack = s[10] as number | null; // degrees from north

      if (lat == null || lng == null) continue;

      const altFt = altitude != null ? Math.round(altitude * 3.281) : null;

      events.push({
        source: 'opensky',
        normalizedType: 'flight',
        severity: 0,
        title: callsign || icao24,
        description: `${callsign || icao24} from ${originCountry}${altFt != null ? ` at ${altFt.toLocaleString()} ft` : ''}`,
        region: originCountry,
        lat,
        lng,
        timestamp: now,
        expiresAt: now + 60000,
        rawData: JSON.stringify({
          callsign: callsign || icao24,
          originCountry,
          altitude,
          velocity,
          trueTrack,
          icao24,
        }),
      });
    }

    return events;
  },
};
