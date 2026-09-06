// 搜索接口（§13 / §14.2 / 官方 zhihu_search 文档）：
// 代理知乎站内搜索，返回排序后的站内回答；赞数为主分，对超长内容按篇幅降权（§13.2）。
// 未配置 Access Secret 时返回 mock；解析失败返回可渲染降级对象，绝不抛异常（§13.4）。
import { config } from '../config.js';
import { mockSearch } from '../mock.js';

// 赞数主分 + 超长降权：摘要超 600 字（长文信号）按对数惩罚
function score(item) {
  const votes = Number(item.voteupCount || 0);
  const len = Number(item.length || 0);
  const penalty = len > 600 ? Math.log2(len / 600) + 1 : 1;
  return votes / penalty;
}

// ContentText 可能含 HTML 高亮标签（§13.3），此处只透传，前端白名单清洗后再渲染。
function mapItem(it) {
  return {
    title: String(it.Title || ''),
    author: String(it.AuthorName || ''),
    url: String(it.Url || ''),
    excerpt: String(it.ContentText || ''),
    voteupCount: Number(it.VoteUpCount || 0),
    commentCount: Number(it.CommentCount || 0),
    contentType: String(it.ContentType || ''),
    length: String(it.ContentText || '').length,
  };
}

export async function handleSearch(body) {
  const query = String(body?.query || '').trim();
  if (!query) return { status: 400, data: { error: 'query required' } };
  if (!config.zhihuAccessSecret) return { status: 200, data: mockSearch({ query }) };
  try {
    const url = `${config.zhihuSearchUrl}?${new URLSearchParams({ Query: query, Count: '10' })}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.zhihuAccessSecret}`,
        'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`zhihu ${res.status}`);
    const json = await res.json();
    if (json?.Code !== 0 || !json?.Data) throw new Error(`zhihu code ${json?.Code}`);
    const items = (Array.isArray(json.Data.Items) ? json.Data.Items : [])
      .map(mapItem)
      .filter((it) => it.title && it.url)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
    return { status: 200, data: { items } };
  } catch (e) {
    // 降级：返回可渲染对象 + 前端兜底"跳知乎搜索页"（§13.4）
    return { status: 200, data: { ...mockSearch({ query }), _degraded: true, _reason: String(e.message || e).slice(0, 120) } };
  }
}
