// Values set at build time through EXPO_PUBLIC_* environment variables.
// See mobile/README.md.

const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? '';

export const config = {
  // Address of the Trail Notes website. Links to the privacy policy and support only
  // appear when this is set.
  siteUrl,
  privacyUrl: siteUrl ? `${siteUrl}/app-privacy/` : '',
  supportUrl: siteUrl ? `${siteUrl}/contact/` : '',
  // Optional paid Open-Meteo key. The free weather API is for non-commercial use only.
  weatherApiKey: process.env.EXPO_PUBLIC_OPEN_METEO_API_KEY || undefined,
} as const;
