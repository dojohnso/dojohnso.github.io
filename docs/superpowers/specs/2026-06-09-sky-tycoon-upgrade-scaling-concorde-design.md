# Sky Tycoon — Per-Plane Upgrade Scaling + Concorde Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming complete)
**Type:** Balance fix + new content (5th plane)

## Overview

Two coupled changes:
1. **Fix upgrade-cost scaling** — upgrade cost is currently `15*count+15`, independent
   of which plane you're on, so maxing ANY plane's stats costs ~$450 total. By the time
   you can afford the Jet ($8k), $450 is trivial and you max it instantly. Make upgrade
   cost scale per-plane (≈4% of plane price as the first-upgrade base) so bigger planes
   cost proportionally more to upgrade.
2. **Add a 5th plane (Concorde)** and rebalance the price ladder (Jet $8k→$5k, Concorde
   $9k as the new endgame plane), with a new pixel-art sprite.

## Validation of the bug (confirmed)

`upgradeCost(count) = 15 * count + 15` depends only on the upgrade count, not the plane.
Per-stat upgrade prices are $15/$30/$45/$60/$75 → **$225 to max one stat, $450 for both,
on EVERY plane.** Maxing a Jet ($8k plane) for $450 (~5% of its price) is why bigger
planes max out almost immediately. Confirmed real.

## Goals

- Upgrade costs scale with the plane so maxing a high-tier plane is a meaningful
  investment (roughly on par with the plane's own price), while the starter Prop stays
  cheap and beginner-friendly.
- A 5th plane (Concorde) as a clear endgame step above the Jet.
- Rebalanced price ladder with smoother top-end steps.

## Non-Goals

- Changing the upgrade STEP sizes (capStep/speedStep) for existing planes — only costs
  and the new plane.
- Concurrent flights (still deferred).
- Changing autopilot ($1,000) — it still sits between Twin and Turbo.

## Data Model Changes

### New per-plane field: `upgradeBase`
Each plane in `PLANES` gets an `upgradeBase` (the cost of its FIRST upgrade of either
stat). Final `PLANES` table:

| id | name | cap | speed | price | capStep | speedStep | upgradeBase |
|---|---|---|---|---|---|---|---|
| prop | Single Prop | 2 | 1.0 | 0 | 1 | 0.2 | 15 |
| twin | Twin Prop | 8 | 2.2 | 400 | 1 | 0.2 | 20 |
| turbo | Turboprop | 14 | 3.4 | 2000 | 2 | 0.3 | 80 |
| jet | Small Jet | 26 | 5.1 | **5000** | 3 | 0.4 | **200** |
| concorde | Concorde | **40** | **7.5** | **9000** | **4** | **0.5** | **360** |

(Changes vs current: jet price 8000→5000; jet gains `upgradeBase: 200`; prop/twin/turbo
gain `upgradeBase` 15/20/80; concorde is entirely new.)

### Upgrade cost formula
`upgradeCost(count)` currently `15 * count + 15`. Change to take the plane's base:
`upgradeCost(count, base) = base * (count + 1)`.

So the 5 upgrades cost `1×,2×,3×,4×,5×` base = `15×` base to fully max one stat:

| Plane | upgradeBase | per-upgrade ($) | max 1 stat (15×) | max both (30×) |
|---|---|---|---|---|
| Prop | 15 | 15/30/45/60/75 | 225 | 450 |
| Twin | 20 | 20/40/60/80/100 | 300 | 600 |
| Turbo | 80 | 80/160/240/320/400 | 1,200 | 2,400 |
| Jet | 200 | 200/400/600/800/1000 | 3,000 | 6,000 |
| Concorde | 360 | 360/720/1080/1440/1800 | 5,400 | 10,800 |

Maxing a Jet now ~$6k (vs the $5k plane); maxing a Concorde ~$10.8k (vs the $9k plane)
— real investments, not pocket change. Prop unchanged ($450 to fully max), so early game
feels the same.

## Components / Functions

### Modified
- `PLANES` — add `upgradeBase` to all 4 existing entries; change jet price to 5000; add
  the `concorde` entry (full row above).
- `upgradeCost(count, base)` — signature gains `base`; returns `base * (count + 1)`.
- `buyEngineUpgrade()` — currently `const cost = upgradeCost(cp.speedUps);`. Change to
  `upgradeCost(cp.speedUps, curPlane base)`. The plane's upgradeBase comes from the
  current plane's PLANES entry: `const base = PLANES.find(p => p.id === state.planeId).upgradeBase;`
  (or a small helper — see below). Same affordability/cap guards otherwise.
- `buyCargoUpgrade()` — same change with `cp.capUps`.
- `canAffordUpgrade()` (affordability dots) — both `upgradeCost(cp.speedUps)` /
  `upgradeCost(cp.capUps)` calls gain the base arg.
- `renderUpgrade()` — the engine/cargo upgrade cards display `upgradeCost(...)`; both
  calls gain the base arg so the shown price is the per-plane cost.
- **Helper:** add `function curPlaneBase() { return PLANES.find(p => p.id === state.planeId).upgradeBase; }`
  near `curPlane()`, and use it at each `upgradeCost(count, curPlaneBase())` call site, to
  avoid repeating the lookup. (DRY.)

### New (sprite + plane wiring)
- A new Concorde pixel-art sprite (created via the pixel-plugin / Aseprite tools, matching
  the existing 16-wide sprite style — sleek delta-wing / needle-nose, visually distinct
  from the jet), exported to a base64 PNG data URI.
- CSS: `--spr-concorde` var (the data URI); `.plane[data-plane="concorde"] { width:…; height:…; background-image:var(--spr-concorde); }` (size in line with the jet's 176×68,
  tuned to the sprite's aspect); `.plane-thumb[data-plane-thumb="concorde"] { background-image:var(--spr-concorde); }`.

## Save / Migration

- `state.planes[id]` stores per-plane `{speedUps, capUps}` keyed by plane id; adding a new
  plane id needs no migration (you simply don't own `concorde` until you buy it; `buyPlane`
  creates its record).
- `upgradeBase` lives in `PLANES` (code, not save) — no save change.
- Existing saves: a player mid-game keeps their owned planes + upgrade counts. Their
  upgrade COSTS change immediately (now scaled) — intended. The jet price drop only affects
  not-yet-bought jets. No migration code needed.
- A save that somehow references a plane id not in PLANES is already guarded in `load()`
  (rejects unknown `planeId`); the new `concorde` id is valid so no issue.

## Error Handling / Edge Cases

- **upgradeCost base lookup**: `state.planeId` is always a valid PLANES id (load guards
  it), so `curPlaneBase()` never dereferences undefined. (If defensive: fall back to the
  prop's base, but not required given the load guard.)
- **Affordability dots**: `canAffordUpgrade` now uses per-plane cost — the Upgrade dot
  reflects the real (higher on big planes) cost. Correct by construction.
- **Maxed stats**: unchanged — `MAX_UPGRADES = 5` cap still applies; cost only matters for
  non-maxed upgrades.
- **Concorde sprite sizing**: ensure the `.plane[data-plane="concorde"]` width/height match
  the exported PNG's dimensions × scale so it isn't stretched (follow the jet's pattern).

## Testing / Verification

Pure-logic (console-assert, run inline via the browser):
- `upgradeCost(0, 200) === 200`, `upgradeCost(4, 200) === 1000` (jet steps).
- `upgradeCost(0, 15) === 15`, `upgradeCost(4, 15) === 75` (prop unchanged from old curve).
- Summing 5 steps: prop maxes one stat for $225, jet for $3,000, concorde for $5,400.
- `buyEngineUpgrade`/`buyCargoUpgrade` deduct the per-plane cost (e.g. on the jet, first
  engine upgrade costs $200, not $15) and respect MAX_UPGRADES.
- `canAffordUpgrade` returns false on the jet at $199, true at $200.
- Concorde present in PLANES with the right stats; jet price is 5000.

Browser:
- Shop shows 5 planes: Prop/Twin/Turbo/Jet($5,000)/Concorde($9,000), each with a thumbnail
  (Concorde shows its new sprite). Buy Concorde with enough money → it flies; its sprite
  renders in the scene.
- Upgrade view on the Jet/Concorde shows the higher per-plane upgrade costs; buying deducts
  correctly; the bars/maxed states still work.
- Affordability dot on UPGRADE reflects the per-plane cost.
- Switching to the Concorde shows its sprite in the scene (and keeps scenery per the
  existing in-place sprite swap).
- No console errors; mobile + desktop clean.
- Bundle the SW cache bump for the release.

## Code Structure

All in `sky-tycoon/index.html`:
- Data: `PLANES` (+ `upgradeBase` on all, jet price, concorde row).
- Helper: `curPlaneBase()`.
- Cost: `upgradeCost(count, base)`; callers `buyEngineUpgrade`, `buyCargoUpgrade`,
  `canAffordUpgrade`, `renderUpgrade`.
- CSS: `--spr-concorde`, `.plane[data-plane="concorde"]`, `.plane-thumb[data-plane-thumb="concorde"]`.
- Plus the Concorde sprite asset (created via pixel-plugin, embedded as base64).
- Plus `sky-tycoon/sw.js` cache bump.
