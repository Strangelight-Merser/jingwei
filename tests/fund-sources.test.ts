import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFundPage,parseEfundTrade} from '../packages/backend/fund-sources.ts';
import {createSessionUpdater} from '../apps/worker/src/session-update.ts';
test('官方字段按标签读取，缺失表格不猜零费率',()=>{
 const html='<body>007339<table class="table_feilv"><tr><td class="table_left">管理费</td><td class="table_right">0.15%</td></tr><tr><td class="table_left">托管费</td><td class="table_right">0.05%</td></tr><tr><td class="table_left">销售服务费</td><td class="table_right">0.20%</td></tr><tr><td>0-6</td><td>1.50%</td></tr><tr><td>7及以上</td><td>0.00%</td></tr></table></body>';
 const fields=parseFundPage('007339',html);assert.equal(fields.service,'0.20%');assert.equal(fields.redemption,'不足7日1.50%；满7日0');assert.equal(fields.total,undefined);assert.throws(()=>parseFundPage('007339','<body>007339 0.00%</body>'),/fund_fee_structure_changed/);assert.throws(()=>parseFundPage('005658',html),/fund_page_identity_missing/);
});
test('业务状态检查区分暂停与开放，不由费用表推断赎回状态',()=>{
 assert.equal(parseEfundTrade({status:1,data:{individual:[{subscription:true,redemption:true,limit:''}]}}),'官网数据：申购、赎回开放；确认日以渠道开放日为准');
 assert.match(parseEfundTrade({status:1,data:{individual:[{agencyName:'渠道',subscription:false,redemption:true}]}}),/申购暂停、赎回开放/);assert.throws(()=>parseEfundTrade({status:1,data:{}}),/fund_trade_structure_changed/);
});
test('仅基金字段自动核查可免费形成待审草稿，不检查模型、不处理或发布观点',async()=>{
 let ready=0,process=0,publish=0;const updater=createSessionUpdater({collect:async id=>({sources:[{source:id,discovered:2,stored:0,revised:1,errors:[]}]}),ready:async()=>{ready++;return 'key_required';},process:async()=>{process++;return {processed:false,reason:'no_ready_task'};},publish:async()=>{publish++;},schedule:()=>1,cancel:()=>{}});
 await updater.configure({enabled:true,mode:'draft',interval_minutes:180,source_ids:['csi300-products']});await updater.tick();assert.equal(updater.snapshot().last_result,'draft');assert.equal(ready,0);assert.equal(process,0);assert.equal(publish,0);
 await assert.rejects(updater.configure({enabled:true,mode:'publish',publish_authorized:true,interval_minutes:180,source_ids:['csi300-products']}),/operation_automatic_publication_forbidden/);updater.stop();
});

test('费用数值不变也读取本基金明确持有与渠道条件，不从法规导航或数字猜生效',()=>{
 const rows='<table class="table_feilv"><tr><td class="table_left">管理费</td><td class="table_right">0.15%</td></tr><tr><td class="table_left">托管费</td><td class="table_right">0.05%</td></tr><tr><td class="table_left">销售服务费</td><td class="table_right">0.20%</td></tr></table>';
 const plain=parseFundPage('007339',`<body>007339${rows}<nav>2026年新规持有超过一年不得收销售服务费</nav></body>`);assert.equal(plain.fee_holding_terms,undefined);assert.equal(plain.fee_effective_from,undefined);
 const explicit=parseFundPage('007339',`<body>007339<div class="feilv_content">${rows}<p>本基金C类持续持有超过一年不再收取销售服务费。</p><p>本基金直销渠道不收销售服务费。</p><p>本基金C类费用调整于2026年11月1日生效。</p></div></body>`);
 assert.equal(explicit.service,'0.20%');assert.match(explicit.fee_holding_terms??'',/超过一年/);assert.match(explicit.fee_channel_scope??'',/直销渠道/);assert.equal(explicit.fee_effective_from,'2026-11-01');assert.equal(explicit.fee_announcement,undefined);
});
