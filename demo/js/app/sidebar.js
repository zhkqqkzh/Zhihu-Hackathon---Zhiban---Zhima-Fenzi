// 侧栏（§四-4 本篇概念地图 / 功能 5 去看山 / §六 数据控制）。
// 本篇短尾巴：显示本篇涉及哪些概念、你展开过哪几个；顶部角标本篇已展开 N 个；
// 固定文案「你关心过的这些概念，也是你的特别之处。」
// 常驻本地存储声明 + 「删除我的全部记录」放在显眼处（§六）。

import { shadowRoot, el, toast, assetUrl } from './ui.js';
import { runtime } from './runtime.js';
import * as store from './store.js';
import { ensurePrescan, refreshHighlights } from './prescan.js';
import { renderChain } from './chain.js';
import { renderQuizTab } from './quiz.js';
import { loadSample, confirmClear } from './sample.js';

const CSS = `
:host { all: initial; }
.zb-mask { position: fixed; inset: 0; z-index: 99980; background: rgba(18,18,18,.18); }
.zb-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 99981;
  width: 380px; max-width: 92vw; background: #fff;
  box-shadow: -8px 0 30px rgba(18,18,18,.15);
  display: flex; flex-direction: column;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  animation: zbslide .18s ease-out;
}
@keyframes zbslide { from { transform: translateX(30px); opacity: .5; } }
.zb-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
.zb-head img { width: 30px; height: 30px; }
.zb-head .t { font-size: 15px; font-weight: 700; flex: 1; }
.zb-badge { background: #056de8; color: #fff; font-size: 11px; border-radius: 10px; padding: 2px 8px; }
.zb-x { border: 0; background: none; font-size: 18px; color: #8590a6; cursor: pointer; }
.zb-tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid #f0f0f0; }
.zb-tab { border: 0; background: none; padding: 8px 10px; font-size: 13px; color: #666; cursor: pointer; border-bottom: 2px solid transparent; }
.zb-tab.on { color: #056de8; border-bottom-color: #056de8; font-weight: 600; }
.zb-body { flex: 1; overflow: auto; padding: 14px 16px; }
.zb-fixed { font-size: 12px; color: #8590a6; padding: 10px 16px; border-top: 1px solid #f0f0f0; line-height: 1.7; }
.zb-map-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 13px; margin-bottom: 4px; }
.zb-map-item .dot { width: 8px; height: 8px; border-radius: 50%; background: #d3d9e3; flex: none; }
.zb-map-item.expanded { background: #f7f9fc; }
.zb-map-item.expanded .dot { background: #d67a27; }
.zb-map-item .mastery { margin-left: auto; font-size: 11px; color: #8590a6; }
.zb-btnrow { display: flex; gap: 8px; padding: 8px 16px 12px; }
.zb-btnrow button { flex: 1; font-size: 12px; padding: 7px 0; border-radius: 8px; border: 1px solid #e0e5ee; background: #fff; cursor: pointer; color: #444; }
.zb-btnrow .danger { color: #c33; border-color: #f0caca; }
`;

let open = false;
let host = null;

export function openSidebar(tab = 'tail') {
  // 防御：后台冻结/页面重渲染可能让上次 host 脱离文档，但 open 仍为 true，
  // 导致再次点击入口被 `if (open) return` 拦截——表现为「点不开」。先清理再开。
  if (host && !host.isConnected) { host = null; open = false; }
  if (open && host) return;
  open = true;
  runtime.emit('sidebar:open');
  const { host: h, root } = shadowRoot('div', CSS);
  host = h;
  const body = el('div', { class: 'zb-body' });
  const badge = el('span', { class: 'zb-badge', text: '本篇 0' });
  const tabs = el('div', { class: 'zb-tabs' });

  const renderTab = async (name) => {
    [...tabs.children].forEach((c) => c.classList.toggle('on', c.dataset.tab === name));
    body.replaceChildren();
    if (name === 'tail') return renderTailTab(body, badge);
    if (name === 'chain') return renderChain(body);
    if (name === 'quiz') return renderQuizTab(body);
    if (name === 'data') return renderDataTab(body);
  };

  for (const [name, label] of [['tail', '我的短尾巴'], ['chain', '去看山'], ['quiz', '看山提问'], ['data', '数据控制']]) {
    tabs.appendChild(el('button', { class: 'zb-tab', dataset: { tab: name }, text: label, onclick: () => renderTab(name) }));
  }

  root.append(
    el('div', { class: 'zb-mask', onclick: closeSidebar }),
    el('div', { class: 'zb-panel' }, [
      el('div', { class: 'zb-head' }, [
        el('img', { src: assetUrl('kanshan/wave.gif'), alt: '看山' }),
        el('span', { class: 't', text: '知伴 · 侧栏' }),
        badge,
        el('button', { class: 'zb-x', text: '×', onclick: closeSidebar }),
      ]),
      tabs,
      body,
      el('div', { class: 'zb-fixed', text: '你关心过的这些概念，也是你的特别之处。' }),
      el('div', { class: 'zb-fixed', style: 'border-top:0;padding-top:0', text: '所有记录仅存于本浏览器，不上传服务器。' }),
    ]),
  );
  document.getElementById('zb-sidebar-root').appendChild(host);
  renderTab(tab);
}

export function closeSidebar() {
  open = false;
  host?.remove();
  host = null;
}
export function isSidebarOpen() { return open; }

async function renderTailTab(body, badge) {
  const page = runtime.page;
  if (!page) {
    body.appendChild(el('div', { text: '打开一篇回答后，这里会显示这篇的概念地图。' }));
    return;
  }
  const concepts = await ensurePrescan(page.articleId);
  const art = await store.getArticleRecord(page.articleId);
  const expanded = new Set(art?.expandedConcepts || []);
  badge.textContent = `本篇 ${expanded.size}`;
  if (!concepts?.length) {
    body.appendChild(el('div', { text: '这篇的概念词表还没扫出来。选中一个词试试，我会顺便把整篇扫一遍。' }));
    return;
  }
  const allRecords = await store.listConcepts();
  const masteryOf = new Map(allRecords.map((c) => [c.name, c.mastery]));
  const label = { unvisited: '还没走过', fuzzy: '有点模糊', passed: '已走过' };
  body.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:8px', text: `本篇涉及 ${concepts.length} 个概念，你已展开 ${expanded.size} 个。` }));
  for (const name of concepts) {
    const isExp = expanded.has(name);
    const m = masteryOf.get(name);
    body.appendChild(el('div', { class: `zb-map-item${isExp ? ' expanded' : ''}` }, [
      el('span', { class: 'dot' }),
      el('span', { text: name }),
      isExp && m ? el('span', { class: 'mastery', text: label[m] || '' }) : null,
    ]));
  }
  await refreshHighlights();
}

async function renderDataTab(body) {
  body.appendChild(el('div', { style: 'font-size:13px;line-height:1.9;color:#444' }, [
    el('p', { html: '<b>这些记录是什么：</b>你的阅读史和知识盲区，属敏感数据。它们只存在这个浏览器的本地存储里，不上传任何服务器，清缓存会一并清除。' }),
    el('p', { html: '<b>想重新开始？</b>清空后回到冷启动，可以演示"从零攒出一条路径"。' }),
  ]));
  body.appendChild(el('div', { class: 'zb-btnrow', style: 'padding:8px 0' }, [
    el('button', { text: '载入示例数据', onclick: async () => { await loadSample(); toast('示例数据已载入（示例）——去看山看看那条依赖链。'); } }),
    el('button', { text: '清空数据', class: 'danger', onclick: confirmClear }),
  ]));
}
