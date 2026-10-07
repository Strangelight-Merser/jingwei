import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachedValuationRule} from '../packages/backend/judgment-cache.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule} from '../packages/backend/valuation-rule.ts';
import {INDEX_CODES} from '../packages/backend/valuation-indexes.ts';
import {judgmentPublication, valuationRuleEvidence} from '../packages/backend/judgment.ts';
import {mutateState, readState} from '../packages/backend/storage.ts';

test('11 indices reuse calculations across separately loaded histories and match uncached rules', () => {
  for (const index of INDEX_CODES) {
    const history = seedHistory(index);
    const result = cachedValuationRule(history);
    assert.deepEqual(result, evaluateValuationRule(history.points, {index}));
    assert.strictEqual(cachedValuationRule(structuredClone(history)), result);
    assert.strictEqual(cachedValuationRule({...history, checked_at: '2026-10-07', source_url: 'updated'}), result);
  }
});

test('last date, row count and last PE each invalidate the calculation', () => {
  let history = structuredClone(seedHistory('000300'));
  let previous = cachedValuationRule(history);
  const check = () => {
    const next = cachedValuationRule(history);
    assert.notStrictEqual(next, previous);
    assert.deepEqual(next, evaluateValuationRule(history.points, {index: history.index_code}));
    assert.strictEqual(cachedValuationRule(structuredClone(history)), next);
    previous = next;
  };
  history.points.at(-1)!.pe_ttm += 1;
  check();
  history.points.at(-1)!.date = '2026-10-01';
  check();
  history.points = history.points.slice(1);
  check();
  history.points.push({date: '2026-10-02', pe_ttm: 15});
  check();
});

test('publication and research evidence use fresh source metadata even on a cache hit', async () => {
  const history = seedHistory('NDX');
  cachedValuationRule(history);
  await mutateState(state => {
    (state.valuation_histories ??= {}).NDX = {...history, checked_at: '2026-10-07T12:00:00Z', source_url: 'https://example.org/updated-source'};
  });
  const publication = (await judgmentPublication('NDX'))!;
  const evidence = valuationRuleEvidence(await readState(), 'NDX')!;
  assert.equal(publication.checked_at, '2026-10-07T12:00:00Z');
  assert.equal(publication.source_url, 'https://example.org/updated-source');
  assert.equal(evidence.ref.checked_at, publication.checked_at);
  assert.equal(evidence.ref.url, publication.source_url);
  assert.equal(evidence.percentile, publication.percentile);
});
