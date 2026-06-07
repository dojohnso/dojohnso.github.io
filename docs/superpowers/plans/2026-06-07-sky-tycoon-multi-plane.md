# Sky Tycoon Multiple Owned Planes + Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player own multiple planes and switch between which one they fly (each plane keeps its own upgrades), fix the Shop "cost button on an owned plane" bug, and make the top scene plane update immediately when a plane is selected.

**Architecture:** Replace the single-plane state fields (`speedUps`/`capUps` at top level) with a `state.planes` map of owned plane id → `{speedUps, capUps}`. `state.planeId` stays as the currently-flown plane. A `curPlane()` accessor returns the active plane's upgrade record; all upgrade reads/writes go through it. `load()` migrates old saves. Shop renders three states (FLYING / Switch / Buy); a new `switchPlane()` (blocked mid-flight) changes the active plane; `renderAll()` also refreshes the scene so the swap is immediate.

**Tech Stack:** Vanilla HTML/CSS/JS in the single file `sky-tycoon/index.html`. No build tools. Verified via the preview tools (`preview_*`). A `localStorage` save under key `skyTycoonSave_v1`.

---

## File Structure

All changes are in **`/usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`** (plus a one-line cache bump in `sky-tycoon/sw.js` at the end):
- **State:** `freshState()` shape, `load()` migration, new `curPlane()` accessor.
- **Actions:** `buyEngineUpgrade`/`buyCargoUpgrade` (per-plane), `buyPlane` (adds ownership), new `switchPlane`, `currentStats`.
- **Render:** stat panel + `renderUpgrade` reads via `curPlane()`; `renderShop` three states; `renderAll` adds `renderScene()`.
- **Events:** new `[data-switch]` branch in `onContentClick`.

Important pre-existing detail: there is NO automated test framework (single-file PWA). Logic is checked with the browser console (`preview_eval`) and behavior with the preview tools. The service worker can serve a stale page — every browser verification step starts by clearing it. Each task ends with a commit.

A reusable SW-clear snippet (used in verification steps below), referred to as **[SW-CLEAR]**:
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```

---

## Task 1: Data model — freshState, curPlane, load migration

**Files:**
- Modify: `sky-tycoon/index.html` (State section)

- [ ] **Step 1: Change freshState() to the per-plane shape**

Replace the current `freshState()` (around lines 268–277):
```js
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
      activeFlight: null, // { jobId, place, totalMs, elapsedMs, payout }
    };
  }
```

- [ ] **Step 2: Add the curPlane() accessor and migrate load()**

Replace the current `load()` (around lines 283–294):
```js
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      // Merge onto fresh defaults so missing fields don't break older saves.
      const merged = Object.assign(freshState(), parsed);
      // Guard against a corrupt save (e.g. jobs got nulled) crashing boot.
      if (!Array.isArray(merged.jobs)) merged.jobs = [];
      return merged;
    } catch (e) { return freshState(); }
  }
```
with:
```js
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      // Merge onto fresh defaults so missing fields don't break older saves.
      const merged = Object.assign(freshState(), parsed);
      if (!Array.isArray(merged.jobs)) merged.jobs = [];
      // Migrate legacy saves (top-level speedUps/capUps, no planes map): keep the
      // current plane's upgrades by seeding the planes map from them.
      if (!merged.planes || typeof merged.planes !== 'object') {
        merged.planes = { [merged.planeId]: { speedUps: parsed.speedUps || 0, capUps: parsed.capUps || 0 } };
      }
      // Always ensure the current plane has an upgrade record so stat reads can't crash.
      if (!merged.planes[merged.planeId]) {
        merged.planes[merged.planeId] = { speedUps: 0, capUps: 0 };
      }
      // Drop the now-unused legacy top-level counts.
      delete merged.speedUps;
      delete merged.capUps;
      return merged;
    } catch (e) { return freshState(); }
  }

  // The upgrade record for the plane currently being flown.
  function curPlane() { return state.planes[state.planeId]; }
```

- [ ] **Step 3: Point currentStats() at curPlane()**

Replace (around line 296):
```js
  function currentStats() { return planeStats(state.planeId, state.speedUps, state.capUps); }
```
with:
```js
  function currentStats() { return planeStats(state.planeId, curPlane().speedUps, curPlane().capUps); }
```

- [ ] **Step 4: Verify state shape + migration in the browser**

Use `preview_start` (name `sky-tycoon`) if needed, navigate `http://localhost:3850/`. Run **[SW-CLEAR]**, then:
1. Fresh state — `preview_eval`:
   ```js
   (function(){localStorage.removeItem('skyTycoonSave_v1');state=load();return {planeId:state.planeId, planes:state.planes, cur: curPlane()};})()
   ```
   Expected: `planeId:'prop'`, `planes:{prop:{speedUps:0,capUps:0}}`, `cur:{speedUps:0,capUps:0}`.
2. Legacy migration — `preview_eval`:
   ```js
   (function(){localStorage.setItem('skyTycoonSave_v1', JSON.stringify({money:99,planeId:'twin',speedUps:3,capUps:2,jobs:[],activeFlight:null}));state=load();return {planeId:state.planeId, planes:state.planes, hasLegacy: ('speedUps' in state)};})()
   ```
   Expected: `planeId:'twin'`, `planes:{twin:{speedUps:3,capUps:2}}`, `hasLegacy:false` (legacy fields stripped, twin's upgrades preserved).
3. Clean up: `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); 'ok'`.

Read `preview_console_logs` level `error` → expect none.

- [ ] **Step 5: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): per-plane ownership data model + save migration

state.planes maps owned plane id -> {speedUps,capUps}; curPlane() returns
the active plane's upgrades; load() migrates legacy single-plane saves.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Actions — upgrades per-plane, buyPlane ownership, switchPlane

**Files:**
- Modify: `sky-tycoon/index.html` (Actions section)

- [ ] **Step 1: Make the upgrade actions operate on curPlane()**

Replace `buyEngineUpgrade()` (around lines 343–351):
```js
  function buyEngineUpgrade() {
    if (state.speedUps >= MAX_UPGRADES) return false;   // plane maxed on speed
    const cost = upgradeCost(state.speedUps);
    if (state.money < cost) return false;
    state.money -= cost;
    state.speedUps += 1;
    save();
    return true;
  }
```
with:
```js
  function buyEngineUpgrade() {
    const cp = curPlane();
    if (cp.speedUps >= MAX_UPGRADES) return false;   // this plane maxed on speed
    const cost = upgradeCost(cp.speedUps);
    if (state.money < cost) return false;
    state.money -= cost;
    cp.speedUps += 1;
    save();
    return true;
  }
```
Replace `buyCargoUpgrade()` (around lines 353–361):
```js
  function buyCargoUpgrade() {
    if (state.capUps >= MAX_UPGRADES) return false;     // plane maxed on capacity
    const cost = upgradeCost(state.capUps);
    if (state.money < cost) return false;
    state.money -= cost;
    state.capUps += 1;
    save();
    return true;
  }
```
with:
```js
  function buyCargoUpgrade() {
    const cp = curPlane();
    if (cp.capUps >= MAX_UPGRADES) return false;     // this plane maxed on capacity
    const cost = upgradeCost(cp.capUps);
    if (state.money < cost) return false;
    state.money -= cost;
    cp.capUps += 1;
    save();
    return true;
  }
```

- [ ] **Step 2: buyPlane adds ownership and flies the new plane**

Replace `buyPlane()` (around lines 363–374):
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
with:
```js
  function buyPlane(planeId) {
    const plane = PLANES.find(p => p.id === planeId);
    if (!plane || state.planes[planeId]) return false;   // invalid or already owned
    if (state.money < plane.price) return false;
    state.money -= plane.price;
    state.planes[planeId] = { speedUps: 0, capUps: 0 };  // now owned, fresh upgrades
    state.planeId = planeId;                             // start flying it
    // New (larger) capacity may make current locked jobs takeable; board stays.
    save();
    return true;
  }
```

- [ ] **Step 3: Add switchPlane (blocked mid-flight)**

Add this new function immediately AFTER `buyPlane()`:
```js
  function switchPlane(planeId) {
    if (state.activeFlight) return false;                // can't switch mid-flight
    if (!state.planes[planeId] || planeId === state.planeId) return false; // unowned or already flying
    state.planeId = planeId;
    save();
    return true;
  }
```

- [ ] **Step 4: Verify actions in the browser**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. Then `preview_eval`:
```js
(function(){
  localStorage.removeItem('skyTycoonSave_v1'); state = freshState();
  state.money = 99999;
  const r = {};
  // buy twin -> owned + flying it
  r.bought = buyPlane('twin');
  r.owns = Object.keys(state.planes);
  r.flying = state.planeId;
  // upgrade twin cargo, then switch to prop, confirm prop has 0 and twin kept 1
  buyCargoUpgrade();
  r.twinCapAfterUpgrade = state.planes.twin.capUps;
  r.switchedToProp = switchPlane('prop');
  r.propCap = state.planes.prop.capUps;
  r.twinStillHasCap = state.planes.twin.capUps;
  // cannot switch to a plane you don't own, or buy one you own
  r.switchUnowned = switchPlane('jet');     // false
  r.rebuyOwned = buyPlane('twin');          // false
  // cannot switch mid-flight
  state.activeFlight = { jobId:'x' };
  r.switchMidFlight = switchPlane('twin');  // false
  state.activeFlight = null;
  return r;
})()
```
Expected: `bought:true`, `owns:['prop','twin']`, `flying:'twin'` (then after switch, prop), `twinCapAfterUpgrade:1`, `switchedToProp:true`, `propCap:0`, `twinStillHasCap:1`, `switchUnowned:false`, `rebuyOwned:false`, `switchMidFlight:false`.

Clean up: `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); 'ok'`. Read `preview_console_logs` level `error` → none.

- [ ] **Step 5: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): per-plane upgrades, buyPlane ownership, switchPlane

Upgrades read/write the active plane's record; buyPlane adds the plane to
ownership and flies it; switchPlane changes the active owned plane (blocked
during a flight).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rendering reads — stat panel + upgrade view via curPlane()

**Files:**
- Modify: `sky-tycoon/index.html` (renderFly stat panel, renderUpgrade)

- [ ] **Step 1: Stat panel reads from curPlane()**

In `renderFly()`, replace (around lines 552–556):
```js
    const panel =
      '<div class="stat-panel">' +
        statRow('CARGO', st.capacity, state.capUps) +
        statRow('SPEED', st.speed.toFixed(1), state.speedUps) +
      '</div>';
```
with:
```js
    const cp = curPlane();
    const panel =
      '<div class="stat-panel">' +
        statRow('CARGO', st.capacity, cp.capUps) +
        statRow('SPEED', st.speed.toFixed(1), cp.speedUps) +
      '</div>';
```

- [ ] **Step 2: Upgrade view reads from curPlane()**

In `renderUpgrade()`, replace the top (around lines 561–565):
```js
    const st = currentStats();
    const capMaxed = state.capUps >= MAX_UPGRADES;
    const speedMaxed = state.speedUps >= MAX_UPGRADES;
    const engineCost = upgradeCost(state.speedUps);
    const cargoCost = upgradeCost(state.capUps);
```
with:
```js
    const st = currentStats();
    const cp = curPlane();
    const capMaxed = cp.capUps >= MAX_UPGRADES;
    const speedMaxed = cp.speedUps >= MAX_UPGRADES;
    const engineCost = upgradeCost(cp.speedUps);
    const cargoCost = upgradeCost(cp.capUps);
```
And replace the two `statBar(...)` calls further down (around lines 579 and 583):
```js
        statBar(state.speedUps) + engineBtn +
```
→
```js
        statBar(cp.speedUps) + engineBtn +
```
and
```js
        statBar(state.capUps) + cargoBtn +
```
→
```js
        statBar(cp.capUps) + cargoBtn +
```

- [ ] **Step 3: Confirm no `state.speedUps`/`state.capUps` references remain**

Run: `grep -n "state.speedUps\|state.capUps" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`
Expected: NO matches (all upgrade reads now go through `curPlane()`).

- [ ] **Step 4: Verify the views render correctly in the browser**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. `preview_eval` to set up a started game on the prop with one cargo upgrade:
```js
(function(){localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=99999; if (typeof startGame==='function') startGame(); buyCargoUpgrade(); renderAll(); return {cap: currentStats().capacity, capUps: curPlane().capUps};})()
```
Expected: `cap:3`, `capUps:1` (prop base 2 + 1 step). `preview_screenshot` of the FLY view → the CARGO stat shows 3 with a 2/6-filled bar. `preview_click` the UPGRADE nav (`.nav-btn[data-view="upgrade"]`), `preview_screenshot` → Cargo Hold shows Capacity 3 and the next cost $30. Read `preview_console_logs` level `error` → none.

- [ ] **Step 5: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): stat panel + upgrade view read per-plane upgrades

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Shop three states + switch event + immediate scene update

**Files:**
- Modify: `sky-tycoon/index.html` (renderShop, CSS, onContentClick, renderAll)

- [ ] **Step 1: Render three states in the Shop**

Replace `renderShop()` (around lines 587–605):
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
          '<div class="plane-thumb" data-plane="' + p.id + '"></div>' +
          '<div class="plane-info"><div class="plane-name">' + p.name + '</div>' +
          '<div class="plane-stats">Cap ' + p.cap + ' · Spd ' + p.speed.toFixed(1) + '</div></div>' +
          right +
        '</div>'
      );
    }).join('');
    $('#content').innerHTML = '<div class="shop-list">' + rows + '</div>';
  }
```
with (note: the thumb no longer carries `data-plane` so tapping it can't trigger a buy; the buy/switch buttons own the actions):
```js
  function renderShop() {
    const flying = !!state.activeFlight;
    const rows = PLANES.map(p => {
      const isCurrent = p.id === state.planeId;
      const owned = !!state.planes[p.id];
      let right;
      if (isCurrent) {
        right = '<span class="owned">FLYING</span>';
      } else if (owned) {
        right = '<button class="switch-btn' + (flying ? ' disabled' : '') +
                '" data-switch="' + p.id + '">Switch</button>';
      } else {
        const affordable = state.money >= p.price;
        right = '<button class="buy-btn' + (affordable ? '' : ' disabled') +
                '" data-plane="' + p.id + '">' + fmt(p.price) + '</button>';
      }
      return (
        '<div class="plane-row">' +
          '<div class="plane-thumb" data-plane-thumb="' + p.id + '"></div>' +
          '<div class="plane-info"><div class="plane-name">' + p.name + '</div>' +
          '<div class="plane-stats">Cap ' + p.cap + ' · Spd ' + p.speed.toFixed(1) + '</div></div>' +
          right +
        '</div>'
      );
    }).join('');
    $('#content').innerHTML = '<div class="shop-list">' + rows + '</div>';
  }
```

- [ ] **Step 2: Update the thumb CSS selector + add the switch-btn style**

The thumbnail sprite rules currently key off `.plane-thumb[data-plane="..."]`. Since the thumb attribute changed to `data-plane-thumb`, update those four CSS rules (around lines 143–146):
```css
  .plane-thumb[data-plane="prop"]  { background-image:var(--spr-prop); }
  .plane-thumb[data-plane="twin"]  { background-image:var(--spr-twin); }
  .plane-thumb[data-plane="turbo"] { background-image:var(--spr-turbo); }
  .plane-thumb[data-plane="jet"]   { background-image:var(--spr-jet); }
```
→
```css
  .plane-thumb[data-plane-thumb="prop"]  { background-image:var(--spr-prop); }
  .plane-thumb[data-plane-thumb="twin"]  { background-image:var(--spr-twin); }
  .plane-thumb[data-plane-thumb="turbo"] { background-image:var(--spr-turbo); }
  .plane-thumb[data-plane-thumb="jet"]   { background-image:var(--spr-jet); }
```
Then add a `.switch-btn` style right after the `.owned` rule (around line 151). It mirrors `.buy-btn` but in a blue "select" tone:
```css
  .switch-btn { flex-shrink:0; width:auto; padding:10px 16px; font-family:inherit;
    font-weight:800; font-size:13px; color:#fff; background:#1d6fa5; border:none; cursor:pointer; }
  .switch-btn.disabled { background:#555c70; color:#9aa; cursor:default; }
```

- [ ] **Step 3: Handle switch clicks (before the buy branch)**

In `onContentClick`, add a `[data-switch]` branch immediately BEFORE the existing `[data-plane]` (buy) branch (around line 662):
```js
    const switchEl = e.target.closest('[data-switch]');
    if (switchEl) {
      if (switchPlane(switchEl.dataset.switch)) renderAll();
      return;
    }
    const planeBtn = e.target.closest('[data-plane]');
    if (planeBtn) {
      if (buyPlane(planeBtn.dataset.plane)) renderAll();
      return;
    }
```

- [ ] **Step 4: Make renderAll() refresh the scene (immediate plane swap)**

Replace `renderAll()` (around lines 613–617):
```js
  function renderAll() {
    if (screen !== 'game') return;
    renderTopBar();
    renderCurrentView();
  }
```
with:
```js
  function renderAll() {
    if (screen !== 'game') return;
    renderTopBar();
    renderScene();        // keep the always-visible scene plane in sync (cheap; cache-guarded)
    renderCurrentView();
  }
```

- [ ] **Step 5: Verify the Shop flow + immediate swap in the browser**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. Set up money and enter the game:
```js
(function(){localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=99999; startGame(); setView('shop'); return 'in shop';})()
```
1. `preview_screenshot` → prop row shows **FLYING**, twin/turbo/jet show **price Buy** buttons.
2. Buy the Twin via the real button: `preview_click` `.buy-btn[data-plane="twin"]`. `preview_screenshot` → now twin shows **FLYING**, prop shows a **Switch** button; the top scene plane is the **blue twin**.
3. Switch back to prop: `preview_click` `.switch-btn[data-switch="prop"]`. `preview_eval`:
   ```js
   ({ planeId: state.planeId, sceneAttr: document.querySelector('#scene .plane').getAttribute('data-plane') })
   ```
   Expected: `planeId:'prop'`, `sceneAttr:'prop'` — the scene plane swapped to the red prop IMMEDIATELY while still on the Shop view. `preview_screenshot` to confirm the red prop is shown up top and prop now shows FLYING, twin shows Switch.
4. Switch-disabled-mid-flight: `preview_eval`:
   ```js
   (function(){state.activeFlight={jobId:'x'}; renderAll(); var b=document.querySelector('.switch-btn'); return {disabled: b && b.classList.contains('disabled')};})()
   ```
   Expected: `disabled:true`. Then `preview_eval`: `state.activeFlight=null; renderAll(); 'cleared'`.

Read `preview_console_logs` level `error` → none. Clean up: `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'reset'`.

- [ ] **Step 6: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): shop FLYING/Switch/Buy states + instant scene swap

Owned-but-not-current planes show a Switch button (disabled mid-flight);
current shows FLYING (fixes the cost-button-on-owned bug); thumb uses
data-plane-thumb so it no longer triggers a buy; renderAll refreshes the
scene so switching updates the top plane immediately.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-flow verification + per-plane-upgrade-retention + deploy

**Files:**
- Modify: `sky-tycoon/sw.js` (cache bump only)

- [ ] **Step 1: End-to-end per-plane upgrade retention through the real UI**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. Then drive it through real clicks where possible:
```js
(function(){localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=99999; startGame(); return 'ready';})()
```
- Upgrade the prop's cargo twice (UPGRADE view): `preview_click` `.nav-btn[data-view="upgrade"]`, then `preview_click` `.up-btn[data-up="cargo"]` twice.
- Buy the twin (SHOP): `preview_click` `.nav-btn[data-view="shop"]`, `preview_click` `.buy-btn[data-plane="twin"]`.
- Upgrade twin's engine once: `preview_click` `.nav-btn[data-view="upgrade"]`, `preview_click` `.up-btn[data-up="engine"]`.
- Switch back to prop (SHOP): `preview_click` `.nav-btn[data-view="shop"]`, `preview_click` `.switch-btn[data-switch="prop"]`.
- Verify each plane kept its own upgrades: `preview_eval`:
  ```js
  ({ prop: state.planes.prop, twin: state.planes.twin, flying: state.planeId })
  ```
  Expected: `prop:{speedUps:0,capUps:2}`, `twin:{speedUps:1,capUps:0}`, `flying:'prop'`.

- [ ] **Step 2: Persistence across reload**

`preview_eval`: `location.reload(); 'reload'`. Then (the app boots to the title; tap Continue): `preview_click` `[data-title-action="continue"]`. `preview_eval`:
```js
({ prop: state.planes.prop, twin: state.planes.twin, owns: Object.keys(state.planes) })
```
Expected: prop still `{speedUps:0,capUps:2}`, twin `{speedUps:1,capUps:0}`, `owns:['prop','twin']` — ownership + per-plane upgrades survived the reload.

- [ ] **Step 3: No console errors + mobile layout**

`preview_console_logs` level `error` → none. `preview_resize` preset `mobile`; go to the Shop (`preview_click` `.nav-btn[data-view="shop"]`); `preview_screenshot` → FLYING/Switch/Buy rows fit cleanly with the plane thumbnails, no horizontal scroll. `preview_resize` preset `desktop`.

- [ ] **Step 4: Reset to a clean fresh game**

`preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'clean'` → `preview_screenshot` → title with a single Start Game button (brand-new player).

- [ ] **Step 5: Bump the service worker cache (so returning players get the update)**

In `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v3';` to `const CACHE_NAME = 'sky-tycoon-v4';`.
Run: `grep -n "CACHE_NAME" /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → shows `sky-tycoon-v4`. Run `node --check /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js` → no errors.

- [ ] **Step 6: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): bump SW cache to v4 for multi-plane release

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Deploy (only after the user confirms)**

This is outward-facing. Confirm with the user before pushing. Then:
```bash
cd /usr/local/var/www/dojohnso.github.io && git push origin main
```
Verify the live deploy:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  has=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "data-switch"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: switch=$has sw=$swv"; \
  if [ "$has" -ge 1 ] && [ "$swv" = "sky-tycoon-v4" ]; then echo LIVE; break; fi; done
```
Expected: `switch>=1`, `sw=sky-tycoon-v4`, then `LIVE`.

---

## Self-Review Notes

- **Spec coverage:** data model `state.planes` + `curPlane()` (Task 1); save migration (Task 1 Step 2); per-plane upgrades via `buyEngine/buyCargo` (Task 2 Step 1); `buyPlane` ownership + fly new (Task 2 Step 2); `switchPlane` blocked mid-flight (Task 2 Step 3); `currentStats`/stat panel/upgrade reads via `curPlane()` (Tasks 1 & 3); shop FLYING/Switch/Buy three states fixing the cost-button bug (Task 4 Step 1); `[data-switch]` event (Task 4 Step 3); immediate scene swap via `renderAll`→`renderScene` (Task 4 Step 4); SW cache bump for delivery (Task 5 Step 5). All covered.
- **Placeholder scan:** none. Every code step shows complete before/after.
- **Type consistency:** `state.planes` (object id→{speedUps,capUps}); `curPlane()` returns that record; upgrades referenced as `cp.speedUps`/`cp.capUps` consistently; `switchPlane`/`buyPlane` signatures `(planeId)`; data attributes: `data-switch` (switch button), `data-plane` (buy button only), `data-plane-thumb` (thumbnail, non-interactive) — the thumb attribute rename is matched in both the markup (Task 4 Step 1) and the CSS selectors (Task 4 Step 2). `renderAll` adds `renderScene()` which already exists and is cache-guarded by `sceneKeyFor`.
- **Note:** Task 3 Step 3's grep guard (`no state.speedUps/state.capUps remain`) is the safety net ensuring no upgrade read was missed across Tasks 1–3.
