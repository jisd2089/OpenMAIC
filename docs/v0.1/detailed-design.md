# OpenMAIC v0.1 详细设计文档

## 1. 设计目标

`v0.1` 详细设计覆盖以下能力：

1. PPT 正文排版修复
2. 知识库模块
3. 记忆模块
4. 知识库视频导入与 PPT 嵌入

设计原则：

- 优先复用现有 OpenMAIC 生成与导出链路
- 参考 `xagent` 的模块边界与隔离思路，但不生搬硬套其完整后端体系
- 在当前 OpenMAIC 以本地/文件系统为主的部署方式下，选择最小可落地方案

## 2. 参考实现提炼

### 2.1 来自 xagent 的可迁移模式

#### 2.1.1 记忆抽象接口

`xagent` 通过 `MemoryStore` 抽象统一了记忆的增删改查与检索接口，便于在：

- 内存存储
- 向量存储
- 降级搜索

之间切换。

参考：

- `D:\Workspace\xagent\src\xagent\core\memory\base.py`

#### 2.1.2 记忆实体标准化

`MemoryNote` 包含：

- content
- keywords
- tags
- category
- timestamp
- mime_type
- metadata

该结构适合直接迁移到 OpenMAIC。

参考：

- `D:\Workspace\xagent\src\xagent\core\memory\core.py`

#### 2.1.3 动态存储与降级

`xagent` 的 `DynamicMemoryStoreManager` 支持：

- 有 embedding 模型时使用向量存储
- 无 embedding 模型时回退到 in-memory / 基础检索

这个思路适合 OpenMAIC `v0.1`。

参考：

- `D:\Workspace\xagent\src\xagent\web\dynamic_memory_store.py`

#### 2.1.4 用户隔离包装层

`xagent` 使用 `UserIsolatedMemoryStore` 在统一存储层外面加隔离过滤器，而不是把用户逻辑散落在业务代码中。

参考：

- `D:\Workspace\xagent\src\xagent\web\user_isolated_memory.py`

#### 2.1.5 上传文件统一元数据登记

`xagent` 使用 `UploadedFile` 统一登记上传文件的：

- file_id
- filename
- storage_path
- mime_type
- file_size

这个模式适合 OpenMAIC 的知识库和视频资产。

参考：

- `D:\Workspace\xagent\src\xagent\web\models\uploaded_file.py`

#### 2.1.6 知识库 collection 化管理

`xagent` 的知识库 API 将资料组织为 collection，并围绕 collection 做：

- 上传
- ingest
- search
- rename
- delete

这是 OpenMAIC `v0.1` 知识库的建议组织方式。

参考：

- `D:\Workspace\xagent\src\xagent\web\api\kb.py`

#### 2.1.7 物理目录同步与安全删除

`xagent` 为知识库目录引入：

- file lock
- move-to-trash

避免并发删除和物理目录误删。

参考：

- `D:\Workspace\xagent\src\xagent\web\kb_physical_sync.py`

### 2.2 OpenMAIC 现有可复用能力

#### 2.2.1 现有视频元素与播放链路

OpenMAIC 已经具备：

- `video` 元素
- 播放动作 `play_video`
- 画布渲染

#### 2.2.2 现有视频导出能力

OpenMAIC 在 PPT 导出时已经支持：

- 读取视频资源
- 转 base64
- 调用 `pptxSlide.addMedia`
- 为视频生成封面

参考：

- `d:\Workspace\OpenMAIC\lib\export\use-export-pptx.ts:951`

#### 2.2.3 现有服务端文件存储方式

OpenMAIC 当前已使用服务端文件系统存储：

- 课堂 JSON
- 生成的媒体文件

参考：

- `d:\Workspace\OpenMAIC\lib\server\classroom-storage.ts`
- `d:\Workspace\OpenMAIC\lib\server\classroom-media-generation.ts`

因此 `v0.1` 设计将沿用文件系统作为主要资产存储介质。

## 3. 总体架构设计

### 3.1 模块划分

`v0.1` 新增以下模块：

- `Knowledge Base`：知识库集合、文件、索引、搜索
- `Memory`：记忆管理、检索、生成接入
- `Asset Registry`：统一管理知识库文件与视频资产
- `Generation Retrieval Layer`：在课堂生成前统一拉取知识库和记忆上下文

### 3.2 逻辑架构

整体流程：

1. 用户上传文件到知识库
2. 文件写入服务端文件系统
3. 元数据写入本地元数据库
4. 文本类文件执行解析与索引
5. 视频类文件提取基础元数据与封面
6. 用户生成课堂时选择知识库与记忆增强
7. 生成链路先执行检索，再把结果拼入 prompt
8. 若命中知识库视频，则在 slide content 中生成 `video` 元素
9. 导出 PPT 时复用既有 `addMedia` 视频嵌入能力

## 4. 存储设计

### 4.1 设计选择

OpenMAIC 当前没有服务端业务数据库。`v0.1` 建议引入：

- 文件资产：文件系统
- 元数据：SQLite
- 向量索引：LanceDB

原因：

- 与 `xagent` 的 collection + vector store 设计一致
- 比继续扩展 IndexedDB 更适合知识库和服务端检索
- 比直接上重型数据库更符合 `v0.1` 成本

### 4.2 目录布局

建议新增数据目录：

```text
data/
  app.db
  uploads/
    knowledge/
      default/
        <kb-slug>/
          files/
          posters/
  lancedb/
    knowledge/
    memory/
  trash/
```

说明：

- `default` 为当前单用户运行时的默认作用域
- 后续可替换为 `user_<id>`

### 4.3 元数据表设计

#### 4.3.1 `knowledge_bases`

字段建议：

- `id`
- `scope_id`
- `name`
- `slug`
- `description`
- `status`
- `file_count`
- `created_at`
- `updated_at`

#### 4.3.2 `knowledge_files`

字段建议：

- `id`
- `knowledge_base_id`
- `filename`
- `storage_path`
- `mime_type`
- `file_size`
- `asset_type`：`document | image | video`
- `ingest_status`
- `poster_path`
- `duration_ms`
- `width`
- `height`
- `created_at`
- `updated_at`

#### 4.3.3 `memory_notes`

字段建议：

- `id`
- `scope_id`
- `content`
- `category`
- `keywords_json`
- `tags_json`
- `metadata_json`
- `mime_type`
- `created_at`
- `updated_at`

#### 4.3.4 `generation_context_links`

用于记录课堂与知识库/记忆的关联。

字段建议：

- `id`
- `stage_id`
- `knowledge_base_id`
- `memory_note_id`
- `link_type`
- `created_at`

## 5. 知识库设计

### 5.1 数据模型

知识库以 collection 为中心组织，每个知识库拥有：

- 元信息
- 文件列表
- 物理目录
- 索引状态

### 5.2 上传流程

上传流程：

1. API 接收文件
2. 校验知识库名称与文件名
3. 写入 `data/uploads/knowledge/default/<kb>/files`
4. 注册 `knowledge_files`
5. 按 MIME type 决定是否执行 ingest

### 5.3 文本 ingest 流程

适用于 PDF、TXT、Markdown。

流程：

1. 提取文本
2. 进行 chunk 切分
3. 生成 embedding
4. 写入 LanceDB knowledge collection
5. 更新 ingest 状态

### 5.4 搜索流程

接口输入：

- query
- selected knowledge bases
- topK

检索策略：

1. 若 embedding 模型可用，执行向量检索
2. 同时执行关键词检索
3. 可选做简单融合排序
4. 返回 topK 结果

`v0.1` 不要求复杂 rerank。

### 5.5 物理目录管理

删除或重命名知识库时，采用参考 `xagent` 的物理同步策略：

- 删除前获取目录锁
- 优先移动到 `trash`
- 异步清理旧目录

这样可避免：

- 并发误删
- 删除失败导致目录半残

## 6. 记忆设计

### 6.1 抽象接口

OpenMAIC 新增 `MemoryStore` 抽象，接口与 `xagent` 保持同类结构：

- `add`
- `get`
- `update`
- `delete`
- `search`
- `list_all`
- `clear`
- `get_stats`

### 6.2 存储实现

`v0.1` 提供两种实现：

1. `SQLiteMemoryStore`
2. `VectorMemoryStore`

组合方式：

- 有 embedding 模型时：`VectorMemoryStore`
- 无 embedding 模型时：回退 `SQLiteMemoryStore` 的关键词搜索

### 6.3 隔离包装层

参考 `xagent` 的 `UserIsolatedMemoryStore`，OpenMAIC 也设计一层 `ScopeIsolatedMemoryStore`：

- 当前以 `scope_id = default` 运行
- 未来若加入登录体系，可切换为 `scope_id = user_<id>`

这样能避免把隔离逻辑散落在 API 内。

### 6.4 记忆来源

`v0.1` 记忆来源包括：

- 用户手动创建
- 从课堂结果中手动沉淀

`v0.1` 不做自动长期记忆抽取。

## 7. 知识库视频设计

### 7.1 视频上传

知识库视频作为 `knowledge_files.asset_type = video` 存储。

上传后执行：

1. MIME type 校验
2. 文件落盘
3. 视频元数据提取
4. 封面图生成
5. 元数据登记

### 7.2 视频元数据提取

建议使用服务端视频探测工具或浏览器兼容方案获取：

- duration
- width
- height
- mime type

若服务端暂不引入 `ffmpeg/ffprobe`，`v0.1` 可以先做：

- 基于扩展名 + MIME 的基础识别
- 封面通过前端预处理或导出时兜底生成

### 7.3 知识库视频在课堂生成中的接入

新增概念：

- `KnowledgeVideoReference`

字段建议：

- `fileId`
- `knowledgeBaseId`
- `url`
- `posterUrl`
- `duration`
- `mimeType`

生成时：

1. 根据大纲和知识库命中结果，选出适合的视频
2. 生成 slide content 时写入 `video` 元素
3. `src` 不再局限于 `gen_vid_*`
4. 增加合法来源：
  - `knowledge://<fileId>`
  - 或解析后的绝对可访问 URL

### 7.4 对现有视频链路的兼容

当前 OpenMAIC 的视频元素主要围绕 AI 生成 placeholder 工作。`v0.1` 需改成“双来源”模型：

- `generated video`
- `knowledge video`

影响点：

- slide content schema
- scene generator
- media resolution
- export pptx
- renderer

## 8. 课堂生成链路设计

### 8.1 新增生成输入

课堂生成接口新增：

- `knowledgeBaseIds`
- `memoryIds`
- `enableKnowledgeRetrieval`
- `enableMemoryRetrieval`

### 8.2 新增检索准备阶段

在 `scene outlines` 或 `scene content` 生成前插入 retrieval preparation：

1. 根据主题检索知识库
2. 根据主题检索记忆
3. 按场景类型筛选素材
4. 构建生成上下文

### 8.3 Prompt 注入策略

知识库与记忆注入 prompt 时分开组织：

- `Knowledge Context`
- `Memory Context`

优先级：

1. 用户明确选择的知识库
2. 相关记忆
3. 模型自身常识

### 8.4 视频选用策略

当场景需要视频时：

1. 先检索知识库是否存在合适视频
2. 若有，则优先复用知识库视频
3. 若无，再走 AI 视频生成

这样可减少：

- 生成成本
- 等待时间
- 内容漂移

## 9. API 设计

### 9.1 知识库 API

建议新增：

- `POST /api/kb`
- `GET /api/kb`
- `PATCH /api/kb/:id`
- `DELETE /api/kb/:id`
- `POST /api/kb/:id/files`
- `GET /api/kb/:id/files`
- `DELETE /api/kb/:id/files/:fileId`
- `POST /api/kb/search`

### 9.2 记忆 API

建议新增：

- `POST /api/memory`
- `GET /api/memory`
- `GET /api/memory/:id`
- `PATCH /api/memory/:id`
- `DELETE /api/memory/:id`
- `POST /api/memory/search`

### 9.3 课堂生成 API 扩展

对以下接口扩展请求体：

- `/api/generate/scene-outlines-stream`
- `/api/generate/scene-content`
- `/api/generate-classroom`

扩展字段：

- `knowledgeBaseIds?: string[]`
- `memoryIds?: string[]`

## 10. 前端设计

### 10.1 新增页面

建议新增：

- `/knowledge`
- `/memory`

### 10.2 知识库页面

包含：

- 知识库列表
- 新建知识库
- 文件上传
- 文件列表
- 视频预览
- 索引状态展示

### 10.3 记忆页面

包含：

- 记忆列表
- 分类筛选
- 标签筛选
- 新增/编辑弹窗
- 查看详情弹窗

### 10.4 课堂生成入口改造

在课堂生成入口增加：

- 知识库选择器
- 记忆选择器
- 开关：是否启用知识增强
- 开关：是否启用记忆增强

## 11. PPT 正文排版修复设计

### 11.1 核心策略

采用“导出前显式测量 + 禁止自动下扩”的组合方案。

### 11.2 设计调整

#### 11.2.1 新增文本测量器

新增导出前文本测量工具，输入：

- HTML content
- width
- font family
- font size
- line height
- paragraph spacing

输出：

- measuredHeight
- overflow flag

#### 11.2.2 修改导出文本策略

导出时：

- 不再依赖 PowerPoint 自动扩框
- 使用测量结果确定 `h`
- 对异常超高文本触发降级策略

#### 11.2.3 bullet 标准化

对导出前 HTML 做 normalize：

- 把伪 bullet 段落识别为标准列表
- 统一缩进和段落规则

## 12. 兼容与迁移设计

### 12.1 当前单用户模式

OpenMAIC 当前无正式登录体系，`v0.1` 默认使用：

- `scope_id = default`

### 12.2 未来多用户兼容

所有新增表和目录必须预留：

- `scope_id`

这样未来接登录体系时无需重做全链路。

### 12.3 历史视频兼容

生成视频与知识库视频需要统一解析器，避免后续导出代码分叉。

## 13. 风险与应对

### 13.1 向量存储接入风险

风险：

- 新增 LanceDB 依赖与部署要求

应对：

- `v0.1` 允许无 embedding 模型时回退全文检索

### 13.2 视频元数据提取风险

风险：

- 服务端视频封面提取依赖额外媒体工具

应对：

- `v0.1` 先允许使用前端封面或导出兜底封面

### 13.3 PPT 测量一致性风险

风险：

- 浏览器测量与 PowerPoint 渲染仍可能存在差异

应对：

- 采用安全边距策略
- 对正文导出增加下边界保护

## 14. 分阶段实现建议

### Phase 1

- PPT 正文导出修复
- 基础知识库元数据与上传

### Phase 2

- 知识库 ingest 与检索
- 记忆 CRUD 与检索

### Phase 3

- 知识库/记忆接入课堂生成
- 知识库视频到 PPT 导出打通

## 15. 交付物

`v0.1` 预期交付：

- 需求文档
- 详细设计文档
- 知识库 API
- 记忆 API
- 知识库与记忆前端页面
- PPT 正文导出修复
- 知识库视频导入与 PPT 嵌入能力


## 16. 框架选型评估

### 16.1 现状复核

OpenMAIC 当前主框架为 `Next.js + React + TypeScript`，并已引入：

- `@langchain/core`
- `@langchain/langgraph`
- `ai`

当前数据持久化模式并不统一：

- 前端编辑态和会话态数据主要保存在 IndexedDB / Dexie
- 服务端课堂与媒体资产主要保存在文件系统和 JSON 文件

这意味着 `v0.1` 若要落地“知识库”和“记忆”，优先缺失的是服务端统一元数据层，而不是单纯缺少某个 RAG 框架。

### 16.2 与 xagent 的结构差异

`xagent` 的知识库和记忆能力依赖于一整套 Python 服务端体系：

- `FastAPI`
- `SQLAlchemy`
- `Alembic`
- `LanceDB`
- 统一的 `MemoryStore` 抽象
- `UserIsolatedMemoryStore` 用户隔离包装
- `UploadedFile` 文件注册模型
- 面向 collection 的知识库 API

其优点在于：

- 记忆抽象边界清晰
- 用户隔离明确
- collection 生命周期管理完整
- 文档 ingest / search 管线成熟

其缺点在于：

- 与 OpenMAIC 的 TypeScript 主栈不一致
- 直接复用会引入双运行时和双迁移体系
- 对 OpenMAIC 的视频资产型知识库需求并非最优贴合

因此 `v0.1` 的设计原则是：

- 借鉴 `xagent` 的分层方式
- 不直接照搬 `xagent` 的 Python 技术栈

### 16.3 知识库框架选项评估

#### 16.3.1 方案 A：直接复用 xagent 技术栈

组合：

- `FastAPI`
- `SQLAlchemy`
- `Alembic`
- `LanceDB`

评估：

- 优点：与 `xagent` 已有能力最接近，collection / ingest / search 能力成熟
- 缺点：与 OpenMAIC 当前 TS 单体结构冲突最大，实施成本和运维成本最高

结论：

- 不作为 `v0.1` 推荐方案

#### 16.3.2 方案 B：TypeScript 原生方案，关系型元数据 + Postgres 向量检索

组合：

- `Drizzle ORM`
- `PostgreSQL`
- `pgvector`
- `@langchain/core` / `@langchain/langgraph`

评估：

- 优点：
  - 与 OpenMAIC 当前 TS 主栈一致
  - 元数据、权限、检索、统计可统一在一个服务端数据层中管理
  - 更适合未来多用户共享知识库和服务端扩展
  - 比 `Prisma + pgvector` 更适合向量检索是一等能力的场景
- 缺点：
  - 需要新增数据库部署要求
  - 对 `v0.1` 来说引入成本高于本地文件 + 本地向量库

结论：

- 若产品方向偏多人协作、服务端共享知识库，此方案为最优默认方案

#### 16.3.3 方案 C：TypeScript 原生方案，SQLite 元数据 + LanceDB 向量检索

组合：

- `Drizzle ORM`
- `SQLite` 或 `libSQL`
- `LanceDB`
- `@langchain/core` / `@langchain/langgraph`

评估：

- 优点：
  - 与 `xagent` 的向量存储思路接近
  - 本地优先，部署成本最低
  - 与当前文件系统资产存储方式兼容度高
  - 更适合 `v0.1` 的单机/轻量部署方式
- 缺点：
  - 元数据与向量索引分属两套存储
  - 后续多人协作和高并发场景下，不如 Postgres 一体化方案

结论：

- 若 `v0.1` 目标是最快落地、单机部署优先，此方案是最现实的落地方案

#### 16.3.4 方案 D：Prisma 作为元数据层

组合：

- `Prisma`
- `SQLite` 或 `PostgreSQL`
- 外挂 `pgvector` / `LanceDB`

评估：

- 优点：
  - 开发体验好
  - 关系模型管理成熟
- 缺点：
  - 对向量类型、索引和相似度查询的贴合度弱于 `Drizzle`
  - 若知识库与记忆是本项目核心能力，则后续原始 SQL 和适配层会更重

结论：

- 不是 `v0.1` 的优先选型

### 16.4 记忆框架选项评估

#### 16.4.1 直接使用 LangGraph Memory

评估：

- 优点：
  - OpenMAIC 已经具备 LangGraph 依赖
  - 适合 agent 线程状态、checkpoint、短中期上下文保存
- 缺点：
  - 不等于完整的“记忆模块”
  - 缺少面向业务的记忆 CRUD、分类、标签、来源追踪、用户隔离管理

结论：

- 适合作为编排层的状态记忆能力
- 不适合作为产品级“记忆中心”的唯一实现

#### 16.4.2 复刻 xagent 的 MemoryStore 抽象到 TypeScript

评估：

- 优点：
  - 结构最清晰
  - 便于统一支持 `in-memory / full-text / vector search`
  - 便于增加用户隔离包装层
  - 与 OpenMAIC 当前技术栈兼容
- 缺点：
  - 需要自行实现一层业务抽象，而不是直接接现成产品

结论：

- 这是 `v0.1` 记忆模块的推荐方案

#### 16.4.3 引入新的 TS Agent Framework 作为 Memory/RAG 总框架

候选方向包括：

- `Mastra`
- 其他带 memory / RAG 封装的 TS Agent 框架

评估：

- 优点：
  - 可能自带 memory / storage / RAG 封装
- 缺点：
  - 会与现有 `AI SDK + LangGraph` 形成第二套运行时抽象
  - 对当前项目属于重构级引入，而非增量增强

结论：

- `v0.1` 不建议引入新的总框架

### 16.5 选型结论

综合评估后，建议如下：

#### 16.5.1 知识库

优先推荐两档方案：

1. 长期最优：
   - `Drizzle + PostgreSQL + pgvector`
2. `v0.1` 最现实：
   - `Drizzle + SQLite/libSQL + LanceDB`

不推荐：

- 直接引入 `xagent` 的 Python 服务栈作为主实现
- 仅依赖前端 IndexedDB 扩展为知识库

#### 16.5.2 记忆

推荐方案：

- TypeScript 自定义 `MemoryStore` 抽象
- 底层复用知识库的元数据层和检索层
- LangGraph 仅承担编排态 memory / checkpoint 职责

不推荐：

- 只使用 LangGraph Memory 代替完整记忆产品
- 为记忆单独引入第二套 agent framework

### 16.6 对 v0.1 的具体落地建议

若以 `v0.1` 成本和交付速度为优先，采用以下组合：

- 资产文件：文件系统
- 元数据：`SQLite`
- ORM：`Drizzle`
- 向量索引：`LanceDB`
- 编排层：复用现有 `LangChain / LangGraph`
- 记忆抽象：参考 `xagent` 的 `MemoryStore` 设计自行实现

这样做的原因：

- 保持 TypeScript 单栈
- 保持当前本地部署模型
- 可以直接复用当前视频文件存储和 PPT 嵌入链路
- 可以控制 `v0.1` 改造范围，不把项目推向独立 RAG 平台重构

### 16.7 后续升级路径

为避免 `v0.1` 方案成为后续包袱，需保证抽象边界提前稳定：

- `knowledge_files` 与 `memory_notes` 必须有独立元数据表
- 检索层必须通过接口封装，不直接把 LanceDB 调用散落到业务逻辑中
- 用户隔离必须在存储包装层完成，而不是散落在 API 层
- 未来若切换到 `PostgreSQL + pgvector`，上层 API 和业务逻辑不应大改

## 17. 数据库与目录结构细化

### 17.1 Drizzle Schema 拆分建议

建议新增如下 schema 文件：

- `lib/server/db/schema/knowledge.ts`
- `lib/server/db/schema/memory.ts`
- `lib/server/db/schema/generation.ts`
- `lib/server/db/schema/common.ts`

建议新增如下基础能力：

- `lib/server/db/client.ts`：SQLite / libSQL 连接初始化
- `lib/server/db/migrations/*`：Drizzle 迁移文件
- `lib/server/repositories/*`：按领域封装数据访问

### 17.2 表结构基线

#### 17.2.1 `knowledge_bases`

用途：知识库集合主表。

字段建议：

- `id`：`text`，主键，使用 `kb_<nanoid>`
- `scope_id`：`text`，默认 `default`
- `name`：`text`，非空
- `slug`：`text`，非空
- `description`：`text`，可空
- `status`：`text`，枚举 `active | archived | deleting`
- `file_count`：`integer`，默认 `0`
- `created_at`：`integer`，Unix ms
- `updated_at`：`integer`，Unix ms

索引建议：

- 唯一索引：`(scope_id, slug)`
- 普通索引：`(scope_id, updated_at)`

#### 17.2.2 `knowledge_files`

用途：知识库文件和媒体资产注册表。

字段建议：

- `id`：`text`，主键，使用 `kfile_<nanoid>`
- `knowledge_base_id`：`text`，外键 -> `knowledge_bases.id`
- `scope_id`：`text`，冗余保存，便于隔离过滤
- `filename`：`text`，原始文件名
- `storage_path`：`text`，物理文件相对路径
- `mime_type`：`text`
- `file_size`：`integer`
- `asset_type`：`text`，枚举 `document | image | video`
- `ingest_status`：`text`，枚举 `pending | processing | indexed | skipped | failed`
- `ingest_error`：`text`，可空
- `poster_path`：`text`，可空
- `duration_ms`：`integer`，可空
- `width`：`integer`，可空
- `height`：`integer`，可空
- `checksum`：`text`，可空，用于去重
- `source_type`：`text`，枚举 `upload | import | generated`
- `created_at`：`integer`
- `updated_at`：`integer`

索引建议：

- 普通索引：`(knowledge_base_id, created_at)`
- 普通索引：`(scope_id, asset_type, ingest_status)`
- 唯一索引：`storage_path`
- 可选唯一索引：`(knowledge_base_id, checksum)`

#### 17.2.3 `knowledge_chunks`

用途：文档切片元数据表，同时承担无 embedding 时的全文/关键词检索基础。

字段建议：

- `id`：`text`，主键，使用 `kchunk_<nanoid>`
- `knowledge_file_id`：`text`，外键 -> `knowledge_files.id`
- `knowledge_base_id`：`text`
- `scope_id`：`text`
- `chunk_index`：`integer`
- `page_no`：`integer`，可空
- `text_content`：`text`
- `text_hash`：`text`
- `token_count`：`integer`，可空
- `vector_doc_id`：`text`，可空，对应 LanceDB 记录 ID
- `created_at`：`integer`

索引建议：

- 唯一索引：`(knowledge_file_id, chunk_index)`
- 普通索引：`(knowledge_base_id, chunk_index)`
- 若使用 SQLite FTS：增加 `knowledge_chunks_fts`

#### 17.2.4 `memory_notes`

用途：用户长期记忆主表。

字段建议：

- `id`：`text`，主键，使用 `mem_<nanoid>`
- `scope_id`：`text`
- `content`：`text`
- `category`：`text`，枚举 `preference | teaching_rule | template | fact | summary | general`
- `keywords_json`：`text`，JSON 数组
- `tags_json`：`text`，JSON 数组
- `metadata_json`：`text`，JSON 对象
- `mime_type`：`text`，默认 `text/plain`
- `source_type`：`text`，枚举 `manual | generated_from_stage`
- `source_ref_id`：`text`，可空
- `is_pinned`：`integer`，布尔语义，默认 `0`
- `vector_doc_id`：`text`，可空
- `created_at`：`integer`
- `updated_at`：`integer`

索引建议：

- 普通索引：`(scope_id, category, updated_at)`
- 普通索引：`(scope_id, is_pinned, updated_at)`

#### 17.2.5 `generation_context_links`

用途：记录课堂生成与知识库/记忆命中结果的关联，便于回溯和后续沉淀。

字段建议：

- `id`：`text`，主键，使用 `gctx_<nanoid>`
- `stage_id`：`text`
- `scene_id`：`text`，可空
- `knowledge_base_id`：`text`，可空
- `knowledge_file_id`：`text`，可空
- `knowledge_chunk_id`：`text`，可空
- `memory_note_id`：`text`，可空
- `link_type`：`text`，枚举 `knowledge_hit | memory_hit | knowledge_video_used | memory_saved`
- `score`：`real`，可空
- `created_at`：`integer`

索引建议：

- 普通索引：`(stage_id, created_at)`
- 普通索引：`(link_type, created_at)`

#### 17.2.6 `ingestion_jobs`

用途：跟踪文档切片和向量写入状态，避免导入过程黑盒化。

字段建议：

- `id`：`text`，主键，使用 `ingest_<nanoid>`
- `knowledge_base_id`：`text`
- `knowledge_file_id`：`text`
- `scope_id`：`text`
- `status`：`text`，枚举 `queued | processing | completed | failed | cancelled`
- `stage`：`text`，枚举 `parse | chunk | embed | index`
- `message`：`text`，可空
- `created_at`：`integer`
- `updated_at`：`integer`

索引建议：

- 普通索引：`(knowledge_base_id, status, updated_at)`
- 普通索引：`(knowledge_file_id, updated_at)`

### 17.3 LanceDB 集合建议

建议拆分为两个逻辑集合：

- `knowledge_chunks`
- `memory_notes`

元数据字段建议统一包含：

- `id`
- `scope_id`
- `source_table`
- `source_id`
- `knowledge_base_id` 或 `category`
- `text`
- `metadata_json`
- `created_at`

要求：

- LanceDB 仅承担向量检索职责
- 业务真值仍以 SQLite 元数据表为准
- 删除或重建索引时，必须允许由 SQLite 重新回填 LanceDB

### 17.4 目录结构细化

建议最终目录基线如下：

```text
data/
  app.db
  uploads/
    knowledge/
      default/
        <kb-slug>/
          files/
          posters/
  lancedb/
    knowledge/
    memory/
  trash/
    knowledge/
```

补充约束：

- `storage_path`、`poster_path` 在数据库中保存相对路径，不保存绝对路径
- 对外访问 URL 通过 API 动态拼装
- 删除知识库时先移入 `trash/knowledge/`，再异步清理

## 18. API 契约细化

### 18.1 知识库 API

#### 18.1.1 `POST /api/kb`

用途：创建知识库。

请求体：

```json
{
  "name": "初中物理实验",
  "description": "实验演示素材与讲义",
  "scopeId": "default"
}
```

响应体：

```json
{
  "id": "kb_ab12cd",
  "name": "初中物理实验",
  "slug": "chu-zhong-wu-li-shi-yan",
  "status": "active",
  "fileCount": 0,
  "createdAt": 1774310400000,
  "updatedAt": 1774310400000
}
```

#### 18.1.2 `GET /api/kb`

用途：列出知识库。

查询参数：

- `scopeId`
- `keyword`
- `page`
- `pageSize`

#### 18.1.3 `PATCH /api/kb/:id`

用途：更新知识库名称、描述、归档状态。

#### 18.1.4 `DELETE /api/kb/:id`

用途：删除知识库。

要求：

- 先标记 `status = deleting`
- 将物理目录移动到 `trash`
- 删除 SQLite 元数据
- 清理 LanceDB 对应记录

#### 18.1.5 `POST /api/kb/:id/files`

用途：上传文件到知识库。

表单字段：

- `file`
- `assetType`，可选
- `autoIngest`，默认 `true`

响应体建议包含：

```json
{
  "id": "kfile_123",
  "knowledgeBaseId": "kb_ab12cd",
  "filename": "牛顿第一定律.mp4",
  "assetType": "video",
  "ingestStatus": "skipped",
  "posterUrl": "/api/kb/files/kfile_123/poster",
  "durationMs": 24000,
  "width": 1920,
  "height": 1080
}
```

#### 18.1.6 `GET /api/kb/:id/files`

用途：列出知识库文件。

查询参数：

- `assetType`
- `ingestStatus`
- `page`
- `pageSize`

#### 18.1.7 `DELETE /api/kb/:id/files/:fileId`

用途：删除单个知识库文件及其切片/索引。

#### 18.1.8 `POST /api/kb/search`

用途：检索知识库文本和视频候选。

请求体：

```json
{
  "query": "演示惯性现象的实验视频",
  "knowledgeBaseIds": ["kb_ab12cd"],
  "topK": 5,
  "includeVideos": true,
  "includeDocuments": true
}
```

响应体：

```json
{
  "items": [
    {
      "type": "video",
      "fileId": "kfile_123",
      "knowledgeBaseId": "kb_ab12cd",
      "filename": "牛顿第一定律.mp4",
      "score": 0.92,
      "url": "/api/kb/files/kfile_123/content",
      "posterUrl": "/api/kb/files/kfile_123/poster"
    },
    {
      "type": "chunk",
      "fileId": "kfile_456",
      "chunkId": "kchunk_789",
      "knowledgeBaseId": "kb_ab12cd",
      "score": 0.88,
      "text": "惯性是物体保持原有运动状态不变的性质",
      "pageNo": 3
    }
  ]
}
```

#### 18.1.9 `POST /api/kb/:id/files/:fileId/reindex`

用途：重新触发单文件 ingest / embedding / index。

### 18.2 记忆 API

#### 18.2.1 `POST /api/memory`

请求体：

```json
{
  "content": "生成物理课时优先使用实验演示和分步讲解",
  "category": "teaching_rule",
  "keywords": ["物理", "实验", "分步讲解"],
  "tags": ["教学风格"],
  "metadata": {
    "source": "manual"
  }
}
```

#### 18.2.2 `GET /api/memory`

查询参数：

- `category`
- `keyword`
- `pinnedOnly`
- `page`
- `pageSize`

#### 18.2.3 `GET /api/memory/:id`

用途：获取单条记忆。

#### 18.2.4 `PATCH /api/memory/:id`

用途：更新记忆内容、标签、置顶状态。

#### 18.2.5 `DELETE /api/memory/:id`

用途：删除记忆。

#### 18.2.6 `POST /api/memory/search`

请求体：

```json
{
  "query": "面向初中物理的偏好设置",
  "categories": ["preference", "teaching_rule"],
  "topK": 5
}
```

响应要求：

- 返回 `score`
- 返回 `category`
- 返回 `keywords`
- 返回 `tags`
- 返回 `metadata`

#### 18.2.7 `POST /api/memory/from-stage`

用途：从某次课堂生成结果中手动沉淀记忆。

请求体：

```json
{
  "stageId": "stage_123",
  "content": "牛顿定律课程适合增加生活案例",
  "category": "summary"
}
```

### 18.3 课堂生成 API 扩展

#### 18.3.1 `/api/generate/scene-outlines-stream`

请求体新增字段：

- `knowledgeBaseIds: string[]`
- `memoryIds?: string[]`
- `enableKnowledgeRetrieval?: boolean`
- `enableMemoryRetrieval?: boolean`
- `preferKnowledgeVideos?: boolean`

#### 18.3.2 `/api/generate/classroom`

若存在服务端课堂生成入口，请同步新增相同字段，保持流式与非流式接口一致。

### 18.4 文件访问 API

建议新增：

- `GET /api/kb/files/:fileId/content`
- `GET /api/kb/files/:fileId/poster`

要求：

- 不暴露真实磁盘路径
- 统一鉴权和 scope 校验
- 统一处理 `Range` 请求，保证视频可预览和可播放

### 18.5 错误码约定

建议统一返回结构：

```json
{
  "error": {
    "code": "KB_FILE_TOO_LARGE",
    "message": "Uploaded file exceeds limit"
  }
}
```

错误码基线：

- `KB_NOT_FOUND`
- `KB_NAME_CONFLICT`
- `KB_FILE_NOT_FOUND`
- `KB_FILE_TOO_LARGE`
- `KB_FILE_TYPE_UNSUPPORTED`
- `KB_INGEST_FAILED`
- `MEMORY_NOT_FOUND`
- `MEMORY_CATEGORY_INVALID`
- `GENERATION_CONTEXT_INVALID`

### 18.6 API 响应字段约束

所有列表接口建议统一返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

所有时间字段统一使用 Unix 毫秒时间戳。
