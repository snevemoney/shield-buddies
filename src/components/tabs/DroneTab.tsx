import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Plus, Info } from 'lucide-react';
import { db } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export const DroneTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [monitoring, setMonitoring] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({ confidence: 'Low', classification: 'Unknown', durationSeconds: 0 });

  const detections = useLiveQuery(() => db.detections.orderBy('timestamp').reverse().toArray());

  const classLabels = t('classifications').split(',');
  const classValues = ['Drone', 'Aircraft', 'Vehicle', 'Unknown'];
  const confLabels = { Low: language === 'fr' ? 'Faible' : 'Low', Medium: language === 'fr' ? 'Moyen' : 'Medium', High: language === 'fr' ? 'Élevé' : 'High' };

  const confBadge = (c: string) => {
    if (c === 'High') return 'bg-danger/10 text-danger';
    if (c === 'Medium') return 'bg-warning/10 text-warning';
    return 'bg-secondary text-muted-foreground';
  };

  const handleAddDetection = async () => {
    await db.detections.add({
      timestamp: Date.now(),
      confidence: form.confidence as any,
      classification: form.classification as any,
      durationSeconds: form.durationSeconds,
      source: 'manual',
    });
    await logActivity('detection', `Detection logged: ${form.classification}`, `Détection enregistrée : ${form.classification}`);
    setForm({ confidence: 'Low', classification: 'Unknown', durationSeconds: 0 });
    setSheetOpen(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6">
      <AppHeader title={t('nav_drone')} />

      {/* Radar visualization */}
      <div className="flex flex-col items-center py-6">
        <div className="relative w-48 h-48">
          {/* Concentric rings */}
          {[1, 0.75, 0.5, 0.25].map((scale, i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border border-primary/20"
              style={{ transform: `scale(${scale})` }}
            />
          ))}
          {monitoring && (
            <>
              {/* Sweep line */}
              <div
                className="absolute top-1/2 left-1/2 w-1/2 h-0.5 origin-left radar-line"
                style={{ marginTop: '-1px' }}
              />
              {/* Pulse rings */}
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 pulse-ring-anim" />
            </>
          )}
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold tracking-widest text-primary">
              {monitoring ? t('monitoring') : t('standby')}
            </span>
          </div>
        </div>
        <Button
          onClick={() => setMonitoring(!monitoring)}
          variant={monitoring ? 'destructive' : 'default'}
          className="mt-4"
        >
          {monitoring ? t('stop_monitoring') : t('start_monitoring')}
        </Button>
      </div>

      {/* Detection Log */}
      <h3 className="text-sm font-semibold text-foreground mb-2">{t('detection_log')}</h3>
      <div className="space-y-2 pb-4">
        {(!detections || detections.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t('no_detections')}</p>
        ) : (
          detections.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono-data text-muted-foreground">{timeAgo(d.timestamp, language)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${confBadge(d.confidence)}`}>
                  {confLabels[d.confidence as keyof typeof confLabels]}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {classLabels[classValues.indexOf(d.classification)] || d.classification}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.durationSeconds}s · {d.source}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{t('drone_info')}</p>
        </div>
      </div>

      {/* Add manual entry button */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <Plus size={24} />
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add_manual_entry')}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <Select value={form.classification} onValueChange={(v) => setForm({ ...form, classification: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classValues.map((c, i) => <SelectItem key={c} value={c}>{classLabels[i] || c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.confidence} onValueChange={(v) => setForm({ ...form, confidence: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['Low', 'Medium', 'High'] as const).map((c) => (
                  <SelectItem key={c} value={c}>{confLabels[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder={`${t('duration')} (${t('seconds')})`}
              value={form.durationSeconds || ''}
              onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })}
            />
            <Button onClick={handleAddDetection} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
