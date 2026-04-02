# OpenMAIC v0.3 API 规格

## 1. 目标

`v0.3` 对外固定以下接口与页面访问约定：

1. 课堂页教师端 / 学生端视图
2. 课堂生成任务接口
3. 课堂列表与课堂详情接口
4. 课堂删除接口
5. 课程包导入导出命名规则

通用约定：

1. 所有 JSON 接口统一返回 `success`
2. 成功响应示例：

```json
{
  "success": true
}
```

3. 失败响应示例：

```json
{
  "success": false,
  "errorCode": "CLASSROOM_NOT_FOUND",
  "error": "Classroom not found"
}
```

4. 时间字段统一使用 ISO 8601，前端列表中的时间戳字段使用毫秒数

## 2. 课堂页访问约定

### 2.1 教师端

`GET /classroom/:id?view=teacher`

约束：

1. `view` 缺省时按 `teacher` 处理
2. 教师端显示课堂操作面板
3. 顶部悬浮控制包含：
   - 教师端
   - 学生端
   - 复制学生端链接
4. 该悬浮控制在课堂页顶部居中显示

### 2.2 学生端

`GET /classroom/:id?view=student`

约束：

1. 学生端不显示课堂操作面板
2. 学生端仍保留播放、翻页、笔记、对话等学习能力
3. 学生端链接固定为：

```text
/classroom/{id}?view=student
```

## 3. 课堂生成接口

### 3.1 创建课堂生成任务

`POST /api/generate-classroom`

请求体示例：

```json
{
  "type": "course",
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

可选请求头：

1. 模型配置
   - `x-model`
   - `x-api-key`
   - `x-base-url`
   - `x-provider-type`
   - `x-requires-api-key`
2. 图片生成配置
   - `x-image-provider`
   - `x-image-model`
   - `x-image-api-key`
   - `x-image-base-url`
3. 视频生成配置
   - `x-video-provider`
   - `x-video-model`
   - `x-video-api-key`
   - `x-video-base-url`
4. TTS 配置
   - `x-tts-provider`
   - `x-tts-voice`
   - `x-tts-speed`
   - `x-tts-api-key`
   - `x-tts-base-url`

说明：

1. 这些请求头会被持久化到后台任务
2. 后台 runner 必须沿用这组配置执行生成
3. 接口生成效果应与前端生成页保持同一生成策略，而不是退回服务器默认模型

成功响应示例：

```json
{
  "success": true,
  "jobId": "job_abc123",
  "classroomId": "cls_newton_001",
  "status": "queued",
  "step": "queued",
  "message": "Classroom generation job queued",
  "pollUrl": "http://localhost:3000/api/generate-classroom/job_abc123",
  "pollIntervalMs": 5000
}
```

约束：

1. `type` 允许 `course | knowledge`
2. 未传 `type` 时按 `course` 处理
3. 创建响应必须返回 `jobId` 与预分配的 `classroomId`

### 3.2 查询课堂生成任务

`GET /api/generate-classroom/:jobId`

成功完成响应示例：

```json
{
  "success": true,
  "jobId": "job_abc123",
  "classroomId": "cls_newton_001",
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
  "classroomId": "cls_newton_001",
  "status": "failed",
  "step": "failed",
  "progress": 73,
  "message": "Classroom generation failed",
  "error": "Model provider unavailable",
  "done": true
}
```

约束：

1. 成功态中的 `result.classroomId` 必须与创建响应中的 `classroomId` 一致
2. `result.url` 返回课堂基础地址，前端展示时应继续按 `?view=teacher|student` 组装最终访问链接
3. 课堂生成完成后，课堂数据会落到服务端持久化存储，可被首页列表发现

## 4. 课堂列表与课堂详情接口

### 4.1 获取课堂列表

`GET /api/classroom`

成功响应示例：

```json
{
  "success": true,
  "classrooms": [
    {
      "id": "cls_newton_001",
      "name": "生成一门面向高中生的牛顿第二定律互动课堂",
      "description": "",
      "sceneCount": 8,
      "createdAt": 1775117120342,
      "updatedAt": 1775116600726,
      "knowledgeBaseCount": 0,
      "memoryCount": 0,
      "preferKnowledgeVideos": false
    }
  ]
}
```

约束：

1. 返回服务端已持久化的课堂列表
2. 首页“最近课堂”需要合并：
   - 本地 IndexedDB 课堂
   - 该接口返回的服务端课堂
3. 合并时按 `id` 去重并按 `updatedAt` 倒序排列

### 4.2 获取单个课堂

`GET /api/classroom?id=:id`

成功响应示例：

```json
{
  "success": true,
  "classroom": {
    "id": "cls_newton_001",
    "stage": {
      "id": "cls_newton_001",
      "name": "生成一门面向高中生的牛顿第二定律互动课堂",
      "language": "zh-CN",
      "style": "professional"
    },
    "scenes": [],
    "createdAt": "2026-04-02T08:05:20.342Z"
  }
}
```

约束：

1. `stage.style` 与前端生成页保持一致，固定为 `professional`
2. `stage.name` 按前端同一标题提取规则生成
3. 若课堂包含自动生成角色，服务端持久化数据中可包含 `stage.generatedAgents`
4. 前端打开课堂时需要恢复这些 `generatedAgents`

## 5. 课堂删除接口

### 5.1 删除课堂

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

删除范围：

1. `data/classrooms/{id}.json`
2. `data/classrooms/{id}/`
3. `data/classroom-revisions/{id}/`
4. 与该课堂直接关联的导出、重制任务产物

删除后行为：

1. `GET /api/classroom?id={id}` 返回不存在
2. 首页刷新后不再显示该课堂
3. 前端本地缓存需要同步清理

## 6. 课程包命名约定

### 6.1 导出文件名

标准导出文件名：

```text
{classroomId}.omaic-course.zip
```

示例：

```text
cls_newton_001.omaic-course.zip
```

### 6.2 导入识别规则

1. 导入兼容历史文件名
2. 标准文档、测试和示例统一使用基于 `classroomId` 的命名
3. 导入识别以包内 `manifest` 与 `classroomId` 为准，不以课程标题推断

## 7. 兼容策略

1. 保持 `POST /api/generate-classroom` 与 `GET /api/generate-classroom/:jobId` 路径不变
2. 保持 `/classroom/{id}` 的教师端默认访问兼容
3. 新增的 `GET /api/classroom` 列表能力用于补齐服务端课堂在首页中的可见性
