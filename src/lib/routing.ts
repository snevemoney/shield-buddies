import { haversineDistance } from './utils';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  points: RoutePoint[];
  distanceKm: number;
  walkingTimeMinutes: number;
}

/** Average walking speed in km/h */
const WALKING_SPEED_KMH = 5;

/**
 * Simple straight-line routing between two points.
 * For offline use, we generate intermediate waypoints along the direct path.
 * In the future this could be enhanced with real road network data.
 */
export function computeRoute(
  start: RoutePoint,
  end: RoutePoint,
): RouteResult {
  const distanceKm = haversineDistance(start.lat, start.lng, end.lat, end.lng);

  // Generate intermediate points for smoother polyline rendering
  const numSegments = Math.max(2, Math.ceil(distanceKm * 10)); // ~1 point per 100m
  const points: RoutePoint[] = [];

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    points.push({
      lat: start.lat + t * (end.lat - start.lat),
      lng: start.lng + t * (end.lng - start.lng),
    });
  }

  const walkingTimeMinutes = (distanceKm / WALKING_SPEED_KMH) * 60;

  return {
    points,
    distanceKm,
    walkingTimeMinutes,
  };
}
