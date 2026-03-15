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
  }
}

export const db = new SentinelDB();
