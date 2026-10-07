// Indices the valuation rule covers. A-share indices use the official CSI daily PE where CSI publishes
// it; the others use the weekly PE that 蛋卷基金 publishes for its index valuation table (third party,
// named as such wherever the figure appears).
export type IndexSource = 'csi' | 'danjuan';
export type IndexMarket = 'cn' | 'us' | 'hk';
type IndexDefinition = {name: string; name_en: string; rule_prefix: string; market: IndexMarket; source: IndexSource; source_code: string};

export const VALUATION_INDEXES = {
  '000300': {name: '沪深300', name_en: 'CSI 300', rule_prefix: 'csi300', market: 'cn', source: 'csi', source_code: '000300'},
  '000905': {name: '中证500', name_en: 'CSI 500', rule_prefix: 'csi500', market: 'cn', source: 'csi', source_code: '000905'},
  '000016': {name: '上证50', name_en: 'SSE 50', rule_prefix: 'sse50', market: 'cn', source: 'csi', source_code: '000016'},
  '000852': {name: '中证1000', name_en: 'CSI 1000', rule_prefix: 'csi1000', market: 'cn', source: 'csi', source_code: '000852'},
  '000922': {name: '中证红利', name_en: 'CSI Dividend', rule_prefix: 'csidiv', market: 'cn', source: 'csi', source_code: '000922'},
  '000688': {name: '科创50', name_en: 'STAR 50', rule_prefix: 'star50', market: 'cn', source: 'csi', source_code: '000688'},
  '399006': {name: '创业板指', name_en: 'ChiNext', rule_prefix: 'chinext', market: 'cn', source: 'danjuan', source_code: 'SZ399006'},
  'NDX': {name: '纳斯达克100', name_en: 'NASDAQ-100', rule_prefix: 'ndx', market: 'us', source: 'danjuan', source_code: 'NDX'},
  'SPX': {name: '标普500', name_en: 'S&P 500', rule_prefix: 'spx', market: 'us', source: 'danjuan', source_code: 'SP500'},
  'HSI': {name: '恒生指数', name_en: 'Hang Seng Index', rule_prefix: 'hsi', market: 'hk', source: 'danjuan', source_code: 'HKHSI'},
  'HSTECH': {name: '恒生科技', name_en: 'Hang Seng TECH', rule_prefix: 'hstech', market: 'hk', source: 'danjuan', source_code: 'HKHSTECH'},
} as const satisfies Record<string, IndexDefinition>;

export type IndexCode = keyof typeof VALUATION_INDEXES;
// Display order. Not Object.keys: a numeric-looking key like '399006' would sort first.
export const INDEX_CODES: IndexCode[] = ['000300', '000905', '000016', '000852', '399006', '000688', '000922', 'NDX', 'SPX', 'HSI', 'HSTECH'];
/** Indices with a bundled total-return series and a matching bond yield: forward outcomes and ERP. */
export const RETURN_INDEX_CODES = ['000300', '000905', '000016', '000852', '000922'] as const satisfies readonly IndexCode[];
export type ReturnIndexCode = typeof RETURN_INDEX_CODES[number];

export function isIndexCode(value: unknown): value is IndexCode {
  return typeof value === 'string' && INDEX_CODES.some(code => code === value);
}
export function hasReturns(index: IndexCode): index is ReturnIndexCode {
  return (RETURN_INDEX_CODES as readonly string[]).includes(index);
}
export const sourceOf = (index: IndexCode): IndexSource => VALUATION_INDEXES[index].source;
/** Readings in the history: CSI publishes every trading day, 蛋卷 once a week. */
export const frequencyOf = (index: IndexCode): 'daily' | 'weekly' => sourceOf(index) === 'csi' ? 'daily' : 'weekly';
export const SOURCE_LABELS: Record<IndexSource, string> = {csi: '中证指数官网每日估值', danjuan: '蛋卷基金指数估值（第三方，每周）'};
