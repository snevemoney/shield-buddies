import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Language } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(timestamp: number, lang: Language): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return lang === 'fr' ? 'À l\'instant' : 'Just now';
  if (minutes < 60) return lang === 'fr' ? `il y a ${minutes} min` : `${minutes}m ago`;
  if (hours < 24) return lang === 'fr' ? `il y a ${hours}h` : `${hours}h ago`;
  return lang === 'fr' ? `il y a ${days}j` : `${days}d ago`;
}

export function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)',
    'hsl(0, 72%, 51%)', 'hsl(270, 60%, 55%)', 'hsl(190, 80%, 45%)',
    'hsl(330, 65%, 50%)', 'hsl(160, 70%, 40%)',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 45.5017, lng: -73.5673 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: 45.5017, lng: -73.5673 }),
      { timeout: 5000, enableHighAccuracy: true }
    );
  });
}

export function daysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.ceil((expiry - now) / 86400000);
}

export async function logActivity(type: string, description: string, descriptionFr: string) {
  const { db } = await import('./db');
  await db.activityLog.add({ type, description, descriptionFr, timestamp: Date.now() });
}
