import { describePlace, type AddressLike } from '@/domain/place';

const base: AddressLike = { name: null, street: null, streetNumber: null, district: null, city: null, subregion: null, region: null };

describe('describePlace', () => {
  it('prefers a park or trailhead name', () => {
    expect(describePlace([{ ...base, name: 'Chautauqua Park', city: 'Boulder', region: 'Colorado' }])).toBe('Chautauqua Park, Boulder');
  });

  it('ignores a name that is only a street address', () => {
    expect(describePlace([{ ...base, name: '900 Baseline Rd', street: 'Baseline Rd', streetNumber: '900', city: 'Boulder', region: 'CO' }])).toBe(
      'Boulder, CO',
    );
    expect(describePlace([{ ...base, name: 'Baseline Rd', street: 'Baseline Rd', city: 'Boulder', region: 'CO' }])).toBe('Boulder, CO');
  });

  it('treats a house number after the street as an address', () => {
    expect(describePlace([{ ...base, name: 'Hauptstraße 5', street: 'Hauptstraße', streetNumber: '5', city: 'Berlin' }])).toBe('Berlin');
  });

  it('ignores a name that is only a house number', () => {
    expect(describePlace([{ ...base, name: '1600', street: 'Baseline Rd', streetNumber: '1600', city: 'Boulder', region: 'Colorado' }])).toBe(
      'Boulder, Colorado',
    );
    expect(describePlace([{ ...base, name: '12-14', city: 'Boulder' }])).toBe('Boulder');
  });

  it('keeps names that start with a number', () => {
    expect(describePlace([{ ...base, name: '4th of July Trailhead', city: 'Nederland', region: 'CO' }])).toBe(
      '4th of July Trailhead, Nederland',
    );
    expect(describePlace([{ ...base, name: '14er Basecamp', city: 'Leadville' }])).toBe('14er Basecamp, Leadville');
  });

  it('falls back to district, city, then region', () => {
    expect(describePlace([{ ...base, district: 'Table Mesa', city: 'Boulder', region: 'CO' }])).toBe('Table Mesa, Boulder');
    expect(describePlace([{ ...base, subregion: 'Boulder County', region: 'CO' }])).toBe('Boulder County, CO');
    expect(describePlace([{ ...base, region: 'Colorado' }])).toBe('Colorado');
  });

  it('does not repeat itself', () => {
    expect(describePlace([{ ...base, name: 'Boulder', city: 'Boulder', region: 'CO' }])).toBe('Boulder, CO');
  });

  it('returns null when there is nothing useful', () => {
    expect(describePlace([])).toBeNull();
    expect(describePlace(null)).toBeNull();
    expect(describePlace([{ ...base, name: '  ' }])).toBeNull();
  });
});
