// 知伴 · SCF Web 函数（Express 模板，Node 12 兼容）
// 需要设置的环境变量：
//   ZHIPU_API_KEY      —— 智谱 GLM API Key（大模型调用，必须）
//   ZHIHU_ACCESS_SECRET —— 知乎开放平台 Access Secret（站内搜索；不配则搜索降级）
//
// 接口：
//   GET  /ping      健康检查 → {"ok": true}
//   POST /ask       选中即问：{ term, context } → { definition, context_why, prerequisites }
//   POST /prescan   全文概念预扫描：{ text, articleId } → { concepts: [...] }
//   POST /search    知乎站内搜索代理：{ query } → { items: [...] }
//   POST /quiz      看山提问：{ concept, quote } → { question, quizPoints }
//                   或 { concept, quote, answer } → { verdict, feedback }
//   POST /collections 收藏夹体检：{ items: [{ title, excerpt, voteup, comments, score }] }
//                   → { groups: [{ name, items: [标题] }], reviews: [{ title, level, comment }] }
//
// Node 12 兼容说明：不使用可选链（?.）与空值合并（??）；
// 无全局 fetch，用内置 https 模块，req.setTimeout(55000) 实现超时
//（平台 60s 超时前主动熔断）。云函数执行超时请调至 60 秒。

var express = require('express');
var https = require('https');

// 大模型端点：智谱 GLM（OpenAI 兼容）
var LLM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
var LLM_MODEL = 'glm-4.7-flashx';
var ZHIHU_SEARCH_URL = 'https://developer.zhihu.com/api/v1/content/zhihu_search';

var app = express();
app.use(express.json({ limit: '512kb' }));

// CORS：网关已配置，函数自身也正确处理预检（双保险）
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// ---- Prompt 模板（/ask 用）：精简指令 → 更少的输出 token、更快的首字延迟 ----
// 流式场景下模型边生成前端边显示，指令越短生成越快；质量约束保留最关键的三条。
function buildPrompt(term, context) {
  return '知乎回答片段：' + context + '\n' +
    '用户选中「' + term + '」。直接输出 JSON（不要思考过程、不要 markdown 代码块）：\n' +
    '{"definition":"一句话定义，≤40字","context_why":"它在这段话里的作用，作者为何提到，≤60字，紧扣片段","prerequisites":["最多2个"]}\n' +
    'prerequisites 只填「不懂它就完全无法理解」的概念；想不出给 1 个；禁写"数学""物理"这类过宽词。';
}

// 预扫描 Prompt（§10.5：概念名必须逐字照抄正文，否则变成幽灵标记）
var PRESCAN_PROMPT = '从用户给出的知乎回答正文中抽取 5-15 个专业概念，输出 JSON：{"concepts": ["..."]}。\n' +
  '硬性要求：\n' +
  '- 只输出正文中真实出现过的词，逐字照抄，不得改写、增删字、加后缀。\n' +
  '- 不输出虚词、人名、机构名、人人皆知的通用词。\n' +
  '- 按在正文中首次出现的顺序排列。\n' +
  '- 只输出 JSON，不要任何解释。';

// 看山提问：概念性追问，不是背诵
function quizGenPrompt(concept, quote) {
  return '概念：「' + concept + '」\n原文引用：' + quote + '\n' +
    '请围绕这个概念出一道概念性追问（不是背诵题），检验读者是否真懂。输出 JSON：\n' +
    '{"question": "不超过 50 字的追问", "quiz_points": ["判定要点1", "要点2"]}';
}

function quizJudgePrompt(concept, quote, question, answer) {
  return '你是看山，一只做人类学研究的北极狐，旁观者、同行者，不是老师。好奇、温和、略带自嘲。\n' +
    '判断读者对概念追问的回答。输出 JSON：\n' +
    '{"verdict": "correct | partial | wrong", "feedback": "不看对错说事，给出补充解释，不超过 80 字"}\n' +
    '概念：「' + concept + '」\n原文引用：' + quote + '\n追问：' + question + '\n读者的回答：' + answer + '\n' +
    '判不出一律记为 "partial"。只输出 JSON。';
}

// 收藏夹体检 Prompt：聚类 + 点评一次出（客户端已按规则打分，score 越高越值得读）
var COLLECTIONS_PROMPT_HEAD =
  '你是「知伴」，帮用户体检知乎收藏夹。下面是收藏夹里的文章（score 是规则打分，越高越值得读）。\n' +
  '请做两件事，输出 JSON：\n' +
  '1. groups：按主题把文章聚成 3-6 组，组名 4-10 个字（如「大模型与算法」「职场与成长」）。\n' +
  '   每篇文章的标题只能出现在一个组里，组名不得重复，标题必须逐字照抄输入。\n' +
  '2. reviews：只点评 score 最高的 6 篇，各给一句话结论。\n' +
  '{"groups":[{"name":"组名","items":["文章标题"]}],' +
  '"reviews":[{"title":"文章标题","level":"推荐|一般|可略过","comment":"≤40字，说清为什么"}]}\n' +
  'level 只能是 推荐 / 一般 / 可略过。只输出 JSON，不要解释。\n\n收藏列表：\n';

// ---- Node 12 无全局 fetch：内置 https 请求助手 ----
function httpsRequestJson(method, urlStr, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var url = new URL(urlStr); // Node 12 已有 WHATWG URL
    var hasBody = body !== null && body !== undefined;
    var payload = hasBody ? JSON.stringify(body) : null;
    var req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', function (e) { reject(e); });
    req.setTimeout(timeoutMs, function () {
      req.destroy(new Error('upstream timeout after ' + timeoutMs + 'ms'));
    });
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k)) req.setHeader(k, headers[k]);
    }
    if (payload !== null) {
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

function getApiKey() {
  return process.env.ZHIPU_API_KEY || process.env.DEEPSEEK_API_KEY || '';
}

// 调 GLM，JSON 模式；返回解析后的对象，失败抛错（由路由层转 502）。
// maxTokens 默认 400（三层解释 JSON 极短）；收藏夹体检输出较长，调用方传更大值。
async function callLlm(prompt, maxTokens) {
  var apiKey = getApiKey();
  if (!apiKey) {
    var e = new Error('服务器未配置 ZHIPU_API_KEY');
    e.status = 500;
    throw e;
  }
  var upstream = await httpsRequestJson('POST', LLM_URL,
    { Authorization: 'Bearer ' + apiKey },
    {
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens || 400, // 封顶避免模型啰嗦拖慢
      thinking: { type: 'disabled' }, // glm-4.7-flashx 默认吐 reasoning_content 思考链，关掉提速
      response_format: { type: 'json_object' }
    },
    55000);
  if (upstream.status < 200 || upstream.status >= 300) {
    var e2 = new Error('大模型 API 返回 ' + upstream.status + ': ' + upstream.text.slice(0, 200));
    e2.status = 502;
    throw e2;
  }
  var payload = JSON.parse(upstream.text);
  var content = payload && payload.choices && payload.choices[0] &&
    payload.choices[0].message && payload.choices[0].message.content;
  if (typeof content !== 'string' || !content) {
    var e3 = new Error('大模型 API 响应缺少内容');
    e3.status = 502;
    throw e3;
  }
  return JSON.parse(content); // 模型输出非合法 JSON 时抛错，由路由层转 500/502
}

// 调 GLM 流式模式（SSE），把上游 chunk 原样透传给 res，逐字到达前端。
// 网关若缓冲整包，前端仍能按 SSE 解析（降级为一次性渲染），不会报错。
// 返回 Promise：正常结束（收到 [DONE] / 上游 end）时 resolve；上游错误 reject。
function streamLlm(prompt, res) {
  return new Promise(function (resolve, reject) {
    var apiKey = getApiKey();
    if (!apiKey) {
      var e0 = new Error('服务器未配置 ZHIPU_API_KEY');
      e0.status = 500;
      reject(e0);
      return;
    }
    var payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400, // 三层解释JSON极短，封顶避免模型啰嗦拖慢
      thinking: { type: 'disabled' }, // glm-4.7-flashx 默认吐 reasoning_content 思考链，关掉提速
      response_format: { type: 'json_object' },
      stream: true
    });
    var req = https.request({
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function (up) {
      if (up.statusCode < 200 || up.statusCode >= 300) {
        var chunks = [];
        up.on('data', function (c) { chunks.push(c); });
        up.on('end', function () {
          var e1 = new Error('大模型 API 返回 ' + up.statusCode + ': ' + Buffer.concat(chunks).toString('utf8').slice(0, 200));
          e1.status = 502;
          reject(e1);
        });
        return;
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no'); // 尽力禁止各级代理缓冲
      var done = false;
      up.on('data', function (c) { if (!done) res.write(c); });
      up.on('end', function () { if (!done) { done = true; res.end(); } resolve(); });
      up.on('error', function (err) { if (!done) { done = true; res.end(); } reject(err); });
    });
    req.on('error', function (e) { reject(e); });
    req.setTimeout(55000, function () {
      req.destroy(new Error('upstream timeout after 55000ms'));
    });
    req.write(payload);
    req.end();
  });
}

function llmError(e) {
  var status = e && e.status ? e.status : 502;
  return { status: status, body: { error: String((e && e.message) || e).slice(0, 300) } };
}

// ---- 路由 ----

app.get('/ping', function (req, res) {
  res.json({ ok: true });
});

app.post('/ask', async function (req, res) {
  var body = req.body || {};
  var term = typeof body.term === 'string' ? body.term.trim() : '';
  // 预填加速：只送概念所在段落附近的 600 字，足够判断语境，显著减少 prefill 耗时
  var context = typeof body.context === 'string' ? body.context.trim().slice(0, 600) : '';
  if (!term || !context) {
    res.status(400).json({ error: 'term 和 context 均为必填字符串' });
    return;
  }
  // 流式：body.stream=true 时透传 GLM SSE，前端边收边渲染
  if (body.stream === true) {
    try {
      await streamLlm(buildPrompt(term, context), res);
    } catch (e) {
      if (!res.headersSent) {
        var err = llmError(e);
        res.status(err.status).json(err.body);
      } else {
        res.write('data: ' + JSON.stringify({ error: String((e && e.message) || e).slice(0, 300) }) + '\n\n');
        res.end();
      }
    }
    return;
  }
  try {
    var result = await callLlm(buildPrompt(term, context));
    res.json(result);
  } catch (e) {
    var err = llmError(e);
    res.status(err.status).json(err.body);
  }
});

app.post('/prescan', async function (req, res) {
  var body = req.body || {};
  var text = typeof body.text === 'string' ? body.text.slice(0, 8000) : '';
  if (!text) {
    res.status(400).json({ error: 'text 为必填字符串' });
    return;
  }
  try {
    var result = await callLlm(PRESCAN_PROMPT + '\n\n正文：\n' + text);
    var concepts = (result && Array.isArray(result.concepts) ? result.concepts : [])
      .map(function (s) { return String(s).trim(); })
      .filter(Boolean)
      .slice(0, 15);
    res.json({ concepts: concepts });
  } catch (e) {
    // 降级（§10.5）：预扫描失败不阻塞核心功能，返回空词表
    if (e && e.status === 400) { res.status(400).json({ error: e.message }); return; }
    res.json({ concepts: [], _degraded: true });
  }
});

app.post('/search', async function (req, res) {
  var body = req.body || {};
  var query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    res.status(400).json({ error: 'query 为必填字符串' });
    return;
  }
  var secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) {
    // 降级（§13.4）：返回可渲染的空结果，前端兜底跳知乎搜索页
    res.json({ items: [], _degraded: true });
    return;
  }
  try {
    var url = ZHIHU_SEARCH_URL + '?Query=' + encodeURIComponent(query) + '&Count=10';
    var upstream = await httpsRequestJson('GET', url, {
      Authorization: 'Bearer ' + secret,
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000))
    }, null, 8000);
    if (upstream.status < 200 || upstream.status >= 300) {
      throw new Error('zhihu_search 返回 ' + upstream.status);
    }
    var payload = JSON.parse(upstream.text);
    var rawItems = payload && payload.Data && Array.isArray(payload.Data.Items) ? payload.Data.Items : [];
    var items = rawItems.map(function (it) {
      var excerpt = String(it.ContentText || '');
      return {
        title: String(it.Title || ''),
        author: String(it.AuthorName || ''),
        url: String(it.Url || ''),
        excerpt: excerpt,
        voteupCount: Number(it.VoteUpCount || 0),
        length: excerpt.length
      };
    }).filter(function (it) { return it.title && it.url; });
    // 排序（§13.2）：赞数为主分，对超长内容（长文信号）按对数降权
    items.sort(function (a, b) {
      function score(it) {
        var penalty = it.length > 600 ? Math.log2(it.length / 600) + 1 : 1;
        return it.voteupCount / penalty;
      }
      return score(b) - score(a);
    });
    res.json({ items: items.slice(0, 3) });
  } catch (e) {
    res.json({ items: [], _degraded: true, _reason: String((e && e.message) || e).slice(0, 120) });
  }
});

app.post('/quiz', async function (req, res) {
  var body = req.body || {};
  var concept = typeof body.concept === 'string' ? body.concept.trim() : '';
  var quote = typeof body.quote === 'string' ? body.quote.slice(0, 500) : '';
  var answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (!concept) {
    res.status(400).json({ error: 'concept 为必填字符串' });
    return;
  }
  try {
    if (!answer) {
      // 第一阶段：生成追问
      var gen = await callLlm(quizGenPrompt(concept, quote));
      res.json({
        question: String(gen && gen.question || ''),
        quizPoints: Array.isArray(gen && gen.quiz_points) ? gen.quiz_points.map(String) : []
      });
      return;
    }
    // 第二阶段：判定回答
    var question = typeof body.question === 'string' ? body.question : '';
    var judge = await callLlm(quizJudgePrompt(concept, quote, question, answer));
    var verdict = judge && judge.verdict;
    if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'wrong') verdict = 'partial';
    res.json({ verdict: verdict, feedback: String(judge && judge.feedback || '') });
  } catch (e) {
    var err = llmError(e);
    res.status(err.status).json(err.body);
  }
});

// 收藏夹体检（个人中心）：规则打分在客户端做，这里只负责聚类 + 点评。
// 失败降级返回空结果（前端已有规则评分，不会被阻塞）。
app.post('/collections', async function (req, res) {
  var body = req.body || {};
  var items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  items = items.map(function (it) {
    return {
      title: String((it && it.title) || '').slice(0, 80),
      excerpt: String((it && it.excerpt) || '').replace(/\s+/g, ' ').slice(0, 120),
      score: Number((it && it.score) || 0)
    };
  }).filter(function (it) { return it.title; });
  if (!items.length) {
    res.status(400).json({ error: 'items 为必填的非空数组' });
    return;
  }
  var lines = items.map(function (it, i) {
    return (i + 1) + '. [' + it.score + '分] ' + it.title + (it.excerpt ? ' —— ' + it.excerpt : '');
  }).join('\n');
  try {
    var result = await callLlm(COLLECTIONS_PROMPT_HEAD + lines, 1200);
    var titles = {};
    items.forEach(function (it) { titles[it.title] = true; });
    // 只保留输入里真实存在的标题（模型偶尔会改写标题，那就不是我们的文章了）
    var groups = (Array.isArray(result && result.groups) ? result.groups : []).map(function (g) {
      var names = (Array.isArray(g && g.items) ? g.items : [])
        .map(function (t) { return String(t).trim(); })
        .filter(function (t) { return titles[t]; });
      return { name: String((g && g.name) || '').slice(0, 20), items: names };
    }).filter(function (g) { return g.name && g.items.length; }).slice(0, 6);

    var reviews = (Array.isArray(result && result.reviews) ? result.reviews : []).map(function (r) {
      var level = String((r && r.level) || '');
      if (level !== '推荐' && level !== '一般' && level !== '可略过') level = '一般';
      return {
        title: String((r && r.title) || '').trim(),
        level: level,
        comment: String((r && r.comment) || '').slice(0, 80)
      };
    }).filter(function (r) { return titles[r.title]; }).slice(0, 6);

    res.json({ groups: groups, reviews: reviews });
  } catch (e) {
    res.json({ groups: [], reviews: [], _degraded: true, _reason: String((e && e.message) || e).slice(0, 120) });
  }
});

// SCF Web 函数通过模板适配层托管；本地直接运行 node index.js 便于联调
if (require.main === module) {
  var port = Number(process.env.PORT || 9000);
  app.listen(port, function () { console.log('zhiban-scf listening on :' + port); });
}

module.exports = app;
