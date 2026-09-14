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

// 内联 SVG 线性图标（16px 基准，颜色跟随 currentColor）。
// 不引图标字体 / 远程图标库：远程资源在 MV3 CSP 下加载不了，图标字体还会多一次请求与闪动，
// 这里直接把路径内联进打包产物，尺寸交给 CSS 变量 --zb-icon-size 控制。
const ICONS = {
  home: '<path d="M3 10.8 12 3l9 7.8V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-6"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.9 8.1-2.2 5.6-5.6 2.2 2.2-5.6z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2h.01"/>',
  warning: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  tree: '<rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="17" width="6" height="4" rx="1"/><rect x="16" y="17" width="6" height="4" rx="1"/><path d="M12 6v5"/><path d="M5 17v-3h14v3"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h3"/><path d="M8 17h6"/>',
  trend: '<path d="M22 7 13.5 15.5l-4-4L2 19"/><path d="M16 7h6v6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};

// 生成一个图标节点；name 不在表内返回 null（调用方 el() 会自动跳过空子节点）。
export function icon(name, cls = '') {
  const body = ICONS[name];
  if (!body) return null;
  const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return el('span', { class: cls ? `pf-icon ${cls}` : 'pf-icon', html: svg });
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
