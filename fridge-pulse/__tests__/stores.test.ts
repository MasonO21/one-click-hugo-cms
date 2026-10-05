import { act } from 'react-test-renderer';
import { useInventory } from '../src/store/inventory';
import { useScanDraft } from '../src/store/scanDraft';
import { useShopping } from '../src/store/shopping';
import { resolveItems } from '../src/store/actions';
import { useSnackbar } from '../src/store/snackbar';
import { addDays, todayISO } from '../src/lib/dates';
import { mk } from '../test-utils/helpers';

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
      removeItem: async (k: string) => void data.delete(k),
    },
  };
});
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(async () => {}), NotificationFeedbackType: {} }));

const today = todayISO();
const soon = addDays(today, 1);
const later = addDays(today, 30);

beforeEach(() => {
  act(() => {
    useInventory.getState().clear();
    useShopping.getState().clear();
    useSnackbar.getState().hide();
  });
});

describe('lifetime totals', () => {
  it('count rescues once, even on a double tap, and undo takes them back', () => {
    act(() => useInventory.getState().addItems([mk('a', 'Milk', soon), mk('b', 'Rice', later)]));
    expect(useInventory.getState().lifetime.startedOn).toBe(today);
    act(() => {
      useInventory.getState().resolveItem('a', 'used');
      useInventory.getState().resolveItem('a', 'used');
      useInventory.getState().resolveItem('b', 'used');
    });
    expect(useInventory.getState().lifetime).toMatchObject({ used: 2, rescued: 1, wasted: 0 });
    act(() => useInventory.getState().reactivateItem('a'));
    expect(useInventory.getState().lifetime).toMatchObject({ used: 1, rescued: 0 });
  });

  it('remember the last day food was thrown out, and forget it on undo', () => {
    act(() => useInventory.getState().addItems([mk('a', 'Spinach', soon)]));
    act(() => {
      useInventory.getState().resolveItem('a', 'wasted');
    });
    expect(useInventory.getState().lifetime).toMatchObject({ wasted: 1, lastWastedOn: today });
    act(() => useInventory.getState().reactivateItem('a'));
    expect(useInventory.getState().lifetime).toMatchObject({ wasted: 0, lastWastedOn: null });
  });
});

describe('resolveItems', () => {
  it('marks food used, says so, and can be undone from the message bar', () => {
    act(() => useInventory.getState().addItems([mk('a', 'Milk', soon)]));
    act(() => resolveItems([useInventory.getState().items[0]!], 'used'));
    expect(useInventory.getState().items[0]!.status).toBe('used');
    const snack = useSnackbar.getState().snack!;
    expect(snack).toMatchObject({ message: 'Nice save! Milk rescued', tone: 'rescue' });
    act(() => snack.action!.onPress());
    expect(useInventory.getState().items[0]!.status).toBe('active');
  });

  it('counts and undoes only what it changed, even from stale copies', () => {
    act(() => useInventory.getState().addItems([mk('eggs', 'Eggs', later), mk('milk', 'Milk', soon)]));
    // The caller read both before a housemate's change (Milk thrown out) arrived.
    const stale = useInventory.getState().items.map((i) => ({ ...i }));
    act(() => {
      useInventory.getState().resolveItem('milk', 'wasted');
    });
    act(() => resolveItems(stale, 'used', { mealTitle: 'Omelette' }));
    const snack = useSnackbar.getState().snack!;
    expect(snack.message).toBe('1 item used in Omelette');
    act(() => snack.action!.onPress());
    const status = Object.fromEntries(useInventory.getState().items.map((i) => [i.id, i.status]));
    expect(status).toEqual({ eggs: 'active', milk: 'wasted' });
  });

  it('puts the last-waste date back on undo, so the streak is not reset', () => {
    act(() => {
      useInventory.setState({ lifetime: { ...useInventory.getState().lifetime, startedOn: addDays(today, -200), lastWastedOn: addDays(today, -120) } });
      useInventory.getState().addItems([mk('a', 'Spinach', soon), mk('b', 'Kale', soon)]);
    });
    act(() => resolveItems([useInventory.getState().items.find((i) => i.id === 'a')!], 'wasted'));
    expect(useInventory.getState().lifetime.lastWastedOn).toBe(today);
    act(() => useSnackbar.getState().snack!.action!.onPress());
    expect(useInventory.getState().lifetime.lastWastedOn).toBe(addDays(today, -120));
    // Something thrown out after it keeps today's date when the earlier one is undone.
    act(() => resolveItems([useInventory.getState().items.find((i) => i.id === 'a')!], 'wasted'));
    const first = useSnackbar.getState().snack!;
    act(() => resolveItems([useInventory.getState().items.find((i) => i.id === 'b')!], 'wasted'));
    act(() => first.action!.onPress());
    expect(useInventory.getState().lifetime.lastWastedOn).toBe(today);
  });
});

describe('shopping list', () => {
  it('does not add the same food twice, and re-adds a ticked-off one', () => {
    const add = (name: string) => useShopping.getState().add({ name, category: 'dairy' });
    let first = false;
    let again = true;
    act(() => {
      first = add('milk');
      again = add(' Milk ');
    });
    expect([first, again]).toEqual([true, false]);
    expect(useShopping.getState().items.map((i) => i.name)).toEqual(['Milk']);
    const id = useShopping.getState().items[0]!.id;
    act(() => useShopping.getState().toggle(id));
    act(() => {
      again = add('MILK');
    });
    expect(again).toBe(true);
    expect(useShopping.getState().items[0]!.checked).toBe(false);
  });

  it('puts ticked-off shopping away where each food belongs', () => {
    act(() => {
      useShopping.getState().add({ name: 'Bananas', category: 'produce' });
      useShopping.getState().add({ name: 'Milk', category: 'dairy' });
      useShopping.getState().add({ name: 'Ice cream', category: 'dairy', keptIn: 'freezer' });
    });
    act(() => useScanDraft.getState().startPutAway(useShopping.getState().items));
    const byName = Object.fromEntries(useScanDraft.getState().drafts.map((d) => [d.name, d]));
    expect(useScanDraft.getState().mode).toBe('shopping');
    expect(byName.Bananas!.location).toBe('pantry');
    expect(byName.Milk!.location).toBe('fridge');
    expect(byName['Ice cream']!.location).toBe('freezer');
    expect(byName.Milk!.shoppingId).toBeTruthy();
  });
});

describe('moving a scanned list to another place', () => {
  it("re-checks what is already tracked there, but keeps the person's own ticks", () => {
    act(() => useInventory.getState().addItems([mk('t', 'Milk', later, { location: 'fridge' })]));
    const scanned = (name: string, key: string) => ({
      key, name, category: 'dairy' as const, quantity: '1', location: 'fridge' as const, expiresOn: soon,
      expirySource: 'estimate' as const, confidence: 'high' as const, selected: name !== 'Milk', duplicate: name === 'Milk',
    });
    act(() => useScanDraft.getState().start('fridge', [scanned('Milk', 'm'), scanned('Yogurt', 'y')], null));
    act(() => useScanDraft.getState().update('y', { selected: false }));
    act(() => useScanDraft.getState().setLocation('pantry'));
    const [milk, yogurt] = useScanDraft.getState().drafts;
    // Milk is not tracked in the pantry, so it is no longer a repeat and is ticked again.
    expect(milk).toMatchObject({ duplicate: false, selected: true, location: 'pantry' });
    // The person unticked yogurt themselves; that sticks.
    expect(yogurt).toMatchObject({ selected: false, userSelected: true });
  });
});
