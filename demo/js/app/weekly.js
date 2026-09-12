// 每周复盘推送（计划书第 3 条「沉淀被动化」）：零操作、纯前端。
// 数据全部来自本地已存概念记录（core/review.js 纯算），不调模型、不需要用户打开任何中心页面。
// 触发时机：进入页面后延迟检查一次 + 每次换页顺带检查；距上次复盘 ≥7 天才推，推过就记时间。

import * as store from './store.js';
import { runtime } from './runtime.js';
import { buildWeeklyReview } from '../core/review.js';

let current = null; // 本次推送的复盘摘要（会话内共享给入口/侧栏渲染）
let unseen = false; // 有还没看过的复盘 → 入口与侧栏 tab 显示角标

export function getWeeklyReview() { return current; }
export function hasUnseenReview() { return unseen; }
export function ackReview() { unseen = false; }

// 读本地数据实时算一份复盘摘要（纯读，不推送、不改状态）。
export async function computeWeeklyReview() {
  const [concepts, lastReviewAt] = await Promise.all([store.listConcepts(), store.getLastReviewAt()]);
  return buildWeeklyReview({ concepts, lastReviewAt });
}

// 检查是否该复盘；该推则标记时间并广播 review:ready。任何异常都静默（§13.4）。
export async function checkWeeklyReview() {
  try {
    const review = await computeWeeklyReview();
    if (!review.shouldPush) return null;
    current = review;
    unseen = true;
    // 推出即计一次复盘：同一周内不重复打扰（用户不点开也不会天天弹）。
    await store.markReviewShown();
    runtime.emit('review:ready', review);
    return review;
  } catch {
    return null;
  }
}

export function initWeeklyReview() {
  // 延迟一点，先让正文可读；首次打开就满足条件的话同样会推（计划书验收口径）。
  window.setTimeout(() => { checkWeeklyReview(); }, 1200);
  runtime.on('page:change', () => { if (!current) checkWeeklyReview(); });
}
