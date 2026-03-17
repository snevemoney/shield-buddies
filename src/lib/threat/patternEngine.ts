import { db } from '@/lib/db';

const DAY = 86400000;

async function getActiveIndicators(categories: string[], windowDays: number) {
  const cutoff = Date.now() - windowDays * DAY;
  return db.threatIndicators
    .where('timestamp')
    .above(cutoff)
    .filter((i) => categories.includes(i.category))
    .toArray();
}

async function patternExists(pattern: string): Promise<boolean> {
  const existing = await db.threatPatterns
    .where('pattern')
    .equals(pattern)
    .filter((p) => !p.resolvedAt)
    .first();
  return !!existing;
}

async function addPattern(pattern: string) {
  if (await patternExists(pattern)) return;
  await db.threatPatterns.add({ pattern, detectedAt: Date.now() });
}

export async function detectPatterns(): Promise<void> {
  // MEDIA_CAPTURE: 2+ media_capture indicators within 30 days
  const mediaIndicators = await getActiveIndicators(['media_capture'], 30);
  if (mediaIndicators.length >= 2) await addPattern('MEDIA_CAPTURE');

  // OPPOSITION_CRACKDOWN: opposition_suppression + judicial_capture within 14 days
  const oppIndicators = await getActiveIndicators(['opposition_suppression'], 14);
  const judIndicators = await getActiveIndicators(['judicial_capture'], 14);
  if (oppIndicators.length > 0 && judIndicators.length > 0) await addPattern('OPPOSITION_CRACKDOWN');

  // SECURITY_CONSOLIDATION: military_loyalty + security_personalization within 30 days
  const milIndicators = await getActiveIndicators(['military_loyalty'], 30);
  const secIndicators = await getActiveIndicators(['security_personalization'], 30);
  if (milIndicators.length > 0 && secIndicators.length > 0) await addPattern('SECURITY_CONSOLIDATION');

  // COMMUNICATION_DISRUPTION: 3+ feeds unreachable
  const feedHealthKeys = ['feedHealth:naad', 'feedHealth:hydro', 'feedHealth:opensky', 'feedHealth:rss'];
  let unreachableCount = 0;
  for (const key of feedHealthKeys) {
    const s = await db.settings.get(key);
    if (s?.value && typeof s.value === 'string') {
      try {
        const health = JSON.parse(s.value);
        if (health.status === 'unreachable') unreachableCount++;
      } catch { /* ignore */ }
    }
  }
  if (unreachableCount >= 3) await addPattern('COMMUNICATION_DISRUPTION');

  // AUTHORITARIANIZATION: 3+ of judicial/election/media within 60 days
  const authCategories = ['judicial_capture', 'election_manipulation', 'media_capture'];
  const authIndicators = await getActiveIndicators(authCategories, 60);
  const uniqueAuthCats = new Set(authIndicators.map((i) => i.category));
  if (uniqueAuthCats.size >= 3) await addPattern('AUTHORITARIANIZATION');

  // Resolve patterns whose indicators have all expired
  const activePatterns = await db.threatPatterns.filter((p) => !p.resolvedAt).toArray();
  for (const p of activePatterns) {
    const relatedCats = getPatternCategories(p.pattern);
    const stillActive = await getActiveIndicators(relatedCats, 60);
    if (stillActive.length === 0 && p.id) {
      await db.threatPatterns.update(p.id, { resolvedAt: Date.now() });
    }
  }
}

function getPatternCategories(pattern: string): string[] {
  switch (pattern) {
    case 'MEDIA_CAPTURE': return ['media_capture'];
    case 'OPPOSITION_CRACKDOWN': return ['opposition_suppression', 'judicial_capture'];
    case 'SECURITY_CONSOLIDATION': return ['military_loyalty', 'security_personalization'];
    case 'COMMUNICATION_DISRUPTION': return [];
    case 'AUTHORITARIANIZATION': return ['judicial_capture', 'election_manipulation', 'media_capture'];
    default: return [];
  }
}
