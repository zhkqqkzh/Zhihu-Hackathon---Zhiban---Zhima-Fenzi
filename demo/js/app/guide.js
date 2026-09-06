// 前置知识导读（功能 6 / §10.6 缺口检测 / §18.2 开场）。
// 本篇已展开 3 个概念后触发生成：
//   《读这篇回答前，你可能需要先搞懂这 N 件事》
//   每个概念 = 一句话解释 + 它在原文里那句话 + 站内高赞回答链接
//   ⚠️ 你可能还缺、但没问到的一环：XXX（缺口只取 Top 1，§11.8）
// 技术边界（§四-6）：官方接口无写入能力，发布为流程模拟：生成 → 编辑 → 署名 → 复制 → 自行发布。

import { el, toast } from './ui.js';
import * as store from './store.js';
import { api, zhihuSearchUrl } from './api.js';
import { buildEdges, detectGap } from '../core/graph.js';
import { ARTICLE_BY_ID } from '../data/articles.js';
import { navigate } from './router.js';

const TRIGGER_COUNT = 3;

// 生成并保存导读；返回 guide 对象
export async function buildGuide(articleId) {
  const art = await store.getArticleRecord(articleId);
  if (!art || art.expandedConcepts.length === 0) return null;
  const concepts = await store.listConcepts();
  const whitelist = await store.allPrescanConceptNames();
  const edges = buildEdges(concepts, whitelist);
  const gap = detectGap(concepts, edges);

  const items = [];
  for (const name of art.expandedConcepts) {
    const rec = await store.getConceptRecord(name);
    if (!rec) continue;
    let link = rec.links?.[0]?.url || '';
    if (!link) {
      const cached = await store.getLinkCache(name);
      const searchRes = cached?.items?.length
        ? cached
        : await api.search({ query: name }).then((r) => ({ items: r?.items || [] })).catch(() => ({ items: [] }));
      const items2 = (searchRes.items || []).map((it) => ({
        title: it.title, author: it.author, voteupCount: it.voteupCount,
        url: it.url || zhihuSearchUrl(name),
      }));
      await store.saveLinkCache(name, { items: items2, oneLiner: rec.definition });
      link = items2[0]?.url || zhihuSearchUrl(name);
    }
    items.push({ name, definition: rec.definition, quote: rec.quote, link });
  }
  const guide = {
    articleId,
    title: ARTICLE_BY_ID.get(articleId)?.title || art.title || '',
    items,
    gap,
    createdAt: Date.now(),
  };
  await store.saveGuide(articleId, guide);
  return guide;
}

// 本篇 ≥3 概念时触发（popup.js 每次展开后调用）
export async function getGuideTrigger(articleId) {
  const art = await store.getArticleRecord(articleId);
  if (!art || art.expandedConcepts.length < TRIGGER_COUNT) return null;
  const existing = await store.getGuide(articleId);
  if (existing) return existing;
  const guide = await buildGuide(articleId);
  if (guide) {
    toast('看山：你已经在这一篇问了 3 个概念。导读长出来了——去改一改，署上你的名。', 5200);
  }
  return guide;
}

// 页面：# /guide/:id —— 导读编辑 + 署名发布（模拟）
export async function renderGuide(app, articleId) {
  const guide = await store.getGuide(articleId);
  if (!guide) {
    app.replaceChildren(el('div', { class: 'QuestionHeader' }, [
      el('h1', { text: '导读还没生成' }),
      el('p', { style: 'color:#8590a6;margin:8px 0', text: `在这篇回答里展开 ${TRIGGER_COUNT} 个概念后，导读会自动生成。` }),
      el('button', { class: 'zb-btn', onclick: () => navigate(`/article/${articleId}`), text: '去读这篇 →' }),
    ]));
    return;
  }
  const wrap = el('div', { class: 'HomeGuide' });
  wrap.append(el('h2', { text: `《读「${guide.title}」前，你可能需要先搞懂这 ${guide.items.length} 件事》` }));
  wrap.append(el('div', { class: 'lead', text: '主体内容来自原文引用与知乎站内优质回答，模型只做串联。发布时默认带「AI 辅助」标签。' }));

  const listBox = el('div', {});
  for (const item of guide.items) {
    const ta = el('textarea', { class: 'guide-ta', rows: '3', text: `① ${item.name} —— ${item.definition}\n　原文里这句：「${item.quote}」` });
    listBox.appendChild(el('div', { class: 'GuideItem' }, [
      el('div', { class: 'gi-head', text: item.name }),
      ta,
      item.link ? el('a', { class: 'gi-link', href: item.link, target: '_blank', rel: 'noopener', text: '→ 站内高赞回答' }) : null,
    ]));
  }
  if (guide.gap) {
    listBox.appendChild(el('div', { class: 'GuideGap', text: `⚠️ 你可能还缺、但没问到的一环：${guide.gap}` }));
  }
  wrap.appendChild(listBox);

  const nameInput = el('input', { class: 'guide-name', placeholder: '署上你的名（知乎昵称）', value: '' });
  const publishBtn = el('button', {
    class: 'zb-btn', text: '复制到剪贴板，去知乎发布（流程模拟）',
    onclick: async () => {
      const parts = [`《读「${guide.title}」前，你可能需要先搞懂这 ${guide.items.length} 件事》`, ''];
      for (const ta of listBox.querySelectorAll('textarea')) parts.push(ta.value, '');
      if (guide.gap) parts.push(`⚠️ 你可能还缺、但没问到的一环：${guide.gap}`, '');
      const name = nameInput.value.trim();
      parts.push(`—— 由 ${name || '一位读者'} 整理 · AI 辅助`);
      try {
        await navigator.clipboard.writeText(parts.join('\n'));
        toast('已复制。官方接口暂不支持直接发布：在知乎粘贴、修改、署你的名，发出去。被卡住的读者，成了下一篇回答的作者。', 6500);
      } catch {
        toast('复制失败，请手动全选复制。', 3000);
      }
    },
  });
  wrap.appendChild(el('div', { style: 'margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
    nameInput, publishBtn,
  ]));
  wrap.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-top:10px', text: '技术边界：官方接口仅提供内容读取，发布为流程模拟（生成 → 编辑 → 署名 → 复制 → 用户自行发布）。' }));
  app.replaceChildren(wrap);
}
