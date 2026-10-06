import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {validOcrLines} from './holdings-validation.ts';
import type {OcrLine} from '../contracts/holdings.ts';

const run = promisify(execFile);
/** Only local system helpers see image bytes. Remove the disposable input, also on failure. */
export async function recognizeImage(bytes: unknown, {tempDir, helperPath, platform = process.platform}: {tempDir: string; helperPath: string; platform?: NodeJS.Platform}): Promise<OcrLine[]> {
  if (!['darwin', 'win32'].includes(platform)) throw new Error('ocr_unsupported_platform');
  if (!(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error('ocr_invalid_image');
  const directory = await mkdtemp(path.join(tempDir, 'jingwei-ocr-'));
  try {
    const imagePath = path.join(directory, 'image');
    await writeFile(imagePath, bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes, {mode: 0o600});
    let output: string;
    try {
      const command = platform === 'darwin' ? helperPath : path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const args = platform === 'darwin' ? [imagePath] : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-ImagePath', imagePath];
      output = (await run(command, args, {encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true})).stdout;
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {stdout?: string};
      let code: unknown;
      try {code = JSON.parse((failure.stdout ?? '').replace(/^\uFEFF/, ''))?.error;} catch {}
      throw new Error(typeof code === 'string' && /^ocr_[a-z_]+$/.test(code) ? code : failure.code === 'ENOENT' ? 'ocr_helper_unavailable' : 'ocr_recognition_failed');
    }
    let lines: unknown;
    try {lines = JSON.parse(output.replace(/^\uFEFF/, ''));} catch {throw new Error('ocr_invalid_response');}
    if (!validOcrLines(lines)) throw new Error('ocr_invalid_response');
    return lines;
  } finally {await rm(directory, {recursive: true, force: true});}
}
