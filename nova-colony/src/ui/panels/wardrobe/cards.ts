/**
 * Cosmetic cards and the Nova purchase confirmation, shared by the Wardrobe and the Shop.
 *
 *  - `cosmeticIcon`: the painted icon (emoji fallback) in a round well with a rarity-coloured ring (mythic: rainbow).
 *  - `cosmeticCard`: icon, name, rarity ribbon, owned / equipped state and one action (Equip, Unequip, Buy for
 *    Nova) or, for a locked one without a Nova price, where it comes from. Tapping the card opens the detail sheet.
 *  - `buyCosmetic`: buy with Nova (asking first at >= 300 Nova), then put it on.
 *  - `novaConfirm`: "Buy X for 💎 450?" over a panel card. Styles: styles/wardrobe.css.
 */
import type { CosmeticDef } from '../../../data/schema';
import type { UiCtx } from '../../ctx';
import { h, replay } from '../../dom';
import { btn } from '../../widgets';
import { cosmeticArt, iconEl, resIcon } from '../../art';
import { bigNum } from '../../widgets';
import { RARITY_STYLE, cosmeticSources, cosmeticState, needsNovaConfirm, primarySource, type CosmeticSource } from '../../logic/wardrobe';
import { confetti } from '../../fx/Confetti';

/** The painted icon in its rarity ring. */
export function cosmeticIcon(def: CosmeticDef, cls = ''): HTMLElement {
  const st = RARITY_STYLE[def.rarity];
  const el = h('span', { class: `wd-ic r-${def.rarity}${cls ? ' ' + cls : ''}`, title: `${st.label} ${def.name}` }, iconEl(cosmeticArt(def.id), def.icon, 'wd-ic-in', 'span'));
  el.style.setProperty('--ring', st.ring);
  el.style.setProperty('--tint', def.color);
  return el;
}

/** Nova amount with the painted crystal ("💎 450"). */
export function novaLabel(n: number): HTMLElement {
  return h('span', { class: 'wd-nova' }, resIcon('nova', '💎'), ` ${bigNum(n)}`);
}

/** A small line saying where a locked cosmetic comes from. */
export function sourceLine(src: CosmeticSource | null): HTMLElement | null {
  if (!src || src.kind === 'nova') return null;
  const icon = src.kind === 'season' ? '🏆' : src.kind === 'chest' ? '🧰' : src.kind === 'pack' ? '🛍️' : '🎯';
  return h('div', { class: `wd-src k-${src.kind}` }, h('span', { class: 'wd-src-ic', text: icon }), h('span', { text: src.label }));
}

export interface CardHandlers {
  open(def: CosmeticDef): void;
  /** Re-render after an action. */
  changed(): void;
  /** Where confirmations go (the panel's card). */
  host(): HTMLElement;
}

/** Equip / unequip / buy, as one button for the card or the detail sheet. */
export function cosmeticAction(ctx: UiCtx, def: CosmeticDef, on: CardHandlers, big = false): HTMLElement | null {
  const g = ctx.game;
  const lo = g.state.liveops;
  const state = cosmeticState(def, lo.cosmetics);
  const size = big ? 'block' : 'small block';
  if (state === 'equipped') {
    return btn({
      label: 'Unequip',
      cls: `ghost ${size}`,
      data: { act: 'unequip' },
      onClick: (e) => {
        e.stopPropagation();
        g.sys.liveops.unequipCosmetic(def.kind);
        ctx.haptic('tap');
        on.changed();
      },
    });
  }
  if (state === 'owned') {
    return btn({
      label: 'Equip',
      cls: `info ${size}`,
      data: { act: 'equip' },
      onClick: (e) => {
        e.stopPropagation();
        if (g.sys.liveops.equipCosmetic(def.id)) {
          ctx.haptic('success');
          ctx.sfx('ui_tab');
        }
        on.changed();
      },
    });
  }
  if (def.nova > 0) {
    return btn({
      label: h('span', null, big ? 'Buy · ' : '', novaLabel(def.nova)),
      cls: `nova ${size}`,
      data: { act: 'buy' },
      disabled: lo.nova >= def.nova ? false : `You need ${bigNum(def.nova - lo.nova)} more Nova Crystals`,
      onClick: (e) => {
        e.stopPropagation();
        buyCosmetic(ctx, def, on);
      },
    });
  }
  return null;
}

/** Buy a cosmetic with Nova (asking first when it is a big spend), then put it on. */
export function buyCosmetic(ctx: UiCtx, def: CosmeticDef, on: CardHandlers): void {
  const go = () => {
    const g = ctx.game;
    if (!g.sys.liveops.buyCosmetic(def.id)) {
      ctx.toast(g.state.liveops.nova < def.nova ? 'Not enough Nova Crystals' : "Couldn't buy that right now", 'info', '💎');
      on.changed();
      return;
    }
    g.sys.liveops.equipCosmetic(def.id);
    ctx.haptic('success');
    const host = on.host();
    confetti(host, { count: 40, y: host.clientHeight * 0.4 });
    on.changed();
  };
  if (needsNovaConfirm(def.nova)) novaConfirm(on.host(), { title: def.name, icon: cosmeticIcon(def, 'big'), price: def.nova, text: 'It goes straight into your wardrobe.', onConfirm: go });
  else go();
}

/** A wardrobe card. */
export function cosmeticCard(ctx: UiCtx, def: CosmeticDef, on: CardHandlers): HTMLElement {
  const lo = ctx.game.state.liveops;
  const state = cosmeticState(def, lo.cosmetics);
  const st = RARITY_STYLE[def.rarity];
  const card = h('div', { class: `card wd-card r-${def.rarity} s-${state}`, role: 'button', tabindex: '0', data: { cosmetic: def.id, sfx: 'ui_click' } });
  card.style.setProperty('--rar', st.color);
  card.style.setProperty('--rar-d', st.deep);
  card.append(h('span', { class: 'wd-ribbon', text: st.label }));
  if (state !== 'locked') card.append(h('span', { class: 'wd-badge' + (state === 'equipped' ? ' on' : ''), text: state === 'equipped' ? '✓ Wearing' : 'Owned' }));
  card.append(cosmeticIcon(def), h('div', { class: 'wd-name', text: def.name }));
  const action = cosmeticAction(ctx, def, on);
  if (action) card.appendChild(action);
  else card.appendChild(sourceLine(primarySource(cosmeticSources(ctx.data, def))) ?? h('div', { class: 'wd-src', text: 'Special reward' }));
  card.addEventListener('click', () => on.open(def));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      on.open(def);
    }
  });
  return card;
}

export interface ConfirmOpts {
  title: string;
  icon: HTMLElement;
  price: number;
  text?: string;
  /** Button label (default "Buy"). */
  verb?: string;
  onConfirm(): void;
}

/** "Buy X for 💎 450?" over `host` (a panel card). Returns a function that closes it. */
export function novaConfirm(host: HTMLElement, o: ConfirmOpts): () => void {
  host.querySelector(':scope > .nv-confirm')?.remove();
  const close = () => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 180);
  };
  const yes = btn({
    label: h('span', null, `${o.verb ?? 'Buy'} · `, novaLabel(o.price)),
    cls: 'nova block',
    id: 'btn-nova-confirm',
    onClick: () => {
      close();
      o.onConfirm();
    },
  });
  const no = btn({ label: 'Not now', cls: 'ghost block', id: 'btn-nova-cancel', data: { sfx: 'ui_close' }, onClick: close });
  const backdrop = h('div', { class: 'nv-confirm-bd' });
  backdrop.addEventListener('click', close);
  const el = h(
    'div',
    { class: 'nv-confirm', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Buy ${o.title}` },
    backdrop,
    h(
      'div',
      { class: 'nv-confirm-card' },
      h('div', { class: 'nv-confirm-ic' }, o.icon),
      h('div', { class: 'h3 center', text: `${o.verb ?? 'Buy'} ${o.title}?` }),
      h('div', { class: 'nv-confirm-price' }, 'for ', novaLabel(o.price)),
      o.text ? h('div', { class: 'mute small center', text: o.text }) : null,
      h('div', { class: 'nv-confirm-btns' }, no, yes),
    ),
  );
  host.appendChild(el);
  replay(el, 'in');
  return close;
}

/** Is a confirmation up over `host`? (Android back closes it first.) */
export function confirmOpen(host: HTMLElement | undefined): boolean {
  return !!host?.querySelector(':scope > .nv-confirm:not(.out)');
}

/** Close a confirmation over `host` (Android back). */
export function closeConfirm(host: HTMLElement | undefined): void {
  const el = host?.querySelector<HTMLElement>(':scope > .nv-confirm:not(.out)');
  if (!el) return;
  el.classList.add('out');
  window.setTimeout(() => el.remove(), 180);
}
