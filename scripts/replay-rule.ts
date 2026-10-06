import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CSI300_PE_SEED, CSI500_PE_SEED, SSE50_PE_SEED} from '../packages/backend/csi300-pe-seed.ts';

/**
 * Offline replay of the public rule in README.md / CODEX_PLAN.md (background).
 * Only the seed is shared; no production rule/history helpers are used.
 *
 * - Use the trailing ten calendar years, including both the cutoff date and today.
 * - Begin after five calendar years; before ten years, use all available history.
 * - exact = 100 × count(PE <= today's PE) / window rows. Classify on this
 *   unrounded percentile (main 6498f1f); percentile rounds to 0.1 for display only.
 * - Bands: [0, 30), [30, 70), [70, 90), [90, 100].
 * - Establish the first judgment immediately. Thereafter a different band must
 *   hold for five consecutive data rows; returning to the current band or entering
 *   another candidate band resets the count. Do not infer missing trading days.
 *
 * changes includes the initial from=null record, matching the API; the printed
 * change count excludes that initialization. All bundled dates are historical
 * recomputations, not judgments published at the time or investment performance.
 * daily includes warm-up rows with blank percentile/bands, and distinguishes the
 * day's raw_band from the confirmed band. Records are in ascending date order.
 * Run: npm run replay:rule -- --index 000905 (default: 000300).
 * Files go to this worktree's exports/rule-replay/<index>/.
 */
export type ReplayBand = 'low' | 'mid' | 'high' | 'extreme';
export type ReplayPoint = {date: string; pe_ttm: number};
export type ReplayDay = ReplayPoint & {
  percentile: number | null;
  exact: number | null;
  raw_band: ReplayBand | null;
  band: ReplayBand | null;
  window_start: string | null;
  full_window: boolean;
};
export type ReplayChange = ReplayPoint & {
  from: ReplayBand | null;
  to: ReplayBand;
  percentile: number;
  full_window: boolean;
};

const SEEDS = {'000300': CSI300_PE_SEED, '000905': CSI500_PE_SEED, '000016': SSE50_PE_SEED};
type ReplayIndex = keyof typeof SEEDS;

export function replaySeed(index: ReplayIndex = '000300'): ReplayPoint[] {
  return SEEDS[index].split(',').map(row => {
    const [date, pe] = row.split(':');
    return {date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, pe_ttm: Number(pe)};
  });
}

function calendarCutoff(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year - years, month - 1, day)).toISOString().slice(0, 10);
}

function classify(percentile: number): ReplayBand {
  if (percentile < 30) return 'low';
  if (percentile < 70) return 'mid';
  if (percentile < 90) return 'high';
  return 'extreme';
}

export function replayRule(points: ReplayPoint[] = replaySeed()) {
  const daily: ReplayDay[] = [];
  const changes: ReplayChange[] = [];
  let confirmed: ReplayBand | null = null;
  const recentBands: ReplayBand[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (calendarCutoff(point.date, 5) < points[0].date) {
      daily.push({...point, percentile: null, exact: null, raw_band: null, band: null, window_start: null, full_window: false});
      continue;
    }

    const cutoff = calendarCutoff(point.date, 10);
    // Rebuild each window independently, rather than reusing the production
    // implementation's moving start index or percentile/confirmation helpers.
    const window = points.slice(0, i + 1).filter(row => row.date >= cutoff);
    const atOrBelow = window.filter(row => row.pe_ttm <= point.pe_ttm).length;
    const exact = atOrBelow / window.length * 100;
    const percentile = Math.round(exact * 10) / 10;
    const rawBand = classify(exact);
    const fullWindow = cutoff >= points[0].date;
    recentBands.push(rawBand);
    if (recentBands.length > 5) recentBands.shift();

    if (confirmed === null || (rawBand !== confirmed && recentBands.length === 5 && recentBands.every(band => band === rawBand))) {
      changes.push({...point, from: confirmed, to: rawBand, percentile, full_window: fullWindow});
      confirmed = rawBand;
    }
    daily.push({...point, percentile, exact, raw_band: rawBand, band: confirmed, window_start: window[0].date, full_window: fullWindow});
  }

  return {daily, changes, current: daily.findLast(row => row.percentile !== null) ?? null};
}

export type ReplayResult = ReturnType<typeof replayRule>;

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--index' || !Object.hasOwn(SEEDS, args[1]))) {
    console.error('用法：npm run replay:rule -- --index 000300|000905|000016');
    process.exit(1);
  }
  const index = (args[1] ?? '000300') as ReplayIndex;
  const replay = replayRule(replaySeed(index));
  const destination = new URL(`../exports/rule-replay/${index}/`, import.meta.url);
  await mkdir(destination, {recursive: true});
  const changesCsv = [
    'date,from,to,pe_ttm,percentile,full_window',
    ...replay.changes.map(row => [row.date, row.from ?? '', row.to, row.pe_ttm, row.percentile, row.full_window].join(',')),
  ].join('\n') + '\n';
  const dailyCsv = [
    'date,pe_ttm,percentile,exact,raw_band,band,window_start,full_window',
    ...replay.daily.map(row => [row.date, row.pe_ttm, row.percentile ?? '', row.exact ?? '', row.raw_band ?? '', row.band ?? '', row.window_start ?? '', row.full_window].join(',')),
  ].join('\n') + '\n';
  await writeFile(new URL('changes.csv', destination), changesCsv);
  await writeFile(new URL('changes.json', destination), JSON.stringify(replay.changes, null, 2) + '\n');
  await writeFile(new URL('daily.csv', destination), dailyCsv);

  const labels = {low: '偏低区', mid: '中间区', high: '偏高区', extreme: '高位区'};
  console.log(`指数：${index} · ${{'000300':'沪深300','000905':'中证500','000016':'上证50'}[index]}`);
  console.log(`数据日数：${replay.daily.length}`);
  console.log(`数据起止：${replay.daily[0].date} 至 ${replay.daily.at(-1)!.date}`);
  console.log(`可计算分位：${replay.current ? replay.daily.find(row => row.percentile !== null)!.date : '无'} 起，共 ${replay.daily.filter(row => row.percentile !== null).length} 个数据日`);
  console.log(`改判次数：${replay.changes.filter(row => row.from !== null).length}（导出 ${replay.changes.length} 条记录，含首次初始化）`);
  console.log(`当前：${replay.current!.date}，PE ${replay.current!.pe_ttm}，${labels[replay.current!.band!]}（${replay.current!.band}），第 ${replay.current!.percentile} 百分位`);
  console.log(`导出目录：${fileURLToPath(destination)}`);
}
