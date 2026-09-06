// 依赖边、缺口检测、主题聚类与策展排序（方案 10.6 / 10.11 / 11.5 / 11.8）。
// 全部纯函数，可在 Node 中测试。
//
// 概念记录（concepts）形状：{ name, prerequisites: string[], articleId, firstAskedAt }
// 预扫描词表集合 whitelist：Set<概念名>，来自所有文章的预扫描结果（11.5 白名单过滤）。

export function buildEdges(concepts, whitelist) {
  const byKey = new Map();
  for (const c of concepts || []) {
    for (const pre of c.prerequisites || []) {
      if (!pre || pre === c.name) continue;
      const key = `${pre}→${c.name}`;
      if (!byKey.has(key)) {
        byKey.set(key, { from: pre, to: c.name, articleIds: new Set(), pending: false });
      }
      const edge = byKey.get(key);
      // 一条边被哪些文章验证过：显式 articleId、按篇记录的 askedIn、首次来源
      const ids = [c.articleId, ...(Array.isArray(c.askedIn) ? c.askedIn : []), c.firstSource?.articleId].filter(Boolean);
      for (const id of ids) edge.articleIds.add(id);
      // 概念表白名单过滤：前置概念须出现在某篇文章的预扫描概念表中（11.5）。
      // 冷启动：暂未出现时保留但不展示（pending），后续文章覆盖到后自动激活。
      if (whitelist && !whitelist.has(pre)) edge.pending = true;
      else edge.pending = false;
    }
  }
  const edges = [...byKey.values()];
  for (const e of edges) {
    // 边加权（11.8）：被 ≥2 篇不同文章验证过的才画实线；仅一次的不展示。
    e.verified = e.articleIds.size >= 2;
    e.visible = !e.pending && e.verified;
  }
  return edges;
}

// 拓扑排序：前置在前；无法确定时按首次提问时间做次级排序（10.11）。
export function topoOrder(concepts, edges) {
  const names = [...new Set((concepts || []).map((c) => c.name))];
  const firstAt = new Map();
  for (const c of concepts || []) {
    const t = c.firstAskedAt ?? Infinity;
    if (!firstAt.has(c.name) || t < firstAt.get(c.name)) firstAt.set(c.name, t);
  }
  const indeg = new Map(names.map((n) => [n, 0]));
  const adj = new Map(names.map((n) => [n, []]));
  for (const e of edges || []) {
    if (e.pending) continue;
    if (!indeg.has(e.from)) { indeg.set(e.from, 0); adj.set(e.from, []); }
    if (!indeg.has(e.to)) continue;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const byTime = (a, b) => (firstAt.get(a) ?? Infinity) - (firstAt.get(b) ?? Infinity);
  // 队列必须从未展开的纯前置节点（如「导数」）也能起步，否则链在源头断裂
  const queue = [...indeg.keys()].filter((n) => indeg.get(n) === 0).sort(byTime);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of adj.get(n) || []) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) {
        queue.push(m);
        queue.sort(byTime);
      }
    }
  }
  // 有环或孤立时兜底：剩余按时间排
  const rest = [...indeg.keys()].filter((n) => !order.includes(n)).sort(byTime);
  return [...order, ...rest];
}

// 缺口检测（10.6 + 11.8）：所有前置概念求并集，减去已展开集合，只取 Top 1。
export function detectGap(concepts, edges) {
  const expanded = new Set((concepts || []).map((c) => c.name));
  const count = new Map();
  for (const e of edges || []) {
    if (e.pending) continue;
    if (expanded.has(e.to) && !expanded.has(e.from)) {
      count.set(e.from, (count.get(e.from) || 0) + 1);
    }
  }
  if (count.size === 0) return null;
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// 主题聚类（10.11）：Jaccard 相似度超阈值归同主题，同主题 ≥3 篇可生成专题。
// 用并查集做传递闭包：只要两篇文章概念集的 Jaccard ≥ 阈值就归并——
// "前置型"文章与后继文章交集天然小，但通过与中间文章两两相连仍归入同主题。
export function clusterArticles(articles, threshold = 0.2) {
  // articles: [{ id, concepts: string[], firstReadAt }]
  const sets = (articles || []).map((a) => new Set(a.concepts || []));
  const parent = (articles || []).map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };

  const jaccard = (a, b) => {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const c of a) if (b.has(c)) inter++;
    return inter / (a.size + b.size - inter);
  };
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if (jaccard(sets[i], sets[j]) >= threshold) union(i, j);
    }
  }
  const groups = new Map();
  (articles || []).forEach((a, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { articles: [], conceptSet: new Set() });
    const g = groups.get(r);
    g.articles.push(a);
    for (const c of sets[i]) g.conceptSet.add(c);
  });
  return [...groups.values()];
}

// 策展排序（10.11）：包含前置概念越多的排越靠前；拓扑序无法确定时用首次阅读时间。
export function sortClusterForCuration(cluster, edges) {
  const arts = cluster.articles.slice();
  const prereqCount = new Map();
  for (const art of arts) {
    const set = new Set(art.concepts || []);
    let n = 0;
    for (const e of edges || []) {
      if (e.pending) continue;
      if (set.has(e.from) && !set.has(e.to)) n++;
    }
    prereqCount.set(art.id, n);
  }
  arts.sort((a, b) => {
    const d = prereqCount.get(b.id) - prereqCount.get(a.id);
    if (d !== 0) return d;
    return (a.firstReadAt ?? Infinity) - (b.firstReadAt ?? Infinity);
  });
  return arts;
}
