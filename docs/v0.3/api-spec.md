# OpenMAIC v0.3 API 规格

## 1. 目标

本文件定义 `v0.3` 需要对外明确的接口契约，覆盖：

1. 课堂生成
2. 课堂删除
3. 教师端 / 学生端课堂页访问约定
4. 课堂导入、导出文件命名约定

默认约定：

1. 所有 JSON 接口统一返回 `apiSuccess / apiError`
2. 成功响应格式为：

```json
{
  "success": true
}
```

3. 失败响应格式为：

```json
{
  "success": false,
  "errorCode": "CLASSROOM_NOT_FOUND",
  "error": "Classroom not found"
}
```

4. 时间字段使用 ISO 8601
5. 标识字段如 `classroomId`、`jobId` 均为字符串

## 2. 课堂页访问约定

`v0.3` 需要固定教师端 / 学生端的访问约定。推荐约定如下：

### 2.1 教师端

`GET /classroom/:id?view=teacher`

说明：

1. `view` 缺省时按 `teacher` 处理
2. 教师端显示完整课堂操作能力

### 2.2 学生端

`GET /classroom/:id?view=student`

说明：

1. 学生端不显示“课堂操作”
2. 学生端保留课堂播放、页面导航、笔记、对话等只读学习体验

## 3. 课堂生成接口

`v0.3` 推荐继续兼容当前异步任务模式，但必须保证调用方可以从成功响应中直接获取 `classroomId`。

### 3.1 创建课堂生成任务

`POST /api/generate-classroom`

请求示例：

```json
{
  "requirement": "生成一门面向高中生的牛顿第二定律互动课堂",
  "language": "zh-CN",
  "scopeId": "scope-default",
  "knowledgeBaseIds": [],
  "memoryIds": [],
  "enableKnowledgeRetrieval": false,
  "enableMemoryRetrieval": false,
  "preferKnowledgeVideos": false
}
```

成功响应示例：

```json
{
  "success": true,
  "jobId": "job_abc123",
  "status": "queued",
  "step": "queued",
  "message": "Classroom generation job queued",
  "pollUrl": "http://localhost:3000/api/generate-classroom/job_abc123",
  "pollIntervalMs": 5000
}
```

说明：

1. 创建接口可以先返回 `jobId`
2. 若采用异步任务模式，`classroomId` 在任务成功态返回

### 3.2 查询课堂生成任务

`GET /api/generate-classroom/:jobId`

成功完成响应示例：

```json
{
  "success": true,
  "jobId": "job_abc123",
  "status": "succeeded",
  "step": "completed",
  "progress": 100,
  "message": "Classroom generation completed",
  "pollUrl": "http://localhost:3000/api/generate-classroom/job_abc123",
  "pollIntervalMs": 5000,
  "scenesGenerated": 12,
  "totalScenes": 12,
  "result": {
    "classroomId": "cls_newton_001",
    "url": "http://localhost:3000/classroom/cls_newton_001",
    "scenesCount": 12
  },
  "done": true
}
```

失败响应示例：

```json
{
  "success": true,
  "jobId": "job_abc123",
  "status": "failed",
  "step": "failed",
  "progress": 73,
  "message": "Classroom generation failed",
  "error": "Model provider unavailable",
  "done": true
}
```

约束：

1. 当 `status = succeeded` 时，`result.classroomId` 必须存在
2. 当 `status = succeeded` 时，`result.url` 必须存在
3. 调用方不得依赖页面跳转来获取 `classroomId`

## 4. 课堂删除接口

`v0.3` 新增统一的服务端课堂删除接口。

### 4.1 删除课堂

`DELETE /api/classroom/:id`

成功响应示例：

```json
{
  "success": true,
  "classroomId": "cls_newton_001",
  "status": "deleted",
  "deletedAt": "2026-04-01T10:00:00.000Z"
}
```

失败响应示例：

```json
{
  "success": false,
  "errorCode": "CLASSROOM_NOT_FOUND",
  "error": "Classroom not found"
}
```

### 4.2 删除范围

删除课堂时，系统必须删除与该课堂直接关联的服务端资源，包括至少：

1. `data/classrooms/{id}.json`
2. `data/classrooms/{id}/` 目录下的课堂媒体和音频资源
3. `data/classroom-revisions/{id}/` 目录下的快照或修订记录
4. 与该课堂直接关联的重制预览、草稿或中间结果

系统不得删除以下共享资源：

1. 知识库本体
2. 记忆本体
3. 其它课堂的数据目录

### 4.3 删除后行为

删除成功后，系统必须满足：

1. `GET /api/classroom/:id` 返回“课堂不存在”
2. 首页若展示该课堂，刷新后不再显示
3. 本地缓存若存在该课堂副本，应在前端调用成功后同步清理

## 5. 错误约定

推荐至少覆盖以下错误码：

1. `INVALID_REQUEST`
2. `CLASSROOM_NOT_FOUND`
3. `INTERNAL_ERROR`
4. `GENERATION_FAILED`

## 6. 课堂导入、导出文件命名约定

### 6.1 导出文件名

`v0.3` 要求课堂导出下载文件名统一为：

`{classroomId}.omaic-course.zip`

示例：

`cls_newton_001.omaic-course.zip`

约束：

1. 文件名主键必须使用 `classroomId`
2. 不再使用课堂标题、课程名或其它易变展示字段作为导出文件主名
3. HTTP 下载响应中的 `Content-Disposition.filename` 应与上述规则一致

### 6.2 导入文件名

课堂导入需兼容上述标准命名文件：

`{classroomId}.omaic-course.zip`

说明：

1. 导入接口可接收历史命名文件作为兼容输入
2. `v0.3` 对外文档、测试样例和标准示例统一使用基于 `classroomId` 的文件名
3. 导入识别以包内 `manifest` 和 `classroomId` 为准，而不是以课堂标题推断

## 7. 兼容策略

1. 保持现有 `POST /api/generate-classroom` 与 `GET /api/generate-classroom/:jobId` 路径不变
2. 在不破坏现有异步任务模型的前提下，明确“成功态必须返回 `classroomId`”
3. 新增 `DELETE /api/classroom/:id` 作为统一服务端删除入口
4. 教师端视图保持现有课堂页默认行为，学生端在同一课堂真值上进行只读化裁剪
5. 课堂导出下载文件名从课程标题等展示名收敛为 `classroomId`
6. 课堂导入继续兼容历史文件名，但 `v0.3` 起标准命名以 `classroomId` 为准
