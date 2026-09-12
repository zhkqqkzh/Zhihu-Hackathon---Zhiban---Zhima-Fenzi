// 每周复盘（计划书第 3 条「沉淀被动化」）：纯函数，不碰 DOM / 存储 / 网络。
// 输入本地已存的概念记录，输出一份零操作推给用户的极简复盘。
// 触发口径：距上次复盘 ≥7 天；从未复盘过则以最早的概念记录时间为基线。

export const REVIEW_INTERVAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// 复盘基线：上次复盘时间；首次复盘用最早的概念记录时间（不是「今天」）。
function reviewBaseline(concepts, lastReviewAt) {
  const last = Number(lastReviewAt) || 0;
  if (last) return last;
  let min = 0;
  for (const c of concepts || []) {
    const t = Number(c && c.firstAskedAt) || 0;
    if (t && (min === 0 || t < min)) min = t;
  }
  return min;
}

export function isReviewDue(concepts, lastReviewAt, now = Date.now()) {
  if (!concepts || concepts.length === 0) return false;
  const base = reviewBaseline(concepts, lastReviewAt);
  if (!base) return false;
  return now - base >= REVIEW_INTERVAL_DAYS * DAY_MS;
}

// 最该补的概念：先补「被提到但从没记过」的前置概念，再按最近卡住的排。
export function pickTopGaps(concepts, limit = 3) {
  const list = concepts || [];
  const known = new Set(list.map((c) => c.name));
  const gaps = [];
  for (const c of list) {
    for (const pre of c.prerequisites || []) {
      if (pre && !known.has(pre) && gaps.indexOf(pre) < 0) gaps.push(pre);
    }
  }
  const stalled = list
    .filter((c) => c.mastery !== 'passed')
    .sort((a, b) => (Number(b.firstAskedAt) || 0) - (Number(a.firstAskedAt) || 0));
  for (const c of stalled) {
    if (gaps.length >= limit) break;
    if (gaps.indexOf(c.name) < 0) gaps.push(c.name);
  }
  return gaps.slice(0, limit);
}

// 一次完整复盘摘要。now 显式传入，便于测试与「距上次 7 天」的确定性。
export function buildWeeklyReview({ concepts, lastReviewAt, now = Date.now() } = {}) {
  const list = concepts || [];
  const base = reviewBaseline(list, lastReviewAt);
  const total = list.length;
  const passed = list.filter((c) => c.mastery === 'passed').length;
  return {
    shouldPush: isReviewDue(list, lastReviewAt, now),
    daysSince: base ? Math.floor((now - base) / DAY_MS) : 0,
    total,
    stalledCount: total - passed,
    masteryRate: total ? Math.round((passed / total) * 100) / 100 : 0,
    topGaps: pickTopGaps(list, 3),
  };
}
