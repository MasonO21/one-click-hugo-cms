/**
 * Typed event bus. Sim systems emit; render (VFX), UI (toasts, floating numbers), audio (SFX),
 * missions, analytics and season-pass XP listen.
 *
 * To add events from your own module without editing this file:
 *   declare module '../core/events' { interface GameEvents { 'my:event': { foo: number } } }
 */
import type { Id } from './state';
import type { ResourceBag, Reward } from '../data/schema';

export type GainSource = 'gather' | 'production' | 'reward' | 'offline' | 'purchase' | 'refund' | 'loot' | 'drop' | 'craft' | 'trade';

export interface GameEvents {
  // lifecycle
  'game:ready': { fresh: boolean };
  'game:saved': { auto: boolean };
  /** Fired once per simulated second (cheap periodic work). */
  'tick:second': { playTime: number };
  'time:dayChanged': { day: number };
  'time:nightfall': {};
  'time:sunrise': {};

  // resources
  /** x/z = world position where the gain happened (for fly-to-HUD / floating text) if any. */
  'resource:gained': { id: string; amount: number; source: GainSource; x?: number; z?: number };
  'resource:spent': { bag: ResourceBag; reason: string };
  'resource:full': { id: string };
  'resource:insufficient': { missing: ResourceBag };

  // gathering & player
  'gather:hit': { node: number; model: string; x: number; z: number; drop: ResourceBag };
  'gather:depleted': { node: number };
  'player:interact': { kind: string; target: string | number | null };
  'player:damaged': { amount: number };
  'player:downed': {};
  'player:respawned': {};
  'player:equipped': { item: string; slot: string };
  'player:deposit': { bag: ResourceBag };
  'player:backpackFull': {};
  'vehicle:mounted': { vehicle: string };
  'vehicle:dismounted': { vehicle: string };
  'vehicle:unlocked': { vehicle: string };

  // buildings
  'building:placed': { id: Id; def: string };
  'building:completed': { id: Id; def: string };
  'building:upgraded': { id: Id; def: string; level: number; tier: number };
  'building:moved': { id: Id; def: string };
  'building:removed': { id: Id; def: string };
  'building:damaged': { id: Id; def: string; amount: number };
  /** HP reached 0 -> status 'damaged' (never destroyed — auto-repairs). */
  'building:broken': { id: Id; def: string };
  'building:repaired': { id: Id; def: string };
  'building:changed': {}; // any structural change (grid/rooms/rates need recompute)
  'blueprint:saved': { id: string };

  // colony progression
  'colony:tierUp': { tier: number };
  'colony:expanded': { radius: number };
  'research:completed': { id: string };
  'research:points': { amount: number };

  // colonists
  'colonist:recruited': { id: Id; rarity: string };
  'colonist:assigned': { id: Id; workplace: Id | null };
  'colonist:skillUp': { id: Id; skill: number };

  // crafting
  'craft:queued': { job: Id; recipe: string };
  'craft:completed': { recipe: string; factory?: Id };
  'item:gained': { item: string; count: number };

  // combat
  'combat:warning': { wave: number; seconds: number };
  'combat:started': { wave: number; aliens: number };
  'combat:ended': { wave: number; kills: number; reward: Reward };
  'combat:rewardClaimed': { doubled: boolean };
  'alien:spawned': { id: Id; def: string; x: number; z: number };
  'alien:hit': { id: Id; x: number; z: number; damage: number };
  'alien:killed': { id: Id; def: string; x: number; z: number; by: 'turret' | 'player' | 'trap' | 'drone' };
  'turret:fired': { building: Id; kind: string; x: number; z: number; tx: number; tz: number };
  'projectile:impact': { kind: string; x: number; y: number; z: number; splash: number };
  'shield:hit': { building: Id; x: number; z: number };

  // world & exploration
  'world:regionDiscovered': { id: string };
  'world:regionUnlocked': { id: string };
  'world:regionLocked': { id: string; reason: string };
  'world:poiDiscovered': { id: string; poi: string };
  'world:poiLooted': { id: string; poi: string; reward: Reward };
  'world:eventStarted': { id: Id; def: string; x: number; z: number };
  'world:eventEnded': { id: Id; def: string };
  'world:fastTravel': { to: string };
  'survivor:rescued': { poi: string; colonist: Id };

  // meta
  'mission:progress': { id: string; value: number; target: number };
  'mission:completed': { id: string };
  'mission:claimed': { id: string };
  'tutorial:hint': { mission: string | null };
  'reward:granted': { reward: Reward; source: string; /** Inventory item the reward came out of (an opened crate). */ item?: string };
  'nova:changed': { amount: number; delta: number };
  'season:xp': { xp: number; level: number };
  'season:levelUp': { level: number };
  'daily:claimed': { day: number };
  'spin:result': { index: number };
  'boost:started': { kind: string; mult: number; minutes: number };
  'offline:ready': { seconds: number; gains: ResourceBag; rp: number };
  'offline:claimed': { doubled: boolean };
  'ad:started': { placement: string };
  'ad:rewarded': { placement: string };
  'ad:failed': { placement: string };
  'iap:purchased': { product: string };
  'iap:failed': { product: string; reason: string };

  // presentation requests (any system may emit; UI/render/audio handle)
  'ui:toast': { text: string; kind?: 'info' | 'success' | 'warning' | 'reward' | 'danger'; icon?: string };
  /** Floating world-space text such as "+25 Wood" or "Production +20%". */
  'ui:float': { text: string; x: number; z: number; color?: string; big?: boolean };
  'ui:open': { panel: string; arg?: unknown };
  'ui:celebrate': { title: string; text?: string; icon?: string };
  /** Generic sound trigger by id (see src/audio). */
  sfx: { id: string; x?: number; z?: number; volume?: number };
  /** Camera shake request (render). */
  'fx:shake': { strength: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type as string);
    if (!set) {
      set = new Set();
      this.handlers.set(type as string, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  once<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    this.handlers.get(type as string)?.delete(fn);
  }

  /** Listen to every event (analytics, debugging). */
  onAny(fn: (type: string, payload: unknown) => void): () => void {
    return this.on('*' as keyof GameEvents, fn as any);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type as string);
    if (set) for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[bus] handler for ${String(type)} failed`, e);
      }
    }
    const any = this.handlers.get('*');
    if (any) for (const fn of [...any]) {
      try {
        (fn as any)(type, payload);
      } catch (e) {
        console.error(`[bus] onAny listener failed on ${String(type)}`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
