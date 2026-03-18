import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RefreshCw, Plane, AlertTriangle, Info } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { db } from '@/lib/db';
import { isValidUrl, sanitizeText } from '@/lib/validation';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

const INTEL_CATS_EN = ['Conflict', 'Weather', 'Infrastructure', 'Health', 'Local'];

const catColor: Record<string, string> = {
  Conflict: 'bg-danger/10 text-danger',
  Weather: 'bg-primary/10 text-primary',
  Infrastructure: 'bg-warning/10 text-warning',
  Health: 'bg-success/10 text-success',
  Local: 'bg-accent text-accent-foreground',
};

const planeIcon = L.divIcon({
  className: '',
  html: `<div style="font-size:20px;transform:rotate(-45deg)">✈️</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const MOCK_FLIGHTS = [
  { pos: [45.52, -73.62] as [number, number], callsign: 'AC123', alt: '35,000ft', speed: '480kts' },
  { pos: [45.48, -73.50] as [number, number], callsign: 'WS456', alt: '28,000ft', speed: '420kts' },
  { pos: [45.55, -73.70] as [number, number], callsign: 'QK789', alt: '12,000ft', speed: '280kts' },
  { pos: [45.45, -73.55] as [number, number], callsign: 'N8432A', alt: '5,000ft', speed: '120kts' },
];

export const IntelTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({ headline: '', source: '', url: '', category: 'Local', notes: '' });

  const intelEntries = useLiveQuery(() => db.intelEntries.orderBy('timestamp').reverse().toArray());
  const alerts = useLiveQuery(() => db.cachedAlerts.orderBy('cachedAt').reverse().toArray());
  const catLabels = t('intel_categories').split(',');

  const handleAddEntry = async () => {
    if (!form.headline.trim()) return;
    // Validate URL if provided — must be http(s)
    const url = form.url.trim();
    if (url && !isValidUrl(url)) {
      toast.error(language === 'fr' ? 'URL invalide (doit commencer par http:// ou https://)' : 'Invalid URL (must start with http:// or https://)');
      return;
    }
    await db.intelEntries.add({
      headline: sanitizeText(form.headline),
      source: sanitizeText(form.source),
      url: url || undefined,
      category: form.category,
      notes: form.notes ? sanitizeText(form.notes) : undefined,
      timestamp: Date.now(),
    });
    setForm({ headline: '', source: '', url: '', category: 'Local', notes: '' });
    setSheetOpen(false);
  };

  const alertLevelStyle = (level: string) => {
    if (level === 'Warning') return 'border-danger/30 bg-danger/5';
    if (level === 'Advisory') return 'border-warning/30 bg-warning/5';
    return 'border-primary/30 bg-primary/5';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 h-full flex flex-col">
      <AppHeader title={t('nav_intel')} />

      <Tabs defaultValue="news" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="news">{t('news_feed')}</TabsTrigger>
          <TabsTrigger value="alerts">{t('alerts')}</TabsTrigger>
          <TabsTrigger value="flights">{t('flight_radar')}</TabsTrigger>
        </TabsList>

        <TabsContent value="news" className="flex-1 overflow-y-auto pb-6">
          <div className="space-y-2">
            {(!intelEntries || intelEntries.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('no_intel')}</p>
            ) : (
              intelEntries.map((e) => (
                <div key={e.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground">{e.headline}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${catColor[e.category] || 'bg-secondary text-muted-foreground'}`}>
                      {catLabels[INTEL_CATS_EN.indexOf(e.category)] || e.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{e.source}</span>
                    <span>·</span>
                    <span className="font-mono-data">{timeAgo(e.timestamp, language)}</span>
                  </div>
                  {e.notes && <p className="text-xs text-muted-foreground mt-2">{e.notes}</p>}
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => setSheetOpen(true)}
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40"
          >
            <Plus size={24} />
          </button>
        </TabsContent>

        <TabsContent value="alerts" className="flex-1 overflow-y-auto pb-6">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-2 mb-4">
            <Info size={16} className="text-primary shrink-0" />
            <span className="text-xs text-primary">{t('live_alerts_banner')}</span>
            <Button size="sm" variant="outline" className="ml-auto shrink-0 gap-1" disabled>
              <RefreshCw size={14} /> {t('refresh')}
            </Button>
          </div>
          <div className="space-y-2">
            {(alerts || []).map((a) => (
              <div key={a.id} className={`border rounded-xl p-4 ${alertLevelStyle(a.level)}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className={a.level === 'Warning' ? 'text-danger' : a.level === 'Advisory' ? 'text-warning' : 'text-primary'} />
                  <span className="text-xs font-bold uppercase">{a.level}</span>
                  <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{t('example')}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-1">{a.region}</div>
                <p className="text-sm text-foreground">{a.description}</p>
                <div className="text-[10px] text-muted-foreground mt-2 font-mono-data">{timeAgo(a.issuedAt, language)}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="flights" className="flex-1 overflow-hidden pb-6">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-2 mb-4">
            <Plane size={16} className="text-primary shrink-0" />
            <div>
              <span className="text-xs text-primary block">{t('flight_radar_banner')}</span>
              <span className="text-[10px] text-muted-foreground">{t('flight_radar_note')}</span>
            </div>
          </div>
          <div className="h-[400px] rounded-xl overflow-hidden border border-border">
            <MapContainer center={[45.5017, -73.5673]} zoom={11} className="h-full w-full" zoomControl={false}>
              <TileLayer
                attribution='&copy; OSM'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {MOCK_FLIGHTS.map((f, i) => (
                <Marker key={i} position={f.pos} icon={planeIcon}>
                  <Popup>
                    <div className="text-xs">
                      <div className="font-bold">{f.callsign}</div>
                      <div>Alt: {f.alt}</div>
                      <div>Speed: {f.speed}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add_entry')}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <Input placeholder={t('headline')} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
            <Input placeholder={t('source')} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <Input placeholder={t('url')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTEL_CATS_EN.map((c, i) => <SelectItem key={c} value={c}>{catLabels[i] || c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder={t('notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            <Button onClick={handleAddEntry} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
