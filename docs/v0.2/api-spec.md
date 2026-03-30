# OpenMAIC v0.2 API 规格

## 1. 目标

本文件定义 `v0.2` 新增接口的请求、响应和错误约定，覆盖：

- 课程导入导出
- 课程直接编辑保存
- 课程版本快照
- 提示词重制

默认约定：

- 所有 JSON 接口统一返回 `apiSuccess / apiError`
- 时间字段使用 ISO 8601
- 任务类接口统一返回 `jobId`、`status`、`step`、`message`
- 版本标识、课程标识、任务标识均为字符串

## 2. 通用类型

### 2.1 课程包 Manifest

```ts
interface CoursePackageManifest {
  format: 'openmaic-course';
  version: number;
  exportedAt: string;
  sourceAppVersion?: string;
  courseId: string;
  courseName: string;
  sceneCount: number;
  assetCount: number;
  includesAssets: boolean;
  hashAlgorithm?: 'sha256';
}
```

### 2.2 导出任务

```ts
interface CourseExportJob {
  id: string;
  classroomId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  step: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  result?: {
    fileName: string;
    downloadUrl: string;
    manifest: CoursePackageManifest;
  };
  error?: string;
}
```

### 2.3 导入任务

```ts
interface CourseImportJob {
  id: string;
  status: 'pending' | 'running' | 'validated' | 'succeeded' | 'failed';
  step: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  uploadedFileName: string;
  validation?: {
    manifest: CoursePackageManifest;
    warnings?: string[];
  };
  result?: {
    classroomId: string;
    url: string;
  };
  error?: string;
}
```

### 2.4 课程快照

```ts
interface ClassroomRevision {
  id: string;
  classroomId: string;
  source: 'manual-save' | 'pre-regenerate' | 'pre-import-apply' | 'system';
  summary?: string;
  createdAt: string;
  createdBy?: string;
}
```

### 2.5 提示词重制任务

```ts
interface ClassroomRegenerationJob {
  id: string;
  classroomId: string;
  status: 'pending' | 'running' | 'preview-ready' | 'applied' | 'discarded' | 'failed';
  step: string;
  message?: string;
  targetType: 'classroom' | 'scene' | 'selection';
  targetId?: string;
  regenerateMode: 'text' | 'layout' | 'media' | 'full';
  preserveManualEdits: boolean;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  preview?: {
    stage?: unknown;
    scenes?: unknown[];
    changedSceneIds?: string[];
  };
  result?: {
    applied: boolean;
    classroomId: string;
  };
  error?: string;
}
```

## 3. 课程导出接口

### 3.1 创建导出任务

`POST /api/classroom/:id/export`

请求：

```json
{
  "includeAssets": true,
  "includeContext": true,
  "includeRevisions": false
}
```

响应：

```json
{
  "success": true,
  "data": {
    "jobId": "exp_123",
    "status": "pending",
    "step": "queued",
    "message": "Export job created"
  }
}
```

校验：

- `id` 必须是合法 classroom id
- `includeAssets` 缺省为 `true`
- `includeContext` 缺省为 `true`
- `includeRevisions` 缺省为 `false`

### 3.2 查询导出任务

`GET /api/classroom/:id/export/:jobId`

响应：

```json
{
  "success": true,
  "data": {
    "job": {
      "id": "exp_123",
      "classroomId": "cls_1",
      "status": "succeeded",
      "step": "packaged",
      "result": {
        "fileName": "Physics.omaic-course.zip",
        "downloadUrl": "/api/classroom/cls_1/export/exp_123/download",
        "manifest": {
          "format": "openmaic-course",
          "version": 2,
          "exportedAt": "2026-03-27T10:00:00.000Z",
          "courseId": "cls_1",
          "courseName": "Physics",
          "sceneCount": 12,
          "assetCount": 18,
          "includesAssets": true
        }
      }
    }
  }
}
```

### 3.3 下载导出包

`GET /api/classroom/:id/export/:jobId/download`

响应：

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="<course>.omaic-course.zip"`

错误：

- 任务不存在
- 任务未完成
- 文件不存在

## 4. 课程导入接口

### 4.1 上传课程包

`POST /api/classroom/import`

请求：

- `multipart/form-data`
- 字段：
  - `file`
  - `strategy`，可选：`create-new | duplicate`

响应：

```json
{
  "success": true,
  "data": {
    "jobId": "imp_123",
    "status": "pending",
    "step": "uploaded",
    "message": "Import job created"
  }
}
```

校验：

- 文件后缀必须是 `.zip` 或 `.omaic-course.zip`
- 文件大小受服务端限制

### 4.2 查询导入任务

`GET /api/classroom/import/:jobId`

响应：

```json
{
  "success": true,
  "data": {
    "job": {
      "id": "imp_123",
      "status": "validated",
      "step": "validated",
      "uploadedFileName": "Physics.omaic-course.zip",
      "validation": {
        "manifest": {
          "format": "openmaic-course",
          "version": 2,
          "courseId": "cls_1",
          "courseName": "Physics",
          "sceneCount": 12,
          "assetCount": 18,
          "includesAssets": true,
          "exportedAt": "2026-03-27T10:00:00.000Z"
        },
        "warnings": []
      }
    }
  }
}
```

### 4.3 应用导入结果

`POST /api/classroom/import/:jobId/apply`

请求：

```json
{
  "courseNameOverride": "Physics Imported"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "classroomId": "cls_new",
    "url": "/classroom/cls_new"
  }
}
```

校验：

- 任务必须已 `validated`
- 同一任务只允许成功应用一次

## 5. 课程编辑接口

### 5.1 增量保存课程

`PATCH /api/classroom/:id`

请求：

```json
{
  "stage": {
    "name": "Updated Course",
    "description": "Updated description"
  },
  "scenes": [
    {
      "id": "scene_1",
      "title": "Updated title",
      "content": {}
    }
  ],
  "saveMode": "draft"
}
```

约定：

- `saveMode`:
  - `draft`
  - `publish`

响应：

```json
{
  "success": true,
  "data": {
    "classroomId": "cls_1",
    "savedAt": "2026-03-27T10:00:00.000Z",
    "saveMode": "draft"
  }
}
```

规则：

- `draft` 不强制覆盖已发布版本，可保存为当前草稿
- `publish` 需要把当前草稿落到正式课堂数据

## 6. 课程版本快照接口

### 6.1 创建快照

`POST /api/classroom/:id/revisions`

请求：

```json
{
  "source": "manual-save",
  "summary": "Before scene reorder"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "revision": {
      "id": "rev_123",
      "classroomId": "cls_1",
      "source": "manual-save",
      "summary": "Before scene reorder",
      "createdAt": "2026-03-27T10:00:00.000Z"
    }
  }
}
```

### 6.2 列出快照

`GET /api/classroom/:id/revisions`

响应：

```json
{
  "success": true,
  "data": {
    "revisions": []
  }
}
```

### 6.3 恢复快照

`POST /api/classroom/:id/revisions/:revisionId/restore`

响应：

```json
{
  "success": true,
  "data": {
    "classroomId": "cls_1",
    "revisionId": "rev_123",
    "restoredAt": "2026-03-27T10:00:00.000Z"
  }
}
```

## 7. 提示词重制接口

### 7.1 创建重制任务

`POST /api/classroom/:id/regenerate`

请求：

```json
{
  "targetType": "scene",
  "targetId": "scene_3",
  "prompt": "将这一页改成更简洁的三段式结构，并替换成实验视频",
  "regenerateMode": "full",
  "preserveManualEdits": true,
  "knowledgeBaseIds": ["kb_1"],
  "memoryIds": ["mem_1"],
  "scopeId": "default"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "jobId": "regen_123",
    "status": "pending",
    "step": "queued",
    "message": "Regeneration job created"
  }
}
```

校验：

- `prompt` 必填
- `targetType=scene` 时 `targetId` 必填
- `regenerateMode` 默认 `full`
- `scopeId` 空值回退默认 scope

### 7.2 查询重制任务

`GET /api/classroom/:id/regenerate/:jobId`

响应：

```json
{
  "success": true,
  "data": {
    "job": {
      "id": "regen_123",
      "classroomId": "cls_1",
      "status": "preview-ready",
      "step": "preview-generated",
      "targetType": "scene",
      "targetId": "scene_3",
      "regenerateMode": "full",
      "preserveManualEdits": true,
      "prompt": "将这一页改成更简洁的三段式结构，并替换成实验视频",
      "preview": {
        "changedSceneIds": ["scene_3"],
        "scenes": []
      }
    }
  }
}
```

### 7.3 应用重制结果

`POST /api/classroom/:id/regenerate/:jobId/apply`

请求：

```json
{
  "createRevision": true
}
```

响应：

```json
{
  "success": true,
  "data": {
    "classroomId": "cls_1",
    "jobId": "regen_123",
    "applied": true
  }
}
```

规则：

- 应用前默认创建快照
- 只允许 `preview-ready` 状态应用

### 7.4 丢弃重制结果

`POST /api/classroom/:id/regenerate/:jobId/discard`

响应：

```json
{
  "success": true,
  "data": {
    "jobId": "regen_123",
    "discarded": true
  }
}
```

## 8. 错误码建议

- `INVALID_REQUEST`
- `MISSING_REQUIRED_FIELD`
- `CLASSROOM_NOT_FOUND`
- `EXPORT_JOB_NOT_FOUND`
- `IMPORT_JOB_NOT_FOUND`
- `REGENERATION_JOB_NOT_FOUND`
- `REVISION_NOT_FOUND`
- `IMPORT_PACKAGE_INVALID`
- `IMPORT_PACKAGE_UNSUPPORTED_VERSION`
- `IMPORT_PACKAGE_CORRUPTED`
- `EXPORT_FILE_NOT_READY`
- `REGENERATION_PREVIEW_NOT_READY`
- `CONFLICTING_DRAFT_STATE`
- `INTERNAL_ERROR`

## 9. 测试重点

本规格对应的最小测试集：

- 导出任务创建、查询、下载
- 导入上传、校验、应用
- 编辑保存与草稿状态
- 快照创建、查询、恢复
- 重制任务创建、查询、应用、丢弃
- 不合法请求统一返回 `INVALID_REQUEST`
