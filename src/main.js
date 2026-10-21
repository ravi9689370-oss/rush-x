/* =========================================================================
   main.js — boot: brand wiring, input (touch swipe + keyboard),
   engine/UI/audio assembly, service-worker registration.
   ========================================================================= */
import '../css/style.css';
import { APP_NAME, TAGLINE } from './config.js';
import { loadData } from './data/storage.js';
import { SynthAudio } from './audio/synth.js';
import { RushEngine } from './game/engine.js';
import { UI } from './ui/ui.js';

document.title = APP_NAME;

/* ----------------------------- assemble ------------------------------- */
const progress = loadData();
const synth = new SynthAudio();
synth.cfg(progress.settings);

let autoLow = false;
const effectiveQuality = () => {
  if (progress.settings.quality === 'low') return 'low';
  return autoLow ? 'low' : 'high';
};

const canvas = document.getElementById('game');
const engine = new RushEngine({
  canvas,
  audio: synth,
  progress,
  quality: effectiveQuality
});

const ui = new UI({ engine, synth, progress });
engine.onHud = (f) => ui.hud(f);
engine.onOver = (r) => ui.gameOver(r);

const hideBoot = () => {
  const b = document.getElementById('boot');
  if (b) { b.style.transition = 'opacity .35s'; b.style.opacity = '0'; setTimeout(() => b.remove(), 400); }
};
setTimeout(hideBoot, 250);

engine.boot();

/* ------------------------------- inputs -------------------------------- */
let tStartX = 0, tStartY = 0, swiped = false;
const TH = 34;

canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  tStartX = t.clientX;
  tStartY = t.clientY;
  swiped = false;
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (swiped || engine.mode !== 'run') return;
  const t = e.touches[0];
  const dx = t.clientX - tStartX;
  const dy = t.clientY - tStartY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < TH) return;
  swiped = true;
  if (Math.abs(dx) > Math.abs(dy)) engine.input(dx > 0 ? 'R' : 'L');
  else engine.input(dy < 0 ? 'U' : 'D');
}, { passive: true });

canvas.addEventListener('touchend', () => { swiped = false; }, { passive: true });

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
  if (engine.mode === 'run') {
    if (k === 'arrowleft' || k === 'a') engine.input('L');
    else if (k === 'arrowright' || k === 'd') engine.input('R');
    else if (k === 'arrowup' || k === 'w' || k === ' ') engine.input('U');
    else if (k === 'arrowdown' || k === 's') engine.input('D');
    else if (k === 'p' || k === 'escape') {
      if (engine.pause()) ui.openModal('m-pause');
    }
  } else if (engine.mode === 'paused' && (k === 'p' || k === 'escape')) {
    ui.closeAllModals();
    engine.resume();
  }
});

/* auto-pause when app hidden */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.mode === 'run') {
    engine.pause();
    ui.openModal('m-pause');
  }
});

/* block page gestures / double-tap zoom */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

/* ------------------------- quality autotune ---------------------------- */
let slowFrames = 0;
let last = performance.now();
const perfTick = () => {
  const now = performance.now();
  const dt = now - last;
  last = now;
  if (engine.mode === 'run' && dt > 34) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90 && !autoLow) {
    autoLow = true;
    engine.renderer.resize();
  }
  requestAnimationFrame(perfTick);
};
requestAnimationFrame(perfTick);

/* --------------------------- service worker ---------------------------- */
if ('serviceWorker' in navigator && !/capacitor/i.test(navigator.userAgent)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* memory-tag for debugging */
console.log(`%c${APP_NAME}`, 'color:#FF2A85;font-weight:bold;font-style:italic;font-size:16px', '—', TAGLINE);
