# OpenMAIC v0.2 详细设计方案

## 1. 目标

`v0.2` 详细设计覆盖两项能力：

1. 课程导入导出
2. 生成课件后的人工介入修改

设计目标：

1. 基于 `v0.1` 当前 `Stage/Scene` 数据模型扩展
2. 不破坏现有生成、播放、PPT 导出链路
3. 支持单课程完整迁移
4. 支持“直接编辑”和“对话重制”两种人工修改路径
5. 支持单人编辑闭环和版本恢复

## 2. 当前基线

当前系统已经具备：

1. 课程持久化
   - 服务端文件：`data/classrooms/<id>.json`
   - 前端本地缓存：IndexedDB `stages/scenes/mediaFiles`
2. 课程生成
   - outline 生成
   - scene content 生成
   - 后台任务生成 `generate-classroom`
3. 导出能力
   - PPTX 导出
   - 资源包导出
   - `context.json` 导出
4. 知识库与记忆接入

当前缺口：

1. 没有标准课程包格式
2. 没有课程导入链路
3. 没有正式的草稿态和版本快照
4. 没有对话式重制入口和覆盖策略模型
5. 编辑保存仍偏“直接覆盖”，缺少可恢复性

## 3. 总体设计

### 3.1 架构原则

1. 课程包采用“结构化元数据 + 媒体文件 + manifest”的单文件压缩格式
2. 导入导出走后台任务，避免大文件阻塞请求
3. 编辑采用“当前草稿 + 版本快照”双层模型
4. 服务端持久化是真值来源，前端本地仅用于编辑缓存和加速恢复

### 3.2 设计结果

`v0.2` 引入 4 个新层次：

1. 课程包模型
2. 导入导出任务模型
3. 草稿态模型
4. 历史版本模型
5. 对话重制任务模型

## 4. 课程包格式设计

### 4.1 文件格式

课程包采用：

- `.omaic-course.zip`

内部结构建议：

```text
manifest.json
stage.json
scenes.json
context.json
assets/
  media/
  posters/
  whiteboards/
checksums.json
```

### 4.2 `manifest.json`

字段：

1. `format`: 固定 `openmaic-course`
2. `version`: 例如 `2`
3. `exportedAt`
4. `sourceAppVersion`
5. `courseId`
6. `courseName`
7. `sceneCount`
8. `assetCount`
9. `includesAssets`
10. `hashAlgorithm`

### 4.3 `stage.json`

保存课程级元数据：

1. `id`
2. `name`
3. `description`
4. `language`
5. `style`
6. `generationContext`
7. `agentIds`
8. `createdAt`
9. `updatedAt`

### 4.4 `scenes.json`

保存页面结构：

1. `id`
2. `stageId`
3. `type`
4. `title`
5. `order`
6. `content`
7. `actions`
8. `generationContext`
9. `whiteboards`
10. `createdAt`
11. `updatedAt`

### 4.5 `context.json`

复用并扩展当前导出上下文结构：

1. 课程摘要
2. 页面清单
3. 页面级上下文
4. 知识库资产引用
5. 导出版本信息

### 4.6 `assets/`

资源目录保存：

1. 页面内实际使用的图片、视频、音频
2. 知识库视频封面
3. 交互页静态资源

规则：

1. 所有资源在 `manifest` 中登记
2. 所有资源按相对路径引用
3. 课程导入后重建本地资源映射

## 5. 导出设计

### 5.1 导出入口

新增入口：

1. 课堂页 `Export Course`
2. 首页课程列表 `Export`

### 5.2 导出模式

支持两种模式：

1. `structure-only`
   - 仅导出 `manifest/stage/scenes/context`
   - 不导出媒体资源
2. `full-package`
   - 导出结构和资源

### 5.3 导出流程

1. 前端发起导出请求
2. 服务端创建导出任务
3. 读取课堂 JSON
4. 收集页面资源引用
5. 写出标准压缩包
6. 返回下载地址或二进制流

### 5.4 资源收集规则

需要识别并收集：

1. 普通媒体元素
2. 生成媒体占位符的实际文件
3. `knowledge://fileId` 引用对应的文件与 poster
4. interactive 页面依赖文件

## 6. 导入设计

### 6.1 导入入口

新增入口：

1. 首页课程列表 `Import Course`
2. 后续课程管理页中的课程导入入口

### 6.2 导入流程

1. 上传压缩包
2. 创建导入任务
3. 解压到临时目录
4. 校验 `manifest/version/checksums`
5. 解析 `stage/scenes/context`
6. 复制资源到目标目录
7. 重写课程 `id` 和内部资源引用
8. 写入 `data/classrooms/<newId>.json`
9. 返回新课程地址

### 6.3 冲突策略

`v0.2` 默认采用“导入为新课程”：

1. 不覆盖现有课程
2. 为导入课程分配新 `id`
3. 在 `stage.importSource` 中记录来源信息

### 6.4 导入校验

必须校验：

1. `manifest.format`
2. `manifest.version`
3. `stage.json`
4. `scenes.json`
5. 资源文件存在性
6. 校验和一致性

## 7. 人工修改设计

### 7.1 修改模式

`v0.2` 明确支持两种方式：

1. 直接编辑
   - 用户直接修改当前课程内容
2. 对话重制
   - 用户通过对话提示词描述目标，由模型重新制作部分或全部课件

两条路径共享：

1. 草稿态
2. 版本快照
3. 最终保存发布

### 7.2 编辑对象

允许编辑：

1. 课程元信息
2. 页面标题、顺序、类型元数据
3. slide 画布元素
4. quiz / interactive / pbl 内容
5. actions 和讲稿
6. 页面级上下文备注

### 7.3 编辑状态模型

引入三个状态：

1. `persisted`
   - 最近一次服务端保存结果
2. `draft`
   - 当前编辑中的草稿
3. `revision`
   - 保存后的历史快照

补充一个任务态：

4. `regenerationJob`
   - 对话重制中的后台任务

### 7.4 自动保存策略

自动保存分两层：

1. 本地自动保存
   - 每次编辑后延迟写 IndexedDB
2. 服务端自动保存
   - 间隔提交或显式保存时写课堂 JSON

默认策略：

1. 前端 3 秒防抖保存草稿
2. 关键操作立即保存
   - 删除页面
   - 恢复版本
   - 导入后首次落盘
3. 对话重制结果默认先保存到草稿，不直接覆盖正式版本

### 7.5 直接编辑边界

`v0.2` 只做单人编辑，不做实时协作。

冲突处理策略：

1. 同一浏览器会话内以后写为准
2. 如果服务端版本号已变化，前端保存时提示“需刷新或另存副本”

### 7.6 对话重制设计

#### 7.6.1 入口

课堂页新增 `Rework with Prompt` 入口，支持：

1. 页面级重制
2. 整课重制
3. 当前选中元素局部重制

#### 7.6.2 请求结构

对话重制请求需要包含：

1. `classroomId`
2. `target`
   - `course`
   - `scene`
   - `elements`
3. `targetIds`
4. `prompt`
5. `rewriteMode`
   - `text-only`
   - `layout-only`
   - `media-only`
   - `full`
6. `preserveManualEdits`
7. `context`
   - 当前课程摘要
   - 选中页面内容
   - 相关知识库/记忆摘要

#### 7.6.3 执行流程

1. 用户输入提示词
2. 前端发送重制请求
3. 服务端创建重制任务
4. 模型根据范围生成新的 `stage/scene/element` 草稿结果
5. 返回 diff 摘要或草稿版本
6. 用户确认后应用到当前草稿

#### 7.6.4 覆盖策略

支持两类策略：

1. `preserve`
   - 保留人工修改部分，只替换指定范围
2. `replace`
   - 用新结果覆盖指定范围

覆盖粒度：

1. 课程级
2. 页面级
3. 元素级

#### 7.6.5 结果应用

对话重制结果不直接写正式版本。

统一策略：

1. 先生成草稿
2. 用户预览
3. 用户选择应用、丢弃、继续追问修改

## 8. 版本快照设计

### 8.1 版本模型

每次显式保存可生成版本快照。

字段：

1. `revisionId`
2. `classroomId`
3. `baseVersion`
4. `summary`
5. `createdAt`
6. `createdBy`
7. `snapshotPath`

### 8.2 快照策略

`v0.2` 采用完整快照，不做增量 diff 存储。

原因：

1. 实现简单
2. 恢复可靠
3. 当前单课程数据量可控

### 8.3 恢复策略

恢复版本时：

1. 读取快照
2. 覆盖当前课堂持久化文件
3. 生成新的恢复版本记录
4. 刷新前端编辑状态

## 9. 数据结构扩展

### 9.1 `Stage`

建议新增字段：

1. `version?: number`
2. `lastSavedAt?: number`
3. `lastEditedAt?: number`
4. `importSource?:`
   - `packageVersion`
   - `sourceCourseId`
   - `importedAt`
5. `draftStatus?: 'clean' | 'dirty' | 'regenerating'`

### 9.2 `Scene`

建议新增字段：

1. `lastEditedAt?: number`
2. `editedByUser?: boolean`
3. `manualNotes?: string`
4. `manualEditFlags?:`
   - `contentEdited`
   - `actionsEdited`
   - `layoutEdited`

### 9.3 新增重制任务模型

建议新增：

1. `classroom_regeneration_jobs`
   - `id`
   - `classroom_id`
   - `target_type`
   - `target_ids_json`
   - `prompt`
   - `rewrite_mode`
   - `preserve_manual_edits`
   - `status`
   - `result_snapshot_path`
   - `created_at`
   - `updated_at`

### 9.4 新增服务端目录

建议新增：

```text
data/
  classrooms/
  classroom-jobs/
  classroom-regeneration-jobs/
  classroom-revisions/
  classroom-imports/
  classroom-exports/
```

## 10. API 设计

### 10.1 课程导出

1. `POST /api/classroom/export`
   - 请求：
     - `classroomId`
     - `mode`
   - 返回：
     - `jobId`
     - `status`
2. `GET /api/classroom/export/:jobId`
   - 返回任务状态和下载地址

### 10.2 课程导入

1. `POST /api/classroom/import`
   - `multipart/form-data`
   - 字段：
     - `file`
     - `importMode`
2. `GET /api/classroom/import/:jobId`
   - 返回导入状态和新课程 `id`

### 10.3 课程编辑保存

1. `PATCH /api/classroom/:id`
   - 保存课程元信息或页面结构变更
2. `POST /api/classroom/:id/save-draft`
   - 持久化草稿
3. `POST /api/classroom/:id/publish`
   - 生成稳定版本

### 10.4 对话重制

1. `POST /api/classroom/:id/regenerate`
   - 创建重制任务
2. `GET /api/classroom/:id/regenerate/:jobId`
   - 查询重制任务状态
3. `POST /api/classroom/:id/regenerate/:jobId/apply`
   - 将重制结果应用到当前草稿
4. `POST /api/classroom/:id/regenerate/:jobId/discard`
   - 丢弃本次重制结果

### 10.5 历史版本

1. `GET /api/classroom/:id/revisions`
2. `POST /api/classroom/:id/revisions`
3. `POST /api/classroom/:id/revisions/:revisionId/restore`

## 11. 前端设计

### 11.1 首页

新增：

1. `Import Course`
2. 课程卡片 `Export Course`
3. 草稿/已保存状态标记

### 11.2 课堂页

新增：

1. `Edit` 模式入口
2. `Save Draft`
3. `Revision History`
4. `Export Course`
5. `Rework with Prompt`
6. 重制结果预览与应用按钮

### 11.3 编辑器行为

编辑器需要支持：

1. 当前页面直接编辑
2. 页面列表插入、复制、删除、拖拽排序
3. 顶部保存状态提示
4. 版本恢复后整页刷新
5. 对话窗口持续追问修改
6. 重制影响范围与覆盖策略确认

## 12. 存储设计

### 12.1 服务端真值

服务端课堂 JSON 仍是主真值：

1. 导入后直接写服务端
2. 手工保存后直接写服务端
3. 导出从服务端真值读取

### 12.2 前端缓存

IndexedDB 用于：

1. 编辑中恢复
2. 临时草稿
3. 本地媒体预览映射

## 13. 错误处理

### 13.1 导入错误码

建议新增：

1. `CLASSROOM_IMPORT_INVALID_PACKAGE`
2. `CLASSROOM_IMPORT_VERSION_UNSUPPORTED`
3. `CLASSROOM_IMPORT_ASSET_MISSING`
4. `CLASSROOM_IMPORT_CHECKSUM_FAILED`

### 13.2 导出错误码

建议新增：

1. `CLASSROOM_EXPORT_NOT_FOUND`
2. `CLASSROOM_EXPORT_ASSET_READ_FAILED`
3. `CLASSROOM_EXPORT_PACKAGE_BUILD_FAILED`

### 13.3 编辑与重制错误码

建议新增：

1. `CLASSROOM_SAVE_CONFLICT`
2. `CLASSROOM_REVISION_NOT_FOUND`
3. `CLASSROOM_REGENERATE_INVALID_TARGET`
4. `CLASSROOM_REGENERATE_APPLY_FAILED`

## 14. 兼容性策略

### 14.1 对 `v0.1` 课堂数据

保持兼容：

1. 老课堂没有 `revision/version/importSource` 字段时按默认值处理
2. 旧课堂可以直接进入编辑模式
3. 旧课堂可直接导出 `v0.2` 课程包

### 14.2 对未来版本

课程包设计必须保证：

1. `manifest.version` 可升级
2. 资源相对路径可迁移
3. `context.json` 可扩展字段但不破坏旧解析

## 15. 安全与约束

1. 导入 ZIP 时禁止路径穿越
2. 资源写入前做目标目录白名单校验
3. 导入时禁止覆盖已有课堂文件
4. 版本恢复必须先做目标存在性检查

## 16. 实施步骤

### 阶段 1

1. 定义课程包格式
2. 实现导出任务和压缩包写出
3. 实现导入任务和临时解压校验

### 阶段 2

1. 实现课程草稿保存
2. 实现课堂页编辑入口
3. 实现对话重制任务
4. 实现版本快照

### 阶段 3

1. 实现课程列表导入导出入口
2. 实现版本恢复
3. 实现对话重制结果预览与应用
4. 实现导入冲突提示和错误展示

## 17. 验收建议

### 核心验证场景

1. 生成一门课程后导出，再导入，确认课程可播放、可导出 PPT
2. 编辑 slide 文本与页面顺序后保存，刷新后确认结果保留
3. 通过提示词对单页进行重制，确认结果先进入草稿态，再由用户确认应用
4. 创建版本快照，修改课程，再恢复旧版本，确认内容可回退
5. 导入缺少资源文件的损坏包，确认返回明确错误

## 18. 结论

`v0.2` 的核心不是继续扩展生成能力，而是把“生成结果”变成“可迁移、可编辑、可重制、可恢复”的课程资产。

这两个能力上线后，OpenMAIC 的课程工作流才算完整：

1. 生成
2. 编辑
3. 对话重制
4. 保存
5. 导出
6. 导入
7. 恢复
