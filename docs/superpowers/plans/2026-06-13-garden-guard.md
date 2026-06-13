# Garden Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file pixel-art fixed-path tower defense PWA where the player places and upgrades garden-tool towers along a winding path to stop waves of garden pests from reaching the veggie patch, across 3 unlockable endless maps.

**Architecture:** One `index.html` with inline CSS + JS. A `<canvas>` renders the game at a fixed **landscape** internal resolution scaled up with `image-rendering: pixelated`. A plain global `game` object holds runtime state (towers, pests, projectiles, cash, hearts, wave); a separate `meta` object holds persistent progress (unlocked maps, best wave per map) in localStorage. Pure config tables describe towers/pests/maps as data. A single `requestAnimationFrame` loop runs fixed-timestep `update(dt)` then `render()`. A small screen state machine switches between Map Select, Playing, and Game Over. Pest sprites are loaded from exported PNGs in `public/`.

**Tech Stack:** Vanilla HTML/CSS/JS (no build tools), Canvas 2D, localStorage, pixel-art PNGs from Aseprite (pixel-plugin MCP). Preview/serve via `npx serve` on port 3851. No automated test runner — every task ends with a concrete browser verification using the preview tools.

---

## File Structure

- **Create:** `garden-guard/index.html` — the entire game (HTML shell + inline `<style>` + inline `<script>`).
- **Create:** `garden-guard/manifest.json` — PWA manifest.
- **Create:** `garden-guard/sw.js` — service worker (network-first, versioned cache), copied/adapted from Sky Tycoon.
- **Create:** `garden-guard/icon-192.png`, `garden-guard/icon-512.png` — PWA icons (garden-themed, via pixel-plugin).
- **Create:** `garden-guard/assets/sprites/*.aseprite` — Aseprite sources for towers, pests, tiles, UI.
- **Create:** `garden-guard/public/*.png` — exported sprite PNGs.
- **Modify:** `.claude/launch.json` — add a `garden-guard` serve config on port 3851.

The single `index.html` `<script>` is logically sectioned:
1. **Config/data** — `TOWERS`, `PESTS`, `MAPS` tables; tunable constants (internal res, tile size, starting cash/hearts, wave-10 unlock).
2. **Persistent meta** — `meta` object + `loadMeta()`/`saveMeta()` with a versioned key.
3. **Runtime state** — `game` object + `newGame(mapId)`.
4. **Pure helpers** — geometry (point-on-path, distance, plot positions), economy (`towerCost`, `upgradeCost`, `sellRefund`, `bounty`), wave composition (`waveSpec(n)`), targeting (`pickTarget`).
5. **Actions** — `placeTower`, `upgradeTower`, `sellTower`, `startWave`, `spawnPest`, `damagePest`, `leakPest`, `onPestKilled`, `onWaveCleared`, `gameOver`.
6. **Update** — `update(dt)`: advance pests along path, tower firing/cooldowns, projectile travel + hits, wave spawn scheduling, win/lose checks.
7. **Render** — `render()`: draw terrain, path, plots, towers, pests, projectiles, HUD; plus `renderMapSelect()` and `renderGameOver()` (DOM overlays).
8. **Input** — canvas tap → screen-to-grid → select tower / place / open tower popup.
9. **Loop** — `requestAnimationFrame` driver with fixed-timestep accumulator.
10. **Boot** — load meta, register SW, show Map Select.

Coordinate model: the path is an ordered list of waypoints in internal-resolution pixels. Pests track `dist` (pixels traveled along the path); a helper converts `dist` → `{x,y}`. Buildable plots are a list of `{x,y}` centers. Tap placement snaps to the nearest free plot within a radius.

Testing approach: no unit tests. Pure helpers get temporary `console.assert` checks behind a `?debug` URL flag where useful, removed or left dormant. Each task ends with a preview-tool verification (screenshot / snapshot / console-log check) and a commit.

---

## Task 1: Project scaffold + serve config

**Files:**
- Create: `garden-guard/index.html`
- Modify: `.claude/launch.json`

- [ ] **Step 1: Create the HTML shell with a canvas**

Create `garden-guard/index.html`. Landscape canvas at internal resolution 640×360, scaled to fit the viewport with `image-rendering: pixelated`. No game logic yet — just a green-filled canvas and a title overlay so we can confirm it serves and scales.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#3a7d3a">
<title>Garden Guard</title>
<link rel="manifest" href="./manifest.json">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  :root { --grass:#6ab04c; --dirt:#8a5a2b; --ink:#13301a; --leaf:#3a7d3a; --sky:#bfe3ff; }
  html, body { height: 100%; }
  body {
    font-family: 'Courier New', monospace;
    background: #13301a; color: #fff;
    display: flex; justify-content: center; align-items: center;
    overflow: hidden;
  }
  #stage {
    position: relative;
    width: 100vw; height: 100vh;
    display: flex; justify-content: center; align-items: center;
  }
  canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    /* JS sets pixel-perfect scaled width/height to keep the 16:9 ratio */
    background: #6ab04c;
  }
  .overlay {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center; gap: 12px;
  }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div id="stage">
  <canvas id="game" width="640" height="360"></canvas>
  <div id="mapSelect" class="overlay"><h1>Garden Guard</h1></div>
</div>
<script>
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const IW = 640, IH = 360; // internal resolution (landscape 16:9)

  // Scale the canvas element to the largest integer-friendly fit in the viewport,
  // preserving the 16:9 internal ratio. Drawing always happens in IW×IH space.
  function fitCanvas() {
    const scale = Math.min(window.innerWidth / IW, window.innerHeight / IH);
    canvas.style.width = Math.floor(IW * scale) + 'px';
    canvas.style.height = Math.floor(IH * scale) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // Temporary: fill so we can confirm the canvas renders.
  ctx.fillStyle = '#6ab04c';
  ctx.fillRect(0, 0, IW, IH);
  ctx.fillStyle = '#13301a';
  ctx.font = '16px monospace';
  ctx.fillText('canvas ok', 12, 24);
</script>
</body>
</html>
```

- [ ] **Step 2: Add the serve config**

Modify `.claude/launch.json` — add this object to the `configurations` array (after the `sky-tycoon` entry):

```json
{
  "name": "garden-guard",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["serve", "/usr/local/var/www/dojohnso.github.io/garden-guard", "-l", "3851"],
  "port": 3851
}
```

- [ ] **Step 3: Verify it serves and scales**

Start the preview on port 3851 (`preview_start` with the `garden-guard` config or `npx serve garden-guard -l 3851`). Load it, take a `preview_screenshot`. Expected: a green canvas filling the viewport in 16:9, with "canvas ok" text top-left, "Garden Guard" title overlay centered. Check `preview_console_logs` for zero errors.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html .claude/launch.json
git commit -m "feat(garden-guard): scaffold landscape canvas + serve config"
```

---

## Task 2: Config tables (towers, pests, one map) + persistent meta

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add config constants and data tables**

In the `<script>`, above the boot code, add tunable constants and the data tables. These are the single source of truth for balance. Map 1 ("Backyard") path is a simple winding polyline in 640×360 space; plots sit beside path bends.

```js
const TILE = 32;
const START_CASH = 180;
const START_HEARTS = 20;
const UNLOCK_WAVE = 10;          // clear this wave to unlock the next map
const WAVE_CLEAR_BONUS = 25;     // cash awarded when a wave is fully cleared

// Tower types. range/px, dmg, fireMs (cooldown), and per-tier multipliers.
// tiers[i] gives {dmg, range, fireMs, cost} for tier i (0 = base buy).
const TOWERS = {
  can:    { name: 'Watering Can',   color: '#4aa3ff', proj: 'drop',
            tiers: [ {cost:60,  dmg:6,  range:70, fireMs:600},
                     {cost:50,  dmg:11, range:80, fireMs:540},
                     {cost:90,  dmg:20, range:92, fireMs:480} ] },
  zapper: { name: 'Bug Zapper',     color: '#ffe14a', proj: 'zap', aoe:34, slow:0.5, slowMs:900,
            tiers: [ {cost:90,  dmg:4,  range:60, fireMs:1100},
                     {cost:80,  dmg:7,  range:66, fireMs:1000},
                     {cost:130, dmg:12, range:72, fireMs:900} ] },
  sprink: { name: 'Sprinkler',      color: '#4ad6c0', proj: 'splash', aoe:22,
            tiers: [ {cost:75,  dmg:3,  range:48, fireMs:280},
                     {cost:70,  dmg:5,  range:52, fireMs:250},
                     {cost:110, dmg:8,  range:58, fireMs:220} ] },
  scare:  { name: 'Scarecrow Sling', color: '#c98a3a', proj: 'pebble',
            tiers: [ {cost:120, dmg:22, range:140, fireMs:1400},
                     {cost:110, dmg:38, range:155, fireMs:1300},
                     {cost:170, dmg:64, range:170, fireMs:1200} ] },
};
const TOWER_ORDER = ['can','zapper','sprink','scare'];
const SELL_REFUND = 0.6; // fraction of total spent returned on sell

// Pest types. hp/speed scale with wave in waveSpec(). hearts = cost if it leaks.
const PESTS = {
  ant:  { name:'Ant',        hp:14,  speed:36, bounty:5,  hearts:1, color:'#8a3b2b', size:10 },
  beetle:{ name:'Beetle',    hp:48,  speed:22, bounty:12, hearts:2, color:'#2b3a8a', size:14 },
  lizard:{ name:'Lizard',    hp:9,   speed:74, bounty:7,  hearts:1, color:'#3a9d4a', size:12 },
  cat:  { name:'Caterpillar',hp:260, speed:18, bounty:60, hearts:5, color:'#b85ac0', size:20 },
};

// Maps as data. path = ordered waypoints (internal px). plots = buildable centers.
const MAPS = [
  { id:'backyard', name:'Backyard Veggie Patch', difficulty:'Easy',
    path: [ {x:-20,y:120}, {x:140,y:120}, {x:140,y:250}, {x:330,y:250},
            {x:330,y:90}, {x:520,y:90}, {x:520,y:250}, {x:660,y:250} ],
    plots: [ {x:90,y:185}, {x:200,y:185}, {x:200,y:310}, {x:280,y:185},
             {x:390,y:150}, {x:470,y:150}, {x:470,y:310}, {x:580,y:160} ] },
  // Maps 2 & 3 added in Task 12.
];
```

- [ ] **Step 2: Add persistent meta (unlocks + best wave)**

```js
const META_KEY = 'gardenGuardMeta_v1';
let meta = loadMeta();

function freshMeta() {
  return { unlocked: { backyard: true }, best: {} }; // best[mapId] = highest wave cleared
}
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return freshMeta();
    const m = JSON.parse(raw);
    return { unlocked: m.unlocked || { backyard:true }, best: m.best || {} };
  } catch (e) { return freshMeta(); }
}
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
}
```

- [ ] **Step 3: Verify in console**

Reload the preview. In the console (via `preview_eval`), run `JSON.stringify(MAPS[0].path.length)` → expect `8`; `Object.keys(TOWERS)` → expect the 4 tower ids; `meta.unlocked.backyard` → expect `true`. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): tower/pest/map config tables + persistent meta"
```

---

## Task 3: Geometry helpers + draw the path and plots

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add path geometry helpers**

```js
// Precompute cumulative segment lengths for a path so we can map dist→point.
function buildPath(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i+1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { points, segs, total };
}
// Map a distance traveled to an {x,y} on the path. Clamps to the end.
function pointAt(path, dist) {
  if (dist <= 0) return { ...path.points[0] };
  if (dist >= path.total) return { ...path.points[path.points.length - 1] };
  for (const s of path.segs) {
    if (dist <= s.start + s.len) {
      const t = (dist - s.start) / s.len;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
  }
  return { ...path.points[path.points.length - 1] };
}
function dist2(ax, ay, bx, by) { const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
```

- [ ] **Step 2: Add a terrain/path renderer and a temporary draw call**

Add a function that draws the grass background, the dirt path as a thick stroked polyline, the veggie patch at the path end, and plot markers as light circles. Temporarily call it once after boot with Map 1.

```js
function drawTerrain(path, plots) {
  ctx.fillStyle = '#6ab04c';
  ctx.fillRect(0, 0, IW, IH);
  // dirt path
  ctx.strokeStyle = '#9a6a3a';
  ctx.lineWidth = 26; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  path.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  // veggie patch (goal) at path end
  const goal = path.points[path.points.length - 1];
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(goal.x - 24, goal.y - 24, 36, 48);
  // plots
  ctx.lineWidth = 2;
  plots.forEach(pl => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(pl.x, pl.y, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  });
}
// TEMP boot: window.addEventListener('load', () => {
//   const p = buildPath(MAPS[0].path); drawTerrain(p, MAPS[0].plots);
// });
```

- [ ] **Step 3: Verify the map renders**

Wire the TEMP boot call, reload, `preview_screenshot`. Expected: green field, a brown winding path from left edge to a green veggie patch near the right, with 8 translucent plot circles beside the path bends. Confirm the path visibly winds (down, right, up, right, down) and plots don't sit on top of the path.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): path geometry + terrain/path/plot renderer"
```

---

## Task 4: Game state + the rAF loop with a moving test pest

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add runtime state and newGame()**

```js
let game = null;
let screen = 'mapSelect'; // 'mapSelect' | 'playing' | 'gameover'

function newGame(mapId) {
  const def = MAPS.find(m => m.id === mapId);
  game = {
    mapId, def,
    path: buildPath(def.path),
    plots: def.plots.map(p => ({ x:p.x, y:p.y, tower:null })),
    cash: START_CASH,
    hearts: START_HEARTS,
    wave: 0,
    waveActive: false,
    pests: [],        // {type, hp, maxHp, dist, speed, slowUntil}
    projectiles: [],  // {x,y, tx,ty, target, dmg, kind, aoe, slow, slowMs, speed}
    spawnQueue: [],   // pending {type, atMs} for the active wave
    elapsed: 0,       // ms since wave start, for spawn scheduling
    selectedTowerType: null, // bottom-bar selection for placement
    selectedPlot: null,      // plot whose popup is open
  };
}
```

- [ ] **Step 2: Add the fixed-timestep loop**

```js
const STEP = 1000 / 60; // fixed 60Hz update
let acc = 0, last = 0;
function frame(ts) {
  if (!last) last = ts;
  let delta = ts - last; last = ts;
  if (delta > 250) delta = 250; // avoid spiral after tab-away
  acc += delta;
  while (acc >= STEP) { if (screen === 'playing') update(STEP); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 3: Add a minimal update() + render() that moves one test pest**

Stub `update`/`render` to prove the loop. Spawn one ant at dist 0 moving along the path; draw terrain + the pest as a colored circle.

```js
function update(dt) {
  for (const p of game.pests) {
    const def = PESTS[p.type];
    p.dist += def.speed * (dt / 1000);
  }
  game.pests = game.pests.filter(p => p.dist < game.path.total);
}
function render() {
  if (screen !== 'playing' || !game) return;
  drawTerrain(game.path, game.plots);
  for (const p of game.pests) {
    const def = PESTS[p.type];
    const pt = pointAt(game.path, p.dist);
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, def.size/2, 0, Math.PI*2); ctx.fill();
  }
}
// TEMP boot: newGame('backyard'); screen='playing';
// game.pests.push({type:'ant', hp:14, maxHp:14, dist:0, speed:36});
// requestAnimationFrame(frame);
```

- [ ] **Step 4: Verify the pest walks the path**

Wire the TEMP boot, reload, watch via `preview_screenshot` taken twice a second or so apart (or `preview_eval` to read `game.pests[0].dist`). Expected: a reddish ant circle travels smoothly along the brown path from the left edge toward the veggie patch, then disappears at the end. No console errors, smooth motion.

- [ ] **Step 5: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): runtime state + rAF loop with path-walking pest"
```

---

## Task 5: Waves — composition, spawning, leaks, hearts

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add wave composition + scaling helpers**

`waveSpec(n)` returns the ordered spawn list for wave `n` (1-based) and applies HP scaling. Every 5th wave includes a caterpillar boss.

```js
// HP grows ~12% per wave; speed nudges up slightly. Returns scaled pest instance fields.
function scaledPest(type, n) {
  const base = PESTS[type];
  const hp = Math.round(base.hp * Math.pow(1.12, n - 1));
  const speed = base.speed * (1 + Math.min(0.5, (n - 1) * 0.015));
  return { type, hp, maxHp: hp, dist: 0, speed, slowUntil: 0 };
}
// Composition: count grows with n; mix shifts from ants→mixed; boss every 5th wave.
function waveSpec(n) {
  const list = [];
  const ants = 4 + n;                       // baseline filler grows each wave
  const lizards = Math.floor(n / 2);        // rushers appear from wave 2
  const beetles = Math.floor(n / 3);        // tanks appear from wave 3
  for (let i=0;i<ants;i++) list.push('ant');
  for (let i=0;i<lizards;i++) list.push('lizard');
  for (let i=0;i<beetles;i++) list.push('beetle');
  // shuffle deterministically by interleaving (no RNG needed for MVP)
  list.sort((a,b) => (a.charCodeAt(0)+ list.indexOf(a)) - (b.charCodeAt(0)+ list.indexOf(b)));
  if (n % 5 === 0) list.push('cat');         // boss closes boss waves
  return list;
}
```

- [ ] **Step 2: Add startWave() + spawn scheduling in update()**

```js
const SPAWN_GAP = 650; // ms between spawns within a wave

function startWave() {
  if (game.waveActive) return;
  game.wave += 1;
  game.waveActive = true;
  game.elapsed = 0;
  const types = waveSpec(game.wave);
  game.spawnQueue = types.map((type, i) => ({ type, atMs: i * SPAWN_GAP }));
}
function leakPest(p) {
  game.hearts -= PESTS[p.type].hearts;
  if (game.hearts <= 0) { game.hearts = 0; gameOver(); }
}
function onWaveCleared() {
  game.waveActive = false;
  game.cash += WAVE_CLEAR_BONUS;
  // record best + handle unlock
  const prevBest = meta.best[game.mapId] || 0;
  if (game.wave > prevBest) { meta.best[game.mapId] = game.wave; saveMeta(); }
  if (game.wave >= UNLOCK_WAVE) unlockNext(game.mapId);
}
function unlockNext(mapId) {
  const idx = MAPS.findIndex(m => m.id === mapId);
  const next = MAPS[idx + 1];
  if (next && !meta.unlocked[next.id]) { meta.unlocked[next.id] = true; saveMeta(); }
}
function gameOver() { screen = 'gameover'; renderGameOver(); }
```

Update `update(dt)` to: advance `elapsed`, pop due spawns from `spawnQueue` into `game.pests`, advance pests, leak+remove any that reach the end, and call `onWaveCleared()` when the queue is empty and no pests remain.

```js
function update(dt) {
  game.elapsed += dt;
  while (game.spawnQueue.length && game.spawnQueue[0].atMs <= game.elapsed) {
    const s = game.spawnQueue.shift();
    game.pests.push(scaledPest(s.type, game.wave));
  }
  for (const p of game.pests) {
    const slowed = p.slowUntil > game.elapsed ? 0.5 : 1;
    p.dist += p.speed * slowed * (dt / 1000);
  }
  const leaked = game.pests.filter(p => p.dist >= game.path.total);
  leaked.forEach(leakPest);
  game.pests = game.pests.filter(p => p.dist < game.path.total);
  if (game.waveActive && !game.spawnQueue.length && !game.pests.length) onWaveCleared();
}
```

- [ ] **Step 3: Verify waves spawn, march, and drain hearts**

Add a TEMP key handler (`window.onkeydown = e => { if (e.key==='w') startWave(); }`) or call `startWave()` from console via `preview_eval`. Trigger wave 1. Watch: multiple ants spawn ~0.65s apart, walk the path, and each leak reduces `game.hearts` (read via `preview_eval('game.hearts')`). After all spawn and leak, `game.waveActive` returns to `false` and `game.cash` increased by the clear bonus. Confirm wave 5 includes one caterpillar (`preview_eval('waveSpec(5).filter(t=>t==="cat").length')` → `1`).

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): wave composition, spawning, leaks, hearts, unlocks"
```

---

## Task 6: Towers — placement, targeting, firing, projectiles, damage

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add economy + targeting helpers**

```js
function towerBuyCost(type) { return TOWERS[type].tiers[0].cost; }
function towerTierStats(t) { return TOWERS[t.type].tiers[t.tier]; }
function upgradeCost(t) {
  const tiers = TOWERS[t.type].tiers;
  return t.tier + 1 < tiers.length ? tiers[t.tier + 1].cost : null; // null = maxed
}
function sellRefund(t) {
  const tiers = TOWERS[t.type].tiers;
  let spent = 0; for (let i = 0; i <= t.tier; i++) spent += tiers[i].cost;
  return Math.floor(spent * SELL_REFUND);
}
// Target the pest furthest along the path (closest to goal) within range.
function pickTarget(tower) {
  const s = towerTierStats(tower);
  const r2 = s.range * s.range;
  let best = null;
  for (const p of game.pests) {
    const pt = pointAt(game.path, p.dist);
    if (dist2(pt.x, pt.y, tower.x, tower.y) <= r2) {
      if (!best || p.dist > best.dist) best = p;
    }
  }
  return best;
}
```

- [ ] **Step 2: Add placement + upgrade + sell actions**

```js
function placeTower(plot, type) {
  if (plot.tower || game.cash < towerBuyCost(type)) return false;
  game.cash -= towerBuyCost(type);
  plot.tower = { type, tier: 0, x: plot.x, y: plot.y, cooldown: 0 };
  return true;
}
function upgradeTower(t) {
  const cost = upgradeCost(t);
  if (cost == null || game.cash < cost) return false;
  game.cash -= cost; t.tier += 1; return true;
}
function sellTower(plot) {
  if (!plot.tower) return;
  game.cash += sellRefund(plot.tower);
  plot.tower = null;
}
```

- [ ] **Step 3: Add firing + projectiles + damage in update()**

Extend `update(dt)` (append, before the wave-clear check): tick tower cooldowns, fire at targets by spawning a projectile, advance projectiles toward their target point, and apply damage (with AoE/slow) on arrival.

```js
function damagePest(p, dmg) {
  p.hp -= dmg;
  if (p.hp <= 0) { onPestKilled(p); }
}
function onPestKilled(p) {
  game.cash += PESTS[p.type].bounty;
  const i = game.pests.indexOf(p);
  if (i >= 0) game.pests.splice(i, 1);
}
function fireTowers(dt) {
  for (const plot of game.plots) {
    const t = plot.tower; if (!t) continue;
    t.cooldown -= dt; if (t.cooldown > 0) continue;
    const target = pickTarget(t); if (!target) continue;
    const s = towerTierStats(t);
    const def = TOWERS[t.type];
    const pt = pointAt(game.path, target.dist);
    game.projectiles.push({
      x: t.x, y: t.y, tx: pt.x, ty: pt.y, target,
      dmg: s.dmg, kind: def.proj, aoe: def.aoe || 0,
      slow: def.slow || 0, slowMs: def.slowMs || 0, speed: 320,
    });
    t.cooldown = s.fireMs;
  }
}
function advanceProjectiles(dt) {
  const next = [];
  for (const pr of game.projectiles) {
    // home toward the target's *current* position if it still exists, else last point
    if (pr.target && game.pests.includes(pr.target)) {
      const pt = pointAt(game.path, pr.target.dist); pr.tx = pt.x; pr.ty = pt.y;
    }
    const dx = pr.tx - pr.x, dy = pr.ty - pr.y;
    const d = Math.hypot(dx, dy);
    const move = pr.speed * (dt / 1000);
    if (d <= move) {
      // hit
      if (pr.aoe > 0) {
        for (const p of game.pests.slice()) {
          const ppt = pointAt(game.path, p.dist);
          if (dist2(ppt.x, ppt.y, pr.tx, pr.ty) <= pr.aoe * pr.aoe) {
            if (pr.slow) p.slowUntil = game.elapsed + pr.slowMs;
            damagePest(p, pr.dmg);
          }
        }
      } else if (pr.target && game.pests.includes(pr.target)) {
        if (pr.slow) pr.target.slowUntil = game.elapsed + pr.slowMs;
        damagePest(pr.target, pr.dmg);
      }
      // projectile consumed
    } else {
      pr.x += dx / d * move; pr.y += dy / d * move; next.push(pr);
    }
  }
  game.projectiles = next;
}
```

Call `fireTowers(dt)` and `advanceProjectiles(dt)` inside `update(dt)` after pest movement, before the wave-clear check (a wave isn't clear while projectiles are still in flight — also include `!game.projectiles.length` in that check).

- [ ] **Step 4: Render towers + projectiles + range ring of selected plot**

Extend `render()` to draw each plot's tower as a colored square (tint by tier), projectiles as small colored dots, and — if a plot popup is open — a translucent range ring.

```js
// inside render(), after drawing pests:
for (const plot of game.plots) {
  const t = plot.tower; if (!t) continue;
  ctx.fillStyle = TOWERS[t.type].color;
  const s = 18 + t.tier * 2;
  ctx.fillRect(plot.x - s/2, plot.y - s/2, s, s);
}
for (const pr of game.projectiles) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, Math.PI*2); ctx.fill();
}
if (game.selectedPlot && game.selectedPlot.tower) {
  const t = game.selectedPlot.tower, s = towerTierStats(t);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(t.x, t.y, s.range, 0, Math.PI*2); ctx.stroke();
}
```

- [ ] **Step 5: Verify towers kill pests**

Via `preview_eval`, place a tower and start a wave:
```js
placeTower(game.plots[0], 'can'); placeTower(game.plots[3], 'scare'); startWave();
```
Watch screenshots: towers appear as colored squares, fire white dots at pests, pests take damage and vanish (cash rises via `preview_eval('game.cash')`). Confirm the scarecrow (long range) hits pests further away than the watering can. Confirm a zapper applies slow (pest visibly slower after a zap). No console errors.

- [ ] **Step 6: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): tower placement, targeting, firing, projectiles, damage"
```

---

## Task 7: HUD — cash, hearts, wave, Start Wave button, tower bar

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Draw the HUD on the canvas**

Add to `render()` (after world drawing): a top strip showing hearts (♥ count), cash, and current wave; a bottom tower bar with 4 selectable buttons showing tower name + buy cost (greyed if unaffordable, highlighted if `game.selectedTowerType` matches); and a "Start Wave" button (shown only when `!game.waveActive`).

```js
function drawHUD() {
  // top strip
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, IW, 22);
  ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textBaseline = 'middle';
  ctx.fillText('♥ ' + game.hearts, 8, 11);
  ctx.fillText('$ ' + game.cash, 90, 11);
  ctx.fillText('Wave ' + game.wave, 180, 11);
  if (game.def) ctx.fillText(game.def.name, 300, 11);

  // bottom tower bar
  const barY = IH - 40, bw = 150, gap = 8, x0 = 8;
  TOWER_ORDER.forEach((id, i) => {
    const x = x0 + i * (bw + gap);
    const cost = towerBuyCost(id);
    const affordable = game.cash >= cost;
    const selected = game.selectedTowerType === id;
    ctx.fillStyle = selected ? '#2e7d32' : (affordable ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)');
    ctx.fillRect(x, barY, bw, 34);
    ctx.fillStyle = affordable ? TOWERS[id].color : '#777';
    ctx.fillRect(x + 4, barY + 7, 20, 20);
    ctx.fillStyle = affordable ? '#fff' : '#999';
    ctx.fillText(TOWERS[id].name, x + 30, barY + 12);
    ctx.fillText('$' + cost, x + 30, barY + 25);
  });

  // Start Wave button (top-right) when idle
  if (!game.waveActive) {
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(IW - 110, 26, 100, 26);
    ctx.fillStyle = '#fff'; ctx.fillText('▶ Start Wave', IW - 104, 39);
  }
}
```

Call `drawHUD()` at the end of `render()` when `screen==='playing'`. Store the button rects (tower bar slots, Start Wave) as module-level constants or compute them in a shared `hudHitRects()` helper so input (Task 8) can hit-test them without duplicating coordinates.

- [ ] **Step 2: Extract HUD hit rects into a shared helper**

```js
function hudHitRects() {
  const barY = IH - 40, bw = 150, gap = 8, x0 = 8;
  const towers = TOWER_ORDER.map((id, i) => ({ id, x: x0 + i*(bw+gap), y: barY, w: bw, h: 34 }));
  const startWave = { x: IW - 110, y: 26, w: 100, h: 26 };
  return { towers, startWave };
}
```
Refactor `drawHUD()` to use `hudHitRects()` for the x/y of each element so draw and hit-test share one source of truth.

- [ ] **Step 3: Verify HUD renders**

Reload with a game in progress (`preview_eval('newGame("backyard"); screen="playing";')`). `preview_screenshot`. Expected: top strip shows ♥20, $180, Wave 0, map name; bottom bar shows 4 tower buttons with costs (scarecrow greyed if >$180 — at $180 it's affordable, so confirm all four show colored); a green "▶ Start Wave" button top-right. Spend cash via `preview_eval` and confirm unaffordable towers grey out.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): canvas HUD — hearts, cash, wave, tower bar, start button"
```

---

## Task 8: Input — tap to select, place, open tower popup

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add canvas tap → internal-coordinate mapping**

```js
function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
  const cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
  return { x: cx / rect.width * IW, y: cy / rect.height * IH };
}
function inRect(p, r) { return p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h; }
```

- [ ] **Step 2: Add the tap handler with priority order**

Handle taps in this order: (a) HUD buttons (tower bar select, Start Wave), (b) an open tower popup's Upgrade/Sell buttons, (c) a plot — place selected tower on empty plot, or open popup on an occupied plot, (d) empty space closes popup / clears selection.

```js
function onTap(evt) {
  evt.preventDefault();
  if (screen === 'mapSelect') return;           // map select uses DOM overlay
  if (screen === 'gameover') return;
  const p = canvasPoint(evt);
  const hud = hudHitRects();

  // (a) HUD
  if (!game.waveActive && inRect(p, hud.startWave)) { startWave(); return; }
  for (const tb of hud.towers) {
    if (inRect(p, tb)) {
      game.selectedTowerType = (game.selectedTowerType === tb.id) ? null : tb.id;
      game.selectedPlot = null;
      return;
    }
  }
  // (b) open popup buttons
  if (game.selectedPlot && game.selectedPlot.tower) {
    const pop = popupHitRects(game.selectedPlot);
    if (inRect(p, pop.upgrade)) { upgradeTower(game.selectedPlot.tower); return; }
    if (inRect(p, pop.sell))    { sellTower(game.selectedPlot); game.selectedPlot = null; return; }
  }
  // (c) plots
  let hitPlot = null, bestD = 22*22;
  for (const plot of game.plots) {
    const d = dist2(p.x, p.y, plot.x, plot.y);
    if (d < bestD) { bestD = d; hitPlot = plot; }
  }
  if (hitPlot) {
    if (hitPlot.tower) { game.selectedPlot = hitPlot; game.selectedTowerType = null; }
    else if (game.selectedTowerType) {
      if (placeTower(hitPlot, game.selectedTowerType)) game.selectedTowerType = null;
    }
    return;
  }
  // (d) empty space
  game.selectedPlot = null; game.selectedTowerType = null;
}
canvas.addEventListener('click', onTap);
canvas.addEventListener('touchstart', onTap, { passive: false });
```

- [ ] **Step 3: Add the tower popup (range ring already drawn in Task 6) + its buttons**

```js
function popupHitRects(plot) {
  const w = 120, h = 54, x = Math.min(IW - w - 4, plot.x + 14), y = Math.max(24, plot.y - h/2);
  return { box:{x,y,w,h}, upgrade:{x:x+6,y:y+6,w:w-12,h:20}, sell:{x:x+6,y:y+28,w:w-12,h:20} };
}
function drawPopup() {
  if (!game.selectedPlot || !game.selectedPlot.tower) return;
  const t = game.selectedPlot.tower, r = popupHitRects(game.selectedPlot);
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(r.box.x, r.box.y, r.box.w, r.box.h);
  ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textBaseline = 'middle';
  const up = upgradeCost(t);
  ctx.fillStyle = up==null ? '#555' : '#2e7d32'; ctx.fillRect(r.upgrade.x, r.upgrade.y, r.upgrade.w, r.upgrade.h);
  ctx.fillStyle = '#fff'; ctx.fillText(up==null ? 'MAX' : ('Upgrade $'+up), r.upgrade.x+6, r.upgrade.y+10);
  ctx.fillStyle = '#8a3b2b'; ctx.fillRect(r.sell.x, r.sell.y, r.sell.w, r.sell.h);
  ctx.fillStyle = '#fff'; ctx.fillText('Sell $'+sellRefund(t), r.sell.x+6, r.sell.y+10);
}
```
Call `drawPopup()` at the very end of `render()` (after HUD) so it sits on top.

- [ ] **Step 4: Verify the full tap loop in the browser**

Reload into a playing game. Using `preview_click` at the scaled pixel positions (compute from internal coords × on-screen scale) — or drive via taps:
1. Tap a tower in the bottom bar → it highlights (`preview_eval('game.selectedTowerType')`).
2. Tap an empty plot → tower places, cash drops, selection clears.
3. Tap the placed tower → popup with range ring + Upgrade/Sell appears.
4. Tap Upgrade → tier increases (`preview_eval('game.plots[0].tower.tier')`), cash drops.
5. Tap Sell → tower removed, partial refund.
6. Tap Start Wave → wave begins.
Take screenshots at each step. Confirm no double-fire from click+touchstart on desktop (the screenshot place-count should match one tap).

- [ ] **Step 5: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): tap input — select, place, upgrade/sell popup, start wave"
```

---

## Task 9: Map Select + Game Over screens (DOM overlays)

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Build the Map Select overlay**

Replace the placeholder `#mapSelect` overlay with rendered cards (one per map). Locked maps are greyed with the unlock hint. Tapping an unlocked card calls `newGame(id)`, hides the overlay, sets `screen='playing'`, and (re)starts the rAF loop if not running.

```js
function renderMapSelect() {
  const el = document.getElementById('mapSelect');
  el.innerHTML = '<h1 style="font-size:28px;margin-bottom:6px">Garden Guard</h1>' +
    '<p style="opacity:.8;margin-bottom:14px">Defend the veggie patch!</p>' +
    '<div id="mapCards" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"></div>';
  const cards = el.querySelector('#mapCards');
  MAPS.forEach(m => {
    const unlocked = !!meta.unlocked[m.id];
    const best = meta.best[m.id] || 0;
    const card = document.createElement('button');
    card.style.cssText = 'width:180px;padding:14px;border:2px solid #2e7d32;border-radius:8px;'
      + 'background:' + (unlocked ? '#2e7d32' : '#333') + ';color:#fff;font-family:monospace;'
      + 'cursor:pointer;opacity:' + (unlocked ? '1' : '0.6');
    card.innerHTML = '<div style="font-size:15px;font-weight:bold">' + m.name + '</div>'
      + '<div style="font-size:11px;opacity:.85;margin-top:4px">' + m.difficulty + '</div>'
      + (unlocked
          ? '<div style="font-size:11px;margin-top:6px">Best wave: ' + best + '</div>'
          : '<div style="font-size:11px;margin-top:6px">🔒 Reach Wave ' + UNLOCK_WAVE + ' on ' + prevMapName(m.id) + '</div>');
    if (unlocked) card.onclick = () => startMap(m.id);
    cards.appendChild(card);
  });
  el.classList.remove('hidden');
}
function prevMapName(mapId) {
  const i = MAPS.findIndex(m => m.id === mapId);
  return i > 0 ? MAPS[i-1].name : '';
}
let loopStarted = false;
function startMap(id) {
  newGame(id); screen = 'playing';
  document.getElementById('mapSelect').classList.add('hidden');
  hideGameOver();
  if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }
}
function showMapSelect() { screen = 'mapSelect'; renderMapSelect(); }
```

- [ ] **Step 2: Build the Game Over overlay**

```html
<!-- add inside #stage, after #mapSelect -->
<div id="gameOver" class="overlay hidden"></div>
```
```js
function renderGameOver() {
  const el = document.getElementById('gameOver');
  const best = meta.best[game.mapId] || 0;
  el.innerHTML = '<h1 style="font-size:26px">🐛 Garden Overrun!</h1>'
    + '<p style="margin:8px 0">You reached <b>Wave ' + game.wave + '</b></p>'
    + '<p style="opacity:.8;font-size:12px">Best on this map: Wave ' + best + '</p>'
    + '<div style="display:flex;gap:10px;margin-top:14px"></div>';
  const row = el.querySelector('div');
  const retry = document.createElement('button');
  retry.textContent = '↻ Retry';
  styleBtn(retry); retry.onclick = () => startMap(game.mapId);
  const menu = document.createElement('button');
  menu.textContent = '⌂ Maps';
  styleBtn(menu); menu.onclick = () => { hideGameOver(); showMapSelect(); };
  row.append(retry, menu);
  el.classList.remove('hidden');
}
function styleBtn(b) {
  b.style.cssText = 'padding:10px 16px;border:2px solid #2e7d32;border-radius:6px;'
    + 'background:#2e7d32;color:#fff;font-family:monospace;font-size:14px;cursor:pointer';
}
function hideGameOver() { document.getElementById('gameOver').classList.add('hidden'); }
```

- [ ] **Step 3: Wire boot to show Map Select**

Replace all TEMP boot code with the real boot at the end of the script:
```js
showMapSelect();
requestAnimationFrame(frame); // loop runs always; update() is gated on screen==='playing'
loopStarted = true;
```
(Remove the earlier `loopStarted` guard's double-start by setting it here.)

- [ ] **Step 4: Verify the full screen flow**

Reload. Expected: Map Select shows 3 cards — Backyard playable, Flower Bed + Greenhouse locked with "Reach Wave 10" hints (maps 2/3 exist as data after Task 12; until then only Backyard renders — that's fine for this task, verify Backyard works). Tap Backyard → game starts. Play/force a loss (`preview_eval('game.hearts=1; game.pests.push(scaledPest("cat",1)); game.pests[0].dist=game.path.total-1;')`) → Game Over overlay appears with wave reached + Retry/Maps buttons. Retry restarts; Maps returns to select. Screenshot each screen.

- [ ] **Step 5: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): map select + game over overlays, full screen flow"
```

---

## Task 10: Pixel-art sprites (towers, pests, tiles) + wire into render

**Files:**
- Create: `garden-guard/assets/sprites/*.aseprite`, `garden-guard/public/*.png`
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Create sprites via pixel-plugin**

Using the pixel-plugin (Aseprite MCP) skill, create and export PNGs (transparent background) to `garden-guard/public/`:
- `tower-can.png`, `tower-zapper.png`, `tower-sprink.png`, `tower-scare.png` — 24×24 each, with a clear silhouette. (Tier is shown via a small tint/scale in code, so one sprite per tower is enough for MVP.)
- `pest-ant.png` (12×12), `pest-beetle.png` (16×16), `pest-lizard.png` (14×14), `pest-cat.png` (24×24) — each a 2-frame horizontal strip (so width = 2×). Keep a strong color match to the config `color` for readability.
- `veggie.png` (40×48) — the goal patch.
- Save `.aseprite` sources to `assets/sprites/`.

Bright, saturated garden palette. Keep them readable at 1× since the canvas is only scaled ~2× on phones.

- [ ] **Step 2: Preload images**

```js
const IMG = {};
function loadImages(done) {
  const names = ['tower-can','tower-zapper','tower-sprink','tower-scare',
                 'pest-ant','pest-beetle','pest-lizard','pest-cat','veggie'];
  let left = names.length;
  names.forEach(n => {
    const im = new Image();
    im.onload = im.onerror = () => { if (--left === 0) done(); };
    im.src = './public/' + n + '.png';
    IMG[n] = im;
  });
}
```
Map config to image keys: add `img:'tower-can'` etc. to each `TOWERS` entry and `img:'pest-ant'`, `frames:2` to each `PESTS` entry. (Edit the tables from Task 2.)

- [ ] **Step 3: Draw sprites instead of shapes**

In `render()`, replace the pest circle and tower square draws with `ctx.drawImage`. Pests use a 2-frame walk cycle driven by distance traveled:

```js
// pest:
const im = IMG[PESTS[p.type].img];
const fw = im.width / 2; // 2-frame strip
const frame = Math.floor(p.dist / 8) % 2;
ctx.drawImage(im, frame*fw, 0, fw, im.height, pt.x - fw/2, pt.y - im.height/2, fw, im.height);

// tower:
const tim = IMG[TOWERS[t.type].img];
ctx.drawImage(tim, plot.x - tim.width/2, plot.y - tim.height/2 - 2);

// goal:
const goal = game.path.points[game.path.points.length-1];
ctx.drawImage(IMG.veggie, goal.x - 20, goal.y - 24);
```
Gate the boot so the game only starts drawing sprites after `loadImages`:
```js
loadImages(() => { showMapSelect(); requestAnimationFrame(frame); loopStarted = true; });
```

- [ ] **Step 4: Verify sprites render**

Reload. Screenshot Map Select → start Backyard → place each of the 4 towers → start a wave. Expected: recognizable garden-tool towers and pest critters (ant/beetle/lizard/caterpillar) walking with a subtle 2-frame wiggle; veggie patch sprite at the goal. Confirm no broken-image gaps (check console for 404s on `/public/*.png`). Screenshot for the user.

- [ ] **Step 5: Commit**

```bash
git add garden-guard/assets garden-guard/public garden-guard/index.html
git commit -m "feat(garden-guard): pixel-art tower/pest/goal sprites wired into render"
```

---

## Task 11: WebAudio blips (optional polish)

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add a tiny synth-blip helper**

```js
let actx = null;
function blip(freq, ms, type) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = 0.05; o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + ms/1000);
  } catch (e) {}
}
```
(AudioContext must be created on a user gesture — it is, since the first sound follows a tap.)

- [ ] **Step 2: Hook blips into actions**

Add calls: `placeTower` success → `blip(660,60)`; `upgradeTower` success → `blip(880,80)`; `onPestKilled` → `blip(440,40,'sawtooth')`; `leakPest` → `blip(150,140,'sine')`; `onWaveCleared` → `blip(990,120)`.

- [ ] **Step 3: Verify audio**

In the preview, tap to place a tower and start a wave; confirm (via the user, or `preview_logs` for no errors) that taps produce sound and there are no AudioContext console errors. Audio is non-blocking polish — if the preview environment can't surface sound, confirming "no errors thrown" is sufficient.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): webaudio blips for place/upgrade/kill/leak/wave"
```

---

## Task 12: Maps 2 & 3 + balance pass

**Files:**
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Add maps 2 and 3 to the MAPS table**

Append two more map definitions. Flower Bed Maze: tighter, more bends (rewards splash). Greenhouse: long snaking path, choke points.

```js
{ id:'flowerbed', name:'Flower Bed Maze', difficulty:'Medium',
  path: [ {x:-20,y:60}, {x:120,y:60}, {x:120,y:180}, {x:60,y:180}, {x:60,y:300},
          {x:300,y:300}, {x:300,y:120}, {x:440,y:120}, {x:440,y:300}, {x:660,y:300} ],
  plots: [ {x:170,y:60}, {x:170,y:180}, {x:120,y:240}, {x:200,y:300},
           {x:250,y:240}, {x:350,y:200}, {x:390,y:300}, {x:500,y:200} ] },
{ id:'greenhouse', name:'Greenhouse', difficulty:'Hard',
  path: [ {x:-20,y:40}, {x:560,y:40}, {x:560,y:120}, {x:80,y:120}, {x:80,y:200},
          {x:560,y:200}, {x:560,y:280}, {x:80,y:280}, {x:80,y:340}, {x:660,y:340} ],
  plots: [ {x:300,y:80}, {x:300,y:160}, {x:200,y:160}, {x:420,y:160},
           {x:300,y:240}, {x:200,y:240}, {x:420,y:240}, {x:300,y:320} ] },
```
Verify each map's plots sit beside (not on) the path and the path enters from the left edge and exits at the right edge to a sensible goal.

- [ ] **Step 2: Play-balance pass**

Play each map (use `preview_eval` to grant cash for fast iteration, e.g. `game.cash += 500`). Tune for: a fresh Backyard player should reach ~wave 5–8 with sensible play and have to work to hit wave 10; the per-wave HP scaling (`1.12`) and `START_CASH` should make wave 10 achievable but not trivial. Adjust constants in the config tables only (no structural changes). Document any constant changes in the commit message.

- [ ] **Step 3: Verify all three maps unlock correctly**

Reset progress (`preview_eval('localStorage.removeItem("gardenGuardMeta_v1"); location.reload()')`). Play Backyard to wave 10 (or force: `preview_eval('game.wave=9; startWave();')` then clear). Confirm Flower Bed unlocks on the Map Select. Repeat to confirm Greenhouse unlocks from Flower Bed. Screenshot the Map Select with progressive unlocks.

- [ ] **Step 4: Commit**

```bash
git add garden-guard/index.html
git commit -m "feat(garden-guard): add Flower Bed + Greenhouse maps, balance pass"
```

---

## Task 13: PWA — manifest, service worker, icons

**Files:**
- Create: `garden-guard/manifest.json`, `garden-guard/sw.js`, `garden-guard/icon-192.png`, `garden-guard/icon-512.png`
- Modify: `garden-guard/index.html`

- [ ] **Step 1: Create the manifest**

`garden-guard/manifest.json`:
```json
{
  "name": "Garden Guard",
  "short_name": "GardenGuard",
  "description": "Defend your veggie patch! A cute pixel-art tower defense game.",
  "start_url": "./index.html",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#13301a",
  "theme_color": "#3a7d3a",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create the service worker**

Copy Sky Tycoon's `sw.js` (network-first, versioned cache) and adapt: set `CACHE_NAME = 'garden-guard-v1'` and `ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png']`. Note: the `public/*.png` sprites are fetched on demand and cached network-first by the fetch handler, so they don't need to be in the precache list.

- [ ] **Step 3: Create icons via pixel-plugin**

Make a garden-themed icon (e.g. a watering can over a veggie, or a shield-leaf) at 192×192 and 512×512, export to `garden-guard/icon-192.png` / `icon-512.png`.

- [ ] **Step 4: Register the service worker**

In `index.html`, before `</body>`:
```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
</script>
```

- [ ] **Step 5: Verify PWA**

Reload. Check `preview_console_logs` for SW registration (no errors). In the Application/Network panel proxy (or via `preview_eval('navigator.serviceWorker.controller')` after a second load) confirm the SW is active. Confirm manifest loads (no console warning). Screenshot showing the game runs with SW registered.

- [ ] **Step 6: Commit**

```bash
git add garden-guard/manifest.json garden-guard/sw.js garden-guard/icon-192.png garden-guard/icon-512.png garden-guard/index.html
git commit -m "feat(garden-guard): PWA manifest, network-first SW, icons"
```

---

## Task 14: Final polish + full playthrough verification

**Files:**
- Modify: `garden-guard/index.html` (as needed)

- [ ] **Step 1: Full cold playthrough**

Reset localStorage, reload. Play Backyard from the Map Select for several waves: place a mix of towers, upgrade some, sell one, survive boss wave 5, reach wave 10. Verify: cash economy feels right, hearts deplete only on leaks, the boss is threatening, unlock fires at wave 10. Capture a screenshot mid-wave-10 for the user.

- [ ] **Step 2: Responsive + orientation check**

Use `preview_resize` to test a few landscape phone sizes (e.g. 844×390, 740×360) and a desktop size. Confirm the canvas scales to fit with no clipping, HUD/tower-bar tap targets remain reachable, and aspect ratio is preserved (letterboxed, not stretched). Screenshot one mobile-landscape size.

- [ ] **Step 3: Error sweep**

Check `preview_console_logs` across a full session for any thrown errors or asset 404s. Fix any found. Confirm the loop doesn't leak (pests/projectiles arrays return toward empty between waves via `preview_eval('[game.pests.length, game.projectiles.length]')` after a cleared wave → `[0,0]`).

- [ ] **Step 4: Commit + summary for user**

```bash
git add garden-guard
git commit -m "polish(garden-guard): final playthrough fixes"
```
Then summarize for the user: what to play-test, and note that deploy = pushing `main` (per CLAUDE.md, do NOT push/commit-to-deploy until the user has verified and approved).

---

## Self-Review Notes (addressed)

- **Spec coverage:** concept (Task 1,9), single-file PWA pattern (1,13), canvas+pixelated landscape (1), 4 towers w/ 3 tiers (2,6,8), 4 ground pests + boss (2,5), 20 hearts + size-based leak cost (2,5), in-run cash + place/upgrade/sell economy (6,8), endless waves + scaling (5), 3 maps as data (2,12), wave-10 unlock + per-map best persisted (5,9), tap controls (8), pixel art via Aseprite (10), optional WebAudio (11), icons/manifest/SW (13). All covered.
- **No flyers / no targeting rules:** honored — all pests ground, `pickTarget` is range-only.
- **Type consistency:** `towerTierStats`, `upgradeCost`, `sellRefund`, `pickTarget`, `pointAt`, `buildPath`, `hudHitRects`, `popupHitRects`, `scaledPest`, `waveSpec` are defined once and referenced consistently. Config keys (`can/zapper/sprink/scare`, `ant/beetle/lizard/cat`) are stable across all tasks.
- **Known follow-ups (not blockers):** tier sprite differentiation is tint/scale, not unique art (acceptable for MVP per spec "subtle visual change"); maps 2/3 only appear on Map Select after Task 12, so Task 9's verification covers Backyard only.
