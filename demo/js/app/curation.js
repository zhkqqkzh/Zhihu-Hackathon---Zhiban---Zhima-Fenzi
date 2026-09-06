// 看山策展（功能 10 / §10.11）：读 3 篇以上同主题回答，串成一份《我的机器学习入门路径》。
// 与导读的区别：导读是单篇的，策展是跨篇的。
// 聚类：Jaccard 相似度超阈值归同主题；排序：依赖拓扑序，无法确定时用首次阅读时间。

import { el } from './ui.js';
import * as store from './store.js';
import { clusterArticles, sortClusterForCuration, buildEdges } from '../core/graph.js';
import { ARTICLE_BY_ID } from '../data/articles.js';

export async function renderCuration(container) {
  const arts = await store.listArticleRecords();
  const concepts = await store.listConcepts();
  const whitelist = await store.allPrescanConceptNames();
  const edges = buildEdges(concepts, whitelist);

  const artsForCluster = [];
  for (const a of arts) {
    const art = ARTICLE_BY_ID.get(a.id);
    if (!art) continue;
    // 概念集 = 预扫描词表 ∪ 本篇已展开（预扫描是"本篇涉及哪些概念"的完整信号；
    // 前置型文章与后继文章交集天然小，阈值取 0.1 做单链聚类，让它也能挂进主题）
    const prescan = await store.getPrescan(a.id);
    const conceptSet = [...new Set([...(prescan?.concepts || []), ...(a.expandedConcepts || [])])];
    artsForCluster.push({ id: a.id, title: art.title, concepts: conceptSet, firstReadAt: a.firstReadAt });
  }
  const clusters = clusterArticles(artsForCluster, 0.1).filter((c) => c.articles.length >= 3);

  container.replaceChildren();
  if (clusters.length === 0) {
    container.appendChild(el('div', { style: 'font-size:13px;color:#8590a6;line-height:1.8', text:
      '读完 3 篇以上同主题回答，我会帮你把这一路串成一份《入门路径》，按依赖顺序排列。现在还差几篇。' }));
    return;
  }
  for (const cl of clusters) {
    const sorted = sortClusterForCuration(cl, edges);
    container.appendChild(el('h2', { style: 'font-size:18px;margin:12px 0 8px', text: '《我的机器学习入门路径》' }));
    container.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:8px', text: '按知识依赖顺序排好的——这是你自己读出来的路径，不是我预设的。' }));
    sorted.forEach((a, i) => {
      const card = el('div', { class: 'ArticleCard', style: 'margin-bottom:8px', onclick: () => { location.hash = `/article/${a.id}`; } }, [
        el('h3', { text: `${i + 1}. ${a.title}` }),
        el('div', { class: 'meta', text: a.concepts.length ? `你在这里问过：${a.concepts.join('、')}` : '读过的回答' }),
      ]);
      container.appendChild(card);
    });
  }
}
