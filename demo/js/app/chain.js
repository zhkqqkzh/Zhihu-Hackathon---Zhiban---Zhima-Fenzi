// 去看山（功能 5 / §10.6 / §10.11）：跨篇依赖链。
// 方向是知识依赖（得先懂导数才懂梯度），不是你读的先后顺序。
// 每个概念是一个「营地」，按掌握状态着色；终点是那座还没登上的山。
// 边规则（§11.8 / §11.5）：概念表白名单过滤；被 ≥2 篇验证的边画实线。

import { el } from './ui.js';
import * as store from './store.js';
import { buildEdges, topoOrder } from '../core/graph.js';
import { ARTICLE_BY_ID } from '../data/articles.js';

const MASTERY_COLOR = {
  unvisited: '#d3d9e3', // 还没走过
  fuzzy: '#f0b35c',     // 有点模糊
  passed: '#3aa655',    // 已走过
};

export async function renderChain(body) {
  const concepts = await store.listConcepts();
  const prescanWhitelist = await store.allPrescanConceptNames();
  const edges = buildEdges(concepts, prescanWhitelist);
  const order = topoOrder(concepts, edges);
  const masteryOf = new Map(concepts.map((c) => [c.name, c.mastery]));

  if (order.length === 0) {
    body.appendChild(el('div', { style: 'font-size:13px;color:#8590a6;line-height:1.8', html:
      '这条山路还没有营地。<br>在不同回答里问过的概念，会沿着前置知识连成一个有方向的链：<br><code>导数 → 偏导数 → 梯度 → 梯度下降 → 反向传播</code><br>方向是知识依赖，不是你读的顺序。去问第一个概念吧。' }));
    return;
  }

  const solid = edges.filter((e) => e.visible);
  const pendingCount = edges.filter((e) => e.pending).length;

  body.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:10px', text:
    `${order.length} 个营地 · ${solid.length} 段已验证的山路${pendingCount ? `（${pendingCount} 段待激活：等更多文章覆盖到）` : ''}` }));

  const path = el('div', { class: 'zb-chain' });
  order.forEach((name, i) => {
    const m = masteryOf.get(name) || 'unvisited';
    const src = concepts.find((c) => c.name === name);
    const camp = el('div', { class: 'zb-camp' }, [
      el('span', { class: 'zb-camp-dot', style: `background:${MASTERY_COLOR[m]}` }),
      el('span', { text: name }),
      el('span', { class: 'zb-camp-state', text: m === 'passed' ? '已走过' : m === 'fuzzy' ? '有点模糊' : '还没走过' }),
    ]);
    if (src?.firstSource?.articleId && ARTICLE_BY_ID.has(src.firstSource.articleId)) {
      camp.style.cursor = 'pointer';
      camp.title = '回到第一次问它的那篇';
      camp.addEventListener('click', () => { location.hash = `/article/${src.firstSource.articleId}`; });
    }
    path.appendChild(camp);
    if (i < order.length - 1) {
      const verified = solid.some((e) => e.from === name && e.to === order[i + 1]);
      path.appendChild(el('div', { class: `zb-arrow${verified ? ' solid' : ''}`, text: verified ? '↓ 已验证' : '↓' }));
    }
  });
  body.appendChild(path);

  // 终点：那座还没登上的山
  const last = order[order.length - 1];
  const lastMastery = masteryOf.get(last);
  body.appendChild(el('div', { class: 'zb-mountain', text:
    lastMastery === 'passed'
      ? `⛰️ 「${last}」营地已走过——但你心里知道，山外还有山。`
      : `⛰️ 那座还没登上的山：${last}。走完所有营地，就轮到你写导读给别人指路了。` }));
}
