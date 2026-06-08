# Sky Tycoon — Autopilot Design Spec

**Date:** 2026-06-08
**Status:** Approved (brainstorming complete)
**Type:** Feature addition to the existing Sky Tycoon game

## Overview

Autopilot: a one-time Shop purchase that, when toggled ON, automatically fills the job
queue with the best-earning takeable jobs (flights chain back-to-back) AND unlocks full
board management while flying (the decline ✕ returns). It's both an automation feature
and a capability unlock — the second reason gives autopilot real value beyond "the game
plays itself".

## Goals

- Buy autopilot once (permanent, account-level), then toggle it ON/OFF.
- When ON: auto-fill the queue with the best $/sec takeable jobs, keeping it topped up;
  flights chain with no idle gaps.
- When ON: the decline ✕ works during flights (manage the board while autopilot flies).
- Solo / autopilot-OFF while flying: the ✕ slot shows a non-interactive 🔒 (consistent
  spacing) + a hint that teaches the perk's value.
- Reuse the isolated `enqueueJob` hook (built for exactly this).

## Non-Goals

- Concurrent flights (still deferred).
- Multi-level autopilot (it's a single one-time unlock + a toggle).
- Autopilot buying planes/upgrades for you (it only fills the job queue).

## Current State (what this builds on)

- Unified queue: `state.queue[0]` is the active flight; `enqueueJob(job)` adds a takeable
  job to the queue and `startJob`s it if nothing is flying (the autopilot hook).
- `tick()` runs every 100ms; advances the active flight, calls `completeFlight` on
  finish (which promotes the next queued job), and calls `updateActiveJobProgress` on
  the Fly view.
- `renderFly` board rows: the decline ✕ is shown only when NOT flying
  (`flying ? '' : '<button class="job-decline" ...>'`). `queueSize()` = total slots.
- The Shop (`renderShop`) lists plane tiers with FLYING/Switch/Buy states.
- `currentStats()` gives `{ capacity, speed }`; jobs have `{ payout, flightTime, cargo }`.

## Architecture / Data Model

**New state fields (account-level, persisted, default false):**
- `state.autopilotOwned` — set true once purchased.
- `state.autopilotOn` — the toggle; only meaningful when owned.

`freshState()` adds `autopilotOwned: false, autopilotOn: false`. `load()`'s
`Object.assign(freshState(), parsed)` supplies these defaults for old saves — no special
migration needed (booleans default to false).

**Config:** `AUTOPILOT_PRICE = 5000`.

## Components / Functions

### New
- `buyAutopilot()` — if `!state.autopilotOwned` and `state.money >= AUTOPILOT_PRICE`:
  deduct price, set `autopilotOwned = true`, save, return true. Else false.
- `toggleAutopilot()` — if `state.autopilotOwned`: flip `state.autopilotOn`, save, return
  true. Else false. (Renders are driven by the caller.)
- `bestTakeableJob()` — among `state.jobs` that are takeable at current capacity, return
  the one maximizing `payout / (flightTime / currentStats().speed)` (i.e. $/sec). Returns
  null if none takeable. (Pure helper; ties broken by first-found.)
- `autoFillQueue()` — if `!(state.autopilotOwned && state.autopilotOn)` return false.
  While `state.queue.length < queueSize()`: let `job = bestTakeableJob()`; if none, break;
  `enqueueJob(job)`. Return true if it added at least one job (so the caller can re-render).
  (`enqueueJob` moves the job off the board, refills the board, and starts the flight if
  idle — so the loop's next `bestTakeableJob()` sees the refilled board.)

### Modified
- `tick()` — at the top (or before the flight-advance block), call `autoFillQueue()`; if
  it added anything AND we're on the Fly view (`screen === 'game' && currentView === 'fly'`),
  `renderAll()` so the queue strip updates. (Keep it cheap: only re-render when something
  changed.) IMPORTANT: autoFillQueue must run even when no flight is active yet — that's
  how autopilot kicks off the first flight from a parked state.
- `renderFly()` — define `autoActive = state.autopilotOwned && state.autopilotOn` and
  `locked = flying && !autoActive` (the "you're flying but can't manage the board" state).
  The decline-button gate changes from `flying` to `locked`:
  - **Idle, OR autopilot-ON while flying** → the working `✕` decline button (as today).
  - **Flying + not autopilot-ON (locked)** → a non-interactive `🔒` element in the SAME
    slot (same size/position as `.job-decline`, but not a button / no `data-decline`), so
    row spacing stays identical.
  - Also: when in the locked state (flying && !autopilotOn-or-not-owned), render a subtle
    hint line near the board, e.g. `✈ Autopilot lets you manage jobs while flying.`
    Shown only in that locked state; hidden otherwise.
  - When autopilot is owned, render the AUTOPILOT ON/OFF toggle (near the queue strip).
- `renderShop()` — add an Autopilot card after the plane tiers: shows OWNED if
  `autopilotOwned`, else a Buy button `Autopilot — $5,000` (disabled if unaffordable).
- `onContentClick` — add branches: `[data-buy-autopilot]` → `buyAutopilot()` + renderAll;
  `[data-autopilot-toggle]` → `toggleAutopilot()` + renderAll. The 🔒 has no handler
  (non-interactive).

## Data Flow

- Shop → tap Buy Autopilot → `buyAutopilot()`; card → OWNED; Fly view now shows the toggle.
- Fly → tap AUTOPILOT (OFF→ON) → `toggleAutopilot()`. Next `tick()` → `autoFillQueue()`
  picks the best $/sec job, `enqueueJob`s it (starts flying since idle), keeps filling to
  full; flights chain via `completeFlight`'s promote + the next tick's auto-fill.
- While ON + flying: the ✕ works (decline a board job → `declineJob` as today).
- Toggle OFF: auto-fill stops; queued + in-flight jobs finish (non-destructive). Once the
  flight is active and autopilot is OFF, the board's ✕ slot shows 🔒 again + the hint.

## UI Details

- **Autopilot toggle:** a button on the Fly view (placed just above or beside the queue
  strip). Label reflects state: `AUTOPILOT: ON` (highlighted) / `AUTOPILOT: OFF`. Only
  rendered when `state.autopilotOwned`.
- **Lock indicator:** `.job-lock` — same box dimensions as `.job-decline` (26×26, etc.)
  so the row doesn't shift; shows a 🔒 glyph, muted styling, `cursor:default`, no handler.
- **Hint line:** `.autopilot-hint` — small, muted text near the top of the job board
  (or just under the queue strip). Only present in the locked-while-flying state.
- **Shop card:** mirrors the plane-row layout; OWNED uses the existing `.owned` style,
  Buy uses `.buy-btn` with `data-buy-autopilot`.

## Error Handling / Edge Cases

- **Buy when owned / unaffordable:** `buyAutopilot` returns false (no-op).
- **Toggle when not owned:** `toggleAutopilot` returns false (the toggle isn't rendered
  anyway).
- **Autopilot ON but no takeable jobs** (e.g. all board jobs too big for current
  capacity): `bestTakeableJob` returns null; `autoFillQueue` stops. The board's
  anti-soft-lock (refillBoard guarantees a takeable job) means this is rare/transient.
- **Autopilot ON + queue full:** `autoFillQueue` does nothing (loop condition false).
- **Toggle OFF mid-flight:** in-flight + queued jobs finish; no new jobs added; ✕→🔒 on
  the board once it re-renders.
- **Old saves:** both flags default false via freshState merge.
- **Perk while idle:** idle always shows the working ✕ regardless of autopilot (you're not
  flying, so there's no flying-XOR-managing tension).

## Autopilot picking — $/sec definition

`bestTakeableJob()` maximizes `payout / effSeconds` where
`effSeconds = job.flightTime / currentStats().speed`. This matches how `startJob`
computes flight duration, so the picker optimizes the actual earnings rate the player
experiences. Only jobs with `cargo <= currentStats().capacity` are considered.

## Testing / Verification

Pure-logic (console-assert):
- `buyAutopilot` sets owned + deducts price; refuses when owned/unaffordable.
- `toggleAutopilot` flips only when owned.
- `bestTakeableJob` returns the highest $/sec takeable job; null when none takeable.
- `autoFillQueue` fills to `queueSize()` with takeable jobs when owned+ON; no-op when off;
  starts a flight from idle (first enqueue flies).

Browser:
- Shop shows the Autopilot card; buy it → OWNED; Fly view shows the toggle.
- Toggle ON from a parked state → a flight starts and the queue fills to full; flights
  chain (watch it auto-advance with the runway snap intact).
- While ON + flying: board rows show the working ✕ (decline one → it's replaced).
- Toggle OFF → queued jobs keep running; board ✕ becomes 🔒 once a flight is active, and
  the hint appears. Row spacing is identical with ✕ vs 🔒 (no shift).
- Solo (never bought): flying shows 🔒 + hint; no toggle.
- Persistence: autopilotOwned + autopilotOn survive reload (incl. ON resuming auto-fill).
- No console errors; mobile + desktop clean.
- Bundle the SW cache bump for the release.

## Code Structure

All in `sky-tycoon/index.html`:
- Config: `AUTOPILOT_PRICE`.
- State: `freshState()` (+ two flags).
- Actions: `buyAutopilot`, `toggleAutopilot`, `bestTakeableJob`, `autoFillQueue`.
- Loop: `tick()` calls `autoFillQueue` + conditional re-render.
- Render: `renderFly` (decline gate → ✕/🔒, hint, toggle), `renderShop` (Autopilot card).
- Events: `[data-buy-autopilot]`, `[data-autopilot-toggle]` in `onContentClick`.
- CSS: `.job-lock`, `.autopilot-hint`, `.autopilot-toggle` (+ on/off states).
- Plus `sky-tycoon/sw.js` cache bump.
