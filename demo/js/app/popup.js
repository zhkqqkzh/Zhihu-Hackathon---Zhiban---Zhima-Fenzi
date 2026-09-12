// 浮层（§15）：Shadow DOM 封装 + 可构造样式表 + 定位翻转 + 三层输出。
// 关闭时机：只由头部「×」按钮关闭——点击浮层外部、清除选区、滚动都不会关。
// 非概念拦截：三层——非空 → 停用词表（stopwords.js）→ 模型判定 is_concept 时友好提示。

import { shadowRoot, el, assetUrl } from './ui.js';
import { interceptSelection } from '../core/stopwords.js';
import { collectTextNodes as collectParagraphTextNodes } from '../core/textnodes.js';
import { mergeStuck, hasStuckMark, formatCount } from '../core/stuck.js';
import { api, sanitizeHtml, zhihuSearchUrl, scfExplainStream, STREAM_EXPLAIN } from './api.js';
import { runtime } from './runtime.js';
import * as store from './store.js';
import { getGuideTrigger } from './guide.js';
import { buildConceptNote, saveNote, exportNote } from './notes.js';
import { onRevisitCheck } from './revisit.js';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.zb-pop {
  position: fixed; right: 16px; bottom: 16px; z-index: 99999; width: 340px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e7e7e7; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(18,18,18,.14); overflow: hidden;
  animation: zbin .16s ease-out;
}
@keyframes zbin { from { opacity: 0; transform: translateY(10px); } }
.zb-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px 8px; border-bottom: 1px solid #f0f0f0; flex: none; }
.zb-fox { width: 26px; height: 26px; border-radius: 50%; }
.zb-title { font-size: 13px; color: #8590a6; flex: 1; }
.zb-x { cursor: pointer; color: #8590a6; border: 0; background: none; font-size: 16px; padding: 0 2px; }
.zb-x:hover { color: #121212; }
.zb-body { padding: 12px 14px; overflow: auto; }
.zb-concept { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
.zb-def { font-size: 14px; line-height: 1.7; color: #121212; }
.zb-ctx { font-size: 13px; line-height: 1.7; color: #444; margin-top: 10px; padding: 8px 10px; background: #f7f9fc; border-radius: 8px; }
.zb-pre { margin-top: 10px; }
.zb-pre-btn { font-size: 13px; color: #056de8; background: none; border: 0; cursor: pointer; padding: 4px 0; }
.zb-pre-list { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
.zb-pre-item { font-size: 13px; line-height: 1.6; padding: 8px 10px; background: #f6f6f6; border-radius: 8px; }
.zb-link { display: block; font-size: 12px; color: #056de8; text-decoration: none; margin-top: 4px; }
.zb-loading { font-size: 13px; color: #8590a6; padding: 18px 0; text-align: center; }
.zb-hint { font-size: 13px; line-height: 1.7; color: #444; padding: 8px 0; }
.zb-foot { padding: 8px 14px 10px; font-size: 11px; color: #b0b8c4; border-top: 1px solid #f0f0f0; }
.zb-badge { display: inline-block; font-size: 10px; border: 1px solid #e7e7e7; border-radius: 4px; padding: 1px 5px; color: #8590a6; margin-left: 6px; }
.zb-revisit { font-size: 13px; margin-top: 10px; padding: 8px 10px; background: #fff8ef; border: 1px solid #f5d9b8; border-radius: 8px; }
.zb-revisit button { margin: 6px 6px 0 0; font-size: 12px; border: 1px solid #e0d5c5; background: #fff; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
.zb-actions { display: flex; gap: 8px; margin-top: 12px; }
.zb-act { flex: 1; font-size: 12px; padding: 6px 8px; border: 1px solid #d3d9e0; background: #fff; border-radius: 8px; cursor: pointer; color: #121212; }
.zb-act:hover { border-color: #056de8; color: #056de8; }
.zb-act.is-done { color: #8590a6; border-color: #e7e7e7; cursor: default; }
.zb-act.is-done:hover { color: #8590a6; border-color: #e7e7e7; }
.zb-stuck-note { font-size: 11px; color: #b0b8c4; margin-top: 6px; }
`;

let ctx = null; // { host, root, close }

// 解释加载统一入口：会话级管理（§17 缓存 + 预取 + 流式去重共用同一次请求）。
// sessions: key articleId::concept -> { promise, raw, subs }
// selection.js 在用户点击前就会调用 prefetchExplain 预取；线上模式为 SSE 流式，
// 弹窗打开后订阅 subscribeExplainRaw 即可「一边接收一边显示」。
const sessions = new Map();

// 解释拿不到时的兜底。_degraded 标记用于「不进缓存」——上游偶发失败（实测约两成请求
// 会撞上 GLM 无响应被 55s 熔断）如果被缓存，这个词就会永远显示「没有解释」。
const fallbackExplain = (concept) => ({
  is_concept: true,
  definition: `「${concept}」的解释这次没拿到，可能是模型繁忙。可以重试，或先去知乎搜搜看。`,
  in_context: '',
  prerequisites: [],
  _degraded: true,
});

// 结果是否可用：模型偶尔返回合法 JSON 却没有 definition（或字段名被改写），
// 这种结果渲染出来就是一片空白浮层（loading 已移除、defEl 点亮但无文字）。
// is_concept === false 是模型的明确结论，算有效——浮层会另给「不是概念」的提示。
function isUsableExplain(data) {
  if (!data) return false;
  if (data.is_concept === false) return true;
  return typeof data.definition === 'string' && data.definition.trim() !== '';
}

function startSession(articleId, concept) {
  const key = `${articleId}::${concept}`;
  let s = sessions.get(key);
  if (s) return s;
  s = { raw: '', subs: new Set(), promise: null };
  s.promise = (async () => {
    // §17 缓存是 { data, at } 包装（见 store.saveAnswerCache），必须解包 .data。
    // 只认有效缓存：旧版本把失败兜底也写了进去，会让该词永远「没有解释」。
    // 读取包 try：localStorage 里的损坏 JSON 会让 JSON.parse 抛错，一旦抛出，
    // loadExplanation 的 promise 就 reject，浮层会永远停在加载态（表现为「无反应」）。
    let cached = null;
    try { cached = await store.getAnswerCache(articleId, concept); } catch { /* 缓存损坏：当作没缓存 */ }
    if (cached?.data && !cached.data._degraded && isUsableExplain(cached.data)) {
      sessions.delete(key);
      return cached.data;
    }
    let data = null;
    try {
      if (STREAM_EXPLAIN) {
        // 线上 SCF：流式接收，每个 delta 通过 onRaw 广播累计原文
        data = await scfExplainStream(
          { concept, context: runtime.page?.context?.text || '', articleId },
          (raw) => {
            s.raw = raw;
            s.subs.forEach((fn) => { try { fn(raw); } catch { /* 渲染异常不中断接收 */ } });
          },
        );
      } else {
        data = await api.explain({
          concept,
          context: runtime.page?.context?.text || '',
          articleId,
        });
      }
    } catch (e) {
      // 出错时打日志便于排查（F12 → Console），用户侧仍给兜底文案（§13.4）
      console.error('[知伴] 解释获取失败:', e);
    }
    if (!isUsableExplain(data)) data = fallbackExplain(concept);
    // 兜底不进缓存：重选同一个词会重新请求，而不是一辈子吃这条失败结果
    if (!data._degraded) {
      try { await store.saveAnswerCache(articleId, concept, data); } catch { /* 写缓存失败不影响展示 */ }
    }
    sessions.delete(key);
    return data;
  })();
  sessions.set(key, s);
  return s;
}

export function loadExplanation(articleId, concept) {
  return startSession(articleId, concept).promise;
}

export function prefetchExplain(articleId, concept) {
  startSession(articleId, concept).promise.catch(() => {});
}

// 订阅流式累计原文：注册时立即回调当前已收到的内容，之后每个 delta 再回调。
// 返回取消订阅函数。缓存命中 / 非流式模式下 raw 始终为空串。
export function subscribeExplainRaw(articleId, concept, fn) {
  const s = startSession(articleId, concept);
  s.subs.add(fn);
  if (s.raw) fn(s.raw);
  return () => s.subs.delete(fn);
}

// 从流式累积的部分 JSON 文本中容错抽取已到达的字段（字符串值可能还没闭合）。
// definition / context_why 是模板里最靠前的两个字段，用户最想立刻看到。
function parsePartialExplain(raw) {
  const grab = (field) => {
    const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(raw);
    if (!m) return '';
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };
  return { definition: grab('definition'), in_context: grab('context_why') };
}

export function isPopupOpen() { return !!ctx; }

export function closePopup() {
  if (!ctx) return;
  ctx.host.remove();
  ctx = null;
  runtime.emit('popup:closed');
}

// 右下角常驻浮窗：不再跟随选区定位（滚动/翻页也不跑）；顶部头部栏含关闭按钮。
export function openPopup({ concept, articleId }) {
  closePopup();
  const { host, root } = shadowRoot('div', CSS);
  document.getElementById('zb-popup-root').appendChild(host);
  const pop = el('div', { class: 'zb-pop' });
  root.appendChild(pop);

  // 头部常驻：看山头像 + 标题 + 右上角关闭按钮
  const head = el('div', { class: 'zb-head' }, [
    el('img', { class: 'zb-fox', src: assetUrl('kanshan/idle.gif'), alt: '看山' }),
    el('span', { class: 'zb-title', text: '知伴 · 在这篇里讲明白' }),
    el('button', { class: 'zb-x', text: '×', onclick: () => { window.getSelection()?.removeAllRanges(); closePopup(); } }),
  ]);
  pop.appendChild(head);

  // 正文骨架：概念名 + 加载占位 + 两个流式字段（先占位隐藏，收到内容再点亮）
  // 文案要诚实（§五-2）：服务端冷启动时首答可能十几秒，别让用户以为卡死。
  const loadingEl = el('div', { class: 'zb-loading', text: '看山正眯着眼睛读这段……（首次可能要等十几秒，之后就快了）' });
  const defEl = el('div', { class: 'zb-def', style: 'display:none' });
  const ctxEl = el('div', { class: 'zb-ctx', style: 'display:none' });
  const bodyEl = el('div', { class: 'zb-body' }, [
    el('div', { class: 'zb-concept', text: concept }),
    loadingEl,
    defEl,
    ctxEl,
  ]);
  pop.appendChild(bodyEl);

  ctx = { host, close: closePopup };

  // 流式渐进渲染（§一边接收一边显示）：每个 delta 到达就刷新对应字段。
  // 预取在点击前已由 selection.js 发起——打开时多半已经在途，第一屏几乎零等待。
  const unsub = subscribeExplainRaw(articleId, concept, (raw) => {
    const part = parsePartialExplain(raw);
    if (part.definition) {
      loadingEl.style.display = 'none';
      defEl.style.display = '';
      defEl.textContent = part.definition;
    }
    if (part.in_context) {
      ctxEl.style.display = '';
      ctxEl.textContent = part.in_context;
    }
  });

  (async () => {
    // 提问记录缓存 + 预取/流式去重（§17；点击前 selection.js 已并行发起）
    const data = await loadExplanation(articleId, concept);
    unsub();

    if (!data.is_concept) {
      head.querySelector('.zb-title').textContent = '知伴';
      bodyEl.replaceChildren(el('div', { class: 'zb-hint', text: `「${concept}」看起来不是一个需要解释的概念。换一个专业名词试试？` }));
      return;
    }

    // 最终渲染：先把「解释本身」上屏（§13.4 浮层不空窗），再做持久化等副作用。
    // 记录读写依赖 localStorage，可能因旧版本脏数据（JSON.parse 抛错）或配额爆掉，
    // 绝不能让这些副作用阻塞用户看到解释——否则浮层会一直停在加载态（「无反应」）。
    // 与流式展示收敛一致（流式期间可能已渲染，这里是幂等覆盖）。
    loadingEl.remove();
    defEl.style.display = '';
    defEl.textContent = data.definition;
    if (data.in_context) {
      ctxEl.style.display = '';
      ctxEl.textContent = data.in_context;
    } else {
      ctxEl.remove();
    }

    // 副作用：概念记录 / 锚点 / 回访卡 / 前置知识。任何一步失败都不影响已上屏的解释。
    try {
      // 概念记录持久化（§9.2）
      const existing = await store.getConceptRecord(concept);
      // 原文锚点（§Learning Hub）：记录所在段落索引 + 段内文本偏移，供 hub「回原文」定位高亮。
      const anchor = captureAnchor(runtime.page, concept);
      let anchors = existing?.anchors || [];
      let seenIn = [...new Set([...(existing?.askedIn || []), articleId])];
      // 锚点去重：同文章同位置不重复记录
      if (anchor && !anchors.some(
        (a) => a.articleId === anchor.articleId && a.paragraphIndex === anchor.paragraphIndex &&
          a.startOffset === anchor.startOffset && a.endOffset === anchor.endOffset,
      )) {
        anchors = [...anchors, anchor].slice(-50); // 上限 50 个防膨胀
      }
      const record = await store.saveConceptRecord(concept, {
        definition: data.definition,
        inContext: data.in_context,
        prerequisites: data.prerequisites || [],
        quizQuestion: data.quiz_question || '',
        quizPoints: data.quiz_points || [],
        quote: runtime.page?.context?.quote || runtime.page?.context?.selection || '',
        firstSource: existing?.firstSource || { articleId, at: Date.now() },
        askedIn: seenIn, // 边验证（§11.8）：记录问过它的所有文章
        anchors,         // Learning Hub 锚点（§新功能）
        mastery: existing?.mastery || 'unvisited',
      });
      if (!existing) runtime.emit('concept:first', record);

      // 记入本篇已展开（§9.1）
      const art = await store.getArticleRecord(articleId);
      if (art && !art.expandedConcepts.includes(concept)) {
        art.expandedConcepts.push(concept);
        await store.saveArticleRecord(articleId, { expandedConcepts: art.expandedConcepts });
      }
      runtime.emit('concept:expanded', { concept, articleId, record });

      // 短尾巴回访（§8 / 10.9）：选中旧概念且到回访时间 → 弹出回访卡片
      const revisit = await onRevisitCheck(record);
      if (revisit) bodyEl.appendChild(revisit);

      // 前置知识（§四-2）：点开给一句话解释 + 站内高赞回答
      if ((data.prerequisites || []).length > 0) {
        const preBox = el('div', { class: 'zb-pre' });
        const list = el('div', { class: 'zb-pre-list', style: 'display:none' });
        preBox.append(
          el('button', { class: 'zb-pre-btn', text: `你可能需要先了解（${data.prerequisites.length}）`, onclick: async (ev) => {
            ev.target.style.display = 'none';
            list.style.display = 'flex';
            for (const pre of data.prerequisites) {
              const item = el('div', { class: 'zb-pre-item' }, [
                el('div', { text: `「${pre}」—— 正在从站内找讲得最好的回答……` }),
              ]);
              list.appendChild(item);
              const links = await fetchPrereqLinks(pre);
              // 注意：replaceChildren 不展开数组参数，必须把每个 <a> 作为独立节点传入，
              // 否则数组会被当成单个参数导致链接渲染成纯文本（点击无效）。
              const kids = [
                el('div', { text: `「${pre}」—— ${links.oneLiner}` }),
                ...links.items.slice(0, 2).map((l) =>
                  el('a', { class: 'zb-link', href: l.url, target: '_blank', rel: 'noopener', text: `→ ${l.title}（${l.author} · ${l.voteupCount} 赞同）` })),
              ];
              if (links.items.length === 0 && links.fallback) {
                kids.push(el('a', { class: 'zb-link', href: links.fallback, target: '_blank', rel: 'noopener', text: `→ 去知乎搜索「${pre}」` }));
              }
              item.replaceChildren(...kids);
            }
          } }),
          list,
        );
        bodyEl.appendChild(preBox);
      }
    } catch (e) {
      console.error('[知伴] 浮层附加信息生成失败（不影响解释展示）:', e);
    }

    // 创作出口（计划书第 4/7 条）：解释可存成笔记卡片并导出 .md。纯本地，无接口依赖。
    const quote = runtime.page?.context?.quote || runtime.page?.context?.selection || '';
    const makeNote = () => buildConceptNote({
      concept, articleId, definition: data.definition, inContext: data.in_context, quote,
    });
    let note = null;
    bodyEl.appendChild(el('div', { class: 'zb-actions' }, [
      el('button', { class: 'zb-act', text: '存为我的笔记卡片', onclick: async () => { note = await saveNote(await makeNote()); } }),
      el('button', { class: 'zb-act', text: '导出 .md', onclick: async () => { note = await exportNote(note || await makeNote(), concept); } }),
    ]));

    // 卡点上报（改造方案 §4.2）：把「卡住」从私有消耗品变成社区公共品。
    // 人数 = core/stuck.js 的 seed（演示环境数据）+ 本浏览器现场上报，读取时叠加（§4.5）。
    // 数据来源必须可追溯（验收 §七-6）：含演示数据时如实标注，不冒充真实统计。
    const marks = await store.getStuckMarks(articleId);
    const stuckBtn = el('button', { class: 'zb-act' });
    const stuckNote = el('div', { class: 'zb-stuck-note' });
    const paintStuck = (list) => {
      const item = mergeStuck(articleId, list).find((s) => s.concept === concept) || null;
      const count = item?.count || 0;
      const done = hasStuckMark(list, concept);
      stuckBtn.textContent = done
        ? `已记下 · ${formatCount(count)} 人也卡在这`
        : (count > 0 ? `这里我也卡了一下 · ${formatCount(count)} 人也卡在这` : '这里我也卡了一下');
      stuckBtn.disabled = done;
      stuckBtn.classList.toggle('is-done', done);
      stuckNote.textContent = !item
        ? '这个词还没有人标记过，你是第一个。'
        : item.seedCount > 0 ? '演示环境数据 + 你的上报，只存本浏览器' : '你的上报，只存本浏览器';
    };
    paintStuck(marks);
    stuckBtn.onclick = async () => {
      stuckBtn.disabled = true;
      const anchor = captureAnchor(runtime.page, concept);
      const next = await store.addStuckMark(articleId, {
        concept,
        paragraphIndex: anchor?.paragraphIndex ?? null,
        startOffset: anchor?.startOffset || 0,
        endOffset: anchor?.endOffset || 0,
      });
      paintStuck(next);
    };
    bodyEl.appendChild(el('div', { class: 'zb-actions' }, [stuckBtn]));
    bodyEl.appendChild(stuckNote);

    bodyEl.appendChild(el('div', { class: 'zb-foot', text: '所有记录仅存于本浏览器，不上传服务器' }));
    await getGuideTrigger(articleId).catch(() => {}); // 本篇 ≥3 概念触发导读生成提醒
  })();

  return ctx;
}

// 原文锚点捕获（§Learning Hub 卖点 1）：
// 在正文容器里找 concept 所在段落，记录 { articleId, paragraphIndex, startOffset, endOffset }。
// 偏移为"该段收集后的纯文本偏移"，与 core/textnodes.js 的 offsetsToRanges 对齐，可回映射高亮。
function captureAnchor(page, concept) {
  try {
    if (!page?.container || !page?.selectors) return null;
    const paras = [...page.container.querySelectorAll(page.selectors.paragraph || 'p, li, blockquote, h2, h3')];
    if (!paras.length) return null;
    const selText = page.context?.selection || concept;
    // 1) 优先：选区文本命中的段落
    let paraIdx = paras.findIndex((p) => p.textContent.includes(selText));
    if (paraIdx < 0) {
      // 2) 兜底：记录段落元素（selection.js 缓存了 paragraph）按引用定位
      paraIdx = page.context?.paragraph ? paras.indexOf(page.context.paragraph) : -1;
    }
    if (paraIdx < 0) paraIdx = 0;
    const para = paras[paraIdx];
    const collected = collectParagraphTextNodes(para, page.selectors.exclude || null);
    const q = selText || concept;
    let start = collected.text.indexOf(q);
    if (start < 0) start = collected.text.indexOf(concept);
    if (start < 0) { start = 0; }
    return {
      articleId: page.articleId || '',
      paragraphIndex: paraIdx,
      startOffset: start,
      endOffset: Math.min(collected.text.length, start + Math.max(q.length, concept.length)),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

// 前置知识：一句话解释（复用 explain 缓存/接口）+ 站内搜索链接（§四-2 / §17 缓存）
async function fetchPrereqLinks(pre) {
  const cached = await store.getLinkCache(pre);
  if (cached?.items?.length) return { items: cached.items, oneLiner: cached.oneLiner || '' };
  const [explainRes, searchRes] = await Promise.all([
    api.explain({ concept: pre, context: '', articleId: '' }).catch(() => null),
    api.search({ query: pre }).catch(() => null),
  ]);
  const items = (searchRes?.items || []).map((it) => ({
    title: it.title, author: it.author, voteupCount: it.voteupCount,
    url: it.url || zhihuSearchUrl(pre),
  }));
  const oneLiner = explainRes?.definition || '站内的优质解释';
  await store.saveLinkCache(pre, { items, oneLiner });
  return { items, oneLiner, fallback: zhihuSearchUrl(pre) };
}

// 关闭时机只有两处：头部「×」按钮，以及 openPopup 开新浮层前的重置。
// 刻意不监听外部点击 / 滚动 / 选区清除——用户没点关闭就一直留着，方便反复对照原文。
