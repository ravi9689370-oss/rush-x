/* =========================================================================
   SynthAudio — 100% procedural Web Audio: engine hum, adaptive music,
   UI/game SFX and haptics. No audio files, everything is synthesized.
   ========================================================================= */
import { TUNE } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.musicNodes = null;
    this.musicTimer = null;
    this.step = 0;
    this.nextNote = 0;
    this.bpm = 128;
    this.sfxOn = true;
    this.musicOn = true;
    this.hapticsOn = true;
    this.running = false;
    this._chipVoice = 0;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  cfg({ sfx, music, haptics }) {
    this.sfxOn = !!sfx;
    this.hapticsOn = !!haptics;
    this.musicOn = !!music;
    // never create an AudioContext before a user gesture — only start music
    // if the context already exists (it gets created inside engineOn/ui click)
    if (this.musicOn && this.ctx) this._musicStart();
    if (!this.musicOn) this._musicStop();
  }

  buzz(pattern) {
    if (!this.hapticsOn || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* noop */ }
  }

  /* ---------------- primitive voices ---------------- */
  _tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.15, vol = 0.2, when = 0, glideExp = false }) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) {
      if (glideExp) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.2, vol = 0.25, f = 1200, q = 1.2, type = 'bandpass', when = 0, sweepTo = null }) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /* ---------------- engine hum ---------------- */
  engineOn() {
    const ctx = this.ensure();
    if (!ctx || this.engineNodes) return;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 58; o2.frequency.value = 58 * 1.007;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 240; filt.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o1.connect(filt); o2.connect(filt); filt.connect(g).connect(this.master);
    o1.start(); o2.start();
    g.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.4);
    this.engineNodes = { o1, o2, filt, g };
    if (this.musicOn) this._musicStart();
  }

  engineSpeed(mul) {
    if (!this.engineNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 52 + 92 * clamp(mul, 0.5, 3);
    this.engineNodes.o1.frequency.setTargetAtTime(f, t, 0.15);
    this.engineNodes.o2.frequency.setTargetAtTime(f * 1.007, t, 0.15);
    this.engineNodes.filt.frequency.setTargetAtTime(220 + 340 * mul, t, 0.2);
  }

  engineOff() {
    if (!this.engineNodes || !this.ctx) return;
    const { o1, o2, g } = this.engineNodes;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.12);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch { /* noop */ } }, 500);
    this.engineNodes = null;
    this._musicStop();
  }

  /* ---------------- adaptive music loop ---------------- */
  _musicStart() {
    if (!this.ctx || this.musicTimer || !this.musicOn) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this._musicTick(), 90);
  }

  _musicStop() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  _musicTick() {
    if (!this.ctx || !this.musicOn || !this.sfxOn) return;
    const spb = 60 / (this.bpm * (this.running ? 1 + clamp((this.effMul || 1) - 1, 0, 1) * 0.35 : 1)) / 2; // 8th notes
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      this._musicStep(this.step, this.nextNote);
      this.nextNote += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  _musicStep(step, t) {
    const ctx = this.ctx;
    const bassSeq = [110, 110, 87.31, 87.31, 130.81, 130.81, 98, 98]; // A F C G
    const arp = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];

    if (step % 8 === 0) {
      // bass
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = bassSeq[(step / 8) | 0] / 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.32);
    }
    if (step % 4 === 2 && (step % 16 !== 2 || this.running)) {
      // arp sparkle
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = arp[(step / 4) % arp.length] * (step % 16 === 10 ? 2 : 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }
    if (step % 16 === 12) {
      // soft hat
      const len = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      s.connect(f).connect(g).connect(this.master);
      s.start(t);
    }
  }

  /* ---------------- SFX ---------------- */
  ui() { this._tone({ type: 'triangle', f0: 620, f1: 780, dur: 0.07, vol: 0.12 }); this.buzz(8); }
  swipe() { this._noise({ dur: 0.09, vol: 0.16, f: 900, sweepTo: 2400, q: 0.8 }); this.buzz(10); }
  jump() { this._tone({ type: 'triangle', f0: 300, f1: 660, dur: 0.18, vol: 0.2, glideExp: true }); this.buzz(14); }
  slide() { this._noise({ dur: 0.26, vol: 0.2, f: 1800, sweepTo: 300, type: 'lowpass' }); this.buzz([8, 12, 8]); }
  chip(streak = 0) {
    const n = clamp(streak, 0, TUNE.chipStreakMax);
    const f = 760 * Math.pow(2, n / 14);
    this._tone({ type: 'sine', f0: f, dur: 0.1, vol: 0.16 });
    this._tone({ type: 'sine', f0: f * 1.5, dur: 0.08, vol: 0.08, when: 0.045 });
    this.buzz(6);
  }
  power() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.15, when: i * 0.05 }));
    this.buzz([25, 25, 45]);
  }
  shieldBreak() {
    this._tone({ type: 'square', f0: 900, f1: 320, dur: 0.22, vol: 0.2, glideExp: true });
    this._noise({ dur: 0.25, vol: 0.18, f: 2400, sweepTo: 500 });
    this.buzz([40, 30, 60]);
  }
  nearMiss() { this._noise({ dur: 0.16, vol: 0.22, f: 2600, sweepTo: 400, q: 2.5 }); this._tone({ type: 'sine', f0: 1200, f1: 1800, dur: 0.1, vol: 0.08 }); this.buzz(18); }
  smash() { this._tone({ type: 'square', f0: 1400, f1: 200, dur: 0.18, vol: 0.18, glideExp: true }); this._noise({ dur: 0.15, vol: 0.14, f: 3000, sweepTo: 600 }); this.buzz(30); }
  milestone() { this._tone({ type: 'triangle', f0: 880, dur: 0.12, vol: 0.14 }); this._tone({ type: 'triangle', f0: 1174.66, dur: 0.16, vol: 0.14, when: 0.1 }); }
  crash() {
    this._tone({ type: 'sawtooth', f0: 170, f1: 30, dur: 0.5, vol: 0.34, glideExp: true });
    this._noise({ dur: 0.4, vol: 0.3, f: 900, sweepTo: 120, type: 'lowpass' });
    this.buzz([130, 40, 190]);
  }
  gameOver() {
    [392, 329.63, 261.63].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.16, when: i * 0.17 }));
  }
}
