/**
 * While aliens attack, the tutorial's hint bubble and guide hand step aside: "Research Energy Weapons…" or a hand on
 * TECH is noise in the middle of a fight (in landscape the banner and the hint took the middle third of the screen,
 * in portrait the hand sat on a threat marker). A guided step that is the defence itself keeps them (the first raid's
 * "Stand near your turret"). Pure: exported for tests.
 */
export function showGuideNow(combatPhase: string, missionType: string | undefined): boolean {
  return combatPhase !== 'attack' || missionType === 'defend';
}
