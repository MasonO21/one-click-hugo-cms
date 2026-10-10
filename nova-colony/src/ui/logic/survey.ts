/**
 * Region survey helpers for the Map, the HUD and the guide (sim/survey.ts): what is left in a region, what the next
 * milestone brings, the Map badge, and the gentle "Survey" suggestion with its guide arrow.
 */
import type { Game } from '../../core/Game';
import { SURVEY, regionSurveyDef } from '../../data/survey';
import type { SurveyClaim, SurveyProgress, SurveyTarget } from '../../sim/survey';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "3 points of interest unexplored · 40% charted · 2 field-guide entries to find" (empty when everything is done).
 * `charted: false` leaves the charted share out (the Map's survey card shows it beside the other numbers).
 */
export function surveyLeft(p: SurveyProgress, opts: { charted?: boolean } = {}): string[] {
  const out: string[] = [];
  const pois = p.pois.total - p.pois.done;
  if (pois > 0) out.push(`${plural(pois, 'point of interest', 'points of interest')} unexplored`);
  if (p.charted < 1 && opts.charted !== false) out.push(`${Math.floor(p.charted * 100)}% charted`);
  const spec = p.specimens.total - p.specimens.done;
  if (spec > 0) out.push(`${plural(spec, 'field-guide entry', 'field-guide entries')} to find`);
  return out;
}

/** The Map card's line: "Still out there: 2 unexplored sites, 3 field-guide entries and uncharted land." (null: all done). */
export function surveyLeftLine(p: SurveyProgress): string | null {
  const parts: string[] = [];
  const pois = p.pois.total - p.pois.done;
  if (pois > 0) parts.push(plural(pois, 'unexplored site', 'unexplored sites'));
  const spec = p.specimens.total - p.specimens.done;
  if (spec > 0) parts.push(plural(spec, 'field-guide entry', 'field-guide entries'));
  if (p.charted < 1) parts.push('uncharted land');
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Still out there: ${list}.`;
}

/** "50% Surveyed" */
export function milestoneLabel(step: number): string {
  return `${SURVEY.milestones[step] ?? 100}% ${SURVEY.titles[step] ?? ''}`.trim();
}

/** What a milestone brings, as short lines with an icon (the Map's "Next" card). */
export function milestonePreview(game: Game, region: string, step: number): { icon: string; text: string }[] {
  const def = regionSurveyDef(region);
  const pre = game.sys.survey.preview(region, step);
  const out: { icon: string; text: string }[] = [];
  const name = game.data.biome(region)?.name ?? 'the region';
  if (pre.cache) out.push({ icon: '📦', text: `A cache of ${name} goods` });
  if (pre.reward.colonist) out.push({ icon: '🧑‍🚀', text: `A ${pre.reward.colonist} survivor joins` });
  if (pre.reward.cosmetic) {
    const c = game.data.cosmetic(pre.reward.cosmetic);
    out.push({ icon: c?.icon ?? '🎁', text: c?.name ?? pre.reward.cosmetic });
  } else if (step === 2 && def) {
    const c = game.data.cosmetic(def.cosmetic);
    out.push({ icon: c?.icon ?? '🎁', text: `${c?.name ?? 'Keepsake'} (owned: Nova instead)` });
  }
  if (pre.perk) out.push({ icon: '⭐', text: `${pre.perk.title}: ${pre.perk.text}, for good` });
  if (pre.reward.nova) out.push({ icon: '💎', text: `+${pre.reward.nova} Nova` });
  return out;
}

/** The Map button's badge: milestone rewards waiting (quiet during the guided first session, like the Journal). */
export function surveyBadge(game: Game): number {
  return game.sys.liveops.offersUnlocked() ? game.sys.survey.claimable() : 0;
}

// ---------------------------------------------------------------------------------------------- "Survey" suggestion

/** How long the guide arrow follows a survey target (seconds). */
export const SURVEY_PIN_SECONDS = 150;
/** The main mission counts as "waiting" once its progress has not moved for this long (seconds of play). */
const WAITING_AFTER = 90;

interface PinState {
  target: SurveyTarget | null;
  until: number;
}
/** The survey target the guide arrow follows (one per page; set by the Survey pill or the Map's "Show me"). */
export const surveyPin: PinState = { target: null, until: 0 };

/** The main mission's progress as last seen, and since when (playTime) it has not moved (exported for tests and QA). */
export const surveyWatch = { mission: '', value: -1, since: 0 };
const watch = surveyWatch;

/**
 * Is the player between things to do? The main mission waits on the colony (a tier bill, or progress that has not
 * moved for a while), nothing waits to be claimed, no raid is coming.
 */
export function idleForSurvey(game: Game): boolean {
  const st = game.state;
  if (!game.sys.liveops.offersUnlocked()) return false;
  if (st.combat.phase !== 'peace') return false;
  const ms = game.sys.missions;
  if (ms.active().some((m) => ms.progress(m.id).done)) return false;
  const m = game.sys.missions.current();
  if (!m) return true;
  const p = game.sys.missions.progress(m.id);
  if (p.done) return false;
  if (watch.mission !== m.id || watch.value !== p.value) {
    watch.mission = m.id;
    watch.value = p.value;
    watch.since = st.playTime;
  }
  return m.type === 'tier' || st.playTime - watch.since >= WAITING_AFTER;
}

/** The Survey pill's target when the player is between things to do (null: no pill). Call at ~1 Hz. */
export function surveyOffer(game: Game): SurveyTarget | null {
  if (!idleForSurvey(game)) return null;
  const p = game.state.player;
  return game.sys.survey.suggest(p.x, p.z);
}

/** Point the guide arrow at a survey target for a while. */
export function pinSurvey(target: SurveyTarget, nowSeconds: number): void {
  surveyPin.target = target;
  surveyPin.until = nowSeconds + SURVEY_PIN_SECONDS;
}

/** Is a survey target done (looted, switched on, charted, or the player is standing at it)? */
export function surveyTargetDone(game: Game, t: SurveyTarget): boolean {
  const st = game.state;
  if (Math.hypot(st.player.x - t.x, st.player.z - t.z) < 5) return true;
  if (t.kind === 'uncharted') return game.sys.world.revealed(t.x, t.z);
  if (!t.poi) return true;
  if (game.sys.world.poiDef(t.poi)?.kind === 'beacon') return st.world.beacons.includes(t.poi);
  return !!st.world.pois[t.poi]?.looted;
}

/** Guide override for a pinned survey target (null when there is none, it is done or the pin ran out). */
export function surveyGuideTarget(game: Game, nowSeconds: number): { text: string; world: { x: number; z: number } | null; ui: string | null } | null {
  const t = surveyPin.target;
  if (!t) return null;
  if (nowSeconds > surveyPin.until || surveyTargetDone(game, t)) {
    surveyPin.target = null;
    return null;
  }
  return { text: t.label, world: { x: t.x, z: t.z }, ui: null };
}

/** "Restocked: Supply Cache · 80 m" */
export function surveyToast(t: SurveyTarget): string {
  return `${t.label} · ${Math.max(1, Math.round(t.dist))} m`;
}

/** The sentence under the title of a claimed milestone's card. */
export function surveyClaimText(c: SurveyClaim, regionName: string, cosmeticName: string | null): string {
  const def = regionSurveyDef(c.region);
  switch (c.step) {
    case 0:
      return `The first trails of ${regionName} are on the map. Your scouts brought back a cache.`;
    case 1:
      return `${def?.survivor ?? 'A survivor was living out here.'} ${c.colonist ? `${c.colonist.name} is` : 'They are'} joining the colony.`;
    case 2:
      return c.ownedCosmetic ? `A keepsake from ${regionName}: you already have the ${cosmeticName ?? 'keepsake'}, so here is Nova instead.` : `A keepsake from ${regionName}, yours to keep.`;
    default:
      return `Every trail, ruin and specimen of ${regionName} is on record.`;
  }
}

