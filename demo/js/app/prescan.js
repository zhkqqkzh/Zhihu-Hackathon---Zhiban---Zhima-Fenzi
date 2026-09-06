// 预扫描（§10.5）：懒触发（首次提问/首次打开侧栏时并行发起），输入正文截断 8000 字，
// 输出概念词表 5–15 个，按文章 ID 缓存。
// 校验：返回后用匹配逻辑跑一遍，词表有但正文匹配不到的比例应低于 5%。
// 降级：失败静默跳过，高亮与预告不显示，其余照常。

import { api } from './api.js';
import * as store from './store.js';
import { runtime } from './runtime.js';
import { collectTextNodes } from '../core/textnodes.js';
import { matchRate } from '../core/match.js';
import { registerConceptHighlights, clearConceptHighlights } from '../core/highlight.js';
import { toast } from './ui.js';
import { difficultyMessage } from '../core/difficulty.js';

const inFlight = new Map(); // articleId -> Promise

export function initPrescan() {
  runtime.on('prescan:maybe', () => { const p = runtime.page; if (p) ensurePrescan(p.articleId); });
  // 首次打开侧栏也触发（§10.5）
  runtime.on('sidebar:open', () => { const p = runtime.page; if (p) ensurePrescan(p.articleId); });
  // 关闭浮层后整篇难词全部浮现（§四-3 / Demo 剧本第 4 步）
  runtime.on('popup:closed', () => refreshHighlights());
  // DOM 变化后重算高亮（§10.3 Range 生命周期）
  runtime.on('page:change', (ctx) => {
    clearConceptHighlights();
    if (!ctx) return;
    const obs = new MutationObserver(() => refreshHighlights());
    obs.observe(ctx.body, { childList: true, subtree: true });
  });
}

export async function ensurePrescan(articleId) {
  if (!articleId) return null;
  const cached = await store.getPrescan(articleId);
  if (cached?.concepts?.length) return cached.concepts;
  if (inFlight.has(articleId)) return inFlight.get(articleId);
  const p = (async () => {
    const page = runtime.page;
    let text = '';
    try {
      text = collectTextNodes(page.container, page.selectors.exclude).text.slice(0, 8000);
    } catch { return null; }
    const res = await api.prescan({ articleId, text }).catch(() => null);
    const concepts = res?.concepts || [];
    if (concepts.length > 0) {
      await store.savePrescan(articleId, concepts);
      // §10.5 验证方法：幽灵标记比例须 < 5%
      const rate = matchRate(text, concepts);
      console.info(`[zhiban] prescan ${articleId}: ${rate.matched}/${rate.total} matched`, rate.missing);
      if (rate.rate < 0.95) console.warn(`[zhiban] 幽灵标记比例 ${((1 - rate.rate) * 100).toFixed(1)}% ≥ 5%`, rate.missing);
      runtime.emit('prescan:done', { articleId, concepts });
      await showDifficultyPreview(articleId, concepts);
    }
    return concepts.length ? concepts : null;
  })();
  inFlight.set(articleId, p);
  try { return await p; } finally { inFlight.delete(articleId); }
}

// 难度预告（§10.10 / 功能 9）：零模型调用，预扫描词表 × 本地短尾巴取交集/差集
async function showDifficultyPreview(articleId, concepts) {
  const known = await store.allKnownConceptNames();
  const pv = previewDifficulty(concepts, known);
  const msg = difficultyMessage(pv);
  if (msg) toast('看山探头看了一眼：' + msg, 4200);
}

export async function refreshHighlights() {
  const page = runtime.page;
  if (!page) return;
  const cached = await store.getPrescan(page.articleId);
  if (!cached?.concepts?.length) return;
  const arts = await store.listArticleRecords();
  const expandedAll = [...new Set(arts.flatMap((a) => a.expandedConcepts || []))];
  registerConceptHighlights(page.body, page.selectors.exclude, cached.concepts, expandedAll);
}
