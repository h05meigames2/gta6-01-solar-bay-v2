// SOLAR BAY — open-world crime game. All code written fresh in this session.
// City: Mara's Garage, Old Depot, Solar Pier, Bay Clinic. Original names, art, story.
import { buildWorld, collideBuildings, onRoad, nearestRoadPoint, inWater, clampCity, HALF, ROAD } from './world.js';
import { makeRng, pick, range, irange, clamp, dist } from './rng.js';
import { Sound } from './audio.js';

export const SAVE_KEY = 'solarbay-save-v2';
const CAR_COLORS = ['#d94f3d', '#3d7ad9', '#e8c33d', '#7ad93d', '#d9d9d9', '#8a4fd9', '#3dd9c4', '#e87a3d'];
const PED_COLORS = ['#e8e8e8', '#5a8ad9', '#d95a7a', '#7ad95a', '#e8a33d', '#9a5ad9', '#3d3d3d', '#d9d9d9'];

const MISSIONS = [
  { id: 0, name: 'First Wheels', giver: 'Mara', pay: 300,
    brief: "Mara needs wheels. Steal any car (E) and bring it to the Old Depot.",
    steps: ['Go to Mara\'s Garage', 'Steal a car — press E near one', 'Drive the car to the Old Depot'] },
  { id: 1, name: 'Sunset Run', giver: 'Mara', pay: 500,
    brief: 'Sunset courier run: hit all 3 checkpoints before the timer ends. A car helps a lot.',
    steps: ['Reach checkpoint 1', 'Reach checkpoint 2', 'Reach checkpoint 3'] },
  { id: 2, name: 'Heat Wave', giver: 'Vex threat', pay: 400,
    brief: 'The Vex crew is shaking down the Depot. Drive them off, then get to the Bay Clinic.',
    steps: ['Defeat the Vex crew at the Old Depot (0/4)', 'Reach the Bay Clinic'] },
];

export class Game {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.W = canvas.width; this.H = canvas.height;
    this.world = buildWorld(20261117);
    this.rng = makeRng(777);
    this.sound = new Sound();
    this.time = 0; this.dayT = 0.32; // 0..1 fraction of day, start late morning
    this.screen = 'title';
    this.msg = ''; this.msgT = 0;
    this.keys = {}; this.mouse = { x: 0, y: 0, down: false };
    this.cam = { x: 0, y: 0 };
    this.bullets = []; this.particles = []; this.floaters = [];
    this.shake = 0;
    this.loadSave();
    this.resetRun();
    this.bindInput();
  }

  loadSave() {
    this.save = { cash: 0, mission: 0, best: 0, done: [] };
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s) this.save = { ...this.save, ...s };
    } catch (e) {}
  }
  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {}
  }

  resetRun() {
    const L = this.world.landmarks;
    this.player = { x: L.garage.x + 40, y: L.garage.y + 120, angle: -Math.PI / 2, speed: 0, health: 100, car: null, onFoot: true, punchT: 0, shootT: 0 };
    this.cash = this.save.cash;
    this.wanted = 0; this.wantedHeat = 0; this.bustedT = 0;
    this.missionIdx = this.save.mission;
    this.missionStep = 0; this.missionTimer = 0; this.checkpoints = [];
    this.kills = 0; this.stolen = 0; this.driven = 0;
    this.cars = []; this.peds = []; this.cops = []; this.vex = []; this.policeCars = [];
    this.spawnTraffic(); this.spawnPeds();
    this.setMission(0, true);
  }

  spawnTraffic() {
    for (let i = 0; i < 14; i++) {
      const [x, y] = nearestRoadPoint(this.world, range(this.rng, -900, 900), range(this.rng, -900, 900));
      const onVert = Math.abs(x - Math.round(x)) >= 0 && this.world.roadsV.some(c => Math.abs(c - x) < 1);
      this.cars.push({ x: x + (onVert ? range(this.rng, -8, 8) : range(this.rng, -30, 30)), y: y + (onVert ? range(this.rng, -30, 30) : range(this.rng, -8, 8)),
        angle: onVert ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI), speed: range(this.rng, 40, 90),
        color: pick(this.rng, CAR_COLORS), parked: this.rng() < 0.25, w: 46, h: 22 });
    }
  }
  spawnPeds() {
    for (let i = 0; i < 26; i++) {
      const x = range(this.rng, -1000, 1000), y = range(this.rng, -1000, 1000);
      this.peds.push({ x, y, angle: range(this.rng, 0, Math.PI * 2), speed: range(this.rng, 22, 42),
        color: pick(this.rng, PED_COLORS), pause: 0 });
    }
  }

  setMission(step, silent) {
    const m = MISSIONS[this.missionIdx];
    if (!m) { this.mission = null; return; }
    this.mission = m; this.missionStep = step;
    this.missionTimer = m.id === 1 ? 95 : 0;
    this.vex = [];
    if (m.id === 1) {
      const L = this.world.landmarks;
      this.checkpoints = [
        { x: -800, y: -800, done: false }, { x: 850, y: 700, done: false }, { x: L.pier.x - 60, y: L.pier.y, done: false },
      ];
    } else this.checkpoints = [];
    if (m.id === 2 && step === 0) {
      const L = this.world.landmarks;
      const offs = [[-140, 40], [140, -30], [-60, 130], [80, -130]];
      for (const [dx, dy] of offs) this.vex.push({ x: L.depot.x + dx, y: L.depot.y + dy, hp: 3, angle: 0, shootT: range(this.rng, 1, 3), alive: true });
      this.wanted = Math.max(this.wanted, 2);
    }
    if (!silent) this.say(m.name + ' — ' + m.brief);
  }

  say(text, dur = 4) { this.msg = text; this.msgT = dur; }
  addCash(n, x, y) {
    this.cash += n; this.save.best = Math.max(this.save.best, this.cash);
    this.floaters.push({ x: x ?? this.player.x, y: (y ?? this.player.y) - 30, text: '+$' + n, t: 1.4, color: '#7dff8a' });
    this.sound.cash();
  }
  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.wantedHeat = 6;
    if (n > 0) this.say('Wanted level ' + this.wanted + ' — lose the heat!');
  }

  nearestCar(maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) { const d = dist(this.player.x, this.player.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    for (const c of this.policeCars) { const d = dist(this.player.x, this.player.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  stealCar() {
    const car = this.nearestCar(70);
    if (!car) { this.say('No car close enough.'); return; }
    if (car.police) { this.say('Too hot — that is a police car.'); return; }
    this.cars = this.cars.filter(c => c !== car);
    this.player.car = car; this.player.onFoot = false; this.player.angle = car.angle;
    this.player.x = car.x; this.player.y = car.y;
    this.stolen++;
    this.addWanted(1);
    this.sound.click();
    this.say('Car stolen! Wanted +1. Drive it to the marker.');
  }
  exitCar() {
    if (!this.player.car) return;
    const car = this.player.car;
    car.x = this.player.x + Math.cos(this.player.angle + Math.PI / 2) * 30;
    car.y = this.player.y + Math.sin(this.player.angle + Math.PI / 2) * 30;
    car.angle = this.player.angle; car.parked = true;
    this.cars.push(car);
    this.player.car = null; this.player.onFoot = true;
    this.player.x += Math.cos(this.player.angle + Math.PI / 2) * 34;
    this.player.y += Math.sin(this.player.angle + Math.PI / 2) * 34;
  }

  shoot() {
    if (this.player.shootT > 0) return;
    this.player.shootT = 0.28;
    const wx = this.cam.x + this.mouse.x, wy = this.cam.y + this.mouse.y;
    const a = Math.atan2(wy - this.player.y, wx - this.player.x);
    this.bullets.push({ x: this.player.x + Math.cos(a) * 18, y: this.player.y + Math.sin(a) * 18, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, t: 0.9, foe: false });
    this.sound.shot();
    this.shake = Math.max(this.shake, 2);
  }
  punch() {
    if (this.player.punchT > 0) return;
    this.player.punchT = 0.4;
    this.sound.punch();
    const px = this.player.x + Math.cos(this.player.angle) * 26, py = this.player.y + Math.sin(this.player.angle) * 26;
    for (const v of this.vex) if (v.alive && dist(px, py, v.x, v.y) < 34) this.hurtVex(v, 1);
    for (const c of this.cops) if (dist(px, py, c.x, c.y) < 34) { c.hp -= 1; if (c.hp <= 0) { c.down = true; this.addWanted(1); } }
  }
  hurtVex(v, dmg) {
    v.hp -= dmg;
    this.particles.push({ x: v.x, y: v.y, vx: range(this.rng, -60, 60), vy: range(this.rng, -60, 60), t: 0.4, color: '#ff5a5a' });
    if (v.hp <= 0 && v.alive) {
      v.alive = false; this.kills++;
      this.addCash(25, v.x, v.y);
      if (this.mission && this.mission.id === 2 && this.missionStep === 0) {
        const left = this.vex.filter(e => e.alive).length;
        this.missionStep = 4 - left; // reuse step counter as progress display
        if (left === 0) { this.missionStep = 1; this.say('Vex crew driven off! Get to the Bay Clinic.'); }
      }
    }
  }

  completeMission() {
    const m = this.mission;
    this.addCash(m.pay, this.player.x, this.player.y);
    this.save.done.push(m.id);
    this.save.mission = Math.min(this.missionIdx + 1, MISSIONS.length);
    this.save.cash = this.cash;
    this.persist();
    this.say(m.name + ' complete! +$' + m.pay, 5);
    this.missionIdx++;
    if (this.missionIdx >= MISSIONS.length) {
      this.mission = null;
      this.say('All missions done — Solar Bay is yours. Free roam!', 6);
    } else this.setMission(0);
  }

  busted() {
    const fine = Math.floor(this.cash * 0.15);
    this.cash -= fine; this.save.cash = this.cash; this.persist();
    this.wanted = 0; this.policeCars = []; this.cops = [];
    const L = this.world.landmarks;
    this.player.x = L.clinic.x; this.player.y = L.clinic.y + 80;
    if (this.player.car) { this.player.car = null; this.player.onFoot = true; }
    this.player.health = 100;
    this.sound.busted();
    this.screen = 'busted'; this.bustedT = 2.2;
    this.say('BUSTED! Fine $' + fine + '. Released at the Bay Clinic.');
  }
  flatline() {
    const lost = Math.floor(this.cash * 0.2);
    this.cash -= lost; this.save.cash = this.cash; this.persist();
    this.wanted = Math.max(0, this.wanted - 1);
    const L = this.world.landmarks;
    this.player.x = L.clinic.x; this.player.y = L.clinic.y + 80;
    if (this.player.car) { this.player.car = null; this.player.onFoot = true; }
    this.player.health = 100;
    this.screen = 'dead'; this.bustedT = 2.2;
    this.say('FLATLINED! Lost $' + lost + '. Woke up at the Bay Clinic.');
  }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      this.sound.ensure();
      if (e.key === 'Enter' && this.screen === 'title') { this.screen = 'play'; this.sound.click(); }
      if (e.key.toLowerCase() === 'p' && (this.screen === 'play' || this.screen === 'paused')) this.screen = this.screen === 'play' ? 'paused' : 'play';
      if (e.key.toLowerCase() === 'r' && this.screen !== 'title') { this.resetRun(); this.screen = 'play'; }
      if (e.key.toLowerCase() === 'e' && this.screen === 'play') { if (this.player.onFoot) this.stealCar(); else this.exitCar(); }
      if ((e.key === ' ' || e.key.toLowerCase() === 'f') && this.screen === 'play' && this.player.onFoot) this.punch();
      if (e.key.toLowerCase() === 'm' && this.mission) this.say(this.mission.name + ' — ' + this.mission.brief, 5);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.cv.addEventListener('mousemove', (e) => {
      const r = this.cv.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.W / r.width);
      this.mouse.y = (e.clientY - r.top) * (this.H / r.height);
    });
    this.cv.addEventListener('mousedown', (e) => {
      this.sound.ensure();
      if (this.screen === 'title') { this.screen = 'play'; return; }
      if (this.screen === 'play' && this.player.onFoot) this.shoot();
    });
    this.cv.addEventListener('click', () => this.sound.ensure());
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    this.dayT = (this.dayT + dt / 240) % 1; // full day ~4 min
    if (this.msgT > 0) this.msgT -= dt;
    this.sound.pad(dt);
    if (this.screen === 'busted' || this.screen === 'dead') {
      this.bustedT -= dt; if (this.bustedT <= 0) this.screen = 'play';
      return;
    }
    if (this.screen !== 'play') return;
    const p = this.player;
    if (p.shootT > 0) p.shootT -= dt;
    if (p.punchT > 0) p.punchT -= dt;
    const k = this.keys;
    const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const strafe = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    if (p.onFoot) {
      const sp = 190;
      let mx = 0, my = 0;
      if (fwd) { my -= fwd; } if (strafe) { mx += strafe; }
      if (mx || my) {
        const len = Math.hypot(mx, my); mx /= len; my /= len;
        p.angle = Math.atan2(my, mx);
        p.x += mx * sp * dt; p.y += my * sp * dt;
      }
      [p.x, p.y] = collideBuildings(this.world, p.x, p.y, 14);
      [p.x, p.y] = clampCity(p.x, p.y);
      if (inWater(this.world, p.x, p.y)) { p.x -= mx * sp * dt * 2; p.y -= my * sp * dt * 2; }
    } else {
      // Driving: W/S throttle, A/D steer (steering flips in reverse).
      const car = p.car;
      const accel = fwd * 420;
      const drag = car.speed * 1.1;
      car.speed = clamp(car.speed + (accel - drag * Math.sign(car.speed)) * dt, -160, 340);
      if (Math.abs(car.speed) < 4 && !fwd) car.speed = 0;
      const steer = strafe * (car.speed >= 0 ? 1 : -1) * 2.1 * Math.min(1, Math.abs(car.speed) / 120);
      car.angle += steer * dt * Math.sign(car.speed || 1) * (Math.abs(car.speed) > 1 ? 1 : 0);
      p.angle = car.angle;
      const nx = p.x + Math.cos(car.angle) * car.speed * dt;
      const ny = p.y + Math.sin(car.angle) * car.speed * dt;
      const [cx, cy] = collideBuildings(this.world, nx, ny, 18);
      if (cx !== nx || cy !== ny) { car.speed = Math.abs(car.speed) > 40 ? -car.speed * 0.2 : 0; this.shake = Math.max(this.shake, 3); }
      p.x = cx; p.y = cy; car.x = cx; car.y = cy;
      [p.x, p.y] = clampCity(p.x, p.y);
      this.driven += Math.abs(car.speed) * dt / 100;
      if (!onRoad(this.world, p.x, p.y) && Math.abs(car.speed) > 60) car.speed *= (1 - 0.6 * dt);
      if (inWater(this.world, p.x, p.y)) { car.speed = -60; }
    }
    this.sound.setEngine(p.onFoot ? 0 : Math.abs(p.car.speed) / 340, !p.onFoot);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updatePolice(dt);
    this.updateVex(dt);
    this.updateBullets(dt);
    this.updateMission(dt);
    // Wanted decay
    if (this.wantedHeat > 0) this.wantedHeat -= dt;
    else if (this.wanted > 0 && this.policeCars.length === 0 && this.cops.length === 0) {
      this.wanted = Math.max(0, this.wanted - dt * 0.05);
      if (this.wanted < 0.5) this.wanted = 0;
    }
    // Particles / floaters
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.t -= dt; }
    this.particles = this.particles.filter(pt => pt.t > 0);
    for (const f of this.floaters) { f.y -= 30 * dt; f.t -= dt; }
    this.floaters = this.floaters.filter(f => f.t > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 12);
    // Camera
    this.cam.x = p.x - this.W / 2 + (this.shake ? range(this.rng, -this.shake, this.shake) : 0);
    this.cam.y = p.y - this.H / 2 + (this.shake ? range(this.rng, -this.shake, this.shake) : 0);
  }

  updateTraffic(dt) {
    for (const c of this.cars) {
      if (c.parked || c === this.player.car) continue;
      // Road following: stay on the road axis the car is on, keep its direction.
      const norm = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
      const vc = this.world.roadsV.find(r => Math.abs(c.x - r) < ROAD / 2);
      const hc = this.world.roadsH.find(r => Math.abs(c.y - r) < ROAD / 2);
      let targetA = c.angle;
      if (vc !== undefined && hc === undefined) {
        targetA = Math.abs(norm(c.angle - Math.PI / 2)) < Math.abs(norm(c.angle + Math.PI / 2)) ? Math.PI / 2 : -Math.PI / 2;
        c.x += (vc - c.x) * Math.min(1, dt * 1.5); // drift back to centreline
      } else if (hc !== undefined && vc === undefined) {
        targetA = Math.abs(norm(c.angle)) < Math.abs(norm(c.angle - Math.PI)) ? 0 : Math.PI;
        c.y += (hc - c.y) * Math.min(1, dt * 1.5);
      } else {
        // Off-road (e.g. mid-turn at an intersection): steer back to the nearest road point.
        const [rx, ry] = nearestRoadPoint(this.world, c.x, c.y);
        targetA = Math.atan2(ry - c.y, rx - c.x);
      }
      const da = norm(targetA - c.angle);
      c.angle += clamp(da, -3.0 * dt, 3.0 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      [c.x, c.y] = collideBuildings(this.world, c.x, c.y, 18);
      if (Math.abs(c.x) > HALF + 60 || Math.abs(c.y) > HALF + 60) { c.x = range(this.rng, -900, 900); c.y = range(this.rng, -900, 900); }
      // Avoid the player car
      const d = dist(c.x, c.y, this.player.x, this.player.y);
      if (d < 60 && this.player.car) { c.speed = Math.max(0, c.speed - 200 * dt); } else c.speed = Math.min(c.speed + 20 * dt, 90);
    }
  }
  updatePeds(dt) {
    for (const pd of this.peds) {
      if (pd.pause > 0) { pd.pause -= dt; continue; }
      pd.x += Math.cos(pd.angle) * pd.speed * dt;
      pd.y += Math.sin(pd.angle) * pd.speed * dt;
      if (this.rng() < dt * 0.15) pd.angle = range(this.rng, 0, Math.PI * 2);
      if (this.rng() < dt * 0.05) pd.pause = range(this.rng, 1, 3);
      [pd.x, pd.y] = collideBuildings(this.world, pd.x, pd.y, 10);
      if (Math.abs(pd.x) > HALF + 40 || Math.abs(pd.y) > HALF + 40) pd.angle += Math.PI;
      // Flee from gunfire / speeding car
      const d = dist(pd.x, pd.y, this.player.x, this.player.y);
      if (d < 90 && (this.bullets.length || (this.player.car && Math.abs(this.player.car.speed) > 150))) {
        pd.angle = Math.atan2(pd.y - this.player.y, pd.x - this.player.x);
        pd.x += Math.cos(pd.angle) * 60 * dt; pd.y += Math.sin(pd.angle) * 60 * dt;
      }
    }
  }
  updatePolice(dt) {
    const want = Math.floor(this.wanted);
    const wantCars = want >= 3 ? 2 : want >= 1 ? 1 : 0;
    while (this.policeCars.length < wantCars) {
      const a = range(this.rng, 0, Math.PI * 2);
      this.policeCars.push({ x: this.player.x + Math.cos(a) * 420, y: this.player.y + Math.sin(a) * 420, angle: a, speed: 0, color: '#20242c', police: true, w: 46, h: 22, siren: true });
    }
    while (this.policeCars.length > wantCars) this.policeCars.pop();
    this.sound.setSiren(this.policeCars.length > 0);
    for (const pc of this.policeCars) {
      const a = Math.atan2(this.player.y - pc.y, this.player.x - pc.x);
      let da = a - pc.angle; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      pc.angle += clamp(da, -2.4 * dt, 2.4 * dt);
      pc.speed = clamp(pc.speed + 260 * dt, 0, 300);
      pc.x += Math.cos(pc.angle) * pc.speed * dt;
      pc.y += Math.sin(pc.angle) * pc.speed * dt;
      [pc.x, pc.y] = collideBuildings(this.world, pc.x, pc.y, 18);
      const d = dist(pc.x, pc.y, this.player.x, this.player.y);
      if (d < 34) {
        if (this.player.onFoot) { this.bustedT += dt * 0.9; if (this.bustedT > 1.1) { this.bustedT = 0; this.busted(); } }
        else { pc.speed = 0; this.player.car.speed *= 0.5; this.bustedT += dt * 0.5; if (this.bustedT > 2.5) { this.bustedT = 0; this.busted(); } }
      } else this.bustedT = Math.max(0, this.bustedT - dt);
    }
    // Foot cops at wanted 2+
    const wantCops = want >= 2 ? Math.min(3, want - 1) : 0;
    while (this.cops.length < wantCops) {
      const a = range(this.rng, 0, Math.PI * 2);
      this.cops.push({ x: this.player.x + Math.cos(a) * 300, y: this.player.y + Math.sin(a) * 300, hp: 2, down: false, speed: 120 });
    }
    while (this.cops.length > wantCops) this.cops.pop();
    for (const c of this.cops) {
      if (c.down) continue;
      const a = Math.atan2(this.player.y - c.y, this.player.x - c.x);
      c.x += Math.cos(a) * c.speed * dt; c.y += Math.sin(a) * c.speed * dt;
      [c.x, c.y] = collideBuildings(this.world, c.x, c.y, 10);
      if (dist(c.x, c.y, this.player.x, this.player.y) < 22 && this.player.onFoot) {
        this.player.health -= 18 * dt;
        if (this.player.health <= 0) this.flatline();
      }
    }
  }
  updateVex(dt) {
    for (const v of this.vex) {
      if (!v.alive) continue;
      const d = dist(v.x, v.y, this.player.x, this.player.y);
      if (d < 420) {
        v.angle = Math.atan2(this.player.y - v.y, this.player.x - v.x);
        if (d > 130) { v.x += Math.cos(v.angle) * 70 * dt; v.y += Math.sin(v.angle) * 70 * dt; }
        v.shootT -= dt;
        if (v.shootT <= 0 && d < 380) {
          v.shootT = range(this.rng, 1.2, 2.2);
          this.bullets.push({ x: v.x, y: v.y, vx: Math.cos(v.angle) * 420, vy: Math.sin(v.angle) * 420, t: 1.1, foe: true });
          this.sound.noise(0.08, 0.15, 700);
        }
      }
    }
  }
  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
      // Hit buildings
      for (const bd of this.world.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { b.t = 0; break; }
      }
      if (b.t <= 0) continue;
      if (!b.foe) {
        for (const v of this.vex) if (v.alive && dist(b.x, b.y, v.x, v.y) < 16) { this.hurtVex(v, 1); b.t = 0; break; }
        if (b.t <= 0) continue;
        for (const c of this.cops) if (!c.down && dist(b.x, b.y, c.x, c.y) < 14) { c.hp -= 1; if (c.hp <= 0) { c.down = true; this.addWanted(1); } b.t = 0; break; }
        if (b.t <= 0) continue;
        for (const pd of this.peds) if (dist(b.x, b.y, pd.x, pd.y) < 13) { this.addWanted(1); pd.pause = 2; pd.angle = Math.atan2(pd.y - this.player.y, pd.x - this.player.x); b.t = 0; break; }
      } else {
        if (dist(b.x, b.y, this.player.x, this.player.y) < 15) {
          this.player.health -= 9; b.t = 0;
          this.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, t: 0.3, color: '#ff5a5a' });
          if (this.player.health <= 0) this.flatline();
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.t > 0);
  }
  updateMission(dt) {
    if (!this.mission) return;
    const L = this.world.landmarks; const p = this.player;
    const near = (x, y, r) => dist(p.x, p.y, x, y) < r;
    if (this.mission.id === 0) {
      if (this.missionStep === 0 && near(L.garage.x, L.garage.y, 130)) this.missionStep = 1;
      else if (this.missionStep === 1 && !p.onFoot) this.missionStep = 2;
      else if (this.missionStep === 2 && !p.onFoot && near(L.depot.x, L.depot.y, 120)) this.completeMission();
    } else if (this.mission.id === 1) {
      this.missionTimer -= dt;
      for (const cp of this.checkpoints) if (!cp.done && near(cp.x, cp.y, 90)) { cp.done = true; this.addCash(50, cp.x, cp.y); this.say('Checkpoint! $50'); }
      if (this.checkpoints.every(c => c.done)) this.completeMission();
      else if (this.missionTimer <= 0) { this.say('Sunset Run failed — timer ran out. Try again (M).'); this.setMission(0); }
    } else if (this.mission.id === 2) {
      if (this.missionStep === 1 && near(L.clinic.x, L.clinic.y, 120)) this.completeMission();
    }
  }

  missionTarget() {
    if (!this.mission) return null;
    const L = this.world.landmarks;
    if (this.mission.id === 0) return [this.missionStep === 0 ? L.garage : this.missionStep === 1 ? null : L.depot];
    if (this.mission.id === 1) { const cp = this.checkpoints.find(c => !c.done); return cp ? [cp] : null; }
    if (this.mission.id === 2) return [this.missionStep === 0 ? L.depot : L.clinic];
    return null;
  }

  // ---------- render ----------
  hourOfDay() { return this.dayT * 24; }
  darkness() {
    const h = this.hourOfDay();
    if (h >= 6 && h < 18) return 0;
    if (h >= 18 && h < 20) return (h - 18) / 2 * 0.45;
    if (h >= 20 || h < 5) return 0.45;
    return (6 - h) / 1 * 0.45 * 0.5;
  }
  render() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.screen === 'title') { this.renderTitle(); ctx.restore(); return; }
    const camX = this.cam.x, camY = this.cam.y;
    ctx.translate(-camX, -camY);
    this.drawWorld(ctx);
    this.drawEntities(ctx);
    ctx.restore();
    // Night overlay + headlights
    const dark = this.darkness();
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(8,10,40,${dark})`;
      ctx.fillRect(0, 0, W, H);
      if (!this.player.onFoot) {
        const sx = this.player.x - camX, sy = this.player.y - camY;
        const g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
        g.addColorStop(0, 'rgba(255,240,180,0.20)'); g.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = g; ctx.fillRect(sx - 260, sy - 260, 520, 520);
      }
    }
    this.drawHUD(ctx);
    if (this.screen === 'paused') this.overlay(ctx, 'PAUSED', 'Press P to resume · R to restart');
    if (this.screen === 'busted') this.overlay(ctx, 'BUSTED', this.msg);
    if (this.screen === 'dead') this.overlay(ctx, 'FLATLINED', this.msg);
  }

  drawWorld(ctx) {
    const w = this.world;
    const vx0 = this.cam.x - 80, vy0 = this.cam.y - 80, vx1 = this.cam.x + this.W + 80, vy1 = this.cam.y + this.H + 80;
    // Ground: grass base
    ctx.fillStyle = '#5d8a4a'; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // Beach + water
    ctx.fillStyle = '#e8d28a'; ctx.fillRect(w.beach.x0, w.beach.y0, w.beach.x1 - w.beach.x0, w.beach.y1 - w.beach.y0);
    ctx.fillStyle = '#2a6a9a'; ctx.fillRect(w.marina.x0, w.marina.y0, w.marina.x1 - w.marina.x0, w.marina.y1 - w.marina.y0);
    ctx.fillStyle = '#3d8ab5';
    for (let y = -1000; y < 1000; y += 120) ctx.fillRect(w.marina.x0 + 20, y, 180, 4);
    // Pier planks
    ctx.fillStyle = '#8a6a4a'; ctx.fillRect(w.beach.x0 + 40, w.landmarks.pier.y - 14, 300, 28);
    ctx.fillStyle = '#6a4a2a';
    for (let x = w.beach.x0 + 50; x < w.beach.x0 + 330; x += 24) ctx.fillRect(x, w.landmarks.pier.y - 14, 3, 28);
    // Parks
    for (const pk of w.parks) {
      ctx.fillStyle = '#4a7a3a'; ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
      ctx.fillStyle = '#6aa84a';
      for (const t of pk.trees) { ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2a4a1a';
      for (const t of pk.trees) { ctx.beginPath(); ctx.arc(t.x - 3, t.y + 3, t.r * 0.45, 0, Math.PI * 2); ctx.fill(); }
    }
    // Roads
    ctx.fillStyle = '#33363d';
    for (const c of w.roadsV) ctx.fillRect(c - ROAD / 2, -HALF - 40, ROAD, HALF * 2 + 80);
    for (const c of w.roadsH) ctx.fillRect(-HALF - 40, c - ROAD / 2, HALF * 2 + 80, ROAD);
    // Lane dashes
    ctx.fillStyle = '#e8d44a';
    for (const c of w.roadsV) for (let y = -HALF; y < HALF; y += 56) ctx.fillRect(c - 2, y, 4, 26);
    for (const c of w.roadsH) for (let x = -HALF; x < HALF; x += 56) ctx.fillRect(x, c - 2, 26, 4);
    // Sidewalks
    ctx.strokeStyle = '#9a9a8a'; ctx.lineWidth = 6;
    for (const c of w.roadsV) { ctx.beginPath(); ctx.moveTo(c - ROAD / 2 - 3, -HALF); ctx.lineTo(c - ROAD / 2 - 3, HALF); ctx.moveTo(c + ROAD / 2 + 3, -HALF); ctx.lineTo(c + ROAD / 2 + 3, HALF); ctx.stroke(); }
    // Buildings
    for (const b of w.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(b.x, b.y, b.w, 8);
      ctx.fillStyle = '#2a2a33';
      const cols = Math.max(1, Math.floor(b.w / 34)), rows = Math.max(1, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(b.x + 8 + i * 32, b.y + 10 + j * 32, 16, 18);
      }
      if (b.roof) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10); }
    }
    // Landmark labels
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    for (const key of Object.keys(w.landmarks)) {
      const L = w.landmarks[key];
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = ctx.measureText(L.name).width + 16;
      ctx.fillRect(L.x - tw / 2, L.y - 92, tw, 22);
      ctx.fillStyle = '#ffd94a'; ctx.fillText(L.name, L.x, L.y - 76);
    }
    // Mission marker
    const tgt = this.missionTarget();
    if (tgt && tgt[0]) {
      const t = tgt[0];
      const bob = Math.sin(this.time * 3) * 6;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.moveTo(t.x, t.y - 58 + bob); ctx.lineTo(t.x - 12, t.y - 84 + bob); ctx.lineTo(t.x + 12, t.y - 84 + bob); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,74,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, 46 + Math.sin(this.time * 2) * 6, 0, Math.PI * 2); ctx.stroke();
    }
    for (const cp of this.checkpoints) if (!cp.done) {
      ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.arc(cp.x, cp.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#123'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('★', cp.x, cp.y + 6);
    }
  }

  drawCar(ctx, c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-22, -10, 46, 24);
    ctx.fillStyle = c.color; ctx.fillRect(-23, -11, 46, 22);
    ctx.fillStyle = '#1c2733'; ctx.fillRect(-6, -9, 14, 18);
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(18, -9, 3, 18);
    if (c.police) {
      ctx.fillStyle = '#fff'; ctx.fillRect(-23, -11, 46, 6); ctx.fillRect(-23, 5, 46, 6);
      ctx.fillStyle = Math.floor(this.time * 6) % 2 ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-4, -13, 8, 4); ctx.fillRect(-4, 9, 8, 4);
      ctx.fillStyle = '#111'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, 3);
    }
    ctx.restore();
  }
  drawPerson(ctx, x, y, angle, color, label) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(Math.cos(angle) * 4, Math.sin(angle) * 4, 5, 0, Math.PI * 2); ctx.fill();
    if (label) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, 0, -16); }
    ctx.restore();
  }
  drawEntities(ctx) {
    for (const c of this.cars) this.drawCar(ctx, c);
    for (const pc of this.policeCars) this.drawCar(ctx, pc);
    for (const pd of this.peds) this.drawPerson(ctx, pd.x, pd.y, pd.angle, pd.color);
    for (const c of this.cops) if (!c.down) this.drawPerson(ctx, c.x, c.y, Math.atan2(this.player.y - c.y, this.player.x - c.x), '#20242c', 'POLICE');
    for (const v of this.vex) if (v.alive) this.drawPerson(ctx, v.x, v.y, v.angle, '#c22a2a', 'VEX');
    // Player car or on-foot player
    const p = this.player;
    if (!p.onFoot && p.car) this.drawCar(ctx, p.car);
    else {
      this.drawPerson(ctx, p.x, p.y, p.angle, '#ffd94a', 'YOU');
      if (p.punchT > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, p.angle - 0.6, p.angle + 0.6); ctx.stroke();
      }
    }
    // Bullets
    ctx.fillStyle = '#ffe14a';
    for (const b of this.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }
    // Particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.t / 0.4);
      ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Floaters
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.t / 1.4);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  drawHUD(ctx) {
    const p = this.player;
    ctx.textAlign = 'left';
    // Top-left: cash + health
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(12, 12, 230, 64);
    ctx.fillStyle = '#7dff8a'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText('$' + this.cash.toLocaleString(), 24, 38);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(24, 48, 120, 10);
    ctx.fillStyle = '#7dff8a'; ctx.fillRect(24, 48, 120 * Math.max(0, p.health) / 100, 10);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText('HP ' + Math.ceil(Math.max(0, p.health)), 150, 58);
    // Top-right: wanted stars
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(this.W - 212, 12, 200, 44);
    ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < Math.floor(this.wanted) ? '#ffd94a' : '#555';
      ctx.fillText('★', this.W - 24 - i * 32, 44);
    }
    ctx.textAlign = 'left';
    // Top-centre: mission + clock
    const h = Math.floor(this.hourOfDay()), mm = Math.floor((this.hourOfDay() % 1) * 60);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const mtext = this.mission ? this.mission.name + ' — ' + this.mission.steps[Math.min(this.missionStep, this.mission.steps.length - 1)] : 'Free roam — Solar Bay is yours';
    ctx.font = 'bold 15px sans-serif';
    const mw = ctx.measureText(mtext).width + 24;
    ctx.fillRect(this.W / 2 - mw / 2, 12, mw, 30);
    ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'center';
    ctx.fillText(mtext, this.W / 2, 32);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText(String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (this.missionTimer > 0 ? '   ⏱ ' + Math.ceil(this.missionTimer) + 's' : ''), this.W / 2, 58);
    ctx.textAlign = 'left';
    // Bottom-left: speed / state
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(12, this.H - 52, 210, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(p.onFoot ? 'On foot — E: steal car' : 'Driving  ' + Math.round(Math.abs(p.car.speed) * 0.9) + ' km/h', 22, this.H - 26);
    // Message bar
    if (this.msgT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const tw = ctx.measureText(this.msg).width + 28;
      ctx.fillRect(this.W / 2 - tw / 2, this.H - 96, tw, 30);
      ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.msg, this.W / 2, this.H - 76);
      ctx.textAlign = 'left';
    }
    this.drawMinimap(ctx);
  }

  drawMinimap(ctx) {
    const size = 168, mx = this.W - size - 14, my = this.H - size - 14;
    const scale = size / (HALF * 2 + 560);
    const ox = mx + size / 2, oy = my + size / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
    ctx.fillStyle = '#3a5a2a'; ctx.fillRect(mx, my, size, size);
    ctx.fillStyle = '#2a6a9a'; ctx.fillRect(mx + (this.world.marina.x0 + HALF) * scale, my, size, size);
    ctx.fillStyle = '#e8d28a'; ctx.fillRect(mx + (this.world.beach.x0 + HALF) * scale, my, (this.world.beach.x1 - this.world.beach.x0) * scale, size);
    ctx.fillStyle = '#444';
    for (const c of this.world.roadsV) ctx.fillRect(mx + (c + HALF) * scale - 1, my, 2, size);
    for (const c of this.world.roadsH) ctx.fillRect(mx, my + (c + HALF) * scale - 1, size, 2);
    ctx.fillStyle = '#888';
    for (const b of this.world.buildings) ctx.fillRect(mx + (b.x + HALF) * scale, my + (b.y + HALF) * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    const tgt = this.missionTarget();
    if (tgt && tgt[0]) {
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.arc(mx + (tgt[0].x + HALF) * scale, my + (tgt[0].y + HALF) * scale, 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const pc of this.policeCars) {
      ctx.fillStyle = '#4a90ff'; ctx.beginPath(); ctx.arc(mx + (pc.x + HALF) * scale, my + (pc.y + HALF) * scale, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mx + (this.player.x + HALF) * scale, my + (this.player.y + HALF) * scale, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.strokeRect(mx - 4, my - 4, size + 8, size + 8);
  }

  overlay(ctx, title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, this.W / 2, this.H / 2 - 10);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
    ctx.fillText(sub, this.W / 2, this.H / 2 + 32);
    ctx.textAlign = 'left';
  }

  renderTitle() {
    const ctx = this.ctx;
    // Sunset gradient sky over a stylised skyline
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#2a1a5a'); g.addColorStop(0.55, '#c94a6a'); g.addColorStop(1, '#ff9a3d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(1020, 180, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1030';
    const skyline = [120, 220, 160, 300, 200, 260, 340, 180, 240, 300, 150];
    let x = 0;
    for (const h of skyline) { ctx.fillRect(x, this.H - 180 - h, 120, h + 180); x += 118; }
    ctx.fillStyle = '#ffd94a';
    for (let i = 0; i < 40; i++) { const wx = (i * 137) % this.W, wy = 300 + (i * 61) % 260; ctx.fillRect(wx, wy, 8, 10); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SOLAR BAY', this.W / 2, 190);
    ctx.fillStyle = '#ffd94a'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText('an open-world crime story', this.W / 2, 232);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.fillText('Steal cars. Outrun the law. Run Mara\'s jobs across a sun-soaked bay city.', this.W / 2, 300);
    ctx.fillText('3 story missions · wanted levels · traffic & pedestrians · day/night · save', this.W / 2, 330);
    ctx.fillStyle = '#ffd94a'; ctx.fillRect(this.W / 2 - 130, 380, 260, 56);
    ctx.fillStyle = '#1c1030'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('▶  START  (Enter)', this.W / 2, 416);
    ctx.fillStyle = '#ddd'; ctx.font = '16px sans-serif';
    ctx.fillText('WASD move / drive · E steal car · Space/F punch · Click shoot · P pause', this.W / 2, 480);
    if (this.save.cash > 0 || this.save.mission > 0) {
      ctx.fillStyle = '#7dff8a'; ctx.font = '16px sans-serif';
      ctx.fillText('Save found: $' + this.save.cash.toLocaleString() + ' · mission ' + (this.save.mission + 1) + ' of 3 · best $' + this.save.best.toLocaleString(), this.W / 2, 520);
    }
    ctx.fillStyle = '#aaa'; ctx.font = '13px sans-serif';
    ctx.fillText('Original game — no Rockstar / GTA assets, names or art. Built for make.fun gta6-01.', this.W / 2, 690);
    ctx.textAlign = 'left';
  }

  // ---------- deterministic screenshot scenes (?shot=) ----------
  setupShot(name) {
    this.screen = 'play';
    const L = this.world.landmarks;
    if (name === 'start') { this.screen = 'title'; return; }
    if (name === 'chase') {
      this.dayT = 0.42;
      const car = this.cars[0];
      this.player.car = car; this.player.onFoot = false; this.player.x = car.x = -152; this.player.y = car.y = -152; car.angle = 0; car.speed = 260;
      this.player.angle = 0;
      this.wanted = 3; this.wantedHeat = 8;
      this.policeCars = [
        { x: -420, y: -152, angle: 0, speed: 280, color: '#20242c', police: true, w: 46, h: 22, siren: true },
        { x: 220, y: -152, angle: Math.PI, speed: 260, color: '#20242c', police: true, w: 46, h: 22, siren: true },
      ];
      this.cops = [{ x: -152, y: 20, hp: 2, down: false, speed: 120 }];
      this.mission = MISSIONS[0]; this.missionIdx = 0; this.missionStep = 2;
      this.cam.x = this.player.x - this.W / 2; this.cam.y = this.player.y - this.H / 2;
    } else if (name === 'drive') {
      this.dayT = 0.30;
      const car = this.cars[1];
      this.player.car = car; this.player.onFoot = false; this.player.x = car.x = 152; this.player.y = car.y = 300; car.angle = -Math.PI / 2; car.speed = 200;
      this.player.angle = -Math.PI / 2;
      this.mission = MISSIONS[1]; this.missionIdx = 1; this.missionStep = 0; this.missionTimer = 82;
      this.checkpoints = [{ x: -800, y: -800, done: false }, { x: 850, y: 700, done: false }, { x: L.pier.x - 60, y: L.pier.y, done: false }];
      this.cam.x = this.player.x - this.W / 2; this.cam.y = this.player.y - this.H / 2;
    } else if (name === 'combat') {
      this.dayT = 0.88; // night
      this.player.x = L.depot.x - 120; this.player.y = L.depot.y + 60; this.player.angle = 0;
      this.wanted = 2; this.wantedHeat = 8;
      this.mission = MISSIONS[2]; this.missionIdx = 2; this.missionStep = 0;
      this.vex = [];
      for (const [dx, dy] of [[-140, 40], [140, -30], [-60, 130], [80, -130]]) this.vex.push({ x: L.depot.x + dx, y: L.depot.y + dy, hp: 3, angle: 0, shootT: 1, alive: true });
      this.bullets.push({ x: this.player.x + 40, y: this.player.y - 10, vx: 300, vy: -80, t: 0.5, foe: false });
      this.cam.x = this.player.x - this.W / 2; this.cam.y = this.player.y - this.H / 2;
    }
    this.update(0.016);
  }
}
