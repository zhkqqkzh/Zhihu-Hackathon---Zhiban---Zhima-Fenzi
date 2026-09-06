// 载入示例 / 清空数据（§18.3）。
// 硬约束：示例数据的前置概念必须真实自洽，依赖链是算出来的，不是硬编码的图。
// 前置关系与 mock 模型一致；每条「原文引用」逐字来自三篇正文；
// 梯度/梯度下降在 B、A 两篇文章都被问过，依赖边据此被重复验证成实线（§11.8）。

import { toast } from './ui.js';
import * as store from './store.js';

const DAY = 24 * 3600 * 1000;
const now = Date.now();

// 与 server/mock.js EXPLAIN_DB 保持一致（示例数据离线自洽）
const DEFS = {
  '梯度下降': { definition: '梯度下降是一种通过沿目标函数梯度的反方向迭代更新参数、逐步逼近函数最小值的优化算法。', prerequisites: ['梯度'] },
  '梯度': { definition: '梯度是多元函数对各变量偏导数组成的向量，指向函数值上升最快的方向，模长为最大变化率。', prerequisites: ['偏导数'] },
  '偏导数': { definition: '偏导数是多元函数固定其余变量、只对其中一个变量求导得到的瞬时变化率。', prerequisites: ['导数'] },
  '导数': { definition: '导数是函数在某一点处瞬时变化率的极限，几何上等于该点切线的斜率。', prerequisites: [] },
  '反向传播': { definition: '反向传播是利用链式法则将输出层误差逐层回传、高效计算网络中每个参数梯度的算法。', prerequisites: ['链式法则', '梯度下降'] },
  '链式法则': { definition: '链式法则是复合函数求导法则：复合函数的导数等于各层导数沿复合链条的乘积。', prerequisites: ['导数'] },
  '损失函数': { definition: '损失函数是把模型预测与真实目标的差距映射为一个标量的函数，用于量化模型当前的好坏。', prerequisites: [] },
};

// 原文引用逐字摘自三篇正文（§9.2：原文引用是导读主体内容来源）
const QUOTES = {
  '梯度下降': '下山的方法，就是梯度下降。',
  '梯度': '它是各方向偏导数组成的向量，指向函数值上升最快的方向。',
  '偏导数': '梯度里的每个分量，正是一个偏导数：固定其他变量不动，只看某个变量变化时函数怎么变。',
  '导数': '导数就是瞬时变化率的严格定义，这是整个微积分的地基。',
  '反向传播': '你一定见过这样的描述：神经网络通过反向传播来训练。',
  '链式法则': '它用链式法则把误差一层一层传回去，一次前向传播加一次反向传播，就能算出所有参数的梯度。',
  '损失函数': '我们把模型的预测和真实答案之间的差距，塞进一个叫损失函数的东西里。',
};

const TITLES = {
  'article-derivative': '微积分里的导数，为什么机器学习处处都要用？',
  'article-gradient-descent': '为什么梯度下降总能找到"下山"的路？',
  'article-backprop': '神经网络到底是怎么学会一件事的？一文讲清反向传播',
};

// 每篇文章的已展开概念（偏导数故意没在任何一篇展开 → 它是算出来的缺口）
const EXPANDED = {
  'article-derivative': ['导数'],
  'article-gradient-descent': ['梯度', '梯度下降'],
  'article-backprop': ['反向传播', '链式法则', '损失函数', '梯度下降', '梯度'],
};
// 首次来源：梯度/梯度下降的首问都在 B，A 里再问一次（边被双篇验证）
const FIRST_SOURCE = {
  '导数': 'article-derivative', '偏导数': 'article-gradient-descent', '梯度': 'article-gradient-descent',
  '梯度下降': 'article-gradient-descent', '反向传播': 'article-backprop', '链式法则': 'article-backprop', '损失函数': 'article-backprop',
};
const FIRST_AT = {
  '导数': now - 20 * DAY, '偏导数': now - 15 * DAY, '梯度': now - 12 * DAY, '梯度下降': now - 9 * DAY,
  '反向传播': now - 6 * DAY, '链式法则': now - 5 * DAY, '损失函数': now - 4 * DAY,
};
const MASTERY = { '导数': 'passed', '偏导数': 'passed', '梯度': 'fuzzy', '梯度下降': 'unvisited', '反向传播': 'unvisited', '链式法则': 'unvisited', '损失函数': 'unvisited' };
// 同一概念在哪些文章被问过：双篇验证的边才画实线（§11.8）
const ASKED_IN = {
  '导数': ['article-derivative'],
  '偏导数': ['article-gradient-descent'],
  '梯度': ['article-gradient-descent', 'article-backprop'],
  '梯度下降': ['article-gradient-descent', 'article-backprop'],
  '反向传播': ['article-backprop'],
  '链式法则': ['article-backprop'],
  '损失函数': ['article-backprop'],
};
const REVIEW = {
  '导数': { level: 2, lastReviewAt: now - 3 * DAY, reviewCount: 3, nextReviewAt: now + 4 * DAY },
  '偏导数': { level: 1, lastReviewAt: now - 2 * DAY, reviewCount: 2, nextReviewAt: now + 1 * DAY },
  '梯度': { level: 1, lastReviewAt: now - 4 * DAY, reviewCount: 2, nextReviewAt: now - DAY }, // 已到期 → 选中即回访
};

export async function loadSample() {
  // 预扫描词表缓存（与 mock prescan 一致 → 白名单过滤激活全部前置边）
  await store.savePrescan('article-backprop', ['反向传播', '链式法则', '损失函数', '梯度下降', '梯度', '偏导数', '学习率', '过拟合']);
  await store.savePrescan('article-gradient-descent', ['梯度下降', '梯度', '偏导数', '导数', '损失函数', '学习率']);
  await store.savePrescan('article-derivative', ['导数', '极限', '切线', '变化率']);

  for (const [name, def] of Object.entries(DEFS)) {
    await store.saveConceptRecord(name, {
      isConcept: true,
      definition: def.definition,
      prerequisites: def.prerequisites,
      quote: QUOTES[name],
      links: [{ title: `如何通俗易懂地理解${name}？`, author: '知乎用户', voteupCount: 1024, url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(name)}` }],
      mastery: MASTERY[name],
      firstSource: { articleId: FIRST_SOURCE[name], at: FIRST_AT[name] },
      askedIn: ASKED_IN[name] || [FIRST_SOURCE[name]],
      firstAskedAt: FIRST_AT[name],
      review: REVIEW[name] || null,
    });
  }
  for (const [articleId, list] of Object.entries(EXPANDED)) {
    await store.saveArticleRecord(articleId, {
      title: TITLES[articleId],
      expandedConcepts: list,
      quizzes: [{ concept: '导数', question: '导数在几何上对应切线的什么量？', answer: '斜率呀', verdict: 'correct', at: now - 19 * DAY }],
      readToEnd: true,
      firstReadAt: Math.min(...list.map((n) => FIRST_AT[n])),
    });
  }
  // 示例导读：《读「反向传播」前……》（5 个概念 + 缺口偏导数）
  await store.saveGuide('article-backprop', {
    articleId: 'article-backprop',
    title: TITLES['article-backprop'],
    items: EXPANDED['article-backprop'].map((name) => ({
      name,
      definition: DEFS[name].definition,
      quote: QUOTES[name],
      link: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(name)}`,
    })),
    gap: '偏导数',
    createdAt: now - 3 * DAY,
    _sample: true,
  });
  await store.saveMeta({ entryUsed: true, tipDismissed: true });
}

export async function confirmClear() {
  if (!confirm('确定删除全部记录吗？你的短尾巴、去看山进度、导读都会清空，回到冷启动。')) return;
  await store.deleteAllData();
  toast('已清空。所有记录只存在你的浏览器里，删了就真的没有了。');
  location.hash = '#/';
  location.reload();
}
