// 解释接口（§14.2）：传入上下文与选中词，返回三层解释。
// 入参：{ concept, context, articleId? }
import { callLLM } from '../llm.js';
import { EXPLAIN_SYSTEM, EXPLAIN_SCHEMA } from '../prompts.js';
import { mockExplain } from '../mock.js';
import { isMockMode } from '../config.js';

export async function handleExplain(body) {
  const concept = String(body?.concept || '').trim();
  const context = String(body?.context || '').slice(0, 2000);
  if (!concept) return { status: 400, data: { error: 'concept required' } };
  if (isMockMode) return { status: 200, data: mockExplain({ concept }) };
  try {
    const data = await callLLM({
      system: EXPLAIN_SYSTEM,
      user: `回答正文节选：\n${context}\n\n用户划选的概念：「${concept}」`,
      schema: EXPLAIN_SCHEMA,
    });
    // 防御性归一：弱档 json_object 可能缺字段（§11.9），绝不抛异常（§13.4）
    return {
      status: 200,
      data: {
        is_concept: data.is_concept !== false,
        definition: String(data.definition || ''),
        in_context: String(data.in_context || ''),
        prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites.slice(0, 2).map(String) : [],
        quiz_question: String(data.quiz_question || ''),
        quiz_points: Array.isArray(data.quiz_points) ? data.quiz_points.map(String) : [],
      },
    };
  } catch (e) {
    // 降级：模型不可用时返回可渲染对象，浮层不空窗（§13.4）
    return { status: 200, data: { ...mockExplain({ concept }), _degraded: true, _reason: String(e.message || e).slice(0, 120) } };
  }
}
