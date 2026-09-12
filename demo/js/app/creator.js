// 答主视角页（改造方案 §4.4「杀手锏」）：把读者的卡点变成答主能直接用的东西。
// 标题就叫「你的读者，卡在这三个地方」：
//   输入任意知乎回答链接 → 这份回答的读者卡点报告（TOP3）→ 一键生成「前置说明」草稿。
// 草稿复用 guide.js 的 buildGuide（把卡点 TOP3 当概念列表），生成后进导读页逐段改 / 存笔记 / 导出 .md。
// 数据来源如实标注（§4.5 / 验收 §七-6）：seed 标「演示环境数据」，现场上报标「你的上报」，
// 认不出的链接给诚实的空状态——不为了好看硬凑数据。

import { el, toast } from './ui.js';
import * as store from './store.js';
import { ARTICLES, ARTICLE_BY_ID } from '../data/articles.js';
import { buildCreatorReport, articleIdFromLink, formatCount, stuckSourceLabel } from '../core/stuck.js';
import { buildGuide } from './guide.js';
import { gotoAnchor } from './hub.js';
import { navigate } from './router.js';

// 卡点报告：标题 + 三处卡点 + 一键生成草稿。
function renderReport(host, report) {
  host.replaceChildren(el('div', { class: 'QuestionHeader', style: 'margin:0 0 12px' }, [
    el('h1', { style: 'font-size:19px', text: report.title || report.articleId }),
    el('div', { class: 'meta', text: `${report.author} · ${formatCount(report.voteupCount)} 赞同 · 三处卡点合计被标记 ${formatCount(report.topStuck)} 次（本篇全部卡点 ${formatCount(report.totalStuck)} 次）` }),
  ]));

  const list = el('div', {});
  report.items.forEach((item, i) => {
    // 点一下回原文那一段（复用 Hub 的跨页锚点跳转），并把概念名当段内搜索词。
    const jump = el('span', { class: 'gi-link', style: 'cursor:pointer', text: '→ 回去看这一段', onclick: () => gotoAnchor(report.articleId, { ...item, text: item.concept }) });
    list.appendChild(el('div', { class: 'GuideItem' }, [
      el('div', { class: 'gi-head' }, [
        el('b', { text: `#${i + 1} ${item.concept}` }),
        el('span', { style: 'margin-left:8px;color:#056de8;font-weight:600', text: `${formatCount(item.count)} 人卡在这` }),
      ]),
      el('div', { class: 'gi-quote', text: `第 ${(item.paragraphIndex ?? 0) + 1} 段 · 占全部卡点的 ${item.share}% · 来源：${stuckSourceLabel(item)}` }),
      jump,
    ]));
  });
  host.appendChild(list);

  const genBtn = el('button', { class: 'zb-btn creator-gen', text: '一键生成前置说明草稿' });
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    genBtn.textContent = '正在生成…';
    try {
      const guide = await buildGuide(report.articleId, report.items);
      if (!guide) {
        toast('这篇还生成不了草稿：读者标记的词没对上概念。');
        genBtn.disabled = false;
        genBtn.textContent = '一键生成前置说明草稿';
        return;
      }
      navigate(`/guide/${report.articleId}`);
    } catch {
      toast('生成失败，稍后再试。');
      genBtn.disabled = false;
      genBtn.textContent = '一键生成前置说明草稿';
    }
  });
  host.appendChild(el('div', { style: 'margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
    genBtn,
    // §七-4：产出不止于本地——草稿的终点是答主把这段贴回自己的知乎回答（知伴不代发布，§六硬边界）。
    el('span', { style: 'font-size:12px;color:#8590a6', text: '草稿会进到导读页：能逐段改，再存成笔记卡片或导出 .md；改好贴回你的知乎回答，下一位读者就不用再卡一次。' }),
  ]));
}

// 诚实的空状态：认不出链接时，列出演示环境真正收录的几篇，让用户能立刻试。
function renderUnrecognized(host, run) {
  const box = el('div', { style: 'font-size:13px;line-height:1.9;color:#8590a6' });
  box.append(el('div', { text: '认不出这个链接。演示环境只收录了下面这几篇的读者卡点数据——不是数据不存在，是这里还没接上。点一篇试试：' }));
  const links = el('div', { style: 'margin-top:6px;display:flex;flex-direction:column;gap:6px' });
  for (const a of ARTICLES) {
    links.appendChild(el('span', { class: 'gi-link', style: 'cursor:pointer', text: `· ${a.title}`, onclick: () => run(`#/article/${a.id}`) }));
  }
  box.appendChild(links);
  host.replaceChildren(box);
}

// 页面：#/creator —— 你的读者，卡在这三个地方
export async function renderCreator(app) {
  const wrap = el('div', { class: 'HomeGuide' });
  wrap.append(el('h1', { style: 'font-size:22px;margin-bottom:8px', text: '你的读者，卡在这三个地方' }));
  wrap.append(el('div', { class: 'lead', html:
    '<p>把任意一篇知乎回答的链接粘进来，看看读者在哪三个词上卡得最多。</p>' +
    '<p>知伴只把读者标记过的卡点聚合起来，如实标出数据来源——不替你美化，也不上传任何内容。</p>'
  }));

  const input = el('input', {
    class: 'creator-input', style: 'width:100%;padding:9px 12px;border:1px solid #e0e5ee;border-radius:8px;font-size:14px',
    placeholder: '粘贴知乎回答链接，例如 https://www.zhihu.com/question/xxx/answer/3492867410',
  });
  const goBtn = el('button', { class: 'zb-btn creator-go', text: '看读者卡在哪' });
  const result = el('div', { style: 'margin-top:16px' });
  wrap.append(input, el('div', { style: 'margin-top:10px' }, [goBtn]), result);
  app.replaceChildren(wrap);

  // run 可带链接（空状态里的示例入口直接用），不带时读输入框。
  const run = async (link) => {
    const articleId = articleIdFromLink(link ?? input.value);
    if (!articleId) { renderUnrecognized(result, run); return; }
    const marks = await store.getStuckMarks(articleId);
    const report = buildCreatorReport(articleId, ARTICLE_BY_ID.get(articleId), marks, 3);
    if (!report.hasData) {
      result.replaceChildren(el('div', { style: 'font-size:13px;line-height:1.9;color:#8590a6', text: '这篇回答目前还没有读者卡点数据。等有读者在正文里标过「我也卡了一下」，这里就会有报告。' }));
      return;
    }
    renderReport(result, report);
  };
  goBtn.addEventListener('click', () => run());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}
