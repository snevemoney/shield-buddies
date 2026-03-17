import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Info, Loader2 } from 'lucide-react';
import { db, type Detection } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { DroneDetector, type DetectionResult } from '@/lib/audio/droneDetector';

export const DroneTab: React.FC = () => {
  const { t, language } = useTranslation();
  const [monitoring, setMonitoring] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateProgress, setCalibrateProgress] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [form, setForm] = useState<{
    confidence: Detection['confidence'];
    classification: Detection['classification'];
    durationSeconds: number;
  }>({ confidence: 'Low', classification: 'Unknown', durationSeconds: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const detectorRef = useRef<DroneDetector | null>(null);

  const detections = useLiveQuery(() => db.detections.orderBy('timestamp').reverse().toArray());

  const classLabels = t('classifications').split(',');
  const classValues: Detection['classification'][] = ['Drone', 'Aircraft', 'Vehicle', 'Unknown'];
  const confLabels = { Low: language === 'fr' ? 'Faible' : 'Low', Medium: language === 'fr' ? 'Moyen' : 'Medium', High: language === 'fr' ? 'Élevé' : 'High' };

  const confBadge = (c: string) => {
    if (c === 'High') return 'bg-danger/10 text-danger';
    if (c === 'Medium') return 'bg-warning/10 text-warning';
    return 'bg-secondary text-muted-foreground';
  };

  const handleDetection = useCallback(async (result: DetectionResult) => {
    setDetecting(true);
    await db.detections.add({
      timestamp: result.timestamp,
      confidence: result.confidence,
      classification: 'Drone',
      durationSeconds: Math.round(result.durationMs / 1000),
      source: 'audio',
    });
    await logActivity('detection', `Audio detection: ${result.confidence}`, `Détection audio : ${result.confidence}`);
    toast.success(t('detection_logged'));
    setTimeout(() => setDetecting(false), 3000);
  }, [t]);

  // Initialize detector
  useEffect(() => {
    detectorRef.current = new DroneDetector(handleDetection);
    return () => {
      detectorRef.current?.stopListening();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [handleDetection]);

  const handleCalibrate = async () => {
    if (!detectorRef.current) return;
    setCalibrating(true);
    setCalibrateProgress(0);
    const interval = setInterval(() => setCalibrateProgress((p) => Math.min(p + 20, 100)), 1000);
    try {
      await detectorRef.current.calibrate();
      setCalibrated(true);
      toast.success(t('calibration_complete'));
    } catch {
      toast.error(t('mic_required'));
    } finally {
      clearInterval(interval);
      setCalibrating(false);
    }
  };

  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!canvas || !detector || !monitoring) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = detector.getSpectrumData();
    const energies = detector.getBandEnergies();
    const floor = detector.getNoiseFloor();
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, w, h);

    // Draw 3 band bars
    const barWidth = w / 4;
    const bands = [
      { label: t('low_band'), energy: energies.low, floor: floor.low, color: '#3B82F6' },
      { label: t('mid_band'), energy: energies.mid, floor: floor.mid, color: '#22C55E' },
      { label: t('high_band'), energy: energies.high, floor: floor.high, color: '#EF4444' },
    ];

    bands.forEach((band, i) => {
      const x = (i + 0.5) * barWidth;
      const barH = (band.energy / 255) * (h - 20);
      const thresholdY = h - 20 - ((band.floor + 30) / 255) * (h - 20);

      // Bar
      ctx.fillStyle = band.color;
      ctx.fillRect(x - 20, h - 20 - barH, 40, barH);

      // Threshold line
      ctx.strokeStyle = band.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x - 30, thresholdY);
      ctx.lineTo(x + 30, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = 'currentColor';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = band.color;
      ctx.fillText(band.label, x, h - 4);
    });

    animFrameRef.current = requestAnimationFrame(drawSpectrum);
  }, [monitoring, t]);

  const handleStartMonitoring = async () => {
    if (!detectorRef.current) return;
    try {
      await detectorRef.current.startListening();
      setMonitoring(true);
    } catch {
      toast.error(t('mic_required'));
    }
  };

  const handleStopMonitoring = () => {
    detectorRef.current?.stopListening();
    setMonitoring(false);
    cancelAnimationFrame(animFrameRef.current);
  };

  // Start/stop spectrum drawing when monitoring changes
  useEffect(() => {
    if (monitoring) {
      animFrameRef.current = requestAnimationFrame(drawSpectrum);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [monitoring, drawSpectrum]);

  const handleAddDetection = async () => {
    await db.detections.add({
      timestamp: Date.now(),
      confidence: form.confidence,
      classification: form.classification,
      durationSeconds: form.durationSeconds,
      source: 'manual',
    });
    await logActivity('detection', `Detection logged: ${form.classification}`, `Détection enregistrée : ${form.classification}`);
    setForm({ confidence: 'Low', classification: 'Unknown', durationSeconds: 0 });
    setSheetOpen(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 h-full flex flex-col">
      <AppHeader title={t('nav_drone')} />

      <div className="flex-1 overflow-y-auto pb-24 space-y-4">
        {/* Radar Visualization */}
        <div className="flex flex-col items-center py-4">
          <div className="relative w-48 h-48">
            {/* Concentric rings */}
            {[1, 0.75, 0.5, 0.25].map((scale) => (
              <div key={scale} className="absolute inset-0 rounded-full border border-primary/20"
                style={{ transform: `scale(${scale})` }} />
            ))}
            {monitoring && (
              <>
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className="absolute top-1/2 left-1/2 w-1/2 h-[2px] origin-left radar-line"
                    style={{ animationDuration: detecting ? '1s' : '4s' }} />
                </div>
                <div className="absolute inset-0 rounded-full pulse-ring-anim"
                  style={{ border: '2px solid hsl(var(--primary) / 0.3)' }} />
              </>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-bold tracking-widest ${monitoring ? 'text-primary' : 'text-muted-foreground'}`}>
                {monitoring ? t('monitoring') : t('standby')}
              </span>
            </div>
          </div>

          {/* Calibration */}
          <div className="w-full max-w-xs mt-4 space-y-2">
            {calibrating ? (
              <div className="space-y-2">
                <Progress value={calibrateProgress} className="h-2" />
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  {t('calibrating')}
                </div>
              </div>
            ) : !calibrated ? (
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">{t('calibrate_desc')}</p>
                <Button onClick={handleCalibrate} variant="outline" className="w-full">
                  {t('calibrate')}
                </Button>
              </div>
            ) : null}

            {/* Start/Stop */}
            {monitoring ? (
              <Button onClick={handleStopMonitoring} variant="destructive" className="w-full">
                {t('stop_monitoring')}
              </Button>
            ) : (
              <Button onClick={handleStartMonitoring} disabled={!calibrated} className="w-full">
                {t('start_monitoring')}
              </Button>
            )}
          </div>
        </div>

        {/* Spectrum Visualization */}
        {monitoring && (
          <div className="bg-card border border-border rounded-xl p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('spectrum')}</h4>
            <canvas
              ref={canvasRef}
              width={300}
              height={120}
              className="w-full h-[120px] rounded"
            />
          </div>
        )}

        {/* Detection Log */}
        <h3 className="text-sm font-semibold text-foreground">{t('detection_log')}</h3>
        <div className="space-y-2">
          {(!detections || detections.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t('no_detections')}</p>
          ) : (
            detections.map((d) => (
              <div key={d.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-muted-foreground font-mono-data">{timeAgo(d.timestamp, language)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${confBadge(d.confidence)}`}>
                      {confLabels[d.confidence]}
                    </span>
                  </div>
                  <div className="text-sm text-foreground">
                    {classLabels[classValues.indexOf(d.classification)] || d.classification}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {d.durationSeconds}s · {d.source}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Card */}
        <div className="bg-card/50 border border-border rounded-xl p-4 flex items-start gap-3">
          <Info size={18} className="text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{t('mic_required')}</p>
        </div>
      </div>

      {/* FAB for manual entry */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <Plus size={24} />
      </button>

      {/* Manual Entry Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('add_manual_entry')}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <Select value={form.classification} onValueChange={(v) => setForm({ ...form, classification: v as Detection['classification'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classValues.map((c, i) => <SelectItem key={c} value={c}>{classLabels[i] || c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.confidence} onValueChange={(v) => setForm({ ...form, confidence: v as Detection['confidence'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['Low', 'Medium', 'High'] as const).map((c) => <SelectItem key={c} value={c}>{confLabels[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="number" value={form.durationSeconds} onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })} className="w-24" />
              <span className="text-sm text-muted-foreground">{t('seconds')}</span>
            </div>
            <Button onClick={handleAddDetection} className="w-full">{t('save')}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
