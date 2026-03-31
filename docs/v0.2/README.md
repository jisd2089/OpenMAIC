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

截至 `2026-03-31`，`v0.2` 当前实现状态已更新为：

- `P0` 已完成最小可用版本
  - 已支持课程结构包导出、导入、后台任务状态查询、导出下载与导入应用
- `P1` 已部分完成
  - 已落地部分真实资源打包与导入重写
  - 完整的 `poster/whiteboards/checksums` 仍需继续补齐
- `P2` 已落地核心保存链路
  - 课堂页已具备保存草稿、发布、导出、快照、提示词重制统一入口
  - `课堂操作` 已并入右侧栏，作为与 `笔记`、`对话` 同级的切换入口，避免遮挡左侧幻灯片导航
  - `重制当前页` 已补齐服务端真值前置保存与左侧页面联动显示
- `P3` 已完成核心快照能力
  - 已支持快照创建、列表、恢复
- `P4` 已完成核心重制链路
  - 已支持单页/整课重制、结果预览、应用与丢弃
  - 已补齐重制应用后的系统版本留档，可在恢复历史版本后重新切回某次已应用的重制结果
  - 已补齐基于已配置可用模型的 LLM、图片/视频、TTS 重制链路
  - 已统一重制阶段与常规生成阶段的图片、视频、TTS 服务端实现、参数归一化与日志格式
- `P5` 仍在收口阶段
  - 完整测试、Docker 构建和人工验收仍需继续完成
  - 已修复 `course-regeneration.ts` 中导致 `docker compose build` 失败的 `SceneOutline[]` TypeScript 类型问题
  - 已收敛 KaTeX `newLineInDisplayMode` 公式严格模式告警，避免重制与白板渲染阶段日志刷屏

近期已完成的补充修复：

1. 修复前端关键页面 UTF-8 编码与中文乱码问题
2. 修复已配置 provider 但 `modelId` 为空时无法进入课堂的问题
3. 调整 `课堂操作` 交互，并入 `笔记 / 对话` 同级切换，避免遮挡左侧幻灯片导航
4. 修复“重制当前页”前的服务端真值保存、左侧页面联动与失败日志补充
5. 修复重制应用后无法作为独立历史版本恢复的问题
6. 将重制链路扩展为优先使用已配置可用的 LLM、图片/视频、TTS 模型
7. 修复 `course-regeneration.ts` 的 TypeScript 类型错误，消除当前 Docker 构建阻塞
8. 将重制阶段的图片、视频、TTS 生成统一到与常规生成一致的服务端实现与日志口径
9. 收敛 KaTeX `newLineInDisplayMode` 告警，避免公式渲染阶段反复输出兼容性警告

当前建议优先继续：

1. 补齐资源包剩余资产类型与完整性校验
2. 落地“播放态 / 编辑态”分离的手动编辑当前页方案，并补齐未保存提示
3. 强化 `selection` 级重制入口与 `preserveManualEdits` 的细粒度覆盖策略
4. 补齐重制预览资源清理与失败补偿
5. 完成 `P5` 的完整测试、构建与验收
