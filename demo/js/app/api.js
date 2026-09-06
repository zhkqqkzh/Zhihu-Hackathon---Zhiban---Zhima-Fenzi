// 前端 API 层：本地开发走同源 dev server（四接口 + mock），线上走 SCF（跨域，CORS 已放行）。
// 失败降级绝不抛给用户；§13.3 知乎摘要白名单清洗；§13.4 查询参数编码且非空。

// ⚠️ 换部署环境时只改这一个常量
const SCF_BASE = 'https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com';

const IS_LOCAL = typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

async function post(path, body) {
  const res = await fetch((IS_LOCAL ? './' : SCF_BASE + '/') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return await res.json();
}

// SCF /ask → 前端 explain 结构：context_why 映射为 in_context
async function scfExplain(payload) {
  const r = await post('ask', { term: payload.concept, context: payload.context || '' });
  return {
    is_concept: true,
    definition: r.definition || '',
    in_context: r.context_why || r.in_context || '',
    prerequisites: Array.isArray(r.prerequisites) ? r.prerequisites.slice(0, 2) : [],
    quiz_question: r.quiz_question || '',
    quiz_points: Array.isArray(r.quiz_points) ? r.quiz_points : [],
  };
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
};

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
