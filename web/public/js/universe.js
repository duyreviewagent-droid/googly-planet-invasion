// Googly-Planet Invasion — the universe (10 galaxies × 5 star systems × 3–5 planets, all generated from fixed seeds so
// every player sees the same one), the planet types, the UFO upgrades and the money curve. Shared by the server,
// the in-page solo engine and the renderer. No three.js in here.

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const hash = (...n) => { let h = 2166136261; for (const x of n) { h ^= x + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };

export const GALAXIES = [
  { name: 'Milky Googly', tint: '#3a5aa8', types: ['terran', 'desert', 'barren', 'ocean', 'ice'] },
  { name: 'Andromoogla', tint: '#8a3aa8', types: ['jungle', 'ocean', 'desert', 'gas', 'terran'] },
  { name: 'The Wobble Cloud', tint: '#2a8a7a', types: ['ice', 'barren', 'gas', 'crystal', 'terran'] },
  { name: 'Pupil Nebula', tint: '#a83a3a', types: ['lava', 'desert', 'barren', 'toxic', 'gas'] },
  { name: 'Sombreyeo', tint: '#a8883a', types: ['desert', 'jungle', 'city', 'ocean', 'gas'] },
  { name: 'Triangoogly', tint: '#3aa85a', types: ['toxic', 'jungle', 'crystal', 'lava', 'terran'] },
  { name: 'Whirlpeepers', tint: '#3a7aa8', types: ['ocean', 'ice', 'city', 'gas', 'crystal'] },
  { name: 'Cartwheel Eye', tint: '#c85a1a', types: ['lava', 'toxic', 'city', 'barren', 'desert'] },
  { name: 'The Great Stare', tint: '#6a3ac8', types: ['crystal', 'city', 'gas', 'lava', 'toxic'] },
  { name: 'Googlyverse Core', tint: '#c83a8a', types: ['city', 'crystal', 'lava', 'toxic', 'terran'] },
];
export const SYSTEMS = 5;
/** Planets are this many times bigger than the numbers below (so they feel huge next to the saucer). */
export const WORLD = 3;
export const TOTAL_SYSTEMS = GALAXIES.length * SYSTEMS;

// every planet type: what it looks like, how the natives look, and a flavour line for the map
export const TYPES = {
  terran: { name: 'Earth-like', natives: '#ffb04a', atmo: '#6aa8ff', line: 'Oceans, forests and a lot of googlies who have never seen paint.' },
  desert: { name: 'Desert', natives: '#e0683a', atmo: '#ffc88a', line: 'Dunes forever. The paint dries instantly.' },
  ocean: { name: 'Ocean', natives: '#3ad8c8', atmo: '#7ac8ff', line: 'Almost all water — paint floats, it still counts.' },
  ice: { name: 'Ice', natives: '#bfe8ff', atmo: '#cfeaff', line: 'Frozen solid. Slippery googlies.' },
  jungle: { name: 'Jungle', natives: '#7bd13b', atmo: '#8ae0a0', line: 'Thick green canopy and heavy storms.' },
  lava: { name: 'Volcanic', natives: '#ff5a2a', atmo: '#ff8a4a', line: 'Glowing rivers of lava. Bring a hard hat.' },
  gas: { name: 'Gas Giant', natives: '#ffd23a', atmo: '#ffd8a0', line: 'Enormous. The googlies live on floating cloud cities.' },
  toxic: { name: 'Toxic', natives: '#c8ff3a', atmo: '#a8ff5a', line: 'Green seas that glow. Do not drink.' },
  barren: { name: 'Rocky Moon', natives: '#b0b0b8', atmo: '#8a8a9a', line: 'Craters and dust. Easy pickings.' },
  crystal: { name: 'Crystal', natives: '#d88aff', atmo: '#c8a0ff', line: 'Shiny purple crystal plains.' },
  city: { name: 'City World', natives: '#ff6fb5', atmo: '#ffb0d8', line: 'One giant googly city. Lots of defences.' },
};

const SYL = ['go', 'gly', 'zor', 'blip', 'oo', 'ka', 'mo', 'zee', 'plo', 'wib', 'ble', 'ton', 'rax', 'vu', 'nim', 'pip', 'qua', 'lor', 'fex', 'dro', 'ya', 'ul', 'eep', 'squ', 'bo', 'tri', 'xa', 'mu', 'glo', 'peep'];
const SUFFIX = ['', '', '', ' Prime', ' II', ' III', ' IV', ' Major', ' Minor', ' b', ' c', ' VII'];
function planetName(r) {
  const n = 2 + (r() < 0.4 ? 1 : 0);
  let s = ''; for (let i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)];
  return s[0].toUpperCase() + s.slice(1) + SUFFIX[Math.floor(r() * SUFFIX.length)];
}
const STAR_KINDS = [
  { name: 'Yellow Star', color: '#fff2c8', light: '#fff4e0' },
  { name: 'Red Dwarf', color: '#ff8a5a', light: '#ffd0b0' },
  { name: 'Blue Giant', color: '#b8d4ff', light: '#e0ecff' },
  { name: 'White Star', color: '#ffffff', light: '#ffffff' },
  { name: 'Orange Star', color: '#ffc27a', light: '#ffe4c0' },
];
const sysCache = new Map();
/** One star system: its star and its planets. The last planet always has a Guardian. */
export function system(g, s) {
  const key = g * SYSTEMS + s;
  if (sysCache.has(key)) return sysCache.get(key);
  const r = rng(hash(g, s, 77));
  const G = GALAXIES[g];
  const n = 3 + Math.floor(r() * 3);
  const star = STAR_KINDS[Math.floor(r() * STAR_KINDS.length)];
  const sysName = planetName(r).replace(/ .*/, '');
  const planets = [];
  for (let p = 0; p < n; p++) {
    const pr = rng(hash(g, s, p, 1234));
    const boss = p === n - 1;
    const L = key;
    const d = L + p * 0.25;
    let type = G.types[Math.floor(pr() * G.types.length)];
    if (key === 0 && p === 0) type = 'terran';
    let R = Math.round(46 + d * 3.1 + pr() * 22 + (boss ? 22 : 0));
    if (type === 'gas') R = Math.round(R * 1.45);
    if (type === 'barren') R = Math.round(R * 0.8);
    R = Math.min(280, R);
    if (key === 0 && p === 0) R = 30;
    R *= WORLD;
    const f = Math.min(1, R / (150 * WORLD));
    const def = {
      turrets: Math.min(34, Math.round(2 + d * 0.55 + f * 6)),
      fighters: Math.min(16, Math.floor(d * 0.42 + (boss ? 2 : 0))),
      scrubbers: Math.min(14, Math.floor(1 + d * 0.3)),
      shields: g >= 2 ? Math.min(6, Math.floor((d - 8) / 7) + 1) : 0,
      storms: g >= 1 && (type === 'jungle' || type === 'ocean' || type === 'terran' || type === 'gas' || type === 'toxic') ? 1 + Math.floor(pr() * Math.min(3, 1 + g * 0.4)) : 0,
    };
    if (key === 0) { def.fighters = p === 0 ? 0 : Math.min(def.fighters, p); def.scrubbers = p === 0 ? 0 : 1; def.turrets = Math.min(def.turrets, 2 + p * 2); }
    planets.push({
      key: `${g}-${s}-${p}`, g, s, p, L, d, boss, type, R,
      name: planetName(pr), seed: hash(g, s, p, 99), def,
      natives: Math.round(12 + f * 20),
      rings: type === 'gas' ? pr() < 0.7 : pr() < 0.08,
      moons: Math.floor(pr() * (type === 'gas' ? 4 : 2.3)),
      orbit: 60 + p * 42 + pr() * 14, phase: pr() * Math.PI * 2, tilt: (pr() - 0.5) * 0.6, spin: 0.012 + pr() * 0.02,
      need: g < 3 ? 0.7 : g < 7 ? 0.73 : 0.76,
      reward: reward(L, boss),
    });
  }
  const sys = { g, s, key, name: sysName + (r() < 0.5 ? ' System' : ' Cluster'), star, planets };
  sysCache.set(key, sys);
  return sys;
}
export function planetByKey(k) { const [g, s, p] = String(k).split('-').map(Number); if (!(g >= 0 && g < GALAXIES.length && s >= 0 && s < SYSTEMS)) return null; return system(g, s).planets[p] || null; }
export const totalPlanets = (() => { let n = 0; for (let g = 0; g < GALAXIES.length; g++) for (let s = 0; s < SYSTEMS; s++) n += system(g, s).planets.length; return n; })();

// ------------------------------------------------------------------ money
export function scaleL(L) { return Math.pow(1.09, L); }
export function reward(L, boss) { return Math.round(420 * scaleL(L) * (boss ? 2.4 : 1) / 10) * 10; }
export const PAY = {
  percent: L => 6 * scaleL(L),          // each whole % of the planet painted
  turret: L => 22 * scaleL(L), fighter: L => 16 * scaleL(L), scrubber: L => 30 * scaleL(L), shield: L => 60 * scaleL(L),
  native: L => 12 * scaleL(L), boss: L => 900 * scaleL(L),
};
export const gemsFor = (pl, crew) => 3 + pl.g + (pl.boss ? 5 : 0) + (crew > 1 ? 2 : 0);

// ------------------------------------------------------------------ enemies (d = planet difficulty, 0 … ~50)
export const ENEMY = {
  turret: d => ({ hp: 34 * (1 + 0.4 * d), dmg: 5 * (1 + 0.26 * d), every: Math.max(0.9, 2.6 / (1 + 0.04 * d)), speed: 115 + d * 1.2, range: 180 }),
  fighter: d => ({ hp: 22 * (1 + 0.4 * d), dmg: 3.5 * (1 + 0.26 * d), every: Math.max(0.7, 1.7 / (1 + 0.03 * d)), speed: 55 + d * 0.8, range: 140 }),
  scrubber: d => ({ hp: 45 * (1 + 0.4 * d), speed: 6.5 + d * 0.12 }),
  shield: d => ({ hp: 160 * (1 + 0.4 * d) }),
  boss: d => ({ hp: 750 * (1 + 0.42 * d), dmg: 4.5 * (1 + 0.26 * d) }),
};

// ------------------------------------------------------------------ UFO upgrades (bought at the mothership with credits)
export const UPGRADES = [
  { id: 'rate', icon: '🔫', name: 'Paint Cannon', desc: 'Shoots faster', max: 10, cost: 140, grow: 1.68, fx: l => `${(4 + l * 0.8).toFixed(1)} shots/s` },
  { id: 'size', icon: '🎨', name: 'Big Splats', desc: 'Every blob paints a bigger patch', max: 10, cost: 170, grow: 1.7, fx: l => `splat ${Math.round((4.6 + l * 0.45) * 3)} m` },
  { id: 'power', icon: '💥', name: 'Heavy Paint', desc: 'More damage to defences', max: 30, cost: 150, grow: 1.3, fx: l => `${Math.round(10 * (1 + 0.36 * l))} dmg` },
  { id: 'spread', icon: '🔱', name: 'Extra Barrels', desc: 'Fire more blobs at once', max: 4, cost: 900, grow: 2.6, fx: l => `${1 + l} blobs` },
  { id: 'tank', icon: '🛢', name: 'Paint Tank', desc: 'Hold more paint', max: 10, cost: 110, grow: 1.6, fx: l => `${80 + l * 40} paint` },
  { id: 'pump', icon: '⛽', name: 'Paint Pump', desc: 'The tank refills faster', max: 10, cost: 130, grow: 1.65, fx: l => `+${10 + l * 3}/s` },
  { id: 'hull', icon: '🛡', name: 'Hull Armour', desc: 'The saucer takes more hits', max: 30, cost: 140, grow: 1.3, fx: l => `${Math.round(100 * (1 + 0.36 * l))} hull` },
  { id: 'shield', icon: '🔵', name: 'Force Shield', desc: 'A bubble that recharges', max: 25, cost: 240, grow: 1.33, fx: l => l ? `${l * 40} shield` : 'none' },
  { id: 'repair', icon: '🔧', name: 'Nano-Repair', desc: 'The hull slowly fixes itself', max: 12, cost: 420, grow: 1.5, fx: l => l ? `+${(l * 0.9).toFixed(1)} hull/s` : 'none' },
  { id: 'engine', icon: '🚀', name: 'Engines', desc: 'Fly faster', max: 10, cost: 120, grow: 1.6, fx: l => `${Math.round((26 + l * 3) * 2.4)} m/s` },
  { id: 'bomb', icon: '💣', name: 'Paint Bombs', desc: 'Right-click: a huge splat', max: 10, cost: 300, grow: 1.65, fx: l => l ? `${Math.round((16 + l * 2.6) * 3)} m · every ${(8 - l * 0.45).toFixed(1)} s` : 'locked' },
  { id: 'beam', icon: '🛸', name: 'Tractor Beam', desc: 'Abduct googlies for cash (E)', max: 10, cost: 180, grow: 1.6, fx: l => `${Math.round((7 + l * 1.2) * 4.4)} m wide · $×${(1 + l * 0.3).toFixed(1)}` },
  { id: 'magnet', icon: '🧲', name: 'Coin Magnet', desc: 'Grab coins from further away', max: 8, cost: 100, grow: 1.5, fx: l => `${Math.round((12 + l * 7) * 2.5)} m` },
  { id: 'drone', icon: '🤖', name: 'Paint Drones', desc: 'Little helpers that paint for you', max: 4, cost: 1400, grow: 2.8, fx: l => `${l} drone${l === 1 ? '' : 's'}` },
  { id: 'turret', icon: '🎯', name: 'Auto-Turret', desc: 'Shoots fighters and turrets by itself', max: 8, cost: 800, grow: 1.8, fx: l => l ? `${Math.round(6 * (1 + 0.45 * l))} dmg · 3/s` : 'none' },
  { id: 'nuke', icon: '🌈', name: 'Rainbow Nuke', desc: 'Charges while you paint. X to blast a whole region', max: 5, cost: 3200, grow: 2.4, fx: l => l ? `${Math.round((0.42 + l * 0.07) * 57)}° blast · charge ×${(0.6 + l * 0.2).toFixed(1)}` : 'locked' },
];
export const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
export const upgCost = (id, lv) => Math.round(UPG[id].cost * Math.pow(UPG[id].grow, lv) / 10) * 10;
/** What the UFO can do with these upgrade levels. */
export function shipStats(u = {}) {
  const l = id => u[id] || 0;
  return {
    rate: 4 + l('rate') * 0.8, splat: (4.6 + l('size') * 0.45) * WORLD, dmg: 10 * (1 + 0.36 * l('power')), barrels: 1 + l('spread'),
    tank: 80 + l('tank') * 40, pump: 10 + l('pump') * 3, hull: 100 * (1 + 0.36 * l('hull')), shield: l('shield') * 40, shieldRegen: 5 + l('shield') * 1.6,
    repair: l('repair') * 0.9, speed: (26 + l('engine') * 3) * 2.4, bomb: l('bomb') ? { r: (16 + l('bomb') * 2.6) * WORLD, cd: 8 - l('bomb') * 0.45 } : null,
    beam: { r: (7 + l('beam') * 1.2) * 2.2, mult: 1 + l('beam') * 0.3 }, magnet: (12 + l('magnet') * 7) * 2.5, drones: l('drone'),
    turret: l('turret') ? 6 * (1 + 0.45 * l('turret')) : 0, nuke: l('nuke') ? { a: 0.42 + l('nuke') * 0.07, charge: 0.6 + l('nuke') * 0.2 } : null,
  };
}

// ------------------------------------------------------------------ the campaign (your universe)
export function newCampaign() {
  return { v: 1, credits: 0, upg: {}, done: {}, partial: {}, cur: '0-0-0', hull: '#7bd13b', stats: { planets: 0, splats: 0, abducted: 0, kills: 0, bosses: 0, earned: 0, time: 0 }, started: Date.now() };
}
/** Is this system open yet? System n opens when every planet of system n-1 is painted. */
export function systemOpen(camp, g, s) {
  const k = g * SYSTEMS + s;
  if (k === 0) return true;
  const pg = Math.floor((k - 1) / SYSTEMS), ps = (k - 1) % SYSTEMS;
  return system(pg, ps).planets.every(p => camp.done[p.key]);
}
export function planetOpen(camp, pl) {
  if (!systemOpen(camp, pl.g, pl.s)) return false;
  if (!pl.boss) return true;
  return system(pl.g, pl.s).planets.filter(p => !p.boss).every(p => camp.done[p.key]);    // the Guardian waits until the rest are yours
}
export function progress(camp) {
  let done = 0; for (const k in camp.done) if (camp.done[k]) done++;
  let sys = 0; for (let g = 0; g < GALAXIES.length; g++) for (let s = 0; s < SYSTEMS; s++) if (system(g, s).planets.every(p => camp.done[p.key])) sys++;
  return { done, total: totalPlanets, systems: sys, pct: done / totalPlanets };
}
/** The furthest open system (where the map starts). */
export function frontier(camp) {
  let last = [0, 0];
  for (let g = 0; g < GALAXIES.length; g++) for (let s = 0; s < SYSTEMS; s++) if (systemOpen(camp, g, s)) last = [g, s];
  return last;
}
export function cleanCampaign(c) {
  const n = newCampaign();
  if (!c || typeof c !== 'object') return n;
  const out = { ...n, ...c, stats: { ...n.stats, ...(c.stats || {}) } };
  out.credits = Math.max(0, +out.credits || 0);
  out.upg = {}; for (const u of UPGRADES) { const v = Math.floor(+(c.upg || {})[u.id] || 0); if (v > 0) out.upg[u.id] = Math.min(u.max, v); }
  out.done = {}; for (const k in c.done || {}) if (planetByKey(k)) out.done[k] = typeof c.done[k] === 'string' && /^#[0-9a-f]{6}$/i.test(c.done[k]) ? c.done[k] : '#7bd13b';
  out.partial = {}; const pk = Object.keys(c.partial || {}).filter(k => planetByKey(k)).slice(-12); for (const k of pk) out.partial[k] = c.partial[k];
  if (!planetByKey(out.cur)) out.cur = '0-0-0';
  if (!/^#[0-9a-f]{6}$/i.test(out.hull)) out.hull = n.hull;
  return out;
}

// ------------------------------------------------------------------ the paint grid on a planet: 192 × 96 cells over (u, v)
export const GW = 192, GH = 96;
export const CELL_DIR = new Float32Array(GW * GH * 3), CELL_W = new Float32Array(GW * GH);
let WSUM = 0;
for (let j = 0; j < GH; j++) {
  const th = (j + 0.5) / GH * Math.PI, st = Math.sin(th), ct = Math.cos(th);
  for (let i = 0; i < GW; i++) {
    const ph = (i + 0.5) / GW * Math.PI * 2, k = j * GW + i;
    // three.js SphereGeometry: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)
    CELL_DIR[k * 3] = -Math.cos(ph) * st; CELL_DIR[k * 3 + 1] = ct; CELL_DIR[k * 3 + 2] = Math.sin(ph) * st;
    CELL_W[k] = st; WSUM += st;
  }
}
export const CELL_WSUM = WSUM;
/** Direction (unit vector) → texture coords u (0..1 around) and t (0 top .. 1 bottom). */
export function dirToUT(x, y, z) { const u = ((Math.atan2(z, -x) / (Math.PI * 2)) + 1) % 1; const t = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI; return [u, t]; }
/** Visit every cell within angle a of direction d. */
export function forCells(d, a, fn) {
  const [, t] = dirToUT(d[0], d[1], d[2]);
  const j0 = Math.max(0, Math.floor((t - a / Math.PI) * GH) - 1), j1 = Math.min(GH - 1, Math.ceil((t + a / Math.PI) * GH) + 1);
  const ca = Math.cos(a);
  for (let j = j0; j <= j1; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    if (CELL_DIR[k * 3] * d[0] + CELL_DIR[k * 3 + 1] * d[1] + CELL_DIR[k * 3 + 2] * d[2] >= ca) fn(k);
  }
}
/** Run-length encode / decode the grid for saves and late joiners. */
export function rle(grid) { const out = []; let cur = grid[0], n = 0; for (let i = 0; i < grid.length; i++) { if (grid[i] === cur && n < 4000) n++; else { out.push(cur, n); cur = grid[i]; n = 1; } } out.push(cur, n); return out.join('.'); }
export function unrle(s) { const g = new Uint8Array(GW * GH); if (!s) return g; const a = String(s).split('.').map(Number); let p = 0; for (let i = 0; i + 1 < a.length; i += 2) { const v = a[i] & 7, n = a[i + 1]; for (let k = 0; k < n && p < g.length; k++) g[p++] = v; } return g; }
