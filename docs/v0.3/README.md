# OpenMAIC v0.3 文档索引

## 1. 文档列表

1. [requirements.md](./requirements.md)
2. [api-spec.md](./api-spec.md)
3. [detailed-design.md](./detailed-design.md)
4. [implementation-test-deploy.md](./implementation-test-deploy.md)
5. [task-breakdown.md](./task-breakdown.md)
6. [bugfix.md](./bugfix.md)

## 2. 当前范围

`v0.3` 当前范围包含：

1. 教师端 / 学生端课堂视图
2. 课堂生成接口、课堂列表接口与课堂删除接口
3. 首页展示服务端课堂
4. 课程包导入导出与媒体完整性收口
5. 课堂右侧代码工作台、代码运行页签与沙箱执行能力设计
6. 播放、导出、前后端口径对齐等问题修复记录
7. OpenMAIC 与 `deer-flow` 开发语言差异及接入边界

## 3. 当前口径

1. `/classroom/{id}?view=teacher|student` 为正式访问约定
2. `POST /api/generate-classroom` 创建任务后返回 `classroomId`
3. `GET /api/classroom` 返回服务端课堂列表
4. 首页“最近课堂”合并显示本地课堂与服务端课堂
5. 通过接口或 `curl` 创建并完成的课堂，刷新首页后应可见并可进入
6. 新增代码编辑器需求后，`v0.3` 文档同时覆盖：
   - 课堂页顶部代码编辑器入口
   - 与右侧“代码运行”页签融合、并针对窄栏重设计的代码工作台
   - 基于 `LocalSandboxProvider` / `AioSandboxProvider` 的运行沙箱设计
7. `deer-flow` 仅作为沙箱能力参考与可复用后端，不作为前端同语言直接合并对象

## 4. 实现状态说明

1. 课堂生成、课堂列表、首页可见性、导出链路和播放问题修复已完成并已在文档中按当前实现收口
2. 代码编辑器与沙箱执行属于本次补充需求，当前文档已给出详细设计、接口和测试要求
3. 若后续开始开发，应以 [requirements.md](./requirements.md)、[api-spec.md](./api-spec.md) 和 [detailed-design.md](./detailed-design.md) 为准

## 5. 核心保护原则

1. `v0.3` 后续设计和代码实现必须以“不破坏本项目已有核心功能”为前提
2. 已有核心功能包括但不限于：
   - 幻灯片播放
   - PPT 指示效果
   - 翻页
   - 互动白板
   - 笔记
   - 对话
   - 课堂操作
   - 课堂生成
   - 课程包导入导出
3. 新增代码编辑器和代码运行能力只能以增量方式接入，不得替换、重写或改变上述核心功能的既有行为语义

## 6. 技术栈差异原则

1. OpenMAIC 当前主项目技术栈是 `TypeScript + React + Next.js + Node.js`
2. `D:\Workspace\deer-flow` 的沙箱参考实现主要位于 `Python` 后端
3. `v0.3` 后续实现不得把 Python 代码直接嵌入到 OpenMAIC 的 TypeScript 运行时中
4. 处理语言差异的正式方式是“服务边界适配”，而不是“源码级混编”
5. 允许的方式包括：
   - 在 OpenMAIC 中实现同语义的 TypeScript 适配层
   - 通过独立 Python 沙箱服务以 HTTP / RPC / 进程协议对接
   - 复用 `deer-flow` 的容器、镜像、挂载与会话管理思路
6. 不允许的方式包括：
   - 在 Next.js 进程内直接运行 Python 模块
   - 让前端直接依赖 `deer-flow` 内部 Python 包结构
   - 因为语言差异而反向改造 OpenMAIC 现有核心链路
7. `v0.3` 当前正式采用的实现路径是：
   - 在 OpenMAIC 内实现同语义的 TypeScript 适配层
8. 独立 Python 沙箱服务方案仅作为后备扩展路线，不作为 `v0.3` 当前默认实现方案
