import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startApi} from '../apps/api/src/main.ts';
import {erpForHistory, seedBondYields} from '../packages/backend/erp.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {seedTotalReturnHistory} from '../packages/backend/total-return-history.ts';
import {RETURN_INDEX_CODES as INDEX_CODES, VALUATION_INDEXES} from '../packages/backend/valuation-indexes.ts';

test('ERP endpoint serves all indices and remains a read-only second perspective', async () => {
  const app = await startApi({port: 0, mode: 'read_only'});
  try {
    for (const index of INDEX_CODES) {
      const before = (await app.inject({method: 'GET', url: `/publication/judgment?index=${index}`})).json();
      const response = await app.inject({method: 'GET', url: `/publication/erp?index=${index}`});
      assert.equal(response.statusCode, 200);
      const data = response.json();
      assert.equal(data.index_code, index);
      assert.equal(data.index_name, VALUATION_INDEXES[index].name);
      assert.equal(data.total_return_code, seedTotalReturnHistory(index).total_return_code);
      const expected = erpForHistory(seedHistory(index).points, seedBondYields(), seedTotalReturnHistory(index).points)!;
      for (const key of ['current', 'daily', 'percentiles', 'consistency', 'outcomes', 'outcome_conclusion', 'bond_source'] as const) assert.deepEqual(data[key], expected[key]);
      assert.deepEqual((await app.inject({method: 'GET', url: `/publication/judgment?index=${index}`})).json(), before);
    }
    assert.equal((await app.inject({method: 'GET', url: '/publication/erp'})).json().index_code, '000300');
    for (const index of ['', 'H00300', '999999', 'constructor', '__proto__']) assert.equal((await app.inject({method: 'GET', url: `/publication/erp?index=${index}`})).statusCode, 400);
    for (const index of ['000688', 'NDX', 'HSTECH']) assert.equal((await app.inject({method: 'GET', url: `/publication/erp?index=${index}`})).statusCode, 404);
  } finally {await app.close();}
});
