// 文本节点合并（方案 10.1，全项目最难的一块）。
// 用树遍历器收集正文容器内所有文本节点，排除脚本/样式/代码/按钮；
// 为每个节点记录在拼接后全文中的起止偏移；匹配结果通过偏移映射回真实 DOM 区间。
// 仅在浏览器中调用，Node 侧只做语法检查。

export function collectTextNodes(container, excludeSelector) {
  const doc = container.ownerDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let el = node.parentElement;
      while (el && el !== container) {
        if (excludeSelector && el.matches(excludeSelector)) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let text = '';
  let n;
  while ((n = walker.nextNode())) {
    const start = text.length;
    text += n.nodeValue;
    nodes.push({ node: n, start, end: text.length });
  }
  return { text, nodes };
}

// 把拼接文本上的 [start, end) 区间映射回真实 DOM Range 列表。
export function offsetsToRanges(collected, start, end) {
  const ranges = [];
  const doc = container_doc(collected);
  for (const entry of collected.nodes) {
    if (entry.end <= start) continue;
    if (entry.start >= end) break;
    const s = Math.max(start, entry.start) - entry.start;
    const e = Math.min(end, entry.end) - entry.start;
    const range = doc.createRange();
    range.setStart(entry.node, s);
    range.setEnd(entry.node, e);
    ranges.push(range);
  }
  return ranges;
}

function container_doc(collected) {
  return collected.nodes[0]?.node?.ownerDocument ?? document;
}
