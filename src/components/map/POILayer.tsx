import React, { useEffect, useState, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { db, type CachedPOI } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { haversineDistance } from '@/lib/utils';

/** All POI category keys (match the fetchPOIs script output) */
export const POI_CATEGORIES = [
  'hospital',
  'pharmacy',
  'fire_station',
  'police',
  'shelter',
  'drinking_water',
  'fuel',
  'supermarket',
  'place_of_worship',
  'school',
  'community_centre',
] as const;

export type POICategory = (typeof POI_CATEGORIES)[number];

/** Color per category */
export const POI_COLORS: Record<POICategory, string> = {
  hospital: '#EF4444',       // red
  pharmacy: '#10B981',       // emerald
  fire_station: '#F97316',   // orange
  police: '#3B82F6',         // blue
  shelter: '#8B5CF6',        // violet
  drinking_water: '#06B6D4', // cyan
  fuel: '#EAB308',           // yellow
  supermarket: '#22C55E',    // green
  place_of_worship: '#A855F7', // purple
  school: '#F59E0B',         // amber
  community_centre: '#EC4899', // pink
};

/** Emoji per category for icon rendering */
const POI_EMOJI: Record<POICategory, string> = {
  hospital: '🏥',
  pharmacy: '💊',
  fire_station: '🚒',
  police: '🚔',
  shelter: '🏠',
  drinking_water: '💧',
  fuel: '⛽',
  supermarket: '🛒',
  place_of_worship: '⛪',
  school: '🏫',
  community_centre: '🏛️',
};

/** Pre-computed icons for all POI categories — built once at module load */
const POI_ICONS: Record<POICategory, L.DivIcon> = Object.fromEntries(
  POI_CATEGORIES.map((category) => {
    const color = POI_COLORS[category];
    const emoji = POI_EMOJI[category];
    return [
      category,
      L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    ];
  })
) as Record<POICategory, L.DivIcon>;

interface POIFeature {
  id: number;
  name: string;
  category: POICategory;
  address: string;
  lat: number;
  lng: number;
}

async function loadAndCachePOIs(): Promise<POIFeature[]> {
  // Check IndexedDB cache first
  const cachedCount = await db.cachedPOIs.count();
  if (cachedCount > 0) {
    const cached = await db.cachedPOIs.toArray();
    return cached.map((p) => ({
      id: p.osmId,
      name: p.name,
      category: p.category as POICategory,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    }));
  }

  // Fetch from static geojson
  try {
    const resp = await fetch('/data/pois.geojson');
    if (!resp.ok) return [];
    const geojson = await resp.json();
    const features: POIFeature[] = (geojson.features || []).map((f: any) => ({
      id: f.properties.id,
      name: f.properties.name || '',
      category: f.properties.category as POICategory,
      address: f.properties.address || '',
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));

    // Cache in IndexedDB
    if (features.length > 0) {
      await db.cachedPOIs.bulkAdd(
        features.map((f) => ({
          osmId: f.id,
          name: f.name,
          category: f.category,
          address: f.address,
          lat: f.lat,
          lng: f.lng,
        }))
      );
    }

    return features;
  } catch {
    return [];
  }
}

interface POILayerProps {
  visibleCategories: Set<POICategory>;
  userPos: [number, number];
}

export const POILayer: React.FC<POILayerProps> = ({ visibleCategories, userPos }) => {
  const { t } = useTranslation();
  const [pois, setPois] = useState<POIFeature[]>([]);

  useEffect(() => {
    loadAndCachePOIs().then(setPois);
  }, []);

  const filteredPois = useMemo(
    () => pois.filter((p) => visibleCategories.has(p.category)),
    [pois, visibleCategories]
  );

  if (filteredPois.length === 0) return null;

  return (
    <MarkerClusterGroup
      chunkedLoading
      maxClusterRadius={50}
      spiderfyOnMaxZoom
      showCoverageOnHover={false}
    >
      {filteredPois.map((poi) => (
        <Marker
          key={`poi-${poi.id}`}
          position={[poi.lat, poi.lng]}
          icon={POI_ICONS[poi.category]}
        >
          <Popup>
            <div className="min-w-[180px] text-sm">
              <h4 className="font-semibold">
                {poi.name || t('poi_no_name')}
              </h4>
              <div className="mt-1 space-y-0.5">
                <p>
                  <span className="font-medium">{t('poi_category')}:</span>{' '}
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-xs"
                    style={{
                      backgroundColor: POI_COLORS[poi.category] + '20',
                      color: POI_COLORS[poi.category],
                    }}
                  >
                    {t(`poi_${poi.category}`)}
                  </span>
                </p>
                {poi.address && (
                  <p>
                    <span className="font-medium">{t('poi_address')}:</span> {poi.address}
                  </p>
                )}
                <p className="opacity-70">
                  {t('poi_distance')}:{' '}
                  {haversineDistance(userPos[0], userPos[1], poi.lat, poi.lng).toFixed(1)} km
                </p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
};
