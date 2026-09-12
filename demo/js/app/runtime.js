// 运行时上下文：当前页面（文章容器/正文元素）、事件总线。
// 各功能模块从这里拿当前文章作用域，避免全局硬编码。

import { anchorToRanges } from './store.js';
import { collectTextNodes, offsetsToRanges } from '../core/textnodes.js';

const listeners = new Map();

export const runtime = {
  // 当前文章页上下文，离开文章页时为 null
  page: null,
  // 触发跨模块事件（prescan:done、concept:expanded、quiz:done 等）
  emit(event, payload) {
    for (const fn of listeners.get(event) || []) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  },
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
};

export function setPageContext(ctx) {
  runtime.page = ctx;
  runtime.emit('page:change', ctx);
}

export function currentBody() {
  return runtime.page?.body || null;
}

// ---- Learning Hub「回原文」锚点请求（§新功能）----
// hub.js 在 navigate 前写入；main.js 在文章渲染完成后消费并执行定位高亮。
// 避免跨模块循环依赖，挂到 runtime 上。
let pendingAnchor = null;
export function requestAnchorJump(req) { pendingAnchor = req; }
export function consumeAnchorJump(articleId) {
  if (!pendingAnchor || pendingAnchor.articleId !== articleId) return null;
  const req = pendingAnchor;
  pendingAnchor = null;
  return req;
}
export function peekAnchorJump() { return pendingAnchor; }

// 同页锚点跳转：滚动到目标段落，并用 CSS Custom Highlight 标出命中文本（3 秒后消失）。
// 跨页走 requestAnchorJump/consumeAnchorJump（先请求、到达文章页后消费）；
// 同页场景（侧栏卡点热力、答主视角）直接调用本函数，锚点能力复用 store.anchorToRanges。
export function jumpToAnchor(anchor, page) {
  const container = page?.container;
  if (!container || anchor?.paragraphIndex == null) return false;
  const selectors = page.selectors || {};
  const paraSel = selectors.paragraph || 'p, li, blockquote, h2, h3';
  const paras = [...container.querySelectorAll(paraSel)];
  const para = paras[anchor.paragraphIndex];
  if (!para) return false;
  para.scrollIntoView({ behavior: 'smooth', block: 'center' });
  let ranges = anchorToRanges(anchor, container, paraSel, selectors.exclude || null);
  // seed 卡点只有段落索引、没有段内偏移（anchor.text 是概念名）：
  // 在目标段落里找到这个词再高亮，否则「跳到卡住的那个词」只跳段落不给词。
  if (!ranges.length && anchor.text) {
    const collected = collectTextNodes(para, selectors.exclude || null);
    const i = collected.text.indexOf(anchor.text);
    if (i >= 0) ranges = offsetsToRanges(collected, i, i + anchor.text.length);
  }
  if (ranges.length && typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
    try {
      CSS.highlights.set('zhiban-jump', new Highlight(...ranges));
      setTimeout(() => CSS.highlights.delete('zhiban-jump'), 3000);
    } catch { /* 静默：高亮失败不影响跳转 */ }
  }
  return true;
}
