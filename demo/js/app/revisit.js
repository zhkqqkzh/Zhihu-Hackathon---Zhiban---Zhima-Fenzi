// 短尾巴回访（功能 8 / §10.9）：零模型调用，本地比对触发。
// 选中概念时，若该概念有历史且已超下次回访时间，弹出回访卡片。
// 三个选项：还记得（间隔 1→3→7→15 递增）/ 有点模糊（保持）/ 完全忘了（重置 1 天）。

import { el } from './ui.js';
import { isDue, applyFeedback, nextIntervalDays } from '../core/srs.js';
import * as store from './store.js';
import { runtime } from './runtime.js';

// 返回回访卡片 DOM（挂进浮层），没有到期则返回 null
export async function onRevisitCheck(record) {
  const review = record?.review;
  if (!review) return null;
  if (!isDue(review)) return null;
  const last = new Date(review.lastReviewAt || Date.now());
  const dateStr = `${last.getMonth() + 1} 月 ${last.getDate()} 号`;
  const card = el('div', { class: 'zb-revisit' }, [
    el('div', { text: `这个你 ${dateStr} 问过。还记得吗？` }),
  ]);
  const respond = async (feedback) => {
    const next = applyFeedback(review, feedback);
    await store.saveConceptRecord(record.name, { review: next });
    card.replaceChildren(el('div', { text: feedback === 'forgot'
      ? '没关系，回到短尾巴里，我们再来一遍。'
      : feedback === 'fuzzy'
        ? '有点模糊很正常，下次见面再看一次就好。'
        : `太好了。下次回访是 ${nextIntervalDays(next)} 天后。` }));
    runtime.emit('revisit:done', { concept: record.name, feedback });
  };
  for (const [label, fb] of [['还记得', 'remember'], ['有点模糊', 'fuzzy'], ['完全忘了', 'forgot']]) {
    card.appendChild(el('button', { text: label, onclick: () => respond(fb) }));
  }
  return card;
}
