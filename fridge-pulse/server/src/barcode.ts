import { isAllowedPicture, type Picture } from './pictures.js';
import type { Category } from './schemas.js';

/**
 * Product barcodes (EAN-13, EAN-8, UPC-A, UPC-E as GTIN), looked up in Open Food Facts. Only the
 * number leaves the phone; the server asks Open Food Facts and answers with the product's name,
 * brand, size, a picture from the allowed hosts, and a category in the app's terms.
 */

export interface BarcodeProduct {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  /** In the app's categories, when Open Food Facts files the product somewhere recognisable. */
  category: Category | null;
  /** Sold frozen: it goes in the freezer. */
  frozen: boolean;
  picture: Picture | null;
}

export interface BarcodeLookup {
  /** The product, or null when Open Food Facts does not have it. Throws `BarcodeUnavailable` when it cannot be asked. */
  find(code: string): Promise<BarcodeProduct | null>;
}

export class BarcodeUnavailable extends Error {
  constructor() {
    super('Open Food Facts could not be reached');
    this.name = 'BarcodeUnavailable';
  }
}

/** A real GTIN: 8, 12, 13 or 14 digits whose last digit is the check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the right, digits alternate weights 3 and 1.
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Open Food Facts category tags in the app's categories. Earlier rows win: a dairy drink is dairy,
 * canned vegetables are canned, and juice is a drink rather than produce.
 */
const TAG_CATEGORIES: [Category, string[]][] = [
  ['seafood', ['en:seafood', 'en:fishes', 'en:fish-and-seafood-products', 'en:canned-fishes']],
  ['meat', ['en:meats', 'en:meat-based-products', 'en:poultries', 'en:sausages', 'en:hams', 'en:prepared-meats']],
  ['dairy', ['en:dairies', 'en:cheeses', 'en:yogurts', 'en:milks', 'en:butters', 'en:creams', 'en:eggs']],
  ['canned', ['en:canned-foods', 'en:canned-vegetables', 'en:canned-fruits', 'en:canned-legumes']],
  ['drinks', ['en:beverages', 'en:waters', 'en:juices', 'en:sodas', 'en:coffees', 'en:teas', 'en:plant-based-milks', 'en:milk-substitutes']],
  ['condiments', ['en:condiments', 'en:sauces', 'en:dressings', 'en:mustards', 'en:ketchup', 'en:spices', 'en:vinegars', 'en:honeys', 'en:jams', 'en:spreads']],
  ['bakery', ['en:breads', 'en:pastries', 'en:viennoiseries', 'en:cakes', 'en:tortillas']],
  ['snacks', ['en:snacks', 'en:sweet-snacks', 'en:salty-snacks', 'en:chocolates', 'en:biscuits', 'en:confectioneries', 'en:crisps', 'en:chips-and-fries']],
  ['grains', ['en:pastas', 'en:rices', 'en:breakfast-cereals', 'en:flours', 'en:cereal-grains', 'en:noodles', 'en:cereals-and-potatoes']],
  ['produce', ['en:fresh-vegetables', 'en:fresh-fruits', 'en:vegetables', 'en:fruits', 'en:salads', 'en:mushrooms']],
];

export function categoryFromTags(tags: unknown): Category | null {
  if (!Array.isArray(tags)) return null;
  const have = new Set(tags.filter((t): t is string => typeof t === 'string'));
  for (const [category, wanted] of TAG_CATEGORIES) if (wanted.some((t) => have.has(t))) return category;
  return null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

interface OffProduct {
  code?: unknown;
  product_name?: unknown;
  product_name_en?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  quantity?: unknown;
  categories_tags?: unknown;
  image_front_small_url?: unknown;
  image_front_url?: unknown;
}

/** The product as the app should see it, or null when Open Food Facts has no usable name for it. */
export function toProduct(code: string, p: OffProduct, offBaseUrl: string): BarcodeProduct | null {
  const name = text(p.product_name, 80) ?? text(p.product_name_en, 80) ?? text(p.generic_name, 80);
  if (!name) return null;
  // "Brand A, Brand B": the first is the maker.
  const brand = text(typeof p.brands === 'string' ? p.brands.split(',')[0] : null, 60);
  const url = [p.image_front_small_url, p.image_front_url].find(isAllowedPicture);
  const tags = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  return {
    code,
    name,
    brand,
    quantity: text(p.quantity, 30),
    category: categoryFromTags(tags),
    frozen: tags.includes('en:frozen-foods'),
    picture: url ? { url, credit: 'Open Food Facts', pageUrl: `${offBaseUrl}/product/${code}` } : null,
  };
}

interface Options {
  /** Open Food Facts asks every client to identify itself. */
  userAgent: string;
  offBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
/** Products are added to Open Food Facts all the time, so "not found" is only remembered briefly. */
const MISSING_TTL_MS = 60 * 60 * 1000;
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,quantity,categories_tags,image_front_small_url,image_front_url';

export function createBarcodeLookup({ userAgent, offBaseUrl = 'https://world.openfoodfacts.org', fetchImpl = fetch, timeoutMs = 5000 }: Options): BarcodeLookup {
  const cache = new Map<string, { at: number; product: BarcodeProduct | null }>();

  return {
    async find(code) {
      const hit = cache.get(code);
      if (hit && Date.now() - hit.at < (hit.product ? FOUND_TTL_MS : MISSING_TTL_MS)) return hit.product;
      let res: Response;
      try {
        res = await fetchImpl(`${offBaseUrl}/api/v2/product/${code}?fields=${FIELDS}`, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new BarcodeUnavailable();
      }
      // Open Food Facts answers 404 for a product it does not have; anything else that is not OK is a failure.
      if (!res.ok && res.status !== 404) throw new BarcodeUnavailable();
      type Answer = { status?: unknown; product?: OffProduct } | null;
      let json: Answer = null;
      try {
        json = (await res.json()) as Answer;
      } catch {
        if (res.ok) throw new BarcodeUnavailable();
      }
      const product = json?.status === 1 && json.product ? toProduct(code, json.product, offBaseUrl) : null;
      if (cache.size >= 5000) cache.delete(cache.keys().next().value!);
      cache.set(code, { at: Date.now(), product });
      return product;
    },
  };
}
