// 选区检测（§四-1 选中即问）：划选 → 「问知伴」入口按钮 → 弹浮层。
// 选区检测在 Shadow 外部监听文档事件（§15）；拦截走三层（popup.js）。
// 上下文：段落级截取（§10.4）+ 引句扩句（§10.7）。

import { el, shadowRoot } from './ui.js';
import { runtime } from './runtime.js';
import { interceptSelection } from '../core/stopwords.js';
import { extractParagraphContext } from '../core/context.js';
import { collectTextNodes } from '../core/textnodes.js';
import { expandToSentence } from '../core/quote.js';
import { openPopup, closePopup, isPopupOpen } from './popup.js';

const BTN_CSS = `
:host { all: initial; }
.zb-ask {
  position: fixed; z-index: 99998;
  background: #056de8; color: #fff; border: 0; border-radius: 16px;
  padding: 5px 12px; font-size: 12px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(5,109,232,.35);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  animation: zbin .12s ease-out;
}
@keyframes zbin { from { opacity: 0; transform: translateY(4px); } }
`;

let askHost = null;
let suppressUntil = 0; // 点击按钮后抑制 selectionchange 重定位

export function initSelection() {
  document.addEventListener('selectionchange', () => {
    if (Date.now() < suppressUntil) return;
    if (!runtime.page?.body) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideAsk();
      if (isPopupOpen()) closePopup(); // 仅选区清除时关闭（§15）
      return;
    }
    const range = sel.getRangeAt(0);
    // 作用域严格限定在正文容器内（§10.2 坑 4：评论区、推荐流不被点亮/触发）
    if (!runtime.page.body.contains(range.commonAncestorContainer)) {
      hideAsk();
      return;
    }
    const text = sel.toString().trim();
    if (!text) { hideAsk(); return; }
    showAsk(range, text);
  });
}

function hideAsk() {
  askHost?.remove();
  askHost = null;
}

function showAsk(range, text) {
  hideAsk();
  // 三层拦截（§15）：非空 / 停用词 / 超长——在这里先做掉，不弹按钮；
  // 模型判定"非概念"在 popup 层给友好提示。
  const intercepted = interceptSelection(text);
  if (intercepted) return;
  const { host, root } = shadowRoot('div', BTN_CSS);
  const btn = el('button', { class: 'zb-ask', text: '问知伴' });
  root.appendChild(btn);
  document.getElementById('zb-popup-root').appendChild(host);
  askHost = host;

  const rect = range.getBoundingClientRect();
  const bx = rect.right;
  const by = rect.bottom;
  requestAnimationFrame(() => {
    const r = btn.getBoundingClientRect();
    let left = Math.min(bx, window.innerWidth - r.width - 8);
    let top = by + 6;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, rect.top - r.height - 6);
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
  });

  btn.addEventListener('mousedown', (ev) => ev.preventDefault()); // 保持选区
  btn.addEventListener('click', () => {
    suppressUntil = Date.now() + 400;
    hideAsk();
    ask(runtime.page, text, range);
  });
}

async function ask(page, text, range) {
  // 段落级上下文（§10.4）
  const ctx = extractParagraphContext(range, page.container, page.selectors.paragraph);
  // 原文引用扩句（§10.7）：在所属段落纯文本中定位概念，扩到完整句
  try {
    const collected = collectTextNodes(page.container, page.selectors.exclude);
    const idx = collected.text.indexOf(text);
    if (idx >= 0) {
      // 定位概念所在段落，用段落文本扩句
      const paraText = ctx.paragraphText || ctx.text;
      const pIdx = paraText.indexOf(text);
      if (pIdx >= 0) ctx.quote = expandToSentence(paraText, pIdx, pIdx + text.length);
      else ctx.quote = text;
    } else {
      ctx.quote = text;
    }
  } catch {
    ctx.quote = text;
  }
  runtime.page.context = ctx;
  // 预扫描懒触发（§10.5）：与第一次提问并行发起
  runtime.emit('prescan:maybe');
  const rect = range.getBoundingClientRect();
  openPopup({ concept: text, x: rect.left + rect.width / 2, y: rect.bottom, articleId: page.articleId });
}
