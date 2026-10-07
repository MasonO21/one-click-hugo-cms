import { describe, expect, it } from 'vitest';
import {
  BIG_PRODUCTION_GAIN, EVENT_SOUNDS, MAPPED_EVENTS, explosionVolume, gatherSoundId, soundForEvent, turretSound,
} from '../src/audio/mapping';
import { SOUND_IDS } from '../src/audio/ids';
import { NODES } from '../src/data/world';
import type { ProjectileKind } from '../src/data/schema';

describe('gatherSoundId', () => {
  it('maps every real node model to the right material sound', () => {
    const expected: Record<string, string> = {
      tree_round: 'gather_wood',
      tree_pine: 'gather_wood',
      bush: 'gather_plant',
      fiber_grass: 'gather_plant',
      rock: 'gather_stone',
      ore_iron: 'gather_metal',
      ore_copper: 'gather_metal',
      coal: 'gather_stone',
      crystal: 'gather_crystal',
      bio_pod: 'gather_plant',
      ice_ore: 'gather_crystal',
      scrap: 'gather_metal',
      titanium: 'gather_metal',
    };
    for (const n of NODES) {
      expect(expected[n.model], `unexpected node model ${n.model}`).toBeTruthy();
      expect(gatherSoundId(n.model, n.drop), `${n.id} (${n.model})`).toBe(expected[n.model]);
    }
  });

  it('falls back to the main drop for unknown models, then to stone', () => {
    expect(gatherSoundId('mystery_thing', { fiber: 2 })).toBe('gather_plant');
    expect(gatherSoundId('mystery_thing', { crystal: 1 })).toBe('gather_crystal');
    expect(gatherSoundId('mystery_thing', { iron: 3, stone: 1 })).toBe('gather_metal');
    expect(gatherSoundId('mystery_thing')).toBe('gather_stone');
    expect(gatherSoundId('mystery_thing', {})).toBe('gather_stone');
  });
});

describe('turretSound', () => {
  const kinds: ProjectileKind[] = ['arrow', 'bullet', 'flame', 'missile', 'laser', 'plasma', 'rail', 'cannon', 'drone'];

  it('every projectile kind has a valid, in-catalog sound', () => {
    for (const k of kinds) {
      const t = turretSound(k);
      expect(SOUND_IDS as readonly string[]).toContain(t.id);
      expect(t.pitch).toBeGreaterThan(0.5);
      expect(t.volume).toBeGreaterThan(0);
      expect(t.volume).toBeLessThanOrEqual(1);
    }
  });

  it('maps kinds to their dedicated sound ids', () => {
    expect(turretSound('flame').id).toBe('turret_flame');
    expect(turretSound('missile').id).toBe('turret_missile');
    expect(turretSound('laser').id).toBe('turret_laser');
    expect(turretSound('plasma').id).toBe('turret_plasma');
    expect(turretSound('rail').id).toBe('turret_rail');
    expect(turretSound('cannon').id).toBe('turret_cannon');
    expect(turretSound('bullet').id).toBe('turret_bullet');
    expect(turretSound('arrow').id).toBe('turret_bullet');
    expect(turretSound('something_new').id).toBe('turret_bullet');
  });
});

describe('explosionVolume', () => {
  it('scales with splash and stays in range', () => {
    expect(explosionVolume(0.1)).toBeGreaterThanOrEqual(0.45);
    expect(explosionVolume(3)).toBeGreaterThan(explosionVolume(1));
    expect(explosionVolume(100)).toBeLessThanOrEqual(1.2);
  });
});

describe('event -> sound mapping', () => {
  it('every mapped event produces only catalog ids', () => {
    const samples: Record<string, unknown> = {
      'gather:hit': { node: 1, model: 'rock', x: 1, z: 2, drop: { stone: 1 } },
      'resource:gained': { id: 'wood', amount: 3, source: 'gather', x: 1, z: 1 },
      'turret:fired': { building: 1, kind: 'laser', x: 0, z: 0, tx: 1, tz: 1 },
      'alien:hit': { id: 1, x: 3, z: 4, damage: 2 },
      'alien:killed': { id: 1, def: 'crawler', x: 3, z: 4, by: 'turret' },
      'projectile:impact': { kind: 'missile', x: 1, y: 0, z: 1, splash: 2 },
      'shield:hit': { building: 1, x: 1, z: 1 },
      'world:poiLooted': { id: 'a', poi: 'b', reward: {} },
      'world:eventStarted': { id: 1, def: 'meteor', x: 5, z: 6 },
      'ui:open': { panel: 'build' },
    };
    for (const type of MAPPED_EVENTS) {
      const req = (soundForEvent as (t: string, p: unknown) => ReturnType<typeof soundForEvent>)(type, samples[type] ?? {});
      if (req) expect(SOUND_IDS as readonly string[], `${type} -> ${req.id}`).toContain(req.id);
    }
  });

  it('covers every event the brief asks for', () => {
    const required = [
      'gather:hit', 'building:placed', 'building:completed', 'building:upgraded', 'building:removed', 'resource:gained',
      'craft:completed', 'research:completed', 'mission:completed', 'colony:tierUp', 'combat:warning', 'combat:started',
      'combat:ended', 'turret:fired', 'alien:hit', 'alien:killed', 'projectile:impact', 'shield:hit', 'player:damaged',
      'colonist:recruited', 'reward:granted', 'daily:claimed', 'spin:result', 'world:fastTravel', 'vehicle:mounted',
      'ui:open', 'ui:celebrate', 'world:regionDiscovered',
    ];
    for (const e of required) expect(MAPPED_EVENTS as string[], e).toContain(e);
    expect(Object.keys(EVENT_SOUNDS).length).toBe(MAPPED_EVENTS.length);
  });

  it('maps the core gameplay moments to their sounds', () => {
    expect(soundForEvent('building:placed', { id: 1, def: 'x' })?.id).toBe('place');
    expect(soundForEvent('building:completed', { id: 1, def: 'x' })?.id).toBe('build_complete');
    expect(soundForEvent('building:upgraded', { id: 1, def: 'x', level: 2, tier: 1 })?.id).toBe('upgrade');
    expect(soundForEvent('building:removed', { id: 1, def: 'x' })?.id).toBe('remove');
    expect(soundForEvent('craft:completed', { recipe: 'r' })?.id).toBe('craft_done');
    expect(soundForEvent('research:completed', { id: 'r' })?.id).toBe('research_done');
    expect(soundForEvent('mission:completed', { id: 'm' })?.id).toBe('mission_done');
    expect(soundForEvent('colony:tierUp', { tier: 2 })?.id).toBe('tier_up');
    expect(soundForEvent('combat:warning', { wave: 1, seconds: 120 })?.id).toBe('alarm');
    expect(soundForEvent('combat:started', { wave: 1, aliens: 5 })?.id).toBe('attack_start');
    expect(soundForEvent('combat:ended', { wave: 1, kills: 5, reward: {} })?.id).toBe('victory');
    expect(soundForEvent('player:damaged', { amount: 5 })?.id).toBe('player_hurt');
    expect(soundForEvent('colonist:recruited', { id: 1, rarity: 'common' })?.id).toBe('recruit');
    expect(soundForEvent('reward:granted', { reward: {}, source: 'x' })?.id).toBe('reward');
    expect(soundForEvent('daily:claimed', { day: 1 })?.id).toBe('reward');
    expect(soundForEvent('spin:result', { index: 2 })?.id).toBe('spin_win');
    expect(soundForEvent('world:fastTravel', { to: 'a' })?.id).toBe('teleport');
    expect(soundForEvent('vehicle:mounted', { vehicle: 'atv' })?.id).toBe('vehicle_start');
    expect(soundForEvent('ui:open', { panel: 'build' })?.id).toBe('ui_open');
    expect(soundForEvent('ui:celebrate', { title: 'x' })?.id).toBe('celebrate');
    expect(soundForEvent('world:regionDiscovered', { id: 'crystal_canyon' })?.id).toBe('discover');
  });

  it('gather hits pick the sound by node model and carry the position', () => {
    const r = soundForEvent('gather:hit', { node: 4, model: 'tree_pine', x: 12, z: -3, drop: { wood: 4 } });
    expect(r).toMatchObject({ id: 'gather_wood', x: 12, z: -3 });
    expect(soundForEvent('gather:hit', { node: 4, model: 'crystal', x: 0, z: 0, drop: { crystal: 1 } })?.id).toBe('gather_crystal');
  });

  it('turret and alien events are positional; impact only explodes with splash', () => {
    const shot = soundForEvent('turret:fired', { building: 1, kind: 'cannon', x: 4, z: 5, tx: 9, tz: 9 });
    expect(shot).toMatchObject({ id: 'turret_cannon', x: 4, z: 5 });
    expect(soundForEvent('alien:hit', { id: 1, x: 7, z: 8, damage: 3 })).toMatchObject({ id: 'alien_hit', x: 7, z: 8 });
    expect(soundForEvent('alien:killed', { id: 1, def: 'c', x: 7, z: 8, by: 'player' })).toMatchObject({ id: 'alien_die', x: 7, z: 8 });
    expect(soundForEvent('projectile:impact', { kind: 'bullet', x: 1, y: 0, z: 1, splash: 0 })).toBeNull();
    const boom = soundForEvent('projectile:impact', { kind: 'missile', x: 1, y: 0, z: 2, splash: 2.5 });
    expect(boom).toMatchObject({ id: 'explosion', x: 1, z: 2 });
    expect(boom?.volume).toBeGreaterThan(0.9);
  });

  it('resource gains: collect for gather/loot, silent for noise sources, big production still pings', () => {
    const gain = (source: string, amount = 5) =>
      soundForEvent('resource:gained', { id: 'wood', amount, source: source as never, x: 1, z: 2 });
    expect(gain('gather')?.id).toBe('collect');
    expect(gain('loot')?.id).toBe('collect');
    expect(gain('trade')?.id).toBe('coin');
    expect(gain('production', 3)).toBeNull();
    expect(gain('production', BIG_PRODUCTION_GAIN)?.id).toBe('collect');
    for (const s of ['reward', 'offline', 'refund', 'purchase', 'craft']) expect(gain(s)).toBeNull();
  });

  it('the victory panel does not add a second blip on top of the victory sound', () => {
    expect(soundForEvent('ui:open', { panel: 'victory' })).toBeNull();
    expect(soundForEvent('ui:open', { panel: 'research' })?.id).toBe('ui_open');
  });

  it('unmapped events are silent', () => {
    expect(soundForEvent('tick:second', { playTime: 1 })).toBeNull();
    expect(soundForEvent('nova:changed', { amount: 1, delta: 1 })).toBeNull();
  });
});
