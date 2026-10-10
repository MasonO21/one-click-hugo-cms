// Weapon bench: a continuous mixed horde (Ch1 minute-4 mix without Bloaters), the Shepherd kiting in a slow circle,
// one weapon (+ its partner passive at Lv1), no legion, god mode. Reports effective DPS (HP actually removed, no overkill)
// and kills/min for every weapon at Lv5 and evolved. Needs the dev server.
// usage: HP=8 RATE=22 SECS=50 node scripts/weapon-bench.mjs http://localhost:5173/ [soulBolt,chains,...]
//        LV=1 ... benches the bare weapon at that level instead (what a hero starts a run with), no evolution
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const URL = process.argv[2]; const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const HP = +(process.env.HP || 4), RATE = +(process.env.RATE || 9), SECS = +(process.env.SECS || 60), LV = +(process.env.LV || 0);
const W = {
  soulBolt: [{ soulBolt: 5, might: 1 }, 'soulStorm'], skullHalo: [{ skullHalo: 5, minionFury: 1 }, 'boneCrown'],
  scythe: [{ scythe: 5, haste: 1 }, 'harvestMoon'], chains: [{ chains: 5, frenzy: 1 }, 'chainsOfPerdition'],
  spears: [{ spears: 5, vitality: 1 }, 'ossuaryBarrage'], gravePulse: [{ gravePulse: 5, soulMagnet: 1 }, 'requiem'],
  witchfire: [{ witchfire: 5, raiseDead: 1 }, 'hallowPyre'],
  gravefall: [{ gravefall: 5, legionCap: 1 }, 'necropolis'], soulLeech: [{ soulLeech: 5, graveWard: 1 }, 'vampiricCommunion'],
};
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(URL); await p.waitForTimeout(2500);
const rows = [];
for (const [id, [lv, evo]] of Object.entries(W)) {
  if (ONLY && !ONLY.includes(id)) continue;
  for (const ev of LV ? [null] : [null, evo]) {
    const res = await p.evaluate(({ lv, ev, HP, RATE, SECS }) => {
      let a = 1234; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const app = window.__soulswarm; if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      app.profile.energy = 30; app.profile.flags.tutorialDone = true; app.profile.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
      app.engine.manual = true; app.startRun(1);
      const r = app.run; r.player.hurt = () => {}; r.addXp = () => {}; r.director = () => {}; r.stats.cap = 0;
      r.skillLv = { ...lv }; r.evolved = ev ? { [ev]: true } : {}; r.recomputeStats(); r.stats.cap = 0;
      const types = ['husk', 'husk', 'husk', 'husk', 'ghoul', 'ghoul', 'brute', 'brute', 'witch', 'husk'];
      let eff = 0, kills = 0; const orig = r.enemies.damage.bind(r.enemies);
      r.enemies.damage = (e, amt, o = {}) => { const live = e.active, h = e.hp; const k = orig(e, amt, o); if (live && o.source !== 'blast') { eff += Math.min(h, h - Math.max(0, e.hp)); if (k) kills++; } return k; };
      let acc = 0; const P = r.player;
      for (let i = 0; i < SECS * 30; i++) {
        acc += RATE / 30;
        while (acc >= 1) { acc--; if (r.enemies.count < 340) { const ang = Math.random() * 6.283, R = 9 + Math.random() * 4; r.enemies.spawn(types[(Math.random() * 10) | 0], P.x + Math.cos(ang) * R, P.z + Math.sin(ang) * R, { hpMul: HP, dmgMul: 1 }); } }
        r.input.tx = Math.cos(i / 30 * 0.5) * 0.55; r.input.tz = Math.sin(i / 30 * 0.5) * 0.55; r.input.moved = true;
        r.update(1 / 30);
      }
      return { dps: Math.round(eff / SECS), kpm: Math.round(kills / SECS * 60), alive: r.enemies.count };
    }, { lv: LV ? { [id]: LV } : lv, ev, HP, RATE, SECS });
    rows.push({ id, ev: ev || (LV ? 'Lv' + LV : 'Lv5'), ...res }); console.log(JSON.stringify(rows[rows.length - 1]));
  }
}
console.log(`\nsupply ≈ ${RATE}/s at hpMul ${HP}`);
for (const id of Object.keys(W)) { const a = rows.find((x) => x.id === id && x.ev === 'Lv5'), e = rows.find((x) => x.id === id && x.ev !== 'Lv5'); if (a && e) console.log(`${id.padEnd(11)} Lv5 ${String(a.dps).padStart(5)} dps ${String(a.kpm).padStart(4)} kpm alive ${String(a.alive).padStart(3)} | ${e.ev.padEnd(18)} ${String(e.dps).padStart(5)} dps ${String(e.kpm).padStart(4)} kpm alive ${String(e.alive).padStart(3)} | x${(e.dps / a.dps).toFixed(2)}`); }
await b.close();
