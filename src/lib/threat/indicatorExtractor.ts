import { db } from '@/lib/db';
import type { OsintEvent } from '@/lib/feeds/types';
import { INDICATOR_CATEGORIES } from './keywords';

const DEDUP_WINDOW = 86400000; // 24 hours

export async function processOsintEvents(events: OsintEvent[]): Promise<void> {
  for (const event of events) {
    const text = `${event.title} ${event.description}`.toLowerCase();
    const matchedCategories: { id: string; weight: number; count: number }[] = [];

    for (const cat of INDICATOR_CATEGORIES) {
      const hits = cat.keywords.filter((kw) => text.includes(kw.toLowerCase()));
      if (hits.length > 0) {
        matchedCategories.push({ id: cat.id, weight: cat.weight, count: hits.length });
      }
    }

    if (matchedCategories.length === 0) continue;

    for (const match of matchedCategories) {
      // Dedup: skip if same category + source within 24h
      const recent = await db.threatIndicators
        .where('category')
        .equals(match.id)
        .filter((i) => i.source === event.source && Date.now() - i.timestamp < DEDUP_WINDOW)
        .first();
      if (recent) continue;

      // Severity: 1 match = 1, 2+ same-cat = 2, multi-cat = 3
      let severity = 1;
      if (match.count >= 2) severity = 2;
      if (matchedCategories.length >= 2) severity = 3;

      await db.threatIndicators.add({
        category: match.id,
        severity,
        timestamp: Date.now(),
        source: event.source,
        weight: match.weight,
        decayRate: 0.05,
      });
    }
  }
}
