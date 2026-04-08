# OpenMAIC v0.3 远程 Docker Compose 部署排查记录（2026-04-08）

## 背景

当前使用方式为：

1. 服务端通过 `docker compose` 部署 OpenMAIC
2. 本地浏览器远程访问服务端页面
3. 现场验证发现两个问题：
   - 新创建的课程在浏览器端没有声音
   - 打开“代码工作台”显示“未运行”，并提示 `Classroom not found`

本记录基于当前仓库代码和部署配置进行静态排查，未直接读取线上容器日志。

## 结论一：新建课程无声音，根因是当前远程部署链路依赖服务端 TTS，而不是自动回退到浏览器 TTS

### 关键代码路径

1. 服务端课堂生成入口在 `app/api/generate-classroom/route.ts`
2. 服务端 TTS 生成逻辑在 `lib/server/classroom-media-generation.ts`
3. 播放时优先使用 `speechAction.audioUrl`，其次才尝试本地 `audioId`，逻辑在 `lib/utils/audio-player.ts`
4. 播放阶段只有在“没有预生成音频”且当前设置仍为 `browser-native-tts` 时，才会回退到浏览器 Web Speech API，逻辑在 `lib/playback/engine.ts`

### 排查结果

1. `/api/generate-classroom` 走的是服务端生成链路，`enableTTS` 一旦开启，会调用 `generateTTSForClassroom()`
2. `generateTTSForClassroom()` 只接受服务端可用的 TTS provider；如果没有配置服务端 TTS provider 或缺少 API key，会直接跳过 TTS 生成
3. 跳过后，场景里的 `speechAction` 不会写入 `audioUrl`
4. 对远程部署来说，这意味着：
   - 只配了 LLM、PDF、图片、视频，不配 TTS 时，课堂会正常创建
   - 但课堂播放时没有可直接播放的服务端语音文件
5. 当前实现不会在服务端生成链路里自动把 TTS 回退为 `browser-native-tts`

### 对部署的实际含义

1. 如果希望远程部署后“新建课程即有声音”，必须在服务端容器内配置 TTS provider
2. 可用配置方式是：
   - `.env.local` 中的 `TTS_*` 环境变量
   - 或挂载 `server-providers.yml`
3. 如果未配置服务端 TTS，当前现象“课程能生成但没有声音”符合代码行为，不是播放器单点故障

### 补充判断

1. 浏览器原生 TTS 只是在播放阶段的兜底策略，不是服务端课堂生成的默认后备方案
2. 因此远程部署验收时，不能只验证“页面能播放”，还要验证课堂数据里是否实际生成了 `audioUrl`

## 结论二：代码工作台报 `Classroom not found`，根因是课堂只存在浏览器本地，没有持久化到服务端

### 关键代码路径

1. 课堂页加载逻辑在 `app/classroom/[id]/page.tsx`
2. 代码工作台 session 创建入口在 `app/api/classroom/[id]/code-sessions/route.ts`
3. 服务端课堂读取逻辑在 `lib/server/classroom-storage.ts`
4. 生成预览页完成创建后的落盘逻辑在 `app/generation-preview/page.tsx`

### 排查结果

1. 课堂页加载时，先尝试 `loadFromStorage(classroomId)`，也就是先读浏览器 IndexedDB
2. 只有本地没有数据时，课堂页才会兜底请求 `/api/classroom?id=...`
3. 这意味着：
   - 某个课堂即使只存在于当前浏览器本地
   - 页面本身也仍然可以正常打开
4. 但是代码工作台的 `POST /api/classroom/:id/code-sessions` 在创建 session 之前，会先调用 `readClassroom(id)`
5. `readClassroom(id)` 只读取服务端的 `data/classrooms/<id>.json`
6. 只要这个文件不存在，接口就直接返回 `Classroom not found`
7. 当前 `generation-preview` 创建课堂后，只做了：
   - `saveToStorage()`，写入浏览器本地
   - `router.push('/classroom/:id')`
8. 当前 `generation-preview` 没有同步调用：
   - `POST /api/classroom`
   - 或 `PATCH /api/classroom/:id`
9. 因此，课堂“页面可打开，但代码工作台报 `Classroom not found`”是当前实现边界不一致导致的结果

### 对部署的实际含义

1. 这不是 Docker sandbox 本身的首要报错来源
2. 首要问题是课堂数据的存储位置不一致：
   - 课堂页允许只用本地 IndexedDB
   - 代码工作台只认服务端持久化课堂
3. 只要课堂没有先落到 `/app/data/classrooms`，代码工作台、导出、重生成等依赖服务端课堂的能力都会有同类风险

## 部署配置补充检查

### 1. TTS

远程部署验收时需要额外确认：

1. 容器内是否配置了至少一个服务端 TTS provider
2. `GET /api/health` 返回的 `tts` 是否为可用状态
3. 新生成课堂的 `speechAction` 是否包含 `audioUrl`
4. `/api/classroom-media/:classroomId/audio/...` 是否能返回 200

### 2. 课堂持久化

远程部署验收时需要额外确认：

1. 新建课堂后，服务端 `data/classrooms/<classroomId>.json` 是否存在
2. 不是只验证页面是否能打开，还要验证服务端课堂文件是否已经落盘
3. 在使用代码工作台前，应先确认课堂已经进入服务端持久化目录

### 3. Code Sandbox 工作目录

虽然这不是本次 `Classroom not found` 的直接根因，但当前 Docker Compose 场景还需要保持以下前提：

1. `OPENMAIC_CODE_SANDBOX_LOCAL_WORKSPACE_ROOT` 应落在持久化卷内
2. 当前示例更安全的目标路径是 `/app/data/code-sandbox`
3. 否则即便后续课堂已持久化，code session / workspace 仍可能在容器重启后丢失

## 当前判断

1. “新建课程无声音”本质上是服务端课堂生成链路缺少服务端 TTS 配置
2. “代码工作台 `Classroom not found`”本质上是本地课堂与服务端课堂持久化边界不一致
3. 两个问题都与远程 Docker Compose 部署方式有关，但不是同一个根因
4. 当前仓库内尚未看到“生成预览完成后自动持久化课堂到服务端”的闭环实现

## 建议后续动作

1. 部署侧先补齐服务端 TTS 配置，再复验课堂播放
2. 产品/实现侧需要决定：`generation-preview` 完成后是否默认把课堂同步持久化到服务端
3. 若代码工作台要作为远程部署默认能力，课堂持久化必须前置，而不能只依赖浏览器 IndexedDB

## 2026-04-08 代码跟进

本次排查后，仓库内已补上两类实现修正和一类提示：

1. `app/generation-preview/page.tsx`
   - 生成完成后，先上传已生成的本地音频/媒体到服务端
   - 然后调用 `ensureClassroomPersisted()`，在跳转课堂页前把课堂 JSON 持久化到服务端
   - 这已经修复“课堂页能打开，但代码工作台创建 session 时提示 `Classroom not found`”的问题根因
2. `app/page.tsx`
   - 首页生成入口新增音频预警
   - 当用户开启课程语音，但当前配置仍是 `browser-native-tts`，或所选 TTS 没有 API Key / 服务端配置时，界面会直接提示“新建课程不会在服务端生成可复用音频”
   - 该提示不拦截生成，只用于把远程部署下的行为边界提前暴露给用户

### 当前剩余边界

1. 如果远程服务端仍未配置可用 TTS，系统不会凭空生成 `audioUrl`
2. 因此，“生成链路自动持久化课堂”已经修复，但“远程部署下新课堂默认有声音”仍然依赖部署侧补齐 TTS
3. 也就是说，代码侧现在已经能更早暴露问题、并避免课堂只落本地；但部署侧仍需完成 `TTS_*` 或 `server-providers.yml` 配置

## 2026-04-08 二次复查结果

重新部署后仍复现“无声音”和“代码工作台未运行”，继续排查后，确认还有两条未闭环：

1. 课堂生成阶段此前仍然只认当前前端所选的 `ttsProviderId`
   - 只要用户设置保留在 `browser-native-tts`，即使服务端已经配置了可用 TTS，生成链路也会直接跳过课堂音频生成
   - 这会导致课堂数据里没有 `audioUrl`，浏览器网络层也不会请求 `/api/classroom-media/.../audio/...`
2. 仓库根目录的 `docker-compose.yml` 此前只挂载了 Docker socket，但没有显式把代码沙箱切到 `aio`
   - 当前 `lib/server/code/config.ts` 默认模式仍是 `local`
   - 因此在远程 Docker Compose 部署下，服务端不会按预期去启动独立 sandbox 容器

## 2026-04-08 二次修复

本轮又补了四项修正：

1. `lib/audio/classroom-tts.ts`
   - 新增统一的课堂 TTS 选择逻辑
   - 当当前设置是 `browser-native-tts`，但服务端存在可用 TTS provider 时，课堂生成会自动回退到服务端 TTS，而不是直接跳过
2. `app/generation-preview/page.tsx` 与 `lib/hooks/use-scene-generator.ts`
   - 首屏生成和课堂页续生成都改为复用统一的课堂 TTS 选择逻辑
   - 这样服务端 TTS 已配置时，即使用户前端仍停留在浏览器朗读模式，也能为课堂实际生成音频
3. `app/classroom/[id]/page.tsx`
   - 课堂页加载后会补做一次“资产上传 + 课堂持久化”的自愈同步
   - 后续场景继续生成时，也会后台同步到服务端，避免老课堂或续生成课堂继续只存在浏览器本地
4. `docker-compose.yml`
   - 远程部署默认显式设置 `OPENMAIC_CODE_SANDBOX_MODE=aio`
   - 同时补齐 docker backend、sandbox image、socket 路径和 preview base URL，避免挂了 socket 但仍落回 `local` 模式

## 当前判断更新

1. “浏览器客户端无声音”除了部署侧缺少 TTS 外，还可能是前端课堂生成逻辑仍停留在 `browser-native-tts`
2. “代码工作台未运行、服务端沙箱容器未启动”除了课堂未持久化外，还可能是 compose 部署根本没有把代码沙箱切到 `aio`
3. 经过本轮修复后：
   - 课堂生成会优先使用可用的服务端 TTS 生成课堂音频
   - 课堂页会补同步本地课堂到服务端
   - 远程 compose 部署会默认进入 Docker AIO 沙箱模式
# 2026-04-08 构建补充修复

本次重新部署时，`pnpm build` 还暴露了一个独立于课堂音频和代码工作台的问题，已补充修复如下：

1. `lib/hooks/use-code-workbench.ts`
   - `parseJsonResponse()` 之前允许返回 `null`
   - 生产构建里的 TypeScript 检查无法确认 `payload.session` 一定存在
   - 现已收紧为“成功响应必须返回 JSON 对象，否则直接抛错”，消除空值类型报错
2. `packages/mathml2omml/package.json` 与 `packages/pptxgenjs/package.json`
   - 两个工作区包原先都把 `exports.import` 指向 `dist/*`
   - 根应用执行 `pnpm build` 时，并不会先自动产出这些 `dist` 文件
   - 这会导致 Turbopack 在解析 `mathml2omml` 和 `pptxgenjs` 时直接报 `Module not found`
   - 现已把 `import` / `main` / `module` / `types` 入口改为直接指向仓库内源码入口，不再依赖预构建产物
3. `types/mathml2omml.d.ts`
   - 该文件原本只是临时的 ambient module 声明
   - 在工作区包自身导出类型入口后已无必要，现已删除

## 构建验证

1. `corepack pnpm exec tsc --noEmit --pretty false` 已通过
2. `corepack pnpm build` 已通过
3. 当前在 Windows 本地仍可能看到 Next.js `standalone` traced files 复制警告，这与 Windows 路径及 `node:fs` chunk 命名有关
4. 上述警告未阻塞本次构建；针对 Linux Docker 构建，当前已验证的阻塞项已清除

## 2026-04-08 Docker 编码补充排查

重新部署时，远程 `docker build` 又出现了 Turbopack 读取 `app/page.tsx` 与 `app/classroom/[id]/page.tsx` 失败，并报 `invalid utf-8 sequence`。

排查结论：

1. 本地仓库文件本身可以被 UTF-8 正常解码，且 `pnpm build` 在本地可通过。
2. 但远程 Docker 构建链路里，Turbopack 对源码文件编码比本地开发环境更敏感；一旦工作区文件带有非法字节、BOM、或混入 Windows 风格换行/编码污染，就可能在解析阶段直接失败。
3. 为了避免后续再出现“本地可构建、远程容器因源码编码失败”的情况，仓库新增了 `scripts/normalize-source-encoding.mjs`，并在 `Dockerfile` 的构建阶段、执行 `pnpm build` 之前先运行一次。
4. 当前脚本只针对这次实际报错的两个入口文件执行归一化：
   - `app/page.tsx`
   - `app/classroom/[id]/page.tsx`
5. 归一化动作包括：
   - 清理 UTF-8 BOM
   - 统一换行符为 LF
   - 如果发现非法 UTF-8 字节，则以可恢复方式重写为有效 UTF-8 并打印告警

当前结论更新：

1. 这次 Docker 构建报错不是课堂业务逻辑回归，而是源码编码在容器构建阶段触发了 Turbopack 解析边界。
2. 代码侧已加入构建前编码归一化保护，后续远程部署不再依赖服务器工作区编码状态“刚好正常”。
## 2026-04-08 Docker 编码修复落地说明

最终落地的代码修复是：

1. 新增 `scripts/normalize-source-encoding.mjs`
2. 在 `Dockerfile` 里于 `pnpm build` 前显式执行
3. 当前只针对这次实际报错的两个入口文件执行归一化：
   - `app/page.tsx`
   - `app/classroom/[id]/page.tsx`
4. 归一化动作包括：
   - 去掉 UTF-8 BOM
   - 统一为有效 UTF-8
   - 统一换行符为 LF

这次没有继续保留“大范围扫描整个仓库源码”的实现，也没有把页面源码整体改写为新的业务逻辑；目的是把修复范围控制在 Docker 构建实际失败的两个入口文件上。
