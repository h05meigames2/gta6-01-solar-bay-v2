// SOLAR BAY city: 7x7 blocks, roads between them, beach + marina on the east edge.
// Coordinates are world units, city centred on (0,0). Written for this game.
import { makeRng, pick, range, irange } from './rng.js';

export const BLOCK = 240;      // block side
export const ROAD = 64;        // road width
export const GRID = 7;         // blocks per side
export const PITCH = BLOCK + ROAD;
export const CITY = GRID * PITCH + ROAD; // 2192
export const HALF = CITY / 2;

const PALETTES = [
  ['#c96f4a', '#8a5a7a', '#5a7a8a', '#b0a05a'],
  ['#7a8a5a', '#a05a5a', '#5a6a9a', '#9a7a4a'],
  ['#6a9a7a', '#b08a5a', '#7a5a8a', '#4a7a6a'],
];

export function buildWorld(seed = 20261117) {
  const rng = makeRng(seed);
  const buildings = [];   // {x,y,w,h,color,h,roof}
  const parks = [];       // {x,y,w,h,trees:[{x,y,r}]}
  const roadsV = [], roadsH = [];
  for (let i = 0; i <= GRID; i++) {
    const c = -HALF + ROAD / 2 + i * PITCH;
    roadsV.push(c); roadsH.push(c);
  }
  // Block centres
  const blockC = (i) => -HALF + ROAD + BLOCK / 2 + i * PITCH;
  const pal = pick(rng, PALETTES);
  // Special blocks: (col,row) 0-based
  const special = {
    '1,1': 'garage',   // Mara's Garage
    '5,2': 'depot',    // Old Depot
    '3,4': 'clinic',   // Bay Clinic
    '2,5': 'park',
    '4,0': 'park',
    '0,3': 'park',
    '6,3': 'pier',     // Solar Pier sits on the beach strip
  };
  const landmarks = {};
  for (let bx = 0; bx < GRID; bx++) {
    for (let by = 0; by < GRID; by++) {
      const cx = blockC(bx), cy = blockC(by);
      const key = bx + ',' + by;
      const kind = special[key];
      if (kind === 'park') {
        const trees = [];
        for (let t = 0; t < 14; t++) trees.push({ x: cx + range(rng, -95, 95), y: cy + range(rng, -95, 95), r: range(rng, 9, 16) });
        parks.push({ x: cx - 110, y: cy - 110, w: 220, h: 220, trees });
        continue;
      }
      if (kind === 'pier') {
        landmarks.pier = { x: HALF - 30, y: cy, name: 'Solar Pier' };
        continue;
      }
      const n = kind ? 1 : irange(rng, 2, 4);
      const spots = [];
      if (n === 1) spots.push([cx, cy, 190, 150]);
      else if (n === 2) { spots.push([cx - 55, cy, 95, 170]); spots.push([cx + 55, cy, 95, 170]); }
      else if (n === 3) { spots.push([cx - 60, cy - 55, 100, 95]); spots.push([cx + 60, cy - 55, 100, 95]); spots.push([cx, cy + 60, 200, 90]); }
      else { spots.push([cx - 58, cy - 58, 95, 95]); spots.push([cx + 58, cy - 58, 95, 95]); spots.push([cx - 58, cy + 58, 95, 95]); spots.push([cx + 58, cy + 58, 95, 95]); }
      for (const [x, y, w, h] of spots) {
        const b = { x: x - w / 2, y: y - h / 2, w, h, color: pick(rng, pal), hgt: irange(rng, 26, 70), roof: rng() < 0.3 };
        buildings.push(b);
        if (kind === 'garage') landmarks.garage = { x: cx, y: cy, name: "Mara's Garage", b };
        if (kind === 'depot') landmarks.depot = { x: cx, y: cy, name: 'Old Depot', b };
        if (kind === 'clinic') landmarks.clinic = { x: cx, y: cy, name: 'Bay Clinic', b };
      }
    }
  }
  // Beach strip east of the city + marina water
  const beach = { x0: HALF, x1: HALF + 260, y0: -HALF, y1: HALF };
  const marina = { x0: HALF + 260, x1: HALF + 520, y0: -HALF, y1: HALF };
  landmarks.pier = { x: HALF + 120, y: blockC(3), name: 'Solar Pier' };
  return { buildings, parks, roadsV, roadsH, landmarks, beach, marina, rng };
}

export function onRoad(world, x, y) {
  const m = ROAD / 2 + 4;
  for (const c of world.roadsV) if (Math.abs(x - c) < m) return true;
  for (const c of world.roadsH) if (Math.abs(y - c) < m) return true;
  return false;
}

// Circle vs building AABB; returns corrected position (slide along walls).
export function collideBuildings(world, x, y, r) {
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 < 0.0001) { x = b.x - r; continue; }
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r; y = ny + (dy / d) * r;
    }
  }
  return [x, y];
}

export function inBeach(world, x, y) {
  return x > world.beach.x0 && x < world.beach.x1 && y > world.beach.y0 && y < world.beach.y1;
}
export function inWater(world, x, y) {
  return x > world.marina.x0 && y > world.marina.y0 && y < world.marina.y1;
}
export function clampCity(x, y) {
  const lim = HALF + 500;
  return [Math.max(-HALF - 40, Math.min(lim, x)), Math.max(-HALF - 40, Math.min(HALF + 40, y))];
}
// Nearest point on a road centreline (for spawning cars/peds).
export function nearestRoadPoint(world, x, y) {
  let best = null, bd = 1e9;
  for (const c of world.roadsV) { const d = Math.abs(x - c); if (d < bd) { bd = d; best = [c, y]; } }
  for (const c of world.roadsH) { const d = Math.abs(y - c); if (d < bd) { bd = d; best = [x, c]; } }
  return best;
}
