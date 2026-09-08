// background（§8.4 / §14.1 / §17）：消息中转 + 发起真实请求。
// 页面内 fetch 会被知乎 CSP 拦截，且密钥不能进前端——统一由这里请求后端。
// 缓存一律写 chrome.storage.local，不放内存变量（MV3 service worker 约 30 秒空闲即终止）。

// 线上后端（知伴 SCF）；本地联调时把 api.js 的 IS_LOCAL 判定覆盖即可走 dev server
const API_BASE = 'https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com/';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
          port.postMessage({ type: 'error', error: `api ${r.status}` });
          return;
        }
        reader = r.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          port.postMessage({ type: 'chunk', text: dec.decode(value, { stream: true }) });
        }
        port.postMessage({ type: 'end' });
      } catch (e) {
        port.postMessage({ type: 'error', error: String(e?.message || e).slice(0, 200) });
      }
    })();
  });
  // 页面关掉浮层/跳转时端口断开，取消上游读取
  port.onDisconnect.addListener(() => { try { reader?.cancel(); } catch { /* 已断开 */ } });
});
