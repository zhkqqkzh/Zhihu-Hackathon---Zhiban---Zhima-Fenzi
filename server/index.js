// 本地开发服务器：静态托管 demo/ + 四个 API（§14.2）。
// 处理器与 HTTP 层解耦，迁移到腾讯云 SCF / 阿里云 FC 时只需包一层入口。
// 部署约束（§8.3）：前后端均 HTTPS + 正确 CORS 头；云函数超时调至 30–60 秒。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isMockMode } from './config.js';
import { checkRateLimit } from './ratelimit.js';
import { handleExplain } from './handlers/explain.js';
import { handlePrescan } from './handlers/prescan.js';
import { handleSearch } from './handlers/search.js';
import { handleQuiz } from './handlers/quiz.js';

const DEMO_DIR = fileURLToPath(new URL('../demo', import.meta.url));
const ROUTES = {
  '/api/explain': handleExplain,
  '/api/prescan': handlePrescan,
  '/api/search': handleSearch,
  '/api/quiz': handleQuiz,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error('body too large');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (ROUTES[url.pathname]) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const rl = checkRateLimit(ip, config.rateLimitPerMinute);
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) return sendJson(res, 429, { error: 'rate limited' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    try {
      const body = await readBody(req);
      if (body === null) return sendJson(res, 400, { error: 'invalid json' });
      const { status, data } = await ROUTES[url.pathname](body);
      return sendJson(res, status, data);
    } catch (e) {
      return sendJson(res, 500, { error: String(e.message || e).slice(0, 200) });
    }
  }

  // 静态文件：防目录穿越；hash 路由由前端处理，这里只认真文件路径（§8.3 约束 1）
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  const filePath = normalize(join(DEMO_DIR, path));
  if (!filePath.startsWith(normalize(DEMO_DIR))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(config.port, () => {
  console.log(`知伴 dev server: http://localhost:${config.port}`);
  console.log(isMockMode ? '模式：mock（未配置 LLM_API_KEY，返回演示数据）' : `模式：真实模型 ${config.llmModel}`);
});
