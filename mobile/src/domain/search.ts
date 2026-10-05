const MAX_TERMS = 8;

// Words in the query. Case is left to the search index, which folds it the same way it
// folded the notes (lowercasing here would split "İstanbul" into "i" and "stanbul").
// Accent marks stay inside their word, in their composed form.
export function searchTerms(input: string): string[] {
  return (input.normalize('NFC').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? []).slice(0, MAX_TERMS);
}

// Builds an FTS5 query where every word must match, each as a word start, so results
// appear while typing. Returns null when there are no words.
export function buildFtsQuery(input: string): string | null {
  const terms = searchTerms(input);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(' ');
}

// Escapes LIKE wildcards for the fallback search used when FTS5 is not available.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
