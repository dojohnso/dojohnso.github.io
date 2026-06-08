# Sky Tycoon — Job Queue + Queue Size Upgrade Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorming complete)
**Type:** Feature addition to the existing Sky Tycoon game

## Overview

Let the player line up jobs in a queue while a flight is in progress: tap a takeable
job mid-flight to add it to the queue, and completed flights automatically start the
next queued job. Add a global, account-level "Queue Size" upgrade that increases how
many jobs can be lined up. This is the foundation autopilot will later build on (an
autopilot just auto-fills the queue).

## Goals

- Tap a takeable job while flying to queue it (one-tap, same gesture as flying now).
- Flights auto-advance: when one lands, the next queued job takes off automatically.
- A visible, manageable queue strip on the FLY view (tap a slot to remove).
- A global Queue Size upgrade (persists across plane changes).
- Keep the queue-fill action isolated so autopilot can call it later.

## Non-Goals

- Concurrent flights (multiple planes in the air at once). Designed-for conceptually
  but explicitly deferred — the scene shows one plane and the flight model is single-flight.
- Autopilot itself. This slice builds the queue + size upgrade only.
- Reordering queued jobs (only add to back / remove). YAGNI for now.

## Current State (what this builds on)

- `state.jobs` — the board (BOARD_SIZE visible jobs).
- `state.activeFlight` — the single in-progress flight (or null).
- `startJob(job)` — isolated; sets activeFlight, computes flight time from CURRENT
  plane speed, saves. Returns true if started.
- `completeFlight()` — pays out, removes the flown job from the board, clears
  activeFlight, refills the board, saves.
- `declineJob(jobId)` — drops a BOARD job (✕ button), refills.
- Per-plane upgrades live in `state.planes[planeId]`; `currentStats()` reads them.

## Architecture / Data Model

**New state fields:**
- `state.queue` — array of job objects waiting to run, in order (front = next).
- `state.queueUps` — global account-level upgrade count for queue size (like the
  per-stat upgrade counts, but stored at the top level, NOT per-plane).

**Derived size:** `queueSize() = QUEUE_BASE + state.queueUps` where `QUEUE_BASE = 2`.
Max queue size 6, so `MAX_QUEUE_UPGRADES = 4`.

`freshState()` adds `queue: [], queueUps: 0`.

## Components / Functions

### New
- `queueSize()` — returns `QUEUE_BASE + state.queueUps` (current max queue length).
- `enqueueJob(job)` — if a flight is active, the job is takeable (cargo ≤ current
  capacity), and `state.queue.length < queueSize()`: remove it from `state.jobs`,
  push onto `state.queue`, refill the board, save, return true. Else return false.
  (Isolated so autopilot can call it later.)
- `dequeueJob(jobId)` — remove a job from `state.queue` by id (the removed job
  disappears; board refills to keep BOARD_SIZE). Save. Return true if removed.
- `buyQueueUpgrade()` — if `state.queueUps < MAX_QUEUE_UPGRADES` and affordable
  (climbing cost), deduct money, increment `state.queueUps`, save, return true.

### Modified
- `completeFlight()` — after payout/clear, if `state.queue.length > 0`: shift the
  front job and `startJob(it)` (auto-advance). The shifted job also needs removing
  from the board if still present (it was moved to the queue when enqueued, so it's
  NOT on the board — see "Job lifecycle" below). If the queue is empty, park as today.
- The FLY tap handler — when a flight is active and a takeable job is tapped, call
  `enqueueJob` instead of `startJob`. When no flight is active, `startJob` as today.
- `renderFly()` — render the queue strip above the job board; job rows remain
  tappable while flying (to queue) unless the queue is full.
- `renderUpgrade()` — add a third "Queue" card (global queueUps, segmented bar, MAX
  state) below Engine and Cargo Hold.

### Job lifecycle (precise)
- A job starts on the board (`state.jobs`).
- **Fly now** (no active flight): `startJob` uses it; it stays in `state.jobs` until
  `completeFlight` removes it (current behavior).
- **Queue it** (active flight): `enqueueJob` MOVES it from `state.jobs` → `state.queue`
  and refills the board. So a queued job is NOT on the board.
- **Auto-advance**: `completeFlight` shifts the front of `state.queue` and `startJob`s
  it. Because a queued job isn't on the board, `completeFlight`'s board-filter for the
  just-finished job only needs to handle the active job's id; the newly-started job
  came from the queue, not the board.
- **Remove from queue**: `dequeueJob` drops it entirely; board refills.

NOTE: the "fly now" path keeps the job on the board during flight (as today); the
"queue" path moves it off the board. `completeFlight` filters the just-finished
job's id out of `state.jobs` exactly as today — this is harmless whether that id is
present (fly-now job) or already absent (a job that had been queued). After the
filter + payout, it starts the next queued job. So the existing board-filter line
needs no change; only the auto-advance (shift queue → startJob) is added.

## Queue UI (FLY view)

A compact **queue strip** between the scene and the job board, shown whenever
`queueSize() > 0` (always, since base is 2):
- A label `QUEUE n/size` (e.g. "QUEUE 2/3").
- A horizontal row of `queueSize()` slots. Filled slots (in order) show a compact job
  chip: cargo icon + count and/or destination, marked #1, #2, …. Empty slots show a
  faint outline.
- Tap a filled slot → `dequeueJob` (removes it; board refills). Tap target is the slot.
- Job board sits below. While a flight is active, takeable job rows stay tappable to
  enqueue (a change from today, where the board fully disabled during a flight) —
  UNLESS the queue is full, in which case takeable rows are non-tappable.

## Upgrade View

Add a third card below Engine and Cargo Hold:
- Title: `Queue · Size <queueSize()>`.
- Segmented bar (same component as the per-stat bars) showing `queueUps` filled of
  `MAX_QUEUE_UPGRADES`, gold + "MAX" when capped.
- Button `Upgrade Queue — <cost>` (disabled if unaffordable), or the "MAXED" treatment
  when `queueUps >= MAX_QUEUE_UPGRADES`.
- Cost climbs steeply (powerful + permanent): `queueUpgradeCost(n)` → $50, $120, $250,
  $500 for n = 0,1,2,3. Implemented as a small lookup array `[50,120,250,500]`.

## Economy

- Queue base size 2; max 6 (4 upgrades).
- Costs: $50, $120, $250, $500 (the 4 successive upgrades). Steeper than the per-plane
  upgrades ($15/$30/…) because queue size is global and permanent.
- No change to existing plane/upgrade/job economy.

## Save / Migration

- `freshState()` includes `queue: [], queueUps: 0`.
- `load()`: the existing `Object.assign(freshState(), parsed)` supplies defaults for
  missing `queue`/`queueUps`. Add a guard: if `merged.queue` isn't an array, set `[]`
  (consistent with the existing `jobs` guard). `queueUps` defaults to 0 via freshState.
- Mid-flight reload: `queue` persists with `activeFlight`; on the next completeFlight
  the queue auto-advances. (Existing `startedAt` reconciliation for the active flight
  is unchanged.)
- `resetGame()` / New Game: `freshState()` already yields an empty queue + base size.

## Error Handling / Edge Cases

- **Queue full**: `enqueueJob` returns false; takeable board rows render non-tappable
  while flying + full.
- **Queue a too-big job**: not allowed (only takeable jobs can be tapped/queued), so a
  queued job can always run when its turn comes.
- **No active flight + tap**: flies immediately (`startJob`), never queues.
- **Switch/buy plane**: blocked mid-flight already; queue is account-level and untouched
  by plane changes. Queued jobs re-evaluate flight time at run time via `startJob`.
- **Decline (✕) on a board job**: unchanged (declines a board job, not a queued one).
- **Corrupt save**: non-array `queue` → `[]`.

## Autopilot Hook (deferred feature, designed now)

`enqueueJob(job)` is the single isolated entry point for adding to the queue. A future
autopilot just picks the best takeable board job and calls `enqueueJob` whenever the
queue has room — no other plumbing needed.

## Testing / Verification

Pure-logic console-assert tests:
- `enqueueJob` respects the size cap, only enqueues takeable jobs, requires an active
  flight, moves the job off the board.
- `completeFlight` auto-starts the next queued job (and parks when the queue is empty).
- `dequeueJob` removes the right job and refills the board.
- `buyQueueUpgrade` caps at MAX_QUEUE_UPGRADES, deducts the climbing cost.
- `queueSize()` = 2 + queueUps.

Browser verification:
- Start a flight, tap jobs → they appear in the queue strip (#1, #2…), board refills.
- Flight completes → next queued job auto-takes off; strip shifts.
- Tap a queue slot → removes it; board refills.
- Queue fills to size → further taps do nothing; rows non-tappable.
- Upgrade Queue → size increases, more slots appear; cost climbs; MAX at 6.
- Persistence: queue + queueUps survive reload (incl. mid-flight).
- No console errors; layout clean on mobile + desktop.
- Bundle the SW cache bump for the release.

## Code Structure

All in the single `sky-tycoon/index.html`:
- State: `freshState()` (+queue/queueUps), `load()` guard, `queueSize()`.
- Actions: `enqueueJob`, `dequeueJob`, `buyQueueUpgrade`, `completeFlight` auto-advance.
- Config: `QUEUE_BASE`, `MAX_QUEUE_UPGRADES`, `queueUpgradeCost`.
- Render: queue strip in `renderFly`, third card in `renderUpgrade`, tap handler change.
- Events: tap-to-queue (board), tap-to-remove (queue slot), queue upgrade button.
- Plus `sky-tycoon/sw.js` cache bump.
