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
