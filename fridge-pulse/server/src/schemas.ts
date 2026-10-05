import { z } from 'zod';

export const CATEGORIES = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'leftovers',
  'drinks',
  'condiments',
  'grains',
  'canned',
  'snacks',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export const DIETS = ['none', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free'] as const;

// ---------------------------------------------------------------------------
// Model output. Kept to plain types (no min/max) because structured outputs
// support a limited subset of JSON Schema; bounds are enforced in code instead.
// ---------------------------------------------------------------------------

export const ScanOutputSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      category: z.enum(CATEGORIES),
      quantity: z.string(),
      shelfLifeDays: z.number().nullable(),
      labelExpiryDate: z.string().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      clue: z.string().nullable(),
      photo: z.number().nullable(),
      /** Receipts: where the item goes once home. Null for shelf photos. */
      keptIn: z.enum(LOCATIONS).nullable(),
      /** Receipts: what the line cost in total, after line discounts. Null for shelf photos. */
      price: z.number().nullable(),
    }),
  ),
  /** Receipts: the purchase date printed on it, YYYY-MM-DD. Null for shelf photos. */
  purchaseDate: z.string().nullable(),
  /** Receipts: ISO 4217 currency of the prices ("USD", "GBP"). Null for shelf photos. */
  currency: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ScanOutput = z.infer<typeof ScanOutputSchema>;

export const MealsOutputSchema = z.object({
  meals: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      minutes: z.number(),
      servings: z.number(),
      uses: z.array(z.string()),
      extras: z.array(z.string()),
      steps: z.array(z.string()),
      /** Estimate for one serving. */
      nutrition: z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).nullable(),
    }),
  ),
});
export type MealsOutput = z.infer<typeof MealsOutputSchema>;

/** What the identify call reports through its `report_food` tool (see claude.ts). */
export const ReportFoodSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
      brand: z.string().nullable(),
      product: z.string().nullable(),
      barcode: z.string().nullable(),
      category: z.enum(CATEGORIES),
      kind: z.enum(['packaged', 'fresh']),
      wikipediaTitle: z.string().nullable(),
      keptIn: z.enum(LOCATIONS),
      fridgeDays: z.number().nullable(),
      freezerDays: z.number().nullable(),
      pantryDays: z.number().nullable(),
      looks: z.string(),
      why: z.string(),
      sourceUrl: z.string().nullable(),
    }),
  ),
});
export type ReportFood = z.infer<typeof ReportFoodSchema>;
export type ReportedCandidate = ReportFood['candidates'][number];

// ---------------------------------------------------------------------------
// Requests from the app.
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const MAX_IMAGES = 4;
/** Decoded size cap per image. The API accepts up to 5 MB; the app sends well under 1 MB. */
export const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
export const MAX_IMAGE_B64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;

const ImageSchema = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(64).max(MAX_IMAGE_B64_CHARS),
});

/** Foods the person has identified before, so a scan can recognise them by name. */
export const MAX_KNOWN_FOODS = 50;

export const SCAN_MODES = ['shelf', 'receipt'] as const;

export const ScanRequestSchema = z.object({
  /** "shelf": photos of a fridge, freezer or pantry. "receipt": photos of a shopping receipt. Default shelf. */
  mode: z.enum(SCAN_MODES).optional(),
  /** Where the photographed food is (shelf), or where most of it is going (receipt). */
  location: z.enum(LOCATIONS),
  today: isoDate,
  locale: z.string().max(35).optional(),
  images: z.array(ImageSchema).min(1).max(MAX_IMAGES),
  known: z
    .array(z.object({ name: z.string().trim().min(1).max(80), looks: z.string().trim().max(200).nullish() }))
    .max(MAX_KNOWN_FOODS)
    .optional(),
});
export type ScanRequest = z.infer<typeof ScanRequestSchema>;

export const MealsRequestSchema = z.object({
  today: isoDate,
  diet: z.enum(DIETS),
  servings: z.number().int().min(1).max(12),
  exclude: z.array(z.string().max(120)).max(20).default([]),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        category: z.enum(CATEGORIES),
        quantity: z.string().max(30),
        daysLeft: z.number().int().min(0).max(5000),
      }),
    )
    .min(1)
    .max(80),
});
export type MealsRequest = z.infer<typeof MealsRequestSchema>;

export const IdentifyRequestSchema = z.object({
  /** What the scan (or the person) called it: "Jar of red paste", "Yakult". */
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  location: z.enum(LOCATIONS),
  /** What the scan saw: container, colours, legible words. */
  clue: z.string().trim().max(300).optional(),
  today: isoDate,
  locale: z.string().max(35).optional(),
  /** The photo the item was seen in. Optional: a typed name can be looked up on its own. */
  image: ImageSchema.optional(),
});
export type IdentifyRequest = z.infer<typeof IdentifyRequestSchema>;

/** One possible match, as sent to the app. */
export interface FoodCandidate {
  name: string;
  brand: string | null;
  product: string | null;
  category: (typeof CATEGORIES)[number];
  keptIn: (typeof LOCATIONS)[number];
  shelfLife: { fridge: number | null; freezer: number | null; pantry: number | null };
  looks: string;
  why: string;
  sourceUrl: string | null;
  image: { url: string; credit: string; pageUrl: string } | null;
}

export interface IdentifyResponse {
  candidates: FoodCandidate[];
}

// ---------------------------------------------------------------------------
// Shared households.
// ---------------------------------------------------------------------------

const personName = z.string().trim().min(1).max(40);
const ITEM_STATUS = ['active', 'used', 'wasted'] as const;
const EXPIRY_SOURCES = ['label', 'estimate', 'manual'] as const;

/** A tracked item as shared with the household. Unknown fields are dropped. */
export const SharedItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  quantity: z.string().max(30),
  location: z.enum(LOCATIONS),
  addedOn: isoDate,
  expiresOn: isoDate,
  expirySource: z.enum(EXPIRY_SOURCES),
  status: z.enum(ITEM_STATUS),
  resolvedOn: isoDate.optional(),
  price: z.number().positive().max(10000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  addedBy: z.string().max(40).optional(),
});

/** A shopping-list entry as shared with the household. */
export const SharedShoppingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  keptIn: z.enum(LOCATIONS).optional(),
  checked: z.boolean(),
  addedOn: isoDate,
  addedBy: z.string().max(40).optional(),
});

export const MAX_SYNC_CHANGES = 500;

const SyncChangeSchema = z
  .object({
    kind: z.enum(['item', 'shopping']),
    id: z.string().min(1).max(64),
    updatedAt: z.number().int().nonnegative(),
    deleted: z.boolean(),
    data: z.unknown().nullable(),
  })
  .transform((c, ctx) => {
    if (c.deleted) return { ...c, data: null };
    const parsed = (c.kind === 'item' ? SharedItemSchema : SharedShoppingSchema).safeParse(c.data);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: `Invalid ${c.kind} data`, path: ['data'] });
      return z.NEVER;
    }
    return { ...c, data: parsed.data as Record<string, unknown> };
  });

export const HouseholdSyncSchema = z.object({
  since: z.number().int().min(0),
  changes: z.array(SyncChangeSchema).max(MAX_SYNC_CHANGES).default([]),
});

export const CreateHouseholdSchema = z.object({ name: personName, memberName: personName });
export const JoinHouseholdSchema = z.object({ code: z.string().trim().min(4).max(20), memberName: personName });
/** A product barcode: the digits only (8, 12, 13 or 14; the check digit is verified separately). */
export const BarcodeRequestSchema = z.object({ code: z.string().regex(/^\d{8,14}$/) });

/** A member to take out of the household, by the `ref` the household view gave. */
export const RemoveMemberSchema = z.object({ member: z.string().regex(/^[a-f0-9]{16}$/) });
