/**
 * Colonist wishes & friendship — content and balance (types in schema.ts, behaviour in sim/wishes.ts).
 *
 * Every 8–12 minutes of online play (after the opening tutorial) one colonist voices a small, cozy wish. Granting it
 * makes them happy for a while, adds a friendship heart and brings a little thank-you gift. Nothing bad happens when a
 * wish lapses: it is simply forgotten after 45 minutes of play.
 *
 * Balance:
 *  - A Give wish asks for `minutes` (default 2) of a reference colony's output of that resource at the current tier
 *    (`expeditionRules.reference`, the pacing model's planned economy), never more than 40% of storage: noticeable but
 *    cheap. Build wishes are the small decor / comfort pieces, craft wishes quick hand recipes, chat a short walk.
 *  - The thank-you gift is worth 3 minutes of that colony's output (two resources from the tier's pool), 10 season XP
 *    and a 10% chance of 1–2 Nova: a pleasant extra, too small to matter for pacing (tests/data.pacing.test.ts does
 *    not model it).
 *  - Hearts 0..5: three make the colonist 5% more productive at their job, five make them Best friends (+3 happiness
 *    for good).
 */
import type { WishDef, WishRules } from './schema';

const MIN = 60;

export const WISH_RULES: WishRules = {
  firstDelay: [2.5 * MIN, 4 * MIN],
  interval: [8 * MIN, 12 * MIN],
  retry: MIN,
  maxOpen: 2,
  expire: 45 * MIN,
  giveMinutes: 2,
  giveMin: 10,
  giveCapShare: 0.4,
  buildUpTo: 12,
  likeBonus: { profession: 3, trait: 2 },
  mood: { value: 8, hours: 4 },
  hearts: 5,
  perks: { productivityHearts: 3, productivity: 0.05, bestFriendsHearts: 5, bestFriendsHappiness: 3 },
  reward: {
    minutes: 3,
    // what a thank-you gift is made of at each colony tier (what that colony uses most)
    pool: [
      ['wood', 'food', 'fiber', 'stone'],
      ['wood', 'stone', 'food', 'fiber'],
      ['stone', 'iron', 'copper', 'coal', 'food'],
      ['steel', 'iron', 'copper', 'electronics', 'stone'],
      ['steel', 'alloy', 'crystal', 'electronics', 'iron'],
      ['alloy', 'crystal', 'energy_cell', 'titanium', 'electronics'],
      ['titanium', 'alloy', 'crystal', 'energy_cell', 'nano'],
    ],
    xp: 10,
    novaChance: 0.1,
    nova: [1, 2],
  },
  chatRange: 5,
  exploreRange: 220,
  recent: 4,
};

export const WISHES: WishDef[] = [
  // ---------------------------------------------------------------- give: one tap from storage
  {
    id: 'give_berry_pie', kind: 'give', target: 'food', icon: '🥧', title: 'Berry pie day', minTier: 0, weight: 3,
    text: "Could I have {n} food? I'm baking berry pies for everyone!",
    likes: { professions: ['cook', 'farmer'], traits: ['gourmet', 'cheerful'] },
  },
  {
    id: 'give_tea', kind: 'give', target: 'water', icon: '🍵', title: 'A big pot of tea', minTier: 0, weight: 2,
    text: 'Could I have {n} water? I want to brew a big pot of glowleaf tea for the evening.',
    likes: { professions: ['water_tech', 'doctor'], traits: ['cozy', 'gentle_soul'] },
  },
  {
    id: 'give_whittle', kind: 'give', target: 'wood', icon: '🪵', title: 'Whittling time', minTier: 0, maxTier: 3, weight: 2,
    text: "May I have {n} wood? I'm whittling little critters to line the windowsills.",
    likes: { professions: ['gatherer', 'engineer'], traits: ['tinkerer'] },
  },
  {
    id: 'give_hammock', kind: 'give', target: 'fiber', icon: '🧶', title: 'A stargazing hammock', minTier: 0, maxTier: 3, weight: 2,
    text: "Could you spare {n} fiber? I'm weaving a hammock for stargazing.",
    likes: { professions: ['gatherer', 'farmer'], traits: ['night_owl', 'cozy'] },
  },
  {
    id: 'give_rock_garden', kind: 'give', target: 'stone', icon: '🪨', title: 'A tiny rock garden', minTier: 1, maxTier: 4, weight: 2,
    text: 'Could I have {n} stone? I want to build a tiny rock garden by my door.',
    likes: { professions: ['miner'], traits: ['perfectionist'] },
  },
  {
    id: 'give_picnic', kind: 'give', target: 'food', icon: '🧺', title: 'Picnic for the crew', minTier: 2, weight: 2,
    text: "Could I have {n} food for a picnic? I'll bring the blanket if you bring the appetite.",
    likes: { professions: ['cook', 'logistics'], traits: ['storyteller', 'optimist'] },
  },
  {
    id: 'give_wind_chime', kind: 'give', target: 'copper', icon: '🎐', title: 'A singing wind chime', minTier: 2, maxTier: 5, weight: 2,
    text: 'Could you spare {n} copper? I want to make a wind chime that sings when the breeze comes.',
    likes: { professions: ['electrician', 'mechanic'], traits: ['gentle_soul'] },
  },
  {
    id: 'give_horseshoes', kind: 'give', target: 'iron', icon: '🧲', title: 'Lucky horseshoes', minTier: 2, maxTier: 5, weight: 2,
    text: "May I have {n} iron? I'm forging lucky horseshoes. We don't have horses. Yet.",
    likes: { professions: ['miner', 'mechanic', 'engineer'], traits: ['lucky'] },
  },
  {
    id: 'give_warm_toes', kind: 'give', target: 'coal', icon: '🧦', title: 'Warm toes', minTier: 2, maxTier: 5, weight: 2,
    text: 'Could I have {n} coal? My stove is cold and my toes are colder.',
    likes: { professions: ['cook', 'guard'], traits: ['cozy'] },
  },
  {
    id: 'give_crystal_lamp', kind: 'give', target: 'crystal', icon: '💎', title: 'A humming night-light', minTier: 2, weight: 2,
    text: 'Could I have {n} crystals? I want a night-light that hums lullabies.',
    likes: { professions: ['scientist', 'miner'], traits: ['night_owl', 'bookworm'] },
  },
  {
    id: 'give_bike', kind: 'give', target: 'steel', icon: '🚲', title: 'A bike frame', minTier: 3, weight: 2,
    text: "Could you spare {n} steel? I'm building a bike. Two wheels, zero aliens.",
    likes: { professions: ['engineer', 'mechanic', 'logistics'], traits: ['speedy', 'daredevil'] },
  },
  {
    id: 'give_music_box', kind: 'give', target: 'electronics', icon: '🎶', title: 'A star music box', minTier: 3, weight: 2,
    text: "Could I have {n} electronics? I'm building a music box that plays the stars.",
    likes: { professions: ['electrician', 'scientist', 'drone_tech'], traits: ['genius', 'tinkerer'] },
  },
  {
    id: 'give_mushrooms', kind: 'give', target: 'biomass', icon: '🍄', title: 'Glowing mushrooms', minTier: 3, weight: 2,
    text: 'Could I have {n} biomass? My little glowing mushroom garden is hungry.',
    likes: { professions: ['farmer', 'doctor'], traits: ['green_thumb'] },
  },
  {
    id: 'give_bubble_bath', kind: 'give', target: 'water', icon: '🛁', title: 'A bubble bath', minTier: 3, weight: 1,
    text: "Could I have {n} water? I'm filling a bubble bath. A really big one.",
    likes: { professions: ['water_tech'], traits: ['cozy', 'cheerful'] },
  },
  {
    id: 'give_statuette', kind: 'give', target: 'alloy', icon: '🗿', title: 'A tiny statue of you', minTier: 4, weight: 2,
    text: "May I have {n} alloy? I'm sculpting a tiny statue of you. Please act surprised.",
    likes: { professions: ['engineer', 'mechanic'], traits: ['perfectionist'] },
  },
  {
    id: 'give_hover_skates', kind: 'give', target: 'energy_cell', icon: '🛼', title: 'Hover-skates', minTier: 4, weight: 2,
    text: 'Could you spare {n} energy cells? My hover-skates ran flat halfway round the plaza.',
    likes: { professions: ['drone_tech', 'electrician'], traits: ['daredevil', 'speedy'] },
  },
  {
    id: 'give_bracelets', kind: 'give', target: 'titanium', icon: '📿', title: 'Friendship bracelets', minTier: 5, weight: 2,
    text: "Could I have {n} titanium? I'm making shiny friendship bracelets for the whole crew.",
    likes: { professions: ['logistics', 'guard'], traits: ['gentle_soul', 'optimist'] },
  },
  {
    id: 'give_cranes', kind: 'give', target: 'nano', icon: '🕊️', title: 'Nano paper cranes', minTier: 6, weight: 2,
    text: "Could you spare {n} nano-material? I'm teaching it to fold paper cranes.",
    likes: { professions: ['scientist', 'drone_tech'], traits: ['genius'] },
  },

  // ---------------------------------------------------------------- build: one more small, cozy thing
  {
    id: 'build_lantern', kind: 'build', target: 'lamp_post', icon: '🏮', title: 'A lantern by the path', minTier: 0, weight: 3, upTo: 16,
    text: 'Could we have another lantern? The path to my bed gets so dark at night.',
    likes: { professions: ['guard', 'electrician'], traits: ['night_owl'] },
  },
  {
    id: 'build_flowers', kind: 'build', target: 'flower_bed', icon: '🌼', title: 'Flowers, please', minTier: 0, weight: 3, upTo: 16,
    text: 'Could you plant a flower bed? I miss the smell of blossoms.',
    likes: { professions: ['farmer'], traits: ['green_thumb', 'gentle_soul'] },
  },
  {
    id: 'build_bench', kind: 'build', target: 'log_bench', icon: '🪑', title: 'A sunset bench', minTier: 0, weight: 2, upTo: 10,
    text: "Could you build a bench? I'd love somewhere to sit and watch the sunset.",
    likes: { professions: ['gatherer', 'guard'], traits: ['storyteller', 'cozy'] },
  },
  {
    id: 'build_campfire', kind: 'build', target: 'campfire', icon: '🔥', title: 'Another campfire', minTier: 0, maxTier: 3, weight: 2, upTo: 4,
    text: 'Could we have another campfire? Story time needs a good crackle.',
    likes: { professions: ['cook'], traits: ['storyteller', 'cheerful'] },
  },
  {
    id: 'build_herbs', kind: 'build', target: 'herb_garden', icon: '🌿', title: 'An herb garden', minTier: 1, weight: 2, upTo: 6,
    text: 'An herb garden would make my soups sing! Could we plant one?',
    likes: { professions: ['cook', 'doctor', 'farmer'], traits: ['gourmet', 'green_thumb'] },
  },
  {
    id: 'build_banner', kind: 'build', target: 'banner', icon: '🚩', title: 'Fly our colours', minTier: 1, weight: 2, upTo: 10,
    text: "Could we raise another colony banner? I'm so proud of us!",
    likes: { professions: ['guard', 'logistics'], traits: ['optimist', 'brave'] },
  },
  {
    id: 'build_fountain', kind: 'build', target: 'fountain', icon: '⛲', title: 'A wishing fountain', minTier: 2, weight: 2, upTo: 3,
    text: "A fountain would be lovely. I'd toss a little wish in every morning.",
    likes: { professions: ['water_tech'], traits: ['gentle_soul', 'cheerful'] },
  },
  {
    id: 'build_statue', kind: 'build', target: 'stone_statue', icon: '🗿', title: "A Founder's Statue", minTier: 2, weight: 1, upTo: 3,
    text: "Could we build a Founder's Statue? Someone should remember how hard you've worked.",
    likes: { professions: ['engineer', 'miner'], traits: ['brave'] },
  },
  {
    id: 'build_arcade', kind: 'build', target: 'arcade', icon: '🕹️', title: 'An arcade night', minTier: 3, weight: 1, upTo: 2,
    text: "Could we get an arcade? I've been practising my high-score face.",
    likes: { professions: ['mechanic', 'electrician'], traits: ['daredevil', 'speedy'] },
  },
  {
    id: 'build_sculptures', kind: 'build', target: 'sculpture_garden', icon: '🎨', title: 'A quiet garden', minTier: 4, weight: 1, upTo: 2,
    text: 'A sculpture garden would be the perfect place to sit and think.',
    likes: { professions: ['scientist'], traits: ['bookworm', 'perfectionist'] },
  },
  {
    id: 'build_neon_park', kind: 'build', target: 'neon_park', icon: '🌳', title: 'A glowing park', minTier: 5, weight: 1, upTo: 2,
    text: 'A park that glows at night? Please, please say yes!',
    likes: { professions: ['farmer', 'gatherer'], traits: ['green_thumb', 'cheerful'] },
  },
  {
    id: 'build_monument', kind: 'build', target: 'titan_monument', icon: '🏆', title: 'A monument for us', minTier: 6, weight: 1, upTo: 2,
    text: 'Could we build a Monument of Titans? For everyone who got us this far.',
    likes: { professions: ['guard', 'engineer'], traits: ['brave', 'optimist'] },
  },

  // ---------------------------------------------------------------- craft: a quick recipe by hand
  {
    id: 'craft_roast', kind: 'craft', target: 'r_roast_berries', icon: '🍓', title: 'Roasted berries', minTier: 0, maxTier: 3, weight: 2,
    text: "Could you roast some berries at the campfire? I'm starving!",
    likes: { professions: ['gatherer', 'cook'], traits: ['gourmet'] },
  },
  {
    id: 'craft_bandage', kind: 'craft', target: 'r_bandage', icon: '🩹', title: 'A scraped knee', minTier: 0, maxTier: 3, weight: 2,
    text: 'Could you make me a bandage? I scraped my knee climbing a Bubble Tree.',
    likes: { professions: ['doctor', 'guard'], traits: ['daredevil'] },
  },
  {
    id: 'craft_jerky', kind: 'craft', target: 'r_trail_jerky', icon: '🥓', title: 'Snacks for a long walk', minTier: 1, weight: 2,
    text: "Could you make some trail jerky? I'm planning a long, long walk.",
    likes: { professions: ['gatherer', 'logistics'], traits: ['speedy', 'early_bird'] },
  },
  {
    id: 'craft_salve', kind: 'craft', target: 'r_herbal_salve', icon: '🌱', title: 'Sore hands', minTier: 1, weight: 1,
    text: 'My hands are sore from work. Could you mix me an herbal salve?',
    likes: { professions: ['doctor', 'farmer'], traits: ['hardworking'] },
  },
  {
    id: 'craft_stew', kind: 'craft', target: 'r_veggie_stew', icon: '🍲', title: 'Stew night', minTier: 2, weight: 2,
    text: "Veggie stew night? Could you cook a pot? I'll bring the bowls!",
    likes: { professions: ['cook'], traits: ['gourmet', 'cheerful'] },
  },
  {
    id: 'craft_medkit', kind: 'craft', target: 'r_medkit', icon: '⛑️', title: 'Peace of mind', minTier: 2, weight: 1,
    text: "Could you craft a medkit? I'd sleep better knowing we have one.",
    likes: { professions: ['doctor', 'guard'], traits: ['brave'] },
  },
  {
    id: 'craft_chip', kind: 'craft', target: 'r_research_chip', icon: '💾', title: 'A theory to test', minTier: 3, weight: 1,
    text: 'Could you craft a research chip? I have a theory and it simply cannot wait.',
    likes: { professions: ['scientist'], traits: ['genius', 'bookworm'] },
  },
  {
    id: 'craft_cells', kind: 'craft', target: 'r_energy_cell', icon: '🔋', title: 'A flickering light', minTier: 4, weight: 1,
    text: 'Could you craft some energy cells? My reading lamp keeps flickering.',
    likes: { professions: ['electrician', 'drone_tech'], traits: ['bookworm'] },
  },
  {
    id: 'craft_data_core', kind: 'craft', target: 'r_data_core', icon: '📀', title: 'The colony story', minTier: 5, weight: 1,
    text: "Could you craft a data core? I'm writing down the colony's story so far.",
    likes: { professions: ['scientist', 'logistics'], traits: ['storyteller', 'bookworm'] },
  },
  {
    id: 'craft_quantum', kind: 'craft', target: 'r_quantum_chip', icon: '⚛️', title: 'A curious question', minTier: 6, weight: 1,
    text: "Could you craft a quantum chip? I want to know what the moons are thinking.",
    likes: { professions: ['scientist'], traits: ['genius'] },
  },

  // ---------------------------------------------------------------- chat: come and say hi
  {
    id: 'chat_story', kind: 'chat', target: '', icon: '💬', title: 'A funny story', minTier: 0, weight: 3,
    text: 'Come say hi when you have a moment? I have the funniest story!',
    likes: { traits: ['storyteller', 'cheerful'] },
  },
  {
    id: 'chat_stars', kind: 'chat', target: '', icon: '🌌', title: 'Stargazing', minTier: 0, weight: 2,
    text: 'Could you come and look at the stars with me for a minute?',
    likes: { professions: ['scientist'], traits: ['night_owl', 'bookworm'] },
  },
  {
    id: 'chat_thanks', kind: 'chat', target: '', icon: '🤗', title: 'Just to say thanks', minTier: 1, weight: 2,
    text: 'Could you stop by? I just want to say thank you for everything.',
    likes: { traits: ['gentle_soul', 'optimist'] },
  },
  {
    id: 'chat_advice', kind: 'chat', target: '', icon: '🫖', title: 'A bit of advice', minTier: 2, weight: 2,
    text: 'Got a minute? I need your advice on something. Tea is on me.',
    likes: { professions: ['engineer', 'doctor'], traits: ['perfectionist'] },
  },

  // ---------------------------------------------------------------- explore: bring something back from out there
  {
    id: 'explore_surprise', kind: 'explore', target: '', icon: '🎁', title: 'A little surprise', minTier: 0, weight: 2,
    text: 'Could you open a cache or an old wreck out there? I love surprises!',
    likes: { professions: ['gatherer', 'logistics'], traits: ['lucky', 'daredevil'] },
  },
  {
    id: 'explore_ruins', kind: 'explore', target: '', icon: '🗺️', title: 'Tales from out there', minTier: 2, weight: 1,
    text: 'I dreamt about the old ruins again. Could you explore somewhere for me and tell me all about it?',
    likes: { professions: ['scientist', 'miner'], traits: ['bookworm', 'storyteller'] },
  },
];
