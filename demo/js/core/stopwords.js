// 非概念拦截（方案 §15）：三层——只要求非空 → 停用词表主拦截 → 模型判定兜底。
// ⚠️ 绝不能用"长度大于 2 字"：会误杀「梯度」「导数」「卷积」「熵」。

const STOPWORDS = new Set([
  '的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '这', '那', '这个', '那个', '这些', '那些', '一个', '一些', '什么', '怎么', '为什么',
  '因为', '所以', '但是', '而且', '或者', '如果', '就', '都', '也', '还', '又', '再',
  '不', '没', '没有', '很', '更', '最', '被', '把', '对', '向', '从', '到', '与', '及',
  '或', '且', '但', '而', '着', '过', '啊', '呢', '吧', '吗', '嘛', '哦', '嗯',
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'and', 'or', 'in', 'on', 'it', 'this', 'that',
]);

export function isStopword(text) {
  return STOPWORDS.has(String(text || '').trim().toLowerCase());
}

export function isProbablyPunctuationOrNoise(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  // 纯标点 / 纯空白 / 纯表情符号
  return !/[\p{L}\p{N}]/u.test(t);
}

// 返回 null 表示通过；否则返回友好提示文案（宁可友好提示，不要静默失败）。
export function interceptSelection(text) {
  const t = String(text || '').trim();
  if (!t) return '先划选一点内容，再来问我。';
  if (isProbablyPunctuationOrNoise(t)) return '这个好像不是一个概念，我也看不太懂。换一段文字试试？';
  if (isStopword(t)) return '「' + t + '」是个常用词，不是一个需要解释的概念。试试划选一个专业名词？';
  if (t.length > 60) return '选得有点长啦。划选一个具体的概念（几个字到十几个字）效果最好。';
  return null;
}
