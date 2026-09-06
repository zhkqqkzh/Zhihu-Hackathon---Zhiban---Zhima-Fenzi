// 运行时上下文：当前页面（文章容器/正文元素）、事件总线。
// 各功能模块从这里拿当前文章作用域，避免全局硬编码。

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
