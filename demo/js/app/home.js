// 页面：首页（§18.2 三秒定生死）。
// 不在空白文章上开始：第一屏直接展示一篇已存在的导读 + 三句话开场白。

import { ARTICLES, ARTICLE_BY_ID } from '../data/articles.js';
import { el } from './ui.js';
import { listGuides } from './store.js';
import { navigate } from './router.js';

export async function renderHome(app) {
  const guides = await listGuides();
  const demoGuide = guides.find((g) => g.articleId === 'article-backprop');
  const parts = [];

  parts.push(el('div', { class: 'HomeHero' }, [
    el('h1', { text: '知伴 · 和看山一起读' }),
    el('div', { class: 'sub', text: '读知乎遇到不懂的概念，划一下，当场在这篇回答的语境里讲明白。' }),
    el('div', { class: 'ArticleList' }, ARTICLES.map((a) =>
      el('div', { class: 'ArticleCard', onclick: () => navigate(`/article/${a.id}`) }, [
        el('h3', { text: a.title }),
        el('div', { class: 'meta', text: `${a.author} · ${a.voteupCount} 赞同` }),
      ])
    )),
  ]));

  // 开场导读：引导文案 + 导读正文（存在即展示；不存在给入口）
  const guideBox = el('div', { class: 'HomeGuide' });
  guideBox.append(
    el('div', { class: 'lead', html:
      '<p>这篇导读不是答主写的。</p>' +
      '<p>是一位读者读到这里卡住了，连着问了 5 个概念之后，知伴帮他生成的。</p>' +
      '<p>他改了几处，署自己的名发了出去。下一个读到这篇回答的人，门槛直接降一半。</p>'
    }),
  );
  if (demoGuide) {
    guideBox.append(el('h2', { text: `《读「${ARTICLE_BY_ID.get(demoGuide.articleId)?.title || ''}」前，你可能需要先搞懂这 ${demoGuide.items.length} 件事》` }));
    for (const item of demoGuide.items) {
      guideBox.append(el('div', { class: 'GuideItem' }, [
        el('div', { class: 'gi-head', text: `① ${item.name} —— ${item.definition}` }),
        el('div', { class: 'gi-quote', text: `原文里这句：「${item.quote}」` }),
        item.link ? el('a', { class: 'gi-link', href: item.link, target: '_blank', rel: 'noopener', text: '→ 去知乎看这篇高赞回答' }) : null,
      ]));
    }
    if (demoGuide.gap) {
      guideBox.append(el('div', { class: 'GuideGap', text: `⚠️ 你可能还缺、但没问到的一环：${demoGuide.gap}` }));
    }
    guideBox.append(el('button', { class: 'zb-btn', onclick: () => navigate(`/article/${demoGuide.articleId}`), text: '去读这篇回答 →' }));
  } else {
    guideBox.append(el('h2', { text: '导读是怎么长出来的' }));
    guideBox.append(el('p', { class: 'lead', text: '打开下面任意一篇回答，划选一个你不懂的概念。每问一个，你的「短尾巴」就长一点；问到第 3 个，导读就自动生成。' }));
    guideBox.append(el('button', { class: 'zb-btn', onclick: () => navigate('/article/article-backprop'), text: '从最难的那篇开始 →' }));
  }
  parts.push(guideBox);
  app.replaceChildren(...parts);
}
