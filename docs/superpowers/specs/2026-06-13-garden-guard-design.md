# Garden Guard — Design

**Date:** 2026-06-13
**Status:** Approved, ready for implementation planning

## Concept

**Garden Guard** is a classic fixed-path tower defense PWA. Garden pests march along a
winding dirt path toward your veggie patch; you place and upgrade garden-tool towers along
the path to stop them. Cute pixel art, bright garden palette, mobile-first tap controls.
Each map is an endless wave-survival run — you chase your best wave and unlock new gardens.

## Architecture & Tech

Mirrors the Sky Tycoon shipping pattern.

- Lives at `/garden-guard/` in the `dojohnso.github.io` repo, served by GitHub Pages.
- **Single-file** `index.html` (vanilla JS, no build tools, no React) + `manifest.json` +
  `sw.js` + `icon-192.png` / `icon-512.png`.
- Aseprite source sprites in `garden-guard/assets/sprites/`, exported PNGs in
  `garden-guard/public/`.
- **Canvas-based rendering** at a fixed **landscape** internal resolution, scaled up with
  `imageRendering: pixelated`. Landscape gives the winding path room to breathe. (Pick a
  landscape internal res during planning, e.g. ~640×360-ish, finalized in the plan.)
- **Game loop:** `requestAnimationFrame` with fixed-timestep update + separate render.
- **Screen state machine:** Map Select → Playing → Game Over.
- **Persistence:** unlocked maps + best-wave-per-map in `localStorage`.
- **Service worker:** offline caching with a versioned cache name (bump on each deploy),
  same approach as Sky Tycoon's `sw.js`.
- Dev preview via `npx serve /usr/local/var/www/dojohnso.github.io/garden-guard -l 3851`,
  with a launch config added to `.claude/launch.json`.

## Core Gameplay Loop

One map run:

1. Map loads with a fixed winding path, the veggie patch at the end, a starting cash
   balance, and full hearts.
2. Player places towers on buildable plots (grass tiles beside the path): tap a tower in
   the bottom bar, then tap a plot.
3. Tap **Start Wave** (or auto-start after a short countdown) → pests spawn and walk the path.
4. Towers auto-target and attack pests in range. Killing a pest grants cash.
5. Pests that reach the veggie patch cost hearts (by size). Hearts reach 0 → **Game Over**.
6. Between waves: calm build phase to place/upgrade towers.
7. Waves escalate **endlessly** — difficulty ramps via more pests, more HP, tougher mixes.
8. **Best wave reached** is saved per map. Clearing **wave 10** on a map unlocks the next map.

**Tower interaction:**

- Tap an existing tower → popup panel showing the range ring, current stats,
  **Upgrade** (cost) and **Sell** (partial refund).
- Each tower has ~3 upgrade tiers (escalating cost, bigger stats, subtle sprite change).

**Economy:** Start cash places ~2 towers. Pest bounties + a small per-wave-clear bonus fund
expansion. The core tension is upgrade-an-existing-tower vs. place-a-new-one.

## Towers (4, distinct roles)

| Tower | Role | Behavior |
|---|---|---|
| Watering Can | Basic single-target | Cheap, balanced damage/rate/range. The workhorse. |
| Bug Zapper | Slow / AoE | Hits an area, applies a brief slow. Short-ish range, slower fire. |
| Sprinkler | Fast / splash | Rapid fire, short range, small splash. Strong at path bends/chokes. |
| Scarecrow Slingshot | Sniper | Long range, high single-target damage, slow fire. Picks off tanky pests. |

Each tower: 3 upgrade tiers. Targeting is automatic (e.g. first-in-range / closest-to-goal —
finalize default in planning). All targeting is ground-only; no flyers in MVP.

## Pests (4) & Lives

| Pest | Trait |
|---|---|
| Ant | Basic speed/HP — the filler. |
| Beetle | Slow, tanky (high HP). |
| Lizard | Fast, low HP — rushes through. |
| Caterpillar | **Boss:** huge HP, appears on milestone waves, costs many hearts if it leaks. |

All pests are **ground units** — no flying, no targeting-rule system needed in MVP.

**Lives:** A row of ~20 hearts. A leaked pest costs hearts by size: ant 1, lizard 1,
beetle 2, caterpillar ~5. Hearts reach 0 → Game Over. (Exact heart count and costs tuned
during balancing.)

## Maps & Progression

Three hand-designed starter maps, each with its own winding path and buildable-plot layout:

1. **Backyard Veggie Patch** — easy. Gentle curves, lots of plots.
2. **Flower Bed Maze** — medium. Tighter path, fewer plots, more bends (rewards splash towers).
3. **Greenhouse** — hard. Long snaking path, choke points.

**Unlock flow:** Start with Map 1 unlocked. Clearing **wave 10** on a map unlocks the next.
Once unlocked, any map is freely replayable.

**Per-map persistence:** best wave reached saved per map, shown on the Map Select screen.
Progression = unlocking maps + chasing your own best wave. **No cross-map stat carryover** —
keeps balancing clean.

**Map Select screen:** three cards; locked cards greyed with an unlock hint
("Reach Wave 10 on Backyard").

Map paths are defined as data (an ordered list of waypoints + a list of buildable plot tiles)
so adding maps later is just data, not new code.

## Art & Audio

- **Pixel art via Aseprite** (pixel-plugin MCP), exported to `public/`. Bright, saturated
  garden palette — greens, dirt browns, sky blue, pops of veggie/flower color.
- **Sprites needed:**
  - 4 towers, with a subtle visual change per upgrade tier.
  - 4 pests, ideally a 2-frame walk wiggle each.
  - Veggie-patch goal marker.
  - Path / grass / dirt terrain tiles.
  - Hearts and coins UI.
  - Projectiles: water drop, zap, slingshot pebble.
- **Audio (light, optional for MVP):** simple WebAudio blips for place / upgrade / hit /
  leak / wave-clear — synthesized, no asset files. Defer if time-tight.
- **PWA icons:** `icon-192.png` / `icon-512.png`, garden-themed.

## Out of Scope (MVP / YAGNI)

- Flying enemies and tower targeting rules.
- Cross-map or account-level leveling / persistent meta-upgrades.
- Per-map persistent stat carryover between runs (only best-wave is saved).
- More than 4 towers / 4 pests.
- Music tracks or sampled audio assets.
- Level editor.

## Success Criteria

- A child can open the PWA, understand the goal, place a tower, and survive a few waves
  without instruction.
- All 3 maps playable; map 2 and 3 unlock via wave milestones.
- Towers feel distinct; the upgrade-vs-place decision is meaningful.
- Runs offline as an installable PWA, matching the Sky Tycoon quality bar.
