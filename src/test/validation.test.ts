import { describe, it, expect } from 'vitest';
import { validateBackupData, isValidUrl, sanitizeText } from '@/lib/validation';

// ---------- validateBackupData ----------

describe('validateBackupData', () => {
  it('accepts a valid complete backup', () => {
    const backup = {
      supplies: [
        { id: 1, name: 'Rice', category: 'Food', quantity: 10, unit: 'kg', createdAt: 1000, updatedAt: 1000 },
      ],
      members: [
        { id: 1, name: 'Alice', role: 'Leader', createdAt: 1000 },
      ],
      messages: [
        { id: 1, senderName: 'Alice', text: 'Hello', priority: 'Normal', timestamp: 1000 },
      ],
      checkins: [
        { id: 1, memberId: 1, timestamp: 1000 },
      ],
      locations: [
        { id: 1, name: 'Base', category: 'Shelter', lat: 45.5, lng: -73.5, createdAt: 1000 },
      ],
      activityLog: [
        { id: 1, type: 'test', description: 'Test', descriptionFr: 'Test', timestamp: 1000 },
      ],
      intelEntries: [
        { id: 1, headline: 'News', source: 'AP', category: 'Local', timestamp: 1000 },
      ],
      cachedAlerts: [
        { id: 1, level: 'Warning', region: 'QC', description: 'Storm', issuedAt: 1000, cachedAt: 1000 },
      ],
      detections: [
        { id: 1, timestamp: 1000, confidence: 'High', classification: 'Drone', durationSeconds: 10, source: 'mic' },
      ],
      settings: [
        { key: 'userName', value: 'Alice' },
      ],
      checklistItems: [
        { id: 1, textEn: 'Water', textFr: 'Eau', completed: false, category: 'essentials', order: 1 },
      ],
    };

    const result = validateBackupData(backup);
    expect(result.supplies).toHaveLength(1);
    expect(result.members).toHaveLength(1);
    expect(result.checkins).toHaveLength(1);
    expect(result.cachedAlerts).toHaveLength(1);
    expect(result.settings).toHaveLength(1);
  });

  it('accepts an empty object and defaults all arrays', () => {
    const result = validateBackupData({});
    expect(result.supplies).toEqual([]);
    expect(result.members).toEqual([]);
    expect(result.checkins).toEqual([]);
    expect(result.cachedAlerts).toEqual([]);
  });

  it('rejects a member with invalid role', () => {
    const backup = {
      members: [{ id: 1, name: 'Bob', role: 'King', createdAt: 1000 }],
    };
    expect(() => validateBackupData(backup)).toThrow();
  });

  it('rejects a supply with missing required fields', () => {
    const backup = {
      supplies: [{ name: 'Rice' }], // missing category, quantity, unit, createdAt, updatedAt
    };
    expect(() => validateBackupData(backup)).toThrow();
  });

  it('rejects a message with invalid priority', () => {
    const backup = {
      messages: [{ senderName: 'X', text: 'Hi', priority: 'EXTREME', timestamp: 1000 }],
    };
    expect(() => validateBackupData(backup)).toThrow();
  });

  it('rejects a detection with invalid confidence', () => {
    const backup = {
      detections: [
        { timestamp: 1000, confidence: 'VeryHigh', classification: 'Drone', durationSeconds: 5, source: 'x' },
      ],
    };
    expect(() => validateBackupData(backup)).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => validateBackupData('hello')).toThrow();
    expect(() => validateBackupData(42)).toThrow();
    expect(() => validateBackupData(null)).toThrow();
  });

  it('rejects a checkin with non-number memberId', () => {
    const backup = {
      checkins: [{ memberId: 'abc', timestamp: 1000 }],
    };
    expect(() => validateBackupData(backup)).toThrow();
  });

  it('strips unknown extra fields but still succeeds (passthrough)', () => {
    const backup = {
      supplies: [
        { id: 1, name: 'Rice', category: 'Food', quantity: 10, unit: 'kg', createdAt: 1000, updatedAt: 1000, extraField: 'ignored' },
      ],
    };
    // Zod strips extra fields by default in .parse() — should not throw
    const result = validateBackupData(backup);
    expect(result.supplies).toHaveLength(1);
  });
});

// ---------- isValidUrl ----------

describe('isValidUrl', () => {
  it('accepts http:// URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https:// URLs', () => {
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects vbscript: URLs', () => {
    expect(isValidUrl('vbscript:msgbox("hi")')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects undefined and null', () => {
    expect(isValidUrl(undefined)).toBe(false);
    expect(isValidUrl(null)).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isValidUrl('//evil.com')).toBe(false);
  });

  it('rejects bare domain without protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });

  it('handles leading whitespace', () => {
    expect(isValidUrl('  https://example.com')).toBe(true);
  });
});

// ---------- sanitizeText ----------

describe('sanitizeText', () => {
  it('strips HTML script tags', () => {
    expect(sanitizeText('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
  });

  it('strips img tags with onerror', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>text')).toBe('text');
  });

  it('strips nested HTML', () => {
    expect(sanitizeText('<div><b>bold</b></div>')).toBe('bold');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizeText('Normal text here')).toBe('Normal text here');
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('handles non-string input gracefully', () => {
    expect(sanitizeText(42 as unknown as string)).toBe('');
    expect(sanitizeText(null as unknown as string)).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });
});
