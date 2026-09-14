# 知伴 · 部署指南

> 本文档详细说明如何部署知伴的三个组成部分：Chrome 插件、静态 Demo 站、腾讯云 SCF 后端。

---

## 目录

- [一、Chrome 插件部署](#一chrome-插件部署)
- [二、静态 Demo 站部署](#二静态-demo-站部署)
- [三、SCF 云函数部署](#三scf-云函数部署)
- [四、环境变量总表](#四环境变量总表)

---

## 一、Chrome 插件部署

知伴以 Chrome MV3 扩展为最终交付形态，在知乎网页上提供选中即问、全文标记、侧栏复盘、个人中心等完整功能。

### 前置条件

- Chrome 浏览器（版本 ≥ 88，支持 MV3）
- 网络能访问腾讯云 SCF（解释接口）、知乎（目标站点）

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/zhkqqkzh/Zhihu-Hackathon---Zhiban---Zhima-Fenzi.git
cd Zhihu-Hackathon---Zhiban---Zhima-Fenzi

# 2. 安装开发依赖（esbuild）
npm install

# 3. 构建插件
npm run build:ext
```

> 构建产物 `extension/dist/` 不入库（`.gitignore` 忽略），而 `manifest.json` 第 13 行指向 `dist/background.js`。因此直接加载源码目录会因缺 `dist/` 而失败——**必须先构建，再加载**。

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选中仓库里的 **`extension/`** 目录（是 `extension/`，不是 `extension/dist/`）

### 验证安装

打开任意知乎回答页（`https://www.zhihu.com/question/*` 或 `https://zhuanlan.zhihu.com/p/*`），选中正文里的概念（如「梯度下降」），应弹出「问知伴」浮层，流式返回三层解释。

### 修改后重新加载

改了 `extension/src/**` 下的源码后：

```bash
npm run build:ext          # 重新打包
```

然后在 `chrome://extensions` 点击插件的「重新加载」按钮。

### 个人中心页

插件加载后，在知乎任意页面点击右上角知伴图标，或在侧栏点击「个人中心」，即可打开独立个人中心页面（`profile.html`），包含：

- 学习足迹
- 收藏夹体检（依赖知乎登录态）
- 知识卡片
- 推荐阅读

> **收藏夹体检**依赖知乎登录态，仅在插件环境（`zhihu.com`）下可用，Demo 站中只显示引导文案。

---

## 二、静态 Demo 站部署

Demo 站是插件核心能力的静态站镜像，无需安装插件即可演示所有功能。用 Nginx/宝塔部署。

### 部署到宝塔面板

#### 1. 准备文件

将 `demo/` 目录下的全部内容（保持相对路径）上传到网站根目录，例如 `/www/wwwroot/zhihu.toply.top/`。

#### 2. 创建静态站点

宝塔面板 → 网站 → 添加站点：

| 配置项 | 值 |
|---|---|
| 域名 | 你的域名（如 `zhihu.toply.top`） |
| 网站根目录 | `/www/wwwroot/zhihu.toply.top` |
| PHP 版本 | 纯静态（无需 PHP） |

#### 3. 配置伪静态（SPA 回退）

设置 → 伪静态 → 选择「thinkphp」或自定义：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

> 知伴使用 hash 路由（`#/article/xxx`），SPA 回退本身不是必需的；但直接访问 `/creator` 这类无 hash 路径时，回退规则能确保进入应用而非 404。

#### 4. 部署约束

- 所有资源路径使用**相对路径**（`./js/`、`./assets/` 等）
- 路由使用 **hash 路由**（`#/article/:id`），不依赖服务端重写
- 后端接口走 HTTPS + CORS（SCF 已配 `Access-Control-Allow-Origin: *`）
- 前端接口地址配置在 `demo/js/app/api.js` 的 `SCF_BASE` 常量中

#### 5. HTTPS 配置

宝塔面板 → 站点设置 → SSL → Let's Encrypt 免费证书。证书每日凌晨自动续期，无需人工干预。

#### 6. 验证

访问 `https://你的域名/`，确认：

- 首页正常加载（首屏洞察 + 3 篇范文）
- 点击文章可进入阅读页
- 个人中心正常显示
- 选中概念可弹出解释浮层（走 SCF 线上接口）

---

## 三、SCF 云函数部署

后端为腾讯云 SCF（Serverless Cloud Function）Web 函数，负责模型调用、知乎搜索代理、卡点聚合等。

### 前置条件

- 腾讯云账号
- 智谱 GLM API 密钥（`ZHIPU_API_KEY`）
- （可选）知乎开放平台密钥（`ZHIHU_ACCESS_SECRET`）
- （可选）腾讯云 Redis 实例（`STUCK_REDIS_URL`，用于卡点持久化）

### 部署步骤

#### 1. 准备函数代码

```bash
cd scf/
npm install                          # 安装依赖（express, redis）
```

#### 2. 打包上传

```powershell
# Windows PowerShell
Compress-Archive -Path scf_bootstrap,index.js,stuck-store.js,package.json,node_modules -DestinationPath zhiban-scf.zip -Force
```

```bash
# 修复 zip 中的反斜杠路径 + scf_bootstrap 可执行权限
python scripts/fix-scf-zip.py
```

> zip 根目录**必须**包含：`scf_bootstrap`、`index.js`、`stuck-store.js`、`package.json`、`node_modules`。路径使用正斜杠。

#### 3. 创建云函数

腾讯云 SCF 控制台 → 函数服务 → 创建：

| 配置项 | 值 |
|---|---|
| 函数类型 | Web 函数 |
| 运行环境 | Node.js 12 以上 |
| 地域 | 北京（`ap-beijing`，需与下文配置一致） |
| 执行超时 | **60 秒** |
| 上传方式 | 本地上传 zip 包 |

#### 4. 配置环境变量

| 变量 | 必须 | 说明 |
|---|---|---|
| `ZHIPU_API_KEY` | **是** | 智谱 GLM 密钥，控制台获取 |
| `ZHIHU_ACCESS_SECRET` | 否 | 知乎开放平台密钥，不配则搜索降级 |
| `STUCK_REDIS_URL` | 否 | Redis 连接串，如 `redis://:<密码>@<host>:<port>/0`；不配则卡点计数存在内存中 |

`STUCK_REDIS_URL` 说明：
- 来源：腾讯云 Redis 控制台「实例详情 → 连接信息」，抄内网地址/端口/密码
- 函数与 Redis 实例**须同地域**（如均为 `ap-beijing`），优先走内网地址（VPC 内网）
- 密码含 `@` `:` `/` 等特殊字符需 URL 编码（如 `@` → `%40`）
- 启用 SSL 的实例用 `rediss://` 协议
- Redis 不可用时自动降级回内存，不报错、不卡请求

#### 5. 验证部署

```bash
# 健康检查
curl https://<你的函数域名>/ping
# 应返回：{"ok":true}

# 概念解释（非流式）
curl -X POST https://<你的函数域名>/ask \
  -H "Content-Type: application/json" \
  -d '{"term":"梯度下降","context":"下山的方法就是梯度下降"}'

# 卡点上报
curl -X POST https://<你的函数域名>/stuck \
  -H "Content-Type: application/json" \
  -d '{"action":"report","articleId":"article-test","concept":"梯度下降","paragraphIndex":1}'

# 卡点聚合读取
curl -X POST https://<你的函数域名>/stuck \
  -H "Content-Type: application/json" \
  -d '{"action":"top","articleId":"article-test","topN":5}'
```

#### 6. 代码更新

改过 `scf/index.js` 或 `scf/stuck-store.js` 后，**必须重新打包上传**，否则线上仍是旧代码：

```powershell
cd scf/
npm install
Compress-Archive -Path scf_bootstrap,index.js,stuck-store.js,package.json,node_modules -DestinationPath zhiban-scf.zip -Force
```

> 仅改环境变量（代码未动）无需重新打包，SCF 控制台保存即生效。

### 接口列表

所有接口以 `https://<你的函数域名>` 为 Base：

| 接口 | 方法 | 用途 |
|---|---|---|
| `/ping` | GET | 健康检查 |
| `/ask` | POST | 概念解释（支持 `stream:true` 流式） |
| `/prescan` | POST | 全文概念预扫描 |
| `/search` | POST | 知乎站内搜索代理 |
| `/quiz` | POST | 看山提问（两阶段：生成追问 + 判定回答） |
| `/collections` | POST | 收藏夹体检（聚类 + 点评） |
| `/stuck` | POST | 卡点匿名聚合（report / top 两种 action） |

关于 `/collections`：仅 SCF 提供（本地 dev server 无此路由），读取知乎登录态收藏夹依赖插件环境。

---

## 四、环境变量总表

| 变量 | 位置 | 必须 | 用途 |
|---|---|---|---|
| `ZHIPU_API_KEY` | SCF 环境变量 | **是** | 智谱 GLM 密钥 |
| `ZHIHU_ACCESS_SECRET` | SCF 环境变量 | 否 | 知乎站内搜索（不配则降级） |
| `STUCK_REDIS_URL` | SCF 环境变量 | 否 | 卡点持久化（不配则进程内存） |
| `LLM_API_KEY` | 本地 dev server | 否 | 本地接真实模型（不配则 mock） |
| `LLM_BASE_URL` | 本地 dev server | 否 | 模型 API 地址，默认 `https://open.bigmodel.cn/api/paas/v4` |
| `LLM_MODEL` | 本地 dev server | 否 | 模型名，默认 `glm-4.5-flash` |
| `PORT` | 本地 dev server | 否 | dev server 端口，默认 8787 |

---

> 遇到部署问题请参考：
>
> - Chrome 插件加载失败 → 确认已执行 `npm run build:ext`
> - SCF 返回 502 → 检查 `ZHIPU_API_KEY` 是否有效
> - 卡点接口返回空 → 确认 `STUCK_REDIS_URL` 配置，或等待冷启动后重试
> - CORS 报错 → 确认 SCF 响应头含 `Access-Control-Allow-Origin: *`
