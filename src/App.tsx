import React, { useState, useEffect } from 'react';
import { LanguageProvider } from '@/lib/i18nContext';
import { ThemeProvider } from '@/lib/themeContext';
import { seedDatabase } from '@/lib/seed';
import { feedManager } from '@/lib/feeds/feedManager';
import { registerAllFeeds } from '@/lib/feeds/registerFeeds';
import { startDeadManSwitch } from '@/lib/deadManSwitch';
import { AppShell } from '@/components/AppShell';
import { HomeTab } from '@/components/tabs/HomeTab';
import { SuppliesTab } from '@/components/tabs/SuppliesTab';
import { GroupTab } from '@/components/tabs/GroupTab';
import { MapTab } from '@/components/tabs/MapTab';
import { IntelTab } from '@/components/tabs/IntelTab';
import { DroneTab } from '@/components/tabs/DroneTab';
import { VaultTab } from '@/components/tabs/VaultTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import { Toaster as Sonner } from "@/components/ui/sonner";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    seedDatabase();
    registerAllFeeds();
    feedManager.startPolling();
    const stopDMS = startDeadManSwitch();
    return () => {
      feedManager.stopPolling();
      stopDMS();
    };
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onNavigate={setActiveTab} />;
      case 'supplies': return <SuppliesTab />;
      case 'group': return <GroupTab />;
      case 'map': return <MapTab />;
      case 'intel': return <IntelTab />;
      case 'drone': return <DroneTab />;
      case 'vault': return <VaultTab />;
      case 'settings': return <SettingsTab />;
      default: return <HomeTab onNavigate={setActiveTab} />;
    }
  };

  return (
    <ThemeProvider>
      <LanguageProvider>
        <Sonner />
        <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
          {renderTab()}
        </AppShell>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
