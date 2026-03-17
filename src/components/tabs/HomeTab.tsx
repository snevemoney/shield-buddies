import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Shield, ShoppingBag, Droplets, Users, CheckCircle, Phone, AlertTriangle, MessageSquare, Clock } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { db } from '@/lib/db';
import { useTranslation } from '@/lib/i18nContext';
import { timeAgo, daysUntilExpiry, nameToColor, logActivity } from '@/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import 'leaflet/dist/leaflet.css';

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

function checkinColor(lastCheckIn?: number): string {
  if (!lastCheckIn) return 'text-danger';
  const hours = (Date.now() - lastCheckIn) / 3600000;
  if (hours < 1) return 'text-success';
  if (hours < 4) return 'text-warning';
  if (hours < 12) return 'text-orange-500';
  return 'text-danger';
}

function memberDotIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 54;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? '#16A34A' : score >= 40 ? '#EAB308' : '#DC2626';
  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        strokeLinecap="round" transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" dy="0.35em" className="fill-foreground" style={{ fontSize: '28px', fontWeight: 'bold' }}>{score}</text>
    </svg>
  );
};

export const HomeTab: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { t, language } = useTranslation();
  const [notifPermission, setNotifPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'denied'
  );

  const userName = useLiveQuery(() => db.settings.get('userName'));
  const threatLevel = useLiveQuery(() => db.settings.get('threatLevel'));
  const userRole = useLiveQuery(() => db.settings.get('userRole'));
  const lastMapDownload = useLiveQuery(() => db.settings.get('lastMapDownload'));
  const supplies = useLiveQuery(() => db.supplies.toArray());
  const members = useLiveQuery(() => db.members.toArray());
  const checklist = useLiveQuery(() => db.checklistItems.toArray());
  const messages = useLiveQuery(() => db.messages.toArray());
  const activities = useLiveQuery(() => db.activityLog.orderBy('timestamp').reverse().limit(10).toArray());
  const activeAlerts = useLiveQuery(() =>
    db.cachedAlerts.filter((a) => (a.severity ?? 0) >= 2 && (!a.expiresAt || a.expiresAt > Date.now())).toArray()
  );
  const latestHealthScore = useLiveQuery(() => db.healthScores.orderBy('timestamp').reverse().first());
  const activePatterns = useLiveQuery(async () => {
    const patterns = await db.threatPatterns.filter((p) => !p.resolvedAt).toArray();
    return patterns;
  });

  const currentThreat = (threatLevel?.value as number) ?? 0;
  const threat = THREAT_LEVELS[currentThreat];
  const isLeader = userRole?.value === 'Leader';

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

  // Computed intelligence
  const expiringItems = useMemo(() => {
    return (supplies ?? [])
      .map((s) => ({ name: s.name, days: daysUntilExpiry(s.expirationDate) }))
      .filter((s) => s.days !== null && s.days >= 0 && s.days <= 7)
      .sort((a, b) => a.days! - b.days!);
  }, [supplies]);

  const burnRate = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const supplyActivities = (activities ?? []).filter(
      (a) => ['supply_deleted', 'supply_updated'].includes(a.type) && a.timestamp > thirtyDaysAgo
    );
    const weeks = Math.max(1, (Date.now() - thirtyDaysAgo) / (7 * 86400000));
    return Math.round((supplyActivities.length / weeks) * 10) / 10;
  }, [activities]);

  const overdueCount = useMemo(() => {
    return (members ?? []).filter((m) => {
      if (!m.lastCheckIn) return memberCount > 0;
      return Date.now() - m.lastCheckIn > 12 * 3600000;
    }).length;
  }, [members, memberCount]);

  const recentMessages = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    return (messages ?? []).filter((m) => m.timestamp > dayAgo).length;
  }, [messages]);

  const membersWithGps = useMemo(() => {
    return (members ?? []).filter((m) => m.lastLat != null && m.lastLng != null);
  }, [members]);

  const preparednessScore = useMemo(() => {
    const supplyCats = new Set((supplies ?? []).map((s) => s.category));
    const targetCats = ['Water', 'Food', 'Medical', 'Equipment', 'Communication'];
    const supplyCoverage = targetCats.filter((c) => supplyCats.has(c)).length / targetCats.length;

    const checklistScore = checklistTotal > 0 ? checklistDone / checklistTotal : 0;

    const checkinScores = (members ?? []).map((m) => {
      if (!m.lastCheckIn) return 0;
      const hoursAgo = (Date.now() - m.lastCheckIn) / 3600000;
      if (hoursAgo <= 1) return 1;
      if (hoursAgo >= 24) return 0;
      return 1 - (hoursAgo - 1) / 23;
    });
    const checkinFreshness = checkinScores.length > 0
      ? checkinScores.reduce((a, b) => a + b, 0) / checkinScores.length : 0;

    const offlineScore = lastMapDownload?.value ? 1 : 0;

    return Math.round(supplyCoverage * 30 + checklistScore * 25 + checkinFreshness * 25 + offlineScore * 20);
  }, [supplies, checklistTotal, checklistDone, members, lastMapDownload]);

  const scoreBreakdown = useMemo(() => {
    const supplyCats = new Set((supplies ?? []).map((s) => s.category));
    const targetCats = ['Water', 'Food', 'Medical', 'Equipment', 'Communication'];
    return {
      supply: Math.round((targetCats.filter((c) => supplyCats.has(c)).length / targetCats.length) * 100),
      checklist: prepPct,
      checkins: memberCount > 0 ? Math.round((checkedInCount / memberCount) * 100) : 0,
      offline: lastMapDownload?.value ? 100 : 0,
    };
  }, [supplies, prepPct, memberCount, checkedInCount, lastMapDownload]);

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

        {/* Active Alerts Banner */}
        {activeAlerts && activeAlerts.length > 0 ? (
          <button
            onClick={() => onNavigate('intel')}
            className="w-full p-3 rounded-xl border-2 border-danger/30 bg-danger/10 flex items-center gap-3 text-left"
          >
            <AlertTriangle size={20} className="text-danger shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-danger">
                {t('active_alerts', { count: String(activeAlerts.length) })}
              </div>
              <div className="text-xs text-danger/80 truncate">
                {activeAlerts[0].description}
              </div>
            </div>
          </button>
        ) : (
          <div className="w-full p-3 rounded-xl border border-success/30 bg-success/10 flex items-center gap-3">
            <Shield size={20} className="text-success shrink-0" />
            <span className="text-sm font-medium text-success">{t('no_active_alerts')}</span>
          </div>
        )}

        {/* Notification Permission Card */}
        {notifPermission === 'default' && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-foreground">{t('enable_notifications')}</h4>
            <p className="text-xs text-muted-foreground mt-1">{t('enable_notifications_desc')}</p>
            <Button size="sm" className="mt-2" onClick={async () => {
              const result = await Notification.requestPermission();
              setNotifPermission(result);
            }}>
              {t('enable')}
            </Button>
          </div>
        )}

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

        {/* Preparedness Score + Supply Stats */}
        <div className="grid grid-cols-2 gap-3">
          {/* Score Ring */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center">
            <ScoreRing score={preparednessScore} />
            <div className="text-xs font-semibold text-foreground mt-1">{t('preparedness_score')}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 w-full">
              {[
                { label: t('score_supply'), value: scoreBreakdown.supply },
                { label: t('score_checklist'), value: scoreBreakdown.checklist },
                { label: t('score_checkins'), value: scoreBreakdown.checkins },
                { label: t('score_offline'), value: scoreBreakdown.offline },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${item.value}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground w-8 text-right">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Supply Intelligence */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <button onClick={() => onNavigate('supplies')} className="w-full text-left">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag size={16} className="text-primary" />
                <span className="text-xs font-semibold text-foreground">{t('food_supply')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xl font-bold font-mono-data text-foreground">{foodDays === 999 ? '—' : foodDays}</div>
                  <div className="text-[10px] text-muted-foreground">{t('days_remaining')}</div>
                </div>
                <div>
                  <div className="text-xl font-bold font-mono-data text-foreground">{waterDays}</div>
                  <div className="text-[10px] text-muted-foreground">{t('water_supply')}</div>
                </div>
              </div>
            </button>
            {expiringItems.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="text-[10px] font-semibold text-warning uppercase mb-1">{t('expiring_soon_items')}</div>
                {expiringItems.slice(0, 3).map((item, i) => (
                  <div key={i} className={`text-[10px] ${item.days! <= 3 ? 'text-danger' : 'text-warning'}`}>
                    {t('expires_in_days', { name: item.name, days: String(item.days) })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Democratic Health Index */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full">
                <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
                <circle cx="60" cy="60" r="54" fill="none"
                  stroke={!latestHealthScore || latestHealthScore.overall === 0 ? '#16A34A' : latestHealthScore.overall <= 30 ? '#22C55E' : latestHealthScore.overall <= 60 ? '#EAB308' : '#EF4444'}
                  strokeWidth="8"
                  strokeDasharray={`${((latestHealthScore?.overall ?? 0) / 100) * 2 * Math.PI * 54} ${2 * Math.PI * 54}`}
                  strokeLinecap="round" transform="rotate(-90 60 60)" />
                <text x="60" y="60" textAnchor="middle" dy="0.35em" className="fill-foreground" style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {latestHealthScore?.overall ?? 0}
                </text>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-foreground">{t('democratic_health')}</div>
              {latestHealthScore ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-xs ${latestHealthScore.trend === 'deteriorating' ? 'text-danger' : latestHealthScore.trend === 'improving' ? 'text-success' : 'text-muted-foreground'}`}>
                    {latestHealthScore.trend === 'deteriorating' ? '↑' : latestHealthScore.trend === 'improving' ? '↓' : '→'}
                    {' '}{t(`threat_trend_${latestHealthScore.trend}`)}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-success mt-1">{t('no_threat_indicators')}</div>
              )}
              {(activePatterns ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(activePatterns ?? []).map((p) => (
                    <span key={p.id} className="text-[9px] px-1.5 py-0.5 rounded bg-danger/10 text-danger font-medium">
                      {t(`pattern_${p.pattern.toLowerCase()}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Group Status */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">{t('group_status')}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare size={12} />
                {t('messages_last_24h', { count: String(recentMessages) })}
              </span>
              {overdueCount > 0 && (
                <span className="text-danger font-semibold">
                  {t('overdue_checkins', { count: String(overdueCount) })}
                </span>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Member list */}
            {memberCount > 0 ? (
              <div className="divide-y divide-border">
                {(members ?? []).map((m) => (
                  <button key={m.id} onClick={() => onNavigate('group')} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-accent/30">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: nameToColor(m.name) }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">{m.role}</div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${checkinColor(m.lastCheckIn)}`}>
                      <Clock size={12} />
                      <span className="font-mono-data">
                        {m.lastCheckIn ? timeAgo(m.lastCheckIn, language) : '—'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center">
                <button onClick={() => onNavigate('group')} className="text-sm text-muted-foreground hover:text-primary">
                  {t('no_members')}
                </button>
              </div>
            )}

            {/* Mini member map */}
            {membersWithGps.length > 0 && (
              <div className="h-[200px] border-t border-border">
                <MapContainer
                  center={[membersWithGps[0].lastLat!, membersWithGps[0].lastLng!]}
                  zoom={12}
                  className="h-full w-full"
                  zoomControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  attributionControl={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {membersWithGps.map((m) => (
                    <Marker key={m.id} position={[m.lastLat!, m.lastLng!]} icon={memberDotIcon(nameToColor(m.name))} />
                  ))}
                </MapContainer>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onNavigate('group')} className="bg-card border border-border rounded-xl p-3 text-center hover:bg-accent/50 transition-colors">
            <Users size={18} className="text-success mx-auto mb-1" />
            <div className="text-lg font-bold font-mono-data text-foreground">
              <span className="text-success">{checkedInCount}</span>
              <span className="text-muted-foreground text-sm">/{memberCount}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">{t('members_checked_in')}</div>
          </button>
          <button onClick={() => onNavigate('settings')} className="bg-card border border-border rounded-xl p-3 text-center hover:bg-accent/50 transition-colors">
            <CheckCircle size={18} className="text-primary mx-auto mb-1" />
            <div className="text-lg font-bold font-mono-data text-foreground">{prepPct}%</div>
            <div className="text-[10px] text-muted-foreground">{t('prep_progress')}</div>
          </button>
          <button onClick={() => onNavigate('supplies')} className="bg-card border border-border rounded-xl p-3 text-center hover:bg-accent/50 transition-colors">
            <Droplets size={18} className="text-primary mx-auto mb-1" />
            <div className="text-lg font-bold font-mono-data text-foreground">{burnRate}</div>
            <div className="text-[10px] text-muted-foreground">{t('supply_burn_rate')}</div>
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
