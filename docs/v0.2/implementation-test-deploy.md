# OpenMAIC v0.2 开发实现、测试、部署文档

## 1. 目标

`v0.2` 聚焦两类能力：

1. 课程导入导出
2. 生成课件后的人工介入修改

人工介入修改必须同时支持两种方式：

1. 直接编辑当前课件
2. 通过对话窗口输入提示词，对整课、单页或局部内容重新制作

本文件只定义开发实现、测试、部署方案，不重复展开版本需求说明。

## 2. 当前基线

`v0.1` 已具备以下基础：

- 课程生成与后台任务
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/generate-classroom/route.ts)
- 课程持久化
  - [classroom-storage.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-storage.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/route.ts)
- 本地课堂缓存
  - [stage-storage.ts](/d:/gitlab/OpenMAIC/lib/utils/stage-storage.ts)
- 知识库、记忆、导出上下文、PPT 导出能力

因此 `v0.2` 不从零开始，而是在当前存储和生成链路上扩展：

- 课程包导入导出
- 草稿态编辑
- 重制任务与结果应用
- 更完整的测试和部署验收流程

## 3. 范围定义

### 3.1 课程导出

支持把一个完整课程导出为标准课程包，至少包含：

- 课程元信息
- `stage`
- `scenes`
- 生成上下文
- 媒体资产
- 可选版本快照

建议格式：

- 文件名：`<course-name>.omaic-course.zip`

压缩包内容建议：

```text
manifest.json
stage.json
scenes.json
context.json
assets/
```

### 3.2 课程导入

支持导入标准课程包并恢复为可继续编辑、导出、重制的课程。

### 3.3 直接编辑

支持用户对生成结果直接修改，包括：

- 课程标题、描述、语言、风格
- 页面顺序
- 页面内容
- 文本、图片、视频、音频元素
- 页面讲稿和页面级上下文备注

### 3.4 提示词重制

支持在课程页面打开对话窗口，通过提示词请求重新制作内容。

重制粒度至少支持：

- 整课
- 单页
- 单页内局部内容

重制模式至少支持：

- 只改文案
- 只改布局
- 只改媒体
- 全量重制

## 4. 实现方案

## 4.1 存储扩展

在现有 `data/classrooms` 和 `data/classroom-jobs` 基础上新增：

```text
data/course-exports/
data/course-imports/
data/classroom-revisions/
data/classroom-regeneration-jobs/
```

用途：

- `course-exports`
  - 课程包导出过程中的临时或最终文件
- `course-imports`
  - 导入包解压和校验工作目录
- `classroom-revisions`
  - 课程版本快照
- `classroom-regeneration-jobs`
  - 提示词重制任务状态和结果

实现要求：

- 统一使用服务端文件系统落盘
- 写入保持原子性，复用 [classroom-storage.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-storage.ts) 的写文件模式
- 课程 ID 与导入导出任务 ID 分离

## 4.2 数据模型扩展

`Stage` 建议新增字段：

- `sourcePackageVersion?: string`
- `revisionId?: string`
- `isDraft?: boolean`
- `editable?: boolean`
- `lastManualEditedAt?: string`
- `lastRegeneratedAt?: string`

`Scene` 建议新增字段：

- `locked?: boolean`
- `lastManualEditedAt?: string`
- `lastRegeneratedAt?: string`
- `draftSource?: 'manual' | 'regenerate'`

新增概念：

- `ClassroomRevision`
  - 保存一次课程快照
- `ClassroomRegenerationJob`
  - 保存一次提示词重制任务
- `CoursePackageManifest`
  - 课程包元数据与资源索引

## 4.3 后端接口

### 4.3.1 课程导出

新增：

- `POST /api/classroom/:id/export`
  - 创建导出任务
- `GET /api/classroom/:id/export/:jobId`
  - 查询导出状态
- `GET /api/classroom/:id/export/:jobId/download`
  - 下载课程包

处理流程：

1. 读取课程 JSON
2. 收集引用资产
3. 生成 `manifest.json`
4. 打包 ZIP
5. 返回下载地址

### 4.3.2 课程导入

新增：

- `POST /api/classroom/import`
  - 上传课程包并创建导入任务
- `GET /api/classroom/import/:jobId`
  - 查询导入状态
- `POST /api/classroom/import/:jobId/apply`
  - 应用导入结果，生成新课程

处理流程：

1. 接收 ZIP
2. 解压到临时目录
3. 校验 `manifest.json`
4. 校验 `stage/scenes/assets`
5. 重写资源路径
6. 创建新课程并返回课程 ID

### 4.3.3 直接编辑保存

在现有 [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/route.ts) 基础上扩展：

- `PATCH /api/classroom/:id`
  - 增量保存课程和页面内容
- `POST /api/classroom/:id/revisions`
  - 创建课程快照
- `GET /api/classroom/:id/revisions`
  - 列出快照
- `POST /api/classroom/:id/revisions/:revisionId/restore`
  - 恢复快照

### 4.3.4 提示词重制

新增：

- `POST /api/classroom/:id/regenerate`
  - 创建重制任务
- `GET /api/classroom/:id/regenerate/:jobId`
  - 查询任务状态
- `POST /api/classroom/:id/regenerate/:jobId/apply`
  - 应用重制结果
- `POST /api/classroom/:id/regenerate/:jobId/discard`
  - 丢弃重制结果

任务输入至少包括：

- `targetType`
  - `classroom | scene | selection`
- `targetId`
- `prompt`
- `regenerateMode`
  - `text | layout | media | full`
- `preserveManualEdits`
- `knowledgeBaseIds`
- `memoryIds`
- `scopeId`

### 4.3.5 服务拆分建议

新增服务模块：

- `lib/server/course-export.ts`
- `lib/server/course-import.ts`
- `lib/server/classroom-revision.ts`
- `lib/server/classroom-regeneration.ts`

原则：

- 路由只做参数校验与响应包装
- 具体逻辑下沉到服务层
- 新增任务也沿用当前后台 job 模式

## 4.4 前端实现

### 4.4.1 课程导出入口

建议入口：

- 课堂页顶部工具栏
- 首页课程卡片更多菜单

操作项：

- `Export Course Package`
- `Import Course Package`

### 4.4.2 直接编辑模式

课堂页增加 `Edit Mode`，进入后支持：

- 修改课程基本信息
- 页面排序
- 页面增删
- 元素选中后直接编辑属性
- 文本直接修改
- 媒体替换
- 自动保存与手动保存

状态模型：

- `Persisted`
  - 服务端已保存版本
- `Draft`
  - 本地或远端草稿
- `Dirty`
  - 有未保存修改

建议保存策略：

- 本地防抖自动保存到 IndexedDB
- 明确点击时提交到服务端
- 离开页面前提示未保存变更

### 4.4.3 对话重制模式

课堂页增加 `Rework with Prompt` 面板。

核心交互：

1. 用户选择范围
2. 输入提示词
3. 选择重制模式
4. 提交后台任务
5. 预览候选结果
6. 决定应用或丢弃

重要约束：

- 重制结果不能直接覆盖已保存版本
- 先生成到草稿态，再由用户确认应用
- 支持保留人工修改内容

### 4.4.4 版本与冲突控制

所有直接编辑和重制应用都必须先生成快照。

最低要求：

- 应用前自动创建一份 `revision`
- 用户可以恢复到任一历史版本
- 若本地草稿与服务端版本不一致，提示冲突而不是静默覆盖

## 5. 开发计划

### 阶段 1：课程导入导出

交付物：

- 课程包格式
- 导出任务
- 导入任务
- 下载与应用流程

优先实现：

- 先支持 JSON + 资源文件导入导出
- 先不做跨版本复杂迁移

### 阶段 2：直接编辑

交付物：

- 课堂页编辑模式
- PATCH 保存
- 自动保存
- 快照恢复

### 阶段 3：提示词重制

交付物：

- 重制面板
- 后台重制任务
- 结果预览
- 应用 / 丢弃

### 阶段 4：发布收口

交付物：

- 回归测试
- 部署脚本验证
- 发布说明

## 6. 测试方案

## 6.1 单元测试

覆盖服务层核心逻辑：

- 课程包 manifest 生成
- 课程包导入校验
- 资源重写
- 快照创建与恢复
- 重制任务状态流转
- 重制结果合并策略

建议新增测试文件：

- `tests/server/course-export.test.ts`
- `tests/server/course-import.test.ts`
- `tests/server/classroom-revision.test.ts`
- `tests/server/classroom-regeneration.test.ts`

## 6.2 路由级集成测试

覆盖：

- 课程导入导出任务创建和查询
- 下载接口
- PATCH 保存
- 快照列表与恢复
- 重制任务提交、查询、应用、丢弃

建议新增测试文件：

- `tests/server/course-import-export-routes.test.ts`
- `tests/server/classroom-edit-routes.test.ts`
- `tests/server/classroom-regeneration-routes.test.ts`

## 6.3 生成链路集成测试

重点验证提示词重制不会破坏现有生成链路：

- 课程级重制
- 单页重制
- 保留人工修改
- 知识库 / 记忆继续参与重制上下文

## 6.4 前端交互测试

优先覆盖：

- 进入编辑模式
- 修改并保存
- 刷新后恢复
- 发起重制
- 预览结果
- 应用结果
- 丢弃结果

如引入 Playwright，用例建议：

- `e2e/course-import-export.spec.ts`
- `e2e/classroom-editing.spec.ts`
- `e2e/classroom-regenerate.spec.ts`

## 6.5 验收清单

上线前至少完成：

- `npx tsc --noEmit`
- `npx eslint .`
- `node_modules/.bin/vitest.cmd run`
- 关键 `e2e` 用例
- `docker compose build`

人工验收项：

- 导出课程包后可重新导入
- 导入后的媒体可用
- 直接编辑可保存和恢复
- 重制不会静默覆盖原课程
- 重制结果可应用、可丢弃、可回退

## 7. 部署方案

## 7.1 本地开发

依赖：

- Node.js 22
- `pnpm 10.28.0`

启动步骤：

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
corepack pnpm install
npx tsc --noEmit
npx eslint .
node_modules/.bin/vitest.cmd run
corepack pnpm dev
```

如需本地镜像验证：

```bash
docker compose build
docker compose up
```

## 7.2 部署前检查

必须确认：

- 新增存储目录在目标环境可写
- 导入导出 ZIP 大小限制明确
- 大文件上传不会导致进程内存被打爆
- 重制任务的并发数和超时受控
- 回滚时旧课程 JSON 仍可读取

## 7.3 生产部署

建议顺序：

1. 合并到版本分支
2. 完成回归
3. 构建镜像
4. 在预发布环境验证：
   - 导入
   - 导出
   - 直接编辑
   - 提示词重制
5. 再发布正式环境

## 7.4 发布后冒烟验证

至少验证：

1. 正常生成一个课程
2. 导出课程包
3. 再导入该课程包
4. 修改一个页面并保存
5. 发起一次单页提示词重制
6. 应用重制结果
7. 导出 PPT 与资源包

## 8. 风险与约束

- 课程导入导出会引入跨版本兼容问题
- 直接编辑和提示词重制会引入状态冲突问题
- 媒体资源体积可能显著增加
- 大型课程包需要限制大小和处理时长
- 若没有清晰版本快照，人工修改和 AI 重制会相互覆盖

`v0.2` 必须优先保证：

- 数据不丢
- 可以回退
- 导入导出可复现
- AI 重制可审查后再应用

## 9. 建议的完成标准

`v0.2` 可以认为完成，当且仅当以下条件同时满足：

1. 课程可以稳定导出和导入
2. 用户可以直接编辑并保存课程
3. 用户可以通过提示词重制整课、单页或局部内容
4. 所有重制结果都先进入可审查草稿
5. 可以恢复到历史快照
6. 自动化测试和 Docker 构建通过

## 10. 当前实现状态（截至 2026-03-27）

### 10.1 已完成

`v0.2 P0` 已完成最小可用实现，范围是“结构包级课程导入导出”。

已落地代码：

- 契约与类型
  - [contracts.ts](/d:/gitlab/OpenMAIC/lib/server/classroom/contracts.ts)
  - [types.ts](/d:/gitlab/OpenMAIC/lib/server/classroom/types.ts)
- 存储目录扩展
  - [classroom-storage.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-storage.ts)
- 课程包构建与解析
  - [course-package.ts](/d:/gitlab/OpenMAIC/lib/server/course-package.ts)
- 导出任务存储、执行、服务
  - [classroom-export-store.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-export-store.ts)
  - [classroom-export-runner.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-export-runner.ts)
  - [course-export.ts](/d:/gitlab/OpenMAIC/lib/server/course-export.ts)
- 导入任务存储、执行、服务
  - [classroom-import-store.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-import-store.ts)
  - [classroom-import-runner.ts](/d:/gitlab/OpenMAIC/lib/server/classroom-import-runner.ts)
  - [course-import.ts](/d:/gitlab/OpenMAIC/lib/server/course-import.ts)
- API 路由
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/[id]/export/route.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/[id]/export/[jobId]/route.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/[id]/export/[jobId]/download/route.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/import/route.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/import/[jobId]/route.ts)
  - [route.ts](/d:/gitlab/OpenMAIC/app/api/classroom/import/[jobId]/apply/route.ts)

### 10.2 当前实际能力

当前已支持：

1. 从已持久化课堂生成 `.omaic-course.zip`
2. 课程包内包含：
   - `manifest.json`
   - `stage.json`
   - `scenes.json`
   - `context.json`
   - `assets/` 占位目录
3. 上传课程包并进行后台校验
4. 校验通过后应用为一个新的 classroom
5. 导入后保留：
   - `stage`
   - `scenes`
   - `generationContext`

### 10.3 当前边界

当前 `P0` 还没有完成以下内容：

1. 真实媒体资产导出打包
2. 导入时的媒体资源重写
3. `revisions` 一并导出导入
4. 课程导入导出前端入口
5. 直接编辑、版本快照、提示词重制

因此当前实现更准确地说是：

- `P0` 已完成结构包导入导出
- `P1` 资源级导入导出尚未开始

### 10.4 测试与校验状态

已完成验证：

- 新增集成测试
  - [course-import-export-routes.test.ts](/d:/gitlab/OpenMAIC/tests/server/course-import-export-routes.test.ts)
- 验证内容
  - 导出任务创建
  - 导出任务执行
  - 导出状态查询
  - 导出下载
  - 导入任务创建
  - 导入校验
  - 导入应用
  - 导入后 classroom 落盘
- 类型检查
  - `npx tsc --noEmit` 通过
- Lint
  - 本轮新增/修改文件已通过 `eslint`

### 10.5 下一步建议

下一阶段按顺序继续：

1. `P1` 真实媒体资产导入导出
2. `P2` 直接编辑
3. `P3` 版本快照
4. `P4` 提示词重制
