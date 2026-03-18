import Dexie, { type Table } from 'dexie';

export interface Supply {
  id?: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expirationDate?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Member {
  id?: number;
  name: string;
  role: 'Leader' | 'Member' | 'Medic' | 'Scout' | 'Driver';
  lastCheckIn?: number;
  lastLat?: number;
  lastLng?: number;
  createdAt: number;
}

export interface Message {
  id?: number;
  senderName: string;
  text: string;
  priority: 'Normal' | 'Important' | 'SOS';
  timestamp: number;
}

export interface Checkin {
  id?: number;
  memberId: number;
  timestamp: number;
  lat?: number;
  lng?: number;
}

export interface SavedLocation {
  id?: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  notes?: string;
  createdAt: number;
}

export interface Activity {
  id?: number;
  type: string;
  description: string;
  descriptionFr: string;
  timestamp: number;
}

export interface IntelEntry {
  id?: number;
  headline: string;
  source: string;
  url?: string;
  category: string;
  notes?: string;
  timestamp: number;
}

export interface CachedAlert {
  id?: number;
  level: string;
  region: string;
  description: string;
  issuedAt: number;
  cachedAt: number;
}

export interface Detection {
  id?: number;
  timestamp: number;
  confidence: 'Low' | 'Medium' | 'High';
  classification: 'Drone' | 'Aircraft' | 'Vehicle' | 'Unknown';
  durationSeconds: number;
  lat?: number;
  lng?: number;
  source: string;
}

export interface CachedPOI {
  id?: number;
  osmId: number;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

export type HazardType = 'flood' | 'fire' | 'industrial' | 'earthquake';
export type HazardSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface HazardZone {
  id?: number;
  name: string;
  type: HazardType;
  geometry: {
    center: [number, number]; // [lat, lng]
    radiusMeters: number;
  };
  severity: HazardSeverity;
  active: boolean;
  createdAt: number;
}

export interface VaultDocument {
  id?: number;
  title: string;
  category: string;
  content: string;
  contentHash: string;
  priority: 'critical' | 'important' | 'reference';
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultDistribution {
  id?: number;
  memberId: number;
  documentId: number;
  lastSyncedAt: number;
}

export interface ThreatIndicator {
  id?: number;
  category: string;
  severity: number;
  timestamp: number;
  source: string;
  weight: number;
  decayRate: number;
}

export interface HealthScore {
  id?: number;
  timestamp: number;
  overall: number;
  trend: 'improving' | 'stable' | 'deteriorating';
}

export interface ThreatPattern {
  id?: number;
  pattern: string;
  detectedAt: number;
  resolvedAt?: number;
}

export interface ContradictionAlert {
  id?: number;
  type: string;
  severity: number;
  description: string;
  descriptionFr: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: any;
}

export interface ChecklistItem {
  id?: number;
  textEn: string;
  textFr: string;
  completed: boolean;
  category: string;
  order: number;
}

export class SentinelDB extends Dexie {
  supplies!: Table<Supply>;
  members!: Table<Member>;
  messages!: Table<Message>;
  checkins!: Table<Checkin>;
  locations!: Table<SavedLocation>;
  activityLog!: Table<Activity>;
  intelEntries!: Table<IntelEntry>;
  cachedAlerts!: Table<CachedAlert>;
  detections!: Table<Detection>;
  settings!: Table<Setting>;
  checklistItems!: Table<ChecklistItem>;
  cachedPOIs!: Table<CachedPOI>;
  hazardZones!: Table<HazardZone>;
  vaultDocuments!: Table<VaultDocument>;
  vaultDistribution!: Table<VaultDistribution>;
  threatIndicators!: Table<ThreatIndicator>;
  healthScores!: Table<HealthScore>;
  threatPatterns!: Table<ThreatPattern>;
  contradictionAlerts!: Table<ContradictionAlert>;

  constructor() {
    super('sentinelDB');
    this.version(1).stores({
      supplies: '++id, name, category, expirationDate, createdAt',
      members: '++id, name, role, lastCheckIn',
      messages: '++id, senderName, priority, timestamp',
      checkins: '++id, memberId, timestamp',
      locations: '++id, name, category, createdAt',
      activityLog: '++id, type, timestamp',
      intelEntries: '++id, category, timestamp',
      cachedAlerts: '++id, level, cachedAt',
      detections: '++id, confidence, classification, timestamp',
      settings: 'key',
      checklistItems: '++id, completed, category, order',
    });
    this.version(2).stores({
      supplies: '++id, name, category, expirationDate, createdAt',
      members: '++id, name, role, lastCheckIn',
      messages: '++id, senderName, priority, timestamp',
      checkins: '++id, memberId, timestamp',
      locations: '++id, name, category, createdAt',
      activityLog: '++id, type, timestamp',
      intelEntries: '++id, category, timestamp',
      cachedAlerts: '++id, level, cachedAt',
      detections: '++id, confidence, classification, timestamp',
      settings: 'key',
      checklistItems: '++id, completed, category, order',
      cachedPOIs: '++id, osmId, category',
    });
    this.version(3).stores({
      supplies: '++id, name, category, expirationDate, createdAt',
      members: '++id, name, role, lastCheckIn',
      messages: '++id, senderName, priority, timestamp',
      checkins: '++id, memberId, timestamp',
      locations: '++id, name, category, createdAt',
      activityLog: '++id, type, timestamp',
      intelEntries: '++id, category, timestamp',
      cachedAlerts: '++id, level, cachedAt',
      detections: '++id, confidence, classification, timestamp',
      settings: 'key',
      checklistItems: '++id, completed, category, order',
      cachedPOIs: '++id, osmId, category',
      hazardZones: '++id, type, severity, active, createdAt',
      vaultDocuments: '++id, title, category, contentHash, priority, updatedAt',
      vaultDistribution: '++id, memberId, documentId, lastSyncedAt',
      threatIndicators: '++id, category, severity, timestamp, source',
      healthScores: '++id, timestamp, overall',
      threatPatterns: '++id, pattern, detectedAt, resolvedAt',
      contradictionAlerts: '++id, type, severity, createdAt',
    });
  }
}

export const db = new SentinelDB();
