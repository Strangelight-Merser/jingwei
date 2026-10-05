import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectFundSnapshots,fundFieldFragments} from '../packages/backend/fund-sources.ts';
import {collectResearchEvidence,parseFundSeries,parseFundDocuments} from '../packages/backend/fund-evidence.ts';

test('基金净值保留真实日期与累计净值，缺数和未来日期拒绝，不执行js',()=>{
 const series=parseFundSeries('005658',{ShowData:['2026-09-28','2026-09-30'],danweijingzhiName:['1.23','1.24'],leijiJingzhiName:[2.3,2.4]},'2026-10-05');
 assert.deepEqual(series,[{date:'2026-09-28',nav:1.23,accumulated_nav:2.3},{date:'2026-09-30',nav:1.24,accumulated_nav:2.4}]);
 assert.throws(()=>parseFundSeries('005658',{ShowData:['2026-09-30'],danweijingzhiName:['--'],leijiJingzhiName:[2.4]},'2026-10-05'),/fund_nav_value_missing/);
 assert.throws(()=>parseFundSeries('005658',{ShowData:['2026-10-06'],danweijingzhiName:[1],leijiJingzhiName:[2]},'2026-10-05'),/fund_nav_date_invalid/);
 assert.throws(()=>parseFundSeries('007339',{status:1,data:{data:[{navDate:'2026-09-30',netValue:1,totalNetValue:1,shortName:'另一只基金A'}]}},'2026-10-05'),/fund_nav_identity_missing/);
});
test('报告目录仅作为发现信息，不把链接当报告指标或允许第三方冒充官方',()=>{
 const docs=parseFundDocuments('005658','<div class="li"><a href="../c/2026-08-31/example.shtml">华夏沪深3002026年中期报告</a><span>2026-08-31</span></div><a href="https://other.example/fake.pdf">基金资料概要</a>','https://www.chinaamc.com/product/publishGgList.do?fundcode=005658','2026-10-05T00:00:00Z');
 assert.equal(docs.length,1);assert.equal(docs[0].status,'discovered');assert.equal(docs[0].published_at,'2026-08-31');assert.match(docs[0].ref.fragments[0],/不证明报告中的指标/);
});
test('字段引用保留原文标签，易方达费用来源失败仍核查独立业务源',async()=>{
 const fields=await collectFundSnapshots({priorSnapshots:[],now:new Date('2026-10-05T00:00:00Z'),fetcher:async input=>String(input).includes('tradestatus')?new Response(JSON.stringify({status:1,data:{individual:[{subscription:true,redemption:true,agencyName:'直销',limit:''}]}})):new Response('',{status:503})});
 assert.equal(fields.snapshots.length,1);assert.equal(fields.snapshots[0].code,'007339');assert.ok(fields.snapshots[0].fields.trade_status?.source.url.includes('tradestatus'));assert.match(fields.snapshots[0].fields.trade_status?.source.fragments[0]??'',/"subscription":true/);assert.equal(fields.snapshots[0].fields.service,undefined);
 assert.deepEqual(fundFieldFragments('007339','<table class="table_feilv"><tr><td class="table_left">管理费</td><td class="table_right">0.15%</td></tr></table>','management'),['管理费0.15%']);
});
test('一个基金来源失败不丢弃另一基金和市场，原响应与哈希归档在隔离路径',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jingwei-evidence-test-'));
 const raw={valuation:JSON.parse(await readFile(new URL('../references/market-research/market_csi_valuation.json',import.meta.url),'utf8')),daily:JSON.parse(await readFile(new URL('../references/market-research/market_csi300_daily.json',import.meta.url),'utf8')),daily_valuation:JSON.parse(await readFile(new URL('../references/market-research/market_csi300_daily_valuation.json',import.meta.url),'utf8'))};
 const result=await collectResearchEvidence({archive_dir:dir,priorSnapshots:[],now:new Date('2026-10-05T00:00:00Z'),fetcher:async input=>{
  const u=String(input);if(u.includes('csindex'))return new Response(JSON.stringify(u.includes('indexValuation')?raw.valuation:u.includes('indexCsiDsPe')?raw.daily_valuation:raw.daily));
  if(u.includes('zoust_all.js'))return new Response(JSON.stringify({ShowData:['2026-09-29'],danweijingzhiName:[1.6251],leijiJingzhiName:[1.6251]}));
  return new Response('',{status:503});
 }});
 assert.equal(result.market?.as_of,'2026-09-30');assert.equal(result.fund_series.length,1);assert.equal(result.fund_series[0].code,'005658');assert.ok(result.errors.some(x=>x.startsWith('007339:')));assert.equal(result.funds.length,0);assert.ok((await readdir(dir)).some(f=>f.endsWith('.raw')));assert.ok((await readdir(dir)).some(f=>f.startsWith('capture-')));
});
