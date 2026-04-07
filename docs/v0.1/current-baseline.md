# OpenMAIC v0.1 当前基线

## 1. 目的

本文档用于作为当前 `v0.1` 的唯一推荐实施基线。

它回答四个问题：

1. 已经实现了什么
2. 当前还存在哪些明显风险
3. 哪些文档现在可信
4. 下一步应优先做什么

## 2. 当前已实现能力

### 2.1 知识库

已完成：

- 知识库 CRUD
- 知识库文件上传、删除、重建索引
- SQLite 元数据落盘
- 文本切片写入 `knowledge_chunks`
- `FTS5 + LIKE` 的基础检索
- PDF、DOCX、PPTX、XLSX 文本抽取接入
- 视频同名 `srt/vtt` 侧挂字幕接入
- 视频自动转写接入知识库 ingest 的降级链路

当前边界：

- 还没有真实 embedding provider
- 还没有完整向量检索与重排
- Office/PDF 深度结构化解析仍不完整

### 2.2 记忆

已完成：

- 记忆 CRUD
- 记忆搜索
- `pinned` 支持
- 从课堂结果沉淀记忆
- `FTS5 + LIKE` 检索增强
- `scopeId` 隔离

当前边界：

- 还没有自动长期记忆压缩
- 还没有真实向量记忆检索

### 2.3 知识库视频

已完成：

- 知识库视频导入与登记
- 统一引用协议 `knowledge://fileId`
- 画布渲染支持知识库视频
- PPT 导出支持知识库视频嵌入
- 视频 `poster/duration/width/height` 元数据回写链路

当前边界：

- 依赖 `ffprobe/ffmpeg` 时才有完整视频元数据
- 视频封面和自动转写仍受本地环境能力影响

### 2.4 生成链路接入

已完成：

- 首页支持选择知识库、记忆、视频偏好
- 预览页、首张内容生成、课堂续跑都可透传上下文
- 服务端整课生成接入知识库/记忆检索
- 页面级 `retrievalContext` 与视频候选会写入 `Scene.generationContext`

### 2.5 上下文持久化与导出追踪

已完成：

- `Stage.generationContext`
- `Scene.generationContext`
- 课堂页 `Context` 面板
- `Export Context JSON`
- ZIP 资源包 `context.json`
- PPT 文档属性、第一页备注、每页备注中的上下文摘要

### 2.6 PPT 正文导出修复

已完成：

- 导出前正文真实高度测量
- 关闭 `autoFit` 向下扩框策略
- 正文限高保护
- 与相邻元素的冲突限高
- 同页文本框二次布局
- 超长正文按块拆分导出
- 新生成列表语义收紧为 `ul/ol/li`

当前边界：

- 还没有跨页分页策略
- 还没有完整自动重排引擎

### 2.7 输入契约硬化

已完成：

- 生成主链路 schema 校验
- 聊天、评分、媒体代理、模型验证、PBL chat 等高频路由 schema 校验
- `parseJsonRequestWithSchema()`，坏 JSON 统一走 `INVALID_REQUEST`
- `generationSession` / `generationParams` 读写 schema 化
- `scopeId` 规范化、上下文合并、计数 helper

## 3. 当前主要风险

### 3.1 文档基线分裂

旧需求/设计文档与当前实现已经出现明显时间截面偏差。

另外，部分旧文档在当前 PowerShell 默认输出下有编码/显示异常迹象。

结论：

- 旧文档继续保留，但不再单独作为最新事实来源。
- 后续以本文档和状态补充文档为准。

### 3.2 接口收口尚未完全统一

当前项目中，基于 JSON 的高频请求体入口已经基本统一到：

- `parseJsonRequestWithSchema`

仍然存在的差异主要在：

- 查询参数校验：`parseWithSchema + searchParamsToObject`
- 路径参数校验：`parseWithSchema + params`
- 表单上传校验：`parseWithSchema + formData`

结论：

- 请求体入口已基本收口。
- 后续重点应转向统一 query / params / formData 的校验风格，而不是继续处理裸 JSON 读法。

### 3.3 历史乱码残留

当前仍有部分旧 prompt、旧注释、旧文档存在历史乱码。

结论：

- 需要单独安排一次编码清理，不应继续在这些文件上堆叠版本事实。

### 3.4 缺少项目级验证

当前仍未完成：

- TypeScript 编译
- ESLint
- 页面联调
- 端到端回归

原因：

- 工作区仍缺少完整 `node_modules`

## 4. 当前推荐文档

推荐使用以下文档作为当前基线：

1. [README.md](/d:/Workspace/OpenMAIC/docs/v0.1/README.md)
2. 本文档
3. [technical-decision.md](/d:/Workspace/OpenMAIC/docs/v0.1/technical-decision.md)
4. [schema-api-spec.md](/d:/Workspace/OpenMAIC/docs/v0.1/schema-api-spec.md)
5. [implementation-status-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/implementation-status-2026-03-26.md)
6. [review-summary-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/review-summary-2026-03-26.md)

## 5. 下一步优先级

### P0

- 统一 `docs/v0.1` 旧文档编码
- 合并一份正式主状态文档
- 安装依赖后跑项目级编译和类型检查

### P1

- 继续统一剩余路由到 `parseJsonRequestWithSchema`
- 补知识库/记忆/生成链路最小集成测试
- 做知识库视频到 PPT 导出的回归清单

### P2

- 清理旧 prompt、旧注释、旧文案乱码
- 评估是否将当前基线内容并回历史文档

## 6. 当前结论

`v0.1` 的核心功能链路已经不是纯文档设计阶段，而是进入了“有代码、有数据层、有生成接线、有导出闭环”的最小可用状态。

当前最该做的不是继续横向扩需求，而是：

- 整理文档基线
- 统一剩余输入契约
- 完成最基本的发布前验证
