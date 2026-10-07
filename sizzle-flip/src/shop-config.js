// Shop economy — the one place to change prices.
//
// Real money buys Hot Dogs (consumable store products, "packs"); Hot Dogs unlock characters in the shop.
// $1 = 100 Hot Dogs and every character costs 100 Hot Dogs, so a character is still $1.
// Bundles unlock every character of a shop tab (or all of them) at a discount, priced by how many
// characters the player is still missing from it — always proportional to what the bundle contains.
//
// The pack list is also the product list for the store consoles: tools/create-store-products.mjs creates
// exactly these products in Google Play and App Store Connect, and store/iap-products.csv is generated from it.

export const CURRENCY = 'Hot Dogs';
export const HOTDOGS_PER_DOLLAR = 100;
export const SKIN_PRICE = 100;          // Hot Dogs per character
export const BUNDLE_DISCOUNT = 0.2;     // bundles are 20% off the characters they unlock
export const BUNDLE_MIN = 2;            // a bundle is offered while at least this many of its characters are missing

// usd: the base price; each store converts it for other countries. 99-cent endings are the store standard.
export const PACKS = [
  { id: 'hotdogs_100', hotdogs: 100, usd: '0.99' },
  { id: 'hotdogs_500', hotdogs: 500, usd: '4.99' },
  { id: 'hotdogs_1000', hotdogs: 1000, usd: '9.99' },
  { id: 'hotdogs_2500', hotdogs: 2500, usd: '24.99' },
  { id: 'hotdogs_5000', hotdogs: 5000, usd: '49.99' },
  { id: 'hotdogs_10000', hotdogs: 10000, usd: '99.99' },
].map(p => ({
  ...p,
  title: `${p.hotdogs.toLocaleString('en-US')} Hot Dogs`,                     // store title (Apple: ≤35 chars)
  description: `Shop currency. Enough for ${p.hotdogs / SKIN_PRICE} character${p.hotdogs === SKIN_PRICE ? '' : 's'}.`, // Apple: ≤55 chars
}));
export const PACK_BY_ID = Object.fromEntries(PACKS.map(p => [p.id, p]));

// Hot Dogs for a bundle that unlocks `n` characters, rounded to 10
export const bundlePrice = (n) => Math.round((n * SKIN_PRICE * (1 - BUNDLE_DISCOUNT)) / 10) * 10;
