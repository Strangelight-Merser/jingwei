import {readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {storageConfiguration} from './storage.ts';
import {TOTAL_RETURN_SEED as CSI300_SEED, TOTAL_RETURN_SOURCE as CSI300_SOURCE} from './000300-total-return-seed.ts';
import {TOTAL_RETURN_SEED as CSI500_SEED, TOTAL_RETURN_SOURCE as CSI500_SOURCE} from './000905-total-return-seed.ts';
import {TOTAL_RETURN_SEED as SSE50_SEED, TOTAL_RETURN_SOURCE as SSE50_SOURCE} from './000016-total-return-seed.ts';
import {fetchTotalReturnHistory, OUTCOME_INDICES, TOTAL_RETURN_URL, type OutcomeIndex, type TotalReturnPoint} from './total-return-source.ts';

const SEEDS = {'000300': {data: CSI300_SEED, source: CSI300_SOURCE}, '000905': {data: CSI500_SEED, source: CSI500_SOURCE}, '000016': {data: SSE50_SEED, source: SSE50_SOURCE}};
export type TotalReturnHistory = {index_code: OutcomeIndex; total_return_code: string; source_url: string; checked_at: string | null; points: TotalReturnPoint[]};

export function seedTotalReturnHistory(index: OutcomeIndex): TotalReturnHistory {
  const points = SEEDS[index].data.split(',').map(item => {
    const [d, value] = item.split(':');
    return {date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, close: Number(value)};
  });
  return {index_code: index, total_return_code: OUTCOME_INDICES[index].code, source_url: TOTAL_RETURN_URL, checked_at: SEEDS[index].source.fetched_at, points};
}

export function mergeTotalReturnHistory(base: TotalReturnPoint[], update: TotalReturnPoint[]): TotalReturnPoint[] {
  return [...new Map([...base, ...update].map(p => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Store only recent revisions and new rows; the historical seeds remain separate from PE. */
export async function currentTotalReturnHistory(index: OutcomeIndex): Promise<TotalReturnHistory> {
  const seed = seedTotalReturnHistory(index);
  try {
    const stored = JSON.parse(await readFile(join(storageConfiguration().dataDir, `${index}-total-return.json`), 'utf8')) as TotalReturnHistory;
    return {...seed, checked_at: stored.checked_at, points: mergeTotalReturnHistory(seed.points, stored.points)};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return seed;
  }
}

export async function refreshTotalReturnHistory(index: OutcomeIndex, options: {now?: Date; fetcher?: typeof fetch} = {}): Promise<TotalReturnHistory> {
  const config = storageConfiguration();
  if (config.readOnly) throw new Error('storage_read_only');
  const current = await currentTotalReturnHistory(index);
  const now = options.now ?? new Date();
  const end = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(current.points.at(-1)!.date);
  from.setUTCDate(from.getUTCDate() - 30);
  // A non-data-day start can make CSI copy the previous close onto the requested date.
  const start = current.points.findLast(p => p.date <= from.toISOString().slice(0, 10))!.date;
  const update = await fetchTotalReturnHistory(index, start, end, options.fetcher);
  const after = {...current, checked_at: now.toISOString(), points: mergeTotalReturnHistory(current.points, update)};
  const keep = new Date(seedTotalReturnHistory(index).points.at(-1)!.date);
  keep.setUTCDate(keep.getUTCDate() - 30);
  const stored = {...after, points: after.points.filter(p => p.date >= keep.toISOString().slice(0, 10))};
  const file = join(config.dataDir, `${index}-total-return.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(stored));
  await rename(temporary, file);
  return after;
}
