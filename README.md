# 知伴 · 你卡住的地方，也是所有人的卡点

> 知乎黑客松 2026 · 校园新锐季 —— 知识炼金场赛道
>
> 读知乎遇到不懂的概念，**划一下**，当场在这篇回答的语境里讲明白；
> 这一划，也让下一个读到这里的人不再卡住——**你划过的、卡住的，它替你记着**，
> 聚合成答主看得见的「读者卡点报告」，再变成一段前置说明，价值回到社区。
> 想留下点什么，一键存成笔记卡片、导出成 Markdown。
>
> 旧的落点是「你看懂了」，新的落点是：**你让所有人都少卡一次。**

**线上 Demo**：<https://z.toply.top/zhiban-demo/>（独立域名 <https://zhihu.toply.top/> 同步部署，HTTPS 实测 200）

---

## 一、功能总览（按优先级）

> **一个瞬间价值做到极致，其余全部可降级。** P0 不依赖任何知乎接口，无扩展注入也能 100% 工作。

### 目标用户与场景边界（诚实定位）

- **目标用户**：桌面端深度阅读者。产品以 **Chrome 扩展**形态交付，在知乎网页上提供选中即问、全文标记与被动复盘；Demo 站用于无扩展环境下演示同一套核心能力。
- **已知边界（移动端）**：知乎的阅读主场景在手机，而移动端无法承载扩展与划选交互，这是形态天花板。本仓库**不在移动端提供覆盖**；若后续要做移动，需另立形态（小程序 / 公众号）单独规划，不在本仓库主路径内。
- 我们不声称「覆盖所有阅读场景」——把桌面深度阅读这一件事做到极致，是本项目的取舍。

### 方向 · 读者卡点飞轮（改造方案 §三 / §4.1–4.4）

> **你卡住的地方，也是所有人的卡点。** 划一下，你当场读懂；这一划，也让下一个读到这里的人不再卡住。

| 环节 | 落点 | 主要代码 |
|---|---|---|
| 卡点入账 | 浮层底部「这里我也卡了一下 · N 人也卡在这」，点一下 +1，零注册 | `demo/js/app/popup.js` + `demo/js/core/stuck.js` |
| 同篇聚合 | 文章页侧栏「本篇卡点」TOP3，点一条跳回原文那一段并高亮 | `demo/js/app/sidebar.js` + `store.js`(`anchorToRanges`) |
| 跨设备聚合 | 上报匿名进 SCF `/stuck`（只传「概念名 + 段号」，不传正文与身份），他人在别的设备上读回同一篇的卡点，飞轮才真的转起来 | `scf/index.js`(`/stuck`) + `server/handlers/stuck.js` + `api.js`(`reportStuck`/`getStuckAggregate`) |
| 读者洞察 | 首页首屏三句话：多少人赞同 / 第几段多少人卡住 / 卡住他们的是同一个词 | `demo/js/app/home.js` + `stuck.js`(`topStuckInsight`) |
| 答主视角 | `#/creator`「你的读者，卡在这三个地方」→ 一键生成前置说明草稿（复用导读，可导出 `.md`） | `demo/js/app/creator.js` + `guide.js` |

数据来源如实标注（改造方案 §4.5 / 验收 §七-6）：预置演示数据标「演示环境数据」，本机上报标「你的上报」，别台设备经 `/stuck` 聚合的匿名上报标「社区上报」，多源叠加时同时标出（后端聚合计数已含本机那一次，前端只叠加 `max(0, 社区数 − 本机数)`，同一个人不重复计入）。首页洞察的赞数同为 Demo 内容，一并标注「示例数据」。
本仓库**不做**「一键发布到知乎」（§六：官方接口只读）——答主拿到草稿后自行补进回答，价值由此回到社区。

### P0 · 必做，且做到极致

| 功能 | 说明 | 主要代码 |
|---|---|---|
| **选中即问** | 划选概念 → 弹「问知伴」→ 当场讲三层：一句话定义 / 为什么在这篇里重要 / 你可能需要先了解 | `demo/js/app/selection.js` `popup.js` `api.js` + SCF `/ask` |
| 前置知识跳转（可选增强） | 前置概念的一句话解释 + 站内热门回答；未配置知乎密钥或调用失败时**静默降级**，不影响选中即问 | `popup.js` + SCF `/search` |

### P1 · 顺手，被动沉淀

| 功能 | 说明 | 主要代码 |
|---|---|---|
| **全文概念标记** | 打开文章即预扫描，整篇难词淡色波浪线浮现（原生自定义高亮，零 DOM 变更） | `demo/js/core/highlight.js` + `demo/js/app/prescan.js` |
| **每周复盘（被动推送）** | 不打开任何中心页面，距上次复盘 ≥7 天时自动在常驻入口 / 侧栏推一张极简复盘卡：本周卡住几个、掌握率、最该补的 3 个概念。零配置、纯本地、不调模型 | `demo/js/core/review.js` `demo/js/app/weekly.js` |
| **我的笔记卡片（真实出口）** | 单概念 / 导读都可「存为我的笔记卡片」，本地存储，一键导出 `.md`；含概念 / 定义 / 本篇语境 / 原文引用 / 来源链接 / 时间戳 | `demo/js/core/note.js` `demo/js/app/notes.js` |

### P2 · 降级 / 后续 / 仅留入口

以下功能**已从 MVP 主路径撤下**，Demo 首屏不再突出；路由与实现保留，供后续按需恢复：

短尾巴（`sidebar.js`）、学习中心图谱与诊断（`hub.js` + `core/graph.js`，现作为每周复盘的**展开详情**）、导读（`guide.js`）、SRS 回访（`core/srs.js` + `revisit.js`）、看山策展（`curation.js`）、冰屋（`igloo.js`）、个人中心与收藏体检（`profile.js` + `extension/src/profile-zhihu.js`，依赖知乎登录态，未配置即降级）。

配套：常驻入口（首访引导 + 每周复盘推送）、侧栏入口按钮（随侧栏开合显隐）、数据控制（本地存储声明 + 一键删除）。

## 二、架构

```
┌─────────────┐   fetch/messaging   ┌──────────────────┐   HTTPS   ┌──────────────┐
│ 交付形态     │ ──────────────────→ │  腾讯云 SCF       │ ────────→ │ 智谱 GLM      │
│ · Chrome 插件│                     │  /ping /ask      │           │glm-4.7-flashx│
│ · 静态 Demo站│                     │  /prescan /search│ ────────→ ├──────────────┤
└─────────────┘                     │  /quiz           │           │ 知乎开放平台  │
        所有用户数据只存浏览器本地     │  /collections    │           └──────────────┘
                                    └──────────────────┘
```

- **没有数据库、没有自有服务器**。模型密钥与知乎密钥只在 SCF 环境变量里。
- **知乎接口只是可选增强，不是核心依赖**：`/search`（前置跳转）、`/collections`（收藏体检）在未配置 `ZHIHU_ACCESS_SECRET`、或浏览器无扩展注入、或调用失败时**一律静默降级**；P0 选中即问与 P1 全文标记仅需页面文本 + LLM，完全不依赖知乎接口。
- `/ask` 支持 `stream:true`：SCF 把 GLM 的 SSE 增量原样透传，前端边收边渲染（含 `reasoning_content` 思考链处理）。
- 前端双模式：页面跑在 `localhost/127.0.0.1` 时走本地 dev server（mock 数据，零配置开发）；
  其他环境自动切到 SCF 线上接口（`demo/js/app/api.js` 顶部 `SCF_BASE` 常量）。
- 插件环境：content script 被知乎 CSP 限制，请求经 `chrome.runtime` 消息转发到 background 再发真实请求。

### 目录结构

```
├── demo/                  # 主交付：静态站（hash 路由、相对路径）
│   ├── index.html
│   ├── assets/            # 样式 + 刘看山动态素材（本地自托管）
│   └── js/
│       ├── core/          # ★ 环境无关共享模块（全部关键算法，纯函数可单测）
│       │                  #   match / textnodes / highlight / context / graph / srs / difficulty / stopwords / quote / selectors / storage / note / review / stuck
│       ├── app/           # 应用层
│       │   ├── main.js        # 壳 + 路由分发 + 顶栏导航
│       │   ├── router.js      # hash 路由：#/ #/article/:id #/igloo #/guide/:id #/hub #/profile #/creator
│       │   ├── selection.js   # 划词（含多回答容器重解析）/ popup.js 浮层 / sidebar.js 侧栏
│       │   ├── prescan.js / guide.js / quiz.js / revisit.js / curation.js
│       │   ├── home.js        # 首页开场导读 / entry.js 常驻入口
│       │   ├── creator.js     # 答主视角：读者卡点报告 → 前置说明草稿（§4.4）
│       │   ├── igloo.js       # 冰屋总览
│       │   ├── hub.js         # 学习中心（思维导图 / 诊断 / 时间轴）
│       │   ├── profile.js     # 个人中心（首页 / 收藏体检 / 推荐阅读 / 学习数据）
│       │   ├── api.js         # 前端 API 层（本地 dev server ↔ SCF + SSE 解析）
│       │   ├── store.js       # 数据层（异步存储适配，键前缀 zb:）
│       │   └── ui.js / runtime.js / sample.js
│       └── data/          # 3 篇互链 ML 文章（反向传播→梯度下降→导数）
├── server/                # 本地 dev server：静态托管 + 四接口 + mock 模型
│   ├── index.js           #   /api/explain /api/prescan /api/search /api/quiz
│   ├── handlers/          #   四个接口各一文件（explain / prescan / search / quiz）
│   └── config.js / mock.js / llm.js / prompts.js / ratelimit.js
├── scf/                   # ★ 生产后端：腾讯云 SCF Web 函数（Node 12 兼容）
│   ├── index.js           #   /ping /ask /prescan /search /quiz /collections
│   ├── stuck-store.js     #   卡点聚合存储适配层（默认内存 / 配 STUCK_REDIS_URL 走 Redis）
│   ├── scf_bootstrap      #   自定义运行时启动脚本（0755）
│   └── package.json       #   声明 express + redis 依赖（redis 仅卡点持久化用）
├── extension/             # Chrome MV3 插件（最终形态）
│   ├── manifest.json      #   MV3；permissions: storage；host: 知乎 + *.tencentscf.com
│   ├── src/
│   │   ├── content.js         # 知乎适配层（CSP 绕行、划词、SPA 归属判定）
│   │   ├── background.js      # 请求中转 + 知乎 API 白名单转发 + 流式端口
│   │   ├── profile-page.js    # 个人中心独立页（注入存储适配/锚点跳转）
│   │   └── profile-zhihu.js   # 知乎账号卡 + 收藏夹体检 + 分类树
│   ├── profile.html       # 个人中心独立页
│   ├── build.mjs          # esbuild 打包（MV3 禁远程代码，全部本地打包）
│   └── dist/              # 构建产物（git 忽略，npm run build:ext 生成）
├── scripts/               # 校验与测试（check-syntax / check-imports / test-core / test-hub / test-api / test-e2e）
└── package.json
```

## 三、快速开始

```bash
npm install          # 仅开发依赖（esbuild/express）；运行时零三方依赖

# 开发模式（mock 模型，零配置）
npm run dev          # http://localhost:8787

# 本地接真实模型（可选）
export LLM_API_KEY=xxx LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4 LLM_MODEL=glm-4.5-flash
# 本地知乎搜索（可选）
export ZHIHU_ACCESS_SECRET=xxx
```

> 要跑**浏览器插件**形态（评委现场加载）：见 [§8.3 Chrome 插件](#83-chrome-插件克隆仓库后必做这三步)，
> 三步 = `npm install` → `npm run build:ext` → `chrome://extensions` 开发者模式加载 `extension/` 目录。
> 构建产物 `extension/dist/` 不在仓库里，跳过构建会加载失败。

### 环境变量总表

| 变量 | 位置 | 用途 |
|---|---|---|
| `ZHIPU_API_KEY` | SCF 函数配置 | 智谱 GLM 密钥（**必须**） |
| `ZHIHU_ACCESS_SECRET` | SCF 函数配置 | 知乎站内搜索（不配则降级） |
| `STUCK_REDIS_URL` | SCF 函数配置 | 卡点聚合持久化（`redis://...`；不配则进程内存，见 §五 `/stuck`） |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 本地 dev server | 本地接真实模型（不配则 mock） |
| `PORT` | 本地 | dev server 端口，默认 8787 |

## 四、测试与校验

```bash
npm run check        # 全量 JS 语法（node --check，含 SCF 产物 scf/）+ 模块导入解析（路径/具名/默认导出）；当前 67 文件 0 失败
npm run test:core    # 核心算法 162 项：概念匹配/幽灵标记检测/扩句/依赖图/拓扑序/白名单过滤/
                     # 边加权/缺口Top1/聚类/策展排序/回访间隔/难度三档/停用词拦截/
                     # explain 结构漂移解包（answer 包装/平铺/非概念短路）/
                     # 每周复盘（7 天触发口径/掌握率/Top 缺口）/笔记 Markdown 生成（文件名清洗/时间戳）/
                     # 卡点聚合（seed+现场上报+社区聚合三源叠加与去重/TOP3/来源标注/答主报告）/
                     # 存储可插拔（未配 STUCK_REDIS_URL 内存兜底/读写回环/文章计数/Redis 不可达 5s 内降级不悬挂）/
                     # 首页三秒洞察（段号/占比/赞数）
npm run test:hub     # 学习中心 23 项：buildHubGraph 节点/边方向/缺口判定/三色计数/
                     # 主题归类/诊断总结/薄弱主题 TOP3/建议补概念/空数据兜底
npm run test:api     # 后端 28 项：五接口结构/字段零缺失/400/限流429/CORS/目录穿越/卡点上报与聚合
npm run test:e2e     # 端到端 73 项：Edge 无头 + CDP 真实划选→首页三秒洞察→浮层三层解释（含前置）→
                     # 浮层卡点 +1 与来源标注→选「的」不弹窗→侧栏本篇卡点 TOP3 跳段落高亮→
                     # 侧栏答主视角报告与补前置建议→答主视角页卡点报告与前置说明草稿→
                     # 诚实的空状态→社区聚合读回→SCF 预热接入
npm run build:ext    # 插件打包到 extension/dist
```

`test:e2e` 依赖 Windows 上的 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`），
其他平台需改 `scripts/test-e2e.mjs` 中的 `EDGE` 常量。

## 五、接口契约（SCF）

Base：`https://<你的云函数域名>`（当前开发环境地址写在 `demo/js/app/api.js` 的 `SCF_BASE`）

### GET /ping
健康检查。响应：`{"ok": true}`

### POST /ask —— 选中即问
请求：`{ "term": "梯度下降", "context": "……片段（建议 150-250 字）……" }`
响应（JSON 模式直出，字段名固定）：
```json
{
  "is_concept": true,
  "definition": "一句话定义（≤40 字）",
  "context_why": "概念在片段里的角色（≤60 字，紧扣片段）",
  "prerequisites": ["梯度"]
}
```
非概念（虚词、标点、人名、机构名、无意义片段）时只返回 `{"is_concept": false}`，不编解释；
前端 `popup.js` 收到后给「看起来不是一个需要解释的概念」的提示，而不是渲染一段编出来的定义。
前端在 `api.js` 中把 `context_why` 映射为 `in_context`，并对 `{"answer":{…}}` 多包一层的情况做解包（纯函数 `core/explain.js`）。**不要改 prompt 模板里的字段名**，否则前端映射失效。

**流式模式**：请求体加 `"stream": true`，响应 `Content-Type: text/event-stream`，SCF 原样透传 GLM 的 SSE；
前端 `scfExplainStream` + SSE 解析器边收边渲染，`reasoning_content`（思考链）不计入正文，仅通知 UI。
线上默认走流式（`STREAM_EXPLAIN`），本地 dev server 走一次性响应。

### POST /prescan —— 全文概念预扫描
请求：`{ "text": "正文前 8000 字", "articleId": "xxx" }`
响应：`{ "concepts": ["反向传播", "梯度下降", "…"] }`（5–15 个，逐字照抄正文）
约束：概念名必须逐字照抄正文，否则前端匹配不到变成"幽灵标记"（匹配率自检见 `demo/js/core/match.js` 的 `matchRate`，应 <5% 丢失）。
失败降级：返回 `{ "concepts": [], "_degraded": true }`，高亮/预告静默关闭，不影响选中即问。

### POST /search —— 知乎站内搜索代理
请求：`{ "query": "梯度下降" }`
响应：`{ "items": [{ "title", "author", "url", "excerpt", "voteupCount", "length" }] }`（最多 3 条，赞数主分 + 超长对数降权）
未配置 `ZHIHU_ACCESS_SECRET` 或调用失败时返回 `{ "items": [], "_degraded": true }`，前端兜底跳知乎搜索页。

### POST /quiz —— 看山提问（两阶段）
生成追问：请求 `{ "concept": "梯度下降", "quote": "原文引用" }`
响应：`{ "question": "概念性追问", "quizPoints": ["判定要点"] }`
判定回答：请求 `{ "concept": "…", "quote": "…", "question": "…", "answer": "用户回答" }`
响应：`{ "verdict": "correct|partial|wrong", "feedback": "看山口吻的补充解释" }`

### POST /collections —— 收藏夹体检
请求：`{ "items": [{ "title": "…", "excerpt": "…", "score": 0 }] }`（最多取 20 条；服务端只消费 `title`/`excerpt`/`score`）
响应：`{ "groups": [{ "name": "主题名", "items": ["标题"] }], "reviews": [{ "title": "…", "level": "…", "comment": "…" }] }`（`groups` 中只保留输入里真实存在的标题）
聚类 + 点评，模型输出上限 1200 token；规则打分（满分 10）在客户端做，失败时降级返回空结果。**仅 SCF 提供**（本地 dev server 无此路由）：读取知乎登录态收藏夹依赖插件环境，
`extension/src/background.js` 的 `ZHIHU_API_ALLOW` 白名单转发知乎 web API（`/api/v4/me`、`members|people/.../collections`、
`collections/.../items`），前端 `api.analyzeCollections` 调用。

### POST /stuck —— 读者卡点匿名聚合（改造方案 §三 飞轮）

请求：`{ "action": "report", "articleId": "…", "concept": "…", "paragraphIndex": 1 }`（上报，同篇同词按人计一次）；
或 `{ "action": "top", "articleId": "…", "topN": 10 }`（读取该篇卡点，按上报次数降序）
响应：`report` → `{ "ok": true, "count": N }`；`top` → `{ "items": [{ "concept": "…", "count": N, "paragraphIndex": 1 }] }`
只传「概念名 + 段号」，**不含正文、链接与身份**；本地 dev server 的 `/api/stuck` 为同构镜像，供离线端到端验证。
读回后与 `core/stuck.js` 的 seed 数据按「只叠加 `max(0, 社区数 − 本机数)`」去重，再如实标注来源（§一「数据来源如实标注」）。
**存储可插拔（默认内存、可选持久化）**：默认把计数存在函数实例内存里（`STUCK_MAX_ARTICLES`/`STUCK_MAX_CONCEPTS` 有上限），冷启动或多实例下会归零/不一致；配置 `STUCK_REDIS_URL` 后改写 Redis —— 冷启动 / 多实例共享、跨设备互见，Redis 不可用（连接失败或 5 秒内连不上）即降级回内存、不重连不悬挂，接口契约与前端零改动（实现见 `scf/stuck-store.js`）。

### 错误约定
| 场景 | 状态码 |
|---|---|
| 缺必填参数 | 400 |
| 模型输出非合法 JSON | 500 |
| 大模型 API 失败 / 非 2xx | 502 |
| SCF 平台超时 | 由云函数平台处理（函数超时须配 60 秒，代码内 55 秒主动熔断） |

## 六、数据模型（正文与阅读记录全部浏览器本地；服务器只存匿名卡点计数，默认内存、配 `STUCK_REDIS_URL` 即持久化）

localStorage 键前缀 `zb:`（插件为 `chrome.storage.local`，同结构）：

| 键 | 内容 |
|---|---|
| `zb:article:<id>` | 文章记录：标题/链接、已展开概念、预扫描缓存标记、提问记录、阅读进度 |
| `zb:concept:<名>` | 概念记录：定义/本篇语境/前置数组/原文引用/站内链接/掌握状态/首次来源/回访状态，以及 `firstAskedAt`（首次问时间）、`anchors`（每次新语境追加的锚点 `{articleId, paragraphIndex, startOffset, endOffset, at}`，供学习中心跳回原文高亮） |
| `zb:prescan:<id>` | 预扫描词表缓存（同篇不重复烧） |
| `zb:answer:<文章id>:<词>` | 问答结果缓存（防现场连点触发限流） |
| `zb:links:<名>` | 站内链接缓存 |
| `zb:guide:<文章id>` | 生成的导读（含缺口提醒） |
| `zb:note:<id>` | 我的笔记卡片（单概念 / 导读）：概念、定义、本篇语境、原文引用、来源链接、编辑后正文、时间戳；导出 `.md` 的数据源 |
| `zb:meta` | 首访引导等元信息，以及 `lastReviewAt`（上次每周复盘时间，用于 7 天触发口径） |
| `zb:stuck:<文章id>` | 本机卡点上报：`{ marks: [{ concept, paragraphIndex, startOffset, endOffset, at }] }`，同篇同词只存一条（防刷量）。写入本机的同时，把「概念名 + 段号」匿名上报到 `/stuck`（上传失败静默，不影响本机功能）；读取时与 `core/stuck.js` 的 seed 数据、别台设备的社区聚合结果三源叠加（§4.2/§4.5） |

掌握状态三档：`unvisited`（还没走过）→ `fuzzy`（有点模糊）→ `passed`（已走过）。

## 七、关键算法 → 代码落点

| 方案章节 | 实现 |
|---|---|
| 文本节点合并（跨节点匹配） | `demo/js/core/textnodes.js`（TreeWalker 收集 + 偏移映射回 Range） |
| 概念匹配（长词优先占位消解子串误命中） | `demo/js/core/match.js` |
| 概念高亮（CSS Custom Highlight，零 DOM 变更；词表缓存而非 Range；MutationObserver 重算） | `demo/js/core/highlight.js` |
| 段落级上下文截取（前中后三段 + 居中截断 1200 字） | `demo/js/core/context.js` |
| 预扫描（懒触发、8000 字截断、逐字照抄校验） | `demo/js/app/prescan.js` + SCF `/prescan` |
| 解释结果归一（`{"answer":{…}}` 多包一层解包 + 字段映射） | `demo/js/core/explain.js` |
| 预扫描词表清洗（幽灵标记丢弃 + 通用词/频次过滤，问题清单 P1-1/P1-2） | `demo/js/core/prescan.js` |
| 读者卡点聚合（seed + 现场上报 + 社区聚合三源叠加与去重、TOP3、来源标注、答主报告、首屏洞察） | `demo/js/core/stuck.js` |
| 依赖边 / 白名单过滤（泛化父概念回退）/ 边加权（双篇验证才实线）/ 缺口 Top 1 | `demo/js/core/graph.js` |
| 拓扑排序与策展排序 | `demo/js/core/graph.js` |
| 主题聚类（Jaccard 并查集传递闭包，阈值 0.1） | `demo/js/core/graph.js` |
| 学习中心图谱（三色节点：绿=多篇文章学过 / 黄=学过一篇 / 红=缺口前置） | `buildHubGraph`，`demo/js/core/graph.js` |
| 诊断报告（主题归类 `TOPIC_LEXICON`/`topicOf` + 薄弱主题 TOP3 + 建议补概念 TOP3） | `computeDiagnosis`，`demo/js/core/graph.js` |
| 锚点回原文（段落索引 + 段内偏移 → DOM Range 并高亮） | `anchorToRanges`，`demo/js/app/store.js` |
| 多回答划词（选区不在当前容器时按 `closest(articleContainer)` 重解析并回写 `runtime.page`） | `demo/js/app/selection.js` |
| 回访间隔（1→3→7→15，忘了重置） | `demo/js/core/srs.js` |
| 原文引用扩句 | `demo/js/core/quote.js` |
| 难度预告（交集/差集，零模型调用） | `demo/js/core/difficulty.js` |
| 非概念三层拦截（⚠️ 绝不用"长度>2字"） | `demo/js/core/stopwords.js` |
| 人格分层（定义层人格浓度为零） | prompt 见 `scf/index.js` / `server/prompts.js` |
| SPA 路由监听 + 归属判定（URL→容器属性→页面地址） | `extension/src/content.js` |
| 每周复盘触发口径（距上次 ≥7 天，首次以最早记录为基线）/ 最该补 Top3 / 掌握率 | `demo/js/core/review.js`（纯函数） |
| 笔记 → Markdown（概念/导读两种模板、文件名清洗、时间戳） | `demo/js/core/note.js`（纯函数） |

## 八、部署

### 8.1 SCF 云函数
线上地址：`https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com`（与 `demo/js/app/api.js` 的 `SCF_BASE`、`extension/src/background.js` 保持一致）

1. 函数配置 → 上传 `scf/zhiban-scf.zip`（zip 根目录必须含 `scf_bootstrap`/`index.js`/`stuck-store.js`/`package.json`/`node_modules`，正斜杠路径）。重新打包：

   ```powershell
   cd scf ; npm install
   Compress-Archive -Path scf_bootstrap,index.js,stuck-store.js,package.json,node_modules -DestinationPath zhiban-scf.zip -Force
   cd .. ; python scripts/fix-scf-zip.py   # 修反斜杠 + scf_bootstrap 可执行位
   ```
2. 环境变量：`ZHIPU_API_KEY`（必须）、`ZHIHU_ACCESS_SECRET`（可选）、`STUCK_REDIS_URL`（可选，卡点聚合持久化，不配则进程内存）；执行超时 **60 秒**
   - `STUCK_REDIS_URL` 取值来源：腾讯云 Redis 控制台「实例详情 → 连接信息」抄 **内网地址(host) / 端口(port) / 密码**，拼成 `redis://:<密码>@<host>:<port>/0`（开启 SSL 的实例用 `rediss://`；密码含 `@` `:` `/` 等特殊字符需 URL 编码，如 `@`→`%40`）。函数与实例**须同地域**，优先走内网地址（VPC 内网）。
   - **仅改环境变量（代码未动）无需重新打包上传**，保存即生效；但代码有改动须先按第 1 步换包（见第 4 点）。验证口径（探针用独立 `articleId`，不打脏真实文章）：先 `POST /stuck {"action":"report","articleId":"article-probe-baseline","concept":"__probe__","paragraphIndex":1}`，空闲 ≥150s 等实例回收，再 `POST /stuck {"action":"top","articleId":"article-probe-baseline"}`，应仍返回 `count:1`（**接通前实测同一探针返回 `items:[]`**，即内存态已随实例回收丢失）。若函数日志出现 `[stuck-store] Redis 不可用，后续降级内存：…`，即连接信息有误（host/密码/网络不通）：此时按内存兜底照常服务（不报错、不卡请求），但跨实例共享失效，需回查连接串。
3. 自测：`GET /ping` → `POST /ask`（含 `stream:true`）→ `POST /collections` → `POST /stuck`（`{"action":"report",…}` 再 `{"action":"top",…}` 应能读回计数）
4. 改过 `scf/index.js` / `scf/stuck-store.js` 后**必须重新打包上传**，否则线上仍是旧代码——`/ask` 的 `is_concept` 非概念拦截（问题清单 P0-2）、`/stuck` 的「Redis 不可达 5 秒内降级、不悬挂到函数超时」都依赖这一步才会生效

### 8.2 静态 Demo 站

| 地址 | 说明 |
|---|---|
| <https://z.toply.top/zhiban-demo/> | **当前可用**：独立静态站的实际挂载路径（软链到同一份文件），HTTPS 实测 200（含新版 `js/app/knowledge-source.js`） |
| <https://zhihu.toply.top/> | 独立域名站点，已建站、绑定域名、DNS 已解析到本机；**HTTPS 已配置并实测 200**（首页 / SPA 深链回退 / `js/app/knowledge-source.js` 均 200），证书 Let's Encrypt 签发、2026-12-12 到期、不加 `-k` 亦校验通过；HTTP 仍可直连（有意不加强制跳转，避免影响 ACME HTTP-01 续期校验） |

宝塔静态站：网站根目录 `/www/wwwroot/zhihu.toply.top`，上传 `demo/` 内容（保持相对路径）即可。
伪静态需加 SPA 回退 `try_files $uri $uri/ /index.html;`（hash 路由本身不需要，但直接访问 `/creator` 这类路径时能进应用而非 404）。
部署四约束：hash 路由 ✓、相对路径 ✓、函数超时 60s ✓、HTTPS + CORS（`z.toply.top` 与 `zhihu.toply.top` 均全链路 HTTPS ✓；SCF 侧 `Access-Control-Allow-Origin: *`）+ CORS ✓。
证书续期：宝塔每日 04:17 的「续签Let's Encrypt证书」任务（`acme_v2.py --renew_v2=1`）按站点证书 md5 匹配续签，成功后回写 `vhost/cert/zhihu.toply.top/` 并自动 reload nginx，无需人工干预。

### 8.3 Chrome 插件（克隆仓库后必做这三步）

构建产物 `extension/dist/` **不入库**（`.gitignore` 忽略），而 `extension/manifest.json` 第 13 行指向 `dist/background.js`。
因此直接加载源码目录会因缺 `dist/` 而失败——**必须先构建，再加载**：

```bash
# ① 在仓库根目录安装开发依赖（仅 esbuild / express）
npm install
# ② 打包插件到 extension/dist/（生成 background.js、content.js 等）
npm run build:ext
```

③ Chrome 打开 `chrome://extensions` → 右上角开启「开发者模式」→ 点「加载已解压的扩展程序」→
选中仓库里的 **`extension/` 目录**（是 `extension/`，不是 `extension/dist/`）。

加载完成后打开任意知乎回答页（`https://www.zhihu.com/question/*` 或 `https://zhuanlan.zhihu.com/p/*`），
选中正文里的概念即可看到「问知伴」浮层。

> 改了 `extension/src/**` 后需重新 `npm run build:ext`，并在 `chrome://extensions` 点该插件的「重新加载」。
> background 的 API 地址与 `demo/js/app/api.js` 的 `SCF_BASE` 保持同步。

## 九、开发指南

### 三条铁律（违反即返工，§8.4）
1. **存储接口一律异步**——core 只依赖 `demo/js/core/storage.js` 的接口；新环境在适配层 `setStorageAdapter()`。
2. **DOM 选择器可配置**——在 `demo/js/core/selectors.js` 增加配置，禁止硬编码。
3. **环境差异只出现在适配层**——共享模块内不得出现 `localStorage`/`chrome.*`/`fetch` 直连业务域名。

### 新增一个后端能力
1. SCF `index.js` 加路由（Node 12 语法：不用 `?.`/`??`，用内置 `https`，`callLlm()` 已封装 JSON 模式调用）
2. `demo/js/app/api.js` 加映射（本地路径 + SCF 路径 + 字段归一）
3. 前端调用；`npm run test:api` 与 `test:e2e` 补断言

### 新增一个前端功能
挂在 `runtime.on('concept:expanded')` / `prescan:done` 等事件上（见 `demo/js/app/runtime.js`），数据一律经 `store.js` 读写。
纯算法放 `demo/js/core/`（不碰 DOM/localStorage，纯函数），并补 `npm run test:core` 或 `npm run test:hub` 断言。
新增路由时在 `demo/js/app/router.js` 注册，并在 `demo/js/app/main.js` 的 `dispatch` 里分发页面。

## 十、已知限制与 TODO

- **创作出口是「真笔记」，不是「发回答」**：知乎官方接口只读，无法代发。导读 / 单概念均「存为我的笔记卡片」并导出 `.md`（本地存储、零接口依赖），何时分享由用户决定；界面不再有任何「模拟发布」文案。
- **知乎接口为可选增强**：未配置 `ZHIHU_ACCESS_SECRET`、或浏览器无扩展注入、或调用失败时，`/search`、`/collections` 静默降级，P0/P1 全功能不受影响（见 §一「目标用户与场景边界」）。
- **前置概念已知代价**：为保依赖链呈链状而非网状，prompt 把前置压到 ≤2 个、宁缺毋滥；部分概念的真实多前置被压缩（方案 §11.4 接受的代价）。
- **仅摘要**：知乎接口只返回内容摘要，高亮标签渲染前必须白名单清洗（`api.js` `sanitizeHtml`，禁止 innerHTML 直写）。
- **刘看山素材**：用户提供的动态 GIF，仅本地自托管使用；正式商用需确认授权（方案原文为"仅使用人设与口吻"）。
- **安全**：密钥只走环境变量；建议智谱控制台设消费硬上限（唯一真正的金钱防线）；泄露过的密钥及时重置。
- **收藏夹体检依赖插件环境**：需读知乎登录态，Demo 站（无扩展注入）只给出引导文案，完整体检在扩展版个人中心查看。
- **未做**：难度预告与短尾巴回访已在 Demo 站实现但未进 SCF（零模型调用、纯前端，不受后端影响）；移动端划选不可行（形态天花板）。
- **卡点聚合默认内存、可选持久化**：`/stuck` 默认把计数存在函数实例内存里，冷启动或多实例（并发扩容）下会归零、或读不到别台设备的计数；配置 `STUCK_REDIS_URL` 后改写 Redis（`scf/stuck-store.js` 可插拔存储），冷启动 / 多实例共享、跨设备互见，Redis 不可用自动降级回内存。未配 `STUCK_REDIS_URL` 时不足以称生产级统计，界面因此始终如实标注「演示环境数据 / 你的上报 / 社区上报」三源而不合并成一个数。接口契约与前端不变。

---

> 读不懂，划一下，当场讲明白；你忘了，它替你记着。
> 想留下点什么，就存成一张笔记卡片——**真实的笔记，不是模拟的发布。**
>
> —— 迟遇 · 知乎黑客松 2026 校园新锐季 · 知识炼金场赛道
