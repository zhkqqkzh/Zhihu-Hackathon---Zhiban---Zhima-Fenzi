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
  entryPoints: [join(EXT, 'src/content.js'), join(EXT, 'src/background.js')],
  bundle: true,
  format: 'iife',
  target: 'chrome105', // 自定义高亮接口需 Chrome 105+（§22-3）
  outdir: DIST,
  outExtension: { '.js': '.js' },
  logLevel: 'info',
});

mkdirSync(join(DIST, 'assets/kanshan'), { recursive: true });
cpSync(join(DEMO, 'assets/kanshan'), join(DIST, 'assets/kanshan'), { recursive: true });
if (existsSync(join(DEMO, 'assets/css/zhiban.css'))) {
  mkdirSync(join(DIST, 'assets/css'), { recursive: true });
  cpSync(join(DEMO, 'assets/css/zhiban.css'), join(DIST, 'assets/css/zhiban.css'));
}
console.log('extension dist ready →', DIST);
