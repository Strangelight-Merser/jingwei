import {randomUUID} from 'node:crypto';
import type {Checkup, Exposure, FundMatch, HoldingRow, Holdings, OcrLine, ParsedHolding, ParseRequest, ParseResponse} from '../contracts/holdings.ts';
import {FUND_LIST_SEED} from './fund-list-seed.ts';
import {INDEX_CODES, VALUATION_INDEXES, type IndexCode} from './valuation-indexes.ts';
import type {RuleJudgmentResult} from './valuation-rule.ts';

export function normalizeHoldingName(name: string): string {return name.normalize('NFKC').trim().replace(/\s+/g, '');}
const keyOf = (name: string) => normalizeHoldingName(name).toUpperCase();
const moneyValue = (text: string): number | null => {
  const value = text.normalize('NFKC').trim().replace(/^[¥￥]\s*/, '').replace(/元$/, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replaceAll(',', ''));
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
};
const ignored = (text: string) => /(?:status bar|名称.*金额|日收益|持有收益|累计收益|收益明细|收益提醒|占比|百比|进阶理财|灵活取用|交易记录|全部持有|^全部|买一笔|反馈|投诉|本页面|法律文件|过往业绩|市场有风险|平台设计|^[：:]?基金$|^定投$)/i.test(text);
const looksLikeHolding = (text: string) => !ignored(text) && /(?:余额宝|零钱通|货币|混合|债券|指数|ETF|联接|股票|QDII|FOF|REIT)/i.test(text);

/** Names and the amount underneath share the left column; return rows in screenshot order. */
export function parseOcrLines(images: OcrLine[][]): ParsedHolding[] {
  const result: ParsedHolding[] = [], seen = new Set<string>();
  for (const image of images) {
    const lines = image.map(line => ({...line, text: normalizeHoldingName(line.text)})).sort((a, b) => a.y - b.y || a.x - b.x);
    const header = lines.find(line => /名称.*金额/.test(line.text));
    const left = header?.x ?? lines.find(line => looksLikeHolding(line.text))?.x ?? 0;
    const revenueX = lines.filter(line => /^(日收益|持有收益|累计收益)$/.test(line.text)).map(line => line.x);
    const columnEnd = revenueX.length ? Math.min(...revenueX) : left + 0.28;
    const names = lines.filter(line => line.x >= left - 0.04 && line.x < Math.min(columnEnd, left + 0.12) && looksLikeHolding(line.text));
    for (let i = 0; i < names.length; i++) {
      const line = names[i], key = keyOf(line.text);
      if (seen.has(key)) continue;
      seen.add(key);
      const end = Math.min(names[i + 1]?.y ?? 1, line.y + Math.max(0.09, line.h * 5));
      const candidate = lines.find(amount => amount.y > line.y + line.h * 0.5 && amount.y < end &&
        Math.abs(amount.x - line.x) <= Math.max(0.04, line.h * 2) && amount.x + amount.w <= columnEnd && moneyValue(amount.text) !== null);
      result.push({name: line.text, amount: candidate ? moneyValue(candidate.text) : null});
    }
  }
  return result;
}

/** One name/code and optional amount per line. Do not turn an unread amount into zero. */
export function parseText(text: string): ParsedHolding[] {
  const result: ParsedHolding[] = [], seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.normalize('NFKC').trim();
    if (!line) continue;
    const pair = /^(.*?)\s+([¥￥]?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?\s*元?)$/.exec(line);
    const name = normalizeHoldingName(pair?.[1] ?? line), key = keyOf(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({name, amount: pair ? moneyValue(pair[2]) : null});
  }
  return result;
}

// Cosmetic short-name differences; share class, feeder/ETF and enhancement are retained.
const matchKey = (name: string) => keyOf(name).replace(/\(QDII(?:-LOF)?\)|\(LOF\)|证券投资基金|灵活配置|发起式|发起|指数型|指数|混合/g, '');
const shareClass = (name: string) => /(?:^|[^A-Z])([A-Z])(?:\([^)]*\))?(?:人民币|美元(?:现汇|现钞)?)?$/.exec(keyOf(name))?.[1] ?? null;
function distance(a: string, b: string): number {
  let prior = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prior[j] + 1, prior[j - 1] + Number(a[i - 1] !== b[j - 1]));
    prior = next;
  }
  return prior[b.length];
}

/** Return only a unique match. Missing share classes and near ties remain unconfirmed. */
export function matchFund(name: string, funds: FundMatch[] = FUND_LIST_SEED.funds): FundMatch | null {
  const normalized = keyOf(name);
  if (/^\d{6}$/.test(normalized)) return funds.find(fund => fund.code === normalized) ?? null;
  if (/^(余额宝|零钱通)$/.test(normalized)) return null;
  const exact = funds.filter(fund => keyOf(fund.name) === normalized);
  if (exact.length) return exact.length === 1 ? {...exact[0]} : null;
  const key = matchKey(name), cls = shareClass(name);
  const candidates = funds.filter(fund => shareClass(fund.name) === cls &&
    (!/混合/.test(normalized) || /混合/.test(fund.type)) &&
    JSON.stringify(keyOf(fund.name).match(/[A-Z]*\d+/g)) === JSON.stringify(normalized.match(/[A-Z]*\d+/g)) &&
    ['ETF', '联接', '增强'].every(token => keyOf(fund.name).includes(token) === normalized.includes(token)));
  const same = candidates.filter(fund => matchKey(fund.name) === key);
  if (same.length) return same.length === 1 ? {...same[0]} : null;
  if (key.length < 8) return null;
  const ranked = candidates.filter(fund => matchKey(fund.name).slice(0, 3) === key.slice(0, 3))
    .map(fund => ({fund, score: distance(key, matchKey(fund.name)) / Math.max(key.length, matchKey(fund.name).length)}))
    .filter(candidate => candidate.score <= 0.12).sort((a, b) => a.score - b.score);
  return ranked[0] && (!ranked[1] || ranked[1].score - ranked[0].score >= 0.05) ? {...ranked[0].fund} : null;
}

/** The rule applies only to a plain tracker of one of the three covered indices. */
export function classify(name: string, fund: FundMatch | null = null): Pick<HoldingRow, 'tracked_index' | 'exposure' | 'covered_index'> {
  const text = keyOf(fund?.name ?? name), type = fund?.type ?? '';
  const make = (exposure: Exposure, tracked_index: string | null = null, covered_index: IndexCode | null = null) => ({exposure, tracked_index, covered_index});
  if (/余额宝|零钱通|货币/.test(text + type)) return make('money');
  if (/债券|纯债|短债|中短债|信用债|国债/.test(text + type)) return make('bond');
  if (/FOF|REIT|商品|黄金|原油/.test(text + type)) return make('other');
  if (/增强|多因子|优选|量化精选|策略/.test(text) && /300|500|50/.test(text)) return make(/QDII/.test(type) ? 'overseas_other' : 'a_active');
  const tracked = /纳斯达克(?:100|一百)/.test(text) ? '纳斯达克100'
    : /纳斯达克科技/.test(text) ? '纳斯达克科技市值加权'
    : /标普500/.test(text) ? '标普500'
    : /恒生科技/.test(text) ? '恒生科技'
    : /恒生(?!科技)|恒指/.test(text) ? '恒生指数'
    : /沪深300(?=指数|ETF|联接|交易型|\(|[A-Z]?$)/.test(text) ? '000300'
    : /中证500(?=指数|ETF|联接|交易型|\(|[A-Z]?$)/.test(text) ? '000905'
    : /上证50(?=指数|ETF|联接|交易型|\(|[A-Z]?$)/.test(text) ? '000016'
    : /中证1000/.test(text) ? '中证1000'
    : /创业板/.test(text) ? '创业板'
    : /科创50/.test(text) ? '科创50' : null;
  const indexLike = /指数|ETF|联接/.test(text + type);
  if (/纳斯达克|标普|美国|美股|道琼斯/.test(text)) return make('us_equity', indexLike ? tracked : null);
  if (/恒生|港股|香港/.test(text)) return make('hk_equity', indexLike ? tracked : null);
  if (/QDII|海外|全球|欧洲|德国|日本|越南|印度|新兴市场/.test(text + type)) return make('overseas_other', indexLike ? tracked : null);
  if (tracked && INDEX_CODES.includes(tracked as IndexCode) && indexLike) return make('a_broad', tracked, tracked as IndexCode);
  if (indexLike) return make('a_other_index', tracked);
  if (/混合|股票/.test(text + type)) return make('a_active');
  return make('other');
}

export function parseHoldings(request: ParseRequest, funds: FundMatch[] = FUND_LIST_SEED.funds): ParseResponse {
  const parsed = [...parseOcrLines(request.images ?? []), ...parseText(request.text ?? '')];
  const rows: HoldingRow[] = [], unread: string[] = [], seen = new Set<string>();
  for (const item of parsed) {
    if (seen.has(keyOf(item.name))) continue;
    seen.add(keyOf(item.name));
    if (item.amount === null) {unread.push(item.name); continue;}
    const fund = matchFund(item.name, funds);
    rows.push({id: randomUUID(), input_name: item.name, amount: item.amount, fund, ...classify(item.name, fund)});
  }
  return {rows, unread};
}

export const EXPOSURE_LABELS: Record<Exposure, string> = {
  a_broad: 'A股宽基指数', a_other_index: 'A股其他指数', a_active: 'A股主动基金', us_equity: '美国股票',
  hk_equity: '香港股票', overseas_other: '其他海外资产', bond: '债券', money: '货币', other: '其他或待确认',
};
export type HoldingJudgments = Partial<Record<IndexCode, NonNullable<RuleJudgmentResult>>>;
const sumAmounts = (rows: {amount: number}[]) => Number(rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2));

export function buildCheckup(holdings: Holdings, judgments: HoldingJudgments): Checkup {
  // Recompute from names/types: confirmation-table edits cannot extend rule coverage.
  const rows = holdings.rows.map(row => ({...row, ...classify(row.input_name, row.fund)}));
  const total = sumAmounts(rows);
  const by_exposure = (Object.keys(EXPOSURE_LABELS) as Exposure[]).map(exposure => {
    const amount = sumAmounts(rows.filter(row => row.exposure === exposure));
    return {exposure, label: EXPOSURE_LABELS[exposure], amount, share: total ? amount / total : 0};
  }).filter(group => group.amount > 0);
  const groups = new Map<string, HoldingRow[]>();
  for (const row of rows) if (row.tracked_index && row.amount > 0) groups.set(row.tracked_index, [...(groups.get(row.tracked_index) ?? []), row]);
  const duplicates = [...groups].filter(([, group]) => group.length > 1).map(([tracked_index, group]) => ({tracked_index, row_ids: group.map(row => row.id), amount: sumAmounts(group)}));
  const covered: Checkup['covered'] = [];
  for (const row of rows) {
    const index = row.covered_index, judgment = index && judgments[index];
    if (!index || !judgment || row.amount <= 0) continue;
    covered.push({row_id: row.id, index, index_name: VALUATION_INDEXES[index].name, band: judgment.band,
      band_label: judgment.judgment.label, new_money_title: judgment.judgment.new_money.title, held_title: judgment.judgment.held.title});
  }
  const coveredIds = new Set(covered.map(row => row.row_id));
  const uncoveredAmount = sumAmounts(rows.filter(row => !coveredIds.has(row.id)));
  const notes: string[] = [];
  if (rows.some(row => /QDII/.test(keyOf(row.input_name) + keyOf(row.fund?.name ?? '') + (row.fund?.type ?? '')))) notes.push('QDII持仓涉及境外资产与汇率变化。');
  if (rows.some(row => shareClass(row.fund?.name ?? row.input_name) === 'C')) notes.push('C类份额通常收取销售服务费，具体费率与赎回条件应查看基金文件。');
  if (rows.some(row => !row.fund && row.exposure !== 'money')) notes.push('部分名称未唯一匹配公开基金列表，请确认名称与份额。');
  if (uncoveredAmount > 0) notes.push('估值规则仅覆盖沪深300、中证500、上证50跟踪基金；其余持仓没有规则判断。');
  return {total, by_exposure, duplicates, covered, uncovered_share: total ? uncoveredAmount / total : 0, notes};
}
