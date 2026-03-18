# SENTINEL — Complete Task Plan (Phases 2–15)

> **Phases 1-10 COMPLETE. Start Phase 11.**
> **How to use**: Copy each task's Claude Code prompt into Cursor. Run tasks in order.
> **Repo**: `shield-buddies`, branch `phase1/fix-and-stabilize`

---

## ~~PHASE 1: Fix & Stabilize~~ ✓ COMPLETE
## ~~PHASE 2: Service Worker + True Offline~~ ✓ COMPLETE
## ~~PHASE 3: OSINT Intelligence Feeds~~ ✓ COMPLETE
## ~~PHASE 4: Smart Dashboard~~ ✓ COMPLETE
## ~~PHASE 5: Dead Man's Switch~~ ✓ COMPLETE
## ~~PHASE 6: Drone Detection~~ ✓ COMPLETE
## ~~PHASE 7: QR Code Peer Sync~~ ✓ COMPLETE
## ~~PHASE 8: Knowledge Vault + ZIM Reader~~ ✓ COMPLETE
## ~~PHASE 9: Threat Intelligence Engine~~ ✓ COMPLETE
## ~~PHASE 10: Offline AI Assistant~~ ✓ COMPLETE

---

## PHASE 11: Map Intelligence ← START HERE
**Goal**: Turn the Map tab into a real navigation + POI + hazard tool.

### Task 11.1 — Emergency POI layer
```
Create a build-time script scripts/fetchPOIs.ts that queries the Overpass API for Montreal metro (bbox 45.35,-73.98,45.72,-73.40):

OSM tags: amenity=hospital, amenity=pharmacy, amenity=fire_station, amenity=police, amenity=shelter, amenity=drinking_water, amenity=fuel, shop=supermarket, amenity=place_of_worship, amenity=school, amenity=community_centre

Convert to GeoJSON, save to public/data/pois.geojson (~2MB).
On Map tab: load POIs from cache (IndexedDB), display as clustered markers (npm install react-leaflet-cluster).
Category toggle buttons to show/hide each POI type.
Tapping a marker shows: name, address, category, distance from user.
```

### Task 11.2 — EV charger layer
```
Create scripts/fetchChargers.ts:
- Download Circuit Électrique CSV from data.lecircuitelectrique.com
- Fetch OpenChargeMap for Quebec via API (need free API key)
- Merge, deduplicate by 50m proximity, output public/data/chargers.geojson

On Map tab: green markers for chargers, popup shows connector types and power level.
"Download Charger Data" button in Settings for refresh.
```

### Task 11.3 — Hazard zone overlays
```
Create scripts/fetchHazards.ts:
- Download CEHQ flood zones for Montreal (FGDB → GeoJSON via ogr2ogr or pre-converted)
- Download SPVM crime data from donnees.montreal.ca (direct GeoJSON)
- Download landslide zones from MTQ WFS endpoint

Store as public/data/floods.geojson, public/data/crime.geojson, public/data/landslides.geojson.
On Map tab: toggle overlay layers. Flood zones as semi-transparent blue polygons. Crime as heatmap (npm install leaflet.heat). Landslide zones as orange polygons.
Pre-compute and cache in IndexedDB on first load. Show "X hazard zones in your area" on Home tab.
```

### Task 11.4 — Offline routing (pre-computed)
```
Part A (build-time): Create scripts/precomputeRoutes.ts
- Define ~50 critical destinations in Montreal (hospitals, shelters, transit hubs, evacuation points)
- Use OSRM public API (router.project-osrm.org) to compute routes from a grid of 100 origin points
- Store as public/data/routes.json.gz (~50-100MB)

Part B (runtime): On Map tab, "Route to nearest [hospital/shelter/etc.]" button:
- Find user's nearest grid origin point
- Look up pre-computed route to selected destination type
- Draw polyline on map with distance/duration
- Show turn-by-turn directions panel
```

---

## PHASE 12: Event-Sourced CRDT Refactor
**Goal**: Refactor data layer for conflict-free peer sync. DO THIS LAST.

### Task 12.1 — Hybrid Logical Clock + Operation Log
```
Create src/lib/sync/hlc.ts and src/lib/sync/opLog.ts.
Bump Dexie. Add opLog, syncState tables.
Wrap all existing db writes through createOp+applyOp.
Update QR sync to exchange op logs.
```

---

## PHASE 13: Survival Toolkit
**Goal**: 20 tools using phone sensors, free data, and pure computation.

Tools to build (each as src/components/tools/*.tsx):
1. Compass (DeviceOrientation API)
2. ICE Profile (paramedic card)
3. Morse Code (audio + flashlight)
4. First Aid Decision Trees (12 conditions)
5. CPR Metronome (100-120 BPM)
6. Calorie & Water Planner
7. Emergency Flashlight & Signal
8. Sun Compass (suncalc)
9. Barometer Weather Predictor (Zambretti)
10. Water Purification Guide
11. Radio Frequencies Reference
12. Food Shelf Life Database (~200 foods)
13. Emergency Phrase Translator (8 languages)
14. Knot Tying Guide (15 knots with SVG)
15. Document Vault (camera + encryption)
16. Emergency Plan Builder
17. Group Governance Template
18. Drug Lookup (Health Canada DPD)
19. Level Tool (DeviceOrientation)

---

## PHASE 14: Production Hardening
- Error boundaries per tab
- React.lazy + Suspense for heavy tabs
- Vitest unit tests
- PWA icons + metadata

---

## PHASE 15: WatchKit Companion (Native Swift)
- Separate Xcode project
- Threat level display, I'm Safe button, emergency contacts
- WatchConnectivity to paired iPhone

---

## Dexie Version Bump Tracker

| Version | Phase | Changes |
|---------|-------|---------|
| 1 | Lovable build | Original 11 tables |
| 2 | Phase 3 | cachedAlerts: +source, +normalizedType, +severity, +lat, +lng, +expiresAt, +rawData |
| 3 | Phase 5 | members: +checkInInterval |
| 4 | Phase 8 | +vaultDocuments, +vaultDistribution |
| 5 | Phase 9 | +threatIndicators, +healthScores, +threatPatterns, +contradictionAlerts |

---

## Claude Code Session Rules
1. Read CLAUDE.md first
2. `npx tsc --noEmit` after changes — zero errors
3. All strings through `t()` — add both EN and FR
4. External API calls: try-catch, navigator.onLine, Dexie cache
5. Dexie version bumps only — never modify earlier versions
6. No localStorage/sessionStorage — Dexie only
7. Commit after each task
