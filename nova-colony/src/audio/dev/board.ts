/**
 * Dev sound board (open /audio-test.html with `npm run dev`). Runs the real AudioManager against a
 * minimal fake game host, so a human can audition every sound id, every mood, night / combat music,
 * positional sounds, event-driven reactions and stress floods.
 */
import { AudioManager, type AudioHost } from '../Audio';
import { SOUND_CATEGORIES } from '../ids';
import { MOODS, MOOD_IDS, type MoodId } from '../theory';
import { EventBus } from '../../core/events';

const bus = new EventBus();
const state = {
  settings: { music: 0.6, sfx: 0.8 },
  combat: { phase: 'peace' },
  player: { x: 0, z: 0 },
  playTime: 10,
};
let region: string = 'calm';
let night = false;

const host: AudioHost = {
  bus,
  state,
  sys: { world: { regionAt: () => region } },
  // the board's "regions" are the mood ids themselves
  data: { biome: (id: string) => ({ mood: id }) },
  view: { camera: { mode: 'follow', yaw: 0, tx: 0, tz: 0 } },
  isNight: () => night,
};

// ?live=1 skips baking so the live synthesis path can be auditioned (and compared with the baked one)
const live = new URLSearchParams(location.search).has('live');
const audio = new AudioManager(host, { bake: !live });
audio.init();
(window as unknown as { audio: AudioManager }).audio = audio;

let last = performance.now();
const loop = (t: number): void => {
  audio.update(Math.min(0.1, (t - last) / 1000));
  last = t;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// ----------------------------------------------------------------------------------- DOM helpers

const app = document.getElementById('app') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;

function section(title: string, hint?: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  app.appendChild(h);
  if (hint) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = hint;
    app.appendChild(p);
  }
  const row = document.createElement('div');
  row.className = 'row';
  app.appendChild(row);
  return row;
}

function button(row: HTMLElement, label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => onClick(b));
  row.appendChild(b);
  return b;
}

function slider(row: HTMLElement, label: string, value: number, onInput: (v: number) => void): void {
  const l = document.createElement('label');
  l.className = 'slider';
  const span = document.createElement('span');
  span.textContent = `${label} ${value.toFixed(2)}`;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    span.textContent = `${label} ${v.toFixed(2)}`;
    onInput(v);
  });
  l.append(span, input);
  row.appendChild(l);
}

// ------------------------------------------------------------------------------------- sections

const volumes = section('Volume');
slider(volumes, 'Music', state.settings.music, (v) => (state.settings.music = v));
slider(volumes, 'SFX', state.settings.sfx, (v) => (state.settings.sfx = v));

const music = section('Music', 'Mood switches immediately here (in-game it follows the region and changes at the next chord).');
const moodButtons: Partial<Record<MoodId, HTMLButtonElement>> = {};
for (const id of MOOD_IDS) {
  moodButtons[id] = button(music, MOODS[id].label, () => {
    region = id;
    audio.setOverrides({ mood: id });
    audio.music.setMood(id, true);
    for (const k of MOOD_IDS) moodButtons[k]?.classList.toggle('on', k === id);
  });
}
moodButtons.calm?.classList.add('on');
button(music, 'Night', (b) => {
  night = !night;
  audio.setOverrides({ night });
  b.classList.toggle('on', night);
});
button(music, 'Combat (attack phase)', (b) => {
  const on = state.combat.phase !== 'attack';
  state.combat.phase = on ? 'attack' : 'peace';
  audio.setOverrides({ combat: on });
  b.classList.toggle('on', on);
});
button(music, 'Duck test', () => audio.music.duck(0.4, 1.5));

for (const [category, ids] of Object.entries(SOUND_CATEGORIES)) {
  const row = section(`SFX - ${category}`);
  for (const id of ids as readonly string[]) button(row, id, () => void audio.play(id));
}

const positional = section('Positional (camera at origin, camera right = +X)');
for (const [label, x, z] of [['alien_hit left', -25, 0], ['alien_hit right', 25, 0], ['alien_hit near', 3, 3], ['alien_hit far', 60, 30], ['alien_hit out of range', 200, 0]] as const) {
  button(positional, label, () => void audio.play('alien_hit', { x, z }));
}
button(positional, 'explosion right', () => void audio.play('explosion', { x: 30, z: 0 }));
button(positional, 'pitch 0.7 / 1.4 (collect)', () => {
  audio.play('collect', { pitch: 0.7 });
  setTimeout(() => audio.play('collect', { pitch: 1.4 }), 120);
});

const events = section('Gameplay events (through the bus)');
for (const [label, model, drop] of [
  ['gather: tree', 'tree_round', { wood: 3 }],
  ['gather: rock', 'rock', { stone: 3 }],
  ['gather: berry bush', 'bush', { food: 2 }],
  ['gather: crystal', 'crystal', { crystal: 1 }],
  ['gather: iron ore', 'ore_iron', { iron: 2 }],
] as const) {
  button(events, label, () => {
    bus.emit('gather:hit', { node: 1, model, x: 4, z: 2, drop });
    bus.emit('resource:gained', { id: Object.keys(drop)[0], amount: 2, source: 'gather', x: 4, z: 2 });
  });
}
button(events, 'build: place -> complete', () => {
  bus.emit('building:placed', { id: 1, def: 'wall' });
  setTimeout(() => bus.emit('building:completed', { id: 1, def: 'wall' }), 700);
});
button(events, 'upgrade', () => bus.emit('building:upgraded', { id: 1, def: 'wall', level: 2, tier: 1 }));
button(events, 'mission + reward (jingle arbitration)', () => {
  bus.emit('reward:granted', { reward: {}, source: 'mission' });
  bus.emit('mission:completed', { id: 'demo' });
});
button(events, 'tier up (+ mission + reward)', () => {
  bus.emit('reward:granted', { reward: {}, source: 'tier' });
  bus.emit('mission:completed', { id: 'demo' });
  bus.emit('colony:tierUp', { tier: 3 });
});
button(events, 'warning -> attack', () => {
  bus.emit('combat:warning', { wave: 1, seconds: 120 });
  setTimeout(() => bus.emit('combat:started', { wave: 1, aliens: 8 }), 2500);
});
button(events, 'victory', () => bus.emit('combat:ended', { wave: 1, kills: 8, reward: {} }));
button(events, 'region discovered', () => bus.emit('world:regionDiscovered', { id: 'crystal_canyon' }));
button(events, 'explosion (splash)', () => bus.emit('projectile:impact', { kind: 'missile', x: 6, y: 0, z: 4, splash: 2 }));

const stress = section('Stress', 'Battle floods many turret / alien / explosion events for 8 s: it should stay pleasant and never exceed 24 voices.');
let battleTimer: ReturnType<typeof setInterval> | null = null;
button(stress, 'Battle 8 s', (b) => {
  if (battleTimer) return;
  b.classList.add('on');
  const kinds = ['bullet', 'flame', 'missile', 'laser', 'plasma', 'rail', 'cannon', 'arrow', 'drone'];
  let n = 0;
  battleTimer = setInterval(() => {
    for (let i = 0; i < 4; i++) {
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      bus.emit('turret:fired', { building: i, kind: k, x: Math.random() * 40 - 20, z: Math.random() * 40 - 20, tx: 0, tz: 0 });
      bus.emit('alien:hit', { id: n, x: Math.random() * 30 - 15, z: Math.random() * 30 - 15, damage: 2 });
    }
    if (n % 3 === 0) bus.emit('alien:killed', { id: n, def: 'crawler', x: Math.random() * 30 - 15, z: Math.random() * 30 - 15, by: 'turret' });
    if (n % 6 === 0) bus.emit('projectile:impact', { kind: 'missile', x: Math.random() * 30 - 15, y: 0, z: Math.random() * 30 - 15, splash: 2 });
    if (++n > 160 && battleTimer) {
      clearInterval(battleTimer);
      battleTimer = null;
      b.classList.remove('on');
    }
  }, 50);
});
button(stress, 'Gather storm (100 hits/s)', () => {
  let n = 0;
  const t = setInterval(() => {
    bus.emit('gather:hit', { node: n, model: ['tree_round', 'rock', 'crystal', 'ore_iron', 'bush'][n % 5], x: 1, z: 1, drop: {} });
    if (++n > 200) clearInterval(t);
  }, 10);
});
button(stress, 'Random 100 sounds at once', () => {
  const ids = Object.values(SOUND_CATEGORIES).flat() as string[];
  for (let i = 0; i < 100; i++) audio.play(ids[Math.floor(Math.random() * ids.length)]);
});

// status line
setInterval(() => {
  const d = audio.debug();
  const m = d.music;
  statusEl.textContent =
    `audio: ${d.engine}   voices: ${d.voices}/24   baked: ${d.baked} keys${d.bakePending ? ` (${d.bakePending} baking)` : ''}${live ? '   [live synth mode]' : ''}\n` +
    `music: ${m.running ? 'playing' : 'stopped'}  mood=${m.mood}${m.pendingMood ? ` -> ${m.pendingMood}` : ''}  chord=${m.chord}  bar=${m.bar}  ` +
    `bpm=${m.bpm}  night=${m.night}  combat=${m.combat}  phrase=${m.phrase}`;
}, 250);
