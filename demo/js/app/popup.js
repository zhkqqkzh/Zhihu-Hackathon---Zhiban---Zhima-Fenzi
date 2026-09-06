// 浮层（§15）：Shadow DOM 封装 + 可构造样式表 + 定位翻转 + 三层输出。
// 关闭时机：仅当选区被清除或点击外部时关闭；滚动时不关闭。
// 非概念拦截：三层——非空 → 停用词表（stopwords.js）→ 模型判定 is_concept 时友好提示。

import { shadowRoot, el, assetUrl } from './ui.js';
import { interceptSelection } from '../core/stopwords.js';
import { api, sanitizeHtml, zhihuSearchUrl } from './api.js';
import { runtime } from './runtime.js';
import * as store from './store.js';
import { getGuideTrigger } from './guide.js';
import { onRevisitCheck } from './revisit.js';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
.zb-pop {
  position: fixed; z-index: 99999; width: 340px; max-width: calc(100vw - 24px);
  background: #fff; border: 1px solid #e7e7e7; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(18,18,18,.14); overflow: hidden;
  animation: zbin .16s ease-out;
}
@keyframes zbin { from { opacity: 0; transform: translateY(6px); } }
.zb-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px 8px; border-bottom: 1px solid #f0f0f0; }
.zb-fox { width: 26px; height: 26px; border-radius: 50%; }
.zb-title { font-size: 13px; color: #8590a6; flex: 1; }
.zb-x { cursor: pointer; color: #8590a6; border: 0; background: none; font-size: 16px; }
.zb-body { padding: 12px 14px; max-height: 55vh; overflow: auto; }
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
`;

let ctx = null; // { host, root, close }

export function isPopupOpen() { return !!ctx; }

export function closePopup() {
  if (!ctx) return;
  ctx.host.remove();
  ctx = null;
  runtime.emit('popup:closed');
}

const TOPBAR_SAFE = 60; // 顶部吸顶栏安全边距（§15）

export function openPopup({ concept, x, y, articleId }) {
  closePopup();
  const { host, root } = shadowRoot('div', CSS);
  document.getElementById('zb-popup-root').appendChild(host);
  const pop = el('div', { class: 'zb-pop' }, [el('div', { class: 'zb-loading', text: '看山正眯着眼睛读这段……' })]);
  root.appendChild(pop);

  // 定位：超出底部自动翻转，视口内收敛（§15）
  const place = () => {
    pop.style.visibility = 'hidden';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const rect = pop.getBoundingClientRect();
    let left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
    let top = y + 12;
    if (top + rect.height > window.innerHeight - 8) top = Math.max(TOPBAR_SAFE, y - rect.height - 12);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.visibility = 'visible';
  };
  requestAnimationFrame(place);

  const body = pop.querySelector('.zb-loading');
  const renderHead = (label) => {
    const head = el('div', { class: 'zb-head' }, [
      el('img', { class: 'zb-fox', src: assetUrl('kanshan/idle.gif'), alt: '看山' }),
      el('span', { class: 'zb-title', text: label }),
      el('button', { class: 'zb-x', text: '×', onclick: () => { window.getSelection()?.removeAllRanges(); closePopup(); } }),
    ]);
    pop.insertBefore(head, pop.firstChild);
    return head;
  };

  ctx = { host, close: closePopup };

  (async () => {
    // 提问记录缓存（§17：文章 ID + 选中词，防现场连续提问触发限流）
    let data = await store.getAnswerCache(articleId, concept);
    if (!data) {
      const res = await api.explain({
        concept,
        context: runtime.page?.context?.text || '',
        articleId,
      }).catch(() => null);
      data = res || { is_concept: true, definition: `「${concept}」的解释暂时拿不到，可以先跳知乎搜索看看。`, in_context: '', prerequisites: [] };
      await store.saveAnswerCache(articleId, concept, data);
    }

    if (!data.is_concept) {
      renderHead('知伴');
      body.replaceWith(el('div', { class: 'zb-body' }, [
        el('div', { class: 'zb-hint', text: `「${concept}」看起来不是一个需要解释的概念。换一个专业名词试试？` }),
      ]));
      return;
    }

    renderHead('知伴 · 在这篇里讲明白');
    // 概念记录持久化（§9.2）
    const existing = await store.getConceptRecord(concept);
    const record = await store.saveConceptRecord(concept, {
      definition: data.definition,
      inContext: data.in_context,
      prerequisites: data.prerequisites || [],
      quizQuestion: data.quiz_question || '',
      quizPoints: data.quiz_points || [],
      quote: runtime.page?.context?.quote || runtime.page?.context?.selection || '',
      firstSource: existing?.firstSource || { articleId, at: Date.now() },
      askedIn: [...new Set([...(existing?.askedIn || []), articleId])], // 边验证（§11.8）：记录问过它的所有文章
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

    const bodyEl = el('div', { class: 'zb-body' }, [
      el('div', { class: 'zb-concept', text: concept }),
      el('div', { class: 'zb-def', text: data.definition }),
      data.in_context ? el('div', { class: 'zb-ctx', text: data.in_context }) : null,
    ]);
    body.replaceWith(bodyEl);

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
            item.replaceChildren(
              el('div', { text: `「${pre}」—— ${links.oneLiner}` }),
              links.items.slice(0, 2).map((l) =>
                el('a', { class: 'zb-link', href: l.url, target: '_blank', rel: 'noopener', text: `→ ${l.title}（${l.author} · ${l.voteupCount} 赞同）` })),
              links.items.length === 0 && links.fallback
                ? el('a', { class: 'zb-link', href: links.fallback, target: '_blank', rel: 'noopener', text: `→ 去知乎搜索「${pre}」` })
                : null,
            );
          }
        } }),
        list,
      );
      bodyEl.appendChild(preBox);
    }

    if (revisit) bodyEl.appendChild(revisit);

    bodyEl.appendChild(el('div', { class: 'zb-foot', text: '所有记录仅存于本浏览器，不上传服务器' }));
    await getGuideTrigger(articleId); // 本篇 ≥3 概念触发导读生成提醒
    requestAnimationFrame(place);
  })();

  return ctx;
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

// 点击外部关闭（§15：滚动不关闭——scroll 事件刻意不监听）
document.addEventListener('mousedown', (ev) => {
  if (!ctx) return;
  if (!ev.composedPath().some((n) => n === ctx.host)) closePopup();
});
