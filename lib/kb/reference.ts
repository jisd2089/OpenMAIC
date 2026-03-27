const KNOWLEDGE_MEDIA_PREFIX = 'knowledge://';

export interface KnowledgeVideoReference {
  fileId: string;
  filename: string;
  src: string;
  poster?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  score?: number;
}

export function buildKnowledgeMediaReference(fileId: string): string {
  return `${KNOWLEDGE_MEDIA_PREFIX}${fileId}`;
}

export function isKnowledgeMediaReference(src: string): boolean {
  return typeof src === 'string' && src.startsWith(KNOWLEDGE_MEDIA_PREFIX);
}

export function parseKnowledgeMediaFileId(src: string): string | null {
  if (!isKnowledgeMediaReference(src)) return null;
  const fileId = src.slice(KNOWLEDGE_MEDIA_PREFIX.length).trim();
  return fileId || null;
}

export function getKnowledgeMediaContentPath(fileId: string): string {
  return `/api/kb/files/${fileId}/content`;
}

export function getKnowledgeMediaPosterPath(fileId: string): string {
  return `/api/kb/files/${fileId}/poster`;
}

export function resolveKnowledgeMediaSrc(src: string): string {
  const fileId = parseKnowledgeMediaFileId(src);
  return fileId ? getKnowledgeMediaContentPath(fileId) : src;
}

export function resolveKnowledgeMediaPoster(src: string, poster?: string): string | undefined {
  if (poster) return poster;
  const fileId = parseKnowledgeMediaFileId(src);
  return fileId ? getKnowledgeMediaPosterPath(fileId) : undefined;
}
