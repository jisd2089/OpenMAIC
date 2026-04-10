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
   - 全局共享容器与工作区隔离边界
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

### 2.5 左侧 PPT 导航条改版

本次补充需求要求将当前左侧缩略图场景列表改为“窄轨式场景导航”，视觉目标对齐附件截图红框区域，而不是继续沿用可拉伸的大卡片缩略图侧栏。

设计目标：

1. 左侧导航从“缩略图列表”收敛为“场景进度轨道”
2. 默认仅承担切页、定位和进度感知，不承担完整内容预览
3. 保持与现有播放、翻页、PPT 指示效果完全解耦
4. 在教师端和学生端使用同一套导航视觉语言

建议组件形态：

1. 新增 `SceneRail` 作为课堂左侧固定窄轨导航
2. 默认宽度控制在 `72px` 到 `88px`
3. 移除当前侧栏自由拖拽调宽能力，避免与目标样式冲突
4. 保留折叠能力，但展开态也仅展示窄轨，不再恢复成大缩略图列表

结构建议：

1. 顶部
   - 预留安全边距，与课堂页头部视觉对齐
   - 可选放置返回或折叠入口，但不进入轨道主体
2. 中部主轨道
   - 纵向居中显示一条细灰色轨道线
   - 每个场景映射为轨道上的一个圆点节点
   - 当前场景使用紫色描边空心圆 + 实心中心点
   - 非当前场景使用浅灰小圆点
   - 已完成或已浏览场景可使用更高对比度的浅紫点
   - 生成预览场景、失败场景等异常态使用单独色值或外圈提示
3. 底部
   - 固定显示当前页码与总页数，如 `1/18`
   - 页码区与轨道主体之间保留视觉分隔

交互约束：

1. 点击圆点直接切换到对应场景
2. 键盘上下方向键与滚轮翻页行为继续生效
3. 当前场景切换时，轨道高亮和底部分页必须同步更新
4. hover 或 focus 到节点时，可在轨道右侧浮出轻量预览卡
5. 预览卡仅作为辅助，不改变主导航窄轨布局

预览卡建议：

1. 展示页码、场景标题、场景类型
2. `slide` 类型可显示一张小尺寸缩略图
3. `quiz`、`interactive`、`pbl` 类型显示语义化占位图标和标题
4. 预览卡在鼠标移出或失焦后自动关闭

长课件处理：

1. 当场景数小于等于 `24` 时，默认显示全部节点
2. 当场景数超过 `24` 时，轨道进入虚拟窗口模式：
   - 仅渲染当前场景附近窗口
   - 顶部和底部通过渐隐提示仍有更多场景
   - 不允许因为节点过多而把单个节点压缩到不可点击
3. 当前场景必须尽量保持在轨道可视区域中部

响应式策略：

1. 桌面端默认显示左侧窄轨
2. 平板端在横向空间不足时允许自动收窄到 `64px`
3. 小屏设备不强制保留左侧轨道，可降级为底部分页器或抽屉式场景目录

视觉约束：

1. 主体背景采用低对比浅灰 / 半透明白，不引入大面积高饱和背景
2. 激活色与课堂现有紫色强调体系保持一致
3. 轨道、节点、分页区的阴影和描边都必须克制，避免盖过主画布
4. 页面标题和当前场景标题继续保留在主内容区，而不是塞回左轨

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
4. `aio` 模式下会话作用域只用于隔离草稿、工作区与执行记录，不再用于决定是否新建容器实例

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
3. 支持共享容器下的多工作区复用，以及远程 provisioner 扩展
4. 适合作为生产环境默认执行方式

OpenMAIC 设计约束：

1. `aio` 模式下整个 OpenMAIC 服务实例只启动一个全局共享沙箱容器，所有浏览器客户端复用该容器
2. 每个会话仍保留独立 host 工作目录，运行时通过不同工作目录进入同一共享容器
3. Web 预览端口需要通过受控反向代理或临时 URL 暴露
4. 单个会话释放只影响会话状态，不得停止共享容器
5. 若复用 `deer-flow` 的容器逻辑，OpenMAIC 只复用运行模式和部署边界，不直接依赖其 Python 应用运行时
6. 共享容器对应的 `sandboxId` 必须稳定可重建，便于进程重启后重新发现并复用同一个容器
7. `release` 与 `destroy` 必须是两种不同语义：
   - `release`：从活跃会话移出，但共享容器继续保留
   - `destroy`：真正销毁共享容器和相关资源
8. `aio` 的运行隔离边界以“会话工作区”和“执行进程”区分，而不是以“每会话一容器”区分

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

1. `sandboxId` 应在 `aio` 模式下稳定映射为全局共享容器标识，而不是从单个会话作用域派生
2. OpenMAIC 进程重启后，若 session 仍有效：
   - 应能根据稳定 `sandboxId` 重新发现现有共享容器或 provisioner 资源
   - 不应因新浏览器会话进入而无条件新建 sandbox
3. 前端刷新页面时恢复执行状态，依赖的是服务端可恢复的 session / execution 真值，而不是浏览器内存状态
4. 多实例或多进程场景下，创建同一共享 `sandboxId` 时必须防止并发冲突
5. 若底层发现已有共享 sandbox，则应优先复用，而不是重复创建

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
```

规则：

1. 本地开发默认可使用 `local`
2. Docker / 多用户 / 共享环境默认使用 `aio`
3. 前端不允许通过请求参数直接切换提供者
4. 当前提供者模式仅通过服务端部署配置决定
5. `aio.backend=docker` 表示由 OpenMAIC 直接通过宿主 Docker 运行全局共享沙箱容器，语义对齐 `deer-flow` 的本地 Docker 模式
6. `aio.backend=provisioner` 表示由独立 provisioner 负责容器或 Pod 生命周期，语义对齐 `deer-flow` 的 `provisioner_url` 模式

配置映射说明：

1. `deer-flow` 的 `sandbox.use` 在 OpenMAIC 中收敛为 `codeSandbox.mode`
2. `deer-flow` 的共享 sandbox 概念在 OpenMAIC 中收敛为 `codeSandbox.aio.sharedSandboxId`
3. `deer-flow` 的 `idle_timeout` 在 OpenMAIC 中仅用于共享容器维护或陈旧会话整形，不再表达“每会话容器回收”
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
OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID=sandbox_aio_global
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
4. `aio.sharedSandboxId`
   - `aio` 模式下全局共享沙箱容器的稳定标识；同一服务实例内所有会话必须复用该标识对应的容器
5. `aio.sandboxHost`
   - 容器内或后端容器访问沙箱暴露地址时使用的宿主名，参考 `deer-flow` 的 `host.docker.internal`
6. `aio.previewBaseUrl`
   - Web 预览代理入口基础地址，不允许前端自行拼接容器地址
7. `aio.provisioner.*`
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
   - 共享容器复用下的陈旧会话整形
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
   - 单共享容器多会话复用
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

### 7.4 Dify 课件同步状态

`v0.3` 将 Dify 视为外部发布目标，而不是现有本地知识库的替代存储。为保证同步可追踪、可重试，服务端需要单独持久化同步状态。

```ts
type ClassroomDifySyncRecord = {
  id: string;
  classroomId: string;
  provider: 'dify';
  targetBaseUrl: string;
  datasetId: string;
  documentId: string;
  documentName: string;
  metadata: {
    classroom: string;
    type: 'course' | 'knowledge';
    title: string;
  };
  triggerSource: 'generate' | 'regenerate' | 'publish' | 'manual';
  status: 'idle' | 'queued' | 'syncing' | 'indexing' | 'completed' | 'failed' | 'skipped';
  contentHash: string | null;
  batchId: string | null;
  remoteIndexingStatus: string | null;
  remoteCompletedSegments: number | null;
  remoteTotalSegments: number | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

持久化建议：

1. 同步状态与课堂主 JSON 分离存储
2. 每个课堂最多保留一条当前生效的 Dify 发布记录
3. 若内容哈希未变化，可直接标记为 `skipped`
4. 同步失败信息必须保留，便于课堂页或管理页提示与重试
5. `metadata.classroom` 默认使用课堂唯一标识
6. `metadata.type` 必须来自 `POST /api/generate-classroom` 的请求字段 `type`
7. `metadata.title` 默认使用课堂标题或 `stage.name`

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

### 8.8 课堂生成完成后的 Dify 同步流程

`v0.3` 中，生成课件同步到 Dify 的默认触发点是“课堂生成成功并完成服务端持久化之后”。同步流程必须异步执行，不得阻塞课堂生成成功返回。

1. `POST /api/generate-classroom` 对应后台任务完成课堂 JSON 持久化
2. 服务端根据部署配置判断是否启用 Dify 发布
3. 若未启用、缺少 API Key、缺少 `datasetId` 或 `documentId`：
   - 写入 `skipped`
   - 不影响课堂生成成功态
4. 若已启用：
   - 生成课件同步文本
   - 计算 `contentHash`
   - 与最近一次成功同步记录比较
   - 内容未变化则写入 `skipped`
5. 若需要同步：
   - 写入 `queued`
   - 调用 Dify `Update Document by Text`
   - 进入 `syncing`
6. 收到 Dify 返回的 `batch` 后：
   - 写入 `batchId`
   - 状态切为 `indexing`
7. 后台轮询 `Get Document Indexing Status`
   - 若到达 `completed`，写入 `completed`
   - 若到达 `error` 或接口失败超阈值，写入 `failed`
8. 课堂生成结果始终保持 `succeeded`，外部发布失败不反向改写课堂生成任务状态

补充触发源：

1. 课堂重生成成功后可再次触发同步，`triggerSource=regenerate`
2. 用户在“课堂操作”-“发布”中手动发布时可触发 `triggerSource=publish`
3. 用户手动点击“重试同步”时可触发 `triggerSource=manual`

### 8.9 课堂操作“发布”触发的 Dify 同步流程

除生成完成后的自动触发外，`v0.3` 还要求支持第二个触发点：“课堂操作”-“发布”。

1. 用户在课堂页点击“课堂操作”-“发布”
2. 前端先确保当前课堂已完成服务端持久化
3. 服务端收到发布请求后：
   - 重新读取最新课堂真值
   - 重新计算 `contentHash`
   - 记录 `triggerSource=publish`
4. Dify 同步仍以异步任务方式执行：
   - 不阻塞“发布”按钮立即返回
   - 返回 `queued` 或 `skipped`
5. 若课堂持久化失败：
   - 直接返回失败
   - 不得继续触发 Dify 发布
6. 若 Dify 发布失败：
   - 只更新外部发布状态
   - 不回滚课堂本身

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
4. Dify 同步是课件的外部发布能力，不替代当前本地知识库、课程包导出或课堂持久化真值
5. 左侧场景导航样式改版只改变导航容器形态，不改变翻页、自动播放、PPT 指示效果与当前场景真值

## 11. Dify 知识库同步设计

### 11.1 范围与边界

本次需求中的 Dify 链路，对接目标是：

1. `baseUrl`: `https://difytestapi.zhizuobiao.com/v1`
2. `datasetId`: `1d2405b1-910a-4820-b06a-ad61b377c1a1`
3. `documentId`: `4d54b7ca-d170-482a-85b6-7be5222c1d50`

设计约束：

1. 后端不得直接依赖页面 URL 字符串做抓取或解析
2. 上述 `datasetId` / `documentId` 作为部署配置输入，而不是硬编码在前端
3. Dify API Key 仅允许保存在服务端环境变量中
4. 同步能力默认为服务端能力，浏览器不直接调用 Dify API
5. 每次同步都必须附带元数据：
   - `classroom`
   - `type`
   - `title`
6. 当前联调 API Key 必须只通过服务端环境变量注入，不得把明文密钥写入仓库文档、配置文件或前端代码

必要元数据定义：

1. `metadata.classroom`
   - 取课堂唯一标识，例如 `gJsjGFbKau`
2. `metadata.type`
   - 取 `POST /api/generate-classroom` 请求字段 `type`
   - 必须原样透传，当前有效值为 `course | knowledge`
3. `metadata.title`
   - 取课堂标题，例如 `C语言数据结构`

联调环境约束：

1. API 基址固定使用 `https://difytestapi.zhizuobiao.com/v1`
2. API Key 采用部署侧私密注入
3. OpenMAIC 文档中只保留 `OPENMAIC_DIFY_API_KEY` 占位，不记录密钥明文

### 11.2 发布目标模型

`v0.3` 默认采用“固定目标文档更新”模式，而不是“每个课堂都在 Dify 新建一个文档”：

1. 直接更新指定 `documentId`
2. 不在课堂生成完成后自动创建新 Dify 文档
3. 若目标文档不存在或无权限，直接标记失败并提示人工处理

选择理由：

1. 当前需求已明确指定目标文档地址
2. 固定文档模式更容易管控权限、目录结构和检索入口
3. 可以避免为每个课堂额外做远端文档清理与映射回收

### 11.3 同步内容模型

由于 Dify 官方知识库接口支持按文本创建 / 更新文档，`v0.3` 默认将课件序列化为按页分段的 Markdown 文本后再同步。

建议文档结构：

1. 文档头部
   - 课程标题
   - 课堂 ID
   - 语言
   - 生成时间 / 最近同步时间
   - 教师端访问链接
   - 学生端访问链接
2. 课程概览
   - 课程目标
   - 场景总数
   - 章节概览
3. 场景正文
   - 每个场景一个二级标题
   - 场景类型、页码、标题
   - 幻灯片中的主要文本提取结果
   - 教学旁白或关键动作文本摘要
   - 若存在知识引用，则写入引用来源摘要
4. 尾部附录
   - 生成模型和知识库来源摘要
   - 最近更新时间

内容约束：

1. 只同步适合检索的文本内容，不同步音频二进制、视频二进制和图片二进制
2. 媒体若需要被引用，只写入资源标题、说明和可访问 URL
3. Markdown 只是同步介质，最终目标是提高 Dify 检索质量，而不是复刻课堂视觉排版
4. 课件内容必须按 PPT 页分段保存到 Dify
5. 单段文本长度上限为 `4000` 字符
6. 若单页文本超过 `4000` 字符，必须在同一页内继续拆分为多个子段：
   - 段号格式建议为 `第 3 页 / 片段 2`
   - 同页子段必须保留相同页码和元数据
7. 每段都必须带上 `classroom`、`type`、`title` 元数据语义

分段算法建议：

1. 先按 `scene.type=slide` 的 PPT 页进行一级分段
2. 每页聚合：
   - 场景标题
   - 幻灯片文本
   - 关键动作说明
   - 引用知识摘要
3. 对聚合后的页文本执行长度检查
4. 超过 `4000` 字符时，按段落、列表项或句子边界切分
5. 切分结果写入统一发布文本，并通过自定义分段规则让 Dify 保持页级边界

### 11.4 Dify 接口选型

基于 Dify 官方文档，`v0.3` 优先采用以下接口组合：

1. `POST /datasets/{dataset_id}/documents/{document_id}/update-by-text`
2. `GET /datasets/{dataset_id}/documents/{batch}/indexing-status`
3. `GET /datasets/{dataset_id}/documents/{document_id}`
4. `GET /datasets/{dataset_id}/documents`

服务端调用策略：

1. 首次启动或部署自检时可通过 `Get Document` 校验目标文档可达
2. 同步时优先调用 `Update Document by Text`
3. 更新请求中应显式传入自定义 `process_rule`，使 Dify 依据服务端插入的页级分隔符进行切段
4. 仅当后续需求切换成“动态建文档”时，才引入 `Create Document by Text`
5. `batch` 轮询仅在收到 Dify 成功响应后启动

### 11.5 服务端模块拆分

建议新增服务端模块：

1. `lib/server/publish/dify-config.ts`
   - 负责读取 Dify 配置
2. `lib/server/publish/dify-client.ts`
   - 负责封装 HTTP 调用和鉴权
3. `lib/server/publish/classroom-dify-serializer.ts`
   - 负责把课堂对象序列化为按页分段的 Markdown
4. `lib/server/publish/classroom-dify-sync.ts`
   - 负责排队、同步、轮询和状态写回

建议接口：

```ts
interface ClassroomPublishTarget {
  provider: 'dify';
  syncClassroom(input: {
    classroomId: string;
    triggerSource: 'generate' | 'regenerate' | 'publish' | 'manual';
  }): Promise<ClassroomDifySyncRecord>;
  getSyncStatus(classroomId: string): Promise<ClassroomDifySyncRecord | null>;
}
```

异步触发时序：

1. 触发点一：`POST /api/generate-classroom` 生成成功并完成服务端持久化
2. 触发点二：“课堂操作”-“发布”在课堂服务端持久化成功之后
3. 两个触发点都只能把同步任务写入后台队列或异步任务执行器
4. API 成功返回时不等待 Dify `indexing-status` 进入终态
5. 后台任务负责：
   - 读取课堂真值
   - 提取 `classroom/type/title`
   - 序列化为按页分段文本
   - 调用 Dify `update-by-text`
   - 记录 `batchId`
   - 轮询 `indexing-status`
   - 回写终态

推荐时序：

1. 课堂生成成功
2. 服务端写入 `data/classrooms/<id>.json`
3. 服务端写入一条 `publish-status=queued`
4. HTTP 响应立即返回课堂生成成功
5. 后台 worker 消费该课堂同步任务
6. 成功调用 Dify 后状态进入 `syncing` / `indexing`
7. 轮询完成后写回 `completed` 或 `failed`

推荐状态持久化模型：

```ts
interface ClassroomDifySyncRecord {
  classroomId: string;
  provider: 'dify';
  enabled: boolean;
  status: 'idle' | 'queued' | 'syncing' | 'indexing' | 'completed' | 'failed' | 'skipped';
  triggerSource: 'generate' | 'regenerate' | 'publish' | 'manual';
  datasetId: string;
  documentId: string;
  batchId: string | null;
  metadata: {
    classroom: string;
    type: string;
    title: string;
  };
  contentHash: string | null;
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  remoteIndexingStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
```

持久化约束：

1. `contentHash` 基于最终分段文本生成，用于判定 `skipped`
2. `metadata.type` 必须来自课堂生成请求中的 `type`
3. “发布”触发时若课堂内容未变化，可直接写入 `skipped`
4. `failed` 不得覆盖已存在的课堂真值文件
5. 进程重启后需要能够基于已持久化状态继续查询最近一次 Dify 同步结果

联调目标路径：

1. Dify API 基址：`https://difytestapi.zhizuobiao.com/v1`
2. 目标数据集：`/datasets/1d2405b1-910a-4820-b06a-ad61b377c1a1`
3. 目标文档：`/documents/4d54b7ca-d170-482a-85b6-7be5222c1d50`

### 11.6 失败恢复与可观测性

必须具备：

1. 请求超时、401、403、404、429、5xx 的分类错误记录
2. 最近一次成功同步时间
3. 最近一次失败原因
4. 当前 `batchId` 和远端 `indexing_status`

恢复策略：

1. 同步失败不阻塞课堂生成
2. 失败后允许手动重试
3. 若重复同步内容哈希一致，可跳过无效更新
4. 若 Dify 长时间停留在 `parsing` / `indexing`，后台应在阈值后标记异常并停止无限轮询

### 11.7 部署配置建议

建议新增配置：

```yaml
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

环境变量建议：

```bash
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

补充说明：

1. 当前联调使用的数据集 API Key 由运维或部署侧注入 `OPENMAIC_DIFY_API_KEY`
2. 不允许把联调密钥硬编码到：
   - 仓库文档
   - `docker-compose.yml`
   - `.env.example`
   - 前端请求头

### 11.8 “一课一文档”覆盖说明

本节自本次补充需求起，覆盖 11.2、11.4、11.5、11.7 中所有“固定 `documentId` / 固定目标文档更新”的旧描述。

#### 11.8.1 目标模型

1. 每个 `classroomId` 在同一 `datasetId` 下必须绑定一个独立 Dify 文档
2. 课堂与 Dify 文档是一对一关系，不允许多个课堂反复覆盖同一远端文档
3. 课堂首次同步时创建文档，后续同步更新该课堂自己的 `documentId`
4. 推荐文档名模板：`[{type}] {title} ({classroom})`
5. 文档列表页应能直接看到每门课对应的一行记录

#### 11.8.2 服务端状态模型补充

```ts
interface ClassroomDifySyncRecordV2 {
  classroomId: string;
  provider: 'dify';
  enabled: boolean;
  status: 'idle' | 'queued' | 'syncing' | 'indexing' | 'completed' | 'failed' | 'skipped';
  triggerSource: 'generate' | 'regenerate' | 'publish' | 'manual';
  datasetId: string;
  documentId: string | null;
  documentName: string | null;
  documentCreatedAt: string | null;
  batchId: string | null;
  metadata: {
    classroom: string;
    type: string;
    title: string;
  };
  contentHash: string | null;
  remoteIndexingStatus: string | null;
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
```

补充约束：

1. `documentId` 在首次创建成功前允许为空
2. 一旦 Dify 创建成功，`documentId` 必须被持久化并作为后续更新唯一依据
3. 若远端文档被删除且 `GET document` 返回 `404`，服务端必须自动走“重新创建并重绑定”补偿流程
4. `documentName` 为远端真值的一部分，必须与本地记录一起保存，便于联调和后台核对

#### 11.8.3 首次同步流程

1. 课堂生成成功并完成服务端持久化
2. 后台异步任务读取课堂真值并序列化为按页分段文本
3. 若当前课堂尚无 `documentId`
4. 调用 Dify `Create Document by Text`
5. 获得 `documentId` 与 `batch`
6. 回写 `documentId`、`documentName`、`documentCreatedAt`
7. 再补写元数据 `classroom`、`type`、`title`
8. 进入 `indexing` 轮询，直至 `completed` 或 `failed`

#### 11.8.4 后续同步流程

1. 若当前课堂已有 `documentId`
2. 优先调用 Dify `Update Document by Text`
3. 若 `contentHash` 未变化，可直接记为 `skipped`
4. 若远端返回 `404`，判定远端文档丢失
5. 自动切回“创建文档”分支，生成新的 `documentId`

#### 11.8.5 接口选型覆盖

1. 首次同步优先使用 Dify 创建文档接口
2. 已绑定 `documentId` 后使用 Dify 更新文档接口
3. `GET /datasets/{dataset_id}/documents` 用于联调时确认文档是否在列表中可见
4. 不再存在“所有课堂都写入固定 `documentId`”的合法实现

#### 11.8.6 部署配置覆盖

覆盖后的 Dify 配置如下：

```yaml
publish:
  dify:
    enabled: true
    baseUrl: https://difytestapi.zhizuobiao.com/v1
    apiKey: ${OPENMAIC_DIFY_API_KEY}
    datasetId: 1d2405b1-910a-4820-b06a-ad61b377c1a1
    documentNameTemplate: "[{type}] {title} ({classroom})"
    timeoutMs: 30000
    pollingIntervalMs: 2000
    maxPollingAttempts: 180
```

对应环境变量：

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

补充说明：

1. 固定 `OPENMAIC_DIFY_DOCUMENT_ID` 不再属于新设计
2. 课堂专属 `documentId` 必须在运行时创建后写入本地状态记录
3. 删除本地课堂时，`v0.3` 不要求自动删除远端 Dify 文档；远端清理如需支持，另行设计
