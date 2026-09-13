// 数据层（§9）：正文、阅读史、概念记录、笔记一律只存本浏览器，不上传服务器。
// 唯一例外是卡点：上报「概念名 + 段号 + 计数」做匿名聚合（见 addStuckMark），便于多个读者互相看到卡点。
// 覆盖 §9.1 文章记录 / §9.2 概念记录 / 预扫描缓存 / 导读 / 提问记录。
// 铁律 1：全部异步。键前缀统一 'zb:'，一键删除即清空前缀。

import { createMemoryStorage } from '../core/storage.js';
import { collectTextNodes, offsetsToRanges } from '../core/textnodes.js';

const PREFIX = 'zb:';
const ARTICLE_KEY = (id) => `${PREFIX}article:${id}`;
const CONCEPT_KEY = (name) => `${PREFIX}concept:${name}`;
const PRESCAN_KEY = (id) => `${PREFIX}prescan:${id}`;
const GUIDE_KEY = (id) => `${PREFIX}guide:${id}`;
const META_KEY = `${PREFIX}meta`;
const LINK_CACHE_KEY = (name) => `${PREFIX}links:${name}`;
const NOTE_KEY = (id) => `${PREFIX}note:${id}`;
const STUCK_KEY = (id) => `${PREFIX}stuck:${id}`;

// 浏览器适配：localStorage 包成异步接口（demo 环境）
function createLocalStorageAdapter() {
  return {
    get: async (k) => { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); },
    set: async (k, v) => { localStorage.setItem(k, JSON.stringify(v)); },
    remove: async (k) => { localStorage.removeItem(k); },
    keys: async (prefix = '') => Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
    clear: async (prefix = '') => {
      for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
    },
  };
}

let storage = typeof localStorage !== 'undefined' ? createLocalStorageAdapter() : createMemoryStorage();

export function setStorageAdapter(s) { storage = s; }

// ---- 文章记录（§9.1）----
export async function getArticleRecord(id) {
  return (await storage.get(ARTICLE_KEY(id))) || null;
}
export async function saveArticleRecord(id, patch) {
  const cur = await getArticleRecord(id);
  const next = {
    id,
    title: '', link: '',
    expandedConcepts: [],   // 已展开概念名列表（有序）
    prescan: null,          // { concepts, at } 缓存判断
    quizzes: [],            // 提问记录 { concept, question, answer, verdict, at }
    readToEnd: false,
    firstReadAt: Date.now(),
    ...cur, ...patch,
  };
  await storage.set(ARTICLE_KEY(id), next);
  return next;
}

// ---- 概念记录（§9.2）----
export async function getConceptRecord(name) {
  return (await storage.get(CONCEPT_KEY(name))) || null;
}
export async function saveConceptRecord(name, patch) {
  const cur = await getConceptRecord(name);
  const next = {
    name,
    isConcept: true,
    definition: '',
    inContext: '',
    prerequisites: [],      // 数组，常驻
    quote: '',              // 原文引用
    links: [],              // 站内链接
    mastery: 'unvisited',   // unvisited | fuzzy | passed（还没走过/有点模糊/已走过）
    firstSource: null,      // { articleId, at }
    review: null,           // { level, lastReviewAt, reviewCount, nextReviewAt }
    firstAskedAt: Date.now(),
    // Learning Hub（§新功能）：锚点 + 学习次数
    anchors: [],            // [{ articleId, paragraphIndex, startOffset, endOffset, at }] 每次新语境追加
    ...cur, ...patch,
  };
  await storage.set(CONCEPT_KEY(name), next);
  return next;
}
export async function listConcepts() {
  const keys = await storage.keys(CONCEPT_KEY(''));
  const out = [];
  for (const k of keys) { const r = await storage.get(k); if (r) out.push(r); }
  return out.sort((a, b) => (a.firstAskedAt || 0) - (b.firstAskedAt || 0));
}
export async function listArticleRecords() {
  const keys = await storage.keys(ARTICLE_KEY(''));
  const out = [];
  for (const k of keys) { const r = await storage.get(k); if (r) out.push(r); }
  return out;
}

// ---- Learning Hub：锚点映射（§新功能）----
// 把概念记录的单个 anchor（按段落索引+段内文本偏移）映射回 DOM Range。
// 段落选择器与 core/selectors.js 对齐；排除选择器保证与选区收集一致。
export function anchorToRanges(anchor, container, paragraphSelector, excludeSelector) {
  if (!anchor || !container) return [];
  try {
    const paras = [...container.querySelectorAll(paragraphSelector || 'p, li, blockquote, h2, h3')];
    const para = paras[anchor.paragraphIndex] || null;
    if (!para) return [];
    const collected = collectTextNodes(para, excludeSelector || null);
    const start = Math.max(0, anchor.startOffset || 0);
    const end = Math.min(collected.text.length, anchor.endOffset ?? anchor.startOffset ?? start);
    return offsetsToRanges(collected, start, Math.max(end, start));
  } catch {
    return [];
  }
}
export async function allKnownConceptNames() {
  return (await listConcepts()).map((c) => c.name);
}
export async function allPrescanConceptNames() {
  const keys = await storage.keys(PRESCAN_KEY(''));
  const names = new Set();
  for (const k of keys) {
    const r = await storage.get(k);
    if (r?.concepts) for (const c of r.concepts) names.add(c);
  }
  return names;
}

// ---- 预扫描缓存（§17：按文章 ID 缓存，同篇不重复烧）----
export async function getPrescan(id) { return await storage.get(PRESCAN_KEY(id)); }
export async function savePrescan(id, concepts) {
  await storage.set(PRESCAN_KEY(id), { concepts, at: Date.now() });
}

// ---- 问答结果缓存（§17：文章 ID + 选中词，防现场连续提问触发限流）----
export async function getAnswerCache(articleId, concept) {
  return await storage.get(`${PREFIX}answer:${articleId}:${concept}`);
}
export async function saveAnswerCache(articleId, concept, data) {
  await storage.set(`${PREFIX}answer:${articleId}:${concept}`, { data, at: Date.now() });
}

// ---- 站内链接缓存（§17：同一概念不重复检索）----
export async function getLinkCache(name) { return await storage.get(LINK_CACHE_KEY(name)); }
export async function saveLinkCache(name, items) {
  await storage.set(LINK_CACHE_KEY(name), { items, at: Date.now() });
}

// ---- 导读（§9.1 / 功能 6）----
export async function getGuide(articleId) { return await storage.get(GUIDE_KEY(articleId)); }
export async function saveGuide(articleId, guide) {
  await storage.set(GUIDE_KEY(articleId), { ...guide, updatedAt: Date.now() });
}
export async function listGuides() {
  const keys = await storage.keys(GUIDE_KEY(''));
  const out = [];
  for (const k of keys) { const r = await storage.get(k); if (r) out.push(r); }
  return out;
}

// ---- 笔记卡片（计划书第 4 条：假发布 → 真笔记）----
// 键 zb:note:<id>，本地存储、无接口依赖；导出 .md 在 app 层用 core/note.js 生成。
export async function getNote(id) { return await storage.get(NOTE_KEY(id)); }
export async function saveNote(note) {
  const id = note.id || `n${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const next = { createdAt: Date.now(), ...note, id };
  await storage.set(NOTE_KEY(id), next);
  return next;
}
export async function listNotes() {
  const keys = await storage.keys(NOTE_KEY(''));
  const out = [];
  for (const k of keys) { const r = await storage.get(k); if (r) out.push(r); }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export async function deleteNote(id) { await storage.remove(NOTE_KEY(id)); }

// ---- 卡点上报（改造方案 §4.2 / §4.5）----
// 只记「本浏览器现场上报过的词」，与 core/stuck.js 的 seed 在读取时叠加。
// 同一篇同一个词只存一条（点第二次不重复计数），避免刷量。
export async function getStuckMarks(articleId) {
  return (await storage.get(STUCK_KEY(articleId)))?.marks || [];
}
// 列出本浏览器全部现场上报（个人中心「我的贡献」用）：每条带上所属 articleId，按时间倒序。
export async function listStuckMarks() {
  const keys = await storage.keys(STUCK_KEY(''));
  const out = [];
  for (const k of keys) {
    const r = await storage.get(k);
    if (!r || !Array.isArray(r.marks)) continue;
    for (const m of r.marks) out.push({ ...m, articleId: r.articleId });
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function addStuckMark(articleId, mark) {
  const cur = await getStuckMarks(articleId);
  const marks = [
    ...cur.filter((m) => m.concept !== mark.concept),
    { concept: mark.concept, paragraphIndex: mark.paragraphIndex ?? null, startOffset: mark.startOffset || 0, endOffset: mark.endOffset || 0, at: Date.now() },
  ];
  await storage.set(STUCK_KEY(articleId), { articleId, marks, at: Date.now() });
  reportStuckQuietly(articleId, mark);
  return marks;
}

// 匿名上报一次（只带「概念名 + 段号」），让卡点流到下一个读到的人（改造方案 §三）。
// 不 await：本地记录已经写好，界面不该为一个网络请求等待；失败也静默——离线照样能记。
// 懒加载 api.js：api.js 运行时才反向引用 store.js，静态互引会成环（见 api.js ensureQuizQuestion）。
function reportStuckQuietly(articleId, mark) {
  import('./api.js')
    .then(({ api }) => api.reportStuck({
      articleId,
      concept: mark.concept,
      paragraphIndex: mark.paragraphIndex ?? null,
    }))
    .catch(() => {});
}

// ---- 元信息：首访引导 / 复盘时间等 ----
export async function getMeta() { return (await storage.get(META_KEY)) || {}; }
export async function saveMeta(patch) {
  const cur = await getMeta();
  await storage.set(META_KEY, { ...cur, ...patch });
}

// ---- 每周复盘（计划书第 3 条）：只记「上次复盘时间」，其余全部由本地数据实时算 ----
export async function getLastReviewAt() {
  const meta = await getMeta();
  return Number(meta.lastReviewAt) || 0;
}
export async function markReviewShown(at = Date.now()) {
  await saveMeta({ lastReviewAt: at });
}

// ---- 数据控制（§六）：一键删除全部记录，不藏进设置 ----
export async function deleteAllData() {
  await storage.clear(PREFIX);
}
