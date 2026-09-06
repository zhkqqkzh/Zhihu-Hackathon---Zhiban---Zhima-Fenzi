// 存储接口（铁律 1：一律异步）。
// Demo 网页适配 localStorage，插件适配 chrome.storage.local，测试用内存实现。
// 共享模块只依赖这个接口，不出现任何环境专有 API。

export function createMemoryStorage() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    async keys(prefix = '') {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    async clear(prefix = '') {
      for (const k of [...map.keys()]) {
        if (k.startsWith(prefix)) map.delete(k);
      }
    },
  };
}
