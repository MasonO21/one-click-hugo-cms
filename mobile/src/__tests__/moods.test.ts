import { classifyMood, isMoodId, MOOD_IDS, MOOD_LABELS } from '@/domain/moods';

describe('classifyMood', () => {
  it.each([
    ['So happy I came out today, the view is beautiful.', 'happy'],
    ['Legs feel heavy and I am exhausted.', 'tired'],
    ['Feeling strong today, I could keep this pace all day.', 'energized'],
    ['Wrong turn again, so annoying. Lost the trail twice.', 'frustrated'],
    ['Peaceful morning, just calm and quiet out here.', 'calm'],
    ['Not giving up. Almost there, keep going.', 'determined'],
    ['Feeling low today and a bit overwhelmed.', 'low'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(classifyMood(text).mood).toBe(expected);
  });

  it.each([
    ['Short shakeout run before work. Felt fast and full of energy, legs are fresh.', 'energized'],
    ['Feeling good today, legs feel fresh.', 'energized'],
    ['So stoked on this view.', 'happy'],
    ['Really excited for the summit push.', 'happy'],
    ['This is so much fun.', 'happy'],
    ['Proud of that climb.', 'happy'],
    ['Totally gassed. Nothing left in the tank.', 'tired'],
    ['I bonked at mile eighteen, completely out of gas.', 'tired'],
    ['Legs are toast and my feet are killing me.', 'tired'],
    ['I have no energy today.', 'tired'],
    ['Struggling up this hill.', 'tired'],
    ['Pretty bummed, had to turn back before the top.', 'low'],
    ['Miserable in this rain.', 'low'],
    ['Nice and chill on the trail tonight.', 'calm'],
    ['Taking it easy by the lake, so tranquil.', 'calm'],
    ['Got lost twice and I am fed up.', 'frustrated'],
    ['Dig deep, one step at a time.', 'determined'],
  ])('reads everyday trail talk "%s" as %s', (text, expected) => {
    expect(classifyMood(text).mood).toBe(expected);
  });

  it('does not read trail conditions as feelings', () => {
    expect(classifyMood('Fresh snow on the peaks and a chill in the air.').mood).toBeNull();
    expect(classifyMood('The river is running fast after the storm.').mood).toBeNull();
    expect(classifyMood('Spent the night at the hut below the pass.').mood).toBeNull();
  });

  it('does not count negated everyday feelings', () => {
    expect(classifyMood('Not feeling good today.').mood).toBeNull();
    expect(classifyMood("Honestly I'm not stoked about this weather.").mood).toBeNull();
  });

  it('returns no mood when nothing is clear', () => {
    expect(classifyMood('Crossed the creek at mile three and turned left at the sign.').mood).toBeNull();
    expect(classifyMood('').mood).toBeNull();
  });

  it('ignores words that usually describe the trail, not the person', () => {
    expect(classifyMood('Strong wind, low clouds, and a blue sky ahead. Heavy rain earlier.').mood).toBeNull();
  });

  it('does not count negated feelings', () => {
    expect(classifyMood("I'm not tired at all.").mood).toBeNull();
    expect(classifyMood('It was never frustrating, honestly.').mood).toBeNull();
  });

  it('weighs intensifiers and softeners', () => {
    const plain = classifyMood('I am tired.').score;
    expect(classifyMood('I am so tired.').score).toBeGreaterThan(plain);
    expect(classifyMood('I am slightly tired.').score).toBeLessThan(plain);
  });

  it('picks the stronger mood when several show up', () => {
    expect(classifyMood('Exhausted and drained, but the view was worth it.').mood).toBe('tired');
  });

  it('has a label for every mood', () => {
    for (const id of MOOD_IDS) expect(MOOD_LABELS[id]).toBeTruthy();
    expect(isMoodId('happy')).toBe(true);
    expect(isMoodId('elated')).toBe(false);
    expect(isMoodId(null)).toBe(false);
  });
});
