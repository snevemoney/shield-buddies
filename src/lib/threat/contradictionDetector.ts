import { db } from '@/lib/db';

const HOUR = 3600000;
const DEDUP_WINDOW = 4 * HOUR; // Don't fire same contradiction type within 4 hours

async function contradictionExists(type: string): Promise<boolean> {
  const recent = await db.contradictionAlerts
    .where('type')
    .equals(type)
    .filter((c) => Date.now() - c.createdAt < DEDUP_WINDOW)
    .first();
  return !!recent;
}

async function addContradiction(type: string, severity: number, description: string, descriptionFr: string) {
  if (await contradictionExists(type)) return;
  await db.contradictionAlerts.add({ type, severity, description, descriptionFr, createdAt: Date.now() });
}

export async function detectContradictions(): Promise<void> {
  // CD-001: No NAAD alerts for QC in 2h BUT Hydro shows >10K customers affected
  const twoHoursAgo = Date.now() - 2 * HOUR;
  const recentNaadAlerts = await db.cachedAlerts
    .where('source')
    .equals('naad')
    .filter((a) => a.cachedAt > twoHoursAgo)
    .count();

  const hydroAlerts = await db.cachedAlerts
    .where('source')
    .equals('hydro')
    .filter((a) => a.cachedAt > twoHoursAgo)
    .toArray();

  const totalHydroCustomers = hydroAlerts.reduce((sum, a) => {
    try {
      const match = a.description.match(/(\d[\d,]+)\s*customers/);
      return sum + (match ? parseInt(match[1].replace(',', '')) : 0);
    } catch { return sum; }
  }, 0);

  if (recentNaadAlerts === 0 && totalHydroCustomers > 10000) {
    await addContradiction(
      'narrative_data_mismatch',
      3,
      `No emergency alerts issued but ${totalHydroCustomers.toLocaleString()} customers without power`,
      `Aucune alerte d'urgence émise mais ${totalHydroCustomers.toLocaleString()} clients sans électricité`
    );
  }

  // CD-003: 3+ feeds unreachable simultaneously
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
  if (unreachableCount >= 3) {
    await addContradiction(
      'absence_anomaly',
      2,
      `${unreachableCount} of ${feedHealthKeys.length} data feeds are unreachable simultaneously`,
      `${unreachableCount} des ${feedHealthKeys.length} flux de données sont inaccessibles simultanément`
    );
  }

  // CD-005: Earthquake >3.0M within 100km but no NAAD alert (STUBBED — no earthquake feed yet)
  // TODO: Activate when USGS/NRCan earthquake feed is integrated

  // CD-007: RSS emergency keywords in last 2h but no NAAD alert
  const recentRssNews = await db.cachedAlerts
    .where('source')
    .equals('rss')
    .filter((a) => a.cachedAt > twoHoursAgo && (a.severity ?? 0) >= 2)
    .count();

  if (recentRssNews > 0 && recentNaadAlerts === 0) {
    await addContradiction(
      'absence_anomaly',
      1,
      'News sources report emergency-level events but no official NAAD alert has been issued',
      'Les sources d\'information signalent des événements d\'urgence mais aucune alerte NAAD officielle n\'a été émise'
    );
  }

  // CD-002: ECCC severe weather but no NAAD (STUBBED — ECCC feed not yet integrated)
  // TODO: Activate when ECCC weather feed is integrated

  // CD-004: SOPFEU fires near populated area but no evacuation (STUBBED)
  // TODO: Activate when SOPFEU feed is integrated

  // CD-006: Road closures forming perimeter (STUBBED)
  // TODO: Activate when Quebec 511 feed is integrated
}
