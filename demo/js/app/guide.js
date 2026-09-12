// 前置知识导读（功能 6 / §10.6 缺口检测 / §18.2 开场）。
// 本篇已展开 3 个概念后触发生成：
//   《读这篇回答前，你可能需要先搞懂这 N 件事》
//   每个概念 = 一句话解释 + 它在原文里那句话 + 站内高赞回答链接
//   ⚠️ 你可能还缺、但没问到的一环：XXX（缺口只取 Top 1，§11.8）
// 创作出口（计划书第 4/7 条）：导读可「存为我的笔记卡片」并导出 .md，本地存储、零接口依赖。

import { el, toast } from './ui.js';
import * as store from './store.js';
import { api, zhihuSearchUrl } from './api.js';
import { buildEdges, detectGap } from '../core/graph.js';
import { expandToSentence } from '../core/quote.js';
import { DEMO_SELECTORS } from '../core/selectors.js';
import { ARTICLE_BY_ID } from '../data/articles.js';
import { navigate } from './router.js';
import { saveNote, exportNote } from './notes.js';

const TRIGGER_COUNT = 3;

// 卡点概念可能没有概念记录（读者只标了「卡住」、没展开）：从原文里取出它所在的那一段话当引用，
// 定义留空由答主补——「前置说明草稿」的价值就在于让答主把这一句写出来。
function paragraphTexts(articleBody) {
  const box = el('div', { html: articleBody || '' });
  return [...box.querySelectorAll(DEMO_SELECTORS.paragraph)].map((p) => p.textContent.trim());
}

// 生成并保存导读；conceptNames 省略时取本篇已展开概念。
// 答主视角（§4.4）传入卡点 TOP3：{ concept, paragraphIndex } 或纯概念名都接受。
export async function buildGuide(articleId, conceptNames = null) {
  const art = await store.getArticleRecord(articleId);
  const names = conceptNames || art?.expandedConcepts || [];
  if (names.length === 0) return null;
  const concepts = await store.listConcepts();
  const whitelist = await store.allPrescanConceptNames();
  const edges = buildEdges(concepts, whitelist);
  const gap = detectGap(concepts, edges);

  const article = ARTICLE_BY_ID.get(articleId);
  const paragraphs = article ? paragraphTexts(article.body) : [];
  const items = [];
  for (const entry of names) {
    const name = typeof entry === 'string' ? entry : entry?.concept;
    if (!name) continue;
    const rec = await store.getConceptRecord(name);
    let quote = rec?.quote || '';
    if (!quote) {
      const idx = typeof entry === 'object' && entry ? entry.paragraphIndex : null;
      const para = idx != null && paragraphs[idx] ? paragraphs[idx] : paragraphs.find((t) => t.includes(name));
      if (para) quote = expandToSentence(para, para.indexOf(name), para.indexOf(name) + name.length);
    }
    let link = rec?.links?.[0]?.url || '';
    if (!link) {
      const cached = await store.getLinkCache(name);
      const searchRes = cached?.items?.length
        ? cached
        : await api.search({ query: name }).then((r) => ({ items: r?.items || [] })).catch(() => ({ items: [] }));
      const items2 = (searchRes.items || []).map((it) => ({
        title: it.title, author: it.author, voteupCount: it.voteupCount,
        url: it.url || zhihuSearchUrl(name),
      }));
      await store.saveLinkCache(name, { items: items2, oneLiner: rec?.definition || '' });
      link = items2[0]?.url || zhihuSearchUrl(name);
    }
    items.push({ name, definition: rec?.definition || '', quote, link });
  }
  const guide = {
    articleId,
    title: article?.title || art?.title || '',
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
    toast('看山：你已经在这一篇问了 3 个概念。导读长出来了——可以存成你自己的笔记卡片。', 5200);
  }
  return guide;
}

// 页面：# /guide/:id —— 导读笔记卡片（本地存 + 导出 .md）
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
  wrap.append(el('div', { class: 'lead', text: '主体内容来自原文引用与站内参考，模型只做串联。可以逐段改，改完存成你自己的笔记卡片。' }));

  const listBox = el('div', {});
  for (const item of guide.items) {
    // 空定义是答主视角的草稿（§4.4）：留一句提示，让答主自己补上读者卡住的那一句。
    const def = item.definition || '（读者常在这里卡住，补一句你的解释）';
    const ta = el('textarea', { class: 'guide-ta', rows: '3', text: `① ${item.name} —— ${def}\n　原文里这句：「${item.quote}」` });
    listBox.appendChild(el('div', { class: 'GuideItem' }, [
      el('div', { class: 'gi-head', text: item.name }),
      ta,
      item.link ? el('a', { class: 'gi-link', href: item.link, target: '_blank', rel: 'noopener', text: '→ 站内参考' }) : null,
    ]));
  }
  if (guide.gap) {
    listBox.appendChild(el('div', { class: 'GuideGap', text: `⚠️ 你可能还缺、但没问到的一环：${guide.gap}` }));
  }
  wrap.appendChild(listBox);

  // 收集当前编辑框内容 → 笔记对象；saved 由 store.saveNote 生成并复用，避免每点一次多一条。
  const art = await store.getArticleRecord(articleId);
  let saved = null;
  const collectNote = () => {
    const tas = [...listBox.querySelectorAll('textarea')];
    return {
      kind: 'guide',
      articleId,
      title: guide.title,
      url: art?.link || '',
      gap: guide.gap || '',
      createdAt: saved?.createdAt,
      id: saved?.id,
      items: guide.items.map((item, i) => ({ name: item.name, link: item.link, text: tas[i]?.value || '' })),
    };
  };

  const saveBtn = el('button', {
    class: 'zb-btn', text: '存为我的笔记卡片',
    onclick: async () => { saved = await saveNote(collectNote()); },
  });
  const exportBtn = el('button', {
    class: 'zb-btn', text: '导出 .md',
    onclick: async () => { saved = await exportNote(collectNote(), guide.title); },
  });
  wrap.appendChild(el('div', { style: 'margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
    saveBtn, exportBtn,
  ]));
  wrap.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-top:10px', text: '笔记只存在这个浏览器里，导出的是标准 Markdown 文件；知伴不上传你的正文，也不代你发布。' }));
  app.replaceChildren(wrap);
}
