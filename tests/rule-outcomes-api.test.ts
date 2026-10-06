import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startApi} from '../apps/api/src/main.ts';
import {ruleOutcomesForHistory} from '../packages/backend/rule-outcomes.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {OUTCOME_INDICES, type OutcomeIndex} from '../packages/backend/total-return-source.ts';

test('real API route serves all three indices with current-band and full distributions', async () => {
  const app = await startApi({port: 0, mode: 'read_only'});
  try {
    for (const index of Object.keys(OUTCOME_INDICES) as OutcomeIndex[]) {
      const response = await app.inject({method: 'GET', url: `/publication/rule-outcomes?index=${index}`});
      assert.equal(response.statusCode, 200);
      const data = response.json();
      assert.equal(data.index_code, index);
      assert.equal(data.index_name, OUTCOME_INDICES[index].name);
      assert.equal(data.total_return_code, OUTCOME_INDICES[index].code);
      const expected = ruleOutcomesForHistory(seedHistory(index).points, seedTotalReturnHistory(index).points);
      for (const key of ['current_band', 'judgment_as_of', 'returns_as_of', 'bands', 'conclusion'] as const) assert.deepEqual(data[key], expected[key]);
    }
    assert.equal((await app.inject({method: 'GET', url: '/publication/rule-outcomes'})).json().index_code, '000300');
    for (const index of ['', 'H00300', '999999', 'constructor', '__proto__']) assert.equal((await app.inject({method: 'GET', url: `/publication/rule-outcomes?index=${index}`})).statusCode, 400);
  } finally {await app.close();}
});
