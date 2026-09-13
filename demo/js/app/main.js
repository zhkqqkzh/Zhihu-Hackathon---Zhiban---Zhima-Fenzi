// 应用入口：顶栏 + hash 路由分发 + 常驻入口 + 侧栏 + 选区监听挂载。

import { parseRoute, navigate, onRouteChange } from './router.js';
import { renderHome } from './home.js';
import { renderArticle } from './article.js';
import { renderIgloo } from './igloo.js';
import { renderHub } from './hub.js';
import { renderGuide } from './guide.js';
import { renderCreator } from './creator.js';
import { renderProfile } from './profile.js';
import { DEMO_SELECTORS } from '../core/selectors.js';
import { initEntry } from './entry.js';
import { initSelection } from './selection.js';
import { initPrescan, ensurePrescan } from './prescan.js';
import { initQuiz } from './quiz.js';
import { initWeeklyReview } from './weekly.js';
import { el } from './ui.js';
import { warmup } from './api.js';
import { ARTICLES } from '../data/articles.js';
import { setPageContext, consumeAnchorJump, jumpToAnchor } from './runtime.js';

// 首屏只突出 P0（选中即问）与 P1（全文概念标记）：冰屋/学习中心从主路径撤下，
// 路由本身保留（复盘详情走侧栏「每周复盘」tab，hub 仍可直接用 #/hub 打开）。
function renderTopbar(route) {
  const bar = document.getElementById('zb-topbar');
  const link = (path, label) => {
    const active = (route.name === 'home' && path === '/') ||
      (route.name === 'article' && path === `/article/${route.id}`) ||
      (route.name === 'profile' && path === '/profile') ||
      (route.name === 'creator' && path === '/creator');
    return el('a', { href: `#${path}`, class: active ? 'active' : '', text: label });
  };
  bar.replaceChildren(
    el('span', { class: 'logo', text: '知乎' }),
    el('nav', {}, [
      link('/', '首页'),
      ...ARTICLES.map((a) => link(`/article/${a.id}`, a.title.length > 14 ? a.title.slice(0, 14) + '…' : a.title)),
    ]),
    el('span', { class: 'spacer' }),
    el('nav', {}, [
      link('/creator', '答主视角'),
      link('/profile', '个人中心'),
    ]),
    el('span', { class: 'mock-badge', text: '知伴 Demo' }),
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
      // 打开文章即整篇预扫描（不再等第一次选词）：侧栏概念地图/难度预告随即可用。
      // 不 await，扫描在后台跑，不阻塞正文渲染（§10.5）。
      ensurePrescan(route.id).catch(() => {});
      // Learning Hub 回原文：文章渲染完成后消费锚点请求 → 定位 + 高亮
      const req = consumeAnchorJump(route.id);
      if (req) {
        requestAnimationFrame(() => jumpToAnchor(req.anchor, { container, selectors: DEMO_SELECTORS }));
      }
    } else {
      setPageContext(null);
    }
    return;
  }
  setPageContext(null);
  if (route.name === 'igloo') return renderIgloo(app);
  if (route.name === 'hub') return renderHub(app);
  if (route.name === 'guide') return renderGuide(app, route.id);
  if (route.name === 'creator') return renderCreator(app);
  if (route.name === 'profile') return renderProfile(app);
  return renderHome(app);
}

async function boot() {
  warmup(); // §五-2 冷启动预热：不 await，抢在用户划词前把 SCF 实例热起来
  initEntry();
  initSelection();
  initPrescan();
  initQuiz();
  initWeeklyReview();
  onRouteChange(dispatch);
  await dispatch(parseRoute());
}

boot().catch((e) => console.error('boot failed', e));

// 端到端测试钩子（console 可用，但不属于用户界面）
window.__zhiban = {
  loadSample: () => import('./sample.js').then((m) => m.loadSample()),
  openSidebar: () => import('./sidebar.js').then((m) => m.openSidebar('tail')),
  listConcepts: () => import('./store.js').then((m) => m.listConcepts()),
  warmup: () => import('./api.js').then((m) => m.warmup()),
  loadRealArticles: (q) => import('./knowledge-source.js').then((m) => m.loadRealArticles(q)),
};
