import { getEmbeddingProvider } from './embedding';

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export interface HybridSearchCandidate<T> {
  item: T;
  text: string;
  baseScore: number;
  bonus?: number;
}

export async function rerankHybridCandidates<T extends { score: number }>(input: {
  query: string;
  candidates: HybridSearchCandidate<T>[];
  keywordWeight?: number;
  semanticWeight?: number;
}): Promise<T[]> {
  if (input.candidates.length === 0) return [];

  const provider = getEmbeddingProvider();
  const semanticScores = provider.isAvailable()
    ? await provider.scoreSimilarityBatch(
        input.query,
        input.candidates.map((candidate) => candidate.text),
      )
    : input.candidates.map(() => 0);

  const keywordWeight = input.keywordWeight ?? 0.75;
  const semanticWeight = provider.isAvailable() ? (input.semanticWeight ?? 0.25) : 0;
  const keywordScale = semanticWeight > 0 ? keywordWeight : 1;

  return input.candidates.map((candidate, index) => {
    const semanticScore = semanticScores[index] ?? 0;
    const score = clamp01(
      candidate.baseScore * keywordScale + semanticScore * semanticWeight + (candidate.bonus ?? 0),
    );
    return {
      ...candidate.item,
      score,
    };
  });
}
