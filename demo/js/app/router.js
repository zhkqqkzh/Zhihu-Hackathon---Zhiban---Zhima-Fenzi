// 前端路由（§8.3 约束 1：hash 路由，不用 path 路由——对象存储只认真实文件路径）。
// 路由：#/ 首页（开场导读）、#/article/:id 文章页、#/igloo 冰屋、#/guide/:id 导读编辑、#/hub 学习中心、#/creator 答主视角。

const listeners = new Set();

export function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'article' && parts[1]) return { name: 'article', id: parts[1] };
  if (parts[0] === 'igloo') return { name: 'igloo' };
  if (parts[0] === 'hub') return { name: 'hub' };
  if (parts[0] === 'profile') return { name: 'profile' };
  if (parts[0] === 'creator') return { name: 'creator' };
  if (parts[0] === 'guide' && parts[1]) return { name: 'guide', id: parts[1] };
  return { name: 'home' };
}

export function navigate(path) {
  location.hash = path;
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('hashchange', () => {
  const route = parseRoute();
  for (const fn of listeners) fn(route);
});
