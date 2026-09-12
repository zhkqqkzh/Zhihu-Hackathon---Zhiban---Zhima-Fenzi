// 核心模块单元自测（纯函数部分）：match / quote / srs / graph / difficulty / stopwords
import { matchConcepts, matchRate } from '../demo/js/core/match.js';
import { expandToSentence } from '../demo/js/core/quote.js';
import { createReviewState, applyFeedback, isDue, nextIntervalDays } from '../demo/js/core/srs.js';
import { buildEdges, topoOrder, detectGap, clusterArticles, sortClusterForCuration } from '../demo/js/core/graph.js';
import { previewDifficulty, difficultyMessage } from '../demo/js/core/difficulty.js';
import { interceptSelection } from '../demo/js/core/stopwords.js';
import { isReviewDue, pickTopGaps, buildWeeklyReview, REVIEW_INTERVAL_DAYS } from '../demo/js/core/review.js';
import { safeFileName, noteToMarkdown, formatTime } from '../demo/js/core/note.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log(`ok    ${label}`); }
  else { fail++; console.error(`FAIL  ${label}\n  expect ${b}\n  actual ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const DAY = 24 * 3600 * 1000;

// --- match：长词优先占位，子串不误命中 ---
const text = '梯度下降是最常用的优化算法。要理解梯度下降，先要理解梯度。导数是这一切的起点。';
const matches = matchConcepts(text, ['梯度', '梯度下降', '导数']);
eq(matches.filter((m) => m.concept === '梯度下降').length, 2, '梯度下降命中 2 次');
eq(matches.filter((m) => m.concept === '梯度').length, 1, '「梯度」只在非梯度下降处命中 1 次');
eq(matches.filter((m) => m.concept === '导数').length, 1, '导数命中 1 次');

// --- matchRate：预扫描逐字匹配率验证（10.5） ---
const rate = matchRate(text, ['梯度下降', '导数', '反向传播']);
eq(rate.total, 3, 'matchRate total');
eq(rate.matched, 2, 'matchRate matched');
ok(Math.abs(rate.rate - 2 / 3) < 1e-9, 'matchRate rate=2/3');
eq(rate.missing, ['反向传播'], 'matchRate missing 幽灵标记可检出');

// --- quote：扩句 ---
const para = '在机器学习中，梯度下降是一种迭代优化算法。它沿着负梯度方向更新参数。这就是全部。';
const start = para.indexOf('梯度下降');
eq(expandToSentence(para, start, start + 4), '在机器学习中，梯度下降是一种迭代优化算法。', '扩句取到完整句');

// --- srs：1→3→7→15，忘了重置，模糊保持 ---
let st = createReviewState(0);
ok(isDue(st, 0), '新状态立即到期');
st = applyFeedback(st, 'remember', 0);
eq(nextIntervalDays(st), 3, '记得后间隔 3 天');
ok(!isDue(st, DAY), '1 天后未到期');
st = applyFeedback(st, 'fuzzy', 3 * DAY);
eq(nextIntervalDays(st), 3, '模糊保持当前间隔');
st = applyFeedback(st, 'remember', 6 * DAY);
eq(nextIntervalDays(st), 7, '再记得升 7 天');
st = applyFeedback(st, 'remember', 13 * DAY);
eq(nextIntervalDays(st), 15, '再记得升 15 天');
st = applyFeedback(st, 'remember', 28 * DAY);
eq(nextIntervalDays(st), 15, '15 天封顶');
st = applyFeedback(st, 'forgot', 43 * DAY);
eq(nextIntervalDays(st), 1, '忘了重置为 1 天');

// --- graph：依赖边 + 白名单 + 边加权 + 缺口 Top1 + 拓扑序 ---
const concepts = [
  { name: '梯度下降', prerequisites: ['梯度'], articleId: 'A', firstAskedAt: 1 },
  { name: '梯度', prerequisites: ['导数'], articleId: 'B', firstAskedAt: 2 },
  { name: '反向传播', prerequisites: ['梯度下降'], articleId: 'C', firstAskedAt: 3 },
  { name: '贪心算法', prerequisites: ['算法'], articleId: 'D', firstAskedAt: 4 },
];
// 「算法」不在任何预扫描词表中 → 泛化父概念回退被白名单过滤（11.5）
const whitelist = new Set(['梯度', '导数', '梯度下降', '反向传播', '贪心算法']);
let edges = buildEdges(concepts, whitelist);
eq(edges.length, 4, '边总数');
ok(edges.find((e) => e.from === '算法').pending, '「算法」边进入 pending（冷启动不展示）');
ok(!edges.find((e) => e.from === '梯度').pending, '「梯度」在词表中，边激活');
ok(!edges.find((e) => e.from === '梯度').verified, '单篇验证的边默认不实线（11.8）');
const order = topoOrder(concepts, edges);
ok(order.indexOf('梯度') < order.indexOf('梯度下降'), '拓扑序：梯度在梯度下降前');
ok(order.indexOf('梯度下降') < order.indexOf('反向传播'), '拓扑序：梯度下降在反向传播前');
const gap = detectGap([{ name: '梯度下降', prerequisites: ['梯度'], articleId: 'A' }], edges);
eq(gap, '梯度', '缺口检测只取 Top 1');
// 边被第二篇文章重复验证后画实线
edges = buildEdges([...concepts, { name: '梯度下降', prerequisites: ['梯度'], articleId: 'E', firstAskedAt: 5 }], whitelist);
ok(edges.find((e) => e.from === '梯度' && e.to === '梯度下降').verified, '双篇验证的边画实线');

// --- 聚类与策展排序（10.11） ---
const articles = [
  { id: 'A', concepts: ['梯度下降', '梯度'], firstReadAt: 3 },
  { id: 'B', concepts: ['梯度', '导数'], firstReadAt: 1 },
  { id: 'C', concepts: ['反向传播', '梯度下降'], firstReadAt: 2 },
  { id: 'X', concepts: ['完全无关'], firstReadAt: 0 },
];
const clusters = clusterArticles(articles, 0.2);
eq(clusters.length, 2, '3 篇同主题聚成 1 簇，无关的单独一簇');
const big = clusters.find((c) => c.articles.length === 3);
eq(big.articles.length, 3, '同主题达 3 篇可生成专题');
const sortedArts = sortClusterForCuration(big, edges);
eq(sortedArts[0].id, 'B', '策展排序：含前置概念最多的排最前');

// --- difficulty：三档文案 ---
const pv = previewDifficulty(['梯度下降', '梯度', '导数', '反向传播'], ['梯度']);
eq(pv.freshCount, 3, '陌生概念数');
eq(pv.familiarCount, 1, '熟悉概念数');
eq(pv.tone, 'hard', '陌生占比 ≥0.6 为 hard');
ok(difficultyMessage(pv).includes('可能会有点难'), 'hard 档文案');
eq(previewDifficulty([], ['梯度']).tone, 'none', '空词表无预告');

// --- stopwords：三层拦截，且不误杀两字术语 ---
eq(interceptSelection('的') !== null, true, '「的」被拦截');
eq(interceptSelection('这个') !== null, true, '「这个」被拦截');
eq(interceptSelection('梯度'), null, '「梯度」两字术语绝不误杀（§15 红线）');
eq(interceptSelection('熵'), null, '「熵」单字术语不误杀');
eq(interceptSelection('') !== null, true, '空选区给提示');
eq(interceptSelection('！！！') !== null, true, '纯标点拦截');
ok(interceptSelection('的').includes('常用词'), '拦截给友好提示而非静默失败');

// --- review：每周复盘（计划书第 3 条，零操作被动推送的算法层）---
const rvConcepts = [
  { name: '梯度下降', prerequisites: ['梯度'], mastery: 'unvisited', firstAskedAt: 1 },
  { name: '梯度', prerequisites: ['偏导数'], mastery: 'fuzzy', firstAskedAt: 2 },
  { name: '导数', prerequisites: [], mastery: 'passed', firstAskedAt: 3 },
];
eq(REVIEW_INTERVAL_DAYS, 7, '复盘间隔为 7 天');
ok(!isReviewDue([], 0, 30 * DAY), '复盘：没有概念记录时不推送');
ok(isReviewDue(rvConcepts, 0, 30 * DAY), '复盘：从未复盘过，以最早记录为基线，早就该推');
ok(!isReviewDue(rvConcepts, 25 * DAY, 30 * DAY), '复盘：距上次不足 7 天不推');
ok(isReviewDue(rvConcepts, 23 * DAY, 30 * DAY), '复盘：恰好满 7 天即推（边界）');
eq(pickTopGaps(rvConcepts, 3), ['偏导数', '梯度', '梯度下降'], '复盘：优先补「提到但从没记过」的前置，再补最近卡住的');
eq(pickTopGaps(rvConcepts, 1), ['偏导数'], '复盘：Top 缺口受 limit 约束');
const rv = buildWeeklyReview({ concepts: rvConcepts, lastReviewAt: 0, now: 30 * DAY });
eq(rv.shouldPush, true, '复盘 shouldPush');
eq(rv.daysSince, 29, '复盘 daysSince 以最早记录为基线');
eq(rv.total, 3, '复盘 概念总数');
eq(rv.stalledCount, 2, '复盘 卡住概念数（非 passed）');
eq(rv.masteryRate, 0.33, '复盘 掌握率 1/3 四舍五入到两位');
eq(buildWeeklyReview({ concepts: rvConcepts, lastReviewAt: 30 * DAY, now: 31 * DAY }).shouldPush, false,
  '复盘：刚复盘过不推');

// --- note：笔记卡片 Markdown（计划书第 4 条，零接口依赖的导出层）---
eq(safeFileName('梯度/下降:*?"<>| 笔记'), '梯度-下降-笔记', '文件名清洗非法字符与空白');
eq(safeFileName(''), '知伴笔记', '空文件名给兜底名');
eq(safeFileName('长'.repeat(50)).length, 40, '文件名截断到 40 字');
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(formatTime(Date.now())), '时间戳格式 YYYY-MM-DD HH:mm');
const cNote = noteToMarkdown({
  kind: 'concept', concept: '梯度', definition: '各方向偏导数组成的向量', inContext: '这篇里指下山方向',
  quote: '指向函数值上升最快的方向', title: '梯度下降', url: 'https://www.zhihu.com/x', createdAt: 0,
});
ok(cNote.includes('**概念**：梯度'), '单概念笔记含概念名');
ok(cNote.includes('**定义**：各方向偏导数组成的向量'), '单概念笔记含定义');
ok(cNote.includes('**本篇语境**：这篇里指下山方向'), '单概念笔记含本篇语境');
ok(cNote.includes('**原文引用**：「指向函数值上升最快的方向」'), '单概念笔记含原文引用');
ok(cNote.includes('**来源**：《梯度下降》'), '单概念笔记含来源标题与链接');
const gNote = noteToMarkdown({
  kind: 'guide', title: '反向传播', gap: '偏导数', createdAt: 0,
  items: [{ name: '梯度', definition: 'd', quote: 'q', link: 'https://www.zhihu.com/s' }],
});
ok(gNote.includes('## 1. 梯度'), '导读笔记分节渲染每个概念');
ok(gNote.includes('你可能还缺、但没问到的一环：偏导数'), '导读笔记带缺口提醒');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
