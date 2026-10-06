import type {FundMatch} from '../contracts/holdings.ts';
import {FUND_LIST_SEED} from './fund-list-seed.ts';

export const FUND_LIST_URL = 'https://fund.eastmoney.com/js/fundcode_search.js';
export type FundList = {source_url: string; fetched_at: string; funds: FundMatch[]};

/** Read the public data assignment as JSON; never execute downloaded JavaScript. */
export function parseFundList(source: string): FundMatch[] {
  const assignment = /^\s*var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$/.exec(source);
  if (!assignment) throw new Error('fund_list_invalid');
  const rows: unknown = JSON.parse(assignment[1]);
  if (!Array.isArray(rows) || !rows.length) throw new Error('fund_list_invalid');
  const seen = new Set<string>();
  return rows.map(row => {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !/^\d{6}$/.test(row[0]) ||
      typeof row[2] !== 'string' || !row[2].trim() || typeof row[3] !== 'string' || seen.has(row[0])) {
      throw new Error('fund_list_invalid');
    }
    seen.add(row[0]);
    return {code: row[0], name: row[2], type: row[3]};
  });
}

export function seedFundList(): FundList {return {...FUND_LIST_SEED, funds: [...FUND_LIST_SEED.funds]};}

/** The request contains only the public URL, never an image, name or holding. */
export async function refreshFundList(current: FundList, {fetcher = fetch, now = new Date()}: {fetcher?: typeof fetch; now?: Date} = {}): Promise<FundList> {
  const response = await fetcher(FUND_LIST_URL, {signal: AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`fund_list_http_${response.status}`);
  if (response.url && new URL(response.url).hostname !== 'fund.eastmoney.com') throw new Error('fund_list_unexpected_redirect');
  const incoming = parseFundList(await response.text());
  const byCode = new Map(current.funds.map(fund => [fund.code, fund]));
  for (const fund of incoming) byCode.set(fund.code, fund);
  return {source_url: FUND_LIST_URL, fetched_at: now.toISOString(), funds: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))};
}
