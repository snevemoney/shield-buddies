import { db } from '@/lib/db';

const MAX_QR_CHARS = 2900;

export interface SyncPayload {
  members: Array<{ name: string; role: string; lastCheckIn?: number; lastLat?: number; lastLng?: number; createdAt: number; checkInInterval?: number }>;
  messages: Array<{ senderName: string; text: string; priority: string; timestamp: number }>;
  locations: Array<{ name: string; category: string; lat: number; lng: number; notes?: string; createdAt: number }>;
  threatLevel: number;
  checkins: Array<{ memberName: string; timestamp: number; lat?: number; lng?: number }>;
}

export interface SyncSummary {
  membersAdded: number;
  membersUpdated: number;
  messagesAdded: number;
  locationsAdded: number;
}

async function compressAndEncode(json: string): Promise<string> {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(json)]).stream();
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressed.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  // Base64 encode
  let binary = '';
  for (const byte of merged) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function decodeAndDecompress(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const stream = new Blob([bytes]).stream();
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
  const reader = decompressed.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function splitChunks(data: string, maxLen: number): string[] {
  if (data.length <= maxLen) return [data];
  const totalChunks = Math.ceil(data.length / (maxLen - 10)); // reserve space for "N/M:" prefix
  const chunkSize = Math.ceil(data.length / totalChunks);
  const chunks: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = data.slice(i * chunkSize, (i + 1) * chunkSize);
    chunks.push(`${i + 1}/${totalChunks}:${slice}`);
  }
  return chunks;
}

function assembleChunks(chunks: string[]): string {
  const parsed = chunks.map((c) => {
    const match = c.match(/^(\d+)\/(\d+):(.+)$/s);
    if (!match) throw new Error('Invalid chunk format');
    return { index: parseInt(match[1]), total: parseInt(match[2]), data: match[3] };
  });
  parsed.sort((a, b) => a.index - b.index);
  const total = parsed[0].total;
  if (parsed.length !== total) throw new Error(`Missing chunks: have ${parsed.length} of ${total}`);
  return parsed.map((p) => p.data).join('');
}

export async function exportGroupData(): Promise<string[]> {
  const members = await db.members.toArray();
  const messages = await db.messages.orderBy('timestamp').reverse().limit(50).toArray();
  const locations = await db.locations.toArray();
  const threatSetting = await db.settings.get('threatLevel');
  const threatLevel = (threatSetting?.value as number) ?? 0;

  // Get most recent checkin per member
  const checkins: SyncPayload['checkins'] = [];
  for (const m of members) {
    if (!m.id) continue;
    const latest = await db.checkins.where('memberId').equals(m.id).reverse().sortBy('timestamp').then((arr) => arr[0]);
    if (latest) {
      checkins.push({ memberName: m.name, timestamp: latest.timestamp, lat: latest.lat, lng: latest.lng });
    }
  }

  const payload: SyncPayload = {
    members: members.map((m) => ({ name: m.name, role: m.role, lastCheckIn: m.lastCheckIn, lastLat: m.lastLat, lastLng: m.lastLng, createdAt: m.createdAt, checkInInterval: m.checkInInterval })),
    messages: messages.map((m) => ({ senderName: m.senderName, text: m.text, priority: m.priority, timestamp: m.timestamp })),
    locations: locations.map((l) => ({ name: l.name, category: l.category, lat: l.lat, lng: l.lng, notes: l.notes, createdAt: l.createdAt })),
    threatLevel,
    checkins,
  };

  const json = JSON.stringify(payload);
  const encoded = await compressAndEncode(json);
  return splitChunks(encoded, MAX_QR_CHARS);
}

export function isMultiPart(data: string): boolean {
  return /^\d+\/\d+:/.test(data);
}

export function parseChunkInfo(data: string): { index: number; total: number } | null {
  const match = data.match(/^(\d+)\/(\d+):/);
  if (!match) return null;
  return { index: parseInt(match[1]), total: parseInt(match[2]) };
}

export async function importGroupData(chunks: string[]): Promise<SyncSummary> {
  let b64: string;
  if (chunks.length === 1 && !isMultiPart(chunks[0])) {
    b64 = chunks[0];
  } else {
    b64 = assembleChunks(chunks);
  }

  const json = await decodeAndDecompress(b64);
  const payload = JSON.parse(json) as SyncPayload;
  const summary: SyncSummary = { membersAdded: 0, membersUpdated: 0, messagesAdded: 0, locationsAdded: 0 };

  // Merge members
  for (const incoming of payload.members) {
    const existing = await db.members.where('name').equals(incoming.name).first();
    if (existing) {
      if ((incoming.lastCheckIn ?? 0) > (existing.lastCheckIn ?? 0)) {
        await db.members.update(existing.id!, {
          lastCheckIn: incoming.lastCheckIn,
          lastLat: incoming.lastLat,
          lastLng: incoming.lastLng,
          checkInInterval: incoming.checkInInterval ?? existing.checkInInterval,
        });
        summary.membersUpdated++;
      }
    } else {
      await db.members.add({
        name: incoming.name,
        role: incoming.role as 'Leader' | 'Member' | 'Medic' | 'Scout' | 'Driver',
        lastCheckIn: incoming.lastCheckIn,
        lastLat: incoming.lastLat,
        lastLng: incoming.lastLng,
        createdAt: incoming.createdAt,
        checkInInterval: incoming.checkInInterval,
      });
      summary.membersAdded++;
    }
  }

  // Merge messages (deduplicate by senderName + timestamp within 1s)
  for (const incoming of payload.messages) {
    const exists = await db.messages
      .where('timestamp')
      .between(incoming.timestamp - 1000, incoming.timestamp + 1000)
      .filter((m) => m.senderName === incoming.senderName)
      .first();
    if (!exists) {
      await db.messages.add({
        senderName: incoming.senderName,
        text: incoming.text,
        priority: incoming.priority as 'Normal' | 'Important' | 'SOS',
        timestamp: incoming.timestamp,
      });
      summary.messagesAdded++;
    }
  }

  // Merge locations
  for (const incoming of payload.locations) {
    const existing = await db.locations.where('name').equals(incoming.name).first();
    if (existing) {
      if (incoming.createdAt > existing.createdAt) {
        await db.locations.update(existing.id!, { lat: incoming.lat, lng: incoming.lng, category: incoming.category, notes: incoming.notes });
        summary.locationsAdded++;
      }
    } else {
      await db.locations.add({ name: incoming.name, category: incoming.category, lat: incoming.lat, lng: incoming.lng, notes: incoming.notes, createdAt: incoming.createdAt });
      summary.locationsAdded++;
    }
  }

  // Threat level: take highest
  const localThreat = await db.settings.get('threatLevel');
  const localVal = (localThreat?.value as number) ?? 0;
  if (payload.threatLevel > localVal) {
    await db.settings.put({ key: 'threatLevel', value: payload.threatLevel });
  }

  return summary;
}
