/**
 * The automatic daily-gift popup (the launch popup, a tapped "Your daily gift is ready!" reminder). Both can ask for
 * it in the same session (tap the reminder on a cold start: the launch popup follows Welcome Back too), so it shows
 * at most once per local day: a player who closed it is not shown it again (the HUD's Daily chip stays).
 */
export type AutoDailyStep = 'skip' | 'wait' | 'open';

export interface AutoDailyState {
  /** Today's gift can be claimed. */
  available: boolean;
  /** The gift panel is open right now. */
  open: boolean;
  /** Something else is on screen (a panel, a placement, build mode): wait for it. */
  busy: boolean;
  /** Local day (dateKey) the automatic popup last opened in this session ('' = never). */
  shownDay: string;
  /** Today's local day (dateKey). */
  today: string;
}

export function autoDailyStep(s: AutoDailyState): AutoDailyStep {
  if (!s.available || s.open || s.shownDay === s.today) return 'skip';
  return s.busy ? 'wait' : 'open';
}
