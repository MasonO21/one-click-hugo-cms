import { addDays, todayISO } from './dates';
import { normalizeName } from './expiry';
import { isAllowedPicture } from './identify';
import { toDrafts, type DraftItem } from './scan';
import { estimateShelfLifeDays, guessCategory } from './shelfLife';
import { CATEGORIES, type Category, type PantryItem, type ScanItem } from './types';

/**
 * Product barcodes: which scans are real ones, what the server's answer may contain (the trust
 * boundary), and how scanned products become review items. Pure, so it is tested without a camera.
 */

export interface BarcodeProduct {
  code: string;
  name: string;
  brand: string | null;
  /** As printed on the pack: "500 g", "6 x 330 ml". */
  quantity: string | null;
  category: Category | null;
  /** Sold frozen, so it goes in the freezer. */
  frozen: boolean;
  picture: { url: string; credit: string; pageUrl: string } | null;
}

/** The barcode types on food packaging. */
export const FOOD_BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** A real GTIN (8, 12, 13 or 14 digits) whose last digit is its check digit. Mirrors server/src/barcode.ts. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** A short UPC-E code written out as the full UPC-A that databases file it under. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = [...code];
  const body =
    d6 === '0' || d6 === '1' || d6 === '2'
      ? `${d1}${d2}${d6}0000${d3}${d4}${d5}`
      : d6 === '3'
        ? `${d1}${d2}${d3}00000${d4}${d5}`
        : d6 === '4'
          ? `${d1}${d2}${d3}${d4}00000${d5}`
          : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const full = `${ns}${body}${check}`;
  return isValidGtin(full) ? full : null;
}

/**
 * What a scan or typed number is as a lookup key: the digits of a valid barcode, a UPC-E written out
 * in full, or null for anything else (a QR code, a smudged read, a price label).
 */
export function normalizeBarcode(raw: string, type?: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (type === 'upc_e' || (digits.length === 8 && !isValidGtin(digits))) {
    const full = expandUpcE(digits);
    if (full) return full;
  }
  return isValidGtin(digits) ? digits : null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** The server's answer, checked like anything else from outside: null when there is no usable product. */
export function toBarcodeProduct(code: string, raw: unknown): BarcodeProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const name = text(p.name, 80);
  if (!name) return null;
  const pic = p.picture as Record<string, unknown> | null | undefined;
  const picture =
    pic && isAllowedPicture(pic.url) && typeof pic.pageUrl === 'string' && pic.pageUrl.startsWith('https://')
      ? { url: pic.url, credit: text(pic.credit, 40) ?? 'Open Food Facts', pageUrl: pic.pageUrl.slice(0, 300) }
      : null;
  return {
    code,
    name,
    brand: text(p.brand, 60),
    quantity: text(p.quantity, 30),
    category: typeof p.category === 'string' && (CATEGORIES as readonly string[]).includes(p.category) ? (p.category as Category) : null,
    frozen: p.frozen === true,
    picture,
  };
}

export interface Scanned {
  product: BarcodeProduct;
  /** How many of it were scanned. */
  count: number;
}

/**
 * Review items for scanned products. They go through the same rules as a receipt (each to where it
 * keeps best, dates from today), and anything sold frozen goes to the freezer. The same product
 * scanned twice, or two with the same name, is one line with a count.
 */
export function barcodeDrafts(scanned: Scanned[], existing: PantryItem[], now: Date = new Date()): DraftItem[] {
  const merged = new Map<string, Scanned>();
  for (const s of scanned) {
    const key = normalizeName(s.product.name);
    const seen = merged.get(key);
    if (seen) merged.set(key, { ...seen, count: seen.count + s.count });
    else merged.set(key, s);
  }
  const frozen = new Set([...merged.values()].filter((s) => s.product.frozen).map((s) => normalizeName(s.product.name)));
  const items: ScanItem[] = [...merged.values()].map(({ product: p, count }) => ({
    name: p.name,
    category: p.category ?? guessCategory(p.name),
    quantity: count > 1 ? `${count} × ${p.quantity ?? '1'}` : (p.quantity ?? '1'),
    shelfLifeDays: null,
    labelExpiryDate: null,
    confidence: 'high',
    keptIn: p.frozen ? 'freezer' : null,
  }));
  const today = todayISO(now);
  const inFreezer = new Set(existing.filter((i) => i.status === 'active' && i.location === 'freezer').map((i) => normalizeName(i.name)));
  return toDrafts({ items, purchaseDate: null, currency: null }, 'fridge', existing, now, 'receipt').map((d) => {
    const norm = normalizeName(d.name);
    // A known food (peas, say) would usually go in the fridge; this pack was sold frozen.
    if (!frozen.has(norm) || d.location === 'freezer') return d;
    return { ...d, location: 'freezer', expiresOn: addDays(today, estimateShelfLifeDays(d.name, d.category, 'freezer')), duplicate: inFreezer.has(norm) };
  });
}

/** Sample products for the preview, which has no server. Any barcode gives one of these. */
const SAMPLES: Omit<BarcodeProduct, 'code'>[] = [
  { name: 'Greek yogurt', brand: 'Sample Dairy', quantity: '500 g', category: 'dairy', frozen: false, picture: null },
  { name: 'Oat milk', brand: 'Sample Oats', quantity: '1 L', category: 'drinks', frozen: false, picture: null },
  { name: 'Garden peas', brand: 'Sample Frozen', quantity: '900 g', category: 'produce', frozen: true, picture: null },
  { name: 'Chicken breast', brand: 'Sample Farm', quantity: '600 g', category: 'meat', frozen: false, picture: null },
  { name: 'Hummus', brand: 'Sample Deli', quantity: '200 g', category: 'condiments', frozen: false, picture: null },
  { name: 'Penne pasta', brand: 'Sample Pasta', quantity: '500 g', category: 'grains', frozen: false, picture: null },
  { name: 'Chopped tomatoes', brand: 'Sample Cannery', quantity: '400 g', category: 'canned', frozen: false, picture: null },
];

/** Barcodes for the preview's "Try a sample barcode", one per sample product. */
export const SAMPLE_BARCODES = ['4006381333931', '036000291452', '73513537', '9780201379624', '5000159407236', '8000500310427', '5010029000016'];

export function demoProduct(code: string): BarcodeProduct {
  const at = SAMPLE_BARCODES.indexOf(code);
  const index = at >= 0 ? at : [...code].reduce((sum, d) => sum + Number(d), 0) % SAMPLES.length;
  return { ...SAMPLES[index % SAMPLES.length]!, code };
}
