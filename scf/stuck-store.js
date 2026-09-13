// 知伴 · 卡点聚合存储（SCF 版，C1）
// 只存「概念名 + 段号 + 计数」，不存正文、不存任何用户标识。
//
// 存储后端可插拔：
//   - 默认：进程内存（与旧行为一致），随函数实例存活。
//   - 配置 STUCK_REDIS_URL（redis://... / rediss://...）后写 Redis：
//     冷启动 / 实例轮换不丢，跨设备互见。连接不可达时 5s 内判定失败并降级回内存（不重连、不悬挂），
//     读写失败同样降级，契约不变。
//   - redis 为可选依赖：需在 scf/ 目录 `npm install redis` 后重新打包；未安装则自动走内存。
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
  var redis = require('redis'); // 未安装则抛错 → 由 createStuckStore 降级内存
  // reconnectStrategy:false —— node-redis v4 默认无限重连，主机不可达时 connect() 永不落定，
  // 会让 /stuck 一路悬挂到函数超时；关掉重连后失败立即 reject，由上层降级。
  var client = redis.createClient({ url: url, socket: { reconnectStrategy: false } });
  client.on('error', function () {}); // 连接错误静默，读写失败时统一降级
  var ready = client.isOpen
    ? Promise.resolve(client)
    : withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS, 'Redis 连接').then(function () { return client; });
  ready.catch(function () {}); // 先挂 catch，避免连接失败产生未处理的 rejection 拖垮函数进程
  function close() {
    // 仅在连接已建立时可 disconnect（ClientClosedError 会同步/异步抛出，故 isOpen 判断 + 双保险）
    try {
      if (client.isOpen) {
        var p = client.disconnect();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) {}
  }
  return {
    kind: 'redis',
    close: close,
    getBucket: function (id) {
      return ready.then(function (c) { return c.get(REDIS_BUCKET_KEY + id); }).then(function (raw) {
        return raw ? JSON.parse(raw) : null;
      });
    },
    setBucket: function (id, bucket) {
      return ready.then(function (c) {
        return c.multi()
          .set(REDIS_BUCKET_KEY + id, JSON.stringify(bucket))
          .sAdd(REDIS_ARTICLE_SET, id)
          .exec();
      });
    },
    articleCount: function () {
      return ready.then(function (c) { return c.sCard(REDIS_ARTICLE_SET); });
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

  var degraded = false;
  function guarded(name) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      if (degraded) return memory[name].apply(memory, args);
      return primary[name].apply(primary, args).catch(function (e) {
        if (!degraded) {
          degraded = true;
          primary.close();
          console.error('[stuck-store] Redis 不可用，后续降级内存：' + ((e && e.message) || e));
        }
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
