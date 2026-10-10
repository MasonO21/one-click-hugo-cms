/** Small English helpers for generated copy (scouting reports, "Upgrade all Logging Camps"). */

/** "Razor Crawler" -> "Razor Crawlers", "Heavy Sentry" -> "Heavy Sentries", "Flak Battery" -> "Flak Batteries". */
export function plural(name: string): string {
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  if (/(s|sh|ch|x)$/i.test(name)) return name + (/s$/i.test(name) ? '' : 'es');
  return name + 's';
}
