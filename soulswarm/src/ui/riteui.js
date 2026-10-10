// The RITE button: the hero's signature active ability, above-left of NOVA (mirrored in left-handed mode).
// Radial cooldown ring with a seconds counter, a pulse when ready, a punch and a name call-out on cast.
import './riteui.css';
import { h, $ } from './dom.js';
import { RITES, HEROES } from '../game/data.js';

// 24×24 stroke icons, one per Rite
const ICONS = {
  vael: '<path d="M7 21v-9a5 5 0 0 1 10 0v9"/><path d="M4 21h16"/><path d="M12 18v-7M9.5 13.5 12 11l2.5 2.5"/><path d="M8 4.5 9 6M16 4.5 15 6M12 2.5V4"/>', // a soul rises from the grave
  nyx: '<path d="M14.5 3.5a8.5 8.5 0 1 0 6 14.2 7 7 0 1 1-6-14.2z"/><path d="M2 9h5M1.5 13h4.5M2 17h5"/>', // crescent blade, speed lines
  seraphine: '<path d="M7 2.5v4M12 1.5v5M17 2.5v4"/><path d="M12 22c-3 0-5.2-2-5.2-4.6 0-2.6 2-3.6 2.6-6.1 1.4 1.3 2.4 2.5 2.6 4 .2-1.4 1.1-2.6 2.1-3.6.6 2 3.1 3 3.1 5.7S15 22 12 22z"/>', // chains fall into fire
  liora: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l2 2H4z"/><path d="M10 21.5h4M12 3v2"/><path d="M2.5 9.5A10 10 0 0 1 4.6 5M21.5 9.5A10 10 0 0 0 19.4 5"/>', // the bell tolls
  mordrake: '<path d="M2.5 21 5 11l2.5 10M8.5 21 12 5l3.5 16M16.5 21 19 11l2.5 10"/><path d="M1.5 21.5h21"/>', // bone spikes
  grimsby: '<path d="M9 2.5h6M12 2.5v2"/><path d="M8 6.5h8l-1 8H9z"/><path d="M12 9c-1.2 1.4-1 2.6 0 3.5 1-.9 1.2-2.1 0-3.5z"/><path d="M3 21.5c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/>', // a lantern over a river of fire
  osric: '<circle cx="12" cy="9" r="4"/><path d="M10.5 9.5h.01M13.5 9.5h.01M10.5 12h3"/><ellipse cx="12" cy="4.5" rx="7" ry="2"/><path d="M5 21.5c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/>', // a skull crowned by its halo
};
export const riteIcon = (id, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.vael}</svg>`;

export class RiteButton {
  constructor(ui, run) {
    this.ui = ui;
    const id = run.loadout.heroId, D = RITES[id], hero = HEROES[id];
    this.def = D;
    const asc = !!(D && D.asc && run.loadout.mastery && run.loadout.mastery.asc); // Hero Mastery rank 5: the Ascended Rite
    this.el = h(`<button class="rite ${D ? '' : 'none'} ${asc ? 'asc' : ''}" aria-label="${D ? (asc ? 'Ascended ' : '') + D.name : 'Rite'}" style="--rc:${hero.css}">
      <svg class="ring" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg>
      <span class="core">${riteIcon(id)}<b>${D ? D.short : ''}</b></span><em class="cd"></em>${asc ? '<i class="rite-asc" aria-hidden="true"></i>' : ''}${asc && id === 'nyx' ? '<i class="rite-echo" aria-hidden="true">2</i>' : ''}</button>`);
    ui.el.appendChild(this.el); // inside the HUD, so .lefty mirrors it
    this.fg = $(this.el, '.fg'); this.cdEl = $(this.el, '.cd');
    // pointerdown + stopPropagation: the tap fires at once and never reaches the joystick
    this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ui.wantsRite = true; });
    this.f = -1; this.s = -1; this.on = null; this.echo = false;
  }

  update(run) {
    const R = run.rites, D = this.def;
    if (!D) return;
    const f = Math.round((R.cd / (R.cdMax || D.cd)) * 200), s = R.cd > 0 ? Math.ceil(R.cd) : 0, on = R.active;
    if (f !== this.f) { this.f = f; this.fg.style.strokeDashoffset = String(289 * f / 200); }
    if (s !== this.s) {
      this.s = s;
      this.cdEl.textContent = s ? s : '';
      this.el.classList.toggle('cooling', s > 0);
      this.el.classList.toggle('ready', !s);
      if (!s) this.el.classList.remove('fire'); // a stale cast punch would outrank the ready pulse
    }
    if (on !== this.on) { this.on = on; this.el.classList.toggle('active', on); }
    const echo = R.echoT > 0; // Ascended Shadow Step: the second charge is waiting
    if (echo !== this.echo) { this.echo = echo; this.el.classList.toggle('echo', echo); }
  }

  /** Cast: the button punches and the Rite's name calls out over the battlefield. */
  cast() {
    const el = this.el;
    el.classList.remove('fire'); void el.offsetWidth; el.classList.add('fire');
    if (this.callEl) this.callEl.remove();
    const c = h(`<div class="rite-call" style="--rc:${el.style.getPropertyValue('--rc')}"><b>${this.def.name.toUpperCase()}</b></div>`);
    this.ui.el.appendChild(c);
    this.callEl = c;
    setTimeout(() => c.remove(), 1100);
  }

  /** The cooldown is over. */
  flash() {
    const el = this.el;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
}
