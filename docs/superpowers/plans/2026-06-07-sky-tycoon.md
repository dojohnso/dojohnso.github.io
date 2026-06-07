# Sky Tycoon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file pixel-art idle/tap game prototype where the player takes flight jobs to earn money, upgrades plane stats (capacity/speed), and buys new plane tiers.

**Architecture:** One `index.html` with inline CSS + JS. Plain global state object, pure helper functions for economy math, action functions that mutate state, render functions that rebuild each view's DOM, and a single interval ticker that advances the active flight. State persists to localStorage. The "take a job" action is isolated in `startJob()` so a future autopilot feature can call it on a timer.

**Tech Stack:** Vanilla HTML/CSS/JS (no build tools), localStorage, pixel-art styling via CSS. Preview/serve via `npx serve`.

---

## File Structure

- **Create:** `sky-tycoon/index.html` — the entire game (HTML shell + inline `<style>` + inline `<script>`).
- **Modify:** `.claude/launch.json` — add a `sky-tycoon` serve config on port 3850.

The single file is logically sectioned in the `<script>`:
1. **Config/data** — `PLANES` table, tunable constants.
2. **State** — the `state` object + `save()`/`load()`.
3. **Pure helpers** — `upgradeCost`, `planeStats`, `generateJob`, `canTakeJob`.
4. **Actions** — `startJob`, `completeFlight`, `buyEngineUpgrade`, `buyCargoUpgrade`, `buyPlane`, `refillBoard`.
5. **Render** — `renderTopBar`, `renderFly`, `renderUpgrade`, `renderShop`, `setView`, `renderAll`.
6. **Loop** — `tick()` on an interval.
7. **Boot** — load, seed board, render, start ticker.

Testing approach: pure helpers (sections 3) are tested with inline `console.assert` checks run in the browser console / a temporary `?test` hook. UI and integration are verified manually with the preview tools. Each task ends with a commit.

---

## Task 1: Project scaffold + serve config

**Files:**
- Create: `sky-tycoon/index.html`
- Modify: `.claude/launch.json`

- [ ] **Step 1: Create the HTML shell**

Create `sky-tycoon/index.html` with a minimal pixel-styled shell — top bar, a scene area, a content card, and a bottom nav. No game logic yet; just static markup so we can confirm it serves and looks right.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Sky Tycoon</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  :root { --ink:#001a33; --gold:#ffd83a; --sky:#5c94fc; --sky2:#8fb6ff; --grass:#3a7d3a; }
  html, body { height: 100%; }
  body {
    font-family: 'Courier New', monospace;
    background: #11131d; color: #fff;
    display: flex; justify-content: center; align-items: center;
    image-rendering: pixelated;
  }
  #app {
    width: 100%; max-width: 420px; height: 100%; max-height: 760px;
    background: var(--sky); display: flex; flex-direction: column;
    position: relative; overflow: hidden;
  }
  /* top bar */
  #topbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 14px; background: var(--ink);
  }
  #money { font-size: 22px; font-weight: 800; color: var(--gold); text-shadow: 2px 2px 0 #000; }
  #planeName { font-size: 12px; opacity: .9; }
  /* scene */
  #scene {
    height: 180px; position: relative; overflow: hidden;
    background: linear-gradient(180deg, var(--sky) 0%, var(--sky2) 72%, var(--grass) 72%, var(--grass) 100%);
    flex-shrink: 0;
  }
  /* content card */
  #content { flex: 1; overflow-y: auto; padding: 12px; background: #1b2030; }
  /* bottom nav */
  #nav { display: flex; background: var(--ink); }
  .nav-btn {
    flex: 1; padding: 16px 0; text-align: center; font-weight: 800; font-size: 13px;
    color: #fff; background: var(--ink); border: none; border-top: 3px solid transparent;
    cursor: pointer; font-family: inherit; letter-spacing: 1px;
  }
  .nav-btn.active { color: var(--gold); border-top-color: var(--gold); }
</style>
</head>
<body>
  <div id="app">
    <div id="topbar">
      <div id="money">$0</div>
      <div id="planeName">Single Prop</div>
    </div>
    <div id="scene"></div>
    <div id="content"></div>
    <div id="nav">
      <button class="nav-btn active" data-view="fly">FLY</button>
      <button class="nav-btn" data-view="upgrade">UPGRADE</button>
      <button class="nav-btn" data-view="shop">SHOP</button>
    </div>
  </div>
<script>
  'use strict';
  // Game logic added in later tasks.
  document.getElementById('content').textContent = 'Loading…';
</script>
</body>
</html>
```

- [ ] **Step 2: Add the serve config**

Add this object to the `configurations` array in `.claude/launch.json` (after the `sky-tycoon-mockup` entry, keeping valid JSON):

```json
{
  "name": "sky-tycoon",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["serve", "/usr/local/var/www/dojohnso.github.io/sky-tycoon", "-l", "3850"],
  "port": 3850
}
```

- [ ] **Step 3: Serve and verify the shell renders**

Use `preview_start` with name `sky-tycoon`, navigate to `http://localhost:3850/`, and `preview_screenshot`.
Expected: pixel-styled phone frame with dark top bar showing "$0" in gold and "Single Prop", a sky/grass scene strip, a dark content area showing "Loading…", and a bottom nav with FLY highlighted in gold.

- [ ] **Step 4: Commit**

```bash
git add sky-tycoon/index.html .claude/launch.json
git commit -m "feat(sky-tycoon): scaffold shell + serve config"
```

---

## Task 2: Config data + pure economy helpers

**Files:**
- Modify: `sky-tycoon/index.html` (inside `<script>`)

- [ ] **Step 1: Add config data and the upgradeCost helper**

Replace the placeholder comment in `<script>` with the config table and the first helper. `upgradeCost` implements the user's formula: the Nth upgrade (0-indexed count already bought) costs `10 * count + 10` → $10, $20, $30, …

```js
  // ---- Config ----
  const PLANES = [
    { id: 'prop',  name: 'Single Prop', cap: 2,  speed: 1.0, price: 0 },
    { id: 'twin',  name: 'Twin Prop',   cap: 5,  speed: 1.4, price: 150 },
    { id: 'turbo', name: 'Turboprop',   cap: 10, speed: 2.0, price: 600 },
    { id: 'jet',   name: 'Small Jet',   cap: 20, speed: 3.0, price: 2500 },
  ];
  const CAP_STEP = 1;       // capacity gained per cargo-hold upgrade
  const SPEED_STEP = 0.15;  // speed gained per engine upgrade
  const BOARD_SIZE = 5;     // jobs visible at once

  // ---- Pure helpers ----
  // Cost of the next upgrade given how many of that stat you've already bought.
  function upgradeCost(count) { return 10 * count + 10; }
```

- [ ] **Step 2: Add planeStats helper**

Computes effective stats from a plane id plus how many of each upgrade have been bought on the current plane.

```js
  function planeStats(planeId, speedUps, capUps) {
    const base = PLANES.find(p => p.id === planeId);
    return {
      name: base.name,
      capacity: base.cap + capUps * CAP_STEP,
      speed: +(base.speed + speedUps * SPEED_STEP).toFixed(2),
    };
  }
```

- [ ] **Step 3: Add generateJob helper**

Generates one job scaled to the player's current capacity, so the board always offers a mix of takeable and stretch jobs. Uses `Math.random`. Cargo ranges from 1 up to ~1.5× capacity (so some jobs are locked). Payout scales with cargo and a small flight-time factor.

```js
  const CUSTOMERS = ['Mara','Theo','Iris','Gus','Pip','Nadia','León','Wren','Otto','Suki'];
  const PLACES = ['Riverside','Pine Bluff','Cedar Cove','Fox Hollow','Bayfield','Stonepark','Larkton','Mistport'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // capacity: player's current capacity, used to scale job size.
  function generateJob(capacity) {
    const maxCargo = Math.max(2, Math.round(capacity * 1.5));
    const cargo = 1 + Math.floor(Math.random() * maxCargo);
    const flightTime = 3 + Math.floor(Math.random() * 5);  // 3–7 base seconds
    const payout = Math.round((cargo * 5 + flightTime * 2) * (1 + Math.random() * 0.4));
    return {
      id: 'j' + Math.random().toString(36).slice(2, 9),
      customer: pick(CUSTOMERS),
      place: pick(PLACES),
      cargo, flightTime, payout,
    };
  }
```

- [ ] **Step 4: Add canTakeJob helper**

```js
  function canTakeJob(job, capacity) { return job.cargo <= capacity; }
```

- [ ] **Step 5: Add a temporary test hook and verify helpers in the console**

Add this block at the very end of the `<script>` (it only runs when the URL has `?test`):

```js
  if (location.search.includes('test')) {
    console.assert(upgradeCost(0) === 10, 'upgradeCost(0) should be 10');
    console.assert(upgradeCost(1) === 20, 'upgradeCost(1) should be 20');
    console.assert(upgradeCost(5) === 60, 'upgradeCost(5) should be 60');
    const s = planeStats('prop', 2, 3);
    console.assert(s.capacity === 5, 'prop +3 cap => 5, got ' + s.capacity);
    console.assert(s.speed === 1.3, 'prop +2 speed => 1.3, got ' + s.speed);
    console.assert(canTakeJob({cargo:2}, 2) === true, 'cargo 2 fits cap 2');
    console.assert(canTakeJob({cargo:3}, 2) === false, 'cargo 3 does not fit cap 2');
    const j = generateJob(2);
    console.assert(j.cargo >= 1 && j.payout > 0 && j.flightTime >= 3, 'generateJob shape');
    console.log('Sky Tycoon helper tests: done (check for assertion errors above)');
  }
```

- [ ] **Step 6: Run the tests in the browser**

Navigate to `http://localhost:3850/?test` (use `preview_eval` to set `window.location.href`), then read `preview_console_logs` with level `all`.
Expected: the log line "Sky Tycoon helper tests: done" appears with **no** `console.assert` failures above it.

- [ ] **Step 7: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "feat(sky-tycoon): config data + pure economy helpers with tests"
```

---

## Task 3: State + persistence

**Files:**
- Modify: `sky-tycoon/index.html` (inside `<script>`)

- [ ] **Step 1: Add the state object and save/load**

Add after the helpers. State holds money, current plane id, per-plane upgrade counts, the job board, and the active flight (or null).

```js
  // ---- State ----
  const SAVE_KEY = 'skyTycoonSave_v1';
  let state = null;

  function freshState() {
    return {
      money: 0,
      planeId: 'prop',
      speedUps: 0,
      capUps: 0,
      jobs: [],
      activeFlight: null, // { jobId, place, totalMs, elapsedMs, payout }
    };
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      // Merge onto fresh defaults so missing fields don't break older saves.
      return Object.assign(freshState(), parsed);
    } catch (e) { return freshState(); }
  }
```

- [ ] **Step 2: Add a currentStats convenience accessor**

```js
  function currentStats() { return planeStats(state.planeId, state.speedUps, state.capUps); }
```

- [ ] **Step 3: Extend the test hook to cover save/load round-trip**

Add inside the existing `if (location.search.includes('test'))` block, before the final `console.log`:

```js
    const snapshot = state; // may be null here; guard
    state = freshState(); state.money = 123; save();
    const reloaded = load();
    console.assert(reloaded.money === 123, 'save/load round-trips money, got ' + reloaded.money);
    localStorage.removeItem(SAVE_KEY);
    state = snapshot;
```

- [ ] **Step 4: Run tests**

Navigate to `http://localhost:3850/?test`, read `preview_console_logs`.
Expected: still no assertion failures; "done" line prints.

- [ ] **Step 5: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "feat(sky-tycoon): state object + localStorage persistence"
```

---

## Task 4: Actions (board, jobs, upgrades, plane purchase)

**Files:**
- Modify: `sky-tycoon/index.html` (inside `<script>`)

- [ ] **Step 1: Add board refill**

Keeps the board topped up to `BOARD_SIZE` jobs.

```js
  // ---- Actions ----
  function refillBoard() {
    const cap = currentStats().capacity;
    while (state.jobs.length < BOARD_SIZE) state.jobs.push(generateJob(cap));
  }
```

- [ ] **Step 2: Add startJob (isolated for future autopilot)**

Starts a flight if none is active and the job is takeable. Returns true if started.

```js
  function startJob(job) {
    if (state.activeFlight) return false;
    const cap = currentStats().capacity;
    if (!canTakeJob(job, cap)) return false;
    const totalMs = (job.flightTime / currentStats().speed) * 1000;
    state.activeFlight = {
      jobId: job.id, place: job.place,
      totalMs, elapsedMs: 0, payout: job.payout,
    };
    save();
    return true;
  }
```

- [ ] **Step 3: Add completeFlight**

Pays out, removes the finished job, refills the board, clears the active flight.

```js
  function completeFlight() {
    const f = state.activeFlight;
    if (!f) return;
    state.money += f.payout;
    state.jobs = state.jobs.filter(j => j.id !== f.jobId);
    state.activeFlight = null;
    refillBoard();
    save();
  }
```

- [ ] **Step 4: Add the two upgrade actions**

```js
  function buyEngineUpgrade() {
    const cost = upgradeCost(state.speedUps);
    if (state.money < cost) return false;
    state.money -= cost;
    state.speedUps += 1;
    save();
    return true;
  }

  function buyCargoUpgrade() {
    const cost = upgradeCost(state.capUps);
    if (state.money < cost) return false;
    state.money -= cost;
    state.capUps += 1;
    save();
    return true;
  }
```

- [ ] **Step 5: Add buyPlane (resets per-plane upgrade counters)**

```js
  function buyPlane(planeId) {
    const plane = PLANES.find(p => p.id === planeId);
    if (!plane || planeId === state.planeId) return false;
    if (state.money < plane.price) return false;
    state.money -= plane.price;
    state.planeId = planeId;
    state.speedUps = 0;
    state.capUps = 0;
    // New (larger) capacity may make current locked jobs takeable; board stays.
    save();
    return true;
  }
```

- [ ] **Step 6: Extend the test hook to cover actions**

Add inside the test block before the final `console.log`:

```js
    state = freshState();
    refillBoard();
    console.assert(state.jobs.length === BOARD_SIZE, 'board fills to BOARD_SIZE, got ' + state.jobs.length);

    // upgrade affordability
    state.money = 10;
    console.assert(buyCargoUpgrade() === true, 'can buy first cargo upgrade for $10');
    console.assert(state.money === 0 && state.capUps === 1, 'cargo upgrade deducts + increments');
    console.assert(buyCargoUpgrade() === false, 'cannot buy second upgrade with $0');

    // buying a plane resets counters
    state = freshState();
    state.money = 200; state.speedUps = 3; state.capUps = 4;
    console.assert(buyPlane('twin') === true, 'can buy twin for 150 with 200');
    console.assert(state.planeId === 'twin' && state.speedUps === 0 && state.capUps === 0,
      'buyPlane swaps plane and resets upgrade counts');
    console.assert(state.money === 50, 'buyPlane deducts price, got ' + state.money);

    // startJob / completeFlight
    state = freshState(); refillBoard();
    const takeable = state.jobs.find(j => j.cargo <= currentStats().capacity);
    const before = state.money;
    console.assert(startJob(takeable) === true, 'startJob starts a takeable job');
    console.assert(state.activeFlight !== null, 'activeFlight set after startJob');
    console.assert(startJob(takeable) === false, 'cannot start a second flight');
    completeFlight();
    console.assert(state.money === before + takeable.payout, 'completeFlight pays out');
    console.assert(state.activeFlight === null, 'activeFlight cleared after completeFlight');
    console.assert(state.jobs.length === BOARD_SIZE, 'board refilled after completeFlight');
    localStorage.removeItem(SAVE_KEY);
```

- [ ] **Step 7: Run tests**

Navigate to `http://localhost:3850/?test`, read `preview_console_logs`.
Expected: no assertion failures; "done" line prints.

- [ ] **Step 8: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "feat(sky-tycoon): actions for jobs, upgrades, plane purchase with tests"
```

---

## Task 5: Rendering + view switching

**Files:**
- Modify: `sky-tycoon/index.html` (inside `<script>`)

- [ ] **Step 1: Add money formatting + top bar render**

```js
  // ---- Render ----
  let currentView = 'fly';
  const $ = sel => document.querySelector(sel);

  function fmt(n) { return '$' + n.toLocaleString('en-US'); }

  function renderTopBar() {
    $('#money').textContent = fmt(state.money);
    $('#planeName').textContent = currentStats().name;
  }
```

- [ ] **Step 2: Add the FLY view render (scene + job board)**

Renders the active-flight progress if flying, otherwise the tappable job board. Job cards call `onTakeJob`.

```js
  function renderScene() {
    const scene = $('#scene');
    const f = state.activeFlight;
    if (f) {
      const pct = Math.min(100, Math.round((f.elapsedMs / f.totalMs) * 100));
      scene.innerHTML =
        '<div class="plane flying"></div>' +
        '<div class="flight-label">Flying to ' + f.place + '… ' + pct + '%</div>' +
        '<div class="progress"><i style="width:' + pct + '%"></i></div>';
    } else {
      scene.innerHTML = '<div class="plane idle"></div>';
    }
  }

  function renderFly() {
    renderScene();
    const cap = currentStats().capacity;
    const flying = !!state.activeFlight;
    const rows = state.jobs.map(job => {
      const ok = canTakeJob(job, cap) && !flying;
      const locked = !canTakeJob(job, cap);
      return (
        '<div class="job' + (ok ? '' : ' disabled') + '" ' +
          (ok ? 'data-job="' + job.id + '"' : '') + '>' +
          '<div class="job-main">' +
            '<div class="job-who">' + job.customer + ' → ' + job.place + '</div>' +
            '<div class="job-meta">📦 ' + job.cargo + '  ·  ' + job.flightTime + 's</div>' +
          '</div>' +
          '<div class="job-pay">' + fmt(job.payout) +
            (locked ? '<span class="lock">Need bigger plane</span>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');
    $('#content').innerHTML = '<div class="job-board">' + rows + '</div>';
  }
```

- [ ] **Step 3: Add the UPGRADE view render**

```js
  function renderUpgrade() {
    const st = currentStats();
    const engineCost = upgradeCost(state.speedUps);
    const cargoCost = upgradeCost(state.capUps);
    const canEngine = state.money >= engineCost;
    const canCargo = state.money >= cargoCost;
    $('#content').innerHTML =
      '<div class="up-card">' +
        '<div class="up-title">Engine · Speed ' + st.speed.toFixed(2) + '</div>' +
        '<button class="up-btn' + (canEngine ? '' : ' disabled') + '" data-up="engine">' +
          'Upgrade Engine — ' + fmt(engineCost) + '</button>' +
      '</div>' +
      '<div class="up-card">' +
        '<div class="up-title">Cargo Hold · Capacity ' + st.capacity + '</div>' +
        '<button class="up-btn' + (canCargo ? '' : ' disabled') + '" data-up="cargo">' +
          'Upgrade Cargo Hold — ' + fmt(cargoCost) + '</button>' +
      '</div>';
  }
```

- [ ] **Step 4: Add the SHOP view render**

```js
  function renderShop() {
    const rows = PLANES.map(p => {
      const owned = p.id === state.planeId;
      const affordable = !owned && state.money >= p.price;
      let right;
      if (owned) right = '<span class="owned">OWNED</span>';
      else right = '<button class="buy-btn' + (affordable ? '' : ' disabled') + '" data-plane="' +
                   p.id + '">' + fmt(p.price) + '</button>';
      return (
        '<div class="plane-row">' +
          '<div><div class="plane-name">' + p.name + '</div>' +
          '<div class="plane-stats">Cap ' + p.cap + ' · Spd ' + p.speed.toFixed(1) + '</div></div>' +
          right +
        '</div>'
      );
    }).join('');
    $('#content').innerHTML = '<div class="shop-list">' + rows + '</div>';
  }
```

- [ ] **Step 5: Add view switching + renderAll**

```js
  function renderCurrentView() {
    if (currentView === 'fly') renderFly();
    else if (currentView === 'upgrade') renderUpgrade();
    else if (currentView === 'shop') renderShop();
  }

  function renderAll() { renderTopBar(); renderCurrentView(); }

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === view));
    renderCurrentView();
  }
```

- [ ] **Step 6: Add the CSS for jobs/upgrades/shop/scene**

Add these rules inside the existing `<style>` block (before `</style>`):

```css
  /* scene plane + progress */
  .plane { position:absolute; width:48px; height:18px; top:60px; left:50%;
    transform:translateX(-50%); background:#e53935;
    box-shadow: -14px 0 0 0 #b71c1c, 14px -6px 0 0 #fff, 18px 0 0 0 #fff; }
  .plane.flying { animation: fly 1.2s linear infinite; }
  @keyframes fly { 0%{transform:translateX(-70px)} 100%{transform:translateX(70px)} }
  .flight-label { position:absolute; bottom:34px; width:100%; text-align:center;
    font-size:12px; font-weight:800; letter-spacing:1px; text-shadow:1px 1px 0 #003; }
  .progress { position:absolute; bottom:14px; left:14px; right:14px; height:12px;
    background:var(--ink); border:2px solid #fff; }
  .progress > i { display:block; height:100%; background:var(--gold); }
  /* job board */
  .job-board { display:flex; flex-direction:column; gap:8px; }
  .job { display:flex; justify-content:space-between; align-items:center;
    background:#252b3d; border:2px solid #3a425c;
    padding:10px 12px; cursor:pointer; }
  .job.disabled { opacity:.45; cursor:default; }
  .job-who { font-weight:800; font-size:13px; }
  .job-meta { font-size:11px; opacity:.8; margin-top:2px; }
  .job-pay { font-weight:800; color:var(--gold); text-align:right; font-size:14px; }
  .job-pay .lock { display:block; font-size:9px; color:#ff8a80; font-weight:400; margin-top:2px; }
  /* upgrade */
  .up-card { background:#252b3d; border:2px solid #3a425c; padding:12px; margin-bottom:10px; }
  .up-title { font-size:13px; font-weight:800; margin-bottom:8px; }
  .up-btn, .buy-btn { font-family:inherit; font-weight:800; font-size:13px; color:var(--ink);
    background:var(--gold); border:none; padding:12px; width:100%; cursor:pointer; }
  .up-btn.disabled, .buy-btn.disabled { background:#555c70; color:#9aa; cursor:default; }
  /* shop */
  .shop-list { display:flex; flex-direction:column; gap:8px; }
  .plane-row { display:flex; justify-content:space-between; align-items:center;
    background:#252b3d; border:2px solid #3a425c; padding:12px; }
  .plane-name { font-weight:800; font-size:14px; }
  .plane-stats { font-size:11px; opacity:.8; margin-top:2px; }
  .buy-btn { width:auto; padding:10px 16px; }
  .owned { color:#7cff7c; font-weight:800; font-size:12px; }
```

- [ ] **Step 7: Verify each view renders (wired up in Task 6, but check no JS errors)**

This task only defines functions; they're called in Task 6. Navigate to `http://localhost:3850/` and read `preview_console_logs` with level `error`.
Expected: no JavaScript errors (functions defined but not yet called is fine).

- [ ] **Step 8: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "feat(sky-tycoon): render functions + view switching + styles"
```

---

## Task 6: Wire it together — boot, events, ticker

**Files:**
- Modify: `sky-tycoon/index.html` (inside `<script>`)

- [ ] **Step 1: Add the ticker**

Advances the active flight; completes it when elapsed reaches total. Re-renders only the scene each tick (cheap), and the whole view on completion.

```js
  // ---- Loop ----
  const TICK_MS = 100;
  function tick() {
    if (state.activeFlight) {
      state.activeFlight.elapsedMs += TICK_MS;
      if (state.activeFlight.elapsedMs >= state.activeFlight.totalMs) {
        completeFlight();
        renderAll();
      } else if (currentView === 'fly') {
        renderScene();
      }
    }
  }
```

- [ ] **Step 2: Add event delegation**

One listener on `#content` handles job taps, upgrade taps, and plane buys; one on `#nav` handles view switching.

```js
  // ---- Events ----
  function onContentClick(e) {
    const jobEl = e.target.closest('[data-job]');
    if (jobEl) {
      const job = state.jobs.find(j => j.id === jobEl.dataset.job);
      if (job && startJob(job)) renderAll();
      return;
    }
    const upBtn = e.target.closest('[data-up]');
    if (upBtn) {
      const ok = upBtn.dataset.up === 'engine' ? buyEngineUpgrade() : buyCargoUpgrade();
      if (ok) renderAll();
      return;
    }
    const planeBtn = e.target.closest('[data-plane]');
    if (planeBtn) {
      if (buyPlane(planeBtn.dataset.plane)) renderAll();
      return;
    }
  }

  function onNavClick(e) {
    const btn = e.target.closest('.nav-btn');
    if (btn) setView(btn.dataset.view);
  }
```

- [ ] **Step 3: Add boot**

Loads state, ensures the board is full, wires events, renders, and starts the ticker. Replace the old `document.getElementById('content').textContent = 'Loading…';` line with this boot call at the end of the script (but keep the `?test` block after it).

```js
  // ---- Boot ----
  function boot() {
    state = load();
    refillBoard();
    save();
    $('#content').addEventListener('click', onContentClick);
    $('#nav').addEventListener('click', onNavClick);
    setView('fly');
    renderAll();
    setInterval(tick, TICK_MS);
  }
  boot();
```

- [ ] **Step 4: Verify the full game loop manually**

Navigate to `http://localhost:3850/`. Then:
1. `preview_screenshot` — confirm the job board shows ~5 jobs, some possibly dimmed with "Need bigger plane".
2. `preview_click` a takeable (non-dimmed) job → `preview_screenshot` → confirm the scene shows a flying plane + progress bar, and the board is disabled.
3. Wait ~3s, `preview_screenshot` → confirm money increased and a fresh job board is shown.
4. `preview_click` the UPGRADE nav button → `preview_screenshot` → confirm two upgrade buttons with $10 costs.
5. If affordable, `preview_click` "Upgrade Cargo Hold" → `preview_screenshot` → confirm capacity went up and the button now shows $20.
6. `preview_click` the SHOP nav → `preview_screenshot` → confirm 4 planes, Single Prop "OWNED".

Read `preview_console_logs` level `error` → expect none.

- [ ] **Step 5: Verify persistence**

In the browser, reload via `preview_eval` (`window.location.reload()`), then `preview_screenshot`.
Expected: money and any upgrades persist across the reload (board may differ only if a flight was mid-air; money is retained).

- [ ] **Step 6: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "feat(sky-tycoon): wire boot, events, and flight ticker — playable prototype"
```

---

## Task 7: Polish pass + remove test hook

**Files:**
- Modify: `sky-tycoon/index.html`

- [ ] **Step 1: Balance check via play**

Play through (or fast-forward by editing `state.money` in `preview_eval` for testing only) and confirm: the first $10 upgrade is reachable after 1–2 flights; Twin Prop ($150) is a meaningful but achievable goal; locked jobs become takeable after capacity upgrades. If the curve feels off, adjust `CAP_STEP`, `SPEED_STEP`, or the payout formula in `generateJob`, then re-verify with a screenshot. Document any constant changes in the commit message.

- [ ] **Step 2: Remove the temporary test hook**

Delete the entire `if (location.search.includes('test')) { … }` block from the end of the script. (It was a development aid; the prototype ships without it.)

- [ ] **Step 3: Final verification**

Navigate to `http://localhost:3850/`, `preview_screenshot`, and read `preview_console_logs` level `error`.
Expected: clean play, no errors, no leftover test logging.

- [ ] **Step 4: Resize check (mobile target)**

`preview_resize` to preset `mobile` (375x812), `preview_screenshot`.
Expected: the app fills the phone viewport cleanly, nav reachable, no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add sky-tycoon/index.html
git commit -m "chore(sky-tycoon): balance pass + remove dev test hook"
```

---

## Self-Review Notes

- **Spec coverage:** core loop (Tasks 4,6), two stats (Task 2), two-button upgrade with per-stat climbing cost (Tasks 4,5), shop tiers + counter reset (Task 4), job board refresh (Task 4 `completeFlight`/`refillBoard`), locked jobs (Tasks 2,5), pixel art + single-file vanilla (Tasks 1,5), localStorage save (Task 3), autopilot hook = isolated `startJob` (Task 4). All covered.
- **Deferred per spec:** autopilot automation, map/range, multi-flight, custom Aseprite art — not in this plan by design.
- **Type consistency:** `startJob`, `completeFlight`, `buyEngineUpgrade`, `buyCargoUpgrade`, `buyPlane`, `refillBoard`, `currentStats`, `planeStats`, `upgradeCost`, `generateJob`, `canTakeJob` referenced consistently across tasks. State fields (`speedUps`, `capUps`, `planeId`, `jobs`, `activeFlight`, `money`) consistent throughout.
