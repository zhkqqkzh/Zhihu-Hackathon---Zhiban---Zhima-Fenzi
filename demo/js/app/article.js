// 页面：文章页（仿知乎回答卡片）。正文容器选择器与 core/selectors.js 对齐。

import { ARTICLE_BY_ID } from '../data/articles.js';
import { getRealArticle, SOURCE_REAL } from './knowledge-source.js';
import { el } from './ui.js';
import { saveArticleRecord } from './store.js';
import { navigate } from './router.js';

export async function renderArticle(app, id) {
  // 内置 3 篇优先；P1 接入的真实知乎文章从运行时 registry 兜底取出。
  const article = ARTICLE_BY_ID.get(id) || getRealArticle(id);
  if (!article) {
    app.replaceChildren(el('div', { class: 'QuestionHeader' }, [
      el('h1', { text: '文章不存在' }),
      el('button', { class: 'zb-btn', onclick: () => navigate('/'), text: '回首页' }),
    ]));
    return null;
  }
  const isReal = article.source === SOURCE_REAL;
  const card = el('div', { class: 'AnswerCard' }, [
    el('div', { class: 'AnswerAuthor' }, [
      el('div', { class: 'avatar', text: article.author.slice(0, 1) }),
      el('div', {}, [
        el('div', { class: 'name', text: article.author }),
        el('div', { class: 'bio', text: article.bio }),
      ]),
    ]),
    // 真实来源如实标注（§七-6）：正文只拿到官方接口的摘要片段，说清楚，不冒充全文。
    isReal ? el('div', { class: 'AnswerSource' }, [
      el('span', { class: 'real-tag', text: '真实知乎' }),
      el('span', { text: '内容来自知乎官方搜索接口，仅摘要片段；' }),
      el('a', { href: article.sourceUrl, target: '_blank', rel: 'noopener', text: '查看原文 →' }),
    ]) : null,
    el('div', { class: 'zb-RichText', html: article.body, 'data-zb-body': '' }),
    el('div', { class: 'AnswerVote' }, [
      el('span', { text: `▲ ${article.voteupCount} 人赞同了该回答` }),
      el('span', { text: `${article.commentCount} 条评论` }),
    ]),
  ]);
  app.replaceChildren(
    el('div', { class: 'QuestionHeader' }, [
      el('h1', { class: 'zb-QuestionHeader-title', text: article.title }),
      el('div', { class: 'meta', text: isReal
        ? `by ${article.author} · 知乎真实内容 · ${article.voteupCount} 赞同`
        : `by ${article.author} · 机器学习话题 · ${article.voteupCount} 赞同` }),
    ]),
    el('article', { 'data-zb-article': id, 'data-article-id': id }, [card]),
  );
  await saveArticleRecord(id, { title: article.title, link: location.href });
  return article;
}
