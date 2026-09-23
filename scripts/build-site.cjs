const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, {recursive:true});
// Explicit public files only: backend code, caches and dependencies stay private.
for (const name of fs.readdirSync(root).filter(name=>name.endsWith('.html'))) {
  fs.copyFileSync(path.join(root,name),path.join(output,name));
}
for (const name of ['assets','game']) {
  fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true});
}
require('./build-seo.cjs').writeSEO(output);
console.log('Built static website in dist/');
