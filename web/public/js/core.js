// Googly-Planet Invasion — the whole game as one Room: the crew in the UFO (1 pilot + up to 3 gunners, real people only),
// the campaign (credits, upgrades, conquered planets), and one planet invasion at a time: paint blobs flying under the
// planet's gravity, the paint grid, turrets, fighters, scrubbers that wash paint off, shield domes, storms, the
// natives you can abduct, the Guardian boss, coins and the conquest. The same code runs inside the page for PLAY SOLO
// and on server.js for online crews.
import {
  rng, hash, planetByKey, system, shipStats, upgCost, UPG, ENEMY, PAY, gemsFor, cleanCampaign, planetOpen, systemOpen,
  GW, GH, CELL_W, CELL_WSUM, forCells, rle, unrle, SYSTEMS, GALAXIES,
} from './universe.js';

export const SLOTS = 4;
export const SHOT_SPEED = 190, GRAV = 55, ALT_MIN = 8, ALT_MAX = 85, SHIP_R = 3.8;
const SNAP_EVERY = 1 / 15;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
// ------------------------------------------------------------------ tiny vector helpers on [x, y, z]
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const tangent = (v, up) => sub(v, mul(up, dot(v, up)));
function randDir(r) { const z = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(t), z, s * Math.sin(t)]; }
/** A unit vector at angle ang from d, turned by bearing b. */
function around(d, ang, b) { const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const e1 = nrm(cross(d, up)), e2 = cross(d, e1); const s = Math.sin(ang), c = Math.cos(ang); return nrm(add(add(mul(d, c), e1, s * Math.cos(b)), e2, s * Math.sin(b))); }
/** Move a surface point d along tangent heading h by angle a; returns [d', h'] (parallel transported). */
function walk(d, h, a) { const nd = nrm(add(mul(d, Math.cos(a)), h, Math.sin(a))); const nh = nrm(tangent(sub(h, mul(d, Math.sin(a))), nd)); return [nd, nh]; }
const START_DIR = nrm([0.72, 0.42, 0.55]);

export function newPlayer({ id, ws = null, name = 'GOOGLY', color = '#7bd13b', skin = 'none' } = {}) {
  return { id, ws, name, color, skin, seat: -1, aim: [0, -1, 0], fire: false, fireT: 0, tank: 80, bombCd: 0, stats: { splats: 0, kills: 0, abducted: 0, earned: 0, cells: 0 } };
}

export class Room {
  constructor({ code = 'SOLO', pub = false, name = '', solo = false, out = () => { }, camp = null } = {}) {
    this.code = code; this.public = pub; this.name = name; this.solo = solo; this.out = out;
    this.players = new Map(); this.host = 0; this.pilot = 0;
    this.camp = cleanCampaign(camp);
    this.phase = 'hangar'; this.run = null; this.wonT = 0; this.snapT = 0; this.saveT = 0; this.nextId = 1;
    this.chat = [];
  }
  // ---------------------------------------------------------------- lobby plumbing
  humans() { return [...this.players.values()]; }
  canJoin() { return this.players.size < SLOTS; }
  listing() { const h = this.players.get(this.host); return { code: this.code, name: this.name || (h ? h.name + "'s UFO" : 'UFO'), n: this.players.size, max: SLOTS, phase: this.phase, where: this.run ? this.run.pl.name : planetByKey(this.camp.cur)?.name }; }
  send(p, m) { this.out(p, m); }
  bcast(m) { for (const p of this.players.values()) this.out(p, m); }
  pub(p) { return { id: p.id, name: p.name, color: p.color, skin: p.skin, seat: p.seat }; }
  pushRoom() { this.bcast({ t: 'room', players: this.humans().map(p => this.pub(p)), host: this.host, pilot: this.pilot, phase: this.phase, pub: this.public, code: this.code, solo: this.solo }); }
  campMsg() { const c = { ...this.camp, partial: Object.fromEntries(Object.entries(this.camp.partial).map(([k, v]) => [k, { pct: v.pct || 0 }])) }; return { t: 'camp', camp: c }; }
  pushCamp() { this.bcast(this.campMsg()); }
  join(p) {
    const used = new Set(this.humans().map(q => q.seat));
    p.seat = [0, 1, 2, 3].find(s => !used.has(s));
    this.players.set(p.id, p);
    if (!this.host) this.host = p.id;
    if (p.seat === 0 || !this.players.has(this.pilot)) { this.pilot = p.id; p.seat = 0; }
    this.send(p, { t: 'joined', code: this.code, id: p.id, host: this.host, solo: this.solo });
    this.send(p, this.campMsg());
    this.pushRoom();
    for (const m of this.chat.slice(-20)) this.send(p, m);
    if (this.run) { p.tank = this.stats().tank; this.send(p, this.planetMsg()); this.recolour(p); }
    if (!this.solo) this.sys(`${p.name} climbed into the UFO`);
  }
  leave(p) {
    this.players.delete(p.id);
    if (!this.players.size) return;
    if (this.host === p.id) { this.host = this.humans()[0].id; this.sys(`${this.players.get(this.host).name} is the captain now`); }
    if (this.pilot === p.id) { const n = this.humans().sort((a, b) => a.seat - b.seat)[0]; n.seat = 0; this.pilot = n.id; this.sys(`${n.name} took the wheel`); }
    this.sys(`${p.name} left the UFO`);
    this.pushRoom();
  }
  sys(text) { const m = { t: 'chat', from: '', text, sys: true }; this.chat.push(m); if (this.chat.length > 40) this.chat.shift(); this.bcast(m); }
  toast(text, k = '') { this.bcast({ t: 'toast', text, k }); }
  stats() { return shipStats(this.camp.upg); }

  // ---------------------------------------------------------------- messages
  handle(p, m) {
    const isHost = p.id === this.host, isPilot = p.id === this.pilot;
    switch (m.t) {
      case 'chat': { const text = String(m.text || '').replace(/[<>&"]/g, '').trim().slice(0, 140); if (!text) return; const c = { t: 'chat', from: p.name, color: p.color, text }; this.chat.push(c); if (this.chat.length > 40) this.chat.shift(); this.bcast(c); break; }
      case 'me': Object.assign(p, { name: m.name || p.name, color: m.color || p.color, skin: m.skin || p.skin }); this.pushRoom(); if (this.run) this.recolour(p); break;
      case 'pick': if (isHost && this.phase === 'hangar') { const pl = planetByKey(m.key); if (pl && planetOpen(this.camp, pl)) { this.camp.cur = pl.key; this.pushCamp(); } } break;
      case 'go': if (isHost && this.phase === 'hangar') this.startRun(this.camp.cur); break;
      case 'buy': if (isHost) this.buy(m.id); break;
      case 'hull': if (isHost && /^#[0-9a-f]{6}$/i.test(m.c)) { this.camp.hull = m.c; this.pushCamp(); } break;
      case 'pilot': if (isHost) { const q = this.players.get(m.id); if (q && q.id !== this.pilot) { const old = this.players.get(this.pilot); if (old) old.seat = q.seat; q.seat = 0; this.pilot = q.id; this.sys(`${q.name} took the wheel`); this.pushRoom(); } } break;
      case 'retreat': if ((isHost || isPilot) && this.phase === 'planet') this.endRun(false); break;
      case 'reset': if (isHost && this.solo && this.phase === 'hangar') { this.camp = cleanCampaign(null); this.pushCamp(); } break;
      case 'ship': if (isPilot && this.run && Array.isArray(m.p) && Array.isArray(m.f)) this.shipFrom(m); break;
      case 'aim': if (this.run && Array.isArray(m.d)) { p.aim = nrm(m.d.map(Number).map(v => isFinite(v) ? v : 0)); p.fire = !!m.f; } break;
      case 'bomb': if (this.run && Array.isArray(m.d)) this.bomb(p, nrm(m.d.map(Number))); break;
      case 'beam': if (isPilot && this.run) this.run.ship.beam = !!m.on; break;
      case 'nuke': if (this.run) this.nuke(p); break;
    }
  }
  buy(id) {
    const u = UPG[id]; if (!u || this.phase === 'planet' && !this.solo) return;
    const lv = this.camp.upg[id] || 0; if (lv >= u.max) return;
    const c = upgCost(id, lv); if (this.camp.credits < c) return;
    this.camp.credits -= c; this.camp.upg[id] = lv + 1;
    this.bcast({ t: 'bought', id, lv: lv + 1 });
    this.pushCamp();
    if (this.run) { const S = this.stats(); this.run.ship.hp = Math.min(S.hull, this.run.ship.hp + (id === 'hull' ? S.hull * 0.25 : 0)); }
  }
  shipFrom(m) {
    const s = this.run.ship, R = this.run.R;
    const p = m.p.map(Number), f = m.f.map(Number), v = (m.v || [0, 0, 0]).map(Number);
    if (![...p, ...f, ...v].every(isFinite)) return;
    const r = Math.max(R + ALT_MIN * 0.8, Math.min(R + ALT_MAX + 4, len(p)));
    s.p = mul(nrm(p), r); s.f = nrm(tangent(f, nrm(p))); s.v = len(v) > 200 ? mul(nrm(v), 200) : v;
  }
  recolour(p) { if (!this.run) return; this.run.colors[p.seat + 1] = p.color; this.bcast({ t: 'colors', c: this.run.colors }); }

  // ---------------------------------------------------------------- one invasion
  startRun(key) {
    const pl = planetByKey(key); if (!pl || !planetOpen(this.camp, pl)) return;
    const S = this.stats(), r = rng(pl.seed), R = pl.R, d = pl.d, crew = Math.max(1, this.players.size);
    const hpK = 1 + 0.3 * (crew - 1);
    const part = this.camp.partial[key] || null;
    const run = this.run = {
      pl, key, R, t: 0, earned: 0, maxPct: part?.mp || 0, colors: [null, '#7bd13b', '#b04aff', '#2f9bff', '#ffcc00'],
      grid: part ? unrle(part.g) : new Uint8Array(GW * GH), paintedW: 0, shieldMask: new Uint8Array(GW * GH),
      ship: { p: mul(START_DIR, R + 17), f: nrm(tangent([0, 0, -1], START_DIR)), v: [0, 0, 0], hp: S.hull, sh: S.shield, down: 0, beam: false, nuke: 0, hitT: 9 },
      turrets: [], fighters: [], scrubbers: [], shields: [], storms: [], natives: [], boss: null, bossDead: !pl.boss || !!part?.bd,
      shots: [], eshots: [], coins: [], droneT: [], turretT: 0, lastPct: 0,
      powerups: [], meteors: [], buffs: { rapid: 0, rainbow: 0, cash: 0 }, combo: 0, comboT: 0, puT: 10, eventT: 55, event: null, missions: [], aces: 0,
    };
    if (part?.c) part.c.forEach((c, i) => { if (i && c) run.colors[i] = c; });
    for (const q of this.players.values()) { run.colors[q.seat + 1] = q.color; q.tank = S.tank; q.bombCd = 0; q.fire = false; q.fireT = 0; q.stats = { splats: 0, kills: 0, abducted: 0, earned: 0, cells: 0 }; }
    for (let k = 0; k < run.grid.length; k++) if (run.grid[k]) run.paintedW += CELL_W[k];
    const far = (dd, min = 0.45) => Math.acos(Math.max(-1, Math.min(1, dot(dd, START_DIR)))) > min;
    const spot = (min = 0.45) => { for (let i = 0; i < 40; i++) { const dd = randDir(r); if (far(dd, min)) return dd; } return randDir(r); };
    const dead = new Set(part?.dead || []), sdead = new Set(part?.sd || []);
    // shield domes first, and a turret or two guards each one
    for (let i = 0; i < pl.def.shields; i++) {
      const dd = spot(0.6), E = ENEMY.shield(d), id = 's' + i;
      const sh = { id, d: dd, a: Math.min(0.42, 66 / R + 0.08), hp: E.hp * hpK, max: E.hp * hpK };
      if (!sdead.has(id)) run.shields.push(sh);
      for (let k = 0; k < 2 && run.turrets.length < pl.def.turrets; k++) run.turrets.push(this.mkTurret(run, 't' + run.turrets.length, around(dd, sh.a * 0.5, r() * 6.28), hpK));
    }
    while (run.turrets.length < pl.def.turrets) run.turrets.push(this.mkTurret(run, 't' + run.turrets.length, spot(), hpK));
    run.turrets = run.turrets.filter(t => !dead.has(t.id));
    for (let i = 0; i < pl.def.fighters; i++) run.fighters.push(this.mkFighter(run, i, hpK, spot(0.8), i < Math.ceil(pl.def.fighters / 2) ? 0 : 8 + i * 5));
    for (let i = 0; i < pl.def.scrubbers; i++) { const E = ENEMY.scrubber(d); run.scrubbers.push({ id: 'c' + i, d: spot(0.5), h: null, hp: E.hp * hpK, max: E.hp * hpK, speed: E.speed, respawn: 0, eraseT: 0, turnT: 0, hpK }); }
    for (const c of run.scrubbers) c.h = nrm(tangent(randDir(r), c.d));
    for (let i = 0; i < pl.def.storms; i++) { const dd = spot(0.3); run.storms.push({ id: 'w' + i, d: dd, h: nrm(tangent(randDir(r), dd)), a: Math.min(0.5, 90 / R + 0.12), t: r() * 2 }); }
    for (let i = 0; i < pl.natives; i++) { const dd = randDir(r); run.natives.push({ id: i, d: dd, h: nrm(tangent(randDir(r), dd)), st: 0, lift: 0, respawn: 0, turnT: r() * 3 }); }
    if (pl.boss && !run.bossDead) {
      const E = ENEMY.boss(d), hp = E.hp * hpK;
      run.boss = { p: mul(spot(1.0), R + 46), hp: part?.bh ? hp * part.bh : hp, max: hp, cd: 4, pat: 0, spin: 0, summonT: 30, dmg: E.dmg };
    }
    run.missions = this.makeMissions(pl);
    this.rebuildShieldMask();
    this.phase = 'planet';
    this.camp.cur = key;
    this.pushRoom();
    this.bcast(this.planetMsg());
    this.bcast({ t: 'toast', text: part ? `Back to ${pl.name} — ${Math.round(run.paintedW / CELL_WSUM * 100)}% already yours` : `Invading ${pl.name}! Paint ${Math.round(pl.need * 100)}% of it${pl.boss ? ' and beat the Guardian' : ''}`, k: 'big' });
  }
  mkTurret(run, id, dd, hpK) { const E = ENEMY.turret(run.pl.d); return { id, d: dd, hp: E.hp * hpK, max: E.hp * hpK, cd: 1 + (hash(id.length, dd[0] * 1e4 | 0) % 100) / 40, E }; }
  mkFighter(run, i, hpK, dd, delay = 0) { const E = ENEMY.fighter(run.pl.d); return { id: 'f' + i, p: mul(dd, run.R + 30), v: [0, 0, 0], hp: E.hp * hpK, max: E.hp * hpK, cd: 2 + i * 0.3, respawn: delay, alive: delay <= 0, E, orb: i * 1.7 }; }
  planetMsg() {
    const r = this.run;
    return {
      t: 'planet', key: r.key, grid: rle(r.grid), colors: r.colors, ship: { p: r.ship.p, f: r.ship.f, hp: r.ship.hp, sh: r.ship.sh },
      turrets: r.turrets.map(t => ({ id: t.id, d: t.d.map(r3), hp: t.hp / t.max })), shields: r.shields.map(s => ({ id: s.id, d: s.d.map(r3), a: s.a, hp: s.hp / s.max })),
      boss: r.boss ? { hp: r.boss.hp / r.boss.max } : null, bossDead: r.bossDead, cov: r.paintedW / CELL_WSUM, stats: this.stats(), missions: r.missions.map(m => ({ k: m.k, text: m.text, n: m.n, got: m.got, done: m.done, reward: m.reward })),
    };
  }
  rebuildShieldMask() {
    const r = this.run; r.shieldMask.fill(0);
    for (const s of r.shields) forCells(s.d, s.a, k => { r.shieldMask[k] = 1; });
  }
  earn(v, why = '', p = null, who = null, quiet = false) {
    if (this.run?.buffs.cash > 0) v *= 2;
    v = Math.round(v); if (v <= 0) return;
    this.camp.credits += v; this.camp.stats.earned += v; if (this.run) this.run.earned += v;
    if (who) who.stats.earned += v;
    if (!quiet) this.bcast({ t: 'cash', v, why, p: p ? p.map(r2) : null });
  }
  seatOrigin(seat) {
    const s = this.run.ship, up = nrm(s.p), f = s.f, rt = cross(f, up);
    if (seat === 0) return add(add(s.p, up, -1.5), f, 1.2);
    const a = [Math.PI / 2, Math.PI, -Math.PI / 2][seat - 1] || 0;
    return add(add(add(s.p, up, -0.4), f, Math.cos(a) * 2.9), rt, Math.sin(a) * 2.9);
  }
  shoot(o, v, k, slot, dmg, a, grav = true, owner = null) {
    const id = this.nextId++;
    const sh = { id, p: o, v, k, slot, dmg, a, life: 0, grav, owner };
    this.run.shots.push(sh);
    this.bcast({ t: 'shot', id, o: o.map(r2), v: v.map(r2), k, s: slot, g: grav ? 1 : 0, a: r3(a) });
    return sh;
  }
  fireSeat(p) {
    const S = this.stats(), r = this.run;
    const cost = 3 * (1 + 0.5 * (S.barrels - 1));
    const rapid = r.buffs.rapid > 0;
    if (!rapid && p.tank < cost) { if (!p.dryT || r.t - p.dryT > 1.2) { p.dryT = r.t; this.send(p, { t: 'dry' }); } return false; }
    if (!rapid) p.tank -= cost;
    const o = this.seatOrigin(p.seat), d = p.aim, up = nrm(r.ship.p), rt = nrm(cross(d, up)), vu = cross(rt, d);
    for (let b = 0; b < S.barrels; b++) {
      const off = S.barrels === 1 ? 0 : (b / (S.barrels - 1) - 0.5) * 0.12 * Math.min(1, S.barrels / 3);
      const jit = (Math.random() - 0.5) * 0.012;
      const dir = nrm(add(add(d, rt, off + jit), vu, (Math.random() - 0.5) * 0.012));
      this.shoot(add(o, rt, off * 6), add(mul(dir, SHOT_SPEED), r.ship.v, 0.6), 'paint', p.seat + 1, S.dmg, S.splat * (r.buffs.rainbow > 0 ? 1.6 : 1) / r.R, true, p);
    }
    p.stats.splats++; this.camp.stats.splats++;
    return true;
  }
  bomb(p, d) {
    const S = this.stats(), r = this.run; if (!S.bomb || p.bombCd > 0 || r.ship.down > 0) return;
    p.bombCd = S.bomb.cd;
    this.shoot(this.seatOrigin(p.seat), add(mul(d, SHOT_SPEED * 0.8), r.ship.v, 0.6), 'bomb', p.seat + 1, S.dmg * 4, S.bomb.r / r.R, true, p);
    this.send(p, { t: 'cd', bomb: S.bomb.cd });
  }
  nuke(p) {
    const S = this.stats(), r = this.run; if (!S.nuke || r.ship.nuke < 1 || r.ship.down > 0) return;
    r.ship.nuke = 0;
    const d = nrm(r.ship.p);
    this.bcast({ t: 'nuke', d: d.map(r3), a: S.nuke.a, s: p.seat + 1 });
    this.paint(d, S.nuke.a, p.seat + 1, p, true);
    const pos = mul(d, r.R);
    this.areaDamage(pos, S.nuke.a * r.R, S.dmg * 12, p, true);
  }
  // paint (or wash off) the grid around d
  paint(d, a, slot, who, nuke = false) {
    const r = this.run; let gained = 0, n = 0;
    forCells(d, a, k => {
      if (r.shieldMask[k] && !nuke) return;
      if (r.grid[k] !== slot) { if (!r.grid[k]) { r.paintedW += CELL_W[k]; gained += CELL_W[k]; } r.grid[k] = slot; n++; }
    });
    if (who) who.stats.cells += n;
    const S = this.stats();
    if (S.nuke && gained) r.ship.nuke = Math.min(1, r.ship.nuke + gained / CELL_WSUM * 2.4 * S.nuke.charge);
    this.bcast({ t: 'splat', d: d.map(r3), a: r3(a), s: slot, n: nuke ? 1 : 0, rb: r.buffs.rainbow > 0 ? 1 : 0 });
    const pct = Math.floor(r.paintedW / CELL_WSUM * 100);
    if (pct > r.maxPct) { const gain = pct - r.maxPct; r.maxPct = pct; this.earn(PAY.percent(r.pl.L) * gain, gain > 1 ? `+${gain}% painted` : '', null, who); }
  }
  erase(d, a) {
    const r = this.run; let n = 0;
    forCells(d, a, k => { if (r.grid[k]) { r.paintedW -= CELL_W[k]; r.grid[k] = 0; n++; } });
    if (n) this.bcast({ t: 'erase', d: d.map(r3), a: r3(a) });
  }
  areaDamage(pos, rad, dmg, who, nuke = false) {
    const r = this.run, R = r.R;
    for (const t of r.turrets) if (dist(mul(t.d, R + 1.2), pos) < rad + 2) this.hurt(t, 'turret', dmg * (nuke ? 1 : 0.5), who);
    for (const c of r.scrubbers) if (c.respawn <= 0 && dist(mul(c.d, R + 1), pos) < rad + 2) this.hurt(c, 'scrubber', dmg * (nuke ? 1 : 0.5), who);
    if (nuke) { for (const f of r.fighters) if (f.alive && dist(f.p, pos) < rad * 1.2 + 40) this.hurt(f, 'fighter', dmg, who); for (const s of r.shields) if (dist(mul(s.d, R), pos) < rad + s.a * R) this.hurt(s, 'shield', dmg, who); if (r.boss && dist(r.boss.p, pos) < rad + 70) this.hurt(r.boss, 'boss', dmg * 0.25, who); }
  }
  coinBurst(pos, total, n) {
    const r = this.run; n = Math.max(1, Math.min(12, n)); total *= this.comboMult();
    const up = nrm(pos);
    for (let i = 0; i < n; i++) { const id = this.nextId++; const v = add(mul(up, 8 + Math.random() * 10), randDir(Math.random), 10); r.coins.push({ id, p: add(pos, up, 2), v, val: total / n, life: 0 }); }
  }
  hurt(e, kind, dmg, who) {
    const r = this.run; if (e.hp <= 0) return;
    e.hp -= dmg;
    const L = r.pl.L;
    const pos = kind === 'fighter' || kind === 'boss' ? e.p : mul(e.d, r.R + (kind === 'shield' ? 0 : 1.2));
    if (e.hp > 0) { this.bcast({ t: 'hit', k: kind, id: e.id ?? 'boss', hp: r3(e.hp / e.max) }); return; }
    this.bcast({ t: 'boom', k: kind, id: e.id ?? 'boss', p: pos.map(r2) });
    if (who) who.stats.kills++; this.camp.stats.kills++;
    this.bumpCombo(); this.mission(kind);
    if (kind === 'turret') { r.turrets = r.turrets.filter(t => t !== e); this.coinBurst(pos, PAY.turret(L), 5); }
    if (kind === 'scrubber') { e.respawn = 38; this.coinBurst(pos, PAY.scrubber(L), 6); }
    if (kind === 'fighter') { e.alive = false; e.respawn = 24; if (e.ace) { e.respawn = 1e9; this.coinBurst(pos, PAY.fighter(L) * 14, 12); this.toast('ACE SHOT DOWN — bounty paid!', 'big'); this.bcast({ t: 'event', k: 'aceDown' }); } else this.coinBurst(pos, PAY.fighter(L), 4); }
    if (kind === 'shield') { r.shields = r.shields.filter(s => s !== e); this.rebuildShieldMask(); this.coinBurst(pos, PAY.shield(L), 8); this.toast('Shield dome destroyed — that area can be painted now!'); }
    if (kind === 'boss') { r.boss = null; r.bossDead = true; this.camp.stats.bosses++; this.coinBurst(pos, PAY.boss(L), 12); this.toast(`THE GUARDIAN IS DOWN!`, 'big'); }
  }
  damageShip(dmg) {
    const s = this.run.ship; if (s.down > 0) return;
    s.hitT = 0;
    const a = Math.min(s.sh, dmg); s.sh -= a; dmg -= a; s.hp -= dmg;
    this.bcast({ t: 'dmg', hp: r2(s.hp), sh: r2(s.sh), shield: a > 0 && dmg <= 0 ? 1 : 0 });
    if (s.hp <= 0) {
      s.down = 6; s.hp = 0; s.beam = false;
      const bill = Math.round(Math.min(this.camp.credits * 0.05, 400 * Math.pow(1.09, this.run.pl.L)));
      this.camp.credits = Math.max(0, this.camp.credits - bill);
      this.bcast({ t: 'down', bill });
    }
  }
  endRun(won) {
    const r = this.run; if (!r) return;
    if (!won) {
      this.camp.partial[r.key] = { g: rle(r.grid), c: r.colors, dead: this.deadIds(), sd: this.deadShields(), bh: r.boss ? r.boss.hp / r.boss.max : 0, bd: r.bossDead, mp: r.maxPct, pct: Math.round(r.paintedW / CELL_WSUM * 100) };
      const ks = Object.keys(this.camp.partial); if (ks.length > 12) delete this.camp.partial[ks[0]];
    }
    this.run = null; this.phase = 'hangar';
    this.bcast({ t: 'hangar' });
    this.pushRoom(); this.pushCamp(); this.pushSave();
  }
  deadIds() { const r = this.run, alive = new Set(r.turrets.map(t => t.id)); return Array.from({ length: r.pl.def.turrets }, (_, i) => 't' + i).filter(id => !alive.has(id)); }
  deadShields() { const r = this.run, alive = new Set(r.shields.map(s => s.id)); return Array.from({ length: r.pl.def.shields }, (_, i) => 's' + i).filter(id => !alive.has(id)); }
  conquer() {
    const r = this.run, pl = r.pl;
    // the planet takes the colour of whoever painted the most of it
    const cnt = [0, 0, 0, 0, 0]; for (let k = 0; k < r.grid.length; k++) cnt[r.grid[k]] += CELL_W[k];
    let best = 1; for (let i = 2; i <= 4; i++) if (cnt[i] > cnt[best]) best = i;
    const crew = this.players.size, gems = gemsFor(pl, crew);
    this.earn(pl.reward, '', null, null, true);
    this.camp.done[pl.key] = r.colors[best] || '#7bd13b';
    delete this.camp.partial[pl.key];
    this.camp.stats.planets++;
    const sys = system(pl.g, pl.s), sysDone = sys.planets.every(p => this.camp.done[p.key]);
    const galDone = sysDone && pl.s === SYSTEMS - 1;
    const players = this.humans().map(p => ({ id: p.id, name: p.name, color: p.color, ...p.stats, pct: Math.round(cnt[p.seat + 1] / CELL_WSUM * 100) }));
    this.bcast({ t: 'conquer', key: pl.key, name: pl.name, reward: pl.reward, earned: r.earned, gems, time: r.t, cov: r.paintedW / CELL_WSUM, color: this.camp.done[pl.key], sysDone, galDone, galaxy: GALAXIES[pl.g].name, nextGalaxy: GALAXIES[pl.g + 1]?.name || null, players, finale: galDone && pl.g === GALAXIES.length - 1 });
    this.phase = 'won'; this.wonT = 9;
    // the map moves on to the next planet that's still free
    const next = this.nextTarget(); if (next) this.camp.cur = next;
    this.pushRoom(); this.pushSave();
  }
  nextTarget() {
    for (let g = 0; g < GALAXIES.length; g++) for (let s = 0; s < SYSTEMS; s++) {
      if (!systemOpen(this.camp, g, s)) continue;
      for (const p of system(g, s).planets) if (!this.camp.done[p.key] && planetOpen(this.camp, p)) return p.key;
    }
    return null;
  }
  pushSave() { const h = this.players.get(this.host); if (h) this.send(h, { t: 'save', camp: this.saveCamp() }); }
  /** The campaign including the planet you're on right now (for the 30-second autosave). */
  saveCamp() {
    const c = JSON.parse(JSON.stringify({ ...this.camp }));
    const r = this.run;
    if (r && this.phase === 'planet') c.partial[r.key] = { g: rle(r.grid), c: r.colors, dead: this.deadIds(), sd: this.deadShields(), bh: r.boss ? r.boss.hp / r.boss.max : 0, bd: r.bossDead, mp: r.maxPct, pct: Math.round(r.paintedW / CELL_WSUM * 100) };
    return c;
  }

  // ---------------------------------------------------------------- the simulation
  tick(dt) {
    dt = Math.min(0.1, dt);
    if (this.phase === 'won') { this.wonT -= dt; if (this.wonT <= 0) { this.run = null; this.phase = 'hangar'; this.bcast({ t: 'hangar' }); this.pushRoom(); this.pushCamp(); } return; }
    if (this.phase !== 'planet' || !this.run) return;
    const r = this.run, S = this.stats(), R = r.R, s = r.ship, L = r.pl.L;
    r.t += dt; this.camp.stats.time += dt;
    const up = nrm(s.p), alt = len(s.p) - R;
    // the ship: shields, repairs, being down
    if (s.down > 0) { s.down -= dt; if (s.down <= 0) { s.hp = S.hull; s.sh = S.shield; this.bcast({ t: 'up' }); } }
    else {
      s.hitT += dt;
      if (s.hitT > 3 && s.sh < S.shield) s.sh = Math.min(S.shield, s.sh + S.shieldRegen * dt);
      if (S.repair) s.hp = Math.min(S.hull, s.hp + S.repair * dt);
    }
    // every seat: paint pump, bomb cooldown, the trigger
    for (const p of this.players.values()) {
      p.tank = Math.min(S.tank, p.tank + S.pump * dt); p.bombCd = Math.max(0, p.bombCd - dt);
      p.fireT -= dt;
      if (p.fire && s.down <= 0 && !(p.id === this.pilot && s.beam)) { while (p.fireT <= 0) { if (!this.fireSeat(p)) { p.fireT = 0.15; break; } p.fireT += 1 / (S.rate * (r.buffs.rapid > 0 ? 2 : 1)); } }
      if (p.fireT < 0) p.fireT = 0;
    }
    // drones paint unpainted ground near the saucer
    while (r.droneT.length < S.drones) r.droneT.push(r.droneT.length * 0.3);
    for (let i = 0; i < S.drones; i++) {
      r.droneT[i] -= dt; if (r.droneT[i] > 0 || s.down > 0) continue;
      r.droneT[i] = 0.55;
      let target = null;
      for (let k = 0; k < 8 && !target; k++) { const dd = around(up, Math.random() * Math.min(0.5, 120 / R), Math.random() * 6.28); const [ci] = cellOf(dd); if (!r.grid[ci] && !r.shieldMask[ci]) target = dd; }
      if (!target) continue;
      const a = i * Math.PI * 2 / S.drones + r.t * 1.4, rt = cross(s.f, up);
      const o = add(add(add(s.p, s.f, Math.cos(a) * 6), rt, Math.sin(a) * 6), up, 1.5);
      const tp = mul(target, R), dir = nrm(sub(tp, o));
      this.shoot(o, mul(dir, 170), 'drone', this.players.get(this.pilot)?.seat + 1 || 1, S.dmg * 0.5, S.splat * 0.75 / R, false, this.players.get(this.pilot));
    }
    // the auto-turret: shoots the nearest thing that shoots back
    if (S.turret && s.down <= 0) {
      r.turretT -= dt;
      if (r.turretT <= 0) {
        let best = null, bd = 180;
        for (const f of r.fighters) if (f.alive) { const d = dist(f.p, s.p); if (d < bd) { bd = d; best = f.p; } }
        if (r.boss) { const d = dist(r.boss.p, s.p); if (d < bd + 20) { bd = d; best = r.boss.p; } }
        if (!best) for (const t of r.turrets) { const tp = mul(t.d, R + 1.5), d = dist(tp, s.p); if (d < bd && dot(sub(s.p, tp), t.d) > 0) { bd = d; best = tp; } }
        if (best) { r.turretT = 0.33; const o = add(s.p, up, 1.6); this.shoot(o, mul(nrm(sub(best, o)), 280), 'turret', 0, S.turret, 4 / R, false, null); }
        else r.turretT = 0.2;
      }
    }
    // paint blobs in flight
    for (const sh of r.shots) {
      const steps = Math.max(1, Math.ceil(len(sh.v) * dt / 2.5)), h = dt / steps;
      for (let k = 0; k < steps && !sh.done; k++) {
        if (sh.grav) sh.v = add(sh.v, nrm(sh.p), -GRAV * h);
        sh.p = add(sh.p, sh.v, h);
        this.shotHits(sh);
      }
      sh.life += dt; if (sh.life > 5) sh.done = true;
    }
    r.shots = r.shots.filter(x => !x.done);
    // enemy lasers
    for (const e of r.eshots) {
      e.p = add(e.p, e.v, dt); e.life += dt;
      if (s.down <= 0 && dist(e.p, s.p) < SHIP_R + (e.big ? 1.5 : 0)) { e.done = true; this.damageShip(e.dmg); this.bcast({ t: 'ehit', id: e.id }); }
      else if (len(e.p) < R || e.life > 3.6) e.done = true;
    }
    r.eshots = r.eshots.filter(x => !x.done);
    const eshoot = (o, target, speed, dmg, big = false) => { const id = this.nextId++; const lead = add(target, s.v, dist(o, target) / speed * 0.8); const v = mul(nrm(sub(lead, o)), speed); r.eshots.push({ id, p: o, v, dmg, life: 0, big }); this.bcast({ t: 'eshot', id, o: o.map(r2), v: v.map(r2), big: big ? 1 : 0 }); };
    // turrets
    for (const t of r.turrets) {
      const tp = mul(t.d, R + 2.2), toShip = sub(s.p, tp), d = len(toShip);
      if (s.down > 0 || d > t.E.range || dot(toShip, t.d) / d < 0.08) continue;
      if (this.shielded(t.d)) { t.cd -= dt * 0.5; }
      t.cd -= dt; if (t.cd <= 0) { t.cd = t.E.every * (0.8 + Math.random() * 0.4); eshoot(tp, s.p, t.E.speed, t.E.dmg); }
    }
    // fighters
    for (const f of r.fighters) {
      if (!f.alive) { f.respawn -= dt; if (f.respawn <= 0 && !this.nearConquered()) { f.alive = true; f.hp = f.max; const dd = around(up, 1.2 + Math.random() * 0.8, Math.random() * 6.28); f.p = mul(dd, R + 30); f.v = [0, 0, 0]; this.bcast({ t: 'spawn', k: 'fighter', id: f.id }); } continue; }
      f.orb += dt * 0.7;
      const fu = nrm(f.p), rt = cross(s.f, up);
      const want = add(add(s.p, rt, Math.cos(f.orb) * 50), s.f, Math.sin(f.orb) * 50 + 10);
      let v = mul(nrm(sub(want, f.p)), f.E.speed);
      f.v = add(f.v, sub(v, f.v), Math.min(1, dt * 1.6));
      f.p = add(f.p, f.v, dt);
      const rr = len(f.p), ta = R + 24 + 10 * Math.sin(r.t * 0.6 + f.orb);
      f.p = mul(nrm(f.p), rr + (ta - rr) * Math.min(1, dt * 1.5));
      void fu;
      const d = dist(f.p, s.p);
      f.cd -= dt;
      if (f.cd <= 0 && d < f.E.range && s.down <= 0) { f.cd = f.E.every * (0.8 + Math.random() * 0.5); eshoot(f.p, s.p, 130 + r.pl.d * 1.5, f.E.dmg); }
    }
    // scrubbers roll around washing paint off (they head for painted ground)
    for (const c of r.scrubbers) {
      if (c.respawn > 0) { c.respawn -= dt; if (c.respawn <= 0 && !this.nearConquered()) { c.hp = c.max; c.d = around(up, 1.4 + Math.random(), Math.random() * 6.28); c.h = nrm(tangent(randDir(Math.random), c.d)); this.bcast({ t: 'spawn', k: 'scrubber', id: c.id }); } else continue; }
      if (c.respawn > 0) continue;
      c.turnT -= dt;
      if (c.turnT <= 0) {
        c.turnT = 1.5 + Math.random();
        let best = null, bn = -1;
        for (let k = 0; k < 7; k++) { const b = Math.random() * 6.28, dd = around(c.d, 36 / R, b); const [ci] = cellOf(dd); const v = r.grid[ci] ? 1 : 0; if (v > bn) { bn = v; best = dd; } }
        if (best) c.h = nrm(tangent(sub(best, c.d), c.d));
      }
      [c.d, c.h] = walk(c.d, c.h, c.speed / R * dt);
      c.eraseT -= dt;
      if (c.eraseT <= 0) { c.eraseT = 0.45; this.erase(c.d, 10 / R); }
    }
    // storms drift and rain the paint away
    for (const w of r.storms) {
      [w.d, w.h] = walk(w.d, w.h, 3.3 / R * dt);
      w.t -= dt; if (w.t <= 0) { w.t = 0.8; this.erase(around(w.d, Math.random() * w.a * 0.9, Math.random() * 6.28), 8 / R); }
    }
    // natives: wander, run from the saucer, float up the beam
    const beamA = S.beam.r / R, beamOn = s.beam && s.down <= 0 && alt < 70;
    for (const n of r.natives) {
      if (n.st === 2) { n.respawn -= dt; if (n.respawn <= 0) { n.st = 0; n.lift = 0; n.d = around(up, 1 + Math.random() * 1.5, Math.random() * 6.28); } continue; }
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(n.d, up))));
      if (n.st === 0) {
        n.turnT -= dt;
        const near = ang * R < 50 && s.down <= 0;
        if (near) n.h = nrm(tangent(sub(n.d, up), n.d));
        else if (n.turnT <= 0) { n.turnT = 2 + Math.random() * 3; n.h = nrm(tangent(add(n.h, randDir(Math.random), 0.8), n.d)); }
        [n.d, n.h] = walk(n.d, n.h, (near ? 5 : 1.6) / R * dt);
        if (beamOn && ang < beamA) n.st = 1;
      } else if (n.st === 1) {
        if (!beamOn || ang > beamA * 1.6) { n.lift = Math.max(0, n.lift - 14 * dt); if (n.lift <= 0) n.st = 0; continue; }
        n.lift += (12 + S.beam.r * 0.4) * dt;
        n.d = nrm(add(n.d, sub(up, n.d), Math.min(1, dt * 2)));
        if (n.lift >= alt - 2.5) {
          n.st = 2; n.respawn = 25;
          const pl = this.players.get(this.pilot);
          if (pl) pl.stats.abducted++; this.camp.stats.abducted++;
          this.bcast({ t: 'abduct', id: n.id, gold: n.gold ? 1 : 0 });
          this.bumpCombo(); this.mission('abduct');
          if (n.gold) { n.gold = false; this.mission('gold'); this.earn(PAY.native(L) * S.beam.mult * 30 * this.comboMult(), 'THE GOLDEN GOOGLY!', s.p, pl); this.toast('You abducted the GOLDEN GOOGLY!', 'big'); }
          else this.earn(PAY.native(L) * S.beam.mult * this.comboMult(), 'googly abducted', s.p, pl);
        }
      }
    }
    // the Guardian
    const b = r.boss;
    if (b) {
      const bd = nrm(b.p), toward = nrm(tangent(sub(up, bd), bd)), ang = Math.acos(Math.max(-1, Math.min(1, dot(bd, up))));
      const nd = ang > 0.35 ? walk(bd, toward, Math.min(ang - 0.3, 0.06 * dt))[0] : bd;
      b.spin += dt * (b.hp < b.max / 2 ? 1.2 : 0.7);
      b.p = mul(nd, R + 46 + Math.sin(r.t * 0.5) * 6);
      b.cd -= dt * (b.hp < b.max / 2 ? 1.5 : 1);
      if (b.cd <= 0 && s.down <= 0 && dist(b.p, s.p) < 300) {
        b.pat = (b.pat + 1) % 3;
        if (b.pat === 0) { // a ring of paint-proof plasma balls
          const bu = nrm(b.p), e1 = nrm(cross(bu, [0.3, 1, 0.1])), e2 = cross(bu, e1), n = 14;
          for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + b.spin; const dir = nrm(add(add(mul(e1, Math.cos(a)), e2, Math.sin(a)), sub(s.p, b.p), 0.004)); const id = this.nextId++; const v = mul(dir, 60); r.eshots.push({ id, p: b.p, v, dmg: b.dmg, life: 0, big: true }); this.bcast({ t: 'eshot', id, o: b.p.map(r2), v: v.map(r2), big: 1 }); }
          b.cd = 3.2;
        } else if (b.pat === 1) { for (let i = 0; i < 3; i++) eshoot(add(b.p, randDir(Math.random), 5), s.p, 120, b.dmg * 1.3, true); b.cd = 2.2; }
        else { b.cd = 2.6; for (const f of r.fighters) if (!f.alive && f.respawn > 3) { f.respawn = 0.5; break; } eshoot(b.p, s.p, 100, b.dmg * 2, true); }
      }
    }
    // coins: float, then fly to the saucer once it's close enough
    for (const c of r.coins) {
      c.life += dt;
      const d = dist(c.p, s.p);
      if (d < S.magnet && s.down <= 0) c.v = add(c.v, sub(mul(nrm(sub(s.p, c.p)), 140), c.v), Math.min(1, dt * 5));
      else c.v = mul(c.v, Math.exp(-2 * dt));
      c.p = add(c.p, c.v, dt);
      if (len(c.p) < R + 2) c.p = mul(nrm(c.p), R + 2);
      if (d < 5.5 && s.down <= 0) { c.done = true; this.bcast({ t: 'coin', id: c.id, v: Math.round(c.val) }); this.earn(c.val, '', null, null, true); }
      if (c.life > 40) c.done = true;
    }
    r.coins = r.coins.filter(x => !x.done);
    this.tickExtras(dt);
    // conquered?
    if (r.paintedW / CELL_WSUM >= r.pl.need && r.bossDead) return this.conquer();
    // snapshots and the host's autosave (online)
    this.snapT -= dt;
    if (this.snapT <= 0) { this.snapT += SNAP_EVERY; this.snap(); }
    if (!this.solo) { this.saveT += dt; if (this.saveT > 30) { this.saveT = 0; this.pushSave(); } }
  }
  // ---------------------------------------------------------------- combos, missions, power-ups and events
  comboMult() { return 1 + Math.min(20, this.run?.combo || 0) * 0.1; }
  bumpCombo() { const r = this.run; r.combo++; r.comboT = 7; if (r.combo >= 3 && r.combo % 5 === 0) this.bcast({ t: 'combo', n: r.combo }); }
  makeMissions(pl) {
    const L = pl.L, g = pl.g, rr = rng(pl.seed ^ ((this.camp.stats.planets + 1) * 7919)), all = [];
    all.push({ k: 'abduct', n: 4 + g, text: n => `Abduct ${n} googlies with the beam` });
    if (pl.def.turrets >= 3) all.push({ k: 'turret', n: Math.min(pl.def.turrets, 3 + Math.floor(g / 2)), text: n => `Knock out ${n} flak turrets` });
    if (pl.def.scrubbers >= 1) all.push({ k: 'scrubber', n: Math.min(3 + g, 2 + pl.def.scrubbers), text: n => `Stop ${n} paint scrubbers` });
    if (pl.def.fighters >= 1) all.push({ k: 'fighter', n: 3 + g, text: n => `Shoot down ${n} fighter jets` });
    all.push({ k: 'power', n: 3, text: n => `Grab ${n} power-ups` });
    all.push({ k: 'meteor', n: 4, text: n => `Blast ${n} paint meteors` });
    all.push({ k: 'speed', n: 25, text: n => `Paint ${n}% within 3 minutes` });
    all.push({ k: 'combo', n: 8 + g, text: n => `Build a ×${(1 + (n) * 0.1).toFixed(1)} combo (${n} in a row)` });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, 3).map(m => ({ k: m.k, n: m.n, got: 0, done: false, text: m.text(m.n), reward: Math.round(PAY.turret(L) * 9 / 10) * 10 }));
  }
  mission(k, amount = 1) {
    const r = this.run; if (!r) return;
    for (let i = 0; i < r.missions.length; i++) {
      const m = r.missions[i]; if (m.done || m.k !== k) continue;
      const was = m.got;
      m.got = k === 'combo' || k === 'speed' ? Math.max(m.got, amount) : m.got + amount;
      if (m.got === was) continue;
      if (m.got >= m.n) { m.done = true; m.got = m.n; this.earn(m.reward, 'mission complete!', r.ship.p); this.bcast({ t: 'mission', i, done: 1, got: m.got, text: m.text, reward: m.reward }); }
      else this.bcast({ t: 'mission', i, done: 0, got: m.got });
    }
  }
  spawnPowerup(near, k) {
    const r = this.run, R = r.R, up = nrm(near);
    const KS = ['rapid', 'rainbow', 'repair', 'cash', 'bomb', 'nuke'];
    k = k || KS[Math.floor(Math.random() * (this.stats().nuke ? 6 : 5))];
    const d = around(up, (40 + Math.random() * 90) / R, Math.random() * 6.28);
    const u = { id: this.nextId++, k, p: mul(d, R + 10 + Math.random() * 12), life: 0 };
    r.powerups.push(u);
    return u;
  }
  pickup(u) {
    const r = this.run, S = this.stats(), s = r.ship;
    u.done = true;
    if (u.k === 'rapid') r.buffs.rapid = 10;
    if (u.k === 'rainbow') r.buffs.rainbow = 12;
    if (u.k === 'cash') r.buffs.cash = 15;
    if (u.k === 'repair') { s.hp = Math.min(S.hull, s.hp + S.hull * 0.5); s.sh = S.shield; }
    if (u.k === 'bomb') for (const p of this.players.values()) { p.bombCd = 0; p.tank = S.tank; }
    if (u.k === 'nuke') s.nuke = Math.min(1, s.nuke + 0.5);
    this.bcast({ t: 'pickup', id: u.id, k: u.k, hp: r2(s.hp), sh: r2(s.sh) });
    this.bumpCombo(); this.mission('power');
  }
  smashMeteor(m, slot, who) {
    const r = this.run, d = nrm(m.p);
    m.done = true;
    this.bcast({ t: 'meteor', id: m.id, p: m.p.map(r2), hit: 1 });
    this.paint(d, 26 / r.R, slot, who);
    this.coinBurst(mul(d, r.R + 6), PAY.fighter(r.pl.L) * 0.8, 3);
    this.bumpCombo(); this.mission('meteor');
  }
  startEvent(force = null) {
    const r = this.run, s = r.ship, up = nrm(s.p), R = r.R;
    const opts = ['meteors', 'gold', 'drop'];
    if (r.pl.d >= 2 && r.aces < 2) opts.push('ace', 'ace');
    const k = force || opts[Math.floor(Math.random() * opts.length)];
    if (k === 'meteors') { r.event = { k, t: 22, spawnT: 0 }; this.toast('☄️ PAINT METEOR SHOWER! Shoot them for giant splats', 'big'); }
    if (k === 'gold') {
      const n = r.natives.filter(q => q.st === 0).sort((a, b) => Math.abs(dot(a.d, up) - 0.2) - Math.abs(dot(b.d, up) - 0.2))[0];
      if (n) { n.gold = true; r.event = { k, t: 60 }; this.toast('✨ A GOLDEN GOOGLY appeared! Beam it up (it\'s on the map)', 'big'); }
    }
    if (k === 'drop') { for (let i = 0; i < 3; i++) this.spawnPowerup(s.p); r.event = { k, t: 6 }; this.toast('📦 SUPPLY DROP from the mothership — grab the power-ups!'); }
    if (k === 'ace') {
      const E = ENEMY.fighter(r.pl.d), hpK = 1 + 0.3 * (this.players.size - 1);
      const f = { id: 'ace' + r.aces++, p: mul(around(up, 1.1, Math.random() * 6.28), R + 30), v: [0, 0, 0], hp: E.hp * hpK * 9, max: E.hp * hpK * 9, cd: 2, respawn: 0, alive: true, E: { ...E, speed: E.speed * 1.35, every: E.every * 0.5, dmg: E.dmg * 1.4 }, orb: Math.random() * 6, ace: true };
      r.fighters.push(f); r.event = { k, t: 45 };
      this.toast('🎯 BOUNTY: an ACE fighter is hunting you — shoot it down for a huge reward!', 'big');
    }
    this.bcast({ t: 'event', k });
  }
  tickExtras(dt) {
    const r = this.run, s = r.ship, R = r.R, up = nrm(s.p);
    for (const k in r.buffs) r.buffs[k] = Math.max(0, r.buffs[k] - dt);
    if (r.combo) { r.comboT -= dt; if (r.comboT <= 0) { if (r.combo >= 5) this.bcast({ t: 'combo', n: 0, was: r.combo }); r.combo = 0; } else this.mission('combo', r.combo); }
    this.mission('speed', r.t < 180 ? Math.floor(r.paintedW / CELL_WSUM * 100) : 0);
    // power-ups float a little way ahead; fly through them
    r.puT -= dt;
    if (r.puT <= 0) { r.puT = 16 + Math.random() * 10; if (r.powerups.length < 3) this.spawnPowerup(add(s.p, s.f, 60)); }
    for (const u of r.powerups) { u.life += dt; if (s.down <= 0 && dist(u.p, s.p) < 9) this.pickup(u); else if (u.life > 45) { u.done = true; this.bcast({ t: 'pickup', id: u.id, gone: 1 }); } }
    r.powerups = r.powerups.filter(u => !u.done);
    // random events
    if (!r.event) { r.eventT -= dt; if (r.eventT <= 0 && !this.nearConquered()) { r.eventT = 60 + Math.random() * 45; this.startEvent(); } }
    else {
      const e = r.event; e.t -= dt;
      if (e.k === 'meteors') { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = 0.9 + Math.random() * 0.7; const tgt = mul(around(up, (20 + Math.random() * 120) / R, Math.random() * 6.28), R); const o = add(tgt, nrm(add(nrm(tgt), randDir(Math.random), 0.5)), 150); r.meteors.push({ id: this.nextId++, p: o, v: mul(nrm(sub(tgt, o)), 42 + Math.random() * 15) }); } }
      if (e.k === 'gold' && !r.natives.some(n => n.gold)) e.t = 0;
      if (e.k === 'ace' && !r.fighters.some(f => f.ace && f.alive)) e.t = 0;
      if (e.t <= 0) {
        if (e.k === 'gold') { for (const n of r.natives) if (n.gold) { n.gold = false; this.bcast({ t: 'event', k: 'goldGone' }); } }
        if (e.k === 'ace') for (const f of r.fighters) if (f.ace && f.alive) { f.alive = false; f.respawn = 1e9; this.bcast({ t: 'boom', k: 'fighter', id: f.id, p: f.p.map(r2), quiet: 1 }); this.toast('The ace flew off…'); }
        r.event = null;
      }
    }
    // meteors: shoot them before they land and wash your paint off
    for (const m of r.meteors) {
      if (m.done) continue;
      m.p = add(m.p, m.v, dt);
      if (s.down <= 0 && dist(m.p, s.p) < SHIP_R + 4) { m.done = true; this.damageShip(ENEMY.turret(r.pl.d).dmg * 2); this.bcast({ t: 'meteor', id: m.id, p: m.p.map(r2), ship: 1 }); }
      else if (len(m.p) <= R) { m.done = true; this.erase(nrm(m.p), 16 / R); this.bcast({ t: 'meteor', id: m.id, p: m.p.map(r2), ground: 1 }); }
    }
    r.meteors = r.meteors.filter(m => !m.done);
  }
  shielded(d) { for (const s of this.run.shields) if (dot(d, s.d) > Math.cos(s.a)) return true; return false; }
  nearConquered() { const r = this.run; return r.paintedW / CELL_WSUM > r.pl.need - 0.02 && r.bossDead; }
  shotHits(sh) {
    const r = this.run, R = r.R, who = sh.owner;
    for (const s of r.shields) { const c = mul(s.d, R), rad = Math.sin(s.a) * R * 1.02; if (dist(sh.p, c) < rad && len(sh.p) > R - 0.5) { sh.done = true; this.bcast({ t: 'fizz', p: sh.p.map(r2), id: sh.id }); this.hurt(s, 'shield', sh.dmg * (sh.k === 'bomb' ? 1 : 0.6), who); return; } }
    for (const t of r.turrets) if (dist(sh.p, mul(t.d, R + 1.4)) < 2.8) { sh.done = true; this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: sh.slot }); this.hurt(t, 'turret', sh.dmg, who); if (sh.k === 'bomb') this.land(sh); return; }
    for (const c of r.scrubbers) if (c.respawn <= 0 && dist(sh.p, mul(c.d, R + 1.2)) < 2.8) { sh.done = true; this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: sh.slot }); this.hurt(c, 'scrubber', sh.dmg, who); if (sh.k === 'bomb') this.land(sh); return; }
    for (const f of r.fighters) if (f.alive && dist(sh.p, f.p) < 3) { sh.done = true; this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: sh.slot }); this.hurt(f, 'fighter', sh.dmg, who); return; }
    for (const m of r.meteors) if (!m.done && dist(sh.p, m.p) < 5.5) { sh.done = true; this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: sh.slot }); this.smashMeteor(m, sh.slot || (this.players.get(this.pilot)?.seat + 1) || 1, who); return; }
    if (r.boss && dist(sh.p, r.boss.p) < 16) { sh.done = true; this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: sh.slot }); this.hurt(r.boss, 'boss', sh.dmg, who); return; }
    if (len(sh.p) <= R) { sh.done = true; this.land(sh); }
  }
  land(sh) {
    const r = this.run, d = nrm(sh.p);
    if (sh.slot) this.paint(d, sh.a, sh.slot, sh.owner);
    else this.bcast({ t: 'pop', id: sh.id, p: sh.p.map(r2), s: 0 });
    if (sh.k === 'bomb') this.areaDamage(mul(d, r.R), sh.a * r.R, sh.dmg, sh.owner);
    else if (sh.k === 'paint') this.areaDamage(mul(d, r.R), sh.a * r.R * 0.6, sh.dmg * 0.6, sh.owner);
  }
  snap() {
    const r = this.run, s = r.ship, R = r.R;
    this.bcast({
      t: 'snap', tm: r2(r.t),
      s: [...s.p.map(r2), ...s.f.map(r3), r2(s.hp), r2(s.sh), r2(Math.max(0, s.down)), s.beam ? 1 : 0, r3(s.nuke)],
      a: this.humans().map(p => [p.id, ...p.aim.map(r3), p.fire ? 1 : 0, Math.round(p.tank), r2(p.bombCd)]),
      f: r.fighters.filter(f => f.alive).map(f => [f.id, ...f.p.map(r2), ...f.v.map(r2), r2(f.hp / f.max), f.ace ? 1 : 0]),
      c: r.scrubbers.filter(c => c.respawn <= 0).map(c => [c.id, ...c.d.map(r3), ...c.h.map(r3), r2(c.hp / c.max)]),
      n: r.natives.filter(n => n.st < 2).map(n => [n.id, ...n.d.map(r3), ...n.h.map(r3), r2(n.lift), n.st, n.gold ? 1 : 0]),
      u: r.powerups.map(u => [u.id, ...u.p.map(r2), u.k]),
      m: r.meteors.map(m => [m.id, ...m.p.map(r2), ...m.v.map(r2)]),
      bf: [r2(r.buffs.rapid), r2(r.buffs.rainbow), r2(r.buffs.cash)], cb: r.combo, cbT: r2(r.comboT), ev: r.event ? [r.event.k, r2(r.event.t)] : 0,
      w: r.storms.map(w => [w.id, ...w.d.map(r3)]),
      b: r.boss ? [...r.boss.p.map(r2), r3(r.boss.hp / r.boss.max), r2(r.boss.spin)] : 0,
      o: r.coins.map(c => [c.id, ...c.p.map(r2)]),
      cov: r3(r.paintedW / CELL_WSUM), cr: Math.round(this.camp.credits), R,
    });
  }
}
function cellOf(d) {
  const u = ((Math.atan2(d[2], -d[0]) / (Math.PI * 2)) + 1) % 1, t = Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI;
  const i = Math.min(GW - 1, Math.floor(u * GW)), j = Math.min(GH - 1, Math.floor(t * GH));
  return [j * GW + i, i, j];
}
export { cellOf };
