// 回访间隔（方案 10.9）：忘了重置为 1 天；有点模糊保持当前间隔；
// 还记得按 1→3→7→15 天递增。纯函数，可在 Node 中测试。

export const INTERVALS_DAYS = [1, 3, 7, 15];
const DAY_MS = 24 * 60 * 60 * 1000;

export function createReviewState(now = Date.now()) {
  return { level: 0, lastReviewAt: now, reviewCount: 0, nextReviewAt: now };
}

export function isDue(state, now = Date.now()) {
  return !!state && typeof state.nextReviewAt === 'number' && now >= state.nextReviewAt;
}

// feedback: 'remember' | 'fuzzy' | 'forgot'
export function applyFeedback(state, feedback, now = Date.now()) {
  const cur = state || createReviewState(now);
  let level = cur.level;
  if (feedback === 'remember') level = Math.min(level + 1, INTERVALS_DAYS.length - 1);
  else if (feedback === 'forgot') level = 0;
  // 'fuzzy' 保持当前间隔
  return {
    level,
    lastReviewAt: now,
    reviewCount: (cur.reviewCount || 0) + 1,
    nextReviewAt: now + INTERVALS_DAYS[level] * DAY_MS,
  };
}

export function nextIntervalDays(state) {
  return INTERVALS_DAYS[Math.min(state?.level ?? 0, INTERVALS_DAYS.length - 1)];
}
