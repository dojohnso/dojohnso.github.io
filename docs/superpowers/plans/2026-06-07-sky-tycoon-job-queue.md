# Sky Tycoon Job Queue + Queue Size Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player tap a takeable job while flying to add it to a queue; completed flights auto-start the next queued job; add a global "Queue Size" upgrade (2→6).

**Architecture:** New `state.queue` (array of job objects) holds lined-up jobs between the board and the single active flight; `state.queueUps` is a global (not per-plane) upgrade count. `enqueueJob` moves a takeable board job into the queue while flying; `completeFlight` shifts the front of the queue and auto-starts it; `dequeueJob` removes one. UI: a queue strip above the job board on FLY, and a third "Queue" card in the Upgrade view. `enqueueJob` is isolated as the autopilot hook.

**Tech Stack:** Vanilla HTML/CSS/JS in the single file `sky-tycoon/index.html` (+ a one-line cache bump in `sky-tycoon/sw.js`). No build tools. Verified via the preview tools (`preview_*`). Save under `localStorage` key `skyTycoonSave_v1`.

---

## File Structure

All changes in **`/usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`** plus a one-line bump in `sky-tycoon/sw.js`:
- **Config:** `QUEUE_BASE`, `MAX_QUEUE_UPGRADES`, `QUEUE_COSTS`, `queueUpgradeCost()`.
- **State:** `freshState()` (+ `queue`, `queueUps`), `load()` guard, `queueSize()`.
- **Actions:** `enqueueJob`, `dequeueJob`, `buyQueueUpgrade`, `completeFlight` auto-advance.
- **Render:** parameterized `statBar`, queue strip in `renderFly`, third card in `renderUpgrade`.
- **Events:** tap-to-queue (the `[data-job]` branch), tap-to-remove queue slot, queue upgrade button.

Testing: no automated framework (single-file PWA). Pure logic is checked with `?test` console-assert hooks run in the browser; UI/flow is verified with the preview tools. The service worker can serve a stale page — every browser verification starts by clearing it. Each task ends with a commit.

A reusable SW-clear snippet, referred to below as **[SW-CLEAR]**:
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```

---

## Task 1: Config + state (queue, queueUps, queueSize, migration)

**Files:**
- Modify: `sky-tycoon/index.html` (Config + State sections)

- [ ] **Step 1: Add queue config constants**

Find the config block (around lines 250–261). After the line `const BOARD_SIZE = 5;     // jobs visible at once`, add:
```js
  const QUEUE_BASE = 2;            // jobs you can queue with no upgrades
  const MAX_QUEUE_UPGRADES = 4;    // queue grows from 2 up to 6
  const QUEUE_COSTS = [50, 120, 250, 500];  // cost of the Nth queue upgrade (0-indexed)
  function queueUpgradeCost(count) { return QUEUE_COSTS[count]; }
```

- [ ] **Step 2: Add queue fields to freshState()**

Replace `freshState()` (around lines 299–308):
```js
  function freshState() {
    return {
      money: 0,
      planeId: 'prop',
      // Owned planes → their per-plane upgrade counts. You start owning the prop.
      planes: { prop: { speedUps: 0, capUps: 0 } },
      jobs: [],
      activeFlight: null, // { jobId, place, totalMs, elapsedMs, payout }
    };
  }
```
with:
```js
  function freshState() {
    return {
      money: 0,
      planeId: 'prop',
      // Owned planes → their per-plane upgrade counts. You start owning the prop.
      planes: { prop: { speedUps: 0, capUps: 0 } },
      jobs: [],
      queue: [],          // jobs lined up to run after the active flight, in order
      queueUps: 0,        // GLOBAL queue-size upgrade count (not per-plane)
      activeFlight: null, // { jobId, place, totalMs, elapsedMs, payout }
    };
  }
```

- [ ] **Step 3: Guard a corrupt queue in load()**

Find this line in `load()` (around line 321):
```js
      if (!Array.isArray(merged.jobs)) merged.jobs = [];
```
Add immediately AFTER it:
```js
      if (!Array.isArray(merged.queue)) merged.queue = [];   // corrupt/old save → empty queue
```
(The `Object.assign(freshState(), parsed)` already supplies `queue: []` / `queueUps: 0` for older saves missing them; this guard just protects against a non-array `queue`.)

- [ ] **Step 4: Add queueSize() accessor**

Find `function currentStats()` (it's right after `load()`/`curPlane()`). Add this line immediately BEFORE `function currentStats()`:
```js
  function queueSize() { return QUEUE_BASE + state.queueUps; }   // current max queue length
```

- [ ] **Step 5: Add a temporary test hook**

At the very END of the `<script>` (just before `</script>`, AFTER the `boot();` call and the service-worker registration block), add:
```js
  if (location.search.includes('test')) {
    state = freshState();
    console.assert(queueSize() === 2, 'base queue size 2, got ' + queueSize());
    state.queueUps = 4;
    console.assert(queueSize() === 6, 'maxed queue size 6, got ' + queueSize());
    console.assert(queueUpgradeCost(0) === 50 && queueUpgradeCost(3) === 500, 'queue costs 50..500');
    // corrupt-queue migration
    localStorage.setItem('skyTycoonSave_v1', JSON.stringify({ money: 1, queue: 'nope', jobs: [], activeFlight: null }));
    const loaded = load();
    console.assert(Array.isArray(loaded.queue) && loaded.queue.length === 0, 'corrupt queue → []');
    localStorage.removeItem('skyTycoonSave_v1');
    console.log('Sky Tycoon queue tests T1: done (check for assertion errors above)');
  }
```

- [ ] **Step 6: Run the test in the browser**

Use `preview_start` (name `sky-tycoon`) if needed. Run **[SW-CLEAR]**, then navigate to `http://localhost:3850/?test`. Read `preview_console_logs` level `all`.
Expected: "Sky Tycoon queue tests T1: done" appears with NO `console.assert` failures above it.

- [ ] **Step 7: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): queue state + queueSize + config (with migration guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Queue actions — enqueue, dequeue, completeFlight auto-advance

**Files:**
- Modify: `sky-tycoon/index.html` (Actions section)

- [ ] **Step 1: Add enqueueJob and dequeueJob**

Find `function startJob(job)` (around line 371). Add these two functions immediately BEFORE it:
```js
  // Add a takeable board job to the queue (only while a flight is active and the
  // queue has room). Moves the job off the board and refills. Isolated so a future
  // autopilot can call it. Returns true if queued.
  function enqueueJob(job) {
    if (!state.activeFlight) return false;                 // queue only while flying
    if (state.queue.length >= queueSize()) return false;   // queue full
    if (!canTakeJob(job, currentStats().capacity)) return false; // takeable only
    state.jobs = state.jobs.filter(j => j.id !== job.id);  // move off the board
    state.queue.push(job);
    refillBoard();
    save();
    return true;
  }

  // Remove a job from the queue (it disappears; board refills to stay full).
  function dequeueJob(jobId) {
    const before = state.queue.length;
    state.queue = state.queue.filter(j => j.id !== jobId);
    if (state.queue.length === before) return false;       // unknown id
    refillBoard();
    save();
    return true;
  }
```

- [ ] **Step 2: Auto-advance in completeFlight**

Replace `completeFlight()` (around lines 384–392):
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
with:
```js
  function completeFlight() {
    const f = state.activeFlight;
    if (!f) return;
    state.money += f.payout;
    state.jobs = state.jobs.filter(j => j.id !== f.jobId); // harmless if it was a queued job
    state.activeFlight = null;
    // Auto-advance: if jobs are queued, take off with the next one immediately.
    if (state.queue.length > 0) {
      startJob(state.queue.shift());                       // startJob saves; uses current stats
    }
    refillBoard();
    save();
  }
```

- [ ] **Step 2b: Extend the test hook for queue actions**

Inside the existing `if (location.search.includes('test'))` block, add BEFORE the final `console.log`:
```js
    // enqueue requires an active flight + takeable + room
    state = freshState(); refillBoard();
    const j0 = state.jobs.find(j => j.cargo <= currentStats().capacity);
    console.assert(enqueueJob(j0) === false, 'no enqueue without an active flight');
    startJob(state.jobs.find(j => j.cargo <= currentStats().capacity));
    const takeables = state.jobs.filter(j => j.cargo <= currentStats().capacity);
    console.assert(enqueueJob(takeables[0]) === true, 'enqueue a takeable job while flying');
    console.assert(state.queue.length === 1, 'queue has 1');
    console.assert(!state.jobs.some(j => j.id === takeables[0].id), 'queued job left the board');
    // fill to size then reject
    state.queueUps = 0; // size 2
    const more = state.jobs.filter(j => j.cargo <= currentStats().capacity);
    if (more[0]) enqueueJob(more[0]);
    console.assert(state.queue.length <= queueSize(), 'never exceeds queueSize');
    const extra = state.jobs.find(j => j.cargo <= currentStats().capacity);
    if (extra) console.assert(enqueueJob(extra) === false, 'reject when full');
    // dequeue
    const qid = state.queue[0].id;
    console.assert(dequeueJob(qid) === true && !state.queue.some(j => j.id === qid), 'dequeue removes');
    // completeFlight auto-advances to the next queued job
    state = freshState(); refillBoard();
    startJob(state.jobs.find(j => j.cargo <= currentStats().capacity));
    const q1 = state.jobs.find(j => j.cargo <= currentStats().capacity);
    enqueueJob(q1);
    const moneyBeforeComplete = state.money;
    const activePayout = state.activeFlight.payout;
    completeFlight();
    console.assert(state.money === moneyBeforeComplete + activePayout, 'completed flight credited its payout');
    console.assert(state.activeFlight && state.activeFlight.jobId === q1.id, 'auto-advanced to queued job');
    console.assert(state.queue.length === 0, 'queue drained by 1');
    // completeFlight with empty queue parks
    state = freshState(); refillBoard();
    startJob(state.jobs.find(j => j.cargo <= currentStats().capacity));
    completeFlight();
    console.assert(state.activeFlight === null, 'empty queue → parked');
    localStorage.removeItem('skyTycoonSave_v1');
```

- [ ] **Step 3: Run the test**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/?test`, read `preview_console_logs` level `all`.
Expected: the T1 "done" line prints with NO assertion failures above it.

- [ ] **Step 4: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): enqueue/dequeue + completeFlight auto-advance to next queued job

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Queue upgrade action + parameterized stat bar

**Files:**
- Modify: `sky-tycoon/index.html` (Actions + the statBar helper)

- [ ] **Step 1: Add buyQueueUpgrade**

Find `function buyCargoUpgrade()` (around line 405). Add this function immediately AFTER it (after its closing brace):
```js
  function buyQueueUpgrade() {
    if (state.queueUps >= MAX_QUEUE_UPGRADES) return false; // queue maxed
    const cost = queueUpgradeCost(state.queueUps);
    if (state.money < cost) return false;
    state.money -= cost;
    state.queueUps += 1;
    save();
    return true;
  }
```

- [ ] **Step 2: Parameterize statBar to accept a max**

The current `statBar(count)` hardcodes `MAX_UPGRADES` (so it always draws 6 pips). The queue card needs a 5-pip bar (MAX_QUEUE_UPGRADES = 4). Replace `statBar` (around lines 490–499):
```js
  function statBar(count) {
    const maxed = count >= MAX_UPGRADES;
    const filled = count + 1;            // base level counts as the first pip
    const total = MAX_UPGRADES + 1;
    let pips = '';
    for (let i = 0; i < total; i++) {
      pips += '<i class="' + (i < filled ? 'on' : '') + (maxed ? ' max' : '') + '"></i>';
    }
    return '<div class="statbar' + (maxed ? ' maxed' : '') + '">' + pips + '</div>';
  }
```
with (default `max` keeps every existing call identical):
```js
  function statBar(count, max) {
    if (max == null) max = MAX_UPGRADES;
    const maxed = count >= max;
    const filled = count + 1;            // base level counts as the first pip
    const total = max + 1;
    let pips = '';
    for (let i = 0; i < total; i++) {
      pips += '<i class="' + (i < filled ? 'on' : '') + (maxed ? ' max' : '') + '"></i>';
    }
    return '<div class="statbar' + (maxed ? ' maxed' : '') + '">' + pips + '</div>';
  }
```

- [ ] **Step 3: Extend the test hook for the queue upgrade**

Inside the `if (location.search.includes('test'))` block, add BEFORE the final `console.log`:
```js
    state = freshState(); state.money = 9999;
    console.assert(buyQueueUpgrade() === true && state.queueUps === 1, 'buy queue upgrade');
    console.assert(state.money === 9999 - 50, 'queue upgrade costs $50 first');
    state.queueUps = MAX_QUEUE_UPGRADES;
    console.assert(buyQueueUpgrade() === false, 'cannot buy past max queue');
    // parameterized statBar pip counts
    console.assert((statBar(0).match(/<i/g) || []).length === MAX_UPGRADES + 1, 'default bar has MAX_UPGRADES+1 pips');
    console.assert((statBar(0, MAX_QUEUE_UPGRADES).match(/<i/g) || []).length === MAX_QUEUE_UPGRADES + 1, 'queue bar has MAX_QUEUE_UPGRADES+1 pips');
    localStorage.removeItem('skyTycoonSave_v1');
```

- [ ] **Step 4: Run the test**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/?test`, read `preview_console_logs` level `all`.
Expected: "done" line, no assertion failures.

- [ ] **Step 5: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): buyQueueUpgrade + parameterized statBar(count,max)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Queue strip UI + tap-to-queue / tap-to-remove wiring

**Files:**
- Modify: `sky-tycoon/index.html` (renderFly, CSS, onContentClick)

- [ ] **Step 1: Add the queue-strip CSS**

In the `<style>` block, add right AFTER the `.stat-panel` / `.stat-row` rules (search for `.stat-panel {`, add after that group, before the `.statbar` rules around line 151):
```css
  /* queue strip (FLY view) */
  .queue-strip { margin-bottom:12px; }
  .queue-label { font-size:11px; font-weight:800; letter-spacing:1px; color:#9fb0c8; margin-bottom:6px; }
  .queue-slots { display:flex; gap:6px; }
  .queue-slot { flex:1; min-width:0; height:46px; border:2px solid #3a425c; border-radius:4px;
    background:#1b2030; display:flex; flex-direction:column; align-items:center; justify-content:center;
    font-size:11px; color:#c8d2e0; padding:2px; }
  .queue-slot.filled { background:#252b3d; border-color:#5bb8e0; cursor:pointer; }
  .queue-slot.empty  { border-style:dashed; color:#5a6577; }
  .queue-slot .qs-place { font-weight:800; font-size:11px; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; max-width:100%; }
  .queue-slot .qs-meta { opacity:.8; }
```

- [ ] **Step 2: Render the queue strip and keep board rows tappable while flying**

Replace the whole `renderFly()` function (around lines 646–680) with this version. Changes: rows are tappable while flying when there's queue room (`canQueue`); a queue strip is rendered between the stat panel and the board.
```js
  function renderFly() {
    const cap = currentStats().capacity;
    const f = state.activeFlight;
    const flying = !!f;
    const queueHasRoom = state.queue.length < queueSize();
    const rows = state.jobs.map(job => {
      const isActive = flying && job.id === f.jobId;             // the job currently in flight
      const takeable = canTakeJob(job, cap);
      // Tappable when: idle (fly now), or flying with queue room (queue it).
      const ok = takeable && (!flying || queueHasRoom);
      const locked = !takeable;
      const cls = 'job' + (isActive ? ' active' : (ok ? '' : ' disabled'));
      const initPct = isActive ? Math.round(Math.min(1, f.elapsedMs / f.totalMs) * 100) : 0;
      return (
        '<div class="' + cls + '" ' +
          (ok ? 'data-job="' + job.id + '"' : '') +
          (isActive ? ' data-active-job style="--pct:' + initPct + '%"' : '') + '>' +
          '<div class="job-main">' +
            '<div class="job-who">' + job.customer + ' → ' + job.place + '</div>' +
            '<div class="job-meta">📦 ' + job.cargo + '  ·  ' + job.flightTime + 's</div>' +
          '</div>' +
          '<div class="job-pay">' + fmt(job.payout) +
            (locked ? '<span class="lock">Need more capacity</span>' : '') +
          '</div>' +
          (flying ? '' : '<button class="job-decline" data-decline="' + job.id +
            '" title="Decline this job" aria-label="Decline job">✕</button>') +
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
    $('#content').innerHTML = panel + queueStripHTML() + '<div class="job-board">' + rows + '</div>';
  }

  // The queue strip: a label + a row of slots (filled jobs are tap-to-remove).
  function queueStripHTML() {
    const size = queueSize();
    let slots = '';
    for (let i = 0; i < size; i++) {
      const job = state.queue[i];
      if (job) {
        slots += '<div class="queue-slot filled" data-dequeue="' + job.id + '" title="Remove from queue">' +
          '<div class="qs-place">→ ' + job.place + '</div>' +
          '<div class="qs-meta">📦 ' + job.cargo + '</div>' +
        '</div>';
      } else {
        slots += '<div class="queue-slot empty">·</div>';
      }
    }
    return '<div class="queue-strip">' +
      '<div class="queue-label">QUEUE ' + state.queue.length + '/' + size + '</div>' +
      '<div class="queue-slots">' + slots + '</div>' +
    '</div>';
  }
```

- [ ] **Step 3: Wire tap-to-queue and tap-to-remove in onContentClick**

Replace the `[data-job]` branch in `onContentClick` (around lines 786–791):
```js
    const jobEl = e.target.closest('[data-job]');
    if (jobEl) {
      const job = state.jobs.find(j => j.id === jobEl.dataset.job);
      if (job && startJob(job)) renderAll();
      return;
    }
```
with (tap a board job → fly now if idle, else queue it; and a new dequeue branch BEFORE it):
```js
    const dequeueEl = e.target.closest('[data-dequeue]');
    if (dequeueEl) {
      if (dequeueJob(dequeueEl.dataset.dequeue)) renderAll();
      return;
    }
    const jobEl = e.target.closest('[data-job]');
    if (jobEl) {
      const job = state.jobs.find(j => j.id === jobEl.dataset.job);
      if (job) {
        const acted = state.activeFlight ? enqueueJob(job) : startJob(job);
        if (acted) renderAll();
      }
      return;
    }
```

- [ ] **Step 4: Verify the queue flow in the browser**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/`. Then:
1. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); startGame(); 'fresh'`.
2. `preview_screenshot` → the FLY view shows a "QUEUE 0/2" strip with 2 empty dashed slots above the job board.
3. Start a flight: `preview_click` `.job[data-job]`. Then queue one: `preview_click` `.job[data-job]` again. `preview_screenshot` → the queue strip now shows "QUEUE 1/2" with one filled slot (→ place, 📦 cargo).
4. Queue a second: `preview_click` `.job[data-job]`. `preview_eval`: `({queue: state.queue.length, size: queueSize()})` → expect `{queue:2, size:2}`. `preview_screenshot` → "QUEUE 2/2", both slots filled, and remaining board rows should now be non-tappable (no `data-job`). Confirm: `preview_eval`: `document.querySelectorAll('.job-board .job[data-job]').length` → expect `0` (queue full while flying).
5. Remove one: `preview_click` `.queue-slot.filled`. `preview_eval`: `state.queue.length` → expect `1`.
6. Read `preview_console_logs` level `error` → expect none.

- [ ] **Step 5: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): queue strip UI + tap-to-queue / tap-to-remove

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Queue upgrade card in the Upgrade view

**Files:**
- Modify: `sky-tycoon/index.html` (renderUpgrade, onContentClick)

- [ ] **Step 1: Add the Queue card to renderUpgrade**

In `renderUpgrade()`, the function currently sets `$('#content').innerHTML` to the Engine card + Cargo card. Find the end of that assignment (around lines 699–707):
```js
    $('#content').innerHTML =
      '<div class="up-card">' +
        '<div class="up-title">Engine · Speed ' + st.speed.toFixed(2) + '</div>' +
        statBar(cp.speedUps) + engineBtn +
      '</div>' +
      '<div class="up-card">' +
        '<div class="up-title">📦 Cargo Hold · Capacity ' + st.capacity + '</div>' +
        statBar(cp.capUps) + cargoBtn +
      '</div>';
  }
```
Replace it with (adds a third Queue card; note it computes its own maxed/cost/button):
```js
    const queueMaxed = state.queueUps >= MAX_QUEUE_UPGRADES;
    const queueCost = queueMaxed ? 0 : queueUpgradeCost(state.queueUps);
    const canQueue = !queueMaxed && state.money >= queueCost;
    const queueBtn = queueMaxed
      ? '<div class="up-maxed">MAXED — queue is at its biggest</div>'
      : '<button class="up-btn' + (canQueue ? '' : ' disabled') + '" data-up="queue">' +
          'Upgrade Queue — ' + fmt(queueCost) + '</button>';
    $('#content').innerHTML =
      '<div class="up-card">' +
        '<div class="up-title">Engine · Speed ' + st.speed.toFixed(2) + '</div>' +
        statBar(cp.speedUps) + engineBtn +
      '</div>' +
      '<div class="up-card">' +
        '<div class="up-title">📦 Cargo Hold · Capacity ' + st.capacity + '</div>' +
        statBar(cp.capUps) + cargoBtn +
      '</div>' +
      '<div class="up-card">' +
        '<div class="up-title">Queue · Size ' + queueSize() + '</div>' +
        statBar(state.queueUps, MAX_QUEUE_UPGRADES) + queueBtn +
      '</div>';
  }
```

- [ ] **Step 2: Wire the queue upgrade button**

In `onContentClick`, find the `[data-up]` branch (around lines 792–797):
```js
    const upBtn = e.target.closest('[data-up]');
    if (upBtn) {
      const ok = upBtn.dataset.up === 'engine' ? buyEngineUpgrade() : buyCargoUpgrade();
      if (ok) renderAll();
      return;
    }
```
Replace with (handle the third 'queue' action explicitly):
```js
    const upBtn = e.target.closest('[data-up]');
    if (upBtn) {
      const which = upBtn.dataset.up;
      const ok = which === 'engine' ? buyEngineUpgrade()
               : which === 'cargo'  ? buyCargoUpgrade()
               : which === 'queue'  ? buyQueueUpgrade() : false;
      if (ok) renderAll();
      return;
    }
```
(NOTE: this changes the Cargo button to match `which === 'cargo'`. Confirm the Cargo upgrade button uses `data-up="cargo"` — it does, in `renderUpgrade`'s `cargoBtn`.)

- [ ] **Step 3: Verify the upgrade card in the browser**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/`. Then:
1. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=99999; startGame(); setView('upgrade'); 'on upgrade'`.
2. `preview_screenshot` → three cards: Engine, Cargo Hold, and **Queue · Size 2** with a 5-pip bar (1 lit) and an "Upgrade Queue — $50" button.
3. `preview_click` `.up-btn[data-up="queue"]`. `preview_eval`: `({queueUps: state.queueUps, size: queueSize()})` → expect `{queueUps:1, size:3}`. `preview_screenshot` → card now "Queue · Size 3", next cost "$120".
4. Max it: `preview_eval`: `state.queueUps=4; renderAll(); 'maxed'`. `preview_screenshot` → Queue card shows the "MAXED — queue is at its biggest" treatment, full gold bar.
5. Read `preview_console_logs` level `error` → none.

- [ ] **Step 4: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): Queue Size upgrade card in the Upgrade view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: End-to-end verification, remove test hook, SW bump, deploy

**Files:**
- Modify: `sky-tycoon/index.html` (remove `?test` block), `sky-tycoon/sw.js` (cache bump)

- [ ] **Step 1: Full auto-advance flow through the real UI**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/`. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); startGame(); 'fresh'`.
- Start a flight: `preview_click` `.job[data-job]`.
- Queue two: `preview_click` `.job[data-job]`, then `preview_click` `.job[data-job]`. `preview_eval`: `state.queue.length` → expect `2`.
- Let the active flight finish (flights are 5–10s ÷ speed): `Bash: sleep 11`. `preview_eval`:
  ```js
  ({ flying: !!state.activeFlight, activeIsQueued: state.activeFlight ? state.activeFlight.jobId : null, queueLen: state.queue.length })
  ```
  Expected: `flying:true` (auto-advanced to the next queued job), `queueLen:1` (drained by one). `preview_screenshot` → the strip shows "QUEUE 1/2" and the newly-active job's row highlighted.

- [ ] **Step 2: Persistence across reload (incl. queued jobs)**

`preview_eval`: capture `({money: state.money, queueLen: state.queue.length, queueUps: state.queueUps})`. Then reload: `preview_eval`: `location.reload(); 'reload'`. The app boots to the title — `preview_click` `[data-title-action="continue"]`. `preview_eval`:
```js
({ queueLen: state.queue.length, queueUps: state.queueUps })
```
Expected: the queue length and queueUps survive the reload.

- [ ] **Step 3: Mobile layout + no errors**

`preview_console_logs` level `error` → none. `preview_resize` preset `mobile`; ensure on the FLY view (`preview_eval`: `setView('fly')`); `preview_screenshot` → the queue strip + slots fit cleanly above the board, no horizontal scroll. `preview_resize` preset `desktop`.

- [ ] **Step 4: Remove the test hook**

Delete the entire `if (location.search.includes('test')) { … }` block from the end of the `<script>` (everything added across Tasks 1–3 inside that block, and the block itself). Verify:
- Run: `grep -c "location.search.includes" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → expect `0`.
- Run: `grep -c "console.assert" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → expect `0`.
- Confirm `boot();` still present: `grep -c "boot();" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → expect `1`.

- [ ] **Step 5: Reset to a clean game + final check**

Run **[SW-CLEAR]**, navigate to `http://localhost:3850/`. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'clean'`. `preview_screenshot` → title screen with a single Start Game button (brand-new player). `preview_console_logs` level `error` → none.

- [ ] **Step 6: Bump the service worker cache**

In `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v8';` to `const CACHE_NAME = 'sky-tycoon-v9';`.
Run: `grep -n "CACHE_NAME = " /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → shows `sky-tycoon-v9`. Run `node --check /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → no errors.

- [ ] **Step 7: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): remove queue dev test hook + bump SW cache to v9

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Deploy (only after the user confirms)**

This is outward-facing. The user's standing rule: do NOT commit/deploy without explicit confirmation — and the working tree is already committed, so this step is the push. Confirm with the user before pushing. Then:
```bash
cd /usr/local/var/www/dojohnso.github.io && git push origin main
```
Verify the live deploy:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  q=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "data-dequeue"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: dequeue=$q sw=$swv"; \
  if [ "$q" -ge 1 ] && [ "$swv" = "sky-tycoon-v9" ]; then echo LIVE; break; fi; done
```
Expected: `dequeue>=1`, `sw=sky-tycoon-v9`, then `LIVE`.

---

## Self-Review Notes

- **Spec coverage:** queue state + queueSize (Task 1); enqueue/dequeue + completeFlight auto-advance (Task 2); buyQueueUpgrade + parameterized statBar (Task 3); queue strip UI, tap-to-queue, tap-to-remove, board-tappable-while-flying (Task 4); Queue upgrade card + button wiring (Task 5); migration guard (Task 1), persistence + remove-test-hook + SW bump + deploy (Task 6). Autopilot hook = isolated `enqueueJob` (Task 2). All spec sections covered.
- **Placeholder scan:** none. Every code step shows complete before/after.
- **Type consistency:** `state.queue` (array of job objects), `state.queueUps` (int), `queueSize()` = `QUEUE_BASE + state.queueUps`. Functions `enqueueJob(job)`, `dequeueJob(jobId)`, `buyQueueUpgrade()`, `queueUpgradeCost(count)` referenced consistently. `statBar(count, max)` — default `max` preserves all existing 1-arg calls (Engine/Cargo), queue passes `MAX_QUEUE_UPGRADES`. Data attributes: `data-job` (board tap), `data-dequeue` (queue slot), `data-up="queue"` (upgrade), all matched between render and `onContentClick`. `data-up` now branches engine/cargo/queue — Cargo button uses `data-up="cargo"` (confirmed present).
