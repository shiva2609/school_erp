import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const adminRoot = path.join(root, 'src/app/(admin)');
const mobileRoot = path.join(root, 'src/app/m');

function walk(dir, parts = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, [...parts, name]);
    else if (name === 'page.tsx' && parts.length > 0) {
      const outDir = path.join(mobileRoot, ...parts);
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, 'page.tsx');
      const rel = path.relative(outDir, path.join(adminRoot, ...parts)).replace(/\\/g, '/');
      const importPath = rel.startsWith('.') ? rel : `./${rel}`;
      const content = `'use client';\n\nexport { default } from '${importPath}/page';\n`;
      fs.writeFileSync(outFile, content);
    }
  }
}

fs.mkdirSync(mobileRoot, { recursive: true });
walk(adminRoot);
console.log('Mobile mirror pages generated under src/app/m/');
