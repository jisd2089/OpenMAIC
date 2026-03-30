# OpenMAIC v0.1 数据库与 API 规格

## 1. 范围

本文档定义 `v0.1` 中知识库、记忆和课堂生成接入所需的数据库表结构与 API 规格。

## 2. 数据库规格

### 2.1 `knowledge_bases`

字段：

- `id`: `text` primary key
- `scope_id`: `text` not null
- `name`: `text` not null
- `slug`: `text` not null
- `description`: `text` null
- `status`: `text` not null
- `file_count`: `integer` not null default `0`
- `created_at`: `integer` not null
- `updated_at`: `integer` not null

索引：

- unique `(scope_id, slug)`
- index `(scope_id, updated_at)`

### 2.2 `knowledge_files`

字段：

- `id`: `text` primary key
- `knowledge_base_id`: `text` not null
- `scope_id`: `text` not null
- `filename`: `text` not null
- `storage_path`: `text` not null
- `mime_type`: `text` not null
- `file_size`: `integer` not null
- `asset_type`: `text` not null
- `ingest_status`: `text` not null
- `ingest_error`: `text` null
- `poster_path`: `text` null
- `duration_ms`: `integer` null
- `width`: `integer` null
- `height`: `integer` null
- `checksum`: `text` null
- `source_type`: `text` not null
- `created_at`: `integer` not null
- `updated_at`: `integer` not null

索引：

- unique `storage_path`
- index `(knowledge_base_id, created_at)`
- index `(scope_id, asset_type, ingest_status)`

### 2.3 `knowledge_chunks`

字段：

- `id`: `text` primary key
- `knowledge_file_id`: `text` not null
- `knowledge_base_id`: `text` not null
- `scope_id`: `text` not null
- `chunk_index`: `integer` not null
- `page_no`: `integer` null
- `text_content`: `text` not null
- `text_hash`: `text` not null
- `token_count`: `integer` null
- `vector_doc_id`: `text` null
- `created_at`: `integer` not null

索引：

- unique `(knowledge_file_id, chunk_index)`
- index `(knowledge_base_id, chunk_index)`

### 2.4 `memory_notes`

字段：

- `id`: `text` primary key
- `scope_id`: `text` not null
- `content`: `text` not null
- `category`: `text` not null
- `keywords_json`: `text` not null
- `tags_json`: `text` not null
- `metadata_json`: `text` not null
- `mime_type`: `text` not null
- `source_type`: `text` not null
- `source_ref_id`: `text` null
- `is_pinned`: `integer` not null default `0`
- `vector_doc_id`: `text` null
- `created_at`: `integer` not null
- `updated_at`: `integer` not null

索引：

- index `(scope_id, category, updated_at)`
- index `(scope_id, is_pinned, updated_at)`

### 2.5 `generation_context_links`

字段：

- `id`: `text` primary key
- `stage_id`: `text` not null
- `scene_id`: `text` null
- `knowledge_base_id`: `text` null
- `knowledge_file_id`: `text` null
- `knowledge_chunk_id`: `text` null
- `memory_note_id`: `text` null
- `link_type`: `text` not null
- `score`: `real` null
- `created_at`: `integer` not null

### 2.6 `ingestion_jobs`

字段：

- `id`: `text` primary key
- `knowledge_base_id`: `text` not null
- `knowledge_file_id`: `text` not null
- `scope_id`: `text` not null
- `status`: `text` not null
- `stage`: `text` not null
- `message`: `text` null
- `created_at`: `integer` not null
- `updated_at`: `integer` not null

## 3. 向量存储规格

### 3.1 LanceDB `knowledge_chunks`

字段：

- `id`
- `scope_id`
- `source_id`
- `knowledge_base_id`
- `knowledge_file_id`
- `chunk_index`
- `text`
- `metadata_json`
- `created_at`
- `vector`

### 3.2 LanceDB `memory_notes`

字段：

- `id`
- `scope_id`
- `source_id`
- `category`
- `text`
- `metadata_json`
- `created_at`
- `vector`

## 4. API 规格

### 4.1 知识库接口

- `POST /api/kb`: 创建知识库
- `GET /api/kb`: 列表查询知识库
- `PATCH /api/kb/:id`: 更新知识库
- `DELETE /api/kb/:id`: 删除知识库
- `POST /api/kb/:id/files`: 上传知识库文件
- `GET /api/kb/:id/files`: 查询知识库文件
- `DELETE /api/kb/:id/files/:fileId`: 删除知识库文件
- `POST /api/kb/:id/files/:fileId/reindex`: 重建索引
- `POST /api/kb/search`: 检索知识库
- `GET /api/kb/files/:fileId/content`: 读取文件内容
- `GET /api/kb/files/:fileId/poster`: 读取视频封面

### 4.2 记忆接口

- `POST /api/memory`: 创建记忆
- `GET /api/memory`: 查询记忆列表
- `GET /api/memory/:id`: 查询记忆详情
- `PATCH /api/memory/:id`: 更新记忆
- `DELETE /api/memory/:id`: 删除记忆
- `POST /api/memory/search`: 检索记忆
- `POST /api/memory/from-stage`: 从课堂结果沉淀记忆

### 4.3 课堂生成扩展字段

以下接口请求体新增：

- `knowledgeBaseIds: string[]`
- `memoryIds?: string[]`
- `enableKnowledgeRetrieval?: boolean`
- `enableMemoryRetrieval?: boolean`
- `preferKnowledgeVideos?: boolean`

建议同步扩展：

- `/api/generate/scene-outlines-stream`
- `/api/generate/classroom`

## 5. 统一约束

- 所有时间字段使用 Unix 毫秒时间戳
- 所有列表接口返回 `items/page/pageSize/total`
- 所有文件路径在数据库中存相对路径
- 所有视频访问接口需支持 `Range` 请求
- 业务真值以 SQLite 为准，LanceDB 仅用于向量检索

## 6. 错误码

- `KB_NOT_FOUND`
- `KB_NAME_CONFLICT`
- `KB_FILE_NOT_FOUND`
- `KB_FILE_TOO_LARGE`
- `KB_FILE_TYPE_UNSUPPORTED`
- `KB_INGEST_FAILED`
- `MEMORY_NOT_FOUND`
- `MEMORY_CATEGORY_INVALID`
- `GENERATION_CONTEXT_INVALID`
