# Sky Tycoon Title Screen + Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a title/home screen to Sky Tycoon with Continue / New Game (confirm-then-wipe), an in-game home button that returns to the title (flights keep running), and fix the iPad sticky-hover on the decline (✕) button.

**Architecture:** Introduce a top-level `screen` state (`'title'` | `'game'`) above the existing in-game `currentView` (fly/upgrade/shop). A `#title` overlay is shown/hidden by toggling a `body.show-title` class. The game save (`localStorage` `skyTycoonSave_v1`) is unchanged; `screen` is transient (a reload always lands on the title). The flight ticker keeps running regardless of screen.

**Tech Stack:** Vanilla HTML/CSS/JS in the single file `sky-tycoon/index.html`. No build tools. Verified via the preview tools (`preview_*`).

---

## File Structure

All changes are in **`/usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`**:
- **CSS** (`<style>`): `@media (hover: hover)` guard on the decline hover; `#title` overlay, title buttons, confirm panel; home-button styling; a `body.show-title` toggle that hides game chrome.
- **HTML** (`<body>`): a home button in `#topbar`; a `#title` overlay element.
- **Script**: `screen` state + `hasSave`/`showTitle`/`startGame`/`resetGame`/`renderTitle`; title + home event handlers; `tick`/`renderAll` guarded for the title screen; `boot()` lands on the title.

Testing: the game has no automated test framework (single-file PWA), so logic is checked with the browser console and behavior is verified with the preview tools. Each task ends with a commit.

---

## Task 1: Fix iPad sticky-hover on the decline button

**Files:**
- Modify: `sky-tycoon/index.html` (the `.job-decline:hover` CSS rule)

- [ ] **Step 1: Gate the hover highlight behind a hover-capable pointer**

The current rule (around line 106) applies a red highlight on `:hover` AND `:active`:
```css
  .job-decline:hover, .job-decline:active { background:#ff6b5e; color:#fff; opacity:1; }
```
On touch devices `:hover` sticks after a tap. Replace that single line with a hover-gated rule plus a kept `:active` (so touch still gets press feedback without sticking):
```css
  .job-decline:active { background:#ff6b5e; color:#fff; opacity:1; }
  @media (hover: hover) {
    .job-decline:hover { background:#ff6b5e; color:#fff; opacity:1; }
  }
```

- [ ] **Step 2: Verify the served file has the change**

Run: `grep -n "hover: hover" /usr/local/var/www/dojohnso.github.io/sky-tycoon/index.html`
Expected: one match showing the `@media (hover: hover)` block.

- [ ] **Step 3: Verify in the browser (desktop hover still works)**

Use `preview_start` (name `sky-tycoon`) if not running, navigate to `http://localhost:3850/`. Because the service worker can serve a stale page, first clear it: `preview_eval` with
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload(true);return 'sw cleared'})()
```
Then `preview_eval`:
```js
(function(){var el=document.querySelector('.job-decline');if(!el)return 'no decline btn (start a game first?)';var matched=[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.cssText.includes('hover: hover'))}catch(e){return false}});return {hoverMediaPresent: matched};})()
```
Expected: `{ hoverMediaPresent: true }`. (Note: at this point the app still boots straight into the game, so `.job-decline` exists on the Fly view.)

- [ ] **Step 4: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "fix(sky-tycoon): stop decline-button hover sticking on touch

Gate the red .job-decline:hover highlight behind @media (hover: hover) so
it only applies to real pointers; keep :active for touch press feedback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Title screen markup, home button, and CSS

**Files:**
- Modify: `sky-tycoon/index.html` (`<body>` markup + `<style>`)

- [ ] **Step 1: Add the home button to the top bar**

Replace the `#topbar` block (around lines 147–150):
```html
    <div id="topbar">
      <div id="money">$0</div>
      <div id="planeName">Single Prop</div>
    </div>
```
with (home button first, before money):
```html
    <div id="topbar">
      <button id="homeBtn" data-home aria-label="Home" title="Home">⌂</button>
      <div id="money">$0</div>
      <div id="planeName">Single Prop</div>
    </div>
```

- [ ] **Step 2: Add the title overlay markup**

Immediately AFTER the closing `</div>` of `#app` (the line `  </div>` that precedes `<script>`, around line 158) and BEFORE `<script>`, add the title overlay:
```html
  <div id="title">
    <div id="title-clouds">
      <div class="t-cloud" style="top:14%;left:8%;width:64px;height:20px"></div>
      <div class="t-cloud" style="top:26%;left:60%;width:84px;height:24px"></div>
      <div class="t-cloud" style="top:40%;left:30%;width:54px;height:18px"></div>
    </div>
    <div id="title-plane"></div>
    <h1 id="title-name">✈ Sky&nbsp;Tycoon</h1>
    <div id="title-buttons"></div>
    <div id="title-confirm" hidden>
      <div class="confirm-text">Erase your progress and start over?</div>
      <div class="confirm-row">
        <button class="t-btn t-danger" data-title-action="confirm-new">Erase</button>
        <button class="t-btn t-secondary" data-title-action="cancel-new">Cancel</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add the home button CSS**

Add inside `<style>`, right after the `.nav-btn.active` rule (around line 50):
```css
  /* home button */
  #homeBtn { width:32px; height:32px; flex-shrink:0; margin-right:10px;
    background:#0a2a4a; color:var(--gold); border:2px solid #1d4a72; border-radius:6px;
    font-family:inherit; font-weight:800; font-size:18px; line-height:1; cursor:pointer; padding:0; }
  #homeBtn:active { background:#1d4a72; }
  @media (hover: hover) { #homeBtn:hover { background:#1d4a72; } }
```

- [ ] **Step 4: Add the title overlay CSS**

Add inside `<style>`, just before the closing `</style>` (around line 142, after the `.owned` rule):
```css
  /* title screen */
  #title { display:none; position:absolute; inset:0; z-index:20; overflow:hidden;
    flex-direction:column; align-items:center; justify-content:center; gap:18px;
    background:linear-gradient(180deg, var(--sky) 0%, var(--sky2) 70%, var(--grass) 70%, var(--grass) 100%); }
  body.show-title #title { display:flex; }
  body.show-title #app { display:none; }
  #title-clouds { position:absolute; inset:0; pointer-events:none; }
  .t-cloud { position:absolute; background:#fff; border-radius:50px; opacity:.85; }
  #title-plane { width:160px; height:80px; background:var(--spr-prop) center/contain no-repeat;
    image-rendering:pixelated; image-rendering:crisp-edges; animation:title-bob 2s ease-in-out infinite; }
  @keyframes title-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  #title-name { color:#fff; font-size:30px; font-weight:800; letter-spacing:1px;
    text-shadow:3px 3px 0 #003; text-align:center; }
  #title-buttons { display:flex; flex-direction:column; gap:12px; width:220px; z-index:1; }
  .t-btn { font-family:inherit; font-weight:800; font-size:16px; padding:14px 0; width:100%;
    border:none; border-radius:8px; cursor:pointer; letter-spacing:1px; }
  .t-primary { background:var(--gold); color:var(--ink); }
  .t-secondary { background:#0a2a4a; color:#fff; border:2px solid #1d4a72; }
  .t-danger { background:#ff6b5e; color:#fff; }
  #title-confirm { z-index:1; width:240px; text-align:center; background:#001a33cc;
    border:2px solid #1d4a72; border-radius:8px; padding:14px; }
  .confirm-text { color:#fff; font-weight:700; font-size:14px; margin-bottom:12px; }
  .confirm-row { display:flex; gap:10px; }
  .confirm-row .t-btn { font-size:14px; padding:11px 0; }
```

- [ ] **Step 5: Verify markup + styles load with no errors**

`preview_eval` to clear SW (same snippet as Task 1 Step 3), then navigate to `http://localhost:3850/`. Then `preview_eval`:
```js
(function(){return {hasTitle: !!document.getElementById('title'), hasHome: !!document.getElementById('homeBtn'), hasButtons: !!document.getElementById('title-buttons'), hasConfirm: !!document.getElementById('title-confirm')};})()
```
Expected: all four `true`. Read `preview_console_logs` level `error` → expect none. (The title is still hidden — no `show-title` class yet; that's wired in Task 3.)

- [ ] **Step 6: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): title overlay markup + home button + styles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Screen state, title logic, and event wiring

**Files:**
- Modify: `sky-tycoon/index.html` (`<script>`)

- [ ] **Step 1: Add the screen state and helpers**

In the `<script>`, find the Render section start (around line 325):
```js
  // ---- Render ----
  let currentView = 'fly';
  const $ = sel => document.querySelector(sel);
```
Insert AFTER the `const $ = ...` line:
```js
  // Top-level screen: 'title' or 'game'. Transient (not persisted) — a reload
  // always returns to the title; only the game save persists.
  let screen = 'title';

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function renderTitle() {
    const btns = $('#title-buttons');
    if (hasSave()) {
      btns.innerHTML =
        '<button class="t-btn t-primary" data-title-action="continue">Continue</button>' +
        '<button class="t-btn t-secondary" data-title-action="new">New Game</button>';
    } else {
      btns.innerHTML =
        '<button class="t-btn t-primary" data-title-action="start">Start Game</button>';
    }
    $('#title-confirm').hidden = true;   // always start with confirm hidden
  }

  function showTitle() {
    if (screen === 'game') save();       // preserve progress when leaving the game
    screen = 'title';
    renderTitle();
    document.body.classList.add('show-title');
  }

  function startGame() {
    screen = 'game';
    document.body.classList.remove('show-title');
    refillBoard();
    renderAll();
  }

  function resetGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state = freshState();
    refillBoard();
    save();
  }
```

- [ ] **Step 2: Guard renderAll while on the title screen**

Find `renderAll` (around line 500, inside the Render section). It currently looks like:
```js
  function renderAll() { renderTopBar(); renderCurrentView(); }
```
Replace with a version that no-ops when the game isn't visible (so a flight completing on the title screen doesn't render hidden DOM):
```js
  function renderAll() {
    if (screen !== 'game') return;
    renderTopBar();
    renderCurrentView();
  }
```

- [ ] **Step 3: Guard the per-tick scene render too**

Find `tick` (around line 529):
```js
      } else if (currentView === 'fly') {
        renderScene();
      }
```
Change the condition so the scene only re-renders when actually on the game's Fly view:
```js
      } else if (screen === 'game' && currentView === 'fly') {
        renderScene();
      }
```

- [ ] **Step 4: Add title + home event handlers**

Find `onNavClick` (around line 570). AFTER it, add these two handlers. Note the dataset key is `titleAction` (camelCase) — JS reads `data-title-action` as `dataset.titleAction`:
```js
  function onTitleClick(e) {
    const btn = e.target.closest('[data-title-action]');
    if (!btn) return;
    const action = btn.dataset.titleAction;
    if (action === 'start' || action === 'continue') { startGame(); return; }
    if (action === 'new') { $('#title-confirm').hidden = false; return; }
    if (action === 'cancel-new') { $('#title-confirm').hidden = true; return; }
    if (action === 'confirm-new') { resetGame(); startGame(); return; }
  }

  function onTopbarClick(e) {
    if (e.target.closest('[data-home]')) showTitle();
  }
```

- [ ] **Step 5: Wire the new listeners and land on the title in boot()**

Find `boot()` (around line 576). It currently ends:
```js
    $('#content').addEventListener('click', onContentClick);
    $('#nav').addEventListener('click', onNavClick);
    setView('fly');
    renderAll();
    setInterval(tick, TICK_MS);
  }
```
Replace those lines with:
```js
    $('#content').addEventListener('click', onContentClick);
    $('#nav').addEventListener('click', onNavClick);
    $('#title').addEventListener('click', onTitleClick);
    $('#topbar').addEventListener('click', onTopbarClick);
    currentView = 'fly';
    setView('fly');          // sets the active nav tab; renderAll inside is a no-op on title
    showTitle();             // land on the title screen, not straight into the game
    setInterval(tick, TICK_MS);
  }
```
NOTE: `setView('fly')` calls `renderCurrentView()` directly (not via `renderAll`), which would render the Fly view into hidden `#content`. That's harmless (it's hidden by `body.show-title #app{display:none}`), and it pre-populates the game view so it's ready when `startGame()` runs. Leave it.

- [ ] **Step 6: Verify the full flow in the browser**

Clear SW (snippet from Task 1 Step 3), navigate to `http://localhost:3850/`. Then:
1. `preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'fresh'` — simulate a brand-new player.
2. `preview_screenshot` → expect the **title screen**: clouds, the red plane, "✈ Sky Tycoon", and a single **Start Game** button (no save yet).
3. `preview_click` selector `[data-title-action="start"]` → `preview_screenshot` → expect the game (Fly view, $0, Single Prop).
4. `preview_click` selector `[data-home]` → `preview_screenshot` → expect the title again, now showing **Continue** + **New Game** (a save exists).
5. `preview_click` `[data-title-action="continue"]` → `preview_screenshot` → game resumes.
6. `preview_click` `[data-home]`, then `[data-title-action="new"]` → `preview_screenshot` → expect the confirm panel ("Erase your progress…", Erase/Cancel).
7. `preview_click` `[data-title-action="cancel-new"]` → confirm panel hides, still on title.
8. Give yourself state, then test Erase: `preview_eval`
   ```js
   (function(){state.money=999;state.planeId='jet';save();return 'set rich state';})()
   ```
   `preview_click` `[data-home]` (if in game) then `[data-title-action="new"]` then `[data-title-action="confirm-new"]` → `preview_screenshot` → expect game with **$0** and **Single Prop** (wiped).

Read `preview_console_logs` level `error` after the flow → expect none.

- [ ] **Step 7: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "feat(sky-tycoon): title screen flow — Continue/New Game/home button

screen state ('title'|'game') above the in-game views; boot lands on the
title; home button returns to it (save preserved, flights keep running);
New Game shows a confirm panel then wipes to a fresh save.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Verify flight-continues-while-on-title + final polish

**Files:**
- Modify: `sky-tycoon/index.html` (only if a verification reveals a fix is needed)

- [ ] **Step 1: Verify a flight keeps running while on the title**

Clear SW + reset save, navigate to `http://localhost:3850/`, Start Game. Then `preview_eval`:
```js
(function(){
  state.activeFlight=null;
  var job={id:'jt',customer:'C',place:'Z',cargo:1,flightTime:6,payout:42};
  state.jobs.unshift(job); startJob(job); renderAll();
  return {started:true, money:state.money};
})()
```
Immediately `preview_click` `[data-home]` (go to title while the 6s flight runs). Wait ~7s (`Bash: sleep 7`). Then `preview_eval`:
```js
(function(){return {flying: !!state.activeFlight, money: state.money};})()
```
Expected: `flying:false` and `money` increased by ~42 — the flight completed while on the title (ticker kept running, `renderAll` no-opped safely). `preview_click` `[data-title-action="continue"]` → `preview_screenshot` → game shows the higher money and a parked plane.

- [ ] **Step 2: Verify no console errors across screens + mobile layout**

`preview_console_logs` level `error` → expect none. `preview_resize` preset `mobile`, `preview_screenshot` of the title screen → expect title fills the viewport cleanly (plane, name, buttons centered, no horizontal scroll). `preview_resize` preset `desktop` to reset.

- [ ] **Step 3: Decline-button touch check (regression from Task 1 still holds)**

Start a game so the Fly board shows. `preview_eval`:
```js
(function(){var matched=[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.cssText.includes('hover: hover'))}catch(e){return false}});return {hoverMediaPresent:matched};})()
```
Expected: `{ hoverMediaPresent: true }`.

- [ ] **Step 4: Reset to a clean fresh game**

`preview_eval`: `localStorage.removeItem('skyTycoonSave_v1'); location.reload(); 'clean'` → `preview_screenshot` → expect the title with a single Start Game button.

- [ ] **Step 5: Commit any fix made (skip if nothing changed)**

If Steps 1–3 required a code change, commit it:
```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/index.html && git commit -m "fix(sky-tycoon): title-screen verification follow-ups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
If no change was needed, note "no fix needed" and proceed.

---

## Task 5: Bump service worker cache + deploy

**Files:**
- Modify: `sky-tycoon/sw.js`

- [ ] **Step 1: Bump the cache version**

The service worker uses a versioned cache name so returning players purge the old build. Bump it (the value will be `v2` from the last deploy):
- Open `sky-tycoon/sw.js`, change `const CACHE_NAME = 'sky-tycoon-v2';` to `const CACHE_NAME = 'sky-tycoon-v3';`.

Run: `grep -n "CACHE_NAME" /usr/local/var/www/dojohnso.github.io/sky-tycoon/sw.js`
Expected: shows `sky-tycoon-v3`.

- [ ] **Step 2: Commit**

```bash
cd /usr/local/var/www/dojohnso.github.io && git add sky-tycoon/sw.js && git commit -m "chore(sky-tycoon): bump SW cache to v3 for title-screen release

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push to deploy (only after user confirms)**

This is outward-facing — confirm with the user before pushing. Then on `main`:
```bash
cd /usr/local/var/www/dojohnso.github.io && git push origin main
```

- [ ] **Step 4: Verify the live deploy**

Poll the live site until the title-screen code is served:
```bash
for i in 1 2 3 4 5 6; do sleep 15; \
  has=$(curl -sL https://dojohnso.github.io/sky-tycoon/index.html | grep -c "data-title-action"); \
  swv=$(curl -sL https://dojohnso.github.io/sky-tycoon/sw.js | grep -o "sky-tycoon-v[0-9]*" | head -1); \
  echo "try $i: title=$has sw=$swv"; \
  if [ "$has" -ge 1 ] && [ "$swv" = "sky-tycoon-v3" ]; then echo LIVE; break; fi; done
```
Expected: `title>=1` and `sw=sky-tycoon-v3`, then `LIVE`.

---

## Self-Review Notes

- **Spec coverage:** title screen overlay (Task 2), smart Continue/New-or-Start buttons (Task 3 `renderTitle`/`hasSave`), confirm-then-wipe New Game (Task 3 `resetGame` + confirm panel + Task 2 markup), home button top-left of money (Task 2 markup + Task 3 `onTopbarClick`/`showTitle`), flights keep running while on title (Task 4 Step 1; ticker unguarded, `renderAll`/scene guarded), boot lands on title (Task 3 Step 5), screen not persisted (it's a plain `let`, never saved), iPad sticky-hover fix (Task 1), SW cache bump for the release so the fix reaches players (Task 5). All covered.
- **Placeholder scan:** none. (Task 3 Step 4 calls out the `data-title-action` → `dataset.titleAction` camelCase mapping inline, but shows only the correct handler.)
- **Type consistency:** `screen` (string), `hasSave()`, `showTitle()`, `startGame()`, `resetGame()`, `renderTitle()`, `onTitleClick`, `onTopbarClick` used consistently. Dataset attribute `data-title-action` ↔ `dataset.titleAction`, `data-home` ↔ `[data-home]`. Element ids (`#title`, `#title-buttons`, `#title-confirm`, `#homeBtn`, `#topbar`) match between markup (Task 2) and script (Task 3).
