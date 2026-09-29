import { config } from '@/config';
import { fetchCurrentWeather } from '@/domain/weather';
import type { Enrichers } from './entries';
import { reverseGeocode } from './location';

export const enrichers: Enrichers = {
  geocode: (latitude, longitude) => reverseGeocode(latitude, longitude),
  weather: (latitude, longitude) => fetchCurrentWeather(latitude, longitude, { apiKey: config.weatherApiKey }),
};
