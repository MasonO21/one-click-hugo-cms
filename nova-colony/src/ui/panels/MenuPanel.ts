/**
 * MenuPanel — the #btn-menu grid: everything that doesn't have its own button (daily gift, lucky
 * spin, season pass, journal, wardrobe, Photo Mode, inventory, vehicles, colony, recruitment, settings), with notification badges.
 */
import { Panel, type PanelTitle } from './Panel';
import { fill, h } from '../dom';
import { buildingArt, hudArt, iconEl, rewardArt, vehicleArt } from '../art';

export class MenuPanel extends Panel {
  readonly name = 'menu';
  override readonly kind = 'drawer' as const;

  title(): PanelTitle {
    return { icon: '☰', art: hudArt('menu'), text: 'Menu' };
  }

  override signature(): string {
    const b = this.ctx.badges();
    return `${+b.daily}${+b.spin}${b.season}${+b.crate}${b.expeditions}.${b.journal}|${this.game.sys.expeditions.unlocked() ? 1 : 0}`;
  }

  render(): void {
    const b = this.ctx.badges();
    const tiles: { icon: string; art: string | null; label: string; panel: string; badge?: number; arg?: unknown }[] = [
      { icon: '🎁', art: rewardArt('daily_gift'), label: 'Daily gift', panel: 'daily', badge: b.daily ? 1 : 0 },
      { icon: '🎡', art: hudArt('spin'), label: 'Lucky wheel', panel: 'spin', badge: b.spin ? 1 : 0 },
      { icon: '🏆', art: hudArt('season'), label: 'Season pass', panel: 'season', badge: b.season },
      { icon: '📔', art: hudArt('journal'), label: 'Journal', panel: 'journal', badge: b.journal },
      { icon: '👗', art: hudArt('wardrobe'), label: 'Wardrobe', panel: 'wardrobe' },
      // Photo Mode is not a panel: UI.open('photo') hides the HUD and hands over the camera (ui/photo/PhotoMode.ts)
      ...(this.ctx.renderer.photo ? [{ icon: '📷', art: hudArt('photo'), label: 'Photo', panel: 'photo' }] : []),
      { icon: '🎒', art: hudArt('backpack'), label: 'Inventory', panel: 'inventory' },
      { icon: '🧭', art: hudArt('expeditions'), label: 'Expeditions', panel: 'expeditions', badge: b.expeditions },
      { icon: '🚙', art: vehicleArt('buggy'), label: 'Vehicles', panel: 'vehicles' },
      { icon: '🛰️', art: buildingArt('command_center'), label: 'My colony', panel: 'colony' },
      { icon: '🧑‍🤝‍🧑', art: hudArt('population'), label: 'Recruit', panel: 'recruit' },
      { icon: '⚙️', art: hudArt('settings'), label: 'Settings', panel: 'settings' },
    ];
    const grid = h('div', { class: 'menu-grid' });
    for (const t of tiles) {
      const el = h('button', { class: 'menu-tile', type: 'button', data: { menu: t.panel, sfx: 'ui_click' } }, iconEl(t.art, t.icon, 'ic', 'span'), h('span', { class: 'lb', text: t.label }), t.badge ? h('span', { class: 'badge', text: String(t.badge) }) : null);
      el.addEventListener('click', () => this.ctx.open(t.panel, t.arg));
      grid.appendChild(el);
    }
    fill(this.body, grid);
  }
}
