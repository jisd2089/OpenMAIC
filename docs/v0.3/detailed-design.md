# OpenMAIC v0.3 详细设计

## 1. 总体设计

`v0.3` 的设计重点不是新增一套独立系统，而是在现有课堂页、生成链路和首页列表上收口真值与访问约定。

核心设计原则：

1. 教师端 / 学生端是同一课堂真值的两种视图
2. 服务端课堂是后端任务生成与导入导出的唯一真值
3. 首页列表需要同时感知本地课堂与服务端课堂
4. 接口生成必须复用与前端生成页一致的生成配置

## 2. 课堂页设计

### 2.1 视图模型

```ts
type ClassroomView = 'teacher' | 'student';
```

路由约定：

```text
/classroom/{id}?view=teacher
/classroom/{id}?view=student
```

缺省规则：

1. `view` 缺省时按 `teacher`
2. 非法值按 `teacher`

### 2.2 顶部入口布局

课堂页顶部悬浮控制包含：

1. 教师端切换按钮
2. 学生端切换按钮
3. 复制学生端链接按钮

布局要求：

1. 固定在课堂页顶部
2. 水平居中
3. 保持现有按钮行为不变

### 2.3 教师端与学生端装配

教师端：

1. 注入 `ClassroomOpsPanel`
2. 保留保存、导出、快照、重制、编辑入口

学生端：

1. 不注入 `ClassroomOpsPanel`
2. 保留课堂播放、笔记、对话、内容浏览

## 3. 课堂生成链路设计

### 3.1 背景任务配置保留

`POST /api/generate-classroom` 在创建任务时需要把请求头中的生成配置一并写入任务输入：

1. LLM 模型配置
2. 图片生成配置
3. 视频生成配置
4. TTS 配置

原因：

1. `generate-classroom` 是异步后台任务
2. 如果只在创建请求时读取配置、runner 执行时不保留，就会退回服务器默认模型
3. 这会导致接口生成结果与前端生成页不一致

### 3.2 与前端生成页对齐的生成元信息

服务端生成出的课堂需要与前端生成页保持以下一致：

1. 标题提取规则一致
2. `stage.style = professional`
3. 自动生成角色时持久化 `stage.generatedAgents`
4. 前端加载课堂时恢复这些生成角色

### 3.3 生成完成后的前端可见性

生成完成后课堂会写入服务端持久化目录：

```text
data/classrooms/{classroomId}.json
```

同时首页通过 `GET /api/classroom` 读取服务端课堂列表，保证：

1. `curl` 创建的课程不依赖本地 IndexedDB
2. 刷新首页即可出现在“最近课堂”

## 4. 首页最近课堂设计

### 4.1 数据源

首页列表合并两类来源：

1. 本地 IndexedDB：`listStages()`
2. 服务端课堂列表：`GET /api/classroom`

### 4.2 合并规则

1. 按 `id` 去重
2. 本地与服务端均存在时，优先保留本地缩略图能力
3. 按 `updatedAt` 倒序显示

## 5. 课堂列表与详情接口设计

### 5.1 `GET /api/classroom`

无 `id` 参数时返回服务端课堂列表，字段包括：

1. `id`
2. `name`
3. `description`
4. `sceneCount`
5. `createdAt`
6. `updatedAt`
7. `knowledgeBaseCount`
8. `memoryCount`
9. `preferKnowledgeVideos`

### 5.2 `GET /api/classroom?id={id}`

按课堂 ID 返回完整课堂数据，供：

1. 课堂详情页首次加载
2. `curl` / 后端任务生成后的课堂访问
3. 导入导出链路复用

## 6. 删除与导入导出设计

### 6.1 删除

`DELETE /api/classroom/:id` 删除：

1. 课堂 JSON
2. 课堂媒体与音频目录
3. 修订记录
4. 相关任务产物

### 6.2 导出

导出前需要：

1. 先把课堂保存到服务端
2. 补齐媒体资源引用到 `classroom-media`
3. 再启动导出任务

### 6.3 导出文件名

标准文件名：

```text
{classroomId}.omaic-course.zip
```
