# 知伴 · 和看山一起读

> 知乎黑客松 2026 · 校园新锐季 —— 知识炼金场赛道
>
> 读知乎遇到不懂的概念，**划一下**，当场在这篇回答的语境里讲明白。
> 每一次追问都会留下痕迹——单篇内汇成**我的短尾巴**，跨篇连成有方向的依赖链**去看山**；
> 走到最后，这些痕迹会长成一篇**导读**，你改一改、署上名发出去：**被卡住的读者，成了下一篇回答的作者。**

---

## 一、功能总览（11 个功能）

| # | 功能 | 说明 | 主要代码 |
|---|---|---|---|
| 1 | 选中即问 | 划选概念 → 弹「问知伴」→ 三层解释（一句话定义 / 为什么在这篇里重要 / 你可能需要先了解） | `demo/js/app/selection.js` `popup.js` |
| 2 | 前置知识跳转 | 前置概念的一句话解释 + 站内高赞回答（赞数排序、超长降权） | `popup.js` + SCF `/search` |
| 3 | 全文概念标记 | 关浮层后整篇难词淡色波浪线浮现（原生自定义高亮，零 DOM 变更） | `demo/js/core/highlight.js` |
| 4 | 本篇概念地图（我的短尾巴） | 侧栏展示本篇概念与已展开状态，角标计数 | `demo/js/app/sidebar.js` |
| 5 | 去看山 | 跨篇依赖链：营地按掌握状态着色，终点是那座还没登上的山 | `demo/js/app/chain.js` |
| 6 | 前置知识导读 | 本篇展开 3 个概念后自动生成；含"⚠️ 你可能还缺、但没问到的一环"（缺口只取 Top 1） | `demo/js/app/guide.js` |
| 7 | 看山提问 | 读完后看山反过来提问；判定 → 营地变色（已走过/有点模糊/还没走过） | `demo/js/app/quiz.js` |
| 8 | 短尾巴回访 | 间隔重复 1→3→7→15 天，忘了重置；零模型调用 | `demo/js/core/srs.js` `demo/js/app/revisit.js` |
| 9 | 难度预告 | 打开新回答先预告陌生概念占比，三档文案；零模型调用 | `demo/js/core/difficulty.js` |
| 10 | 看山策展 | 读 3 篇以上同主题回答，按依赖顺序串成《我的机器学习入门路径》 | `demo/js/app/curation.js` |
| 11 | 冰屋 | 总览：短尾巴、掌握率、读过的回答、导读、策展 | `demo/js/app/igloo.js` |

配套：常驻入口（首访引导、可永久关闭）、数据控制（本地存储声明 + 一键删除）。

## 二、架构

```
┌─────────────┐   fetch/messaging   ┌──────────────────┐   HTTPS   ┌────────────┐
│ 交付形态     │ ──────────────────→ │  腾讯云 SCF       │ ────────→ │ 智谱 GLM    │
│ · Chrome 插件│                     │  /ping /ask      │           │ glm-4.5-air│
│ · 静态 Demo站│                     │  /prescan        │ ────────→ ├────────────┤
└─────────────┘                     │  /search /quiz   │           │ 知乎搜索 API│
        所有用户数据只存浏览器本地     └──────────────────┘           └────────────┘
```

- **没有数据库、没有自有服务器**。模型密钥与知乎密钥只在 SCF 环境变量里。
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
│       ├── app/           # 应用层（页面、浮层、侧栏、各功能）
│       └── data/          # 3 篇互链 ML 文章（反向传播→梯度下降→导数）
├── server/                # 本地 dev server：静态托管 + 四接口 + mock 模型
├── scf/                   # ★ 生产后端：腾讯云 SCF Web 函数（Node 12 兼容）
│   ├── index.js           #   /ping /ask /prescan /search /quiz
│   ├── scf_bootstrap      #   自定义运行时启动脚本（0755）
│   └── package.json       #   仅声明 express 依赖
├── extension/             # Chrome MV3 插件（最终形态）
│   ├── manifest.json
│   ├── src/               # content（知乎适配层）+ background（请求中转）
│   ├── build.mjs          # esbuild 打包（MV3 禁远程代码，全部本地打包）
│   └── dist/              # 构建产物（git 忽略，npm run build:ext 生成）
├── scripts/               # 校验与测试（check-syntax / check-imports / test-core / test-api / test-e2e）
└── package.json
```

## 三、快速开始

```bash
npm install          # 仅开发依赖（esbuild/express）；运行时零三方依赖

# 开发模式（mock 模型，零配置）
npm run dev          # http://localhost:8787

# 本地接真实模型（可选）
export LLM_API_KEY=xxx LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4 LLM_MODEL=glm-4.5-air
# 本地知乎搜索（可选）
export ZHIHU_ACCESS_SECRET=xxx
```

### 环境变量总表

| 变量 | 位置 | 用途 |
|---|---|---|
| `ZHIPU_API_KEY` | SCF 函数配置 | 智谱 GLM 密钥（**必须**） |
| `ZHIHU_ACCESS_SECRET` | SCF 函数配置 | 知乎站内搜索（不配则降级） |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 本地 dev server | 本地接真实模型（不配则 mock） |
| `PORT` | 本地 | dev server 端口，默认 8787 |

## 四、测试与校验

```bash
npm run check        # 全量 JS 语法（node --check）+ 模块导入解析（路径/具名/默认导出）
npm run test:core    # 核心算法 39 项：概念匹配/幽灵标记检测/扩句/依赖图/拓扑序/白名单过滤/
                     # 边加权/缺口Top1/聚类/策展排序/回访间隔/难度三档/停用词拦截
npm run test:api     # 后端 22 项：四接口结构/字段零缺失/400/限流429/CORS/目录穿越
npm run test:e2e     # 端到端 14 项：Edge 无头 + CDP 真实划选→浮层三层解释→选「的」不弹窗→
                     # 示例数据→冰屋/策展/去看山拓扑序/实线边/导读页
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
  "definition": "一句话定义（≤40 字）",
  "context_why": "概念在片段里的角色（≤60 字，紧扣片段）",
  "prerequisites": ["梯度"]
}
```
前端在 `api.js` 中把 `context_why` 映射为 `in_context`。**不要改 prompt 模板里的字段名**，否则前端映射失效。

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

### 错误约定
| 场景 | 状态码 |
|---|---|
| 缺必填参数 | 400 |
| 模型输出非合法 JSON | 500 |
| 大模型 API 失败 / 非 2xx | 502 |
| SCF 平台超时 | 由云函数平台处理（函数超时须配 60 秒，代码内 55 秒主动熔断） |

## 六、数据模型（全部浏览器本地，无服务器存储）

localStorage 键前缀 `zb:`（插件为 `chrome.storage.local`，同结构）：

| 键 | 内容 |
|---|---|
| `zb:article:<id>` | 文章记录：标题/链接、已展开概念、预扫描缓存标记、提问记录、阅读进度 |
| `zb:concept:<名>` | 概念记录：定义/本篇语境/前置数组/原文引用/站内链接/掌握状态/首次来源/askedIn/回访状态 |
| `zb:prescan:<id>` | 预扫描词表缓存（同篇不重复烧） |
| `zb:answer:<文章id>:<词>` | 问答结果缓存（防现场连点触发限流） |
| `zb:links:<名>` | 站内链接缓存 |
| `zb:guide:<文章id>` | 生成的导读（含缺口提醒） |
| `zb:meta` | 首访引导等元信息 |

掌握状态三档：`unvisited`（还没走过）→ `fuzzy`（有点模糊）→ `passed`（已走过）。

## 七、关键算法 → 代码落点

| 方案章节 | 实现 |
|---|---|
| 文本节点合并（跨节点匹配） | `demo/js/core/textnodes.js`（TreeWalker 收集 + 偏移映射回 Range） |
| 概念匹配（长词优先占位消解子串误命中） | `demo/js/core/match.js` |
| 概念高亮（CSS Custom Highlight，零 DOM 变更；词表缓存而非 Range；MutationObserver 重算） | `demo/js/core/highlight.js` |
| 段落级上下文截取（前中后三段 + 居中截断 1200 字） | `demo/js/core/context.js` |
| 预扫描（懒触发、8000 字截断、逐字照抄校验） | `demo/js/app/prescan.js` + SCF `/prescan` |
| 依赖边 / 白名单过滤（泛化父概念回退）/ 边加权（双篇验证才实线）/ 缺口 Top 1 | `demo/js/core/graph.js` |
| 拓扑排序与策展排序 | `demo/js/core/graph.js` |
| 主题聚类（Jaccard 并查集传递闭包，阈值 0.1） | `demo/js/core/graph.js` |
| 回访间隔（1→3→7→15，忘了重置） | `demo/js/core/srs.js` |
| 原文引用扩句 | `demo/js/core/quote.js` |
| 难度预告（交集/差集，零模型调用） | `demo/js/core/difficulty.js` |
| 非概念三层拦截（⚠️ 绝不用"长度>2字"） | `demo/js/core/stopwords.js` |
| 人格分层（定义层人格浓度为零） | prompt 见 `scf/index.js` / `server/prompts.js` |
| SPA 路由监听 + 归属判定（URL→容器属性→页面地址） | `extension/src/content.js` |

## 八、部署

### 8.1 SCF 云函数
1. 函数配置 → 上传 `scf/zhiban-scf.zip`（zip 根目录必须含 `scf_bootstrap`/`index.js`/`package.json`/`node_modules`，正斜杠路径；重新打包脚本见 git 历史或按 `extension/build.mjs` 同款 Python zipfile 方式）
2. 环境变量：`ZHIPU_API_KEY`（必须）、`ZHIHU_ACCESS_SECRET`（可选）；执行超时 **60 秒**
3. 自测：`GET /ping` → `POST /ask`

### 8.2 静态 Demo 站（可选交付）
COS 桶开静态网站，上传 `demo/`（保持相对路径）。部署四约束：hash 路由 ✓、相对路径 ✓、函数超时 60s ✓、全链路 HTTPS + CORS ✓。

### 8.3 Chrome 插件
`npm run build:ext` 后，Chrome `chrome://extensions` 开发者模式加载 `extension/`。
background 的 API 地址与 `demo/js/app/api.js` 的 `SCF_BASE` 保持同步。

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

## 十、已知限制与 TODO

- **发布是流程模拟**：知乎官方接口只读，导读"发布"= 生成 → 编辑 → 署名 → 复制剪贴板 → 用户自行发布（界面已标注）。
- **前置概念已知代价**：为保依赖链呈链状而非网状，prompt 把前置压到 ≤2 个、宁缺毋滥；部分概念的真实多前置被压缩（方案 §11.4 接受的代价）。
- **仅摘要**：知乎接口只返回内容摘要，高亮标签渲染前必须白名单清洗（`api.js` `sanitizeHtml`，禁止 innerHTML 直写）。
- **刘看山素材**：用户提供的动态 GIF，仅本地自托管使用；正式商用需确认授权（方案原文为"仅使用人设与口吻"）。
- **安全**：密钥只走环境变量；建议智谱控制台设消费硬上限（唯一真正的金钱防线）；泄露过的密钥及时重置。
- **未做**：难度预告与短尾巴回访已在 Demo 站实现但未进 SCF（零模型调用、纯前端，不受后端影响）；移动端划选不可行（形态天花板）。

---

> 追问的终点不是一张卡片，是一篇新的回答。
> 而路上留下的每一处痕迹，都不是缺口——**那是你的短尾巴。**
