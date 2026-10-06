import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBondYields, mergeBondYields, refreshBondYields, currentBondYields} from '../packages/backend/bond-yield-history.ts';
import {currentErp} from '../packages/backend/erp-publication.ts';
import {seedBondYields} from '../packages/backend/erp.ts';

const row = (workTime: string, tenYear: string | null) => ({workTime, tenYear, qxmc: 'x'});

test('中债十年期收益率：校验日期、数值，跳过空值，不补数', () => {
  const points = parseBondYields({heList: [row('2026-10-09', '1.70'), row('2026-10-08', ''), row('2026-10-01', null)]}, '2026-10-09');
  assert.deepEqual(points, [{date: '2026-10-09', yield_pct: 1.7}]);
  assert.throws(() => parseBondYields({heList: [row('2026-10-10', '1.7')]}, '2026-10-09'), /future/);
  assert.throws(() => parseBondYields({heList: [row('2026-10-09', '17')]}, '2026-10-09'), /value_invalid/);
  assert.throws(() => parseBondYields({heList: [row('2026-10-09', '1.7'), row('2026-10-09', '1.7')]}, '2026-10-09'), /duplicate/);
  assert.throws(() => parseBondYields({error: 1}, '2026-10-09'), /unsuccessful/);
  assert.deepEqual(mergeBondYields([{date: '2026-09-30', yield_pct: 1.68}], [{date: '2026-09-30', yield_pct: 1.69}]), [{date: '2026-09-30', yield_pct: 1.69}]);
});

test('联网补数后 ERP 用最新收益率；失败保留原数据', async () => {
  const before = await currentBondYields();
  assert.equal(before.points.at(-1)!.date, seedBondYields().at(-1)!.date);
  const fetcher = (async () => new Response(JSON.stringify({heList: [row('2026-10-09', '1.80'), row('2026-09-30', '1.68')]}), {status: 200})) as typeof fetch;
  const after = await refreshBondYields({now: new Date('2026-10-09T08:00:00Z'), fetcher});
  assert.equal(after.points.at(-1)!.date, '2026-10-09');
  assert.equal((await currentBondYields()).points.at(-1)!.yield_pct, 1.8);
  const failing = (async () => new Response('x', {status: 503})) as typeof fetch;
  await assert.rejects(refreshBondYields({fetcher: failing}), /http_503/);
  assert.equal((await currentBondYields()).points.at(-1)!.date, '2026-10-09');
  const erp = await currentErp('000300');
  assert.ok(erp);
});
