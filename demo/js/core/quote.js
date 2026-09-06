// 原文引用扩句（方案 10.7）：从概念位置出发，向前/向后找最近句末标点，
// 取中间部分作为引用。纯函数，可在 Node 中测试。

const SENTENCE_ENDS = new Set(['。', '！', '？', '；', '…', '.', '!', '?', ';', '\n']);

export function expandToSentence(paragraphText, start, end) {
  if (!paragraphText) return '';
  const s = Math.max(0, start);
  const e = Math.min(paragraphText.length, end);
  let from = 0;
  for (let i = s - 1; i >= 0; i--) {
    if (SENTENCE_ENDS.has(paragraphText[i])) { from = i + 1; break; }
  }
  let to = paragraphText.length;
  for (let i = e; i < paragraphText.length; i++) {
    if (SENTENCE_ENDS.has(paragraphText[i])) { to = i + 1; break; }
  }
  return paragraphText.slice(from, to).trim();
}
