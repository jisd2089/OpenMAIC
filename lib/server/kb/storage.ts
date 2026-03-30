import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_SCOPE_ID } from '@/lib/server/db/schema/common';

export const APP_DATA_DIR = path.join(process.cwd(), 'data');
export const KNOWLEDGE_UPLOADS_DIR = path.join(APP_DATA_DIR, 'uploads', 'knowledge');
export const KNOWLEDGE_TRASH_DIR = path.join(APP_DATA_DIR, 'trash', 'knowledge');

export function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'knowledge-base';
}

export function sanitizeFileName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleaned || 'file';
}

export async function ensureKnowledgeStorageDirs(scopeId = DEFAULT_SCOPE_ID, slug?: string) {
  const baseDir = path.join(KNOWLEDGE_UPLOADS_DIR, scopeId);
  await fs.mkdir(baseDir, { recursive: true });
  await fs.mkdir(KNOWLEDGE_TRASH_DIR, { recursive: true });
  if (slug) {
    await fs.mkdir(path.join(baseDir, slug, 'files'), { recursive: true });
    await fs.mkdir(path.join(baseDir, slug, 'posters'), { recursive: true });
  }
}

export function buildKnowledgeBaseRoot(scopeId: string, slug: string): string {
  return path.join(KNOWLEDGE_UPLOADS_DIR, scopeId, slug);
}

export function buildKnowledgeFileDir(scopeId: string, slug: string): string {
  return path.join(buildKnowledgeBaseRoot(scopeId, slug), 'files');
}

export function buildKnowledgePosterDir(scopeId: string, slug: string): string {
  return path.join(buildKnowledgeBaseRoot(scopeId, slug), 'posters');
}

export function toRelativeDataPath(absolutePath: string): string {
  const relative = path.relative(APP_DATA_DIR, absolutePath);
  return relative.split(path.sep).join('/');
}

export function toAbsoluteDataPath(relativePath: string): string {
  return path.join(APP_DATA_DIR, relativePath);
}

export async function moveKnowledgeBaseToTrash(scopeId: string, slug: string, id: string) {
  const source = buildKnowledgeBaseRoot(scopeId, slug);
  const target = path.join(KNOWLEDGE_TRASH_DIR, `${slug}-${id}-${Date.now()}`);
  await fs.mkdir(KNOWLEDGE_TRASH_DIR, { recursive: true });
  await fs.rename(source, target);
}
