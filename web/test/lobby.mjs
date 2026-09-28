// Two players online: A makes a UFO with their universe, B climbs in by code as a gunner, they chat, A buys an
// upgrade and launches; both get the planet; B aims and fires paint; A hands B the wheel; B leaves.
// URL=ws://localhost:8151 node test/lobby.mjs
import WebSocket from 'ws';
const url = process.env.URL || 'ws://localhost:8151';
const mk = name => new Promise(res => { const ws = new WebSocket(url); ws.log = []; ws.on('message', r => { const m = JSON.parse(r); ws.log.push(m); if (m.t === 'hello') { ws.id = m.id; ws.send(JSON.stringify({ t: 'me', name, color: name === 'ALICE' ? '#7bd13b' : '#b04aff', skin: 'none' })); res(ws); } }); });
const wait = (ws, f, ms = 8000) => new Promise((res, rej) => { const t0 = Date.now(); const iv = setInterval(() => { const m = ws.log.find(f); if (m) { clearInterval(iv); res(m); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout waiting')); } }, 20); });
const tx = (ws, m) => ws.send(JSON.stringify(m));
const A = await mk('ALICE'), B = await mk('BOB');
tx(A, { t: 'create', public: true, camp: { credits: 5000, upg: { rate: 2 }, done: {}, hull: '#b04aff' } });
const code = (await wait(A, m => m.t === 'joined')).code;
tx(B, { t: 'list' }); const list = await wait(B, m => m.t === 'list');
console.log('public list:', list.rooms.map(r => `${r.code} ${r.name} ${r.n}/${r.max}`).join(', '));
tx(B, { t: 'join', code });
const room = await wait(B, m => m.t === 'room' && m.players.length === 2);
console.log('B aboard; seats', room.players.map(p => `${p.name}:${p.seat}`).join(' '), '· pilot', room.pilot === A.id ? 'ALICE' : 'BOB');
const camp = await wait(B, m => m.t === 'camp');
console.log('B sees the captain\'s universe: credits', camp.camp.credits, 'hull', camp.camp.hull);
tx(B, { t: 'chat', text: 'nice ufo' });
console.log('chat reached A from', (await wait(A, m => m.t === 'chat' && m.text === 'nice ufo')).from);
tx(B, { t: 'buy', id: 'size' }); await new Promise(r => setTimeout(r, 200));
console.log('guest buying ignored:', !A.log.some(m => m.t === 'bought'));
tx(A, { t: 'buy', id: 'size' });
console.log('captain bought:', (await wait(B, m => m.t === 'bought')).id);
tx(A, { t: 'go' });
const pa = await wait(A, m => m.t === 'planet'), pb = await wait(B, m => m.t === 'planet');
console.log('both got planet', pa.key, pb.key, 'turrets', pa.turrets.length);
// B (gunner) aims straight down and fires
const up = pb.ship.p.map(v => v / Math.hypot(...pb.ship.p));
tx(B, { t: 'aim', d: up.map(v => -v), f: 1 });
const shot = await wait(A, m => m.t === 'shot' && m.s === 2);
console.log('A saw B\'s paint blob (seat', shot.s - 1, ')');
const splat = await wait(A, m => m.t === 'splat' && m.s === 2, 6000);
console.log('B\'s paint landed, angle', splat.a);
tx(B, { t: 'aim', d: up.map(v => -v), f: 0 });
await new Promise(r => setTimeout(r, 400));
const snap = [...A.log].reverse().find(m => m.t === 'snap');
console.log('coverage now', (snap.cov * 100).toFixed(2) + '%', 'credits', snap.cr);
tx(A, { t: 'pilot', id: B.id });
const r2 = await wait(A, m => m.t === 'room' && m.pilot === B.id);
console.log('wheel handed to BOB; seats', r2.players.map(p => `${p.name}:${p.seat}`).join(' '));
tx(B, { t: 'retreat' });
await wait(A, m => m.t === 'hangar');
const save = await wait(A, m => m.t === 'save');
console.log('retreat → hangar; captain got a save with partial paint', JSON.stringify(save.camp.partial[pa.key]?.pct), '%');
B.close();
const r3 = await wait(A, m => m.t === 'room' && m.players.length === 1 && m.pilot === A.id);
console.log('B left; A flies again, seats', r3.players.map(p => `${p.name}:${p.seat}`).join(' '));
process.exit(0);
