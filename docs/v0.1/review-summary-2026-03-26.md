# OpenMAIC v0.1 实现审查与整理说明

## 1. 审查范围

本次审查覆盖以下实现面：

- 知识库与记忆后端
- 生成链路中的知识库/记忆接入
- 知识库视频引用、渲染与导出
- 课堂上下文持久化与导出追踪
- 生成入口与工具路由的输入契约收口
- PPT 正文导出排版修复
- `docs/v0.1` 文档基线状态

## 2. 当前实现结论

当前改动已经形成可运行的 `v0.1` 主链路骨架，且其中相当一部分能力已经进入“最小可用”状态，而不再只是占位。

已落地的核心能力包括：

- 知识库 CRUD、文件上传、基础检索
- 记忆 CRUD、搜索、从课堂结果沉淀记忆
- 知识库视频导入、知识库视频引用 `knowledge://fileId`
- 课堂生成接入知识库/记忆/视频偏好
- 课堂级与页面级 `generationContext` 持久化
- PPT 导出中的上下文备注、`context.json`、知识库视频嵌入
- PPT 正文导出前测高、限高、冲突保护、同页拆分
- 生成主链路与多条工具路由的请求 schema 校验

## 3. 主要审查结论

### 3.1 已收口的部分

- 生成主链路的输入契约已经明显改善。
  - `scene-outlines-stream`
  - `scene-content`
  - `scene-actions`
  - `generate-classroom`
- 聊天、评分、媒体代理、模型验证、PDF provider 验证、PBL chat 等外围高频接口，也已接入统一 schema。
- `scopeId` 已从默认隐式值提升成显式贯穿字段，并进入：
  - 首页
  - 预览
  - 课堂续跑
  - 服务端生成
  - 检索
  - 导出
- 课堂页和导出链路对 `generationContext` 的读取，已经不再单纯依赖 `sessionStorage`。

### 3.2 仍然存在的主要风险

#### 风险 1：文档基线已分裂

当前 `docs/v0.1` 里同时存在：

- 早期需求/设计文档
- 状态补丁文档
- 本次新增的实施补充文档

其中部分旧文档在当前 PowerShell 默认输出下已经出现编码/显示异常迹象，导致它们不再适合作为唯一事实来源。

直接影响：

- 需求、设计、实施状态三者难以对齐
- 后续继续开发时，容易出现“代码是新的，主文档还是旧的”

结论：

- 旧文档不应继续作为唯一基线
- 本文档与 `implementation-status-2026-03-26.md` 应临时承担最新基线职责

#### 风险 2：接口校验风格仍未完全统一

当前基于 JSON 的高频请求体入口已经基本统一到 `parseJsonRequestWithSchema`，因此“坏 JSON 落到 500”的主要风险已经明显下降。

剩余不一致主要体现在：

- query 校验
- params 校验
- formData 校验

以及少量旧文件中的局部写法差异。

这意味着：

- 维护层面仍然存在风格分叉
- 后续继续扩 API 时，仍可能出现新的局部不一致

结论：

- 新的 JSON 请求体入口继续统一采用 `parseJsonRequestWithSchema`
- query / params / formData 的校验风格应在下一轮继续收口

#### 风险 3：旧文件存在历史乱码残留

当前已有一批运行时关键文件完成清理，但仍有部分旧文件存在非功能性乱码：

- prompt 模板外的历史注释
- 部分旧接口中的非运行时字符串
- 若干老文档

这些问题短期不会直接破坏主流程，但会持续拉高维护成本。

结论：

- 需要单独安排一次“编码与文案清理”专项
- 不建议继续在乱码文档上追加版本事实

#### 风险 4：缺少项目级验证

当前工作区仍然缺少完整 `node_modules`，因此以下事项尚未完成：

- TypeScript 编译
- ESLint
- Next.js 页面联调
- 端到端回归

这意味着本次实现虽然已经过多轮局部 diff/逻辑审查，但还不构成完整发布级验证。

## 4. 本次整理后的推荐文档基线

建议后续开发优先查看以下文档：

1. [README.md](/d:/Workspace/OpenMAIC/docs/v0.1/README.md)
2. [current-baseline.md](/d:/Workspace/OpenMAIC/docs/v0.1/current-baseline.md)
3. [technical-decision.md](/d:/Workspace/OpenMAIC/docs/v0.1/technical-decision.md)
4. [schema-api-spec.md](/d:/Workspace/OpenMAIC/docs/v0.1/schema-api-spec.md)
5. [implementation-status-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/implementation-status-2026-03-26.md)
6. 本文档

说明：

- `requirements.md` / `detailed-design.md` 目前更适合作为历史设计输入
- 当前最新实施事实应以“当前基线文档 + 状态补充文档 + 本文档”为准

## 5. 建议的后续整理动作

### P0

- 统一 `docs/v0.1` 主文档编码
- 将实施状态正式并回一份干净的主状态文档
- 对所有新硬化路由跑一次项目级编译和类型检查

### P1

- 统一剩余路由到 `parseJsonRequestWithSchema`
- 对知识库/记忆/生成相关 API 补最小集成测试
- 做一次知识库视频导入到 PPT 导出的手工回归清单

### P2

- 清理历史 prompt / 注释 / 文案乱码
- 将“补丁式文档”合并成单一版本说明文档

## 6. 当前建议

如果下一步继续开发，不建议再新增更多零散状态文档。

更合理的方式是：

- 保留本次新增的干净审查文档
- 下一轮直接修复 `docs/v0.1` 旧文档编码
- 然后把实施状态并回一份正式主文档
