const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const src = 'D:\\project\\知乎\\extension';
const zip = 'D:\\project\\知乎\\zhiban-extension.zip';

// Use tar to create zip (built-in on Windows 10+)
const cmd = `tar -acf "${zip}" build.mjs manifest.json profile.html dist\\ icons\\ src\\`;
const r = execSync(cmd, { shell: 'powershell', cwd: src });
console.log(r.toString());
const s = fs.statSync(zip);
console.log('zip_size=' + s.size);
