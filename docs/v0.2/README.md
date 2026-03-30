# OpenMAIC v0.2 文档索引

## 1. 当前文档

1. [requirements.md](/d:/gitlab/OpenMAIC/docs/v0.2/requirements.md)
2. [detailed-design.md](/d:/gitlab/OpenMAIC/docs/v0.2/detailed-design.md)
3. [implementation-test-deploy.md](/d:/gitlab/OpenMAIC/docs/v0.2/implementation-test-deploy.md)
4. [api-spec.md](/d:/gitlab/OpenMAIC/docs/v0.2/api-spec.md)
5. [task-breakdown.md](/d:/gitlab/OpenMAIC/docs/v0.2/task-breakdown.md)

## 2. 建议阅读顺序

1. 先读 [requirements.md](/d:/gitlab/OpenMAIC/docs/v0.2/requirements.md)
2. 再读 [detailed-design.md](/d:/gitlab/OpenMAIC/docs/v0.2/detailed-design.md)
3. 再读 [api-spec.md](/d:/gitlab/OpenMAIC/docs/v0.2/api-spec.md)
4. 再读 [task-breakdown.md](/d:/gitlab/OpenMAIC/docs/v0.2/task-breakdown.md)
5. 最后读 [implementation-test-deploy.md](/d:/gitlab/OpenMAIC/docs/v0.2/implementation-test-deploy.md)

## 3. 版本范围

`v0.2` 当前目标聚焦两项能力：

- 课程导入导出
- 生成课件后的人工介入修改

人工介入修改包含两条路径：

- 直接编辑已有课件
- 通过对话窗口提示词重新制作课件

## 4. 规范约束

`v0.2` 的开发分支、合并、测试、发布流程统一遵循：

- [branch-management.md](/d:/gitlab/OpenMAIC/docs/branch-management.md)

## 5. 当前实现状态

截至 `2026-03-27`，`v0.2` 已完成的代码实现如下：

- `P0` 已完成最小可用版本
  - 已支持课程结构包导出
  - 已支持课程结构包导入
  - 已支持导入导出后台任务与状态查询
  - 已支持导出下载和导入应用
- 当前实现仍属于“结构包优先”
  - 已包含 `manifest.json`、`stage.json`、`scenes.json`、`context.json`
  - `assets/` 目录已预留，但真实媒体资产打包与重写尚未完成
- 自动化验证已覆盖 `P0` 主链路
  - 课程导出任务创建、执行、查询、下载
  - 课程导入任务创建、校验、应用
  - 导入后 classroom 落盘校验

当前建议直接按以下顺序继续：

1. `P1` 真实媒体资产导入导出
2. `P2` 直接编辑
3. `P3` 版本快照
4. `P4` 提示词重制
