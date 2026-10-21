/* Local persistence — everything lives on-device (100% offline). */
const KEY = 'rushx2.save.v1';

export const DEFAULT_SAVE = {
  best: 0,
  bestDist: 0,
  chips: 0,
  runs: 0,
  totalDist: 0,
  owned: ['aurora'],
  skin: 'aurora',
  settings: { sfx: true, music: true, haptics: true, quality: 'high' }
};

export function loadData() {
  let data = { ...DEFAULT_SAVE, settings: { ...DEFAULT_SAVE.settings }, owned: [...DEFAULT_SAVE.owned] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = {
        ...data,
        ...parsed,
        settings: { ...data.settings, ...(parsed.settings || {}) },
        owned: Array.isArray(parsed.owned) && parsed.owned.length ? parsed.owned : [...DEFAULT_SAVE.owned]
      };
    }
  } catch {
    /* corrupted save — fall back to defaults */
  }
  return data;
}

export function persist(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) — game still playable */
  }
}

export function wipe() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
