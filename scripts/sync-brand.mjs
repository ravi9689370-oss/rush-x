#!/usr/bin/env node
/**
 * sync-brand.mjs — single-source-of-truth injector.
 * Reads APP_NAME / APP_ID from src/config.js and regenerates:
 *   - public/manifest.json   (PWA name)
 *   - capacitor.config.json  (Android appName + appId)
 * Run automatically on predev/prebuild, so renaming the app is a 1-line change.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = resolve(root, 'src/config.js');
const src = readFileSync(cfgPath, 'utf8');

function grab(name) {
  const re = new RegExp(`export const ${name} = ['\"]([^'\"]+)['\"]`);
  const m = src.match(re);
  if (!m) throw new Error(`sync-brand: ${name} not found in src/config.js`);
  return m[1];
}

const APP_NAME = grab('APP_NAME');
const APP_ID = grab('APP_ID');

mkdirSync(resolve(root, 'public'), { recursive: true });

/* ---------------- PWA manifest ---------------- */
const manifest = {
  name: APP_NAME,
  short_name: APP_NAME,
  description: 'Swipe fast. Drive forever. High-speed 3-lane neon cyber car runner.',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  orientation: 'portrait',
  background_color: '#0B0914',
  theme_color: '#0B0914',
  icons: [
    { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
writeFileSync(resolve(root, 'public/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/* ---------------- Capacitor config ---------------- */
const cap = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    backgroundColor: '#0B0914'
  }
};
writeFileSync(resolve(root, 'capacitor.config.json'), JSON.stringify(cap, null, 2) + '\n');

console.log(`[brand] APP_NAME="${APP_NAME}" APP_ID="${APP_ID}" → manifest.json + capacitor.config.json`);
