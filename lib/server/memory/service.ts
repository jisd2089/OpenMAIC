import { randomUUID } from 'crypto';
import {
  createMemoryNoteSchema,
  listMemoryNotesQuerySchema,
  updateMemoryNoteSchema,
  searchMemorySchema,
  createMemoryFromStageSchema,
} from './contracts';
import type { MemoryNoteSummary, MemorySearchItem } from './contracts';
import type { PaginatedResponse } from '@/lib/server/kb/contracts';
import { z } from 'zod';
import {
  getDatabaseClient,
  isFullTextSearchEnabled,
  type DatabaseSyncLike,
} from '@/lib/server/db/client';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { rerankHybridCandidates } from '@/lib/server/search/hybrid-ranker';
import {
  blendSearchScore,
  buildFtsMatchExpression,
  buildLikePattern,
  computeKeywordMatchScore,
  normalizeFtsRank,
} from '@/lib/server/search/search-utils';
import { ServiceError } from '@/lib/server/service-error';

function toMemorySummary(row: Record<string, unknown>): MemoryNoteSummary {
  return {
    id: String(row.id),
    scopeId: String(row.scope_id),
    content: String(row.content),
    category: String(row.category) as MemoryNoteSummary['category'],
    keywords: JSON.parse(String(row.keywords_json || '[]')) as string[],
    tags: JSON.parse(String(row.tags_json || '[]')) as string[],
    metadata: JSON.parse(String(row.metadata_json || '{}')) as Record<string, unknown>,
    isPinned: Number(row.is_pinned || 0) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function getMemorySearchBody(row: Pick<MemoryNoteSummary, 'content' | 'keywords' | 'tags'>): string {
  return `${row.content} ${row.keywords.join(' ')} ${row.tags.join(' ')}`.trim();
}

function computeMemoryKeywordScore(query: string, row: MemoryNoteSummary): number {
  return blendSearchScore(0, computeKeywordMatchScore(query, getMemorySearchBody(row)), {
    ftsWeight: 0,
    keywordWeight: 1,
    bonus: row.isPinned ? 0.05 : 0,
  });
}

function upsertMemoryFts(db: DatabaseSyncLike, input: {
  id: string;
  scopeId: string;
  category: string;
  isPinned: boolean;
  content: string;
  keywords: string[];
  tags: string[];
}) {
  if (!isFullTextSearchEnabled()) return;
  db.prepare(`DELETE FROM memory_notes_fts WHERE note_id = ?`).run(input.id);
  db.prepare(
    `INSERT INTO memory_notes_fts (
      note_id,
      scope_id,
      category,
      is_pinned,
      content,
      keywords,
      tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.scopeId,
    input.category,
    input.isPinned ? '1' : '0',
    input.content,
    JSON.stringify(input.keywords),
    JSON.stringify(input.tags),
  );
}

function deleteMemoryFts(db: DatabaseSyncLike, id: string) {
  if (!isFullTextSearchEnabled()) return;
  db.prepare(`DELETE FROM memory_notes_fts WHERE note_id = ?`).run(id);
}

export interface MemoryService {
  listMemoryNotes(
    input: z.infer<typeof listMemoryNotesQuerySchema>,
  ): Promise<PaginatedResponse<MemoryNoteSummary>>;
  createMemoryNote(input: z.infer<typeof createMemoryNoteSchema>): Promise<MemoryNoteSummary>;
  getMemoryNote(id: string): Promise<MemoryNoteSummary>;
  updateMemoryNote(
    id: string,
    input: z.infer<typeof updateMemoryNoteSchema>,
  ): Promise<MemoryNoteSummary>;
  deleteMemoryNote(id: string): Promise<{ id: string }>;
  searchMemory(input: z.infer<typeof searchMemorySchema>): Promise<{ items: MemorySearchItem[] }>;
  createMemoryFromStage(
    input: z.infer<typeof createMemoryFromStageSchema>,
  ): Promise<MemoryNoteSummary>;
}

class SqliteMemoryService implements MemoryService {
  async listMemoryNotes(
    input: z.infer<typeof listMemoryNotesQuerySchema>,
  ): Promise<PaginatedResponse<MemoryNoteSummary>> {
    const db = await getDatabaseClient();
    const where: string[] = ['scope_id = ?'];
    const params: unknown[] = [input.scopeId];
    if (input.category) {
      where.push('category = ?');
      params.push(input.category);
    }
    if (input.keyword) {
      where.push('(content LIKE ? OR keywords_json LIKE ? OR tags_json LIKE ?)');
      params.push(`%${input.keyword}%`, `%${input.keyword}%`, `%${input.keyword}%`);
    }
    if (input.pinnedOnly) {
      where.push('is_pinned = 1');
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM memory_notes ${whereSql}`).get(...params);
    const rows = db
      .prepare(`SELECT * FROM memory_notes ${whereSql} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, input.pageSize, (input.page - 1) * input.pageSize);

    return {
      items: rows.map(toMemorySummary),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totalRow?.total || 0),
    };
  }

  async createMemoryNote(input: z.infer<typeof createMemoryNoteSchema>): Promise<MemoryNoteSummary> {
    const db = await getDatabaseClient();
    const id = `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO memory_notes (
        id, scope_id, content, category, keywords_json, tags_json, metadata_json,
        mime_type, source_type, source_ref_id, is_pinned, vector_doc_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'text/plain', 'manual', NULL, 0, NULL, ?, ?)`,
    ).run(
      id,
      input.scopeId,
      input.content,
      input.category,
      JSON.stringify(input.keywords),
      JSON.stringify(input.tags),
      JSON.stringify(input.metadata),
      now,
      now,
    );

    const summary: MemoryNoteSummary = {
      id,
      scopeId: input.scopeId,
      content: input.content,
      category: input.category,
      keywords: input.keywords,
      tags: input.tags,
      metadata: input.metadata,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };
    upsertMemoryFts(db, summary);
    return summary;
  }

  async getMemoryNote(id: string): Promise<MemoryNoteSummary> {
    const db = await getDatabaseClient();
    const row = db.prepare(`SELECT * FROM memory_notes WHERE id = ?`).get(id);
    if (!row) {
      throw new ServiceError(API_ERROR_CODES.MEMORY_NOT_FOUND, 404, 'Memory note not found');
    }
    return toMemorySummary(row);
  }

  async updateMemoryNote(
    id: string,
    input: z.infer<typeof updateMemoryNoteSchema>,
  ): Promise<MemoryNoteSummary> {
    const db = await getDatabaseClient();
    const row = db.prepare(`SELECT * FROM memory_notes WHERE id = ?`).get(id);
    if (!row) {
      throw new ServiceError(API_ERROR_CODES.MEMORY_NOT_FOUND, 404, 'Memory note not found');
    }

    const current = toMemorySummary(row);
    const updated: MemoryNoteSummary = {
      ...current,
      content: input.content ?? current.content,
      category: input.category ?? current.category,
      keywords: input.keywords ?? current.keywords,
      tags: input.tags ?? current.tags,
      metadata: input.metadata ?? current.metadata,
      isPinned: input.isPinned ?? current.isPinned,
      updatedAt: Date.now(),
    };

    db.prepare(
      `UPDATE memory_notes SET
        content = ?, category = ?, keywords_json = ?, tags_json = ?, metadata_json = ?, is_pinned = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      updated.content,
      updated.category,
      JSON.stringify(updated.keywords),
      JSON.stringify(updated.tags),
      JSON.stringify(updated.metadata),
      updated.isPinned ? 1 : 0,
      updated.updatedAt,
      id,
    );

    upsertMemoryFts(db, updated);
    return updated;
  }

  async deleteMemoryNote(id: string): Promise<{ id: string }> {
    const db = await getDatabaseClient();
    const row = db.prepare(`SELECT id FROM memory_notes WHERE id = ?`).get(id);
    if (!row) {
      throw new ServiceError(API_ERROR_CODES.MEMORY_NOT_FOUND, 404, 'Memory note not found');
    }
    deleteMemoryFts(db, id);
    db.prepare(`DELETE FROM memory_notes WHERE id = ?`).run(id);
    return { id };
  }

  async searchMemory(
    input: z.infer<typeof searchMemorySchema>,
  ): Promise<{ items: MemorySearchItem[] }> {
    const db = await getDatabaseClient();
    const items = new Map<string, MemorySearchItem>();
    const targetSize = Math.min(Math.max(input.topK * 4, input.topK), 40);
    const scopeSql = ` AND mn.scope_id = ?`;
    const categorySql =
      input.categories.length > 0
        ? ` AND mn.category IN (${input.categories.map(() => '?').join(', ')})`
        : '';
    const categoryParams = input.categories.length > 0 ? [...input.categories] : [];
    const ftsMatch = buildFtsMatchExpression(input.query);

    if (isFullTextSearchEnabled() && ftsMatch) {
      const rows = db
        .prepare(
          `SELECT mn.*, bm25(memory_notes_fts, 1.0, 0.7, 0.5) AS fts_rank
           FROM memory_notes_fts
           JOIN memory_notes mn ON mn.id = memory_notes_fts.note_id
           WHERE memory_notes_fts MATCH ?${scopeSql}${categorySql}
           ORDER BY mn.is_pinned DESC, fts_rank ASC, mn.updated_at DESC
           LIMIT ?`,
        )
        .all(ftsMatch, input.scopeId, ...categoryParams, targetSize);

      for (const row of rows) {
        const summary = toMemorySummary(row);
        const score = blendSearchScore(
          normalizeFtsRank(row.fts_rank),
          computeKeywordMatchScore(input.query, getMemorySearchBody(summary)),
          { bonus: summary.isPinned ? 0.05 : 0 },
        );
        if (score <= 0) continue;
        items.set(summary.id, { ...summary, score });
      }
    }

    if (items.size < input.topK) {
      const where: string[] = [
        'scope_id = ?',
        '(content LIKE ? ESCAPE \'!\' OR keywords_json LIKE ? ESCAPE \'!\' OR tags_json LIKE ? ESCAPE \'!\')',
      ];
      const params: unknown[] = [
        input.scopeId,
        buildLikePattern(input.query),
        buildLikePattern(input.query),
        buildLikePattern(input.query),
      ];
      if (input.categories.length > 0) {
        where.push(`category IN (${input.categories.map(() => '?').join(', ')})`);
        params.push(...input.categories);
      }

      const rows = db
        .prepare(
          `SELECT * FROM memory_notes WHERE ${where.join(' AND ')} ORDER BY is_pinned DESC, updated_at DESC LIMIT ?`,
        )
        .all(...params, targetSize);

      for (const row of rows) {
        const summary = toMemorySummary(row);
        const score = computeMemoryKeywordScore(input.query, summary);
        if (score <= 0) continue;
        items.set(summary.id, { ...summary, score });
      }
    }

    const results = (await rerankHybridCandidates({
      query: input.query,
      candidates: Array.from(items.values()).map((item) => ({
        item,
        text: getMemorySearchBody(item),
        baseScore: item.score,
        bonus: item.isPinned ? 0.03 : 0,
      })),
    }))
      .sort((a, b) => b.score - a.score || Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt)
      .slice(0, input.topK);

    return { items: results };
  }

  async createMemoryFromStage(
    input: z.infer<typeof createMemoryFromStageSchema>,
  ): Promise<MemoryNoteSummary> {
    const db = await getDatabaseClient();
    const id = `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = Date.now();
    const metadata = { source: 'stage', stageId: input.stageId };
    db.prepare(
      `INSERT INTO memory_notes (
        id, scope_id, content, category, keywords_json, tags_json, metadata_json,
        mime_type, source_type, source_ref_id, is_pinned, vector_doc_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '[]', '[]', ?, 'text/plain', 'generated_from_stage', ?, 0, NULL, ?, ?)`,
    ).run(id, input.scopeId, input.content, input.category, JSON.stringify(metadata), input.stageId, now, now);

    const summary: MemoryNoteSummary = {
      id,
      scopeId: input.scopeId,
      content: input.content,
      category: input.category,
      keywords: [],
      tags: [],
      metadata,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };
    upsertMemoryFts(db, summary);
    return summary;
  }
}

const memoryService: MemoryService = new SqliteMemoryService();

export function getMemoryService(): MemoryService {
  return memoryService;
}
