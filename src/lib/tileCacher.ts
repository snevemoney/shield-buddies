export interface TileCacheProgress {
  total: number;
  downloaded: number;
  failed: number;
  percent: number;
}

export type ProgressCallback = (progress: TileCacheProgress) => void;

const TILE_SUBDOMAINS = ['a', 'b', 'c'];
const DEFAULT_MIN_ZOOM = 10;
const DEFAULT_MAX_ZOOM = 15;
const DEFAULT_CONCURRENCY = 6;

/** Convert lat/lng to OSM tile x/y at a given zoom level (Slippy Map formula). */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Get the tile x/y bounds that cover a circle of radiusKm around center at a given zoom. */
function getTileBounds(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  zoom: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  // Approximate degrees per km
  const latDeg = radiusKm / 111.32;
  const lngDeg = radiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));

  const nw = latLngToTile(centerLat + latDeg, centerLng - lngDeg, zoom);
  const se = latLngToTile(centerLat - latDeg, centerLng + lngDeg, zoom);

  return {
    minX: Math.max(0, nw.x),
    maxX: se.x,
    minY: Math.max(0, nw.y),
    maxY: se.y,
  };
}

/** Generate all OSM tile URLs for a given area and zoom range. */
function generateTileUrls(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  minZoom: number,
  maxZoom: number
): string[] {
  const urls: string[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const bounds = getTileBounds(centerLat, centerLng, radiusKm, z);
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        const s = TILE_SUBDOMAINS[(x + y) % TILE_SUBDOMAINS.length];
        urls.push(`https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }

  return urls;
}

/** Fetch URLs with a concurrency limit, calling onEach after each fetch. */
async function fetchWithConcurrency(
  urls: string[],
  concurrency: number,
  onEach: (ok: boolean) => void
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      try {
        await fetch(url, { mode: 'cors' });
        onEach(true);
      } catch {
        onEach(false);
      }
    }
  });
  await Promise.all(workers);
}

/**
 * Estimate the number of tiles needed for a given radius and zoom range.
 * Useful for showing the user an estimate before downloading.
 */
export function estimateTileCount(
  radiusKm: number,
  minZoom: number = DEFAULT_MIN_ZOOM,
  maxZoom: number = DEFAULT_MAX_ZOOM
): number {
  // Use Montreal as reference center for estimation
  const refLat = 45.5017;
  const refLng = -73.5673;
  return generateTileUrls(refLat, refLng, radiusKm, minZoom, maxZoom).length;
}

/**
 * Pre-download OSM map tiles for a given area.
 * Fetching each URL triggers the Workbox CacheFirst handler to cache the response.
 */
export async function precacheTilesForArea(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  onProgress?: ProgressCallback,
  options?: { minZoom?: number; maxZoom?: number; concurrency?: number }
): Promise<TileCacheProgress> {
  const minZoom = options?.minZoom ?? DEFAULT_MIN_ZOOM;
  const maxZoom = options?.maxZoom ?? DEFAULT_MAX_ZOOM;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const urls = generateTileUrls(centerLat, centerLng, radiusKm, minZoom, maxZoom);
  const progress: TileCacheProgress = {
    total: urls.length,
    downloaded: 0,
    failed: 0,
    percent: 0,
  };

  onProgress?.(progress);

  await fetchWithConcurrency(urls, concurrency, (ok) => {
    if (ok) {
      progress.downloaded++;
    } else {
      progress.failed++;
    }
    progress.percent = Math.round(((progress.downloaded + progress.failed) / progress.total) * 100);
    onProgress?.(progress);
  });

  return progress;
}
