import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Upload, Trash2, Share2, Check } from 'lucide-react';
import { db } from '@/lib/db';
import { validateBackupData } from '@/lib/validation';
import { useTranslation } from '@/lib/i18nContext';
import { useTheme } from '@/lib/themeContext';
import { AppHeader } from '@/components/AppHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const ROLES_EN = ['Leader', 'Member', 'Medic', 'Scout', 'Driver'] as const;

export const SettingsTab: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');
  const [leaderConfirmOpen, setLeaderConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const userName = useLiveQuery(() => db.settings.get('userName'));
  const userRole = useLiveQuery(() => db.settings.get('userRole'));
  const groupName = useLiveQuery(() => db.settings.get('groupName'));
  const members = useLiveQuery(() => db.members.toArray());
  const safeRadius = useLiveQuery(() => db.settings.get('safeRadius'));
  const checklist = useLiveQuery(() => db.checklistItems.orderBy('order').toArray());

  const roleLabels = t('roles').split(',');
  const checklistTotal = checklist?.length ?? 0;
  const checklistDone = checklist?.filter((c) => c.completed).length ?? 0;
  const prepPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const catLabelMap: Record<string, string> = {
    essentials: t('cat_essentials'),
    communication: t('cat_communication'),
    shelter: t('cat_shelter'),
    knowledge: t('cat_knowledge'),
    maintenance: t('cat_maintenance'),
  };

  const setSetting = (key: string, value: any) => db.settings.put({ key, value });

  const handleRoleChange = (role: string) => {
    if (role === 'Leader') {
      // Check if another member already has the Leader role
      const existingLeader = (members || []).find((m) => m.role === 'Leader');
      if (existingLeader) {
        toast.error(
          language === 'fr'
            ? `${existingLeader.name} est déjà chef du groupe. Retirez-le d'abord.`
            : `${existingLeader.name} is already the group leader. Remove them first.`
        );
        return;
      }
      // Open confirmation dialog WITHOUT writing to DB first.
      // Only confirmLeaderRole() writes to DB.
      setTimeout(() => {
        setLeaderConfirmOpen(true);
      }, 200);
    } else {
      setSetting('userRole', role);
    }
  };

  const confirmLeaderRole = () => {
    setSetting('userRole', 'Leader');
    setLeaderConfirmOpen(false);
    toast.success(language === 'fr' ? 'Rôle de Chef confirmé' : 'Leader role confirmed');
  };

  const handleExport = async () => {
    const data = {
      supplies: await db.supplies.toArray(),
      members: await db.members.toArray(),
      messages: await db.messages.toArray(),
      checkins: await db.checkins.toArray(),
      locations: await db.locations.toArray(),
      activityLog: await db.activityLog.toArray(),
      intelEntries: await db.intelEntries.toArray(),
      cachedAlerts: await db.cachedAlerts.toArray(),
      detections: await db.detections.toArray(),
      settings: await db.settings.toArray(),
      checklistItems: await db.checklistItems.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('data_exported'));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Validate against Zod schema before importing
      const data = validateBackupData(raw);

      // Import ALL tables (including checkins and cachedAlerts)
      if (data.supplies.length) await db.supplies.bulkPut(data.supplies);
      if (data.members.length) await db.members.bulkPut(data.members);
      if (data.messages.length) await db.messages.bulkPut(data.messages);
      if (data.checkins.length) await db.checkins.bulkPut(data.checkins);
      if (data.locations.length) await db.locations.bulkPut(data.locations);
      if (data.activityLog.length) await db.activityLog.bulkPut(data.activityLog);
      if (data.intelEntries.length) await db.intelEntries.bulkPut(data.intelEntries);
      if (data.cachedAlerts.length) await db.cachedAlerts.bulkPut(data.cachedAlerts);
      if (data.detections.length) await db.detections.bulkPut(data.detections);
      if (data.settings.length) await db.settings.bulkPut(data.settings);
      if (data.checklistItems.length) await db.checklistItems.bulkPut(data.checklistItems);
      toast.success(t('data_imported'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(`Import failed: ${message.slice(0, 120)}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClear = async () => {
    const confirm = language === 'fr' ? 'SUPPRIMER' : 'DELETE';
    if (clearConfirm !== confirm) return;
    await Promise.all([
      db.supplies.clear(), db.members.clear(), db.messages.clear(),
      db.checkins.clear(), db.locations.clear(), db.activityLog.clear(),
      db.intelEntries.clear(), db.cachedAlerts.clear(), db.detections.clear(),
      db.settings.clear(), db.checklistItems.clear(),
    ]);
    toast.success(t('data_cleared'));
    setClearDialogOpen(false);
    setClearConfirm('');
    window.location.reload();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      toast.success(t('url_copied'));
    });
  };

  const toggleChecklistItem = async (id: number, completed: boolean) => {
    await db.checklistItems.update(id, { completed: !completed });
  };

  // Group checklist by category
  const categories = ['essentials', 'communication', 'shelter', 'knowledge', 'maintenance'];
  const grouped = categories.map((cat) => ({
    key: cat,
    label: catLabelMap[cat] || cat,
    items: (checklist || []).filter((c) => c.category === cat),
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pb-24">
      <AppHeader title={t('nav_settings')} />

      {/* Profile */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('profile')}</h3>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <Input
            placeholder={t('name')}
            value={(userName?.value as string) || ''}
            onChange={(e) => setSetting('userName', e.target.value)}
          />
          <Select value={(userRole?.value as string) || 'Member'} onValueChange={handleRoleChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES_EN.map((r, i) => <SelectItem key={r} value={r}>{roleLabels[i] || r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder={t('group_name')}
            value={(groupName?.value as string) || ''}
            onChange={(e) => setSetting('groupName', e.target.value)}
          />
        </div>
      </section>

      {/* Preferences */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('preferences')}</h3>
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t('language')}</span>
            <div className="flex bg-secondary rounded-full p-0.5">
              <button onClick={() => setLanguage('en')} className={`px-3 py-1 rounded-full text-xs font-medium ${language === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>EN</button>
              <button onClick={() => setLanguage('fr')} className={`px-3 py-1 rounded-full text-xs font-medium ${language === 'fr' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>FR</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">{t('theme')}</span>
            <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('theme_light')}</SelectItem>
                <SelectItem value="dark">{t('theme_dark')}</SelectItem>
                <SelectItem value="system">{t('theme_system')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">{t('safe_radius')}</span>
              <span className="text-sm font-mono-data text-muted-foreground">{(safeRadius?.value as number) || 5} km</span>
            </div>
            <Slider
              value={[(safeRadius?.value as number) || 5]}
              onValueChange={([v]) => setSetting('safeRadius', v)}
              min={1}
              max={50}
              step={1}
            />
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('preparation_checklist')}</h3>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">{checklistDone}/{checklistTotal} {t('completed')}</span>
              <span className="text-sm font-bold font-mono-data text-primary">{prepPct}%</span>
            </div>
            <Progress value={prepPct} className="h-2" />
          </div>
          {grouped.map((group) => (
            <div key={group.key} className="mb-4 last:mb-0">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</h4>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id!, item.completed)}
                    className="w-full flex items-start gap-3 py-2 text-left group"
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      item.completed ? 'bg-success border-success' : 'border-border group-hover:border-primary'
                    }`}>
                      {item.completed && <Check size={12} className="text-success-foreground" />}
                    </div>
                    <span className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {language === 'fr' ? item.textFr : item.textEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Data Management */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('data_management')}</h3>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleExport}>
            <Download size={18} /> {t('export_data')}
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => fileRef.current?.click()}>
            <Upload size={18} /> {t('import_data')}
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="destructive" className="w-full justify-start gap-2" onClick={() => setClearDialogOpen(true)}>
            <Trash2 size={18} /> {t('clear_data')}
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleShare}>
            <Share2 size={18} /> {t('share_app')}
          </Button>
        </div>
      </section>

      {/* About */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('about')}</h3>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <h2 className="text-xl font-bold text-foreground">SENTINEL</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('tagline')}</p>
          <p className="text-xs text-muted-foreground mt-2">{t('version')} 1.0.0</p>
        </div>
      </section>

      {/* Clear Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clear_data')}</DialogTitle>
            <DialogDescription>
              {language === 'fr' ? t('clear_data_confirm_fr') : t('clear_data_confirm')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={clearConfirm}
            onChange={(e) => setClearConfirm(e.target.value)}
            placeholder={language === 'fr' ? 'SUPPRIMER' : 'DELETE'}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>{t('cancel')}</Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearConfirm !== (language === 'fr' ? 'SUPPRIMER' : 'DELETE')}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leader Confirmation AlertDialog — uses AlertDialog instead of Dialog
           to prevent Radix Select's close event from dismissing it */}
      <AlertDialog open={leaderConfirmOpen} onOpenChange={(open) => { if (!open) { setLeaderConfirmOpen(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'fr' ? 'Confirmer le rôle de Chef' : 'Confirm Leader Role'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'fr'
                ? 'Le rôle de Chef vous donne le pouvoir de modifier le niveau de menace. Confirmez-vous vouloir devenir Chef du groupe ?'
                : 'The Leader role grants the ability to change the threat level. Are you sure you want to become the group Leader?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setLeaderConfirmOpen(false); }}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeaderRole}>
              {language === 'fr' ? 'Confirmer' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
