import { randomUUID, createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { ASR_PROVIDERS } from '@/lib/audio/constants';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import type { ASRModelConfig, ASRProviderId } from '@/lib/audio/types';
import {
  createKnowledgeBaseSchema,
  listKnowledgeBasesQuerySchema,
  updateKnowledgeBaseSchema,
  listKnowledgeFilesQuerySchema,
  searchKnowledgeBaseSchema,
} from './contracts';
import type {
  KnowledgeBaseSummary,
  KnowledgeFileSummary,
  KnowledgeSearchItem,
  PaginatedResponse,
} from './contracts';
import { z } from 'zod';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import {
  getDatabaseClient,
  isFullTextSearchEnabled,
  type DatabaseSyncLike,
} from '@/lib/server/db/client';
import type { KnowledgeFileRow } from '@/lib/server/db/schema/knowledge';
import { DEFAULT_SCOPE_ID } from '@/lib/server/db/schema/common';
import {
  buildKnowledgeFileDir,
  buildKnowledgeBaseRoot,
  buildKnowledgePosterDir,
  ensureKnowledgeStorageDirs,
  moveKnowledgeBaseToTrash,
  sanitizeFileName,
  slugifyName,
  toAbsoluteDataPath,
  toRelativeDataPath,
} from '@/lib/server/kb/storage';
import { buildFileResponse } from '@/lib/server/file-response';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import type { PDFParserConfig } from '@/lib/pdf/types';
import {
  getServerASRProviders,
  getServerPDFProviders,
  resolveASRApiKey,
  resolveASRBaseUrl,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
} from '@/lib/server/provider-config';
import { rerankHybridCandidates } from '@/lib/server/search/hybrid-ranker';
import {
  blendSearchScore,
  buildFtsMatchExpression,
  buildLikePattern,
  computeKeywordMatchScore,
  normalizeFtsRank,
} from '@/lib/server/search/search-utils';
import { ServiceError } from '@/lib/server/service-error';
import {
  extractVideoAudio,
  extractVideoMetadata,
  generateVideoPoster,
} from '@/lib/server/video-processing';

export interface UploadKnowledgeFileInput {
  knowledgeBaseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  assetType?: 'document' | 'image' | 'video';
  autoIngest: boolean;
  file: File;
}

export interface KnowledgeBaseService {
  listKnowledgeBases(
    input: z.infer<typeof listKnowledgeBasesQuerySchema>,
  ): Promise<PaginatedResponse<KnowledgeBaseSummary>>;
  createKnowledgeBase(
    input: z.infer<typeof createKnowledgeBaseSchema>,
  ): Promise<KnowledgeBaseSummary>;
  updateKnowledgeBase(
    id: string,
    input: z.infer<typeof updateKnowledgeBaseSchema>,
  ): Promise<KnowledgeBaseSummary>;
  deleteKnowledgeBase(id: string): Promise<{ id: string }>;
  listKnowledgeFiles(
    knowledgeBaseId: string,
    input: z.infer<typeof listKnowledgeFilesQuerySchema>,
  ): Promise<PaginatedResponse<KnowledgeFileSummary>>;
  uploadKnowledgeFile(input: UploadKnowledgeFileInput): Promise<KnowledgeFileSummary>;
  deleteKnowledgeFile(knowledgeBaseId: string, fileId: string): Promise<{ id: string }>;
  searchKnowledgeBase(
    input: z.infer<typeof searchKnowledgeBaseSchema>,
  ): Promise<{ items: KnowledgeSearchItem[] }>;
  reindexKnowledgeFile(knowledgeBaseId: string, fileId: string): Promise<{ jobId: string }>;
  getKnowledgeFileContent(fileId: string, request: NextRequest): Promise<Response>;
  getKnowledgeFilePoster(fileId: string, request: NextRequest): Promise<Response>;
}

type SqlRow = Record<string, unknown>;

function toKnowledgeBaseSummary(row: SqlRow): KnowledgeBaseSummary {
  return {
    id: String(row.id),
    scopeId: String(row.scope_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description == null ? null : String(row.description),
    status: String(row.status) as KnowledgeBaseSummary['status'],
    fileCount: Number(row.file_count || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toKnowledgeFileSummary(row: SqlRow): KnowledgeFileSummary {
  return {
    id: String(row.id),
    knowledgeBaseId: String(row.knowledge_base_id),
    filename: String(row.filename),
    assetType: String(row.asset_type) as KnowledgeFileSummary['assetType'],
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    ingestStatus: String(row.ingest_status) as KnowledgeFileSummary['ingestStatus'],
    ...(row.poster_path ? { posterUrl: `/api/kb/files/${row.id}/poster` } : {}),
    ...(row.duration_ms != null ? { durationMs: Number(row.duration_ms) } : {}),
    ...(row.width != null ? { width: Number(row.width) } : {}),
    ...(row.height != null ? { height: Number(row.height) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function determineAssetType(
  fileName: string,
  mimeType: string,
  provided?: 'document' | 'image' | 'video',
): 'document' | 'image' | 'video' {
  if (provided) return provided;
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  const ext = path.extname(fileName).toLowerCase();
  if (['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) return 'video';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  return 'document';
}

function supportsTextIndexing(fileName: string, mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  if (mimeType === 'application/pdf') return true;
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return true;
  }
  const ext = path.extname(fileName).toLowerCase();
  return ['.txt', '.md', '.markdown', '.json', '.csv', '.pdf', '.docx', '.pptx', '.xlsx'].includes(ext);
}

function splitIntoChunks(text: string, size = 800, overlap = 120): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + size);
    const slice = normalized.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

type IndexableDocument = {
  text: string;
  pageTexts?: Array<{
    pageNumber: number;
    text: string;
  }>;
};

function buildChunkRecords(document: IndexableDocument): Array<{ text: string; pageNo: number | null }> {
  if (document.pageTexts && document.pageTexts.length > 0) {
    return document.pageTexts.flatMap((page) =>
      splitIntoChunks(page.text).map((text) => ({
        text,
        pageNo: page.pageNumber,
      })),
    );
  }

  return splitIntoChunks(document.text).map((text) => ({
    text,
    pageNo: null,
  }));
}

function normalizeVideoScore(query: string, filename: string): number {
  return blendSearchScore(0, computeKeywordMatchScore(query, filename), {
    ftsWeight: 0,
    keywordWeight: 1,
  });
}

function deleteKnowledgeChunkFtsByFileId(db: DatabaseSyncLike, fileId: string) {
  if (!isFullTextSearchEnabled()) return;
  db.prepare(`DELETE FROM knowledge_chunks_fts WHERE knowledge_file_id = ?`).run(fileId);
}

function deleteKnowledgeChunkFtsByKnowledgeBaseId(db: DatabaseSyncLike, knowledgeBaseId: string) {
  if (!isFullTextSearchEnabled()) return;
  db.prepare(`DELETE FROM knowledge_chunks_fts WHERE knowledge_base_id = ?`).run(knowledgeBaseId);
}

function insertKnowledgeChunkFts(
  db: DatabaseSyncLike,
  input: {
    chunkId: string;
    fileId: string;
    knowledgeBaseId: string;
    scopeId: string;
    text: string;
  },
) {
  if (!isFullTextSearchEnabled()) return;
  db.prepare(
    `INSERT INTO knowledge_chunks_fts (
      chunk_id,
      knowledge_file_id,
      knowledge_base_id,
      scope_id,
      text_content
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(input.chunkId, input.fileId, input.knowledgeBaseId, input.scopeId, input.text);
}

async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

function extractXmlPlainText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTaggedText(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(xml)) !== null) {
    const value = decodeXmlEntities(match[1].replace(/<[^>]+>/g, ' ').trim());
    if (value) results.push(value);
  }

  return results;
}

function sortOpenXmlPartNames(paths: string[]): string[] {
  return [...paths].sort((left, right) => {
    const leftMatch = left.match(/(\d+)(?=\.xml$)/);
    const rightMatch = right.match(/(\d+)(?=\.xml$)/);
    return Number(leftMatch?.[1] || 0) - Number(rightMatch?.[1] || 0);
  });
}

async function readDocxText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const partNames = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  const parts = await Promise.all(
    partNames.map(async (partName) => {
      const file = zip.file(partName);
      return file ? file.async('string') : '';
    }),
  );

  return parts
    .map(extractXmlPlainText)
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

async function readPptxText(filePath: string): Promise<IndexableDocument> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = sortOpenXmlPartNames(
    Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)),
  );

  const pageTexts = await Promise.all(
    slideFiles.map(async (slideFile, index) => {
      const xml = await zip.file(slideFile)?.async('string');
      const texts = xml ? extractTaggedText(xml, 'a:t') : [];
      return {
        pageNumber: index + 1,
        text: texts.join('\n').trim(),
      };
    }),
  );

  return {
    text: pageTexts.map((entry) => entry.text).filter(Boolean).join('\n\n').trim(),
    pageTexts: pageTexts.filter((entry) => entry.text),
  };
}

async function readXlsxText(filePath: string): Promise<IndexableDocument> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml ? extractTaggedText(sharedStringsXml, 't') : [];
  const worksheetFiles = sortOpenXmlPartNames(
    Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)),
  );

  const pageTexts = await Promise.all(
    worksheetFiles.map(async (worksheetFile, index) => {
      const xml = await zip.file(worksheetFile)?.async('string');
      if (!xml) return { pageNumber: index + 1, text: '' };

      const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      const cells: string[] = [];
      let match: RegExpExecArray | null = null;

      while ((match = cellPattern.exec(xml)) !== null) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const isSharedString = /\bt="s"/.test(attrs);
        const inlineTexts = extractTaggedText(body, 't');
        if (inlineTexts.length > 0) {
          cells.push(...inlineTexts);
          continue;
        }

        const valueMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (!valueMatch) continue;
        const rawValue = decodeXmlEntities(valueMatch[1].trim());
        if (!rawValue) continue;

        if (isSharedString) {
          const sharedValue = sharedStrings[Number(rawValue)];
          if (sharedValue) {
            cells.push(sharedValue);
            continue;
          }
        }

        cells.push(rawValue);
      }

      return {
        pageNumber: index + 1,
        text: cells.join('\n').trim(),
      };
    }),
  );

  return {
    text: pageTexts.map((entry) => entry.text).filter(Boolean).join('\n\n').trim(),
    pageTexts: pageTexts.filter((entry) => entry.text),
  };
}

function normalizeSubtitleText(raw: string): string {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/^WEBVTT[\s\S]*?\n\n/i, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(
      /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm,
      '',
    )
    .replace(/\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[.,]\d{3}.*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readVideoSubtitleText(videoPath: string): Promise<string> {
  const parsedPath = path.parse(videoPath);
  const subtitleCandidates = [
    path.join(parsedPath.dir, `${parsedPath.name}.srt`),
    path.join(parsedPath.dir, `${parsedPath.name}.vtt`),
  ];

  for (const candidatePath of subtitleCandidates) {
    try {
      const subtitleText = await fs.readFile(candidatePath, 'utf-8');
      const normalized = normalizeSubtitleText(subtitleText);
      if (normalized) return normalized;
    } catch {}
  }

  return '';
}

function resolveVideoTranscriptionConfig(): ASRModelConfig | null {
  const providers = getServerASRProviders();
  const configuredIds = Object.keys(providers) as ASRProviderId[];

  for (const providerId of configuredIds) {
    if (providerId === 'browser-native') continue;

    const provider = ASR_PROVIDERS[providerId];
    if (!provider) continue;

    const apiKey = resolveASRApiKey(providerId) || undefined;
    if (provider.requiresApiKey && !apiKey) continue;

    return {
      providerId,
      apiKey,
      baseUrl: resolveASRBaseUrl(providerId),
      language: 'auto',
    };
  }

  return null;
}

function normalizeTranscribedText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function transcribeVideoAudioText(videoPath: string): Promise<string> {
  const config = resolveVideoTranscriptionConfig();
  if (!config) return '';

  const tempAudioPath = `${videoPath}.kb-asr.mp3`;
  const extracted = await extractVideoAudio(videoPath, tempAudioPath);
  if (!extracted) return '';

  try {
    const audioBuffer = await fs.readFile(tempAudioPath);
    const result = await transcribeAudio(config, audioBuffer);
    return normalizeTranscribedText(result.text || '');
  } catch {
    return '';
  } finally {
    await fs.unlink(tempAudioPath).catch(() => undefined);
  }
}

async function readVideoSearchText(videoPath: string): Promise<string> {
  const subtitleText = await readVideoSubtitleText(videoPath);
  if (subtitleText) return subtitleText;
  return await transcribeVideoAudioText(videoPath);
}

function resolvePdfParserConfig(): PDFParserConfig {
  const providers = getServerPDFProviders();
  const providerId = providers.mineru ? 'mineru' : 'unpdf';
  return {
    providerId,
    apiKey: resolvePDFApiKey(providerId),
    baseUrl: resolvePDFBaseUrl(providerId),
  };
}

async function readIndexableDocument(
  filePath: string,
  fileName: string,
  mimeType: string,
): Promise<IndexableDocument> {
  if (mimeType === 'application/pdf' || path.extname(fileName).toLowerCase() === '.pdf') {
    const pdfBuffer = await fs.readFile(filePath);
    const parsed = await parsePDF(resolvePdfParserConfig(), pdfBuffer);
    return {
      text: parsed.text?.trim() || '',
      pageTexts: parsed.pageTexts ?? parsed.metadata?.pageTexts,
    };
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    path.extname(fileName).toLowerCase() === '.docx'
  ) {
    return {
      text: await readDocxText(filePath),
    };
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    path.extname(fileName).toLowerCase() === '.pptx'
  ) {
    return readPptxText(filePath);
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    path.extname(fileName).toLowerCase() === '.xlsx'
  ) {
    return readXlsxText(filePath);
  }

  return {
    text: await readTextFile(filePath),
  };
}

class SqliteKnowledgeBaseService implements KnowledgeBaseService {
  async listKnowledgeBases(
    input: z.infer<typeof listKnowledgeBasesQuerySchema>,
  ): Promise<PaginatedResponse<KnowledgeBaseSummary>> {
    const db = await getDatabaseClient();
    const where: string[] = ['scope_id = ?'];
    const params: unknown[] = [input.scopeId];

    if (input.keyword) {
      where.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${input.keyword}%`, `%${input.keyword}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM knowledge_bases ${whereSql}`).get(...params);
    const rows = db
      .prepare(
        `SELECT * FROM knowledge_bases ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, input.pageSize, (input.page - 1) * input.pageSize);

    return {
      items: rows.map(toKnowledgeBaseSummary),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total || 0),
    };
  }

  async createKnowledgeBase(
    input: z.infer<typeof createKnowledgeBaseSchema>,
  ): Promise<KnowledgeBaseSummary> {
    const db = await getDatabaseClient();
    const slug = slugifyName(input.name);
    const exists = db
      .prepare(`SELECT id FROM knowledge_bases WHERE scope_id = ? AND slug = ?`)
      .get(input.scopeId, slug);
    if (exists) {
      throw new ServiceError(API_ERROR_CODES.KB_NAME_CONFLICT, 409, 'Knowledge base name conflicts with existing slug');
    }

    const now = Date.now();
    const id = `kb_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await ensureKnowledgeStorageDirs(input.scopeId, slug);
    db.prepare(
      `INSERT INTO knowledge_bases (id, scope_id, name, slug, description, status, file_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    ).run(id, input.scopeId, input.name, slug, input.description || null, now, now);

    return {
      id,
      scopeId: input.scopeId,
      name: input.name,
      slug,
      description: input.description || null,
      status: 'active',
      fileCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateKnowledgeBase(
    id: string,
    input: z.infer<typeof updateKnowledgeBaseSchema>,
  ): Promise<KnowledgeBaseSummary> {
    const db = await getDatabaseClient();
    const existing = db.prepare(`SELECT * FROM knowledge_bases WHERE id = ?`).get(id);
    if (!existing) {
      throw new ServiceError(API_ERROR_CODES.KB_NOT_FOUND, 404, 'Knowledge base not found');
    }

    const now = Date.now();
    const nextName = input.name ?? String(existing.name);
    const nextDescription =
      input.description === undefined ? existing.description : input.description;
    const nextStatus = input.status ?? String(existing.status);

    db.prepare(
      `UPDATE knowledge_bases SET name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(nextName, nextDescription ?? null, nextStatus, now, id);

    return toKnowledgeBaseSummary({
      ...existing,
      name: nextName,
      description: nextDescription ?? null,
      status: nextStatus,
      updated_at: now,
    });
  }

  async deleteKnowledgeBase(id: string): Promise<{ id: string }> {
    const db = await getDatabaseClient();
    const existing = db.prepare(`SELECT * FROM knowledge_bases WHERE id = ?`).get(id);
    if (!existing) {
      throw new ServiceError(API_ERROR_CODES.KB_NOT_FOUND, 404, 'Knowledge base not found');
    }

    const scopeId = String(existing.scope_id);
    const slug = String(existing.slug);
    const rows = db
      .prepare(`SELECT storage_path, poster_path FROM knowledge_files WHERE knowledge_base_id = ?`)
      .all(id);

    try {
      const root = buildKnowledgeBaseRoot(scopeId, slug);
      await fs.access(root);
      await moveKnowledgeBaseToTrash(scopeId, slug, id);
    } catch {}

    for (const row of rows) {
      const storagePath = row.storage_path ? toAbsoluteDataPath(String(row.storage_path)) : null;
      const posterPath = row.poster_path ? toAbsoluteDataPath(String(row.poster_path)) : null;
      if (storagePath) await fs.rm(storagePath, { force: true }).catch(() => undefined);
      if (posterPath) await fs.rm(posterPath, { force: true }).catch(() => undefined);
    }

    deleteKnowledgeChunkFtsByKnowledgeBaseId(db, id);
    db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?`).run(id);
    db.prepare(`DELETE FROM ingestion_jobs WHERE knowledge_base_id = ?`).run(id);
    db.prepare(`DELETE FROM knowledge_files WHERE knowledge_base_id = ?`).run(id);
    db.prepare(`DELETE FROM knowledge_bases WHERE id = ?`).run(id);
    return { id };
  }

  async listKnowledgeFiles(
    knowledgeBaseId: string,
    input: z.infer<typeof listKnowledgeFilesQuerySchema>,
  ): Promise<PaginatedResponse<KnowledgeFileSummary>> {
    const db = await getDatabaseClient();
    const kb = db.prepare(`SELECT id FROM knowledge_bases WHERE id = ?`).get(knowledgeBaseId);
    if (!kb) {
      throw new ServiceError(API_ERROR_CODES.KB_NOT_FOUND, 404, 'Knowledge base not found');
    }

    const where: string[] = ['knowledge_base_id = ?'];
    const params: unknown[] = [knowledgeBaseId];
    if (input.assetType) {
      where.push('asset_type = ?');
      params.push(input.assetType);
    }
    if (input.ingestStatus) {
      where.push('ingest_status = ?');
      params.push(input.ingestStatus);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM knowledge_files ${whereSql}`).get(...params);
    const rows = db
      .prepare(
        `SELECT * FROM knowledge_files ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, input.pageSize, (input.page - 1) * input.pageSize);

    return {
      items: rows.map(toKnowledgeFileSummary),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total || 0),
    };
  }

  async uploadKnowledgeFile(input: UploadKnowledgeFileInput): Promise<KnowledgeFileSummary> {
    const db = await getDatabaseClient();
    const kb = db
      .prepare(`SELECT * FROM knowledge_bases WHERE id = ?`)
      .get(input.knowledgeBaseId);
    if (!kb) {
      throw new ServiceError(API_ERROR_CODES.KB_NOT_FOUND, 404, 'Knowledge base not found');
    }

    const scopeId = String(kb.scope_id || DEFAULT_SCOPE_ID);
    const slug = String(kb.slug);
    await ensureKnowledgeStorageDirs(scopeId, slug);

    const cleanName = sanitizeFileName(input.fileName);
    const ext = path.extname(cleanName);
    const fileId = `kfile_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const filePath = path.join(buildKnowledgeFileDir(scopeId, slug), `${fileId}${ext}`);
    const bytes = Buffer.from(await input.file.arrayBuffer());
    await fs.writeFile(filePath, bytes);

    const assetType = determineAssetType(cleanName, input.mimeType, input.assetType);
    const now = Date.now();
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const relativePath = toRelativeDataPath(filePath);
    const shouldIndexText = input.autoIngest && supportsTextIndexing(cleanName, input.mimeType);
    const shouldProcessVideo = assetType === 'video';
    const ingestStatus = shouldIndexText || shouldProcessVideo ? 'processing' : 'skipped';

    db.prepare(
      `INSERT INTO knowledge_files (
        id, knowledge_base_id, scope_id, filename, storage_path, mime_type, file_size, asset_type,
        ingest_status, ingest_error, poster_path, duration_ms, width, height, checksum, source_type,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'upload', ?, ?)`,
    ).run(
      fileId,
      input.knowledgeBaseId,
      scopeId,
      cleanName,
      relativePath,
      input.mimeType || 'application/octet-stream',
      input.fileSize,
      assetType,
      ingestStatus,
      checksum,
      now,
      now,
    );

    if (shouldProcessVideo || shouldIndexText) {
      try {
        await this.processKnowledgeFile(
          {
            id: fileId,
            knowledge_base_id: input.knowledgeBaseId,
            scope_id: scopeId,
            filename: cleanName,
            storage_path: relativePath,
            asset_type: assetType,
            poster_path: null,
            duration_ms: null,
            width: null,
            height: null,
          },
          { slug },
        );
      } catch (error) {
        db.prepare(
          `UPDATE knowledge_files SET ingest_status = 'failed', ingest_error = ?, updated_at = ? WHERE id = ?`,
        ).run(error instanceof Error ? error.message : String(error), Date.now(), fileId);
        throw new ServiceError(
          API_ERROR_CODES.KB_INGEST_FAILED,
          500,
          error instanceof Error ? error.message : 'Knowledge file indexing failed',
        );
      }
    }

    db.prepare(
      `UPDATE knowledge_bases SET file_count = (SELECT COUNT(*) FROM knowledge_files WHERE knowledge_base_id = ?), updated_at = ? WHERE id = ?`,
    ).run(input.knowledgeBaseId, now, input.knowledgeBaseId);

    const row = db.prepare(`SELECT * FROM knowledge_files WHERE id = ?`).get(fileId);
    return toKnowledgeFileSummary(row as SqlRow);
  }

  async deleteKnowledgeFile(knowledgeBaseId: string, fileId: string): Promise<{ id: string }> {
    const db = await getDatabaseClient();
    const row = db
      .prepare(`SELECT * FROM knowledge_files WHERE id = ? AND knowledge_base_id = ?`)
      .get(fileId, knowledgeBaseId);
    if (!row) {
      throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file not found');
    }

    const now = Date.now();
    await fs.rm(toAbsoluteDataPath(String(row.storage_path)), { force: true }).catch(() => undefined);
    if (row.poster_path) {
      await fs.rm(toAbsoluteDataPath(String(row.poster_path)), { force: true }).catch(() => undefined);
    }

    deleteKnowledgeChunkFtsByFileId(db, fileId);
    db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_file_id = ?`).run(fileId);
    db.prepare(`DELETE FROM ingestion_jobs WHERE knowledge_file_id = ?`).run(fileId);
    db.prepare(`DELETE FROM knowledge_files WHERE id = ?`).run(fileId);
    db.prepare(
      `UPDATE knowledge_bases SET file_count = (SELECT COUNT(*) FROM knowledge_files WHERE knowledge_base_id = ?), updated_at = ? WHERE id = ?`,
    ).run(knowledgeBaseId, now, knowledgeBaseId);

    return { id: fileId };
  }

  async searchKnowledgeBase(
    input: z.infer<typeof searchKnowledgeBaseSchema>,
  ): Promise<{ items: KnowledgeSearchItem[] }> {
    const db = await getDatabaseClient();
    const items = new Map<string, KnowledgeSearchItem>();
    const placeholders = input.knowledgeBaseIds.map(() => '?').join(', ');
    const targetSize = Math.min(Math.max(input.topK * 4, input.topK), 40);

    if (input.includeVideos) {
      const rows = db
        .prepare(
          `SELECT * FROM knowledge_files
           WHERE knowledge_base_id IN (${placeholders}) AND asset_type = 'video'
           ORDER BY created_at DESC`,
        )
        .all(...input.knowledgeBaseIds);

      for (const row of rows) {
        const score = normalizeVideoScore(input.query, String(row.filename));
        if (score > 0) {
          items.set(`video:${row.id}`, {
            type: 'video',
            fileId: String(row.id),
            knowledgeBaseId: String(row.knowledge_base_id),
            filename: String(row.filename),
            score,
            url: `/api/kb/files/${row.id}/content`,
            ...(row.poster_path ? { posterUrl: `/api/kb/files/${row.id}/poster` } : {}),
            ...(row.duration_ms != null ? { durationMs: Number(row.duration_ms) } : {}),
            ...(row.width != null ? { width: Number(row.width) } : {}),
            ...(row.height != null ? { height: Number(row.height) } : {}),
          });
        }
      }
    }

    if (input.includeDocuments) {
      const ftsMatch = buildFtsMatchExpression(input.query);
      if (isFullTextSearchEnabled() && ftsMatch) {
        const ftsRows = db
          .prepare(
            `SELECT kc.*, bm25(knowledge_chunks_fts) AS fts_rank
             FROM knowledge_chunks_fts
             JOIN knowledge_chunks kc ON kc.id = knowledge_chunks_fts.chunk_id
             WHERE knowledge_chunks_fts MATCH ?
               AND kc.knowledge_base_id IN (${placeholders})
             ORDER BY fts_rank ASC
             LIMIT ?`,
          )
          .all(ftsMatch, ...input.knowledgeBaseIds, targetSize);

        for (const row of ftsRows) {
          const text = String(row.text_content);
          const score = blendSearchScore(
            normalizeFtsRank(row.fts_rank),
            computeKeywordMatchScore(input.query, text),
          );
          if (score <= 0) continue;
          items.set(`chunk:${row.id}`, {
            type: 'chunk',
            fileId: String(row.knowledge_file_id),
            chunkId: String(row.id),
            knowledgeBaseId: String(row.knowledge_base_id),
            score,
            text,
            ...(row.page_no != null ? { pageNo: Number(row.page_no) } : {}),
          });
        }
      }

      if (Array.from(items.values()).filter((item) => item.type === 'chunk').length < input.topK) {
        const chunkRows = db
          .prepare(
            `SELECT * FROM knowledge_chunks
             WHERE knowledge_base_id IN (${placeholders}) AND text_content LIKE ? ESCAPE '!'
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(...input.knowledgeBaseIds, buildLikePattern(input.query), targetSize);

        for (const row of chunkRows) {
          const text = String(row.text_content);
          const score = computeKeywordMatchScore(input.query, text);
          if (score > 0) {
            items.set(`chunk:${row.id}`, {
              type: 'chunk',
              fileId: String(row.knowledge_file_id),
              chunkId: String(row.id),
              knowledgeBaseId: String(row.knowledge_base_id),
              score,
              text,
              ...(row.page_no != null ? { pageNo: Number(row.page_no) } : {}),
            });
          }
        }
      }
    }

    return {
      items: (await rerankHybridCandidates({
        query: input.query,
        candidates: Array.from(items.values()).map((item) => ({
          item,
          text: item.type === 'video' ? item.filename : item.text,
          baseScore: item.score,
          bonus: item.type === 'chunk' ? 0.02 : 0,
        })),
      }))
        .sort((a, b) => b.score - a.score)
        .slice(0, input.topK),
    };
  }

  async reindexKnowledgeFile(knowledgeBaseId: string, fileId: string): Promise<{ jobId: string }> {
    const db = await getDatabaseClient();
    const row = db
      .prepare(`SELECT * FROM knowledge_files WHERE id = ? AND knowledge_base_id = ?`)
      .get(fileId, knowledgeBaseId);
    if (!row) {
      throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file not found');
    }

    const jobId = `ingest_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO ingestion_jobs (id, knowledge_base_id, knowledge_file_id, scope_id, status, stage, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'processing', 'parse', NULL, ?, ?)`,
    ).run(jobId, knowledgeBaseId, fileId, String(row.scope_id), now, now);

    try {
      await this.processKnowledgeFile(row as KnowledgeFileRow & Record<string, unknown>);
      db.prepare(
        `UPDATE ingestion_jobs SET status = 'completed', stage = 'index', updated_at = ? WHERE id = ?`,
      ).run(Date.now(), jobId);
    } catch (error) {
      db.prepare(
        `UPDATE ingestion_jobs SET status = 'failed', message = ?, updated_at = ? WHERE id = ?`,
      ).run(error instanceof Error ? error.message : String(error), Date.now(), jobId);
      throw error;
    }

    return { jobId };
  }

  async getKnowledgeFileContent(fileId: string, request: NextRequest): Promise<Response> {
    const db = await getDatabaseClient();
    const row = db.prepare(`SELECT storage_path FROM knowledge_files WHERE id = ?`).get(fileId);
    if (!row?.storage_path) {
      throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file not found');
    }
    try {
      return await buildFileResponse(request, toAbsoluteDataPath(String(row.storage_path)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file not found');
      }
      throw error;
    }
  }

  async getKnowledgeFilePoster(fileId: string, request: NextRequest): Promise<Response> {
    const db = await getDatabaseClient();
    const row = db.prepare(`SELECT poster_path FROM knowledge_files WHERE id = ?`).get(fileId);
    if (!row?.poster_path) {
      throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file poster not found');
    }
    try {
      return await buildFileResponse(request, toAbsoluteDataPath(String(row.poster_path)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ServiceError(API_ERROR_CODES.KB_FILE_NOT_FOUND, 404, 'Knowledge file poster not found');
      }
      throw error;
    }
  }

  private async processKnowledgeFile(
    row:
      | Pick<
          KnowledgeFileRow,
          'id' | 'knowledgeBaseId' | 'scopeId' | 'storagePath' | 'filename' | 'assetType'
        >
      | Record<string, unknown>,
    options?: { slug?: string },
  ) {
    const assetType = String('assetType' in row ? row.assetType : row.asset_type);
    if (assetType === 'video') {
      await this.refreshVideoKnowledgeFile(row, options);
      return;
    }

    await this.indexKnowledgeFile(row);
  }

  private async refreshVideoKnowledgeFile(
    row:
      | Pick<
          KnowledgeFileRow,
          | 'id'
          | 'knowledgeBaseId'
          | 'scopeId'
          | 'storagePath'
          | 'filename'
          | 'posterPath'
          | 'durationMs'
          | 'width'
          | 'height'
        >
      | Record<string, unknown>,
    options?: { slug?: string },
  ) {
    const db = await getDatabaseClient();
    const id = String(row.id);
    const knowledgeBaseId = String(
      'knowledgeBaseId' in row ? row.knowledgeBaseId : row.knowledge_base_id,
    );
    const scopeId = String('scopeId' in row ? row.scopeId : row.scope_id);
    const storagePath = String('storagePath' in row ? row.storagePath : row.storage_path);
    const existingPosterPath = (
      'posterPath' in row ? row.posterPath : row.poster_path
    ) as string | null | undefined;
    const existingDurationMs = (
      'durationMs' in row ? row.durationMs : row.duration_ms
    ) as number | null | undefined;
    const existingWidth = row.width as number | null | undefined;
    const existingHeight = (
      row.height
    ) as number | null | undefined;
    const absolutePath = toAbsoluteDataPath(storagePath);
    const kbSlug =
      options?.slug ??
      db.prepare(`SELECT slug FROM knowledge_bases WHERE id = ?`).get(knowledgeBaseId)?.slug;
    if (!kbSlug) {
      throw new ServiceError(API_ERROR_CODES.KB_NOT_FOUND, 404, 'Knowledge base not found');
    }

    const metadata = await extractVideoMetadata(absolutePath);
    const posterAbsolutePath = path.join(buildKnowledgePosterDir(scopeId, String(kbSlug)), `${id}.jpg`);
    const posterGenerated = await generateVideoPoster(absolutePath, posterAbsolutePath);
    const posterPath = posterGenerated
      ? toRelativeDataPath(posterAbsolutePath)
      : existingPosterPath ?? null;
    const now = Date.now();

    db.prepare(
      `UPDATE knowledge_files
       SET ingest_status = 'indexed',
           ingest_error = NULL,
           poster_path = ?,
           duration_ms = ?,
           width = ?,
           height = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      posterPath,
      metadata.durationMs ?? existingDurationMs ?? null,
      metadata.width ?? existingWidth ?? null,
      metadata.height ?? existingHeight ?? null,
      now,
      id,
    );

    await this.indexVideoSubtitleTrack({
      id,
      knowledgeBaseId,
      scopeId,
      storagePath,
    });
  }

  private async indexVideoSubtitleTrack(input: {
    id: string;
    knowledgeBaseId: string;
    scopeId: string;
    storagePath: string;
  }) {
    const db = await getDatabaseClient();
    const absolutePath = toAbsoluteDataPath(input.storagePath);
    const subtitleText = await readVideoSearchText(absolutePath);

    deleteKnowledgeChunkFtsByFileId(db, input.id);
    db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_file_id = ?`).run(input.id);

    if (!subtitleText) {
      return;
    }

    const chunks = splitIntoChunks(subtitleText);
    const now = Date.now();
    for (const [index, chunk] of chunks.entries()) {
      const chunkId = `kchunk_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const hash = createHash('sha1').update(chunk).digest('hex');
      db.prepare(
        `INSERT INTO knowledge_chunks (
          id, knowledge_file_id, knowledge_base_id, scope_id, chunk_index, page_no,
          text_content, text_hash, token_count, vector_doc_id, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
      ).run(
        chunkId,
        input.id,
        input.knowledgeBaseId,
        input.scopeId,
        index,
        chunk,
        hash,
        chunk.length,
        now,
      );
      insertKnowledgeChunkFts(db, {
        chunkId,
        fileId: input.id,
        knowledgeBaseId: input.knowledgeBaseId,
        scopeId: input.scopeId,
        text: chunk,
      });
    }
  }

  private async indexKnowledgeFile(
    row:
      | Pick<
          KnowledgeFileRow,
          'id' | 'knowledgeBaseId' | 'scopeId' | 'storagePath' | 'filename' | 'mimeType'
        >
      | Record<string, unknown>,
  ) {
    const db = await getDatabaseClient();
    const id = String(row.id);
    const knowledgeBaseId = String(
      'knowledgeBaseId' in row ? row.knowledgeBaseId : row.knowledge_base_id,
    );
    const scopeId = String('scopeId' in row ? row.scopeId : row.scope_id);
    const storagePath = String('storagePath' in row ? row.storagePath : row.storage_path);
    const filename = String('filename' in row ? row.filename : row.filename);
    const mimeType = String('mimeType' in row ? row.mimeType : row.mime_type || '');

    if (!supportsTextIndexing(filename, mimeType)) {
      db.prepare(
        `UPDATE knowledge_files SET ingest_status = 'skipped', updated_at = ? WHERE id = ?`,
      ).run(Date.now(), id);
      return;
    }

    const absolutePath = toAbsoluteDataPath(storagePath);
    const document = await readIndexableDocument(absolutePath, filename, mimeType);
    const chunks = buildChunkRecords(document);
    const now = Date.now();

    deleteKnowledgeChunkFtsByFileId(db, id);
    db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_file_id = ?`).run(id);
    let index = 0;
    for (const chunk of chunks) {
      const chunkId = `kchunk_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const hash = createHash('sha1').update(chunk.text).digest('hex');
      db.prepare(
        `INSERT INTO knowledge_chunks (
          id, knowledge_file_id, knowledge_base_id, scope_id, chunk_index, page_no,
          text_content, text_hash, token_count, vector_doc_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        chunkId,
        id,
        knowledgeBaseId,
        scopeId,
        index,
        chunk.pageNo,
        chunk.text,
        hash,
        chunk.text.length,
        now,
      );
      insertKnowledgeChunkFts(db, {
        chunkId,
        fileId: id,
        knowledgeBaseId,
        scopeId,
        text: chunk.text,
      });
      index += 1;
    }

    db.prepare(
      `UPDATE knowledge_files SET ingest_status = 'indexed', ingest_error = NULL, updated_at = ? WHERE id = ?`,
    ).run(now, id);
  }
}

const knowledgeBaseService: KnowledgeBaseService = new SqliteKnowledgeBaseService();

export function getKnowledgeBaseService(): KnowledgeBaseService {
  return knowledgeBaseService;
}
