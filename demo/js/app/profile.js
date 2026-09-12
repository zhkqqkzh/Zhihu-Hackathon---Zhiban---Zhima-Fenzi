// 个人中心：侧边栏 + 模块化视图（首页 / 收藏体检 / 推荐阅读 / 学习数据）。
// 首页给出各模块的简要板块，点击可跳转到对应模块详情。
// 复用 hub.js 中已有的区块渲染函数；数据全部来自本地 store。

import { el } from './ui.js';
import * as store from './store.js';
import { computeDiagnosis } from '../core/graph.js';

// 复用 hub.js 的区块：时间轴、思维导图、诊断
import { renderGraphSection, renderTimelineSection, gotoAnchor } from './hub.js';

const MODULES = [
  { id: 'home', icon: '🏠', label: '首页' },
  { id: 'checkup', icon: '🩺', label: '收藏体检' },
  { id: 'recommend', icon: '📚', label: '推荐阅读' },
  { id: 'data', icon: '📈', label: '学习数据' },
];

function renderCardSection(concepts, root) {
  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('h2', { text: '📇 知识卡片' }));
  if (concepts.length === 0) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还没有学过的概念。' }));
  } else {
    sec.appendChild(el('div', { class: 'hint', text: `已积累 ${concepts.length} 个概念，点击卡片可回原文。` }));
    for (const c of concepts) {
      const def = c.definition || '（暂无定义，选中后由知伴解释）';
      const anchors = Array.isArray(c.anchors) ? c.anchors : [];
      const artCount = new Set([
        ...anchors.map(a => a.articleId),
        c.firstSource?.articleId,
        c.articleId,
      ].filter(Boolean)).size;
      const card = el('div', { class: 'tl-card', style: 'cursor:default' }, [
        el('div', { class: 't', text: c.name }),
        el('div', { class: 's', text: def.length > 60 ? def.slice(0, 60) + '…' : def }),
        el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:4px' }, [
          el('span', { style: 'font-size:12px;color:#8590a6', text: `在 ${artCount} 篇文章学过` }),
          c.mastery === 'passed' ? el('span', { style: 'font-size:11px;color:#3aa655', text: '· 已走过' })
            : c.mastery === 'fuzzy' ? el('span', { style: 'font-size:11px;color:#d67a27', text: '· 有点模糊' })
            : el('span', { style: 'font-size:11px;color:#8590a6', text: '· 还没走过' }),
        ]),
      ]);
      if (anchors.length && anchors[anchors.length - 1].articleId) {
        const lastAnchor = anchors[anchors.length - 1];
        card.addEventListener('click', () => gotoAnchor(lastAnchor.articleId, lastAnchor));
        card.style.cursor = 'pointer';
      }
      sec.appendChild(card);
    }
  }
  root.appendChild(sec);
}

function renderDiagnosisSectionProfile(concepts, root) {
  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('h2', { text: '🎯 学习方向建议' }));
  if (concepts.length === 0) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '学习数据为空，暂无建议。' }));
    root.appendChild(sec);
    return;
  }
  const diag = computeDiagnosis(concepts);
  sec.appendChild(el('div', { class: 'hint', text: diag.summary }));

  // 薄弱主题
  if (diag.weakTopics.length) {
    const weakBox = el('div', { style: 'margin:8px 0' }, [
      el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:4px', text: '薄弱主题：' }),
      el('div', {}, diag.weakTopics.map(t => el('span', { class: 'diag-chip', text: `${t.name}（${t.learned}/${t.total}）` }))),
    ]);
    sec.appendChild(weakBox);
  }

  // 建议补
  if (diag.suggestedGaps.length) {
    const sugBox = el('div', { style: 'margin:8px 0' }, [
      el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:4px', text: '建议优先补的概念：' }),
      el('div', {}, diag.suggestedGaps.map(g => el('span', { class: 'diag-chip', text: g }))),
    ]);
    sec.appendChild(sugBox);
  }

  if (!diag.weakTopics.length && !diag.suggestedGaps.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '继续保持阅读节奏即可！' }));
  }
  root.appendChild(sec);
}

// 模块标题栏：每个详情页顶部的模块名 + 一句话说明
function moduleHeader(icon, title, sub) {
  return el('div', { class: 'hub-hero' }, [
    el('h1', { text: `${icon} ${title}` }),
    el('div', { class: 'sub', text: sub }),
  ]);
}

// 首页：三个模块的简要板块，点击进入详情
function renderHomeModule(root, concepts, extras, items, go) {
  const gaps = concepts.length ? computeDiagnosis(concepts).suggestedGaps : [];
  const recCount = items.filter((it) => it.score >= 6).length + gaps.length;

  const card = (icon, title, desc, target) => el('div', { class: 'pf-card', onclick: () => go(target) }, [
    el('div', { class: 'pf-card-icon', text: icon }),
    el('div', { class: 'pf-card-title', text: title }),
    el('div', { class: 'pf-card-desc', text: desc }),
    el('div', { class: 'pf-card-more', text: '查看详情 →' }),
  ]);

  root.appendChild(el('div', { class: 'hub-hero' }, [
    el('h1', { text: '🏠 个人中心' }),
    el('div', { class: 'sub', text: concepts.length
      ? `已学习 ${concepts.length} 个概念 —— 你的知识足迹、图谱与成长建议。`
      : '你的学习足迹、知识图谱与成长建议。' }),
  ]));

  root.appendChild(el('div', { class: 'pf-cards' }, [
    card('🩺', '收藏体检', items.length
      ? `本次体检最近 ${items.length} 篇收藏`
      : (extras.length ? '正在读取收藏夹…' : '接入知乎登录态后体检收藏夹'), 'checkup'),
    card('📚', '推荐阅读', recCount ? `为你挑出 ${recCount} 条` : '暂无推荐，先去读几篇', 'recommend'),
    card('📈', '学习数据', concepts.length ? `已积累 ${concepts.length} 个概念` : '还没有学习记录', 'data'),
  ]));
}

// 收藏体检：扩展页注入的知乎区块（账号 / 体检清单 / 分类导图）
function renderCheckupModule(root, extras) {
  if (extras.length) {
    for (const node of extras) root.appendChild(node);
    return;
  }
  root.appendChild(moduleHeader('🩺', '收藏体检', '把收藏夹过一遍，看看哪些值得重读。'));
  root.appendChild(el('div', { class: 'hub-section' }, [
    el('div', { class: 'hub-empty', text: '收藏体检需要读取知乎登录态，请在扩展版的个人中心里查看。' }),
  ]));
}

// 推荐阅读：收藏夹高分 + 学习盲区
function renderRecommendModule(root, concepts, items) {
  const diag = concepts.length ? computeDiagnosis(concepts) : { weakTopics: [], suggestedGaps: [] };
  root.appendChild(moduleHeader('📚', '推荐阅读', '收藏夹里的高分文章，外加还没补齐的知识盲区。'));

  const sec = el('div', { class: 'hub-section' });
  const high = items.filter((it) => it.score >= 6).slice(0, 8);

  if (high.length) {
    sec.appendChild(el('h2', { text: '⭐ 收藏夹高分' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const it of high) {
      list.appendChild(el('div', { class: 'zb-check-item' }, [
        el('div', { class: 'zb-check-head' }, [
          el('a', { class: 'zb-check-title', href: it.url, target: '_blank', rel: 'noopener noreferrer', text: it.title }),
          el('span', { class: `zb-lv lv-${it.level}`, text: `值得精读 · ${it.score}分` }),
        ]),
        el('div', { class: 'zb-check-note', text: it.excerpt.slice(0, 90) }),
      ]));
    }
    sec.appendChild(list);
  }

  if (diag.suggestedGaps.length) {
    sec.appendChild(el('h2', { text: '🧭 学习盲区', style: high.length ? 'margin-top:16px' : '' }));
    sec.appendChild(el('div', { class: 'hint', text: '这些概念你碰到过但还没走通，建议优先补上。' }));
    sec.appendChild(el('div', {}, diag.suggestedGaps.map((g) => el('span', { class: 'diag-chip', text: g }))));
  }

  if (diag.weakTopics.length) {
    sec.appendChild(el('h2', { text: '⚠️ 薄弱主题', style: (high.length || diag.suggestedGaps.length) ? 'margin-top:16px' : '' }));
    sec.appendChild(el('div', {}, diag.weakTopics.map((t) => el('span', { class: 'diag-chip', text: `${t.name}（${t.learned}/${t.total}）` }))));
  }

  if (!high.length && !diag.suggestedGaps.length && !diag.weakTopics.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还攒不出推荐。多读几篇、多划几个词，这里就有东西了。' }));
  }
  root.appendChild(sec);
}

// 学习数据：时间轴 + 思维导图 + 知识卡片 + 学习方向建议
function renderDataModule(root, concepts, graph) {
  root.appendChild(moduleHeader('📈', '学习数据', '你的学习足迹、知识图谱与成长建议。'));
  if (concepts.length === 0) {
    root.appendChild(el('div', { class: 'hub-section' }, [
      el('div', { class: 'hub-empty', style: 'text-align:center;padding:40px 0', text: '还没有学习记录。去文章里划选几个概念，「知伴」会帮你积累成图谱，回到这里就能看到你的成长轨迹。' }),
    ]));
    return;
  }
  renderTimelineSection(concepts, root);
  // 刷新只重绘本模块，不跳出个人中心外壳
  if (graph) renderGraphSection(concepts, root, (r) => { r.replaceChildren(); renderDataModule(r, concepts, graph); });
  renderCardSection(concepts, root);
  renderDiagnosisSectionProfile(concepts, root);
}

// graph=false 用于扩展内独立页：MV3 CSP 禁远程脚本，图谱库加载不了，区块先不挂。
// extra：插件版个人中心插入的额外区块（知乎账号 / 收藏夹），放进「收藏体检」模块。
// getRecommends：取收藏夹高分文章的读取器（插件版由 profile-zhihu.js 回填，demo 为空）。
// 返回 { refresh }，供外部数据到位后重渲染当前模块。
export async function renderProfile(app, { graph = true, extra = null, getRecommends = null } = {}) {
  const concepts = await store.listConcepts();
  const extras = [].concat(extra || []).filter(Boolean);
  const items = typeof getRecommends === 'function' ? getRecommends : () => [];

  let current = 'home';

  const nav = el('nav', { class: 'pf-nav' });
  const main = el('div', { class: 'pf-main hub-layout' });
  app.replaceChildren(el('div', { class: 'pf-layout' }, [nav, main]));

  const go = (id) => { current = id; render(); };

  function render() {
    nav.replaceChildren(...MODULES.map((m) => el('div', {
      class: `pf-nav-item${m.id === current ? ' active' : ''}`,
      onclick: () => go(m.id),
    }, [
      el('span', { class: 'pf-nav-icon', text: m.icon }),
      el('span', { text: m.label }),
    ])));

    main.replaceChildren();
    if (current === 'checkup') return renderCheckupModule(main, extras);
    if (current === 'recommend') return renderRecommendModule(main, concepts, items());
    if (current === 'data') return renderDataModule(main, concepts, graph);
    return renderHomeModule(main, concepts, extras, items(), go);
  }

  render();
  return { refresh: render };
}
