import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { distanceText, heartsView, showMePlan, wishBadge, wishCard, wishGuideTarget, wishRows, SHOW_ME_SECONDS } from '../src/ui/logic/wishes';
import { computeBadges } from '../src/ui/logic/badges';
import { colonists, force, placeNear, setAmount, wishColony } from './wishes.helpers';

describe('ui.wishes — hearts and distances', () => {
  it('hearts read as gold and white hearts with a friendly label', () => {
    expect(heartsView(0)).toMatchObject({ full: 0, text: '🤍🤍🤍🤍🤍', label: 'New friend' });
    expect(heartsView(1).label).toBe('Friends');
    expect(heartsView(3)).toMatchObject({ full: 3, text: '💛💛💛🤍🤍', label: 'Close friends' });
    expect(heartsView(5).label).toBe('Best friends');
    expect(heartsView(9).full).toBe(5);
    expect(heartsView(-2).full).toBe(0);
    expect(heartsView(Number.NaN).full).toBe(0);
  });

  it('distances say "right here" up close, else metres', () => {
    expect(distanceText(2)).toBe('right here');
    expect(distanceText(48.6)).toBe('49 m away');
    expect(distanceText(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('ui.wishes — the wish card', () => {
  it('Give: label with the amount and icon, disabled with a reason when short', () => {
    const rig = wishColony();
    const g = rig.game;
    setAmount(rig, 'food', 1); // the colony knows food
    const w = force(rig, 'give_berry_pie');
    setAmount(rig, 'food', 0);
    const card = wishCard(g, w)!;
    expect(card.kind).toBe('give');
    expect(card.give).toMatchObject({ res: 'food', need: w.need });
    expect(card.give!.label).toBe(`Give ${w.need} 🍎`);
    expect(card.give!.why).toBe(`Need ${w.need} more Food`);
    expect(card.text).toContain(String(w.need));
    expect(card.text).not.toContain('{n}');
    expect(card.showMe).toBe(false);
    expect(card.progress).toBeNull();
    setAmount(rig, 'food', w.need);
    expect(wishCard(g, w)!.give!.why).toBeNull();
  });

  it('Build, craft, chat and explore get a hint, progress where it counts, and Show me', () => {
    const rig = wishColony();
    const g = rig.game;
    const ids = colonists(rig).map((c) => c.id);
    const build = wishCard(g, force(rig, 'build_lantern', ids[0]))!;
    expect(build.hint).toBe('Place one more Lantern from the Build menu.');
    expect(build.progress).toBe('0 / 1');
    expect(build.showMe).toBe(true);
    expect(build.give).toBeNull();
    const craft = wishCard(g, force(rig, 'craft_bandage', ids[1]))!;
    expect(craft.hint).toBe('Craft Bandage by hand.');
    const chat = wishCard(g, force(rig, 'chat_story', ids[2]))!;
    expect(chat.hint).toMatch(/^Walk up to .+ and tap Chat\.$/);
    expect(chat.progress).toBeNull();
    const explore = wishCard(g, force(rig, 'explore_surprise', ids[3]))!;
    expect(explore.progress).toBe('0 / 1');
    expect(explore.showMe).toBe(true);
  });

  it('Show me opens the right menu at the right card, or points at a spot in the world', () => {
    const rig = wishColony();
    const g = rig.game;
    const ids = colonists(rig).map((c) => c.id);
    placeNear(g, 'campfire'); // the roasting station
    expect(showMePlan(g, force(rig, 'build_lantern', ids[0]))).toEqual({ panel: { name: 'build', arg: { def: 'lamp_post' } }, ui: '[data-build="lamp_post"]' });
    expect(showMePlan(g, force(rig, 'craft_roast', ids[1]))).toEqual({ panel: { name: 'craft', arg: { station: 'campfire' } }, ui: '[data-recipe="r_roast_berries"]' });
    const chat = force(rig, 'chat_story', ids[2]);
    const c = g.sys.colonists.get(chat.colonist)!;
    const plan = showMePlan(g, chat)!;
    expect(plan.world).toEqual({ x: c.x, z: c.z });
    // the camera aims 4 units past them (away from the camera), so they land below the mission card
    const yaw = g.view.camera.yaw;
    expect(plan.focus!.x).toBeCloseTo(c.x - Math.sin(yaw) * 4, 6);
    expect(plan.focus!.z).toBeCloseTo(c.z - Math.cos(yaw) * 4, 6);
    const ex = showMePlan(g, force(rig, 'explore_surprise', ids[3]))!;
    expect(ex.world).toBeTruthy();
    expect(ex.focus).toBeTruthy();
    expect(showMePlan(g, force(rig, 'give_tea', ids[4]))).toBeNull();
  });

  it('the guide follows a pinned wish until it comes true or time is up', () => {
    const rig = wishColony();
    const g = rig.game;
    const w = force(rig, 'chat_story');
    const c = g.sys.colonists.get(w.colonist)!;
    const pin = { id: w.id, until: 100 + SHOW_ME_SECONDS };
    expect(wishGuideTarget(g, null, 100)).toBeNull();
    const t = wishGuideTarget(g, pin, 100)!;
    expect(t.world).toEqual({ x: c.x, z: c.z });
    expect(t.ui).toBeNull();
    // the colonist walks on: so does the arrow
    c.x += 5;
    expect(wishGuideTarget(g, pin, 101)!.world!.x).toBe(c.x);
    expect(wishGuideTarget(g, pin, 100 + SHOW_ME_SECONDS + 1)).toBeNull();
    g.sys.wishes.chat(c.id);
    expect(wishGuideTarget(g, pin, 101)).toBeNull();
    const b = force(rig, 'build_lantern');
    expect(wishGuideTarget(g, { id: b.id, until: 999 }, 1)).toMatchObject({ world: null, ui: '[data-build="lamp_post"]' });
  });
});

describe('ui.wishes — the Wishes list and the Crew badge', () => {
  it('lists open wishes nearest first and counts them on the Crew badge (not those away)', () => {
    const rig = wishColony();
    const g = rig.game;
    const [a, b, c] = colonists(rig);
    const p = g.state.player;
    a.x = p.x + 30;
    a.z = p.z;
    b.x = p.x + 3;
    b.z = p.z;
    force(rig, 'chat_story', a.id);
    force(rig, 'build_lantern', b.id);
    const rows = wishRows(g);
    expect(rows.map((r) => r.card.colonist)).toEqual([b.id, a.id]);
    expect(rows[0].where).toBe('right here');
    expect(rows[1].where).toBe('30 m away');
    expect(wishBadge(g)).toBe(2);
    expect(computeBadges(g).wishes).toBe(2);
    force(rig, 'give_tea', c.id);
    g.sys.colonists.sendAway([c.id]);
    expect(wishBadge(g)).toBe(2);
    expect(wishRows(g).length).toBe(2);
  });
});

describe('ui.wishes — touch targets', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'styles', 'wishes.css'), 'utf8');
  const minHeight = (selector: string): number => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    if (!m) throw new Error(`no rule for ${selector}`);
    // `min-height: 44px` or `min-height: max(44px, 3.4em)`
    return Number(/min-height:\s*(?:max\()?(\d+)px/.exec(m[1])?.[1] ?? 0);
  };

  it('wish buttons and list rows are at least 44 px tall and wrap instead of scrolling sideways', () => {
    expect(minHeight('.nv-root .wish-actions .btn')).toBeGreaterThanOrEqual(44);
    expect(minHeight('.nv-root .wish-who')).toBeGreaterThanOrEqual(44);
    expect(css).toMatch(/\.wish-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});
