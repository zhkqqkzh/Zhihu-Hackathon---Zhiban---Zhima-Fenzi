// 难度预告（方案 10.10）：预扫描概念表与本地全部已展开概念取交集与差集。
// 交集 = 熟悉概念数，差集 = 陌生概念数，按陌生占比分三档。零模型调用。纯函数。

export function previewDifficulty(prescanConcepts, knownConceptNames) {
  const all = [...new Set(prescanConcepts || [])];
  const known = new Set(knownConceptNames || []);
  const fresh = all.filter((c) => !known.has(c));
  const familiar = all.filter((c) => known.has(c));
  const ratio = all.length === 0 ? 0 : fresh.length / all.length;
  let tone;
  if (all.length === 0) tone = 'none';
  else if (ratio >= 0.6) tone = 'hard';
  else if (ratio >= 0.3) tone = 'medium';
  else tone = 'easy';
  return { total: all.length, freshCount: fresh.length, familiarCount: familiar.length, fresh, familiar, ratio, tone };
}

export function difficultyMessage(preview) {
  if (!preview || preview.total === 0) return null;
  const head = `这篇涉及 ${preview.total} 个核心概念`;
  if (preview.tone === 'hard') {
    return `${head}，其中 ${preview.freshCount} 个你从没接触过——可能会有点难。不过没关系，卡住的时候划一下就好。`;
  }
  if (preview.tone === 'medium') {
    return `${head}，其中 ${preview.freshCount} 个对你来说是新面孔。慢慢来，一座营地一座营地走。`;
  }
  return `${head}，大部分你都接触过了，这篇应该会读得比较顺。`;
}
