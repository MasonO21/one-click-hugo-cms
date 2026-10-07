import { describe, it, expect } from 'vitest';
import { NAMES } from '../src/data/names';

describe('NAMES data', () => {
  it('should have exactly 160 first names', () => {
    expect(NAMES.first).toHaveLength(160);
  });

  it('should have exactly 130 last names', () => {
    expect(NAMES.last).toHaveLength(130);
  });

  it('should have exactly 70 bios', () => {
    expect(NAMES.bios).toHaveLength(70);
  });

  it('should have no duplicate first names', () => {
    const unique = new Set(NAMES.first);
    expect(unique.size).toBe(NAMES.first.length);
  });

  it('should have no duplicate last names', () => {
    const unique = new Set(NAMES.last);
    expect(unique.size).toBe(NAMES.last.length);
  });

  it('should have no duplicate bios', () => {
    const unique = new Set(NAMES.bios);
    expect(unique.size).toBe(NAMES.bios.length);
  });

  it('should have all first names as non-empty strings', () => {
    NAMES.first.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  it('should have all last names as non-empty strings', () => {
    NAMES.last.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  it('should have all bios containing {name} exactly once', () => {
    NAMES.bios.forEach((bio) => {
      expect(typeof bio).toBe('string');
      const count = (bio.match(/\{name\}/g) || []).length;
      expect(count).toBe(1);
    });
  });

  it('should have all bios between 80-150 characters', () => {
    NAMES.bios.forEach((bio) => {
      expect(bio.length).toBeGreaterThanOrEqual(80);
      expect(bio.length).toBeLessThanOrEqual(150);
    });
  });
});
