// 看山提问（功能 7 / §10.8）：读完一篇后，看山反过来问你 2-3 个问题。
// 概念性追问，不是背诵；反馈不看对错，看山给出补充解释。
// 判定 → 正确「已走过」/ 部分「有点模糊」/ 错误保持「还没走过」→ 写回概念记录。
// 触发：滚动到底（阅读进度 §9.1）+ 本篇有已展开概念。

import { el, toast, assetUrl } from './ui.js';
import * as store from './store.js';
import { api, ensureQuizQuestion } from './api.js';
import { runtime } from './runtime.js';

const answered = new Set(); // 本次会话已答

export function initQuiz() {
  // 滚动到底触发（阅读进度），每篇文章只提醒一次
  window.addEventListener('scroll', () => {
    const page = runtime.page;
    if (!page) return;
    const nearEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    if (!nearEnd) return;
    maybeTrigger(page.articleId);
  }, { passive: true });
}

async function maybeTrigger(articleId) {
  const art = await store.getArticleRecord(articleId);
  if (art?.quizPrompted || !art?.expandedConcepts?.length) return;
  await store.saveArticleRecord(articleId, { readToEnd: true, quizPrompted: true });
  toast('看山探出脑袋：读完了？来，它有几个问题想问你。打开侧栏「看山提问」。', 5000);
  runtime.emit('quiz:ready', { articleId });
}

export async function renderQuizTab(body) {
  const page = runtime.page;
  const concepts = await store.listConcepts();
  const art = page ? await store.getArticleRecord(page.articleId) : null;
  const currentExpanded = new Set(art?.expandedConcepts || []);
  // 本篇相关 + 未答过的追问（每篇最多 3 个；线上模式问题由 /quiz 懒生成）
  const pool = concepts.filter((c) =>
    !answered.has(c.name) &&
    (!page || currentExpanded.has(c.name) || c.firstSource?.articleId === page.articleId)
  ).slice(0, 3);

  if (pool.length === 0) {
    body.appendChild(el('div', { style: 'text-align:center;margin-bottom:12px' }, [
      el('img', { src: assetUrl('kanshan/sleep.gif'), style: 'width:80px;height:80px;border-radius:50%' }),
    ]));
    body.appendChild(el('div', { style: 'font-size:13px;color:#8590a6;line-height:1.8', text:
      page
        ? '看山翻了翻笔记本，这篇还没有能问你的问题。\n先划选几个概念展开，读完滚到底，看山就会来找你提问。'
        : '打开一篇回答，展开几个概念并读到结尾，看山会反过来问你 2-3 个问题。答对了营地标记「已走过」。' }));
    return;
  }

  body.appendChild(el('div', { style: 'text-align:center;margin-bottom:10px' }, [
    el('img', { src: assetUrl('kanshan/idle.gif'), style: 'width:80px;height:80px;border-radius:50%' }),
  ]));
  body.appendChild(el('div', { style: 'font-size:12px;color:#8590a6;margin-bottom:10px', text: '不是背诵题。随便说，看山给你补充解释。' }));
  for (const rec of pool) {
    body.appendChild(renderQuizCard(rec));
  }
}

function renderQuizCard(rec) {
  const card = el('div', { class: 'zb-quiz' }, [
    el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:6px' }, [
      el('img', { src: assetUrl('kanshan/wave.gif'), style: 'width:24px;height:24px;border-radius:50%' }),
      el('span', { style: 'font-size:12px;color:#8590a6', text: '看山问' }),
    ]),
    el('div', { class: 'zb-quiz-concept', text: `关于「${rec.name}」` }),
    el('div', { class: 'zb-quiz-q', text: rec.quizQuestion || '看山正在想问题……' }),
    el('textarea', { class: 'zb-quiz-a', rows: '3', placeholder: '用你自己的话说……' }),
    el('div', { class: 'zb-quiz-actions' }, [
      el('button', { class: 'zb-quiz-submit', text: '回答', onclick: () => submit(card, rec) }),
    ]),
  ]);
  // 线上模式：explain 不返回追问，懒生成（本地 mock 自带，直接跳过）
  if (!rec.quizQuestion) {
    const btn = card.querySelector('.zb-quiz-submit');
    btn.disabled = true;
    ensureQuizQuestion(rec).then((r) => {
      if (r.quizQuestion) {
        card.querySelector('.zb-quiz-q').textContent = r.quizQuestion;
        btn.disabled = false;
      } else {
        card.replaceChildren(el('div', { class: 'zb-quiz-feedback', text: '看山暂时想不出好问题，先放过这个概念。' }));
      }
    });
  }
  return card;
}

async function submit(card, rec) {
  const ta = card.querySelector('textarea');
  const answer = ta.value.trim();
  if (!answer) { ta.placeholder = '先写点什么吧，看山在听。'; return; }
  const btn = card.querySelector('.zb-quiz-submit');
  btn.disabled = true;
  btn.textContent = '看山想了想……';
  const res = await api.quiz({
    concept: rec.name,
    question: rec.quizQuestion,
    answer,
    quote: rec.quote,
    quizPoints: rec.quizPoints || [],
  }).catch(() => ({ verdict: 'partial', feedback: '看山走神了（网络问题），这次先记为有点模糊。' }));

  // §10.8：正确 → 已走过；部分 → 有点模糊；错误 → 保持还没走过
  const mastery = res.verdict === 'correct' ? 'passed' : res.verdict === 'partial' ? 'fuzzy' : rec.mastery;
  await store.saveConceptRecord(rec.name, { mastery });
  const art = await store.getArticleRecord(rec.firstSource?.articleId || runtime.page?.articleId || '');
  if (art) {
    art.quizzes.push({ concept: rec.name, question: rec.quizQuestion, answer, verdict: res.verdict, at: Date.now() });
    await store.saveArticleRecord(art.id, { quizzes: art.quizzes });
  }
  answered.add(rec.name);
  runtime.emit('quiz:done', { concept: rec.name, verdict: res.verdict });

  const verdictText = { correct: '答对了——营地标记「已走过」。', partial: '差一点点，记为「有点模糊」。', wrong: '还没走到，没关系，先记在短尾巴里。' }[res.verdict];
  card.replaceChildren(
    el('div', { class: `zb-quiz-verdict v-${res.verdict}`, text: verdictText }),
    el('div', { class: 'zb-quiz-feedback', text: res.feedback || '看山点了点头。' }),
    el('button', { class: 'zb-quiz-again', text: '好了', onclick: () => { card.remove(); } }),
  );
}
