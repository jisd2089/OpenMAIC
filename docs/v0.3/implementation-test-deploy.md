# OpenMAIC v0.3 实现、测试与部署

## 1. 实现范围

`v0.3` 当前实现覆盖：

1. 教师端 / 学生端视图切换
2. 课堂生成任务返回 `classroomId`
3. 课堂生成链路与前端生成页配置对齐
4. 服务端课堂列表接口
5. 首页最近课堂合并本地与服务端课堂
6. 课堂删除接口
7. 导入导出文件命名与导出前持久化
8. 媒体完整性与导出相关修复

## 2. 已落地实现

### 2.1 课堂页

1. 路由固定使用 `?view=teacher|student`
2. 教师端显示课堂操作面板
3. 学生端隐藏课堂操作面板
4. 顶部教师端 / 学生端 / 复制学生端链接入口已移动到顶部居中

### 2.2 课堂生成

1. `POST /api/generate-classroom` 支持 `type = course | knowledge`
2. 创建响应返回 `jobId` 与 `classroomId`
3. 轮询成功态返回同一 `classroomId`
4. 后台任务保留请求头中的模型、媒体、TTS 配置
5. 服务端生成的 `stage.name`、`stage.style` 与前端生成页保持一致
6. 服务端持久化 `generatedAgents`，课堂页加载时恢复

### 2.3 首页最近课堂

1. 首页不再只依赖本地 IndexedDB
2. 增加 `GET /api/classroom` 作为服务端课堂列表接口
3. 首页合并显示本地课堂和服务端课堂
4. `curl` 创建并完成的课堂刷新首页后可见

### 2.4 导出与导入

1. 导出前自动保存当前课堂
2. 导出前同步图片、音频、视频等媒体引用
3. 导出文件名统一为 `{classroomId}.omaic-course.zip`

## 3. 测试要求

### 3.1 路由测试

必须覆盖：

1. `POST /api/generate-classroom` 创建响应包含 `classroomId`
2. `GET /api/generate-classroom/:jobId` 成功态包含 `result.classroomId`
3. `GET /api/classroom` 返回服务端课堂列表
4. `DELETE /api/classroom/:id` 成功 / 404

### 3.2 前端行为验证

必须人工验证：

1. 顶部教师端 / 学生端 / 复制学生端链接位于顶部居中
2. 教师端与学生端切换正常
3. 首页能看到接口生成的课堂
4. 点击首页课堂卡片能进入课堂

### 3.3 导出链路验证

1. 导出课程包不再报 `Classroom not found`
2. 导出课程包后重新导入，图片、音频、视频资源完整

## 4. 部署检查

发布前至少执行：

1. `pnpm exec eslint`
2. `pnpm exec vitest run`
3. `docker compose up -d --build`

上线后至少人工检查：

1. 首页列表是否包含服务端课堂
2. `curl` 创建课程后首页是否可见
3. 课堂页顶部布局是否正确
4. 教师端和学生端链接是否可正常打开
