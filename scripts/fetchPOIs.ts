/**
 * Build-time script: Fetch emergency POIs from Overpass API for Montreal metro area.
 *
 * Usage:
 *   npx tsx scripts/fetchPOIs.ts
 *   # or
 *   npx ts-node --esm scripts/fetchPOIs.ts
 *
 * Output: public/data/pois.geojson
 */

const BBOX = '45.35,-73.98,45.72,-73.40'; // south,west,north,east
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const OSM_TAGS = [
  'amenity=hospital',
  'amenity=pharmacy',
  'amenity=fire_station',
  'amenity=police',
  'amenity=shelter',
  'amenity=drinking_water',
  'amenity=fuel',
  'shop=supermarket',
  'amenity=place_of_worship',
  'amenity=school',
  'amenity=community_centre',
  'amenity=charging_station',
];

/** Map OSM tag values to our POI category keys */
function tagToCategory(tags: Record<string, string>): string {
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'fire_station') return 'fire_station';
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'shelter') return 'shelter';
  if (tags.amenity === 'drinking_water') return 'drinking_water';
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.amenity === 'place_of_worship') return 'place_of_worship';
  if (tags.amenity === 'school') return 'school';
  if (tags.amenity === 'community_centre') return 'community_centre';
  if (tags.amenity === 'charging_station') return 'ev_charger';
  return 'unknown';
}

function buildQuery(): string {
  const tagFilters = OSM_TAGS.map((tag) => {
    const [key, value] = tag.split('=');
    return `  node["${key}"="${value}"](${BBOX});\n  way["${key}"="${value}"](${BBOX});`;
  }).join('\n');

  return `[out:json][timeout:120];
(
${tagFilters}
);
out center body;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    id: number;
    name: string;
    category: string;
    address: string;
    osmType: string;
  };
}

function buildAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  return parts.join(' ') || '';
}

async function main() {
  console.log('Fetching POIs from Overpass API for Montreal metro area...');
  const query = buildQuery();

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const elements: OverpassElement[] = data.elements || [];
  console.log(`Received ${elements.length} raw elements from Overpass.`);

  const features: GeoJSONFeature[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const tags = el.tags || {};
    const category = tagToCategory(tags);
    if (category === 'unknown') continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      properties: {
        id: el.id,
        name: tags.name || tags['name:en'] || tags['name:fr'] || '',
        category,
        address: buildAddress(tags),
        osmType: el.type,
      },
    });
  }

  const geojson = {
    type: 'FeatureCollection' as const,
    features,
  };

  console.log(`Converted to ${features.length} GeoJSON features.`);

  // Write to public/data/pois.geojson
  const fs = await import('fs');
  const path = await import('path');

  const outDir = path.resolve(import.meta.dirname ?? '.', '..', 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'pois.geojson');
  fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2), 'utf-8');
  console.log(`Saved ${features.length} POIs to ${outPath}`);
}

main().catch((err) => {
  console.error('Error fetching POIs:', err);
  process.exit(1);
});
