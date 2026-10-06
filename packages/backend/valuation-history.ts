// CSI 300 rolling PE (TTM) history from the official CSI index site.
// The bundled seed keeps the judgment available offline; a refresh only appends newer official rows.
import {CSI300_PE_SEED} from './csi300-pe-seed.ts';

export const PE_HISTORY_URL = 'https://www.csindex.com.cn/csindex-home/perf/indexCsiDsPe';
export const PE_HISTORY_PAGE = 'https://www.csindex.com.cn/#/indices/family/detail?indexCode=000300';

export type ValuationPoint = {date: string; pe_ttm: number};
export type ValuationHistory = {
  index_code: '000300';
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
export function parsePeHistory(raw: unknown, endDate: string): ValuationPoint[] {
  const body = raw as {code?: unknown; data?: unknown};
  if (!body || body.code !== '200' || !Array.isArray(body.data)) throw new Error('pe_history_unsuccessful');
  const seen = new Set<string>();
  const points = body.data.map((row: Record<string, unknown>) => {
    if (row.indexName !== '沪深300' || row.indexNameEn !== 'CSI 300') throw new Error('pe_history_identity_mismatch');
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

export function seedHistory(): ValuationHistory {
  const points = CSI300_PE_SEED.split(',').map(item => {
    const [d, v] = item.split(':');
    return {date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, pe_ttm: Number(v)};
  });
  return {index_code: '000300', source_url: PE_HISTORY_URL, checked_at: null, points};
}

const compactDate = (iso: string) => iso.replaceAll('-', '');
const mainlandToday = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** Fetches official rows from `start` to today (mainland date). */
export async function fetchPeHistory(start: string, options: {now?: Date; fetcher?: typeof fetch} = {}): Promise<ValuationPoint[]> {
  const end = mainlandToday(options.now ?? new Date());
  const query = new URLSearchParams({indexCode: '000300', startDate: compactDate(start), endDate: compactDate(end)});
  const response = await (options.fetcher ?? fetch)(`${PE_HISTORY_URL}?${query}`, {
    signal: AbortSignal.timeout(20_000),
    headers: {'User-Agent': 'JingweiResearch/0.1'},
  });
  if (!response.ok) throw new Error(`pe_history_http_${response.status}`);
  if (response.url && new URL(response.url).hostname !== 'www.csindex.com.cn') throw new Error('pe_history_unexpected_redirect');
  return parsePeHistory(JSON.parse(await response.text()), end);
}

/** Appends recent official rows to an existing history (re-reading 30 days to pick up revisions). */
export async function refreshPeHistory(current: ValuationHistory, options: {now?: Date; fetcher?: typeof fetch} = {}): Promise<ValuationHistory> {
  const last = current.points.at(-1)?.date ?? '2011-01-01';
  const from = new Date(`${last}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);
  const update = await fetchPeHistory(from.toISOString().slice(0, 10), options);
  const now = options.now ?? new Date();
  return {...current, checked_at: now.toISOString(), points: mergePeHistory(current.points, update)};
}
