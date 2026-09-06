// 概念匹配（方案 10.2）。
// 只用模型返回的概念词表做全匹配；按词长降序匹配 + 占位消解，长词优先占位，
// 解决「梯度」误命中「梯度下降」的子串问题。纯函数，可在 Node 中测试。

export function normalizeConceptName(name) {
  return String(name || '').trim();
}

export function matchConcepts(text, concepts) {
  const result = [];
  if (!text || !Array.isArray(concepts) || concepts.length === 0) return result;
  const occupied = new Array(text.length).fill(false);
  const sorted = concepts
    .map(normalizeConceptName)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const concept of sorted) {
    let from = 0;
    while (from <= text.length - concept.length) {
      const idx = text.indexOf(concept, from);
      if (idx === -1) break;
      let free = true;
      for (let i = idx; i < idx + concept.length; i++) {
        if (occupied[i]) { free = false; break; }
      }
      if (free) {
        for (let i = idx; i < idx + concept.length; i++) occupied[i] = true;
        result.push({ concept, start: idx, end: idx + concept.length });
      }
      from = idx + concept.length;
    }
  }
  result.sort((a, b) => a.start - b.start);
  return result;
}

// 预扫描验证（方案 10.5）：词表中有但正文匹配不到的比例应低于 5%。
export function matchRate(text, concepts) {
  const names = [...new Set((concepts || []).map(normalizeConceptName).filter(Boolean))];
  if (names.length === 0) return { total: 0, matched: 0, rate: 1, missing: [] };
  const found = new Set(matchConcepts(text, names).map((m) => m.concept));
  const missing = names.filter((n) => !found.has(n));
  return {
    total: names.length,
    matched: names.length - missing.length,
    rate: (names.length - missing.length) / names.length,
    missing,
  };
}
