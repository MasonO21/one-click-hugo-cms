export interface Weather {
  tempC: number;
  code: number;
}

interface WeatherEntry {
  label: string;
  // Extra words people search for ("rainy" should find "Rain").
  terms: string;
}

// WMO weather interpretation codes, as returned by Open-Meteo.
function lookup(code: number): WeatherEntry | null {
  if (!Number.isInteger(code)) return null;
  if (code === 0) return { label: 'Clear', terms: 'clear sunny sun' };
  if (code === 1) return { label: 'Mostly clear', terms: 'clear sunny sun' };
  if (code === 2) return { label: 'Partly cloudy', terms: 'cloudy clouds' };
  if (code === 3) return { label: 'Overcast', terms: 'cloudy clouds grey gray' };
  if (code === 45 || code === 48) return { label: 'Foggy', terms: 'fog foggy mist misty' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', terms: 'drizzle rain rainy wet' };
  if (code >= 61 && code <= 67) return { label: 'Rain', terms: 'rain rainy wet' };
  if (code >= 71 && code <= 77) return { label: 'Snow', terms: 'snow snowy' };
  if (code >= 80 && code <= 82) return { label: 'Showers', terms: 'showers rain rainy wet' };
  if (code === 85 || code === 86) return { label: 'Snow showers', terms: 'snow snowy showers' };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', terms: 'thunderstorm thunder storm stormy lightning' };
  return null;
}

export function weatherLabel(code: number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  return lookup(code)?.label ?? null;
}

export function weatherSearchTerms(code: number | null | undefined): string {
  if (code === null || code === undefined) return '';
  const entry = lookup(code);
  return entry ? `${entry.label} ${entry.terms}` : '';
}

export interface WeatherConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const FREE_BASE_URL = 'https://api.open-meteo.com';
const PAID_BASE_URL = 'https://customer-api.open-meteo.com';

// Coordinates are rounded to one decimal place (about 11 km) before they leave the
// device. That is plenty for a weather lookup and keeps the exact spot private.
export function roundForWeather(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildWeatherUrl(latitude: number, longitude: number, config: WeatherConfig = {}): string {
  const base = config.baseUrl ?? (config.apiKey ? PAID_BASE_URL : FREE_BASE_URL);
  const params = new URLSearchParams({
    latitude: roundForWeather(latitude).toFixed(1),
    longitude: roundForWeather(longitude).toFixed(1),
    current: 'temperature_2m,weather_code',
    timezone: 'auto',
  });
  if (config.apiKey) params.set('apikey', config.apiKey);
  return `${base}/v1/forecast?${params.toString()}`;
}

export function parseWeatherResponse(body: unknown): Weather {
  const current = (body as { current?: { temperature_2m?: unknown; weather_code?: unknown } } | null)?.current;
  const temp = current?.temperature_2m;
  const code = current?.weather_code;
  if (typeof temp !== 'number' || !Number.isFinite(temp) || typeof code !== 'number' || !Number.isInteger(code)) {
    throw new Error('Unexpected weather response');
  }
  return { tempC: Math.round(temp * 10) / 10, code };
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  config: WeatherConfig = {},
): Promise<Weather> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);
  try {
    const response = await fetchImpl(buildWeatherUrl(latitude, longitude, config), { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
    return parseWeatherResponse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
