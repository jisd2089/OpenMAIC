# OpenMAIC v0.3 开发实现、测试、部署文档

## 1. 目标

`v0.3` 聚焦三类能力：

1. 课堂页区分教师端和学生端
2. 提供课堂生成与课堂删除 API 文档和稳定契约
3. 统一课堂导入、导出文件名为 `classroomId`

本文件只定义开发实现、测试、部署方案，不重复展开版本需求说明。

## 2. 当前基线

`v0.2` 已具备以下基础：

- 课堂详情页与右侧扩展页签
  - [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/classroom/[id]/page.tsx)
- 课堂操作面板
  - [classroom-ops-panel.tsx](/Users/luzequan/ai-projects/OpenMAIC/components/classroom/classroom-ops-panel.tsx)
- 课堂编辑工作区
  - [classroom-editor-workspace.tsx](/Users/luzequan/ai-projects/OpenMAIC/components/classroom/classroom-editor-workspace.tsx)
- 课堂持久化与按 ID 读取
  - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/route.ts)
  - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/route.ts)
  - [classroom-storage.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/server/classroom-storage.ts)
- 课堂生成任务
  - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/generate-classroom/route.ts)
  - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/generate-classroom/[jobId]/route.ts)
- 首页课堂列表与本地删除
  - [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/page.tsx)
  - [stage-storage.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/utils/stage-storage.ts)

因此 `v0.3` 不从零开始，而是在当前实现上补：

1. 课堂视图裁剪
2. 服务端删除真值
3. 首页删除同步
4. 课程包命名收口

## 3. 实现方案

### 3.1 课堂页视图区分

建议实现：

1. 在课堂详情页读取 `searchParams.view`
2. 视图值仅允许：
   - `teacher`
   - `student`
3. 未传或非法值统一按 `teacher` 处理
4. 教师端装配 `ClassroomOpsPanel`
5. 学生端不装配 `ClassroomOpsPanel`

建议改动文件：

1. [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/classroom/[id]/page.tsx)

### 3.2 课堂删除 API

建议实现：

1. 在 [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/route.ts) 新增 `DELETE`
2. 新增服务层：
   - `lib/server/classroom-delete.ts`
3. 服务层负责：
   - 校验 classroom 是否存在
   - 删除课堂 JSON
   - 删除课堂媒体目录
   - 删除课堂修订目录
   - 删除课堂相关中间任务产物

成功返回：

```json
{
  "success": true,
  "classroomId": "editable_course",
  "status": "deleted",
  "deletedAt": "2026-04-01T10:00:00.000Z"
}
```

### 3.3 首页删除接入

建议实现：

1. 首页删除确认后先调用 `DELETE /api/classroom/:id`
2. 服务端删除成功后再调用本地 `deleteStageData(id)`
3. 删除失败时不清理本地缓存，避免假成功

建议改动文件：

1. [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/page.tsx)

### 3.4 导入导出文件名统一

建议实现：

1. 导出任务结果中的 `fileName` 改为 `{classroomId}.omaic-course.zip`
2. 下载路由中的 `Content-Disposition` 改为 `{classroomId}.omaic-course.zip`
3. 导出相关测试断言同步改为基于 `classroomId`
4. 导入兼容旧命名文件，但标准文档、示例和测试使用新命名

潜在改动文件：

1. 导出路由
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/export/route.ts)
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/export/[jobId]/download/route.ts)
2. 服务层
   - [course-export.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/server/course-export.ts)
   - [course-package.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/server/course-package.ts)
3. 测试
   - [course-import-export-routes.test.ts](/Users/luzequan/ai-projects/OpenMAIC/tests/server/course-import-export-routes.test.ts)
   - [course-package.test.ts](/Users/luzequan/ai-projects/OpenMAIC/tests/server/course-package.test.ts)

## 4. 测试方案

### 4.1 单元测试

补充：

1. 课堂删除服务测试
2. 导出文件名生成规则测试
3. 学生端视图装配函数测试

### 4.2 路由级测试

补充：

1. `DELETE /api/classroom/:id` 成功删除
2. `DELETE /api/classroom/:id` 课堂不存在
3. 导出下载接口文件名为 `{classroomId}.omaic-course.zip`
4. 生成任务成功态响应含 `result.classroomId`

### 4.3 E2E

补充：

1. 教师端访问课堂可见“课堂操作”
2. 学生端访问课堂不可见“课堂操作”
3. 首页删除后课堂卡片消失

### 4.4 回归点

必须回归：

1. 教师端保存、快照、重制能力不受影响
2. 学生端笔记、对话、播放不受影响
3. 课堂生成成功后仍能自动跳转或手动打开课堂
4. 导入导出仍可完成完整课程迁移

## 5. 部署与发布检查

发布前至少执行：

1. `pnpm lint`
2. `pnpm test`
3. `pnpm exec tsc --noEmit`
4. `docker compose build`

人工验收至少包含：

1. 教师端进入课堂，确认“课堂操作”可见
2. 学生端进入同一课堂，确认“课堂操作”不可见
3. 课堂生成成功后，轮询响应中可读取 `classroomId`
4. 课堂导出后，下载文件名为 `{classroomId}.omaic-course.zip`
5. 首页删除课堂后，刷新页面不再出现该课堂

## 6. 风险与注意事项

1. 学生端当前是视图裁剪，不等价于真实鉴权隔离
2. 删除课堂时需要特别注意平铺 job 文件的归属判断，避免误删其它课堂任务
3. 导出文件名改动会影响测试断言、用户习惯和自动化脚本，需同步更新文档和样例
4. 若某些课堂仅存在本地 IndexedDB 而不存在服务端真值，首页删除逻辑需考虑兼容处理

## 7. 建议交付顺序

1. 先落课堂页教师端 / 学生端视图
2. 再落服务端删除 API
3. 再接首页删除链路
4. 然后统一导出文件名
5. 最后跑回归并更新最终文档
