/* =========================================================================
   Renderer — all visuals are drawn procedurally on canvas (no image assets).
   Layers: sky/stars/sun → parallax skyline (far/near) → road with neon
   lanes & posts → entities → floating texts → player car → particles →
   speed lines → banners → vignette/flash.
   ========================================================================= */
import { COLORS, TUNE } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* roundRect polyfill for older WebViews */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rad = Math.min(typeof r === 'number' ? r : 8, w / 2, h / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return this;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.floor(w));
  c.height = Math.max(2, Math.floor(h));
  return c;
}

export class Renderer {
  constructor(canvas, quality) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.quality = quality || (() => 'high');
    this.dpr = 1;
    this.W = 0; this.H = 0;
    this.P = {};       // per-frame projection params
    this.layers = {};
    window.addEventListener('resize', () => this.resize());
  }

  /* ------------------------------- sizing ------------------------------- */
  resize() {
    const high = this.quality() !== 'low';
    const targetDpr = high ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.dpr = targetDpr;
    this.W = W; this.H = H;
    this.cv.width = Math.floor(W * targetDpr);
    this.cv.height = Math.floor(H * targetDpr);
    this.buildLayers();
  }

  buildLayers() {
    const W = this.W, H = this.H;
    const hy = H * TUNE.horizonY;

    /* stars */
    const stars = makeCanvas(W, hy);
    const sctx = stars.getContext('2d');
    let seed = 7;
    const rnd = () => (seed = (seed * 16807 + 19) % 2147483647) / 2147483647;
    for (let i = 0; i < 130; i++) {
      const x = rnd() * W, y = rnd() * hy * 0.85, r = rnd() * 1.4 + 0.3;
      const cols = ['#FFFFFF', '#A594F9', '#00F5D4', '#FF2A85'];
      sctx.globalAlpha = 0.25 + rnd() * 0.65;
      sctx.fillStyle = cols[(rnd() * cols.length) | 0];
      sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill();
    }
    this.layers.stars = stars;

    /* far skyline */
    const hFar = H * 0.11;
    const far = makeCanvas(W + 240, hFar);
    const fctx = far.getContext('2d');
    seed = 42; const rndF = () => (seed = (seed * 48271 + 11) % 2147483647) / 2147483647;
    let x = 0;
    while (x < W + 240) {
      const bw = 18 + rndF() * 34;
      const bh = (0.25 + rndF() * 0.75) * hFar;
      fctx.fillStyle = '#1A1238';
      fctx.fillRect(x, hFar - bh, bw, bh);
      if (rndF() > 0.45) {
        fctx.fillStyle = 'rgba(0,245,212,0.35)';
        fctx.fillRect(x + 3, hFar - bh - 2, 2, 2);
      }
      for (let wy = 0; wy < bh - 6; wy += 7) {
        if (rndF() > 0.82) {
          fctx.fillStyle = 'rgba(165,148,249,0.4)';
          fctx.fillRect(x + 3 + (rndF() * (bw - 6) | 0), hFar - bh + 3 + wy, 2, 3);
        }
      }
      x += bw + 2 + rndF() * 10;
    }
    this.layers.far = far;

    /* near skyline */
    const hNear = H * 0.16;
    const near = makeCanvas(W + 240, hNear);
    const nctx = near.getContext('2d');
    seed = 99; const rndN = () => (seed = (seed * 69621 + 7) % 2147483647) / 2147483647;
    x = 0;
    while (x < W + 240) {
      const bw = 26 + rndN() * 44;
      const bh = (0.3 + rndN() * 0.7) * hNear;
      nctx.fillStyle = '#251B47';
      nctx.fillRect(x, hNear - bh, bw, bh);
      nctx.fillStyle = 'rgba(255,42,133,0.5)';
      if (rndN() > 0.6) nctx.fillRect(x + bw * 0.4, hNear - bh, 2, 4);
      for (let wy = 2; wy < bh - 6; wy += 8) {
        if (rndN() > 0.72) {
          nctx.fillStyle = rndN() > 0.5 ? 'rgba(0,245,212,0.5)' : 'rgba(255,42,133,0.45)';
          nctx.fillRect(x + 4 + (rndN() * (bw - 8) | 0), hNear - bh + 4 + wy, 2.5, 3.5);
        }
      }
      x += bw + 3 + rndN() * 14;
    }
    this.layers.near = near;
  }

  /* ---------------------------- projection ------------------------------ */
  computeP() {
    const W = this.W, H = this.H;
    const horizonY = H * TUNE.horizonY;
    const playerY = H * TUNE.playerY;
    const bottomFull = Math.min(W * 0.94, TUNE.roadBottomMax);
    const bottomHalf = bottomFull / 2;
    const topHalf = bottomHalf * TUNE.roadTopScale;
    this.P = { W, H, horizonY, playerY, bottomHalf, topHalf };
    return this.P;
  }

  persp(z) { return z * z; }
  yOf(z) { const p = this.P; return p.horizonY + (p.playerY - p.horizonY) * this.persp(z); }
  halfWOf(z) { const p = this.P; const d = this.persp(z); return p.topHalf + (p.bottomHalf - p.topHalf) * d; }
  scaleOf(z) { return 0.15 + 0.85 * this.persp(z); }
  fogOf(z) { return clamp((z - 0.04) / 0.16, 0, 1); }
  xOf(lane, z) { const p = this.P; const vx = p.vx == null ? p.W / 2 : p.vx; return vx + this.halfWOf(z) * (lane - 1) * 0.6; }

  playerScreenPos(g) {
    return { x: this.xOf(g.laneCur, 1), y: this.yOf(1) };
  }

  entScreenPos(g, e) {
    return { x: this.xOf(e.lane, e.z), y: this.yOf(e.z) };
  }

  /* ------------------------------ main frame ---------------------------- */
  render(g, dt) {
    const ctx = this.ctx;
    this.computeP();

    const shakeX = (Math.random() * 2 - 1) * g.shake;
    const shakeY = (Math.random() * 2 - 1) * g.shake * 0.6;
    this.P.vx = this.P.W / 2 + Math.sin(g.time * 0.4) * this.P.W * 0.012 + shakeX;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(0, shakeY);

    this.drawSky(g);
    this.drawRoad(g);
    this.drawEntities(g);
    this.drawTexts(g);
    if (g.mode !== 'demo' || true) this.drawPlayer(g);
    this.drawParticles(g);
    this.drawSpeedLines(g);
    this.drawBanners(g);
    this.drawOverlayFx(g);

    ctx.restore();
  }

  /* --------------------------------- sky -------------------------------- */
  drawSky(g) {
    const ctx = this.ctx, p = this.P;
    const grad = ctx.createLinearGradient(0, 0, 0, p.horizonY + 40);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgMid);
    ctx.fillStyle = grad;
    ctx.fillRect(0, -30, p.W, p.horizonY + 70);

    // stars (slow parallax)
    const sx = -((g.offset * 26) % p.W);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.layers.stars, sx, 0);
    ctx.drawImage(this.layers.stars, sx + p.W, 0);
    ctx.globalAlpha = 1;

    // horizon sun-glow
    const r = p.W * 0.34;
    const sun = ctx.createRadialGradient(p.vx, p.horizonY, 4, p.vx, p.horizonY, r);
    sun.addColorStop(0, 'rgba(255,42,133,0.5)');
    sun.addColorStop(0.4, 'rgba(255,42,133,0.16)');
    sun.addColorStop(1, 'rgba(255,42,133,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, p.W, p.horizonY + 30);

    // parallax skylines
    const far = this.layers.far, near = this.layers.near;
    let fx = -((g.offset * 150) % far.width);
    if (fx > 0) fx -= far.width;
    ctx.drawImage(far, fx, p.horizonY - far.height);
    ctx.drawImage(far, fx + far.width, p.horizonY - far.height);

    let nx = -((g.offset * 330) % near.width);
    if (nx > 0) nx -= near.width;
    ctx.drawImage(near, nx, p.horizonY - near.height + 4);
    ctx.drawImage(near, nx + near.width, p.horizonY - near.height + 4);
  }

  /* -------------------------------- road -------------------------------- */
  drawRoad(g) {
    const ctx = this.ctx, p = this.P;
    ctx.fillStyle = COLORS.roadEdge;
    ctx.fillRect(0, p.horizonY, p.W, p.H - p.horizonY);

    // asphalt
    ctx.beginPath();
    ctx.moveTo(p.vx - p.topHalf, p.horizonY);
    ctx.lineTo(p.vx + p.topHalf, p.horizonY);
    ctx.lineTo(p.W / 2 + p.bottomHalf, p.H);
    ctx.lineTo(p.W / 2 - p.bottomHalf, p.H);
    ctx.closePath();
    ctx.fillStyle = COLORS.road;
    ctx.fill();

    const glow = this.quality() !== 'low';

    // scrolling dash dividers (two inner boundaries)
    const boundaries = [-0.15, 0.15];
    const seg = 0.12;
    const phase = g.offset % seg;
    ctx.lineCap = 'round';
    for (const b of boundaries) {
      for (let k = 0; k < 10; k++) {
        const z0 = k * seg - phase + 0.02;
        if (z0 < 0.02) continue;
        const z1 = z0 + seg * 0.42;
        if (z0 > 1.05) break;
        const d0 = this.persp(z0), d1 = this.persp(z1);
        ctx.beginPath();
        ctx.moveTo(p.vx + this.halfWOf(z0) * b, p.horizonY + (p.playerY - p.horizonY) * d0);
        ctx.lineTo(p.vx + this.halfWOf(z1) * b, p.horizonY + (p.playerY - p.horizonY) * d1);
        ctx.strokeStyle = 'rgba(0,245,212,' + (0.28 + 0.5 * d1) + ')';
        ctx.lineWidth = 1.5 + 3.5 * d1;
        if (glow && d1 > 0.25) { ctx.shadowColor = '#00F5D4'; ctx.shadowBlur = 8 * d1; }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // neon road edges
    for (const e of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(p.vx + p.topHalf * e, p.horizonY);
      ctx.lineTo(p.W / 2 + p.bottomHalf * e, p.H);
      ctx.strokeStyle = COLORS.rose;
      ctx.lineWidth = 3;
      if (glow) { ctx.shadowColor = COLORS.rose; ctx.shadowBlur = 14; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // roadside posts
    const postSeg = 0.3;
    const pphase = g.offset % postSeg;
    for (let k = 0; k < 6; k++) {
      const z = k * postSeg - pphase + 0.05;
      if (z < 0.05 || z > 1) continue;
      for (const side of [-0.56, 0.56]) {
        const d = this.persp(z);
        const x = p.vx + this.halfWOf(z) * side;
        const y = p.horizonY + (p.playerY - p.horizonY) * d;
        const h = 26 * this.scaleOf(z);
        ctx.strokeStyle = (Math.floor((g.offset * 10 + k) % 2) ? COLORS.cyan : COLORS.rose);
        ctx.globalAlpha = this.fogOf(z) * 0.8;
        ctx.lineWidth = 2.5 * this.scaleOf(z);
        if (glow) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 * d; }
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ------------------------------- entities ----------------------------- */
  drawEntities(g) {
    const ctx = this.ctx;
    const sorted = [...g.ents].sort((a, b) => a.z - b.z);
    for (const e of sorted) {
      if (e.z < 0) continue;
      const p = this.P;
      const d = this.persp(e.z);
      const s = this.scaleOf(e.z);
      const fog = this.fogOf(e.z);
      if (fog <= 0.01 && e.k !== 'chip') continue;
      const x = p.vx + this.halfWOf(e.z) * (e.lane - 1) * 0.6;
      const y = p.horizonY + (p.playerY - p.horizonY) * d;

      let alpha = fog;
      if (e.dead) alpha *= 1 - e.deadT / 0.16;
      ctx.globalAlpha = alpha;

      if (e.kind === 'chip') this.drawChip(x, y, s, e);
      else if (e.kind === 'shield' || e.kind === 'magnet' || e.kind === 'boost') this.drawPower(x, y, s, e);
      else if (e.kind === 'barricade') this.drawBarricade(x, y, s);
      else if (e.kind === 'laser') this.drawLaser(x, y, s);
      else if (e.kind === 'wall') this.drawWall(x, y, s);

      ctx.globalAlpha = 1;
    }
  }

  drawChip(x, y, s, e) {
    const ctx = this.ctx;
    const r = 13 * s;
    const cy = y - r * 1.2;
    ctx.save();
    ctx.translate(x, cy);
    ctx.rotate(e.phase || 0);
    // hexagon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#7FE7FF');
    grad.addColorStop(1, COLORS.chip);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPower(x, y, s, e) {
    const ctx = this.ctx;
    const r = 17 * s;
    const col = e.kind === 'shield' ? COLORS.shield : e.kind === 'magnet' ? COLORS.magnet : COLORS.boost;
    const cy = y - r * 1.3;
    const pulse = 1 + Math.sin((e.phase || 0) * 0.9) * 0.08;

    const baseAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, cy);
    // halo
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.globalAlpha = baseAlpha * 0.35;
    ctx.lineWidth = 2.5 * s;
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;
    // orb
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8 * s;
    ctx.stroke();
    // glyph
    ctx.fillStyle = '#0B0914';
    ctx.font = `${Math.max(9, 17 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = e.kind === 'shield' ? '🛡' : e.kind === 'magnet' ? '🧲' : '⚡';
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }

  drawBarricade(x, y, s) {
    const ctx = this.ctx;
    const w = 66 * s;
    const h = 30 * s;
    const x0 = x - w / 2, y0 = y - h;
    // legs
    ctx.fillStyle = '#3A2C10';
    ctx.fillRect(x0 + 4 * s, y - h * 0.35, 5 * s, h * 0.35);
    ctx.fillRect(x0 + w - 9 * s, y - h * 0.35, 5 * s, h * 0.35);
    // body with hazard stripes
    const grad = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    grad.addColorStop(0, '#FFC24B');
    grad.addColorStop(1, '#C97E06');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 4 * s);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 4 * s);
    ctx.clip();
    ctx.fillStyle = '#1F1503';
    for (let i = -h; i < w; i += 9 * s) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0 + i, y0 + h);
      ctx.lineTo(x0 + i + 4.5 * s, y0 + h);
      ctx.lineTo(x0 + i + 4.5 * s + h * 0.7, y0);
      ctx.lineTo(x0 + i + h * 0.7, y0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // glow top edge
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x0 + 2 * s, y0, w - 4 * s, 2 * s);
    if (this.quality() !== 'low') {
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 12 * s;
      ctx.strokeStyle = 'rgba(245,158,11,0.9)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 4 * s);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  drawLaser(x, y, s) {
    const ctx = this.ctx;
    const w = 70 * s;
    const h = 74 * s;
    const clearance = 30 * s;
    const x0 = x - w / 2;
    const beamY = y - h;

    // side posts (full height)
    ctx.fillStyle = '#2A2A38';
    ctx.fillRect(x0, beamY, 7 * s, h);
    ctx.fillRect(x0 + w - 7 * s, beamY, 7 * s, h);
    ctx.fillStyle = COLORS.laser;
    ctx.fillRect(x0 + 2 * s, beamY, 3 * s, h);
    ctx.fillRect(x0 + w - 5 * s, beamY, 3 * s, h);

    // danger indicator beams
    const flick = 0.78 + Math.sin(performance.now() * 0.012 + x * 0.11) * 0.22;
    if (this.quality() !== 'low') { ctx.shadowColor = COLORS.laser; ctx.shadowBlur = 16 * s; }
    ctx.fillStyle = `rgba(255,59,92,${0.85 * flick})`;
    ctx.fillRect(x0, beamY, w, 9 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x0, beamY + 3 * s, w, 2.6 * s);
    // secondary lower beam hint
    ctx.fillStyle = `rgba(255,59,92,${0.5 * flick})`;
    ctx.fillRect(x0, beamY + 9 * s, w, 3 * s);
    ctx.shadowBlur = 0;

    // clearance marks
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let i = 1; i < 4; i++) {
      ctx.fillRect(x0 + 7 * s, beamY + (9 + 3) * s + i * (clearance / 4), w - 14 * s, 1.4 * s);
    }
  }

  drawWall(x, y, s) {
    const ctx = this.ctx;
    const w = 66 * s;
    const h = 62 * s;
    const x0 = x - w / 2, y0 = y - h;
    const grad = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    grad.addColorStop(0, '#B25CF7');
    grad.addColorStop(1, '#6B21A8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 5 * s);
    ctx.fill();
    // grid
    ctx.strokeStyle = 'rgba(0,245,212,0.4)';
    ctx.lineWidth = 1.2 * s;
    for (let gx = x0 + 8 * s; gx < x0 + w; gx += 10 * s) {
      ctx.beginPath(); ctx.moveTo(gx, y0 + 3 * s); ctx.lineTo(gx, y0 + h - 3 * s); ctx.stroke();
    }
    for (let gy = y0 + 10 * s; gy < y0 + h; gy += 12 * s) {
      ctx.beginPath(); ctx.moveTo(x0 + 3 * s, gy); ctx.lineTo(x0 + w - 3 * s, gy); ctx.stroke();
    }
    if (this.quality() !== 'low') {
      ctx.shadowColor = COLORS.violet;
      ctx.shadowBlur = 14 * s;
    }
    ctx.strokeStyle = '#00F5D4';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 5 * s);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ------------------------------- texts -------------------------------- */
  drawTexts(g) {
    const ctx = this.ctx;
    for (const t of g.texts) {
      ctx.globalAlpha = clamp(t.a, 0, 1);
      ctx.font = '800 italic 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(11,9,20,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.c;
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    }
  }

  /* --------------------------- player vehicle --------------------------- */
  drawPlayer(g) {
    const ctx = this.ctx, p = this.P;
    const skin = g.runSkin;
    const base = this.playerScreenPos(g);

    const tilt = clamp((g.laneTgt - g.laneCur) * 0.55, -0.5, 0.5);
    const bob = Math.sin(g.time * 6.5) * 1.6;
    let y = base.y - 14 + bob;
    if (g.jump.on) y -= g.jump.frac * (p.H * 0.13);
    const w = P_CAR_W, h = g.slide.on ? P_CAR_H * 0.58 : P_CAR_H;

    const glowOn = this.quality() !== 'low';
    ctx.save();

    // shadow (stays on ground; shrinks in air)
    const airLift = g.jump.frac || 0;
    ctx.globalAlpha = 0.5 - airLift * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 2, w * (0.55 - airLift * 0.2), 6.5 - airLift * 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // neon underglow pads
    if (glowOn) {
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = skin.glow;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(base.x - w * 0.32, base.y + 1, 9, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(base.x + w * 0.32, base.y + 1, 9, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // boost ghosts
    if (g.boost > 0) {
      for (let i = 1; i <= 2; i++) {
        ctx.globalAlpha = 0.16 / i;
        ctx.fillStyle = COLORS.boost;
        ctx.beginPath();
        ctx.roundRect(base.x - w / 2, y - h + i * 16, w, h, 12);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.translate(base.x, y);
    ctx.rotate(tilt);
    if (g.slide.on) ctx.translate(0, 6);

    // thruster flames
    const fl = 10 + g.effMul * 7 + (g.boost > 0 ? 26 : 0) + Math.random() * 5;
    for (const side of [-1, 1]) {
      const fx = side * w * 0.24;
      const grad = ctx.createLinearGradient(0, h - 4, 0, h - 4 + fl);
      grad.addColorStop(0, g.boost > 0 ? '#FFFFFF' : '#B9FFF3');
      grad.addColorStop(0.35, skin.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx - 5, h - 5);
      ctx.lineTo(fx + 5, h - 5);
      ctx.lineTo(fx + 1.5, h - 4 + fl);
      ctx.closePath();
      ctx.fill();
    }

    // chassis
    const grad = ctx.createLinearGradient(-w / 2, -h, w / 2, h);
    grad.addColorStop(0, skin.primary);
    grad.addColorStop(1, skin.secondary);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 13);
    ctx.fill();
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 5, -h + 3, w - 10, 6, 3);
    ctx.fill();

    // cabin glass
    ctx.fillStyle = skin.glass;
    ctx.beginPath();
    ctx.roundRect(-w * 0.32, -h + 8, w * 0.64, 12, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // spoiler
    ctx.fillStyle = 'rgba(11,9,20,0.65)';
    ctx.beginPath();
    ctx.roundRect(-w * 0.42, -4, w * 0.84, 5, 2.5);
    ctx.fill();

    // tail light bar
    if (glowOn) { ctx.shadowColor = COLORS.laser; ctx.shadowBlur = 12; }
    ctx.fillStyle = COLORS.laser;
    ctx.beginPath();
    ctx.roundRect(-w * 0.3 - 8, h - 11, 9, 4, 2);
    ctx.roundRect(w * 0.3 - 1, h - 11, 9, 4, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    /* shield bubble */
    if (g.shield > 0) {
      const blink = g.shield < 2 ? (Math.sin(g.time * 18) * 0.5 + 0.5) * 0.6 + 0.2 : 0.6;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = 3;
      if (glowOn) { ctx.shadowColor = COLORS.shield; ctx.shadowBlur = 18; }
      ctx.beginPath();
      ctx.arc(base.x, y - h * 0.4, w * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = blink * 0.25;
      ctx.fillStyle = COLORS.shield;
      ctx.fill();
      ctx.restore();
    }

    /* magnet swirl */
    if (g.magnet > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.magnet;
      ctx.lineWidth = 2.5;
      if (glowOn) { ctx.shadowColor = COLORS.magnet; ctx.shadowBlur = 12; }
      for (let i = 0; i < 2; i++) {
        const a0 = g.time * 5 + i * Math.PI;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(base.x, y - h * 0.4, w * 0.75, a0, a0 + 1.9);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ---------------------------- particles/lines ------------------------- */
  drawParticles(g) {
    const ctx = this.ctx;
    const glow = this.quality() !== 'low';
    for (const pt of g.parts) {
      ctx.globalAlpha = clamp(pt.a, 0, 1);
      ctx.fillStyle = pt.c;
      if (glow && pt.r > 2.5) { ctx.shadowColor = pt.c; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  drawSpeedLines(g) {
    if (g.effMul < 1.45 && g.boost <= 0) return;
    const ctx = this.ctx, p = this.P;
    const n = g.boost > 0 ? 9 : 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const xEdge = i % 2 === 0 ? p.W * (0.02 + Math.random() * 0.16) : p.W * (0.98 - Math.random() * 0.16);
      const y0 = Math.random() * p.H;
      const len = p.H * (0.1 + Math.random() * 0.16);
      ctx.beginPath();
      ctx.moveTo(xEdge, y0);
      ctx.lineTo(xEdge, y0 - len);
      ctx.stroke();
    }
  }

  /* ------------------------------- banners ------------------------------ */
  drawBanners(g) {
    const ctx = this.ctx, p = this.P;
    let idx = 0;
    for (const b of g.banners) {
      const tN = b.t / b.dur;
      const pop = 1 + Math.max(0, 0.32 - b.t * 1.7);
      const alpha = tN < 0.75 ? 1 : 1 - (tN - 0.75) / 0.25;
      const size = clamp(p.H * 0.062, 20, 44) * pop;
      const y = p.H * 0.36 - idx * size * 1.15;

      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(p.W / 2, y);
      ctx.font = `900 italic ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(11,9,20,0.85)';
      ctx.strokeText(b.text, 0, 0);
      if (this.quality() !== 'low') { ctx.shadowColor = b.c; ctx.shadowBlur = 22; }
      ctx.fillStyle = b.c;
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
      idx++;
    }
  }

  /* ------------------------------ overlays ------------------------------ */
  drawOverlayFx(g) {
    const ctx = this.ctx, p = this.P;

    // boost tint
    if (g.boost > 0) {
      const pul = 0.1 + Math.sin(g.time * 9) * 0.05;
      ctx.fillStyle = `rgba(236,72,153,${pul})`;
      ctx.fillRect(0, 0, p.W, p.H);
    }

    // vignette
    const v = ctx.createRadialGradient(p.W / 2, p.H * 0.5, p.H * 0.34, p.W / 2, p.H * 0.5, p.H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(4,2,10,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, p.W, p.H);

    // crash flash
    if (g.flash > 0) {
      ctx.fillStyle = `rgba(255,59,92,${clamp(g.flash * 0.4, 0, 0.45)})`;
      ctx.fillRect(0, 0, p.W, p.H);
    }
  }
}

const P_CAR_W = 68;
const P_CAR_H = 36;
