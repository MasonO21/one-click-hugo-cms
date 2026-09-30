import type { ReportedCandidate } from './schemas.js';

/** A product picture the app can show so the person can confirm the match. */
export interface Picture {
  url: string;
  /** Who the picture comes from, shown under it. */
  credit: 'Open Food Facts' | 'Wikipedia';
  /** The page the picture belongs to. */
  pageUrl: string;
}

export interface PictureFinder {
  find(candidate: Pick<ReportedCandidate, 'name' | 'brand' | 'product' | 'barcode' | 'kind' | 'wikipediaTitle'>): Promise<Picture | null>;
}

/**
 * Pictures only ever come from these hosts. The model never supplies an image address: the server
 * asks two public food databases itself, so a web page cannot make the app load an arbitrary image.
 */
export const PICTURE_HOSTS = ['images.openfoodfacts.org', 'static.openfoodfacts.org', 'upload.wikimedia.org'];

export function isAllowedPicture(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PICTURE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

interface Options {
  /** Open Food Facts asks every client to identify itself. */
  userAgent: string;
  offBaseUrl?: string;
  wikiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

interface OffProduct {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  image_front_url?: unknown;
  image_url?: unknown;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const words = (s: string | null | undefined) => new Set(fold(s ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));

/**
 * How well an Open Food Facts product matches the candidate: the share of the candidate's product
 * words it contains, or 0 when a named brand is missing. Search results are fuzzy; a wrong picture
 * is worse than none.
 */
export function productMatch(candidate: Pick<ReportedCandidate, 'name' | 'brand' | 'product'>, product: OffProduct): number {
  const theirs = words(`${typeof product.brands === 'string' ? product.brands : ''} ${typeof product.product_name === 'string' ? product.product_name : ''}`);
  if (candidate.brand) {
    const brand = [...words(candidate.brand)];
    if (brand.length > 0 && !brand.some((w) => theirs.has(w))) return 0;
  }
  const ours = [...words(candidate.product ?? candidate.name)].filter((w) => !words(candidate.brand).has(w));
  if (ours.length === 0) return candidate.brand ? 0.5 : 0;
  return ours.filter((w) => theirs.has(w)).length / ours.length;
}

function offPicture(product: OffProduct, offBaseUrl: string): Picture | null {
  const url = [product.image_front_url, product.image_url].find(isAllowedPicture);
  const code = typeof product.code === 'string' && /^\d{6,14}$/.test(product.code) ? product.code : null;
  if (!url || !code) return null;
  return { url, credit: 'Open Food Facts', pageUrl: `${offBaseUrl}/product/${code}` };
}

const FAILURE_TTL_MS = 5 * 60 * 1000;

export function createPictureFinder({
  userAgent,
  offBaseUrl = 'https://world.openfoodfacts.org',
  wikiBaseUrl = 'https://en.wikipedia.org',
  fetchImpl = fetch,
  timeoutMs = 5000,
  cacheTtlMs = 12 * 60 * 60 * 1000,
}: Options): PictureFinder {
  const cache = new Map<string, { at: number; value: unknown }>();

  /** GET JSON, or null on any failure. Cached, because Open Food Facts limits searches per minute. */
  async function getJson(url: string): Promise<unknown> {
    const hit = cache.get(url);
    // Answers are kept for hours; a failure (network blip, rate limit) only for a few minutes.
    if (hit && Date.now() - hit.at < (hit.value == null ? FAILURE_TTL_MS : cacheTtlMs)) return hit.value;
    let value: unknown = null;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, 'Api-User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (res.ok) value = await res.json();
    } catch {
      value = null;
    }
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), value });
    return value;
  }

  const fields = 'code,product_name,brands,image_front_url,image_url';

  async function byBarcode(barcode: string): Promise<Picture | null> {
    const json = (await getJson(`${offBaseUrl}/api/v2/product/${barcode}?fields=${fields}`)) as { status?: unknown; product?: OffProduct } | null;
    if (!json || json.status !== 1 || !json.product) return null;
    return offPicture({ ...json.product, code: json.product.code ?? barcode }, offBaseUrl);
  }

  async function bySearch(c: Pick<ReportedCandidate, 'name' | 'brand' | 'product'>): Promise<Picture | null> {
    const terms = [c.brand, c.product ?? c.name].filter(Boolean).join(' ').slice(0, 120);
    const q = new URLSearchParams({ search_terms: terms, search_simple: '1', action: 'process', json: '1', page_size: '8', fields });
    const json = (await getJson(`${offBaseUrl}/cgi/search.pl?${q}`)) as { products?: unknown } | null;
    const products = Array.isArray(json?.products) ? (json.products as OffProduct[]) : [];
    let best: { picture: Picture; score: number } | null = null;
    for (const p of products) {
      const picture = offPicture(p, offBaseUrl);
      if (!picture) continue;
      const score = productMatch(c, p);
      if (score >= 0.5 && (!best || score > best.score)) best = { picture, score };
    }
    return best?.picture ?? null;
  }

  async function byWikipedia(title: string): Promise<Picture | null> {
    const path = encodeURIComponent(title.trim().replace(/ /g, '_'));
    const json = (await getJson(`${wikiBaseUrl}/api/rest_v1/page/summary/${path}`)) as {
      type?: unknown;
      thumbnail?: { source?: unknown };
      content_urls?: { desktop?: { page?: unknown } };
    } | null;
    if (!json || json.type !== 'standard') return null;
    const url = json.thumbnail?.source;
    if (!isAllowedPicture(url)) return null;
    const page = json.content_urls?.desktop?.page;
    return { url, credit: 'Wikipedia', pageUrl: typeof page === 'string' && page.startsWith('https://') ? page : `${wikiBaseUrl}/wiki/${path}` };
  }

  return {
    async find(c) {
      if (c.barcode && /^\d{8,14}$/.test(c.barcode)) {
        const exact = await byBarcode(c.barcode);
        if (exact) return exact;
      }
      if (c.kind === 'packaged') {
        const found = await bySearch(c);
        if (found) return found;
      }
      if (c.wikipediaTitle) {
        const wiki = await byWikipedia(c.wikipediaTitle);
        if (wiki) return wiki;
      }
      // Fresh food with no article title: its everyday name is usually an article too.
      return c.kind === 'fresh' || !c.brand ? byWikipedia(c.name) : null;
    },
  };
}

/** Used when picture lookups are switched off: every candidate comes back without one. */
export const noPictures: PictureFinder = { find: async () => null };
