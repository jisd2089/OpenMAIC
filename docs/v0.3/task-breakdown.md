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

## 2. 待实现项

### P5 课堂代码编辑器与代码运行

1. 在互动白板按钮右侧增加代码编辑器入口
2. 实现右侧代码工作台，并将编辑器与运行结果融合到同一页签
3. 新增或改造右侧“代码运行”页签
4. 增加代码会话和代码执行接口
5. 增加代码草稿本地持久化

### P6 沙箱适配层

1. 设计 `ClassroomCodeSandboxProvider` 抽象
2. 以 TypeScript 方式适配 `LocalSandboxProvider`
3. 以 TypeScript 方式适配 `AioSandboxProvider`
4. 增加运行时注册表和语言模板
5. 增加执行回收与资源限制策略

说明：

1. `v0.3` 当前不新增独立 Python 沙箱业务服务
2. 若后续需要平台化复用，再单独评估 Python 服务化路线

### P7 测试与部署补齐

1. 增加代码会话与代码执行接口测试
2. 增加 `local` / `aio` 双模式测试
3. 增加课堂页代码编辑器交互测试
4. 增加容器沙箱多语言测试矩阵
5. 增加资源限制、安全隔离、并发回收测试
6. 增加 Docker 部署校验项与上线抽样验收

## 3. 持续维护项

1. 文档口径与实现持续同步
2. 继续补足浏览器级 E2E
3. 后续若接入真实鉴权，再把教师端 / 学生端从“视图约束”升级到“权限约束”
