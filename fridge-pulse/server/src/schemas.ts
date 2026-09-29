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
    }),
  ),
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
    }),
  ),
});
export type MealsOutput = z.infer<typeof MealsOutputSchema>;

// ---------------------------------------------------------------------------
// Requests from the app.
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const MAX_IMAGES = 4;
/** Decoded size cap per image. The API accepts up to 5 MB; the app sends well under 1 MB. */
export const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
export const MAX_IMAGE_B64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;

export const ScanRequestSchema = z.object({
  location: z.enum(LOCATIONS),
  today: isoDate,
  locale: z.string().max(35).optional(),
  images: z
    .array(
      z.object({
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        data: z.string().min(64).max(MAX_IMAGE_B64_CHARS),
      }),
    )
    .min(1)
    .max(MAX_IMAGES),
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
