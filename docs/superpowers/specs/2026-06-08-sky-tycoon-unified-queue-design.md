# Sky Tycoon — Unified Queue (active flight in the strip) Design Spec

**Date:** 2026-06-08
**Status:** Approved (brainstorming complete)
**Type:** UX refinement of the existing job-queue feature

## Overview

Refine the job queue so the currently-flying job lives in the queue strip (slot 0)
with a gold progress fill, instead of popping out the moment it starts. The queue
strip becomes a unified "active flight + everything lined up" list. Also change the
queue card content to show the **$ reward** (instead of cargo count).

## Goals

- The active flight always occupies queue slot 0 and shows a progress fill there
  (moving the fill from the board job-row to the queue card).
- A queued/flying job stays in the strip until it COMPLETES (occupying a slot during
  its flight) — accepted tradeoff.
- Queue cards show name (destination) + $reward.
- Unify "flying" and "queued": the strip shows the active flight first, then waiting
  jobs. The board no longer highlights the flying job.

## Current State (what changes)

- `state.queue` = waiting jobs only; `state.activeFlight` is separate. `enqueueJob`
  requires an active flight and queue room; `completeFlight` does
  `startJob(state.queue.shift())` to auto-advance — so a job LEAVES the queue the
  instant it starts flying.
- `queueSize()` = `QUEUE_BASE(2) + queueUps` and means "waiting jobs allowed".
- The board's active job row gets `class active` + `data-active-job` + `--pct` for the
  in-flight gold fill; `renderFly`'s `ok` excludes the active row.

## New Model

**`state.queue[0]` is always the currently-flying job (when a flight is active).**
The queue is now "active flight + waiting jobs", and `queueSize()` counts TOTAL slots
(active + waiting). So size 2 = 1 flying + 1 waiting; size 6 = 1 flying + 5 waiting.

### Lifecycle
- **Tap a board job** (`enqueueJob`): allowed whenever `state.queue.length < queueSize()`
  AND the job is takeable — regardless of whether a flight is active. Push the job to
  `state.queue`. THEN: if no flight is currently active (the job is now at `queue[0]`),
  `startJob(it)`.
- **Active flight = `state.queue[0]`.** It stays there for the whole flight.
- **`completeFlight`**: pays out the active flight, then `state.queue.shift()` (remove
  the finished job from the front), clear `activeFlight`, and if `state.queue` is now
  non-empty, `startJob(state.queue[0])` (the new front becomes active). Refill board, save.
- **Remove (tap-to-remove)**: only WAITING slots (index ≥ 1) are removable via
  `dequeueJob`. The flying job (slot 0) is NOT removable — tapping it does nothing.

### queueSize() semantics
Unchanged formula (`QUEUE_BASE + queueUps`), but now interpreted as total slots. The
strip renders `queueSize()` slots; slot 0 (if a flight is active) is the flying job.
The Upgrade card copy stays "Queue · Size N" (N total slots).

## Components / Functions

### Modified
- `enqueueJob(job)` — new gate: `if (state.queue.length >= queueSize()) return false;`
  and `if (!canTakeJob(job, currentStats().capacity)) return false;` (NO active-flight
  requirement). Push to queue. If `!state.activeFlight`, `startJob(job)` (it's now front).
  Refill board, save, return true. (Still the autopilot hook.)
- `completeFlight()` — pays out; `state.queue.shift()`; `state.activeFlight = null`; if
  `state.queue.length > 0`, `startJob(state.queue[0])`; refill board; save. (No more
  filter of `state.jobs` by the finished job's id — the flown job lives in the queue,
  not the board, so that filter is removed. The board never contained the flying job
  after enqueue moved it off.)
- `dequeueJob(jobId)` — refuse to remove `state.queue[0]` while a flight is active (the
  flying job). Otherwise remove a waiting job, refill, save. (Guard: if
  `state.activeFlight && state.queue[0] && state.queue[0].id === jobId` → return false.)
- `renderFly()` — board rows: drop the `active`/`data-active-job`/`--pct` handling
  entirely (the fill moves to the queue strip). A board row is tappable (`ok`) when
  `takeable && state.queue.length < queueSize()`. (A job that's been enqueued is already
  off the board, so no need to special-case the active job here.)
- `queueStripHTML()` — each filled slot shows: destination (place) + `$reward`. Slot 0,
  when a flight is active, gets `class queue-slot filled active`, a `--pct` style, and
  NO `data-dequeue` (not removable). Waiting slots (index ≥ 1) get `data-dequeue` and
  are removable. Empty slots unchanged.
- `updateActiveJobProgress()` — now targets the active queue slot's `--pct` (the
  `.queue-slot.active` element) instead of a board `[data-active-job]` row.
- The tick / `renderScene` flow that drives `updateActiveJobProgress` is unchanged in
  trigger; only its target element changes.

### CSS
- `.queue-slot.active` — the gold progress fill, adapting the existing `.job.active::before`
  approach (a `::before` whose width tracks `--pct`, gold gradient). Reuse the same
  visual language. The slot must be `position:relative; overflow:hidden` for the fill.
- Remove (or leave unused) the board `.job.active` fill styling — the board no longer
  marks an active job. (Leave the CSS rule in place is harmless, but the `data-active-job`
  markup is gone, so it simply never applies. Prefer leaving the CSS to minimize churn;
  the spec does not require deleting it.)

## Data Flow

- Idle, tap job A → `enqueueJob(A)`: queue=[A]; no active flight → `startJob(A)`;
  A is now `activeFlight` and `queue[0]`, shown flying in slot 0 with fill.
- While A flies, tap job B → `enqueueJob(B)`: queue=[A,B] (room permitting); A still
  flying; B waits in slot 1.
- A completes → `completeFlight`: pay A; `queue.shift()` → queue=[B]; `startJob(B)`;
  B now flying in slot 0.
- Tap slot 1 (a waiting job) → `dequeueJob` removes it. Tap slot 0 (flying) → no-op.

## Save / Migration

The save persists `queue` + `activeFlight` + `queueUps`. With the new model, the
invariant is "if `activeFlight` exists, `queue[0]` is its job". Existing saves used the
OLD model (queue = waiting only, activeFlight separate, activeFlight's job NOT in queue).

`load()` migration: after the existing merges/guards, if `merged.activeFlight` exists
and (`merged.queue` is empty OR `merged.queue[0].id !== merged.activeFlight.jobId`),
unshift a job object for the active flight to the front of `merged.queue` so the
invariant holds. Build that job object from `activeFlight`'s fields plus what's needed
for display: the queue slot shows place + payout, both present on `activeFlight`
(`place`, `payout`); cargo/flightTime aren't needed for the slot. To be safe, synthesize
`{ id: activeFlight.jobId, place: activeFlight.place, payout: activeFlight.payout,
cargo: 1, flightTime: 1 }` — the cargo/flightTime are placeholders never used again
(the flight's timing lives in `activeFlight`; on completion the job is shifted out and
discarded). NOTE: clamp so the migrated queue does not exceed `queueSize()` after the
unshift is acceptable — if it would exceed, still unshift (the flying job must be
represented); the over-cap is transient and resolves as the flight completes.

`freshState()` unchanged (`queue: []`, `queueUps: 0`).

## Error Handling / Edge Cases

- **Tap the flying slot (slot 0)**: no-op (no `data-dequeue`). Cannot cancel a flight.
- **Queue full**: board rows non-tappable (`queue.length >= queueSize()`).
- **Mid-flight reload**: `activeFlight` restored; migration ensures `queue[0]` is the
  flying job; `updateActiveJobProgress` fills slot 0 from `activeFlight.elapsedMs`.
- **completeFlight with only the flying job in queue**: shift → queue empty → no new
  `startJob` → parked.
- **Switch/buy plane**: blocked mid-flight (unchanged); queue is account-level.
- **Too-big jobs**: still only takeable jobs enqueue.

## Testing / Verification

Pure-logic (console-assert):
- `enqueueJob` works with no active flight (starts it) and while flying (queues); respects
  total-slot cap; only takeable.
- After `enqueueJob` with no flight, `state.queue[0].id === state.activeFlight.jobId`.
- `completeFlight` shifts the finished job and promotes the next to flying; parks when none.
- `dequeueJob` refuses slot 0 while flying; removes waiting jobs.
- `queueSize()` total-slot interpretation: with size 2 and a flight active, only 1 more
  job can be queued.
- Migration: an old-format save (activeFlight not in queue) loads with the flying job at
  `queue[0]`.

Browser:
- Tap a board job → it appears in queue slot 0 with a gold fill that advances; scene flies.
- Queue another → slot 1 fills; tap slot 1 → removed; tap slot 0 → nothing.
- Queue card shows place + $reward (not cargo count).
- Auto-advance: when slot 0's flight completes, slot 1's job slides to slot 0 and starts
  flying with the fill; the runway snap (existing) still works.
- Persistence across reload (incl. mid-flight: flying job in slot 0 with fill).
- No console errors; mobile + desktop clean.
- Bundle the SW cache bump for the release.

## Code Structure

All in `sky-tycoon/index.html`:
- Actions: `enqueueJob`, `completeFlight`, `dequeueJob`.
- Render: `renderFly` (board rows simplified), `queueStripHTML` (place + $reward,
  active slot 0 with fill + no dequeue), `updateActiveJobProgress` (target the queue slot).
- CSS: `.queue-slot.active` fill (relative/overflow + `::before` width `--pct`).
- State: `load()` migration to put the flying job at `queue[0]`.
- Plus `sky-tycoon/sw.js` cache bump.
