export interface OsintEvent {
  id?: number;
  source: string;
  normalizedType: string;
  severity: number;
  title: string;
  description: string;
  region?: string;
  lat?: number;
  lng?: number;
  timestamp: number;
  expiresAt?: number;
  url?: string;
  rawData?: string;
}

export interface FeedHealth {
  feedId: string;
  lastSuccessfulPoll: number | null;
  lastAttemptedPoll: number | null;
  consecutiveFailures: number;
  averageResponseMs: number;
  status: 'healthy' | 'degraded' | 'unreachable';
}

export interface FeedAdapter {
  feedId: string;
  pollIntervalMs: number;
  fetch(): Promise<OsintEvent[]>;
}

export const SEVERITY_LABELS = ['Info', 'Minor', 'Moderate', 'Severe', 'Extreme'] as const;
