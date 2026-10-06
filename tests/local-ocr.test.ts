import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {recognizeImage} from '../packages/backend/local-ocr.ts';
import {parseOcrLines} from '../packages/backend/holdings.ts';

const run = promisify(execFile), root = path.resolve(import.meta.dirname, '..');

test('不支持的平台与非图片输入给出明确错误，不调用服务', async () => {
  const options = {tempDir: path.join(root, '.local'), helperPath: 'unused'};
  await assert.rejects(recognizeImage(new Uint8Array([1]), {...options, platform: 'linux'}), /ocr_unsupported_platform/);
  for (const bytes of [null, [], new Uint8Array(), new Uint8Array(20 * 1024 * 1024 + 1)]) await assert.rejects(recognizeImage(bytes, {...options, platform: 'darwin'}), /ocr_invalid_image/);
});

test('macOS clang + Vision 真实识别合成测试图，成功与失败均删除临时图片', {skip: process.platform !== 'darwin'}, async () => {
  await mkdir(path.join(root, '.local'), {recursive: true});
  const directory = await mkdtemp(path.join(root, '.local', 'native-ocr-test-'));
  const input = path.join(directory, 'inputs');
  await mkdir(input);
  const helperPath = path.join(directory, 'jingwei-ocr');
  try {
    await run('/usr/bin/clang', ['-fobjc-arc', '-framework', 'Foundation', '-framework', 'Vision', '-framework', 'ImageIO', path.join(root, 'native/ocr.m'), '-o', helperPath]);
    // A generated white image with names and only fictional fixture amounts, not a reader screenshot.
    const bytes = await readFile(new URL('./fixtures/holdings/local-ocr.synthetic.png', import.meta.url));
    const lines = await recognizeImage(bytes, {tempDir: input, helperPath});
    assert.deepEqual(parseOcrLines([lines]), [{name: '易方达沪深300ETF联接C', amount: 626.01}, {name: '余额宝', amount: 7.28}]);
    assert.ok(lines.every(line => line.x >= 0 && line.y >= 0 && line.x + line.w <= 1 && line.y + line.h <= 1 && typeof line.confidence === 'number'));
    assert.ok(lines.find(line => line.text.includes('沪深300'))!.y < lines.find(line => line.text.includes('余额宝'))!.y);
    assert.deepEqual(await readdir(input), []);
    await assert.rejects(recognizeImage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {tempDir: input, helperPath: path.join(directory, 'missing-helper')}), /ocr_helper_unavailable/);
    assert.deepEqual(await readdir(input), []);
    await assert.rejects(recognizeImage(new Uint8Array([1, 2, 3]), {tempDir: input, helperPath}), /ocr_invalid_image/);
    assert.deepEqual(await readdir(input), []);
  } finally {await rm(directory, {recursive: true, force: true});}
});
