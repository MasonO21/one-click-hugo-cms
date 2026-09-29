const MAX_TERMS = 8;

export function searchTerms(input: string): string[] {
  return (input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS);
}

// Builds an FTS5 query where every word must match and the last words match as
// prefixes, so results appear while typing. Returns null for empty input.
export function buildFtsQuery(input: string): string | null {
  const terms = searchTerms(input);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(' ');
}

// Escapes LIKE wildcards for the fallback search used when FTS5 is not available.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
