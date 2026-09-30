import type { PictureFinder } from './pictures.js';
import type { FoodCandidate, IdentifyResponse, ReportedCandidate, ReportFood } from './schemas.js';

export const MAX_CANDIDATES = 3;
/** Longest shelf life the app stores, matching the app's own cap. */
export const MAX_DAYS = 730;

const clean = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

function days(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(Math.max(Math.round(v), 0), MAX_DAYS);
}

function httpsUrl(v: string | null): string | null {
  if (!v || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Tidies what the model reported: trims text, clamps day counts, drops empty and repeated
 * candidates. The app validates again on its side.
 */
export function tidyCandidates(report: ReportFood): ReportedCandidate[] {
  const seen = new Set<string>();
  const out: ReportedCandidate[] = [];
  for (const c of report.candidates) {
    const name = clean(c.name, 80);
    if (!name) continue;
    const brand = clean(c.brand, 60);
    const key = `${name.toLowerCase()}|${(brand ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...c,
      name: name[0]!.toUpperCase() + name.slice(1),
      brand,
      product: clean(c.product, 120),
      barcode: c.barcode && /^\d{8,14}$/.test(c.barcode.replace(/\s/g, '')) ? c.barcode.replace(/\s/g, '') : null,
      wikipediaTitle: clean(c.wikipediaTitle, 120),
      fridgeDays: days(c.fridgeDays),
      freezerDays: days(c.freezerDays),
      pantryDays: days(c.pantryDays),
      looks: clean(c.looks, 200) ?? '',
      why: clean(c.why, 200) ?? '',
      sourceUrl: httpsUrl(c.sourceUrl),
    });
    if (out.length === MAX_CANDIDATES) break;
  }
  return out;
}

/** Adds a picture to each candidate (looked up in parallel) and shapes the reply for the app. */
export async function withPictures(report: ReportFood, pictures: PictureFinder): Promise<IdentifyResponse> {
  const candidates = tidyCandidates(report);
  const found = await Promise.all(candidates.map((c) => pictures.find(c).catch(() => null)));
  return {
    candidates: candidates.map(
      (c, i): FoodCandidate => ({
        name: c.name,
        brand: c.brand,
        product: c.product,
        category: c.category,
        keptIn: c.keptIn,
        shelfLife: { fridge: c.fridgeDays, freezer: c.freezerDays, pantry: c.pantryDays },
        looks: c.looks,
        why: c.why,
        sourceUrl: c.sourceUrl,
        image: found[i] ?? null,
      }),
    ),
  };
}
