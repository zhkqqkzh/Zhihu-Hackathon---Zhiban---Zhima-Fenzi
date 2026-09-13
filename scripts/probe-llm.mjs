// 线上 /ask 解释质量探针：修复模型/密钥后跑一遍，3 个概念任一翻车即非零退出。
// 用法：node scripts/probe-llm.mjs            （线上 SCF）
//       node scripts/probe-llm.mjs --local    （本地 dev server，需先 npm run dev）
const LOCAL = process.argv.includes('--local');
const BASE = LOCAL ? 'http://127.0.0.1:8787/api/explain' : 'https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com/ask';

// 判对标准：is_concept=true 且定义命中任一关键词（不同模型措辞不同，从宽）。
const CASES = [
  { term: '梯度下降', context: '在损失函数的优化过程中，我们使用梯度下降来更新模型参数。', keys: ['梯度', '损失', '参数', '导数', '优化', '误差', '迭代', '最小'] },
  { term: '反向传播', context: '神经网络用反向传播算法计算每一层的梯度。', keys: ['梯度', '误差', '神经网络', '链式法则', '权重'] },
  { term: '正则化', context: '为防止过拟合，我们在损失函数中加入了正则化项。', keys: ['过拟合', '泛化', '惩罚', '复杂度', '损失'] },
];

let fail = 0;
for (const c of CASES) {
  const t0 = Date.now();
  let r = null, err = '';
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(LOCAL ? { term: c.term, context: c.context } : { term: c.term, context: c.context, stream: false }),
    });
    r = await res.json();
    if (!res.ok) err = `HTTP ${res.status}`;
  } catch (e) { err = String(e?.message || e); }
  const ms = Date.now() - t0;
  const def = String(r?.definition || '');
  const hit = r?.is_concept === true && c.keys.some((k) => def.includes(k));
  if (!hit) fail++;
  console.log(`${hit ? 'ok  ' : 'FAIL'} ${c.term}  ${ms}ms  ${err || (r?.is_concept === false ? '被判为非概念' : `定义: ${def.slice(0, 60) || '(空)'}`)}`);
}
console.log(fail ? `→ ${fail} 项翻车，别上演示` : '→ 3/3 通过，可以演示');
process.exit(fail ? 1 : 0);
