# OpenMAIC v0.1 实施状态与后续开发计划

## 1. 文档目的

本文档用于记录 `v0.1` 当前已完成实现、当前能力边界、待补项，以及后续开发计划。本文档是对以下文档的实施补充：

- `docs/v0.1/requirements.md`
- `docs/v0.1/detailed-design.md`
- `docs/v0.1/schema-api-spec.md`
- `docs/v0.1/technical-decision.md`

## 2. 当前实施结果

### 2.1 知识库

已完成：

- 新增知识库 API 骨架并补齐最小可用实现
- 知识库元数据落盘到 `SQLite`
- 支持知识库创建、列表、更新、删除
- 支持知识库文件上传、删除、重建索引
- 支持统一知识库文件访问接口
- 支持知识库视频文件登记、读取、封面地址解析
- 文本文件切片后写入 `knowledge_chunks`
- 新增 `knowledge_chunks_fts` 全文索引表
- 知识库文本检索升级为 `FTS5 优先 + LIKE 兜底`
- 文档搜索结果分值归一化，统一排序口径
- 知识库已接入 PDF 文本抽取并可写入检索索引
- 知识库 PDF 切片已支持保留页码并写入 `page_no`
- 知识库已支持 `.docx` 文本抽取入索引
- 知识库已支持 `.pptx/.xlsx` 文本抽取入索引
- 知识库视频已支持同名 `srt/vtt` 侧挂字幕入索引
- 知识库视频已支持无侧挂字幕时的自动转写入索引（依赖 `ffmpeg + server ASR`）

已落地目录/模块：

- `app/api/kb/**`
- `lib/server/kb/**`
- `lib/server/db/**`
- `lib/server/file-response.ts`
- `lib/server/search/search-utils.ts`

当前能力边界：

- 尚未接入 embedding / 向量检索
- 尚未实现真正的混合检索重排
- PDF / Office 文档解析能力仍不完整

### 2.2 记忆

已完成：

- 新增记忆 API
- 支持记忆新增、列表、搜索、更新、删除
- 支持 `pinned` 置顶
- 支持课堂结果沉淀记忆的接口骨架
- 新增 `memory_notes_fts` 全文索引表
- 记忆搜索升级为 `FTS5 优先 + LIKE 兜底`
- 统一记忆搜索分值归一化与 `pinned` 加权规则
- 记忆增删改时同步维护 FTS 索引
- 新增 `EmbeddingProvider` 抽象与本地语义降级评分

已落地目录/模块：

- `app/api/memory/**`
- `lib/server/memory/**`
- `lib/server/search/search-utils.ts`

当前能力边界：

- 尚未接入语义向量检索
- 尚未形成自动沉淀策略
- 尚未支持跨来源长期记忆压缩与归档

### 2.3 知识库视频

已完成：

- 新增统一知识库媒体引用协议：`knowledge://fileId`
- 渲染端支持知识库视频引用
- PPT 导出端支持知识库视频嵌入
- 生成链路支持向模型暴露知识库视频候选
- 上传视频时可尝试提取：
  - `poster`
  - `durationMs`
  - `width`
  - `height`

已落地目录/模块：

- `lib/kb/reference.ts`
- `lib/server/video-processing.ts`
- `components/slide-renderer/components/element/VideoElement/**`
- `lib/export/use-export-pptx.ts`

当前能力边界：

- 当前环境缺少 `ffprobe/ffmpeg` 时会安全降级
- 视频分析和封面生成仍依赖本机工具链

### 2.4 首页与工作台

已完成：

- 新增 `/knowledge` 工作台页面
- 支持知识库管理、文件上传、记忆管理
- 首页新增知识库入口
- 首页新增上下文选择面板
- 支持选择知识库、记忆、视频偏好
- 支持搜索、已选优先排序、本地持久化

已落地目录/模块：

- `app/knowledge/page.tsx`
- `components/kb/knowledge-workbench.tsx`
- `app/page.tsx`

### 2.5 课堂生成链路接入

已完成：

- `outline` 生成支持知识库/记忆上下文
- 首张 `scene content` 生成支持知识库/记忆上下文
- 课堂续跑支持知识库/记忆上下文
- 重试失败场景时继续带入上下文
- 知识库视频候选可进入内容生成提示词
- 指定 `memoryIds` 的生成场景已切到统一检索排序逻辑
- 生成侧已增加跨知识库/记忆的统一上下文重排
- 生成侧已复用混合重排器，支持无 embedding 时的本地降级

已落地目录/模块：

- `app/api/generate/scene-outlines-stream/route.ts`
- `app/api/generate/scene-content/route.ts`
- `lib/generation/scene-generator.ts`
- `lib/hooks/use-scene-generator.ts`
- `lib/server/generation-retrieval.ts`
- `lib/server/classroom-generation.ts`

### 2.6 上下文持久化与课堂可见性

已完成：

- `Stage` 增加课程级 `generationContext`
- `Scene` 增加页面级 `generationContext`
- 课堂刷新后仍可恢复已选知识库/记忆摘要
- 课堂页右上角 `Context` 面板可查看课程级摘要
- 课堂页可查看当前页检索上下文与视频候选
- 课堂页可复制整课上下文 JSON
- 课堂页可复制当前页上下文 JSON
- 课堂页可单独复制当前页检索文本
- 课堂页可查看当前页实际引用的知识库资产
- 当前页视频候选可展示相关度、时长、分辨率

已落地目录/模块：

- `lib/types/stage.ts`
- `lib/utils/database.ts`
- `lib/utils/stage-storage.ts`
- `app/classroom/[id]/page.tsx`

### 2.7 导出与可追溯性

已完成：

- PPT 文档属性写入课程级上下文摘要
- 第一页备注写入课程级上下文
- 每页备注写入页面级检索上下文与视频候选
- 资源包 ZIP 写入 `context.json`
- 头部导出菜单支持单独导出 `context.json`
- `context.json` 包含：
  - 课程信息
  - 课程级上下文
  - 页面列表
  - 页面级检索上下文
  - 页面实际知识库资产引用

已落地目录/模块：

- `lib/export/context-export.ts`
- `lib/export/use-export-pptx.ts`
- `components/header.tsx`

## 3. 当前未完成项

### 3.1 检索层

- 向量检索尚未落地
- embedding 不可用时的混合检索策略尚未完成
- 知识库与记忆尚未引入统一重排模型
- 当前还是“关键词全文检索增强版”，不是完整语义检索

### 3.2 文档解析

- PDF 深度解析未完成
- Office 文档解析未完成
- 图片 OCR 未完成
- 视频字幕 / 文本轨道接入未完成

### 3.3 课堂上下文可视化

- 还未提供按场景导出过滤视图
- 还未建立“检索命中 -> 最终引用资产”的高亮关联
- 课堂上下文面板仍偏工程视图，产品化整理不足

### 3.4 PPT 正文排版修复

- 当前重点已先落知识库、记忆、上下文与导出追踪
- 正文排版修复已进入导出端编码阶段
- 生成端布局规则和导出前复排仍待继续完善

## 4. 后续开发计划

### 4.1 P1：课堂页上下文增强

目标：

- 让课堂页 `Context` 面板不仅能看“生成时输入了什么”，还能看“最终页面实际用了什么”

当前进度：

- 已完成当前页知识库资产显示
- 已完成“仅复制检索文本”
- 已完成视频候选扩展展示

剩余项：

- 增加当前页上下文和实际资产之间的关联高亮
- 增加按当前页导出过滤视图

### 4.2 P2：检索能力升级

目标：

- 从当前基础 `LIKE` 检索升级为更可用的全文检索与混合检索能力

当前进度：

- 已完成 `knowledge_chunks_fts`
- 已完成 `memory_notes_fts`
- 已完成知识库 `FTS5 优先 + LIKE 兜底`
- 已完成记忆 `FTS5 优先 + LIKE 兜底`
- 已完成统一分值归一化与排序基础设施
- 已完成生成链路对指定记忆 ID 的统一排序检索
- 已完成跨知识库/记忆统一重排
- 已完成 `EmbeddingProvider` 抽象与 `SEARCH_SEMANTIC_MODE` 开关
- 已完成本地语义降级评分接入知识库、记忆与生成链路

剩余项：

- 引入 embedding 索引层
- 增加外部 embedding provider 的真实接入
- 增强关键词检索 + 语义检索融合策略

### 4.3 P3：知识资产解析增强

目标：

- 扩展知识库可消费资产类型和解析深度

当前进度：

- 已完成 PDF 文本解析接入知识库 ingest 链路
- 默认优先复用现有 `unpdf`，服务端配置了 MinerU 时可切换到 MinerU
- 已完成 PDF 页级文本保留与按页写入知识库切片
- 已完成 `.docx` 文本抽取接入知识库 ingest 链路
- 已完成 `.pptx/.xlsx` 文本抽取接入知识库 ingest 链路
- 已完成视频同名 `srt/vtt` 侧挂字幕接入知识库 ingest 链路
- 已完成视频无侧挂字幕时的自动转写接入知识库 ingest 链路

计划项：

- PDF 更细粒度切片策略优化
- 更完整的 Office 结构化抽取
- 图片 OCR
- 视频内嵌字幕直读

### 4.4 P4：PPT 正文排版修复

目标：

- 解决当前导出 PPT 正文溢出与 bullet 失真问题

当前进度：

- 已完成导出前正文高度浏览器测量
- 已关闭导出端正文 `autoFit resize` 策略，改为固定高度 + 限高
- 已增加正文超出页面时的导出限高保护
- 已兼容历史 `•`/`1.` 段落的 bullet 识别
- 已增加导出前文本框与下方相邻元素的冲突限高
- 已增加超长正文按块自动拆分导出，优先在同页可用垂直段内分页
- 已收紧生成端列表语义，要求使用 `ul/ol/li`
- 已增加每页文本框二次布局，按顺序调整 `y/h` 避免同列文本互相覆盖

计划项：

- 超长正文跨页分页策略

## 5. 后续开发顺序

当前建议顺序：

1. `P2` 检索能力升级剩余项
2. `P3` 文档与多媒体解析增强
3. `P4` PPT 正文排版修复

## 6. 本轮实现备注

本轮新增/调整重点：

- 新增 SQLite FTS5 索引表并在初始化时回填
- 知识库检索改为 FTS 优先、LIKE 兜底
- 记忆检索改为 FTS 优先、LIKE 兜底
- 统一检索分值归一化与基础排序逻辑
- 生成链路中的指定记忆检索改为按查询重排，而不是原样全量注入
- 生成侧新增跨知识库/记忆统一上下文池与统一重排
- 新增 EmbeddingProvider 抽象和 `SEARCH_SEMANTIC_MODE` 环境开关
- 默认使用本地语义降级评分，避免没有 embedding 服务时完全退回纯关键词排序
- 知识库 ingest 已复用现有 PDF provider，支持 PDF 文本抽取入索引
- PDF provider 已保留页级文本，知识库 PDF chunk 可回写 `page_no`
- 知识库 ingest 已支持 `.docx` 文本抽取入索引
- 知识库 ingest 已支持 `.pptx/.xlsx` 文本抽取入索引
- 知识库视频 ingest 已支持同名 `srt/vtt` 侧挂字幕入索引
- 知识库视频 ingest 已支持无侧挂字幕时自动抽音频并调用服务端 ASR 入索引
- PPT 导出端已增加正文真实高度测量、限高保护与旧 bullet 兼容
- PPT 导出端已增加文本框冲突限高，生成端已要求语义化列表 HTML
- PPT 导出端已增加每页文本框二次布局，减少同列正文互相覆盖
- PPT 导出端已增加超长正文自动拆分导出，优先复用同页剩余垂直空间

校验情况：

- 已验证 `lib/server/db/client.ts` 与 `lib/server/search/search-utils.ts` 可被 Node 加载
- 未完成项目级编译、类型检查与页面联调
- 原因：当前工作区缺少 `node_modules`
