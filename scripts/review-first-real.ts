import './write-env.ts';
import {writeFile} from 'node:fs/promises';
import {mutateState} from '../packages/backend/storage.ts';
const id='00da9bdb-a8f2-4c8b-a9bd-cd46bd1ce015';
const edits=['标题收紧并标明年末预测，避免把利率中位数误读为当前目标区间','删去密集罗列的远期增长、失业与核心通胀数字，原始输出和原文片段完整保留','删除历史比较段落，避免2025事实就地引用2026声明；跨事件关联仍保留在相关阅读','把双重使命解释为充分就业和价格稳定，补足PCE中文名称与预测统计口径','缩短更新说明，保持原有主张、supplement分类、事件及证据版本不变'];
const reviewed=await mutateState(async s=>{
 const v=s.finance_versions.find(v=>v.id===id);if(!v||v.published_at||v.origin!=='model'||v.version!==2)throw new Error('expected_unpublished_model_draft');
 const statement=v.input_refs.find(r=>r.article_id==='da3bcbb85f4595d6b859363d')!,projections=v.input_refs.find(r=>r.article_id==='7400cab4847e7a3384d183c8')!;
 v.article.title='美联储加息25个基点，年末利率预测中位数为4.1%';
 v.article.deck='2026年9月16日，美联储将联邦基金利率目标区间上调至3.75%—4.00%。同日公布的年末利率预测中位数为4.1%，反映参与者对合适政策的判断，后续路径仍取决于数据。';
 v.article.read_minutes=3;
 v.article.sections=[
 {heading:'经济保持扩张，声明强调通胀风险',paragraphs:[
 '美联储公开市场委员会以12票赞成、0票反对通过了9月16日的声明，将联邦基金利率目标区间上调0.25个百分点至3.75%—4.00%。委员会表示，此举是为支持充分就业和价格稳定的双重目标，同时继续维持银行体系准备金充裕的政策。',
 '声明称，经济活动以稳健步伐扩张，国内支出保持韧性，生产率增长强劲，资本投资稳健；就业增长与劳动力规模保持同步，失业率变化不大。通胀仍然偏高，委员会认为本次调整有助于通胀更及时地回到2%的目标。'
 ],refs:[statement.article_id]},
 {heading:'年末利率预测与当前目标区间有何不同',paragraphs:[
 '同日发布的经济预测显示，参与者对2026年底联邦基金利率的预测中位数为4.1%，2027年底也为4.1%。其中，2026年的全部预测范围为3.9%—4.4%。这些数字反映参与者各自认为合适的政策利率，不能直接换算成未来加息次数。',
 '预测表中的联邦基金利率，是相应年份年底预计合适的目标区间中点，或目标利率水平；当前3.75%—4.00%则是本次会议已经决定的区间。预测中位数汇总个人判断，不能视为委员会对后续路径的承诺。',
 '个人消费支出价格指数（PCE）的通胀预测中位数，2026年为3.7%，2027年为2.3%；剔除食品和能源后的核心PCE通胀，2026年为3.4%。这里的通胀率是相应年份第四季度相较上年第四季度的变化，并非已经公布的全年实际结果。',
 '参与者的预测以各自对合适货币政策的判断为前提，也取决于其他经济条件。后续数据变化，可能带来新的预测和政策选择。'
 ],refs:[projections.article_id]},
 {heading:'加息如何影响借款成本',paragraphs:[
 '政策利率上调可能影响短期融资定价，但实际借款成本还取决于银行报价、市场预期和合同条件。仅凭本次声明与预测，无法确定所有借款人的利率会同步上升。',
 '后续是否继续调整、调整幅度多大，仍需观察通胀和就业数据。当前材料补充了参与者的政策预期，也保留了预测成立的条件，尚不足以确定未来加息次数或具体资产走势。'
 ],refs:[statement.article_id,projections.article_id]}
 ];
 v.changes.summary='补充9月经济预测，说明年末利率预测与当前目标区间的区别，以及预测所依赖的条件。';
 return structuredClone(v);
});
await writeFile('evidence/首次可用真实文章_核对后.json',JSON.stringify(reviewed,null,2));
await writeFile('evidence/首次可用真实文章_编辑核对.json',JSON.stringify({id,reviewed_at:new Date().toISOString(),origin:'model',editorial_copy_review:true,edits,facts_verified:{statement_date:'2026-09-16',vote:'12–0',change_basis_points:25,target_range:'3.75%—4.00%',funds_median_2026_year_end:4.1,funds_median_2027_year_end:4.1,funds_2026_range:'3.9%—4.4%',pce_2026:3.7,pce_2027:2.3,core_pce_2026:3.4,conditional_forecasts:true,pce_period:'Q4同比',current_target_vs_forecast_distinguished:true},publication:'draft',previous_version_retained:true},null,2));
console.log(JSON.stringify({id,title:reviewed.article.title,version:reviewed.version,changes:reviewed.changes.kind,published_at:reviewed.published_at,refs:reviewed.input_refs.map(r=>({id:r.article_id,revision:r.revision}))}));
