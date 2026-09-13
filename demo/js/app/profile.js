// 个人中心：侧边栏 + 模块化视图（首页 / 收藏体检 / 推荐阅读 / 学习数据 / 我的笔记 / 学习复盘 / 阅读足迹）。
// 首页给出各模块的简要板块，点击可跳转到对应模块详情。
// 复用 hub.js 的区块、core/review 的复盘口径、core/srs 的间隔重复、notes 的导出技能；数据全部来自本地 store。

import { el, toast } from './ui.js';
import * as store from './store.js';
import { computeDiagnosis } from '../core/graph.js';
import { buildWeeklyReview } from '../core/review.js';
import { isDue } from '../core/srs.js';
import { formatTime } from '../core/note.js';
import { exportNote } from './notes.js';
// §6 困惑双面镜：卡点数字一律走 core/stuck 的三源标注，绝不用 seed 冒充社区（§6.6）。
import { mergeStuck, formatCount, stuckSourceLabel, STUCK_LOCAL_LABEL } from '../core/stuck.js';
import { ARTICLE_BY_ID } from '../data/articles.js';

// 复用 hub.js 的区块：时间轴、思维导图、诊断
import { renderGraphSection, renderTimelineSection, gotoAnchor } from './hub.js';

const MODULES = [
  { id: 'home', icon: '🏠', label: '首页' },
  { id: 'contribution', icon: '🤝', label: '我的贡献' },
  { id: 'checkup', icon: '🩺', label: '收藏体检' },
  { id: 'recommend', icon: '📚', label: '推荐阅读' },
  { id: 'data', icon: '📈', label: '学习数据' },
  { id: 'notes', icon: '📝', label: '我的笔记' },
  { id: 'review', icon: '🔁', label: '学习复盘' },
  { id: 'footprint', icon: '🧭', label: '阅读足迹' },
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

// 本地上报按概念聚合（首屏叙事 / 贡献模块共用）：按「你卡了几次」降序。
function groupLocalMarks(marks, limit = null) {
  const map = new Map();
  for (const m of marks || []) {
    if (!m || !m.concept) continue;
    const cur = map.get(m.concept) || { concept: m.concept, count: 0, articles: new Set() };
    cur.count += 1;
    if (m.articleId) cur.articles.add(m.articleId);
    map.set(m.concept, cur);
  }
  const list = [...map.values()].sort((a, b) => b.count - a.count || a.concept.localeCompare(b.concept));
  return limit == null ? list : list.slice(0, limit);
}

// 贡献总览的诚实口径：只统计本机真实上报，绝不把 seed/演示数据算成「你的贡献」（§6.6）。
function contributionSummary(marks) {
  const articles = new Set();
  const concepts = new Set();
  for (const m of marks || []) {
    if (!m) continue;
    if (m.articleId) articles.add(m.articleId);
    if (m.concept) concepts.add(m.concept);
  }
  return { marks: (marks || []).length, articles: articles.size, concepts: concepts.size };
}

// listStuckMarks 给的是全站扁平列表，而 mergeStuck 只认「本篇」的上报——先按篇过滤再聚合。
function marksFor(articleId, marks) {
  return (marks || []).filter((m) => m && m.articleId === articleId);
}

// 某概念在其所属回答里的聚合卡点（含 seed/本地/社区计数与来源标签），拿不到返回 null。
function mergedConcept(articleId, concept, marks) {
  if (!articleId) return null;
  return mergeStuck(articleId, marksFor(articleId, marks), null).find((s) => s.concept === concept) || null;
}

// 时间线用的短日期（9/10），与 core/note 的完整时间戳区分开。
function formatDay(ts) {
  const d = new Date(Number(ts) || Date.now());
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 文章标题（贡献地图/时间线里回指原文用），拿不到就退回 id。
function articleTitle(articleId) {
  return ARTICLE_BY_ID.get(articleId)?.title || articleId || '未知回答';
}

// 首页：§6.2/§6.3 首屏先讲「你卡住的地方，也是别人的卡点」——飞轮叙事在前，功能入口退为次级导航。
function renderHomeModule(root, concepts, extras, items, go, data) {
  const gaps = concepts.length ? computeDiagnosis(concepts).suggestedGaps : [];
  const recCount = items.filter((it) => it.score >= 6).length + gaps.length;
  const dueCount = concepts.filter((c) => c.review && isDue(c.review)).length;
  const masteryRate = concepts.length ? buildWeeklyReview({ concepts, lastReviewAt: data.lastReviewAt }).masteryRate : 0;

  const topLocal = groupLocalMarks(data.marks, 3);
  const notFinished = data.articles.filter((a) => !a.readToEnd).length;

  // §6.2 首句：把 C1 飞轮、S1 困惑数据空白、S4 闭环，在个人视角里一次讲透。
  const hero = el('div', { class: 'hub-hero pf-hero' }, [el('h1', { text: '🧭 个人中心' })]);
  if (topLocal.length) {
    const t = topLocal[0];
    const articleId = [...t.articles][0];
    const merged = mergedConcept(articleId, t.concept, data.marks);
    const n = merged ? merged.count : t.count;
    hero.appendChild(el('div', { class: 'pf-lead', html:
      `你卡住的地方，已经有 <b>${formatCount(n)}</b> 个人也卡住了——而你刚才划的那一下，正在帮下一个读到的人少卡一次。` }));
    hero.appendChild(el('div', { class: 'pf-source', text: `数据来源：${merged ? stuckSourceLabel(merged) : STUCK_LOCAL_LABEL}` }));
  } else {
    hero.appendChild(el('div', { class: 'pf-lead', text:
      '还没有你的卡点记录。去文章里划一下不懂的概念——那一划，会帮下一个读到这里的人少卡一次。' }));
  }
  if (data.articles.length && notFinished > 0) {
    hero.appendChild(el('div', { class: 'pf-sub', html:
      `你读过的长文里，有 <b>${notFinished}</b> 篇没读完。不是你的问题——是这几个概念，缺了前置。` }));
  }
  root.appendChild(hero);

  // §6.3 你最常卡住的 3 个概念：每个都带上「你卡了几次」与「该篇同卡多少人」，来源如实标注。
  const conceptSec = el('div', { class: 'hub-section' });
  conceptSec.appendChild(el('h2', { text: '🔴 你最常卡住的 3 个概念' }));
  if (topLocal.length) {
    conceptSec.appendChild(el('div', { class: 'pf-concepts' }, topLocal.map((t) => {
      const articleId = [...t.articles][0];
      const merged = mergedConcept(articleId, t.concept, data.marks);
      const all = articleId ? mergeStuck(articleId, marksFor(articleId, data.marks), null) : [];
      const rank = merged ? all.findIndex((s) => s.concept === t.concept) + 1 : 0;
      return el('div', { class: 'pf-concept-card' }, [
        el('div', { class: 'pf-concept-name', text: t.concept }),
        el('div', { class: 'pf-concept-mine', text: `你共卡 ${t.count} 次` }),
        merged ? el('div', { class: 'pf-concept-comm', text: `该篇第 ${rank} 卡点 · 共 ${formatCount(merged.count)} 人同卡` }) : null,
        el('div', { class: 'pf-concept-src', text: `来源：${merged ? stuckSourceLabel(merged) : STUCK_LOCAL_LABEL}` }),
      ]);
    })));
  } else {
    conceptSec.appendChild(el('div', { class: 'hub-empty', text: '还没有卡点记录。在文章里选中不懂的概念、点「卡了一下」，这里就会记下来。' }));
  }
  root.appendChild(conceptSec);

  // §6.3 你的贡献：只如实展示本机上报；社区聚合要等 /stuck 持久化接通（C1）。
  const sum = contributionSummary(data.marks);
  const contribSec = el('div', { class: 'hub-section' });
  contribSec.appendChild(el('h2', { text: '🤝 你的贡献' }));
  contribSec.appendChild(el('div', { class: 'pf-lead', html:
    `你标记了 <b>${sum.marks}</b> 个卡点，覆盖 <b>${sum.articles}</b> 篇回答、<b>${sum.concepts}</b> 个概念。` }));
  contribSec.appendChild(el('div', { class: 'pf-source', text: `数据来源：${STUCK_LOCAL_LABEL}` }));
  contribSec.appendChild(el('div', { class: 'hint', text:
    '「被多少人看到、帮到多少人」要等 /stuck 持久化接通（方案 C1）后才有真实聚合；当前演示环境只如实展示你自己的上报，绝不用预置数据冒充社区。' }));
  contribSec.appendChild(el('div', { class: 'pf-link', text: '查看我的贡献 →', onclick: () => go('contribution') }));
  root.appendChild(contribSec);

  // 功能入口退为次级导航，不再抢首屏。
  const card = (icon, title, desc, target) => el('div', { class: 'pf-card', onclick: () => go(target) }, [
    el('div', { class: 'pf-card-icon', text: icon }),
    el('div', { class: 'pf-card-title', text: title }),
    el('div', { class: 'pf-card-desc', text: desc }),
    el('div', { class: 'pf-card-more', text: '查看详情 →' }),
  ]);
  root.appendChild(el('div', { class: 'hub-section' }, [
    el('h2', { text: '更多功能' }),
    el('div', { class: 'pf-cards' }, [
      card('🩺', '收藏体检', items.length
        ? `本次体检最近 ${items.length} 篇收藏`
        : (extras.length ? '正在读取收藏夹…' : '这些收藏里，哪些概念你其实没真懂'), 'checkup'),
      card('📚', '推荐阅读', recCount ? `为你挑出 ${recCount} 条` : '暂无推荐，先去读几篇', 'recommend'),
      card('📈', '学习数据', concepts.length ? `已积累 ${concepts.length} 个概念` : '还没有学习记录', 'data'),
      card('📝', '我的笔记', data.notes.length ? `已沉淀 ${data.notes.length} 张卡片` : '还没有笔记卡片', 'notes'),
      card('🔁', '学习复盘', dueCount ? `${dueCount} 个概念待回访` : `掌握率 ${Math.round(masteryRate * 100)}%`, 'review'),
      card('🧭', '阅读足迹', data.articles.length ? `读过 ${data.articles.length} 篇回答` : '还没有阅读记录', 'footprint'),
    ]),
  ]));
}

// 我的贡献（§6.4）：把「你帮到了多少人」做成可下钻的模块。
// 诚实红线（§6.6）：被看到次数 / 帮到人数依赖 /stuck 持久化（C1），未接通前只如实展示本机上报，
// 绝不用 seed 冒充社区；每个社区数字都由 stuckSourceLabel 标注来源。
function renderContributionModule(root, marks) {
  root.appendChild(moduleHeader('🤝', '我的贡献', '你划下的每个卡点，都在帮下一个读到的人少卡一次。'));

  const sum = contributionSummary(marks);

  // 贡献总览：C1 未接通，不编造「被看到 / 帮到」数字，只给本机真实上报口径。
  const overview = el('div', { class: 'hub-section' });
  overview.appendChild(el('div', { class: 'pf-stat-row' }, [
    statCard(String(sum.marks), '本机上报的卡点'),
    statCard(String(sum.articles), '覆盖的回答'),
    statCard(String(sum.concepts), '涉及的概念'),
  ]));
  overview.appendChild(el('div', { class: 'hint', text:
    '「被多少人看到、帮到多少人」要等 /stuck 持久化接通（方案 C1）后才有真实聚合。当前演示环境只如实展示你自己的上报，不用预置数据冒充社区。' }));
  root.appendChild(overview);

  if (!sum.marks) {
    root.appendChild(el('div', { class: 'hub-section' }, [
      el('div', { class: 'hub-empty', text: '还没有你的卡点记录。去文章里选中不懂的概念、点「卡了一下」，这里就会攒起来。' }),
    ]));
    return;
  }

  // 卡点地图：你标过的每个概念，在所属回答里排第几、有多少人同卡（来源如实标注）。
  const mapSec = el('div', { class: 'hub-section' });
  mapSec.appendChild(el('h2', { text: '🗺️ 卡点地图' }));
  mapSec.appendChild(el('div', { class: 'hint', text: '你标过的每个概念，在它所属回答里排第几卡点、有多少人同卡。' }));
  const mapList = el('div', { class: 'pf-map-list' });
  for (const t of groupLocalMarks(marks)) {
    const latest = marks.find((m) => m.concept === t.concept);
    const merged = mergedConcept(latest?.articleId, t.concept, marks);
    const all = latest?.articleId ? mergeStuck(latest.articleId, marksFor(latest.articleId, marks), null) : [];
    const rank = merged ? all.findIndex((s) => s.concept === t.concept) + 1 : 0;
    const title = latest?.articleId ? articleTitle(latest.articleId) : '';
    mapList.appendChild(el('div', { class: 'pf-map-item' }, [
      el('div', { class: 'pf-map-head' }, [
        el('span', { class: 'pf-map-name', text: t.concept }),
        el('span', { class: 'pf-map-mine', text: `你卡 ${t.count} 次` }),
      ]),
      merged
        ? el('div', { class: 'pf-map-meta', text: `《${title}》第 ${rank} 卡点 · 共 ${formatCount(merged.count)} 人同卡` })
        : el('div', { class: 'pf-map-meta', text: latest?.articleId ? `《${title}》· 暂无该篇聚合` : '暂无归属回答' }),
      el('div', { class: 'pf-map-src', text: `来源：${merged ? stuckSourceLabel(merged) : STUCK_LOCAL_LABEL}` }),
    ]));
  }
  mapSec.appendChild(mapList);
  root.appendChild(mapSec);

  // 时间线：按上报时间倒序，"9/10 你卡在「链式法则」→ 该篇现有 N 人同卡"，让飞轮有迹可循。
  const tlSec = el('div', { class: 'hub-section' });
  tlSec.appendChild(el('h2', { text: '🕒 时间线' }));
  tlSec.appendChild(el('div', { class: 'hint', text: '你每次划下的卡点，都对应着这一篇当下的同卡人数。' }));
  const tl = el('div', { class: 'pf-timeline' });
  for (const m of marks) {
    const merged = mergedConcept(m.articleId, m.concept, marks);
    const count = merged ? merged.count : 1;
    const line = el('div', { class: 'pf-tl-line' }, [
      el('span', { text: '你卡在「' }),
      el('b', { text: m.concept }),
      el('span', { text: '」' }),
      m.paragraphIndex != null ? el('span', { class: 'pf-tl-para', text: ` · 第 ${m.paragraphIndex + 1} 段` }) : null,
    ]);
    tl.appendChild(el('div', { class: 'pf-tl-item' }, [
      el('span', { class: 'pf-tl-date', text: formatDay(m.at) }),
      el('div', { class: 'pf-tl-body' }, [
        line,
        el('div', { class: 'pf-tl-sub', text:
          `该篇现有 ${formatCount(count)} 人同卡 · 来源：${merged ? stuckSourceLabel(merged) : STUCK_LOCAL_LABEL}` }),
      ]),
    ]));
  }
  tlSec.appendChild(tl);
  root.appendChild(tlSec);
}

// 收藏体检（§6.5）：重定位为「这些收藏里，哪些概念你其实没真懂？」——把收藏与困惑数据打通。
// Demo 无登录态时，用本地足迹压出「读过但没读完、卡在第几段哪个概念」，不让这一格空死。
function renderCheckupModule(root, extras, data) {
  if (extras.length) {
    for (const node of extras) root.appendChild(node);
    return;
  }
  root.appendChild(moduleHeader('🩺', '收藏体检', '这些收藏里，哪些概念你其实没真懂？'));

  const marks = data.marks || [];
  const unread = (data.articles || []).filter((a) => !a.readToEnd);
  const sec = el('div', { class: 'hub-section' });

  if (marks.length) {
    sec.appendChild(el('div', { class: 'hint', text: '从你的阅读足迹里压出的「该补信号」——收藏了，但读到这几处就停了。' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const m of marks) {
      list.appendChild(el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(m.articleId, m) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: `《${articleTitle(m.articleId)}》` }),
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

// 数值卡片：复用 IglooStats 的排版口径，这里抽成复用函数
function statCard(value, label) {
  return el('div', { class: 'pf-stat' }, [
    el('div', { class: 'pf-stat-value', text: value }),
    el('div', { class: 'pf-stat-label', text: label }),
  ]);
}

// 我的笔记：本地笔记卡片（概念卡 / 导读卡），一键导出 .md 或删除。
// 复用 store.listNotes / deleteNote、notes.js 的 exportNote、core/note 的时间格式化。
function renderNotesModule(root, notes, reload) {
  root.appendChild(moduleHeader('📝', '我的笔记', '划词解释和导读都能存成卡片，随手导出 Markdown。'));

  const sec = el('div', { class: 'hub-section' });
  if (!notes.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还没有笔记。文章里选中概念后点「存笔记」，或生成导读时导出，这里就会攒起来。' }));
    root.appendChild(sec);
    return;
  }

  const guideCount = notes.filter((n) => n.kind === 'guide').length;
  sec.appendChild(el('div', { class: 'hint', text: `共 ${notes.length} 张卡片 · 概念卡 ${notes.length - guideCount} · 导读卡 ${guideCount}` }));

  for (const note of notes) {
    const isGuide = note.kind === 'guide';
    const preview = isGuide
      ? `${(note.items || []).length} 个概念${note.gap ? ' · 含缺口提醒' : ''}`
      : (note.definition || note.inContext || note.quote || '（暂无内容）');
    sec.appendChild(el('div', { class: 'pf-note' }, [
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
  root.appendChild(sec);
}

// 学习复盘：复用 core/review 的每周复盘口径 + core/srs 的间隔重复，
// 给出掌握率 / 待巩固 / 待回访，以及「最该补」的概念；「标记为已复盘」写回 store。
function renderReviewModule(root, concepts, lastReviewAt, reload) {
  root.appendChild(moduleHeader('🔁', '学习复盘', '按记忆曲线找回该复习的概念，顺带看看这一周走得怎么样。'));

  if (!concepts.length) {
    root.appendChild(el('div', { class: 'hub-section' }, [
      el('div', { class: 'hub-empty', text: '还没有学习记录，暂时没得复盘。先去文章里划几个词。' }),
    ]));
    return;
  }

  const summary = buildWeeklyReview({ concepts, lastReviewAt });
  const due = concepts
    .filter((c) => c.review && isDue(c.review))
    .sort((a, b) => (a.review.nextReviewAt || 0) - (b.review.nextReviewAt || 0));

  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('div', { class: 'pf-stat-row' }, [
    statCard(`${Math.round(summary.masteryRate * 100)}%`, '掌握率'),
    statCard(String(summary.stalledCount), '待巩固'),
    statCard(String(due.length), '待回访'),
    statCard(`${summary.daysSince} 天`, '距上次复盘'),
  ]));
  sec.appendChild(el('div', { class: 'hint', text: summary.shouldPush
    ? '距上次复盘已满一周，建议花两分钟过一遍下面这些概念。'
    : '还没到下一次复盘时间，先按下面的待回访清单维持记忆。' }));

  if (due.length) {
    sec.appendChild(el('h2', { text: '⏰ 到了该回访的时候' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const c of due) {
      const last = Array.isArray(c.anchors) && c.anchors.length ? c.anchors[c.anchors.length - 1] : null;
      list.appendChild(el('div', { class: 'zb-check-item' }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: c.name }),
          el('span', { class: 'pf-tag due', text: `已到期 · 第 ${(c.review.reviewCount || 0) + 1} 次` }),
          last ? el('span', { class: 'pf-link', text: '回原文 →', onclick: () => gotoAnchor(last.articleId, last) }) : null,
        ]),
        c.definition ? el('div', { class: 'zb-check-note', text: String(c.definition).slice(0, 100) }) : null,
      ]));
    }
    sec.appendChild(list);
  }

  if (summary.topGaps.length) {
    sec.appendChild(el('h2', { text: '🎯 最该补的', style: 'margin-top:16px' }));
    sec.appendChild(el('div', { class: 'hint', text: '被反复提到、但你还没走通的概念。' }));
    sec.appendChild(el('div', {}, summary.topGaps.map((g) => el('span', { class: 'diag-chip', text: g }))));
  }

  if (!due.length && !summary.topGaps.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '暂时没有到期的回访，也没有明显的知识缺口，保持节奏就好！' }));
  }

  sec.appendChild(el('div', { class: 'pf-note-actions', style: 'margin-top:16px' }, [
    el('button', { class: 'pf-btn', text: '标记为已复盘', onclick: async () => {
      await store.markReviewShown(Date.now());
      toast('已记录本次复盘时间。');
      await reload();
    } }),
  ]));
  root.appendChild(sec);
}

// 阅读足迹：本地文章记录 + 生成的导读，串起「读过什么、提过什么」。
function renderFootprintModule(root, articles, guides) {
  root.appendChild(moduleHeader('🧭', '阅读足迹', '读过的回答、提过的问题、生成的导读，都在这里。'));

  const readToEnd = articles.filter((a) => a.readToEnd).length;
  const quizCount = articles.reduce((n, a) => n + (a.quizzes || []).length, 0);

  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('div', { class: 'pf-stat-row' }, [
    statCard(String(articles.length), '读过的回答'),
    statCard(String(readToEnd), '读完的'),
    statCard(String(quizCount), '提问次数'),
    statCard(String(guides.length), '生成的导读'),
  ]));

  if (!articles.length && !guides.length) {
    sec.appendChild(el('div', { class: 'hub-empty', text: '还没有阅读记录。打开一篇知乎回答读一读，这里就会留下足迹。' }));
    root.appendChild(sec);
    return;
  }

  if (articles.length) {
    sec.appendChild(el('h2', { text: '📖 读过的回答' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const a of [...articles].sort((x, y) => (y.firstReadAt || 0) - (x.firstReadAt || 0))) {
      const concepts = Array.isArray(a.expandedConcepts) ? a.expandedConcepts.length : 0;
      const quizzes = (a.quizzes || []).length;
      const item = el('div', { class: 'zb-check-item', style: 'cursor:pointer', onclick: () => gotoAnchor(a.id, null) }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: a.title || a.link || a.id }),
          a.readToEnd ? el('span', { class: 'pf-tag ok', text: '读完' }) : null,
          el('span', { class: 'pf-note-time', text: formatTime(a.firstReadAt) }),
        ]),
        el('div', { class: 'zb-check-meta', text: `展开 ${concepts} 个概念 · 提问 ${quizzes} 次` }),
      ]);
      list.appendChild(item);
    }
    sec.appendChild(list);
  }

  if (guides.length) {
    sec.appendChild(el('h2', { text: '🧾 生成的导读', style: 'margin-top:16px' }));
    const list = el('div', { class: 'zb-check-list' });
    for (const g of [...guides].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))) {
      list.appendChild(el('div', { class: 'zb-check-item' }, [
        el('div', { class: 'zb-check-head' }, [
          el('span', { class: 'zb-check-title', text: g.title || '（未命名导读）' }),
          el('span', { class: 'pf-note-time', text: formatTime(g.updatedAt) }),
        ]),
        el('div', { class: 'zb-check-meta', text: `涵盖 ${(g.items || []).length} 个概念${g.gap ? ` · 缺口：${g.gap}` : ''}` }),
      ]));
    }
    sec.appendChild(list);
  }

  root.appendChild(sec);
}

// graph=false 用于扩展内独立页：MV3 CSP 禁远程脚本，图谱库加载不了，区块先不挂。
// extra：插件版个人中心插入的额外区块（知乎账号 / 收藏夹），放进「收藏体检」模块。
// getRecommends：取收藏夹高分文章的读取器（插件版由 profile-zhihu.js 回填，demo 为空）。
// 返回 { refresh }，供外部数据到位后重渲染当前模块。
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

  // 一次性读齐各模块要用的本地数据；写操作（删笔记 / 标记复盘）后重读再重绘。
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
      el('span', { class: 'pf-nav-icon', text: m.icon }),
      el('span', { text: m.label }),
    ])));

    main.replaceChildren();
    if (current === 'contribution') return renderContributionModule(main, marks);
    if (current === 'checkup') return renderCheckupModule(main, extras, { articles, marks });
    if (current === 'recommend') return renderRecommendModule(main, concepts, items());
    if (current === 'data') return renderDataModule(main, concepts, graph);
    if (current === 'notes') return renderNotesModule(main, notes, reload);
    if (current === 'review') return renderReviewModule(main, concepts, lastReviewAt, reload);
    if (current === 'footprint') return renderFootprintModule(main, articles, guides);
    return renderHomeModule(main, concepts, extras, items(), go, { notes, articles, guides, marks, lastReviewAt });
  }

  await loadAll();
  render();
  return { refresh: reload };
}
