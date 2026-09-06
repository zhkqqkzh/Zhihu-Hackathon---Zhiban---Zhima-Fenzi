// DOM 选择器配置（铁律 2：可配置，禁止硬编码）。
// Demo 站与真实知乎结构不同，各给一份；运行环境在适配层选择。

export const DEMO_SELECTORS = {
  articleContainer: '[data-zb-article]',
  articleBody: '.zb-RichText',
  articleTitle: '.zb-QuestionHeader-title, .zb-AnswerTitle',
  commentScope: '.zb-Comments',
  paragraph: 'p, li, blockquote, h2, h3',
  exclude: 'script, style, code, pre, button, .zb-Comments, .zb-formula',
};

export const ZHIHU_SELECTORS = {
  articleContainer: '.AnswerCard, .ContentItem.AnswerItem, article',
  articleBody: '.RichContent-inner, .RichText',
  articleTitle: '.QuestionHeader-title',
  commentScope: '.Comments-container',
  paragraph: 'p, li, blockquote, h2, h3',
  exclude: 'script, style, code, pre, button, .Comments-container, .MathJax, .ztext-math',
};
