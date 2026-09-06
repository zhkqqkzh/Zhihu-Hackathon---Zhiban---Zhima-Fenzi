// content script —— 知乎页面适配层（§8.4 铁律 3：环境差异只出现在这里）。
// 共享模块（core/* 与 app/* 的大部分）零改动复用；本文件只做：
//   1. 存储适配 chrome.storage.local（§9.3：插件不能用 localStorage）
//   2. API 传输层：经 background 转发（§14.1：知乎 CSP + 密钥不能进前端）
//   3. 资源基址：chrome.runtime.getURL
//   4. SPA 路由监听与文章归属判定（§16）

import { setStorageAdapter } from '../../demo/js/app/store.js';
import { ZHIHU_SELECTORS } from '../../demo/js/core/selectors.js';
import { setPageContext, runtime } from '../../demo/js/app/runtime.js';
import { initEntry } from '../../demo/js/app/entry.js';
import { initSelection } from '../../demo/js/app/selection.js';
import { initPrescan } from '../../demo/js/app/prescan.js';
import { initQuiz } from '../../demo/js/app/quiz.js';

// 1. 存储适配（异步接口，铁律 1）
setStorageAdapter({
  get: (k) => new Promise((res) => chrome.storage.local.get(k, (o) => res(o[k] ?? null))),
  set: (k, v) => new Promise((res) => chrome.storage.local.set({ [k]: v }, res)),
  remove: (k) => new Promise((res) => chrome.storage.local.remove(k, res)),
  keys: (prefix = '') => new Promise((res) => chrome.storage.local.get(null, (o) =>
    res(Object.keys(o).filter((k) => k.startsWith(prefix))))),
  clear: (prefix = '') => new Promise((res) => chrome.storage.local.get(null, (o) => {
    const doomed = Object.keys(o).filter((k) => k.startsWith(prefix));
    if (doomed.length) chrome.storage.local.remove(doomed, res); else res();
  })),
});

// 2. API 传输层：content → background → 后端
window.__ZB_TRANSPORT__ = (path, payload) =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type: 'zb-api', path, payload }, resolve));

// 3. 资源基址（看山 GIF、兜底样式表）
window.__ZB_ASSET_BASE__ = chrome.runtime.getURL('assets/');

// 4a. 归属判定（§16）：主路径取 URL 中的回答 ID，兜底读容器属性，最后兜底用页面地址
function articleIdOf(container) {
  const m = location.href.match(/answer\/(\d+)/);
  if (m) return `zhihu-answer-${m[1]}`;
  const attr = container?.closest?.('[data-answer-id]')?.getAttribute?.('data-answer-id')
    || container?.getAttribute?.('data-answer-id');
  if (attr) return `zhihu-answer-${attr}`;
  return `zhihu-${location.href.split('?')[0]}`; // 保证不丢数据
}

// 4b. 建立页面上下文（回答容器 + 正文；知乎是 SPA，容器随路由重渲染）
let lastUrl = null;
function setupPage() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  const container = document.querySelector(ZHIHU_SELECTORS.articleContainer);
  if (!container) {
    setPageContext(null);
    return; // 列表页等无回答容器页面：等待下一次路由变化
  }
  const body = container.querySelector(ZHIHU_SELECTORS.articleBody) || container;
  setPageContext({
    article: { title: document.title },
    articleId: articleIdOf(container),
    container,
    body,
    selectors: ZHIHU_SELECTORS,
  });
}

// SPA 路由监听（§16）：前进后退能监听到；脚本主动触发的跳转监听不到，需要挂钩
function hookHistory(method) {
  const original = history[method];
  history[method] = function (...args) {
    const ret = original.apply(this, args);
    window.dispatchEvent(new Event('zb:route'));
    return ret;
  };
}
hookHistory('pushState');
hookHistory('replaceState');
window.addEventListener('popstate', () => setTimeout(setupPage, 300));
window.addEventListener('zb:route', () => setTimeout(setupPage, 300));

// 挂载点（与 Demo 站结构对齐）
for (const id of ['zb-entry', 'zb-sidebar-root', 'zb-popup-root', 'zb-toast-root']) {
  if (!document.getElementById(id)) {
    const div = document.createElement('div');
    div.id = id;
    document.documentElement.appendChild(div);
  }
}
// Toast 样式（插件没有站点 CSS，注入最小样式）
const style = document.createElement('style');
style.textContent = `#zb-toast-root{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:560px;background:#121212;color:#fff;font-size:13px;line-height:1.7;padding:10px 18px;border-radius:10px;opacity:0;pointer-events:none;transition:opacity .2s}#zb-toast-root.show{opacity:1}`;
document.documentElement.appendChild(style);

// 启动（模块已 init 的部分保持幂等：entry/selection/prescan/quiz 只挂全局监听）
initEntry();
initSelection();
initPrescan();
initQuiz();

// 知乎回答流是懒加载的：轮询等容器出现（每次路由变化后重置）
let tries = 0;
const timer = setInterval(() => {
  setupPage();
  if (runtime.page || ++tries > 40) clearInterval(timer);
}, 500);

// 回答间切换（问题页多个回答）：正文容器替换后重建上下文
const answerObserver = new MutationObserver(() => {
  if (!runtime.page && document.querySelector(ZHIHU_SELECTORS.articleContainer)) setupPage();
});
answerObserver.observe(document.body, { childList: true, subtree: true });
