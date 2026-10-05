export const MOOD_IDS = [
  'energized',
  'happy',
  'calm',
  'determined',
  'tired',
  'frustrated',
  'low',
] as const;

export type MoodId = (typeof MOOD_IDS)[number];

export const MOOD_LABELS: Record<MoodId, string> = {
  energized: 'Energized',
  happy: 'Happy',
  calm: 'Calm',
  determined: 'Determined',
  tired: 'Tired',
  frustrated: 'Frustrated',
  low: 'Low',
};

export function isMoodId(value: unknown): value is MoodId {
  return typeof value === 'string' && (MOOD_IDS as readonly string[]).includes(value);
}

type Lexicon = Record<MoodId, [phrase: string, weight: number][]>;

// Phrases are matched on word boundaries. Ambiguous single words that are common
// in trail talk ("strong wind", "low clouds", "blue sky", "heavy rain") are left out.
const LEXICON: Lexicon = {
  energized: [
    ['energized', 3],
    ['energised', 3],
    ['energetic', 3],
    ['pumped', 3],
    ['fired up', 3],
    ['feel strong', 3],
    ['feeling strong', 3],
    ['felt strong', 3],
    ['strong legs', 2.5],
    ['feel great', 2.5],
    ['feeling great', 2.5],
    ['felt great', 2.5],
    ['flying', 2],
    ['alive', 2],
    ['fresh legs', 2.5],
    ['light on my feet', 3],
    ['full of energy', 3],
    ['lots of energy', 3],
    ['so much energy', 3],
    ['tons of energy', 3],
    ['feel good', 2],
    ['feeling good', 2],
    ['felt good', 2],
    ['feel fresh', 2.5],
    ['feeling fresh', 2.5],
    ['felt fresh', 2.5],
    ['legs feel fresh', 2.5],
    ['legs are fresh', 2.5],
    ['legs feel good', 2.5],
    ['legs feel great', 2.5],
    ['feel fast', 2],
    ['feeling fast', 2],
    ['felt fast', 2],
  ],
  happy: [
    ['happy', 3],
    ['joy', 3],
    ['joyful', 3],
    ['grateful', 3],
    ['thankful', 3],
    ['delighted', 3],
    ['smiling', 2],
    ['love', 2],
    ['loved', 2],
    ['amazing', 2],
    ['beautiful', 2],
    ['gorgeous', 2],
    ['stunning', 2],
    ['wonderful', 2],
    ['fantastic', 2],
    ['awesome', 2],
    ['unreal', 2],
    ['worth it', 2],
    ['glad', 2],
    ['stoked', 3],
    ['psyched', 3],
    ['excited', 3],
    ['thrilled', 3],
    ['proud', 3],
    ['blessed', 2],
    ['lucky', 2],
    ['fun', 2],
    ['enjoying', 2],
    ['incredible', 2],
    ['great day', 2],
    ['great run', 2],
    ['great hike', 2],
    ['perfect day', 2.5],
    ['best day', 2.5],
    ['best run', 2.5],
    ['best hike', 2.5],
  ],
  calm: [
    ['calm', 3],
    ['peaceful', 3],
    ['serene', 3],
    ['relaxed', 3],
    ['relaxing', 2],
    ['at peace', 3],
    ['mellow', 2],
    ['quiet', 1.5],
    ['gentle', 1.5],
    ['content', 2],
    ['unhurried', 2],
    ['tranquil', 3],
    ['soothing', 2.5],
    ['restful', 2.5],
    ['zen', 2.5],
    ['unwind', 2.5],
    ['unwinding', 2.5],
    ['chilled out', 3],
    ['nice and chill', 2.5],
    // Alone, "chill" often means cold air, so it only counts with an intensifier.
    ['chill', 1.5],
    ['taking it easy', 2],
    ['silence', 1.5],
    ['stillness', 2.5],
  ],
  determined: [
    ['determined', 3],
    ['motivated', 3],
    ['persevere', 3],
    ['not giving up', 3],
    ['keep going', 2.5],
    ['keep pushing', 2.5],
    ['pushing', 2],
    ['push through', 2.5],
    ['focused', 2],
    ['almost there', 2],
    ['grinding', 2],
    ['grind', 2],
    ['steady', 1.5],
    ['stubborn', 2],
    ['dig deep', 3],
    ['digging deep', 3],
    ['one step at a time', 2.5],
    ['locked in', 2.5],
    ['on a mission', 2.5],
    ['no excuses', 2.5],
    ['committed', 2],
    ['going to make it', 2],
    ['gonna make it', 2],
  ],
  tired: [
    ['exhausted', 3.5],
    ['tired', 3],
    ['drained', 3],
    ['fatigued', 3],
    ['worn out', 3],
    ['weary', 3],
    ['wiped out', 3],
    ['burned out', 3],
    ['burnt out', 3],
    ['sleepy', 2],
    ['sore', 2],
    ['heavy legs', 2.5],
    ['legs feel heavy', 2.5],
    ['legs are dead', 3],
    ['dragging', 2],
    ['gassed', 3],
    ['bonked', 3],
    ['bonking', 3],
    ['hit the wall', 3],
    ['out of gas', 3],
    ['running on empty', 3],
    ['nothing left', 2.5],
    ['no energy', 3],
    ['zero energy', 3],
    ['low energy', 3],
    ['low on energy', 3],
    ['legs are toast', 3],
    ['dead legs', 3],
    ['wrecked', 2.5],
    ['knackered', 3],
    ['pooped', 2.5],
    ['sluggish', 3],
    ['lethargic', 3],
    ['struggling', 2],
    ['need a nap', 2],
  ],
  frustrated: [
    ['frustrated', 3],
    ['frustrating', 3],
    ['annoyed', 3],
    ['annoying', 2],
    ['angry', 3],
    ['irritated', 3],
    ['ugh', 2],
    ['hate', 2],
    ['wrong turn', 2],
    ['lost the trail', 2.5],
    ['stuck', 2],
    ['blister', 1.5],
    ['cramp', 2],
    ['cramping', 2],
    ['painful', 2],
    ['hurts', 2],
    ['pissed', 3],
    ['mad', 2.5],
    ['fed up', 3],
    ['sick of', 2.5],
    ['got lost', 2.5],
    ['missed the turn', 2],
    ['killing me', 2],
  ],
  low: [
    ['sad', 3],
    ['lonely', 3],
    ['discouraged', 3],
    ['depressed', 3],
    ['hopeless', 3],
    ['overwhelmed', 3],
    ['anxious', 2.5],
    ['worried', 2.5],
    ['stressed', 2.5],
    ['nervous', 2],
    ['dread', 2],
    ['feeling low', 3],
    ['feel low', 3],
    ['feeling down', 3],
    ['feel down', 3],
    ['feeling blue', 3],
    ['bummed', 3],
    ['bummer', 2],
    ['miserable', 3],
    ['disappointed', 3],
    ['disappointing', 2.5],
    ['upset', 3],
    ['homesick', 3],
    ['scared', 2.5],
    ['afraid', 2.5],
    ['rough day', 2.5],
    ['tough day', 2],
    ['crying', 2.5],
  ],
};

const NEGATIONS = new Set([
  'not',
  'no',
  'never',
  'hardly',
  'barely',
  "isn't",
  "wasn't",
  "aren't",
  "weren't",
  "don't",
  "didn't",
  "doesn't",
  "can't",
  "won't",
  "couldn't",
  "haven't",
]);

const INTENSIFIERS = new Set(['so', 'very', 'really', 'extremely', 'super', 'incredibly', 'totally', 'completely']);
const SOFTENERS = new Set(['slightly', 'somewhat', 'little', 'bit', 'kinda']);

// Ties go to whichever mood comes first here.
const PRIORITY: MoodId[] = ['happy', 'energized', 'determined', 'calm', 'tired', 'frustrated', 'low'];

const MIN_SCORE = 2;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface MoodResult {
  mood: MoodId | null;
  score: number;
}

// Estimates a single mood from what was said. Returns null when nothing clear
// stands out, so the entry gets no mood tag rather than a wrong one.
export function classifyMood(text: string): MoodResult {
  const words = normalize(text);
  const scores: Record<MoodId, number> = {
    energized: 0,
    happy: 0,
    calm: 0,
    determined: 0,
    tired: 0,
    frustrated: 0,
    low: 0,
  };

  for (const mood of MOOD_IDS) {
    for (const [phrase, weight] of LEXICON[mood]) {
      const parts = phrase.split(' ');
      for (let i = 0; i + parts.length <= words.length; i += 1) {
        if (!parts.every((part, offset) => words[i + offset] === part)) continue;

        const before = words.slice(Math.max(0, i - 3), i);
        if (before.some((w) => NEGATIONS.has(w))) continue;

        let factor = 1;
        const previous = words[i - 1];
        if (previous && INTENSIFIERS.has(previous)) factor = 1.5;
        if (previous && SOFTENERS.has(previous)) factor = 0.5;
        scores[mood] += weight * factor;
      }
    }
  }

  let best: MoodId | null = null;
  let bestScore = 0;
  for (const mood of PRIORITY) {
    if (scores[mood] > bestScore) {
      best = mood;
      bestScore = scores[mood];
    }
  }

  if (best === null || bestScore < MIN_SCORE) return { mood: null, score: bestScore };
  return { mood: best, score: bestScore };
}
