// 知伴 · 卡点聚合存储（SCF 版，C1）
// 只存「概念名 + 段号 + 计数」，不存正文、不存任何用户标识。
//
// 存储后端可插拔：
//   - 默认：进程内存（与旧行为一致），随函数实例存活。
//   - 配置 STUCK_REDIS_URL（redis://... / rediss://...）后写 Redis：
//     冷启动 / 实例轮换不丢，跨设备互见。连接不可达时 5s 内判定失败并降级回内存，
//     读写失败同样降级，契约不变。
//   - ioredis 为依赖库（Node 12 兼容）：需在 scf/ 目录 `npm install ioredis` 后重新打包。
//
// 接口（均返回 Promise，且永不 reject —— 失败一律降级内存）：
//   getBucket(articleId) -> bucket | null
//   setBucket(articleId, bucket) -> void
//   articleCount() -> number   已聚合文章数（供上限保护）

'use strict';

var REDIS_BUCKET_KEY = 'zhiban:stuck:bucket:';
var REDIS_ARTICLE_SET = 'zhiban:stuck:articles';
// 连接上限：Redis 不可达时必须尽快降级，绝不能让 /stuck 悬挂到函数 60s 超时。
var REDIS_CONNECT_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error(label + '超时 ' + ms + 'ms')); }, ms);
    promise.then(
      function (v) { clearTimeout(timer); resolve(v); },
      function (e) { clearTimeout(timer); reject(e); }
    );
  });
}

function createMemoryStore() {
  var agg = {}; // { [articleId]: { [concept]: { count, paragraphIndex } } }
  return {
    kind: 'memory',
    getBucket: function (id) { return Promise.resolve(agg[id] || null); },
    setBucket: function (id, bucket) { agg[id] = bucket; return Promise.resolve(); },
    articleCount: function () { return Promise.resolve(Object.keys(agg).length); }
  };
}

function createRedisStore(url) {
  var IORedis = require('ioredis');
  // ioredis 自带有限重连（默认 maxRetriesPerRequest: null 即无限；
  // 设置 maxRetriesPerRequest: 6，6 次失败后 reject pending 请求，约 5s 降级）
  var client = new IORedis(url, {
    maxRetriesPerRequest: 6,
    retryStrategy: function (times) {
      console.error('[stuck-store] Redis 重连 #' + times);
      if (times > 6) {
        console.error('[stuck-store] Redis 重连已达上限，放弃');
        return null; // 停止重连
      }
      return Math.min(times * 200, 2000); // 退避 200ms → 2s
    },
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    lazyConnect: true  // 不自动连接，由下面手动触发+超时控制
  });
  client.on('error', function (e) {
    console.error('[stuck-store] Redis error:', e && e.message);
  });

  // 按需连（不必持久保存一个可能失败一次就永久 reject 的 promise）：
  // 已 ready 直接复用；未连上则重新 connect（ioredis 自带重连/退避），
  // connectTimeout 兜底，绝不让 /stuck 悬挂到函数超时。
  // 注意：ioredis v5 的 connect() resolve 的是 void（v4 才是 client），
  // 必须显式回传 client，否则调用方拿到 undefined。
  function getClient() {
    if (client.status === 'ready') return Promise.resolve(client);
    return withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS, 'Redis 连接')
      .then(function () { return client; });
  }

  return {
    kind: 'redis',
    getBucket: function (id) {
      return getClient().then(function (c) { return c.get(REDIS_BUCKET_KEY + id); }).then(function (raw) {
        return raw ? JSON.parse(raw) : null;
      });
    },
    setBucket: function (id, bucket) {
      return getClient().then(function (c) {
        return c.multi()
          .set(REDIS_BUCKET_KEY + id, JSON.stringify(bucket))
          .sadd(REDIS_ARTICLE_SET, id)
          .exec();
      });
    },
    articleCount: function () {
      return getClient().then(function (c) { return c.scard(REDIS_ARTICLE_SET); });
    }
  };
}

// 按 STUCK_REDIS_URL 决定后端；未配 / 不可用一律返回内存实现（永不抛错）
function createStuckStore() {
  var memory = createMemoryStore();
  var url = String(process.env.STUCK_REDIS_URL || '').trim();
  if (!url) return memory;

  var primary;
  try {
    primary = createRedisStore(url);
  } catch (e) {
    console.error('[stuck-store] Redis 不可用，降级内存：' + ((e && e.message) || e));
    return memory;
  }

  // 带冷却的降级：一次失败只在本请求回退内存，冷却 COOL_DOWN_MS 后再试 Redis；
  // 连上即自动恢复（不再永久 latch，也不再 close 客户端，保留 ioredis 自行重连的能力）。
  var COOL_DOWN_MS = 30000;
  var degradedUntil = 0;
  function guarded(name) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var now = Date.now();
      if (now < degradedUntil) return memory[name].apply(memory, args);
      return primary[name].apply(primary, args).catch(function (e) {
        degradedUntil = now + COOL_DOWN_MS;
        console.error('[stuck-store] Redis 失败，本请求降级内存（' + (COOL_DOWN_MS / 1000) + 's 后再试）：' + ((e && e.message) || e));
        return memory[name].apply(memory, args);
      });
    };
  }
  return {
    kind: 'redis',
    getBucket: guarded('getBucket'),
    setBucket: guarded('setBucket'),
    articleCount: guarded('articleCount')
  };
}

module.exports = { createStuckStore: createStuckStore, createMemoryStore: createMemoryStore };
