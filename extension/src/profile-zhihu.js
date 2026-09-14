// 个人中心的知乎区块：账号卡 + 收藏夹体检 + 收藏夹分类思维导图。
// 只跑在扩展内独立页（由 profile-page.js 挂载）：依赖 background 的 zb-zhihu-fetch
// 复用浏览器已登录的知乎 Cookie；demo 站没有登录态，不接这里。
//
// 体检口径（§方案）：先规则打分（本地、瞬时），再只把打分结果交给大模型做聚类与点评——
// 规则负责"分"，模型负责"说人话"，模型挂了也还有分可看。

import { el, icon, toast } from '../../demo/js/app/ui.js';
import { api } from '../../demo/js/app/api.js';

const COLLECTION_LIMIT = 20; // 单次体检篇数（接口分页 limit）

// ---------- 取数：经 background 复用知乎登录态 ----------

function zhihuApi(path) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'zb-zhihu-fetch', path }, (r) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(r || { error: 'background 无响应' });
    });
  });
}

const NOT_LOGGED_IN = '读不到知乎登录态。请先在浏览器里登录知乎，再刷新本页。';

function explainFailure(r) {
  if (r.error) return r.error;
  if (r.status === 401 || r.status === 403) return NOT_LOGGED_IN;
  if (r.status === 404) return '知乎没有返回这个接口（接口可能已调整）。';
  return `知乎接口返回 ${r.status}`;
}

async function fetchMe() {
  const r = await zhihuApi('/api/v4/me');
  if (r.status === 200 && r.data && r.data.id) return { me: r.data };
  return { error: explainFailure(r) };
}

// 收藏夹列表：members / people 两个前缀历史上都在用，哪个通用哪个
async function fetchCollections(token) {
  const paths = [
    `/api/v4/members/${token}/collections?offset=0&limit=20`,
    `/api/v4/people/${token}/collections?offset=0&limit=20`,
  ];
  let last = null;
  for (const p of paths) {
    const r = await zhihuApi(p);
    if (r.status === 200 && r.data && Array.isArray(r.data.data)) return { list: r.data.data };
    last = r;
  }
  return { error: explainFailure(last || {}) };
}

async function fetchItems(id) {
  const r = await zhihuApi(`/api/v4/collections/${id}/items?offset=0&limit=${COLLECTION_LIMIT}`);
  if (r.status === 200 && r.data && Array.isArray(r.data.data)) return { list: r.data.data };
  return { error: explainFailure(r) };
}

// ---------- 归一化 + 规则打分 ----------

function plainText(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItem(raw) {
  const c = (raw && raw.content) || {};
  const excerpt = plainText(c.excerpt || c.content);
  const title = plainText((c.question && c.question.title) || c.title) || excerpt.slice(0, 30);
  return {
    title: title || '（无标题）',
    url: String(c.url || (raw && raw.url) || ''),
    excerpt,
    voteup: Number(c.voteup_count || 0),
    comments: Number(c.comment_count || 0),
    type: String(c.type || ''),
  };
}

// 规则打分：内容量 / 赞同 / 讨论热度 / 体裁各占权重，满分 10。
// 分数低不等于没价值，所以 note 一律写成"提醒"而不是"判决"。
function scoreItem(it) {
  const notes = [];
  let score = 0;
  const len = it.excerpt.length;
  if (len >= 220) score += 3;
  else if (len >= 100) score += 2;
  else if (len >= 40) score += 1;
  else notes.push('摘要很短，信息量可能有限');

  if (it.voteup >= 1000) score += 3;
  else if (it.voteup >= 200) score += 2;
  else if (it.voteup >= 30) score += 1;
  else notes.push('赞同数偏低，可回看是否仍有价值');

  if (it.comments >= 50) score += 1;
  if (it.type === 'article') score += 1; // 专栏长文通常更完整

  score = Math.min(score, 10);
  return { score, level: score >= 6 ? 'high' : score >= 3 ? 'mid' : 'low', notes };
}

const LEVEL_TEXT = { high: '值得精读', mid: '可以一读', low: '可略过' };

// ---------- 渲染 ----------

// 区块外壳：h2 常驻，body 由各渲染函数整体替换（避免互相清掉对方的内容）
function section(iconName, title) {
  const sec = el('div', { class: 'hub-section' });
  sec.appendChild(el('h2', {}, [icon(iconName), el('span', { text: title })]));
  const body = el('div');
  sec.appendChild(body);
  return { sec, body };
}

function link(text, url, cls) {
  return el('a', { class: cls || '', href: url, target: '_blank', rel: 'noopener noreferrer', text });
}

function renderAccount(body, me) {
  const avatar = el('img', {
    class: 'zb-zhihu-avatar',
    src: String(me.avatar_url_template || me.avatar_url || '').replace('{size}', 'L'),
    alt: '',
  });
  body.replaceChildren(el('div', { class: 'zb-zhihu-account' }, [
    avatar,
    el('div', { class: 'zb-zhihu-me' }, [
      el('div', { class: 'zb-zhihu-name', text: String(me.name || '知乎用户') }),
      el('div', { class: 'zb-zhihu-headline', text: plainText(me.headline || me.description) || '（还没有签名）' }),
    ]),
    el('div', { class: 'zb-zhihu-src', text: '已接入知乎登录态' }),
  ]));
}

function failureBox(message, onRetry) {
  const box = el('div', { class: 'hub-empty', text: message });
  if (onRetry) {
    box.appendChild(el('button', { class: 'hub-refresh', text: '重试', onclick: onRetry, style: 'margin-left:8px' }));
  }
  return box;
}

function renderChips(collections, currentId, onPick) {
  const row = el('div', { class: 'zb-chip-row' });
  for (const c of collections) {
    const count = Number(c.answer_count || c.item_count || 0);
    row.appendChild(el('button', {
      class: `zb-chip${c.id === currentId ? ' active' : ''}`,
      text: `${c.title || '未命名收藏夹'}（${count}）`,
      onclick: () => onPick(c),
    }));
  }
  return row;
}

// 收藏夹思维导图：纯 DOM/CSS 树（MV3 CSP 禁远程脚本，用不了图谱库）
function renderTree(body, collectionName, groups, total, hint) {
  const leaf = (it) => el('li', {}, [
    el('div', { class: 'zb-tree-label' }, [
      link(it.title, it.url, 'zb-tree-link'),
      el('span', { class: `zb-lv lv-${it.level}`, text: LEVEL_TEXT[it.level] }),
    ]),
  ]);

  const groupNode = (g) => {
    const li = el('li', {}, [
      el('div', { class: 'zb-tree-label group' }, [
        el('span', { class: 'zb-tree-name', text: g.name }),
        el('span', { class: 'zb-tree-count', text: `${g.items.length} 篇` }),
      ]),
    ]);
    li.appendChild(el('ul', { class: 'zb-tree-children' }, g.items.map(leaf)));
    return li;
  };

  const rootLi = el('li', {}, [
    el('div', { class: 'zb-tree-label root' }, [
      el('span', { text: collectionName }),
      el('span', { class: 'zb-tree-count', text: `${total} 篇` }),
    ]),
  ]);
  rootLi.appendChild(el('ul', { class: 'zb-tree-children' }, groups.map(groupNode)));

  body.replaceChildren(
    el('div', { class: 'hint', text: hint || '由大模型按主题聚类；点击标题可跳原文。' }),
    el('ul', { class: 'zb-tree' }, [rootLi]),
  );
}

// 体检清单：按规则分排序，附大模型点评（若有）
function renderCheckup(body, items, reviews, chips, hint) {
  const reviewByTitle = new Map(reviews.map((r) => [r.title, r]));
  const list = el('div', { class: 'zb-check-list' });
  for (const it of items) {
    const rv = reviewByTitle.get(it.title);
    const note = (rv && rv.comment) ? `看山点评：${rv.comment}` : it.notes.join('；') || '内容量与互动都不错，值得重读';
    list.appendChild(el('div', { class: 'zb-check-item' }, [
      el('div', { class: 'zb-check-head' }, [
        link(it.title, it.url, 'zb-check-title'),
        el('span', { class: `zb-lv lv-${it.level}`, text: `${LEVEL_TEXT[it.level]} · ${it.score}分` }),
      ]),
      el('div', { class: 'zb-check-note', text: note }),
      el('div', { class: 'zb-check-meta', text: `${it.voteup} 赞同 · ${it.comments} 评论 · ${it.type === 'article' ? '专栏文章' : '回答'}` }),
    ]));
  }
  body.replaceChildren(...[chips, hint, list].filter(Boolean));
}

// ---------- 组装 ----------

// onItems：体检结果回调，把当前收藏夹的打分文章交给调用方（个人中心「推荐阅读」模块用）。
export async function renderZhihuHub(host, onItems) {
  const acc = section('user', '知乎账号');
  const chk = section('activity', '收藏夹体检');
  const tre = section('tree', '收藏夹思维导图');
  host.replaceChildren(acc.sec, chk.sec, tre.sec);
  acc.body.textContent = '正在读取知乎登录态…';

  const load = async () => {
    acc.body.textContent = '正在读取知乎登录态…';
    const { me, error } = await fetchMe();
    if (error) {
      acc.body.replaceChildren(failureBox(error, load));
      chk.body.replaceChildren();
      tre.body.replaceChildren();
      return;
    }
    renderAccount(acc.body, me);

    const token = me.url_token || me.id;
    const cols = await fetchCollections(token);
    if (cols.error) {
      chk.body.replaceChildren(failureBox(cols.error, load));
      return;
    }
    if (!cols.list.length) {
      chk.body.replaceChildren(el('div', { class: 'hub-empty', text: '这个账号还没有收藏夹。' }));
      return;
    }

    const openCollection = async (c) => {
      const name = String(c.title || '我的收藏夹');
      const chips = renderChips(cols.list, c.id, openCollection);
      chk.body.replaceChildren(chips, el('div', { class: 'hint', text: `正在读取「${name}」…` }));
      tre.body.replaceChildren(el('div', { class: 'hub-empty', text: '正在读取收藏夹…' }));

      const res = await fetchItems(c.id);
      if (res.error) {
        chk.body.replaceChildren(chips, failureBox(res.error));
        tre.body.replaceChildren(failureBox(res.error));
        return;
      }
      const items = res.list.map(normalizeItem).map((it) => ({ ...it, ...scoreItem(it) }))
        .sort((a, b) => b.score - a.score);
      onItems?.(items);
      if (!items.length) {
        chk.body.replaceChildren(chips, el('div', { class: 'hub-empty', text: '这个收藏夹还是空的。' }));
        tre.body.replaceChildren();
        return;
      }

      const hint = el('div', { class: 'hint', text: `规则打分排序，看山为前 6 篇补充点评；本次体检最近 ${items.length} 篇。` });
      renderCheckup(chk.body, items, [], chips, hint);

      // 提前加载：规则分已经在手上，立刻按「可读性」三档画出思维导图，不等大模型。
      // 大模型的主题聚类回来后再整棵树替换（下面 renderTree 那一处）。
      const byLevel = ['high', 'mid', 'low']
        .map((lv) => ({ name: LEVEL_TEXT[lv], items: items.filter((it) => it.level === lv) }))
        .filter((g) => g.items.length);
      renderTree(tre.body, name, byLevel, items.length, '规则分组（看山正在按主题聚类，好了会自动替换）');

      const r = await api.analyzeCollections({
        items: items.map((it) => ({ title: it.title, excerpt: it.excerpt.slice(0, 120), score: it.score })),
      }).catch((e) => ({ groups: [], reviews: [], _degraded: true, _reason: String(e?.message || e) }));

      if (r._degraded) toast('看山暂时连不上，先看规则评分结果');
      // 大模型漏掉的文章归入「未归类」，保证地图上不丢东西
      const grouped = new Set((r.groups || []).flatMap((g) => g.items));
      const byTitle = new Map(items.map((it) => [it.title, it]));
      const groups = (r.groups || []).map((g) => ({ name: g.name, items: g.items.map((t) => byTitle.get(t)).filter(Boolean) }));
      const rest = items.filter((it) => !grouped.has(it.title));
      if (rest.length) groups.push({ name: '未归类', items: rest });

      renderTree(tre.body, name, groups, items.length);
      if (r.reviews && r.reviews.length) renderCheckup(chk.body, items, r.reviews, chips, hint);
    };

    openCollection(cols.list[0]);
  };

  await load();
}
