// 个人中心独立页（§方案 A：在扩展内新标签页承载，不再塞进侧栏 tab）。
// 与 content script 共用同一份 chrome.storage.local，所以学习数据天然打通；
// 环境差异（存储适配、资源基址、回原文跳转）只在本文件里做适配。

import * as store from '../../demo/js/app/store.js';
import { renderProfile } from '../../demo/js/app/profile.js';
import { renderZhihuHub } from './profile-zhihu.js';

// 1. 存储适配 chrome.storage.local（与 content.js 一致；插件不能用 localStorage）
store.setStorageAdapter({
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

// 2. 资源基址
window.__ZB_ASSET_BASE__ = chrome.runtime.getURL('dist/assets/');

// 3. 回原文：页内锚点跳转（requestAnchorJump）只在同一文档内有效，独立页用不了；
//    改为按 articleId 还原知乎地址，在新标签页打开。
function zhihuUrlOf(articleId) {
  if (typeof articleId !== 'string') return null;
  if (articleId.startsWith('zhihu-answer-')) return `https://www.zhihu.com/answer/${articleId.slice('zhihu-answer-'.length)}`;
  if (articleId.startsWith('zhihu-')) return articleId.slice('zhihu-'.length);
  return null;
}
window.__ZB_GOTO_ANCHOR__ = (articleId) => {
  const url = zhihuUrlOf(articleId);
  if (url) window.open(url, '_blank', 'noopener');
};

// 4. 渲染：知乎区块（账号/收藏夹）与学习数据区块并行加载，互不阻塞
async function main() {
  // 文章真实标题：回答 ID 是机器串，用本地记录里的标题还原「在《…》学过」
  const titles = new Map((await store.listArticleRecords()).map((a) => [a.id, a.title]));
  window.__ZB_ARTICLE_TITLE__ = (id) => titles.get(id) || '';

  // 知乎区块自己负责占位与错误提示，这里不 await，慢的是它、不该拖着学习数据。
  // 打分结果回填给「推荐阅读」模块；controller 还没就绪时先记着，首次渲染本就会读到最新值。
  const zhihuHost = document.createElement('div');
  let zhihuItems = [];
  let controller = null;
  renderZhihuHub(zhihuHost, (items) => {
    zhihuItems = items;
    controller?.refresh();
  }).catch((e) => {
    zhihuHost.textContent = `知乎区块加载失败：${e?.message || e}`;
  });

  controller = await renderProfile(document.getElementById('app'), {
    graph: false,
    extra: zhihuHost,
    getRecommends: () => zhihuItems,
  });
}
main().catch((e) => { document.getElementById('app').textContent = `加载失败：${e?.message || e}`; });
