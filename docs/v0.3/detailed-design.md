# OpenMAIC v0.3 详细设计方案

## 1. 目标

`v0.3` 详细设计覆盖三项能力：

1. 课堂页区分教师端和学生端
2. 课堂生成与课堂删除 API 对外化
3. 课堂导入、导出文件名统一为 `classroomId`

设计目标：

1. 基于 `v0.2` 当前课堂详情页与服务端存储模型扩展
2. 不破坏现有课堂播放、编辑、快照、重制、导入导出主链路
3. 教师端默认兼容现有课堂页行为
4. 学生端只裁剪“课堂操作”，不拆分课堂数据真值
5. 删除课堂时真实清理服务端课堂数据和关联资源
6. 导入导出文件命名从展示名收敛为稳定主键 `classroomId`

## 2. 当前基线

当前系统已经具备：

1. 课堂详情页
   - [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/classroom/[id]/page.tsx)
   - 默认会注入 `课堂操作` 扩展页签
2. 课堂操作面板
   - [classroom-ops-panel.tsx](/Users/luzequan/ai-projects/OpenMAIC/components/classroom/classroom-ops-panel.tsx)
   - 已包含保存、发布、快照、导出、重制、编辑态切换
3. 课堂编辑工作区
   - [classroom-editor-workspace.tsx](/Users/luzequan/ai-projects/OpenMAIC/components/classroom/classroom-editor-workspace.tsx)
4. 课堂持久化与读取
   - [classroom-storage.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/server/classroom-storage.ts)
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/route.ts)
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/route.ts)
5. 课堂生成任务
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/generate-classroom/route.ts)
   - [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/generate-classroom/[jobId]/route.ts)
   - [classroom-job-store.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/server/classroom-job-store.ts)
6. 课程导入导出
   - 已具备 `export/import` 路由和后台任务模型
7. 首页课堂列表删除
   - 当前仍以本地缓存清理为主
   - [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/page.tsx)
   - [stage-storage.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/utils/stage-storage.ts)

当前缺口：

1. 课堂页没有显式教师端 / 学生端视图模型
2. 课堂删除缺少正式服务端删除接口
3. 首页删除未与服务端课堂真值删除打通
4. 导入导出文件名仍可能受课程标题等展示名影响

## 3. 总体设计

### 3.1 架构原则

1. 角色区分优先按“视图层裁剪”实现，不在 `v0.3` 引入完整鉴权系统
2. 教师端和学生端共用同一份 `classroomId` 对应的课堂数据
3. 课堂真值以服务端文件系统为主，前端 IndexedDB 为缓存和离线加速层
4. 删除能力以服务端 API 为唯一真值入口，前端只做调用和本地清理
5. 导出文件命名统一使用稳定主键 `classroomId`

### 3.2 设计结果

`v0.3` 引入三个新层次：

1. 课堂视图模型
2. 服务端课堂删除模型
3. 导入导出命名规范模型

## 4. 课堂页角色区分设计

### 4.1 视图模型

引入课堂访问视图：

```ts
type ClassroomView = 'teacher' | 'student';
```

推荐来源：

1. URL 查询参数 `view`
2. 缺省值为 `teacher`

推荐路由形式：

`/classroom/{id}?view=teacher|student`

原因：

1. 不破坏当前 `/classroom/{id}` 主路径
2. 接入成本低
3. 分享学生端链接简单

### 4.2 页面装配

课堂详情页在加载时增加：

1. 解析当前 `view`
2. 将 `view` 作为 props 传给课堂扩展页签装配层
3. 仅当 `view === 'teacher'` 时注入 `ClassroomOpsPanel`

建议改造点：

1. [page.tsx](/Users/luzequan/ai-projects/OpenMAIC/app/classroom/[id]/page.tsx)
2. `classroomOpsTabs` 的创建逻辑

伪代码：

```ts
const view = searchParams.get('view') === 'student' ? 'student' : 'teacher';

const classroomOpsTabs = view === 'teacher'
  ? [buildClassroomOpsTab(...)]
  : [];
```

### 4.3 学生端裁剪范围

学生端仅移除：

1. `课堂操作` 页签
2. 所有通过该页签暴露的保存、发布、导出、快照、重制、编辑入口

学生端保留：

1. Stage 播放
2. 页面导航
3. 笔记
4. 对话
5. 上下文查看能力

### 4.4 防误触策略

`v0.3` 即使主要按 UI 视图裁剪交付，也建议在服务端加一层防护：

1. 若未来前端在学生端误暴露保存、重制、删除按钮，服务端仍可基于请求上下文拒绝
2. 若当前版本尚未引入身份体系，则至少在文档中明确“学生端是产品视图约束，不等价于安全权限边界”

## 5. 课堂删除设计

### 5.1 路由设计

新增：

`DELETE /api/classroom/:id`

建议落点：

1. 在 [route.ts](/Users/luzequan/ai-projects/OpenMAIC/app/api/classroom/[id]/route.ts) 中补充 `DELETE`
2. 路由层只做参数校验与响应包装
3. 具体删除逻辑下沉服务层

### 5.2 服务层设计

建议新增服务方法：

```ts
interface DeleteClassroomResult {
  classroomId: string;
  status: 'deleted';
  deletedAt: string;
}
```

建议新增模块：

1. `lib/server/classroom-delete.ts`

职责：

1. 校验课堂是否存在
2. 删除 `data/classrooms/{id}.json`
3. 删除 `data/classrooms/{id}/`
4. 删除 `data/classroom-revisions/{id}/`
5. 删除与该课堂绑定的重制任务产物
6. 返回标准删除结果

### 5.3 删除范围

推荐删除清单：

```text
data/classrooms/{id}.json
data/classrooms/{id}/
data/classroom-revisions/{id}/
data/classroom-regeneration-jobs/*.json   # 仅删除 classroomId 匹配的任务
data/course-exports/                      # 仅删除明确归属该 classroomId 的导出产物
```

注意：

1. `classroom-regeneration-jobs` 与 `course-exports` 若按 jobId 平铺存放，删除时需按内容反查归属
2. 不得删除知识库、记忆等共享资源

### 5.4 原子性与容错

删除流程建议：

1. 先检查课堂是否存在
2. 收集待删路径清单
3. 按“子资源目录 -> 主 JSON 真值”顺序删除
4. 任一步失败时记录错误日志
5. 若主课堂 JSON 已删除但子目录残留，应返回失败并输出残留清单，方便补偿任务清理

## 6. 课堂生成 API 设计

### 6.1 保持异步任务模型

沿用当前：

1. `POST /api/generate-classroom`
2. `GET /api/generate-classroom/{jobId}`

现有实现已满足：

1. 创建任务返回 `jobId`
2. 状态查询成功态返回 `result.classroomId`
3. 状态查询成功态返回 `result.url`

`v0.3` 设计重点不是重写链路，而是固定接口契约并补全对外文档。

### 6.2 字段约束固化

当任务成功时，必须返回：

```ts
result: {
  classroomId: string;
  url: string;
  scenesCount: number;
}
```

当任务失败时，必须返回：

```ts
{
  status: 'failed',
  error: string
}
```

### 6.3 日志与可观测性

生成日志必须能串起：

1. `jobId`
2. `status`
3. `step`
4. `progress`
5. `classroomId`

## 7. 导入导出文件名设计

### 7.1 导出命名规则

统一命名为：

`{classroomId}.omaic-course.zip`

示例：

`editable_course.omaic-course.zip`

### 7.2 影响范围

需要同步修改：

1. 导出任务结果中的 `fileName`
2. 下载接口中的 `Content-Disposition`
3. 文档示例
4. 测试断言

### 7.3 Manifest 一致性

要求：

1. 文件名中的 `classroomId` 与 `manifest.courseId` 保持一致
2. 课程标题只用于包内展示信息，不参与主文件名生成

### 7.4 导入兼容策略

导入需要支持两类输入：

1. 旧格式：基于课程标题命名的文件
2. 新格式：基于 `classroomId` 命名的文件

导入识别主键：

1. 以 `manifest.courseId` 为准
2. 不依赖上传文件名反推课堂主键

## 8. 前端首页删除链路设计

### 8.1 当前问题

首页删除当前主要调用本地：

1. [stage-storage.ts](/Users/luzequan/ai-projects/OpenMAIC/lib/utils/stage-storage.ts) 的 `deleteStageData`

这会导致：

1. 仅删除 IndexedDB 缓存
2. 服务端课堂真值可能残留
3. 再次打开服务端课堂时仍可能读取成功

### 8.2 新链路

首页删除调整为：

1. 先调用 `DELETE /api/classroom/:id`
2. 服务端删除成功后
3. 再调用本地 `deleteStageData(id)`
4. 重新加载课堂列表

这样可以保证：

1. 服务端先删真值
2. 本地再删缓存
3. 页面刷新后状态一致

## 9. 测试设计

### 9.1 路由级测试

新增或补充：

1. 教师端 / 学生端课堂页装配测试
2. `DELETE /api/classroom/:id` 成功删除测试
3. `DELETE /api/classroom/:id` 的 404 测试
4. 导出文件名为 `{classroomId}.omaic-course.zip` 的测试

### 9.2 集成测试

需要覆盖：

1. 生成成功后轮询结果中包含 `classroomId`
2. 首页删除后服务端读取课堂返回不存在
3. 标题变更前后导出文件名保持不变

### 9.3 E2E

建议新增：

1. 教师端可见 `课堂操作`
2. 学生端不可见 `课堂操作`
3. 首页删除课堂后刷新列表消失

## 10. 兼容策略

1. 不修改默认教师端课堂链接
2. 学生端通过新增 `view=student` 访问
3. 课堂生成沿用当前任务模型
4. 导入兼容旧文件名，导出统一切换到 `classroomId`
