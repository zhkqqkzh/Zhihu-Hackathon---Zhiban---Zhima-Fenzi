// 侧栏（§四-4 本篇概念地图 / 功能 5 去看山 / §六 数据控制）。
// 本篇短尾巴：显示本篇涉及哪些概念、你展开过哪几个；顶部角标本篇已展开 N 个；
// 固定文案「你关心过的这些概念，也是你的特别之处。」
// 常驻本地存储声明 + 「删除我的全部记录」放在显眼处（§六）。

import { shadowRoot, el, toast, assetUrl } from './ui.js';
import { runtime, jumpToAnchor } from './runtime.js';
import * as store from './store.js';
import { mergeStuck, formatCount, stuckSourceLabel } from '../core/stuck.js';
import { ensurePrescan, refreshHighlights } from './prescan.js';
import { renderQuizTab } from './quiz.js';
import { loadSample, confirmClear } from './sample.js';
import { navigate } from './router.js';
import { computeWeeklyReview, hasUnseenReview, ackReview } from './weekly.js';

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
.zb-profile-btn { border: 1px solid #e0e5ee; background: #fff; padding: 4px 10px; font-size: 12px; color: #056de8; border-radius: 6px; cursor: pointer; margin-left: 6px; }
.zb-profile-btn:hover { background: #f0f5ff; }
.zb-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid #f0f0f0; }
.zb-tab { border: 0; background: none; padding: 8px 7px; font-size: 13px; color: #666; cursor: pointer; border-bottom: 2px solid transparent; }
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
/* 看山提问（§10.8）：卡片渲染在 Shadow DOM 内，样式必须写在隔离样式表里——
   zhiban.css 是文档级皮肤，只在旧内核 link 降级时才会进到 shadow root。 */
.zb-quiz { border: 1px solid #e7e7e7; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.zb-quiz-concept { font-size: 12px; color: #8590a6; margin-bottom: 4px; }
.zb-quiz-q { font-size: 14px; font-weight: 600; line-height: 1.6; margin-bottom: 8px; }
.zb-quiz-a {
  width: 100%; min-height: 68px; font-size: 13px; line-height: 1.6; padding: 9px 11px;
  border: 1px solid #e0e5ee; border-radius: 8px; resize: none; font-family: inherit;
  box-sizing: border-box; outline: none; transition: border-color .15s, box-shadow .15s;
}
.zb-quiz-a:focus { border-color: #056de8; box-shadow: 0 0 0 3px rgba(5, 109, 232, .1); }
.zb-quiz-a::placeholder { color: #b3bac6; }
.zb-quiz-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.zb-quiz-submit {
  background: #056de8; color: #fff; border: 0; border-radius: 8px;
  padding: 7px 22px; font-size: 13px; line-height: 1.4; cursor: pointer;
}
.zb-quiz-submit:hover { background: #0358bd; }
.zb-quiz-verdict { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.zb-quiz-verdict.v-correct { color: #3aa655; }
.zb-quiz-verdict.v-partial { color: #d67a27; }
.zb-quiz-verdict.v-wrong { color: #c33; }
.zb-quiz-feedback { font-size: 13px; line-height: 1.7; color: #444; }
.zb-quiz-again { margin-top: 8px; background: none; border: 1px solid #e0e5ee; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: #666; }
/* 每周复盘（计划书第 3 条）：原学习中心里的图谱/诊断在这里作为复盘卡片的展开详情。 */
.zb-tab { padding: 8px 9px; }
.zb-tab .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f5222d; margin-left: 4px; vertical-align: top; }
.zb-rev-card { border: 1px solid #e7e7e7; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.zb-rev-big { font-size: 22px; font-weight: 700; color: #056de8; }
.zb-rev-gaps { margin-top: 8px; padding: 8px 10px; background: #f7f9fc; border-radius: 8px; font-size: 13px; line-height: 1.8; }
.zb-rev-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 6px 8px; border-radius: 8px; }
.zb-rev-item.gap { background: #fff8ef; }
.zb-rev-item .mastery { margin-left: auto; font-size: 11px; color: #8590a6; }
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
    // 打开复盘 tab 视为「已看过」：清角标，本周不再提醒。
    if (name === 'review') {
      ackReview();
      tabs.querySelector('[data-tab="review"] .dot')?.remove();
    }
    body.replaceChildren();
    if (name === 'tail') return renderTailTab(body, badge);
    if (name === 'stuck') return renderStuckTab(body);
    if (name === 'quiz') return renderQuizTab(body);
    if (name === 'review') return renderReviewTab(body);
    if (name === 'data') return renderDataTab(body);
    if (name === 'profile') return renderProfileTab(body);
  };

  for (const [name, label] of [['tail', '我的短尾巴'], ['stuck', '本篇卡点'], ['quiz', '看山提问'], ['review', '每周复盘'], ['data', '数据控制']]) {
    const tabBtn = el('button', { class: 'zb-tab', dataset: { tab: name }, text: label });
    if (name === 'review' && hasUnseenReview()) tabBtn.appendChild(el('span', { class: 'dot' }));
    tabBtn.addEventListener('click', () => renderTab(name));
    tabs.appendChild(tabBtn);
  }

  root.append(
    el('div', { class: 'zb-mask', onclick: closeSidebar }),
    el('div', { class: 'zb-panel' }, [
      el('div', { class: 'zb-head' }, [
        el('img', { src: assetUrl('kanshan/wave.gif'), alt: '看山' }),
        el('span', { class: 't', text: '知伴 · 侧栏' }),
        badge,
        el('button', { class: 'zb-profile-btn', text: '个人中心', onclick: openProfile }),
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

// 个人中心是独立页面（不再作为侧栏 tab）：插件内交给 background 开新标签页扩展页；
// demo 站没有扩展环境，退回站内 #/profile 路由。
function openProfile() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'zb-open-tab', url: chrome.runtime.getURL('profile.html') });
    return;
  }
  navigate('/profile');
}

export function closeSidebar() {
  if (!open) return;
  open = false;
  host?.remove();
  host = null;
  runtime.emit('sidebar:closed');
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

// 卡点热力 tab（改造方案 §4.3）：本篇读者卡得最多的 3 个词，点一下跳回原文那一段。
// 数据来源如实标注（§4.5 / 验收 §七-6）：seed 标「演示环境数据」，现场上报标「你的上报」，
// 两类叠加时同时标出——不把演示数据冒充成真实统计。
async function renderStuckTab(body) {
  const page = runtime.page;
  if (!page) {
    body.appendChild(el('div', { text: '打开一篇回答后，这里会显示这篇的读者卡点。' }));
    return;
  }
  const marks = await store.getStuckMarks(page.articleId);
  const list = mergeStuck(page.articleId, marks, 3);
  if (!list.length) {
    body.appendChild(el('div', { text: '这篇还没有读者卡点数据。' }));
    return;
  }
  body.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:8px', text: '读者卡得最多的 3 个词，点一下跳回原文那一段。' }));
  for (const s of list) {
    const item = el('div', { class: 'zb-map-item', style: 'cursor:pointer;align-items:flex-start' }, [
      el('span', { class: 'dot', style: 'margin-top:5px' }),
      el('div', {}, [
        el('div', { text: s.concept }),
        el('div', { style: 'font-size:11px;color:#8590a6;margin-top:2px', text: `${formatCount(s.count)} 人也卡在这 · ${stuckSourceLabel(s)}` }),
      ]),
    ]);
    item.addEventListener('click', () => jumpToAnchor({ ...s, text: s.concept }, page));
    body.appendChild(item);
  }
}

// 复盘 tab（计划书第 3 条）：图谱/诊断的展开详情，数据全部来自本地概念记录，零接口依赖。
async function renderReviewTab(body) {
  let r = null;
  try { r = await computeWeeklyReview(); } catch { /* 读不到就当没数据 */ }
  if (!r) { body.appendChild(el('div', { text: '复盘数据读不出来，稍后再试。' })); return; }
  if (r.total === 0) {
    body.appendChild(el('div', { style: 'font-size:13px;line-height:1.9;color:#444', text: '还没有可复盘的概念。读文章时选中不懂的词问一下，这里会自己攒起来——不用你专门来打开这个页面。' }));
    return;
  }
  const passed = r.total - r.stalledCount;
  const pct = Math.round((r.masteryRate || 0) * 100);
  body.appendChild(el('div', { class: 'zb-rev-card' }, [
    el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:6px', text: `距上次复盘 ${r.daysSince} 天` }),
    el('div', { html: `<span class="zb-rev-big">${r.total}</span> 个概念 · 走过 ${passed} 个 · 掌握率 ${pct}%` }),
    el('div', { class: 'zb-rev-gaps', text: `最该补的 3 个：${r.topGaps.join(' / ') || '暂无'}` }),
  ]));
  const concepts = await store.listConcepts();
  const label = { unvisited: '还没走过', fuzzy: '有点模糊', passed: '已走过' };
  const gaps = new Set(r.topGaps);
  body.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin:10px 0 6px', text: '你的概念清单（高亮 = 最该补）' }));
  for (const c of concepts) {
    body.appendChild(el('div', { class: `zb-rev-item${gaps.has(c.name) ? ' gap' : ''}` }, [
      el('span', { text: c.name }),
      el('span', { class: 'mastery', text: label[c.mastery] || label.unvisited }),
    ]));
  }
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


