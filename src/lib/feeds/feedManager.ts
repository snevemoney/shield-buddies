import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { OsintEvent, FeedAdapter, FeedHealth } from './types';
import { SEVERITY_LABELS } from './types';
import { processOsintEvents } from '@/lib/threat/indicatorExtractor';
import { detectPatterns } from '@/lib/threat/patternEngine';
import { computeHealthScore } from '@/lib/threat/healthScore';
import { detectContradictions } from '@/lib/threat/contradictionDetector';

class FeedManager {
  private adapters = new Map<string, FeedAdapter>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();

  registerAdapter(adapter: FeedAdapter): void {
    this.adapters.set(adapter.feedId, adapter);
  }

  startPolling(): void {
    for (const [feedId, adapter] of this.adapters) {
      if (this.intervals.has(feedId)) continue;

      // Poll immediately on start
      this.pollFeed(adapter);

      // Then poll on interval
      const interval = setInterval(() => {
        this.pollFeed(adapter);
      }, adapter.pollIntervalMs);

      this.intervals.set(feedId, interval);
    }
  }

  get adapterCount(): number {
    return this.adapters.size;
  }

  async pollAllFeeds(): Promise<void> {
    const promises = Array.from(this.adapters.values()).map((a) => this.pollFeed(a));
    await Promise.allSettled(promises);
  }

  stopPolling(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  async pollFeed(adapter: FeedAdapter): Promise<void> {
    if (!navigator.onLine) return;

    const startMs = performance.now();
    const health = await this.getHealth(adapter.feedId);
    health.lastAttemptedPoll = Date.now();

    try {
      const events = await adapter.fetch();
      const elapsedMs = performance.now() - startMs;

      // Store events as CachedAlerts
      for (const event of events) {
        const exists = await this.isDuplicate(event);
        if (!exists) {
          await db.cachedAlerts.add({
            level: SEVERITY_LABELS[event.severity] ?? 'Info',
            region: event.region ?? 'Unknown',
            description: event.description,
            issuedAt: event.timestamp,
            cachedAt: Date.now(),
            source: event.source,
            normalizedType: event.normalizedType,
            severity: event.severity,
            lat: event.lat,
            lng: event.lng,
            expiresAt: event.expiresAt,
            rawData: event.rawData,
          });
        }
      }

      // Run threat intelligence pipeline
      try {
        await processOsintEvents(events);
        await detectPatterns();
        await computeHealthScore();
        await detectContradictions();
      } catch { /* threat pipeline failure shouldn't break feed polling */ }

      // Update health
      health.lastSuccessfulPoll = Date.now();
      health.consecutiveFailures = 0;
      health.averageResponseMs = health.averageResponseMs
        ? Math.round((health.averageResponseMs + elapsedMs) / 2)
        : Math.round(elapsedMs);
      health.status = 'healthy';
    } catch {
      health.consecutiveFailures++;
      health.status = health.consecutiveFailures >= 3 ? 'unreachable' : 'degraded';
    }

    await this.saveHealth(health);
  }

  private async isDuplicate(event: OsintEvent): Promise<boolean> {
    const existing = await db.cachedAlerts
      .where('source')
      .equals(event.source)
      .filter(
        (a) => a.issuedAt === event.timestamp && a.description === event.description
      )
      .first();
    return !!existing;
  }

  private async getHealth(feedId: string): Promise<FeedHealth> {
    const setting = await db.settings.get(`feedHealth:${feedId}`);
    if (setting?.value && typeof setting.value === 'string') {
      try {
        return JSON.parse(setting.value) as FeedHealth;
      } catch { /* fall through */ }
    }
    return {
      feedId,
      lastSuccessfulPoll: null,
      lastAttemptedPoll: null,
      consecutiveFailures: 0,
      averageResponseMs: 0,
      status: 'healthy',
    };
  }

  private async saveHealth(health: FeedHealth): Promise<void> {
    await db.settings.put({
      key: `feedHealth:${health.feedId}`,
      value: JSON.stringify(health),
    });
  }
}

export const feedManager = new FeedManager();

export function useFeedHealth(feedId: string): FeedHealth | undefined {
  const setting = useLiveQuery(() => db.settings.get(`feedHealth:${feedId}`));
  if (!setting?.value || typeof setting.value !== 'string') return undefined;
  try {
    return JSON.parse(setting.value) as FeedHealth;
  } catch {
    return undefined;
  }
}
