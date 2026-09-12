// background（§8.4 / §14.1 / §17）：消息中转 + 发起真实请求。
// 页面内 fetch 会被知乎 CSP 拦截，且密钥不能进前端——统一由这里请求后端。
// 缓存一律写 chrome.storage.local，不放内存变量（MV3 service worker 约 30 秒空闲即终止）。

// 线上后端（知伴 SCF）；本地联调时把 api.js 的 IS_LOCAL 判定覆盖即可走 dev server
const API_BASE = 'https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com/';

// 知乎 web API 白名单：个人中心读「我的资料 / 我的收藏夹 / 收藏夹内容」。
// credentials:'include' 复用浏览器已登录的 Cookie——扩展对 host_permissions 内的域名
// 不受第三方 Cookie 限制，所以这里能拿到登录态（个人中心没有知乎页面同源上下文）。
// 白名单是安全边界：只放行这几个读接口，别把 background 变成任意转发代理。
const ZHIHU_API_ALLOW = [
  /^\/api\/v4\/me(\?|$)/,
  /^\/api\/v4\/(?:members|people)\/[^/?#]+\/collections(\?|$)/,
  /^\/api\/v4\/collections\/[^/?#]+\/items(\?|$)/,
];

function zhihuFetch(path) {
  if (!ZHIHU_API_ALLOW.some((re) => re.test(path))) {
    return Promise.resolve({ error: `知乎接口不在白名单：${path}` });
  }
  return fetch('https://www.zhihu.com' + path, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', 'x-requested-with': 'fetch' },
  })
    .then(async (r) => {
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* 未登录时返回的是 HTML 登录页 */ }
      return { status: r.status, data };
    })
    .catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 打开扩展内独立页（个人中心）：content script 拿不到 chrome.tabs，统一由这里开标签页
  if (msg?.type === 'zb-open-tab' && typeof msg.url === 'string') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return false;
  }
  // 复用登录态读知乎 web API（个人中心）：白名单路径，见上方 ZHIHU_API_ALLOW
  if (msg?.type === 'zb-zhihu-fetch' && typeof msg.path === 'string') {
    zhihuFetch(msg.path).then(sendResponse);
    return true; // 异步响应
  }
  if (msg?.type !== 'zb-api' || typeof msg.path !== 'string') return false;
  const url = /^https?:\/\//.test(msg.path) ? msg.path : API_BASE + msg.path;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload || {}),
  })
    .then((r) => (r.ok ? r.json() : { error: `api ${r.status}` }))
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e?.message || e).slice(0, 200) }));
  return true; // 异步响应
});

// 流式转发（SSE）：content script 建端口，background 用 reader 逐 chunk 推送网络原文。
// 函数/平台不支持流式时响应是普通 JSON——照样以单个 chunk 转发，由前端识别降级。
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'zb-api-stream') return;
  let reader = null;
  let closed = false; // 端口已断开（页面跳转/浮层关闭），之后一律不再 postMessage
  const post = (msg) => {
    if (closed) return;
    try { port.postMessage(msg); } catch { closed = true; }
  };
  port.onMessage.addListener((msg) => {
    if (msg?.type !== 'zb-api-stream-start' || typeof msg.path !== 'string') return;
    const url = /^https?:\/\//.test(msg.path) ? msg.path : API_BASE + msg.path;
    (async () => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.payload || {}),
        });
        if (!r.ok || !r.body) {
          // 带上上游错误详情（如 api 502 背后大模型的真实报错），便于前端/Console 定位
          const detail = await r.text().catch(() => '');
          post({ type: 'error', error: `api ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` });
          return;
        }
        reader = r.body.getReader();
        const dec = new TextDecoder();
        let streamDone = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { streamDone = true; break; }
          if (closed) break;
          post({ type: 'chunk', text: dec.decode(value, { stream: true }) });
        }
        if (streamDone) post({ type: 'end' });
      } catch (e) {
        // 端口断开时 reader.cancel() 会触发 read() 抛错，此时 closed=true，post 静默忽略
        post({ type: 'error', error: String(e?.message || e).slice(0, 200) });
      }
    })();
  });
  // 页面关掉浮层/跳转时端口断开，取消上游读取
  port.onDisconnect.addListener(() => { closed = true; try { reader?.cancel(); } catch { /* 已断开 */ } });
});
