import { PRICE_PER_MONTH, TRIAL_SPAN } from '../billing/trial';
import privacy from './privacy.json';
import terms from './terms.json';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export type LegalKey = 'privacy' | 'terms';

export interface LegalContext {
  developer: string;
  email: string;
  price: string;
  trialSpan: string;
}

const RAW: Record<LegalKey, LegalDocument> = { privacy, terms };

export function isLegalKey(key: string | undefined): key is LegalKey {
  return key === 'privacy' || key === 'terms';
}

/** Fills the {{placeholders}} in the bundled policy text. */
export function fillLegal(text: string, ctx: LegalContext): string {
  const contactLine = ctx.email ? `Questions? Email ${ctx.email}.` : 'Questions? Contact us through the app store listing.';
  return text
    .replaceAll('{{developer}}', ctx.developer)
    .replaceAll('{{contactLine}}', contactLine)
    .replaceAll('{{price}}', ctx.price)
    .replaceAll('{{trialSpan}}', ctx.trialSpan);
}

export function legalDocument(key: LegalKey, ctx: Partial<LegalContext> = {}): LegalDocument {
  const full: LegalContext = {
    developer: ctx.developer ?? 'the Fridge Pulse team',
    email: ctx.email ?? '',
    price: ctx.price ?? PRICE_PER_MONTH,
    trialSpan: ctx.trialSpan ?? TRIAL_SPAN,
  };
  const doc = RAW[key];
  const fill = (t: string) => fillLegal(t, full);
  return {
    title: doc.title,
    updated: doc.updated,
    intro: fill(doc.intro),
    sections: doc.sections.map((s) => ({
      heading: s.heading,
      paragraphs: s.paragraphs?.map(fill),
      bullets: s.bullets?.map(fill),
    })),
  };
}
