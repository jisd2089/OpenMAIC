export type SemanticSearchMode = 'disabled' | 'fallback' | 'provider';

export interface EmbeddingProvider {
  mode: SemanticSearchMode;
  isAvailable(): boolean;
  scoreSimilarityBatch(query: string, documents: string[]): Promise<number[]>;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      (value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((token) => token.length > 1),
    ),
  );
}

function toCharacterTrigrams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 3) return new Set(normalized ? [normalized] : []);

  const trigrams = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    trigrams.add(normalized.slice(index, index + 3));
  }
  return trigrams;
}

function computeSetSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function computeSemanticFallbackScore(query: string, document: string): number {
  const trimmedQuery = query.trim();
  const trimmedDocument = document.trim();
  if (!trimmedQuery || !trimmedDocument) return 0;

  const tokenScore = computeSetSimilarity(new Set(tokenize(trimmedQuery)), new Set(tokenize(trimmedDocument)));
  const trigramScore = computeSetSimilarity(
    toCharacterTrigrams(trimmedQuery),
    toCharacterTrigrams(trimmedDocument),
  );
  const prefixBonus = trimmedDocument.toLowerCase().includes(trimmedQuery.toLowerCase()) ? 0.08 : 0;

  return clamp01(tokenScore * 0.6 + trigramScore * 0.4 + prefixBonus);
}

class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly mode = 'disabled' as const;

  isAvailable(): boolean {
    return false;
  }

  async scoreSimilarityBatch(_query: string, documents: string[]): Promise<number[]> {
    return documents.map(() => 0);
  }
}

class UnavailableProviderEmbeddingProvider implements EmbeddingProvider {
  readonly mode = 'provider' as const;

  isAvailable(): boolean {
    return false;
  }

  async scoreSimilarityBatch(_query: string, documents: string[]): Promise<number[]> {
    return documents.map(() => 0);
  }
}

class FallbackEmbeddingProvider implements EmbeddingProvider {
  readonly mode = 'fallback' as const;

  isAvailable(): boolean {
    return true;
  }

  async scoreSimilarityBatch(query: string, documents: string[]): Promise<number[]> {
    return documents.map((document) => computeSemanticFallbackScore(query, document));
  }
}

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (provider) return provider;

  const mode = (process.env.SEARCH_SEMANTIC_MODE || 'fallback').toLowerCase();
  if (mode === 'disabled') {
    provider = new DisabledEmbeddingProvider();
    return provider;
  }
  if (mode === 'provider') {
    provider = new UnavailableProviderEmbeddingProvider();
    return provider;
  }

  provider = new FallbackEmbeddingProvider();
  return provider;
}
