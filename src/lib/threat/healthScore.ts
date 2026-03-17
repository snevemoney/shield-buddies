import { db } from '@/lib/db';

const DAY = 86400000;

export async function computeHealthScore(): Promise<{ score: number; trend: 'improving' | 'stable' | 'deteriorating' }> {
  const now = Date.now();

  // Get all indicators from last 60 days
  const indicators = await db.threatIndicators
    .where('timestamp')
    .above(now - 60 * DAY)
    .toArray();

  // Get active patterns
  const patterns = await db.threatPatterns.filter((p) => !p.resolvedAt).toArray();

  // Compute score with decay
  let subtotal = 0;
  for (const ind of indicators) {
    const daysSince = (now - ind.timestamp) / DAY;
    const decay = Math.max(0, 1 - ind.decayRate * daysSince);
    subtotal += ind.severity * ind.weight * 10 * decay;
  }

  // Pattern multiplier
  if (patterns.length > 0) {
    subtotal *= Math.pow(1.3, patterns.length);
  }

  const score = Math.round(Math.min(100, Math.max(0, subtotal)));

  // Compute trend: compare to 7 days ago
  const weekAgoScore = await db.healthScores
    .where('timestamp')
    .between(now - 8 * DAY, now - 6 * DAY)
    .first();

  let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
  if (weekAgoScore) {
    const diff = score - weekAgoScore.overall;
    if (diff >= 5) trend = 'deteriorating';
    else if (diff <= -5) trend = 'improving';
  }

  // Save
  await db.healthScores.add({ timestamp: now, overall: score, trend });

  return { score, trend };
}
