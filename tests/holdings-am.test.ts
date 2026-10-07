import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {OcrLine} from '../packages/contracts/holdings.ts';
import {parseHoldings, parseOcrLines, parseText} from '../packages/backend/holdings.ts';

for (const [slug, platform] of [
  ['cmb-app', '招商银行'], ['tiantian-list', '天天基金'], ['danjuan-xueqiu', '蛋卷/雪球'],
  ['jd-finance', '京东金融'], ['wechat-licaitong', '微信理财通'],
]) {
  test(`${platform}合成截图：本机OCR原始行正确导入九只公开基金、金额和覆盖`, async () => {
    const fixture = JSON.parse(await readFile(new URL(`./fixtures/holdings/${slug}.synthetic.json`, import.meta.url), 'utf8'));
    assert.ok(fixture.lines.some((line: OcrLine) => line.text.includes('虚构持仓示例')));
    const expected = fixture.holdings.map(({name, code, amount, covered_index}: typeof fixture.holdings[number]) => ({name, code, amount, covered_index}));
    for (const lines of [fixture.lines, [...fixture.lines].reverse()]) {
      const result = parseHoldings({images: [lines]});
      assert.deepEqual(result.unread, []);
      assert.deepEqual(result.rows.map(row => ({name: row.fund?.name, code: row.fund?.code, amount: row.amount, covered_index: row.covered_index})), expected);
      assert.equal(result.rows.length, 9);
    }
  });
}

test('OCR千分位逗号误读为点：仅恢复完整分组，歧义金额仍待确认，粘贴文字不猜', () => {
  const name: OcrLine = {text: '华夏纯债债券A', x: 0.06, y: 0.2, w: 0.4, h: 0.02};
  for (const [text, amount] of [['持有金额：7.654.32', 7654.32], ['持有金额：¥1.234.567.89', 1234567.89],
    ['持有金额：1.23.45', null], ['持有金额：1234.567.89', null], ['持有金额：7.654.32 18.90', null],
    ['持有金额：1.234', null], ['持有金额：1.234万', 12340]] as const) {
    assert.equal(parseOcrLines([[name, {text, x: 0.06, y: 0.24, w: 0.5, h: 0.02}]])[0].amount, amount, text);
  }
  assert.equal(parseText('华夏纯债债券A 7.654.32')[0].amount, null);
});
