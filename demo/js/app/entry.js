// 常驻入口（§六）：页面右侧极窄竖条，贴边半透明。
// 首访一次性引导「选中任意概念，试试问知伴」；用过后自动弱化；可永久关闭。
// 为什么必须有：预扫描是懒触发的，新用户看不到入口就永远问不出第一个。
// 计划书第 3 条：每周复盘也推到这儿——自动出现、有角标，用户什么都不用做。

import { shadowRoot, el, toast } from './ui.js';
import * as store from './store.js';
import { runtime } from './runtime.js';
import { openSidebar } from './sidebar.js';
import { getWeeklyReview, hasUnseenReview, ackReview } from './weekly.js';

const CSS = `
:host { all: initial; }
.zb-entry {
  position: fixed; right: 0; top: 40%; z-index: 99990;
  writing-mode: vertical-rl; letter-spacing: 4px;
  background: rgba(5,109,232,.88); color: #fff; border: 0;
  padding: 14px 7px; border-radius: 8px 0 0 8px; cursor: pointer;
  font-size: 13px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: opacity .3s, background .2s;
}
.zb-entry.used { opacity: .35; }
.zb-entry.used:hover { opacity: .9; }
.zb-entry-tip {
  position: fixed; right: 34px; top: 40%; z-index: 99990;
  background: #fff; border: 1px solid #e7e7e7; border-radius: 10px;
  padding: 10px 14px; width: 220px; font-size: 13px; line-height: 1.7;
  box-shadow: 0 6px 24px rgba(18,18,18,.12);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.zb-entry-tip b { color: #056de8; }
.zb-entry-close { display: block; margin-top: 6px; font-size: 12px; color: #8590a6; background: none; border: 0; cursor: pointer; padding: 0; }
.zb-entry .dot {
  position: absolute; top: 6px; right: 4px; width: 8px; height: 8px;
  border-radius: 50%; background: #f5222d; border: 1px solid #fff;
}
.zb-review {
  position: fixed; right: 34px; top: 40%; z-index: 99990;
  background: #fff; border: 1px solid #e7e7e7; border-radius: 10px;
  padding: 12px 14px; width: 250px; font-size: 13px; line-height: 1.7;
  box-shadow: 0 6px 24px rgba(18,18,18,.12);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.zb-review h4 { font-size: 13px; margin: 0 0 6px; }
.zb-review .num { color: #056de8; font-weight: 700; }
.zb-review .gaps { margin-top: 6px; color: #444; }
.zb-review .row { display: flex; gap: 8px; margin-top: 10px; }
.zb-review button { flex: 1; font-size: 12px; padding: 5px 0; border-radius: 8px; border: 1px solid #e0e5ee; background: #fff; cursor: pointer; color: #444; }
.zb-review button.primary { background: #056de8; border-color: #056de8; color: #fff; }
`;

let entryHost = null; // 入口挂载的 shadow host（侧栏开合时整体显隐）
let sidebarOpen = false; // 侧栏是否展开（render 重建 host 后要沿用，否则会闪回）

export function initEntry() {
  // 侧栏展开时收起入口按钮（否则会压在侧栏面板上），关闭后恢复
  runtime.on('sidebar:open', () => { sidebarOpen = true; toggleEntry(); });
  runtime.on('sidebar:closed', () => { sidebarOpen = false; toggleEntry(); });
  // 复盘推送到达 → 重渲染入口（角标 + 自动弹出的复盘卡片）
  runtime.on('review:ready', () => { render(); });
  render();
}

function toggleEntry() {
  if (entryHost) entryHost.style.display = sidebarOpen ? 'none' : '';
}

async function render() {
  const meta = await store.getMeta();
  if (meta.entryClosed) return;
  const rootEl = document.getElementById('zb-entry');
  rootEl.replaceChildren();
  const { host, root } = shadowRoot('div', CSS);
  entryHost = host;
  toggleEntry();

  const btn = el('button', { class: `zb-entry${meta.entryUsed ? ' used' : ''}`, text: '知伴 · 问看山' });
  if (hasUnseenReview()) btn.appendChild(el('span', { class: 'dot' }));
  btn.addEventListener('click', async () => {
    await store.saveMeta({ entryUsed: true });
    render();
    openSidebar();
  });
  root.appendChild(btn);

  // 零操作复盘推送：自动出现，不需要用户打开任何中心页面（与首访引导互斥显示）。
  const unseen = hasUnseenReview();
  if (unseen) root.appendChild(renderReviewCard());

  if (!meta.entryUsed && !meta.tipDismissed && !unseen) {
    const tip = el('div', { class: 'zb-entry-tip' }, [
      el('div', { html: '我是看山。读到这里卡住的话，<b>选中任意不懂的概念</b>，划一下，我就在这篇回答的语境里给你讲明白。' }),
      el('button', { class: 'zb-entry-close', text: '知道了', onclick: async () => { await store.saveMeta({ tipDismissed: true }); render(); } }),
      el('button', { class: 'zb-entry-close', text: '永久关闭入口', onclick: async () => {
        await store.saveMeta({ entryClosed: true });
        render();
        toast('入口已关闭。刷新后不会再出现，侧栏历史数据不受影响。');
      } }),
    ]);
    root.appendChild(tip);
  }

  rootEl.appendChild(host);
}

// 复盘卡片：本周卡住多少、掌握率、最该补的 3 个；点「展开详情」进侧栏复盘 tab。
function renderReviewCard() {
  const r = getWeeklyReview();
  if (!r) return el('div', {});
  const pct = Math.round((r.masteryRate || 0) * 100);
  const gaps = r.topGaps?.length ? r.topGaps.join(' / ') : '先把问过的概念再过一遍';
  return el('div', { class: 'zb-review' }, [
    el('h4', { text: '本周复盘 · 你不用做任何事' }),
    el('div', { html: `你问过 <span class="num">${r.total}</span> 个概念，还有 <span class="num">${r.stalledCount}</span> 个没走过；掌握率 <span class="num">${pct}%</span>。` }),
    el('div', { class: 'gaps', text: `最该补的 3 个：${gaps}` }),
    el('div', { class: 'row' }, [
      el('button', { class: 'primary', text: '展开详情', onclick: () => { ackReview(); render(); openSidebar('review'); } }),
      el('button', { text: '知道了', onclick: () => { ackReview(); render(); } }),
    ]),
  ]);
}
