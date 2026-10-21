/* =========================================================================
   UI — scene switching, HUD binding, garage, settings, pause & game over.
   All names/strings come from config; everything is DOM overlay + canvas.
   ========================================================================= */
import { APP_NAME, TAGLINE, TUNE } from '../config.js';
import { SKINS, skinById } from '../game/skins.js';
import { persist, wipe } from '../data/storage.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ engine, synth, progress }) {
    this.engine = engine;
    this.synth = synth;
    this.progress = progress;
    this.resetArmed = false;

    this._hud = {};
    this._els = {
      boot: $('boot'),
      hud: $('hud'),
      menu: $('scene-menu'),
      brand: $('brand-name'),
      menuBest: $('menu-best'),
      menuChips: $('menu-chips'),
      menuRuns: $('menu-runs'),
      menuSkinDot: $('menu-skin-dot'),
      menuSkinName: $('menu-skin-name'),
      menuCar: $('menu-car'),
      score: $('hud-score'),
      dist: $('hud-dist'),
      chips: $('hud-chips'),
      speed: $('hud-speed'),
      fills: {
        shield: $('pb-fill-shield'),
        magnet: $('pb-fill-magnet'),
        boost: $('pb-fill-boost')
      },
      pbs: { shield: $('pb-shield'), magnet: $('pb-magnet'), boost: $('pb-boost') },
      garChips: $('gar-chips'),
      garList: $('gar-list'),
      toast: $('toast')
    };

    this.applyBrand();
    this.bindMenu();
    this.bindModals();
    this.applySettings();
    this.refreshMenu();
  }

  /* ------------------------------ brand -------------------------------- */
  applyBrand() {
    document.title = APP_NAME;
    this._els.brand.textContent = APP_NAME;
    document.querySelectorAll('.tagline').forEach((t) => (t.textContent = TAGLINE));
  }

  /* --------------------------- scene control ---------------------------- */
  showMenu() {
    this._els.hud.hidden = true;
    this._els.menu.hidden = false;
    this._els.menu.classList.add('on');
    this.closeAllModals();
    this.refreshMenu();
  }

  showGame() {
    this._els.hud.hidden = false;
    this._els.menu.hidden = true;
    this._els.menu.classList.remove('on');
  }

  closeAllModals() {
    document.querySelectorAll('.modal').forEach((m) => m.classList.remove('show'));
  }

  openModal(id) {
    this.closeAllModals();
    $(id).classList.add('show');
  }

  toast(msg) {
    const el = this._els.toast;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      el.classList.remove('show');
      this._toastT = setTimeout(() => (el.hidden = true), 220);
    }, 1500);
  }

  /* ------------------------------ menu ---------------------------------- */
  refreshMenu() {
    const p = this.progress;
    this._els.menuBest.textContent = p.best;
    this._els.menuChips.textContent = p.chips;
    this._els.menuRuns.textContent = p.runs;
    const skin = skinById(p.skin);
    this._els.menuSkinName.textContent = skin.name;
    this._els.menuSkinDot.style.background = `linear-gradient(135deg, ${skin.primary}, ${skin.secondary})`;
    this._els.menuCar.style.setProperty('--c1', skin.primary);
    this._els.menuCar.style.setProperty('--c2', skin.secondary);
    this._els.menuCar.style.setProperty('--cg', skin.glow);
  }

  bindMenu() {
    $('btn-play').addEventListener('click', () => {
      this.synth.ensure();
      this.synth.ui();
      this.showGame();
      this.engine.startRun();
    });
    $('btn-garage').addEventListener('click', () => { this.synth.ui(); this.openGarage(); });
    $('btn-how').addEventListener('click', () => { this.synth.ui(); this.openModal('m-how'); });
    $('btn-settings').addEventListener('click', () => { this.synth.ui(); this.openSettings(); });
  }

  /* ------------------------------- HUD ---------------------------------- */
  hud(f) {
    const e = this._els;
    const rounded = {
      score: f.score, dist: f.dist ? `${f.dist}m` : '0m', chips: f.chips, eff: f.eff.toFixed(1)
    };
    if (e._lastScore !== rounded.score) { e.score.textContent = rounded.score; e._lastScore = rounded.score; }
    if (e._lastDist !== rounded.dist) { e.dist.textContent = rounded.dist; e._lastDist = rounded.dist; }
    if (e._lastChips !== rounded.chips) { e.chips.textContent = rounded.chips; e._lastChips = rounded.chips; }
    if (e._lastEff !== rounded.eff) { e.speed.textContent = `x${rounded.eff}`; e._lastEff = rounded.eff; }

    this.setBar('shield', f.shield, TUNE.shieldT);
    this.setBar('magnet', f.magnet, TUNE.magnetT);
    this.setBar('boost', f.boost, TUNE.boostT);
  }

  setBar(key, time, max) {
    const pb = this._els.pbs[key];
    const fill = this._els.fills[key];
    if (time > 0) {
      pb.classList.add('active');
      fill.style.width = `${(time / max) * 100}%`;
    } else {
      pb.classList.remove('active');
      fill.style.width = '0%';
    }
  }

  /* ------------------------------ garage -------------------------------- */
  openGarage() {
    this._els.garChips.textContent = this.progress.chips;
    const list = this._els.garList;
    list.innerHTML = '';
    for (const skin of SKINS) {
      const owned = this.progress.owned.includes(skin.id);
      const active = this.progress.skin === skin.id;
      const row = document.createElement('div');
      row.className = 'gar-item' + (active ? ' equipped' : '') + (owned ? '' : ' locked');
      row.innerHTML = `
        <div class="gar-left">
          <span class="gar-dot" style="background:linear-gradient(135deg,${skin.primary},${skin.secondary})"></span>
          <div class="gar-info"><h4>${skin.name}</h4><span>${owned ? 'OWNED' : `💎 ${skin.cost} CHIPS`}</span></div>
        </div>
        <button class="gar-btn">${active ? '★ EQUIPPED' : owned ? 'EQUIP' : 'BUY'}</button>`;
      row.querySelector('button').addEventListener('click', () => this.skinsAction(skin, owned, active));
      list.appendChild(row);
    }
    this.openModal('m-garage');
  }

  skinsAction(skin, owned, active) {
    const p = this.progress;
    if (active) return;
    if (owned) {
      p.skin = skin.id;
      persist(p);
      this.synth.ui();
      this.openGarage();
      this.refreshMenu();
      return;
    }
    if (p.chips < skin.cost) {
      this.toast(`Need 💎 ${skin.cost - p.chips} more chips`);
      this.synth.ui();
      return;
    }
    p.chips -= skin.cost;
    p.owned.push(skin.id);
    p.skin = skin.id;
    persist(p);
    this.synth.power();
    this.openGarage();
    this.refreshMenu();
  }

  /* ----------------------------- settings ------------------------------- */
  openSettings() {
    this.resetArmed = false;
    $('btn-reset').textContent = 'RESET PROGRESS';
    this.applySettings();
    this.openModal('m-settings');
  }

  applySettings() {
    const s = this.progress.settings;
    this.setToggle('st-sfx', s.sfx);
    this.setToggle('st-music', s.music);
    this.setToggle('st-hap', s.haptics);
    this.setToggle('st-quality', s.quality !== 'low', 'HIGH', 'LOW');
    this.synth.cfg(s);
  }

  setToggle(id, on, onLabel = 'ON', offLabel = 'OFF') {
    const b = $(id);
    b.classList.toggle('on', !!on);
    b.textContent = on ? onLabel : offLabel;
  }

  bindSettings() {
    const toggle = (key, extra) => () => {
      const s = this.progress.settings;
      if (key === 'quality') {
        s.quality = s.quality === 'low' ? 'high' : 'low';
        this.engine.renderer.resize();
        this.synth.ui();
      } else {
        const nextKey = { 'st-sfx': 'sfx', 'st-music': 'music', 'st-hap': 'haptics' }[key];
        s[nextKey] = !s[nextKey];
        this.synth.ui();
      }
      persist(this.progress);
      this.applySettings();
      if (extra) extra();
    };
    $('st-sfx').addEventListener('click', toggle('st-sfx'));
    $('st-music').addEventListener('click', toggle('st-music'));
    $('st-hap').addEventListener('click', toggle('st-hap'));
    $('st-quality').addEventListener('click', toggle('quality', () => this.engine.renderer.resize()));
    $('btn-st-close').addEventListener('click', () => { this.synth.ui(); this.closeAllModals(); });

    $('btn-reset').addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        $('btn-reset').textContent = '⚠ TAP AGAIN TO CONFIRM';
        return;
      }
      wipe();
      location.reload();
    });
  }

  bindModals() {
    this.bindSettings();

    $('btn-pause').addEventListener('click', () => {
      if (this.engine.pause()) this.openModal('m-pause');
    });
    $('btn-resume').addEventListener('click', () => {
      this.synth.ui();
      this.closeAllModals();
      this.engine.resume();
    });
    $('btn-restart').addEventListener('click', () => {
      this.synth.ui();
      this.closeAllModals();
      this.showGame();
      this.engine.restart();
    });
    $('btn-pause-home').addEventListener('click', () => {
      this.synth.ui();
      this.showMenu();
      this.engine.goHome();
    });

    /* game over */
    $('btn-again').addEventListener('click', () => {
      this.synth.ui();
      this.closeAllModals();
      this.showGame();
      this.engine.restart();
    });
    $('btn-over-home').addEventListener('click', () => {
      this.synth.ui();
      this.showMenu();
      this.engine.goHome();
    });
    $('btn-continue').addEventListener('click', () => {
      if (this.engine.continueRun()) {
        persist(this.progress);
        this.closeAllModals();
        this.toast('REVIVED! 🛡 2.5s shield');
        this.synth.power();
      } else {
        this.toast('Not enough chips (💎100)');
      }
    });
    $('btn-gar-close').addEventListener('click', () => { this.synth.ui(); this.closeAllModals(); });
    $('btn-how-close').addEventListener('click', () => { this.synth.ui(); this.closeAllModals(); });
  }

  /* ---------------------------- game over ------------------------------- */
  gameOver(result) {
    const p = this.progress;
    p.runs += 1;
    p.totalDist += result.dist;
    p.chips += result.chips;
    if (result.newBest) {
      p.best = result.score;
      p.bestDist = Math.max(p.bestDist, result.dist);
    }
    persist(p);

    $('ov-title').textContent = result.newBest ? '🔥 NEW HIGH SCORE!' : 'RUN COMPLETE!';
    $('ov-newbest').hidden = !result.newBest;
    $('ov-score').textContent = result.score;
    $('ov-dist').textContent = `${result.dist}m`;
    $('ov-chips').textContent = `+${result.chips}`;
    $('ov-best').textContent = p.best;

    const canRevive = this.engine.canContinue();
    $('btn-continue').hidden = !canRevive;
    if (canRevive) $('btn-continue').textContent = `💛 CONTINUE — 💎${TUNE.continueCost}`;

    setTimeout(() => this.openModal('m-over'), 120);
  }
}
