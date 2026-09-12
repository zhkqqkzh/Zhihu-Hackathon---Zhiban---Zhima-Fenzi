// 插件构建（§准备期 ⑦：MV3 禁止远程代码，所有依赖本地打包）。
// esbuild 打包 content/background + 拷贝静态资源到 dist/。
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const EXT = dirname(fileURLToPath(import.meta.url));
const DEMO = join(EXT, '../demo');
const DIST = join(EXT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

await esbuild.build({
  entryPoints: [
    join(EXT, 'src/content.js'),
    join(EXT, 'src/background.js'),
    join(EXT, 'src/profile-page.js'), // 个人中心独立页（新标签页承载）
  ],
  bundle: true,
  format: 'iife',
  target: 'chrome105', // 自定义高亮接口需 Chrome 105+（§22-3）
  outdir: DIST,
  outExtension: { '.js': '.js' },
  logLevel: 'info',
});

cpSync(join(DEMO, 'assets/kanshan'), join(DIST, 'assets/kanshan'), { recursive: true });
// 独立页需要主文档皮肤（zhihu.css 提供 :root 变量与 .App 容器，zhiban.css 提供 hub 区块样式）
for (const f of ['zhiban.css', 'zhihu.css']) {
  const src = join(DEMO, 'assets/css', f);
  if (!existsSync(src)) continue;
  mkdirSync(join(DIST, 'assets/css'), { recursive: true });
  cpSync(src, join(DIST, 'assets/css', f));
}
console.log('extension dist ready →', DIST);
