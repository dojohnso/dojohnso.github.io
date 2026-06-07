# Sky Tycoon — Multiple Owned Planes + Switching Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorming complete)
**Type:** Feature change to the existing Sky Tycoon game (data-model change + bug fix)

## Overview

Let the player own multiple planes at once and freely switch between which one
they fly, with each plane remembering its own upgrades. Fix the Shop bug where the
currently-owned plane shows a "$0" buy button. When a plane is selected in the Shop,
the scene plane at the top updates immediately.

## Goals

- Own every plane you've bought; switch between owned planes anytime (when not flying).
- Each owned plane keeps its own Engine/Cargo upgrade levels.
- Shop shows three clear states per plane: FLYING / Switch / Buy.
- Selecting (switch or buy) updates the top scene plane immediately.
- Migrate existing saves with no progress loss.

## Non-Goals

- Selling planes back / refunds.
- Switching planes mid-flight (explicitly blocked).
- Any change to plane tiers, prices, stats, or upgrade caps.

## Current State (what changes)

Today the game models a SINGLE plane:
- `state.planeId` — the one plane.
- `state.speedUps`, `state.capUps` — that plane's upgrades, **reset to 0 on buy**.
- `buyPlane(id)` replaces the plane and wipes upgrades.
- Shop marks the current plane "OWNED" and others show a price Buy button. Because
  ownership is keyed solely off `p.id === state.planeId`, the shop has no concept of
  "owned but not currently flown." The user-reported symptom is a cost button showing
  on a plane that should not be purchasable again. The new three-state rendering
  (FLYING / Switch / Buy, keyed off `state.planes` membership) removes any cost button
  from owned planes entirely, fixing it regardless of the exact prior trigger.

## Architecture / Data Model

Replace the single-plane fields with per-plane ownership:

- `state.planeId` — **kept**: id of the plane currently being flown.
- `state.planes` — **new**: object mapping owned plane id → its upgrades:
  `{ prop: { speedUps: 0, capUps: 0 }, twin: { speedUps: 0, capUps: 2 }, ... }`.
  Only owned planes are keys.
- `state.speedUps` / `state.capUps` — **removed** as top-level fields; upgrade counts
  now live at `state.planes[state.planeId].speedUps` / `.capUps`.

`freshState()` returns `planeId: 'prop'` and `planes: { prop: { speedUps: 0, capUps: 0 } }`
(you own the starter prop immediately).

### Helper: current plane's upgrades
Add `curPlane()` returning `state.planes[state.planeId]` (the active plane's upgrade
record). All reads/writes of the current plane's upgrades go through it.

### Save migration (in `load()`)
An existing save has the OLD shape (top-level `speedUps`/`capUps`, no `planes`). After
the existing `Object.assign(freshState(), parsed)` merge, detect a legacy save and
migrate:
- If `parsed.planes` is missing/not an object: build
  `state.planes = { [planeId]: { speedUps: parsed.speedUps||0, capUps: parsed.capUps||0 } }`
  so the current plane keeps its upgrades. (Older planes the player "passed through"
  weren't retained in the old model, so they're simply not owned — acceptable; the
  player keeps their current plane fully intact.)
- Ensure `state.planes[state.planeId]` always exists (fallback `{speedUps:0,capUps:0}`)
  so a corrupt/partial save can't crash stat reads.
- Drop the now-meaningless top-level `speedUps`/`capUps` (harmless if left, but clean
  them so they don't mislead).

## Components / Functions

### Modified
- `planeStats(planeId, speedUps, capUps)` — unchanged signature; callers pass the
  per-plane upgrade counts.
- `currentStats()` — reads `curPlane()`: `planeStats(state.planeId, curPlane().speedUps, curPlane().capUps)`.
- `buyEngineUpgrade()` / `buyCargoUpgrade()` — operate on `curPlane().speedUps` /
  `curPlane().capUps` (cap check, deduct money, increment, save). Behavior identical,
  just sourced per-plane.
- `buyPlane(id)` — deduct price; add `state.planes[id] = { speedUps: 0, capUps: 0 }`;
  set `state.planeId = id` (start flying the new plane); save. Refuses if already
  owned, unaffordable, or `id` invalid.
- `renderUpgrade()` / `renderTitle()`/stat panel — wherever `state.speedUps`/
  `state.capUps` were read, read `curPlane().speedUps`/`.capUps` instead.
- `renderShop()` — three states per row (see below).
- `renderScene()` already keys on `state.planeId` via `sceneKeyFor`, so switching
  re-renders the sprite with no extra work.

### New
- `curPlane()` — returns `state.planes[state.planeId]`.
- `switchPlane(id)` — if `state.activeFlight` is set → return false (blocked
  mid-flight); if `id` not owned or already current → false; else
  `state.planeId = id`, save, return true.

## Shop Rendering (three states)

For each plane `p` in `PLANES`:
- **`p.id === state.planeId`** → a `FLYING` label (styled like the old OWNED label).
  No button. (Fixes the "$0" bug.)
- **owned but not current** (`state.planes[p.id]` exists) → a `Switch` button
  (`data-switch="<id>"`), disabled when `state.activeFlight` is set.
- **not owned** → a price Buy button (`data-plane="<id>"`), disabled when
  `state.money < p.price`. (Unchanged from today.)

## Event Handling

Extend `onContentClick`: add a `[data-switch]` branch BEFORE the existing
`[data-plane]` branch — if a switch control is clicked, call `switchPlane(id)` and
`renderAll()` on success. The existing `[data-plane]` (buy) branch is unchanged.

## Immediate Scene Update

`buyPlane` and `switchPlane` both lead to `renderAll()` (via the click handler).
`renderAll()` calls `renderTopBar()` + `renderCurrentView()`; `renderCurrentView()`
on the Shop view calls `renderShop()`, and `renderTopBar()` updates the plane name —
but the SCENE is updated by `renderScene()`, which `renderShop()` does not call.

To make the top scene plane swap immediately while on the Shop view, `renderAll()`
must also refresh the scene. Simplest correct approach: have `renderAll()` call
`renderScene()` directly (in addition to `renderTopBar()` + `renderCurrentView()`),
since the scene is always visible regardless of which view is active. `renderScene()`
is cheap and cache-guarded (`sceneKeyFor`), so calling it every `renderAll()` only
rebuilds the shell when the plane tier or flight state actually changed.

## Error Handling / Edge Cases

- Switch attempted mid-flight → `switchPlane` returns false; the Switch button is also
  rendered disabled, so it's both visually and functionally blocked.
- Corrupt/legacy save → migration guarantees `state.planes[state.planeId]` exists.
- Buying a plane you already own → refused (it shows FLYING or Switch, not Buy).
- Switching to the plane you're already flying → refused (it shows FLYING, no button).
- `resetGame()` → `freshState()` already yields `planes: { prop: {...} }`.

## Testing / Verification

Manual via preview tools:
- Fresh game: own only prop (FLYING in shop, others Buy).
- Buy Twin → now own prop + twin; twin is FLYING, prop shows Switch, turbo/jet Buy.
- Switch to prop → scene plane swaps to prop IMMEDIATELY while still on the Shop view;
  stat panel shows prop's stats.
- Upgrade twin's cargo, switch to prop, switch back to twin → twin still has its cargo
  upgrade (per-plane upgrades preserved).
- During an active flight: all Switch buttons disabled; `switchPlane` refuses.
- Old-format save (top-level speedUps/capUps) loads → current plane keeps its upgrades,
  `state.planes` built, no crash.
- No console errors; layout clean on mobile + desktop.
- Bundle SW cache bump (v4) for the release.

## Code Structure

All changes in the single `sky-tycoon/index.html`:
- State: `freshState()` shape, `load()` migration, new `curPlane()`.
- Actions: `buyPlane`, new `switchPlane`, upgrade actions, `currentStats`.
- Render: `renderShop()` three states, `renderAll()` adds `renderScene()`, upgrade/
  stat reads via `curPlane()`.
- Events: `[data-switch]` branch in `onContentClick`.
- Plus `sky-tycoon/sw.js` cache bump to `v4`.
