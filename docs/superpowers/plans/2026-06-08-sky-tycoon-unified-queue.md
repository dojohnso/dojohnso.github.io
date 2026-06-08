# Sky Tycoon Unified Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the currently-flying job live in queue slot 0 (with a gold progress fill), unify "flying + queued" into one strip, change queue cards to show place + $reward, and make queue size count total slots (active + waiting).

**Architecture:** `state.queue[0]` becomes the active flight (when flying). `enqueueJob` adds to the queue and starts the front job if nothing is flying; `completeFlight` shifts the finished front job and promotes the next; `dequeueJob` refuses to remove the flying slot 0. The progress fill moves from the board job-row to the active queue slot. `load()` migrates old saves so the flying job sits at `queue[0]`.

**Tech Stack:** Vanilla HTML/CSS/JS in the single file `sky-tycoon/index.html` (+ a one-line cache bump in `sky-tycoon/sw.js`). No build tools. Verified via the preview tools (`preview_*`). Save under `localStorage` key `skyTycoonSave_v1`.

---

## File Structure

All changes in **`/usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`** plus a one-line bump in `sky-tycoon/sw.js`:
- **Actions:** `enqueueJob` (no active-flight requirement; starts front job), `completeFlight` (shift + promote), `dequeueJob` (guard slot 0), and the `onContentClick` `[data-job]` branch (simplify to `enqueueJob`).
- **State:** `load()` migration so the flying job is `queue[0]`.
- **Render:** `renderFly` (drop board active-row handling), `queueStripHTML` (place + $reward; active slot 0 with fill + no dequeue), `updateActiveJobProgress` (target the active queue slot).
- **CSS:** `.queue-slot.active` progress fill.

Testing: no automated framework. Pure logic via a `?test` console-assert hook run in the browser; UI/flow via the preview tools. The service worker can serve a stale page — every browser verification starts by clearing it. Each task ends with a commit **only after the user confirms** (the user's standing rule: do not `git commit` until they OK the result — the controller handles this between tasks, so each task's implementer should STOP before committing and report; the controller commits after the user confirms). To keep the subagent workflow intact, each implementer task ends by REPORTING (not committing); the controller commits per the user's rule.

A reusable SW-clear snippet, referred to as **[SW-CLEAR]**:
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```

> **Commit policy note for the executor:** The user requires explicit confirmation before any `git commit`. Implementer subagents should make the code changes and run the in-file `node --check`, then STOP and report — they should NOT run `git commit`. The controller verifies in-browser, shows the user, and commits the batch after the user's OK. Where a task below says "Commit", treat it as "controller commits after user confirmation."

---

## Task 1: Actions — enqueue/complete/dequeue rework + onContentClick

**Files:**
- Modify: `sky-tycoon/index.html` (Actions section + onContentClick)

- [ ] **Step 1: Rework enqueueJob (no active-flight gate; start the front job)**

Replace `enqueueJob` (currently requires an active flight):
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
```
with:
```js
  // Add a takeable board job to the queue. The queue holds the active flight (slot
  // 0) plus waiting jobs, so this works whether or not a flight is active: it pushes
  // the job and, if nothing is flying, starts it (it's now at the front). Isolated
  // as the autopilot hook. Returns true if added.
  function enqueueJob(job) {
    if (state.queue.length >= queueSize()) return false;         // all slots full
    if (!canTakeJob(job, currentStats().capacity)) return false; // takeable only
    state.jobs = state.jobs.filter(j => j.id !== job.id);        // move off the board
    state.queue.push(job);
    if (!state.activeFlight) startJob(job);                      // it's now the front → fly it
    refillBoard();
    save();
    return true;
  }
```

- [ ] **Step 2: Rework completeFlight (shift the finished front job, promote the next)**

Replace `completeFlight`:
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
with:
```js
  function completeFlight() {
    const f = state.activeFlight;
    if (!f) return;
    state.money += f.payout;
    state.queue.shift();             // the finished flight was queue[0]; remove it
    state.activeFlight = null;
    // Promote the next queued job to flying (it's now the front), if any.
    if (state.queue.length > 0) {
      startJob(state.queue[0]);      // startJob saves; uses current stats
    }
    refillBoard();
    save();
  }
```

- [ ] **Step 3: Guard dequeueJob against removing the flying slot 0**

Replace `dequeueJob`:
```js
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
with:
```js
  // Remove a WAITING job from the queue (slot 1+). The flying job (slot 0) can't be
  // removed. The removed job disappears; board refills to stay full.
  function dequeueJob(jobId) {
    if (state.activeFlight && state.queue[0] && state.queue[0].id === jobId) return false; // can't cancel the flying job
    const before = state.queue.length;
    state.queue = state.queue.filter(j => j.id !== jobId);
    if (state.queue.length === before) return false;       // unknown id
    refillBoard();
    save();
    return true;
  }
```

- [ ] **Step 4: Simplify the onContentClick job-tap branch**

Find the `[data-job]` branch in `onContentClick`:
```js
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
Replace it with (enqueueJob now handles both fly-now and queue):
```js
    const jobEl = e.target.closest('[data-job]');
    if (jobEl) {
      const job = state.jobs.find(j => j.id === jobEl.dataset.job);
      if (job && enqueueJob(job)) renderAll();
      return;
    }
```

- [ ] **Step 5: Add a temporary test hook**

At the very END of the `<script>` (after the `boot();` call and the `if ('serviceWorker' in navigator) { ... }` block), add:
```js
  if (location.search.includes('test')) {
    // tap with no flight: starts it AND it's queue[0]
    state = freshState(); refillBoard();
    const a = state.jobs.find(j => j.cargo <= currentStats().capacity);
    console.assert(enqueueJob(a) === true, 'enqueue with no flight works');
    console.assert(state.activeFlight && state.activeFlight.jobId === a.id, 'tapped job is flying');
    console.assert(state.queue[0] && state.queue[0].id === a.id, 'flying job is queue[0]');
    // queue another while flying
    const b = state.jobs.find(j => j.cargo <= currentStats().capacity);
    console.assert(enqueueJob(b) === true, 'queue a 2nd while flying');
    console.assert(state.queue.length === 2 && state.queue[1].id === b.id, 'b waits in slot 1');
    // total-slot cap: size 2 → no third
    state.queueUps = 0;
    const c = state.jobs.find(j => j.cargo <= currentStats().capacity);
    if (c) console.assert(enqueueJob(c) === false, 'reject when total slots full (size 2)');
    // cannot dequeue the flying slot 0; can dequeue waiting slot 1
    console.assert(dequeueJob(a.id) === false, 'cannot remove the flying job (slot 0)');
    console.assert(dequeueJob(b.id) === true && state.queue.length === 1, 'can remove a waiting job');
    // completeFlight shifts the finished front + promotes the next
    state = freshState(); refillBoard();
    const j1 = state.jobs.find(j => j.cargo <= currentStats().capacity); enqueueJob(j1);
    const j2 = state.jobs.find(j => j.cargo <= currentStats().capacity); enqueueJob(j2);
    const moneyBefore = state.money, pay = state.activeFlight.payout;
    completeFlight();
    console.assert(state.money === moneyBefore + pay, 'completeFlight credits payout');
    console.assert(state.activeFlight && state.activeFlight.jobId === j2.id, 'next queued promoted to flying');
    console.assert(state.queue.length === 1 && state.queue[0].id === j2.id, 'promoted job is now queue[0]');
    // completeFlight with only the flying job → parked
    state = freshState(); refillBoard();
    enqueueJob(state.jobs.find(j => j.cargo <= currentStats().capacity));
    completeFlight();
    console.assert(state.activeFlight === null && state.queue.length === 0, 'last flight done → parked, queue empty');
    localStorage.removeItem('skyTycoonSave_v1');
    console.log('Sky Tycoon unified-queue tests T1: done (check for assertion errors above)');
  }
```

- [ ] **Step 6: Verify syntax + run the test**

Extract the script between `<script>` and `</script>` to a temp .js file and `node --check` (no errors). Then (controller) run **[SW-CLEAR]**, navigate to `http://localhost:3850/?test`, read `preview_console_logs` level `all` — expect "unified-queue tests T1: done" with NO assertion failures. Do NOT start a server beyond the existing preview.

- [ ] **Step 7: Commit (controller, after user confirms)**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): unify queue — flying job is queue[0]; enqueue starts front

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: load() migration — put the flying job at queue[0]

**Files:**
- Modify: `sky-tycoon/index.html` (load)

- [ ] **Step 1: Add the migration**

In `load()`, find these lines (the corrupt-queue guard):
```js
      if (!Array.isArray(merged.jobs)) merged.jobs = [];
      if (!Array.isArray(merged.queue)) merged.queue = [];   // corrupt/old save → empty queue
```
Add immediately AFTER the `merged.queue` guard line:
```js
      // Unified-queue invariant: if a flight is active, its job must be queue[0].
      // Old saves kept the flying job OUT of the queue — migrate it to the front.
      const af = merged.activeFlight;
      if (af && (!merged.queue[0] || merged.queue[0].id !== af.jobId)) {
        merged.queue.unshift({ id: af.jobId, place: af.place, payout: af.payout, cargo: 1, flightTime: 1 });
      }
```
(The synthesized job's `cargo`/`flightTime` are placeholders never read again — the active flight's timing lives in `merged.activeFlight`; on completion the front job is shifted out and discarded. The queue slot only displays `place` + `payout`.)

- [ ] **Step 2: Extend the test hook for migration**

Inside the EXISTING `if (location.search.includes('test'))` block, add BEFORE the final `console.log`:
```js
    // migration: old-format save (activeFlight present, NOT in queue) → flying job at queue[0]
    localStorage.setItem('skyTycoonSave_v1', JSON.stringify({
      money: 5, planeId: 'prop', planes: { prop: { speedUps: 0, capUps: 0 } },
      jobs: [], queue: [{ id: 'jwait', place: 'Waitville', payout: 9, cargo: 1, flightTime: 5 }],
      queueUps: 0,
      activeFlight: { jobId: 'jfly', place: 'Flyville', totalMs: 5000, startedAt: 0, elapsedMs: 1000, payout: 12 }
    }));
    const m = load();
    console.assert(m.queue[0] && m.queue[0].id === 'jfly', 'migration: flying job is queue[0]');
    console.assert(m.queue[1] && m.queue[1].id === 'jwait', 'migration: waiting job follows');
    console.assert(m.queue[0].place === 'Flyville' && m.queue[0].payout === 12, 'migration: slot shows flying place+payout');
    localStorage.removeItem('skyTycoonSave_v1');
```

- [ ] **Step 3: Verify syntax + run the test**

`node --check` the extracted script (no errors). (Controller) **[SW-CLEAR]**, `http://localhost:3850/?test`, read logs — "T1: done", no assertion failures.

- [ ] **Step 4: Commit (controller, after user confirms)**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): migrate saves so the flying job sits at queue[0]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Render — board simplification, queue card (place + $reward + active fill), CSS

**Files:**
- Modify: `sky-tycoon/index.html` (renderFly, queueStripHTML, updateActiveJobProgress, CSS)

- [ ] **Step 1: Add the active-queue-slot fill CSS**

In the `<style>` block, find the `.queue-slot .qs-meta { opacity:.8; }` line. Add immediately AFTER it:
```css
  /* the flying job's slot (slot 0): gold progress fill tracking --pct, like the old job row */
  .queue-slot { position:relative; overflow:hidden; }
  .queue-slot.active { border-color:var(--gold); cursor:default; }
  .queue-slot.active::before { content:''; position:absolute; inset:0; z-index:0;
    width:var(--pct,0%); background:linear-gradient(90deg, rgba(255,216,58,.30), rgba(255,216,58,.14));
    transition:width .12s linear; pointer-events:none; }
  .queue-slot > * { position:relative; z-index:1; }
```

- [ ] **Step 2: Simplify renderFly's board rows (drop the active-row handling)**

Replace the `state.jobs.map(...)` block + the `rows` assignment inside `renderFly()`. The current version special-cases the active job (`isActive`, `data-active-job`, `--pct`). Replace the whole map:
```js
    const rows = state.jobs.map(job => {
      const isActive = flying && job.id === f.jobId;             // the job currently in flight
      const takeable = canTakeJob(job, cap);
      // Tappable when: idle (fly now), or flying with queue room (queue it). NOT the
      // in-flight job itself — it stays on the board for its progress fill, so
      // without this guard tapping it would enqueue the flying job behind itself.
      const ok = !isActive && takeable && (!flying || queueHasRoom);
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
```
with (the flying job is no longer on the board — it's in the queue — so no active-row handling; rows are tappable when takeable and the queue has a free slot):
```js
    const rows = state.jobs.map(job => {
      const takeable = canTakeJob(job, cap);
      const ok = takeable && queueHasRoom;     // tappable when room in the queue
      const locked = !takeable;
      const cls = 'job' + (ok ? '' : ' disabled');
      return (
        '<div class="' + cls + '" ' + (ok ? 'data-job="' + job.id + '"' : '') + '>' +
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
```
NOTE: `f` and `flying` and `queueHasRoom` are still declared above this block in `renderFly` (they're used: `flying` gates the decline ✕, `queueHasRoom` gates `ok`). Do not remove those declarations.

- [ ] **Step 3: Rewrite queueStripHTML — place + $reward, active slot 0 with fill, no dequeue on slot 0**

Replace `queueStripHTML()`:
```js
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
with (slot 0 while flying is `active`, shows the progress fill, and is NOT removable; cards show place + $reward):
```js
  function queueStripHTML() {
    const size = queueSize();
    const f = state.activeFlight;
    let slots = '';
    for (let i = 0; i < size; i++) {
      const job = state.queue[i];
      if (job) {
        const isFlying = !!f && i === 0;     // slot 0 is the active flight
        const pct = isFlying ? Math.round(Math.min(1, f.elapsedMs / f.totalMs) * 100) : 0;
        slots += '<div class="queue-slot filled' + (isFlying ? ' active" style="--pct:' + pct + '%"' : '" data-dequeue="' + job.id + '" title="Remove from queue"') + '>' +
          '<div class="qs-place">→ ' + job.place + '</div>' +
          '<div class="qs-meta">' + fmt(job.payout) + '</div>' +
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

- [ ] **Step 4: Retarget updateActiveJobProgress to the active queue slot**

Replace `updateActiveJobProgress`:
```js
  // Update the in-flight job row's gold progress fill (cheap; called each tick on
  // the Fly view). The row itself is built by renderFly with data-active-job.
  function updateActiveJobProgress() {
    const f = state.activeFlight;
    if (!f) return;
    const row = $('[data-active-job]');
    if (!row) return;
    const pct = Math.round(Math.min(1, f.elapsedMs / f.totalMs) * 100);
    row.style.setProperty('--pct', pct + '%');
  }
```
with (now targets the active queue slot, `.queue-slot.active`):
```js
  // Update the flying job's queue-slot gold fill (cheap; called each tick on the
  // Fly view). Slot 0 is built by queueStripHTML with class `active`.
  function updateActiveJobProgress() {
    const f = state.activeFlight;
    if (!f) return;
    const slot = $('.queue-slot.active');
    if (!slot) return;
    const pct = Math.round(Math.min(1, f.elapsedMs / f.totalMs) * 100);
    slot.style.setProperty('--pct', pct + '%');
  }
```

- [ ] **Step 5: Verify syntax**

`node --check` the extracted script (no errors). Confirm the board no longer emits `data-active-job`:
`grep -c "data-active-job" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → expect `0`.

- [ ] **Step 6: Verify the UI in the browser (controller)**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. Then:
1. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); startGame(); 'fresh'`. `preview_screenshot` → "QUEUE 0/2" strip, 2 empty slots.
2. Tap a board job: `preview_click` `.job-board .job[data-job]`. `preview_eval`: `({queueLen: state.queue.length, flying: !!state.activeFlight, slot0Active: !!document.querySelector('.queue-slot.active'), slot0Text: document.querySelector('.queue-slot.filled') && document.querySelector('.queue-slot.filled').textContent})`. Expect `queueLen:1`, `flying:true`, `slot0Active:true`, and the slot text shows the destination + a `$` amount (NOT a cargo count). `preview_screenshot` → slot 0 shows the job with a gold fill starting to advance.
3. Queue a 2nd: inject a long active flight so it stays flying, then queue: `preview_eval`:
   ```js
   (function(){ state.activeFlight.totalMs=300000; state.activeFlight.startedAt=Date.now(); state.activeFlight.elapsedMs=0; var b=state.jobs.find(function(j){return j.cargo<=currentStats().capacity;}); enqueueJob(b); renderAll(); return {queueLen: state.queue.length}; })()
   ```
   Expect `queueLen:2`. `preview_screenshot` → slot 0 = flying (gold fill, no ✕-style removal), slot 1 = the waiting job (place + $reward).
4. Tap slot 0 (flying) → no-op: `preview_eval`: `document.querySelector('.queue-slot.active').click(); state.queue.length` → still `2`.
5. Tap slot 1 (waiting) → removed: `preview_click` `.queue-slot.filled:not(.active)`. `preview_eval`: `state.queue.length` → `1`.
6. Read `preview_console_logs` level `error` → none.

- [ ] **Step 7: Commit (controller, after user confirms)**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): queue card place+\$reward, fill on flying slot 0, board simplified

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: End-to-end verification, remove test hook, SW bump, deploy

**Files:**
- Modify: `sky-tycoon/index.html` (remove `?test`), `sky-tycoon/sw.js` (cache bump)

- [ ] **Step 1: Full auto-advance flow (controller)**

Run **[SW-CLEAR]**, `http://localhost:3850/`. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); startGame(); 'fresh'`.
- Tap a board job (`preview_click` `.job-board .job[data-job]`), then queue one more behind it (inject long flight + enqueue as in Task 3 Step 3).
- Verify slot 0 has the fill and slot 1 waits.
- Now force the active flight to finish and auto-advance: `preview_eval`:
  ```js
  (function(){ state.activeFlight.startedAt = Date.now() - state.activeFlight.totalMs - 100; tick(); return { flying: !!state.activeFlight, slot0Id: state.queue[0] && state.queue[0].id, queueLen: state.queue.length }; })()
  ```
  Expect `flying:true` (the waiting job promoted), `queueLen:1`. `preview_screenshot` → the promoted job now in slot 0 with a fresh fill; the runway snap (existing) plays cleanly (no zoom streak).

- [ ] **Step 2: Persistence across reload (mid-flight, flying job in slot 0)**

`preview_eval`: set up a guaranteed-persisting state: `(function(){ state=freshState(); startGame(); var a=state.jobs.find(function(j){return j.cargo<=currentStats().capacity;}); enqueueJob(a); state.activeFlight.totalMs=300000; state.activeFlight.startedAt=Date.now(); state.activeFlight.elapsedMs=0; var b=state.jobs.find(function(j){return j.cargo<=currentStats().capacity;}); enqueueJob(b); save(); return state.queue.length; })()` → expect `2`. Reload: `preview_eval`: `location.reload(); 'reload'`. `preview_click` `[data-title-action="continue"]`. `preview_eval`: `({ queueLen: state.queue.length, slot0Flying: state.queue[0] && state.activeFlight && state.queue[0].id === state.activeFlight.jobId, slot0HasFill: !!document.querySelector('.queue-slot.active') })` → expect `queueLen:2`, `slot0Flying:true`, `slot0HasFill:true`.

- [ ] **Step 3: No errors + mobile**

`preview_console_logs` level `error` → none. `preview_resize` preset `mobile`; ensure FLY view (`preview_eval`: `setView('fly')`); `preview_screenshot` → queue strip + slots fit cleanly, slot 0 fill visible, no horizontal scroll. `preview_resize` preset `desktop`.

- [ ] **Step 4: Remove the test hook**

Delete the entire `if (location.search.includes('test')) { … }` block from the end of `<script>`. Verify:
- `grep -c "location.search.includes" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → `0`.
- `grep -c "console.assert" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → `0`.
- `grep -c "boot();" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html` → `1`.

- [ ] **Step 5: Reset clean + final check (controller)**

Run **[SW-CLEAR]**, `http://localhost:3850/`. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'clean'`. `preview_screenshot` → title with a single Start Game button. `preview_console_logs` level `error` → none.

- [ ] **Step 6: Bump the service worker cache**

In `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v9';` to `const CACHE_NAME = 'sky-tycoon-v10';`.
- `grep -n "CACHE_NAME = " /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → `sky-tycoon-v10`.
- `node --check /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → no errors.

- [ ] **Step 7: Commit (controller, after user confirms)**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): remove unified-queue dev test hook + bump SW cache to v10

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Deploy (only after the user confirms the push)**

Outward-facing. The user must explicitly OK the push. Then:
```bash
cd /usr/local/var/www/dojohnso.github.io && git push origin main
```
Verify live:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  q=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "queue-slot.active\|queue-slot active"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: sw=$swv"; \
  if [ "$swv" = "sky-tycoon-v10" ]; then echo LIVE; break; fi; done
```
Expected: `sw=sky-tycoon-v10`, then `LIVE`.

---

## Self-Review Notes

- **Spec coverage:** flying job = queue[0] (Task 1 enqueue/complete); enqueue works idle+flying (Task 1); completeFlight shift+promote (Task 1); dequeue guards slot 0 (Task 1); onContentClick simplified (Task 1); total-slot queueSize (enforced by enqueue's `>= queueSize()` cap — Task 1); migration to queue[0] (Task 2); queue card place+$reward (Task 3); fill on slot 0 + updateActiveJobProgress retarget + CSS (Task 3); board active-row removed (Task 3); SW bump + deploy (Task 4). All covered.
- **Placeholder scan:** none. Every code step shows complete before/after.
- **Type consistency:** `state.queue[0]` = active flight's job; `state.activeFlight.jobId` matches `state.queue[0].id` (invariant held by enqueue/complete/migration). `enqueueJob(job)`, `completeFlight()`, `dequeueJob(jobId)` signatures unchanged. `queueStripHTML` slot 0 → `.queue-slot.active` with `--pct`, matched by `updateActiveJobProgress` selector `.queue-slot.active` and the `.queue-slot.active::before` CSS. Waiting slots keep `data-dequeue`; slot 0 omits it. Board rows no longer emit `data-active-job` (grep guard in Task 3 Step 5). `fmt(job.payout)` used for the slot's `$reward`.
