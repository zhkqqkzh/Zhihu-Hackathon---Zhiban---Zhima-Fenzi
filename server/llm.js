// 模型调用（§8.1 / §11.9 / §17）。
// OpenAI 兼容 chat completions；优先 json_schema 强结构化输出，不支持时降级 json_object；
// 重试采用指数退避；未配置密钥时抛错由上层走 mock 降级。

import { config } from './config.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function once({ system, user, schema }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs);
  try {
    const body = {
      model: config.llmModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      // 强结构化输出（§11.9）：字段缺失率必须为 0
      response_format: { type: 'json_schema', json_schema: { name: schema.name, schema: schema.schema, strict: true } },
    };
    const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llmApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 弱档降级：模型只支持 json_object 时重试（§11.9 弱档，字段可能缺，上层解析兜底）
      if (res.status === 400 && body.response_format.type === 'json_schema') {
        body.response_format = { type: 'json_object' };
        const res2 = await fetch(`${config.llmBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llmApiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res2.ok) throw new Error(`LLM ${res2.status}: ${await res2.text().catch(() => '')}`);
        return parseContent(await res2.json());
      }
      throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
    }
    return parseContent(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

function parseContent(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM empty content');
  return JSON.parse(content);
}

// 指数退避重试（§17）：最多 3 次，500ms → 1500ms
export async function callLLM(args, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await once(args);
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(500 * 3 ** i);
    }
  }
  throw lastErr;
}
