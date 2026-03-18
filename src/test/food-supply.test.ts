import { describe, it, expect } from 'vitest';
import { daysUntilExpiry } from '@/lib/utils';

/**
 * Replicates the food supply calculation from HomeTab to test it in isolation.
 * This mirrors the exact logic used in the component.
 */
function calculateFoodDays(
  foodSupplies: Array<{ quantity: number; unit: string; expirationDate?: string }>,
  memberCount: number
): number {
  const FOOD_UNITS_PER_PERSON_PER_DAY = 3;
  const totalFoodUnits = foodSupplies.reduce((sum, s) => {
    const d = daysUntilExpiry(s.expirationDate);
    if (d !== null && d <= 0) return sum; // exclude expired
    if (s.unit === 'kg') return sum + s.quantity * 4;
    if (s.unit === 'cans' || s.unit === 'packs' || s.unit === 'boxes') return sum + s.quantity;
    return sum + s.quantity;
  }, 0);
  return memberCount > 0
    ? Math.floor(totalFoodUnits / (memberCount * FOOD_UNITS_PER_PERSON_PER_DAY))
    : 0;
}

describe('Food supply days calculation', () => {
  it('returns 0 when there are no members', () => {
    const food = [{ quantity: 10, unit: 'cans' }];
    expect(calculateFoodDays(food, 0)).toBe(0);
  });

  it('returns 0 when there are no food supplies', () => {
    expect(calculateFoodDays([], 3)).toBe(0);
  });

  it('calculates correctly for cans with 1 person', () => {
    // 9 cans / (1 person * 3 meals/day) = 3 days
    const food = [{ quantity: 9, unit: 'cans' }];
    expect(calculateFoodDays(food, 1)).toBe(3);
  });

  it('calculates correctly for kg with multiple people', () => {
    // 6 kg = 24 food units / (2 people * 3 meals/day) = 4 days
    const food = [{ quantity: 6, unit: 'kg' }];
    expect(calculateFoodDays(food, 2)).toBe(4);
  });

  it('excludes expired items from calculation', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const food = [
      { quantity: 9, unit: 'cans', expirationDate: yesterday }, // expired — ignored
      { quantity: 6, unit: 'cans', expirationDate: nextYear },  // valid
    ];
    // Only 6 cans count / (1 * 3) = 2 days
    expect(calculateFoodDays(food, 1)).toBe(2);
  });

  it('includes items with no expiration date', () => {
    const food = [{ quantity: 12, unit: 'packs' }]; // no expirationDate
    // 12 packs / (1 * 3) = 4 days
    expect(calculateFoodDays(food, 1)).toBe(4);
  });

  it('aggregates multiple items', () => {
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const food = [
      { quantity: 6, unit: 'cans', expirationDate: nextYear },
      { quantity: 3, unit: 'boxes', expirationDate: nextYear },
      { quantity: 3, unit: 'units', expirationDate: nextYear },
    ];
    // 6 + 3 + 3 = 12 / (2 * 3) = 2 days
    expect(calculateFoodDays(food, 2)).toBe(2);
  });

  it('floors the result instead of rounding', () => {
    // 10 cans / (1 * 3) = 3.33 → 3
    const food = [{ quantity: 10, unit: 'cans' }];
    expect(calculateFoodDays(food, 1)).toBe(3);
  });
});
