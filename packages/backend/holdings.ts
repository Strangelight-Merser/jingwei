import {randomUUID} from 'node:crypto';
import type {Checkup, Exposure, FundMatch, HoldingRow, Holdings, OcrLine, ParsedHolding, ParseRequest, ParseResponse} from '../contracts/holdings.ts';
import {FUND_LIST_SEED} from './fund-list-seed.ts';
import {INDEX_CODES, VALUATION_INDEXES, isIndexCode, type IndexCode} from './valuation-indexes.ts';
import type {RuleJudgmentResult} from './valuation-rule.ts';

export function normalizeHoldingName(name: string): string {return name.normalize('NFKC').trim().replace(/\s+/g, '');}
const keyOf = (name: string) => normalizeHoldingName(name).toUpperCase();
const moneyValue = (text: string, scale = 1): number | null => {
  const value = text.normalize('NFKC').trim().replace(/^[¥￥]\s*/, '');
  const match = /^((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)\s*(万)?\s*元?$/.exec(value);
  if (!match) return null;
  if (match[2]) scale = 10_000;
  if ((match[1].split('.')[1]?.length ?? 0) > (scale === 10_000 ? 6 : 2)) return null;
  const amount = Number((Number(match[1].replaceAll(',', '')) * scale).toFixed(2));
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
};
const ignored = (text: string) => /(?:status bar|名称.*金额|^基金(?:名称|代码)|日收益|持有收益|累计收益|收益明细|收益提醒|占比|百比|进阶理财|灵活取用|交易记录|全部持有|^全部|买一笔|反馈|投诉|本页面|法律文件|过往业绩|市场有风险|平台设计|^[：:]?基金$|^定投$)/i.test(text);
let publicNames: Set<string> | null = null;
const isPublicName = (text: string) => (publicNames ??= new Set(FUND_LIST_SEED.funds.map(fund => keyOf(fund.name)))).has(keyOf(text));
const looksLikeHolding = (text: string) => !ignored(text) && (/(?:余额宝|零钱通|货币|混合|债券|指数|增强|量化|ETF|LOF|联接|股票|QDII|FOF|REIT)/i.test(text) || isPublicName(text));

type AmountLabel = {line: OcrLine; scale: number; value: string; kind: 'amount' | 'other'};
function amountLabel(line: OcrLine): AmountLabel | null {
  const text = line.text.replace(/\s+/g, '');
  if (/^名称[\/／]金额/.test(text)) return {line, scale: 1, value: '', kind: 'amount'};
  const match = /^(?:持有金额|最新市值|持有市值|资产金额|市值|金额)(?:\((?:人民币)?(万?元)\))?[:：]?(.*)$/.exec(text);
  if (match) {
    // Keep whitespace between numbers: two amounts must never become one number.
    const value = line.text.replace(/^(?:持有金额|最新市值|持有市值|资产金额|市值|金额)\s*(?:\((?:人民币)?万?元\))?\s*[:：]?\s*/, '');
    return {line, scale: match[1] === '万元' ? 10_000 : 1, value, kind: 'amount'};
  }
  return /^(?:(?:昨日|今日|当日|日|持有|累计|总)?收益(?:率)?|持有份额|份额|最新净值|单位净值|成本)(?:\([^)]*\))?[:：]?$/.test(text)
    ? {line, scale: 1, value: '', kind: 'other'} : null;
}

/** A six-digit fund code written with the name ("… 007339", "(007339)", "代码：007339"). */
function codeIn(text: string): string | undefined {
  return /(?:^|[\s(（:：A-Z])(\d{6})\)?$/.exec(text.normalize('NFKC').trim())?.[1];
}

function ocrHoldingName(text: string): string {
  return normalizeHoldingName(text.replace(/\s+\d{6}$/, '')
    .replace(/\s*\((?:基金)?(?:代码[:：]?)?\d{6}\)$/, '')
    .replace(/\s*(?:基金)?代码[:：]?\s*\d{6}$/, '').replace(/(?<=[A-Z])\d{6}$/, ''));
}

/** Use labels/columns first, then an unambiguous nearby amount; preserve screenshot order. */
export function parseOcrLines(images: OcrLine[][]): ParsedHolding[] {
  const result: ParsedHolding[] = [], seen = new Set<string>();
  for (const image of images) {
    const lines = image.map(line => ({...line, text: line.text.normalize('NFKC').trim()})).sort((a, b) => a.y - b.y || a.x - b.x);
    const labels = lines.map(amountLabel).filter((label): label is AmountLabel => label !== null);
    // A name without a type word still counts when a fund code sits right under it.
    const codeBelow = (line: OcrLine) => lines.some(other => /^\d{6}$/.test(other.text) && other.y > line.y && other.y <= line.y + line.h * 2.5 && Math.abs(other.x - line.x) <= 0.03);
    const names = lines.filter(line => looksLikeHolding(line.text) || (/\p{Script=Han}{2}/u.test(line.text) && !ignored(line.text) && !amountLabel(line) && codeBelow(line)));
    for (let i = 0; i < names.length; i++) {
      const line = names[i], name = ocrHoldingName(line.text), key = keyOf(name);
      if (seen.has(key)) continue;
      // The code is usually read reliably even when a character in the name is not (沪 → 泸).
      const codeLine = lines.find(other => other !== line && /^\d{6}$/.test(other.text) && other.y >= line.y - line.h * 0.5 && other.y <= line.y + line.h * 2.5 && other.x <= line.x + line.w);
      const code = codeIn(line.text) ?? codeLine?.text;
      seen.add(key);
      const end = Math.min(names[i + 1]?.y ?? 1, line.y + Math.max(0.16, line.h * 8));
      const inRow = (other: OcrLine) => other.y >= line.y - Math.min(line.h, other.h) * 0.5 && other.y < end;
      const inline = labels.filter(label => label.kind === 'amount' && label.value && inRow(label.line));
      if (inline.length) {
        result.push({name, amount: inline.length === 1 ? moneyValue(inline[0].value, inline[0].scale) : null, ...(code ? {code} : {})});
        continue;
      }
      const values: (number | null)[] = [];
      for (const value of lines) {
        if (value === line || !inRow(value) || !/^[¥￥]?\s*[\d,.\s]+(?:万)?\s*元?$/.test(value.text)) continue;
        // The closest preceding header row owns the columns, including positive profits.
        const preceding = labels.filter(label => !label.value && label.line.y <= value.y + value.h * 0.5);
        const latestY = Math.max(...preceding.map(label => label.line.y));
        const headerRow = preceding.filter(label => label.line.y >= latestY - Math.max(0.012, label.line.h));
        const center = value.x + value.w / 2;
        const ranked = headerRow.map(label => ({label, gap: Math.abs(center - (label.line.x + label.line.w / 2))})).sort((a, b) => a.gap - b.gap);
        const owner = ranked[0];
        const sameRow = Math.abs(value.y - line.y) <= Math.min(line.h, value.h) * 0.5;
        if (/^\d{6}$/.test(value.text) && (!owner || owner.label.line.y < line.y)) continue;
        if (owner) {
          if (ranked[1] && ranked[1].gap - owner.gap < 0.025) {
            if (ranked.slice(0, 2).some(item => item.label.kind === 'amount')) values.push(null);
            continue;
          }
          if (owner.label.kind !== 'amount' || owner.gap > Math.max(0.12, (owner.label.line.w + value.w) / 2)) continue;
          values.push(moneyValue(value.text, owner.label.scale));
        } else {
          if (sameRow || Math.abs(value.x - line.x) <= Math.max(0.04, line.h * 2)) values.push(moneyValue(value.text));
        }
      }
      result.push({name, amount: values.length === 1 ? values[0] : null, ...(code ? {code} : {})});
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
    const pair = /^(.*?)\s+([¥￥]?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?\s*万?\s*元?)$/.exec(line);
    const head = pair?.[1] ?? line, lead = /^(\d{6})\s+(?=\S)/.exec(head);
    // "007339 易方达…" or "易方达… 007339": the code is kept apart from the name.
    const name = lead ? normalizeHoldingName(head.slice(lead[0].length)) : ocrHoldingName(head), key = keyOf(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const code = lead?.[1] ?? codeIn(head);
    result.push({name, amount: pair ? moneyValue(pair[2]) : null, ...(code ? {code} : {})});
  }
  return result;
}

const shareClass = (name: string) => {
  const text = keyOf(name).replace(/\((?:QDII(?:-LOF)?|LOF)\)/g, '').replace(/\(?(?:人民币|美元(?:现汇|现钞)?|港币|欧元)\)?$/, '');
  return /ETF$/.test(text) ? null : /(?:\(([A-Z])(?:类(?:份额)?)?\)|([A-Z])(?:类(?:份额)?)?)$/.exec(text)?.slice(1).find(Boolean) ?? null;
};
const managers = ['景顺长城', '华泰柏瑞', '易方达', '圆信永丰', '弘毅远方', '汇丰晋信', '工银瑞信', '建信', '安信', '国泰', '南方', '英大', '华夏', '富国', '广发', '嘉实', '天弘', '博时', '汇添富', '招商', '鹏华', '银华', '华安', '中欧', '华宝', '中银', '大成', '交银', '兴全', '兴证全球'];
function matchProfile(name: string) {
  const normalized = keyOf(name).replace(/[【\[]/g, '(').replace(/[】\]]/g, ')');
  // The full names and short names refer to the same targets, verified in the fund documents:
  // https://www.igwfmc.com/main/jjcp/product/017091/detail.html
  // https://statics.citics.com/product/file/abstract/015310.pdf
  const aligned = normalized.replace(/^华泰柏瑞南方东英(?=恒生科技)/, '华泰柏瑞')
    .replace(/^景顺长城纳斯达克科技市值加权/, '景顺长城纳斯达克科技');
  const cls = shareClass(aligned);
  const currency = /美元现汇|美元现钞|美元|港币|欧元/.exec(aligned)?.[0] ?? '人民币';
  const key = aligned.replace(/\((?:QDII(?:-LOF)?|LOF)\)/g, '')
    .replace(/\(?(?:人民币|美元(?:现汇|现钞)?|港币|欧元)\)?$/, '')
    .replace(/(?:\([A-Z](?:类(?:份额)?)?\)|[A-Z](?:类(?:份额)?)?)$/, cls ? '' : '$&')
    .replace(/基金管理有限公司|基金管理公司|证券投资基金|交易型开放式|灵活配置|发起式|发起|指数型|指数|ETF|联接|混合型|混合|基金|[()]/g, '');
  const targetStart = key.search(/沪深|中证|上证|深证|国证|恒生|恒指|纳斯达克|标普|道琼斯|创业板|科创|北证|MSCI|富时|罗素|日经|DAX/);
  const manager = targetStart > 0 ? key.slice(0, targetStart) : managers.find(manager => key.startsWith(manager)) ?? null;
  const target = targetStart >= 0 ? key.slice(targetStart) : null;
  return {normalized, key, cls, currency, manager, target, indexLike: /指数|ETF|联接|交易型/.test(aligned),
    numbers: JSON.stringify(key.match(/[A-Z]*\d+/g)), enhanced: /增强|多因子|量化|策略/.test(aligned)};
}
function distance(a: string, b: string): number {
  let prior = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prior[j] + 1, prior[j - 1] + Number(a[i - 1] !== b[j - 1]));
    prior = next;
  }
  return prior[b.length];
}

/** Hard identity gates precede scoring. Target variants and share/currency differences never qualify. */
export function rankFundCandidates(name: string, funds: FundMatch[] = FUND_LIST_SEED.funds): NonNullable<HoldingRow['candidates']> {
  const input = matchProfile(name);
  if (/^\d{6}$/.test(input.normalized)) return funds.filter(fund => fund.code === input.normalized).map(fund => ({...fund, score: 100, reasons: ['基金代码一致']}));
  if (/^(余额宝|零钱通)$/.test(input.normalized)) return [];
  const ranked: NonNullable<HoldingRow['candidates']> = [];
  for (const fund of funds) {
    const candidate = matchProfile(fund.name);
    if (candidate.cls !== input.cls || candidate.currency !== input.currency || candidate.numbers !== input.numbers || candidate.enhanced !== input.enhanced) continue;
    if (candidate.manager !== input.manager || candidate.target !== input.target) continue;
    if ((input.indexLike || candidate.indexLike || /指数型/.test(fund.type)) && candidate.key !== input.key) continue;
    if (['混合', '债券', '货币', '股票'].some(kind => input.normalized.includes(kind) && !candidate.normalized.includes(kind) && !fund.type.includes(kind))) continue;
    const same = candidate.key === input.key;
    // Unknown managers require an identical normalized name; no guessed manager prefix.
    if (!same && (!input.manager || input.key.length < 8)) continue;
    const score = candidate.normalized === input.normalized ? 100 : same ? 98
      : Number((100 * (1 - distance(input.key, candidate.key) / Math.max(input.key.length, candidate.key.length))).toFixed(2));
    if (score < 80) continue;
    const reasons = [candidate.normalized === input.normalized ? '名称一致' : same ? '名称归一后一致（省略词及已核对简称）' : `名称相似度 ${score}%`];
    if (input.manager) reasons.push(`管理人一致：${input.manager}`);
    if (input.target) reasons.push(`跟踪标的一致：${input.target}`);
    reasons.push(input.cls ? `份额类别一致：${input.cls}` : '双方名称均未标注份额类别', `币种一致：${input.currency}（省略币种按人民币）`);
    ranked.push({...fund, score, reasons});
  }
  return ranked.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

// At least 92/100 and a five-point lead; even a literal name cannot overrule a near tie.
function uniqueFund(candidates: NonNullable<HoldingRow['candidates']>): FundMatch | null {
  const best = candidates[0];
  return best && best.score >= 92 && (!candidates[1] || best.score - candidates[1].score >= 5)
    ? {code: best.code, name: best.name, type: best.type} : null;
}

/** Return only a unique high-scoring match; rankFundCandidates explains unconfirmed suggestions. */
export function matchFund(name: string, funds: FundMatch[] = FUND_LIST_SEED.funds): FundMatch | null {
  return uniqueFund(rankFundCandidates(name, funds));
}

// Public-list abbreviations that omit or obscure the target. Match the verified name in full,
// never infer Nasdaq-100 from an arbitrary "纳斯达克" or STAR 50 from "科创".
// Fund-company product pages: https://www.huaan.com.cn/funds/159632/index.shtml
// https://www.99fund.com/main/products/pofund/159660/fundinfo.shtml
// https://www.gffunds.com.cn/funds/?fundcode=159941
// https://www.fullgoal.com.cn/fundDetail/513870/index.html
// Exchange disclosures: https://www.sse.com.cn/disclosure/announcement/listing/c/c_20230317_5718138.shtml
// ICBC's Y-share summary: https://e.boc.cn/cmsimage/ezcms/public/89968496/20241216/f4d88f891f0b408ebc1d5e0d49ceae34.pdf
// Huaan's distinct Stock Connect targets:
// https://huaan.com.cn/upload2010/2026/04/22/005856097_33ec341c-6001-333e-bb03-5292ff326160.pdf
// https://wap.huaan.com.cn/upload2010/2026/01/15/091252386_0_f40aa45f-de2f-3747-979d-15e4dcdefce3.pdf
const TRACKER_ABBREVIATIONS: Record<string, string> = {
  纳指ETF嘉实: 'NDX', 纳斯达克ETF华安: 'NDX', 纳指ETF汇添富: 'NDX',
  纳指ETF易方达: 'NDX', 纳指ETF广发: 'NDX', 纳指ETF国泰: 'NDX',
  纳指ETF华泰柏瑞: 'NDX', 纳斯达克ETF华夏: 'NDX', 纳指ETF富国: 'NDX',
  工银科创ETF联接Y: '000688',
  港股通恒生ETF华安: '恒指港股通',
  港股通恒生科技ETF华安: '恒生港股通科技主题',
};

/** The rule applies only to a plain tracker of a covered index. */
export function classify(name: string, fund: FundMatch | null = null): Pick<HoldingRow, 'tracked_index' | 'exposure' | 'covered_index'> {
  const text = keyOf(fund?.name ?? name), type = fund?.type ?? '';
  const make = (exposure: Exposure, tracked_index: string | null = null, covered_index: IndexCode | null = null) => ({exposure, tracked_index, covered_index});
  if (/余额宝|零钱通|货币/.test(text + type)) return make('money');
  if (/债券|纯债|短债|中短债|信用债|国债/.test(text + type)) return make('bond');
  if (/FOF|REIT|商品|黄金|原油/.test(text + type)) return make('other');
  // The target must end before a fund-type or strategy word: 创业板50 and 科创100
  // cannot become the base index. Strategy words keep the direction but bar coverage below.
  const plain = '(?=指数|ETF|联接|交易型|LOF|增强|多因子|量化|优选|策略|指增|\\(|[A-Z]?$)';
  const tracked = TRACKER_ABBREVIATIONS[text] ?? (new RegExp(`(?:纳斯达克(?:100|一百)|纳指100)${plain}`).test(text) ? 'NDX'
    : /纳斯达克科技/.test(text) ? '纳斯达克科技市值加权'
    : new RegExp(`标普500${plain}`).test(text) ? 'SPX'
    : new RegExp(`恒生科技${plain}`).test(text) ? 'HSTECH'
    : new RegExp(`(?:恒生(?:指数)?|恒指)${plain}`).test(text) ? 'HSI'
    : new RegExp(`沪深300${plain}`).test(text) ? '000300'
    : new RegExp(`中证500${plain}`).test(text) ? '000905'
    : new RegExp(`上证50${plain}`).test(text) ? '000016'
    : new RegExp(`中证1000${plain}`).test(text) ? '000852'
    : new RegExp(`中证红利${plain}`).test(text) ? '000922'
    : new RegExp(`科创板?50(?:成份)?${plain}`).test(text) ? '000688'
    : new RegExp(`创业板(?:指(?:数)?)?${plain}`).test(text) ? '399006'
    : /恒生科技/.test(text) ? '恒生科技（其他口径）'
    : /创业板/.test(text) ? '创业板（其他口径）'
    : /科创/.test(text) ? '科创（其他口径）' : null);
  const indexLike = /指数|ETF|联接|LOF|交易型/.test(text + type);
  // Check the whole name, including words after 指数/ETF, for every market and index.
  const variant = /增强|多因子|量化|优选|策略|指增/.test(text);
  const covered = tracked && indexLike && !variant && isIndexCode(tracked) ? tracked : null;
  if (/纳斯达克|标普|美国|美股|道琼斯|纳指/.test(text)) return make('us_equity', indexLike ? tracked : null, covered);
  if (/恒生|港股|香港|恒指/.test(text)) return make('hk_equity', indexLike ? tracked : null, covered);
  if (/QDII|海外|全球|欧洲|德国|日本|越南|印度|新兴市场/.test(text + type)) return make('overseas_other', indexLike ? tracked : null);
  if (covered) return make(covered === '000922' ? 'a_other_index' : 'a_broad', covered, covered);
  if (/增强|多因子|量化/.test(text) && tracked && isIndexCode(tracked)) return make('a_other_index', tracked);
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
    const byName = rankFundCandidates(item.name, funds);
    // A code read from the screenshot or text decides the match; the name still drives the candidates shown.
    const byCode = item.code ? funds.find(f => f.code === item.code) : undefined;
    const candidates = byCode ? [{...byCode, score: 100, reasons: ['截图或文字中的基金代码一致']}, ...byName.filter(c => c.code !== byCode.code)] : byName;
    const fund = byCode ? {code: byCode.code, name: byCode.name, type: byCode.type} : uniqueFund(byName);
    rows.push({id: randomUUID(), input_name: item.name, amount: item.amount, fund,
      ...(candidates.length ? {candidates} : {}), ...classify(item.name, fund)});
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
  if (rows.some(row => row.exposure === 'a_other_index' && /增强|多因子/.test(keyOf(row.fund?.name ?? row.input_name)))) notes.push('指数增强基金以指数为基准，但持仓与收益会偏离指数，规则判断不直接套用。');
  if (uncoveredAmount > 0) notes.push('估值规则只覆盖跟踪所列指数的基金；主动、行业、债券等持仓没有规则判断。');
  return {total, by_exposure, duplicates, covered, uncovered_share: total ? uncoveredAmount / total : 0, notes};
}
