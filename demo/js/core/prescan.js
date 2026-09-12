// 预扫描词表清洗（问题清单 P1-1 / P1-2）。
// 模型抽取有随机性，提示词只能软约束；落库前必须再过一道确定性过滤，否则
// 幽灵标记（正文匹配不到）与高频通用词（「参数」出现十几次全带波浪线）会直接毁掉阅读体验。
// 纯函数，无 DOM / 存储依赖，可在 Node 中测试。

import { matchConcepts } from './match.js';

// P1-2 第一层（配合提示词负面清单）：人人皆知的通用词，一律不进高亮词表。
// 只做精确匹配，不误伤「损失函数」「复合函数」这类真题（它们是更长的独立词）。
const GENERIC_TERMS = new Set([
  '函数', '参数', '损失', '数据', '模型', '方法', '公式', '变量', '数值', '图像',
  '输入', '输出', '计算', '结果', '问题', '内容', '部分', '情况', '数字', '概念',
  '搜索问题', '数学', '物理', '计算机', '科学',
]);

// P1-2 第二层：频次兜底——正文出现次数达到该值的词，多是文章的通用底噪而非读者的卡点。
// 取 16 的依据（Demo 三篇实测）：概念词里出现最多的是 article-derivative 的「导数」15 次、
// article-gradient-descent 的「梯度」12 次，两者都是文章主概念，绝不能误杀；阈值须高于它们。
const DEFAULT_MAX_OCCURRENCES = 16;

// 词在正文里出现的次数（非重叠）。用 matchConcepts 复用长词优先的匹配语义。
function countInText(text, name) {
  return matchConcepts(text, [name]).length;
}

// 清洗预扫描词表：丢弃幽灵标记 / 通用词 / 高频词，保留原顺序。
// 返回 { concepts, dropped: { ghost, generic, frequent } }，dropped 供日志排查。
export function cleanPrescanConcepts(text, concepts, options) {
  const maxOccurrences = (options && options.maxOccurrences) || DEFAULT_MAX_OCCURRENCES;
  const names = [...new Set((concepts || []).map((s) => String(s || '').trim()).filter(Boolean))];
  const dropped = { ghost: [], generic: [], frequent: [] };
  if (!text || names.length === 0) {
    return { concepts: [], dropped };
  }
  const found = new Set(matchConcepts(text, names).map((m) => m.concept));
  const kept = [];
  for (const name of names) {
    if (!found.has(name)) { dropped.ghost.push(name); continue; }   // P1-1：逐字匹配不上 → 幽灵标记
    if (GENERIC_TERMS.has(name)) { dropped.generic.push(name); continue; } // P1-2：通用词
    if (countInText(text, name) >= maxOccurrences) { dropped.frequent.push(name); continue; }
    kept.push(name);
  }
  return { concepts: kept, dropped };
}
