import React from 'react';
import { Circle, Popup } from 'react-leaflet';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type HazardZone, type HazardType, type HazardSeverity } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';

/** Color map for hazard types */
export const HAZARD_COLORS: Record<HazardType, string> = {
  flood: '#3B82F6',      // blue
  fire: '#F97316',       // orange-red
  industrial: '#EAB308', // yellow
  earthquake: '#8B5CF6', // purple
};

/** Opacity based on severity */
const SEVERITY_OPACITY: Record<HazardSeverity, number> = {
  low: 0.15,
  medium: 0.25,
  high: 0.35,
  critical: 0.45,
};

interface HazardLayerProps {
  visible: boolean;
}

export const HazardLayer: React.FC<HazardLayerProps> = ({ visible }) => {
  const { t } = useTranslation();
  const hazardZones = useLiveQuery(() => db.hazardZones.toArray());

  if (!visible || !hazardZones) return null;

  const activeZones = hazardZones.filter((z) => z.active);

  return (
    <>
      {activeZones.map((zone) => {
        const color = HAZARD_COLORS[zone.type];
        const opacity = SEVERITY_OPACITY[zone.severity];
        return (
          <Circle
            key={`hazard-${zone.id}`}
            center={zone.geometry.center}
            radius={zone.geometry.radiusMeters}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: opacity,
              weight: 2,
              dashArray: '6 4',
            }}
          >
            <Popup>
              <div className="min-w-[180px] text-sm">
                <h4 className="font-semibold">{zone.name}</h4>
                <p>
                  <span className="font-medium">{t('hazard_type')}:</span>{' '}
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: color }}
                  >
                    {t(`hazard_type_${zone.type}`)}
                  </span>
                </p>
                <p>
                  <span className="font-medium">{t('hazard_severity')}:</span>{' '}
                  {t(`hazard_severity_${zone.severity}`)}
                </p>
                <p className="opacity-70">
                  {t('hazard_radius')}: {zone.geometry.radiusMeters}m
                </p>
              </div>
            </Popup>
          </Circle>
        );
      })}
    </>
  );
};

/**
 * Check if a line segment from point A to point B intersects any active hazard zone.
 * Returns the list of intersecting hazard zones.
 */
export async function getIntersectingHazards(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<HazardZone[]> {
  const zones = await db.hazardZones.where('active').equals(1).toArray();
  const intersecting: HazardZone[] = [];

  for (const zone of zones) {
    const [cLat, cLng] = zone.geometry.center;
    const r = zone.geometry.radiusMeters;

    // Check if the line segment comes within radius of the zone center
    // Using approximate meter conversion at Montreal latitude
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((cLat * Math.PI) / 180);

    // Convert to local meter coordinates
    const ax = (startLng - cLng) * mPerDegLng;
    const ay = (startLat - cLat) * mPerDegLat;
    const bx = (endLng - cLng) * mPerDegLng;
    const by = (endLat - cLat) * mPerDegLat;

    // Closest point on line segment to origin
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((-ax) * dx + (-ay) * dy) / len2));
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const dist = Math.sqrt(closestX * closestX + closestY * closestY);

    if (dist <= r) {
      intersecting.push(zone);
    }
  }

  return intersecting;
}
