// 应用入口：顶栏 + hash 路由分发 + 常驻入口 + 侧栏 + 选区监听挂载。

import { parseRoute, navigate, onRouteChange } from './router.js';
import { renderHome } from './home.js';
import { renderArticle } from './article.js';
import { renderIgloo } from './igloo.js';
import { renderGuide } from './guide.js';
import { setPageContext } from './runtime.js';
import { DEMO_SELECTORS } from '../core/selectors.js';
import { initEntry } from './entry.js';
import { initSelection } from './selection.js';
import { initPrescan } from './prescan.js';
import { initQuiz } from './quiz.js';
import { el } from './ui.js';
import { ARTICLES } from '../data/articles.js';

function renderTopbar(route) {
  const bar = document.getElementById('zb-topbar');
  const link = (path, label) => {
    const active = (route.name === 'home' && path === '/') ||
      (route.name === 'article' && path === `/article/${route.id}`) ||
      (route.name === 'igloo' && path === '/igloo');
    return el('a', { href: `#${path}`, class: active ? 'active' : '', text: label });
  };
  bar.replaceChildren(
    el('span', { class: 'logo', text: '知乎' }),
    el('nav', {}, [
      link('/', '首页'),
      ...ARTICLES.map((a) => link(`/article/${a.id}`, a.title.length > 14 ? a.title.slice(0, 14) + '…' : a.title)),
      link('/igloo', '冰屋'),
    ]),
    el('span', { class: 'spacer' }),
    el('span', { class: 'mock-badge', text: '知伴 Demo · 流程模拟' }),
  );
}

async function dispatch(route) {
  const app = document.getElementById('app');
  renderTopbar(route);
  if (route.name === 'article') {
    const article = await renderArticle(app, route.id);
    if (article) {
      const container = app.querySelector(DEMO_SELECTORS.articleContainer);
      const body = app.querySelector(DEMO_SELECTORS.articleBody);
      setPageContext({ article, articleId: route.id, container, body, selectors: DEMO_SELECTORS });
    } else {
      setPageContext(null);
    }
    return;
  }
  setPageContext(null);
  if (route.name === 'igloo') return renderIgloo(app);
  if (route.name === 'guide') return renderGuide(app, route.id);
  return renderHome(app);
}

async function boot() {
  initEntry();
  initSelection();
  initPrescan();
  initQuiz();
  onRouteChange(dispatch);
  await dispatch(parseRoute());
}

boot().catch((e) => console.error('boot failed', e));

// 端到端测试钩子（console 可用，但不属于用户界面）
window.__zhiban = {
  loadSample: () => import('./sample.js').then((m) => m.loadSample()),
  openSidebar: () => import('./sidebar.js').then((m) => m.openSidebar('chain')),
  listConcepts: () => import('./store.js').then((m) => m.listConcepts()),
};
