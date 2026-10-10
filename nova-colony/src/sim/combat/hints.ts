/**
 * Gentle combat hints. Flyers ignore walls and only anti-air can hit them, so the first time flyers join an
 * invasion while the colony has no working AA defense, tell the player exactly what to build (once per wave).
 * A boss leading a raid: tap it to focus the turrets (once per wave).
 */
import type { Game } from '../../core/Game';

export function installCombatHints(game: Game): () => void {
  let hintedWave = -1;
  let bossWave = -1;
  // a boss leads the raid: the hero can tell the turrets to focus it (CombatSystem.focus), once per wave
  game.bus.on('alien:spawned', (e) => {
    const st = game.state;
    if (st.combat.phase !== 'attack' || bossWave === st.combat.wave) return;
    const def = game.data.alien(e.def);
    if (!def?.boss) return;
    const alien = st.combat.aliens.find((a) => a.id === e.id) as { wild?: boolean } | undefined;
    if (alien?.wild) return;
    bossWave = st.combat.wave;
    game.toast(`${def.name} leads the raid! Tap it to focus your turrets.`, 'warning', '🎯');
  });
  return game.bus.on('alien:spawned', (e) => {
    const st = game.state;
    if (st.combat.phase !== 'attack' || hintedWave === st.combat.wave) return;
    if (!game.data.alien(e.def)?.flying) return;
    const alien = st.combat.aliens.find((a) => a.id === e.id) as { wild?: boolean } | undefined;
    if (alien?.wild) return;
    hintedWave = st.combat.wave;
    if (hasAntiAir(game)) return;
    const aa = cheapestUnlockedAntiAir(game);
    game.toast(
      aa ? `🦇 Flyers incoming! They fly over walls — build a ${aa} to shoot them down.` : '🦇 Flyers incoming! They fly over walls — research anti-air defenses.',
      'warning',
      '🎯',
    );
  });
}

function hasAntiAir(game: Game): boolean {
  for (const b of game.state.buildings.list) {
    if (b.status !== 'active') continue;
    const d = game.data.building(b.def);
    if (d?.turret?.antiAir || d?.trap?.antiAir) return true;
  }
  return false;
}

function cheapestUnlockedAntiAir(game: Game): string | null {
  let best: { name: string; cost: number } | null = null;
  for (const d of game.data.buildings) {
    if (!(d.turret?.antiAir || d.trap?.antiAir) || !game.sys.buildings.isUnlocked(d.id)) continue;
    let cost = 0;
    for (const v of Object.values(d.cost)) cost += v ?? 0;
    if (!best || cost < best.cost) best = { name: d.name, cost };
  }
  return best?.name ?? null;
}
