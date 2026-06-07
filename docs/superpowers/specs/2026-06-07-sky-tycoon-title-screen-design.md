# Sky Tycoon — Title Screen + Reset Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorming complete)
**Type:** Feature addition + bundled bug fix to the existing Sky Tycoon game

## Overview

Add a top-level title/home screen to Sky Tycoon so players can start a new game
(reset progress) or continue an existing one, with a home button in-game to return
to the title. Bundle a fix for the iPad sticky-hover bug on the decline (✕) button.

The game currently boots straight into play with no way to reset progress. This adds
a `title` screen above the existing in-game views (Fly/Upgrade/Shop).

## Goals

- A pixel-styled title screen matching the game's look.
- Reset-to-fresh ("New Game") with a confirmation guard (kid-safe).
- "Continue" to resume an existing save.
- A home button in-game to return to the title.
- Fix the decline-✕ sticky hover on touch devices.

## Non-Goals

- Multiple save slots / named saves.
- Pausing flights while on the title (flights keep running — wall-clock based).
- Settings, sound toggles, high-score tracking, or other title-menu items.

## Architecture

Introduce a top-level **screen** state distinct from the existing in-game **views**:

- `screen`: `'title'` | `'game'` — which top-level screen is shown.
- `currentView` (existing): `'fly'` | `'upgrade'` | `'shop'` — the in-game sub-view.

When `screen === 'title'`: show the title overlay; hide/ignore the game chrome.
When `screen === 'game'`: the current experience (top bar + scene + content + nav).

`screen` is **transient UI state**, NOT persisted (a reload always returns to the
title screen by design; the *game* save is what persists). The game save remains
the existing `localStorage` `skyTycoonSave_v1`.

## Components

### Title screen (DOM)
A full-screen overlay element `#title` (sibling of `#app`, or an overlay within it),
shown/hidden by toggling a class. Contents:
- Sky-blue background reusing the drifting-cloud styling.
- The red plane sprite (`--spr-prop`) and the title text "✈ Sky Tycoon".
- A button area whose contents depend on whether a save exists (see Flow).
- A confirmation sub-panel (hidden by default) for New Game.

### Home button (DOM)
A small pixel home-icon button added to the **top-left of `#topbar`**, before
`#money`. Uses a `data-home` attribute for event delegation.

### Functions (script)
- `hasSave()` → boolean: whether `localStorage[SAVE_KEY]` exists and parses.
- `showTitle()`: set `screen='title'`, render the title screen (correct buttons
  for save state), reveal `#title`, hide game chrome. Saves first if in-game.
- `startGame()`: set `screen='game'`, hide `#title`, ensure board filled, render all.
  Used by both Continue and (post-reset) New Game.
- `resetGame()`: remove the save, rebuild `state = freshState()`, refill board, save.
- `renderTitle()`: build the title button area (Continue+New, or single Start) and
  bind nothing extra (handled by delegation).
- New-Game confirm is a two-step within the title: show confirm panel → Erase
  (calls `resetGame()` then `startGame()`) or Cancel (hide panel).

### Boot change
`boot()` currently calls `setView('fly'); renderAll();` and starts the ticker.
Change so boot wires listeners + starts the ticker as today, but lands on the
**title** screen via `showTitle()` instead of showing the game immediately. The
ticker keeps running regardless of screen (a flight in progress keeps advancing;
the scene just isn't visible while on the title).

## Data Flow

- **Load app** → `boot()` → `state = load()` (existing) → `showTitle()`.
  - `renderTitle()` checks `hasSave()`:
    - save present → "Continue" + "New Game"
    - no save → "Start Game"
- **Continue / Start Game** → `startGame()` → game visible, resumes `state`.
- **New Game** → confirm panel → **Erase** → `resetGame()` + `startGame()`;
  **Cancel** → hide confirm panel, stay on title.
- **Home button (in-game)** → `save()` + `showTitle()`. Active flight keeps
  ticking; returning via Continue shows correct progress (wall-clock based).

## Event Handling

Extend the existing delegated click handling:
- Title screen clicks: a listener on `#title` handles `[data-title-action]`
  values: `start`, `continue`, `new`, `confirm-new`, `cancel-new`.
- Home button: handled via the top bar; add a listener on `#topbar` (or extend an
  existing one) for `[data-home]`.

## Bug Fix: iPad sticky hover on decline ✕

**Symptom:** After tapping the decline (✕) on iPad, the red `:hover`/`:active`
highlight sticks on whatever job slides into that row position.

**Cause:** Touch devices fire no pointer-leave, so `:hover` styles persist after tap.

**Fix:** Wrap the `.job-decline:hover` rule in `@media (hover: hover)` so the red
hover highlight only applies to devices with a real hovering pointer (mouse). Keep
`:active` (or rely on the tap simply re-rendering the board) so touch gets feedback
without a stuck state. No behavior change on desktop.

## Error Handling / Edge Cases

- `hasSave()` wraps parse in try/catch; a corrupt save counts as "no save"
  (shows Start Game), consistent with existing `load()` resilience.
- Home button while a flight is active: save persists `activeFlight` with its
  `startedAt`; Continue + tick reconcile elapsed time (existing behavior).
- New Game while a flight is active: `resetGame()` clears `activeFlight` (fresh state).
- Reload always returns to title (screen not persisted) — intended.

## Testing / Verification

Manual via preview tools:
- Fresh install (no save) → title shows single "Start Game"; tapping it enters game.
- After playing + returning: title shows "Continue" + "New Game"; Continue resumes
  money/plane/upgrades.
- New Game → confirm panel → Erase wipes to $0 / Single Prop / no upgrades; Cancel
  keeps progress.
- Home button returns to title mid-game; a flight in progress still completes and
  pays out (verify via Continue after waiting).
- Decline ✕: confirm the `:hover` red rule is gated behind `@media (hover: hover)`
  so it cannot stick on touch.
- No console errors; layout clean on mobile + desktop.

## Code Structure

All changes in the single `sky-tycoon/index.html`:
- CSS: `#title` overlay + buttons + confirm panel; home-button styling; the
  `@media (hover: hover)` guard on `.job-decline:hover`.
- HTML: `#title` overlay markup; home button in `#topbar`.
- Script: `screen` state, `hasSave`/`showTitle`/`startGame`/`resetGame`/`renderTitle`,
  title + home event handling, and the `boot()` change to start on the title.
