import { emojiFor } from '../src/components/categories';

describe('emojiFor', () => {
  it('prefers a recognisable name over the category', () => {
    expect(emojiFor('Strawberries', 'produce')).toBe('🍓');
    expect(emojiFor('Cheddar cheese', 'dairy')).toBe('🧀');
    expect(emojiFor('Free-range eggs', 'dairy')).toBe('🥚');
  });

  it('matches whole words so look-alikes fall back', () => {
    expect(emojiFor('Pineapple chunks', 'canned')).toBe('🍍');
    expect(emojiFor('Graham crackers', 'snacks')).toBe('🥨');
    expect(emojiFor('Popcorn', 'snacks')).toBe('🍿');
  });

  it('falls back to the category glyph', () => {
    expect(emojiFor('Mystery jar', 'other')).toBe('📦');
    expect(emojiFor('Kombucha', 'drinks')).toBe('🥤');
  });
});
