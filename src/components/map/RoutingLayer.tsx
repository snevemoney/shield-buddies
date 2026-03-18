import React, { useEffect, useState } from 'react';
import { Marker, Polyline, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/lib/i18nContext';
import { computeRoute, type RoutePoint, type RouteResult } from '@/lib/routing';
import { getIntersectingHazards } from '@/components/map/HazardLayer';
import type { HazardZone } from '@/lib/db';

type RoutingMode = 'idle' | 'picking_start' | 'picking_end' | 'showing_route';

function startIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#16A34A;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function endIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#DC2626;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

interface RoutingLayerProps {
  active: boolean;
  onRouteComputed: (result: RouteResult | null, hazards: HazardZone[]) => void;
  onModeChange: (mode: RoutingMode) => void;
}

const MapClickHandler: React.FC<{
  mode: RoutingMode;
  onStartPicked: (p: RoutePoint) => void;
  onEndPicked: (p: RoutePoint) => void;
}> = ({ mode, onStartPicked, onEndPicked }) => {
  useMapEvents({
    click(e) {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (mode === 'picking_start') {
        onStartPicked(point);
      } else if (mode === 'picking_end') {
        onEndPicked(point);
      }
    },
  });
  return null;
};

export const RoutingLayer: React.FC<RoutingLayerProps> = ({
  active,
  onRouteComputed,
  onModeChange,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<RoutingMode>('idle');
  const [startPoint, setStartPoint] = useState<RoutePoint | null>(null);
  const [endPoint, setEndPoint] = useState<RoutePoint | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);

  useEffect(() => {
    if (active && mode === 'idle') {
      setMode('picking_start');
      onModeChange('picking_start');
    } else if (!active) {
      setMode('idle');
      setStartPoint(null);
      setEndPoint(null);
      setRoute(null);
      onRouteComputed(null, []);
    }
  }, [active]);

  const handleStartPicked = (p: RoutePoint) => {
    setStartPoint(p);
    setMode('picking_end');
    onModeChange('picking_end');
  };

  const handleEndPicked = async (p: RoutePoint) => {
    setEndPoint(p);
    setMode('showing_route');
    onModeChange('showing_route');

    if (startPoint) {
      const result = computeRoute(startPoint, p);
      setRoute(result);

      // Check for hazard zone intersections
      let hazards: HazardZone[] = [];
      try {
        hazards = await getIntersectingHazards(
          startPoint.lat,
          startPoint.lng,
          p.lat,
          p.lng,
        );
      } catch {
        // DB may not have the active index yet
      }

      onRouteComputed(result, hazards);
    }
  };

  if (!active) return null;

  return (
    <>
      <MapClickHandler
        mode={mode}
        onStartPicked={handleStartPicked}
        onEndPicked={handleEndPicked}
      />

      {startPoint && (
        <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon()}>
          <Popup>{t('routing_start').replace('Tap map for ', '').replace('Touchez la carte pour le ', '') || 'Start'}</Popup>
        </Marker>
      )}

      {endPoint && (
        <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon()}>
          <Popup>{t('routing_end').replace('Tap map for ', '').replace('Touchez la carte pour la ', '') || 'Destination'}</Popup>
        </Marker>
      )}

      {route && (
        <Polyline
          positions={route.points.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{
            color: '#2563EB',
            weight: 4,
            opacity: 0.8,
            dashArray: '10 6',
          }}
        />
      )}
    </>
  );
};
