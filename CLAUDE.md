# CLAUDE.md — SENTINEL Project Context

## What This Is
SENTINEL is an offline-first emergency preparedness PWA for families and small groups (5-15 people) in Quebec, Canada. Built with React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Dexie.js (IndexedDB) + Leaflet maps. Fully bilingual EN/FR.

## Current State (March 2026)
- **Phase 1 COMPLETE**: TypeScript audit clean, CSS animations, zero `as any` casts, apple-touch-icon
- **Phase 2 COMPLETE**: vite-plugin-pwa + Workbox, OSM tile caching, "Download Maps" in Settings
- **Phase 3 COMPLETE**: Feed infrastructure + 4 live OSINT feeds (NAAD, Hydro-QC, OpenSky, RSS news). All wired to Intel tab, Home tab alert banner, and Map tab markers.
- **Phase 4 COMPLETE**: Smart Dashboard — Preparedness Score (0-100 ring), supply burn rate, days remaining, expiring items, category coverage, group check-in freshness, mini member map, messages count
- **Phase 5 COMPLETE**: Dead Man's Switch — check-in intervals per member, 60s check loop, browser notifications, persistent red "You haven't checked in" banner with inline "I'm Safe" button
- **Phase 6 COMPLETE**: Drone Detection — Web Audio API engine, 48kHz AudioContext, fftSize 2048, 3-band FFT (LOW/MID/HIGH), calibration, sustained detection, harmonic spacing check, live spectrum canvas
- **Phase 7 COMPLETE**: QR Code Peer Sync — CompressionStream gzip + base64, multi-part chunking at 2900 char limit, camera scanning via qr-scanner, auto-cycling QR display
- **Phase 8 COMPLETE**: Knowledge Vault — AES-256-GCM encryption via Web Crypto, PDF text extraction via pdfjs-dist, 8 document categories, priority levels. Pure JS ZIM reader with zstd decompression, PDF/EPUB/image rendering. 26-pack tiered knowledge catalog from Kiwix (EN+FR).
- **Phase 9 COMPLETE**: Threat Intelligence — 8 Geddes-derived indicator categories with bilingual keywords, pattern detection (5 patterns), Democratic Health Index 0-100 with decay/trend, 7 contradiction detection rules, wired to feedManager poll cycle
- **Phase 10 COMPLETE**: Offline AI Assistant — WebLLM with SmolLM2-360M-Instruct, WebGPU detection, streaming chat, floating chat button, Settings download/delete
- **Repo**: `shield-buddies` on GitHub, branch `phase1/fix-and-stabilize`
- **Known issue**: react-leaflet v5 expects React 19 peer dep but works fine on React 18.3.1 (cosmetic warning only)

## Architecture Rules (Never Break These)
- **ALL data persistence goes through Dexie.js IndexedDB** — never use localStorage, sessionStorage, or React state alone for persistent data
- **ALL user-facing strings use the `t()` function** from `src/lib/i18nContext.ts` — zero hardcoded English or French in JSX
- **New i18n keys must be added to BOTH `en` and `fr`** in `src/lib/i18n.ts`
- **The app must work fully offline** after first load — every external API call must have try-catch, `navigator.onLine` checks, and Dexie-cached fallback data
- **Dexie schema changes require a version bump** — `this.version(N).stores({...})` — never modify earlier versions in `src/lib/db.ts`
- **iPhone Safari PWA is a primary target** — use `100dvh` not `100vh`, respect `env(safe-area-inset-bottom)`, minimum 44x44px touch targets
- **Light mode default with dark mode toggle** — use CSS custom properties and the `dark` class on `<html>`
- **No external cloud dependencies for core features** — everything must degrade gracefully to local-only operation
- **Activity logging**: Call `logActivity(type, enDescription, frDescription)` for all significant user actions

## Key Files
- `src/lib/db.ts` — Dexie database (version 5) with 16 tables
- `src/lib/i18n.ts` — All translation strings (EN/FR)
- `src/lib/i18nContext.ts` — React context providing `t()`, `language`, `setLanguage`
- `src/lib/themeContext.ts` — Theme provider (light/dark/system)
- `src/lib/utils.ts` — `timeAgo()`, `haversineDistance()`, `getCurrentPosition()`, `logActivity()`, `nameToColor()`, `daysUntilExpiry()`
- `src/lib/feeds/feedManager.ts` — Singleton managing all OSINT feed adapters
- `src/lib/feeds/` — naadFeed.ts, hydroQuebec.ts, openSkyFeed.ts, rssFeed.ts, corsProxy.ts, registerFeeds.ts, types.ts
- `src/lib/threat/` — indicatorExtractor.ts, patternEngine.ts, healthScore.ts, contradictionDetector.ts, keywords.ts
- `src/lib/audio/droneDetector.ts` — Web Audio FFT drone detection engine
- `src/lib/sync/qrSync.ts` — QR code peer sync
- `src/lib/zim/zimReader.ts` — Pure JS ZIM file reader with zstd decompression
- `src/lib/ai/inferenceEngine.ts` — WebLLM AI engine singleton
- `src/lib/deadManSwitch.ts` — Check-in timer engine
- `src/lib/vaultCrypto.ts` — AES-256-GCM encryption
- `src/lib/tileCacher.ts` — OSM tile pre-cacher
- `src/components/AppShell.tsx` — Responsive layout (bottom tabs mobile, sidebar desktop)
- `src/components/AIChat.tsx` — Floating AI chat panel
- `src/components/ZimViewer.tsx` — In-app ZIM file reader
- `src/components/tabs/*.tsx` — 8 tabs: HomeTab, SuppliesTab, GroupTab, MapTab, IntelTab, DroneTab, VaultTab, SettingsTab

## Conventions
- Components: PascalCase, one component per file
- Dexie queries: Always use `useLiveQuery()` from `dexie-react-hooks` for reactive rendering
- GPS fallback: `getCurrentPosition()` falls back to Montreal coordinates `[45.5017, -73.5673]`
- Timestamps: Store as `Date.now()` (milliseconds), display with `timeAgo(timestamp, language)`
- Feed adapters: implement FeedAdapter interface from src/lib/feeds/types.ts, register in registerFeeds.ts

## Build Phase Order
1. ~~Phase 1: Fix & Stabilize~~ ✓
2. ~~Phase 2: Service Worker + Offline Maps~~ ✓
3. ~~Phase 3: OSINT Feeds~~ ✓
4. ~~Phase 4: Smart Dashboard~~ ✓
5. ~~Phase 5: Dead Man's Switch~~ ✓
6. ~~Phase 6: Drone Detection~~ ✓
7. ~~Phase 7: QR Code Peer Sync~~ ✓
8. ~~Phase 8: Knowledge Vault + ZIM Reader~~ ✓
9. ~~Phase 9: Threat Intelligence Engine~~ ✓
10. ~~Phase 10: Offline AI Assistant~~ ✓
11. **Phase 11: Map Intelligence** ← NEXT
12. Phase 12: Event-Sourced CRDT Refactor
13. Phase 13: Survival Toolkit (20 tools)
14. Phase 14: Production Hardening
15. Phase 15: WatchKit Companion
