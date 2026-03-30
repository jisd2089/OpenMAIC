# OpenMAIC 开发分支管理规范

## 1. 目的

本规范适用于 OpenMAIC 后续所有版本开发。目标只有三个：

- 保持 `main` 可发布
- 降低多人并行开发冲突
- 让每次功能开发、测试、发布都有清晰边界

## 2. 分支类型

- `main`
  - 生产基线分支
  - 只接受经过评审和验证的合并，不直接开发
- `dev/vX.Y-<topic>`
  - 版本开发分支
  - 用于一个明确版本范围内的一组相关需求开发
  - 示例：`dev/v0.2-course-import-editing`
- `feature/<topic>`
  - 较小功能或独立子任务分支
  - 从对应版本开发分支切出
  - 示例：`feature/course-export-package`
- `fix/<topic>`
  - 非紧急缺陷修复分支
  - 从当前开发目标分支切出
- `hotfix/<topic>`
  - 线上紧急修复分支
  - 从 `main` 切出，完成后同时回合并到 `main` 和对应开发分支
- `release/vX.Y`
  - 版本冻结和验收分支
  - 只做发布前修复，不继续堆新功能

## 3. 基本规则

- 禁止直接在 `main` 上开发和提交
- 每次开始开发前，先同步远端最新目标分支
- 一个分支只承载一个明确主题，不混做无关需求
- 功能未完成前，不把半成品直接合回 `main`
- 所有合并优先使用 PR，不直接强推主分支
- 本地有大改动时，先提交或 `stash`，再合并远端最新代码

## 4. 创建规则

### 4.1 版本开发

从 `main` 最新代码切版本开发分支：

```bash
git checkout main
git pull origin main
git checkout -b dev/v0.2-course-import-editing
```

### 4.2 子功能开发

从版本开发分支切子功能分支：

```bash
git checkout dev/v0.2-course-import-editing
git pull origin dev/v0.2-course-import-editing
git checkout -b feature/course-export-package
```

## 5. 合并规则

### 5.1 日常同步

开发过程中，分支需要定期合并目标分支最新代码：

```bash
git fetch origin
git merge origin/main
```

或子功能分支同步版本开发分支：

```bash
git fetch origin
git merge origin/dev/v0.2-course-import-editing
```

规则：

- 优先 `merge`，不要在共享分支上频繁改写历史
- 出现冲突时，先解决冲突再继续开发
- 冲突解决后必须重新做最小回归验证

### 5.2 合并到版本分支

子功能分支合入版本开发分支前，至少满足：

- 代码已自测
- `tsc` 通过
- `eslint` 通过
- 相关 `vitest` 通过
- 变更说明清楚

### 5.3 合并到主分支

版本开发分支合入 `main` 前，至少满足：

- 版本范围功能完成
- 文档同步完成
- 回归测试通过
- Docker 构建通过
- 关键链路人工验证通过

## 6. 提交规范

提交信息保持简洁、可读、可追溯。

推荐前缀：

- `feat:` 新功能
- `fix:` 缺陷修复
- `refactor:` 重构
- `test:` 测试
- `docs:` 文档
- `chore:` 构建、脚本、依赖等杂项

示例：

```text
feat: add course export package support
fix: persist classroom draft revisions correctly
test: add regenerate workflow integration tests
docs: add v0.2 implementation and deployment guide
```

## 7. 推送前检查

默认要求：

```bash
corepack pnpm install
npx tsc --noEmit
npx eslint .
node_modules/.bin/vitest.cmd run
```

涉及构建、镜像、运行环境时，额外执行：

```bash
docker compose build
```

涉及关键页面或复杂交互时，补人工验证：

- 课程生成
- 知识库 / 记忆
- PPT 导出
- 课程导入 / 导出
- 人工编辑 / 提示词重制

## 8. PR 要求

PR 描述至少包含：

- 变更范围
- 影响模块
- 测试结果
- 是否有数据结构或存储格式变化
- 是否需要部署或迁移步骤

建议模板：

```text
Summary
- ...

Scope
- ...

Validation
- tsc
- eslint
- vitest
- docker compose build

Risk
- ...
```

## 9. 发布与回滚

- 发布前从版本开发分支切 `release/vX.Y`
- 发布分支只允许修复阻断问题
- 发布完成后：
  - 合并到 `main`
  - 回合并到仍在继续开发的版本分支
- 如需回滚，以 `main` 上最后稳定提交为基准，不在生产环境临时拼补丁

## 10. 执行约束

- 后续所有版本默认遵循本规范
- 如需例外，必须在对应版本文档中明确写明原因和替代流程
- 若规范与紧急线上故障处理冲突，以恢复服务为先，但事后必须补齐回合并和文档记录
