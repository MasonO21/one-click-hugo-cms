export interface AddressLike {
  name: string | null;
  street: string | null;
  streetNumber: string | null;
  district: string | null;
  city: string | null;
  subregion: string | null;
  region: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Geocoders often return a street address as the "name". A park or trailhead name is
// more useful, so only keep the name when it is not just the address.
function isStreetAddress(address: AddressLike, name: string): boolean {
  if (/^\d/.test(name)) return true;
  const street = clean(address.street);
  if (street && name.toLowerCase() === street.toLowerCase()) return true;
  const number = clean(address.streetNumber);
  return Boolean(street && number && name.toLowerCase() === `${number} ${street}`.toLowerCase());
}

export function describePlace(addresses: AddressLike[] | null | undefined): string | null {
  const address = addresses?.[0];
  if (!address) return null;

  const name = clean(address.name);
  const city = clean(address.city) ?? clean(address.subregion);
  const district = clean(address.district);
  const region = clean(address.region);

  const primary = (name && !isStreetAddress(address, name) ? name : null) ?? district ?? city ?? region;
  if (!primary) return null;

  const secondary = [city, region].find((part) => part && part.toLowerCase() !== primary.toLowerCase());
  return secondary ? `${primary}, ${secondary}` : primary;
}
