// 后端冒烟测试：起本地服务器，打四个接口 + 静态页 + 限流，验证响应结构。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INDEX_HTML = fileURLToPath(new URL('../demo/index.html', import.meta.url));

const PORT = 18931;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log(`ok    ${label}`); }
  else { fail++; console.error(`FAIL  ${label} ${extra}`); }
}

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), RATE_LIMIT_PER_MINUTE: '15' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('server start timeout')), 10000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('dev server')) { clearTimeout(to); resolve(); }
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}

try {
  // 静态页（demo 未建时跳过，由校验4 覆盖）
  if (existsSync(INDEX_HTML)) {
    const home = await fetch(BASE + '/');
    ok(home.status === 200, 'GET / 静态首页 200');
  } else {
    console.log('skip  GET / （demo/index.html 尚未创建）');
  }

  // 非法 JSON（须在限流压测前测，否则配额耗尽拿到的是 429）
  const bad = await fetch(BASE + '/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  ok(bad.status === 400, '非法 JSON 返回 400 不崩溃');

  // 解释
  const ex = await post('/api/explain', { concept: '梯度下降', context: '梯度下降沿负梯度方向更新参数。' });
  ok(ex.status === 200, 'POST /api/explain 200');
  ok(ex.data?.is_concept === true, 'explain.is_concept');
  ok(typeof ex.data?.definition === 'string' && ex.data.definition.length > 0, 'explain.definition 非空（字段缺失率须为 0）');
  ok(typeof ex.data?.in_context === 'string' && ex.data.in_context.length > 0, 'explain.in_context 非空');
  ok(Array.isArray(ex.data?.prerequisites), 'explain.prerequisites 数组常驻');
  ok(ex.data.prerequisites.includes('梯度'), 'explain.梯度下降 前置含「梯度」（禁上位词）');
  ok(typeof ex.data?.quiz_question === 'string' && ex.data.quiz_question.length > 0, 'explain.quiz_question 非空');

  // 解释：缺参数 400
  const ex400 = await post('/api/explain', {});
  ok(ex400.status === 400, 'explain 缺 concept 返回 400');

  // 预扫描
  const ps = await post('/api/prescan', { articleId: 'article-backprop', text: '反向传播利用链式法则……'.repeat(100) });
  ok(ps.status === 200, 'POST /api/prescan 200');
  ok(Array.isArray(ps.data?.concepts) && ps.data.concepts.length > 0, 'prescan.concepts 非空数组');
  ok(ps.data.concepts.includes('反向传播'), 'prescan 词表含「反向传播」');

  // 搜索（mock 降级也必须有可渲染对象）
  const se = await post('/api/search', { query: '梯度下降' });
  ok(se.status === 200, 'POST /api/search 200');
  ok(Array.isArray(se.data?.items) && se.data.items.length > 0, 'search.items 非空（浮层不空窗）');
  ok(se.data.items[0].url.includes(encodeURIComponent('梯度下降')), 'search url 查询参数编码且非空（§13.4 硬要求）');

  // 提问
  const qz = await post('/api/quiz', { concept: '梯度下降', question: '为什么是负梯度方向？', answer: '因为梯度指向上升最快的方向', quizPoints: ['上升最快'] });
  ok(qz.status === 200, 'POST /api/quiz 200');
  ok(['correct', 'partial', 'wrong'].includes(qz.data?.verdict), 'quiz.verdict 合法');
  ok(typeof qz.data?.feedback === 'string' && qz.data.feedback.length > 0, 'quiz.feedback 非空');

  // CORS
  ok(ex.headers.get('access-control-allow-origin') === '*', 'CORS 头正确（§8.3 约束 4）');

  // 卡点聚合（问题 1）：本地镜像与 scf/index.js 的 POST /stuck 同构，须在限流压测前测
  const st1 = await post('/api/stuck', { action: 'report', articleId: 'article-backprop', concept: '链式法则', paragraphIndex: 1 });
  ok(st1.status === 200 && st1.data?.ok === true && st1.data?.count === 1, '卡点上报：首次计数为 1');
  const st2 = await post('/api/stuck', { action: 'report', articleId: 'article-backprop', concept: '链式法则', paragraphIndex: 1 });
  ok(st2.data?.count === 2, '卡点上报：同词再报计数递增到 2');
  await post('/api/stuck', { action: 'report', articleId: 'article-backprop', concept: '过拟合', paragraphIndex: 11 });
  const stTop = await post('/api/stuck', { action: 'top', articleId: 'article-backprop', topN: 3 });
  ok(stTop.status === 200 && stTop.data?.items?.length === 2, '卡点聚合：返回该篇全部已报概念');
  ok(stTop.data?.items?.[0]?.concept === '链式法则' && stTop.data.items[0].count === 2,
    '卡点聚合：按上报人数降序取 TOP（链式法则 2 领先）');
  ok(stTop.data?.items?.[0]?.paragraphIndex === 1, '卡点聚合：带出段号供前端跳回原文');
  ok((await post('/api/stuck', { action: 'report' })).status === 400, '卡点上报：缺 articleId 返回 400');

  // 限流（限额 15/分，上面已用若干，连打到 429）
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const r = await post('/api/explain', { concept: '导数', context: 'x' });
    if (r.status === 429) { limited = true; break; }
  }
  ok(limited, '应用层限流生效（§14.3 第二道）');

  // 非法 JSON（已在限流压测前测过）
  // 目录穿越
  const trav = await fetch(BASE + '/..%2Fpackage.json');
  ok(trav.status === 403 || trav.status === 404, '目录穿越被拒绝');
} finally {
  server.stdout.removeAllListeners();
  server.stderr.removeAllListeners();
  server.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
// Windows 上 kill 带子进程管道的句柄关闭是异步的，稍等再退出避免 CRT 断言
setTimeout(() => process.exit(fail ? 1 : 0), 200);
