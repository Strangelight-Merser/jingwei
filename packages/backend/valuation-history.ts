// Rolling PE (TTM) histories: official CSI daily rows, or 蛋卷基金's weekly rows for indices CSI does not
// publish. The bundled seed keeps the judgment available offline; a refresh only appends newer rows.
import {CSI300_PE_SEED, CSI500_PE_SEED, SSE50_PE_SEED} from './csi300-pe-seed.ts';
import {EXTRA_PE_SEEDS} from './index-pe-seeds.ts';
import {VALUATION_INDEXES, sourceOf, type IndexCode} from './valuation-indexes.ts';

export const PE_HISTORY_URL = 'https://www.csindex.com.cn/csindex-home/perf/indexCsiDsPe';
export const DANJUAN_PE_URL = 'https://danjuanfunds.com/djapi/index_eva/pe_history/';
export const historyUrl = (index: IndexCode) => sourceOf(index) === 'csi' ? PE_HISTORY_URL : `${DANJUAN_PE_URL}${VALUATION_INDEXES[index].source_code}`;
export const PE_HISTORY_PAGE = 'https://www.csindex.com.cn/#/indices/family/detail?indexCode=000300';

export type ValuationPoint = {date: string; pe_ttm: number};
export type ValuationHistory = {
  index_code: IndexCode;
  source_url: string;
  checked_at: string | null;
  points: ValuationPoint[];
};

function isoDate(value: unknown): string {
  if (typeof value !== 'string') throw new Error('pe_history_date_missing');
  const compact = value.replaceAll('-', '');
  if (!/^\d{8}$/.test(compact)) throw new Error('pe_history_date_invalid');
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6)}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('pe_history_date_invalid');
  return iso;
}

/** Validates one official response; identity, dates and positive PE are all required. */
export function parsePeHistory(raw: unknown, endDate: string, index: IndexCode = '000300'): ValuationPoint[] {
  const body = raw as {code?: unknown; data?: unknown};
  if (!body || body.code !== '200' || !Array.isArray(body.data)) throw new Error('pe_history_unsuccessful');
  const seen = new Set<string>();
  const points = body.data.map((row: Record<string, unknown>) => {
    const identity = VALUATION_INDEXES[index];
    if (row.indexName !== identity.name || row.indexNameEn !== identity.name_en) throw new Error('pe_history_identity_mismatch');
    const date = isoDate(row.tradeDate);
    if (date > endDate) throw new Error('pe_history_future_date');
    if (seen.has(date)) throw new Error('pe_history_duplicate_date');
    seen.add(date);
    if (typeof row.peg !== 'number' || !Number.isFinite(row.peg) || row.peg <= 0) throw new Error('pe_history_value_invalid');
    return {date, pe_ttm: row.peg};
  });
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Newer official rows replace older ones on the same date; the result stays date-ordered. */
export function mergePeHistory(base: ValuationPoint[], update: ValuationPoint[]): ValuationPoint[] {
  const byDate = new Map(base.map(p => [p.date, p]));
  for (const p of update) byDate.set(p.date, p);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const SEEDS: Record<IndexCode, string> = {'000300': CSI300_PE_SEED, '000905': CSI500_PE_SEED, '000016': SSE50_PE_SEED,
  ...Object.fromEntries(Object.entries(EXTRA_PE_SEEDS).map(([code, seed]) => [code, seed.data]))} as Record<IndexCode, string>;
const seedCache = new Map<IndexCode, ValuationPoint[]>();

export function seedHistory(index: IndexCode = '000300'): ValuationHistory {
  let points = seedCache.get(index);
  if (!points) {
    points = SEEDS[index].split(',').map(item => {
      const [d, v] = item.split(':');
      return {date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, pe_ttm: Number(v)};
    });
    seedCache.set(index, points);
  }
  return {index_code: index, source_url: historyUrl(index), checked_at: null, points: [...points]};
}

/** Validates one 蛋卷 response: ascending timestamps, positive PE, dated by the mainland calendar day. */
export function parseDanjuanHistory(raw: unknown, endDate: string): ValuationPoint[] {
  const rows = (raw as {result_code?: unknown; data?: {index_eva_pe_growths?: unknown}})?.data?.index_eva_pe_growths;
  if ((raw as {result_code?: unknown})?.result_code !== 0 || !Array.isArray(rows) || !rows.length) throw new Error('pe_history_unsuccessful');
  const seen = new Set<string>();
  return rows.map((row: Record<string, unknown>) => {
    if (typeof row.ts !== 'number' || !Number.isFinite(row.ts)) throw new Error('pe_history_date_missing');
    const date = new Date(row.ts + 8 * 3600_000).toISOString().slice(0, 10);
    if (date > endDate) throw new Error('pe_history_future_date');
    if (seen.has(date)) throw new Error('pe_history_duplicate_date');
    seen.add(date);
    if (typeof row.pe !== 'number' || !Number.isFinite(row.pe) || row.pe <= 0) throw new Error('pe_history_value_invalid');
    return {date, pe_ttm: Math.round(row.pe * 100) / 100};
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** 蛋卷's weekly rows; `span` is its own range parameter: 3y, 5y or all (1y and 10y return no data). */
export async function fetchDanjuanHistory(index: IndexCode, options: {span?: string; now?: Date; fetcher?: typeof fetch} = {}): Promise<ValuationPoint[]> {
  const end = mainlandToday(options.now ?? new Date());
  const response = await (options.fetcher ?? fetch)(`${historyUrl(index)}?day=${options.span ?? '3y'}`, {
    signal: AbortSignal.timeout(20_000),
    headers: {'User-Agent': 'Mozilla/5.0 JingweiResearch/0.1'},
  });
  if (!response.ok) throw new Error(`pe_history_http_${response.status}`);
  if (response.url && new URL(response.url).hostname !== 'danjuanfunds.com') throw new Error('pe_history_unexpected_redirect');
  return parseDanjuanHistory(JSON.parse(await response.text()), end);
}

const compactDate = (iso: string) => iso.replaceAll('-', '');
const mainlandToday = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** Fetches official rows from `start` to today (mainland date). */
export async function fetchPeHistory(start: string, options: {index?: IndexCode; now?: Date; fetcher?: typeof fetch} = {}): Promise<ValuationPoint[]> {
  const end = mainlandToday(options.now ?? new Date());
  const index = options.index ?? '000300';
  const query = new URLSearchParams({indexCode: index, startDate: compactDate(start), endDate: compactDate(end)});
  const response = await (options.fetcher ?? fetch)(`${PE_HISTORY_URL}?${query}`, {
    signal: AbortSignal.timeout(20_000),
    headers: {'User-Agent': 'JingweiResearch/0.1'},
  });
  if (!response.ok) throw new Error(`pe_history_http_${response.status}`);
  if (response.url && new URL(response.url).hostname !== 'www.csindex.com.cn') throw new Error('pe_history_unexpected_redirect');
  return parsePeHistory(JSON.parse(await response.text()), end, index);
}

/** Appends recent official rows to an existing history (re-reading 30 days to pick up revisions). */
export async function refreshPeHistory(current: ValuationHistory, options: {now?: Date; fetcher?: typeof fetch} = {}): Promise<ValuationHistory> {
  if (sourceOf(current.index_code) === 'danjuan') {
    const update = await fetchDanjuanHistory(current.index_code, options);
    return {...current, checked_at: (options.now ?? new Date()).toISOString(), points: mergePeHistory(current.points, update)};
  }
  const last = current.points.at(-1)?.date ?? '2011-01-01';
  const from = new Date(`${last}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);
  // The endpoint prepends a copy at an arbitrary start date. Start on a known
  // historical data date so weekend/holiday anchors never become new data rows.
  const start = current.points.find(p => p.date >= from.toISOString().slice(0, 10))?.date ?? last;
  const update = await fetchPeHistory(start, {...options, index: current.index_code});
  const now = options.now ?? new Date();
  return {...current, checked_at: now.toISOString(), points: mergePeHistory(current.points, update)};
}
