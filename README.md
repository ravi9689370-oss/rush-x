# RUSH X ⚡ Turbo Car Run

A professional **2.5D endless arcade car runner** — 3-lane neon highway, jump/slide
obstacles, smart combo scoring, procedural audio, and **zero external assets**.
Everything (art, sound, icon) is generated procedurally in code.

> Tagline: **SWIPE FAST. DRIVE FOREVER.**

## 🎮 Gameplay
- **Swipe / WASD / Arrows** — left/right lanes, up = jump, down = slide
- 🟡 **Barricade** → jump · 🔴 **Laser gate** → slide · 🟣 **Cyber wall** → change lane
- 💎 **Data chips** → buy 4 car skins in the Garage
- 🛡 Shield (absorbs one crash) · 🧲 Magnet (steals chips) · ⚡ Turbo (invincible speed)
- Near-misses & clean dodges build a **combo multiplier**
- One revive per run for 💎100 chips

## 🧱 Tech
| Layer | Choice |
|---|---|
| Build | **Vite 5**, `base: './'` (Pages-safe) |
| App name | Single source: `src/config.js` → `page title`, `manifest.json`, `capacitor.config.json` via `scripts/sync-brand.mjs` |
| Icons | `public/icon.svg` → PNGs via `@resvg/resvg-js` (procedural, no downloads) |
| Audio | 100% Web Audio synthesis (engine hum, adaptive music, SFX) |
| Offline | Service worker with runtime cache-first shell |
| Android | Capacitor 6 + `@capacitor/assets` (icon auto-injected) |

## 🌐 Web (GitHub Pages)
Pushes to `main` trigger **`.github/workflows/pages.yml`** → Vite build → Pages deploy.
🔗 Live: https://ravi9689370-oss.github.io/rush-x/

## 📱 Android (Debug APK)
**`.github/workflows/android.yml`** compiles the **full working game** (same web bundle
wrapped by Capacitor) into `app-debug.apk` and uploads it as artifact
**`RUSH-X-debug-APK`** on every push to `main`.

## 🛠 Local development
```bash
npm install          # (devs on linux-arm64 may add --ignore-scripts)
npm run dev          # vite dev server
npm run build        # prebuild: sync brand + icon PNGs, then vite build
npm run cap:sync     # build + install web assets into android/
```

**Rename the app?** Edit `APP_NAME` in `src/config.js` — title, PWA manifest and the
Android launcher name all update from that one line on the next build.

---
Package ID: `com.rushx.turbo` · All artwork & audio procedural · © 2026
