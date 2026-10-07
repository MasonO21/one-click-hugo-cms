// Android's hardware back button (and Escape on desktop): acts on the topmost layer the way a tap on its obvious
// "back" control would, so back never skips a reward, buys anything or abandons a run by itself.
import { uiRoot } from './dom.js';

/** Returns what it did: 'ad' | 'reveal' | 'close' | 'resume' | 'continue' | 'none' | 'pause' | 'home' | 'exit'. */
export function handleBack(app) {
  if (document.querySelector('.ad-sim')) return 'ad'; // a rewarded ad plays out
  const ui = uiRoot(), run = app.run;
  const rv = ui.querySelector('.rv'); // Soul Altar reveal: Skip, then its closing button
  if (rv) { rv.querySelector('.rv-actions .btn')?.click(); return 'reveal'; }
  const backs = ui.querySelectorAll('.modal-back'), top = backs[backs.length - 1];
  if (top) {
    const x = top.querySelector('.modal-x');
    if (x) { x.click(); return 'close'; }
    if (top.querySelector('.modal-pause')) { top.querySelector('.modal-actions .btn-primary')?.click(); return 'resume'; }
    if (top.querySelector('.modal-results')) { top.querySelector('.modal-actions .btn-primary')?.click(); return 'continue'; }
    return 'none'; // the revive prompt and other must-answer dialogs
  }
  if (run && !run.ended) {
    if (run.levelPending || ui.querySelector('.lvl-back')) return 'none'; // a card (or a shrine blessing) must be chosen
    run.pause(true);
    return 'pause';
  }
  if (app.meta && !app.meta.el.hidden && app.meta.tab !== 'battle') { app.meta.show('battle'); return 'home'; }
  return 'exit';
}
