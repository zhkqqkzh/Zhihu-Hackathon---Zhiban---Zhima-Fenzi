// 数据层（§9）：所有记录仅存本浏览器，不上传服务器。
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

// ---- 元信息：首访引导等 ----
export async function getMeta() { return (await storage.get(META_KEY)) || {}; }
export async function saveMeta(patch) {
  const cur = await getMeta();
  await storage.set(META_KEY, { ...cur, ...patch });
}

// ---- 数据控制（§六）：一键删除全部记录，不藏进设置 ----
export async function deleteAllData() {
  await storage.clear(PREFIX);
}
