// Learning Hub（§新功能）单元自测：buildHubGraph / computeDiagnosis / TOPIC_LEXICON 主题归并
import { buildHubGraph, computeDiagnosis, TOPIC_LEXICON, topicOf } from '../demo/js/core/graph.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log(`ok    ${label}`); }
  else { fail++; console.error(`FAIL  ${label}\n  expect ${b}\n  actual ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// --- buildHubGraph：三色节点 + 缺口 ---
const concepts = [
  { name: '反向传播', prerequisites: ['链式法则', '损失函数', '梯度下降'], askedIn: ['a1', 'a2'], firstSource: { articleId: 'a1', at: 100 } },
  { name: '梯度下降', prerequisites: ['导数', '梯度'], askedIn: ['a1'], firstSource: { articleId: 'a1', at: 200 } },
  { name: '损失函数', prerequisites: [], askedIn: ['a1'], firstSource: { articleId: 'a1', at: 300 } },
];
const g = buildHubGraph(concepts);
eq(g.nodes.length, 6, '6 节点 = 3 已学 + 3 缺口');
eq(g.edges.length, 5, '5 条依赖边');
eq(g.nodes.filter((n) => n.gap).map((n) => n.label).sort(), ['导数', '梯度', '链式法则'].sort(), '缺口节点 = 未学的 3 个前置');
const bp = g.nodes.find((n) => n.id === '反向传播');
eq(bp.count, 2, '反向传播 2 篇文章 → 绿');
eq(bp.gap, false, '已学非缺口');
const dz = g.nodes.find((n) => n.id === '导数');
eq(dz.dependedBy, ['梯度下降'], '导数缺口被「梯度下降」依赖');
eq(g.edges.find((e) => e.source === '链式法则').target, '反向传播', '边方向：前置 → 概念');
ok(g.edges.some((e) => e.source === '损失函数' && e.target === '反向传播'), '损失函数 → 反向传播 边存在');

// 自环 / 空输入防御
const g2 = buildHubGraph([{ name: 'X', prerequisites: ['X'] }]);
eq(g2.nodes.length, 1, '自环前置不产生缺口节点');
eq(buildHubGraph([]).nodes.length, 0, '空输入无节点');
eq(buildHubGraph(null).edges.length, 0, 'null 输入安全');

// --- TOPIC_LEXICON / topicOf ---
eq(topicOf('梯度下降'), '优化算法', '梯度下降归优化算法');
eq(topicOf('反向传播'), '深度学习', '反向传播归深度学习');
eq(topicOf('不存在的概念'), null, '未收录概念无主题');

// --- computeDiagnosis：主题统计 + 薄弱 + 建议补 ---
const diag = computeDiagnosis(concepts);
ok(diag.topicList.length === Object.keys(TOPIC_LEXICON).length, '主题清单全列出');
const dl = diag.topicList.find((t) => t.name === '深度学习');
eq(dl.learned, 2, '深度学习已学 2（反向传播+损失函数）');
ok(diag.summary.includes('3 个概念'), '总结提到总数');
ok(diag.weakTopics.length >= 1 && diag.weakTopics.length <= 3, '薄弱主题 TOP≤3');
eq(diag.suggestedGaps.length, 3, '建议补 3 个缺口概念');
ok(diag.suggestedGaps.includes('导数'), '导数在建议清单');
ok(diag.suggestedGaps.includes('梯度'), '梯度在建议清单');
const emptyDiag = computeDiagnosis([]);
ok(emptyDiag.summary.includes('还没有学过的概念'), '空数据给引导文案');
eq(emptyDiag.suggestedGaps.length, 0, '空数据无建议');

// --- 老函数回归：无白名单时 pending 边不参与缺口 ---
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
