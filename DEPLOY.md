# 知伴 · 插件部署指南

> 本文档说明如何将知伴 Chrome 插件安装到浏览器。

---

## 前置条件

- Chrome 浏览器（版本 ≥ 88，支持 MV3）
- 网络能访问腾讯云 SCF（解释接口）和知乎（目标站点）

## 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/zhkqqkzh/Zhihu-Hackathon---Zhiban---Zhima-Fenzi.git
cd Zhihu-Hackathon---Zhiban---Zhima-Fenzi

# 2. 安装构建依赖
npm install

# 3. 构建插件
npm run build:ext
```

> 构建产物 `extension/dist/` 不入库（`.gitignore` 忽略），`manifest.json` 指向 `dist/background.js`。因此直接加载源码目录会因缺 `dist/` 而失败——**必须先构建，再加载**。

## 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选中仓库里的 **`extension/`** 目录

## 验证安装

打开任意知乎回答页（`https://www.zhihu.com/question/*` 或 `https://zhuanlan.zhihu.com/p/*`），选中正文里的概念（如「梯度下降」），应弹出「问知伴」浮层，流式返回三层解释。

## 修改后重新加载

改了 `extension/src/**` 下的源码后：

```bash
npm run build:ext          # 重新打包
```

然后在 `chrome://extensions` 点击插件的「重新加载」按钮即可。

## 个人中心页

插件加载后，在知乎任意页面点击右上角知伴图标，或在侧栏点击「个人中心」，即可打开独立个人中心页面，包含学习足迹、收藏夹体检（依赖知乎登录态）、知识卡片、推荐阅读等板块。

---

> 遇到问题请参考：
>
> - 插件加载失败 → 确认已执行 `npm run build:ext`
> - 浮层不弹出 → 确认在知乎回答页（非首页/列表页）
> - 接口无响应 → 检查网络能否正常访问外网
