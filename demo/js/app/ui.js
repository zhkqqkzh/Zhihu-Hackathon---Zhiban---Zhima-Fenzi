// 轻量 UI 工具：DOM 构建、Shadow DOM 封装（§15 样式隔离）、Toast。
// ⚠️ 样式注入用可构造样式表（adoptedStyleSheets），不用字符串内联样式——
//    CSP 的样式源策略可能拦截内联样式，浮层会退化成裸 HTML（§15 红线）。

// 资源基址：demo 用相对路径；插件在适配层覆盖为 chrome.runtime.getURL（§8.4 适配层）
export function assetUrl(path) {
  const base = typeof window !== 'undefined' ? window.__ZB_ASSET_BASE__ : null;
  return base ? base + path : './assets/' + path;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // 仅传 sanitizeHtml 清洗后的内容
    else if (k === 'dataset' && v && typeof v === 'object') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// 创建带 Shadow DOM 的根，返回 { host, root }。cssText 用可构造样式表注入。
export function shadowRoot(hostTag = 'div', cssText = '') {
  const host = document.createElement(hostTag);
  const root = host.attachShadow({ mode: 'open' });
  if (cssText) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      root.adoptedStyleSheets = [sheet];
    } catch {
      // 旧内核降级：link 标签引入本地资源（assetUrl 走适配层，插件为 chrome.runtime.getURL）
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetUrl('css/zhiban.css');
      root.appendChild(link);
    }
  }
  return { host, root };
}

// 触发浏览器下载一个文本文件（笔记导出 .md，无接口依赖）。
export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer = null;
let toastSeq = 0; // 覆盖序号：常驻提示被后一条 toast 冲掉后，其 dismiss 不再误关当前提示

export function toast(message, ms = 2600) {
  const root = document.getElementById('zb-toast-root');
  if (!root) return;
  toastSeq++;
  root.textContent = message;
  root.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.classList.remove('show'), ms);
}

// 常驻提示（不自动消失），返回 dismiss()：长耗时过程提示用（如预扫描），不阻塞也不闪一下。
export function toastSticky(message) {
  const root = document.getElementById('zb-toast-root');
  if (!root) return () => {};
  const seq = ++toastSeq;
  clearTimeout(toastTimer);
  root.textContent = message;
  root.classList.add('show');
  return () => { if (seq === toastSeq) root.classList.remove('show'); };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
