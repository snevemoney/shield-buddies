import React from 'react';
import { useTranslation } from '@/lib/i18nContext';
import { useTheme } from '@/lib/themeContext';
import { Sun, Moon } from 'lucide-react';

export const AppHeader: React.FC<{ title?: string }> = ({ title }) => {
  const { language, setLanguage } = useTranslation();
  const { isDark, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between px-4 py-3 md:px-6">
      {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
      <div className="flex items-center gap-2 ml-auto">
        {/* Language toggle */}
        <div className="flex items-center bg-secondary rounded-full p-0.5 text-xs font-medium">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              language === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('fr')}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              language === 'fr' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            FR
          </button>
        </div>
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-accent transition-colors text-muted-foreground"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </div>
  );
};
