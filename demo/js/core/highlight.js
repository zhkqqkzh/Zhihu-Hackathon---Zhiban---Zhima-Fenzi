// 概念高亮（方案 10.3）：浏览器原生自定义高亮接口，零 DOM 变更。
// - 缓存概念词表而非 Range；展示时由文本节点匹配重新计算（Range 生命周期问题）。
// - DOM 变化后由调用方用 MutationObserver 触发重新匹配与注册。
// - 不支持时静默跳过高亮，其余功能照常；Range 失效绝不抛错。

import { collectTextNodes, offsetsToRanges } from './textnodes.js';
import { matchConcepts } from './match.js';

export const HIGHLIGHT_NAME = 'zhiban-concept';
export const HIGHLIGHT_EXPANDED_NAME = 'zhiban-concept-expanded';

export function isHighlightSupported() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

// concepts: string[]；expandedConcepts: string[]（已展开过的换一种颜色）。
// 返回 { matched: number }；任何失败静默降级。
export function registerConceptHighlights(container, excludeSelector, concepts, expandedConcepts = []) {
  if (!isHighlightSupported() || !container) return { matched: 0, supported: false };
  try {
    const collected = collectTextNodes(container, excludeSelector);
    const matches = matchConcepts(collected.text, concepts);
    const expandedSet = new Set(expandedConcepts);
    const normalRanges = [];
    const expandedRanges = [];
    for (const m of matches) {
      const bucket = expandedSet.has(m.concept) ? expandedRanges : normalRanges;
      for (const r of offsetsToRanges(collected, m.start, m.end)) bucket.push(r);
    }
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...normalRanges));
    CSS.highlights.set(HIGHLIGHT_EXPANDED_NAME, new Highlight(...expandedRanges));
    return { matched: matches.length, supported: true };
  } catch {
    return { matched: 0, supported: true, failed: true };
  }
}

export function clearConceptHighlights() {
  if (!isHighlightSupported()) return;
  try {
    CSS.highlights.delete(HIGHLIGHT_NAME);
    CSS.highlights.delete(HIGHLIGHT_EXPANDED_NAME);
  } catch {
    /* 静默 */
  }
}
