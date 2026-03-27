import path from 'path';
import { promises as fs } from 'fs';
import { DatabaseSync } from 'node:sqlite';

export interface DatabaseClientConfig {
  driver: 'sqlite';
  databasePath: string;
}

export function getDatabaseClientConfig(): DatabaseClientConfig {
  return {
    driver: 'sqlite',
    databasePath: path.join(process.cwd(), 'data', 'app.db'),
  };
}

export type DatabaseSyncLike = {
  exec(sql: string): void;
  close?(): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
};

let db: DatabaseSyncLike | null = null;
let initialized = false;
let fullTextSearchEnabled = false;

function rebuildFullTextIndexes(database: DatabaseSyncLike) {
  database.exec(`
    DELETE FROM knowledge_chunks_fts;
    INSERT INTO knowledge_chunks_fts (
      chunk_id,
      knowledge_file_id,
      knowledge_base_id,
      scope_id,
      text_content
    )
    SELECT id, knowledge_file_id, knowledge_base_id, scope_id, text_content
    FROM knowledge_chunks;

    DELETE FROM memory_notes_fts;
    INSERT INTO memory_notes_fts (
      note_id,
      scope_id,
      category,
      is_pinned,
      content,
      keywords,
      tags
    )
    SELECT
      id,
      scope_id,
      category,
      CAST(is_pinned AS TEXT),
      content,
      keywords_json,
      tags_json
    FROM memory_notes;
  `);
}

function initializeSchema(database: DatabaseSyncLike) {
  if (initialized) return;

  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_scope_slug ON knowledge_bases(scope_id, slug);
    CREATE INDEX IF NOT EXISTS idx_kb_scope_updated ON knowledge_bases(scope_id, updated_at);

    CREATE TABLE IF NOT EXISTS knowledge_files (
      id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      storage_path TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      asset_type TEXT NOT NULL,
      ingest_status TEXT NOT NULL,
      ingest_error TEXT,
      poster_path TEXT,
      duration_ms INTEGER,
      width INTEGER,
      height INTEGER,
      checksum TEXT,
      source_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kf_kb_created ON knowledge_files(knowledge_base_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_kf_scope_type_status ON knowledge_files(scope_id, asset_type, ingest_status);

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      knowledge_file_id TEXT NOT NULL,
      knowledge_base_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      page_no INTEGER,
      text_content TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      token_count INTEGER,
      vector_doc_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kc_file_chunk ON knowledge_chunks(knowledge_file_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_kc_kb_chunk ON knowledge_chunks(knowledge_base_id, chunk_index);

    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      vector_doc_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mem_scope_category_updated ON memory_notes(scope_id, category, updated_at);
    CREATE INDEX IF NOT EXISTS idx_mem_scope_pinned_updated ON memory_notes(scope_id, is_pinned, updated_at);

    CREATE TABLE IF NOT EXISTS generation_context_links (
      id TEXT PRIMARY KEY,
      stage_id TEXT NOT NULL,
      scene_id TEXT,
      knowledge_base_id TEXT,
      knowledge_file_id TEXT,
      knowledge_chunk_id TEXT,
      memory_note_id TEXT,
      link_type TEXT NOT NULL,
      score REAL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gcl_stage_created ON generation_context_links(stage_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_gcl_type_created ON generation_context_links(link_type, created_at);

    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL,
      knowledge_file_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ingest_kb_status_updated ON ingestion_jobs(knowledge_base_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_ingest_file_updated ON ingestion_jobs(knowledge_file_id, updated_at);
  `);

  try {
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        knowledge_file_id UNINDEXED,
        knowledge_base_id UNINDEXED,
        scope_id UNINDEXED,
        text_content,
        tokenize = 'unicode61'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts USING fts5(
        note_id UNINDEXED,
        scope_id UNINDEXED,
        category UNINDEXED,
        is_pinned UNINDEXED,
        content,
        keywords,
        tags,
        tokenize = 'unicode61'
      );
    `);
    rebuildFullTextIndexes(database);
    fullTextSearchEnabled = true;
  } catch (error) {
    fullTextSearchEnabled = false;
    console.warn('SQLite FTS5 initialization failed, falling back to LIKE search.', error);
  }

  initialized = true;
}

export async function ensureDatabaseClient(): Promise<DatabaseSyncLike> {
  if (db) return db;

  const config = getDatabaseClientConfig();
  await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  db = new DatabaseSync(config.databasePath) as DatabaseSyncLike;
  initializeSchema(db);
  return db;
}

export async function getDatabaseClient(): Promise<DatabaseSyncLike> {
  return ensureDatabaseClient();
}

export function isFullTextSearchEnabled(): boolean {
  return fullTextSearchEnabled;
}

export async function resetDatabaseClientForTests(): Promise<void> {
  if (db?.close) {
    db.close();
  }
  db = null;
  initialized = false;
  fullTextSearchEnabled = false;
  await fs.rm(path.join(process.cwd(), 'data'), { recursive: true, force: true }).catch(() => undefined);
}
