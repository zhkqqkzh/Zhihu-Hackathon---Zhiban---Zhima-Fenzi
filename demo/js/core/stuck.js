// 卡点数据层（改造方案 §三「把困惑从私有消耗品变成社区公共品」）。
// 纯函数，不碰 DOM / localStorage（铁律 3）；读写统一走 app/store.js。
// 数据来源必须可追溯（验收 §七-6），两类绝不混淆：
//   seed  —— 演示环境预置数据，界面标注「演示环境数据」；
//   marks —— 本浏览器现场真实上报，界面标注「你的上报」。
// 单篇卡点 = seed + marks 叠加，聚合与 TOP N 全部在这里算，界面只负责渲染。

export const STUCK_SEED_LABEL = '演示环境数据';
export const STUCK_LOCAL_LABEL = '你的上报';

// 人数展示统一走千分位（改造方案 §4.1 的「1,283」写法），4.1/4.2/4.3/4.4 共用。
export function formatCount(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// 预置 seed：每篇回答的读者卡点。
// paragraphIndex 对齐 core/selectors.js 的 paragraph 选择器顺序，
// concept 逐字取自 demo/js/data/articles.js 的正文，保证「点一下」能跳回真实段落。
export const STUCK_SEED = {
  'article-backprop': [
    { concept: '链式法则', paragraphIndex: 1, count: 1283 },
    { concept: '损失函数', paragraphIndex: 3, count: 964 },
    { concept: '梯度下降', paragraphIndex: 4, count: 712 },
    { concept: '偏导数', paragraphIndex: 9, count: 388 },
  ],
  'article-gradient-descent': [
    { concept: '梯度', paragraphIndex: 5, count: 1036 },
    { concept: '偏导数', paragraphIndex: 6, count: 742 },
    { concept: '学习率', paragraphIndex: 11, count: 508 },
  ],
  'article-derivative': [
    { concept: '极限', paragraphIndex: 3, count: 486 },
    { concept: '切线', paragraphIndex: 5, count: 402 },
    { concept: '偏导数', paragraphIndex: 9, count: 361 },
  ],
};

// 演示环境：把知乎回答链接映射到 Demo 文章，供 4.4 答主视角页的入口使用。
// 这些 ID 是演示入口的一部分，不是真实知乎回答的引用；界面标注「演示环境数据」。
const ANSWER_TO_ARTICLE = {
  3489210567: 'article-backprop',
  3491055233: 'article-gradient-descent',
  3492867410: 'article-derivative',
};

// 把「用户粘贴的东西」解析成 Demo 文章 ID：
// 支持站内 hash 链接（#/article/xxx）与知乎回答链接（zhihu.com/question/x/answer/123）。
// 认不出来返回 ''，调用方据此给诚实的空状态，不硬凑数据。
export function articleIdFromLink(link) {
  const s = String(link || '').trim();
  if (!s) return '';
  const internal = /\/article\/([A-Za-z0-9_-]+)/.exec(s);
  if (internal) return internal[1];
  const answer = /\/answer\/(\d+)/.exec(s);
  if (answer) return ANSWER_TO_ARTICLE[answer[1]] || '';
  return '';
}

// 把 seed 与本地上报叠加成一份卡点列表（按卡住人数降序）。
// topN 为 null 时返回全部。返回的是新对象，调用方改不到常量。
export function mergeStuck(articleId, marks = [], topN = null) {
  const map = new Map();
  for (const s of STUCK_SEED[articleId] || []) {
    map.set(s.concept, {
      articleId, concept: s.concept,
      paragraphIndex: s.paragraphIndex, startOffset: 0, endOffset: 0,
      count: s.count, seedCount: s.count, localCount: 0,
    });
  }
  for (const m of marks || []) {
    if (!m || !m.concept) continue;
    const cur = map.get(m.concept);
    if (cur) {
      cur.count += 1;
      cur.localCount += 1;
      // 真实上报带着更准的锚点（原文段落 + 段内偏移），优先于 seed 的段落索引。
      if (m.paragraphIndex != null) {
        cur.paragraphIndex = m.paragraphIndex;
        cur.startOffset = m.startOffset || 0;
        cur.endOffset = m.endOffset || 0;
      }
    } else {
      map.set(m.concept, {
        articleId, concept: m.concept,
        paragraphIndex: m.paragraphIndex ?? 0, startOffset: m.startOffset || 0, endOffset: m.endOffset || 0,
        count: 1, seedCount: 0, localCount: 1,
      });
    }
  }
  const list = [...map.values()].sort((a, b) => b.count - a.count || a.concept.localeCompare(b.concept));
  return topN == null ? list : list.slice(0, topN);
}

// 某概念在某篇的卡住人数（seed + 本地），4.2 浮层用。
export function stuckCount(articleId, concept, marks = []) {
  const seed = (STUCK_SEED[articleId] || []).find((s) => s.concept === concept);
  const local = (marks || []).filter((m) => m?.concept === concept).length;
  return (seed?.count || 0) + local;
}

// 本浏览器是否已经在这一篇上报过这个词（同一篇同一个词只 +1 一次）。
export function hasStuckMark(marks = [], concept) {
  return (marks || []).some((m) => m?.concept === concept);
}

// 数据来源标签（§4.5 / 验收 §七-6）：seed 与现场上报叠加时同时标出，
// 绝不把演示数据冒充成真实统计。4.1/4.3/4.4 共用，避免各写一份。
export function stuckSourceLabel(item) {
  const seed = (item?.seedCount || 0) > 0;
  const local = (item?.localCount || 0) > 0;
  if (seed && local) return `${STUCK_SEED_LABEL} + ${STUCK_LOCAL_LABEL}`;
  return seed ? STUCK_SEED_LABEL : STUCK_LOCAL_LABEL;
}

// 首页三秒洞察（改造方案 §4.1）：赞数取真实文章数据，卡点数取 seed/上报，
// 全部可追溯。返回 null 表示这篇没有卡点数据——调用方不该硬凑。
// share = 第一大卡点占本篇全部卡点的比例，让「卡住他们的是同一个词」这句话有数字兜底。
export function topStuckInsight(articleId, article, marks = []) {
  const all = mergeStuck(articleId, marks);
  const top = all[0];
  if (!top) return null;
  const totalStuck = all.reduce((n, s) => n + s.count, 0);
  return {
    ...top, // 含 count/seedCount/localCount，调用方可直接判来源（stuckSourceLabel）
    paragraph: (top.paragraphIndex ?? 0) + 1, // 面向读者的段号从 1 起
    voteupCount: article?.voteupCount || 0,
    title: article?.title || '',
    totalStuck,
    share: totalStuck ? Math.round((top.count / totalStuck) * 100) : 0,
  };
}

// 答主视角报告（改造方案 §4.4）：一份回答的读者卡点报告。
// totalStuck 是「本篇全部卡点」，topStuck 才是展示的这三处合计——两个数分开，
// 因为界面上的 share 写的是「占全部卡点的 X%」，分母必须是全部（验收 §七-6：数字要说清从哪来）。
export function buildCreatorReport(articleId, article, marks = [], topN = 3) {
  const all = mergeStuck(articleId, marks);
  const items = all.slice(0, topN);
  const totalStuck = all.reduce((n, s) => n + s.count, 0);
  const topStuck = items.reduce((n, s) => n + s.count, 0);
  return {
    articleId,
    title: article?.title || '',
    author: article?.author || '',
    voteupCount: article?.voteupCount || 0,
    totalStuck,
    topStuck,
    hasData: items.length > 0,
    items: items.map((s) => ({ ...s, share: totalStuck ? Math.round((s.count / totalStuck) * 100) : 0 })),
  };
}
