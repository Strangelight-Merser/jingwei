import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
if (process.platform !== 'darwin') {console.log('macOS OCR helper skipped; Windows uses bundled system WinRT script (not machine-verified).'); process.exit(0);}
const root = resolve(import.meta.dirname, '..'), dir = resolve(root, '.local/bin');
await mkdir(dir, {recursive: true});
const compile = spawnSync('/usr/bin/clang', ['-fobjc-arc', '-framework', 'Foundation', '-framework', 'Vision', '-framework', 'ImageIO', resolve(root, 'native/ocr.m'), '-o', resolve(dir, 'jingwei-ocr')], {stdio: 'inherit'});
if (compile.status !== 0) process.exit(compile.status ?? 1);
console.log('Local Vision OCR helper compiled with clang.');
