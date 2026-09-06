// 应用层限流（§14.3 第二道）。内存计数，冷启动清零，只作为辅助；
// 真正的总闸是模型厂商控制台消费硬上限（第一道，平台侧配置，不在代码里）。

const buckets = new Map(); // ip -> { count, resetAt }

export function checkRateLimit(ip, perMinute) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + 60_000 };
    buckets.set(ip, b);
  }
  b.count += 1;
  return { allowed: b.count <= perMinute, remaining: Math.max(0, perMinute - b.count) };
}

// 定期清理过期桶，避免内存膨胀（本地长开时）
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) if (now >= b.resetAt) buckets.delete(ip);
}, 60_000).unref();
