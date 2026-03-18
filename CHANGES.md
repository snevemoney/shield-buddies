# Code Review Fixes — Summary

## Files Modified
- `src/lib/validation.ts` — **NEW** Zod schemas + URL validation + text sanitization
- `src/hooks/useDeadMansSwitch.ts` — **NEW** Dead Man's Switch timer hook
- `src/components/tabs/SettingsTab.tsx` — Import validation, leader role confirmation, all-table import
- `src/components/tabs/GroupTab.tsx` — DMS timer integration, orphan-free check-ins
- `src/components/tabs/IntelTab.tsx` — URL validation + content sanitization on intel entries
- `src/components/tabs/HomeTab.tsx` — Fixed food supply calculation
- `playwright.config.ts` — Replaced broken lovable config with standard Playwright config

## Tests Added
- `src/test/validation.test.ts` — 26 tests for Zod schemas, URL validation, sanitization
- `src/test/food-supply.test.ts` — 8 tests for food supply calculation
- `e2e/app.spec.ts` — 8 Playwright e2e tests covering navigation, import validation, UI rendering

---

## Fix Details

### 1. Unsanitized JSON Import (CRITICAL)
**File:** `src/lib/validation.ts`, `src/components/tabs/SettingsTab.tsx`
- Created Zod schemas for every Dexie table (Supply, Member, Message, Checkin, etc.)
- `validateBackupData()` parses imported JSON against the full `BackupSchema` before any DB writes
- Invalid data (wrong types, missing fields, bad enum values) now rejects with a descriptive error toast

### 2. XSS Risk via Imported Content + Unvalidated URLs (CRITICAL)
**File:** `src/lib/validation.ts`, `src/components/tabs/IntelTab.tsx`
- `isValidUrl()` ensures URLs start with `http://` or `https://` — blocks `javascript:`, `data:`, etc.
- `sanitizeText()` strips HTML tags from user-provided strings before storage
- Intel entry creation now validates URL and sanitizes headline/source/notes
- No `dangerouslySetInnerHTML` on user content (confirmed only in shadcn chart component)

### 3. Leader Role Self-Selection (CRITICAL)
**File:** `src/components/tabs/SettingsTab.tsx`
- Selecting "Leader" now opens a confirmation dialog instead of silently applying
- If another member already has Leader role, selection is blocked with an error message
- Added `leaderConfirmOpen` state and `handleRoleChange`/`confirmLeaderRole` handlers

### 4. Dead Man's Switch Non-Functional (BUG)
**File:** `src/hooks/useDeadMansSwitch.ts`, `src/components/tabs/GroupTab.tsx`
- Created `useDeadMansSwitch` hook with real countdown timer logic
- Persists last check-in timestamp in `dmsLastCheckIn` setting (survives page reload)
- On expiry: posts a SOS message to the group board + fires a browser Notification
- Check-in resets the timer; enabling DMS sets initial check-in time
- Requests Notification permission when DMS is first enabled

### 5. Orphaned Check-in Records (BUG)
**File:** `src/components/tabs/GroupTab.tsx`
- If user has no member record when checking in, one is auto-created with their name/role
- Check-in always uses a valid `member.id` — never `0`

### 6. Food Supply Shows Wrong Metric (BUG)
**File:** `src/components/tabs/HomeTab.tsx`
- **Before:** Showed nearest food expiry date (min days until any item expires)
- **After:** Calculates estimated days of food supply: total food units ÷ (members × 3 meals/day)
- Normalizes units (kg → ×4, cans/packs/boxes → ×1)
- Excludes expired items from the calculation

### 7. Import Silently Drops Tables (BUG)
**File:** `src/components/tabs/SettingsTab.tsx`
- **Before:** `checkins` and `cachedAlerts` were exported but never imported
- **After:** All 11 Dexie tables are both exported and imported
