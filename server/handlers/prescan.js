// 预扫描接口（§10.5 / §14.2）：传入正文（截断到前 8000 字），返回概念词表。
// 失败不阻塞核心功能：返回空词表，前端静默跳过高亮与预告。
import { callLLM } from '../llm.js';
import { PRESCAN_SYSTEM, PRESCAN_SCHEMA } from '../prompts.js';
import { mockPrescan } from '../mock.js';
import { isMockMode } from '../config.js';

const MAX_INPUT = 8000; // §10.5：长文截断到前 8000 字

export async function handlePrescan(body) {
  const articleId = String(body?.articleId || '');
  const text = String(body?.text || '').slice(0, MAX_INPUT);
  if (!text) return { status: 400, data: { error: 'text required' } };
  if (isMockMode) return { status: 200, data: mockPrescan({ articleId }) };
  try {
    const data = await callLLM({
      system: PRESCAN_SYSTEM,
      user: text,
      schema: PRESCAN_SCHEMA,
    });
    const concepts = (Array.isArray(data.concepts) ? data.concepts : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 15);
    return { status: 200, data: { concepts } };
  } catch {
    // 降级：静默，前端跳过高亮与预告，其余照常（§10.5）
    return { status: 200, data: { concepts: [], _degraded: true } };
  }
}
