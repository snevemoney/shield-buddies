import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Shield, ShoppingBag, Droplets, Users, CheckCircle, Phone, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, daysUntilExpiry, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';

const THREAT_LEVELS = [
  { key: 'threat_all_clear', descKey: 'threat_all_clear_desc', color: 'success', level: 0 },
  { key: 'threat_stay_alert', descKey: 'threat_stay_alert_desc', color: 'warning', level: 1 },
  { key: 'threat_prepare', descKey: 'threat_prepare_desc', color: 'orange', level: 2 },
  { key: 'threat_emergency', descKey: 'threat_emergency_desc', color: 'danger', level: 3 },
];

const threatColorClasses: Record<number, string> = {
  0: 'bg-success/10 border-success/20 text-success',
  1: 'bg-warning/10 border-warning/20 text-warning',
  2: 'bg-orange-500/10 border-orange-500/20 text-orange-600',
  3: 'bg-danger/10 border-danger/20 text-danger',
};

export const HomeTab: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { t, language } = useTranslation();

  const userName = useLiveQuery(() => db.settings.get('userName'));
  const threatLevel = useLiveQuery(() => db.settings.get('threatLevel'));
  const userRole = useLiveQuery(() => db.settings.get('userRole'));
  const supplies = useLiveQuery(() => db.supplies.toArray());
  const members = useLiveQuery(() => db.members.toArray());
  const checklist = useLiveQuery(() => db.checklistItems.toArray());
  const activities = useLiveQuery(() => db.activityLog.orderBy('timestamp').reverse().limit(10).toArray());

  const currentThreat = (threatLevel?.value as number) ?? 0;
  const threat = THREAT_LEVELS[currentThreat];
  const isLeader = userRole?.value === 'Leader';

  // Calculate stats
  const memberCount = members?.length ?? 0;
  const checkedInCount = members?.filter((m) => {
    if (!m.lastCheckIn) return false;
    return Date.now() - m.lastCheckIn < 4 * 3600000;
  }).length ?? 0;

  const waterSupplies = supplies?.filter((s) => s.category === 'Water') ?? [];
  const totalWaterL = waterSupplies.reduce((sum, s) => {
    if (s.unit === 'L') return sum + s.quantity;
    if (s.unit === 'bottles') return sum + s.quantity * 0.5;
    return sum + s.quantity;
  }, 0);
  const waterDays = memberCount > 0 ? Math.floor(totalWaterL / (memberCount * 4)) : 0;

  const foodSupplies = supplies?.filter((s) => s.category === 'Food') ?? [];
  const foodDays = foodSupplies.length > 0 ? Math.min(...foodSupplies.map((s) => {
    const d = daysUntilExpiry(s.expirationDate);
    return d !== null ? Math.max(0, d) : 999;
  })) : 0;

  const checklistTotal = checklist?.length ?? 0;
  const checklistDone = checklist?.filter((c) => c.completed).length ?? 0;
  const prepPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const handleThreatCycle = async () => {
    if (!isLeader) return;
    const next = (currentThreat + 1) % 4;
    await db.settings.put({ key: 'threatLevel', value: next });
    const levelName = t(THREAT_LEVELS[next].key);
    await logActivity('threat_changed', `Threat level changed to ${levelName}`, `Niveau de menace changé à ${levelName}`);
  };

  const name = (userName?.value as string) || '';
  const greeting = name ? `${t('hello')}, ${name}` : t('hello');
  const dateStr = new Date().toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6">
      <AppHeader />
      <div className="space-y-4 pb-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground capitalize">{dateStr}</p>
        </div>

        {/* Threat Level */}
        <motion.button
          whileTap={isLeader ? { scale: 0.98 } : undefined}
          onClick={handleThreatCycle}
          className={`w-full p-4 rounded-xl border-2 transition-colors ${threatColorClasses[currentThreat]} ${!isLeader ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-3">
            <Shield size={28} />
            <div className="text-left">
              <div className="text-xs font-medium uppercase tracking-wider opacity-70">{t('threat_level')}</div>
              <div className="text-lg font-bold">{t(threat.key)}</div>
              <div className="text-sm opacity-80">{t(threat.descKey)}</div>
            </div>
          </div>
          {!isLeader && (
            <p className="text-xs opacity-60 mt-2">{t('threat_leader_only')}</p>
          )}
        </motion.button>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('supplies')} className="bg-card border border-border rounded-xl p-4 text-left hover:bg-accent/50 transition-colors">
            <ShoppingBag size={20} className="text-primary mb-2" />
            <div className="text-2xl font-bold font-mono-data text-foreground">{foodDays === 999 ? '—' : foodDays}</div>
            <div className="text-xs text-muted-foreground">{t('food_supply')}</div>
            <div className="text-[10px] text-muted-foreground">{t('days_remaining')}</div>
          </button>
          <button onClick={() => onNavigate('supplies')} className="bg-card border border-border rounded-xl p-4 text-left hover:bg-accent/50 transition-colors">
            <Droplets size={20} className="text-primary mb-2" />
            <div className="text-2xl font-bold font-mono-data text-foreground">{waterDays}</div>
            <div className="text-xs text-muted-foreground">{t('water_supply')}</div>
            <div className="text-[10px] text-muted-foreground">{t('days_remaining')}</div>
          </button>
          <button onClick={() => onNavigate('group')} className="bg-card border border-border rounded-xl p-4 text-left hover:bg-accent/50 transition-colors">
            <Users size={20} className="text-success mb-2" />
            <div className="text-2xl font-bold font-mono-data text-foreground">
              <span className="text-success">{checkedInCount}</span>
              <span className="text-muted-foreground text-lg">/{memberCount}</span>
            </div>
            <div className="text-xs text-muted-foreground">{t('members_checked_in')}</div>
          </button>
          <button onClick={() => onNavigate('settings')} className="bg-card border border-border rounded-xl p-4 text-left hover:bg-accent/50 transition-colors">
            <CheckCircle size={20} className="text-primary mb-2" />
            <div className="text-2xl font-bold font-mono-data text-foreground">{prepPct}%</div>
            <div className="text-xs text-muted-foreground">{t('prep_progress')}</div>
          </button>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">{t('recent_activity')}</h3>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {(!activities || activities.length === 0) ? (
              <p className="p-4 text-sm text-muted-foreground">{t('no_activity_yet')}</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{language === 'fr' ? a.descriptionFr : a.description}</p>
                    <p className="text-xs text-muted-foreground font-mono-data">{timeAgo(a.timestamp, language)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Emergency Contacts */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">{t('emergency_contacts')}</h3>
          <div className="grid grid-cols-3 gap-2">
            <a href="tel:911" className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex flex-col items-center gap-1 min-h-[44px]">
              <Phone size={18} className="text-danger" />
              <span className="text-sm font-bold text-danger">911</span>
            </a>
            <a href="tel:811" className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex flex-col items-center gap-1 min-h-[44px]">
              <Phone size={18} className="text-primary" />
              <span className="text-sm font-bold text-primary">811</span>
              <span className="text-[9px] text-muted-foreground">Info-Santé</span>
            </a>
            <a href="tel:18002624919" className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex flex-col items-center gap-1 min-h-[44px]">
              <AlertTriangle size={18} className="text-warning" />
              <span className="text-[10px] font-bold text-warning text-center">{t('poison_control')}</span>
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{t('requires_phone')}</p>
        </div>
      </div>
    </div>
  );
};
