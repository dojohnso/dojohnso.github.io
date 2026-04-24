# Water Hero 💧

A kid-friendly game about building wells and delivering water to villages. Inspired by Earth Day discussions about clean water access.

## Play

**Core loop:** Tap a grassy spot → survey → build a pump → collect water → deliver to villages → earn coins → upgrade.

**Progression:** 🪣 Bucket (10L) → 🛒 Cart (25L) → 🚐 Van (60L) → 🚚 Truck (150L) → 🚛 Tanker (400L), plus pump speed upgrades, bigger pump tanks, and extra pump slots.

## Deploy to GitHub Pages

1. Create a new repo (e.g. `water-hero`) and push this folder to it:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/water-hero.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)`**
3. Wait a minute or two. Your game will be live at:
   ```
   https://YOUR_USERNAME.github.io/water-hero/
   ```

### Installing on iPad

Open the URL in Safari, tap the Share button, then **Add to Home Screen**. It'll install as a full-screen app with the water drop icon, run offline after first load, and look like a native app.

## Updating the game

After making changes to `index.html`:

1. Bump the `CACHE_VERSION` in `sw.js` (e.g. `'v1'` → `'v2'`). This forces the service worker to refresh the cache on next visit.
2. Commit and push. GitHub Pages auto-deploys within a minute or so.
3. Users will get the update on their next launch (may need to close and reopen once).

## File layout

```
water-hero/
├── index.html              # the game
├── manifest.json           # PWA metadata
├── sw.js                   # service worker for offline play
├── icons/
│   ├── icon.svg            # source artwork
│   ├── icon-192.png        # standard icons
│   ├── icon-512.png
│   └── icon-maskable-512.png  # Android adaptive icon
└── README.md
```

All paths in the project are **relative**, so it works whether you host at `username.github.io/water-hero/` or some custom domain — no config needed.

## Tuning knobs

Everything gameplay-related lives in `index.html` at the top of the `<script>` block:

- **Village drain rate**: `drainRate: rand(0.006, 0.012)` — how fast villages get thirsty
- **Starting coins**: `coins: 100` in the `state` object
- **Village capacity**: `capacity: pop * 3` — liters per villager
- **Truck capacities**: `TRUCK_TIERS` array
- **Upgrade costs**: `COSTS` object
