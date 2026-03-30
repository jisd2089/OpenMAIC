const SEARCH_TERM_REGEX = /[\p{L}\p{N}_]+/gu;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function extractSearchTerms(query: string): string[] {
  const matches = query.trim().toLowerCase().match(SEARCH_TERM_REGEX) ?? [];
  return Array.from(new Set(matches.filter(Boolean))).slice(0, 8);
}

export function buildFtsMatchExpression(query: string): string | null {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return null;
  return terms.map((term) => `${term}*`).join(' OR ');
}

export function escapeLikePattern(query: string): string {
  return query.replace(/[!%_]/g, '!$&');
}

export function buildLikePattern(query: string): string {
  return `%${escapeLikePattern(query.trim())}%`;
}

export function normalizeFtsRank(rank: unknown): number {
  const numericRank =
    typeof rank === 'number'
      ? rank
      : typeof rank === 'string'
        ? Number(rank)
        : Number.NaN;

  if (!Number.isFinite(numericRank)) return 0;
  return clamp01(1 / (1 + Math.max(numericRank, 0)));
}

export function computeKeywordMatchScore(query: string, haystack: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();

  if (!normalizedQuery || !normalizedHaystack) return 0;
  if (normalizedHaystack === normalizedQuery) return 1;

  const exactContains = normalizedHaystack.includes(normalizedQuery);
  const terms = extractSearchTerms(normalizedQuery);
  const termHits = terms.filter((term) => normalizedHaystack.includes(term)).length;
  const termCoverage = terms.length > 0 ? termHits / terms.length : 0;
  const coverageScore = termCoverage > 0 ? 0.35 + termCoverage * 0.45 : 0;
  const containsBonus = exactContains ? 0.15 : 0;

  return clamp01(Math.max(coverageScore, containsBonus));
}

export function blendSearchScore(
  ftsScore: number,
  keywordScore: number,
  options?: { keywordWeight?: number; ftsWeight?: number; bonus?: number },
): number {
  const ftsWeight = options?.ftsWeight ?? 0.7;
  const keywordWeight = options?.keywordWeight ?? 0.3;
  const bonus = options?.bonus ?? 0;
  return clamp01(ftsScore * ftsWeight + keywordScore * keywordWeight + bonus);
}
