// Ten-year government bond yield: the bundled official history plus rows fetched later from the same
// ChinaBond query, kept beside the seed like the total-return series.
import {readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {storageConfiguration} from './storage.ts';
import {BOND_YIELD_SOURCE} from './government-bond-yield-seed.ts';
import {seedBondYields, type BondYieldPoint} from './erp.ts';

export const BOND_YIELD_QUERY = BOND_YIELD_SOURCE.source_url;
export type BondYieldHistory = {source_url: string; checked_at: string | null; points: BondYieldPoint[]};

/** Validates one official response: ISO dates, a numeric ten-year yield between 0 and 15 percent, no duplicates. */
export function parseBondYields(raw: unknown, endDate: string): BondYieldPoint[] {
  const list = (raw as {heList?: unknown})?.heList;
  if (!Array.isArray(list)) throw new Error('bond_yield_unsuccessful');
  const seen = new Set<string>();
  const points: BondYieldPoint[] = [];
  for (const row of list as Record<string, unknown>[]) {
    const date = row.workTime;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('bond_yield_date_invalid');
    if (date > endDate) throw new Error('bond_yield_future_date');
    if (seen.has(date)) throw new Error('bond_yield_duplicate_date');
    seen.add(date);
    // Holidays can come back with an empty field; those rows are skipped, never filled in.
    if (row.tenYear === '' || row.tenYear === null || row.tenYear === undefined) continue;
    const value = Number(row.tenYear);
    if (!Number.isFinite(value) || value <= 0 || value >= 15) throw new Error('bond_yield_value_invalid');
    points.push({date, yield_pct: value});
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeBondYields(base: BondYieldPoint[], update: BondYieldPoint[]): BondYieldPoint[] {
  return [...new Map([...base, ...update].map(p => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

const file = () => join(storageConfiguration().dataDir, 'bond-yield.json');

export async function currentBondYields(): Promise<BondYieldHistory> {
  const seed = {source_url: BOND_YIELD_QUERY, checked_at: BOND_YIELD_SOURCE.fetched_at as string | null, points: seedBondYields()};
  try {
    const stored = JSON.parse(await readFile(file(), 'utf8')) as BondYieldHistory;
    return {...seed, checked_at: stored.checked_at, points: mergeBondYields(seed.points, stored.points)};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return seed;
  }
}

/** Re-reads the last 30 days (to pick up revisions) through today, mainland date. */
export async function refreshBondYields(options: {now?: Date; fetcher?: typeof fetch} = {}): Promise<BondYieldHistory> {
  if (storageConfiguration().readOnly) throw new Error('storage_read_only');
  const current = await currentBondYields();
  const now = options.now ?? new Date();
  const end = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(`${current.points.at(-1)!.date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);
  const query = new URLSearchParams({startDate: from.toISOString().slice(0, 10), endDate: end, gjqx: '10', locale: 'cn_ZH', qxmc: '1'});
  const response = await (options.fetcher ?? fetch)(`${BOND_YIELD_QUERY}?${query}`, {signal: AbortSignal.timeout(20_000), headers: {'User-Agent': 'JingweiResearch/0.1'}});
  if (!response.ok) throw new Error(`bond_yield_http_${response.status}`);
  if (response.url && new URL(response.url).hostname !== 'yield.chinabond.com.cn') throw new Error('bond_yield_unexpected_redirect');
  const update = parseBondYields(JSON.parse(await response.text()), end);
  const after = {...current, checked_at: now.toISOString(), points: mergeBondYields(current.points, update)};
  const keep = new Date(`${seedBondYields().at(-1)!.date}T00:00:00Z`);
  keep.setUTCDate(keep.getUTCDate() - 30);
  const stored = {...after, points: after.points.filter(p => p.date >= keep.toISOString().slice(0, 10))};
  const temporary = `${file()}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(stored));
  await rename(temporary, file());
  return after;
}
