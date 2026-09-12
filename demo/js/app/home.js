// 页面：首页（§18.2 三秒定生死）。
// 首屏只突出 P0（选中即问）与 P1（全文概念标记 / 被动沉淀）：文章列表直接开读。
// 导读属于 P2，这里只留一条示例，不在主路径上。

import { ARTICLES, ARTICLE_BY_ID } from '../data/articles.js';
import { el } from './ui.js';
import { listGuides } from './store.js';
import { navigate } from './router.js';

export async function renderHome(app) {
  const guides = await listGuides();
  const demoGuide = guides.find((g) => g.articleId === 'article-backprop');
  const parts = [];

  parts.push(el('div', { class: 'HomeHero' }, [
    el('h1', { text: '知伴 · 读不懂，划一下' }),
    el('div', { class: 'sub', text: '选中正文里任何一个不懂的概念，当场在这篇回答的语境里讲明白；你划过的、卡住的，它替你记着。' }),
    el('div', { class: 'ArticleList' }, ARTICLES.map((a) =>
      el('div', { class: 'ArticleCard', onclick: () => navigate(`/article/${a.id}`) }, [
        el('h3', { text: a.title }),
        el('div', { class: 'meta', text: `${a.author} · ${a.voteupCount} 赞同` }),
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
}
