/*
 * Rainkeep lore: the story text that the scene player, the kin and the Hero Tales (story.js) read.
 * Kept apart from data.js because it is almost all words. Extends DATA, so it loads right after it.
 *
 *  cast    the keep's recurring people, drawn by art2d.js like heroes (cls 'none' carries no gear)
 *  scenes  short dialogues that play before a stage's fight, once. Speakers are cast ids, 'wyrm'
 *          (your Rainwyrm), 'lead' (the first hero in your squad), 'foe' (the stage's boss) or a kin id.
 *          A line wrapped in *asterisks* is narration. {wyrm} and {lead} become names.
 *  kin     the elder Rainwyrms of Act III, freed by beating the stage in `at`; perks are bonus keys
 *  tales   one three-part story per hero, each part with its own fight, ending in a choice:
 *          `a` makes the hero's battle skill stronger, `b` makes their steward post stronger
 */
'use strict';
Object.assign(DATA, {
  cast: {
    maram: { id: 'maram', name: 'Elder Maram', rarity: 'epic', cls: 'none', look: { skin: 3, hair: '#e8e2d6', wrap: 'veil', cloth: '#6a4a7a', trim: '#e8c88a', eyes: '#3a2412' } },
    hadi: { id: 'hadi', name: 'Captain Hadi', rarity: 'rare', cls: 'bow', look: { skin: 2, hair: '#1a120c', wrap: 'turban', cloth: '#7a5a2a', trim: '#d8b070', beard: '#1a120c' } },
    nima: { id: 'nima', name: 'Nima', rarity: 'rare', cls: 'none', look: { skin: 1, hair: '#3a2414', wrap: 'braid', cloth: '#2f7a8a', trim: '#f2d48a' } },
  },

  scenes: {
    // ----- Act I: The Rains -----
    1: [
      ['maram', 'Jackals on the salt flats again, Warden. They smell the water on us now. That is new.'],
      ['hadi', "Twelve of them. Maybe fifteen. Mangy and hungry. I'd rather they were full and somewhere else."],
      ['wyrm', '*{wyrm} peeks over the lip of the well and sneezes a little cloud of mist.*'],
      ['maram', 'Seventy years I waited to see that. Go on. Keep the flats clear, and the quarry crews will keep the walls up.'],
    ],
    5: [
      ['hadi', 'The pack has a leader. Grey muzzle, one ear, smarter than half my scouts.'],
      ['nima', 'Is it going to eat the wyrm?'],
      ['hadi', "Not while I'm breathing, Nima. Back inside."],
      ['foe', '*The Jackal Alpha lifts its head and howls, and the whole flat answers.*'],
    ],
    10: [
      ['maram', 'When I was a girl the salt flats were a lake, and the Behemoth was a turtle the fishermen fed bread to.'],
      ['hadi', "It's bigger now."],
      ['maram', 'Everything that lived through the drought got bigger, or got gone.'],
      ['wyrm', "*{wyrm} stares at the Behemoth's cracked shell and lets out a low, sad hum.*"],
    ],
    15: [
      ['hadi', "The dunes have been singing since dawn. My scouts won't go past the third ridge."],
      ['foe', 'Little keep. Little well. Little worm. The dunes remember the last of your kind. They remember how it ended.'],
      ['lead', "Stay behind me. Whatever she's singing, don't listen."],
    ],
    20: [
      ['nima', 'Hadi says there is a tortoise out there as big as the Archive.'],
      ['hadi', "I said as big as the Archive's front door. Nima exaggerates."],
      ['nima', 'He also said it ate a wagon.'],
      ['hadi', "...That part's true."],
    ],
    25: [
      ['foe', 'Warden. The sun sends its regards. It asks you to stop digging.'],
      ['maram', "Don't answer it."],
      ['foe', 'Your wyrm drinks water the sun has claimed. Every drop you hide underground is a debt.'],
      ['wyrm', "*{wyrm} rises out of the spring, fins flared, and the air around the Herald turns to fog.*"],
    ],
    30: [
      ['hadi', 'Those footprints on Colossus Road? Found the feet.'],
      ['maram', 'The old songs say the Colossi were made to carry a shard of the sun south. They dropped it. The rain stopped on the day they dropped it.'],
      ['lead', 'Then we knock this one down and ask it where.'],
      ['foe', '*The Colossus turns its head. Sand pours from its eyes like water.*'],
    ],
    35: [
      ['hadi', "There's a shark in the Glass Sea. A sand shark. In glass. Don't ask me how."],
      ['nima', 'Can I come?'],
      ['hadi', 'Absolutely not.'],
      ['nima', 'Can {wyrm} come?'],
      ['wyrm', '*{wyrm} is already at the gate.*'],
    ],
    40: [
      ['foe', "Look, Warden. Your keep is green. Your wells are full. The children are swimming. Isn't it lovely? Stay here with me."],
      ['lead', "It's a mirage. Don't step off the glass."],
      ['foe', "Everything you're fighting for is a mirage. I'm only showing you the ending."],
      ['maram', "She's wrong. We already have the start of it."],
    ],
    45: [
      ['hadi', 'Someone rings the spire bells every noon. Today I saw who.'],
      ['maram', 'The Bellringers were priests of the rain. When it stopped, they rang the bells to call it back. They just never stopped ringing.'],
      ['foe', '*BONG. The sand trembles. BONG.*'],
    ],
    50: [
      ['hadi', 'Another Colossus. This one is wearing a bell tower like a hat.'],
      ['nima', 'I drew it! Look, it has a face.'],
      ['hadi', '...It does have a face. Good eye, kid.'],
      ['wyrm', "*{wyrm} is long enough now to coil around the whole spring. It hasn't slept since the bells started.*"],
    ],
    55: [
      ['foe', 'I rode for the Sunheart when your grandmothers were children. I emptied rivers for it. And look at me now. Hollow. That is what it pays.'],
      ['lead', 'Then stop serving it.'],
      ['foe', "I can't. There's nothing left inside me to stop with."],
    ],
    60: [
      ['maram', "There it is. Seventy years of drought, and it's only a stone that won't stop burning."],
      ['wyrm', '*{wyrm} goes very still. The Sunheart pulses once, and {wyrm} pulses back.*'],
      ['hadi', 'Is it... talking to it?'],
      ['maram', "It's talking to all of us. It's saying: not yet."],
      ['lead', "Then let's answer it."],
    ],
    // ----- Act II: The Long Rains -----
    61: [
      ['nima', "It's still raining! It's been raining for nine days!"],
      ['hadi', 'And the wadis are flooding, and the raiders who lived in them are coming up the hill in boats.'],
      ['maram', 'Rain is never only a gift. Now we learn to keep it.'],
    ],
    65: [
      ['foe', 'This river was a road for forty years, and I was its king. You drowned my kingdom, Warden.'],
      ['lead', 'Then learn to swim.'],
      ['hadi', "That's a terrible line. ...Use it anyway."],
    ],
    70: [
      ['hadi', "The floods washed something up. It's another Colossus, and it's covered in barnacles."],
      ['maram', 'It must have fallen into the old sea before the sea dried. It has been asleep underwater for a hundred years.'],
      ['wyrm', '*{wyrm} swims out to meet it, the way a fish greets a ship.*'],
    ],
    75: [
      ['foe', 'Every drop that falls on the salt is ours. We are what the sea left behind. We are thirsty, Warden. We were always thirsty.'],
      ['maram', "The Saltborn. The old sea's ghost. They'll drink the rivers dry again if we let them."],
    ],
    80: [
      ['hadi', "Big. White. Made of salt. Swims through the ground. I've got nothing funny to say about this one."],
      ['nima', 'You always have something funny.'],
      ['hadi', 'Not today, kid.'],
    ],
    85: [
      ['foe', 'The rain is a fever, Warden. The world was healthy dry. We keep the embers lit to cure it.'],
      ['lead', 'Your cure killed half the south.'],
      ['foe', 'And the other half learned to live without asking the sky for anything. Is that not strength?'],
    ],
    90: [
      ['wyrm', '*{wyrm} hisses at the black glass sky. It has never hissed before.*'],
      ['maram', 'A wyvern of black glass. Made, not born. Someone carved a wyrm out of the dark to hunt the real ones.'],
      ['hadi', "Someone's been hunting wyrms?"],
      ['maram', "Why do you think there's only one left?"],
    ],
    95: [
      ['foe', 'You and I are the same, Warden. I kept a keep. I kept a wyrm. Then the sun offered me forever, and I took it.'],
      ['lead', 'What happened to your wyrm?'],
      ['foe', "...It's in the throne."],
    ],
    100: [
      ['maram', "The thing on the throne isn't a person any more. It's the drought, wearing a crown."],
      ['foe', "Every keep ends the same way. The wells go dry. The wyrm goes quiet. I'm only the last chapter."],
      ['nima', "We're not your chapter."],
      ['wyrm', '*{wyrm} breathes in until the whole crater smells of rain.*'],
    ],
    // ----- Act III: The Wyrmsong -----
    101: [
      ['nima', 'Listen! {wyrm} is singing!'],
      ['maram', 'And something is singing back. From the south, past the Burning Line.'],
      ['hadi', "The Sunwarden said his wyrm was in the throne. What if it wasn't the only one?"],
      ['wyrm', '*{wyrm} turns to face the south, and does not look away all night.*'],
    ],
    105: [
      ['foe', 'The Throne is broken, but the Line holds. I swore to the Sunwarden that nothing wet would cross it.'],
      ['lead', 'Your master is gone.'],
      ['foe', 'Oaths do not care.'],
    ],
    110: [
      ['hadi', "It's a tomb of green glass, big as a hill. And it's humming the same song as {wyrm}."],
      ['maram', "They didn't kill the wyrms. They sealed them, and drank their rain through the glass to keep the embers burning."],
      ['wyrm', '*{wyrm} presses its nose to the glass. Inside, something presses back.*'],
      ['lead', 'Break it open.'],
    ],
    115: [
      ['foe', 'Every bone on this coast is a wyrm my family picked clean. Rain-luck sells, Warden. Who are you to end the trade?'],
      ['nima', "They're not luck. They were alive."],
      ['foe', 'Everything was alive, child. Then the sun came down.'],
      ['nadaa', '*Nadaa lays her head on the sand among the bones and closes her eyes.*'],
    ],
    120: [
      ['hadi', "The song is under the salt. A whole cliff of it, white and solid. The Saltborn walk into it and don't come out."],
      ['maram', 'They are feeding it. The prison drinks them, and the wyrm inside drinks nothing.'],
      ['nadaa', '*Nadaa coils beside {wyrm}, and the two of them sing at the cliff until it starts to crack.*'],
    ],
    125: [
      ['foe', 'Sixty years I have kept this storm still. Do you know what happens if it moves? It rains. Everywhere, all at once. Drowning is still dying, Warden.'],
      ['lead', 'So is thirst.'],
      ['maram', "He's right that it will be a great deal of rain. He's wrong that we can't keep it."],
    ],
    130: [
      ['hadi', "The lightning's frozen. Walk under it and your hair stands up. Nima's hair has been standing up for an hour."],
      ['nima', "It's AMAZING."],
      ['seyl', '*Seyl rears up toward the cloud. From inside it, a voice answers like a drum the size of a mountain.*'],
    ],
    135: [
      ['foe', 'We sang the embers warm for three hundred years. When you put out the last of them, Warden, who will remember the song?'],
      ['maram', 'We will. We will sing it at the funeral.'],
      ['barq', '*Barq crackles with delight and sets the Choirmaster\'s robes smoking.*'],
    ],
    140: [
      ['hadi', "There's a cloud wrapped in ash, like a moth in a cocoon. And it's breathing."],
      ['wyrm', '*Nadaa, Seyl and Barq circle the cocoon. {wyrm} waits for your word.*'],
      ['lead', 'Give it a reason to wake up.'],
    ],
    145: [
      ['foe', 'I keep the chain. The chain keeps the Mother. The Mother keeps the Thirst fed. Break any link and the Thirst comes up looking for its supper.'],
      ['lead', 'Let it come.'],
      ['hadi', 'I really wish you would stop saying things like that.'],
      ['sahab', '*Sahab drifts down and settles over the keep\'s squad like a cool grey cloak.*'],
    ],
    150: [
      ['maram', "There. Where the water should be. That's the thing that called the sun down."],
      ['foe', '...warden. you brought me a wyrm. you brought me five.'],
      ['nima', 'We brought them home. Not to you.'],
      ['wyrm', '*Five wyrms open their mouths, and for the first time in three hundred years the Wyrmsong is sung all the way through.*'],
    ],
  },

  kin: [
    { id: 'nadaa', name: 'Nadaa', title: 'the Dew Wyrm', at: 110, level: 15, skin: 'kin_nadaa', perks: [['drinkCut', 0.05]], perk: 'Survivors drink 5% less water',
      line: 'Nadaa uncoils from the broken glass, pale as morning, and the air along the Burning Line turns soft and wet. She looks at {wyrm} for a long moment, then follows you home.',
      rest: 'She sleeps on the western cliffs above the keep, and every dawn the stones are wet with dew.' },
    { id: 'seyl', name: 'Seyl', title: 'the Flood Wyrm', at: 120, level: 16, skin: 'kin_seyl', perks: [['mult_water', 0.06]], perk: '+6% water from the wells',
      line: 'The salt cliff splits, and Seyl pours out of it like a river finding its old bed: deep blue, restless, already looking for somewhere to run.',
      rest: 'Seyl stretches along the eastern rim with his tail hanging down the canyon wall, and the wells fill faster for it.' },
    { id: 'barq', name: 'Barq', title: 'the Storm Wyrm', at: 130, level: 17, skin: 'kin_barq', perks: [['breath', 0.1], ['teamAtk', 0.03]], perk: "+10% Rainwyrm's breath and +3% squad attack",
      line: 'When the Dead Storm breaks, sixty years of thunder go off at once. In the middle of it, laughing, is Barq.',
      rest: 'Barq perches on the high rim behind the watchtower and crackles at anyone who comes near the keep uninvited.' },
    { id: 'sahab', name: 'Sahab', title: 'the Cloud Wyrm', at: 140, level: 18, skin: 'kin_sahab', perks: [['rainCd', 0.1], ['rainDur', 10]], perk: 'Call the Rain recharges 10% faster and lasts 10 s longer',
      line: 'The ash cocoon peels open and Sahab unfolds: white, enormous and nearly weightless, a cloud that learned to be a wyrm.',
      rest: 'Sahab drifts above the keep in the afternoons, and wherever her shadow falls it is cool.' },
    { id: 'ghaitha', name: 'Ghaitha', title: 'the Mother of Rains', at: 150, level: 20, skin: 'kin_ghaitha', perks: [['prod', 0.05], ['cool', 1]], perk: '+5% production and 1 °C cooler', mother: true,
      line: 'Ghaitha, the Mother of Rains, lifts her head from the Well and breathes, and the whole south turns to fog.',
      rest: 'Ghaitha rests on the cliff above the Temple of Rains, where she can watch {wyrm} and the whole of the south.' },
  ],

  // Hero Tales: part 1 opens when you have the hero, part 2 at hero Lv 15, part 3 at Lv 30 and 2 stars.
  taleNeeds: [{ lvl: 1, stars: 1 }, { lvl: 15, stars: 1 }, { lvl: 30, stars: 2 }],
  taleRewards: [{ starglass: 100, journals: 40 }, { starglass: 150, shards: 10 }, { starglass: 300, beacons: 1 }],
  talePerk: { skill: 0.25, steward: 0.5 },
  tales: {
    zahra: { name: 'The Lantern Road', parts: [
      { title: 'A light on the wall', text: 'Every night Zahra lights a lantern on the east wall, though the Glass Cities have been empty for twenty years. "Somebody might still be walking," she says. Tonight somebody is, and the jackals have found them first.', foe: ['Lantern Jackals', 'lancer'] },
      { title: 'The three hundred and first', text: 'The walker is a boy of ten. His mother stayed behind in the Glass Cities, he says, to hold a door. Zahra counted three hundred people out. She has spent twenty years wondering who she left.', foe: ['Glass City Looters', 'bow'] },
      { title: 'The door', text: 'The door is still there, and so is the woman behind it, old and very thin, still holding it shut against whatever lives in the dark beyond. "I knew you would come back," she tells Zahra. "You took your time."', foe: ['The Shade Behind the Door', 'guard'] },
    ], choice: { prompt: 'Everyone Zahra left behind is home. What becomes of the lantern?',
      a: { label: 'Keep it lit', text: 'Somebody might still be walking. Zahra carries the lantern into every fight, and her shield never dims.' },
      b: { label: 'Hang it in the square', text: 'The lantern lights the square, and Zahra finally rests. The keep sleeps cooler under her watch.' } } },
    tariq: { name: 'Faster Than the Storm', parts: [
      { title: 'A challenge', text: 'A rider from Sandgate claims her camel has outrun three sandstorms. Tariq claims his has outrun eleven. There is only one way to settle it, and the course runs straight through raider country.', foe: ['Course Raiders', 'guard'] },
      { title: 'The twelfth storm', text: 'Halfway through the race the sky goes brown. Both riders could turn back. Neither will. "It\'s only a storm," says Tariq, which is what he always says right before something goes wrong.', foe: ['Storm Vultures', 'bow'] },
      { title: 'The finish line', text: 'The storm drives them into a canyon full of scorpions, and the race becomes a rescue. The Sandgate camel is lame. Tariq\'s camel can carry them both, slowly, or carry him to the finish fast.', foe: ['Canyon Scorpions', 'guard'] },
    ], choice: { prompt: 'The finish line is a mile away. The Sandgate rider is on foot.',
      a: { label: 'Ride for the finish', text: 'He sends help back for her and wins by a length. Tariq has never charged harder.' },
      b: { label: 'Carry her home', text: 'He loses the race, and spends the long walk home teaching the keep\'s riders everything he knows.' } } },
    leila: { name: 'The Eye of the Storm', parts: [
      { title: 'What the storm took', text: 'Leila never talks about the sandstorm that took her eye. Tonight a storm the same colour rolls in from the west, and she climbs the watchtower and will not come down.', foe: ['Storm Harpies', 'bow'] },
      { title: 'Something in the dust', text: '"There\'s something walking inside it," she says. "Same as last time." Nobody else can see it. Nobody else has ever been able to see it.', foe: ['Dustwalker Wraiths', 'bow'] },
      { title: 'Eye to eye', text: 'In the heart of the storm stands a giant of dust with one glittering eye, and the eye is Leila\'s. It has been watching the keep through it for years.', foe: ['The One-Eyed Giant', 'guard'] },
    ], choice: { prompt: 'The giant falls apart into plain sand. Leila\'s eye lies glittering on the dune.',
      a: { label: 'Take it back', text: 'She sets the eye in a silver ring on her bowstring. She does not miss again.' },
      b: { label: 'Leave it to the storm', text: '"Let it watch," she says. "I\'ll be watching back." The fields have never been safer.' } } },
    idris: { name: 'The Last Wyrm-Keeper', parts: [
      { title: 'A new verse', text: 'Idris sings to {wyrm} every morning, a song with no words that the last wyrm-keepers taught him. This morning {wyrm} sings back a verse Idris has never heard.', foe: ['Echo Wraiths', 'bow'] },
      { title: 'The fallen roost', text: 'The verse is a map. It leads to the tower where Idris was raised, empty now, the wyrm-keepers\' roost fallen in. Something has been nesting in the ruins.', foe: ['Roost Vipers', 'lancer'] },
      { title: 'The egg room', text: 'Under the tower is a room of broken eggshells, blue and cold, and one shell that is not broken. Idris sits with it all night. By morning he understands: {wyrm} was never the last egg. It was only the first to hatch.', foe: ['Shell Scavengers', 'guard'] },
    ], choice: { prompt: 'The last egg is warm in Idris\'s hands. It hums when he sings.',
      a: { label: 'Carry it with him', text: 'Idris keeps the egg against his chest in every battle. It hums, and wounds close.' },
      b: { label: 'Give it to the spring', text: 'He sets it in the shallows beside {wyrm}. The wells run deeper for it.' } } },
    soraya: { name: 'The Morning in the North', parts: [
      { title: 'Nobody believed her', text: 'For years Soraya told anyone who would listen about the morning it rained in the north. Nobody believed her. Now that it rains here, a man comes to the gate to say he was there that morning too.', foe: ['Gate Brawlers', 'guard'] },
      { title: 'The northern road', text: 'He draws her a map: a valley where it rained once, for a single morning, twenty-five years ago. Soraya is gone before the ink is dry.', foe: ['Northroad Bandits', 'lancer'] },
      { title: 'The valley', text: 'The valley is green. Not much, not everywhere, but green: a seed of the old world, kept alive by one rain and by people who never stopped watering it.', foe: ['Locust Swarm', 'bow'] },
    ], choice: { prompt: 'The valley people offer Soraya anything she wants to take home.',
      a: { label: 'Only the news', text: 'She rides home shouting it to every keep she passes, and charges into every fight like she is bringing good news.' },
      b: { label: 'Their seeds', text: 'Her riders carry the valley\'s seeds to every corner of the Dunes, and come home heavier each time.' } } },
    nadia: { name: 'The Glass That Does Not Break', parts: [
      { title: 'A broken arrowhead', text: 'For the first time in her life, one of Nadia\'s arrowheads has broken. She holds the pieces for a long time. "Wrong glass," she says. "Someone is selling false glass on the Dunes."', foe: ['Glass Forgers', 'guard'] },
      { title: 'The true glass', text: 'True sea-floor glass comes from one place: the wreck of a ship called the Patient Morning, lantern still lit, a mile under the Glass Sea. Nadia goes to cut more.', foe: ['Glassback Scorpions', 'guard'] },
      { title: "The captain's lantern", text: 'Inside the wreck the lantern burns with a cold green flame, and the captain is still at the wheel, made of glass. She asks Nadia what year it is.', foe: ['The Glass Captain', 'bow'] },
    ], choice: { prompt: 'The glass captain says Nadia may take one thing from her ship.',
      a: { label: 'The lantern glass', text: 'Arrowheads cut from the lantern burn green and go through anything.' },
      b: { label: 'The ballast', text: 'A hold full of copper ingots the captain never needed. Nadia leaves the wreck in peace.' } } },
    bashir: { name: 'Thirty Years Down', parts: [
      { title: 'Knocking', text: 'Bashir says the deepest shaft of the Deep Well has started to knock. Not water. Not rock settling. Knocking, in threes.', foe: ['Tunnel Crawlers', 'guard'] },
      { title: 'The sealed shaft', text: 'The knocking leads to a shaft Bashir dug thirty years ago and sealed after a cave-in, with his partner on the far side. He has never told anyone that.', foe: ['Cave Vipers', 'lancer'] },
      { title: 'The village below', text: 'Behind the seal is a cavern full of water and a village of well-diggers who walked out the far side of the cave-in and never came up. His partner is their headwoman. She has been knocking for thirty years.', foe: ['Deep Leeches', 'lancer'] },
    ], choice: { prompt: 'The village below has water but no sky. The keep has sky and never enough water.',
      a: { label: 'Clear the old tunnels', text: 'Bashir holds every tunnel open with his shield until the last of them has climbed out.' },
      b: { label: 'Join the shafts', text: 'The two villages share the water, and the Deep Well runs deeper than ever.' } } },
    amira: { name: 'The Loom of Shade', parts: [
      { title: 'The stolen loom', text: 'Someone has stolen Amira\'s great loom, the one her grandmother built to weave shade sails as wide as the square. She follows the cart ruts into the dunes.', foe: ['Loom Thieves', 'lancer'] },
      { title: 'A keep with no shade', text: 'The thieves come from a keep with no shade sails, where children sleep through the day under wet blankets and work at night. They stole the loom because they could not afford to ask.', foe: ['Sunstruck Raiders', 'guard'] },
      { title: 'The great sail', text: 'Their keep is hunted by sun harpies that dive on anyone caught in the open at noon. Amira looks at her loom, and at the children.', foe: ['Sun Harpies', 'bow'] },
    ], choice: { prompt: 'The harpies are gone. The loom can make one more great sail before it needs mending.',
      a: { label: 'Weave war sails', text: 'Amira weaves shields of shade for the squad, light enough to carry and strong enough to turn an arrow.' },
      b: { label: 'Weave for both keeps', text: 'She teaches the thieves to weave and comes home with six apprentices. The keep has never been so cool.' } } },
    kofi: { name: 'The Salt Road', parts: [
      { title: 'A missing caravan', text: 'One of Kofi\'s stone caravans hasn\'t come home. Kofi doesn\'t wait for the scouts.', foe: ['Road Ambushers', 'bow'] },
      { title: 'Salt in the tracks', text: 'The caravan\'s tracks lead out into the white flats, and halfway along, the camels\' footprints turn to salt.', foe: ['Salt Husks', 'guard'] },
      { title: 'What the Saltborn built', text: 'The Saltborn have been quarrying salt from his drivers\' footprints, block by block, to build something. Kofi brings every driver home, then goes back to look at what they built.', foe: ['Saltborn Haulers', 'guard'] },
    ], choice: { prompt: 'It is a wall of pure salt-stone, half a mile long and very, very good stone.',
      a: { label: 'Smash it', text: 'Kofi leaves nothing standing for the Saltborn to come back to, and fights like a man who has hauled stone all his life.' },
      b: { label: 'Haul it home', text: 'Blocks of salt-stone make the best walls in the keep. Kofi\'s caravans have never been busier.' } } },
    yara: { name: 'The White Hare', parts: [
      { title: 'Frost in the sand', text: 'Yara has found tracks she cannot name. A hare, she thinks, but its feet leave frost in the sand.', foe: ['Night Jackals', 'lancer'] },
      { title: 'The cold trail', text: 'The frost trail leads three nights into the dunes. Each night is colder. On the third, Yara\'s waterskin freezes solid.', foe: ['Frost Vipers', 'lancer'] },
      { title: 'The burrow', text: 'The white hare lives above a spring so cold it steams. It has been keeping the spring cold, and alive, through the whole drought.', foe: ['Spring Poachers', 'bow'] },
    ], choice: { prompt: 'The hare watches Yara from its burrow, unafraid.',
      a: { label: 'Learn from it', text: 'Yara learns to move like the hare: never where the arrow lands.' },
      b: { label: 'Guard its spring', text: 'The hare\'s spring feeds a hidden garden that Yara harvests every season.' } } },
    rashid: { name: 'The Night at the East Gate', parts: [
      { title: "He won't talk about it", text: 'Nima asks Rashid what happened the night he held the east gate. He doesn\'t answer. That night he walks out of the gate and isn\'t back by morning.', foe: ['Grave Robbers', 'lancer'] },
      { title: 'Five cairns', text: 'He is at a ring of cairns half a day east. There were six of them at the gate that night, he says at last. Five cairns. He visits once a year.', foe: ['Carrion Vultures', 'bow'] },
      { title: 'The Gate-Taker', text: 'The raider chief who broke the east gate that night is still alive, and still raiding. This year Rashid didn\'t come to visit. He came to finish it.', foe: ['The Gate-Taker', 'guard'] },
    ], choice: { prompt: 'It is over. Rashid stands by the cairns for a long time.',
      a: { label: 'Carry their names', text: 'He paints five names inside his shield. It has not broken since.' },
      b: { label: 'Bring the stones home', text: 'Five stones are set into the keep\'s gate, and every new recruit salutes them.' } } },
    samira: { name: 'Undelivered', parts: [
      { title: 'A letter with no keep', text: 'For six years Samira has carried a letter addressed to a keep nobody has heard of: Lanternfall. Today a raider tries to take it from her.', foe: ['Letter Thieves', 'lancer'] },
      { title: 'She opens it', text: 'She opens it. It is a love letter from a girl in Sunwell to a boy in Lanternfall, sent the year the rain stopped. Samira finally asks around. Lanternfall is real. It is under a dune.', foe: ['Dune Stalkers', 'lancer'] },
      { title: 'Lanternfall', text: 'Lanternfall\'s people dug down instead of out: a village under the sand, lit by lanterns. The boy is an old man now. He wrote back every year. He just never had a courier.', foe: ['Burrow Bears', 'guard'] },
    ], choice: { prompt: 'Samira has a bag of forty years of replies to deliver.',
      a: { label: 'Run faster', text: 'Samira swears no letter will wait six years again, and has never been quicker on her feet.' },
      b: { label: 'Open a route', text: 'Lanternfall trades with the keep now, and Samira\'s couriers find every caravan on the Dunes.' } } },
    omar: { name: 'The Second Pick', parts: [
      { title: 'What emergency?', text: 'Nima finally asks Omar what the second pick is for. "Emergencies," he says, which is not an answer. That afternoon the quarry floor collapses.', foe: ['Quarry Crawlers', 'guard'] },
      { title: 'The hollow', text: 'Under the quarry is a hollow full of old carvings: rain clouds, wyrms, people dancing. Omar picks up his second pick for the first time in years.', foe: ['Cave Harpies', 'bow'] },
      { title: "His mother's gate", text: 'The second pick is a carver\'s pick. Omar\'s mother carved the keep\'s old gate before the drought. He has been saving it to carve her a stone that says she was right about the rain.', foe: ['Hollow Golems', 'guard'] },
    ], choice: { prompt: 'The stone is ready to carve, and so are the raiders at the quarry gate.',
      a: { label: 'Both picks to the fight', text: 'Omar fights with a pick in each hand, and the raiders learn what emergencies are.' },
      b: { label: 'Carve the stone', text: 'The stone stands by the quarry, and Omar\'s crews have never cut cleaner blocks.' } } },
    nuri: { name: 'The Snare Line', parts: [
      { title: 'Empty snares', text: 'Nuri\'s snares are coming up empty, every one of them cut clean. Someone is poaching on the trapper\'s line.', foe: ['Line Poachers', 'bow'] },
      { title: 'The poachers', text: 'The poachers are children from a keep two days west, where the hares are all gone. Nuri shows them how to set a snare without emptying a run.', foe: ['Hare-Hunting Jackals', 'lancer'] },
      { title: 'The biggest snare', text: 'The children\'s keep has a bigger problem than hares: a jackal pack that has learned to open gates. Nuri sets the biggest snare of a long career.', foe: ['The Jackal King', 'lancer'] },
    ], choice: { prompt: 'The children want to learn everything Nuri knows.',
      a: { label: 'Keep the line sharp', text: 'Nuri stays a hunter, and never misses a shot again.' },
      b: { label: 'Teach them', text: 'Two keeps\' worth of trappers keep the hare runs full, and the stewpots too.' } } },
    halima: { name: 'Nearly Has', parts: [
      { title: 'The pale man', text: 'Everyone knows Halima\'s tonic nearly woke the dead. Nobody knows who. Tonight a stranger comes to the Healer\'s House asking for her by name. He is very pale.', foe: ['Fever Wraiths', 'bow'] },
      { title: 'Halfway back', text: 'He is the one she nearly woke: a caravan guard left for dead on the road. Her tonic brought him halfway back. He has been halfway ever since, and he wants the other half.', foe: ['Grave Jackals', 'lancer'] },
      { title: 'The crater aloe', text: 'The other half needs an aloe that grows in only one place, a crater the Ember Choir guards.', foe: ['Ember Acolytes', 'bow'] },
    ], choice: { prompt: 'The crater aloe is enough for one great tonic.',
      a: { label: 'Brew it for the fighters', text: 'Halima\'s battle tonic closes wounds as fast as they open.' },
      b: { label: 'Brew it for the sick', text: 'The pale man walks out of the Healer\'s House with colour in his cheeks, and nobody in the keep stays sick for long.' } } },
    lio: { name: 'The Youngest Scout', parts: [
      { title: 'Too young', text: 'Hadi says Lio is too young for the long patrol. Lio says nothing, and is gone by dawn.', foe: ['Ridge Raiders', 'lancer'] },
      { title: 'The far ridge', text: 'From the far ridge Lio sees what the long patrol missed: a raider army gathering in a dry valley, more than anyone has seen in years.', foe: ['Raider Outriders', 'lancer'] },
      { title: 'One day', text: 'Lio rides home ahead of them, and the keep gets one day of warning instead of none.', foe: ['The Raider Vanguard', 'guard'] },
    ], choice: { prompt: 'Hadi offers Lio a place, and a choice of where.',
      a: { label: 'Ride with the squad', text: 'Lio rides in the front rank now, and no flank is safe.' },
      b: { label: 'Lead the long patrol', text: 'The long patrol finds copper seams nobody knew were there.' } } },
    tamir: { name: 'The Last Spice', parts: [
      { title: 'No black lime', text: 'Tamir has run out of black lime, the spice that makes his stew his stew. The keep is in mourning. Tamir is in the gate with his sling.', foe: ['Spice Bandits', 'bow'] },
      { title: 'The walled garden', text: 'The last black lime trees grow in a walled garden at the edge of the Glass Sea, guarded by a family of very large tortoises.', foe: ['Garden Tortoises', 'guard'] },
      { title: 'The cook-off', text: 'The gardener, ninety years old, will trade one sack of black lime for one bowl of stew better than hers. Tamir has never lost a cook-off. He has never had to win one under arrows.', foe: ['Glass Sea Raiders', 'lancer'] },
    ], choice: { prompt: 'Tamir wins. The gardener offers a sack of limes, or a pocket of seeds.',
      a: { label: 'The limes, for the march', text: 'Tamir\'s war rations become legend. Nobody fights hungry.' },
      b: { label: 'The seeds', text: 'Black lime trees grow by the Date Grove now, and the stewpots never run dry.' } } },
    mara: { name: 'The Highest Tower', parts: [
      { title: 'The best stone', text: 'Mara wants to build the tallest windcatcher on the Dunes. The best stone for it lies in a quarry the dust riders call their own.', foe: ['Dust Riders', 'lancer'] },
      { title: 'A wind from the south', text: 'Halfway up, the tower catches a wind nobody has felt in years: cold and wet, out of the south.', foe: ['Gale Harpies', 'bow'] },
      { title: 'The view from the top', text: 'From the top Mara can see the whole keep breathing cooler. She can also see the raiders coming to pull her tower down.', foe: ['Tower Breakers', 'guard'] },
    ], choice: { prompt: 'The tower stands. Mara has stone left for one more thing.',
      a: { label: 'A lance of tower-stone', text: 'Mara fights with a lance cut from the tower\'s capstone, and it hits like a falling wall.' },
      b: { label: 'Ten more towers', text: 'Ten windcatchers rise over the keep, and nobody sleeps hot again.' } } },
    imani: { name: 'Forty Shields', parts: [
      { title: 'The dry morning', text: 'Every year on the day of the first flood, Imani stands in the wadi gate alone an hour before dawn. This year the wadi is dry, and something is coming down it instead of water.', foe: ['Mudback Crocodiles', 'guard'] },
      { title: 'The fortieth shield', text: 'Thirty-nine of the forty shields hang in the gatehouse. The fortieth is missing, and so is the man who carried it.', foe: ['Flood Raiders', 'lancer'] },
      { title: 'The dam', text: 'He is upstream, building a dam to keep the wadi for a single keep. One keep that lives, he says, is better than ten that share and die.', foe: ['The Dam-Lord', 'guard'] },
    ], choice: { prompt: 'The dam-lord is beaten. The fortieth shield lies at Imani\'s feet.',
      a: { label: 'Bring the shield home', text: 'All forty shields hang in the gatehouse again, and Imani\'s wall has never held so well.' },
      b: { label: 'Open the dam', text: 'The wadi runs for every keep downstream, and the keep\'s wells rise with it.' } } },
    kaveh: { name: 'The Plan', parts: [
      { title: 'The kite', text: 'Kaveh\'s plan, twenty years in the making, is ready: a kite that can carry a bottle into the heart of a storm and bring back lightning. He needs a storm, a crew, and nobody asking questions.', foe: ['Kite Thieves', 'lancer'] },
      { title: 'The holy storm', text: 'The storm he wants is guarded by a cult that thinks lightning is holy and Kaveh is a thief. They are half right.', foe: ['Stormcaller Cultists', 'bow'] },
      { title: 'Something notices', text: 'The bottle fills with blue fire. The kite string glows. Something in the cloud notices.', foe: ['The Cloud Serpent', 'lancer'] },
    ], choice: { prompt: 'Kaveh has one bottle of lightning. He has two ideas.',
      a: { label: 'Thunder arrows', text: 'Arrows tipped with bottled lightning, and the sound they make is something else.' },
      b: { label: 'Light the Forge', text: 'The Sunsteel Forge burns blue now, and hotter than it ever has.' } } },
    tomas: { name: "The Ferryman's Fare", parts: [
      { title: 'One story', text: 'Tomás still ferries anyone across the salt marsh for the fare he charged when it was dry: one story. Today a passenger pays with a story about him.', foe: ['Marsh Raiders', 'lancer'] },
      { title: 'The island', text: 'It is about his wife, who took the boat out the year the marsh dried and did not come back. The passenger says she is on an island in the marsh, and the Saltborn have it surrounded.', foe: ['Saltborn Husks', 'guard'] },
      { title: "You're late", text: 'She has been waiting for water too. Twenty years. "You\'re late," she says, and gets in the boat.', foe: ['Brine Witches', 'bow'] },
    ], choice: { prompt: 'Tomás and his wife have a boat, a marsh full of water, and the rest of their lives.',
      a: { label: 'Pole into battle', text: 'Tomás swings his ferry pole like a lance, and the undertow goes with him.' },
      b: { label: 'Ferry for the keep', text: 'The two of them run every crossing in the marshes, and the keep\'s caravans move twice as fast.' } } },
    sefa: { name: 'The Song She Stopped', parts: [
      { title: 'Her name, sung', text: 'The Cinder Choir does not forgive deserters. Three of them stand outside the gate tonight, singing Sefa\'s name.', foe: ['Choir Hunters', 'bow'] },
      { title: 'Her ember', text: 'Sefa goes back to the crater where she sang for ten years, to finish what she began when she stopped singing: to put out her own ember.', foe: ['Ember Acolytes', 'bow'] },
      { title: 'The choir-sister', text: 'Her ember still burns, kept warm by her old choir-sister, who never stopped singing because Sefa left. "You could have taken me with you," she says.', foe: ['The Choir-Sister', 'bow'] },
    ], choice: { prompt: 'The ember is out. Her choir-sister has nowhere to go.',
      a: { label: 'Teach her a new song', text: 'They sing together in battle now, and the embers answer to them instead of the Choir.' },
      b: { label: 'Bring her to the Forge', text: 'Two old choir-singers tend the Sunsteel Forge, and the metal has never run so pure.' } } },
    yusra: { name: 'The Last Verse', parts: [
      { title: 'A song with a gap in it', text: 'Yusra\'s grandmother taught her every wyrm-song but one, and died before the last verse. On the Bone Coast, the Bonepickers say they have it, carved on a skull, and will sell it to the highest bidder.', foe: ['Bonepickers', 'lancer'] },
      { title: 'The skull', text: 'The skull is real. So is the verse. So are the gulls that roost in the skull\'s eyes, and they do not like visitors.', foe: ['Gull Harpies', 'bow'] },
      { title: 'What the verse calls', text: 'Yusra sings the whole song for the first time. Out at the edge of the old sea, something enormous turns over in the sand and starts toward the sound.', foe: ['The Shoal-Wraith', 'bow'] },
    ], choice: { prompt: 'The song is whole again. Yusra can sing it once more, for one purpose.',
      a: { label: 'Sing it in battle', text: 'Every arrow she looses carries a note of the old sea, and the squad fights to its rhythm.' },
      b: { label: 'Sing it to the wells', text: 'She sings at the bottom of the Deep Well, and the water rises to listen.' } } },
    haroun: { name: 'Glass and Ash', parts: [
      { title: 'The order', text: 'A captain of the Cinder Choir orders a hundred glass shields from Haroun\'s old workshop on the Burning Line. Haroun has not worked for the Choir in years. Someone is using his name.', foe: ['Ember Cultists', 'lancer'] },
      { title: 'The workshop', text: 'His apprentice kept the furnace burning after Haroun left, and has learned to make glass that cuts like a blade. He is proud of it. He is making it for the wrong people.', foe: ['Glass Hounds', 'lancer'] },
      { title: 'The kiln', text: 'The apprentice has built a kiln big enough to melt a wyrm\'s scales into glass. He means to try it on yours. Haroun breaks the first shield he ever made against its door.', foe: ['The Kiln-Warden', 'guard'] },
    ], choice: { prompt: 'The kiln is cold. The apprentice kneels in the ash and waits.',
      a: { label: 'Make him a shield-bearer', text: 'The apprentice carries Haroun\'s shield now, and Haroun carries a better one.' },
      b: { label: 'Bring him to the quarry', text: 'Two glassmen at the quarry, and the stone comes out cut as clean as glass.' } } },
    noor: { name: 'Every Charm Sold', parts: [
      { title: 'The camel', text: 'Noor\'s camel was the price of every charm she ever carved. The man who sold it to her has come to take it back, with friends, because he says she paid in fake bone.', foe: ['Camel Rustlers', 'lancer'] },
      { title: 'The fake bone', text: 'It was not fake. It was wyrm bone, real and old, and the man knows it. He wants to know where she found it, so he can dig up the rest.', foe: ['Grave Diggers', 'guard'] },
      { title: 'The graveyard', text: 'Noor leads him to the place, because she wants to see who else is digging. The wyrm graveyard is not empty. Something guards it.', foe: ['The Bone Warden', 'guard'] },
    ], choice: { prompt: 'The guardian is down, and the graveyard is quiet again.',
      a: { label: 'Take a fang for her spear', text: 'Noor rides with a wyrm\'s fang on her spear, and her first charge hits like a falling dune.' },
      b: { label: 'Leave a charm for the dead', text: 'Noor buries her last charm in the graveyard, and the copper seam under the keep runs richer since.' } } },
  },
});
