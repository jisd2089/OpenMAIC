# OpenMAIC v0.3 API 规格

## 1. 目标

`v0.3` 对外固定以下接口与页面访问约定：

1. 课堂页教师端 / 学生端视图
2. 课堂生成任务接口
3. 课堂列表与课堂详情接口
4. 课堂删除接口
5. 课堂代码编辑与运行接口
6. 课程包导入导出命名规则

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
5. 画布工具栏中提供“代码编辑器”按钮，位置在“互动白板”按钮右侧
6. 右侧菜单包含：
   - 笔记
   - 对话
   - 课堂操作
   - 代码运行
7. “代码运行”页签承载统一代码工作台，页面内同时包含代码编辑区与运行结果区；代码编辑器按钮只负责切换并聚焦该页签

### 2.2 学生端

`GET /classroom/:id?view=student`

约束：

1. 学生端不显示课堂操作面板
2. 学生端仍保留播放、翻页、笔记、对话等学习能力
3. 学生端仍可使用代码编辑器与代码运行页签
4. 学生端链接固定为：

```text
/classroom/{id}?view=student
```

### 2.3 左侧 PPT 导航条

约束：

1. 课堂页左侧导航改为固定窄轨式场景导航，不再使用大缩略图卡片列表作为默认形态
2. 导航轨道默认宽度控制在 `72px` 到 `88px`
3. 每个场景在轨道上展示一个圆点节点
4. 当前场景使用高亮紫色空心圆 + 中心实点表示
5. 底部固定显示当前页码与总页数，例如 `1/18`
6. 点击节点后必须切换到对应场景
7. hover 或 focus 节点时可显示轻量预览卡，但预览卡不改变窄轨主体布局
8. 样式改版只影响导航容器视觉，不改变翻页、自动播放、PPT 指示效果和当前场景真值

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
4. `type` 字段必须原样透传到后续 Dify 同步元数据中，作为 `metadata.type`

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
4. 若部署启用了 Dify 发布，课堂生成成功后必须异步触发课件同步；外部同步失败不得反向把课堂生成任务改写为 `failed`

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

### 4.3 获取课堂外部同步状态

`GET /api/classroom/:id/publish-status`

成功响应示例：

```json
{
  "success": true,
  "classroomId": "cls_newton_001",
  "targets": [
    {
      "provider": "dify",
      "enabled": true,
      "status": "indexing",
      "targetBaseUrl": "https://difytestapi.zhizuobiao.com/v1",
      "datasetId": "1d2405b1-910a-4820-b06a-ad61b377c1a1",
      "documentId": "4d54b7ca-d170-482a-85b6-7be5222c1d50",
      "documentName": "OpenMAIC Courseware Sync",
      "triggerSource": "generate",
      "metadata": {
        "classroom": "gJsjGFbKau",
        "type": "knowledge",
        "title": "C语言数据结构"
      },
      "batchId": "20250306150245647595",
      "remoteIndexingStatus": "splitting",
      "lastSyncedAt": "2026-04-10T08:00:00.000Z",
      "errorMessage": null
    }
  ]
}
```

约束：

1. 该接口返回课堂当前所有外部发布目标的最新状态
2. `provider=dify` 时必须返回 `datasetId` 与 `documentId`
3. `provider=dify` 时必须返回 `metadata.classroom`、`metadata.type`、`metadata.title`
4. 状态至少覆盖：`idle | queued | syncing | indexing | completed | failed | skipped`
5. 若 Dify 未启用，接口仍返回 `provider=dify`，但 `enabled=false`
6. `triggerSource` 至少覆盖：`generate | regenerate | publish | manual`
7. `triggerSource=generate` 表示课堂生成成功且完成服务端持久化后异步入队
8. `triggerSource=publish` 表示用户在“课堂操作”-“发布”后，服务端持久化成功再异步入队
9. `status=skipped` 时表示 `contentHash` 未变化，本次未再次调用 Dify 更新接口
10. `v0.3` 的 Dify 同步采用“一课一文档”语义：每个 `classroomId` 在同一 `datasetId` 下必须绑定一个独立 `documentId`
11. 首次同步时若该课堂尚无远端文档，服务端必须先创建 Dify 文档，再回写 `documentId` 与 `documentName`
12. 后续同步必须优先复用该课堂已绑定的 `documentId`，不得把多个课堂反复写入同一个固定 Dify 文档

“一课一文档”补充返回约束：

```json
{
  "provider": "dify",
  "datasetId": "1d2405b1-910a-4820-b06a-ad61b377c1a1",
  "documentId": "doc_7f4d2f9f8e7b4a1b",
  "documentName": "[knowledge] C语言数据结构 (gJsjGFbKau)"
}
```

说明：
1. `documentId` 为课堂专属远端文档标识
2. `documentName` 推荐由 `type + title + classroomId` 组成，保证列表页可直接识别来源课堂
3. 在首次入队但远端尚未创建完成前，`documentId` 可暂时为空；一旦 Dify 创建成功，后续状态查询必须返回稳定值

### 4.4 手动触发 Dify 同步

`POST /api/classroom/:id/publish/dify`

请求体示例：

```json
{
  "force": true
}
```

成功响应示例：

```json
{
  "success": true,
  "classroomId": "cls_newton_001",
  "provider": "dify",
  "status": "queued",
  "triggerSource": "manual"
}
```

约束：

1. 该接口用于手动重试或强制重发课件到 Dify
2. `force=false` 时，若课堂内容哈希未变化，服务端可直接返回 `skipped`
3. `force=true` 时，即使内容哈希未变化也必须重新发起一次远端更新
4. 该接口只允许服务端持有的 Dify 配置生效，浏览器不得自带外部 API Key
5. 该接口的默认触发源为“课堂操作”-“发布”，服务端记录 `triggerSource=publish`
6. 若该课堂尚未在 Dify 创建专属文档，则本接口首次执行必须走“创建文档”分支，而不是依赖固定 `documentId`

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

## 6. 课堂代码编辑与运行接口

本节为 `v0.3` 补充需求的目标契约，用于指导后续实现。

### 6.1 创建或恢复代码会话

`POST /api/classroom/:id/code-sessions`

请求体示例：

```json
{
  "sceneId": "scene_001",
  "clientSessionId": "browser_abc123"
}
```

成功响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "classroomId": "cls_newton_001",
  "sceneId": "scene_001",
  "providerMode": "aio",
  "status": "ready",
  "supportedLanguages": [
    {
      "id": "python",
      "label": "Python",
      "defaultFileName": "main.py",
      "previewMode": "terminal"
    },
    {
      "id": "html",
      "label": "HTML",
      "defaultFileName": "index.html",
      "previewMode": "web"
    }
  ],
  "draft": {
    "language": "python",
    "entrypoint": "main.py",
    "files": [
      {
        "path": "main.py",
        "content": "print(\"hello\")"
      }
    ],
    "stdin": ""
  }
}
```

约束：

1. 会话按 `classroomId + sceneId + clientSessionId` 隔离
2. 默认恢复该浏览器当前场景的最近一次代码草稿
3. 会话存储不直接写入课堂主 JSON
4. `providerMode` 由服务端部署配置决定，不接受前端随意覆盖
5. 当 `providerMode=aio` 时，服务端只维护一个全局共享沙箱容器；不同浏览器客户端仍通过各自会话工作区隔离文件与运行上下文，但不再为每个会话单独启动容器

### 6.2 保存代码草稿

`PUT /api/classroom/:id/code-sessions/:sessionId`

请求体示例：

```json
{
  "language": "python",
  "entrypoint": "main.py",
  "files": [
    {
      "path": "main.py",
      "content": "print(\"hello, classroom\")"
    }
  ],
  "stdin": ""
}
```

成功响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "savedAt": "2026-04-02T10:00:00.000Z"
}
```

### 6.3 运行代码

`POST /api/classroom/:id/code-sessions/:sessionId/run`

请求体示例：

```json
{
  "language": "python",
  "entrypoint": "main.py",
  "files": [
    {
      "path": "main.py",
      "content": "print(\"hello\")"
    }
  ],
  "stdin": ""
}
```

成功响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "executionId": "exec_001",
  "status": "running",
  "resultTab": "code-run",
  "pollUrl": "http://localhost:3000/api/classroom/cls_newton_001/code-sessions/code_session_001/executions/exec_001"
}
```

约束：

1. 调用运行后，前端自动切换或高亮右侧“代码运行”页签，并在同一工作台内展示编辑与结果联动
2. 若语言为 Web 预览模式，结果应可映射为预览地址或 iframe 预览源
3. 运行时必须记录 `stdout`、`stderr`、退出码和开始结束时间

### 6.4 查询运行结果

`GET /api/classroom/:id/code-sessions/:sessionId/executions/:executionId`

成功响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "executionId": "exec_001",
  "status": "succeeded",
  "language": "python",
  "exitCode": 0,
  "stdout": "hello\n",
  "stderr": "",
  "preview": {
    "mode": "terminal",
    "url": null
  },
  "artifacts": [],
  "startedAt": "2026-04-02T10:00:01.000Z",
  "finishedAt": "2026-04-02T10:00:03.000Z"
}
```

失败响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "executionId": "exec_001",
  "status": "failed",
  "language": "cpp",
  "exitCode": 1,
  "stdout": "",
  "stderr": "Compilation failed",
  "preview": {
    "mode": "terminal",
    "url": null
  }
}
```

### 6.5 释放代码会话

`DELETE /api/classroom/:id/code-sessions/:sessionId`

成功响应示例：

```json
{
  "success": true,
  "sessionId": "code_session_001",
  "status": "released"
}
```

约束：

1. `LocalSandboxProvider` 模式下释放逻辑只清理会话索引，不强制销毁全局宿主沙箱
2. `AioSandboxProvider` 模式下释放逻辑只释放会话状态，不停止全局共享沙箱容器
3. `AioSandboxProvider` 的容器级生命周期独立于单个浏览器会话；会话释放、刷新或切换场景都不应触发共享容器退出

## 7. 课程包命名约定

### 7.1 导出文件名

标准导出文件名：

```text
{classroomId}.omaic-course.zip
```

示例：

```text
cls_newton_001.omaic-course.zip
```

### 7.2 导入识别规则

1. 导入兼容历史文件名
2. 标准文档、测试和示例统一使用基于 `classroomId` 的命名
3. 导入识别以包内 `manifest` 与 `classroomId` 为准，不以课程标题推断

## 8. 兼容策略

1. 保持 `POST /api/generate-classroom` 与 `GET /api/generate-classroom/:jobId` 路径不变
2. 保持 `/classroom/{id}` 的教师端默认访问兼容
3. 新增的 `GET /api/classroom` 列表能力用于补齐服务端课堂在首页中的可见性
4. 代码编辑器新增为课堂页增强能力，不改变既有播放、笔记、对话和课堂操作主链路
