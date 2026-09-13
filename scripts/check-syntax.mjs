// 语法校验：对项目内所有 .js/.mjs 执行 node --check（模块类型按就近 package.json：
// 根为 ESM，scf/ 为 CommonJS）。用法：node scripts/check-syntax.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['demo', 'server', 'extension/src', 'scripts', 'scf'];
const SKIP = ['node_modules', 'vendor', 'dist', '.git'];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`ok    ${relative(ROOT, f)}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${relative(ROOT, f)}`);
    console.error(String(e.stderr || e.message).slice(0, 800));
  }
}
console.log(`\n${files.length} files checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
