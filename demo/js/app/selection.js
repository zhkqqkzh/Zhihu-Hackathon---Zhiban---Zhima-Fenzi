// 选区检测（§四-1 选中即问）：划选 → 「问知伴」入口按钮 → 弹浮层。
// 选区检测在 Shadow 外部监听文档事件（§15）；拦截走三层（popup.js）。
// 上下文：段落级截取（§10.4）+ 引句扩句（§10.7）。

import { el, shadowRoot, toast } from './ui.js';
import { runtime } from './runtime.js';
import { interceptSelection } from '../core/stopwords.js';
import { extractParagraphContext } from '../core/context.js';
import { collectTextNodes } from '../core/textnodes.js';
import { expandToSentence } from '../core/quote.js';
import { openPopup, prefetchExplain } from './popup.js';

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
    if (!runtime.page) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideAsk();
      return; // 选区清除只收起「问知伴」按钮，不关解释浮层（浮层只由 × 关闭）
    }
    const range = sel.getRangeAt(0);

    // 多回答支持：动态解析划词所在的实际回答容器，并同步 runtime.page。
    // 问题页有多个回答时，runtime.page 初始指向第一个回答容器，后续回答的选区
    // 会落在 body 之外，需按选区最近祖先重新解析 container/body（§10.2 坑 4）。
    let container = runtime.page.container;
    let body = runtime.page.body;
    if (!body.contains(range.commonAncestorContainer)) {
      const answerNode = range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
      const answerCard = answerNode?.closest?.(runtime.page.selectors.articleContainer);
      if (answerCard) {
        container = answerCard;
        body = answerCard.querySelector(runtime.page.selectors.articleBody) || answerCard;
        runtime.page.container = container;
        runtime.page.body = body;
      }
    }
    if (!body || !body.contains(range.commonAncestorContainer)) {
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

// 段落级上下文 + 引句扩句（§10.4 / §10.7）：showAsk 和 ask 共用。
// 必须在 prefetch 之前算好并写入 runtime.page.context——loadExplanation 读取它作为请求上下文。
function computeContext(range, text) {
  const page = runtime.page;
  const ctx = extractParagraphContext(range, page.container, page.selectors.paragraph);
  try {
    const collected = collectTextNodes(page.container, page.selectors.exclude);
    const idx = collected.text.indexOf(text);
    if (idx >= 0) {
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
  return ctx;
}

function showAsk(range, text) {
  hideAsk();
  // 三层拦截（§15）：非空 / 停用词 / 超长——在这里先做掉，不弹按钮；
  // 模型判定"非概念"在 popup 层给友好提示。
  const intercepted = interceptSelection(text);
  if (intercepted) {
    // interceptSelection 返回的是友好提示文案，不是布尔值——早期这里写成静默 return，
    // 划到停用词/纯标点/超长文本时既不弹按钮也没任何反馈，看起来像「无解释无反应」。
    toast(intercepted);
    return;
  }
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

  // 预取：选区一出现就并行发起解释请求（§设计：点击时已在途/完成，感知延迟≈0）。
  // 真实模型下这一步把 12s 的等待从「点击后」挪到「划选后」，用户点开即可见。
  // 注意：必须先算好 context 写入 runtime.page 再 prefetch——loadExplanation 读它作为请求上下文。
  if (runtime.page?.articleId) {
    runtime.page.context = computeContext(range, text);
    prefetchExplain(runtime.page.articleId, text);
  }
}

async function ask(page, text, range) {
  runtime.page.context = computeContext(range, text);
  // 预扫描兜底触发（§10.5）：正常已在打开文章时跑完，这里只是没有命中缓存时补一次
  runtime.emit('prescan:maybe');
  openPopup({ concept: text, articleId: page.articleId }); // 右下角浮窗，无需选区坐标
}
