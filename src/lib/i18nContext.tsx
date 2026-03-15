import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { db } from './db';
import { translations, type Language } from './i18n';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export const useTranslation = () => useContext(I18nContext);

function detectLanguage(): Language {
  const nav = navigator.language || '';
  return nav.startsWith('fr') ? 'fr' : 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<Language>(detectLanguage());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    db.settings.get('language').then((s) => {
      if (s?.value) setLangState(s.value as Language);
      setLoaded(true);
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLangState(lang);
    db.settings.put({ key: 'language', value: lang });
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let str = translations[language]?.[key] || translations['en']?.[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  }, [language]);

  if (!loaded) return null;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};
