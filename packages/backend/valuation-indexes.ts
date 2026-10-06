export const VALUATION_INDEXES = {
  '000300': {name: '沪深300', name_en: 'CSI 300', rule_prefix: 'csi300'},
  '000905': {name: '中证500', name_en: 'CSI 500', rule_prefix: 'csi500'},
  '000016': {name: '上证50', name_en: 'SSE 50', rule_prefix: 'sse50'},
} as const;

export type IndexCode = keyof typeof VALUATION_INDEXES;
export const INDEX_CODES: IndexCode[] = ['000300', '000905', '000016'];

export function isIndexCode(value: unknown): value is IndexCode {
  return typeof value === 'string' && INDEX_CODES.some(code => code === value);
}
