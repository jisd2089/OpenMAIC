# OpenMAIC v0.3 文档索引

## 1. 文档列表

1. [requirements.md](./requirements.md)
2. [api-spec.md](./api-spec.md)
3. [detailed-design.md](./detailed-design.md)
4. [implementation-test-deploy.md](./implementation-test-deploy.md)
5. [task-breakdown.md](./task-breakdown.md)
6. [bugfix.md](./bugfix.md)

## 2. 当前范围

`v0.3` 当前聚焦：

1. 教师端 / 学生端课堂视图
2. 课堂生成接口、课堂列表接口与课堂删除接口
3. 首页展示服务端课堂
4. 课程包导入导出命名收口
5. 课堂播放、导出等问题修复记录

## 3. 当前实现口径

1. `/classroom/{id}?view=teacher|student` 为正式访问约定
2. `POST /api/generate-classroom` 创建任务后返回 `classroomId`
3. `GET /api/classroom` 返回服务端课堂列表
4. 首页“最近课堂”合并显示本地课堂与服务端课堂
5. 通过接口或 `curl` 创建并完成的课堂，刷新首页后应可见并可进入
