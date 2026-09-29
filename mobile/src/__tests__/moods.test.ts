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
