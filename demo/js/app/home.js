// 页面：首页（§18.2 三秒定生死 / 改造方案 §4.1）。
// 首屏不再罗列功能，直接摆出真实困境：这篇回答有多少人赞同、多少人在同一段卡住、
// 卡住他们的是哪个词——数字全部取自文章数据与卡点数据，来源如实标注（验收 §七-6）。
// 洞察下面直接给这篇回答的卡点 TOP3，点一下跳回原文那一段。

import { ARTICLES, ARTICLE_BY_ID } from '../data/articles.js';
import { el } from './ui.js';
import { listGuides, getStuckMarks } from './store.js';
import { api } from './api.js';
import { navigate } from './router.js';
import { topStuckInsight, mergeStuck, formatCount, stuckSourceLabel } from '../core/stuck.js';
import { gotoAnchor } from './hub.js';

export async function renderHome(app) {
  const guides = await listGuides();
  const demoGuide = guides.find((g) => g.articleId === 'article-backprop');
  const parts = [];

  // §4.1 首屏洞察：聚焦 Demo 主推的那篇回答（卡点数据最全）。
  const focus = ARTICLES[0];
  const marks = await getStuckMarks(focus.id);
  const insight = topStuckInsight(focus.id, focus, marks);
  const topStuck = mergeStuck(focus.id, marks, 3);

  // §4.1 首屏洞察块先按本地数据渲染，社区聚合（问题 1）拿到后再原地补一次——
  // 不 await：SCF 冷启动时首屏不能被一个网络请求挂住。
  const insightBox = insight
    ? renderInsight(focus, insight, topStuck)
    : renderInsightFallback();

  parts.push(el('div', { class: 'HomeHero' }, [
    // §3.4 一句话主张替代旧 slogan：落点从「你看懂了」改到「你让所有人都少卡一次」。
    el('h1', { text: '知伴 · 你卡住的地方，也是所有人的卡点。' }),
    el('div', { class: 'sub', text: '读不懂，划一下，当场讲明白；这一划，也让下一个读到这里的人不再卡住。' }),
    insightBox,
    el('div', { class: 'ArticleList' }, ARTICLES.map((a) =>
      el('div', { class: 'ArticleCard', onclick: () => navigate(`/article/${a.id}`) }, [
        el('h3', { text: a.title }),
        el('div', { class: 'meta' }, [
          el('span', { text: `${a.author} · ${formatCount(a.voteupCount)} 赞同` }),
          el('span', { class: 'demo-tag', text: '示例数据' }),
        ]),
      ])
    )),
  ]));

  // P1：全文概念标记 + 每周复盘，都是零操作。
  parts.push(el('div', { class: 'HomeGuide' }, [
    el('h2', { text: '打开一篇回答，这件事就开始了' }),
    el('div', { class: 'lead', html:
      '<p>整篇里的概念会自动标出来——不用你逐个去问，也不用装成读懂了。</p>' +
      '<p>问过的概念只存在本地。隔一周再打开，它会主动告诉你：卡住了几个、最该补哪三个。你不用打开任何中心页面。</p>'
    }),
    el('button', { class: 'zb-btn', onclick: () => navigate('/article/article-backprop'), text: '随便挑一篇开始读 →' }),
  ]));

  // 导读示例（P2）：问过 3 个概念后自动长出来的样子，仅作展示。
  const guideBox = el('div', { class: 'HomeGuide' });
  guideBox.append(el('h2', { text: '示例：问过 3 个概念后自动长出来的导读' }));
  guideBox.append(
    el('div', { class: 'lead', html:
      '<p>这篇导读不是答主写的。</p>' +
      '<p>是一位读者读到这里卡住了，连着问了几个概念之后，知伴帮他整理的。</p>' +
      '<p>他改了几处，存成自己的笔记卡片，可以导出成 Markdown。下一个读到这篇回答的人，门槛直接降一半。</p>'
    }),
  );
  if (demoGuide) {
    guideBox.append(el('h2', { text: `《读「${ARTICLE_BY_ID.get(demoGuide.articleId)?.title || ''}」前，你可能需要先搞懂这 ${demoGuide.items.length} 件事》` }));
    for (const item of demoGuide.items) {
      guideBox.append(el('div', { class: 'GuideItem' }, [
        el('div', { class: 'gi-head', text: `① ${item.name} —— ${item.definition}` }),
        el('div', { class: 'gi-quote', text: `原文里这句：「${item.quote}」` }),
        item.link ? el('a', { class: 'gi-link', href: item.link, target: '_blank', rel: 'noopener', text: '→ 站内参考' }) : null,
      ]));
    }
    if (demoGuide.gap) {
      guideBox.append(el('div', { class: 'GuideGap', text: `⚠️ 你可能还缺、但没问到的一环：${demoGuide.gap}` }));
    }
    guideBox.append(el('button', { class: 'zb-btn', onclick: () => navigate(`/article/${demoGuide.articleId}`), text: '去读这篇回答 →' }));
  } else {
    guideBox.append(el('h2', { text: '导读是怎么长出来的' }));
    guideBox.append(el('p', { class: 'lead', text: '打开下面任意一篇回答，划选一个你不懂的概念。每问一个，你的「短尾巴」就长一点；问到第 3 个，导读就自动生成，能存成你自己的笔记卡片。' }));
    guideBox.append(el('button', { class: 'zb-btn', onclick: () => navigate('/article/article-backprop'), text: '从最难的那篇开始 →' }));
  }
  parts.push(guideBox);
  app.replaceChildren(...parts);

  // 社区聚合（问题 1）：读到别台设备经 /stuck 匿名上报的卡点后，原地刷新洞察与 TOP3，
  // 让「你划一下，下一个读到的人少卡一次」在首页真的看得见。读不到就保持本地/演示数据。
  api.getStuckAggregate({ articleId: focus.id, topN: 10 })
    .then((r) => {
      const items = r?.items || [];
      if (!items.length) return;
      const nextInsight = topStuckInsight(focus.id, focus, marks, items);
      if (!nextInsight) return;
      insightBox.replaceChildren(...buildInsightChildren(focus, nextInsight, mergeStuck(focus.id, marks, 3, items)));
    })
    .catch(() => {});
}

// 首屏洞察三句话（§4.1）：赞数、同一段的卡住人数、最热的那一个词。
// 数字全部可追溯，末尾补一句来源与占比，绝不把演示数据说成真实统计。
function renderInsight(article, insight, topStuck) {
  return el('div', { class: 'HomeInsight' }, buildInsightChildren(article, insight, topStuck));
}

function buildInsightChildren(article, insight, topStuck) {
  return [
    // 赞数同样来自 Demo 文章数据的写死字段（data/articles.js），与卡点数据一样如实标注，不冒充真实统计。
    el('div', { class: 'insight-line', html: `这篇回答有 <b>${formatCount(insight.voteupCount)}</b> 人赞同。<span class="demo-tag">示例数据</span>` }),
    el('div', { class: 'insight-line', html: `但读到第 <b>${insight.paragraph}</b> 段，就有 <b>${formatCount(insight.count)}</b> 人卡住了。` }),
    el('div', { class: 'insight-line', html: `卡住他们的，是同一个词：<b>${insight.concept}</b>。` }),
    el('div', { class: 'insight-note', text: `全部卡点里有 ${insight.share}% 落在同一个词上 · 数据来源：${stuckSourceLabel(insight)}` }),
    el('div', { class: 'insight-stuck' }, topStuck.map((s, i) =>
      el('div', { class: 'insight-stuck-item', onclick: () => gotoAnchor(article.id, { ...s, text: s.concept }) }, [
        el('span', { class: 'rank', text: `#${i + 1}` }),
        el('span', { class: 'concept', text: s.concept }),
        el('span', { class: 'count', text: `${formatCount(s.count)} 人卡在这` }),
        el('span', { class: 'go', text: '→ 看这一段' }),
      ]))),
    el('div', { class: 'insight-actions' }, [
      el('button', { class: 'zb-btn', text: '去读这篇回答 →', onclick: () => navigate(`/article/${article.id}`) }),
    ]),
  ];
}

// 没有卡点数据时回到老实的一句话说明，不硬凑洞察（§4.5 诚实空状态的同一条原则）。
function renderInsightFallback() {
  return el('div', { class: 'sub', text: '选中正文里任何一个不懂的概念，当场在这篇回答的语境里讲明白；你划过的、卡住的，它替你记着。' });
}
