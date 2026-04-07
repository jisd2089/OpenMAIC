# OpenMAIC v0.1 文档索引

## 1. 当前建议阅读顺序

1. [current-baseline.md](/d:/Workspace/OpenMAIC/docs/v0.1/current-baseline.md)
2. [technical-decision.md](/d:/Workspace/OpenMAIC/docs/v0.1/technical-decision.md)
3. [schema-api-spec.md](/d:/Workspace/OpenMAIC/docs/v0.1/schema-api-spec.md)
4. [implementation-status-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/implementation-status-2026-03-26.md)
5. [review-summary-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/review-summary-2026-03-26.md)

## 2. 文档角色说明

- [current-baseline.md](/d:/Workspace/OpenMAIC/docs/v0.1/current-baseline.md)
  - 当前 `v0.1` 的唯一推荐基线。
  - 用于快速了解：做了什么、还有什么风险、下一步做什么。

- [technical-decision.md](/d:/Workspace/OpenMAIC/docs/v0.1/technical-decision.md)
  - 技术选型与和 `xagent` 的对比结论。

- [schema-api-spec.md](/d:/Workspace/OpenMAIC/docs/v0.1/schema-api-spec.md)
  - 数据表、API、错误码与统一约束。

- [implementation-status-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/implementation-status-2026-03-26.md)
  - 最近一轮输入契约与上下文硬化工作的补充状态。

- [review-summary-2026-03-26.md](/d:/Workspace/OpenMAIC/docs/v0.1/review-summary-2026-03-26.md)
  - 本轮实现审查、风险判断和文档整理说明。

## 3. 旧文档状态

以下文档保留，但当前更适合作为历史设计输入，不再建议单独作为最新事实来源：

- [requirements.md](/d:/Workspace/OpenMAIC/docs/v0.1/requirements.md)
- [detailed-design.md](/d:/Workspace/OpenMAIC/docs/v0.1/detailed-design.md)

原因：

- 旧文档在当前 PowerShell 默认输出下存在编码/显示异常迹象。
- 后续开发事实已经超出它们最初记录的版本截面。

## 4. 后续整理原则

- 不再新增零散“补丁式主文档”。
- 新实现优先并入 [current-baseline.md](/d:/Workspace/OpenMAIC/docs/v0.1/current-baseline.md)。
- 当旧文档完成编码清理后，再决定是否把当前基线内容并回历史文档。
