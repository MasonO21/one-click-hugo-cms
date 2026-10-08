// Trophies: tiny goals that reward experimenting (and failing hilariously).
import { totalStars } from './storage.js';

export const ACHIEVEMENTS = [
  { id: 'first_flip', icon: '🍳', name: 'Sizzle Start', desc: 'Make your first flip.' },
  { id: 'first_bun', icon: '🌭', name: 'Bun Voyage', desc: 'Land in your first bun.' },
  { id: 'under_par', icon: '⛳', name: 'Under Par', desc: 'Beat par on any level.' },
  { id: 'one_flip', icon: '🎯', name: 'Hole in One', desc: 'Win a par-2+ level in a single flip.' },
  { id: 'toasty', icon: '🍞', name: 'Toasty!', desc: 'Get popped by a toaster.' },
  { id: 'boing', icon: '🦘', name: 'Boing Boing', desc: 'Bounce off springy things 25 times.' },
  { id: 'good_boy', icon: '🐶', name: 'Good Boy', desc: 'Feed the backyard dog 5 times.' },
  { id: 'soggy', icon: '💦', name: 'Soggy Dog', desc: 'Take 5 unplanned swims.' },
  { id: 'never_give_up', icon: '💪', name: 'Never Give Up', desc: 'Win a level after 10+ fails on it.' },
  { id: 'helping_hand', icon: '💡', name: 'Helping Hand', desc: 'Use a hint.' },
  { id: 'flips_100', icon: '🔄', name: 'Flip Happens', desc: 'Flip 100 times.' },
  { id: 'flips_1000', icon: '🌀', name: 'Flip Master', desc: 'Flip 1,000 times.' },
  { id: 'houston', icon: '🚀', name: 'Houston, We Have a Hot Dog', desc: 'Reach Frank in Space.' },
  { id: 'stars_100', icon: '⭐', name: 'Star Collector', desc: 'Earn 100 stars.' },
  { id: 'stars_300', icon: '🌟', name: 'Constellation', desc: 'Earn 300 stars.' },
  { id: 'top_dog', icon: '👑', name: 'Top Dog', desc: 'Finish all 200 levels.' },
  { id: 'perfect', icon: '🏆', name: 'Perfectionist', desc: 'Earn all 600 stars.' },
];

export class Trophies {
  constructor(app) { this.app = app; }

  get save() { return this.app.save; }

  counter(key, n = 1) {
    const c = this.save.counters || (this.save.counters = {});
    c[key] = (c[key] || 0) + n;
    return c[key];
  }

  unlock(id) {
    const s = this.save;
    s.ach = s.ach || {};
    if (s.ach[id]) return;
    s.ach[id] = Date.now();
    this.app.persist();
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a && this.app.ui) {
      this.app.ui.trophyToast(a);
      this.app.audio.play('unlock');
    }
  }

  // event hooks
  onFlip() {
    const n = this.counter('flips');
    this.unlock('first_flip');
    if (n >= 100) this.unlock('flips_100');
    if (n >= 1000) this.unlock('flips_1000');
  }
  onBounce() { if (this.counter('bounce') >= 25) this.unlock('boing'); }
  onLauncher(type) { if (type === 'toaster') this.unlock('toasty'); }
  onFail(reason) {
    if (reason === 'dog' && this.counter('dog') >= 5) this.unlock('good_boy');
    if ((reason === 'water' || reason === 'flush') && this.counter('water') >= 5) this.unlock('soggy');
  }
  onHint() { this.unlock('helping_hand'); }
  onWin(game) {
    this.unlock('first_bun');
    if (game.flips < game.info.par) this.unlock('under_par');
    if (game.flips === 1 && game.info.par >= 2) this.unlock('one_flip');
    if ((game.fails || 0) >= 10) this.unlock('never_give_up');
    if (game.info.index >= 159) this.unlock('houston');
    const stars = totalStars(this.save);
    if (stars >= 100) this.unlock('stars_100');
    if (stars >= 300) this.unlock('stars_300');
    if (stars >= 600) this.unlock('perfect');
    // every level won (a skipped level doesn't count until it is beaten)
    if (this.app.levels.every((_, i) => this.save.stars[i] > 0)) this.unlock('top_dog');
  }
}
