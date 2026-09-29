import {
  buildWeatherUrl,
  fetchCurrentWeather,
  parseWeatherResponse,
  roundForWeather,
  weatherLabel,
  weatherSearchTerms,
} from '@/domain/weather';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body }) as unknown as Promise<Response>;

describe('weather labels', () => {
  it.each([
    [0, 'Clear'],
    [2, 'Partly cloudy'],
    [3, 'Overcast'],
    [45, 'Foggy'],
    [53, 'Drizzle'],
    [63, 'Rain'],
    [73, 'Snow'],
    [81, 'Showers'],
    [86, 'Snow showers'],
    [95, 'Thunderstorm'],
  ])('code %i is %s', (code, label) => {
    expect(weatherLabel(code)).toBe(label);
  });

  it('returns null for unknown or missing codes', () => {
    expect(weatherLabel(4)).toBeNull();
    expect(weatherLabel(null)).toBeNull();
    expect(weatherLabel(undefined)).toBeNull();
    expect(weatherLabel(2.5)).toBeNull();
  });

  it('adds words people search for', () => {
    expect(weatherSearchTerms(63)).toContain('rainy');
    expect(weatherSearchTerms(45)).toContain('foggy');
    expect(weatherSearchTerms(null)).toBe('');
  });
});

describe('buildWeatherUrl', () => {
  it('rounds coordinates to about 11 km before they leave the device', () => {
    expect(roundForWeather(40.0187)).toBe(40);
    expect(roundForWeather(-105.2747)).toBe(-105.3);
    const url = new URL(buildWeatherUrl(40.0187, -105.2747));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.pathname).toBe('/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('40.0');
    expect(url.searchParams.get('longitude')).toBe('-105.3');
    expect(url.searchParams.get('current')).toBe('temperature_2m,weather_code');
  });

  it('uses the paid host when an API key is set', () => {
    const url = new URL(buildWeatherUrl(1, 2, { apiKey: 'secret' }));
    expect(url.origin).toBe('https://customer-api.open-meteo.com');
    expect(url.searchParams.get('apikey')).toBe('secret');
  });
});

describe('parseWeatherResponse', () => {
  it('reads temperature and code', () => {
    expect(parseWeatherResponse({ current: { temperature_2m: 8.94, weather_code: 3 } })).toEqual({ tempC: 8.9, code: 3 });
  });

  it.each([null, {}, { current: {} }, { current: { temperature_2m: '9', weather_code: 3 } }, { current: { temperature_2m: 9, weather_code: 1.5 } }])(
    'rejects %j',
    (body) => {
      expect(() => parseWeatherResponse(body)).toThrow('Unexpected weather response');
    },
  );
});

describe('fetchCurrentWeather', () => {
  afterEach(() => jest.useRealTimers());

  it('returns parsed weather', async () => {
    const fetchImpl = jest.fn(() => ok({ current: { temperature_2m: 12, weather_code: 0 } }));
    await expect(fetchCurrentWeather(40, -105, { fetchImpl: fetchImpl as never })).resolves.toEqual({ tempC: 12, code: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails on a non-OK response', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 429 }) as unknown as Promise<Response>);
    await expect(fetchCurrentWeather(40, -105, { fetchImpl: fetchImpl as never })).rejects.toThrow('429');
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = fetchCurrentWeather(40, -105, { fetchImpl: fetchImpl as never, timeoutMs: 5000 });
    const assertion = expect(pending).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
