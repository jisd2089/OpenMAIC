# OpenMAIC v0.1 技术选型决策

## 1. 目标

本文档用于明确 `v0.1` 中“知识库”和“记忆”能力的框架选型决策，并说明与 `xagent` 的取舍关系。

## 2. 当前项目约束

OpenMAIC 当前约束如下：

- 主栈为 `Next.js + React + TypeScript`
- 已引入 `@langchain/core`、`@langchain/langgraph`
- 前端大量状态保存在 IndexedDB / Dexie
- 服务端课堂与媒体资产使用文件系统和 JSON 文件
- 已具备视频元素播放和 PPT 视频嵌入能力

因此本项目的核心问题不是“缺一个通用 AI 框架”，而是“缺服务端统一元数据层和可扩展的检索抽象层”。

## 3. xagent 对比结论

### 3.1 值得借鉴的部分

- `MemoryStore` 抽象
- 用户隔离包装层
- 文件上传统一登记模型
- collection 化知识库组织方式
- 内存存储与向量存储之间的降级机制

### 3.2 不建议直接复用的部分

- `FastAPI`
- `SQLAlchemy`
- `Alembic`
- Python 主服务栈本身

原因：

- 与 OpenMAIC 当前 TS 单栈不一致
- 会引入双运行时、双迁移体系、双运维模型
- 对 `v0.1` 交付成本不利

## 4. 选型评估

### 4.1 知识库

#### 方案 A：`Drizzle + PostgreSQL + pgvector`

适用：

- 多用户
- 共享知识库
- 后续要扩展权限与协作

优点：

- 元数据和向量检索可统一在服务端数据层中管理
- 适合作为长期主方案
- 比 `Prisma + pgvector` 更适合向量检索是一等能力的场景

缺点：

- 对 `v0.1` 引入成本较高

结论：

- 作为长期最优方案保留

#### 方案 B：`Drizzle + SQLite/libSQL + LanceDB`

适用：

- 本地优先
- 单机部署
- 希望尽快落地 `v0.1`

优点：

- 与当前文件系统资产模型兼容
- 部署成本低
- 和 `xagent` 的向量检索思路较接近

缺点：

- 元数据和向量索引分离
- 长期多人协作时不如 Postgres 一体化方案

结论：

- 作为 `v0.1` 推荐落地方案

#### 方案 C：`Prisma + SQLite/PostgreSQL + 外挂向量层`

优点：

- 常规关系模型开发体验较好

缺点：

- 对向量能力不如 Drizzle 贴合
- 若知识库和记忆是核心域能力，后续兼容层会更重

结论：

- 不作为优先方案

### 4.2 记忆

#### 方案 A：直接使用 LangGraph Memory

优点：

- 已有依赖
- 适合 agent 状态保存

缺点：

- 不等于完整的记忆产品模块
- 缺少面向业务的 CRUD、分类、标签、来源追踪、用户隔离

结论：

- 仅作为编排态 memory 使用，不作为完整“记忆模块”实现

#### 方案 B：TypeScript 自定义 `MemoryStore`

优点：

- 最贴合 OpenMAIC 当前主栈
- 可以直接借鉴 `xagent` 的抽象边界
- 便于接统一元数据层、全文检索和向量检索

缺点：

- 需要自行实现业务抽象层

结论：

- 作为 `v0.1` 记忆模块推荐方案

#### 方案 C：引入新的 TS Agent Framework

优点：

- 可能附带 memory / RAG 能力

缺点：

- 会形成第二套 runtime 抽象
- 对当前项目属于重构级引入

结论：

- `v0.1` 不建议采用

## 5. 最终决策

### 5.1 v0.1 决策

`v0.1` 采用如下组合：

- 资产存储：文件系统
- 元数据：`SQLite`
- ORM：`Drizzle`
- 向量索引：`LanceDB`
- 编排层：复用 `LangChain / LangGraph`
- 记忆抽象：自定义 TypeScript `MemoryStore`

### 5.2 长期升级路径

若后续进入多用户共享和服务端协作阶段，升级为：

- 元数据：`PostgreSQL`
- 向量索引：`pgvector`
- 上层知识库 / 记忆 API 保持不变

## 6. 设计要求

为保证未来可升级，必须满足：

- `knowledge_files`、`memory_notes` 独立建模
- 检索接口抽象化，禁止业务层直接依赖具体向量库
- 用户隔离在存储包装层处理
- 视频知识库资产以统一文件注册表管理
- PPT 视频嵌入继续复用现有导出链路，不另造媒体导出框架

## 7. 官方参考

- LangGraph Memory: https://docs.langchain.com/oss/javascript/langgraph/add-memory
- LangGraph Persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite
- Drizzle PostgreSQL: https://orm.drizzle.team/docs/get-started/postgresql-new
- Drizzle pgvector: https://orm.drizzle.team/docs/extensions/pg
- LanceDB Quickstart: https://docs.lancedb.com/quickstart
- Prisma SQLite: https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite
- pgvector-node: https://github.com/pgvector/pgvector-node
- Mastra Memory: https://mastra.ai/reference/memory/Memory
