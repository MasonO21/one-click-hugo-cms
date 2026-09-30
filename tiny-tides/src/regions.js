// Tiny Tides — features that are switched off in some countries to follow local law. Codes are checked against both the App Store
// storefront (Apple returns ISO 3166 alpha-3, e.g. "BEL") and the device region (alpha-2, e.g. "BE"), so list both.
// The website and the terms name these countries automatically (tools/site.mjs). Have a lawyer review the lists for the countries you
// sell in (legal/APP_STORE_ADMIN_CHECKLIST.md §6), or untick territories in App Store Connect.

/** No paid random items (Sea Glass capsule pulls). Free pulls and Capsule Coins still work.
 *  Belgium: its Gaming Commission treats paid loot boxes as illegal gambling.
 *  Brazil: Law 15.211/2025 (ECA Digital) bans loot boxes in games that children and teenagers are likely to use. */
export const NO_PAID_RANDOM = ['BE', 'BEL', 'BR', 'BRA'];

/** No rewards for completing sets of capsule prizes (the Toybox still tracks collections, it just gives nothing for them).
 *  Japan: rewards for completing a set of items from paid random draws ("kompu gacha") are a prohibited premium. */
export const NO_SET_REWARDS = ['JP', 'JPN'];
