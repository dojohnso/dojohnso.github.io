# Sky Tycoon — Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorming complete)
**Type:** Web-based idle/tap game prototype

## Overview

Sky Tycoon is a kid-friendly idle/tap game in the style of an iPad/iOS game. You're a pilot
with a basic single-prop plane. You earn money by taking jobs to fly people/cargo, and spend
that money upgrading your plane (engine, cargo hold) and buying bigger planes. Bigger/faster
planes unlock bigger, higher-paying jobs — the core idle progression loop.

This spec covers the **first prototype** only: the core loop. Autopilot/idle automation is
explicitly deferred but designed for (see "Autopilot hook").

## Goals

- Prove the core loop is fun: **jobs → money → upgrades → bigger jobs**.
- Kid-legible: simple stats, clear buttons, satisfying feedback.
- Runs as a single-file web app, droppable into the GitHub Pages site later.

## Non-Goals (deferred)

- Autopilot / idle automation (designed for, not built).
- Multiple locations / a map / range stat.
- Multiple simultaneous flights.
- Custom Aseprite sprite art (prototype uses inline pixel/CSS art; swap in later).
- Sound, cosmetics, prestige systems.

## Tech Approach

- **Single-file vanilla:** one `index.html` with inline CSS + JS. No build tools.
  Matches `planethopper-pwa` / `solar-pwa` / `tower-talk-pwa` pattern.
- **Save:** `localStorage`.
- **Art style:** Pixel art (matches existing game library). Plane drawn as an inline pixel
  sprite (CSS/canvas), pixel clouds, ground strip. No external assets for the prototype.
- **Location:** new project dir `sky-tycoon/` in the Pages repo root.

## Core Loop

1. **Job board (FLY screen):** ~5 jobs listed. Each shows customer/destination, cargo count
   (people or freight), payout, flight time. Jobs whose cargo > plane Capacity show locked
   ("Need bigger plane").
2. **Take a job:** tap an available job → plane animates across the scene + progress bar fills
   over `flightTime / Speed` seconds → payout added to bank. **One flight at a time.** Board is
   disabled during an active flight.
3. **Job refresh:** on completion, the finished job is removed and a fresh job is generated so
   the board stays ~5 jobs.
4. **Spend money:** UPGRADE (boost current plane stats) or SHOP (buy a new plane tier).
5. **Repeat:** bigger plane → bigger jobs → more money.

## Stats

- **Capacity** — max cargo per job. Gates which jobs are takeable.
- **Speed** — divides flight time (`effectiveTime = job.flightTime / Speed`). Higher = faster
  payouts = more money/minute.

## Economy (starting numbers — tunable)

- Start: **$0**, Single Prop (Capacity 2, Speed 1.0).
- Early jobs: 1–2 cargo, ~$8–15 payout, ~4–6s base flight time. Affordable first upgrade ($10)
  after a flight or two.
- Job generation scales with current Capacity: as Capacity climbs, larger/higher-paying jobs
  appear. (Payout roughly proportional to cargo × distance-ish factor.)

## Upgrade (two buttons, per-stat climbing cost)

The UPGRADE view shows **two** upgrade buttons, each with its own independent climbing cost
using the user's formula: `cost = $10 * (upgradesBoughtForThatStat) + $10` → $10, $20, $30, …

- **Upgrade Engine (Speed):** each purchase bumps Speed (e.g. +0.15). Cost climbs on Speed count.
- **Upgrade Cargo Hold (Capacity):** each purchase bumps Capacity (e.g. +1). Cost climbs on
  Capacity count.

Buttons are greyed/disabled when unaffordable. Two buttons (vs one) is intentional — it teaches
the speed-vs-capacity tradeoff that is the heart of the game.

## Shop (plane tiers)

Selling whole new planes. Buying a plane **replaces** the current plane and **resets the
per-plane upgrade counters** (so upgrade costs restart at $10 on the new plane, but base stats
are much higher). This prevents the per-stat cost from spiraling and stalling progression.

| Plane          | Base Capacity | Base Speed | Price  |
|----------------|---------------|------------|--------|
| 🛩️ Single Prop | 2             | 1.0        | start  |
| Twin Prop      | 5             | 1.4        | $150   |
| Turboprop      | 10            | 2.0        | $600   |
| Small Jet      | 20            | 3.0        | $2,500 |

Current plane marked "Owned"; affordable tiers tappable; unaffordable dimmed. (4 tiers for the
prototype; trivially extensible.)

## Screens / UI

Single page; three views swap into the bottom card. Persistent top bar (money counter + current
plane name/icon) always visible.

- **FLY (default):** pixel sky scene up top (plane sprite, pixel clouds, ground strip). Below:
  scrollable job board of job cards. Available cards tappable; locked cards dimmed with reason.
  During an active flight: scene shows plane moving + progress bar; board disabled.
- **UPGRADE:** two big buttons (Upgrade Engine / Upgrade Cargo Hold) each showing current stat
  value + next cost. Greyed if unaffordable.
- **SHOP:** plane tier list with Owned/price/locked states.

Bottom nav: three pixel-styled buttons **FLY / UPGRADE / SHOP**.

## Save (localStorage)

Persist: `money`, current plane id, Speed-upgrade count, Capacity-upgrade count, and the current
job board (so a refresh doesn't reshuffle). Load on boot; default to fresh start if absent.

## Autopilot Hook (deferred feature, designed now)

Structure "take a job" as a single function `startJob(job)` so a future autopilot upgrade can call
it automatically on a timer (pick best affordable/takeable job → `startJob` → on land, repeat).
Not built in the prototype; just ensure the architecture won't fight it.

## Code Structure (single file, logically sectioned)

- **State:** `money`, `plane` (id + derived stats), `speedUpgrades`, `capacityUpgrades`, `jobs[]`,
  `activeFlight` (or null).
- **Pure helpers:** `upgradeCost(count)`, `planeStats(planeId, speedUp, capUp)`, `generateJob(capacity)`.
- **Actions:** `startJob(job)`, `completeFlight()`, `buyEngineUpgrade()`, `buyCargoUpgrade()`,
  `buyPlane(planeId)`.
- **Render:** `renderTopBar()`, `renderFly()`, `renderUpgrade()`, `renderShop()`, view switching.
- **Loop:** rAF/`setInterval` ticker advancing `activeFlight` progress; on complete → payout +
  refresh job + re-render.
- **Persistence:** `save()` / `load()` against localStorage.

## Testing / Verification

- Manual via preview tools: start a flight, watch progress, confirm payout + job refresh.
- Confirm upgrade costs climb $10/$20/$30 per stat independently.
- Confirm buying a plane swaps stats and resets upgrade counters/costs.
- Confirm locked jobs (cargo > capacity) are not takeable and become takeable after a capacity
  upgrade.
- Confirm refresh restores saved state.
