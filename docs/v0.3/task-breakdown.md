# OpenMAIC v0.3 开发任务拆解

## 1. 目标

把 `v0.3` 拆成可执行阶段，确保教师端 / 学生端视图、课堂删除、接口文档和导入导出命名规则可以按依赖顺序落地。

## 2. 阶段划分

### P0 教师端 / 学生端视图骨架

目标：

- 先把课堂页区分成教师端和学生端

任务：

1. 在课堂页引入 `view=teacher|student` 视图解析
2. 默认将无参数访问归一化为教师端
3. 仅教师端注入 `ClassroomOpsPanel`
4. 学生端隐藏“课堂操作”入口
5. 补齐教师端 / 学生端的最小页面测试

验收：

- 教师端可见“课堂操作”
- 学生端不可见“课堂操作”
- 两端课堂内容和播放体验一致

### P1 服务端课堂删除 API

目标：

- 打通课堂真值删除链路

任务：

1. 增加 `DELETE /api/classroom/:id`
2. 新增服务端课堂删除服务
3. 删除课堂 JSON、课堂资源目录、修订记录和关联中间产物
4. 补充不存在课堂和删除失败分支处理
5. 增加删除路由级测试

验收：

- 删除成功返回 `status=deleted`
- 删除后再次读取课堂返回不存在

### P2 首页删除接入服务端真值

目标：

- 让首页删除从“本地删除”变为“服务端删除 + 本地清理”

任务：

1. 改造首页删除逻辑，先调用 `DELETE /api/classroom/:id`
2. 删除成功后清理 IndexedDB 本地缓存
3. 删除成功后刷新课堂列表
4. 删除失败时给出明确提示
5. 增加列表删除交互回归测试

验收：

- 首页删除后刷新列表不再出现该课堂
- 服务端和本地缓存状态一致

### P3 导入导出文件名统一

目标：

- 将标准课程包命名统一为 `classroomId`

任务：

1. 导出任务结果的 `fileName` 改为 `{classroomId}.omaic-course.zip`
2. 下载接口的 `Content-Disposition` 文件名改为 `{classroomId}.omaic-course.zip`
3. 调整相关导出测试断言
4. 校验 `manifest.courseId` 与导出文件名一致
5. 保留导入对历史文件名的兼容能力

验收：

- 导出文件名稳定使用 `classroomId`
- 修改课堂标题后再次导出，文件名不变

### P4 文档与对外契约收口

目标：

- 完成 `v0.3` 的需求、设计、接口、测试发布文档

任务：

1. 更新 `requirements.md`
2. 更新 `api-spec.md`
3. 更新 `detailed-design.md`
4. 更新 `task-breakdown.md`
5. 更新 `implementation-test-deploy.md`

验收：

- 文档与真实实现路径、返回结构、命名规则一致

### P5 测试、构建与发布

目标：

- 完成最终回归和发版准备

任务：

1. 补齐服务层与路由层测试
2. 补齐关键 E2E
3. 执行 `tsc`
4. 执行 `eslint`
5. 执行 `vitest`
6. 执行 `docker compose build`
7. 完成人工验收

验收：

- 自动化测试通过
- Docker 构建通过
- 关键业务链路人工验收通过

## 3. 并行关系

可并行：

1. `P0` 的课堂页视图裁剪
2. `P1` 的服务端删除服务设计
3. `P3` 的导入导出命名规则调整
4. `P4` 的文档更新

强依赖：

1. `P2` 依赖 `P1`
2. `P5` 依赖前面所有阶段

## 4. 建议开发顺序

建议顺序：

1. `P0`
2. `P1`
3. `P2`
4. `P3`
5. `P4`
6. `P5`

原因：

1. 课堂视图区分是页面层最直接需求
2. 服务端删除是真值清理基础
3. 首页删除必须建立在服务端删除能力之上
4. 导出命名调整影响面相对集中，适合在主链路稳定后收口

## 5. 每阶段完成定义

每阶段完成前，至少满足：

1. 对应文档已更新
2. 关键接口或页面已落地
3. 有最小自动化测试
4. `tsc` 通过
5. `eslint` 通过

## 6. 建议分支切分

建议按功能拆分子分支：

1. `feature/classroom-teacher-student-view`
2. `feature/classroom-delete-api`
3. `feature/home-delete-server-sync`
4. `feature/course-package-filename-by-classroom-id`
5. `feature/v0.3-release-hardening`

统一合回：

- `dev/v0.3-classroom-view-api-cleanup`

## 7. 当前实现状态（截至 2026-04-01）

### P0

状态：未开始

说明：

1. 当前课堂页默认按教师端装配
2. `课堂操作` 已内嵌到统一右侧栏，但还没有学生端裁剪逻辑

### P1

状态：未开始

说明：

1. 当前 `app/api/classroom/[id]/route.ts` 已有 `GET`、`PATCH`
2. 尚未提供正式 `DELETE`

### P2

状态：未开始

说明：

1. 首页删除当前仍调用本地 `deleteStageData`
2. 服务端课堂真值删除尚未接入

### P3

状态：未开始

说明：

1. `v0.3` 已在文档中明确导出文件名改为 `classroomId`
2. 实际导出链路和测试仍需同步调整

### P4

状态：已完成文档初稿

已完成内容：

1. `requirements.md`
2. `api-spec.md`
3. `README.md`
4. 本文档
5. `implementation-test-deploy.md` 待补齐后即可形成完整文档包

### P5

状态：未开始
