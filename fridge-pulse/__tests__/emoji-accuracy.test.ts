import { emojiFor } from '../src/components/categories';
import { FOOD_CASES } from '../test-utils/foodCases';

describe('food glyphs match the food', () => {
  it.each(FOOD_CASES)('%s (%s) shows %s', (name, category, expected) => {
    expect(emojiFor(name, category)).toBe(expected);
  });

  it('falls back to a sensible category glyph for unknown foods', () => {
    expect(emojiFor('Mystery item', 'other')).toBe('📦');
    expect(emojiFor('Fancy chutney', 'condiments')).toBe('🧂');
    expect(emojiFor('Kombucha', 'drinks')).toBe('🥤');
  });
});
