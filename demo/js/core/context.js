// 段落级上下文截取（方案 10.4）。
// 找到选区起点所在段落，取该段落及其前后各一段；
// 若拼接后超长，按选区为中心向两侧截断到安全长度。
// 仅在浏览器中调用。

const MAX_CONTEXT_LEN = 1200;

export function extractParagraphContext(range, container, paragraphSelector) {
  const sel = { start: range.startOffset, end: range.endOffset };
  const startPara = findParagraph(range.startContainer, container, paragraphSelector);
  if (!startPara) {
    // 兜底：纯文本截断
    const t = range.toString();
    return { text: t.slice(0, MAX_CONTEXT_LEN), selection: t, quoted: t };
  }
  const paras = collectParagraphs(container, paragraphSelector);
  const idx = paras.indexOf(startPara);
  const picked = [paras[idx - 1], paras[idx], paras[idx + 1]].filter(Boolean);
  const selectionText = range.toString();
  let text = picked.map((p) => p.textContent.trim()).filter(Boolean).join('\n');
  if (text.length > MAX_CONTEXT_LEN) {
    // 以选区为中心向两侧截断到安全长度
    const center = text.indexOf(selectionText);
    const pivot = center >= 0 ? center + selectionText.length / 2 : text.length / 2;
    const half = Math.floor(MAX_CONTEXT_LEN / 2);
    const from = Math.max(0, Math.floor(pivot) - half);
    text = (from > 0 ? '…' : '') + text.slice(from, from + MAX_CONTEXT_LEN) + (from + MAX_CONTEXT_LEN < text.length ? '…' : '');
  }
  return {
    text,
    selection: selectionText,
    paragraphText: startPara.textContent.trim(),
    paragraph: startPara,
  };
}

function findParagraph(node, container, paragraphSelector) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== container) {
    if (el.matches && el.matches(paragraphSelector)) return el;
    el = el.parentElement;
  }
  return null;
}

function collectParagraphs(container, paragraphSelector) {
  return [...container.querySelectorAll(paragraphSelector)];
}
