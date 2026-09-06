// 导入解析校验：相对 import 路径存在性 + 具名导入是否有对应 export。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../demo/js', import.meta.url));
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.js$/.test(n)) files.push(p);
  }
})(ROOT);

let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const importRe = /import\s+(?:([^'"]*?)\s+from\s+)?['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(src))) {
    const spec = m[2];
    const p = resolve(dirname(f), spec);
    if (!existsSync(p)) {
      console.log(`MISSING  ${f} -> ${spec}`);
      bad++;
      continue;
    }
    const clause = m[1] || '';
    const named = /\{([^}]*)\}/.exec(clause)?.[1] || '';
    if (named) {
      const target = readFileSync(p, 'utf8');
      for (let name of named.split(',')) {
        name = name.trim().split(' as ')[0].trim();
        if (!name) continue;
        const re = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class|let)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`);
        if (!re.test(target)) {
          console.log(`NO EXPORT  '${name}' imported by ${f} from ${spec}`);
          bad++;
        }
      }
    }
    // default import：检查 export default（* as ns 命名空间导入跳过）
    const defaultPart = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
    if (defaultPart && defaultPart !== '*' && !/^\*\s+as\s+/.test(defaultPart)) {
      const target = readFileSync(p, 'utf8');
      if (!/export\s+default\b/.test(target)) {
        console.log(`NO DEFAULT  imported by ${f} from ${spec}`);
        bad++;
      }
    }
  }
}
console.log(bad ? `${bad} problems` : 'imports ok (paths + named + default)');
process.exit(bad ? 1 : 0);
