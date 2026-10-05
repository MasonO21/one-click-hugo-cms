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
  // "12 Main St" or "12B Main St". Names like "4th of July Trailhead" or "14er Basecamp"
  // also start with a digit and are kept.
  if (/^\d+[A-Za-z]?\s/.test(name)) return true;
  const lower = name.toLowerCase();
  const street = clean(address.street)?.toLowerCase();
  if (!street) return false;
  if (lower === street) return true;
  const number = clean(address.streetNumber)?.toLowerCase();
  // House numbers come before the street in some countries and after it in others.
  return Boolean(number && (lower === `${number} ${street}` || lower === `${street} ${number}`));
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
