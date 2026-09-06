// Learning Hub（§新功能：学习总结 + 缺口诊断）。
// 路由 #/hub；三个区块竖向排列：
//   区块1 思维导图（力导向图，绿=学过多篇 / 黄=学过一篇 / 红=缺口前置；点击弹卡，可回原文）
//   区块2 诊断报告（纯前端规则：主题统计 + 薄弱 TOP3 + 建议补 TOP3，文案可选大模型润色、失败降级）
//   区块3 最近学习时间轴（最近 20 次学习卡片，点击回原文锚点并高亮）
// 数据全部来自本地 store（IndexedDB/localStorage 适配层），不上传服务器。

import { el } from './ui.js';
import * as store from './store.js';
import { navigate } from './router.js';
import { requestAnchorJump } from './runtime.js';
import { buildHubGraph, computeDiagnosis } from '../core/graph.js';
import { ARTICLE_BY_ID } from '../data/articles.js';

const CY_SOURCES = [
  'https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js',
  'https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.min.js',
];
let cyPromise = null;

// 动态加载 Cytoscape（双 CDN 源，失败返回 null → UI 降级）
function loadCytoscape() {
  if (cyPromise) return cyPromise;
  cyPromise = (async () => {
    if (window.cytoscape) return window.cytoscape;
    for (const src of CY_SOURCES) {
      const ok = await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
        setTimeout(() => resolve(!!window.cytoscape), 9000);
      });
      if (ok && window.cytoscape) return window.cytoscape;
    }
    return null;
  })();
  return cyPromise;
}

// 概念被学过的文章数（去重）——节点颜色依据（count 由 core/graph.buildHubGraph 计算）
function seenAtOf(c) {
  const ats = [
    ...(Array.isArray(c.anchors) ? c.anchors.map((a) => a.at) : []),
    c.firstSource?.at || 0,
    c.firstAskedAt || 0,
  ].filter(Boolean);
  return ats.length ? Math.max(...ats) : Date.now();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function articleTitle(id) {
  return ARTICLE_BY_ID.get(id)?.title || id || '原文';
}

// 跳回原文锚点（卖点 1：scrollIntoView + 高亮）
export function gotoAnchor(articleId, anchor) {
  if (!articleId) return;
  if (anchor && anchor.paragraphIndex != null) {
    requestAnchorJump({ articleId, anchor });
  }
  navigate(`/article/${articleId}`);
}

// ============ 区块1：思维导图 ============
function renderGraphSection(concepts, root) {
  const sec = el('div', { class: 'hub-section' }, [
    el('div', { style: 'display:flex;align-items:baseline;justify-content:space-between' }, [
      el('div', {}, [
        el('h2', { text: '🧠 思维导图' }),
        el('div', { class: 'hint', text: '你学过的概念与它们之间的依赖。红色是「缺口」——某概念需要它，但你还没学过。' }),
      ]),
      el('button', { class: 'hub-refresh', text: '刷新', onclick: () => renderHub(root) }),
    ]),
    el('div', { class: 'hub-legend' }, [
      el('span', {}, [el('i', { style: 'background:#3aa655' }), '学过 ≥2 篇']),
      el('span', {}, [el('i', { style: 'background:#e6b83e' }), '学过 1 篇']),
      el('span', {}, [el('i', { style: 'background:#d93025' }), '缺口（还没学）']),
      el('span', {}, [el('i', { style: 'background:#9aa7b8;border-radius:0;width:16px;height:2px;vertical-align:middle' }), '依赖边（前置 → 概念）']),
    ]),
    el('div', { class: 'hub-graph', style: 'position:relative' }),
  ]);
  root.appendChild(sec);
  const graphBox = sec.lastChild;
  if (concepts.length === 0) {
    graphBox.replaceChildren(el('div', { class: 'hub-empty', text: '还没有学过的概念。回到文章页划选一段文字，点「问知伴」，这里就会长出你的知识图谱。' }));
    return;
  }

  const g = buildHubGraph(concepts);
  loadCytoscape().then((cytoscape) => {
    if (cytoscape) renderCytoscape(cytoscape, g, graphBox, concepts);
    else renderGraphFallback(g, graphBox, concepts);
  });
}

function nodeColor(n) {
  if (n.gap) return '#d93025';   // 缺口：红
  if (n.count >= 2) return '#3aa655'; // 学过≥2篇：绿
  return '#e6b83e';              // 学过1篇：黄
}

function renderCytoscape(cytoscape, g, box, concepts) {
  const recByName = new Map(concepts.map((c) => [c.name, c]));
  box.replaceChildren();
  const cy = cytoscape({
    container: box,
    elements: [
      ...g.nodes.map((n) => ({
        data: {
          id: n.id, label: n.label, color: nodeColor(n), gap: !!n.gap,
          count: n.count || 0, dependedBy: n.dependedBy || [], prereqs: n.prereqs || [],
        },
      })),
      ...g.edges.map((e) => ({ data: { id: `${e.source}__${e.target}`, source: e.source, target: e.target } })),
    ],
    style: [
      { selector: 'node', style: { 'background-color': 'data(color)', label: 'data(label)', color: '#333', 'font-size': '11px', 'text-valign': 'bottom', 'text-margin-y': 4, width: 26, height: 26, 'border-width': 0 } },
      { selector: 'node[?gap]', style: { 'border-width': 2.5, 'border-color': '#8f1d18', 'border-style': 'dashed', 'background-opacity': 0.92, color: '#8f1d18', 'font-weight': 'bold' } },
      { selector: 'edge', style: { width: 1.4, 'line-color': '#c8d0da', 'target-arrow-color': '#c8d0da', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
    ],
    layout: { name: 'cose', animate: false, padding: 24, nodeRepulsion: () => 9000, idealEdgeLength: () => 90 },
    wheelSensitivity: 0.2,
    minZoom: 0.3, maxZoom: 2.5,
  });
  // 暴露实例（调试 / e2e / 后续扩展可用；不影响 UI）
  box._cy = cy;

  let cardEl = null;
  const hideCard = () => { cardEl?.remove(); cardEl = null; };

  cy.on('tap', 'node', (ev) => {
    hideCard();
    const d = ev.target.data();
    const pos = ev.target.renderedPosition();
    const concept = g.nodes.find((n) => n.id === d.id);
    if (!concept) return;
    // 弹卡挂到 body，脱离 cytoscape 容器事件域（否则容器 tap 会吞掉卡片按钮的 click）
    const vp = cy.container().getBoundingClientRect();
    cardEl = makeConceptCard(concept, recByName.get(d.id) || null, {
      x: vp.left + pos.x,
      y: vp.top + pos.y,
    });
    document.body.appendChild(cardEl);
    // 防越界（相对视口）
    const r = cardEl.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) cardEl.style.left = `${Math.max(8, r.left - r.width - 8)}px`;
    if (r.bottom > window.innerHeight - 8) cardEl.style.top = `${Math.max(8, r.top - r.height - 8)}px`;
    ev.cy.$(':selected').unselect();
  });
  cy.on('tap', (ev) => { if (ev.target === cy) hideCard(); });
  // 缩放图谱时收起卡片（页面滚动由模块级 scrollHider 统一处理）
  cy.on('pan zoom', hideCard);
}

// 页面滚动时收起已弹出的图谱卡片（模块级单监听，防多次渲染累积）
let pageScrollHiderBound = false;
function bindPageScrollHider() {
  if (pageScrollHiderBound) return;
  pageScrollHiderBound = true;
  window.addEventListener('scroll', () => {
    for (const c of document.querySelectorAll('.hub-card')) c.remove();
  }, { passive: true });
}
bindPageScrollHider();

// 节点卡片（点击弹出）：定义 + 学过的文章数 + 回原文按钮 / 缺口提示。
// 挂 body，pos 为视口坐标。
function makeConceptCard(node, record, pos) {
  const gap = !!node.gap;
  const wrap = el('div', {
    class: 'hub-card',
    style: `left:${pos.x}px;top:${pos.y}px;position:fixed;z-index:9999`,
    onmousedown: (e) => e.stopPropagation(), // 防 cytoscape 容器抢事件
    onclick: (e) => e.stopPropagation(),
  });
  const closeCard = () => wrap.remove();
  if (gap) {
    const dep = (node.dependedBy || []).slice(0, 3);
    wrap.append(
      el('h3', { text: `「${node.label}」` }),
      el('div', { class: 'gap', text: `缺口：你还没学过 ${node.label}，但 ${dep.length ? dep.map((x) => `「${x}」`).join('、') : '有概念'} 需要它作为前置。先去了解一下吧。` }),
    );
    if (dep.length) {
      wrap.append(el('div', { class: 'meta', text: `被 ${dep.length} 个已学概念依赖` }));
    }
  } else {
    const cnt = node.count || 0;
    const def = record?.definition || '（暂无定义，选中后由知伴解释）';
    wrap.append(
      el('h3', { text: node.label }),
      el('div', { class: 'def', text: def }),
      el('div', { class: 'meta', text: `在 ${cnt} 篇文章学过` }),
    );
    // 找锚点：优先最新一次
    const anchors = record?.anchors || [];
    if (anchors.length && anchors[anchors.length - 1].articleId) {
      wrap.append(el('button', {
        class: 'btn', text: '回原文看看 →',
        onclick: (e) => {
          e.stopPropagation();
          gotoAnchor(anchors[anchors.length - 1].articleId, anchors[anchors.length - 1]);
        },
      }));
    }
  }
  const close = el('div', { style: 'position:absolute;top:6px;right:10px;cursor:pointer;color:#8590a6', text: '×', onclick: (e) => { e.stopPropagation(); closeCard(); } });
  wrap.insertBefore(close, wrap.firstChild);
  return wrap;
}

// Cytoscape 加载失败时降级：静态分层列表（保底可交互：回原文仍可用）
function renderGraphFallback(g, box, concepts) {
  const recByName = new Map(concepts.map((c) => [c.name, c]));
  const learned = g.nodes.filter((n) => !n.gap);
  const gaps = g.nodes.filter((n) => n.gap);
  const parts = [];
  if (learned.length) {
    parts.push(el('div', { style: 'margin-bottom:6px;font-size:13px;color:#444' }, [
      el('b', { text: `已学概念（${learned.length}）` }), el('span', { text: '：图谱库加载失败，已降级为列表' }),
    ]));
    for (const n of learned) {
      const rec = recByName.get(n.id);
      parts.push(el('div', { class: 'tl-card', style: 'display:flex;align-items:center;gap:8px' }, [
        el('i', { style: `width:10px;height:10px;border-radius:50%;background:${nodeColor(n)};flex:none;display:inline-block` }),
        el('span', { class: 't', text: n.label }),
        el('span', { class: 's', text: `· ${n.count} 篇` }),
        (rec?.anchors?.length && rec.anchors[rec.anchors.length - 1].articleId)
          ? el('span', { class: 's', style: 'margin-left:auto;color:#056de8;cursor:pointer', text: '回原文 →', onclick: (e) => { e.stopPropagation(); gotoAnchor(rec.anchors[rec.anchors.length - 1].articleId, rec.anchors[rec.anchors.length - 1]); } })
          : null,
      ]));
    }
  }
  if (gaps.length) {
    parts.push(el('div', { style: 'margin:10px 0 6px;font-size:13px;color:#b3261e' }, [
      el('b', { text: `缺口前置（${gaps.length}）` }), el('span', { text: '：被依赖但还没学' }),
    ]));
    for (const n of gaps) {
      parts.push(el('div', { class: 'tl-card', style: 'cursor:default;display:flex;align-items:center;gap:8px;border-color:#ffd8d6' }, [
        el('i', { style: 'width:10px;height:10px;border-radius:50%;background:#d93025;flex:none;display:inline-block' }),
        el('span', { class: 't', text: n.label }),
        el('span', { class: 's', text: `· 被 ${(n.dependedBy || []).length} 个概念依赖` }),
      ]));
    }
  }
  box.replaceChildren(el('div', {}, parts));
}

// ============ 区块2：诊断报告 ============
async function renderDiagnosisSection(concepts, root) {
  const sec = el('div', { class: 'hub-section' }, [
    el('h2', { text: '📋 诊断报告' }),
    el('div', { class: 'hint', text: '纯前端规则统计，不消耗模型额度。把统计喂给大模型润色是可选项，失败会自动降级为规则文案。' }),
  ]);
  root.appendChild(sec);

  if (concepts.length === 0) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '学习数据为空，暂无诊断。' }));
    return;
  }

  const diag = computeDiagnosis(concepts);
  // 诊断一：一句话总结（规则文案；可选 LLM 润色增强）
  const summaryBox = el('div', { class: 'diag-summary', text: diag.summary });
  sec.appendChild(summaryBox);

  // 润色按钮（可选项）：把统计喂给后端已有 explain/自定义？没有润色接口 → 纯规则文案已就绪。
  // 需求："汇总文案可选调一次大模型润色，失败降级纯规则"。后端不新增接口（复用红线），
  // 因此此处预留扩展点：window.__zhibanPolish 若被注入（测试/线上增强），则调用之，失败回退。
  tryPolishSummary(diag, summaryBox);

  const grid = el('div', { class: 'diag-grid' }, []);
  // 薄弱主题 TOP3
  const weakCol = el('div', { class: 'diag-col', style: 'grid-column: span 2' }, [
    el('h3', { text: '📉 主题掌握度（薄弱主题已标橙）' }),
    el('div', {}, diag.topicList.map((t) => {
      const pct = Math.round(t.ratio * 100);
      const weak = t.ratio < 0.5;
      return el('div', { class: 'diag-topic' + (weak ? ' weak' : '') }, [
        el('span', { style: 'width:110px;flex:none', text: t.name }),
        el('span', { class: 'bar' }, [el('i', { style: `width:${pct}%` })]),
        el('span', { class: 'pct', text: `${t.learned}/${t.total}` }),
      ]);
    })),
  ]);
  // 建议补 TOP3（缺口）
  const sugCol = el('div', { class: 'diag-col' }, [
    el('h3', { text: '🎯 建议优先补' }),
    diag.suggestedGaps.length
      ? el('div', {}, diag.suggestedGaps.map((x) => el('span', { class: 'diag-chip', text: x })))
      : el('div', { class: 'hint', style: 'margin:0', text: '没有明显缺口，学得很扎实 👍' }),
    el('h3', { text: '📍 薄弱主题', style: 'margin-top:14px' }),
    diag.weakTopics.length
      ? el('div', {}, diag.weakTopics.map((x) => el('span', { class: 'diag-chip', text: x.name })))
      : el('div', { class: 'hint', style: 'margin:0', text: '无薄弱主题，继续保持' }),
  ]);
  grid.append(weakCol, sugCol);
  sec.appendChild(grid);
}

// 汇总文案润色（可选，失败静默降级为规则文案）
async function tryPolishSummary(diag, box) {
  const fn = window.__zhibanPolish;
  if (typeof fn !== 'function') return; // 无注入 → 纯规则文案
  try {
    const text = await fn({
      totalLearned: diag.topicList.reduce((s, t) => s + t.learned, 0),
      weakTopics: diag.weakTopics.map((t) => t.name),
      suggestedGaps: diag.suggestedGaps,
    });
    if (text) box.textContent = text;
  } catch { /* 失败降级：保留规则文案 */ }
}

// ============ 区块3：最近学习时间轴 ============
function renderTimelineSection(concepts, root) {
  const sec = el('div', { class: 'hub-section' }, [
    el('h2', { text: '🕐 最近学习' }),
    el('div', { class: 'hint', text: '按学习时间倒序，最近 20 条。点击卡片回到原文位置。' }),
  ]);
  root.appendChild(sec);

  if (concepts.length === 0) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还没有学习记录。' }));
    return;
  }
  // 事件：一个概念可多次学习 → 从 anchors / firstSource 摊平成事件
  const events = [];
  for (const c of concepts) {
    const anchors = Array.isArray(c.anchors) ? c.anchors : [];
    if (anchors.length) {
      for (const a of anchors) {
        events.push({ concept: c, at: a.at || 0, anchor: a, articleId: a.articleId || c.firstSource?.articleId || '' });
      }
    } else {
      events.push({
        concept: c, at: seenAtOf(c), anchor: null,
        articleId: c.firstSource?.articleId || c.articleId || '',
      });
    }
  }
  events.sort((a, b) => b.at - a.at);
  const recent = events.slice(0, 20);
  const list = el('div', { class: 'tl-list' }, []);
  for (const ev of recent) {
    const c = ev.concept;
    const card = el('div', {
      class: 'tl-card',
      onclick: () => gotoAnchor(ev.articleId || c.firstSource?.articleId, ev.anchor),
    }, [
      el('div', { class: 't', text: c.name }),
      el('div', { class: 's' }, [
        el('span', { text: fmtTime(ev.at) }),
        el('span', { text: ' · ' }),
        el('span', { text: ev.articleId ? `《${articleTitle(ev.articleId)}》` : '（原文链接缺失）' }),
        c.definition ? el('span', { text: ` · ${c.definition.slice(0, 40)}${c.definition.length > 40 ? '…' : ''}` }) : null,
      ]),
    ]);
    list.appendChild(card);
  }
  sec.appendChild(list);
}

// ============ 页面装配 ============
export async function renderHub(app) {
  const concepts = await store.listConcepts();
  const wrap = el('div', { class: 'hub-layout' }, []);
  // Hero
  wrap.appendChild(el('div', { class: 'hub-hero' }, [
    el('h1', { text: '🧭 学习中心' }),
    el('div', { class: 'sub', text: '把读过的概念积累成图谱 —— 学习总结 + 缺口诊断。数据只存本浏览器。' }),
  ]));
  // 区块1 图谱
  renderGraphSection(concepts, wrap);
  // 区块2 诊断
  await renderDiagnosisSection(concepts, wrap);
  // 区块3 时间轴
  renderTimelineSection(concepts, wrap);
  app.replaceChildren(wrap);
}
