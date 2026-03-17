import type { FeedAdapter, OsintEvent } from './types';
import { fetchWithProxy } from './corsProxy';
import { db } from '@/lib/db';

const RSS_SOURCES = [
  { name: 'CBC News', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories' },
  { name: 'Radio-Canada', url: 'https://ici.radio-canada.ca/rss/4159' },
  { name: 'Global News', url: 'https://globalnews.ca/feed/' },
  { name: 'CCCS Cyber', url: 'https://cyber.gc.ca/webservice/en/rss/alerts' },
];

const KEYWORDS = [
  'emergency', 'urgence', 'military', 'militaire', 'alert', 'alerte',
  'threat', 'menace', 'infrastructure', 'power outage', 'panne',
  'earthquake', 'séisme', 'flood', 'inondation', 'evacuation', 'évacuation',
  'cyber', 'attack', 'attaque', 'protest', 'manifestation', 'martial', 'couvre-feu',
];

const HIGH_SEVERITY_KEYWORDS = ['emergency', 'urgence', 'attack', 'attaque'];

function matchesKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

function getSeverity(title: string): number {
  const lower = title.toLowerCase();
  return HIGH_SEVERITY_KEYWORDS.some((k) => lower.includes(k)) ? 2 : 1;
}

function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() ?? '';
}

async function fetchSingleFeed(source: { name: string; url: string }): Promise<OsintEvent[]> {
  const res = await fetchWithProxy(source.url);
  const text = await res.text();

  // Validate it's XML, not an HTML error page
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const items = doc.querySelectorAll('item');
  const events: OsintEvent[] = [];

  for (const item of items) {
    const title = textContent(item.querySelector('title'));
    const description = stripHtml(textContent(item.querySelector('description')));
    const pubDate = textContent(item.querySelector('pubDate'));
    const link = textContent(item.querySelector('link'));

    if (!title) continue;

    // Keyword filter
    if (!matchesKeywords(title) && !matchesKeywords(description)) continue;

    const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();
    if (isNaN(timestamp)) continue;

    events.push({
      source: 'rss',
      normalizedType: 'news',
      severity: getSeverity(title),
      title,
      description: description || title,
      timestamp,
      url: link || undefined,
      rawData: JSON.stringify({ feedName: source.name }),
    });
  }

  return events;
}

export const rssAdapter: FeedAdapter = {
  feedId: 'rss',
  pollIntervalMs: 900000,

  async fetch(): Promise<OsintEvent[]> {
    // Fetch existing RSS entries for dedup
    const existingRss = await db.cachedAlerts
      .where('source').equals('rss')
      .toArray();
    const existingTitleSets = existingRss.map((a) => ({
      words: wordSet(a.description),
    }));

    const allEvents: OsintEvent[] = [];

    // Fetch each feed independently — don't let one failure block others
    const results = await Promise.allSettled(
      RSS_SOURCES.map((source) => fetchSingleFeed(source))
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const event of result.value) {
        // Dedup: check Jaccard similarity against existing titles
        const eventWords = wordSet(event.title);
        const isDuplicate = existingTitleSets.some(
          (existing) => jaccardSimilarity(eventWords, existing.words) > 0.7
        );
        if (!isDuplicate) {
          allEvents.push(event);
          // Add to existing set for cross-feed dedup within this poll
          existingTitleSets.push({ words: eventWords });
        }
      }
    }

    return allEvents;
  },
};
