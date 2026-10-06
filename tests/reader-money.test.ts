import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validReaderSituation,type ReaderSituation} from '../packages/contracts/reader-situation.ts';
import {situationMoney} from '../apps/web/app/lib/situation-money.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule,BAND_JUDGMENTS,type ValuationBand} from '../packages/backend/valuation-rule.ts';

const current=evaluateValuationRule(seedHistory().points)!;
const situation:ReaderSituation={long_plan:'yes',holding:'007339',holding_period:'long',monthly_amount:1000,idle_amount:50000};

test('定投与闲钱使用各区间已有动作，不增加投入比例或次数',()=>{
 const expectations:Record<ValuationBand,string>={
  low:'每月 1,000 元定投：照常；另外 50,000 元：偏低区可分批新增。',
  mid:'每月 1,000 元定投：照常；另外 50,000 元：中间区不一次性投入。',
  high:'每月 1,000 元定投：暂缓新增；另外 50,000 元：偏高区暂缓新增。',
  extreme:'每月 1,000 元定投：暂停新增；另外 50,000 元：高位区暂停新增。',
 };
 for(const band of Object.keys(expectations)as ValuationBand[]){
  assert.equal(situationMoney(situation,{...current,band,judgment:BAND_JUDGMENTS[band]}),expectations[band]);
 }
});

test('可选金额不改变适用范围，短期与其他基金不呈现金额动作',()=>{
 assert.equal(situationMoney({...situation,monthly_amount:undefined,idle_amount:undefined},current),null);
 assert.equal(situationMoney({...situation,monthly_amount:0,idle_amount:0},current),null);
 assert.equal(situationMoney(situation,null),null);
 for(const holding_period of ['under7','month']as const)assert.equal(situationMoney({...situation,holding_period},current),null);
 assert.equal(situationMoney({...situation,holding:'other'},current),null);
 assert.equal(situationMoney({...situation,long_plan:'no'},current),'若已确定长期配置计划，每月 1,000 元定投：照常；另外 50,000 元：中间区不一次性投入。');
 assert.equal(situationMoney({...situation,monthly_amount:undefined},current),'另外 50,000 元：中间区不一次性投入。');
});

test('本机保存接受未填金额，拒绝负值和非有限值，金额小数可保存',()=>{
 assert.equal(validReaderSituation({long_plan:'yes',holding:'none',holding_period:'long'}),true);
 assert.equal(validReaderSituation({...situation,monthly_amount:1000.25,idle_amount:0}),true);
 for(const amount of [-1,NaN,Infinity,'1000',null]){
  assert.equal(validReaderSituation({...situation,monthly_amount:amount}),false);
  assert.equal(validReaderSituation({...situation,idle_amount:amount}),false);
 }
});
