// 笔记卡片出口（计划书第 4 条「假发布 → 真笔记」）：本地存 + 一键导出 .md。
// 全程无接口依赖：Markdown 生成在 core/note.js（纯函数），存储经 store.js（异步）。

import { toast, downloadText } from './ui.js';
import * as store from './store.js';
import { noteToMarkdown, safeFileName, formatTime } from '../core/note.js';

// 单概念笔记：来源文章标题/链接取自本地文章记录（文章页渲染时已写入）。
export async function buildConceptNote({ concept, definition, inContext, quote, articleId }) {
  const art = articleId ? await store.getArticleRecord(articleId) : null;
  return {
    kind: 'concept',
    concept,
    definition,
    inContext,
    quote,
    articleId: articleId || '',
    title: art?.title || '',
    url: art?.link || '',
  };
}

export async function saveNote(note) {
  const saved = await store.saveNote(note);
  toast('已存进你的笔记。随时可以导出 .md。');
  return saved;
}

// 导出即落盘：先存一份（同 id 覆盖），避免「导出完却查不到记录」或编辑后只剩旧版本。
export async function exportNote(note, name) {
  const saved = await store.saveNote(note);
  const date = formatTime(saved.createdAt).slice(0, 10).replace(/-/g, '');
  downloadText(`${safeFileName(name)}-${date}.md`, noteToMarkdown(saved));
  toast('已导出 .md 文件。');
  return saved;
}
