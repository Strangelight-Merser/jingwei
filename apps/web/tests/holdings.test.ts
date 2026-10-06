import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {createJiti} from 'jiti';
import type {Checkup, HoldingRow, Holdings, OcrLine} from '../../../packages/contracts/holdings.ts';
import {HOLDINGS_KEY, readHoldings, writeHoldings} from '../app/lib/holdings-storage.ts';
import {blankDraft, confirmRows, editName, importReducer, initialImportState, parseHoldings, recognizeImages, toDraft} from '../app/lib/holdings-client.ts';
import {holdingsRequest} from '../app/lib/holdings-proxy.server.ts';

// Synthetic amounts are confined to tests. The product never imports these fixtures.
const row: HoldingRow = {id: 'csi300', input_name: '广发沪深300ETF联接C', amount: 1000, fund: {code: '007339', name: '广发沪深300ETF联接C', type: '股票指数'}, exposure: 'a_broad', tracked_index: '沪深300', covered_index: '000300'};
const saved: Holdings = {saved_at: '2026-10-06T12:00:00Z', rows: [row]};
const parsed = {rows: [row], unread: ['昨日收益 +1.00']};
function memoryStorage() {
  const values = new Map<string, string>();
  return {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}, removeItem: (key: string) => {values.delete(key);}};
}

test('浏览器和缺少持仓桥接的桌面都使用 localStorage，保存后可重读并可清除', async () => {
  for (const jingwei of [undefined, {}]) {
    const host = {jingwei, localStorage: memoryStorage()};
    assert.equal(await readHoldings(host), null);
    await writeHoldings(saved, host);
    assert.deepEqual(await readHoldings(host), saved);
    await writeHoldings(null, host);
    assert.equal(host.localStorage.getItem(HOLDINGS_KEY), null);
    assert.equal(await readHoldings(host), null);
  }
});

test('桌面持仓桥接优先，不触碰浏览器存储；桥接失败不偷偷写另一份', async () => {
  let value: Holdings | null = saved;
  const inaccessible = {getItem() {throw new Error('must not read');}, setItem() {throw new Error('must not write');}, removeItem() {throw new Error('must not remove');}};
  const host = {jingwei: {readHoldings: () => value, writeHoldings: async (next: Holdings | null) => {value = next;}}, localStorage: inaccessible};
  assert.deepEqual(await readHoldings(host), saved);
  await writeHoldings(null, host);
  assert.equal(value, null);
  await writeHoldings(saved, host);
  assert.deepEqual(value, saved);
  const fallback = memoryStorage();
  const broken = {jingwei: {readHoldings() {throw new Error('disk');}, writeHoldings() {throw new Error('disk');}}, localStorage: fallback};
  await assert.rejects(readHoldings(broken), /读取失败/);
  await assert.rejects(writeHoldings(saved, broken), /保存失败/);
  assert.equal(fallback.getItem(HOLDINGS_KEY), null);
  await assert.rejects(writeHoldings(saved, {jingwei: {readHoldings: () => saved}, localStorage: fallback}), /保存失败/);
});

test('浏览器存储受限或内容损坏时明确失败；写入失败保留旧持仓', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem(HOLDINGS_KEY, '{');
  await assert.rejects(readHoldings({localStorage}), /读取失败/);
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(saved));
  const denied = {...localStorage, setItem() {throw new Error('quota');}, removeItem() {throw new Error('permission');}};
  await assert.rejects(writeHoldings({...saved, rows: []}, {localStorage: denied}), /保存失败/);
  assert.deepEqual(await readHoldings({localStorage}), saved);
  await assert.rejects(writeHoldings(null, {localStorage: denied}), /保存失败/);
});

test('多图识别按顺序调用本机桥接，代理只收到 OCR 行，不收到图片字节', async () => {
  const fixtures: OcrLine[][] = await Promise.all(['alipay-1.ocr.json', 'alipay-2.ocr.json'].map(async name => JSON.parse(await readFile(new URL(`../../../tests/fixtures/holdings/${name}`, import.meta.url), 'utf8'))));
  let calls = 0;
  const progress: number[] = [];
  const images = await recognizeImages([new Uint8Array([1, 2]), new Uint8Array([3, 4])].map(bytes => ({arrayBuffer: async () => bytes.buffer})), {recognizeImage: async bytes => {
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(Array.from(bytes), calls === 0 ? [1, 2] : [3, 4]);
    return fixtures[calls++];
  }}, done => progress.push(done));
  assert.deepEqual(images, fixtures);
  assert.deepEqual(progress, [1, 2]);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/holdings/parse');
      assert.deepEqual(JSON.parse(String(init?.body)), {images: fixtures});
      return Response.json(parsed);
    };
    assert.deepEqual(await parseHoldings({images}), parsed);
  } finally {globalThis.fetch = original;}
  await assert.rejects(recognizeImages([], {}, () => {}), /需桌面版/);
});

test('名称编辑清除旧匹配；确认时重匹配并保留用户金额与行标识', async () => {
  const draft = editName(toDraft(row), '南方纳斯达克100指数(QDII)C');
  assert.equal(draft.row.fund, null);
  assert.equal(draft.row.covered_index, null);
  assert.equal(draft.row.exposure, 'other');
  const [confirmed] = await confirmRows([{...draft, amount: '123.45'}], async request => {
    assert.equal(request.text, '南方纳斯达克100指数(QDII)C\t123.45');
    return {rows: [{...row, id: 'parser-id', input_name: 'normalised', amount: 0, exposure: 'us_equity', covered_index: null, tracked_index: '纳斯达克100', fund: {code: '006479', name: '南方纳斯达克100指数(QDII)C', type: 'QDII'}}], unread: []};
  });
  assert.equal(confirmed.id, row.id);
  assert.equal(confirmed.amount, 123.45);
  assert.equal(confirmed.input_name, draft.row.input_name);
  assert.equal(confirmed.fund?.code, '006479');
  assert.equal(confirmed.covered_index, null);
  const unchanged = {...toDraft(row), amount: '2000'};
  assert.deepEqual(await confirmRows([unchanged], async () => {throw new Error('unchanged name must not reparse');}), [{...row, amount: 2000}]);
});

test('手动输入必须填写名称和非负有限金额；未匹配行仍可确认，不保留旧基金', async () => {
  await assert.rejects(confirmRows([]), /至少/);
  await assert.rejects(confirmRows([blankDraft('new')]), /名称/);
  for (const amount of ['', '-1', 'Infinity', 'NaN']) await assert.rejects(confirmRows([{...toDraft(row), amount}]), /金额/);
  const manual = {...blankDraft('manual'), amount: '0', row: {...blankDraft('manual').row, input_name: '无法匹配的基金'}};
  const [confirmed] = await confirmRows([manual], async () => ({rows: [{...manual.row, amount: 0}], unread: []}));
  assert.equal(confirmed.fund, null);
  assert.equal(confirmed.amount, 0);
  await assert.rejects(confirmRows([manual], async () => ({rows: [], unread: []})), /未能识别/);
});

test('空状态 → 识别 → 确认 → 保存 → 体检；失败与取消不会覆盖已保存清单', () => {
  let state = importReducer(initialImportState, {type: 'loaded', saved: null});
  assert.equal(state.phase, 'empty');
  state = importReducer(state, {type: 'begin'});
  assert.equal(state.phase, 'recognizing');
  state = importReducer(state, {type: 'parsed', result: parsed});
  assert.equal(state.phase, 'confirm');
  assert.equal(state.saved, null);
  assert.deepEqual(state.unread, parsed.unread);
  state = importReducer(state, {type: 'saving'});
  state = importReducer(state, {type: 'error', message: 'storage denied'});
  assert.equal(state.phase, 'confirm');
  assert.equal(state.drafts.length, 1);
  assert.equal(state.saved, null);
  state = importReducer(state, {type: 'saved', saved});
  assert.equal(state.phase, 'checkup');
  assert.deepEqual(state.saved, saved);
  state = importReducer(state, {type: 'error', message: 'API 404'});
  assert.equal(state.phase, 'checkup');
  assert.deepEqual(state.saved, saved);
  state = importReducer(state, {type: 'reimport'});
  state = importReducer(state, {type: 'parsed', result: {rows: [], unread: []}});
  state = importReducer(state, {type: 'cancel'});
  assert.equal(state.phase, 'checkup');
  assert.deepEqual(state.saved, saved);
  state = importReducer(state, {type: 'cleared'});
  assert.equal(state.phase, 'empty');
  assert.equal(state.saved, null);
});

test('体检组件按 fixture 展示重复、区间与已有持仓动作，链接到对应指数，notes 最多三条', async () => {
  const jiti = createJiti(import.meta.url, {jsx: {runtime: 'automatic'}});
  const {HoldingsCheckup} = await jiti.import<typeof import('../app/components/HoldingsCheckup.tsx')>(new URL('../app/components/HoldingsCheckup.tsx', import.meta.url).href);
  const rows: HoldingRow[] = [row, {...row, id: 'us1', input_name: '纳指基金一', amount: 2000, tracked_index: '纳斯达克100', exposure: 'us_equity', covered_index: null}, {...row, id: 'us2', input_name: '纳指基金二', amount: 2000, tracked_index: '纳斯达克100', exposure: 'us_equity', covered_index: null}];
  const checkup: Checkup = {total: 5000, by_exposure: [{exposure: 'a_broad', label: 'A股宽基', amount: 1000, share: .2}, {exposure: 'us_equity', label: '美股', amount: 4000, share: .8}], duplicates: [{tracked_index: '纳斯达克100', row_ids: ['us1', 'us2'], amount: 4000}], covered: [{row_id: row.id, index: '000300', index_name: '沪深300', band: 'mid', band_label: '中间区', new_money_title: '按原计划', held_title: '继续持有'}], uncovered_share: .8, notes: ['说明一', '说明二', '说明三', '说明四']};
  const render = (value: Checkup) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HoldingsCheckup, {holdings: {...saved, rows}, checkup: value})));
  const html = render(checkup);
  assert.match(html, /5,000/);
  assert.match(html, /2 只基金都跟踪纳斯达克100/);
  assert.match(html, /同时持有不增加分散/);
  assert.match(html, /其余 80% 暂不覆盖/);
  assert.match(html, /tone-mid/);
  assert.match(html, /已有持仓/);
  assert.match(html, /继续持有/);
  assert.match(html, /href="\/\?index=000300#hero-title"/);
  assert.match(html, /exposure-us_equity/);
  assert.doesNotMatch(html, /说明四/);
  assert.match(render({...checkup, total: 0, by_exposure: [], uncovered_share: 1}), /覆盖占比暂无法计算/);
});

test('代理遵循原 API 状态、携带本机请求头、禁止跨来源、禁止缓存', async () => {
  const original = process.env.JINGWEI_API_URL;
  let status = 200;
  const bodies: unknown[] = [];
  const server = createServer(async (req, res) => {
    assert.ok(['/holdings/parse', '/holdings/checkup'].includes(req.url!));
    assert.equal(req.headers['x-jingwei-reader'], 'local');
    let body = ''; for await (const chunk of req) body += chunk;
    bodies.push(JSON.parse(body));
    res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(status === 200 ? parsed : {error: 'not_ready'}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port: number};
  process.env.JINGWEI_API_URL = `http://127.0.0.1:${address.port}`;
  const request = (origin = 'http://reader') => new Request('http://reader/holdings/parse', {method: 'POST', headers: {origin, 'Content-Type': 'application/json'}, body: JSON.stringify({text: '持仓名称 100'})});
  try {
    const response = await holdingsRequest(request(), 'parse');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), parsed);
    assert.deepEqual(bodies, [{text: '持仓名称 100'}]);
    status = 404;
    assert.equal((await holdingsRequest(request(), 'checkup')).status, 404);
    assert.equal((await holdingsRequest(request('https://other'), 'parse')).status, 403);
    assert.equal(bodies.length, 2);
    const malformed = new Request('http://reader/holdings/parse', {method: 'POST', headers: {origin: 'http://reader'}, body: '{'});
    assert.equal((await holdingsRequest(malformed, 'parse')).status, 400);
    assert.equal(bodies.length, 2);
  } finally {
    if (original === undefined) delete process.env.JINGWEI_API_URL; else process.env.JINGWEI_API_URL = original;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
