import {evaluateValuationRule} from './valuation-rule.ts';
import type {ValuationHistory} from './valuation-history.ts';

type Result = ReturnType<typeof evaluateValuationRule>;
// One current calculation per index; refresh replaces it on the next read.
const cache = new Map<string, {key: string; result: Result}>();

export function cachedValuationRule(history: ValuationHistory): Result {
  const last = history.points.at(-1);
  const key = JSON.stringify([history.index_code, last?.date, history.points.length, last?.pe_ttm]);
  const previous = cache.get(history.index_code);
  if (previous?.key === key) return previous.result;
  const result = evaluateValuationRule(history.points, {index: history.index_code});
  cache.set(history.index_code, {key, result});
  return result;
}
