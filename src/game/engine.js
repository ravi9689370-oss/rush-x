/* =========================================================================
   RushEngine — the 2.5D runner core.
   Fixed-ish loop with clamped dt, z-space movement (horizon→player),
   pattern spawner, combo/near-miss scoring, powerups, particles.
   Modes: demo (menu attract), run, crash (slow-mo), over, paused.
   ========================================================================= */
import { TUNE } from '../config.js';
import { buildWave } from './patterns.js';
import { skinById } from './skins.js';
import { Renderer } from './renderer.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class RushEngine {
  constructor({ canvas, audio, progress, quality }) {
    this.audio = audio;
    this.progress = progress;
    this.quality = quality || (() => 'high');
    this.renderer = new Renderer(canvas, () => this.quality());

    this.mode = 'demo';           // demo | run | crash | over | paused
    this.time = 0;
    this.offset = 0;              // road scroll phase (z units)
    this.speedMul = 1;
    this.effMul = 1;

    this.laneCur = 1;
    this.laneTgt = 1;
    this.jump = { on: false, t: 0, frac: 0 };
    this.slide = { on: false, t: 0 };
    this.shield = 0;
    this.magnet = 0;
    this.boost = 0;

    this.ents = [];
    this.parts = [];
    this.texts = [];
    this.banners = [];

    this.shake = 0;
    this.flash = 0;
    this.crashT = 0;
    this.finalized = false;

    this.dist = 0;
    this.score = 0;
    this.chips = 0;
    this.streak = 0;
    this.streakT = 0;
    this.combo = 0;
    this.usedContinue = false;
    this.nextMilestone = 500;

    this.gap = 1.2;
    this.onHud = () => {};
    this.onOver = () => {};
    this.onBanner = () => {};
  }

  /* ----------------------------- lifecycle ----------------------------- */
  boot() {
    this.renderer.resize();
    this.loop();
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    let dt = 1 / 60;
    if (this._last) dt = Math.min(0.05, (performance.now() - this._last) / 1000);
    this._last = performance.now();
    this.time += dt;

    if (this.mode === 'run') this.updateRun(dt);
    else if (this.mode === 'demo') this.updateDemo(dt);
    else if (this.mode === 'crash') this.updateCrash(dt);

    this.updateFx(dt);
    this.renderer.render(this, dt);
    this.emitHud();
  };

  startRun() {
    this.reset();
    this.mode = 'run';
    this.audio.engineOn();
    this.audio.running = true;
    this.banner('GO!', '#00F5D4', 0.8);
  }

  reset() {
    this.speedMul = TUNE.speedStart;
    this.effMul = TUNE.speedStart;
    this.laneCur = 1; this.laneTgt = 1;
    this.jump = { on: false, t: 0, frac: 0 };
    this.slide = { on: false, t: 0 };
    this.shield = 0; this.magnet = 0; this.boost = 0;
    this.ents = []; this.parts = []; this.texts = []; this.banners = [];
    this.shake = 0; this.flash = 0; this.crashT = 0; this.finalized = false;
    this.dist = 0; this.score = 0; this.chips = 0;
    this.streak = 0; this.streakT = 0; this.combo = 0; this.usedContinue = false;
    this.nextMilestone = 500;
    this.gap = 1.6;
  }

  pause() {
    if (this.mode !== 'run') return false;
    this.mode = 'paused';
    this.audio.running = false;
    return true;
  }

  resume() {
    if (this.mode !== 'paused') return false;
    this.mode = 'run';
    this.audio.running = true;
    return true;
  }

  goHome() {
    this.mode = 'demo';
    this.reset();
    this.audio.engineOff();
    this.audio.running = false;
  }

  restart() {
    this.audio.engineOff();
    this.startRun();
  }

  /* ------------------------------- input -------------------------------- */
  input(dir) {
    if (this.mode !== 'run') return;
    if (dir === 'L' || dir === 'R') {
      const next = clamp(this.laneTgt + (dir === 'R' ? 1 : -1), 0, 2);
      if (next !== this.laneTgt) { this.laneTgt = next; this.audio.swipe(); }
    } else if (dir === 'U') {
      if (!this.jump.on) {
        this.slide.on = false;
        this.jump = { on: true, t: 0, frac: 0 };
        this.audio.jump();
      }
    } else if (dir === 'D') {
      if (!this.slide.on) {
        this.jump.on = false;
        this.slide = { on: true, t: 0 };
        this.audio.slide();
      }
    }
  }

  /* ------------------------------ demo mode ----------------------------- */
  updateDemo(dt) {
    const dz = TUNE.zStepBase * 1.05 * dt;
    this.offset = (this.offset + dz) % 9;
    this.laneCur = 1 + Math.sin(this.time * 0.55) * 0.4;
    this.laneTgt = this.laneCur;
    this.effMul = 1.05;
    this.speedMul = 1.05;
    this.degrade(dt);
  }

  /* -------------------------------- run --------------------------------- */
  updateRun(dt) {
    // speed ramp
    this.speedMul = Math.min(TUNE.speedMax, this.speedMul + TUNE.speedGain * dt);
    const boosted = this.boost > 0;
    const eff = this.speedMul * (boosted ? TUNE.boostMul : 1);
    this.effMul = eff;

    // timers
    if (this.jump.on) {
      this.jump.t += dt;
      const f = this.jump.t / TUNE.jumpT;
      this.jump.frac = Math.sin(Math.min(1, f) * Math.PI);
      if (f >= 1) this.jump.on = false;
    }
    if (this.slide.on) {
      this.slide.t += dt;
      if (this.slide.t >= TUNE.slideT) this.slide.on = false;
    }
    if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);
    if (this.magnet > 0) this.magnet = Math.max(0, this.magnet - dt);
    if (this.boost > 0) {
      this.boost = Math.max(0, this.boost - dt);
      if (this.boost === 0) this.banner('TURBO OVER', '#A594F9', 0.6);
    }
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) this.streak = 0;
    }

    // distance + score
    const meters = TUNE.metersPerSec * eff * dt;
    this.dist += meters;
    this.score += meters * TUNE.scorePerMeter;

    // milestones
    if (this.dist >= this.nextMilestone) {
      this.banner(`${this.nextMilestone}m`, '#00F5D4', 0.8);
      this.audio.milestone();
      this.nextMilestone += 500;
    }

    // road scroll + lane
    const dz = TUNE.zStepBase * eff * dt;
    this.offset = (this.offset + dz) % 9;
    const lerpAmt = Math.min(1, TUNE.laneLerp * dt);
    this.laneCur += (this.laneTgt - this.laneCur) * lerpAmt;

    // spawner
    this.gap -= dz;
    const diff = clamp((this.speedMul - 1) / (TUNE.speedMax - 1), 0, 1);
    if (this.gap <= 0) {
      const wave = buildWave(diff, this.dist < 70);
      for (const e of wave.es) {
        this.ents.push({
          kind: e.kind, lane: e.lane, z: Math.max(TUNE.zSpawn, e.z),
          counted: false, dead: false, deadT: 0, phase: Math.random() * Math.PI * 2, dodged: false
        });
      }
      if (wave.tag) this.banner(wave.tag, wave.color || '#FFFFFF', 0.7);
      const base = Math.max(TUNE.gapMin, TUNE.gapBase - (this.speedMul - 1) * 0.5);
      this.gap = base * (0.85 + Math.random() * TUNE.gapVar);
    }

    // engine audio pitch
    this.audio.engineSpeed(this.effMul);
    this.audio.effMul = this.effMul;

    // boost exhaust
    if (this.boost > 0 && this.parts.length < TUNE.particleMax) {
      const p = this.renderer.playerScreenPos(this);
      this.burst(p.x, p.y + 6, '#EC4899', 2, 60, 0.35);
    }

    this.moveEnts(dt);
    this.degrade(dt);
  }

  moveEnts(dt) {
    const eff = this.effMul;
    const dz = TUNE.zStepBase * eff * dt;

    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      e.z += dz;
      e.phase += dt * 6;

      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 0.16) this.ents.splice(i, 1);
        continue;
      }

      // magnet steering
      if (this.magnet > 0 && e.kind === 'chip' && e.z > 0.3 && e.z < 1.0) {
        e.lane += (this.laneCur - e.lane) * Math.min(1, TUNE.laneFloatLerp * dt * 4);
      }

      // collision window
      if (!e.counted && e.z >= TUNE.zHitA && e.z <= TUNE.zHitB) {
        const diff = Math.abs(e.lane - this.laneCur);
        if (diff < TUNE.laneTolerance) {
          if (e.kind === 'chip') {
            this.collectChip(e);
          } else if (e.kind === 'shield') {
            this.gainPower(e, 'shield', TUNE.shieldT, 'SHIELD UP', '#10B981');
          } else if (e.kind === 'magnet') {
            this.gainPower(e, 'magnet', TUNE.magnetT, 'MAGNET ON', '#FACC15');
          } else if (e.kind === 'boost') {
            this.gainPower(e, 'boost', TUNE.boostT, 'TURBO!', '#EC4899');
          } else {
            // obstacle — can we pass it?
            const cleared =
              (e.kind === 'barricade' && this.jump.on && this.jump.frac > TUNE.jumpClear) ||
              (e.kind === 'laser' && this.slide.on);
            if (cleared) {
              e.dodged = true;
              this.combo = Math.min(5, this.combo + 1);
              const bonus = TUNE.scoreNear * Math.max(1, this.combo);
              this.score += bonus;
              e.counted = true;
              this.audio.nearMiss();
              this.floatText(`CLEAN DODGE +${bonus}`, '#00F5D4');
            } else {
              this.hitObstacle(e);
            }
          }
        }
      }

      // near-miss when passing beside an obstacle
      if (!e.counted && e.z > TUNE.zHitB) {
        e.counted = true;
        const diff = Math.abs(e.lane - this.laneCur);
        const obstacle = e.kind !== 'chip' && e.kind !== 'shield' && e.kind !== 'magnet' && e.kind !== 'boost';
        if (obstacle && !e.dead && !e.dodged && diff < TUNE.nearMissLane) {
          this.combo = Math.min(5, this.combo + 1);
          const bonus = TUNE.scoreNear * Math.max(1, this.combo);
          this.score += bonus;
          this.audio.nearMiss();
          this.floatText(`NEAR MISS +${bonus}${this.combo > 1 ? `  x${this.combo}` : ''}`, '#FF2A85');
        }
      }

      if (e.z > TUNE.zRemove || e.dead) this.ents.splice(i, 1);
    }
  }

  collectChip(e) {
    e.dead = true;
    this.streak = Math.min(TUNE.chipStreakMax, this.streak + 1);
    this.streakT = 1.3;
    this.chips++;
    this.score += TUNE.scoreChip + this.streak * 5;
    this.audio.chip(this.streak);
    const p = this.renderer.entScreenPos(this, e);
    this.burst(p.x, p.y, '#00BBF9', 6, 70, 0.4);
  }

  gainPower(e, key, dur, label, color) {
    e.dead = true;
    this[key] = dur;
    this.audio.power();
    this.banner(label, color, 0.9);
    const p = this.renderer.entScreenPos(this, e);
    this.burst(p.x, p.y, color, 14, 120, 0.55);
  }

  hitObstacle(e) {
    if (this.boost > 0) {
      e.dead = true;
      this.score += TUNE.scoreSmash;
      this.audio.smash();
      const p = this.renderer.entScreenPos(this, e);
      this.burst(p.x, p.y, '#EC4899', 12, 130, 0.5);
      return;
    }
    if (this.shield > 0) {
      this.shield = 0;
      e.dead = true;
      this.audio.shieldBreak();
      this.banner('SHIELD SAVED YOU', '#10B981', 0.9);
      const p = this.renderer.entScreenPos(this, e);
      this.burst(p.x, p.y, '#10B981', 14, 120, 0.55);
      return;
    }
    this.crash();
  }

  /* ------------------------------- crash -------------------------------- */
  crash() {
    this.mode = 'crash';
    this.crashT = 0;
    this.audio.crash();
    this.audio.running = false;
    this.shake = 16;
    this.flash = 1;
    const p = this.renderer.playerScreenPos(this);
    this.burst(p.x, p.y, '#FF2A85', 26, 200, 0.9);
    this.burst(p.x, p.y, '#FACC15', 16, 150, 0.7);
    this.combo = 0;
  }

  updateCrash(dt) {
    this.crashT += dt;
    // slow-motion effects while particles fly
    if (this.crashT > 0.9 && !this.finalized) {
      this.finalized = true;
      this.mode = 'over';
      this.audio.gameOver();
      this.audio.engineOff();

      const isBest = this.score > this.progress.best;
      const result = {
        score: Math.floor(this.score),
        dist: Math.floor(this.dist),
        chips: this.chips,
        newBest: isBest
      };
      this.onOver(result);
    }
  }

  canContinue() {
    return !this.usedContinue && this.progress.chips >= TUNE.continueCost;
  }

  continueRun() {
    if (!this.canContinue()) return false;
    this.usedContinue = true;
    this.progress.chips -= TUNE.continueCost;
    // clear the road ahead
    for (const e of this.ents) if (e.z < TUNE.continueClearZ) e.dead = true;
    this.shield = TUNE.continueShield;
    this.flash = 0; this.shake = 0; this.finalized = false;
    this.mode = 'run';
    this.laneTgt = 1; this.laneCur = 1;
    this.audio.engineOn();
    this.audio.running = true;
    this.banner('BACK IN THE GAME', '#00F5D4', 0.9);
    return true;
  }

  get runSkin() {
    return skinById(this.progress.skin);
  }

  /* ------------------------------- fx pools ------------------------------ */
  burst(x, y, color, n = 10, spd = 120, size = 0.5) {
    const max = this.quality() === 'low' ? Math.ceil(n / 2) : n;
    for (let i = 0; i < max && this.parts.length < TUNE.particleMax; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 0.8) * spd;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: (1.5 + Math.random() * 3) * size + 1, c: color, a: 1, g: 180
      });
    }
  }

  floatText(text, color) {
    if (this.texts.length >= TUNE.textMax) this.texts.shift();
    const p = this.renderer.playerScreenPos(this);
    this.texts.push({ text, x: p.x, y: p.y - 90, c: color, a: 1, vy: -46 });
  }

  banner(text, color, dur = 0.9) {
    this.banners.push({ text, c: color, t: 0, dur });
    if (this.banners.length > 3) this.banners.shift();
    this.onBanner(text, color);
  }

  updateFx(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.a -= dt * 1.6;
      if (p.a <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy * dt;
      t.a -= dt * 0.85;
      if (t.a <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.t += dt;
      if (b.t > b.dur) this.banners.splice(i, 1);
    }
    this.degrade(dt);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  degrade(dt) {
    // decay combo when idle-ish long time between dodges
    if (this.combo > 0 && this.mode === 'run') {
      this._comboT = (this._comboT || 0) + dt;
      if (this._comboT > 6) { this.combo = Math.max(0, this.combo - 1); this._comboT = 0; }
    } else if (this.combo === 0) this._comboT = 0;
  }

  emitHud() {
    this.onHud({
      score: Math.floor(this.score),
      dist: Math.floor(this.dist),
      chips: this.chips,
      eff: this.effMul,
      shield: this.shield,
      magnet: this.magnet,
      boost: this.boost
    });
  }
}
