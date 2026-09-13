// P1 真实内容接入（方案 §7.2）：把知乎官方搜索接口（zhihu_search，经 /api/search）的命中结果
// 归一化成「真实知乎」文章，追加在内置 3 篇之后，复用现有的文章页/划词/卡点链路。
// 硬性降级（§7.2 红线）：未配密钥 / 接口失效 / 返回演示数据 / 空结果，一律返回空列表——
// 绝不把演示数据冒充成「真实知乎」，首页照常只显示内置 3 篇，永不白屏。

import { api } from './api.js';
import { escapeHtml } from './ui.js';

export const SOURCE_REAL = 'zhihu-real';

// 稳定 id：同一 URL 永远得到同一个 id——重复接入不产生重复文章，刷新后还能路由回来。
export function sourceId(hit) {
  const url = String(hit?.url || '').trim();
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `zhihu-${(h >>> 0).toString(36)}`;
}

// 命中 → 文章结构（字段与 data/articles.js 对齐，便于直接复用文章页与预扫描链路）。
// 官方接口只返回摘要片段而非全文：body 如实包裹该片段并给出原文链接，不假装是全文。
export function hitToArticle(hit) {
  const url = String(hit?.url || '').trim();
  const title = String(hit?.title || '').trim();
  if (!url || !title) return null;
  const excerpt = String(hit?.excerpt || '').trim();
  const link = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">查看知乎原文 →</a>`;
  const body = excerpt
    ? `<p>${escapeHtml(excerpt)}</p><p class="src-note">以上为知乎官方搜索接口返回的摘要片段（非全文）。${link}</p>`
    : `<p class="src-note">该结果只返回了标题，没有可读摘要。${link}</p>`;
  return {
    id: sourceId(hit),
    title,
    author: String(hit?.author || '').trim() || '知乎用户',
    bio: '来自知乎的真实回答（官方搜索接口）',
    voteupCount: Number(hit?.voteupCount || 0),
    commentCount: Number(hit?.commentCount || 0),
    intro: excerpt,
    source: SOURCE_REAL,
    sourceUrl: url,
    body,
  };
}

let registry = [];    // 已接入过的真实文章（累加去重）：已打开的详情页路由不会因再次搜索而失效
let lastResults = []; // 最近一次搜索的展示结果

// 拉取并归一化真实内容。任何一步不成立都返回空数组，调用方据此走「未接入」的诚实空状态。
export async function loadRealArticles(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const res = await api.search({ query: q }).catch(() => null);
  // 硬降级红线：演示数据（_mock）/ 服务端降级（_degraded）/ 空结果一律视为「没有真实内容」。
  if (!res || res._mock || res._degraded) {
    lastResults = [];
    return [];
  }
  const items = Array.isArray(res.items) ? res.items : [];
  lastResults = items.map(hitToArticle).filter(Boolean);
  for (const a of lastResults) {
    if (!registry.some((x) => x.id === a.id)) registry.push(a);
  }
  return lastResults;
}

export function listRealArticles() {
  return lastResults.slice();
}

export function getRealArticle(id) {
  return registry.find((a) => a.id === id) || null;
}
