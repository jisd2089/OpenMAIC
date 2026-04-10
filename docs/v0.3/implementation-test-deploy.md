# OpenMAIC v0.3 实现、测试与部署

## 1. 当前已落地范围

当前已落地：

1. 教师端 / 学生端视图切换
2. 课堂生成任务返回 `classroomId`
3. 课堂生成链路与前端生成页配置对齐
4. 服务端课堂列表接口
5. 首页“最近课堂”合并本地与服务端课堂
6. 课堂删除接口
7. 导入导出文件命名与导出前持久化
8. 媒体完整性与导出相关修复

## 2. 本次补充需求

本次新增待实现设计项：

1. 课堂右侧代码工作台
2. “代码运行”右侧页签
3. 课堂代码运行后端接口
4. 运行时注册表和主流语言模板
5. 基于 `LocalSandboxProvider` / `AioSandboxProvider` 的沙箱执行适配层
6. 左侧 PPT 导航条改版为窄轨式场景导航
7. 生成课件同步到 Dify 知识库指定文档

约束：

1. 上述新增项不得改变幻灯片播放、PPT 指示效果、翻页、互动白板、笔记、对话、课堂操作等既有核心功能
2. 开发过程中若触碰这些链路，必须先给出兼容性设计和专项回归用例
3. `v0.3` 当前正式采用 TypeScript 适配层方案，不引入独立 Python 业务服务作为默认实现

## 3. 实现要求

### 3.1 前端

需要新增或改造：

1. 课堂主工具栏中的代码编辑器按钮
2. 右侧代码工作台
3. 右侧“代码运行”页签
4. 运行日志、退出码和预览展示
5. 草稿本地持久化和场景切换恢复
6. 代码编辑器页面级布局：
   - 顶部工具条
   - 左侧文件区
   - 中央编辑区
   - 底部标准输入与状态区
7. 代码编辑器不再以弹层实现，而是在右侧“代码运行”页签内形成统一工作台：
   - 顶部采用紧凑工具条
   - 文件导航采用轻量 rail 或下拉选择
   - 中部采用编辑区 / 结果区纵向栈
   - 允许在同一右侧面板内切换为编辑优先或结果优先布局
   - 不允许直接复用旧的宽弹框三栏布局
7. 小屏设备下的降级布局
8. 左侧场景导航改版：
   - 当前 `SceneSidebar` 不再以大缩略图列表为默认样式
   - 改为固定窄轨 `SceneRail`
   - 底部显示 `当前页 / 总页数`
   - 节点 hover 时允许浮出轻量预览卡
   - 不再提供自由拖拽调宽
9. 课堂页中增加 Dify 同步状态提示入口：
   - 至少可见“同步中 / 已完成 / 失败”
   - 失败时提供手动重试入口
   - 该状态提示不得阻塞课堂主画布交互

前端与沙箱交互实现要求：

1. 浏览器不得直接请求沙箱容器地址或 provisioner 地址
2. 浏览器只能通过 OpenMAIC 服务端接口完成：
   - 创建 / 恢复代码会话
   - 保存草稿
   - 提交运行
   - 查询运行结果
   - 释放会话
   - 加载受控预览地址
3. 前端必须实现独立的代码工作台状态，不与播放状态、聊天状态或课堂主 JSON 复用
4. 代码工作台至少拆分为：
   - `session` 状态
   - `draft` 状态
   - `execution` 状态
   - `preview` 状态
5. 用户切离代码工作台、右侧页签切换、场景切换时，执行轮询与草稿持久化行为必须明确可预测
6. 前端刷新后的状态恢复必须基于服务端 session / execution 真值，而不是仅依赖浏览器内存
7. 若支持依赖文件上传，前端只上传到 OpenMAIC 服务端，不直接写容器文件系统

建议实现拆分：

1. `useCodeWorkbench`
   - 聚合会话、执行、草稿和预览状态
2. `useCodeSession`
   - 负责创建 / 恢复 / 释放会话
3. `useCodeExecution`
   - 负责运行、停止、轮询结果和恢复运行中执行
4. `useCodeDraftPersistence`
   - 负责 IndexedDB 或本地存储层
5. `CodePreviewFrame`
   - 负责受控 iframe 预览
6. `useCodeUploads`
   - 负责依赖文件上传、列表刷新与上传态管理

前端轮询要求：

1. `queued` / `running` 状态默认每 `1000ms` 轮询
2. 页面不可见时应降频
3. 页面恢复可见时应立即补轮询
4. 终态后立即停止轮询
5. 轮询失败不能清空现有日志和执行结果

### 3.2 服务端

需要新增：

1. 代码会话接口
2. 代码运行接口
3. 运行结果查询接口
4. 会话回收接口
5. 代码沙箱提供者适配层
6. 运行时注册表
7. Dify 发布状态查询接口
8. Dify 手动重试接口
9. 课件序列化为 Dify 文本的发布模块
10. Dify 后台轮询与状态持久化模块

语言差异处理要求：

1. OpenMAIC 服务端仍以 TypeScript / Node.js 为业务主入口
2. 若接入 `deer-flow` Python provider，必须走独立服务或协议适配，不允许源码级直接嵌入
3. 实现文档和部署文档必须明确：
   - OpenMAIC 进程负责什么
   - Python 沙箱服务负责什么
   - 两者的调用协议与超时策略
4. `v0.3` 首版交付不采用 Python 独立服务模式，默认实现目标为 Node / TypeScript 单服务方案

外部发布实现要求：

1. Dify 同步只允许服务端调用，浏览器不直连 Dify
2. 生成完成后的 Dify 发布必须异步执行，不阻塞课堂生成成功返回
3. Dify 失败不允许回滚课堂持久化结果
4. 当前本地知识库检索链路与 Dify 发布链路必须解耦
5. `v0.3` 默认按固定 `datasetId + documentId` 更新单个目标文档，而不是为每个课堂自动新建 Dify 文档
6. Dify 同步必须带上必要元数据：
   - `classroom`
   - `type`
   - `title`
7. `type` 必须从 `POST /api/generate-classroom` 请求字段 `type` 透传
8. 课件内容必须按 PPT 页分段后再发布到 Dify
9. 单段文本长度上限为 `4000` 字符
10. 除生成完成自动触发外，还必须支持“课堂操作”-“发布”作为第二个触发点

### 3.2.1 Dify 同步开发实现拆分

建议按以下顺序实施，避免把同步逻辑直接塞进生成接口：

1. 配置层
   - 新增 `dify-config`，统一解析 `OPENMAIC_DIFY_*`
   - 启动时校验 `baseUrl`、`datasetId`、`documentId`
2. 客户端层
   - 新增 `dify-client`
   - 统一封装 `Authorization: Bearer ${OPENMAIC_DIFY_API_KEY}`
   - 统一处理超时、重试、错误码分类
3. 序列化层
   - 新增 `classroom-dify-serializer`
   - 输入课堂 JSON
   - 输出按 PPT 页分段后的文本块与元数据
4. 状态层
   - 新增 `classroom-publish-store`
   - 记录 `queued/syncing/indexing/completed/failed/skipped`
   - 记录 `batchId`、`contentHash`、`triggerSource`
5. 调度层
   - 新增 `classroom-dify-sync`
   - 提供 `enqueueAfterGenerate()` 和 `enqueueAfterPublish()`
   - 后台执行 `update-by-text` 与 `indexing-status` 轮询
6. 路由层
   - `POST /api/generate-classroom` 成功持久化后只负责入队
   - “课堂操作”-“发布”接口在保存成功后只负责入队
   - `GET /api/classroom/:id/publish-status` 只读状态，不触发同步

开发约束：

1. 课堂生成成功响应不能等待 Dify 远端返回终态
2. 同步任务必须基于服务端持久化后的课堂真值，而不是浏览器传回的临时对象
3. API Key 只允许在服务端请求头中使用，不得进入浏览器返回值、日志明文或前端状态
4. 日志中若打印配置，只允许打印 `baseUrl`、`datasetId`、`documentId`，不得打印 API Key
5. `type` 必须在课堂生成入口进入课堂真值，并在后续发布链路中原样透传

推荐日志点：

1. `Dify Sync Enqueued`：记录 `classroomId`、`triggerSource`
2. `Dify Sync Started`：记录 `classroomId`、`contentHash`
3. `Dify Sync Update Accepted`：记录 `batchId`
4. `Dify Sync Polling`：记录 `batchId`、`remoteIndexingStatus`
5. `Dify Sync Completed` 或 `Dify Sync Failed`

### 3.3 部署配置

需要增加部署项：

1. `codeSandbox.mode=local|aio`
2. `aio.backend=docker|provisioner`
3. `aio` 模式下的容器镜像、端口、挂载和回收策略
4. Web 预览反向代理或临时 URL 策略
5. 资源限制配置：
   - timeout
   - memory
   - cpu
   - output size
6. Dify 发布配置：
   - `publish.dify.enabled`
   - `publish.dify.baseUrl`
   - `publish.dify.apiKey`
   - `publish.dify.datasetId`
   - `publish.dify.documentId`
   - `publish.dify.timeoutMs`
   - `publish.dify.pollingIntervalMs`
   - `publish.dify.maxPollingAttempts`

配置项必须参照 `deer-flow` 的沙箱选择思路进行说明，并在 OpenMAIC 中固化为统一配置契约。

建议配置文件结构：

```yaml
codeSandbox:
  mode: local | aio
  local:
    workspaceRoot: ./.openmaic/code-sandbox
    allowHostShell: false
  aio:
    backend: docker | provisioner
    image: enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
    dockerSocketPath: /var/run/docker.sock
    sandboxHost: host.docker.internal
    sharedSandboxId: sandbox_aio_global
    idleTimeoutSec: 600
    workdirMountPath: /workspace
    previewBaseUrl: http://localhost:3000/api/code-preview
    provisioner:
      url: ""
      kubeNamespace: openmaic
      kubeconfigPath: /root/.kube/config
      nodeHost: host.docker.internal
      image: enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
publish:
  dify:
    enabled: true
    baseUrl: https://difytestapi.zhizuobiao.com/v1
    apiKey: ${OPENMAIC_DIFY_API_KEY}
    datasetId: 1d2405b1-910a-4820-b06a-ad61b377c1a1
    documentId: 4d54b7ca-d170-482a-85b6-7be5222c1d50
    documentName: OpenMAIC Courseware Sync
    timeoutMs: 30000
    pollingIntervalMs: 2000
    maxPollingAttempts: 180
```

字段说明：

1. `codeSandbox.mode`
   - `local`：本地受信任调试
   - `aio`：容器隔离执行
2. `codeSandbox.aio.backend`
   - `docker`：OpenMAIC 直接通过 Docker socket 启停沙箱容器
   - `provisioner`：OpenMAIC 通过独立 provisioner API 管理容器或 Pod
3. `codeSandbox.aio.image`
   - 沙箱运行镜像，对齐 `deer-flow` 中的 `SANDBOX_IMAGE`
4. `codeSandbox.aio.sandboxHost`
   - 对齐 `deer-flow` 中的 `DEER_FLOW_SANDBOX_HOST`
   - 用于后端容器访问宿主沙箱地址，默认 `host.docker.internal`
5. `codeSandbox.aio.sharedSandboxId`
   - 全局共享沙箱容器标识；同一 OpenMAIC 服务实例内所有浏览器客户端复用该容器
6. `codeSandbox.aio.idleTimeoutSec`
   - 用于共享容器维护或陈旧会话整形，不再表达“每会话容器回收”
7. `codeSandbox.aio.provisioner.url`
   - 与 `deer-flow` 的 `provisioner_url` 同语义
   - 非空时表示通过 provisioner 管理远程容器或 Kubernetes Pod

环境变量映射：

```bash
OPENMAIC_CODE_SANDBOX_MODE=local|aio
OPENMAIC_CODE_SANDBOX_LOCAL_WORKSPACE_ROOT=./.openmaic/code-sandbox
OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL=false
OPENMAIC_CODE_SANDBOX_AIO_BACKEND=docker|provisioner
OPENMAIC_CODE_SANDBOX_AIO_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
OPENMAIC_CODE_SANDBOX_AIO_DOCKER_SOCKET=/var/run/docker.sock
OPENMAIC_CODE_SANDBOX_AIO_SANDBOX_HOST=host.docker.internal
OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID=sandbox_aio_global
OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC=600
OPENMAIC_CODE_SANDBOX_AIO_WORKDIR_MOUNT_PATH=/workspace
OPENMAIC_CODE_SANDBOX_AIO_PREVIEW_BASE_URL=http://localhost:3000/api/code-preview
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL=
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NAMESPACE=openmaic
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_KUBECONFIG_PATH=/root/.kube/config
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NODE_HOST=host.docker.internal
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
OPENMAIC_DIFY_ENABLED=true
OPENMAIC_DIFY_BASE_URL=https://difytestapi.zhizuobiao.com/v1
OPENMAIC_DIFY_API_KEY=
OPENMAIC_DIFY_DATASET_ID=1d2405b1-910a-4820-b06a-ad61b377c1a1
OPENMAIC_DIFY_DOCUMENT_ID=4d54b7ca-d170-482a-85b6-7be5222c1d50
OPENMAIC_DIFY_DOCUMENT_NAME=OpenMAIC Courseware Sync
OPENMAIC_DIFY_TIMEOUT_MS=30000
OPENMAIC_DIFY_POLLING_INTERVAL_MS=2000
OPENMAIC_DIFY_MAX_POLLING_ATTEMPTS=180
```

配置选择规则：

1. 前端不允许通过请求参数指定 `local` 或 `aio`
2. 课堂代码运行接口只读取服务端配置
3. 环境变量优先级高于配置文件默认值
4. 若 `mode=aio` 且 `backend=provisioner`，则必须同时配置 `provisioner.url`
5. 若 `mode=aio` 且 `backend=docker`，则必须同时配置 `dockerSocketPath`、`image` 和 `sandboxHost`

推荐场景：

1. 本地开发：`mode=local`
2. Docker 单机集成测试：`mode=aio` + `backend=docker`
3. 多用户共享环境：`mode=aio` + `backend=docker`
4. Kubernetes 或远程容器池：`mode=aio` + `backend=provisioner`

## 4. 测试要求

### 4.1 路由测试

至少覆盖：

1. `POST /api/classroom/:id/code-sessions` 创建或恢复会话
2. `PUT /api/classroom/:id/code-sessions/:sessionId` 保存草稿
3. `POST /api/classroom/:id/code-sessions/:sessionId/run` 创建执行
4. `GET /api/classroom/:id/code-sessions/:sessionId/executions/:executionId` 返回执行结果
5. `DELETE /api/classroom/:id/code-sessions/:sessionId` 释放会话
6. `GET /api/code-preview/:previewToken` 仅返回受控预览，不泄露底层容器地址
7. `GET /api/classroom/:id/publish-status` 返回 Dify 同步状态
8. `POST /api/classroom/:id/publish/dify` 可触发手动重试

### 4.2 提供者测试

必须覆盖：

1. `LocalSandboxProvider` 适配器可完成本地受控执行
2. `AioSandboxProvider` 适配器可完成容器隔离执行
3. 两种模式下会话回收逻辑一致
4. 两种模式下语言注册表映射一致
5. 若使用 Python 独立服务模式，需额外覆盖 TypeScript <-> Python 协议兼容测试
6. Dify 发布模块必须覆盖：
   - 元数据 `classroom/type/title` 正确透传
   - `type` 与课堂生成请求中的 `type` 一致
   - 按 PPT 页分段输出
   - 单段长度不超过 `4000`
   - 内容哈希未变化时返回 `skipped`
   - `update-by-text` 成功后写入 `batchId`
   - `indexing-status` 轮询到 `completed`
   - 401 / 403 / 404 / 429 / 5xx 分类失败

### 4.2.1 Dify 联调测试案例

以下联调案例基于当前环境：

1. `OPENMAIC_DIFY_BASE_URL=https://difytestapi.zhizuobiao.com/v1`
2. `OPENMAIC_DIFY_DATASET_ID=1d2405b1-910a-4820-b06a-ad61b377c1a1`
3. `OPENMAIC_DIFY_DOCUMENT_ID=4d54b7ca-d170-482a-85b6-7be5222c1d50`
4. `OPENMAIC_DIFY_API_KEY` 由部署环境注入，不在测试文档中明文展开

联调前置检查：

1. 服务端环境变量已注入 `OPENMAIC_DIFY_API_KEY`
2. OpenMAIC 服务容器可访问 `https://difytestapi.zhizuobiao.com/v1`
3. 指定 `datasetId` / `documentId` 由当前 API Key 授权
4. 目标课堂可在服务端持久化并能通过 `GET /api/classroom?id=:id` 读取

建议先做 Dify 直连冒烟：

```bash
curl -sS -H "Authorization: Bearer ${OPENMAIC_DIFY_API_KEY}" ^
  "https://difytestapi.zhizuobiao.com/v1/datasets/1d2405b1-910a-4820-b06a-ad61b377c1a1/documents/4d54b7ca-d170-482a-85b6-7be5222c1d50"
```

预期：

1. 返回 `200`
2. 返回体中能识别目标 `documentId`
3. 若返回 `401/403/404`，停止后续 OpenMAIC 联调，先修正环境权限

案例 1：生成完成后自动触发同步

1. 调用 `POST /api/generate-classroom` 创建一门新课堂，`type=knowledge`
2. 等待课堂生成任务进入 `succeeded`
3. 立刻调用 `GET /api/classroom/:id/publish-status`

预期：

1. 课堂生成成功返回不等待 Dify 完成
2. `publish-status` 中存在 `provider=dify`
3. `triggerSource=generate`
4. 初始状态为 `queued`、`syncing` 或 `indexing`

案例 2：元数据透传正确

1. 选取课堂生成请求：
   - `classroom=gJsjGFbKau`
   - `type=knowledge`
   - `title=C语言数据结构`
2. 查询 `GET /api/classroom/:id/publish-status`

预期：

1. `metadata.classroom=gJsjGFbKau`
2. `metadata.type=knowledge`
3. `metadata.title=C语言数据结构`

案例 3：按 PPT 页分段且单段不超过 4000 字

1. 准备一个至少 5 页的课堂
2. 其中至少 1 页包含较长文本，逼近或超过 4000 字
3. 触发一次同步
4. 查看 OpenMAIC 服务端生成的发布文本或调试日志

预期：

1. 正常页按“1 页 1 段”输出
2. 超长页被切为“同页多片段”
3. 任一片段长度都不超过 `4000`
4. 片段标题保留页码和片段号

案例 4：轮询到 completed

1. 在自动同步或手动发布后，每隔 2 秒调用一次 `GET /api/classroom/:id/publish-status`
2. 持续到终态

预期：

1. 状态流转为 `queued -> syncing -> indexing -> completed`
2. `batchId` 在进入 `indexing` 后可见
3. `lastSyncedAt` 在完成后被写入

案例 5：“课堂操作”-“发布”手动触发

1. 打开一个已持久化课堂
2. 在“课堂操作”中点击“发布”
3. 立即查询 `GET /api/classroom/:id/publish-status`

预期：

1. 服务端返回 `queued` 或 `skipped`
2. `triggerSource=publish`
3. 发布动作不阻塞课堂页继续使用

案例 6：内容未变化时 skipped

1. 在同一课堂不做任何修改的前提下，连续两次触发“发布”
2. 第二次查询 `publish-status`

预期：

1. 第二次同步可返回 `skipped`
2. 不产生新的远端写入批次，或服务端明确记录未发起更新

案例 7：手动重试

1. 先制造一次失败，例如临时使用错误 API Key 或不可达网络
2. 恢复正确配置后调用 `POST /api/classroom/:id/publish/dify`

预期：

1. 首次状态进入 `failed`
2. 手动重试后 `triggerSource=manual`
3. 后续可重新推进到 `completed`

案例 8：鉴权失败

1. 将 `OPENMAIC_DIFY_API_KEY` 临时替换为无效值
2. 触发一次同步

预期：

1. `publish-status` 最终为 `failed`
2. 错误分类为 `401` 或 `403`
3. 不影响课堂本地生成成功

案例 9：目标文档不存在

1. 临时修改 `OPENMAIC_DIFY_DOCUMENT_ID` 为不存在的值
2. 触发一次同步

预期：

1. `publish-status` 最终为 `failed`
2. 错误分类为 `404`
3. 错误文案中可定位是远端 `documentId` 问题

案例 10：接口限流或超时

1. 将 `OPENMAIC_DIFY_TIMEOUT_MS` 下调至极小值，或在网络层注入延迟
2. 连续触发多次发布

预期：

1. 服务端能记录超时或 `429`
2. 状态进入 `failed`
3. 后续允许手动重试，不会把课堂状态打坏

案例 11：Dify 直连结果与 OpenMAIC 状态一致

1. 在 OpenMAIC 返回 `batchId` 后，直接用 Dify API 查询该批次状态
2. 同时查询 `GET /api/classroom/:id/publish-status`

预期：

1. 两边的 `indexing_status` 一致或语义一致
2. OpenMAIC 的状态更新延迟在可接受范围内

案例 12：联调验收完成条件

1. 自动触发通过
2. “课堂操作”-“发布”触发通过
3. 元数据校验通过
4. 分段和 4000 字限制通过
5. 至少 1 次完整 `completed`
6. 至少 1 次失败与手动重试恢复通过

### 4.2.2 Dify 联调执行记录要求

每次联调都应至少保留以下证据，便于复盘：

1. OpenMAIC 请求参数
   - `classroomId`
   - `type`
   - `title`
   - 触发来源：`generate` 或 `publish`
2. OpenMAIC 返回结果
   - `POST /api/generate-classroom` 的成功响应
   - `GET /api/classroom/:id/publish-status` 的状态变化截图或原始 JSON
3. 服务端日志
   - 入队日志
   - `update-by-text` 调用日志
   - `batchId` 记录
   - `indexing-status` 轮询日志
   - 终态日志
4. Dify 侧结果
   - 目标 `documentId`
   - Dify `indexing-status`
   - 若失败，记录 HTTP 状态码与错误体摘要

建议联调输出模板：

```md
### Dify 联调记录

- 日期：
- 环境：
- classroomId：
- title：
- type：
- triggerSource：
- contentHash：
- batchId：
- publish-status 终态：
- remoteIndexingStatus：
- 结果：
- 异常摘要：
```

推荐专项案例补充：

1. 生成接口透传 `type=course` 与 `type=knowledge` 各执行一次
2. 同一课堂首次自动同步后，再通过“发布”触发一次修改同步
3. 课堂页数为 1 页、5 页、20 页各做一次分段验证
4. 超长单页验证时，检查第 `N` 页是否拆成 `第 N 页 / 片段 M`
5. 发布成功后直接到 Dify 检查该文档是否可按页检索关键字

配置选择测试必须补充：

1. `mode=local` 时只能实例化本地提供者
2. `mode=aio` + `backend=docker` 时只能实例化 Docker 容器提供者
3. `mode=aio` + `backend=provisioner` 时只能实例化 provisioner 客户端提供者
4. 缺失必填配置时启动阶段直接失败并输出明确错误
5. 非法配置值不会静默回退到其他模式
6. 环境变量覆盖配置文件时行为可预测且有测试覆盖
7. `aio` 模式下 `provisioner.url` 为空与非空时，模式识别行为有明确测试
8. 注释掉或空字符串形式的 provisioner 配置不会误判为 `provisioner` 模式

`AioSandboxProvider` 容器沙箱必须补充全方位测试案例，至少包含以下矩阵：

1. 语言基线样例
   - Python：打印输出、读取标准输入、异常退出
   - JavaScript：Node 控制台输出、异步任务、非零退出
   - TypeScript：即时编译运行、类型错误失败
   - Java：单文件编译运行、编译错误
   - C：编译运行、编译错误
   - C++：编译运行、编译错误
   - Go：模块内运行、panic 失败
   - Rust：`cargo` 或单文件运行、编译错误
   - C#：编译运行、编译错误
   - PHP：脚本输出、运行时警告或失败
   - Ruby：脚本输出、异常失败
   - Kotlin：编译运行、编译错误
   - Swift：脚本或编译运行、编译错误
   - Scala：编译运行、编译错误
   - Shell：受控命令执行、非法命令阻断
   - HTML / CSS / JavaScript：页面预览、资源加载、脚本报错
2. 生命周期测试
   - 创建会话后首次运行成功
   - 同一会话重复运行成功
   - 停止运行后可再次运行
   - 保存草稿后恢复会话内容一致
   - 会话释放后再次查询返回已释放状态或明确错误
   - idle timeout 后陈旧会话可被整形回 `ready`
   - `release` 后只释放会话状态，不停止共享容器
   - `destroy` 后再次访问必须触发重新创建
3. 结果与预览测试
   - `stdout` / `stderr` 正确返回
   - exit code 正确返回
   - 编译失败和运行失败状态区分
   - Web 预览返回可访问地址
   - artifact 列表与文件大小正确
4. 资源限制测试
   - 超时任务被中止并返回 `timed_out`
   - 超内存任务被限制并返回明确错误
   - 高 CPU 占用任务不会拖垮宿主服务
   - 超大输出会被截断并标记
   - 超大产物会被拒绝或裁剪并记录原因
5. 安全与隔离测试
   - 不允许访问工作目录外路径
   - 不允许读取宿主敏感文件
   - 非白名单外网访问被阻断
   - 不同会话工作目录互不可见
   - 教师端与学生端代码会话互不污染
   - 上传文件路径规范化后无路径穿越
   - 符号链接文件不会被错误赋权或同步
6. 容器编排测试
   - 并发多会话时共享容器复用与工作目录隔离
   - 不同会话在同一共享容器内运行时旧会话数据不会泄漏
   - 容器异常退出后再次运行能正确报错或自动恢复
   - provisioner / runtime 不可用时接口错误码和错误信息稳定
   - 同一稳定 `sandboxId` 并发创建时不会产生重复共享容器冲突
   - 进程重启后可重新发现既有 sandbox
7. 课堂集成测试
   - 打开代码编辑器不影响幻灯片播放、暂停恢复和 PPT 指示效果
   - 运行代码不影响笔记、对话、课堂操作既有行为
   - 场景切换后代码会话作用域仍正确
   - 导出 / 导入课程包链路不被代码编辑器数据污染

当前默认测试范围：

1. `v0.3` 首版以 TypeScript 适配层测试为准
2. Python 独立服务兼容测试不纳入当前默认交付门槛

交付门槛补充：

1. `AioSandboxProvider` 必须至少完成上述每一类测试中的 1 组自动化用例
2. 每种已宣称支持的语言必须至少包含 1 个成功样例和 1 个失败样例
3. 若某语言在当前镜像中未交付，测试报告必须显式标记为未支持，不能空缺
4. Docker 部署验收必须包含多语言抽样，不得只验证 Python / JavaScript / HTML

### 4.3 前端行为验证

必须人工验证：

1. 代码编辑器按钮位于互动白板按钮右侧
2. 点击按钮后右侧自动切换到“代码运行”工作台
3. 点击运行后右侧“代码运行”页签可看到日志和状态
4. HTML / Web 模板能在结果区看到预览
5. 教师端与学生端的代码会话互不覆盖
6. 顶部工具条按钮状态与运行状态联动正确
7. 左侧文件区、中央编辑区和底部输入区布局正常
8. 小屏或窄宽度下布局按设计降级，不压坏课堂页现有结构
9. 同一右侧页签内可同时完成编辑、运行和查看结果，不需要额外弹框
10. 在常见右侧窄栏宽度下，代码区域仍保持可读，文件导航和结果区具备合理折叠行为

前端与沙箱交互测试必须补充：

1. 打开编辑器时会正确创建或恢复当前 `classroomId + sceneId + clientSessionId + view` 对应会话
2. 编辑代码后，本地草稿能在刷新页面后恢复
3. 点击运行后会发起运行请求，并进入轮询
4. 轮询终态后右侧结果页签状态正确停止刷新
5. 执行中切离“代码运行”工作台不会中断执行结果轮询
6. 场景切换不会污染其他场景代码会话
7. 教师端和学生端切换不会复用同一代码会话
8. Web 预览只能加载 OpenMAIC 返回的 `previewUrl`
9. 预览失败时不会清空 `stdout` / `stderr`
10. 页面刷新后，若执行仍在进行，前端可恢复查询
11. 上传依赖文件后，运行可正确读取该文件
12. `release` 后重新打开编辑器，可快速恢复同一 session 对应状态

建议自动化测试层级：

1. 单元测试
   - `useCodeSession`
   - `useCodeExecution`
   - `useCodeDraftPersistence`
   - `CodePreviewFrame`
2. 组件测试
   - 编辑器运行按钮联动
   - 右侧“代码运行”页签渲染
   - 预览 iframe 错误态
3. 页面级集成测试
   - 打开编辑器 -> 运行 -> 轮询完成 -> 展示预览
   - 执行中切换场景 -> 返回原场景 -> 恢复状态
4. Docker 部署后验收
   - 容器模式下预览可访问
   - 轮询与停止链路正常

### 4.3.1 代码工作台极简界面实现与验收补充

实现阶段必须补充以下前端约束：

1. 右侧“代码工作台”默认界面只保留必要菜单按钮：
   - 语言选择
   - 入口文件选择
   - 保存
   - 运行
   - 停止
2. 低频功能不得常驻主工具条；文件区展开、`stdin` 展开、结果详情展开都必须是次级交互。
3. 编辑区必须是右侧工作台中的主区域，不得被大面积状态卡片、说明文案或装饰组件挤压。
4. 编辑区必须可上下滚动，能够在长代码场景下持续编辑。
5. 工作台外层也应允许纵向滚动，避免因固定高度组合导致内容被截断。
6. 结果区在未运行时应保持紧凑，不得默认占据与编辑区同级的大块空间。

验收时必须额外验证：

1. 打开“代码运行”页签后，首屏主要看到的是代码编辑区，而不是状态摘要区。
2. 在至少 100 行代码场景下，编辑区可以稳定纵向滚动。
3. 展开文件区、展开结果区、展开 `stdin` 后，编辑区仍保持可用，不出现完全被压缩到难以阅读的情况。
4. 运行前后界面仍保持“编辑优先”，不会自动切成以装饰面板或信息卡片为主的布局。
5. 在右侧常见窄栏宽度下，不会出现多块卡片叠加导致用户必须连续滚动多屏后才能看到编辑区。

### 4.4 回归测试

仍需保留：

1. `POST /api/generate-classroom` 创建响应包含 `classroomId`
2. `GET /api/generate-classroom/:jobId` 成功态包含 `result.classroomId`
3. `GET /api/classroom` 返回服务端课堂列表
4. `DELETE /api/classroom/:id` 成功 / 404
5. 导出后重新导入，图片、音频、视频等媒体完整
6. 幻灯片播放、暂停恢复、翻页和 PPT 指示效果与当前稳定版本保持一致

## 5. 部署检查

发布前至少执行：

1. `pnpm exec eslint`
2. `pnpm exec vitest run`
3. `docker compose up -d --build`

部署前必须确认当前沙箱配置：

1. `OPENMAIC_CODE_SANDBOX_MODE`
2. `OPENMAIC_CODE_SANDBOX_AIO_BACKEND`
3. `OPENMAIC_CODE_SANDBOX_AIO_IMAGE`
4. `OPENMAIC_CODE_SANDBOX_AIO_SANDBOX_HOST`
5. `OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID`
6. `OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC`
7. 若使用 provisioner，还必须确认：
   - `OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL`
   - `OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NAMESPACE`
   - `OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_KUBECONFIG_PATH`
   - `OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NODE_HOST`

部署前还必须确认 Dify 发布配置：

1. `OPENMAIC_DIFY_ENABLED`
2. `OPENMAIC_DIFY_BASE_URL`
3. `OPENMAIC_DIFY_API_KEY`
4. `OPENMAIC_DIFY_DATASET_ID`
5. `OPENMAIC_DIFY_DOCUMENT_ID`
6. `OPENMAIC_DIFY_TIMEOUT_MS`
7. `OPENMAIC_DIFY_POLLING_INTERVAL_MS`
8. 目标文档支持当前分段策略，且不会因默认清洗规则破坏页级边界

还必须确认服务端工作区配置：

1. `workspaceRoot` 在宿主机或容器内可持久化
2. `workspace/`、`uploads/`、`outputs/`、`meta/` 子目录具备读写权限
3. `aio` 模式下容器挂载目录与 host 工作区映射一致
4. 运行用户对挂载文件具备预期写权限

前端与沙箱交互相关部署项还必须确认：

1. `previewBaseUrl` 已配置且可从浏览器访问
2. 预览代理接口与应用主域同源，避免前端额外处理跨域
3. iframe 所需的 CSP / `X-Frame-Options` 设置与预览方案兼容
4. 若预览代理带 token，token 过期时间与执行结果保留时间匹配
5. 日志查询与结果轮询接口在反向代理层不会被过早缓存

若开启 `aio` 模式，还需检查：

1. 沙箱镜像已预拉取
2. 容器运行时可用
3. 端口和反向代理配置正确
4. 沙箱挂载目录可访问
5. `docker` 模式下 Docker socket 已正确挂载
6. `docker` 模式下 `host.docker.internal` 或等效宿主名可从应用容器访问
7. `provisioner` 模式下 provisioner 健康检查可用
8. `provisioner` 模式下 kubeconfig 和命名空间配置有效
9. 预览代理到沙箱容器或预览产物目录的路由可访问
10. 反向代理不会暴露原始容器端口给浏览器
11. 同一服务实例内重复打开编辑器时，必须复用全局共享 sandbox
12. 应用重启后仍能根据稳定 `sandboxId` 发现既有 sandbox，或明确回收并重建

若开启 Dify 同步，还需检查：

1. OpenMAIC 容器可以访问 `https://difytestapi.zhizuobiao.com/v1`
2. 指定 `datasetId` 与 `documentId` 在当前 API Key 权限范围内可读写
3. 生成课堂后 Dify 状态从 `queued` 能推进到 `completed` 或明确失败
4. Dify 失败不会影响课堂本地生成成功
5. 手动重试接口在失败后可重新触发同步
6. “课堂操作”-“发布”在课堂持久化成功后能异步触发一次新的 Dify 更新
7. 远端知识库中的内容能按 PPT 页检索，且单段不超过 `4000` 字符

## 5. Dify “一课一文档”实施补充

本节覆盖正文中所有“固定 `documentId`”实现假设。新的实现基线是：每个课堂创建并维护自己的 Dify 文档。

### 5.1 开发实现补充

1. 配置层不再要求 `OPENMAIC_DIFY_DOCUMENT_ID`
2. 新增 `OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE`
3. 同步服务必须支持两条分支：
   - `create`: 当前课堂无 `documentId`
   - `update`: 当前课堂已有 `documentId`
4. 首次成功创建后，必须把 `documentId`、`documentName`、`documentCreatedAt` 写回本地 `publish-status`
5. 若更新时远端返回 `404`，必须自动切到 `create` 分支补建新文档
6. 日志必须明确区分：
   - `Dify Document Create Started`
   - `Dify Document Create Accepted`
   - `Dify Document Update Started`
   - `Dify Document Recreated After Missing`

### 5.2 部署配置补充

推荐配置：

```bash
OPENMAIC_DIFY_ENABLED=true
OPENMAIC_DIFY_BASE_URL=https://difytestapi.zhizuobiao.com/v1
OPENMAIC_DIFY_API_KEY=
OPENMAIC_DIFY_DATASET_ID=1d2405b1-910a-4820-b06a-ad61b377c1a1
OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE=[{type}] {title} ({classroom})
OPENMAIC_DIFY_TIMEOUT_MS=30000
OPENMAIC_DIFY_POLLING_INTERVAL_MS=2000
OPENMAIC_DIFY_MAX_POLLING_ATTEMPTS=180
```

部署约束：

1. 不再预置 `OPENMAIC_DIFY_DOCUMENT_ID`
2. Dify API Key 只允许存在于服务端环境变量
3. 首次同步成功后，远端文档 ID 由运行时自动生成并持久化

### 5.3 联调测试案例补充

以下用例用于替代旧的“固定文档”联调验证。

案例 A：首次生成自动创建独立文档

1. 调用 `POST /api/generate-classroom`
2. 等待课堂生成成功
3. 查询 `GET /api/classroom/:id/publish-status`
4. 再调用 Dify `GET /datasets/{dataset_id}/documents`

预期：

1. `publish-status.documentId` 最终非空
2. `documentName` 符合命名模板
3. Dify documents 列表中新增一条该课堂专属文档
4. 文档数量相较联调前增加 1

案例 B：同一课堂二次发布复用原文档

1. 记录首次同步后的 `documentId`
2. 修改课堂内容后触发“发布”
3. 查询 `GET /api/classroom/:id/publish-status`

预期：

1. 第二次同步仍返回同一个 `documentId`
2. 状态推进到 `completed` 或明确失败
3. Dify documents 列表中不会新增第二个同课堂文档

案例 C：同名不同课堂互不覆盖

1. 创建课堂 A，标题为 `高等数学`
2. 创建课堂 B，标题也为 `高等数学`
3. 分别等待同步完成

预期：

1. 两个课堂拥有不同 `documentId`
2. 两条文档记录都能在 Dify 列表中看到
3. 文档名可依靠 `classroomId` 尾缀区分

案例 D：远端文档丢失后的自动补建

1. 先完成一门课的首次同步
2. 在 Dify 侧手工删除该文档
3. 回到 OpenMAIC 对该课堂再次执行“发布”

预期：

1. 更新分支先检测到旧 `documentId` 无效
2. 服务端自动创建新文档
3. `publish-status.documentId` 被替换为新值
4. 最终同步仍可进入 `completed`

案例 E：列表可见性验收

1. 连续生成 3 门不同课堂
2. 等待三者同步完成
3. 打开 Dify documents 页面或调用列表接口

预期：

1. 能看到 3 条新增课程文档
2. 每条文档的 metadata 都包含 `classroom`、`type`、`title`
3. 每条文档内容都能按 PPT 页检索

### 5.4 联调记录补充字段

联调记录除原字段外，还必须新增：

1. `documentId(before)` 与 `documentId(after)`
2. `documentName`
3. `create-or-update`
4. `difyDocumentsCountBefore`
5. `difyDocumentsCountAfter`

`docker compose` 示例：

```yaml
services:
  openmaic:
    environment:
      - OPENMAIC_CODE_SANDBOX_MODE=aio
      - OPENMAIC_CODE_SANDBOX_AIO_BACKEND=docker
      - OPENMAIC_CODE_SANDBOX_AIO_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
      - OPENMAIC_CODE_SANDBOX_AIO_DOCKER_SOCKET=/var/run/docker.sock
      - OPENMAIC_CODE_SANDBOX_AIO_SANDBOX_HOST=host.docker.internal
      - OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID=sandbox_aio_global
      - OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC=600
      - OPENMAIC_CODE_SANDBOX_AIO_WORKDIR_MOUNT_PATH=/workspace
      - OPENMAIC_CODE_SANDBOX_AIO_PREVIEW_BASE_URL=http://localhost:3000/api/code-preview
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

`provisioner` 模式示例：

```yaml
services:
  openmaic:
    environment:
      - OPENMAIC_CODE_SANDBOX_MODE=aio
      - OPENMAIC_CODE_SANDBOX_AIO_BACKEND=provisioner
      - OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL=http://provisioner:8002
      - OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NAMESPACE=openmaic
      - OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_KUBECONFIG_PATH=/root/.kube/config
      - OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NODE_HOST=host.docker.internal
      - OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
```

上线后至少人工检查：

1. 首页列表是否包含服务端课堂
2. `curl` 创建课程后首页是否可见
3. 课堂页顶部布局是否正确
4. 代码编辑器能否打开
5. 至少抽样验证 `Python`、`JavaScript`、`Java`、`C++`、`Go`、`Rust`、`Shell`、`HTML / CSS / JavaScript` 八类语言或模板可运行
6. 至少抽样验证 2 类编译失败样例、2 类运行失败样例和 1 类超时样例
7. 至少抽样验证 1 组容器并发隔离用例和 1 组会话回收用例
8. 至少验证 1 组“刷新页面后恢复运行中执行”的前端场景
9. 至少验证 1 组“切离代码工作台后再次返回仍能看到持续更新结果”的前端场景
10. 至少验证 1 组“Web 预览只暴露受控 previewUrl，不暴露容器真实地址”的场景
11. 至少验证 1 组“上传依赖文件后运行成功读取”的场景
12. 至少验证 1 组“释放后重新进入编辑器能快速恢复会话”的场景
