// A single run: owns the battlefield scene and drives every gameplay system.
import * as THREE from 'three';
import { World } from './world.js';
import { Particles, hdr } from '../engine/particles.js';
import { GlowSprites, makeShadowMaterial } from '../engine/materials.js';
import { Input } from '../engine/input.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Legion } from './legion.js';
import { Projectiles } from './projectiles.js';
import { Weapons } from './weapons.js';
import { Pickups } from './pickups.js';
import { Gates } from './gates.js';
import { Boss } from './boss.js';
import { Hazards } from './hazards.js';
import { Rites } from './rites.js';
import { Affixes } from './affixes.js';
import { Events } from './events.js';
import { Urns } from './urns.js';
import { computeStats, rollChoices, applyChoice, banishesPerRun } from './skills.js';
import { Streak } from './streak.js';
import { Tutorial } from './tutorial.js';
import { analytics } from '../meta/analytics.js';
import { ENEMIES, BASE, RUN_LENGTH, ENDLESS_BOSS_EVERY, ENDLESS_BOSSES, CAMPAIGN_LENGTH, xpForLevel, SKINS, CHAPTERS, chapterMods, MUTATORS, mergeMutators, BLOOD_MOON, BOSSES, BOSS_ORDER, bossFor, BESTIARY } from './data.js';
import { ENDLESS, ACTS, chapterLevel, foeDmgScale, sideScale } from './data.js';
import { HITSTOP, NOVA, LEVEL_PULSE, VOICE, TUTORIAL, BOSS_RUSH } from './data.js';
import { DIFFICULTY, DIFFICULTY_ELITES, difficultyLook, EVOLUTIONS, GRIMOIRE } from './data.js';

const PITCH = THREE.MathUtils.degToRad(57);
const ELITE_TIMES = [75, 150, 225, 290];
const TYPES = ['husk', 'ghoul', 'brute', 'witch', 'bloater', 'wraith', 'priest', 'siren', 'thornback', 'rat', 'caller', 'stalker'];
// the horde's mix by minute (TYPES order); Wraiths and Priests also wait for their chapter and minute (ENEMIES[t].from)
// and their alive cap (ENEMIES[t].cap); an act's own foe (ENEMIES[t].act: siren … stalker) only joins where its chapter
// weights it (CHAPTERS[].mods.weights), at that chapter's weight × these
const MIX = [
  [1, 0, 0, 0, 0, 0, 0,                0, 0, 0, 0, 0],
  [0.75, 0.25, 0, 0, 0, 0, 0,          0.05, 0.04, 0.12, 0.05, 0.05],
  [0.55, 0.25, 0, 0.1, 0.1, 0.05, 0,   0.07, 0.05, 0.16, 0.07, 0.07],
  [0.45, 0.2, 0.13, 0.12, 0.1, 0.06, 0.03, 0.08, 0.06, 0.18, 0.08, 0.08],
  [0.4, 0.2, 0.17, 0.13, 0.1, 0.07, 0.03,  0.08, 0.06, 0.2, 0.08, 0.08]];
const PACKS = { ghoul: 1, rat: 1 }; // these bank up and arrive as packs
const CORPSES = 48; // the horde's fallen kept for the Corpse Priests (oldest dropped first)
const NEW_FOE = { // a one-time tip when each Update 5 / Update 13 foe first appears
  wraith: 'A Grave Wraith drifts through your legion. Only YOU can strike it!',
  priest: 'A Corpse Priest raises the fallen. Hunt it down before it chants!',
  siren: 'A Drowned Siren sings your minions still. Kill her first!',
  thornback: 'A Thornback lowers its head: step out of its lane!',
  rat: 'Plague Rats pour in by the dozen. Keep moving!',
  caller: 'A Stormcaller marks a line: lightning follows. Step off it!',
  stalker: 'A Void Stalker marks a spot beside you, then blinks in. Move off the mark!',
};
const CHAPTER_NAMES = CHAPTERS.map((c) => c.name);
const _v = new THREE.Vector3(), _sp = { x: 0, y: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Run {
  constructor(engine, { app, loadout, chapter, mutators = null, bloodMoon = false, difficulty = 'normal', tutorial = false, rush = false, court = 'hollow', page = null }) {
    this.isRun = true;
    this.engine = engine;
    this.app = app;
    this.audio = app.audio;
    this.profile = app.profile;
    this.loadout = loadout;
    this.chapter = chapter;
    this.ui = null;
    this.onEnd = null;

    this.scene = new THREE.Scene();
    this.bloodMoon = !!bloodMoon; // weekend event: 8 elites, double rewards, a blood-red sky
    // Nightmare / Torment: always defined, Normal is the identity. Endless and the Daily Trial play Normal.
    this.diff = { ...(!chapter.endless && !(mutators && mutators.length) && DIFFICULTY[difficulty]) || DIFFICULTY.normal };
    this.rush = !!rush; // Boss Rush: the five chapter bosses back to back in the Abyss (BOSS_RUSH)
    this.court = BOSS_RUSH.courts[court] || BOSS_RUSH.courts.hollow; this.courtId = BOSS_RUSH.courts[court] ? court : 'hollow'; // the Hollow or the Fallen Court
    let look = this.rush ? ENDLESS : this.bloodMoon ? { ...chapter, ground: BLOOD_MOON.ground, groundB: BLOOD_MOON.groundB, fog: BLOOD_MOON.fog, rune: BLOOD_MOON.rune, rim: BLOOD_MOON.rim, recolor: 0.6 } : chapter;
    if (this.diff.tint) look = difficultyLook(look, this.diff.tint); // over the Blood Moon sky too
    this.scene.background = new THREE.Color(look.fog);
    this.camera = new THREE.PerspectiveCamera(45, 0.5, 0.5, 220);

    const skin = loadout.skin ? SKINS[loadout.skin] : null;
    this.heroColor = skin ? skin.legion : loadout.hero.legion || loadout.hero.color;
    this.heroColorObj = new THREE.Color(this.heroColor);
    this.weaponColorObj = this.heroColorObj.clone();

    this.world = new World(this.scene, look, { maxLights: engine.maxGroundLights, budget: engine.particleBudget });
    this.particles = new Particles(9000);
    this.particles.budget = engine.particleBudget;
    this.glow = new GlowSprites(2800);
    this.scene.add(this.particles.points, this.glow.points);
    this.shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), makeShadowMaterial(), 900);
    this.shadowMesh.count = 0; this.shadowMesh.frustumCulled = false; this.shadowMesh.renderOrder = 0;
    this.shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.shadowMesh);

    this.fx = new Effects(this);
    // Daily Trial boon and bane (empty for normal runs) and the inscribed Grimoire page (never in the tutorial or Boss Rush)
    this.mut = mergeMutators(mutators || [], tutorial || rush ? null : page);
    this.page = this.mut.page; this.pageDef = this.page ? GRIMOIRE.pages[this.page] : null;
    this.graveT = this.pageDef && this.pageDef.graves ? this.pageDef.graves.every : 0; this.feastBank = 0; // Restless Graves, Carrion Feast
    this.trial = !!(mutators && mutators.length);
    // the signature weapon: Lv1, or higher from a Grimoire page or Hero Mastery rank 7 (meta/mastery.js)
    this.skillLv = { [loadout.hero.weapon]: Math.max(1 + ((loadout.mastery && loadout.mastery.weaponLv) || 0), this.mut.startLv) };
    this.evolved = {};
    this.unions = {}; // Soul Unions taken (UNIONS in data.js)
    this.level = 1; this.xp = 0; this.xpNeed = xpForLevel(1);
    this.recomputeStats();
    this.player = new Player(this, loadout);
    this.enemies = new Enemies(this);
    this.legion = new Legion(this);
    this.legion.setColor(this.heroColor);
    this.projectiles = new Projectiles(this);
    this.projectiles.setBoltColor(this.heroColor);
    this.weapons = new Weapons(this);
    this.pickups = new Pickups(this);
    this.urns = new Urns(this); // Soul Urns and their offerings (urns.js)
    this.gates = new Gates(this);
    this.boss = new Boss(this);
    this.rites = new Rites(this); // the hero's signature active ability (RITE button)
    this.bossEnemy = null;
    this.input = new Input(engine.canvas);

    this.time = 0; this.t = 0;
    this.ended = false; this.paused = false; this.levelPending = false; this.levelQueue = 0; this.chestQueue = 0;
    this.counters = { kills: 0, raised: 0, novas: 0, gates: 0, chests: 0, elites: 0, bestStreak: 0, events: 0, rites: 0, urns: 0 };
    this.counters.byType = Object.fromEntries(BESTIARY.order.map((id) => [id, 0])); // Bestiary kills per foe and boss (meta/bestiary.js)
    this.streak = new Streak(this);
    this.nova = 0; this.novaQueue = []; this.novaT = 0; this.novaDmg = 0; this.novaSize = 0;
    this.burstQueue = []; this.burstT = 0; this.burstDmg = 0;
    this.bonusGold = 0;
    this.spawnAcc = 0; this.nextGate = 28; this.nextSwarm = 50; this.eliteIdx = 0;
    this.warned = false; this.bossSpawned = false; this.bossDead = false;
    this.endless = !!chapter.endless;
    this.nextBossAt = this.endless ? ENDLESS_BOSS_EVERY : RUN_LENGTH;
    this.bossKills = 0;
    this.nextElite = 0;
    this.freeRevives = loadout.revives; this.revivesUsed = 0; this.deathT = -1;
    this.camTarget = new THREE.Vector3(); this.camPos = new THREE.Vector3(0, 30, 20); this.camW = 12.5;
    this.maxEnemies = engine.qName === 'low' ? 200 : engine.qName === 'high' ? 340 : 280;
    this.hintsShown = {};
    this.tutorial = !this.profile.flags.tutorialDone;
    this.minionLightIdx = 0;
    // chapter identity (CHAPTERS[].mods; Endless rotates it by depth), ground hazards, Witch lobs, Ghoul packs
    this.mods = chapterMods(chapter); this.modDepth = 0; this.modBannerAt = 0; // the run intro card (runui.js) names the chapter and its twist
    this.eliteTimes = (!this.endless && this.mods.elites) || ELITE_TIMES;
    if (this.mut.eliteEvery) this.eliteTimes = Array.from({ length: Math.floor((RUN_LENGTH - 10) / this.mut.eliteEvery) }, (_, i) => (i + 1) * this.mut.eliteEvery);
    this.gateEvery = this.mut.gateEvery || 40;
    if (this.bloodMoon && !this.endless) this.eliteTimes = BLOOD_MOON.elites;
    if (this.diff.extraElites) this.eliteTimes = this.eliteTimes.concat(DIFFICULTY_ELITES.slice(0, this.diff.extraElites)).sort((a, b) => a - b);
    this.trialBannerAt = this.trial || this.bloodMoon || this.diff.id !== 'normal' ? 3.6 : 0;
    this.packAcc = 0; this.packN = 0;
    this.corpses = []; // the horde's fallen that did not rise: { x, z, t, claim } (claim: a priest's uid, -1 once raised)
    this.hazards = new Hazards(this);
    this.affixes = new Affixes(this); // elite affixes (affixes.js)
    this.events = new Events(this);   // mid-run events and shrine blessings (events.js)
    this.projectiles.initLobs();
    this.resize(engine.w, engine.h);
    this.camPos.copy(this.desiredCam());
    // the beginner tutorial (tutorial.js): its steps direct the run until the King rises, who comes when they say
    this.guide = tutorial ? new Tutorial(this) : null;
    if (this.guide) { this.tutorial = true; this.nextBossAt = Infinity; }
    this.banished = new Set(); this.banishLeft = banishesPerRun(this); // level-up card banishes (skills.js; none in the tutorial)
    // Osric's congregation: the run opens with a legion already at his back (not in the tutorial, which teaches growing one,
    // nor in Boss Rush, which starts every Shepherd with a deep legion)
    const start = loadout.hero.passive.startLegion;
    if (start && !this.guide && !this.rush) this.legion.addMany(Math.min(start, this.stats.cap), this.player.x, this.player.z);
    // Boss Rush: a seasoned start, as a campaign player stands at the boss: the level, a veteran build (the first card of
    // `auto` draws), a deep legion, then the player's own opening draft; the first boss a moment after it
    if (this.rush) {
      const R = BOSS_RUSH;
      this.mut.stats.cap = (this.mut.stats.cap || 0) + R.cap;
      this.level = R.level; this.xpNeed = xpForLevel(this.level);
      for (let i = 0; i < R.auto; i++) applyChoice(this, rollChoices(this, 3)[0]);
      this.recomputeStats();
      this.legion.addMany(R.legion, this.player.x, this.player.z);
      this.draftLeft = R.draft; this.draftPicks = 0; this.nextBossAt = Infinity; // set once the draft is done
    }
  }

  // ---------------------------------------------------------------- scaling helpers
  get minute() { return this.time / 60; }
  hpMul() {
    const m = this.minute;
    // Endless Abyss runs far past 6:00, so it uses a flatter curve than the campaign.
    // Nightmare / Torment: the extra toughness ramps in over diff.ramp minutes (the opening stays winnable), and the boss's
    // arena adds have Normal HP, or they pile up at the alive cap and soak his fight (scripts/balance.mjs GOD=1)
    const D = this.diff, dh = this.bossSpawned ? 1 : 1 + (D.hp - 1) * Math.min(1, D.ramp ? m / D.ramp : 1);
    return this.chapter.hpMul * (this.endless ? 1 + 0.32 * m + 0.025 * m * m : 1 + 0.28 * m + 0.04 * m * m) * dh;
  }
  get lvl() { return chapterLevel(this.chapter); } // the chapter's scaling level (data.js SCALE; the Endless Abyss plays at 6)
  dmgMul() { return (1 + 0.1 * this.minute) * foeDmgScale(this.lvl) * (this.bossSpawned ? 1 : this.diff.dmg); } // arena adds are plain adds: the boss carries the difficulty
  recomputeStats() {
    this.stats = computeStats(this.loadout, this.skillLv, this.chapter, this.level);
    const ms = this.mut.stats, S = this.stats;
    if (ms.raise) S.raise = Math.max(0, Math.min(0.85, S.raise + ms.raise));
    if (ms.dmgMul) S.dmgMul *= ms.dmgMul; // the Glass Shepherd page
    if (ms.ward) S.ward *= ms.ward; //   (damage taken)
    if (ms.maxHp) S.maxHp = Math.round(S.maxHp * ms.maxHp); // Carrion Feast
    if (ms.cap) S.cap = Math.min(BASE.hardLegionMax, S.cap + ms.cap);
    if (ms.nova) S.novaMul *= ms.nova;
    if (ms.minionDmg) S.minionDmg *= ms.minionDmg;
    if (ms.minionHp) S.minionHp *= ms.minionHp;
    if (this.events) this.events.applyStats(S); // Shrine of Souls blessings
  }

  onQuality(q) {
    this.particles.budget = q.particles;
    this.world.maxLights = q.lights;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  hint(key, text) {
    if (this.hintsShown[key] || this.profile.flags.hints[key]) return;
    this.hintsShown[key] = true;
    this.profile.flags.hints[key] = true;
    if (this.ui && !this.guide) this.ui.hint(text); // the tutorial's coach teaches these itself
  }

  // ---------------------------------------------------------------- director
  pickType() {
    const m = this.minute, w = this._mix || (this._mix = new Array(TYPES.length));
    const row = MIX[Math.min(MIX.length - 1, Math.floor(m))], ch = this.endless ? CAMPAIGN_LENGTH : this.lvl; // the Abyss holds every act's foes (where its rotation calls them)
    // chapter modifiers re-weight the mix (e.g. Ember Wastes ×1.8 Witches); Daily Trial banes can too (Witching Hour)
    const mul = this.mods.weights, mw = this.mut.weights;
    let total = 0;
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i], d = ENEMIES[t];
      w[i] = row[i] * ((mul && mul[t]) || 1) * ((mw && mw[t]) || 1);
      if (d.from && (ch < d.from.ch || m < d.from.minute || this.enemies.counts[t] >= d.cap)) w[i] = 0;
      if (d.act && !(mul && mul[t])) w[i] = 0; // an act's foe: only where its chapter calls for it
      total += w[i];
    }
    let r = Math.random() * total;
    for (let i = 0; i < TYPES.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) return TYPES[i]; }
    return 'husk';
  }

  /** The inscribed Grimoire page's own clocks: Carrion Feast's healing bank refills; Restless Graves raise the fallen. */
  updatePage(dt) {
    const D = this.pageDef;
    if (D.feast) this.feastBank = Math.min(D.feast.cap, this.feastBank + D.feast.cap * dt);
    if (D.graves && (this.graveT -= dt) <= 0) { this.graveT = D.graves.every; this.raiseGraves(D.graves); }
  }

  /** Restless Graves: up to n of the horde's un-risen dead within r m of the Shepherd rise as Shades (the newest first,
   *  under the legion cap; a corpse a Corpse Priest is chanting over is spared). Returns how many rose. */
  raiseGraves(G) {
    const L = this.corpses, P = this.player, life = ENEMIES.priest.raise.corpse, now = this.time;
    let n = 0;
    for (let i = L.length - 1; i >= 0 && n < G.n && this.legion.count < this.stats.cap; i--) {
      const k = L[i];
      if (k.claim || now - k.t >= life || (k.x - P.x) ** 2 + (k.z - P.z) ** 2 > G.r * G.r) continue;
      k.claim = -1; // used up
      this.legion.raise(k.x, k.z, { burstY: -0.6 });
      this.counters.raised++; n++;
    }
    if (n) { this.particles.ring(P.x, P.z, G.r, 30, hdr(0x9dffb8, 2.4), { life: 0.5, size: 0.4, y: 0.2 }); this.audio.sfx('raise', { volume: 0.4, pitch: 0.8 }); }
    return n;
  }

  /** A Corpse Priest claims up to n unclaimed corpses within reach (the newest first); null when there are none. */
  claimCorpses(e, reach, n) {
    const L = this.corpses, life = ENEMIES.priest.raise.corpse, now = this.time;
    let w = 0;
    for (let i = 0; i < L.length; i++) { const k = L[i]; if (k.claim !== -1 && now - k.t < life) L[w++] = k; }
    L.length = w;
    let out = null;
    for (let i = L.length - 1; i >= 0; i--) {
      const k = L[i];
      if (k.claim || (k.x - e.x) ** 2 + (k.z - e.z) ** 2 > reach * reach) continue;
      k.claim = e.uid; (out || (out = [])).push(k);
      if (out.length >= n) break;
    }
    return out;
  }

  /** Ghouls arrive in packs from one direction (almost always ahead), each member flanking at its own angle across ±flank. */
  spawnPack(n, type = 'ghoul') {
    const P = this.player, G = ENEMIES[type];
    let c = this.spawnPoint();
    for (let k = 0; k < 2 && (c.x - P.x) * P.vx + (c.z - P.z) * P.vz < 0; k++) c = this.spawnPoint();
    const ax = c.x - P.x, az = c.z - P.z, l = Math.hypot(ax, az) || 1, px = -az / l, pz = ax / l;
    for (let i = 0; i < n && this.enemies.count < this.maxEnemies; i++) {
      const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      const e = this.spawnEnemy(type, { at: { x: c.x + px * u * 1.8 + (Math.random() - 0.5) * 0.6, z: c.z + pz * u * 1.8 + (Math.random() - 0.5) * 0.6 } });
      if (e) e.flank = -u * G.flank; // the left of the pack swings left, the right swings right
    }
  }

  spawnPoint(bias = true) {
    const P = this.player;
    let a = Math.random() * Math.PI * 2;
    if (bias && (P.vx || P.vz) && Math.random() < 0.45) a = Math.atan2(P.vz, P.vx) + (Math.random() - 0.5) * 1.6;
    let R = 11;
    for (let i = 0; i < 14; i++) {
      _v.set(P.x + Math.cos(a) * R, 0.5, P.z + Math.sin(a) * R);
      const p = this.engine.project(_v, this.camera, _sp);
      if (!p || p.x < -40 || p.x > this.engine.w + 40 || p.y < -60 || p.y > this.engine.h + 40) break;
      R += 2.5;
    }
    return { x: P.x + Math.cos(a) * R, z: P.z + Math.sin(a) * R };
  }

  spawnEnemy(type, opts = {}) {
    const p = opts.at || this.spawnPoint();
    const e = this.enemies.spawn(type, p.x, p.z, { hpMul: this.hpMul() * this.mut.hp, dmgMul: this.dmgMul(), elite: !!opts.elite });
    if (e && this.mut.speed !== 1) e.speed *= this.mut.speed;
    if (e && NEW_FOE[type]) this.hint(type, NEW_FOE[type]);
    return e;
  }

  director(dt) {
    const m = this.minute;
    if (this.guide && !this.bossSpawned) { this.guide.director(dt); return; }
    if (this.rush && !this.bossSpawned) { this.rushDirector(); return; }
    if (!this.bossSpawned) {
      // Endless: each depth (boss kill) rotates the chapter modifiers; announce once the depth banner has played
      if (this.endless && this.modDepth !== this.bossKills) {
        this.modDepth = this.bossKills;
        this.mods = chapterMods(this.chapter, this.modDepth);
        this.hazards.setMods(this.mods);
        this.modBannerAt = this.time + 3;
      }
      if (this.modBannerAt && this.time >= this.modBannerAt) {
        this.modBannerAt = 0;
        const src = this.endless ? this.chapter.mods.rotate[this.modDepth % this.chapter.mods.rotate.length] - 1 : -1;
        const title = !this.endless ? this.chapter.name.toUpperCase() : this.modDepth ? 'THE ABYSS SHIFTS' : 'ENDLESS ABYSS';
        if (this.mods.tag) this.ui.banner(title, src >= 0 ? `${CHAPTER_NAMES[src]}: ${this.mods.tag}` : this.mods.tag, 'ember');
      }
      const rate = (1.1 + 0.85 * m + 0.22 * m * m) * this.chapter.rate * this.mut.spawn * this.diff.spawn;
      this.spawnAcc = Math.min(6, this.spawnAcc + rate * dt);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.enemies.count >= this.maxEnemies) continue;
        const t = this.pickType();
        if (!PACKS[t]) { this.spawnEnemy(t); continue; }
        // Ghouls (and Plague Rats) bank up and arrive as a pack, so the mix per enemy stays the same
        const B = this.packs || (this.packs = {}), b = B[t] || (B[t] = { acc: 0, n: 0 });
        const pk = (t === 'ghoul' && this.mods.pack) || ENEMIES[t].pack;
        if (!b.n) b.n = pk[0] + Math.floor(Math.random() * (pk[1] - pk[0] + 1));
        if (++b.acc >= b.n) { this.spawnPack(b.n, t); b.acc = b.n = 0; }
      }
      if (this.trialBannerAt && this.time >= this.trialBannerAt) {
        this.trialBannerAt = 0;
        if (this.trial) this.ui.banner('DAILY TRIAL', this.mut.ids.map((id) => MUTATORS[id].name).join('  ·  '), 'soul');
        else if (this.bloodMoon) this.ui.banner('BLOOD MOON', `Twice the elites · double gold and gems${this.diff.id !== 'normal' ? ' · ' + this.diff.name : ''}`, 'ember');
        else this.ui.banner(this.diff.name.toUpperCase(), `More elites, deadlier foes · ×${this.diff.gold} gold`, 'diff-' + this.diff.id);
        this.audio.voice(this.trial ? 'a_trial' : this.bloodMoon ? 'a_bloodmoon' : 'a_' + this.diff.id);
      }
      if (this.time >= this.nextGate) { this.nextGate += this.gateEvery; this.gates.spawnPair(); }
      if (this.time >= this.nextSwarm) { this.nextSwarm += 60; this.swarmRing(); }
      const times = this.eliteTimes;
      const eliteDue = this.eliteIdx < times.length ? this.time >= times[this.eliteIdx]
        : this.endless && this.time >= this.nextElite;
      if (eliteDue) {
        const t = ['husk', 'brute', 'witch', 'brute'][this.eliteIdx++ % 4];
        // Endless keeps them coming; a modifier set with more elites (Crimson Throne) shortens the gap
        if (this.eliteIdx >= times.length) this.nextElite = this.time + 70 * ELITE_TIMES.length / (this.mods.elites || ELITE_TIMES).length / (this.bloodMoon ? 2 : 1);
        const b = this.affixes.roll(this.spawnEnemy(t, { elite: true })); // e.g. "WARDED BRUTE"
        this.ui.banner(b.title, b.sub, 'gold');
        this.audio.sfx('warning', { volume: 0.5 });
        this.audio.voice('a_elite');
      }
      if (!this.warned && this.time >= this.nextBossAt - 8) this.warnBoss();
      this.events.director();
      if (this.time >= this.nextBossAt) this.spawnBoss();
    } else if (!this.bossDead) this.boss.director(dt); // boss-time adds come from the arena edge (boss.js)
  }

  /** Boss Rush between bosses: the opening draft, then each boss a few seconds after the last fell. */
  rushDirector() {
    if (this.draftLeft > 0) { // the War Council: picks before the first boss, once the title card has had a moment (the clock waits for them)
      if (!this.levelPending && this.time >= 1.2) { this.chestQueue += this.draftLeft; this.draftPicks = this.draftLeft; this.draftLeft = 0; this.showLevelUp(); }
      return;
    }
    if (this.nextBossAt === Infinity) { if (this.draftPicks > 0 || this.levelPending) return; this.nextBossAt = this.time + BOSS_RUSH.first; }
    if (!this.warned && this.time >= this.nextBossAt - BOSS_RUSH.warn) this.warnBoss();
    if (this.time >= this.nextBossAt) this.spawnBoss();
  }

  /** The boss warning: the chapter's boss; in the Endless Abyss the next in turn, each one "returns" once all five have
   *  fallen; a campaign boss back from an earlier act (chapter tier > 1) returns too, under its act's epithet. */
  warnBoss() {
    this.warned = true;
    const B = BOSSES[this.bossId], tier = !this.endless && !this.rush ? this.chapter.tier || 1 : 1;
    const back = (!this.rush && this.bossKills >= ENDLESS_BOSSES.length) || tier > 1;
    const sub = this.rush ? `Boss ${this.bossKills + 1} of ${this.court.bosses.length}` : this.bossKills ? `Stronger than before (×${this.bossKills + 1})`
      : tier > 1 ? `${ACTS[this.chapter.act - 1].epithet} ${B.name}: stronger than before` : 'Gather your legion';
    this.ui.bossColor(B.color);
    this.ui.banner(`${B.title.toUpperCase()} ${back ? 'RETURNS' : 'APPROACHES'}`, sub, 'boss');
    this.audio.sfx('warning');
    this.audio.voice(back ? `${B.voice}_return` : B.voice);
    this.app.haptic('warning');
  }

  spawnBoss() {
    this.bossSpawned = true;
    this.gates.despawn();
    this.boss.spawn(this.rush ? BOSS_RUSH.hp[this.bossKills] : 1 + 0.6 * this.bossKills);
  }

  swarmRing() {
    const P = this.player;
    const n = Math.min(40, 18 + Math.floor(this.minute * 5));
    const R = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnEnemy(this.minute > 2 && i % 3 === 0 ? 'ghoul' : 'husk', { at: { x: P.x + Math.cos(a) * R, z: P.z + Math.sin(a) * R } });
    }
    this.ui.banner('SURROUNDED', 'The horde closes in', 'ember');
    this.audio.sfx('warning', { volume: 0.4, pitch: 0.8 });
  }

  // ---------------------------------------------------------------- kills, xp, chests
  /** Soul Nova charge in kill-equivalents (an elite is worth 6 kills, a gate 3). Nothing charges mid-detonation. */
  addNovaCharge(kills) {
    if (this.tutorial && this.counters.novas === 0) kills *= 2.5; // first run: the first Nova comes early so it gets taught
    if (this.guide) kills *= this.guide.novaMul(); // ...exactly when the tutorial teaches it
    if (this.novaQueue.length === 0) this.nova = Math.min(1, this.nova + kills * this.stats.novaMul / BASE.novaKills);
    if (this.nova >= 1 && !this.hintsShown.nova) this.hint('nova', 'Soul Nova is ready! Tap NOVA to detonate your legion.');
  }

  onEnemyKilled(e, source, noRaise) {
    if (e.ev && this.events.onKill(e)) return; // the Soul Thief or the Cursed Coffin: events.js pays out
    this.affixes.onKill(e);
    this.counters.kills++;
    this.counters.byType[e.type]++; // Bestiary: a gilded elite counts as its base type
    this.streak.onKill();
    if (e.elite) { this.counters.elites++; this.fx.hitStop(HITSTOP.elite); }
    this.addNovaCharge(e.elite ? 6 : 1);
    const d = ENEMIES[e.type];
    const gem = e.reborn ? null : this.pickups.dropGem(e.x, e.z, (d ? d.xp : 1) * (e.elite ? 12 : 1) * this.diff.xp); // harder foes, richer souls; a Priest's hollow Husks hold none
    // the lantern's dead burn behind the Shepherd (their souls follow its light); Osric's legion tithes him what it slays
    if (gem && (source === 'witchfire' || (source === 'minion' && this.loadout.hero.passive.tithe))) gem.pulled = true;
    if (e.elite) { if (!(e.aff && e.aff.noChest)) this.pickups.dropSpecial('chest', e.x, e.z); } // a coffin's mini-elite carries none
    else {
      const r = Math.random();
      if (r < 0.006) this.pickups.dropSpecial('heart', e.x, e.z);
      else if (r < 0.009) this.pickups.dropSpecial('magnet', e.x, e.z);
    }
    if (source === 'witchfire' && this.evolved.hallowPyre) this.weapons.pyreBurst(e.x, e.z); // Hallow Pyre: the slain burst into flame
    let rose = false;
    if (!noRaise) {
      let chance = this.stats.raise * (this.novaQueue.length ? 0.5 : 1);
      if (e.burnUid === e.uid) chance = Math.min(0.85, chance + e.burnRaise); // Chains of Perdition: the burning rise more often
      if (this.evolved.necropolis && this.weapons.arsenal.graveNear(e.x, e.z)) chance = Math.min(0.85, chance + EVOLUTIONS.necropolis.raise); // the slain rise beside its graves
      if (source === 'skull' && this.evolved.boneCrown) chance = 1;
      const HP = this.loadout.hero.passive;
      if (HP.pulseRaise && (source === 'pulse' || (e.tollUid === e.uid && e.tollT > this.time))) chance = Math.min(0.85, chance * HP.pulseRaise); // Liora: the bell marks the dead
      if (HP.witchRaise && source === 'witchfire') chance = Math.min(0.85, chance * HP.witchRaise); // Grimsby: what his fire takes, rises
      if (HP.novaRaise && source === 'nova') chance = Math.min(0.85, Math.max(chance, this.stats.raise * HP.novaRaise)); // Seraphine: what her Nova burns rises (never halved)
      if (this.tutorial && this.counters.raised < 5) chance = 1; // first run: the first five kills always rise
      if (this.guide) chance = Math.max(chance, TUTORIAL.raise); // the tutorial's legion grows fast enough to teach it
      if (this.rites.graveCall) chance = 1; // Vael's Grave Call: every kill rises (the cap still holds)
      if (HP.leechRaise && source === 'leech') chance = 1; // Isolde: what her beams drain dry always rises
      if (e.bloodUid === e.uid && e.bloodT > this.time) { chance = 1; this.rites.bloodBurst(e); } // Isolde's Crimson Sabbath: the marked rise (Ascended: their mist marks the next)
      if (Math.random() < chance) {
        if (this.legion.count < this.stats.cap) {
          // the minion keeps the identity of what it was (variant by type; elites rise as Champions)
          this.legion.raise(e.x, e.z, { kind: e.type, elite: e.elite || this.rites.champRise() }); // Ascended Grave Call: every third rises a Champion
          this.counters.raised++; rose = true;
          if (this.rites.graveCall) this.rites.pillar(e.x, e.z);
          if (this.counters.raised === 1) this.hint('raise', 'Slain foes rise to fight for you. This is your LEGION!');
        } else this.legion.healWeakest(); // at the cap the roll mends the weakest minion instead
      }
    }
    // what did not rise is left for the Corpse Priests (never a Priest itself, nor a Husk one of them raised)
    if (!rose && !e.reborn && !e.ev && e.type !== 'priest') {
      const L = this.corpses;
      if (L.length >= CORPSES) L.shift();
      L.push({ x: e.x, z: e.z, t: this.time, claim: 0 });
    }
    if (this.pageDef && this.pageDef.feast && !this.player.dead) { // Carrion Feast: each kill feeds the Shepherd, from a bank
      const F = this.pageDef.feast, take = Math.min(F.heal, this.feastBank);
      if (take > 0) { this.feastBank -= take; this.player.heal(take, true); }
    }
    this.audio.sfx('kill', { volume: 0.35 });
  }

  addXp(v) {
    this.xp += v * this.streak.xpMul * this.events.xpMul * this.mut.xp; // Soul Frenzy, Soul Feast blessing, the Soul Furnace page
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpForLevel(this.level);
      this.levelQueue++;
    }
    if (this.levelQueue > 0 && !this.levelPending && !this.ended) this.showLevelUp();
  }

  /** Shows the next pending pick: Relic Chests first, then level-ups. Gameplay pauses until a card is chosen. */
  showLevelUp() {
    if (this.levelPending || this.ended) return;
    if (this.bossDead && !this.endless) { this.levelQueue = this.chestQueue = 0; return; } // the chapter is won; no more cards
    const chest = this.chestQueue > 0;
    if (!chest && this.levelQueue <= 0) return;
    this.levelPending = true;
    this.recomputeStats();
    const P = this.player;
    if (!chest) {
      this.particles.burst(P.x, 1, P.z, 50, hdr(0xffd04a, 3), { speed: 6, life: 0.8, size: 0.4, up: 1.5 });
      this.fx.shockwave(P.x, P.z, 4, 0xffd04a, 0.5, 0.1);
      this.fx.shockwave(P.x, P.z, LEVEL_PULSE.vacuum, this.heroColor, 0.6, 0.06); // the pulse that draws the shards in
      this.pickups.magnetNear(P.x, P.z, LEVEL_PULSE.vacuum);
      this.audio.sfx('levelup');
      this.app.haptic('success');
    }
    this.input.reset();
    const choices = rollChoices(this, 3);
    const draft = chest && this.draftPicks > 0 ? [BOSS_RUSH.draft - this.draftPicks + 1, BOSS_RUSH.draft] : null; // Boss Rush: the opening picks
    this.ui.showLevelUp(choices, this.level, (c) => {
      applyChoice(this, c);
      analytics.track('card_pick', { id: c.id, level: this.level, kind: c.kind }); // pick rates (LIVEOPS.md §5)
      if (c.kind === 'evolution' || c.kind === 'union') this.celebrateEvolution(c); else this.audio.sfx('select');
      if (chest) { this.chestQueue--; if (draft) this.draftPicks--; } else this.levelQueue--;
      this.levelPending = false;
      this.player.invuln = Math.max(this.player.invuln, 0.6);
      if (this.levelQueue > 0 || this.chestQueue > 0) setTimeout(() => { if (!this.ended && !this.levelPending) this.showLevelUp(); }, 120);
    }, { chest, draft });
  }

  /** An evolution is the build's payoff: slow-mo, a gold shockwave that hurls the horde back, the legendary fanfare. */
  celebrateEvolution(c) {
    const P = this.player, gold = hdr(0xffd04a, 2.6);
    this.fx.slowMo(0.35, 0.7);
    this.fx.flash(0.15); this.fx.shake(0.4);
    this.fx.shockwave(P.x, P.z, 9, 0xffd04a, 0.7, 0.08);
    this.fx.shockwave(P.x, P.z, 6, this.heroColor, 0.5, 0.12);
    this.fx.light(P.x, P.z, 10, 1.6, new THREE.Color(0xffd04a), 0.8);
    this.particles.ring(P.x, P.z, 3, 70, gold, { life: 0.8, size: 0.6 });
    this.particles.burst(P.x, 1.2, P.z, 80, gold, { speed: 10, life: 1.0, size: 0.5, up: 2.5 });
    this.enemies.query(P.x, P.z, 8, (e) => {
      if (e.type === 'boss') return;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1, k = 16 / Math.max(1, e.mass * 0.6);
      e.kx += (dx / d) * k; e.kz += (dz / d) * k;
    });
    this.player.invuln = Math.max(this.player.invuln, 1.2);
    this.audio.sfx('legendary');
    this.audio.voice('a_evolution');
    this.app.haptic('heavy');
    this.ui.banner(c.name.toUpperCase(), c.kind === 'union' ? 'Soul Union · a weapon slot is free' : 'Weapon evolved', 'gold');
  }

  /** Elites drop a Relic Chest: a free pick of 3 cards. */
  openChest() {
    if (this.ended) return;
    const P = this.player;
    this.particles.burst(P.x, 1, P.z, 80, hdr(0xffd04a, 3.5), { speed: 8, life: 1, size: 0.5, up: 2 });
    this.fx.flash(0.3);
    this.audio.sfx('chest');
    this.app.haptic('success');
    this.chestQueue++;
    this.counters.chests++;
    this.showLevelUp();
  }

  // ---------------------------------------------------------------- Soul Nova
  /** The tap: invulnerability and cleared shots at once, then a short wind-up (the souls flare and stream into the
   *  Shepherd with a rising tone) before novaRelease() fires his blast and the chain ripples out. */
  triggerNova() {
    if (this.nova < 1 || this.ended || this.paused || this.levelPending || this.player.dead) return false;
    this.nova = 0;
    this.counters.novas++;
    const P = this.player, W = NOVA.windup;
    P.invuln = Math.max(P.invuln, 1.5 + W); // the Shepherd stands untouchable from the tap through the blast
    const size = this.novaSize = this.legion.count;
    const pts = this.legion.detonateAll();
    pts.sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
    const span = Math.min(0.75, 0.15 + pts.length * 0.003);
    // the Shepherd's blast leads the queue (so it fires even with no legion); a non-empty queue is "mid-detonation"
    this.novaQueue = [{ x: P.x, y: 1, z: P.z, t: W, self: true }];
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; p.t = W + (i / pts.length) * span; this.novaQueue.push(p); }
    this.novaT = 0;
    this.novaDmg = (35 + size * 0.5) * this.stats.dmgMul * sideScale(this.lvl);
    this.projectiles.clearEnemyShots();
    const c = hdr(this.heroColor, 2.6), k = W > 0 ? Math.max(1, Math.round(this.particles.budget * 2)) : 0;
    for (const p of pts) for (let j = 0; j < k; j++) { // each soul streams into the Shepherd, arriving as the blast fires
      const a = W * (0.75 + Math.random() * 0.25);
      this.particles.emit(p.x, p.y, p.z, (P.x - p.x) / a, (1.1 - p.y) / a, (P.z - p.z) / a, a, 0.5, 0.15, c[0], c[1], c[2], 1, 0, 0);
    }
    for (let j = 0; j < 36 && k; j++) { const a = (j / 36) * Math.PI * 2, ca = Math.cos(a) * 3.4, sa = Math.sin(a) * 3.4; this.particles.emit(P.x + ca, 0.4, P.z + sa, -ca / W, 2, -sa / W, W, 0.55, 0.2, c[0], c[1], c[2], 1, 0, 0); }
    this.fx.light(P.x, P.z, 7, 1.8, this.heroColorObj, W + 0.15);
    this.audio.sfx('nova_charge');
    this.app.haptic('medium');
    return true;
  }

  novaRelease() {
    const P = this.player, size = this.novaSize, R = 7;
    this.enemies.query(P.x, P.z, R, (e) => { this.enemies.damage(e, this.novaDmg * 1.2, { kx: e.x - P.x, kz: e.z - P.z, knock: 14, source: 'nova' }); });
    this.projectiles.clearEnemyShots(); // anything fired during the wind-up
    this.fx.hitStop(HITSTOP.nova);
    this.fx.shockwave(P.x, P.z, R * 1.5, this.heroColor, 0.6, 0.08);
    this.particles.ring(P.x, P.z, R, 90, hdr(this.heroColor, 3.5), { life: 0.5, size: 0.8 });
    this.particles.burst(P.x, 1, P.z, 80, [3, 3, 3.2], { speed: 12, life: 0.6, size: 0.6, up: 0.6 });
    this.fx.flash(0.85);
    this.fx.aberration(1);
    this.fx.shake(0.75);
    this.fx.slowMo(0.3, 0.55);
    this.fx.light(P.x, P.z, 14, 3, this.heroColorObj, 0.8);
    this.audio.sfx('nova');
    if (size >= VOICE.novaSouls) this.audio.voice('a_nova');
    this.app.haptic('heavy');
    if (this.ui) this.ui.bigNumber(size ? `${size} SOULS` : 'NOVA', size ? 'DETONATED' : 'UNLEASHED', true);
  }

  updateNova(dt) {
    if (!this.novaQueue.length) return;
    this.novaT += dt;
    const col = hdr(this.heroColor, 3.2);
    let i = 0;
    while (i < this.novaQueue.length && this.novaQueue[i].t <= this.novaT) {
      const p = this.novaQueue[i++];
      if (p.self) { this.novaRelease(); continue; }
      this.enemies.query(p.x, p.z, 2.6, (e) => { this.enemies.damage(e, this.novaDmg, { kx: e.x - p.x, kz: e.z - p.z, knock: 6, source: 'nova', silent: Math.random() < 0.6 }); });
      this.particles.burst(p.x, p.y, p.z, 14, col, { speed: 7, life: 0.5, size: 0.55, up: 0.8 });
      this.particles.burst(p.x, p.y, p.z, 4, [3, 3, 3], { speed: 2, life: 0.3, size: 1.0 });
      if (i % 4 === 0) this.fx.shockwave(p.x, p.z, 2.6, this.heroColor, 0.35, 0.14);
      if (i % 6 === 0) this.fx.light(p.x, p.z, 4, 1.4, this.heroColorObj, 0.4);
      if (i % 10 === 0) this.audio.sfx('explosion', { volume: 0.35, pitch: 1.2 + Math.random() * 0.4 });
    }
    this.novaQueue.splice(0, i);
  }

  /** Souls waiting in the Nova chain glow where they stood, swelling and flickering through the wind-up. */
  renderNova() {
    const Q = this.novaQueue, g = this.glow, c = this.heroColorObj, P = this.player, k = NOVA.windup ? Math.min(1, this.novaT / NOVA.windup) : 1;
    const s = 0.55 + 0.6 * k, a = 0.3 + 0.4 * k, w = 1.6, t = this.t * 40;
    for (let i = 0; i < Q.length; i++) { const p = Q[i]; if (!p.self) g.add(p.x, p.y, p.z, s * (1 + 0.18 * Math.sin(t + i)), c.r * w, c.g * w, c.b * w, a); }
    if (k < 1) g.add(P.x, 1.1, P.z, 1.2 + 3.5 * k, c.r * 2.5 * k, c.g * 2.5 * k, c.b * 2.5 * k, 0.9); // the Shepherd gathers them
  }

  /** Souls lost to a −N / ÷2 gate detonate at half Nova power, rippling out from the gate. */
  soulBurst(points, legionSize, x, z) {
    if (!points || !points.length) return;
    const pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z, d: (p.x - x) ** 2 + (p.z - z) ** 2 })).sort((a, b) => a.d - b.d);
    const span = Math.min(0.6, 0.12 + pts.length * 0.003);
    this.burstQueue = pts.map((p, i) => ({ ...p, t: (i / pts.length) * span }));
    this.burstT = 0;
    this.burstDmg = 0.5 * (35 + legionSize * 0.5) * this.stats.dmgMul * sideScale(this.lvl);
  }

  updateBursts(dt) {
    if (!this.burstQueue.length) return;
    this.burstT += dt;
    const col = hdr(this.heroColor, 2.6);
    let i = 0;
    while (i < this.burstQueue.length && this.burstQueue[i].t <= this.burstT) {
      const p = this.burstQueue[i++];
      this.enemies.query(p.x, p.z, 2.6, (e) => { this.enemies.damage(e, this.burstDmg, { kx: e.x - p.x, kz: e.z - p.z, knock: 5, source: 'nova', silent: Math.random() < 0.6 }); });
      this.particles.burst(p.x, p.y, p.z, 10, col, { speed: 6, life: 0.45, size: 0.5, up: 0.8 });
      if (i % 4 === 0) this.fx.shockwave(p.x, p.z, 2.6, this.heroColor, 0.3, 0.14);
      if (i % 12 === 0) this.audio.sfx('explosion', { volume: 0.3, pitch: 1.4 + Math.random() * 0.3 });
    }
    this.burstQueue.splice(0, i);
  }

  // ---------------------------------------------------------------- death, revive, victory
  onPlayerDeath() {
    if (this.ended) return;
    const P = this.player;
    if (this.freeRevives > 0) {
      this.freeRevives--;
      this.revive(true);
      this.ui.banner('UNDYING', 'Mordrake refuses to stay dead', 'gold');
      return;
    }
    P.dead = true;
    this.deathT = 0;
    this.fx.slowMo(0.2, 1.0);
    this.particles.burst(P.x, 1, P.z, 80, hdr(this.heroColor, 3), { speed: 6, life: 1, size: 0.5, up: 1 });
    this.audio.sfx('defeat');
    this.audio.voice('a_defeat');
    this.app.haptic('heavy');
  }

  revive(free = false) {
    const P = this.player;
    if (!free) this.revivesUsed++;
    P.dead = false;
    P.hp = P.maxHp;
    P.invuln = 2.5;
    this.deathT = -1;
    this.paused = false;
    this.projectiles.clearEnemyShots();
    this.enemies.query(P.x, P.z, 8, (e) => { this.enemies.damage(e, e.type === 'boss' ? 0.01 : e.maxHp * 0.5, { kx: e.x - P.x, kz: e.z - P.z, knock: 20, source: 'nova', silent: true }); });
    this.fx.shockwave(P.x, P.z, 10, 0xffd04a, 0.6, 0.1);
    this.particles.ring(P.x, P.z, 8, 80, hdr(0xffd04a, 3), { life: 0.5, size: 0.8 });
    this.fx.flash(0.6);
    this.audio.sfx('heal');
    this.audio.voice('a_revive');
    this.audio.playMusic(!this.bossSpawned ? 'battle' : this.boss.phase === 2 ? 'boss3' : 'boss');
  }

  /** The boss this run faces next (or is fighting): its chapter's, or in the Endless Abyss the next in turn. */
  get bossId() { return bossFor(this.chapter, this.bossKills); }

  onBossKilled(x, z) {
    const id = this.bossSpawned && this.boss.id ? this.boss.id : this.bossId, K = BOSSES[id]; // the one that fell (QA may call this with none up)
    this.counters.byType[id]++; // Bestiary: campaign victories and every Endless kill
    this.slainVoice = `${K.voice}_slain`;
    if (this.endless) return this.onEndlessBossKilled(x, z, K);
    if (this.rush && this.bossKills + 1 < this.court.bosses.length) return this.onRushBossKilled(x, z, K);
    if (this.rush) this.bossKills++; // the fifth: the Court is cleared
    this.bossDead = true;
    this.bossEnemy = null;
    this.fx.slowMo(0.15, 1.6);
    this.fx.flash(1);
    this.fx.shake(1);
    this.fx.aberration(1);
    const hex = K.color, col = hdr(hex, 4);
    this.particles.burst(x, 2, z, 250, col, { speed: 14, life: 1.4, size: 0.8, up: 1.5 });
    this.particles.burst(x, 2, z, 120, [3, 3, 3], { speed: 8, life: 1, size: 1, up: 2 });
    this.fx.shockwave(x, z, 16, hex, 1.0, 0.06);
    this.fx.light(x, z, 18, 4, new THREE.Color(hex), 1.5);
    this.audio.sfx('boss_slam');
    this.app.haptic('heavy');
    this.enemies.clearAll(true);
    this.projectiles.clearEnemyShots();
    this.pickups.magnetAll();
    if (this.rush) this.ui.banner('THE COURT FALLS', `All five bosses slain in ${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`, 'gold');
    else this.ui.banner('CHAPTER CLEARED', `${this.chapter.name} is free`, 'gold');
    this.audio.voice(this.slainVoice);
    if (!this.rush) this.audio.voice('a_cleared'); // queues behind the first line
    this.audio.stopMusic();
    // the rest of the victory beat plays out in update() so it respects pause and ends cleanly
    this.victory = { t: 0, x, z, raised: false, jingle: false };
  }

  updateVictory(realDt) {
    const v = this.victory;
    if (!v || this.ended || this.paused) return;
    v.t += realDt;
    if (!v.raised && v.t > 0.6) { v.raised = true; for (let i = 0; i < 30; i++) this.legion.raise(v.x + (Math.random() - 0.5) * 4, v.z + (Math.random() - 0.5) * 4); }
    if (!v.jingle && v.t > 0.9) { v.jingle = true; this.audio.sfx('victory'); }
    if (v.t > 3.2) this.end(true);
  }

  /** Boss Rush: a boss falls and the next is coming. A Relic Chest (the pick between bosses), souls and a heal; the
   *  run now scales as the next boss's chapter and takes its hazards (the first chapter's floor stays). */
  onRushBossKilled(x, z, K) {
    const R = BOSS_RUSH, P = this.player;
    this.bossKills++;
    this.bossSpawned = false; this.warned = false; this.bossEnemy = null;
    this.nextBossAt = this.time + R.gap;
    this.chapter = CHAPTERS[this.court.chapters[this.bossKills] - 1]; this.recomputeStats(); // the court's next chapter
    this.mods = chapterMods(this.chapter); this.hazards.setMods(this.mods); // and its ground hazards (the floor stays)
    this.fx.slowMo(0.25, 0.9);
    this.fx.flash(0.7); this.fx.shake(0.8); this.fx.aberration(0.8);
    const hex = K.color;
    this.particles.burst(x, 2, z, 200, hdr(hex, 4), { speed: 12, life: 1.2, size: 0.7, up: 1.5 });
    this.fx.shockwave(x, z, 14, hex, 0.9, 0.06);
    this.fx.light(x, z, 16, 3.5, new THREE.Color(hex), 1.2);
    this.audio.sfx('boss_slam'); this.app.haptic('heavy');
    this.enemies.clearAll(true);
    this.projectiles.clearEnemyShots();
    this.pickups.magnetAll();
    this.pickups.dropSpecial('chest', x, z);
    for (let i = 0; i < R.souls; i++) this.legion.raise(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4);
    P.heal(P.maxHp * R.heal);
    this.ui.bossBar(false);
    this.ui.banner(`${K.name.toUpperCase()} FALLS`, `${this.bossKills} of ${this.court.bosses.length} · ${BOSSES[this.bossId].name} rises next`, 'gold');
    this.audio.voice(this.slainVoice);
    this.audio.playMusic('battle');
  }

  /** Endless Abyss: the boss falls, the abyss deepens, the run continues (the next boss is the next in turn). */
  onEndlessBossKilled(x, z, K) {
    this.bossKills++;
    this.bossSpawned = false; this.warned = false;
    this.nextBossAt = this.time + ENDLESS_BOSS_EVERY;
    this.bossEnemy = null;
    // resume the gate/swarm rhythm from now instead of firing every slot missed during the fight
    this.nextGate = this.time + 12;
    this.nextSwarm = this.time + 30;
    this.fx.slowMo(0.25, 0.9);
    this.fx.flash(0.7); this.fx.shake(0.8); this.fx.aberration(0.8);
    const hex = K.color, col = hdr(hex, 4);
    this.particles.burst(x, 2, z, 200, col, { speed: 12, life: 1.2, size: 0.7, up: 1.5 });
    this.fx.shockwave(x, z, 14, hex, 0.9, 0.06);
    this.fx.light(x, z, 16, 3.5, new THREE.Color(hex), 1.2);
    this.audio.sfx('boss_slam'); this.app.haptic('heavy');
    this.pickups.magnetAll();
    this.pickups.dropSpecial('chest', x, z);
    for (let i = 0; i < 25; i++) this.legion.raise(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4);
    this.ui.bossBar(false);
    this.ui.banner(`ABYSS DEPTH ${this.bossKills + 1}`, `${K.name} falls. The abyss grows hungrier.`, 'gold');
    this.audio.voice(this.slainVoice);
    this.audio.voice('a_depth');
    this.audio.playMusic('battle');
  }

  end(victory) {
    if (this.ended) return;
    this.ended = true;
    this.input.reset();
    this.profile.flags.tutorialDone = true;
    const result = {
      chapter: this.chapter.id, time: this.endless || this.rush ? this.time : Math.min(this.time, RUN_LENGTH + 600), kills: this.counters.kills, raised: this.counters.raised,
      bestLegion: this.legion.peak, novas: this.counters.novas, gates: this.counters.gates, victory, level: this.level,
      bonusGold: this.bonusGold, heroId: this.loadout.heroId, endless: this.endless, bossKills: this.bossKills,
      trial: this.trial, mutators: this.mut.ids, page: this.page, urns: this.counters.urns, bloodMoon: this.bloodMoon, difficulty: this.diff.id,
      chests: this.counters.chests, elites: this.counters.elites, evolutions: Object.keys(this.evolved).length, unions: Object.keys(this.unions).length, events: this.counters.events, rites: this.counters.rites,
      bestStreak: this.counters.bestStreak,
      byType: { ...this.counters.byType }, // Bestiary kills per foe
      tutorial: !!this.guide, // the beginner tutorial: its own reward, no chapter records (economy.applyRunResult)
      rush: this.rush, // Boss Rush: milestones by bosses beaten, the fastest clear
      court: this.rush ? this.courtId : undefined,
    };
    if (this.onEnd) this.onEnd(result);
  }

  pause(on) {
    if (on) {
      if (this.paused || this.levelPending || this.ended || this.player.dead) return;
      this.paused = true;
      this.input.reset();
      if (this.ui) this.ui.showPause();
    } else this.paused = false;
  }

  // ---------------------------------------------------------------- frame
  desiredCam() {
    const P = this.player;
    const zoom = Math.min(5, this.legion.count / 50) + (this.bossSpawned && !this.bossDead ? 3.5 : 0);
    const W = 12.5 + zoom;
    this.camW += (W - this.camW) * 0.03;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = Math.max(0.3, this.camera.aspect);
    const dist = THREE.MathUtils.clamp(this.camW / 2 / (tan * aspect), 16, 60);
    this.camTarget.set(P.x + P.vx * 0.22, 0, P.z + P.vz * 0.22 - 1.2);
    return _p.set(this.camTarget.x, dist * Math.sin(PITCH), this.camTarget.z + dist * Math.cos(PITCH));
  }

  update(realDt) {
    this.t += realDt;
    const blocked = this.paused || this.levelPending || (this.ended && !this.bossDead);
    const ts = blocked ? 0 : this.fx.timeScale();
    const dt = realDt * ts;
    this.input.update();
    if (this.ui && this.ui.wantsNova) { this.ui.wantsNova = false; this.triggerNova(); }
    if (this.input.keys.has('Space')) { this.input.keys.delete('Space'); this.triggerNova(); }
    if (this.profile.settings.autoNova && this.nova >= 1 && this.legion.count >= 50) this.triggerNova(); // accessibility: Auto-Nova
    this.rites.poll(); // RITE button, Shift or E

    if (dt > 0) {
      this.time += dt;
      if (!this.ended) this.director(dt);
      this.player.update(dt, this.input);
      this.rites.update(dt); // after the Shepherd moved: Shadow Step rides on top of her step
      if (!this.player.dead) this.weapons.update(dt);
      this.events.update(dt);
      if (this.pageDef) this.updatePage(dt);
      this.enemies.update(dt);
      this.affixes.update(dt); // after the horde moves: the Commander aura queries a fresh grid
      this.legion.update(dt);
      this.projectiles.update(dt);
      this.pickups.update(dt);
      this.urns.update(dt);
      this.gates.update(dt);
      this.updateNova(dt);
      this.updateBursts(dt);
      this.streak.update(dt);
      if (this.tutorial && this.time > 1.5 && !this.input.moved) this.hint('move', 'Drag anywhere to move. Your Shepherd attacks automatically.');
    }
    this.updateVictory(realDt);
    if (this.deathT >= 0) {
      this.deathT += realDt;
      // the legion slew the boss while the Shepherd was down: the chapter is won, so no revive prompt; the beat plays out
      if (this.deathT > 1.1 && !this.paused && !(this.bossDead && !this.endless)) {
        this.paused = true;
        this.ui.showRevive({ canRevive: this.revivesUsed < 1, gemCost: 60 }, (choice) => {
          if (choice === 'revive') this.revive(false);
          else this.end(false);
        });
      }
    }
    this.fx.update(dt, realDt);
    this.particles.update(dt);

    // camera
    const want = this.desiredCam();
    this.camPos.lerp(want, 1 - Math.exp(-realDt * 6));
    const sk = this.profile.settings.shake ?? 1, sx = this.fx.shakeX * sk, sz = this.fx.shakeZ * sk;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y, this.camPos.z + sz);
    this.camera.lookAt(this.camTarget.x + sx * 0.5, 0, this.camTarget.z + sz * 0.5);

    this.render(dt);
    if (this.ui) this.ui.update(this, realDt);
  }

  render(dt) {
    const P = this.player;
    this.glow.begin();
    this.legion.render();
    if (this.novaQueue.length) this.renderNova();
    this.projectiles.render();
    this.weapons.render();
    this.rites.render();
    this.pickups.render();
    this.urns.render(this.glow);
    this.enemies.render();
    this.affixes.render(); this.events.render();
    this.boss.render(dt);
    this.player.render(this.t);

    // shared lighting for characters
    const plx = P.x, plz = P.z;
    this.enemies.setLight(plx, plz, this.heroColorObj);
    this.world.propMat.uniforms.uPLPos.value.set(plx, 1.6, plz);
    this.world.propMat.uniforms.uPLColor.value.copy(this.heroColorObj);
    this.world.propMat.uniforms.uPLRadius.value = 7;

    // ground light pools
    const W = this.world;
    W.beginLights();
    W.addLight(plx, plz, 6.5, 0.9, this.heroColorObj);
    const L = this.legion.list;
    if (L.length) {
      const n = Math.min(8, L.length);
      const step = Math.max(1, Math.floor(L.length / n));
      for (let i = 0; i < n; i++) {
        const m = L[(i * step + this.minionLightIdx) % L.length];
        W.addLight(m.x, m.z, 3.2, 0.45, this.heroColorObj);
      }
    }
    if (this.bossEnemy && this.bossEnemy.active) W.addLight(this.bossEnemy.x, this.bossEnemy.z, 9, 1.0, this.boss.color);
    this.fx.pushLights(W);
    W.endLights();
    W.update(P, this.t);

    // blob shadows
    let si = 0;
    const sm = this.shadowMesh;
    const addShadow = (x, z, r) => {
      if (si >= 900) return;
      _p.set(x, 0.02, z); _s.set(r, 1, r);
      _m.compose(_p, _q, _s);
      sm.setMatrixAt(si++, _m);
    };
    addShadow(P.x, P.z, 1.5);
    for (const e of this.enemies.active) if (e.active) addShadow(e.x, e.z, e.radius * (e.type === 'boss' ? 2.8 : 2.6));
    sm.count = si;
    sm.instanceMatrix.needsUpdate = true;

    this.glow.end();
    const ps = this.engine.pointScale(this.camera);
    this.glow.material.uniforms.uScale.value = ps;
    this.particles.material.uniforms.uScale.value = ps;
    this.world.setPointScale(ps);
    this.fx.applyPost(this.engine.post);
    this.engine.post.uDesat.value = P.dead ? Math.min(0.85, this.deathT * 0.9) : 0;
  }

  draw2d(ctx) {
    const P = this.player;
    // HP bar under the Shepherd
    if (!P.dead) {
      _v.set(P.x, 0, P.z);
      const p = this.engine.project(_v, this.camera, _sp);
      if (p) {
        const w = 46, h = 6, x = p.x - w / 2, y = p.y + 14;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        const f = P.hp / P.maxHp;
        ctx.fillStyle = f > 0.5 ? '#49f59a' : f > 0.25 ? '#ffcf4a' : '#ff2e55';
        ctx.fillRect(x, y, w * f, h);
      }
    }
    // off-screen boss arrow
    const b = this.bossEnemy;
    if (b && b.active) {
      _v.set(b.x, 2, b.z);
      const p = this.engine.project(_v, this.camera, _sp);
      const W = this.engine.w, H = this.engine.h;
      if (p && (p.x < 0 || p.x > W || p.y < 0 || p.y > H)) {
        const cx = W / 2, cy = H / 2;
        const a = Math.atan2(p.y - cy, p.x - cx);
        const ax = cx + Math.cos(a) * (W / 2 - 30), ay = cy + Math.sin(a) * (H / 2 - 90);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        ctx.fillStyle = '#ff3df0'; ctx.shadowColor = '#ff3df0'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    this.affixes.draw2d(ctx); this.events.draw2d(ctx);
    this.fx.draw2d(ctx, this.camera, this.engine);
    if (!this.paused && !this.levelPending) this.input.draw(ctx);
  }

  dispose() {
    this.ended = true; // over for good: a queued card's follow-up timer must not wake it
    this.input.dispose();
    this.rites.dispose();
    this.gates.dispose();
    this.boss.dispose();
    this.hazards.dispose(); this.projectiles.disposeLobs(); // also restores the fog vignette
    for (const sys of [this.player, this.enemies, this.legion, this.projectiles, this.weapons, this.pickups, this.urns, this.world, this.affixes, this.events]) sys.dispose();
    this.particles.points.geometry.dispose(); this.particles.material.dispose();
    this.glow.points.geometry.dispose(); this.glow.material.dispose();
    this.shadowMesh.geometry.dispose(); this.shadowMesh.material.dispose();
    this.scene.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    this.engine.post.uDesat.value = 0; this.engine.post.uWhite.value = 0; this.engine.post.uFlash.value.w = 0; this.engine.post.uAberr.value = 0;
  }
}
