// Copied from AIHOT packages/backend/src/lib/ids.ts, fixed commit 035f7b7.
// Copyright (c) 2026 数字生命卡兹克. MIT: see LICENSE-AIHOT.
import { createHash } from 'node:crypto';
export function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function stableJson(value: unknown): string {
 return JSON.stringify(value, (_key, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
   return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return v;
 });
}
