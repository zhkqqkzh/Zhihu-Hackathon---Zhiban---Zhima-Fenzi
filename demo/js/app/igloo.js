// 冰屋（功能 11）：总览——我的短尾巴、去看山进度、读过的回答、生成的导读、掌握率。
// 没有出口的数据是死数据，所以有了这页。

import { el } from './ui.js';
import * as store from './store.js';
import { navigate } from './router.js';
import { ARTICLE_BY_ID } from '../data/articles.js';
import { renderCuration } from './curation.js';

export async function renderIgloo(app) {
  const concepts = await store.listConcepts();
  const arts = await store.listArticleRecords();
  const guides = await store.listGuides();

  const passed = concepts.filter((c) => c.mastery === 'passed').length;
  const fuzzy = concepts.filter((c) => c.mastery === 'fuzzy').length;
  const masteryRate = concepts.length ? Math.round((passed / concepts.length) * 100) : 0;
  const dueReviews = concepts.filter((c) => c.review && Date.now() >= c.review.nextReviewAt).length;

  const wrap = el('div', {}, [
    el('div', { class: 'HomeHero' }, [
      el('h1', { text: '🧊 冰屋' }),
      el('div', { class: 'sub', text: '你所有痕迹的总览。它们只存在这个浏览器里。' }),
      el('div', { class: 'IglooStats' }, [
        stat('短尾巴', concepts.length, '个概念'),
        stat('已走过', passed, '个营地'),
        stat('有点模糊', fuzzy, '个'),
        stat('掌握率', masteryRate, '%'),
        stat('待回访', dueReviews, '个'),
        stat('读过的回答', arts.length, '篇'),
      ]),
    ]),
  ]);

  // 读过的回答
  const readBox = el('div', { class: 'HomeGuide' }, [el('h2', { text: '读过的回答' })]);
  if (arts.length === 0) {
    readBox.appendChild(el('p', { style: 'color:#8590a6;font-size:13px', text: '还没有。去读一篇，你的短尾巴就从第一个概念开始长。' }));
  }
  for (const a of arts) {
    const art = ARTICLE_BY_ID.get(a.id);
    readBox.appendChild(el('div', { class: 'ArticleCard', style: 'margin-bottom:8px', onclick: () => navigate(`/article/${a.id}`) }, [
      el('h3', { text: art?.title || a.title || a.id }),
      el('div', { class: 'meta', text: `展开过 ${a.expandedConcepts?.length || 0} 个概念 · 答过 ${a.quizzes?.length || 0} 题 · ${a.readToEnd ? '已读完' : '未读完'}` }),
    ]));
  }
  wrap.appendChild(readBox);

  // 生成的导读
  const guideBox = el('div', { class: 'HomeGuide' }, [el('h2', { text: '生成的导读' })]);
  if (guides.length === 0) {
    guideBox.appendChild(el('p', { style: 'color:#8590a6;font-size:13px', text: '在一篇回答里展开 3 个概念，导读就会自动长出来。' }));
  }
  for (const g of guides) {
    guideBox.appendChild(el('div', { class: 'ArticleCard', style: 'margin-bottom:8px', onclick: () => navigate(`/guide/${g.articleId}`) }, [
      el('h3', { text: `《读「${g.title}」前，你可能需要先搞懂这 ${g.items.length} 件事》` }),
      g.gap ? el('div', { class: 'meta', text: `含缺口提醒：${g.gap}` }) : null,
    ]));
  }
  wrap.appendChild(guideBox);

  // 看山策展
  const curBox = el('div', { class: 'HomeGuide' }, [el('h2', { text: '看山策展' })]);
  await renderCuration(curBox);
  wrap.appendChild(curBox);

  app.replaceChildren(wrap);
}

function stat(label, value, unit) {
  return el('div', { class: 'IglooStat' }, [
    el('div', { class: 'v', text: `${value}${unit}` }),
    el('div', { class: 'l', text: label }),
  ]);
}
