// 提问接口（§14.2 / §10.8）：传入概念、原文引用与用户回答，返回判定与补充解释。
// 判定降级：模型不可用时关键词匹配；判不出一律「有点模糊」，不阻塞流程。
import { callLLM } from '../llm.js';
import { QUIZ_JUDGE_SYSTEM, QUIZ_JUDGE_SCHEMA } from '../prompts.js';
import { mockQuizJudge } from '../mock.js';
import { isMockMode } from '../config.js';

// 关键词匹配兜底（§10.8）：检查回答中是否出现定义/quiz_points 里的核心术语
function keywordJudge(answer, points) {
  const a = String(answer || '');
  const hits = (points || []).filter((p) => p && a.includes(p)).length;
  if (hits >= Math.ceil((points || []).length / 2) && hits > 0) return 'correct';
  if (hits > 0) return 'partial';
  return 'partial'; // 判不出一律「有点模糊」
}

export async function handleQuiz(body) {
  const concept = String(body?.concept || '').trim();
  const question = String(body?.question || '');
  const answer = String(body?.answer || '');
  const quote = String(body?.quote || '').slice(0, 500);
  const points = Array.isArray(body?.quizPoints) ? body.quizPoints.map(String) : [];
  if (!concept) return { status: 400, data: { error: 'concept required' } };
  if (isMockMode) return { status: 200, data: mockQuizJudge({ answer }) };
  try {
    const data = await callLLM({
      system: QUIZ_JUDGE_SYSTEM,
      user: `概念：「${concept}」\n原文引用：${quote}\n看山的追问：${question}\n判定要点：${points.join('；')}\n读者的回答：${answer}`,
      schema: QUIZ_JUDGE_SCHEMA,
    });
    const verdict = ['correct', 'partial', 'wrong'].includes(data.verdict) ? data.verdict : 'partial';
    return { status: 200, data: { verdict, feedback: String(data.feedback || '') } };
  } catch {
    return {
      status: 200,
      data: {
        verdict: keywordJudge(answer, points),
        feedback: '模型暂时不在，看山用关键词粗判了一下。回头它会认真再看一遍。',
        _degraded: true,
      },
    };
  }
}
