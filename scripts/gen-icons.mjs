#!/usr/bin/env node
/**
 * gen-icons.mjs — procedural icon pipeline (no external/copyrighted assets).
 * Uses @resvg/resvg-js (pure npm prebuilt binding, works on x64 + arm64).
 * - assets/icon-only.png (1024) + assets/splash.png (2732) for @capacitor/assets
 * - public/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'public/icon.svg');

// ensure output directories exist
mkdirSync(resolve(root, 'assets'), { recursive: true });
mkdirSync(resolve(root, 'public'), { recursive: true });

function tryResvg() {
  try {
    return require_('@resvg/resvg-js');
  } catch (e) {
    return null;
  }
}

// small CJS interop (resvg-js ships CJS)
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);

async function main() {
  const mod = tryResvg();
  if (!mod) {
    console.warn('[icons] @resvg/resvg-js not installed — skipping PNG generation (svg fallback ok)');
    return;
  }
  const Resvg = mod.Resvg;
  const svgRaw = readFileSync(svgPath, 'utf8');

  const renderPng = (svgText, size, out, opts = {}) => {
    const resvg = new Resvg(svgText, {
      fitTo: { mode: 'width', value: size },
      ...opts
    });
    writeFileSync(out, resvg.render().asPng());
    console.log('[icons] wrote', out.replace(root + '/', ''));
  };

  /* ---- base icons ---- */
  renderPng(svgRaw, 1024, resolve(root, 'assets/icon-only.png'));
  renderPng(svgRaw, 512, resolve(root, 'public/icon-512.png'));
  renderPng(svgRaw, 192, resolve(root, 'public/icon-192.png'));
  renderPng(svgRaw, 180, resolve(root, 'public/apple-touch-icon.png'));

  /* ---- maskable: full-bleed bg + content scaled into safe zone ---- */
  let maskable = svgRaw
    .replace(/<rect width="512" height="512" rx="112"/, '<rect width="512" height="512"')
    .replace(/(rect width="512" height="512"[^/]*?)\/>/, '$1/>'); // keep as-is
  // wrap all drawable content after </defs> in a scaled group
  maskable = maskable.replace(/<\/defs>([\s\S]*)<\/svg>/, (m, body) =>
    `</defs><rect width="512" height="512" fill="#0B0914"/><g transform="translate(51 51) scale(0.8)">${body}</g></svg>`
  ) + '';
  renderPng(maskable, 512, resolve(root, 'public/maskable-512.png'));

  /* ---- splash: flat deep-space (logo padded by @capacitor/assets) ---- */
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732"><rect width="2732" height="2732" fill="#0B0914"/></svg>`;
  renderPng(splashSvg, 2732, resolve(root, 'assets/splash.png'));

  console.log('[icons] done: icon-only, splash, 512/192/apple/maskable PNGs');
}

main().catch((e) => {
  console.warn('[icons] non-fatal:', e.message);
});
