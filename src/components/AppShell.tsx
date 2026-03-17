import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, ShoppingBag, Users, MapPin, Radio, Radar, Settings, MoreHorizontal, AlertTriangle, Shield, BookOpen } from 'lucide-react';
import { useTranslation } from '@/lib/i18nContext';
import { cn, getCurrentPosition, logActivity } from '@/lib/utils';
import { useCurrentUserOverdue } from '@/lib/deadManSwitch';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const tabs = [
  { id: 'home', icon: Home, labelKey: 'nav_home' },
  { id: 'supplies', icon: ShoppingBag, labelKey: 'nav_supplies' },
  { id: 'group', icon: Users, labelKey: 'nav_group' },
  { id: 'map', icon: MapPin, labelKey: 'nav_map' },
  { id: 'intel', icon: Radio, labelKey: 'nav_intel' },
  { id: 'drone', icon: Radar, labelKey: 'nav_drone' },
  { id: 'vault', icon: BookOpen, labelKey: 'nav_vault' },
  { id: 'settings', icon: Settings, labelKey: 'nav_settings' },
];

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onTabChange, children }) => {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const currentUserOverdue = useCurrentUserOverdue();

  const handleQuickCheckIn = async () => {
    const userNameSetting = await db.settings.get('userName');
    const userName = userNameSetting?.value as string;
    if (!userName) return;
    const member = await db.members.where('name').equals(userName).first();
    if (!member?.id) return;
    const pos = await getCurrentPosition();
    await db.members.update(member.id, { lastCheckIn: Date.now(), lastLat: pos.lat, lastLng: pos.lng });
    await db.checkins.add({ memberId: member.id, timestamp: Date.now(), lat: pos.lat, lng: pos.lng });
    await logActivity('check_in', `${userName} checked in`, `${userName} s'est signalé`);
    toast.success(t('check_in'));
  };

  const mobileTabs = tabs.slice(0, 5);
  const moreTabs = tabs.slice(5);

  return (
    <div className="h-screen-safe flex w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card shrink-0">
        <div className="p-6 pb-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">SENTINEL</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('tagline')}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon size={20} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentUserOverdue && (
          <div className="bg-danger text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <AlertTriangle size={20} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">{t('dms_you_overdue')}</span>
            <Button size="sm" variant="secondary" onClick={handleQuickCheckIn} className="shrink-0 gap-1">
              <Shield size={14} /> {t('check_in')}
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom z-50">
        <div className="flex items-center justify-around h-14">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{t(tab.labelKey)}</span>
              </button>
            );
          })}
          {/* More button */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors',
                moreTabs.some((mt) => mt.id === activeTab) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <MoreHorizontal size={22} />
              <span className="text-[10px] font-medium">{t('nav_more')}</span>
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-16 right-0 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[160px]"
                >
                  {moreTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                          active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        <Icon size={18} />
                        <span>{t(tab.labelKey)}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>
    </div>
  );
};
