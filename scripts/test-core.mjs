// 核心模块单元自测（纯函数部分）：match / quote / srs / graph / difficulty / stopwords
import { matchConcepts, matchRate } from '../demo/js/core/match.js';
import { unwrapExplain, normalizeExplain } from '../demo/js/core/explain.js';
import { cleanPrescanConcepts } from '../demo/js/core/prescan.js';
import { ARTICLES } from '../demo/js/data/articles.js';
import { expandToSentence } from '../demo/js/core/quote.js';
import { createReviewState, applyFeedback, isDue, nextIntervalDays } from '../demo/js/core/srs.js';
import { buildEdges, topoOrder, detectGap, clusterArticles, sortClusterForCuration } from '../demo/js/core/graph.js';
import { previewDifficulty, difficultyMessage } from '../demo/js/core/difficulty.js';
import { interceptSelection } from '../demo/js/core/stopwords.js';
import { isReviewDue, pickTopGaps, buildWeeklyReview, REVIEW_INTERVAL_DAYS } from '../demo/js/core/review.js';
import { safeFileName, noteToMarkdown, formatTime } from '../demo/js/core/note.js';
import { mergeStuck, stuckCount, hasStuckMark, stuckSourceLabel, topStuckInsight, buildCreatorReport, articleIdFromLink, formatCount } from '../demo/js/core/stuck.js';
import { sourceId, hitToArticle, SOURCE_REAL } from '../demo/js/app/knowledge-source.js';
import stuckStoreModule from '../scf/stuck-store.js';

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

// --- explain：结构漂移解包（P0-1）---
const flat = normalizeExplain({ definition: '梯度是方向导数', context_why: '这里指下降方向', prerequisites: ['导数', '偏导', '多余'] });
eq(flat.definition, '梯度是方向导数', 'explain 平铺取 definition');
eq(flat.in_context, '这里指下降方向', 'explain context_why 映射为 in_context');
eq(flat.prerequisites.length, 2, 'explain prerequisites 最多取 2 个');
const wrapped = normalizeExplain({ answer: { definition: '  多包一层  ', context_why: '包装层' } });
eq(wrapped.definition, '多包一层', 'explain 解包 answer 并 trim definition');
eq(wrapped.in_context, '包装层', 'explain 包装层 context_why 映射');
eq(normalizeExplain({ answer: { is_concept: false } }).is_concept, false, 'explain 包装层 is_concept=false 可透出');
eq(normalizeExplain({ is_concept: false }).is_concept, false, 'explain 平铺 is_concept=false 可透出（P0-2 后端短路返回体）');
eq(normalizeExplain({ is_concept: false, definition: '' }).definition, '', 'explain 非概念不带 definition');
eq(normalizeExplain({ definition: { text: 'x' } }).definition, '', 'explain definition 非字符串不取用');
eq(normalizeExplain({}).is_concept, true, 'explain 缺字段默认是概念');
eq(unwrapExplain(null).definition, undefined, 'unwrapExplain null 安全');

// --- prescan 词表清洗：幽灵标记 + 高频通用词（P1-1 / P1-2）---
const gd = ARTICLES.find((a) => a.id === 'article-gradient-descent');
const cleanedGd = cleanPrescanConcepts(gd.body, ['梯度下降', '局部最优', '函数', '参数', '损失']);
eq(cleanedGd.concepts, ['梯度下降'], 'prescan 清洗后只留真概念，原顺序不变');
eq(cleanedGd.dropped.ghost, ['局部最优'], 'prescan 幽灵标记被丢弃（正文实为「局部的浅坑」）');
eq(cleanedGd.dropped.generic, ['函数', '参数', '损失'], 'prescan 高频通用词被丢弃');
const bpArticle = ARTICLES.find((a) => a.id === 'article-backprop');
const cleanedBp = cleanPrescanConcepts(bpArticle.body, ['反向传播', '搜索问题', '参数', '链式法则']);
eq(cleanedBp.concepts, ['反向传播', '链式法则'], 'prescan 通用词剔除后保留全部真概念');
eq(cleanedBp.dropped.generic, ['搜索问题', '参数'], 'prescan「搜索问题」「参数」被通用词清单拦截');
const dv = ARTICLES.find((a) => a.id === 'article-derivative');
const cleanedDv = cleanPrescanConcepts(dv.body, ['导数', '极限', '切线', '偏导数', '梯度', '梯度下降', '函数']);
eq(cleanedDv.concepts, ['导数', '极限', '切线', '偏导数', '梯度', '梯度下降'], 'prescan 主概念（导数 15 次）不被频次阈值误杀');
eq(cleanPrescanConcepts('甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲，甲甲', ['甲甲']).dropped.frequent, ['甲甲'], 'prescan 出现 17 次触发频次兜底');
eq(cleanPrescanConcepts(gd.body, [' 梯度下降 ', '梯度下降', '']).concepts, ['梯度下降'], 'prescan 去空去重');
eq(cleanPrescanConcepts('', ['梯度下降']).concepts, [], 'prescan 空正文返回空词表');
for (const a of ARTICLES) {
  const c = cleanPrescanConcepts(a.body, ['反向传播', '链式法则', '梯度下降', '导数', '函数', '局部最优']);
  eq(matchRate(a.body, c.concepts).rate, 1, `prescan ${a.id} 清洗后丢失率为 0%`);
}

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

// --- stuck：卡点聚合（改造方案 §4.2/4.3/4.4，seed + 现场上报叠加）---
const bpStuckArticle = ARTICLES.find((a) => a.id === 'article-backprop');
eq(mergeStuck('article-backprop', [], 3).map((s) => s.concept), ['链式法则', '损失函数', '梯度下降'],
  '卡点：无上报时按 seed 人数降序取 TOP3');
eq(mergeStuck('article-backprop', [], 3)[0].count, 1283, '卡点：seed 人数原样保留');
eq(stuckCount('article-backprop', '链式法则', []), 1283, '卡点：人数 = seed');
eq(stuckCount('article-backprop', '链式法则', [{ concept: '链式法则', paragraphIndex: 1 }]), 1284,
  '卡点：现场上报在同一词上 +1');
eq(stuckCount('article-backprop', '偏导数', []), 388, '卡点：seed 覆盖第四名也参与人数统计');
const mergedLocal = mergeStuck('article-backprop', [{ concept: '过拟合', paragraphIndex: 11, startOffset: 4, endOffset: 7 }]);
const localItem = mergedLocal.find((s) => s.concept === '过拟合');
eq(localItem.count, 1, '卡点：只有现场上报的新词也进列表，计数从 1 起');
eq(mergedLocal[mergedLocal.length - 1].concept, '过拟合', '卡点：上报 1 次的新词排在末尾');
eq(localItem.paragraphIndex, 11, '卡点：新词带上报时的真实段落，可跳回原文');
eq(localItem.seedCount, 0, '卡点：新词标记为纯上报（seed 计 0）');
const mergedAnchor = mergeStuck('article-backprop', [{ concept: '链式法则', paragraphIndex: 7, startOffset: 2, endOffset: 6 }], 1)[0];
eq(mergedAnchor.paragraphIndex, 7, '卡点：真实上报的锚点优先于 seed 段落索引');
eq(mergedAnchor.localCount, 1, '卡点：区分 seed 人数与上报人数');
eq(hasStuckMark([{ concept: '链式法则' }], '链式法则'), true, '卡点：已上报判定');
eq(hasStuckMark([{ concept: '链式法则' }], '损失函数'), false, '卡点：未上报判定');
eq(mergeStuck('article-unknown', [], 3), [], '卡点：没有数据的文章返回空，不硬凑');

const insight = topStuckInsight('article-backprop', bpStuckArticle, []);
eq(insight.concept, '链式法则', '首页洞察：取人数最多的词');
eq(insight.count, 1283, '首页洞察：人数取 seed/上报叠加值');
eq(insight.paragraph, 2, '首页洞察：段号从 1 起');
eq(insight.voteupCount, 8432, '首页洞察：赞数取自真实文章数据');
eq(insight.totalStuck, 1283 + 964 + 712 + 388, '首页洞察：本篇卡点总数为 seed 全部词之和');
eq(insight.share, 38, '首页洞察：第一大卡点占比（1283/3347），「卡在同一个词」有数字兜底');
eq(stuckSourceLabel(insight), '演示环境数据', '首页洞察：来源字段随洞察一起返回，界面可直接标注（§七-6）');
eq(topStuckInsight('article-unknown', null, []), null, '首页洞察：无数据返回 null');

const report = buildCreatorReport('article-backprop', bpStuckArticle, [], 3);
eq(report.items.length, 3, '答主报告：默认 TOP3');
eq(report.totalStuck, 1283 + 964 + 712 + 388, '答主报告：本篇全部卡点（含未进 TOP3 的第四名）');
eq(report.topStuck, 1283 + 964 + 712, '答主报告：展示的三处合计与全部分开（界面数字可追溯 §七-6）');
eq(report.items[0].share, 38, '答主报告：占比分母为全部卡点');
eq(report.hasData, true, '答主报告：有数据');
eq(report.author, '陈默', '答主报告：带上作者');
eq(buildCreatorReport('article-unknown', null, [], 3).hasData, false, '答主报告：无数据时如实标注');
eq(buildCreatorReport('article-backprop', bpStuckArticle, [{ concept: '链式法则', paragraphIndex: 1 }], 3).items[0].count, 1284,
  '答主报告：现场上报叠加进报告');

eq(articleIdFromLink('#/article/article-backprop'), 'article-backprop', '卡点：解析站内文章链接');
eq(articleIdFromLink('https://www.zhihu.com/question/123/answer/3489210567'), 'article-backprop',
  '卡点：解析知乎回答链接');
eq(articleIdFromLink('https://www.zhihu.com/question/123/answer/9999999999'), '', '卡点：未收录的回答返回空');
eq(articleIdFromLink('随便写点什么'), '', '卡点：非法输入返回空');

eq(formatCount(1283), '1,283', '卡点：人数千分位展示');
eq(formatCount(712), '712', '卡点：四位数以下不加分隔符');
eq(formatCount(undefined), '0', '卡点：人数缺失显示 0');

eq(stuckSourceLabel({ seedCount: 1283, localCount: 0 }), '演示环境数据', '卡点：纯 seed 如实标注「演示环境数据」');
eq(stuckSourceLabel({ seedCount: 0, localCount: 1 }), '你的上报', '卡点：纯现场上报标注「你的上报」');
eq(stuckSourceLabel({ seedCount: 964, localCount: 1 }), '演示环境数据 + 你的上报',
  '卡点：两类叠加同时标出，不把演示数据冒充成真实统计（验收 §七-6）');
eq(stuckSourceLabel(mergeStuck('article-backprop', [{ concept: '过拟合' }], 9).find((s) => s.concept === '过拟合')),
  '你的上报', '卡点：聚合结果直接可判来源');

// --- stuck：社区聚合三源（问题 1：seed + 你的上报 + 社区上报）---
// 后端聚合已包含本机那一次上报，前端只叠加「超出本地计数」的部分，避免同一个人被算两遍。
const chainCommunity = mergeStuck('article-backprop', [], null, [{ concept: '链式法则', count: 17, paragraphIndex: 1 }])
  .find((s) => s.concept === '链式法则');
eq(chainCommunity.count, 1300, '社区聚合：seed 1283 + 社区 17');
eq(chainCommunity.seedCount, 1283, '社区聚合：seed 计数单独保留');
eq(chainCommunity.localCount, 0, '社区聚合：本机没报过则为 0');
eq(chainCommunity.communityCount, 17, '社区聚合：别台设备的 17 次单独记为社区上报');
eq(stuckSourceLabel(chainCommunity), '演示环境数据 + 社区上报', '社区聚合：来源如实标注，不把演示数据冒充真实统计');

const chainDedup = mergeStuck('article-backprop', [{ concept: '链式法则', paragraphIndex: 1 }], null,
  [{ concept: '链式法则', count: 17 }]).find((s) => s.concept === '链式法则');
eq(chainDedup.count, 1300, '社区聚合：本机那一次不重复计入（1283 seed + 1 你 + 16 别人）');
eq(chainDedup.communityCount, 16, '社区聚合：社区计数去掉本机已报的那一次（17 - 1）');
eq(stuckSourceLabel(chainDedup), '演示环境数据 + 你的上报 + 社区上报', '社区聚合：三源叠加同时标出');

const communityOnly = mergeStuck('article-backprop', [], null, [{ concept: '过拟合', count: 5, paragraphIndex: 11 }])
  .find((s) => s.concept === '过拟合');
eq(communityOnly.count, 5, '社区聚合：seed 没有的词也能从社区进入列表');
eq(communityOnly.paragraphIndex, 11, '社区聚合：带上别台设备上报的段号，可跳回原文');
eq(stuckSourceLabel(communityOnly), '社区上报', '社区聚合：纯社区来源只标「社区上报」');

const insightCommunity = topStuckInsight('article-backprop', bpStuckArticle, [], [{ concept: '链式法则', count: 17 }]);
eq(insightCommunity.count, 1300, '首页洞察：社区聚合透传到洞察（问题 1 闭环）');
eq(stuckSourceLabel(insightCommunity), '演示环境数据 + 社区上报', '首页洞察：来源标注含社区上报');

// --- P1 真实内容接入：zhihu_search 命中 → 文章归一化（纯函数，无需网络）---
const hitA = {
  title: '如何通俗理解反向传播', author: '张三', url: 'https://www.zhihu.com/question/1/answer/2',
  excerpt: '反向传播的核心是链式法则 <script>alert(1)</script>', voteupCount: 99, commentCount: 7,
};
const realA = hitToArticle(hitA);
eq(realA.source, SOURCE_REAL, 'P1：真实内容如实标记来源（与内置范文区分）');
eq(realA.id, sourceId(hitA), 'P1：文章 id 由 URL 稳定派生');
eq(sourceId(hitA), sourceId({ url: 'https://www.zhihu.com/question/1/answer/2' }),
  'P1：同 URL 恒定同 id，重复接入不产生重复文章');
eq(realA.author, '张三', 'P1：作者透传');
eq(realA.voteupCount, 99, 'P1：赞数透传');
eq(realA.sourceUrl, hitA.url, 'P1：保留原文链接');
ok(realA.body.includes('反向传播的核心是链式法则'), 'P1：摘要进正文（官方接口只给摘要，如实包裹）');
ok(!realA.body.includes('<script'), 'P1：摘要经转义，不注入 HTML（§13.3 XSS 防线）');
ok(realA.body.includes(hitA.url), 'P1：正文带原文链接');
eq(hitToArticle({ title: '', url: 'https://x' }), null, 'P1：缺标题的命中被丢弃');
eq(hitToArticle({ title: '标题', url: '' }), null, 'P1：缺链接的命中被丢弃');
eq(hitToArticle(null), null, 'P1：空命中返回 null');
const noExcerpt = hitToArticle({ title: '只有标题', url: 'https://www.zhihu.com/question/3/answer/4' });
ok(noExcerpt && noExcerpt.body.includes('知乎原文'), 'P1：没有摘要时只给标题 + 原文链接，不编造正文');

// --- C1：卡点聚合存储（可插拔后端 + 内存兜底，接口永不 reject）---
delete process.env.STUCK_REDIS_URL;
eq(stuckStoreModule.createStuckStore().kind, 'memory', 'C1：未配 STUCK_REDIS_URL 时用内存兜底（无凭据也能跑）');

const memStore = stuckStoreModule.createMemoryStore();
eq(await memStore.getBucket('article-backprop'), null, 'C1：未知文章返回 null');
eq(await memStore.articleCount(), 0, 'C1：初始文章数为 0');
await memStore.setBucket('article-backprop', { 链式法则: { count: 2, paragraphIndex: 1 } });
eq(await memStore.getBucket('article-backprop'), { 链式法则: { count: 2, paragraphIndex: 1 } },
  'C1：上报写回后可读回（跨请求共享同一存储）');
eq(await memStore.articleCount(), 1, 'C1：新增文章后计数 +1（供上限保护）');
await memStore.setBucket('article-backprop', { 链式法则: { count: 3, paragraphIndex: 1 }, 过拟合: { count: 1, paragraphIndex: 11 } });
eq(await memStore.articleCount(), 1, 'C1：同文章再写不重复计文章数');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
