// 端到端冒烟：Edge 无头 + CDP 真实模拟核心链路。
// 覆盖：文章渲染 → 划选「梯度下降」→ 弹「问知伴」→ 浮层三层解释（含前置知识）→
//       选「的」不弹窗（三层拦截）→ 载入示例 → 冰屋总览 → 去看山依赖链（拓扑序+实线边）→ 导读页。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 18941;
const CDP_PORT = 19333;
const BASE = `http://127.0.0.1:${PORT}`;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'zb-e2e-'));

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`ok    ${label}`); }
  else { fail++; console.error(`FAIL  ${label} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), RATE_LIMIT_PER_MINUTE: '60' },
  stdio: 'ignore',
});
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) return; } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('CDP not reachable');
}

let msgId = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
}
async function poll(expression, timeoutMs = 6000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await evaluate(expression).catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return null;
}

const SELECT = (term) => `(() => {
  const term = ${JSON.stringify(term)};
  const body = document.querySelector('.zb-RichText');
  if (!body) return 'nobody';
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let n; let start = null;
  while ((n = walker.nextNode())) { const i = n.nodeValue.indexOf(term); if (i >= 0) { start = { node: n, offset: i }; break; } }
  if (!start) return 'notfound';
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(start.node, start.offset + term.length);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return 'selected';
})()`;

const ASK_VISIBLE = `(() => {
  const root = document.getElementById('zb-popup-root');
  for (const host of root.querySelectorAll('*')) {
    const btn = host.shadowRoot?.querySelector?.('.zb-ask');
    if (btn) return 'ask';
  }
  return null;
})()`;

const POPUP_TEXT = `(() => {
  const root = document.getElementById('zb-popup-root');
  for (const host of root.querySelectorAll('*')) {
    const pop = host.shadowRoot?.querySelector?.('.zb-pop');
    if (pop) return pop.textContent;
  }
  return null;
})()`;

const CLICK_ASK = `(() => {
  const root = document.getElementById('zb-popup-root');
  for (const host of root.querySelectorAll('*')) {
    const btn = host.shadowRoot?.querySelector?.('.zb-ask');
    if (btn) { btn.click(); return 'clicked'; }
  }
  return null;
})()`;

try {
  await waitCdp();
  // 新开标签页（该 Edge 版本 json/new 忽略 url 参数，改用 CDP Page.navigate）
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: BASE + '/#/article/article-backprop' });

  // 1. 文章渲染
  const art = await poll(`!!document.querySelector('[data-zb-article="article-backprop"] .zb-RichText')`, 8000);
  ok(art, '文章页渲染（正文容器就位）');

  // 2. 划选「梯度下降」→ 弹「问知伴」
  ok(await evaluate(SELECT('梯度下降')) === 'selected', '划选「梯度下降」');
  ok((await poll(ASK_VISIBLE)) === 'ask', '弹出「问知伴」入口按钮');

  // 3. 点击 → 浮层三层解释
  await evaluate(CLICK_ASK);
  const popText = await poll(`(${POPUP_TEXT}).includes('迭代更新参数') ? (${POPUP_TEXT}) : null`);
  ok(!!popText, '浮层返回三层解释（definition 非空）');
  ok(popText.includes('这篇回答里'), '含「为什么在这篇里重要」层');
  ok(popText.includes('你可能需要先了解') && popText.includes('梯度'), '含「你可能需要先了解」前置层');

  // 4. 选「的」→ 不弹窗（三层拦截，§15 红线）
  await evaluate(`window.getSelection().removeAllRanges()`);
  await sleep(500);
  await evaluate(SELECT('的'));
  await sleep(600);
  ok((await evaluate(ASK_VISIBLE)) === null, '选「的」不弹窗（拦截生效，非"坏了"）');

  // 5. 载入示例 → 冰屋
  await evaluate(`window.__zhiban.loadSample()`);
  await evaluate(`location.hash = '#/igloo'`);
  await sleep(800);
  const igloo = await evaluate(`document.getElementById('app').textContent`);
  ok(igloo.includes('冰屋') && igloo.includes('掌握率'), '冰屋总览渲染（含掌握率）');
  ok(igloo.includes('偏导数'), '冰屋列出导读（缺口：偏导数）');
  ok(igloo.includes('我的机器学习入门路径'), '看山策展：3 篇同主题串成路径');

  // 6. 去看山：链拓扑序 + 实线边
  await evaluate(`window.__zhiban.openSidebar('chain')`);
  await sleep(800);
  const chain = await evaluate(`(() => {
    const root = document.getElementById('zb-sidebar-root');
    for (const host of root.querySelectorAll('*')) {
      const camps = [...(host.shadowRoot?.querySelectorAll?.('.zb-camp') || [])].map((c) => c.textContent);
      if (camps.length) return { camps, solid: host.shadowRoot.querySelectorAll('.zb-arrow.solid').length };
    }
    return null;
  })()`);
  ok(chain && chain.camps.length >= 5, `去看山营地数 ≥5（实际 ${chain?.camps.length}）`);
  const idx = (name) => chain.camps.findIndex((c) => c.startsWith(name));
  ok(idx('导数') >= 0 && idx('导数') < idx('梯度') && idx('梯度') < idx('梯度下降') && idx('梯度下降') < idx('反向传播'),
    '依赖链拓扑序：导数 → 梯度 → 梯度下降 → 反向传播');
  ok(chain.solid >= 1, `双篇验证的实线边存在（${chain.solid} 段）`);

  // 7. 导读页
  await evaluate(`location.hash = '#/guide/article-backprop'`);
  await sleep(800);
  const guide = await evaluate(`document.getElementById('app').textContent`);
  ok(guide.includes('你可能需要先搞懂这') && guide.includes('偏导数') && guide.includes('流程模拟'),
    '导读页渲染（含缺口提醒与发布流程模拟标注）');
} catch (e) {
  fail++;
  console.error('E2E aborted:', e.message);
} finally {
  try { ws?.close(); } catch { /* noop */ }
  spawn('taskkill', ['/F', '/T', '/PID', String(edge.pid)], { stdio: 'ignore' });
  spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' });
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
setTimeout(() => process.exit(fail ? 1 : 0), 300);
