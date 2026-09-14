// 个人中心（重写版）：侧边栏 + 模块化视图（首页 / 学习足迹 / 收藏夹体检 / 知识卡片 / 推荐阅读）。
// 数据全部来自本地 store。
// 不再保留：我的贡献、学习数据、我的笔记、学习复盘、阅读足迹（功能合并到学习足迹/知识卡片中）。

import { el, icon, toast } from './ui.js';
import * as store from './store.js';
import { computeDiagnosis, TOPIC_LEXICON, topicOf } from '../core/graph.js';
import { buildWeeklyReview } from '../core/review.js';
import { isDue } from '../core/srs.js';
import { formatTime } from '../core/note.js';
import { exportNote } from './notes.js';
// §6 困惑双面镜：卡点数字一律走 core/stuck 的三源标注，绝不用 seed 冒充社区（§6.6）。
import { mergeStuck, formatCount, stuckSourceLabel, STUCK_LOCAL_LABEL } from '../core/stuck.js';
import { ARTICLE_BY_ID } from '../data/articles.js';

// 复用 hub.js 的时间轴
import { gotoAnchor } from './hub.js';

const MODULES = [
  { id: 'home', icon: 'home', label: '首页' },
  { id: 'footprint', icon: 'compass', label: '学习足迹' },
  { id: 'checkup', icon: 'activity', label: '收藏夹体检' },
  { id: 'cards', icon: 'layers', label: '知识卡片' },
  { id: 'recommend', icon: 'book', label: '推荐阅读' },
];

// 区块标题：线性图标 + 文案。选项透传给 h2（如 margin-top）。
function h2(iconName, text, opts) {
  return el('h2', opts || {}, [icon(iconName), el('span', { text })]);
}

// 模块标题栏
function moduleHeader(iconName, title, sub) {
  return el('div', { class: 'hub-hero' }, [
    el('h1', {}, [icon(iconName), el('span', { text: title })]),
    el('div', { class: 'sub', text: sub }),
  ]);
}

// ------ 数值卡片 ------
function statCard(value, label) {
  return el('div', { class: 'pf-stat' }, [
    el('div', { class: 'pf-stat-value', text: value }),
    el('div', { class: 'pf-stat-label', text: label }),
  ]);
}

// ------ 知识卡片（独立板块 + 首页也用） ------

// 按掌握程度分组
function groupByMastery(concepts) {
  const groups = { unvisited: [], fuzzy: [], passed: [] };
  for (const c of concepts || []) {
    if (c.mastery === 'passed') groups.passed.push(c);
    else if (c.mastery === 'fuzzy') groups.fuzzy.push(c);
    else groups.unvisited.push(c);
  }
  return groups;
}

// 到期复习提醒
function dueReviewCount(concepts) {
  return concepts.filter((c) => c.review && isDue(c.review)).length;
}

function timeAgo(ts) {
  const now = Date.now();
  const diff = Number(ts) - now;
  if (diff <= 0) return '已到期';
  const days = Math.round(diff / 86400000);
  if (days > 30) return `${Math.round(days / 30)} 个月后`;
  if (days >= 1) return `${days} 天后`;
  const hrs = Math.round(diff / 3600000);
  if (hrs >= 1) return `${hrs} 小时后`;
  return '即将到期';
}

function renderCardSection(concepts, root) {
  if (concepts.length === 0) {
    root.appendChild(el('div', { class: 'hub-section' }, [
      el('div', { class: 'hub-empty', text: '还没有学过的概念。去文章里选中一个词划一下，这里就会攒起来。' }),
    ]));
    return;
  }
  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(h2('layers', '知识卡片'));
  sec.appendChild(el('div', { class: 'hint', text: `已积累 ${concepts.length} 个概念，点击卡片可回原文。` }));
  for (const c of concepts) {
    const def = c.definition || '（暂无定义）';
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
  root.appendChild(sec);
}

// ------ 诊断（推荐阅读 / 思维导图点评用） ------
function computeDiagnosisSafe(concepts) {
  if (!concepts || concepts.length === 0) return { weakTopics: [], suggestedGaps: [], summary: '' };
  return computeDiagnosis(concepts);
}

// 按主题聚类：每个主题下有哪些概念，以及这些概念关联的文章数
function groupConceptsByTopic(concepts) {
  const map = new Map(); // topicName -> { conceptNames: Set, articleIds: Set }
  for (const c of concepts || []) {
    const t = topicOf(c.name);
    if (!t) continue;
    if (!map.has(t)) map.set(t, { conceptNames: new Set(), articleIds: new Set() });
    const g = map.get(t);
    g.conceptNames.add(c.name);
    const anchors = Array.isArray(c.anchors) ? c.anchors : [];
    for (const a of anchors) if (a.articleId) g.articleIds.add(a.articleId);
    if (c.firstSource?.articleId) g.articleIds.add(c.firstSource.articleId);
    if (c.articleId) g.articleIds.add(c.articleId);
  }
  return [...map.entries()].map(([name, g]) => ({
    name,
    concepts: [...g.conceptNames],
    articleCount: g.articleIds.size,
  })).sort((a, b) => b.articleCount - a.articleCount);
}

// 思维导图树（纯 DOM/CSS，复用 profile-zhihu.js 的渲染风格）
function renderTree(body, topics, diagnosisHint) {
  const leaf = (name) => el('li', {}, [
    el('div', { class: 'zb-tree-label' }, [
      el('span', { class: 'zb-tree-name', text: name }),
    ]),
  ]);
  const groupNode = (g) => {
    const li = el('li', {}, [
      el('div', { class: 'zb-tree-label group' }, [
        el('span', { class: 'zb-tree-name', text: g.name }),
        el('span', { class: 'zb-tree-count', text: `${g.articleCount} 篇文章` }),
      ]),
    ]);
    li.appendChild(el('ul', { class: 'zb-tree-children' }, g.concepts.map(leaf)));
    return li;
  };
  const rootLi = el('li', {}, [
    el('div', { class: 'zb-tree-label root' }, [
      el('span', { text: '学习方向总览' }),
      el('span', { class: 'zb-tree-count', text: `${topics.length} 个方向` }),
    ]),
  ]);
  rootLi.appendChild(el('ul', { class: 'zb-tree-children' }, topics.map(groupNode)));

  body.replaceChildren(
    el('div', { class: 'hint', text: '按预设主题聚类。每个方向下的概念数 = 你在这个方向学过的概念。' }),
    el('div', { style: 'margin:6px 0 10px;padding:8px 12px;background:#f6f9fd;border-radius:4px;font-size:13px;color:#121212', text: diagnosisHint }),
    el('ul', { class: 'zb-tree' }, [rootLi]),
  );
}

// ------ 首页 ------
function renderHomeModule(root, concepts, extras, items, go, data) {
  const diag = concepts.length ? computeDiagnosisSafe(concepts) : { weakTopics: [], suggestedGaps: [] };
  const zhihuHigh = items.filter((it) => it.score >= 6);
  const localReads = (data.articles || []).filter((a) => Array.isArray(a.expandedConcepts) && a.expandedConcepts.length > 0);
  // 推荐阅读计数：薄弱方向推荐文章 + 已读文章 + 收藏夹高分
  const recCount = computeRecommendCount(concepts, data.articles, zhihuHigh.length, diag);
  const dueCount = concepts.filter((c) => c.review && isDue(c.review)).length;
  const masteryRate = concepts.length ? buildWeeklyReview({ concepts, lastReviewAt: data.lastReviewAt }).masteryRate : 0;

  const topLocal = (() => {
    const map = new Map();
    for (const m of data.marks || []) {
      if (!m || !m.concept) continue;
      const cur = map.get(m.concept) || { concept: m.concept, count: 0, articles: new Set() };
      cur.count += 1;
      if (m.articleId) cur.articles.add(m.articleId);
      map.set(m.concept, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  })();

  // 飞轮叙事
  const hero = el('div', { class: 'hub-hero pf-hero' }, [
    el('h1', {}, [icon('compass'), el('span', { text: '个人中心' })]),
  ]);
  if (topLocal.length) {
    const t = topLocal[0];
    const articleId = [...t.articles][0];
    const merged = articleId ? mergeStuck(articleId, (data.marks || []).filter((m) => m && m.articleId === articleId), null).find((s) => s.concept === t.concept) : null;
    const n = merged ? merged.count : t.count;
    hero.appendChild(el('div', { class: 'pf-lead', html:
      `你卡住的地方，已经有 <b>${formatCount(n)}</b> 个人也卡住了——而你刚才划的那一下，正在帮下一个读到的人少卡一次。` }));
    hero.appendChild(el('div', { class: 'pf-source', text: `数据来源：${merged ? stuckSourceLabel(merged) : STUCK_LOCAL_LABEL}` }));
  } else {
    hero.appendChild(el('div', { class: 'pf-lead', text:
      '还没有你的卡点记录。去文章里划一下不懂的概念——那一划，会帮下一个读到这里的人少卡一次。' }));
  }
  const notFinished = data.articles.filter((a) => !a.readToEnd).length;
  if (data.articles.length && notFinished > 0) {
    hero.appendChild(el('div', { class: 'pf-sub', html:
      `你读过的长文里，有 <b>${notFinished}</b> 篇没读完。不是你的问题——是这几个概念，缺了前置。` }));
  }
  root.appendChild(hero);

  // 概念卡点
  const conceptSec = el('div', { class: 'hub-section' });
  conceptSec.appendChild(h2('alert', '卡点概览'));
  if (topLocal.length) {
    conceptSec.appendChild(el('div', { class: 'pf-concepts' }, topLocal.map((t) => {
      const articleId = [...t.articles][0];
      const merged = articleId ? mergeStuck(articleId, (data.marks || []).filter((m) => m && m.articleId === articleId), null).find((s) => s.concept === t.concept) : null;
      return el('div', { class: 'pf-concept-card' }, [
        el('div', { class: 'pf-concept-name', text: t.concept }),
        el('div', { class: 'pf-concept-mine', text: `你共卡 ${t.count} 次` }),
        merged ? el('div', { class: 'pf-concept-comm', text: `共 ${formatCount(merged.count)} 人同卡` }) : null,
      ]);
    })));
  } else {
    conceptSec.appendChild(el('div', { class: 'hub-empty', text: '还没有卡点记录。在文章里选中不懂的概念、点「卡了一下」，这里就会记下来。' }));
  }
  root.appendChild(conceptSec);

  // 功能入口（5 个板块）
  const card = (iconName, title, desc, target) => el('div', { class: 'pf-card', onclick: () => go(target) }, [
    icon(iconName, 'pf-card-icon'),
    el('div', { class: 'pf-card-body' }, [
      el('div', { class: 'pf-card-title', text: title }),
      el('div', { class: 'pf-card-desc', text: desc }),
    ]),
  ]);
  root.appendChild(el('div', { class: 'hub-section' }, [
    h2('grid', '功能导航'),
    el('div', { class: 'pf-cards' }, [
      card('compass', '学习足迹', concepts.length ? `已学 ${concepts.length} 个概念${data.articles.length ? `，读过 ${data.articles.length} 篇` : ''}` : '还没有学习记录', 'footprint'),
      card('activity', '收藏夹体检', items.length ? `最新 ${items.length} 篇收藏` : '正在读取收藏夹…', 'checkup'),
      card('layers', '知识卡片', concepts.length ? `已积累 ${concepts.length} 张卡片` : '还没有知识卡片', 'cards'),
      card('book', '推荐阅读', recCount ? `为你挑出 ${recCount} 条` : '暂无推荐，先去读几篇', 'recommend'),
    ]),
  ]));
}

// ------ 学习足迹（近3文 + 近3知识点 + 思维导图） ------
function renderFootprintModule(root, concepts, articles, guides, data) {
  root.appendChild(moduleHeader('compass', '学习足迹', '最近在读什么、学了什么，以及你的学习方向总览。'));

  // 总览 stat
  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('div', { class: 'pf-stat-row' }, [
    statCard(String(articles.length), '读过的回答'),
    statCard(String(concepts.length), '学过的概念'),
    statCard(String(guides.length), '生成的导读'),
  ]));
  root.appendChild(sec);

  if (concepts.length === 0 && articles.length === 0) {
    root.appendChild(el('div', { class: 'hub-section' }, [
      el('div', { class: 'hub-empty', text: '还没有学习足迹。打开一篇知乎回答，选中不懂的概念划一下，这里就会记录。' }),
    ]));
    return;
  }

  // 近三篇文章
  if (articles.length) {
    const artSec = el('div', { class: 'hub-section' });
    artSec.appendChild(h2('bookOpen', '最近读过'));
    const sortedArts = [...articles].sort((x, y) => (y.firstReadAt || 0) - (x.firstReadAt || 0)).slice(0, 3);
    const artList = el('div', { class: 'zb-check-list' });
    for (const a of sortedArts) {
      const conceptsInArt = Array.isArray(a.expandedConcepts) ? a.expandedConcepts.length : 0;
      artList.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(a.id, null) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: a.title || a.link || a.id }),
          a.readToEnd ? el('span', { class: 'pf-tag ok', text: '读完' }) : el('span', { class: 'pf-tag due', text: '未读完' }),
        ]),
        el('div', { class: 'zb-check-meta', text: `展开 ${conceptsInArt} 个概念 · ${formatTime(a.firstReadAt)}` }),
      ]));
    }
    artSec.appendChild(artList);
    root.appendChild(artSec);

    // 未读完的「继续阅读」入口
    const unfinished = articles.filter((a) => !a.readToEnd);
    if (unfinished.length) {
      const contSec = el('div', { class: 'hub-section' });
      contSec.appendChild(el('div', { style: 'margin-top:4px' }, [
        el('span', { text: '没有读到底的回答', style: 'font-size:13px;font-weight:600;color:#121212' }),
        el('span', { style: 'font-size:12px;color:#8590a6;margin-left:8px', text: `${unfinished.length} 篇` }),
      ]));
      const contList = el('div', { class: 'zb-check-list' });
      for (const a of unfinished.slice(0, 5)) {
        contList.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(a.id, null) }, [
          el('div', { class: 'zb-check-head' }, [
            el('span', { class: 'zb-check-title', text: a.title || a.link || a.id }),
            el('span', { class: 'pf-tag due', text: '未读完' }),
          ]),
          el('div', { class: 'zb-check-meta', text: `折在半路——多半缺了前置概念，回到原文把卡住的词划出来。` }),
        ]));
      }
      if (unfinished.length > 5) {
        contList.appendChild(el('div', { class: 'hint', style: 'text-align:center', text: `还有 ${unfinished.length - 5} 篇` }));
      }
      contSec.appendChild(contList);
      root.appendChild(contSec);
    }
  }

  // 近三个知识点（最近学过的 3 个概念）
  if (concepts.length) {
    const concSec = el('div', { class: 'hub-section' });
    concSec.appendChild(h2('star', '最近学过的概念'));
    const recent = [...concepts]
      .sort((a, b) => {
        const aAt = Array.isArray(a.anchors) && a.anchors.length ? a.anchors[a.anchors.length - 1].at : a.firstAskedAt || 0;
        const bAt = Array.isArray(b.anchors) && b.anchors.length ? b.anchors[b.anchors.length - 1].at : b.firstAskedAt || 0;
        return bAt - aAt;
      })
      .slice(0, 3);
    const list = el('div', { class: 'pf-concepts', style: 'gap:12px' });
    for (const c of recent) {
      const def = c.definition || '（暂无定义）';
      const anchors = Array.isArray(c.anchors) ? c.anchors : [];
      const lastAnchor = anchors.length ? anchors[anchors.length - 1] : null;
      const card = el('div', {
        class: 'pf-concept-card',
        style: lastAnchor ? 'cursor:pointer' : '',
        onclick: lastAnchor ? () => gotoAnchor(lastAnchor.articleId, lastAnchor) : undefined,
      }, [
        el('div', { class: 'pf-concept-name', text: c.name }),
        el('div', { class: 'pf-concept-mine', style: 'font-size:12px;color:#8590a6;margin-top:2px', text: def.length > 50 ? def.slice(0, 50) + '…' : def }),
        el('div', { class: 'pf-concept-mine', style: 'font-size:11px;color:#8590a6;margin-top:2px', text: c.mastery === 'passed' ? '已走过' : c.mastery === 'fuzzy' ? '有点模糊' : '还没走过' }),
      ]);
      list.appendChild(card);
    }
    concSec.appendChild(list);
    root.appendChild(concSec);
  }

  // 学习方向思维导图（按 TOPIC_LEXICON 主题聚类）+ 下方点评
  if (concepts.length) {
    const treeSec = el('div', { class: 'hub-section' });
    treeSec.appendChild(h2('tree', '学习方向总览'));
    const topics = groupConceptsByTopic(concepts);
    const diag = computeDiagnosisSafe(concepts);
    const diagnosisHint = diag.summary
      ? `诊断：${diag.summary}`
      : '还没有积累足够的主题数据。多划几个概念，方向就会清晰起来。';
    renderTree(treeSec, topics, diagnosisHint);
    root.appendChild(treeSec);
  }
}

// ------ 知识卡片（独立板块） ------
function renderCardModule(root, concepts, notes, reload) {
  root.appendChild(moduleHeader('layers', '知识卡片', '划过的概念卡片 + 手动存的笔记，按掌握程度分组，到期该复习的优先。'));

  const due = dueReviewCount(concepts);
  const groups = groupByMastery(concepts);

  // 到期提醒
  if (due > 0) {
    const dueSec = el('div', { class: 'hub-section' });
    dueSec.appendChild(el('div', { style: 'padding:10px 14px;background:#fff7e6;border-radius:4px;font-size:13px;color:#96591a', html:
      `<b>${due}</b> 个概念到期该复习了 — 趁热回一下，记忆曲线不等人。` }));
    root.appendChild(dueSec);
  }

  // 按掌握程度分段展示
  const order = [
    { key: 'unvisited', label: '还没走过' },
    { key: 'fuzzy', label: '有点模糊' },
    { key: 'passed', label: '已走过' },
  ];
  for (const { key, label } of order) {
    const list = groups[key];
    if (!list.length) continue;
    const sec = el('div', { class: 'hub-section' });
    sec.appendChild(h2(key === 'unvisited' ? 'bell' : key === 'fuzzy' ? 'alert' : 'star', label, { style: 'margin-top:0' }));
    sec.appendChild(el('div', { class: 'hint', text: `${list.length} 个概念${key === 'unvisited' ? '，建议优先复习' : key === 'fuzzy' ? '，回看一下加深印象' : ''}` }));
    for (const c of list.slice(0, 12)) {
      const def = c.definition || '（暂无定义）';
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
          c.review?.nextReview ? el('span', { style: 'font-size:11px;color:#8590a6', text: `· 下次复习 ${timeAgo(c.review.nextReview)}` }) : null,
        ]),
      ]);
      if (anchors.length && anchors[anchors.length - 1].articleId) {
        const lastAnchor = anchors[anchors.length - 1];
        card.addEventListener('click', () => gotoAnchor(lastAnchor.articleId, lastAnchor));
        card.style.cursor = 'pointer';
      }
      sec.appendChild(card);
    }
    if (list.length > 12) {
      sec.appendChild(el('div', { class: 'hint', style: 'text-align:center', text: `还有 ${list.length - 12} 个` }));
    }
    root.appendChild(sec);
  }

  // 笔记概览（不变）
  if (notes.length) {
    const noteSec = el('div', { class: 'hub-section' });
    const guideCount = notes.filter((n) => n.kind === 'guide').length;
    noteSec.appendChild(el('div', { class: 'hint', text: `共 ${notes.length} 条笔记 · 概念卡 ${notes.length - guideCount} · 导读卡 ${guideCount}` }));

    for (const note of notes.slice(0, 5)) {
      const isGuide = note.kind === 'guide';
      const preview = isGuide
        ? `${(note.items || []).length} 个概念${note.gap ? ' · 含缺口提醒' : ''}`
        : (note.definition || note.inContext || note.quote || '（暂无内容）');
      noteSec.appendChild(el('div', { class: 'pf-note' }, [
        el('div', { class: 'pf-note-head' }, [
          el('span', { class: `pf-note-kind${isGuide ? ' guide' : ''}`, text: isGuide ? '导读卡' : '概念卡' }),
          el('div', { class: 'pf-note-title', text: isGuide ? (note.title || '（未命名导读）') : `「${note.concept}」` }),
          el('span', { class: 'pf-note-time', text: formatTime(note.createdAt) }),
        ]),
        el('div', { class: 'pf-note-body', text: String(preview).slice(0, 120) }),
        el('div', { class: 'pf-note-actions' }, [
          el('button', { class: 'pf-btn', text: '导出 .md', onclick: () => exportNote(note, isGuide ? (note.title || '导读') : note.concept) }),
          el('button', { class: 'pf-btn danger', text: '删除', onclick: async () => {
            await store.deleteNote(note.id);
            toast('已删除这条笔记。');
            await reload();
          } }),
        ]),
      ]));
    }
    if (notes.length > 5) {
      noteSec.appendChild(el('div', { class: 'hint', style: 'text-align:center;margin-top:8px', text: `还有 ${notes.length - 5} 条笔记未显示` }));
    }
    root.appendChild(noteSec);
  }
}

// ------ 收藏夹体检 ------
function renderCheckupModule(root, extras, data) {
  if (extras.length) {
    for (const node of extras) root.appendChild(node);
    return;
  }
  root.appendChild(moduleHeader('activity', '收藏夹体检', '这些收藏里，哪些概念你其实没真懂？'));

  const marks = data.marks || [];
  const unread = (data.articles || []).filter((a) => !a.readToEnd);
  const sec = el('div', { class: 'hub-section' });

  if (marks.length) {
    // 统计
    const uniqueConcepts = new Set(marks.map((m) => m.concept).filter(Boolean));
    sec.appendChild(el('div', { style: 'display:flex;gap:16px;margin-bottom:12px' }, [
      el('div', { style: 'font-size:12px;color:#8590a6', text: `卡点标记：${marks.length} 次` }),
      el('div', { style: 'font-size:12px;color:#8590a6', text: `涉及概念：${uniqueConcepts.size} 个` }),
      el('div', { style: 'font-size:12px;color:#8590a6', text: `涉及文章：${new Set(marks.map((m) => m.articleId).filter(Boolean)).size} 篇` }),
    ]));
    sec.appendChild(el('div', { class: 'hint', text: '从你的阅读足迹里压出的「该补信号」——收藏了，但读到这几处就停了。' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const m of marks) {
      list.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(m.articleId, m) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: `《${ARTICLE_BY_ID.get(m.articleId)?.title || m.articleId || '未知回答'}》` }),
          el('span', { class: 'pf-tag due', text: '没真懂' }),
        ]),
        el('div', { class: 'zb-check-note', text: m.paragraphIndex != null
          ? `你读到第 ${m.paragraphIndex + 1} 段「${m.concept}」就停了——收藏不该是存着不看，而是该补的信号。`
          : `你在这里卡在「${m.concept}」——这正是该补的信号。` }),
      ]));
    }
    sec.appendChild(list);
  } else if (unread.length) {
    sec.appendChild(el('div', { class: 'hint', text: '这几篇你读过但没读完——多半是中间缺了前置概念。回到原文划一下卡住的词，这里就会标出「停在哪一段、卡在哪个概念」。' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const a of unread) {
      list.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(a.id, null) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: a.title || a.link || a.id }),
          el('span', { class: 'pf-tag due', text: '没读完' }),
        ]),
        el('div', { class: 'zb-check-meta', text: '回到原文，把卡住的概念划出来。' }),
      ]));
    }
    sec.appendChild(list);
  } else {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还没有可体检的收藏。去读一篇长文、划几个卡住的词，这里就能看出「哪些概念你其实没真懂」。' }));
  }
  root.appendChild(sec);
}

// 计算推荐阅读计数（与 renderRecommendModule 逻辑一致）
function computeRecommendCount(concepts, articles, zhihuHighLen, diag) {
  if (!concepts.length) return 0;
  // 粗略估算薄弱方向推荐文章数
  let count = 0;
  const weakConceptSet = new Set();
  for (const t of diag.weakTopics) {
    const words = TOPIC_LEXICON[t.name] || [];
    for (const w of words) weakConceptSet.add(w);
  }
  for (const g of diag.suggestedGaps) weakConceptSet.add(g);
  for (const c of concepts || []) {
    if (c.mastery && c.mastery !== 'passed') weakConceptSet.add(c.name);
  }
  const learnedNames = new Set((concepts || []).map((c) => c.name));
  for (const c of concepts || []) {
    for (const pre of c.prerequisites || []) {
      if (pre && !learnedNames.has(pre)) weakConceptSet.add(pre);
    }
  }
  // 统计 ARTICLES 中包含薄弱概念的文章数
  const matchedArticleIds = new Set();
  for (const [id, art] of ARTICLE_BY_ID) {
    for (const wc of weakConceptSet) {
      if (art.body && art.body.includes(wc)) {
        matchedArticleIds.add(id);
        break;
      }
    }
  }
  count = matchedArticleIds.size;
  // 加上已读有概念展开的文章 + 收藏夹高分
  const localReadCount = (articles || []).filter((a) => Array.isArray(a.expandedConcepts) && a.expandedConcepts.length > 0).length;
  count += localReadCount + zhihuHighLen;
  return count;
}

// ------ 推荐阅读 —— 基于薄弱方向推荐对应文章，点击可跳转 ------
function renderRecommendModule(root, concepts, items, articles) {
  const diag = concepts.length ? computeDiagnosisSafe(concepts) : { weakTopics: [], suggestedGaps: [] };
  root.appendChild(moduleHeader('book', '推荐阅读', '根据你的知识薄弱方向推荐对应文章，帮你把缺口补上。'));

  const sec = el('div', { class: 'hub-section' });

  // 建立概念→文章倒排索引（所有已知文章 + 收藏夹高分 + 已读文章）
  const conceptToArticles = new Map(); // 概念名 → [{ id, title }]
  // 从 ARTICLE_BY_ID 注册的文章
  for (const [id, art] of ARTICLE_BY_ID) {
    // 从正文中提取提到的概念名（粗略匹配：概念名出现在 body 中就算）
    for (const c of concepts || []) {
      if (art.body && art.body.includes(c.name)) {
        if (!conceptToArticles.has(c.name)) conceptToArticles.set(c.name, []);
        const existing = conceptToArticles.get(c.name);
        if (!existing.find((e) => e.id === id)) existing.push({ id, title: art.title });
      }
    }
    // 同时也匹配 TOPIC_LEXICON 中的概念名（可能尚未学过）
    for (const [topic, words] of Object.entries(TOPIC_LEXICON)) {
      for (const w of words) {
        if (art.body && art.body.includes(w)) {
          if (!conceptToArticles.has(w)) conceptToArticles.set(w, []);
          const existing = conceptToArticles.get(w);
          if (!existing.find((e) => e.id === id)) existing.push({ id, title: art.title });
        }
      }
    }
  }
  // 也从已读文章的 expandedConcepts 建索引
  for (const a of articles || []) {
    if (!Array.isArray(a.expandedConcepts)) continue;
    for (const cn of a.expandedConcepts) {
      const title = a.title || a.id || cn;
      if (!conceptToArticles.has(cn)) conceptToArticles.set(cn, []);
      const existing = conceptToArticles.get(cn);
      if (!existing.find((e) => e.id === a.id)) existing.push({ id: a.id, title });
    }
  }

  // 收集需要推荐的薄弱概念集（去重）
  const weakConceptSet = new Set();
  // 薄弱主题中的概念
  for (const t of diag.weakTopics) {
    const words = TOPIC_LEXICON[t.name] || [];
    for (const w of words) weakConceptSet.add(w);
  }
  // 概念缺口
  for (const g of diag.suggestedGaps) weakConceptSet.add(g);
  // 已学但尚未掌握的概念（mastery != passed）
  for (const c of concepts || []) {
    if (c.mastery && c.mastery !== 'passed') weakConceptSet.add(c.name);
  }
  // 从尚未学过的概念中取
  const learnedNames = new Set((concepts || []).map((c) => c.name));
  for (const c of concepts || []) {
    for (const pre of c.prerequisites || []) {
      if (pre && !learnedNames.has(pre)) weakConceptSet.add(pre);
    }
  }

  // 为每个薄弱概念推荐文章（去重排序：覆盖薄弱概念越多越靠前）
  const articleScores = new Map(); // articleId → { article: { id, title }, covered: Set<概念名>, score }
  const addArticle = (id, title, coveredConcepts) => {
    if (!id) return;
    if (!articleScores.has(id)) articleScores.set(id, { id, title, covered: new Set(), score: 0 });
    const entry = articleScores.get(id);
    for (const c of coveredConcepts) {
      if (weakConceptSet.has(c)) {
        entry.covered.add(c);
      }
    }
    entry.title = title || entry.title;
  };

  // 对每个薄弱概念，找出包含它的文章
  for (const weakConcept of weakConceptSet) {
    const artList = conceptToArticles.get(weakConcept) || [];
    for (const a of artList) {
      addArticle(a.id, a.title, [weakConcept]);
    }
  }

  // 按覆盖薄弱概念数排序，取 top 8
  const ranked = [...articleScores.values()]
    .filter((e) => e.covered.size > 0)
    .sort((a, b) => b.covered.size - a.covered.size)
    .slice(0, 8);

  // 渲染推荐列表
  if (ranked.length) {
    sec.appendChild(h2('target', '为你推荐'));
    const list = el('div', { class: 'zb-check-list' });
    for (const r of ranked) {
      const coveredList = [...r.covered];
      // 查找该文章的 ARTICLE_BY_ID 中的完整对象，拿到作者等信息
      const fullArt = ARTICLE_BY_ID.get(r.id);
      list.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(r.id, null) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: r.title || fullArt?.title || r.id }),
          el('span', { class: 'pf-tag ok', text: `覆盖 ${coveredList.length} 个薄弱概念` }),
        ]),
        el('div', { class: 'zb-check-meta' }, [
          el('span', { text: `帮你补上：${coveredList.join('、')}` }),
        ]),
        fullArt ? el('div', { class: 'zb-check-note', text: (fullArt.intro || '').slice(0, 90) }) : null,
      ]));
    }
    sec.appendChild(list);
  }

  // 薄弱主题概览
  if (diag.weakTopics.length) {
    sec.appendChild(h2('warning', '薄弱主题', { style: ranked.length ? 'margin-top:16px' : '' }));
    sec.appendChild(el('div', { class: 'hint' }, [el('span', { text: '以下主题掌握率不足 50%，推荐文章已优先覆盖这些方向。' })]));
    sec.appendChild(el('div', {}, diag.weakTopics.map((t) => el('span', { class: 'diag-chip', text: `${t.name}（${t.learned}/${t.total}）` }))));
  }

  // 概念缺口
  if (diag.suggestedGaps.length) {
    sec.appendChild(h2('compass', '学习盲区', { style: (ranked.length || diag.weakTopics.length) ? 'margin-top:16px' : '' }));
    sec.appendChild(el('div', { class: 'hint' }, [el('span', { text: '这些概念你碰到过但还没走通，建议优先补上。' })]));
    sec.appendChild(el('div', {}, diag.suggestedGaps.map((g) => el('span', { class: 'diag-chip', text: g }))));
  }

  // 已读文章回顾（含概念展开的）
  const localReads = (articles || [])
    .filter((a) => Array.isArray(a.expandedConcepts) && a.expandedConcepts.length > 0)
    .sort((x, y) => (y.expandedConcepts?.length || 0) - (x.expandedConcepts?.length || 0))
    .slice(0, 4);
  if (localReads.length) {
    sec.appendChild(h2('bookOpen', '你读过的', { style: (ranked.length || diag.weakTopics.length || diag.suggestedGaps.length) ? 'margin-top:16px' : '' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const a of localReads) {
      list.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(a.id, null) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: a.title || a.link || a.id }),
          el('span', { class: a.readToEnd ? 'pf-tag ok' : 'pf-tag due', text: a.readToEnd ? `读完 · ${a.expandedConcepts?.length || 0} 概念` : '未读完' }),
        ]),
        el('div', { class: 'zb-check-meta', text: `展开了 ${a.expandedConcepts?.length || 0} 个概念。` }),
      ]));
    }
    sec.appendChild(list);
  }

  // 收藏夹高分（来自 getRecommends 的外部接口）
  const zhihuHigh = items.filter((it) => it.score >= 6).slice(0, 5);
  if (zhihuHigh.length) {
    sec.appendChild(h2('star', '收藏夹精选', { style: (ranked.length || localReads.length || diag.weakTopics.length || diag.suggestedGaps.length) ? 'margin-top:16px' : '' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const it of zhihuHigh) {
      list.appendChild(el('div', { class: 'zb-check-item' }, [
        el('div', { class: 'zb-check-head' }, [
          el('a', { class: 'zb-check-title', href: it.url, target: '_blank', rel: 'noopener noreferrer', text: it.title }),
          el('span', { class: `zb-lv lv-${it.level}`, text: `值得精读 · ${it.score}分` }),
        ]),
        el('div', { class: 'zb-check-note', text: (it.excerpt || '').slice(0, 90) }),
      ]));
    }
    sec.appendChild(list);
  }

  // 终极兜底
  if (!ranked.length && !localReads.length && !zhihuHigh.length && !diag.suggestedGaps.length && !diag.weakTopics.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还攒不出推荐。去读一篇长文、划几个卡住的词，这里就有推荐了。' }));
  }
  root.appendChild(sec);
}

// ------ 入口装配 ------
// graph=false 用于扩展内独立页（MV3 CSP 禁远程脚本，图谱库加载不了）
// extra：插件版个人中心插入的知乎区块（账号/收藏夹），放进「收藏夹体检」模块
// getRecommends：取收藏夹高分文章的读取器
// 返回 { refresh }
export async function renderProfile(app, { graph = true, extra = null, getRecommends = null } = {}) {
  const extras = [].concat(extra || []).filter(Boolean);
  const items = typeof getRecommends === 'function' ? getRecommends : () => [];

  let current = 'home';
  let concepts = [];
  let notes = [];
  let articles = [];
  let guides = [];
  let marks = [];
  let lastReviewAt = 0;

  const nav = el('nav', { class: 'pf-nav' });
  const main = el('div', { class: 'pf-main hub-layout' });
  app.replaceChildren(el('div', { class: 'pf-layout' }, [nav, main]));

  async function loadAll() {
    concepts = await store.listConcepts();
    notes = await store.listNotes();
    articles = await store.listArticleRecords();
    guides = await store.listGuides();
    marks = await store.listStuckMarks();
    lastReviewAt = await store.getLastReviewAt();
  }

  const go = (id) => { current = id; render(); };
  const reload = async () => { await loadAll(); render(); };

  function render() {
    nav.replaceChildren(...MODULES.map((m) => el('div', {
      class: `pf-nav-item${m.id === current ? ' active' : ''}`,
      onclick: () => go(m.id),
    }, [
      icon(m.icon),
      el('span', { text: m.label }),
    ])));

    main.replaceChildren();
    if (current === 'footprint') return renderFootprintModule(main, concepts, articles, guides, { marks, lastReviewAt });
    if (current === 'checkup') return renderCheckupModule(main, extras, { articles, marks });
    if (current === 'cards') return renderCardModule(main, concepts, notes, reload);
    if (current === 'recommend') return renderRecommendModule(main, concepts, items(), articles);
    return renderHomeModule(main, concepts, extras, items(), go, { notes, articles, guides, marks, lastReviewAt });
  }

  await loadAll();
  render();
  return { refresh: reload };
}
