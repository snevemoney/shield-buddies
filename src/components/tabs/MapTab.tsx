import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Crosshair, Navigation, Trash2, X } from 'lucide-react';
import { db, type SavedLocation } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { getCurrentPosition, haversineDistance, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import 'leaflet/dist/leaflet.css';

const CATEGORIES_EN = ['Safe Zone', 'Danger Zone', 'Supply Point', 'Medical', 'Water Source', 'Rally Point', 'Custom'];
const CAT_COLORS: Record<string, string> = {
  'Safe Zone': '#16A34A',
  'Danger Zone': '#DC2626',
  'Supply Point': '#2563EB',
  'Medical': '#EC4899',
  'Water Source': '#06B6D4',
  'Rally Point': '#D97706',
  'Custom': '#8B5CF6',
};

function createIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function userIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,0.2)" class="user-pulse-anim"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const MapCenterUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
};

export const MapTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [userPos, setUserPos] = useState<[number, number]>([45.5017, -73.5673]);
  const [addingMode, setAddingMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([45.5017, -73.5673]);
  const [form, setForm] = useState({ name: '', category: 'Safe Zone', notes: '' });
  const [filters, setFilters] = useState<Set<string>>(new Set(CATEGORIES_EN));
  const mapRef = useRef<L.Map | null>(null);

  const locations = useLiveQuery(() => db.locations.toArray());
  const safeRadius = useLiveQuery(() => db.settings.get('safeRadius'));
  const radius = ((safeRadius?.value as number) || 5) * 1000;

  const catLabels = t('map_categories').split(',');

  useEffect(() => {
    getCurrentPosition().then((pos) => {
      setUserPos([pos.lat, pos.lng]);
      setMapCenter([pos.lat, pos.lng]);
    });
  }, []);

  const handleAddLocation = async () => {
    if (!form.name.trim()) return;
    const center = mapRef.current?.getCenter();
    const lat = center?.lat || userPos[0];
    const lng = center?.lng || userPos[1];
    await db.locations.add({ name: form.name, category: form.category, lat, lng, notes: form.notes, createdAt: Date.now() });
    await logActivity('location_added', `Location saved: ${form.name}`, `Lieu enregistré : ${form.name}`);
    setForm({ name: '', category: 'Safe Zone', notes: '' });
    setSheetOpen(false);
    setAddingMode(false);
  };

  const handleDeleteLocation = async (loc: SavedLocation) => {
    if (loc.id) {
      await db.locations.delete(loc.id);
      await logActivity('location_deleted', `Location deleted: ${loc.name}`, `Lieu supprimé : ${loc.name}`);
    }
  };

  const useMyLocation = () => {
    getCurrentPosition().then((pos) => {
      if (mapRef.current) mapRef.current.setView([pos.lat, pos.lng], 14);
    });
  };

  const toggleFilter = (cat: string) => {
    const next = new Set(filters);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setFilters(next);
  };

  const filteredLocations = (locations || []).filter((l) => filters.has(l.category));

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={t('nav_map')} />

      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
        {CATEGORIES_EN.map((cat, i) => (
          <button
            key={cat}
            onClick={() => toggleFilter(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filters.has(cat)
                ? 'border-transparent text-primary-foreground'
                : 'border-border text-muted-foreground bg-card'
            }`}
            style={filters.has(cat) ? { backgroundColor: CAT_COLORS[cat] } : {}}
          >
            {catLabels[i] || cat}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {addingMode && (
          <div className="absolute inset-0 z-[1000] pointer-events-none flex items-center justify-center">
            <Crosshair size={32} className="text-primary drop-shadow-lg" />
          </div>
        )}
        <MapContainer
          center={mapCenter}
          zoom={13}
          className="h-full w-full"
          ref={mapRef}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={userPos} icon={userIcon()} />
          <Circle center={userPos} radius={radius} pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.05, weight: 1 }} />
          {filteredLocations.map((loc) => (
            <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={createIcon(CAT_COLORS[loc.category] || '#8B5CF6')}>
              <Popup>
                <div className="min-w-[160px]">
                  <h4 className="font-semibold text-sm">{loc.name}</h4>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: CAT_COLORS[loc.category] + '20', color: CAT_COLORS[loc.category] }}>
                    {catLabels[CATEGORIES_EN.indexOf(loc.category)] || loc.category}
                  </span>
                  {loc.notes && <p className="text-xs mt-1">{loc.notes}</p>}
                  <p className="text-xs mt-1 opacity-60">
                    {t('distance')}: {haversineDistance(userPos[0], userPos[1], loc.lat, loc.lng).toFixed(1)} km
                  </p>
                  <button
                    onClick={() => handleDeleteLocation(loc)}
                    className="text-xs mt-2 flex items-center gap-1 text-destructive"
                  >
                    <Trash2 size={12} /> {t('delete')}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
          <MapCenterUpdater center={mapCenter} />
        </MapContainer>

        {/* Map controls */}
        <div className="absolute bottom-20 md:bottom-6 right-4 flex flex-col gap-2 z-[1000]">
          <button
            onClick={useMyLocation}
            className="w-11 h-11 bg-card border border-border rounded-full shadow-lg flex items-center justify-center text-foreground"
          >
            <Navigation size={18} />
          </button>
          <button
            onClick={() => {
              if (addingMode) {
                setSheetOpen(true);
              } else {
                setAddingMode(true);
              }
            }}
            className="w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center"
          >
            {addingMode ? <Crosshair size={24} /> : <Plus size={24} />}
          </button>
        </div>

        {addingMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-2 z-[1000] flex items-center gap-2">
            <span className="text-sm text-foreground">{t('place_marker')}</span>
            <Button size="sm" variant="outline" onClick={useMyLocation}>{t('use_my_location')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingMode(false)}><X size={16} /></Button>
          </div>
        )}
      </div>

      {/* Add Location Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) setAddingMode(false); }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add_location')}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <Input placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES_EN.map((c, i) => <SelectItem key={c} value={c}>{catLabels[i] || c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder={t('notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            <Button onClick={handleAddLocation} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
