# OpenMAIC v0.3 详细设计

## 1. 总体设计

`v0.3` 的设计重点是在现有课堂页、生成链路和首页列表上继续收口真值与访问约定，同时补入课堂内代码实验能力。

核心设计原则：

1. 教师端 / 学生端是同一课堂真值的两种视图
2. 服务端课堂是后端任务生成与导入导出的唯一真值
3. 首页列表需要同时感知本地课堂与服务端课堂
4. 接口生成必须复用与前端生成页一致的生成配置
5. 代码编辑草稿与代码运行结果是课堂增强态，不直接写回课堂主 JSON
6. 代码执行底层统一抽象为沙箱提供者，兼容本地模式与容器模式
7. 不改动本项目已有核心功能的既有行为语义，新增能力只能增量接入

### 1.1 核心功能保护约束

后续设计与实现必须遵守：

1. 不以新增代码编辑器需求为由改动既有播放主链路
2. 不改变幻灯片播放、PPT 指示效果、翻页、互动白板、笔记、对话、课堂操作、课堂生成和课程包导入导出的既有交互语义
3. 代码编辑器、代码运行页签和沙箱层必须与现有课堂能力解耦
4. 若必须触碰既有核心链路，只能做最小兼容性改动，并补充专项回归测试
5. 若某方案会引入对上述核心功能的行为漂移，该方案应直接判定为不合格方案

### 1.2 技术栈差异与接入原则

当前两个项目的技术边界如下：

1. OpenMAIC：
   - 前端：`React + TypeScript`
   - 应用框架：`Next.js`
   - 服务端：`Node.js / TypeScript Route Handlers`
2. `deer-flow`：
   - 核心沙箱实现位于 `Python` 后端
   - `LocalSandboxProvider` / `AioSandboxProvider` 是 Python 侧 provider 抽象

因此 `v0.3` 必须明确：

1. OpenMAIC 不做“把 Python provider 代码直接搬进 Next.js 进程”这种实现
2. OpenMAIC 也不以语言统一为目标，不改造现有项目主技术栈
3. 参考 `deer-flow` 的内容是：
   - provider 抽象
   - 沙箱生命周期
   - 挂载策略
   - idle timeout / warm pool / replicas
   - 本地模式与容器模式的职责边界
4. 不直接复用的内容是：
   - Python 包导入方式
   - LangGraph / FastAPI 运行时本身
   - `deer-flow` 内部线程与 Agent 中间件实现

推荐接入方式只有两类：

1. TypeScript 原生适配：
   - 在 OpenMAIC 内定义 `ClassroomCodeSandboxProvider`
   - 用 TypeScript 实现 `local` / `aio` 两种 provider
   - 复刻 `deer-flow` 的核心语义，而不是复制 Python 源码
2. 独立沙箱服务适配：
   - 把 Python provider 封装在独立服务中
   - OpenMAIC 仅通过 HTTP / RPC 调用该服务
   - 通过 DTO 和状态机协议对接，而不是通过源码耦合

`v0.3` 方案结论：

1. 正式采用 TypeScript 原生适配方案
2. 独立 Python 沙箱服务方案仅作为后备路线，不进入 `v0.3` 默认实现
3. 选择理由：
   - OpenMAIC 当前是单体 Node / Next.js 架构
   - 现有课堂真值、右侧面板和 API 全部在 TypeScript 内
   - `deer-flow` 并没有可直接复用的现成“代码运行业务 API”
   - 若引入独立 Python 服务，会显著增加协议、部署、监控和故障面
4. 无论采用何种后续扩展路径，都不得让语言差异反向污染课堂播放、笔记、对话、导出等既有核心模块

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

### 2.3 代码编辑器入口

课堂主画布工具栏新增“代码编辑器”按钮：

1. 位置在“互动白板”按钮右侧
2. 图标与文案使用独立语义，不复用白板按钮
3. 交互风格参照互动白板：
   - 不再浮层式弹出
   - 不跳离课堂主页面
   - 激活右侧“代码运行”工作台并保持与当前 PPT / Scene 联动
4. 代码编辑器打开时不强制暂停课堂播放
5. 若当前场景切换，代码编辑器上下文切换到新场景对应的代码会话

### 2.4 右侧页签装配

教师端右侧菜单：

1. 笔记
2. 对话
3. 课堂操作
4. 代码运行

学生端右侧菜单：

1. 笔记
2. 对话
3. 代码运行

说明：

1. “代码运行”与现有右侧区同层，不单独开新页面
2. “代码运行”页签用于展示运行状态、日志、预览和产物
3. 若刚触发运行，可自动切到“代码运行”页签

## 3. 代码编辑器设计

### 3.1 页面级布局

代码编辑器前端页面不再以课堂内弹层存在，而是与右侧“代码运行”页签融合为同一个“代码工作台”页面。该页面占用现有右侧面板区域，不新增覆盖课堂主画布的浮层。

由于右侧面板宽度显著小于此前弹框宽度，视觉与交互必须按“窄栏工作台”重新设计，禁止把旧弹框布局原样压缩后直接塞入右侧面板。

建议布局：

1. 工作台位置
   - 位于课堂右侧面板区域
   - 与“笔记”“对话”“课堂操作”共用同一页签容器
2. 工作台尺寸
   - 默认跟随右侧面板宽度和高度
   - 不覆盖课堂主画布，不改变既有播放、翻页和画布交互层级
3. 工作台结构
   - 紧凑顶部工具条
   - 可折叠文件导航
   - 主编辑区
   - 结果 / 预览区
   - 可折叠输入 / 状态区

建议采用“纵向主栈 + 横向轻导航”布局，而不是旧的三栏宽屏布局：
1. 顶部为单行紧凑工具条，仅保留语言、入口文件、保存、运行、停止等高频操作
2. 文件导航默认收敛为左侧窄 rail：
   - 仅显示文件名列表或图标
   - 需要时展开
   - 在窄宽度下可退化为下拉选择器
3. 中部主区默认分为上下两段：
   - 上段为编辑区，优先保证代码可读性
   - 下段为结果区，展示日志、状态与预览
4. 编辑区与结果区之间允许拖拽调整高度
5. 当语言为 Web 预览型时，下段结果区优先展示预览，日志折叠为二级区域
6. 当语言为终端型时，下段结果区优先展示 stdout / stderr，预览区隐藏
7. 在极窄宽度下允许切换成二级子页签：
   - 编辑
   - 结果
   但仍属于同一个右侧“代码运行”工作台，不是新弹框

建议视觉层次：

1. 顶部工具条固定，但高度必须控制在窄栏可承受范围
2. 文件导航不能占用过多横向空间，默认以轻量模式存在
3. 运行结果与编辑器同处一个右侧工作台页面，不再分属弹层与右侧页签
4. 工作台中保留必要的即时反馈，例如：
   - 当前会话状态
   - 最近一次运行状态
   - 当前语言和入口文件
5. 视觉风格应更接近 IDE 的 side panel，而不是缩小版弹框

### 3.2 工作台区域划分

#### 3.2.1 顶部工具条

顶部工具条建议包含：

1. 左侧
   - 当前语言选择器
   - 当前场景名称
   - 当前会话状态标识
2. 中部
   - 当前入口文件名
   - 未保存草稿标识
3. 右侧
   - 保存草稿
   - 运行
   - 停止
   - 更多操作

交互要求：

1. `运行` 为主按钮
2. `停止` 仅在 `queued` / `running` 态可用
3. `保存草稿` 在 `dirty=true` 时高亮
4. `更多操作` 中再放置重置等低频操作，避免挤压主工具条
5. 用户切离工作台仅切换右侧页签，不释放会话，不中止执行

#### 3.2.2 左侧文件区

文件导航建议宽度为工作台内容区的 `14%` 到 `20%`，包含：

1. 文件列表
2. 当前文件高亮
3. 入口文件标记
4. 新建文件入口
5. 依赖文件上传入口

展示规则：

1. 代码文件与上传依赖文件分组展示
2. 入口文件使用明显标识
3. 当前活动文件高亮
4. 文件名过长时截断显示，但 hover 可见完整名
5. 在宽度不足时，文件导航允许折叠为仅显示文件图标或下拉菜单

#### 3.2.3 中央编辑区

中央编辑区是主区域，默认承载 Monaco Editor。

要求：

1. 支持语法高亮
2. 支持按语言切换默认模板
3. 支持多文件 tab
4. 支持只读状态提示：
   - 会话失效
   - 正在重建
   - 语言未支持
5. 支持行号、缩进、查找替换等标准编辑能力
6. 编辑区在窄栏中优先保证单列阅读体验，不引入额外侧边浮层

#### 3.2.4 底部输入与状态区

工作台底部建议包含折叠式辅助区：

1. 标准输入 `stdin` 输入框
2. 当前运行状态摘要
3. 最近保存时间
4. 最近执行时间

要求：

1. 默认折叠，避免抢占编辑区域
2. 运行相关状态以摘要形式展示，不替代结果主区
3. `stdin` 内容属于草稿的一部分，需持久化

#### 3.2.5 结果与预览区

结果区建议位于编辑区下方，而不是另起整页，包含：

1. 状态条
2. stdout / stderr 切换
3. 退出码与耗时摘要
4. Web 预览 iframe 或产物列表

设计要求：
1. 结果区默认可见，避免用户运行后还要二次跳转
2. 结果区支持折叠、展开和拖拽高度调整
3. Web 预览时预览画面优先，日志收敛到底部或子页签
4. 终端型语言时日志优先，预览区不占位

### 3.1 组件形态

建议新增组件：

1. `CodeWorkbenchPanel`
2. `CodeEditorPane`
3. `CodeRunnerPanel`
4. `CodeLanguageSelector`
5. `CodeFileTree`
6. `CodeExecutionToolbar`

建议技术选型：

1. 编辑器使用 Monaco Editor
2. Web 预览复用现有 iframe / web preview 安全容器能力
3. 终端输出使用流式日志视图

### 3.3 编辑器功能

最小功能集：

1. 语言切换
2. 多文件管理
3. 入口文件设置
4. 标准输入输入框
5. 运行按钮
6. 停止按钮
7. 重置按钮
8. 保存草稿按钮

### 3.4 页面状态设计

代码编辑器页面至少区分以下可见状态：

1. 初始加载态
   - 显示 skeleton 或 loading
   - 禁用运行和保存按钮
2. 就绪态
   - 可编辑
   - 可保存
   - 可运行
3. 运行提交态
   - 运行按钮进入 loading
   - 其它高风险操作适度禁用
4. 执行中态
   - 可查看最新运行状态
   - 停止按钮可用
5. 失败态
   - 显示最近错误摘要
   - 保留编辑内容
   - 允许继续修改并重试
6. 会话失效态
   - 显示“重新连接”或“重新创建会话”入口
   - 编辑区可临时只读

页面状态约束：

1. 任何错误态都不能丢失本地草稿
2. 执行中态不强制锁死编辑器，但需明确提示“运行结果基于上一次提交”
3. 页面状态切换不能影响课堂播放或翻页

### 3.5 响应式与适配策略

1. 桌面端
   - 使用窄栏优化布局：顶部工具条 + 轻量文件导航 + 编辑/结果纵向栈
2. 平板端
   - 文件导航折叠为抽屉或选择器
   - 编辑区与结果区默认以子页签切换
3. 小屏设备
   - 不要求完整编辑体验
   - 可降级为只读结果查看或最小编辑模式

约束：

1. 不允许因代码编辑器接入破坏现有课堂页的移动端布局
2. 小屏降级策略必须在文档中明确，而不是交给实现阶段临时决定
3. 任何断点下都不允许回退到旧的宽弹框布局

### 3.5.1 右侧工作台极简布局方案

本次补充需求将右侧“代码工作台”的界面目标进一步收紧为“简洁、实用、编辑区优先”。具体设计如下：

1. 总体结构
   - 采用单列纵向布局。
   - 从上到下依次为：极简工具条、轻量文件选择、主编辑区、折叠结果区、折叠 stdin 区。
   - 页面不再使用多卡片拼贴、概览面板或大面积说明文案作为默认布局。
2. 顶部工具条
   - 仅保留必要控件：语言、入口文件、保存、运行、停止。
   - 顶部工具条固定在工作台顶部，但高度必须尽量压缩，避免吞掉编辑空间。
   - 场景标题、执行状态等信息只保留简短文本或单个状态标签，不再使用多块摘要卡片。
3. 文件区
   - 文件区默认轻量显示，可采用一行文件标签或单个下拉选择器。
   - 文件列表展开后应以最小高度展示，关闭后立即把空间让回编辑区。
   - 文件区不再设计为占据明显横向宽度的固定侧栏。
4. 编辑区
   - 编辑区是主视觉和主交互区域，默认至少占工作台可见主体高度的 60%。
   - 编辑区必须支持独立纵向滚动，用于浏览和编辑长代码。
   - 编辑区容器本身允许在右侧面板整体滚动时保持可用，不得因外层布局导致无法连续输入。
5. 结果区
   - 结果区默认折叠或保持紧凑摘要，仅在运行后展开。
   - 对终端型语言优先展示 stdout / stderr。
   - 对 Web 预览型语言优先展示预览，再以下级区域展示日志。
   - 结果区不得在未运行时占据与编辑区相近的空间。
6. stdin 与辅助区
   - `stdin` 采用折叠方式放在底部。
   - 仅在用户需要输入时展开。
   - 不再常驻展示额外执行统计、辅助说明或低频状态信息。
7. 滚动策略
   - 工作台整体允许纵向滚动。
   - 编辑区自身允许独立纵向滚动。
   - 结果区日志也允许独立纵向滚动。
   - 设计目标是避免“整个右栏不滚、编辑区也不滚”的死布局。
8. 视觉原则
   - 减少装饰性背景、状态卡片和视觉噪音。
   - 以代码内容、运行按钮和结果反馈作为主要视觉焦点。
   - 颜色与边框仅用于区分区域和状态，不承担额外叙事。

### 3.6 会话作用域

代码会话不应直接挂在课堂主数据上，建议使用如下作用域：

```ts
type CodeSessionScope = {
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  view: 'teacher' | 'student';
};
```

原因：

1. 教师端与学生端不应互相覆盖实验代码
2. 多浏览器打开同一课堂时不应共享临时代码草稿
3. 代码实验天然是会话态，不是课堂结构化真值

### 3.7 前端与沙箱交互边界

前端与沙箱环境的交互必须遵守如下边界：

1. 浏览器不直接请求沙箱容器地址
2. 浏览器不直接感知 Docker 容器 ID、Pod 名称、NodePort 或 provisioner 内部地址
3. 浏览器只与 OpenMAIC 服务端接口交互：
   - `POST /api/classroom/:id/code-sessions`
   - `PUT /api/classroom/:id/code-sessions/:sessionId`
   - `POST /api/classroom/:id/code-sessions/:sessionId/run`
   - `GET /api/classroom/:id/code-sessions/:sessionId/executions/:executionId`
   - `DELETE /api/classroom/:id/code-sessions/:sessionId`
   - `GET /api/code-preview/:previewToken`
4. 若结果为 Web 预览，前端只能使用 OpenMAIC 返回的受控 `previewUrl`
5. 前端不得自行拼接 `sandboxHost`、容器端口或 `provisioner_url`

这条边界的原因：

1. 避免前端与底层 `local` / `aio` / `provisioner` 模式耦合
2. 避免把容器拓扑和宿主网络暴露到浏览器
3. 保证后续切换 Docker backend 或 provisioner backend 时前端无需变更

### 3.8 前端状态模型

建议前端引入独立的课堂代码运行状态容器，而不是复用课堂播放或聊天状态：

```ts
type CodeWorkbenchState = {
  activeRightPanel: 'notes' | 'chat' | 'ops' | 'code';
  panelMode: 'editor' | 'split' | 'result';
  activeView: 'teacher' | 'student';
  scope: {
    classroomId: string;
    sceneId: string;
    clientSessionId: string;
  };
  session: {
    sessionId: string | null;
    status: 'idle' | 'creating' | 'ready' | 'released' | 'error';
    language: string;
    entrypoint: string;
  };
  draft: {
    files: Array<{ path: string; content: string }>;
    stdin: string;
    dirty: boolean;
    lastSavedAt: number | null;
  };
  execution: {
    executionId: string | null;
    status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'stopped';
    stdout: string;
    stderr: string;
    exitCode: number | null;
    previewMode: 'terminal' | 'web' | 'artifact' | null;
    previewUrl: string | null;
    artifacts: Array<{ path: string; size: number }>;
    pollUrl: string | null;
  };
};
```

设计要求：

1. 代码工作台状态与播放引擎状态分离
2. 场景切换时只切换代码作用域，不驱动 PPT 播放链路重建
3. 右侧“代码运行”页签只消费 `execution` 状态，不直接操作编辑器草稿
4. 用户切离代码工作台后会话可保留，避免重复创建沙箱

### 3.9 前端组件与 Hook 划分

建议前端职责拆分如下：

1. `CodeWorkbenchPanel`
   - 负责右侧代码工作台整体布局、编辑区和结果区联动
2. `CodeEditorPane`
   - 负责文件编辑、多语言切换、运行与保存按钮
3. `CodeRunnerPanel`
   - 负责展示执行状态、日志、退出码、产物和预览
4. `useCodeWorkbench`
   - 统一管理会话、草稿、执行和轮询状态
5. `useCodeSession`
   - 负责创建 / 恢复 / 释放会话
6. `useCodeExecution`
   - 负责运行代码、停止执行、轮询执行结果
7. `useCodeDraftPersistence`
   - 负责 IndexedDB 本地草稿保存与恢复
8. `CodePreviewFrame`
   - 负责以受控 iframe 方式加载 `previewUrl`

约束：

1. 这些组件和 Hook 不能直接依赖课堂播放引擎内部状态
2. 它们只能消费 `classroomId`、`sceneId`、`view` 和当前页面 UI 上下文
3. 若右侧页签系统已有状态管理，应以并列子状态方式接入，而不是重写整个右侧面板

## 4. 代码运行页签设计

### 4.1 面板内容

“代码运行”页签至少包含：

1. 当前语言
2. 当前执行状态
3. `stdout`
4. `stderr`
5. 退出码
6. 执行时长
7. 产物列表
8. 预览区域

### 4.2 预览模式

按语言或模板映射预览模式：

1. `terminal`
   - Python
   - Java
   - C / C++
   - Go
   - Rust
   - Shell
2. `web`
   - HTML / CSS / JavaScript
   - 前端框架模板
3. `artifact`
   - 仅展示生成文件，不提供实时界面

### 4.3 失败态展示

运行失败时必须明确展示：

1. 编译失败还是运行失败
2. 错误输出
3. 最后一次执行时间
4. 重试入口

### 4.4 前端运行态联动

前端从编辑器到右侧结果页签的联动规则：

1. 用户点击“运行”后，编辑器进入 `submitting` 态，运行按钮禁用
2. 服务端返回执行已创建后：
   - 编辑器退出 `submitting`
   - 右侧自动切换到“代码运行”页签
   - `execution.status` 进入 `queued` 或 `running`
3. 当轮询结果进入 `succeeded`：
   - `stdout`、`stderr`、exit code、artifacts 和 `previewUrl` 全量刷新
   - 若 `previewMode=web`，右侧结果区挂载预览 iframe
4. 当结果进入 `failed` 或 `timed_out`：
   - 右侧仍保留最近一次日志
   - 编辑器恢复可编辑和可重试
5. 当用户切离“代码运行”工作台：
   - 不中止当前执行
   - 再次返回时仍可见当前状态
6. 当用户切换到其他右侧页签：
   - 不中断执行轮询
   - 若执行结束，可通过 badge 或状态提示提醒用户

## 5. 代码沙箱架构设计

### 5.1 抽象接口

OpenMAIC 侧建议引入统一适配层：

```ts
interface ClassroomCodeSandboxProvider {
  createSession(input: CreateCodeSessionInput): Promise<CodeSandboxSession>;
  saveDraft(input: SaveCodeDraftInput): Promise<void>;
  run(input: RunCodeInput): Promise<CodeExecution>;
  getExecution(input: GetExecutionInput): Promise<CodeExecutionResult>;
  releaseSession(input: ReleaseCodeSessionInput): Promise<void>;
}
```

该抽象只表达课堂代码实验所需能力，不直接暴露 Deer Flow 内部实现细节。

补充约束：

1. 该接口是 OpenMAIC 的 TypeScript 领域接口，不依赖 Python 类型系统
2. 若底层实现来自独立 Python 服务，必须先映射到该 TypeScript 接口再被业务层使用
3. 课堂业务层不得感知底层是 Node 原生实现还是 Python 远程实现

`v0.3` 落地要求：

1. 首批实现直接在 OpenMAIC 内提供该接口的 TypeScript 实现
2. 业务层、路由层和前端状态层一律依赖该 TypeScript 抽象
3. 不为 `v0.3` 首版引入额外 Python 业务服务依赖

### 5.2 `LocalSandboxProvider` 适配策略

参考 `D:\Workspace\deer-flow\backend\packages\harness\deerflow\sandbox\local\local_sandbox_provider.py`：

1. 本地模式是宿主机侧便利模式
2. `LocalSandboxProvider` 采用单例沙箱
3. 它适合本机开发、测试和单用户受信任环境
4. 不应把它视为严格安全隔离边界
5. 若启用宿主机 `bash`，必须仅限受信任环境

OpenMAIC 设计约束：

1. `local` 模式下默认禁用任意宿主命令透传
2. 只开放语言运行模板和受控文件目录
3. 执行目录使用课堂代码工作区，而不是任意仓库路径
4. 若使用 TypeScript 原生实现，应保持与 `deer-flow` 本地模式一致的职责边界，而不是追求逐文件逐函数复刻
5. 若使用 Python 独立服务实现，OpenMAIC 只通过协议调用，不直接 import Python provider

### 5.3 `AioSandboxProvider` 适配策略

参考 `D:\Workspace\deer-flow\backend\packages\harness\deerflow\community\aio_sandbox\aio_sandbox_provider.py`：

1. `AioSandboxProvider` 负责容器沙箱生命周期
2. 支持线程级或会话级工作目录挂载
3. 支持 idle timeout、warm pool、replicas 和远程 provisioner
4. 适合作为生产环境默认执行方式

OpenMAIC 设计约束：

1. 代码运行会话与容器沙箱一一对应或按 warm pool 复用
2. 每个会话挂载独立工作目录
3. Web 预览端口需要通过受控反向代理或临时 URL 暴露
4. 空闲会话按超时策略自动回收
5. 若复用 `deer-flow` 的容器逻辑，OpenMAIC 只复用运行模式和部署边界，不直接依赖其 Python 应用运行时
6. 会话对应的 sandbox 标识必须可确定性重建，便于进程重启后重新发现现有容器
7. `release` 与 `destroy` 必须是两种不同语义：
   - `release`：从活跃会话移出，但容器可进入 warm pool 复用
   - `destroy`：真正销毁容器和相关资源
8. `replicas` 视为软上限：
   - 不应强行终止正在服务中的活跃会话
   - 优先淘汰 warm pool 中最旧的沙箱

### 5.3.1 Host 侧权威工作区与同步模型

参考 `deer-flow` 的 `uploads` 路由和 AIO 容器挂载模型，OpenMAIC 需要明确“谁是权威数据源”：

1. 权威文件副本始终保存在 OpenMAIC host 侧工作区
2. `local` 模式下：
   - 直接在 host 工作区读写
   - 不需要额外同步到远端 sandbox
3. `aio` 模式下：
   - 先写入 host 工作区
   - 再同步或挂载到容器工作区
   - 容器内运行结果回写到挂载目录或产物目录
4. 前端文件树展示的是代码工作区的逻辑文件视图，而不是容器内部绝对路径

建议目录模型：

```text
{workspaceRoot}/classrooms/{classroomId}/code/{sceneId}/{clientSessionId}/
  workspace/   # 用户编辑代码
  uploads/     # 运行依赖附件
  outputs/     # 编译产物、执行产物、预览静态内容
  meta/        # session / execution 元数据
```

同步约束：

1. `workspace/` 是编辑器主读写目录
2. `uploads/` 用于附加依赖文件，不允许覆盖系统路径
3. `outputs/` 由运行时写入，前端只读
4. 在 `aio` 模式下，同步到容器的 host 文件必须保证 sandbox 运行用户可写
5. 若文件为符号链接或存在路径穿越风险，必须拒绝同步

### 5.3.2 可发现性与进程重启恢复

参考 `deer-flow` 的 deterministic sandbox id 与 backend discover 设计，OpenMAIC 应明确：

1. `sandboxId` 应从会话作用域稳定推导：
   - `classroomId`
   - `sceneId`
   - `clientSessionId`
   - `view`
2. OpenMAIC 进程重启后，若 session 仍有效：
   - 应能根据稳定 `sandboxId` 重新发现现有容器或 provisioner 资源
   - 不应无条件新建 sandbox
3. 前端刷新页面时恢复执行状态，依赖的是服务端可恢复的 session / execution 真值，而不是浏览器内存状态
4. 多实例或多进程场景下，创建同一 `sandboxId` 时必须防止并发冲突
5. 若底层发现已有 sandbox，则应优先复用，而不是重复创建

### 5.4 提供者选择规则

建议配置：

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
    replicas: 3
    idleTimeoutSec: 600
    workdirMountPath: /workspace
    previewBaseUrl: http://localhost:3000/api/code-preview
    provisioner:
      url: ""
      kubeNamespace: openmaic
      kubeconfigPath: /root/.kube/config
      nodeHost: host.docker.internal
      image: enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
```

规则：

1. 本地开发默认可使用 `local`
2. Docker / 多用户 / 共享环境默认使用 `aio`
3. 前端不允许通过请求参数直接切换提供者
4. 当前提供者模式仅通过服务端部署配置决定
5. `aio.backend=docker` 表示由 OpenMAIC 直接通过宿主 Docker 运行容器，语义对齐 `deer-flow` 的本地 Docker 模式
6. `aio.backend=provisioner` 表示由独立 provisioner 负责容器或 Pod 生命周期，语义对齐 `deer-flow` 的 `provisioner_url` 模式

配置映射说明：

1. `deer-flow` 的 `sandbox.use` 在 OpenMAIC 中收敛为 `codeSandbox.mode`
2. `deer-flow` 的 `idle_timeout` 在 OpenMAIC 中收敛为 `codeSandbox.aio.idleTimeoutSec`
3. `deer-flow` 的 `replicas` 在 OpenMAIC 中收敛为 `codeSandbox.aio.replicas`
4. `deer-flow` 的 `provisioner_url` 在 OpenMAIC 中收敛为 `codeSandbox.aio.provisioner.url`
5. `deer-flow` 的 `DEER_FLOW_SANDBOX_HOST` 在 OpenMAIC 中收敛为 `codeSandbox.aio.sandboxHost`
6. `deer-flow` 的 `SANDBOX_IMAGE` 在 OpenMAIC 中拆分为 `codeSandbox.aio.image` 与 `codeSandbox.aio.provisioner.image`

配置优先级：

1. 运行时环境变量
2. 服务端配置文件
3. 文档默认值

建议环境变量映射：

```bash
OPENMAIC_CODE_SANDBOX_MODE=local|aio
OPENMAIC_CODE_SANDBOX_LOCAL_WORKSPACE_ROOT=./.openmaic/code-sandbox
OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL=false
OPENMAIC_CODE_SANDBOX_AIO_BACKEND=docker|provisioner
OPENMAIC_CODE_SANDBOX_AIO_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
OPENMAIC_CODE_SANDBOX_AIO_DOCKER_SOCKET=/var/run/docker.sock
OPENMAIC_CODE_SANDBOX_AIO_SANDBOX_HOST=host.docker.internal
OPENMAIC_CODE_SANDBOX_AIO_REPLICAS=3
OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC=600
OPENMAIC_CODE_SANDBOX_AIO_WORKDIR_MOUNT_PATH=/workspace
OPENMAIC_CODE_SANDBOX_AIO_PREVIEW_BASE_URL=http://localhost:3000/api/code-preview
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL=
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NAMESPACE=openmaic
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_KUBECONFIG_PATH=/root/.kube/config
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NODE_HOST=host.docker.internal
OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
```

字段语义：

1. `mode`
   - `local`：受信任单机开发模式
   - `aio`：隔离容器执行模式
2. `aio.backend`
   - `docker`：OpenMAIC 直接连接 Docker socket 启停容器
   - `provisioner`：OpenMAIC 通过 HTTP 调用 provisioner 管理容器或 Pod
3. `aio.image`
   - `docker` 模式下用于直接启动沙箱容器镜像
4. `aio.sandboxHost`
   - 容器内或后端容器访问沙箱暴露地址时使用的宿主名，参考 `deer-flow` 的 `host.docker.internal`
5. `aio.previewBaseUrl`
   - Web 预览代理入口基础地址，不允许前端自行拼接容器地址
6. `aio.provisioner.*`
   - 仅在 `aio.backend=provisioner` 时生效
   - 用于对接 `deer-flow` 同类 provisioner 服务的 URL、命名空间、kubeconfig 和镜像

### 5.5 语言差异落地方式

为处理 OpenMAIC 与 `deer-flow` 的开发语言差异，`v0.3` 只接受以下落地模式：

1. 同语义 TypeScript 适配模式
   - OpenMAIC 在 Node 侧重写 provider 适配层
   - 复用 `deer-flow` 的概念模型与运行策略
   - 不直接复用 Python 源码
2. Python 沙箱服务模式
   - 把 `deer-flow` provider 作为独立进程或独立服务部署
   - OpenMAIC 通过接口协议调用
   - 协议建议包含：
     - `createSession`
     - `saveDraft`
     - `run`
     - `getExecution`
     - `releaseSession`

不接受的模式：

1. 在 Next.js route handler 中直接加载 Python 包
2. 用临时 shell 脚本把前端请求直接拼接成 Python 内部调用
3. 让课堂业务层直接感知 `deer-flow` 内部目录结构和 Python 类名

`v0.3` 当前定稿：

1. 采用“同语义 TypeScript 适配模式”作为正式实现方案
2. `deer-flow` 的作用是提供语义参考、容器边界参考和 provisioner 思路参考
3. Python 沙箱服务模式只保留在架构文档中，供后续平台化阶段评估，不作为当前开发任务范围

### 5.6 容器沙箱测试设计

`AioSandboxProvider` 作为 `v0.3` 默认推荐的隔离执行方式，设计阶段必须同步定义全量测试矩阵，不能只做单语言冒烟验证。

必须覆盖的测试维度：

1. 语言基线
   - Python
   - JavaScript
   - TypeScript
   - Java
   - C
   - C++
   - Go
   - Rust
   - C#
   - PHP
   - Ruby
   - Kotlin
   - Swift
   - Scala
   - Shell
   - HTML / CSS / JavaScript Web 预览
2. 生命周期
   - 创建会话
   - 保存草稿
   - 首次运行
   - 重复运行
   - 停止运行
   - 释放会话
   - idle timeout 自动回收
3. 运行结果
   - `stdout`
   - `stderr`
   - exit code
   - preview URL
   - artifact 列表
   - 编译失败与运行失败区分
4. 资源与安全
   - timeout
   - memory limit
   - cpu limit
   - output size limit
   - artifact size limit
   - 非法路径访问阻断
   - 非白名单网络访问阻断
5. 容器编排
   - 单容器单会话
   - warm pool 复用
   - 并发会话隔离
   - 容器异常退出后的恢复
   - provisioner 不可用时的错误传播
6. 预览链路
   - terminal 型语言只展示终端输出
   - web 型语言可返回可访问预览
   - artifact 型语言只展示产物，不暴露交互预览
7. 与课堂集成
   - 教师端 / 学生端会话隔离
   - 场景切换后会话作用域正确
   - 打开代码编辑器不影响既有 PPT 播放链路
   - 运行代码不影响笔记、对话、课堂操作现有行为

设计约束：

1. 上述测试矩阵必须在实现前写入测试计划，不能等编码完成后再补
2. 每一种受支持语言都必须至少有一个成功样例和一个失败样例
3. `AioSandboxProvider` 不能仅以 Python / JavaScript / HTML 三种语言通过为验收标准
4. 容器沙箱测试必须区分单元测试、集成测试和 Docker 部署后验收
5. 若某语言在当前镜像中暂不支持，文档必须明确标注“未交付”，而不是跳过测试记录

## 6. 语言运行时设计

### 6.1 运行时注册表

建议新增运行时注册表：

```ts
type CodeRuntimeSpec = {
  language: string;
  label: string;
  defaultFileName: string;
  previewMode: 'terminal' | 'web' | 'artifact';
  command: string[];
  compileCommand?: string[];
  timeoutMs: number;
};
```

职责：

1. 统一描述每种语言如何运行
2. 统一描述默认文件名和入口文件
3. 统一描述预览模式
4. 为 UI 提供“支持语言列表”

### 6.2 主流语言支持策略

`v0.3` 不建议把“支持主流语言”做成前端写死，而应通过运行时注册表和沙箱镜像能力提供。

首批建议语言：

1. Python
2. JavaScript
3. TypeScript
4. HTML / CSS / JS Web 模板
5. Java
6. C
7. C++
8. Go
9. Rust
10. C#
11. PHP
12. Ruby
13. Kotlin
14. Swift
15. Scala
16. Shell

## 7. 数据模型设计

### 7.1 前端本地草稿

```ts
type CodeEditorDraft = {
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  language: string;
  entrypoint: string;
  files: Array<{ path: string; content: string }>;
  stdin: string;
  updatedAt: number;
};
```

存储建议：

1. IndexedDB 或 local storage 索引层
2. 按课堂和场景分桶
3. 保留最近使用语言与最近编辑文件

### 7.2 服务端会话

```ts
type PersistedCodeSession = {
  id: string;
  classroomId: string;
  sceneId: string;
  clientSessionId: string;
  providerMode: 'local' | 'aio';
  sandboxId: string | null;
  language: string;
  entrypoint: string;
  status: 'ready' | 'running' | 'stopped' | 'released';
  updatedAt: string;
};
```

### 7.3 服务端执行结果

```ts
type PersistedCodeExecution = {
  id: string;
  sessionId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  previewMode: 'terminal' | 'web' | 'artifact';
  previewUrl: string | null;
  artifacts: Array<{ path: string; size: number }>;
  startedAt: string;
  finishedAt: string | null;
};
```

## 8. 请求流程设计

### 8.1 打开代码编辑器

1. 前端解析当前 `classroomId`、`sceneId` 和 `clientSessionId`
2. 调用创建或恢复会话接口
3. 拉取支持语言列表和最近草稿
4. 切换右侧面板到“代码运行”工作台并默认进入编辑态

### 8.2 保存草稿

1. 前端本地防抖保存草稿
2. 用户显式保存时同步到服务端会话
3. 不触发课堂主数据保存
4. 服务端保存草稿时，应先更新 host 侧权威工作区，再决定是否同步到 sandbox
5. `aio` 模式下如当前 session 已绑定容器，草稿保存后应支持增量同步到容器工作区

### 8.3 运行代码

1. 前端提交当前语言、文件、入口文件和标准输入
2. 服务端调用当前 `ClassroomCodeSandboxProvider`
3. 沙箱执行编译 / 运行命令
4. 服务端写入执行记录
5. 前端切换到“代码运行”页签
6. 前端轮询或订阅执行状态
7. 若有 Web 预览，则在结果区嵌入预览

### 8.4 前端轮询与停止策略

前端执行结果获取策略建议如下：

1. 默认使用短轮询：
   - `queued` / `running` 阶段每 `1000ms` 轮询一次
   - 连续运行超过 `30s` 后可降为每 `2000ms`
2. 若浏览器标签页不可见：
   - 轮询频率降低
   - 页面恢复可见时立即补一次查询
3. 轮询终止条件：
   - `succeeded`
   - `failed`
   - `timed_out`
   - `stopped`
   - 会话已释放
4. 用户点击“停止”时：
   - 前端调用停止执行接口或释放当前执行上下文
   - UI 进入 `stopping` 中间态
   - 直到服务端返回 `stopped` 或终态才解除
5. 若轮询连续失败超过阈值：
   - UI 展示“结果获取失败，可手动重试”
   - 不清空最近一次已获取日志

### 8.5 场景切换与页面卸载

1. 场景切换时：
   - 若当前草稿未保存，先执行本地防抖持久化
   - 代码工作台切换到新 `sceneId` 作用域
   - 不自动释放旧场景会话，避免频繁重建沙箱
2. 页面关闭或刷新前：
   - 尽量提交本地草稿
   - 不阻塞页面卸载等待执行完成
3. 用户显式结束课堂或离开课堂页时：
   - 可批量释放当前浏览器持有的代码会话
4. 教师端和学生端从同一课堂 URL 切换时：
   - 必须重新计算 `view` 作用域
   - 不得复用对方的代码会话

### 8.5.1 前端文件上传与依赖同步

若代码编辑器支持附加依赖文件，前端与沙箱的交互应参照 `deer-flow` 的上传同步方式：

1. 浏览器先把文件上传到 OpenMAIC 服务端
2. 服务端把文件写入 host 侧 `uploads/`
3. `local` 模式下：
   - 前端后续运行直接使用该 host 文件
4. `aio` 模式下：
   - 服务端将上传文件同步到容器挂载目录
   - 必要时修正文件权限，确保容器内运行用户可读写
5. 若上传文件可转换为运行时辅助格式，转换结果也应同步到相同作用域
6. 上传路径必须做文件名规范化和路径穿越防护

### 8.6 Web 预览接入方案

前端加载 Web 预览必须使用受控代理模式：

1. 服务端为每次执行结果生成 `previewToken`
2. 前端只拿到：
   - `previewMode`
   - `previewUrl`
   - 可选的 `expiresAt`
3. `previewUrl` 格式建议为：

```text
/api/code-preview/{previewToken}
```

4. `CodePreviewFrame` 使用 iframe 加载该地址
5. 预览 iframe 默认启用隔离策略：
   - `sandbox`
   - `allow-scripts`
   - `allow-same-origin` 仅在必要时开启
6. 预览加载失败时：
   - 显示明确错误态
   - 保留原始日志和 artifact 列表
7. 前端不得缓存底层容器地址，即使服务端内部是 Docker `host:port` 形式

### 8.7 前端异常恢复策略

1. 会话创建失败：
   - 编辑器显示错误提示
   - 保留本地草稿，允许重试
2. 运行提交失败：
   - 不清空当前编辑内容
   - 允许再次点击运行
3. 执行中页面刷新：
   - 进入课堂后优先尝试恢复当前 `sceneId + clientSessionId` 对应会话
   - 若发现存在运行中的 `executionId`，自动恢复轮询
4. 会话丢失或被服务端回收：
   - 显示“会话已失效，需要重新创建”
   - 一键触发重新建会话
5. 预览失效：
   - 不影响日志和 artifacts 展示
   - 用户可重新运行以获取新预览

## 9. 安全与资源约束

### 9.1 资源控制

必须配置：

1. 单次执行超时
2. 内存上限
3. CPU 上限
4. 输出大小上限
5. 产物大小上限

### 9.2 安全边界

1. `local` 模式不是强隔离边界，只用于受信任环境
2. 生产环境默认应使用 `aio`
3. 沙箱内默认禁止访问宿主敏感路径
4. 外网访问、包管理安装和端口暴露应通过白名单控制

## 10. 与现有功能的关系

1. 代码编辑器不替代互动白板，二者并列存在
2. 代码运行页签不替代“笔记”“对话”“课堂操作”，而是新增一个并列页签
3. 代码实验态与课堂结构化内容分离，不影响导出、播放和课堂生成主链路
