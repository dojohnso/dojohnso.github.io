# Sky Tycoon Upgrade-Scaling + Concorde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make upgrade costs scale per-plane (so bigger planes cost proportionally more to max — fixing the flat ~$450-to-max-anything bug), drop the Jet to $5,000, and add a 5th plane (Concorde, $9,000) with a new pixel-art sprite.

**Architecture:** Add an `upgradeBase` field to each plane in `PLANES`; change `upgradeCost(count)` → `upgradeCost(count, base)` returning `base*(count+1)`; thread the current plane's base through the 5 call sites via a `curPlaneBase()` helper. Add the Concorde plane row + a new sprite (created with the Aseprite pixel-plugin, exported to PNG, embedded as a base64 `--spr-concorde` CSS var) + its scene/thumb CSS.

**Tech Stack:** Vanilla HTML/CSS/JS in `sky-tycoon/index.html` (+ a one-line cache bump in `sky-tycoon/sw.js`). Pixel art via the pixel-plugin (Aseprite MCP) → PNG in `sky-tycoon/public/` → base64 inline. No build tools. Verified via the preview tools (`preview_*`). Save key `skyTycoonSave_v1`.

---

## Commit policy (IMPORTANT — overrides the skill's per-task commit)

The user requires explicit confirmation before any `git commit`. **Implementer subagents must NOT run `git commit`** — they make the changes, run `node --check`, and report. The controller verifies in-browser and commits the batch only after the user OKs. Each task below ends with "report (do NOT commit)".

A reusable SW-clear snippet, **[SW-CLEAR]** (controller runs via preview_eval):
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```
Prefer running console-assert checks INLINE via `preview_eval` against the loaded page (the local `npx serve` can choke on a `?test` query).

---

## File Structure

- **`sky-tycoon/index.html`** — `PLANES` data, `upgradeCost`, `curPlaneBase`, the 5 cost call sites, the Concorde sprite CSS var + scene/thumb rules.
- **`sky-tycoon/assets/sprites/plane-concorde.aseprite`** — new Aseprite source (created by pixel-plugin).
- **`sky-tycoon/public/plane-concorde.png`** — exported sprite PNG.
- **`sky-tycoon/sw.js`** — cache bump.

### Reference: existing sprite pipeline (already in the repo)
- Native pixel sizes grow with tier: prop 32×16, twin 40×18, turbo 44×18, jet 48×18.
- Aseprite sources in `sky-tycoon/assets/sprites/plane-*.aseprite`; exports in `sky-tycoon/public/plane-*.png`.
- Each sprite is embedded as a base64 data URI CSS var `--spr-<id>` (lines ~19-22), with
  `.plane[data-plane="<id>"]` (scene, scaled ~3.7×) and `.plane-thumb[data-plane-thumb="<id>"]` (shop) rules.
- The Concorde should be ~**52×18** native (a touch larger than the jet's 48×18), displayed at ~**188×68** in the scene (52×3.6≈188, 18×3.78≈68 — match the jet's height of 68).

---

## Task 1: Per-plane upgrade scaling + price/plane data

**Files:**
- Modify: `sky-tycoon/index.html` (PLANES, upgradeCost, curPlaneBase, buyEngineUpgrade, buyCargoUpgrade, renderUpgrade, canAffordUpgrade)

- [ ] **Step 1: Update PLANES — add upgradeBase to all, drop jet price, add Concorde**

Replace the `PLANES` array:
```js
  const PLANES = [
    { id: 'prop',  name: 'Single Prop', cap: 2,  speed: 1.0, price: 0,    capStep: 1, speedStep: 0.2 },
    { id: 'twin',  name: 'Twin Prop',   cap: 8,  speed: 2.2, price: 400,  capStep: 1, speedStep: 0.2 },
    { id: 'turbo', name: 'Turboprop',   cap: 14, speed: 3.4, price: 2000, capStep: 2, speedStep: 0.3 },
    { id: 'jet',   name: 'Small Jet',   cap: 26, speed: 5.1, price: 8000, capStep: 3, speedStep: 0.4 },
  ];
```
with (adds `upgradeBase` to all, jet price 8000→5000, new concorde row):
```js
  const PLANES = [
    { id: 'prop',     name: 'Single Prop', cap: 2,  speed: 1.0, price: 0,    capStep: 1, speedStep: 0.2, upgradeBase: 15 },
    { id: 'twin',     name: 'Twin Prop',   cap: 8,  speed: 2.2, price: 400,  capStep: 1, speedStep: 0.2, upgradeBase: 20 },
    { id: 'turbo',    name: 'Turboprop',   cap: 14, speed: 3.4, price: 2000, capStep: 2, speedStep: 0.3, upgradeBase: 80 },
    { id: 'jet',      name: 'Small Jet',   cap: 26, speed: 5.1, price: 5000, capStep: 3, speedStep: 0.4, upgradeBase: 200 },
    { id: 'concorde', name: 'Concorde',    cap: 40, speed: 7.5, price: 9000, capStep: 4, speedStep: 0.5, upgradeBase: 360 },
  ];
```

- [ ] **Step 2: Change the upgradeCost formula to take a per-plane base**

Replace:
```js
  // Cost of the next upgrade given how many of that stat you've already bought.
  function upgradeCost(count) { return 15 * count + 15; }
```
with:
```js
  // Cost of the next upgrade given how many of that stat you've bought AND the current
  // plane's upgrade base. Bigger/pricier planes cost proportionally more to upgrade.
  function upgradeCost(count, base) { return base * (count + 1); }
```

- [ ] **Step 3: Add the curPlaneBase() helper**

Find `function curPlane() { return state.planes[state.planeId]; }` and add immediately AFTER it:
```js
  function curPlaneBase() { return PLANES.find(p => p.id === state.planeId).upgradeBase; }
```

- [ ] **Step 4: Thread the base through buyEngineUpgrade + buyCargoUpgrade**

In `buyEngineUpgrade()`, change:
```js
    const cost = upgradeCost(cp.speedUps);
```
to:
```js
    const cost = upgradeCost(cp.speedUps, curPlaneBase());
```
In `buyCargoUpgrade()`, change:
```js
    const cost = upgradeCost(cp.capUps);
```
to:
```js
    const cost = upgradeCost(cp.capUps, curPlaneBase());
```

- [ ] **Step 5: Thread the base through renderUpgrade's cost display**

In `renderUpgrade()`, change:
```js
    const engineCost = upgradeCost(cp.speedUps);
    const cargoCost = upgradeCost(cp.capUps);
```
to:
```js
    const base = curPlaneBase();
    const engineCost = upgradeCost(cp.speedUps, base);
    const cargoCost = upgradeCost(cp.capUps, base);
```

- [ ] **Step 6: Thread the base through canAffordUpgrade**

In `canAffordUpgrade()`, change:
```js
    const cp = curPlane();
    if (cp.speedUps < MAX_UPGRADES && state.money >= upgradeCost(cp.speedUps)) return true;
    if (cp.capUps < MAX_UPGRADES && state.money >= upgradeCost(cp.capUps)) return true;
```
to:
```js
    const cp = curPlane();
    const base = curPlaneBase();
    if (cp.speedUps < MAX_UPGRADES && state.money >= upgradeCost(cp.speedUps, base)) return true;
    if (cp.capUps < MAX_UPGRADES && state.money >= upgradeCost(cp.capUps, base)) return true;
```

- [ ] **Step 7: Update the PLANES comment block to match new numbers**

Find the comment above `const MAX_UPGRADES = 5;`:
```js
  // Each plane upgrades up to MAX_UPGRADES times per stat. Steps are tuned so a
  // fully-upgraded plane lands just below the next plane's base — maxing out a
  // plane pushes you to buy the next one to reach bigger/faster jobs.
  //   Capacity: prop 2→7,  twin 8→13,  turbo 14→24, jet 26→41
  //   Speed:    prop 1.0→2.0, twin 2.2→3.2, turbo 3.4→4.9, jet 5.1→7.1
```
Replace with (adds concorde, notes per-plane cost scaling):
```js
  // Each plane upgrades up to MAX_UPGRADES times per stat. Steps are tuned so a
  // fully-upgraded plane lands near the next plane's base — maxing out a plane
  // pushes you toward the next one. Upgrade COST scales per plane (upgradeBase):
  // cost = upgradeBase*(count+1), so big planes are a real investment to max.
  //   Capacity: prop 2→7, twin 8→13, turbo 14→24, jet 26→41, concorde 40→60
  //   Speed:    prop 1.0→2.0, twin 2.2→3.2, turbo 3.4→4.9, jet 5.1→7.1, concorde 7.5→10.0
```

- [ ] **Step 8: Verify syntax (do NOT commit)**

Extract the script between `<script>` and `</script>` to a temp .js file and `node --check` (no errors). Do NOT start a server. Do NOT commit. Report DONE.

The controller verifies INLINE in the browser:
```js
// formula
console.assert(upgradeCost(0, 15) === 15 && upgradeCost(4, 15) === 75, 'prop curve == old');
console.assert(upgradeCost(0, 200) === 200 && upgradeCost(4, 200) === 1000, 'jet steps');
console.assert(upgradeCost(0, 360) === 360 && upgradeCost(4, 360) === 1800, 'concorde steps');
// sum to max one stat
const sum = (b)=>[0,1,2,3,4].reduce((a,c)=>a+upgradeCost(c,b),0);
console.assert(sum(15) === 225, 'prop maxes 1 stat for 225');
console.assert(sum(200) === 3000, 'jet maxes 1 stat for 3000');
console.assert(sum(360) === 5400, 'concorde maxes 1 stat for 5400');
// PLANES data
console.assert(PLANES.find(p=>p.id==='jet').price === 5000, 'jet is $5000');
const c = PLANES.find(p=>p.id==='concorde');
console.assert(c && c.cap===40 && c.speed===7.5 && c.price===9000 && c.capStep===4 && c.speedStep===0.5 && c.upgradeBase===360, 'concorde stats');
// buy uses per-plane cost (jet: first engine upgrade = $200, not $15)
state = freshState(); state.planes['jet'] = {speedUps:0,capUps:0}; state.planeId='jet'; state.money=199;
console.assert(buyEngineUpgrade() === false, 'jet engine upgrade unaffordable at $199');
state.money = 200;
console.assert(buyEngineUpgrade() === true && state.money === 0, 'jet engine upgrade costs $200');
// canAffordUpgrade reflects per-plane cost
state = freshState(); state.planes['jet'] = {speedUps:0,capUps:0}; state.planeId='jet'; state.money=199;
console.assert(canAffordUpgrade() === false, 'no upgrade dot on jet at $199');
state.money = 200;
console.assert(canAffordUpgrade() === true, 'upgrade dot on jet at $200');
localStorage.removeItem('skyTycoonSave_v1');
```

- [ ] **Step 9: Report (controller commits after user confirms)**

---

## Task 2: Create the Concorde sprite + wire it in

**Files:**
- Create: `sky-tycoon/assets/sprites/plane-concorde.aseprite`, `sky-tycoon/public/plane-concorde.png`
- Modify: `sky-tycoon/index.html` (CSS: `--spr-concorde`, `.plane[data-plane="concorde"]`, `.plane-thumb[data-plane-thumb="concorde"]`)

> NOTE for the controller: this task uses the pixel-plugin (Aseprite MCP) tools, which the
> CONTROLLER has access to (subagents may not). Run the sprite creation steps inline in the
> main session, OR dispatch to a subagent only if it has the pixel tools. The CSS-wiring
> steps (5-7) are plain edits and can go to an implementer subagent.

- [ ] **Step 1: Create the Concorde sprite canvas (52×18, RGBA)**

Using the pixel-plugin tools, create a new sprite at `sky-tycoon/assets/sprites/plane-concorde.aseprite`,
52×18 px, RGBA/transparent background. Match the existing planes' side-view orientation
(nose pointing RIGHT, like the jet). Reference the jet (`sky-tycoon/assets/sprites/plane-jet.aseprite`,
48×18) for style/scale/palette — the Concorde is a sleeker, longer aircraft: a long pointed
(droop-nose) needle nose, slim fuselage, swept delta wings, a tall tailfin. Keep it readable
at small size; use a cohesive palette (white/silver body with an accent stripe, consistent
with the game's pixel style).

- [ ] **Step 2: Draw the Concorde**

Draw the aircraft: long needle nose at the right, slender fuselage spanning most of the 52px
width, delta wing as a triangle along the lower-mid body, a tailfin at the left rear, a few
window/detail pixels and an accent stripe. Use anti-aliasing/shading sparingly to match the
other planes' clean look. (The artist agent should iterate visually until it reads clearly as
a sleek supersonic jet, distinct from the Small Jet.)

- [ ] **Step 3: Export the sprite to PNG**

Export the sprite to `sky-tycoon/public/plane-concorde.png` (1× scale, native 52×18, PNG with
alpha). This mirrors the other `sky-tycoon/public/plane-*.png` exports.

- [ ] **Step 4: Base64-encode the PNG for inline embedding**

Run: `base64 -i sky-tycoon/public/plane-concorde.png | tr -d '\n'` and capture the string.
(The controller embeds it in Step 5.)

- [ ] **Step 5: Add the --spr-concorde CSS var**

In the `<style>` `:root`/sprite-var block, after the `--spr-jet: url("data:image/png;base64,…");`
line (~line 22), add:
```css
    --spr-concorde: url("data:image/png;base64,<BASE64_FROM_STEP_4>");
```
(Replace `<BASE64_FROM_STEP_4>` with the actual base64 string.)

- [ ] **Step 6: Add the scene plane rule**

After the line `.plane[data-plane="jet"]   { width:176px; height:68px; background-image:var(--spr-jet); }`
(~line 120), add:
```css
  .plane[data-plane="concorde"] { width:188px; height:68px; background-image:var(--spr-concorde); }
```
(188×68 ≈ 52×18 native scaled to match the jet's height; adjust width only if the exported
sprite's aspect differs — keep height 68 to align with the other planes on the runway.)

- [ ] **Step 7: Add the shop thumbnail rule**

After the line `.plane-thumb[data-plane-thumb="jet"]   { background-image:var(--spr-jet); }`
(~line 213), add:
```css
  .plane-thumb[data-plane-thumb="concorde"] { background-image:var(--spr-concorde); }
```

- [ ] **Step 8: Verify syntax + sprite presence (do NOT commit)**

`node --check` the extracted script (no errors — note the sprite is CSS, but check JS is intact).
Confirm:
- `grep -c "spr-concorde" sky-tycoon/index.html` → `3` (var + scene rule + thumb rule).
- `test -f sky-tycoon/public/plane-concorde.png && echo PNG_OK`.
Do NOT commit. Report DONE.

---

## Task 3: End-to-end verification, SW bump, deploy

**Files:**
- Modify: `sky-tycoon/sw.js` (cache bump)

- [ ] **Step 1: Shop shows 5 planes incl. Concorde (controller)**

Run **[SW-CLEAR]**, navigate `http://localhost:3850/`. `preview_eval`:
`localStorage.removeItem('skyTycoonSave_v1'); state=freshState(); state.money=99999; startGame(); setView('shop'); 'shop'`.
`preview_screenshot` → 5 plane rows: Single Prop (FLYING), Twin $400, Turboprop $2,000,
Small Jet **$5,000**, Concorde **$9,000**, then the Autopilot card. Each plane row shows a
thumbnail; the Concorde thumbnail shows the new sprite (not blank/broken).

- [ ] **Step 2: Buy + fly the Concorde (controller)**

`preview_eval`: `(function(){ state.money=99999; buyPlane('concorde'); setView('fly'); return {plane: state.planeId, owns: !!state.planes['concorde']}; })()`
→ `plane:'concorde'`, `owns:true`. `preview_screenshot` of the scene → the Concorde sprite
renders on the runway (parked), sized like the other planes (not stretched/clipped).

- [ ] **Step 3: Upgrade costs scale on the Concorde/Jet (controller)**

`preview_eval`: on the Concorde, `setView('upgrade')`; read the displayed upgrade button text:
`(function(){ setView('upgrade'); return document.querySelector('[data-up=engine]') ? document.querySelector('[data-up=engine]').textContent : 'maxed'; })()`
→ should show "Upgrade Engine — $360" (the Concorde's first-upgrade cost), NOT $15.
Then buy it and confirm the next costs $720:
`(function(){ buyEngineUpgrade(); setView('upgrade'); return document.querySelector('[data-up=engine]').textContent; })()` → "$720".

- [ ] **Step 4: Switch to Concorde keeps scenery; affordability dot (controller)**

- Switch test: from another plane, `switchPlane('concorde')` while parked → scene swaps to the
  Concorde sprite, clouds/trees keep position (existing in-place swap). `preview_screenshot`.
- Affordability dot: `preview_eval` set money so only a Concorde upgrade is affordable on the
  Concorde and confirm the UPGRADE nav dot reflects the per-plane cost (dot off at $359 if
  that's the only buyable, on at $360). (A targeted check; the Task 1 inline asserts already
  cover the logic.)

- [ ] **Step 5: No errors + mobile (controller)**

`preview_console_logs` level `error` → none. `preview_resize` preset `mobile`; Shop view →
`preview_screenshot` (5 planes + autopilot fit cleanly, Concorde thumb visible). `preview_resize` preset `desktop`.

- [ ] **Step 6: Reset clean (controller)**

`preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload();` → title screen.
`preview_console_logs` level `error` → none.

- [ ] **Step 7: Bump the service worker cache**

In `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v14';` to `'sky-tycoon-v15';`.
- `grep -n "CACHE_NAME = " sky-tycoon/sw.js` → `sky-tycoon-v15`.
- `node --check sky-tycoon/sw.js` → no errors.

- [ ] **Step 8: Show the user; commit on their OK; deploy on their OK**

Show the user the working feature (Shop with 5 planes, the Concorde sprite, scaled upgrade
costs) + the diff. Per the user's standing rule, commit ONLY after they confirm, then push
ONLY after they confirm the deploy. Suggested commits:
```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html sky-tycoon/assets/sprites/plane-concorde.aseprite sky-tycoon/public/plane-concorde.png && git commit -m "feat(sky-tycoon): per-plane upgrade scaling + Concorde (5th plane)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): bump SW cache to v15

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Then (on deploy OK): `git push origin main` and verify live:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  c=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "spr-concorde\|concorde"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: concorde=$c sw=$swv"; \
  if [ "$c" -ge 1 ] && [ "$swv" = "sky-tycoon-v15" ]; then echo LIVE; break; fi; done
```

---

## Self-Review Notes

- **Spec coverage:** upgradeBase on all planes + jet $5k + concorde row (Task 1 Step 1);
  upgradeCost(count,base) (Step 2); curPlaneBase helper (Step 3); all 5 call sites threaded
  (Steps 4-6: buyEngine, buyCargo, renderUpgrade×2, canAffordUpgrade×2); comment update
  (Step 7). Concorde sprite created + exported + base64-embedded + scene/thumb CSS (Task 2).
  Verify + SW bump + deploy (Task 3). All spec sections covered.
- **Placeholder scan:** the only placeholder is `<BASE64_FROM_STEP_4>` in Task 2 Step 5,
  which is an explicit "insert the captured value" instruction (the base64 is generated at
  build time, not knowable in advance) — acceptable and clearly marked.
- **Type consistency:** `upgradeCost(count, base)` signature is consistent across all call
  sites (each passes `curPlaneBase()` or a captured `base`). `curPlaneBase()` returns the
  current plane's `upgradeBase`. PLANES entries all have `upgradeBase`. The concorde id
  `'concorde'` matches across PLANES, the CSS var `--spr-concorde`, `.plane[data-plane="concorde"]`,
  and `.plane-thumb[data-plane-thumb="concorde"]`. Sprite native 52×18, displayed 188×68
  (height 68 matches the other planes).
- **Migration:** none needed — `upgradeBase` is code-side; a new plane id needs no save
  migration (buyPlane creates the record); load() already guards unknown plane ids and
  `'concorde'` is now valid.
