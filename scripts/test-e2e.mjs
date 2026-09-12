// 端到端冒烟：Edge 无头 + CDP 真实模拟核心链路。
// 覆盖：首页三秒洞察（§4.1）→ 文章渲染 → 划选「梯度下降」→ 弹「问知伴」→ 浮层三层解释（含前置知识）→
//       浮层卡点上报（seed 人数 + 点一下 +1）→ 选「的」不弹窗（三层拦截）→
//       浮层不因清除选区而关闭 → 载入示例 → 冰屋总览 →
//       侧栏「我的短尾巴」概念地图 + 入口按钮随侧栏开合显隐 →
//       侧栏「本篇卡点」TOP3 + 点击跳回原文高亮 → 导读页 →
//       答主视角页（输入回答链接 → 读者卡点报告 → 一键生成前置说明草稿 / 未收录链接诚实空状态）。
//       冷启动预热接入与诚实的加载态文案（§五-2）。
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

// 浮层卡点按钮（改造方案 §4.2）：读取文案 / 点一下上报。
const STUCK_BTN_TEXT = `(() => {
  const root = document.getElementById('zb-popup-root');
  for (const host of root.querySelectorAll('*')) {
    const pop = host.shadowRoot?.querySelector?.('.zb-pop');
    if (!pop) continue;
    const btn = [...pop.querySelectorAll('.zb-act')].find((b) => b.textContent.includes('卡了一下') || b.textContent.includes('已记下'));
    if (btn) return btn.textContent;
  }
  return null;
})()`;
const CLICK_STUCK = `(() => {
  const root = document.getElementById('zb-popup-root');
  for (const host of root.querySelectorAll('*')) {
    const pop = host.shadowRoot?.querySelector?.('.zb-pop');
    if (!pop) continue;
    const btn = [...pop.querySelectorAll('.zb-act')].find((b) => b.textContent.includes('卡了一下'));
    if (btn) { btn.click(); return 'clicked'; }
  }
  return null;
})()`;

// 侧栏「本篇卡点」tab（改造方案 §4.3）：切 tab / 读条目 / 点第一条跳回原文。
const CLICK_STUCK_TAB = `(() => {
  const root = document.getElementById('zb-sidebar-root');
  for (const host of root.querySelectorAll('*')) {
    const tab = [...(host.shadowRoot?.querySelectorAll?.('.zb-tab') || [])].find((b) => b.textContent.includes('本篇卡点'));
    if (tab) { tab.click(); return 'clicked'; }
  }
  return null;
})()`;
const STUCK_TAB_ITEMS = `(() => {
  const root = document.getElementById('zb-sidebar-root');
  for (const host of root.querySelectorAll('*')) {
    const items = [...(host.shadowRoot?.querySelectorAll?.('.zb-map-item') || [])].map((c) => c.textContent);
    if (items.length) return items;
  }
  return null;
})()`;
const CLICK_FIRST_STUCK = `(() => {
  const root = document.getElementById('zb-sidebar-root');
  for (const host of root.querySelectorAll('*')) {
    const item = host.shadowRoot?.querySelector?.('.zb-map-item');
    if (item) { item.click(); return 'clicked'; }
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
  await send('Page.navigate', { url: BASE + '/#/' });

  // 0. 首页三秒洞察（改造方案 §4.1）：首屏直接摆困境，不罗列功能
  const home = await poll(`document.querySelector('.HomeInsight') ? document.getElementById('app').textContent : null`, 8000);
  ok(!!home && home.includes('8,432') && home.includes('人赞同'),
    '首屏洞察：这篇回答有多少人赞同（取真实文章数据）');
  const insightTag = await evaluate(`document.querySelector('.HomeInsight .demo-tag')?.textContent`);
  ok(insightTag === '示例数据', '首屏赞数如实标注「示例数据」，与卡点数据一样不冒充真实统计（问题 2）');
  ok(!!home && home.includes('第 2 段') && home.includes('1,283'),
    '首屏洞察：读到哪一段、有多少人卡住');
  ok(!!home && home.includes('卡住他们的，是同一个词：链式法则'),
    '首屏洞察：卡住他们的是同一个词（§4.1）');
  ok(!!home && home.includes('演示环境数据'),
    '首屏洞察：数字如实标注来源，不冒充真实统计（§4.5 / 验收 §七-6）');
  ok(!!home && home.includes('你卡住的地方，也是所有人的卡点') && home.includes('也让下一个读到这里的人不再卡住'),
    '首屏一句话主张落地（§3.4：落点从「你看懂了」改到「你让所有人都少卡一次」）');
  const insightItems = await evaluate(`[...document.querySelectorAll('.insight-stuck-item')].map((e) => e.textContent)`);
  ok(Array.isArray(insightItems) && insightItems.length === 3 && insightItems[0].includes('链式法则') && insightItems[0].includes('1,283'),
    '首屏洞察下面直接是那篇回答的卡点 TOP3');
  ok(await evaluate(`(() => { const i = document.querySelector('.insight-stuck-item'); if (!i) return null; i.click(); return 'clicked'; })()`) === 'clicked',
    '点击首屏卡点');
  ok(!!(await poll(`location.hash === '#/article/article-backprop' ? location.hash : null`, 8000)),
    '点击卡点跳到那篇回答');
  ok((await poll(`CSS.highlights.has('zhiban-jump') ? 'hl' : null`, 4000)) === 'hl',
    '跳过去高亮卡住的那一段（§4.1 卡点可视化）');

  // 0.1 冷启动预热 + 诚实的加载态文案（改造方案 §五-2）
  ok((await evaluate(`typeof window.__zhiban?.warmup`)) === 'function', '页面启动即接入 SCF 预热（§五-2 冷启动）');
  ok((await evaluate(`window.__zhiban.warmup()`)) === 'skipped-local',
    '本地 dev server 常驻无需预热，线上才打 /ping（§五-2）');
  ok((await evaluate(`fetch('/js/app/popup.js').then((r) => r.text()).then((t) => t.includes('首次可能要等十几秒'))`)) === true,
    '加载态文案诚实说明首次可能要等十几秒（§五-2）');

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

  // 3.1 卡点上报（改造方案 §4.2 / §4.5）：seed 人数（梯度下降 712）+ 点一下 +1，转已上报态且标注数据来源
  const stuckBefore = await poll(STUCK_BTN_TEXT);
  ok(typeof stuckBefore === 'string' && stuckBefore.includes('712'), `浮层卡点按钮显示 seed 人数（${stuckBefore}）`);
  ok(await evaluate(CLICK_STUCK) === 'clicked', '点击「这里我也卡了一下」');
  const stuckAfter = await poll(`(${STUCK_BTN_TEXT}).includes('已记下') ? (${STUCK_BTN_TEXT}) : null`);
  ok(typeof stuckAfter === 'string' && stuckAfter.includes('713'), `点一下 +1 并转为已上报态（${stuckAfter}）`);
  const stuckLabel = await poll(`(${POPUP_TEXT}).includes('演示环境数据') ? (${POPUP_TEXT}) : null`);
  ok(!!stuckLabel, '卡点人数如实标注「演示环境数据」来源（§4.5）');

  // 4. 选「的」→ 不弹窗（三层拦截，§15 红线）
  await evaluate(`window.getSelection().removeAllRanges()`);
  await sleep(500);
  await evaluate(SELECT('的'));
  await sleep(600);
  ok((await evaluate(ASK_VISIBLE)) === null, '选「的」不弹窗（拦截生效，非"坏了"）');
  // 4.1 清除选区 / 重选别的词，解释浮层都不该被关掉——只由「×」关闭
  ok((await evaluate(`!!(${POPUP_TEXT})`)) === true, '清除选区后解释浮层仍打开（仅 × 关闭）');

  // 5. 载入示例 → 冰屋
  await evaluate(`window.__zhiban.loadSample()`);
  await evaluate(`location.hash = '#/igloo'`);
  await sleep(800);
  const igloo = await evaluate(`document.getElementById('app').textContent`);
  ok(igloo.includes('冰屋') && igloo.includes('掌握率'), '冰屋总览渲染（含掌握率）');
  ok(igloo.includes('偏导数'), '冰屋列出导读（缺口：偏导数）');
  ok(igloo.includes('我的机器学习入门路径'), '看山策展：3 篇同主题串成路径');

  // 6. 侧栏「我的短尾巴」：本篇概念地图（预扫描词表），入口按钮随侧栏开合显隐
  await evaluate(`location.hash = '#/article/article-backprop'`);
  await sleep(900);
  await evaluate(`window.__zhiban.openSidebar()`);
  await sleep(1200);
  const tail = await evaluate(`(() => {
    const root = document.getElementById('zb-sidebar-root');
    for (const host of root.querySelectorAll('*')) {
      const items = [...(host.shadowRoot?.querySelectorAll?.('.zb-map-item') || [])].map((c) => c.textContent);
      if (items.length) return { items, expanded: host.shadowRoot.querySelectorAll('.zb-map-item.expanded').length };
    }
    return null;
  })()`);
  ok(!!tail && tail.items.length >= 5, `侧栏本篇概念数 ≥5（实际 ${tail?.items?.length}）`);
  ok(!!tail && tail.items.some((t) => t.includes('梯度下降')), '概念地图含已展开的「梯度下降」');
  ok(!!tail && tail.expanded >= 1, `已展开标记存在（${tail?.expanded} 个）`);

  // 6.2 侧栏「本篇卡点」（改造方案 §4.3）：TOP3 卡点 + 人数 + 演示数据标注 + 点击跳回原文并高亮
  ok(await evaluate(CLICK_STUCK_TAB) === 'clicked', '侧栏切入「本篇卡点」tab');
  const stuckItems = await poll(`(${STUCK_TAB_ITEMS})?.length === 3 ? (${STUCK_TAB_ITEMS}) : null`);
  ok(!!stuckItems && stuckItems[0].includes('链式法则') && stuckItems[0].includes('1,283'),
    `卡点热力 TOP3 首位（${stuckItems?.[0]}）`);
  ok(!!stuckItems && stuckItems.every((t) => t.includes('也卡在这') && t.includes('演示环境数据')),
    '卡点人数如实标注「演示环境数据」来源（§4.5）');
  ok(await evaluate(CLICK_FIRST_STUCK) === 'clicked', '点击卡点条目');
  await sleep(900);
  ok((await evaluate(`CSS.highlights.has('zhiban-jump')`)) === true, '点击卡点跳回原文段落并高亮该词（§4.3）');

  // 6.1 入口按钮：侧栏展开时隐藏，关闭后恢复
  ok((await evaluate(`document.querySelector('#zb-entry > *')?.style.display`)) === 'none',
    '侧栏展开时入口按钮隐藏');
  await evaluate(`(() => {
    const root = document.getElementById('zb-sidebar-root');
    for (const host of root.querySelectorAll('*')) {
      const x = host.shadowRoot?.querySelector?.('.zb-x');
      if (x) { x.click(); return 'closed'; }
    }
    return null;
  })()`);
  await sleep(400);
  ok((await evaluate(`document.querySelector('#zb-entry > *')?.style.display`)) !== 'none',
    '侧栏关闭后入口按钮恢复显示');

  // 7. 导读页
  await evaluate(`location.hash = '#/guide/article-backprop'`);
  await sleep(800);
  const guide = await evaluate(`document.getElementById('app').textContent`);
  ok(guide.includes('你可能需要先搞懂这') && guide.includes('偏导数') && guide.includes('存为我的笔记卡片') && guide.includes('导出 .md'),
    '导读页渲染（含缺口提醒与笔记导出入口）');

  // 8. 答主视角页（改造方案 §4.4）：输入回答链接 → 读者卡点报告 → 一键生成「前置说明」草稿
  await evaluate(`location.hash = '#/creator'`);
  await sleep(600);
  const creator = await evaluate(`document.getElementById('app').textContent`);
  ok(creator.includes('你的读者，卡在这三个地方'), '答主视角页标题「你的读者，卡在这三个地方」（§4.4）');

  const fillAndGo = (link) => `(() => {
    const i = document.querySelector('.creator-input');
    if (!i) return 'noinput';
    i.value = ${JSON.stringify(link)};
    document.querySelector('.creator-go').click();
    return 'ok';
  })()`;
  ok(await evaluate(fillAndGo('#/article/article-derivative')) === 'ok', '粘贴回答链接并生成报告');
  const report = await poll(`document.getElementById('app').textContent.includes('486') ? document.getElementById('app').textContent : null`);
  ok(!!report && report.includes('极限') && report.includes('人卡在这'), '读者卡点报告 TOP3 首位（极限 · 486 人卡在这）');
  ok(!!report && report.includes('演示环境数据'), '卡点报告如实标注数据来源（§4.5）');
  ok(!!report && report.includes('一键生成前置说明草稿'), '提供「一键生成前置说明草稿」入口');
  ok(!!report && report.includes('贴回你的知乎回答'),
    '卡点报告点明产出回到社区的落点（§七-4：知伴不代发布，答主自行补进知乎回答）');

  ok(await evaluate(`(() => {
    const b = document.querySelector('.creator-gen');
    if (!b) return null;
    b.click();
    return 'clicked';
  })()`) === 'clicked', '点击生成前置说明草稿');
  ok(!!(await poll(`location.hash === '#/guide/article-derivative' ? location.hash : null`, 8000)),
    '草稿生成后进入导读页');
  const creatorGuide = await poll(`(() => {
    const t = document.getElementById('app').textContent;
    return t.includes('读者常在这里卡住') ? t : null;
  })()`, 8000);
  ok(!!creatorGuide && creatorGuide.includes('极限') && creatorGuide.includes('原文里这句'),
    '草稿复用导读：卡点概念 + 原文引用，缺定义处留提示由答主补（§4.4）');

  // 8.1 未收录的回答链接：给诚实空状态，不硬凑数据（§4.5）
  await evaluate(`location.hash = '#/creator'`);
  await sleep(600);
  await evaluate(fillAndGo('https://www.zhihu.com/question/1/answer/9999999999'));
  const emptyState = await poll(`document.getElementById('app').textContent.includes('认不出这个链接') ? document.getElementById('app').textContent : null`);
  ok(!!emptyState && emptyState.includes('演示环境只收录了'), '未收录链接给诚实空状态，不硬凑数据（§4.5）');

  // 9. 社区聚合（问题 1 闭环）：本机上报 → 后端 /stuck 聚合 → 页面重新读回「社区上报」，
  // 证明「你划一下，下一个读到的人少卡一次」这条飞轮真的在跑，而不只是本地 localStorage。
  const reported = await fetch(BASE + '/api/stuck', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'report', articleId: 'article-backprop', concept: '链式法则', paragraphIndex: 1 }),
  }).then((r) => r.json());
  ok(reported?.count === 1, '社区上报：本机那一次进到后端聚合（/stuck count=1）');
  const agg = await fetch(BASE + '/api/stuck', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'top', articleId: 'article-backprop', topN: 10 }),
  }).then((r) => r.json());
  ok(Array.isArray(agg?.items) && agg.items.some((i) => i.concept === '链式法则'),
    '社区聚合：别台设备能读回该篇卡点（/stuck top）');
  await evaluate(`location.hash = '#/'`);
  const homeCommunity = await poll(`document.getElementById('app').textContent.includes('社区上报') ? document.getElementById('app').textContent : null`, 8000);
  ok(!!homeCommunity && homeCommunity.includes('演示环境数据 + 社区上报'),
    '首页读回社区聚合并如实标注「演示环境数据 + 社区上报」（问题 1 飞轮可见）');
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
