import React from 'react';
import { useTranslation } from '@/lib/i18nContext';
import { POI_CATEGORIES, POI_COLORS, type POICategory } from './POILayer';

interface POIToggleBarProps {
  visibleCategories: Set<POICategory>;
  onToggle: (category: POICategory) => void;
  poisEnabled: boolean;
  onToggleAll: () => void;
}

export const POIToggleBar: React.FC<POIToggleBarProps> = ({
  visibleCategories,
  onToggle,
  poisEnabled,
  onToggleAll,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
      {/* Master toggle */}
      <button
        onClick={onToggleAll}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
          poisEnabled
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground bg-card'
        }`}
      >
        {poisEnabled ? t('poi_hide_pois') : t('poi_show_pois')}
      </button>

      {poisEnabled &&
        POI_CATEGORIES.map((cat) => {
          const active = visibleCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => onToggle(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                active
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground bg-card'
              }`}
              style={active ? { backgroundColor: POI_COLORS[cat] } : {}}
            >
              {t(`poi_${cat}`)}
            </button>
          );
        })}
    </div>
  );
};
