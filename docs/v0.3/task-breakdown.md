# OpenMAIC v0.3 任务拆解

## 1. 已完成项

### P0 课堂页视图区分

1. 引入 `view=teacher|student`
2. 默认视图保持 `teacher`
3. 学生端隐藏课堂操作面板

### P1 课堂真值接口

1. `POST /api/generate-classroom`
2. `GET /api/generate-classroom/:jobId`
3. `GET /api/classroom`
4. `GET /api/classroom?id=:id`
5. `DELETE /api/classroom/:id`

### P2 首页最近课堂与服务端真值打通

1. 首页合并本地课堂与服务端课堂
2. 接口生成的课堂在首页可见
3. 首页可点击进入服务端课堂

### P3 导出链路修复

1. 导出前持久化课堂
2. 导出包命名统一为 `{classroomId}.omaic-course.zip`
3. 导出媒体完整性补齐

### P4 关键问题修复

1. 课程播放引擎生命周期修复
2. 导出 `Classroom not found` 修复
3. 导出媒体丢失修复
4. `fetch` 非法调用修复

## 2. 持续维护项

1. 文档口径与实现持续同步
2. 继续补足浏览器级 E2E
3. 后续若接入真实鉴权，再把教师端 / 学生端从“视图约束”升级到“权限约束”
