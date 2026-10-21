/* Wave spawner patterns.
   Rules: obstacle configurations always leave at least one free lane,
   free lanes carry chip trails, powerups are parked in reachable lanes. */

const R = Math.random;
const ri = (n) => Math.floor(R() * n);
const pick = (arr) => arr[ri(arr.length)];
const lanesAll = [0, 1, 2];

function shuffledLanes() {
  const l = [...lanesAll];
  for (let i = l.length - 1; i > 0; i--) {
    const j = ri(i + 1);
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

function chipTrail(lane, count = 3, gap = 0.055, z0 = 0.02) {
  const es = [];
  for (let i = 0; i < count; i++) es.push({ kind: 'chip', lane, z: z0 + i * gap });
  return es;
}

export function buildWave(diff, earlyProtect) {
  if (earlyProtect) {
    return { es: chipTrail(ri(3), 5, 0.06) };
  }

  const pool = [
    { w: Math.max(0.5, 3.4 - diff * 0.9), f: waveSingle },
    { w: Math.min(3.2, 0.6 + diff * 0.85), f: waveDouble },
    { w: 1.25, f: waveChipArc },
    { w: 0.55, f: wavePower }
  ];
  if (diff > 0.25) pool.push({ w: Math.min(1.6, 0.4 + diff * 0.7), f: waveLaserRow });
  if (diff > 0.2) pool.push({ w: Math.min(1.4, 0.3 + diff * 0.6), f: waveBarricadeRow });
  if (diff > 0.35) pool.push({ w: Math.min(1.5, 0.3 + diff * 0.75), f: waveGateSqueeze });

  let total = 0;
  for (const p of pool) total += p.w;
  let roll = R() * total;
  let fn = waveSingle;
  for (const p of pool) {
    roll -= p.w;
    if (roll <= 0) { fn = p.f; break; }
  }
  return fn();
}

/* ------------------------- pattern builders ------------------------- */

function waveSingle() {
  const [a, b] = shuffledLanes();
  const es = [
    { kind: pick(['barricade', 'laser', 'wall', 'barricade', 'laser']), lane: a, z: 0.02 }
  ];
  es.push(...chipTrail(b));
  return { es };
}

function waveDouble() {
  const [a, b, c] = shuffledLanes();
  const es = [
    { kind: pick(['barricade', 'wall']), lane: a, z: 0.02 },
    { kind: pick(['laser', 'wall']), lane: b, z: 0.02 }
  ];
  es.push(...chipTrail(c, 4, 0.05));
  return { es };
}

function waveLaserRow() {
  const es = [];
  for (const l of lanesAll) es.push({ kind: 'laser', lane: l, z: 0.02 });
  return { es, tag: 'SLIDE!', color: '#FF3B5C' };
}

function waveBarricadeRow() {
  const es = [];
  for (const l of lanesAll) es.push({ kind: 'barricade', lane: l, z: 0.02 });
  return { es, tag: 'JUMP!', color: '#F59E0B' };
}

function waveChipArc() {
  const [a, b, c] = shuffledLanes();
  const seq = [a, a, b, b, c, c, b, a];
  const es = seq.map((lane, i) => ({ kind: 'chip', lane, z: 0.02 + i * 0.07 }));
  return { es };
}

function wavePower() {
  const lane = ri(3);
  const es = [{ kind: pick(['shield', 'magnet', 'boost', 'magnet', 'shield']), lane, z: 0.02 }];
  lanesAll.filter((l) => l !== lane).forEach((l) => es.push({ kind: 'chip', lane: l, z: 0.14 }));
  return { es };
}

function waveGateSqueeze() {
  const [a, b, c] = shuffledLanes();
  const es = [
    { kind: 'laser', lane: a, z: 0.02 },
    { kind: 'laser', lane: b, z: 0.02 },
    { kind: 'wall', lane: c, z: 0.02 + 0.22 }
  ];
  return { es, tag: 'DODGE!', color: '#9333EA' };
}
