# Tower Talk

A small air traffic controller game. Tap a circling plane, then tap a runway — land it before fuel runs out, get takeoffs out before patience runs out, don't let the airspace overflow. Buy upgrades to expand your operation.

Plays as a PWA — installable, runs offline.

## Files

```
tower-talk/
├── index.html          # The whole game
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline cache)
├── icon-192.png        # PWA icon
├── icon-512.png        # PWA icon (also used as maskable)
├── apple-touch-icon.png
└── favicon.png
```

## Deploy to GitHub Pages

1. Create a new repo (e.g. `tower-talk`) and push these files to the root.
2. In the repo settings → **Pages** → set source to `main` branch, root folder.
3. Visit `https://<username>.github.io/tower-talk/`.

That's it. No build step.

## Local testing

PWA features (service worker, install prompt) need HTTPS or `localhost`. Easiest:

```bash
# Python
python3 -m http.server 8000
# Then visit http://localhost:8000
```

Or `npx serve` if you have Node.

## Updating

Bump `CACHE_VERSION` in `sw.js` whenever you change `index.html` or assets. Otherwise installed PWAs will keep serving the cached old version.
