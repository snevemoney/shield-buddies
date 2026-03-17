import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RefreshCw, Plane, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { db } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo } from '@/lib/utils';
import { feedManager, useFeedHealth } from '@/lib/feeds/feedManager';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import 'leaflet/dist/leaflet.css';

const INTEL_CATS_EN = ['Conflict', 'Weather', 'Infrastructure', 'Health', 'Local'];

const catColor: Record<string, string> = {
  Conflict: 'bg-danger/10 text-danger',
  Weather: 'bg-primary/10 text-primary',
  Infrastructure: 'bg-warning/10 text-warning',
  Health: 'bg-success/10 text-success',
  Local: 'bg-accent text-accent-foreground',
};

function flightIcon(track: number) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:18px;transform:rotate(${Math.round(track) - 45}deg);line-height:1">✈️</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export const IntelTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ headline: '', source: '', url: '', category: 'Local', notes: '' });

  const intelEntries = useLiveQuery(() => db.intelEntries.orderBy('timestamp').reverse().toArray());
  const newsFromFeeds = useLiveQuery(async () => {
    const items = await db.cachedAlerts.filter((a) => a.normalizedType === 'news').sortBy('cachedAt');
    return items.reverse();
  });
  const alerts = useLiveQuery(async () => {
    const all = await db.cachedAlerts.filter((a) => !a.normalizedType || a.normalizedType === 'alert' || a.normalizedType === 'outage').sortBy('cachedAt');
    return all.reverse();
  });
  const flights = useLiveQuery(() => db.cachedAlerts.where('normalizedType').equals('flight').toArray());
  const naadHealth = useFeedHealth('naad');
  const hydroHealth = useFeedHealth('hydro');
  const openSkyHealth = useFeedHealth('opensky');
  const rssHealth = useFeedHealth('rss');
  const contradictions = useLiveQuery(() => db.contradictionAlerts.orderBy('createdAt').reverse().limit(5).toArray());
  const catLabels = t('intel_categories').split(',');

  const handleAddEntry = async () => {
    if (!form.headline.trim()) return;
    await db.intelEntries.add({ headline: form.headline, source: form.source, url: form.url || undefined, category: form.category, notes: form.notes || undefined, timestamp: Date.now() });
    setForm({ headline: '', source: '', url: '', category: 'Local', notes: '' });
    setSheetOpen(false);
  };

  const handleRefresh = async () => {
    if (feedManager.adapterCount === 0) {
      toast.info(t('no_feeds_configured'));
      return;
    }
    setRefreshing(true);
    try {
      await feedManager.pollAllFeeds();
    } finally {
      setRefreshing(false);
    }
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
            {/* Feed news from cachedAlerts */}
            {(newsFromFeeds ?? []).map((n) => {
              let feedName = '';
              try { feedName = n.rawData ? JSON.parse(n.rawData).feedName : ''; } catch { /* */ }
              return (
                <div key={`feed-${n.id}`} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground">{n.description}</h4>
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0 uppercase">
                      {feedName || n.source || 'RSS'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{n.region}</span>
                    <span>·</span>
                    <span className="font-mono-data">{timeAgo(n.issuedAt, language)}</span>
                  </div>
                </div>
              );
            })}
            {/* Manual intel entries */}
            {(intelEntries ?? []).map((e) => (
              <div key={`manual-${e.id}`} className="bg-card border border-border rounded-xl p-4">
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
            ))}
            {(newsFromFeeds ?? []).length === 0 && (intelEntries ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">{t('no_intel')}</p>
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
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-primary shrink-0" />
              <span className="text-xs text-primary flex-1">
                {feedManager.adapterCount > 0 ? t('live_alerts_banner') : t('feeds_will_appear')}
              </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto shrink-0 gap-1"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {refreshing ? t('refreshing_feeds') : t('refresh')}
            </Button>
            </div>
            {feedManager.adapterCount > 0 && (
              <div className="flex items-center gap-3 mt-2">
                {[
                  { name: 'NAAD', health: naadHealth },
                  { name: 'Hydro', health: hydroHealth },
                  { name: 'OpenSky', health: openSkyHealth },
                  { name: 'RSS', health: rssHealth },
                ].map((f) => (
                  <div key={f.name} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                      f.health?.status === 'healthy' ? 'bg-success' :
                      f.health?.status === 'degraded' ? 'bg-warning' :
                      f.health?.status === 'unreachable' ? 'bg-danger' : 'bg-muted'
                    }`} />
                    <span className="text-[10px] text-muted-foreground">{f.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Contradictions */}
          {(contradictions ?? []).length > 0 && (
            <div className="space-y-2 mb-4">
              {(contradictions ?? []).map((c) => (
                <div key={c.id} className="border-2 border-warning/30 bg-warning/5 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-warning" />
                    <span className="text-xs font-bold text-warning uppercase">{c.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-foreground">{language === 'fr' ? c.descriptionFr : c.description}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {(alerts || []).map((a) => (
              <div key={a.id} className={`border rounded-xl p-4 ${alertLevelStyle(a.level)}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className={a.level === 'Warning' || a.level === 'Severe' || a.level === 'Extreme' ? 'text-danger' : a.level === 'Advisory' || a.level === 'Moderate' ? 'text-warning' : 'text-primary'} />
                  <span className="text-xs font-bold uppercase">{a.level}</span>
                  {a.source && (
                    <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded uppercase">{a.source}</span>
                  )}
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
            <div className="flex-1">
              <span className="text-xs text-primary block">
                {flights && flights.length > 0
                  ? t('aircraft_tracked', { count: String(flights.length) })
                  : t('no_aircraft')}
              </span>
              <span className="text-[10px] text-muted-foreground">{t('flight_radar_note')}</span>
            </div>
          </div>
          <div className="h-[400px] rounded-xl overflow-hidden border border-border">
            <MapContainer center={[45.5017, -73.5673]} zoom={11} className="h-full w-full" zoomControl={false}>
              <TileLayer
                attribution='&copy; OSM'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {(flights || []).map((f) => {
                let meta = { callsign: '', originCountry: '', altitude: 0, velocity: 0, trueTrack: 0 };
                try { meta = JSON.parse(f.rawData || '{}'); } catch { /* use defaults */ }
                const altFt = meta.altitude != null ? Math.round(meta.altitude * 3.281) : null;
                const speedKts = meta.velocity != null ? Math.round(meta.velocity * 1.944) : null;
                return (
                  <Marker
                    key={f.id}
                    position={[f.lat!, f.lng!]}
                    icon={flightIcon(meta.trueTrack || 0)}
                  >
                    <Popup>
                      <div className="text-xs min-w-[120px]">
                        <div className="font-bold">{meta.callsign || '—'}</div>
                        <div>{meta.originCountry}</div>
                        {altFt != null && <div>Alt: {altFt.toLocaleString()} ft</div>}
                        {speedKts != null && <div>Speed: {speedKts} kts</div>}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
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
