/**
 * Product barcodes: which scans count, what the server may say (trust boundary), how products
 * become review items, and the scanning screen end to end in preview mode.
 */
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';
import Barcode from '../src/app/barcode';
import { barcodeDrafts, demoProduct, expandUpcE, isValidGtin, normalizeBarcode, SAMPLE_BARCODES, toBarcodeProduct, type BarcodeProduct } from '../src/lib/barcode';
import { addDays, todayISO } from '../src/lib/dates';
import { useBarcodes } from '../src/store/barcodes';
import { useScanDraft } from '../src/store/scanDraft';
import { mk, NOW } from '../test-utils/helpers';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useSegments: () => ['barcode'] }));
const mockRouter = (jest.requireMock('expo-router') as { router: { replace: jest.Mock } }).router;
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {} }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false, canAskAgain: true }, jest.fn(async () => ({ granted: false }))],
}));

const product = (over: Partial<BarcodeProduct>): BarcodeProduct => ({ code: '4006381333931', name: 'Greek yogurt', brand: null, quantity: '500 g', category: 'dairy', frozen: false, picture: null, ...over });

describe('which scans are product barcodes', () => {
  it('checks the check digit, and writes a short UPC-E out in full', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(normalizeBarcode('04252614', 'upc_e')).toBe('042100005264');
    expect(normalizeBarcode(' 4 006381 333931 ')).toBe('4006381333931');
    expect(normalizeBarcode('https://example.com/qr', 'qr')).toBeNull();
    expect(normalizeBarcode('12345670')).toBe('12345670');
    expect(normalizeBarcode('1234')).toBeNull();
  });

  it('every preview sample is a valid barcode with a sample product', () => {
    for (const code of SAMPLE_BARCODES) {
      expect(normalizeBarcode(code)).toBe(code);
      expect(demoProduct(code).code).toBe(code);
    }
    expect(new Set(SAMPLE_BARCODES.map((c) => demoProduct(c).name)).size).toBe(SAMPLE_BARCODES.length);
  });
});

describe('what the server may say about a product', () => {
  it('keeps a named product, and drops anything it should not trust', () => {
    expect(toBarcodeProduct('1', { name: '  Oat   drink ', brand: 'Oatly', quantity: '1 L', category: 'drinks', frozen: true })).toEqual({
      code: '1',
      name: 'Oat drink',
      brand: 'Oatly',
      quantity: '1 L',
      category: 'drinks',
      frozen: true,
      picture: null,
    });
    expect(toBarcodeProduct('1', { brand: 'No name' })).toBeNull();
    expect(toBarcodeProduct('1', null)).toBeNull();
    const odd = toBarcodeProduct('1', { name: 'X', category: 'weapons', frozen: 'yes', picture: { url: 'https://evil.example/a.jpg', pageUrl: 'https://evil.example' } });
    expect(odd).toMatchObject({ category: null, frozen: false, picture: null });
    const pic = toBarcodeProduct('1', { name: 'X', picture: { url: 'https://images.openfoodfacts.org/a.jpg', credit: 'Open Food Facts', pageUrl: 'https://world.openfoodfacts.org/product/1' } });
    expect(pic?.picture?.url).toBe('https://images.openfoodfacts.org/a.jpg');
  });
});

describe('scanned products as review items', () => {
  it('sends each to where it keeps best, frozen packs to the freezer, and counts repeats', () => {
    const today = todayISO(NOW);
    const drafts = barcodeDrafts(
      [
        { product: product({}), count: 1 },
        { product: product({ code: '2', name: 'Garden peas', quantity: '900 g', category: 'produce', frozen: true }), count: 1 },
        { product: product({ code: '3', name: 'Penne pasta', category: 'grains' }), count: 1 },
        { product: product({ code: '4', name: 'Greek Yogurt', quantity: '500 g' }), count: 2 },
      ],
      [],
      NOW,
    );
    const by = Object.fromEntries(drafts.map((d) => [d.name, d]));
    expect(Object.keys(by)).toEqual(['Greek yogurt', 'Garden peas', 'Penne pasta']);
    expect(by['Greek yogurt']).toMatchObject({ location: 'fridge', category: 'dairy', quantity: '3 × 500 g', selected: true });
    expect(by['Garden peas']!.location).toBe('freezer');
    expect(by['Garden peas']!.expiresOn > addDays(today, 30)).toBe(true);
    expect(by['Penne pasta']!.location).toBe('pantry');
  });

  it('files a brand name the app does not know by the product’s category, and flags food already tracked', () => {
    const drafts = barcodeDrafts([{ product: product({ name: 'Zyxwq Original', category: 'condiments' }), count: 1 }], [mk('a', 'Zyxwq Original', '2026-10-20', { category: 'condiments', location: 'fridge' })], NOW);
    expect(drafts[0]).toMatchObject({ category: 'condiments' });
    const peas = barcodeDrafts([{ product: product({ name: 'Garden peas', category: 'produce', frozen: true }), count: 1 }], [mk('b', 'Garden peas', '2027-03-01', { category: 'produce', location: 'freezer' })], NOW);
    expect(peas[0]).toMatchObject({ location: 'freezer', duplicate: true });
  });
});

/** All visible text, joined up. */
function textOf(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

describe('the barcode screen (preview)', () => {
  beforeEach(() => {
    mockRouter.replace.mockClear();
    act(() => {
      useBarcodes.getState().clear();
      useScanDraft.getState().clear();
    });
  });

  it('adds typed barcodes, counts a second pack, refuses non-barcodes and opens the review', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <Barcode />
        </SafeAreaProvider>,
      );
    });
    const byId = (id: string) => tree.root.findByProps({ testID: id });
    const type = async (code: string) => {
      await act(async () => {
        byId('barcode-input').props.onChangeText(code);
      });
      await act(async () => {
        byId('barcode-add').props.onPress();
      });
    };
    expect(textOf(tree.toJSON() as ReactTestRendererJSON)).toContain('Point your camera at a barcode');
    await type('4006381333931');
    await type('4006381333931');
    await type('12345678');
    const text = textOf(tree.toJSON() as ReactTestRendererJSON);
    expect(text).toContain(demoProduct('4006381333931').name);
    expect(text).toContain('×2');
    expect(text).toContain('That does not look like a product barcode');
    // Remembered for next time.
    expect(useBarcodes.getState().known['4006381333931']?.name).toBe(demoProduct('4006381333931').name);

    await act(async () => {
      byId('barcode-review').props.onPress();
    });
    const draft = useScanDraft.getState();
    expect(draft.mode).toBe('barcode');
    expect(draft.drafts).toHaveLength(1);
    expect(draft.drafts[0]!.quantity).toContain('2 ×');
    expect(mockRouter.replace).toHaveBeenCalledWith('/review');
  });
});
