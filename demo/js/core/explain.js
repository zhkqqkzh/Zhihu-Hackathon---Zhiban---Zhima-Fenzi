// explain 结果归一（问题清单 P0-1）。
// SCF /ask 由模型生成 JSON，偶尔会把内容多包一层（如 {"answer":{"definition":...}}）：
// 前端只读顶层字段就全部拿到空值，浮层表现为「点了没反应」。
// 解包与字段映射是纯逻辑，放 core 便于 Node 单测。

// 解包：内容被塞进 answer 一层时露出内层对象，否则原样返回（非对象给空对象）。
export function unwrapExplain(r) {
  if (!r || typeof r !== 'object') return {};
  const inner = r.answer;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
  return r;
}

// SCF /ask → 前端 explain 结构：context_why 映射为 in_context。
export function normalizeExplain(r) {
  const src = unwrapExplain(r);
  return {
    is_concept: src.is_concept !== false,
    // 只认字符串：模型偶尔把 definition 写成对象/数组，直接取用会在浮层里渲染出 [object Object]
    definition: typeof src.definition === 'string' ? src.definition.trim() : '',
    in_context: src.context_why || src.in_context || '',
    prerequisites: Array.isArray(src.prerequisites) ? src.prerequisites.slice(0, 2) : [],
    quiz_question: src.quiz_question || '',
    quiz_points: Array.isArray(src.quiz_points) ? src.quiz_points : [],
  };
}
