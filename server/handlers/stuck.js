// 卡点聚合（本地镜像 scf/index.js 的 POST /stuck）：内存聚合，让本地也能端到端验证飞轮。
// 只存「概念名 + 段号 + 计数」，不存正文、不存任何用户标识。
const AGG = {}; // { [articleId]: { [concept]: { count, paragraphIndex } } }
const MAX_ARTICLES = 200;
const MAX_CONCEPTS = 50;

export async function handleStuck(body) {
  const articleId = String(body?.articleId || '').trim().slice(0, 64);
  if (!articleId) return { status: 400, data: { error: 'articleId required' } };
  let bucket = AGG[articleId];
  if (!bucket) {
    if (Object.keys(AGG).length >= MAX_ARTICLES) {
      return { status: 200, data: body?.action === 'top' ? { items: [] } : { ok: false, _capped: true, count: 0 } };
    }
    bucket = AGG[articleId] = {};
  }

  if (body?.action !== 'top') {
    const concept = String(body?.concept || '').trim().slice(0, 40);
    if (!concept) return { status: 400, data: { error: 'concept required' } };
    let item = bucket[concept];
    if (!item) {
      if (Object.keys(bucket).length >= MAX_CONCEPTS) {
        return { status: 200, data: { ok: false, _capped: true, concept, count: 0 } };
      }
      item = bucket[concept] = { count: 0, paragraphIndex: null };
    }
    item.count += 1;
    if (typeof body.paragraphIndex === 'number' && body.paragraphIndex >= 0) item.paragraphIndex = body.paragraphIndex;
    return { status: 200, data: { ok: true, concept, count: item.count } };
  }

  const topN = Math.min(Math.max(Number(body?.topN) || 3, 1), 10);
  const items = Object.keys(bucket)
    .map((c) => ({ concept: c, count: bucket[c].count, paragraphIndex: bucket[c].paragraphIndex }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
  return { status: 200, data: { items } };
}
