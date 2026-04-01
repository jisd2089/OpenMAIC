# OpenMAIC v0.3 文档索引

## 1. 当前文档

1. [requirements.md](./requirements.md)
2. [api-spec.md](./api-spec.md)
3. [detailed-design.md](./detailed-design.md)
4. [task-breakdown.md](./task-breakdown.md)
5. [implementation-test-deploy.md](./implementation-test-deploy.md)

## 2. 建议阅读顺序

1. 先读 [requirements.md](./requirements.md)
2. 再读 [api-spec.md](./api-spec.md)
3. 再读 [detailed-design.md](./detailed-design.md)
4. 再读 [task-breakdown.md](./task-breakdown.md)
5. 最后读 [implementation-test-deploy.md](./implementation-test-deploy.md)

## 3. 版本范围

`v0.3` 当前聚焦三项能力：

1. 课堂页区分教师端和学生端
2. 提供课堂生成与课堂删除 API 及配套文档
3. 统一课堂导入、导出文件名为 `classroomId`

## 4. 说明

本版本默认延续 `v0.2` 已有课堂播放、笔记、对话、版本快照、导入导出和重制能力。

`v0.3` 的新增点主要是：

1. 将课堂页抽象为两种访问视图
2. 将课堂生成和课堂删除沉淀为稳定、可对接的接口契约
3. 统一课堂导入、导出文件包命名规则，避免名称漂移
