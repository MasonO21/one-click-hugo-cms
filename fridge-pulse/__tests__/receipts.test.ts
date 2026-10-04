/**
 * Reading a shopping receipt: each item headed for its own place, dates counted from the day of the
 * shop, and the review list that lets the person move things.
 */
import { act } from 'react-test-renderer';
import { addDays, todayISO } from '../src/lib/dates';
import { demoReceipt } from '../src/lib/demo';
import { draftToItem, purchaseDay, receiptPlace, toDrafts } from '../src/lib/scan';
import { estimateShelfLifeDays } from '../src/lib/shelfLife';
import type { ScanItem } from '../src/lib/types';
import { useInventory } from '../src/store/inventory';
import { useScanDraft } from '../src/store/scanDraft';
import { mk, NOW } from '../test-utils/helpers';

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

const TODAY = '2026-09-29';
const line = (name: string, over: Partial<ScanItem> = {}): ScanItem => ({
  name,
  category: 'other',
  quantity: '1',
  shelfLifeDays: null,
  labelExpiryDate: null,
  confidence: 'high',
  clue: null,
  photo: null,
  keptIn: null,
  ...over,
});

describe('where receipt food goes', () => {
  it('uses the app’s own rule for food it knows, whatever the reader said', () => {
    expect(receiptPlace('Bananas', 'produce', 'fridge')).toBe('pantry');
    expect(receiptPlace('Ice cream', 'dairy', 'pantry')).toBe('freezer');
    expect(receiptPlace('Chicken breast', 'meat', 'pantry')).toBe('fridge');
    expect(receiptPlace('Spaghetti', 'grains', null)).toBe('pantry');
  });

  it('trusts the reader for unfamiliar food, but never puts chilled food in the cupboard', () => {
    expect(receiptPlace('Gochujang', 'condiments', 'fridge')).toBe('fridge');
    expect(receiptPlace('Yakult', 'drinks', 'fridge')).toBe('fridge');
    expect(receiptPlace('Mystery sausage roll', 'meat', 'pantry')).toBe('fridge');
    expect(receiptPlace('Gochujang', 'condiments', 'garage')).toBe('pantry');
  });
});

describe('the day of the shop', () => {
  it.each([
    ['2026-09-28', '2026-09-28'],
    ['2026-09-29', '2026-09-29'],
    ['2026-09-01', '2026-09-01'],
    // Not this month's shopping, a misread, or no date at all: count from today.
    ['2026-08-01', TODAY],
    ['2026-10-02', TODAY],
    ['28/09/2026', TODAY],
    [null, TODAY],
  ])('%p -> %s', (printed, day) => {
    expect(purchaseDay(printed, TODAY)).toBe(day);
  });
});

describe('receipt drafts', () => {
  const response = {
    purchaseDate: '2026-09-27',
    items: [
      line('Milk', { category: 'dairy', shelfLifeDays: 7, keptIn: 'fridge' }),
      line('Bananas', { category: 'produce', shelfLifeDays: 5, keptIn: 'pantry' }),
      line('Frozen peas', { category: 'produce', shelfLifeDays: 300, keptIn: 'freezer' }),
      line('Chili paste', { category: 'condiments', shelfLifeDays: 365, keptIn: 'pantry', confidence: 'low', clue: 'CJ GOCHU PST 500G' }),
      // Receipts carry no expiry dates; a stray one is ignored.
      line('Greek yogurt', { category: 'dairy', shelfLifeDays: 14, keptIn: 'fridge', labelExpiryDate: '2026-12-01', photo: 2 }),
    ],
  };

  it('sends each item to its own place, with dates from the day of the shop', () => {
    const drafts = toDrafts(response, 'fridge', [], NOW, 'receipt');
    const by = Object.fromEntries(drafts.map((d) => [d.name, d]));
    expect(by.Milk).toMatchObject({ location: 'fridge', addedOn: '2026-09-27', expiresOn: addDays('2026-09-27', 7), expirySource: 'estimate' });
    expect(by.Bananas).toMatchObject({ location: 'pantry', expiresOn: addDays('2026-09-27', 5) });
    expect(by['Frozen peas']).toMatchObject({ location: 'freezer' });
    expect(by['Chili paste']).toMatchObject({ location: 'pantry', confidence: 'low', clue: 'CJ GOCHU PST 500G' });
    expect(by['Greek yogurt']!.expirySource).toBe('estimate');
    expect(by['Greek yogurt']!.photo).toBeUndefined();
  });

  it('keeps food the person already has ticked: more of it was bought', () => {
    const existing = [mk('m', 'Milk', '2026-10-02', { location: 'fridge' })];
    const milk = toDrafts(response, 'fridge', existing, NOW, 'receipt').find((d) => d.name === 'Milk')!;
    expect(milk).toMatchObject({ duplicate: true, selected: true });
    // A shelf photo of the same fridge is the same milk.
    const shelf = toDrafts({ items: [line('Milk', { category: 'dairy' })] }, 'fridge', existing, NOW).find((d) => d.name === 'Milk')!;
    expect(shelf).toMatchObject({ duplicate: true, selected: false });
  });

  it('counts from today when the receipt has no usable date', () => {
    const drafts = toDrafts({ ...response, purchaseDate: null }, 'fridge', [], NOW, 'receipt');
    expect(drafts.every((d) => d.addedOn === undefined)).toBe(true);
    expect(drafts.find((d) => d.name === 'Milk')!.expiresOn).toBe(addDays(TODAY, 7));
  });

  it('saves the purchase date as the day the food was added', () => {
    const [milk] = toDrafts(response, 'fridge', [], NOW, 'receipt');
    expect(draftToItem(milk!, 'x', NOW).addedOn).toBe('2026-09-27');
    const [shelf] = toDrafts({ items: [line('Milk', { category: 'dairy' })] }, 'fridge', [], NOW);
    expect(draftToItem(shelf!, 'y', NOW).addedOn).toBe(TODAY);
  });

  it('the sample receipt spreads its food over the fridge, freezer and pantry', async () => {
    jest.useFakeTimers();
    const pending = demoReceipt();
    jest.advanceTimersByTime(2000);
    const res = await pending;
    jest.useRealTimers();
    const drafts = toDrafts(res, 'fridge', [], new Date(), 'receipt');
    const places = new Set(drafts.map((d) => d.location));
    expect(places).toEqual(new Set(['fridge', 'freezer', 'pantry']));
    expect(drafts.find((d) => d.name === 'Ice cream')!.location).toBe('freezer');
    expect(drafts.find((d) => d.name === 'Bananas')!.location).toBe('pantry');
    expect(drafts.every((d) => d.addedOn === addDays(todayISO(), -1))).toBe(true);
  });
});

describe('reviewing a receipt', () => {
  beforeEach(() => {
    act(() => {
      useInventory.getState().clear();
      useScanDraft.getState().clear();
    });
  });

  it('moves one item and re-dates it from the day of the shop', () => {
    const bought = addDays(todayISO(), -2);
    const drafts = toDrafts({ purchaseDate: bought, items: [line('Chicken breast', { category: 'meat', shelfLifeDays: 2, keptIn: 'fridge' })] }, 'fridge', [], new Date(), 'receipt');
    act(() => useScanDraft.getState().start('fridge', drafts, null, 'receipt'));
    const key = useScanDraft.getState().drafts[0]!.key;
    act(() => useScanDraft.getState().moveDraft(key, 'freezer'));
    expect(useScanDraft.getState().drafts[0]).toMatchObject({
      location: 'freezer',
      expiresOn: addDays(bought, estimateShelfLifeDays('Chicken breast', 'meat', 'freezer')),
    });
  });

  it('a forgotten item added by hand goes where it usually lives', () => {
    act(() => useScanDraft.getState().start('fridge', [], null, 'receipt'));
    act(() => useScanDraft.getState().addManual('Frozen spinach'));
    act(() => useScanDraft.getState().addManual('Canned tomatoes'));
    const by = Object.fromEntries(useScanDraft.getState().drafts.map((d) => [d.name, d.location]));
    expect(by).toEqual({ 'Frozen spinach': 'freezer', 'Canned tomatoes': 'pantry' });
  });
});
