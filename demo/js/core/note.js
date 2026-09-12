// 笔记卡片（计划书第 4 条「假发布 → 真笔记」）：把概念/导读转成可导出的 Markdown。
// 纯函数，不碰 DOM / 存储 / 网络；下载动作在 ui.js 的 downloadText 里完成。

const pad = (n) => String(n).padStart(2, '0');

export function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 文件名清洗：去掉路径/通配等非法字符，压缩空白与连字符。
export function safeFileName(s) {
  const cleaned = String(s || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || '知伴笔记';
}

// 单概念笔记：概念 / 定义 / 本篇语境 / 原文引用 / 来源链接 / 时间戳
export function conceptNoteMarkdown(note) {
  const lines = [`# 「${note.concept}」`, '', `- **概念**：${note.concept}`];
  if (note.definition) lines.push(`- **定义**：${note.definition}`);
  if (note.inContext) lines.push(`- **本篇语境**：${note.inContext}`);
  if (note.quote) lines.push(`- **原文引用**：「${note.quote}」`);
  if (note.title || note.url) lines.push(`- **来源**：${note.title ? `《${note.title}》` : ''} ${note.url || ''}`.trimEnd());
  lines.push(`- **记录时间**：${formatTime(note.createdAt)}`);
  return lines.join('\n') + '\n';
}

// 导读笔记：多概念分节 + 缺口提醒 + 来源与时间戳
export function guideNoteMarkdown(note) {
  const items = note.items || [];
  const lines = [`# 读《${note.title || ''}》前，你可能需要先搞懂这 ${items.length} 件事`, ''];
  items.forEach((it, i) => {
    lines.push(`## ${i + 1}. ${it.name}`, '');
    if (it.text) {
      // 导读页可逐段编辑：存的是编辑框原文，去掉行首序号与全角缩进后再落 Markdown。
      const edited = String(it.text).split('\n')
        .map((s) => s.replace(/^[\s\u3000]+/, '').replace(/^①\s*/, '').trimEnd())
        .filter(Boolean);
      for (const ln of edited) lines.push(ln, '');
    } else {
      if (it.definition) lines.push(it.definition, '');
      if (it.quote) lines.push(`> 原文里这句：「${it.quote}」`, '');
      if (it.link) lines.push(`站内参考：${it.link}`, '');
    }
  });
  if (note.gap) lines.push(`> 你可能还缺、但没问到的一环：${note.gap}`, '');
  if (note.url) lines.push(`原文：${note.url}`, '');
  lines.push(`> 由知伴整理 · ${formatTime(note.createdAt)}`);
  return lines.join('\n') + '\n';
}

// 统一出口：按 kind 分派，供「导出 .md」按钮直接调用。
export function noteToMarkdown(note) {
  return note && note.kind === 'guide' ? guideNoteMarkdown(note) : conceptNoteMarkdown(note || {});
}
