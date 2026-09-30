# Food photography: status, licensing and the accuracy check

## Where things stand

The app shows an emoji for each food (`src/components/categories.ts`). **Real food photos are not in the app yet.** The environment this was built in blocks outbound access to every photo source I tried (`commons.wikimedia.org`, `upload.wikimedia.org`, `api.openverse.org`, `www.pexels.com`, `unsplash.com`, `pixabay.com`), and I did not work around the policy. To allow it, open the environment's settings, then **Network access**, and either raise the access level or add `commons.wikimedia.org` and `upload.wikimedia.org` to the allowed domains. A new session can then do the sourcing described below.

## Why not simply take images off the internet

Almost every photo online is copyrighted by its photographer. Shipping them in a paid app without a licence risks takedown notices, legal claims, and App Store rejection under guideline 5.2 (intellectual property). Photos are safe to use when the licence says so:

| Licence | Use in the app? |
| --- | --- |
| CC0, public domain | Yes. |
| CC BY 2.0, 3.0, 4.0 | Yes, with attribution (a Photo credits screen) and a note that the image was cropped or resized. |
| CC BY-SA | No. Cropping counts as an adaptation and brings share-alike obligations. |
| Anything NC or ND, GFDL-only, "fair use", unknown | No. |
| Pexels, Unsplash | Permitted for commercial apps, but their terms restrict bulk redistribution and compiling image libraries, so the owner should read them first. |

Avoid photos with visible people, brands, logos or text.

## What each photo must satisfy

- It shows exactly the food it is labelled as, one subject, clearly, on a plain or simple background.
- At least 800px on the short side, so it can be cropped for 160px thumbnails (at 3x) and 600x400 meal cards.
- A manifest entry (`assets/photos/manifest.json`) with: id, the food label, source page URL, author, licence name and URL, date retrieved, and the changes made ("cropped and resized").

## The triple check (accuracy)

Every photo has to pass all three, and the result is written to the manifest.

1. **Metadata match.** The source's own title, categories and description must name the food (or a synonym), and the licence is read from the source's structured data rather than page text. A mismatch rejects the image.
2. **Visual review with the label visible.** Someone looks at the image next to its label and rejects look-alikes: lime for lemon, courgette for cucumber, cooked for raw, a branded packet for the plain food.
3. **Blind identification.** A separate reviewer sees the images with no labels and names each one. Any answer that differs from the intended food sends the image back for replacement.

A test then fails if any manifest entry is missing a passing check, a permitted licence or an attribution.

## What was checked instead: the emoji

The same three checks were applied to the emoji that are in the app now:

1. **Rule table.** `__tests__/emoji-accuracy.test.ts` pins the glyph for 118 foods, including tricky names ("Peanut butter", "Ice cream", "Chicken soup", "Black pepper", "Corn tortillas", "Cherry tomatoes"). Building it exposed about 45 wrong or missing glyphs in the first version of the mapping, all fixed.
2. **Rendered review.** Every glyph was rendered in a browser next to its label and reviewed. That found inaccuracies the table could not: raspberries showing blue blueberries, sausages showing a raw steak, bagels showing a loaf, crackers showing popcorn.
3. **Blind identification.** The rendered glyphs, with numbers only, were given to a separate reviewer to name without seeing the labels. Of 118 foods, none was named as something unrelated. Where the reviewer's name differs from the food, it is one of the approximations below (a raspberry drawn as a strawberry, a lime as a lemon), which are not errors in the rules.

### Expanded with typing suggestions

Adding a 380-food suggestion catalog meant every one of those foods now appears with a glyph, so the rules were extended and 80 more foods pinned in the table test (about 200 in total). Fixes included a lettuce shown for plums, figs and ginger (these now show a neutral produce basket 🧺), a milk glass for milk chocolate, a fish for fish sauce, a cake for rice cakes, a hot dog for hot dog buns, and a lettuce for salad dressing.

### Known approximations

Emoji are a fixed set, so some foods can only be approximated. The blind review confirmed these:

- Raspberries and cranberries show a strawberry, blackberries show blueberries, and limes show a lemon.
- Zucchini shows a cucumber; almonds and nut butters show a peanut.
- Yogurt, sour cream and buttermilk show a glass of milk; margarine shows butter.
- Quinoa shows a bowl of rice, black pepper shows a salt shaker, coffee beans show a cup of coffee, and potato chips and mixed snacks show a pretzel.
- Kale, spinach and lettuce all show the same leafy green; minced beef, burger patties and pork chops show a steak.
- Fruit and vegetables with no emoji of their own (plums, figs, pomegranate, ginger, asparagus, green beans, radishes) show a produce basket rather than a wrong picture. Cauliflower shows broccoli, parsnips a carrot, and pumpkins and winter squash a jack-o'-lantern.
- Sauces and spreads without their own emoji (mayonnaise, mustard, soy sauce, hummus) show the condiments salt shaker; tofu and tempeh show a package.

Compatibility: newer glyphs (Emoji 12: garlic, onion, butter; Emoji 13: bell pepper, blueberries, olive, flatbread) show as an empty box on Android older than 10 or 11. iOS versions that Expo SDK 57 supports are all new enough.

Real photos would remove all of these approximations, which is the main reason to add them.

## Adding photos later (design)

A mapping from food names to photo ids sits beside `emojiFor` (same ordering rules and table test), a `FoodThumb` component shows the photo and falls back to the emoji when a food has none, and Settings > About gets a Photo credits screen generated from the manifest. Meal cards can use recipe photos the same way.
