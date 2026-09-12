// 前端 API 层：本地开发走同源 dev server（四接口 + mock），线上走 SCF（跨域，CORS 已放行）。
// 失败降级绝不抛给用户；§13.3 知乎摘要白名单清洗；§13.4 查询参数编码且非空。

import { normalizeExplain } from '../core/explain.js';

// ⚠️ 换部署环境时只改这一个常量
const SCF_BASE = 'https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com';

const IS_LOCAL = typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// 线上（SCF）支持流式解释；本地 dev server 走一次性 mock/LLM
export const STREAM_EXPLAIN = !IS_LOCAL;

// 插件环境（内容脚本）：页面 CSP 拦截直连 fetch，统一经 background 转发（§14.1）。
// 适配层注入 window.__ZB_TRANSPORT__ / __ZB_TRANSPORT_STREAM__；demo 站无此定义，走直连。
const hasTransport = typeof window !== 'undefined' &&
  typeof window.__ZB_TRANSPORT__ === 'function';

async function post(path, body) {
  if (hasTransport) {
    const r = await window.__ZB_TRANSPORT__(path, body || {});
    if (r && typeof r.error === 'string') throw new Error(r.error);
    return r;
  }
  const res = await fetch((IS_LOCAL ? './' : SCF_BASE + '/') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return await res.json();
}

// SCF /ask → 前端 explain 结构（含 answer 多包一层时的解包）：纯函数见 core/explain.js
const normalizeAsk = normalizeExplain;

async function scfExplain(payload) {
  const r = await post('ask', { term: payload.concept, context: payload.context || '' });
  return normalizeAsk(r);
}

// SSE 增量解析器：feed 网络原文（可能是半个 chunk），逐行提取 choices[].delta.content。
// 每拼出一个完整 delta 就 onRaw(累计模型原文)；遇 error 对象抛错。
// 部分模型（如 glm-4.7-flashx）会先吐 reasoning_content 思考链：不计入原文，仅经 onThinking 通知。
function makeSseParser(onRaw, onThinking) {
  let buf = '';
  let rawAll = '';
  const self = function feed(text) {
    buf += text;
    const lines = buf.split('\n');
    buf = lines.pop();
    let deltaAll = '';
    for (const line of lines) {
      const t = line.trim();
      if (t.indexOf('data:') !== 0) continue;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j = null;
      try { j = JSON.parse(data); } catch { continue; } // 半个 chunk 的坏行直接跳过
      if (j && j.error) throw new Error(typeof j.error === 'string' ? j.error : JSON.stringify(j.error));
      const d = j && j.choices && j.choices[0] && j.choices[0].delta;
      if (d && d.reasoning_content && onThinking) onThinking(d.reasoning_content);
      const delta = (d && d.content) || (j && j.choices && j.choices[0] && j.choices[0].content);
      if (delta) deltaAll += delta;
    }
    if (deltaAll) {
      rawAll += deltaAll;
      if (onRaw) onRaw(rawAll);
    }
  };
  self.raw = () => rawAll;
  return self;
}

// 流式解释（线上 SCF）：POST /ask {stream:true}，SSE 逐字接收。
// onRaw(rawText) 每收到一个 content delta 回调一次（累计的模型原文 JSON 文本）。
// 返回最终解析结果（与 scfExplain 同结构）。
// 降级：插件经 background 转发（响应是普通 JSON 时按整包解析）；直连时按 Content-Type 判断。
export async function scfExplainStream(payload, onRaw, onThinking) {
  const askBody = { term: payload.concept, context: payload.context || '', stream: true };

  // 插件环境：content → background → SCF，chunk 经端口实时回推
  if (typeof window !== 'undefined' && typeof window.__ZB_TRANSPORT_STREAM__ === 'function') {
    const parser = makeSseParser(onRaw, onThinking);
    const netText = await window.__ZB_TRANSPORT_STREAM__('ask', askBody, (chunk) => parser(chunk));
    const trimmed = netText.trim();
    if (trimmed.charAt(0) === '{') {
      // 函数/平台不支持流式：整包 JSON 直接解析
      const r = JSON.parse(trimmed);
      const data = normalizeAsk(r);
      if (onRaw) onRaw(JSON.stringify(r));
      return data;
    }
    const raw = parser.raw();
    if (!raw) throw new Error('模型只返回了思考过程，没有输出解释内容');
    return normalizeAsk(JSON.parse(raw));
  }

  const res = await fetch(SCF_BASE + '/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(askBody),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const ct = res.headers.get('Content-Type') || '';
  if (ct.indexOf('text/event-stream') < 0 || !res.body) {
    // 平台不支持流式：整包 JSON 直接解析
    const r = await res.json();
    const data = normalizeAsk(r);
    if (onRaw) onRaw(JSON.stringify(r));
    return data;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let rawAll = '';
  const parser = makeSseParser((raw) => { rawAll = raw; if (onRaw) onRaw(raw); }, onThinking);
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    parser(dec.decode(step.value, { stream: true }));
  }
  if (!rawAll) throw new Error('模型只返回了思考过程，没有输出解释内容');
  return normalizeAsk(JSON.parse(rawAll));
}

async function scfQuiz(payload) {
  if (!payload.answer) {
    // 第一阶段：生成追问（本地 mock 的 explain 自带问题，线上需现生成）
    const r = await post('quiz', { concept: payload.concept, quote: payload.quote || '' });
    return { question: r.question || '', quizPoints: r.quizPoints || r.quiz_points || [] };
  }
  const r = await post('quiz', {
    concept: payload.concept,
    quote: payload.quote || '',
    question: payload.question || '',
    answer: payload.answer,
  });
  return { verdict: r.verdict || 'partial', feedback: r.feedback || '' };
}

export const api = {
  explain: (p) => (IS_LOCAL ? post('api/explain', p) : scfExplain(p)),
  prescan: (p) => post(IS_LOCAL ? 'api/prescan' : 'prescan', p),
  search: (p) => post(IS_LOCAL ? 'api/search' : 'search', p),
  quiz: (p) => (IS_LOCAL ? post('api/quiz', p) : scfQuiz(p)),
  // 收藏夹体检（聚类 + 点评）：只服务插件版个人中心——demo 站拿不到知乎登录态，
  // 本地 dev server 也没有对应 mock，所以不做 IS_LOCAL 分支，统一走 SCF。
  analyzeCollections: (p) => post('collections', p),
};

// 冷启动预热（改造方案 §五-2）：线上 SCF 首个请求实测 26.8 秒，页面加载时空打一次
// GET /ping 把函数实例热起来，用户真正划词时就不必再等冷启动。
// 只做一次；本地 dev server 常驻、插件环境由宿主页面预热，都不需要。
// 返回原因字符串便于断言与排查；失败静默——预热只是优化，不影响任何主流程。
let warmed = false;
export function warmup() {
  if (warmed) return 'already';
  if (IS_LOCAL) return 'skipped-local';
  if (hasTransport) return 'skipped-injected';
  warmed = true;
  fetch(SCF_BASE + '/ping').catch(() => {});
  return 'warming';
}

// 线上模式追问问题懒加载：本地由 explain 返回，线上调 /quiz 生成
export async function ensureQuizQuestion(record) {
  if (record.quizQuestion) return record;
  if (IS_LOCAL) return record;
  const r = await api.quiz({ concept: record.name, quote: record.quote || '' }).catch(() => null);
  if (r?.question) {
    record.quizQuestion = r.question;
    record.quizPoints = r.quizPoints || [];
    const { saveConceptRecord } = await import('./store.js');
    await saveConceptRecord(record.name, { quizQuestion: r.question, quizPoints: record.quizPoints });
  }
  return record;
}

// 白名单清洗：仅 <em>/<b>/<strong>/<i> 保留为纯强调语义，其余全部剥成文本。
// 禁止把未清洗内容写入 innerHTML（§13.3，XSS 防线）。
export function sanitizeHtml(input) {
  const doc = new DOMParser().parseFromString(String(input ?? ''), 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (!['em', 'b', 'strong', 'i'].includes(tag)) {
          // 非白名单标签：拆解为纯文本，保留其子内容继续清洗
          const text = doc.createTextNode(child.textContent);
          node.replaceChild(text, child);
          walk(node); // 重新处理该位置
          continue;
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// 纯文本版（用于不需要 HTML 的场景）
export function stripHtml(input) {
  const div = document.createElement('div');
  div.innerHTML = sanitizeHtml(input);
  return div.textContent || '';
}

// §13.4：搜索无结果 / 需要跳转时的兜底链接，查询参数必须编码且非空
export function zhihuSearchUrl(query) {
  const q = String(query || '').trim();
  return q ? `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}` : '';
}
