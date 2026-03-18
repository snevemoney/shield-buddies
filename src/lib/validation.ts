import { z } from 'zod';

// ---------- Individual record schemas ----------

export const SupplySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().min(1),
  expirationDate: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const MemberSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  role: z.enum(['Leader', 'Member', 'Medic', 'Scout', 'Driver']),
  lastCheckIn: z.number().optional(),
  lastLat: z.number().optional(),
  lastLng: z.number().optional(),
  createdAt: z.number(),
});

export const MessageSchema = z.object({
  id: z.number().optional(),
  senderName: z.string().min(1),
  text: z.string().min(1),
  priority: z.enum(['Normal', 'Important', 'SOS']),
  timestamp: z.number(),
});

export const CheckinSchema = z.object({
  id: z.number().optional(),
  memberId: z.number(),
  timestamp: z.number(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const SavedLocationSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  notes: z.string().optional(),
  createdAt: z.number(),
});

export const ActivitySchema = z.object({
  id: z.number().optional(),
  type: z.string().min(1),
  description: z.string(),
  descriptionFr: z.string(),
  timestamp: z.number(),
});

export const IntelEntrySchema = z.object({
  id: z.number().optional(),
  headline: z.string().min(1),
  source: z.string(),
  url: z.string().optional(),
  category: z.string().min(1),
  notes: z.string().optional(),
  timestamp: z.number(),
});

export const CachedAlertSchema = z.object({
  id: z.number().optional(),
  level: z.string().min(1),
  region: z.string(),
  description: z.string(),
  issuedAt: z.number(),
  cachedAt: z.number(),
});

export const DetectionSchema = z.object({
  id: z.number().optional(),
  timestamp: z.number(),
  confidence: z.enum(['Low', 'Medium', 'High']),
  classification: z.enum(['Drone', 'Aircraft', 'Vehicle', 'Unknown']),
  durationSeconds: z.number(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  source: z.string(),
});

export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

export const ChecklistItemSchema = z.object({
  id: z.number().optional(),
  textEn: z.string(),
  textFr: z.string(),
  completed: z.boolean(),
  category: z.string().min(1),
  order: z.number(),
});

// ---------- Full backup schema ----------

export const BackupSchema = z.object({
  supplies: z.array(SupplySchema).optional().default([]),
  members: z.array(MemberSchema).optional().default([]),
  messages: z.array(MessageSchema).optional().default([]),
  checkins: z.array(CheckinSchema).optional().default([]),
  locations: z.array(SavedLocationSchema).optional().default([]),
  activityLog: z.array(ActivitySchema).optional().default([]),
  intelEntries: z.array(IntelEntrySchema).optional().default([]),
  cachedAlerts: z.array(CachedAlertSchema).optional().default([]),
  detections: z.array(DetectionSchema).optional().default([]),
  settings: z.array(SettingSchema).optional().default([]),
  checklistItems: z.array(ChecklistItemSchema).optional().default([]),
});

export type BackupData = z.infer<typeof BackupSchema>;

/**
 * Validate and parse imported JSON data against the backup schema.
 * Returns the parsed data on success, or throws a descriptive error.
 */
export function validateBackupData(raw: unknown): BackupData {
  return BackupSchema.parse(raw);
}

// ---------- URL validation ----------

const SAFE_URL_REGEX = /^https?:\/\//i;

/**
 * Returns true if the URL starts with http:// or https://.
 * Returns false for javascript:, data:, vbscript:, or any other scheme.
 */
export function isValidUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return SAFE_URL_REGEX.test(url.trim());
}

/**
 * Sanitize a user-provided string for safe rendering.
 * Strips HTML tags and trims the result.
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return '';
  // Strip any HTML tags
  return input.replace(/<[^>]*>/g, '').trim();
}
