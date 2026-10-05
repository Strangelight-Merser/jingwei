import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectMarketSnapshot,parseMarketSnapshot,toMarketEvidence} from '../packages/backend/market-sources.ts';
const fixture=async()=>({valuation:JSON.parse(await readFile(new URL('../references/market-research/market_csi_valuation.json',import.meta.url),'utf8')),daily:JSON.parse(await readFile(new URL('../references/market-research/market_csi300_daily.json',import.meta.url),'utf8')),daily_valuation:JSON.parse(await readFile(new URL('../references/market-research/market_csi300_daily_valuation.json',import.meta.url),'utf8'))});
const options={checked_at:'2026-10-02T15:43:17Z',end_date:'2026-09-30',source_urls:{valuation:'https://www.csindex.com.cn/csindex-home/data-service/indexValuation',daily:'https://www.csindex.com.cn/csindex-home/perf/index-perf',daily_valuation:'https://www.csindex.com.cn/csindex-home/perf/indexCsiDsPe'}};

test('真实官方字段区分静态PE和滚动PE，PE节假日延用行不制造交易日',async()=>{
 const s=parseMarketSnapshot(await fixture(),options);assert.equal(s.as_of,'2026-09-30');assert.equal(s.close,4357.62);assert.equal(s.valuation.pe_static,14.34);assert.equal(s.valuation.pe_ttm,13.15);assert.equal(s.valuation.pb,1.36);assert.equal(s.daily.length,20);assert.equal(s.daily[0].date,'2026-09-02');assert.equal(s.daily.at(-1)?.date,'2026-09-30');assert.equal(s.daily.some(x=>x.date==='2026-09-25'),false);assert.ok(s.warnings.includes('market_nontrading_valuation_rows_excluded'));
 const e=toMarketEvidence(s);assert.equal(e.pe_ttm,13.15);assert.equal(e.previous_year_end.pe_ttm,14.31);assert.equal(e.source.data_as_of,'2026-09-30');assert.equal(e.source.published_at,'');assert.ok(e.source.fragments.every(fragment=>!fragment.includes('剔除亏损股票')&&!fragment.includes('净资产取最新一期')));assert.ok(e.source.fragments.some(fragment=>fragment.includes('股息率不等于未来基金回报')));
});
test('缺失字段、不同日期和冲突PE拒绝；少于20真实日不补行，核查时间不制造版本变化',async()=>{
 const raw=await fixture();const changed=structuredClone(raw);changed.valuation.data.indexValuations.find((x:{indexName:string})=>x.indexName==='沪深300').peg=undefined;assert.throws(()=>parseMarketSnapshot(changed,options),/market_numeric_field_missing/);
 const stale=structuredClone(raw);stale.daily.data=stale.daily.data.slice(0,-1);assert.throws(()=>parseMarketSnapshot(stale,options),/market_price_valuation_date_mismatch/);
 const mismatch=structuredClone(raw);mismatch.daily_valuation.data.at(-1).peg=99;assert.throws(()=>parseMarketSnapshot(mismatch,options),/market_pe_date_or_value_mismatch/);
 const short=structuredClone(raw);short.daily.data=short.daily.data.slice(-2);const s=parseMarketSnapshot(short,options);assert.equal(s.daily.length,2);assert.ok(s.warnings.includes('market_daily_insufficient:2/20'));assert.equal(s.hash,parseMarketSnapshot(short,{...options,checked_at:'2026-10-03T00:00:00Z'}).hash);
});
test('免费采集默认取北京时间日期并保留官方来源，未来日期和HTTP失败不当成成功',async()=>{
 const raw=await fixture(),urls:string[]=[];const fetcher:typeof fetch=async(input)=>{const url=String(input);urls.push(url);return new Response(JSON.stringify(url.includes('indexValuation')?raw.valuation:url.includes('indexCsiDsPe')?raw.daily_valuation:raw.daily));};
 const s=await collectMarketSnapshot({now:new Date('2026-10-01T20:00:00Z'),fetcher});assert.equal(s.as_of,'2026-09-30');assert.equal(s.checked_at,'2026-10-01T20:00:00.000Z');assert.equal(urls.length,3);assert.ok(urls.filter(x=>x.includes('endDate')).every(x=>new URL(x).searchParams.get('endDate')==='20261002'));assert.ok(s.sources.every(x=>new URL(x.url).hostname==='www.csindex.com.cn'));
 assert.throws(()=>parseMarketSnapshot(raw,{...options,end_date:'2026-09-29'}),/market_valuation_date_invalid/);await assert.rejects(collectMarketSnapshot({fetcher:async()=>new Response('',{status:503})}),/market_source_http_503/);
});
