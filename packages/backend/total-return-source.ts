export const TOTAL_RETURN_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';
export const OUTCOME_INDICES = {
  '000300': {name: '沪深300', code: 'H00300', name_cn: '沪深300全收益指数', name_en: 'CSI 300 Total Return Index'},
  '000905': {name: '中证500', code: 'H00905', name_cn: '中证小盘500全收益指数', name_en: 'CSI Smallcap 500 Total Return Index'},
  '000016': {name: '上证50', code: 'H00016', name_cn: '上证50全收益指数', name_en: 'SSE 50 Total Return Index'},
} as const;
export type OutcomeIndex = keyof typeof OUTCOME_INDICES;
export type TotalReturnPoint = {date: string; close: number};

function isoDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) throw new Error('total_return_date_invalid');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  const time = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== iso) throw new Error('total_return_date_invalid');
  return iso;
}

/** The full name and code distinguish the dividend-inclusive series from the price index. */
export function parseTotalReturnHistory(raw: unknown, index: OutcomeIndex, start: string, end: string): TotalReturnPoint[] {
  const body = raw as {code?: unknown; data?: unknown};
  if (!body || body.code !== '200' || !Array.isArray(body.data)) throw new Error('total_return_unsuccessful');
  const expected = OUTCOME_INDICES[index];
  const seen = new Set<string>();
  return body.data.map((row: Record<string, unknown>) => {
    if (row.indexCode !== expected.code || row.indexNameCnAll !== expected.name_cn || row.indexNameEnAll !== expected.name_en) throw new Error('total_return_identity_mismatch');
    const date = isoDate(row.tradeDate);
    if (date < start || date > end) throw new Error('total_return_date_outside_request');
    if (seen.has(date)) throw new Error('total_return_duplicate_date');
    seen.add(date);
    if (typeof row.close !== 'number' || !Number.isFinite(row.close) || row.close <= 0) throw new Error('total_return_close_invalid');
    return {date, close: row.close};
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** CSI rejects very long performance requests, so every request stays within one calendar year. */
export async function fetchTotalReturnHistory(index: OutcomeIndex, start: string, end: string, fetcher: typeof fetch = fetch): Promise<TotalReturnPoint[]> {
  const points: TotalReturnPoint[] = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
    const from = start > `${year}-01-01` ? start : `${year}-01-01`;
    const to = end < `${year}-12-31` ? end : `${year}-12-31`;
    const query = new URLSearchParams({indexCode: OUTCOME_INDICES[index].code, startDate: from.replaceAll('-', ''), endDate: to.replaceAll('-', '')});
    const response = await fetcher(`${TOTAL_RETURN_URL}?${query}`, {signal: AbortSignal.timeout(20_000), headers: {'User-Agent': 'JingweiResearch/0.1'}});
    if (!response.ok) throw new Error(`total_return_http_${response.status}`);
    if (response.url && new URL(response.url).hostname !== 'www.csindex.com.cn') throw new Error('total_return_unexpected_redirect');
    points.push(...parseTotalReturnHistory(await response.json(), index, from, to));
  }
  return points;
}
