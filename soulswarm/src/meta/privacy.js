// Privacy and consent (Update 14, GDD §19): the neutral age gate's band, the consent choices, and what each allows.
// Profile block: p.privacy = { id, birthYear, band: '' | 'child' | 'teen' | 'adult', eu, consent: { analytics, ads }, asked, at }.
//   id: a random player ID (Settings → Privacy shows it; support and data requests use it)
//   birthYear: what the gate was told (kept on the device only; never sent)
//   asked: the policy version the consent sheet was last answered for (0: never)
import { PRIVACY } from '../game/data.js';
import { now as clockNow } from './clock.js';

/** A random player ID (not derived from the device), e.g. "ss-7f3a9c2e41b8". */
export function newPlayerId() {
  const b = new Uint8Array(6);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 6; i++) b[i] = Math.floor(Math.random() * 256); }
  return 'ss-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const blankPrivacy = () => ({ id: newPlayerId(), birthYear: 0, band: '', eu: false, consent: { analytics: false, ads: false }, asked: 0, at: 0 });

/** The EU / EEA / UK guess for the stricter consent age: the device's time zone (no location is read). */
export function guessEU() {
  try { return /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch (e) { return false; }
}

/** The youngest the player can be from a birth year alone (a year asked without a month rounds down). */
export const ageFrom = (birthYear, t = clockNow()) => new Date(t).getFullYear() - birthYear - 1;

/** The band for an age: child (under 13), teen (under 18), adult. */
export const bandFor = (age) => (age < PRIVACY.minAge ? 'child' : age < PRIVACY.adultAge ? 'teen' : 'adult');

/** The years the gate offers, newest first (no default: a neutral gate does not suggest an answer). */
export function gateYears(t = clockNow()) {
  const y = new Date(t).getFullYear(), out = [];
  for (let i = 0; i <= PRIVACY.oldest; i++) out.push(y - i);
  return out;
}

export const needsGate = (p) => !p.privacy || !p.privacy.band;

/** Records the gate's answer and settles what the band can never allow. Returns the band. */
export function answerGate(p, birthYear, eu = guessEU()) {
  const P = p.privacy || (p.privacy = blankPrivacy());
  P.birthYear = birthYear; P.eu = !!eu; P.band = bandFor(ageFrom(birthYear)); P.at = clockNow();
  if (!canAskAnalytics(p)) P.consent.analytics = false;
  if (!canAskAds(p)) P.consent.ads = false;
  if (!canAskAnalytics(p) && !canAskAds(p)) P.asked = PRIVACY.version; // nothing to ask a child, or an EU teen
  return P.band;
}

/** May the consent sheet offer analytics / personalised ads to this player at all? */
export const canAskAnalytics = (p) => { const P = p.privacy; return !!P && (P.band === 'adult' || (P.band === 'teen' && !(P.eu && ageFrom(P.birthYear) < PRIVACY.euConsentAge))); };
export const canAskAds = (p) => !!p.privacy && p.privacy.band === 'adult';

/** The consent sheet is due: the gate is answered and the current policy has not been (and there is something to ask). */
export const needsConsent = (p) => !needsGate(p) && p.privacy.asked < PRIVACY.version && (canAskAnalytics(p) || canAskAds(p));

/** Stores the player's choices (only what the band allows). */
export function setConsent(p, { analytics, ads }) {
  const P = p.privacy;
  if (analytics !== undefined) P.consent.analytics = !!analytics && canAskAnalytics(p);
  if (ads !== undefined) P.consent.ads = !!ads && canAskAds(p);
  P.asked = PRIVACY.version; P.at = clockNow();
}

export const canTrack = (p) => !!(p.privacy && p.privacy.consent.analytics && canAskAnalytics(p));
export const adsPersonalised = (p) => !!(p.privacy && p.privacy.consent.ads && canAskAds(p));
/** Purchases are off for children (restricted mode); everyone else buys as before. */
export const canPurchase = (p) => !(p.privacy && p.privacy.band === 'child');

/** A teen's monthly spending limit in USD (PRIVACY.spendCaps: under 16 $50, 16–17 $100), or Infinity. */
export function spendCap(p) {
  const P = p.privacy;
  if (!P || P.band !== 'teen') return Infinity;
  const age = ageFrom(P.birthYear), cap = PRIVACY.spendCaps.find(([under]) => age < under);
  return cap ? cap[1] : Infinity;
}
/** List-price USD spent this calendar month (purchase history). */
export function spentThisMonth(p, t = clockNow()) {
  const d = new Date(t), m = d.getMonth(), y = d.getFullYear();
  return (p.purchases.history || []).reduce((a, h) => { const e = new Date(h.t); return a + (e.getMonth() === m && e.getFullYear() === y ? +h.price || 0 : 0); }, 0);
}
/** Why a purchase of `price` USD is refused ('age' | 'cap'), or '' when it may go ahead. */
export function purchaseBlock(p, price) {
  if (!canPurchase(p)) return 'age';
  return spentThisMonth(p) + price > spendCap(p) + 1e-6 ? 'cap' : '';
}

/** Coerces a loaded block (save.js). */
export function sanitizePrivacy(v) {
  const d = blankPrivacy();
  if (!v || typeof v !== 'object') return d;
  const year = Math.floor(+v.birthYear), known = Number.isFinite(year) && year > 1800 && year < 3000 && !!v.band;
  const out = {
    id: typeof v.id === 'string' && /^ss-[0-9a-f]{12}$/.test(v.id) ? v.id : d.id,
    birthYear: known ? year : 0,
    band: known ? bandFor(ageFrom(year)) : '', // from the year each load, so a child's restrictions lift as the years pass
    eu: !!v.eu,
    consent: { analytics: !!(v.consent && v.consent.analytics), ads: !!(v.consent && v.consent.ads) },
    asked: Math.max(0, Math.floor(+v.asked) || 0),
    at: Math.max(0, +v.at || 0),
  };
  const p = { privacy: out }; // what the band no longer (or never) allows is switched off
  if (!canAskAnalytics(p)) out.consent.analytics = false;
  if (!canAskAds(p)) out.consent.ads = false;
  return out;
}
