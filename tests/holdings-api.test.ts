import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {startApi} from '../apps/api/src/main.ts';
import {readState} from '../packages/backend/storage.ts';

test('真实 API：parse/checkup 使用当前三指数判断，不记录或保存持仓', async () => {
  const app = await startApi({port: 0, restoreSavedKey: false});
  try {
    const before = await readState(), files = await readdir(process.env.JINGWEI_DATA_DIR!);
    const images = await Promise.all([1, 2].map(async n => JSON.parse(await readFile(new URL(`./fixtures/holdings/alipay-${n}.ocr.json`, import.meta.url), 'utf8'))));
    const expected = JSON.parse(await readFile(new URL('./fixtures/holdings/alipay.expected.json', import.meta.url), 'utf8')).holdings;
    const parsed = await app.inject({method: 'POST', url: '/holdings/parse', payload: {images}});
    assert.equal(parsed.statusCode, 200);
    assert.deepEqual(parsed.json().rows.map((row: {input_name: string; amount: number}) => ({name: row.input_name, amount: row.amount})), expected);
    const response = await app.inject({method: 'POST', url: '/holdings/checkup', payload: {saved_at: '2026-10-06T12:00:00Z', rows: parsed.json().rows}});
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().uncovered_share, 1);
    assert.equal(response.json().duplicates[0].tracked_index, '纳斯达克100');
    assert.equal(response.json().duplicates[0].row_ids.length, 2);
    const fund = (await app.inject({method: 'POST', url: '/holdings/parse', payload: {text: '007339 626.01\n余额宝 7.28'}})).json();
    const checkup = (await app.inject({method: 'POST', url: '/holdings/checkup', payload: {saved_at: '2026-10-06T12:00:00Z', rows: fund.rows}})).json();
    const current = (await app.inject({method: 'GET', url: '/publication/judgment?index=000300'})).json();
    assert.equal(checkup.covered.length, 1);
    assert.equal(checkup.covered[0].band, current.band);
    assert.equal(checkup.covered[0].new_money_title, current.judgment.new_money.title);
    assert.equal(checkup.uncovered_share, 7.28 / 633.29);
    for (const payload of [{}, {images: [[{text: 'bad', x: 2, y: 0, w: 0.1, h: 0.1}]]}]) assert.equal((await app.inject({method: 'POST', url: '/holdings/parse', payload})).statusCode, 400);
    assert.equal((await app.inject({method: 'POST', url: '/holdings/checkup', payload: {saved_at: 'invalid', rows: []}})).statusCode, 400);
    assert.deepEqual(await readState(), before);
    assert.deepEqual(await readdir(process.env.JINGWEI_DATA_DIR!), files);
  } finally {await app.close();}
});
