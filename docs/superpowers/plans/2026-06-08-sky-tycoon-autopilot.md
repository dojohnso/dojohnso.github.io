# Sky Tycoon Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add autopilot — a one-time Shop purchase ($5,000) that, when toggled ON, auto-fills the job queue with the best $/sec takeable jobs (flights chain) and unlocks board management while flying (the decline ✕ returns; otherwise a 🔒 shows in its place).

**Architecture:** Two account-level booleans (`autopilotOwned`, `autopilotOn`). A pure `bestTakeableJob()` picker + an `autoFillQueue()` loop reusing the existing isolated `enqueueJob` hook; `autoFillQueue` runs each 100ms `tick()`. `renderFly`'s decline-button gate becomes `locked = flying && !(owned && on)`: locked → 🔒 + hint; else → working ✕; owned → an AUTOPILOT ON/OFF toggle. A Shop card sells it.

**Tech Stack:** Vanilla HTML/CSS/JS in the single file `sky-tycoon/index.html` (+ a one-line cache bump in `sky-tycoon/sw.js`). No build tools. Verified via the preview tools (`preview_*`). Save under `localStorage` key `skyTycoonSave_v1`.

---

## Commit policy (IMPORTANT — overrides the skill's per-task commit)

The user requires explicit confirmation before any `git commit`. **Implementer subagents must NOT run `git commit`** — they make the changes, run `node --check`, and report. The controller verifies in-browser and commits the batch only after the user OKs. Each task below ends with "report (do NOT commit)".

A reusable SW-clear snippet, referred to as **[SW-CLEAR]** (controller runs these via preview_eval):
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```
Note: the local `npx serve` can choke on a `?test` query — prefer running the console-assert checks INLINE via `preview_eval` against the loaded page (the controller does this), rather than navigating to `?test`.

---

## File Structure

All changes in **`/usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`** plus a one-line bump in `sky-tycoon/sw.js`:
- **Config + State:** `AUTOPILOT_PRICE`; `freshState()` (+ two flags).
- **Actions:** `buyAutopilot`, `toggleAutopilot`, `bestTakeableJob`, `autoFillQueue`.
- **Loop:** `tick()` calls `autoFillQueue` + conditional re-render.
- **Render:** `renderFly` (decline gate ✕/🔒, hint, toggle), `renderShop` (Autopilot card).
- **Events:** `[data-buy-autopilot]`, `[data-autopilot-toggle]` in `onContentClick`.
- **CSS:** `.job-lock`, `.autopilot-hint`, `.autopilot-toggle` (+ on/off).

---

## Task 1: Config + state + actions (buy, toggle, picker, autofill)

**Files:**
- Modify: `sky-tycoon/index.html` (Config, State, Actions)

- [ ] **Step 1: Add the price constant**

In the config block, after the line `function queueUpgradeCost(count) { return QUEUE_COSTS[count]; }`, add:
```js
  const AUTOPILOT_PRICE = 5000;    // one-time autopilot unlock
```

- [ ] **Step 2: Add the two flags to freshState()**

In `freshState()`, the returned object currently ends with `activeFlight: null, // ...`. Add two fields before `activeFlight`:
```js
      queueUps: 0,        // GLOBAL queue-size upgrade count (not per-plane)
      autopilotOwned: false, // bought autopilot? (account-level, permanent)
      autopilotOn: false,    // autopilot toggle (only meaningful when owned)
      activeFlight: null, // { jobId, place, totalMs, elapsedMs, payout }
```
(Just insert the two `autopilot*` lines between the existing `queueUps` line and the `activeFlight` line.)

- [ ] **Step 3: Add buyAutopilot + toggleAutopilot**

Find `function buyQueueUpgrade()`. Add these two functions immediately AFTER it (after its closing brace):
```js
  function buyAutopilot() {
    if (state.autopilotOwned) return false;
    if (state.money < AUTOPILOT_PRICE) return false;
    state.money -= AUTOPILOT_PRICE;
    state.autopilotOwned = true;
    save();
    return true;
  }

  function toggleAutopilot() {
    if (!state.autopilotOwned) return false;
    state.autopilotOn = !state.autopilotOn;
    save();
    return true;
  }
```

- [ ] **Step 4: Add bestTakeableJob (pure picker) + autoFillQueue**

Add these two functions immediately AFTER `toggleAutopilot` (still in the Actions area):
```js
  // The takeable board job with the highest $/sec (payout ÷ effective flight time).
  // null if no board job fits current capacity. effSeconds matches startJob's timing.
  function bestTakeableJob() {
    const cap = currentStats().capacity;
    const speed = currentStats().speed;
    let best = null, bestRate = -1;
    for (const job of state.jobs) {
      if (job.cargo > cap) continue;                 // not takeable
      const effSeconds = job.flightTime / speed;
      const rate = job.payout / effSeconds;
      if (rate > bestRate) { bestRate = rate; best = job; }
    }
    return best;
  }

  // When autopilot is owned + ON, keep the queue topped up with the best takeable
  // jobs. Reuses enqueueJob (which starts the first flight from idle). Returns true
  // if it added at least one job (so the caller can re-render).
  function autoFillQueue() {
    if (!(state.autopilotOwned && state.autopilotOn)) return false;
    let added = false;
    while (state.queue.length < queueSize()) {
      const job = bestTakeableJob();
      if (!job) break;                 // nothing takeable on the board
      if (!enqueueJob(job)) break;     // safety: stop if it refused
      added = true;
    }
    return added;
  }
```

- [ ] **Step 5: Verify syntax (do NOT commit)**

Extract the script between `<script>` and `</script>` to a temp .js file and run `node --check` (no errors). Do NOT start a server. Do NOT commit.

- [ ] **Step 6: Report**

Report DONE with what changed + the syntax result. Do NOT commit (controller handles it). The controller will run these INLINE assertions via the browser to verify:
```js
// buyAutopilot
state = freshState(); state.money = 4999;
console.assert(buyAutopilot() === false, 'cannot buy at $4999');
state.money = 5000;
console.assert(buyAutopilot() === true && state.autopilotOwned && state.money === 0, 'buy sets owned + deducts');
console.assert(buyAutopilot() === false, 'cannot re-buy');
// toggle only when owned
state = freshState();
console.assert(toggleAutopilot() === false, 'no toggle when not owned');
state.autopilotOwned = true;
console.assert(toggleAutopilot() === true && state.autopilotOn === true, 'toggle on');
console.assert(toggleAutopilot() === true && state.autopilotOn === false, 'toggle off');
// bestTakeableJob picks highest $/sec
state = freshState(); refillBoard();
const cap = currentStats().capacity, spd = currentStats().speed;
const takeables = state.jobs.filter(j => j.cargo <= cap);
const best = bestTakeableJob();
const bestRate = best.payout / (best.flightTime / spd);
const maxRate = Math.max(...takeables.map(j => j.payout / (j.flightTime / spd)));
console.assert(Math.abs(bestRate - maxRate) < 1e-9, 'bestTakeableJob is max $/sec');
// autoFillQueue: no-op when off; fills + starts a flight when owned+on
state = freshState(); refillBoard();
console.assert(autoFillQueue() === false, 'autoFill no-op when off');
state.autopilotOwned = true; state.autopilotOn = true;
console.assert(autoFillQueue() === true, 'autoFill added jobs when on');
console.assert(state.queue.length === queueSize(), 'queue filled to size');
console.assert(!!state.activeFlight, 'autoFill started a flight from idle');
localStorage.removeItem('skyTycoonSave_v1');
```
(These are run by the controller, not committed into the file.)

---

## Task 2: Wire autoFillQueue into the tick loop

**Files:**
- Modify: `sky-tycoon/index.html` (`tick()`)

- [ ] **Step 1: Call autoFillQueue each tick + re-render on change**

Replace the whole `tick()`:
```js
  function tick() {
    const f = state.activeFlight;
    if (f) {
      // Drive progress from wall-clock so a mid-flight reload keeps its place.
      f.elapsedMs = Date.now() - f.startedAt;
      if (f.elapsedMs >= f.totalMs) {
        completeFlight();
        renderAll();
      } else if (screen === 'game') {
        // Update the always-visible scene every tick regardless of the active
        // tab, plus the in-flight job row's progress fill while on the Fly view.
        renderScene();
        if (currentView === 'fly') updateActiveJobProgress();
      }
    }
  }
```
with (autopilot fills the queue first — this also starts the first flight from a parked state — and re-renders the Fly view if it changed anything):
```js
  function tick() {
    // Autopilot tops up the queue (and kicks off the first flight when parked).
    const autoAdded = autoFillQueue();
    if (autoAdded && screen === 'game' && currentView === 'fly') renderAll();

    const f = state.activeFlight;
    if (f) {
      // Drive progress from wall-clock so a mid-flight reload keeps its place.
      f.elapsedMs = Date.now() - f.startedAt;
      if (f.elapsedMs >= f.totalMs) {
        completeFlight();
        renderAll();
      } else if (screen === 'game') {
        // Update the always-visible scene every tick regardless of the active
        // tab, plus the in-flight job row's progress fill while on the Fly view.
        renderScene();
        if (currentView === 'fly') updateActiveJobProgress();
      }
    }
  }
```

- [ ] **Step 2: Verify syntax (do NOT commit)**

`node --check` the extracted script (no errors). Do NOT commit. Report DONE.

(Controller verifies in-browser: with autopilot owned+on and parked, after ~200ms the queue fills and a flight is active.)

---

## Task 3: Render — decline ✕/🔒 + hint + toggle, Shop card, events, CSS

**Files:**
- Modify: `sky-tycoon/index.html` (CSS, renderFly, renderShop, onContentClick)

- [ ] **Step 1: Add the CSS**

In the `<style>` block, add these rules right AFTER the `.job-decline` group (the `@media (hover: hover) { .job-decline:hover ... }` block, around line 143):
```css
  /* lock shown in the decline slot when flying without autopilot-on (same box as ✕) */
  .job-lock { flex-shrink:0; width:26px; height:26px; display:flex; align-items:center;
    justify-content:center; font-size:13px; opacity:.5; pointer-events:none; }
  /* autopilot hint + toggle (Fly view) */
  .autopilot-hint { font-size:11px; color:#9fb0c8; margin:0 0 10px; opacity:.9; }
  .autopilot-toggle { font-family:inherit; font-weight:800; font-size:12px; letter-spacing:1px;
    border:2px solid #3a425c; background:#1b2030; color:#9fb0c8; border-radius:6px;
    padding:8px 12px; cursor:pointer; margin-bottom:12px; width:100%; }
  .autopilot-toggle.on { border-color:var(--gold); color:var(--ink); background:var(--gold); }
```

- [ ] **Step 2: renderFly — locked predicate, ✕/🔒, hint, toggle**

Replace the WHOLE `renderFly()` function with this version (changes: compute `autoActive`/`locked`; the decline slot shows ✕ when not locked OR 🔒 when locked; an autopilot toggle when owned; a hint when locked):
```js
  function renderFly() {
    const cap = currentStats().capacity;
    const f = state.activeFlight;
    const flying = !!f;
    const autoActive = state.autopilotOwned && state.autopilotOn;
    const locked = flying && !autoActive;   // flying but can't manage the board
    const queueHasRoom = state.queue.length < queueSize();
    const rows = state.jobs.map(job => {
      const takeable = canTakeJob(job, cap);
      const ok = takeable && queueHasRoom;     // tappable when room in the queue
      const isLockedRow = !takeable;
      const cls = 'job' + (ok ? '' : ' disabled');
      // decline slot: working ✕ when NOT locked; a non-interactive 🔒 when locked.
      const slot = locked
        ? '<div class="job-lock" title="Autopilot lets you manage jobs while flying">🔒</div>'
        : '<button class="job-decline" data-decline="' + job.id +
            '" title="Decline this job" aria-label="Decline job">✕</button>';
      return (
        '<div class="' + cls + '" ' + (ok ? 'data-job="' + job.id + '"' : '') + '>' +
          '<div class="job-main">' +
            '<div class="job-who">' + job.customer + ' → ' + job.place + '</div>' +
            '<div class="job-meta">📦 ' + job.cargo + '  ·  ' + job.flightTime + 's</div>' +
          '</div>' +
          '<div class="job-pay">' + fmt(job.payout) +
            (isLockedRow ? '<span class="lock">Need more capacity</span>' : '') +
          '</div>' +
          slot +
        '</div>'
      );
    }).join('');
    const st = currentStats();
    const cp = curPlane();
    const panel =
      '<div class="stat-panel">' +
        statRow('📦 CARGO', st.capacity, cp.capUps) +
        statRow('SPEED', st.speed.toFixed(1), cp.speedUps) +
      '</div>';
    const toggle = state.autopilotOwned
      ? '<button class="autopilot-toggle' + (state.autopilotOn ? ' on' : '') +
          '" data-autopilot-toggle>AUTOPILOT: ' + (state.autopilotOn ? 'ON' : 'OFF') + '</button>'
      : '';
    const hint = locked
      ? '<div class="autopilot-hint">✈ Autopilot lets you manage jobs while flying.</div>'
      : '';
    $('#content').innerHTML = panel + toggle + queueStripHTML() + hint + '<div class="job-board">' + rows + '</div>';
  }
```
NOTE: the decline ✕ slot is now ALWAYS present (either ✕ or 🔒), unlike before where it was omitted while flying. This is intentional — keeps row spacing consistent. The 🔒 has no `data-decline`, so it can't trigger a decline.

- [ ] **Step 3: renderShop — add the Autopilot card after the plane tiers**

In `renderShop()`, the current last line builds the plane rows and sets innerHTML:
```js
    $('#content').innerHTML = '<div class="shop-list">' + rows + '</div>';
  }
```
Replace that with (append an Autopilot row inside the shop-list):
```js
    const apOwned = state.autopilotOwned;
    const apAffordable = !apOwned && state.money >= AUTOPILOT_PRICE;
    const apRight = apOwned
      ? '<span class="owned">OWNED</span>'
      : '<button class="buy-btn' + (apAffordable ? '' : ' disabled') + '" data-buy-autopilot>' + fmt(AUTOPILOT_PRICE) + '</button>';
    const apRow =
      '<div class="plane-row">' +
        '<div class="plane-info"><div class="plane-name">🤖 Autopilot</div>' +
        '<div class="plane-stats">Auto-flies jobs · manage board while flying</div></div>' +
        apRight +
      '</div>';
    $('#content').innerHTML = '<div class="shop-list">' + rows + apRow + '</div>';
  }
```

- [ ] **Step 4: Wire the new buttons in onContentClick**

In `onContentClick`, add these two branches. Put them BEFORE the `const planeBtn = e.target.closest('[data-plane]');` branch (so the autopilot buy button, which is a `.buy-btn` but uses `data-buy-autopilot` not `data-plane`, is handled distinctly):
```js
    const apToggle = e.target.closest('[data-autopilot-toggle]');
    if (apToggle) {
      if (toggleAutopilot()) renderAll();
      return;
    }
    const apBuy = e.target.closest('[data-buy-autopilot]');
    if (apBuy) {
      if (buyAutopilot()) renderAll();
      return;
    }
```

- [ ] **Step 5: Verify syntax (do NOT commit)**

`node --check` the extracted script (no errors). Do NOT commit. Report DONE.

(Controller verifies in-browser: Shop shows the Autopilot card; buying it → OWNED + the Fly toggle appears; toggling ON auto-fills + flies; ✕ works while ON+flying; OFF+flying shows 🔒 + hint; solo shows 🔒 + hint with no toggle.)

---

## Task 4: End-to-end verification, SW bump, deploy

**Files:**
- Modify: `sky-tycoon/sw.js` (cache bump)

- [ ] **Step 1: Full flow (controller)**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. Then via `preview_eval`/`preview_click`:
1. `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=9999; startGame(); setView('shop');` → `preview_screenshot`: Shop shows the 🤖 Autopilot card with a $5,000 button.
2. Buy it: `preview_click` `.buy-btn[data-buy-autopilot]`. `preview_eval`: `state.autopilotOwned` → true. Card shows OWNED.
3. Go to Fly: `setView('fly')`. `preview_screenshot`: the AUTOPILOT: OFF toggle is shown above the queue; since parked (not flying), board rows show the working ✕.
4. Toggle ON: `preview_click` `[data-autopilot-toggle]`. Wait ~300ms (`Bash: sleep 0.4`). `preview_eval`: `({on: state.autopilotOn, flying: !!state.activeFlight, queueLen: state.queue.length})` → `on:true`, `flying:true`, `queueLen === queueSize()`. `preview_screenshot`: a flight is running, queue full, and (autopilot ON) board rows show the working ✕ while flying.
5. Decline a board job while ON+flying: `preview_click` `.job-board .job-decline` → `preview_eval` confirms the board changed (job replaced). No error.
6. Toggle OFF: `preview_click` `[data-autopilot-toggle]`. `preview_eval`: `state.autopilotOn` → false; queued jobs still present (`state.queue.length > 0`). `preview_screenshot`: while still flying + OFF, board rows now show 🔒 (no ✕) and the hint line appears.

- [ ] **Step 2: Solo + persistence (controller)**

- Solo: `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); startGame(); var j=state.jobs.find(x=>x.cargo<=currentStats().capacity); enqueueJob(j); renderAll(); 'flying solo'`. `preview_eval`: `!!document.querySelector('.job-lock')` → true (🔒 shown), `!!document.querySelector('.autopilot-toggle')` → false (no toggle, not owned), `!!document.querySelector('.autopilot-hint')` → true.
- Persistence: `preview_eval`: `state=freshState(); state.autopilotOwned=true; state.autopilotOn=true; startGame(); save(); 'saved'`. Reload: `location.reload();` then `preview_click` `[data-title-action="continue"]`. `preview_eval`: `({owned: state.autopilotOwned, on: state.autopilotOn})` → both true (and the queue should auto-fill again on tick).

- [ ] **Step 3: No errors + mobile**

`preview_console_logs` level `error` → none. `preview_resize` preset `mobile`; ensure Fly view; `preview_screenshot` → the toggle, queue, hint/lock, and board fit cleanly, no horizontal scroll. `preview_resize` preset `desktop`.

- [ ] **Step 4: Reset clean (controller)**

`preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload();` → `preview_screenshot`: title with a single Start Game button. `preview_console_logs` level `error` → none.

- [ ] **Step 5: Bump the service worker cache**

In `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v10';` to `const CACHE_NAME = 'sky-tycoon-v11';`.
- `grep -n "CACHE_NAME = " /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → `sky-tycoon-v11`.
- `node --check /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → no errors.

- [ ] **Step 6: Show the user + commit on their OK, then deploy on their OK**

This is the user-review gate. The controller shows the user the working feature and the diff. Per the user's standing rule, commit ONLY after the user confirms. Then push ONLY after the user confirms the deploy. Suggested commits:
```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): autopilot — auto-fill queue + manage board while flying

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): bump SW cache to v11 for autopilot release

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Then (on deploy OK): `git push origin main` and verify live:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  ap=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "data-autopilot-toggle\|data-buy-autopilot"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: ap=$ap sw=$swv"; \
  if [ "$ap" -ge 1 ] && [ "$swv" = "sky-tycoon-v11" ]; then echo LIVE; break; fi; done
```

---

## Self-Review Notes

- **Spec coverage:** state flags + AUTOPILOT_PRICE (Task 1); buyAutopilot/toggleAutopilot/bestTakeableJob/autoFillQueue (Task 1); tick integration incl. starting first flight from parked (Task 2); decline gate → ✕/🔒 + hint + toggle (Task 3 renderFly); Shop card (Task 3 renderShop); events (Task 3 onContentClick); CSS (Task 3); SW bump + deploy (Task 4). $/sec picker matches startJob timing (Task 1 `effSeconds = flightTime/speed`). All spec sections covered.
- **Placeholder scan:** none. Every code step shows complete before/after.
- **Type consistency:** `state.autopilotOwned`/`state.autopilotOn` (bools); `AUTOPILOT_PRICE` (5000); `buyAutopilot()`, `toggleAutopilot()`, `bestTakeableJob()` → job|null, `autoFillQueue()` → bool. Data attributes: `data-buy-autopilot` (Shop buy), `data-autopilot-toggle` (Fly toggle), matched between render (Task 3 steps 2–3) and onContentClick (Task 3 step 4). `autoActive = owned && on`, `locked = flying && !autoActive` used consistently. The 🔒 (`.job-lock`) has NO `data-decline` (non-interactive). renderFly always emits a decline slot (✕ or 🔒) for consistent spacing.
- **Note:** the autopilot buy button reuses `.buy-btn` styling but carries `data-buy-autopilot` (NOT `data-plane`), and its onContentClick branch is placed BEFORE the `[data-plane]` branch — so a `data-plane` handler can never mis-handle it (they're distinct attributes anyway).
