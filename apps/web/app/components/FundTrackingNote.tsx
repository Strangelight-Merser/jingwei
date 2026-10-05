import type {FinanceVersion} from '../../../../packages/contracts/types.ts';

/** Clarifies the existing 2026H1 fields without altering an archived article. */
export function FundTrackingNote({version}:{version:FinanceVersion}){
 const view=version.article.operation_view;
 const efund=view?.funds.find(f=>f.code==='007339');
 const chinaamc=view?.funds.find(f=>f.code==='005658');
 const efundRef=version.input_refs.find(r=>r.article_id==='efund-csi300-midyear-2026');
 const chinaamcRef=version.input_refs.find(r=>r.article_id==='chinaamc-csi300-midyear-2026');
 // New periods or facts need a fresh reading of the reports; never carry this note forward blindly.
 if(view?.performance_period!=='2026上半年'||efund?.period_return!=='8.17%'||chinaamc?.period_return!=='7.91%'||!efund.tracking_error.includes('0.37%')||!efundRef||!chinaamcRef)return null;
 return <div className="fund-tracking-note">
  <p>同为2026上半年C类，8.17%和7.91%说明该期净值表现；各自基准不同，+0.97和+0.18个百分点不能判断谁跟踪更准。易方达披露的0.37%未按C类单列，华夏未给同口径年化误差，目前不能排跟踪稳定性。</p>
  <details className="fund-tracking-evidence">
   <summary>核对中报页码与比较口径</summary>
   <p>两份报告均覆盖2026年1月1日至6月30日，8月31日送出。表中只对照C类，未用成立以来收益比较。</p>
   <p><a href={efundRef.url+'#page=6'} target="_blank" rel="noreferrer">易方达中报第6、8、14页 ↗</a>：基准原句“沪深300指数收益率×95%+活期存款利率(税后)×5%”；第8页C类过去六个月为8.17%，同期基准7.20%；第14页披露“年化跟踪误差0.37%”，未按C类单列，也未在该段给出可供复算的采样与年化规则。</p>
   <p><a href={chinaamcRef.url+'#page=18'} target="_blank" rel="noreferrer">华夏中报第5—6、8、18页 ↗</a>：基准为沪深300收益率×95%＋1%年收益，按期间折算；第8页C类过去六个月为7.91%，同期基准7.73%；第18页称“本报告期跟踪偏离度为+0.18%”，这不是年化跟踪误差。</p>
   <p>以上是管理人披露，未独立复算。运作费用、申赎与持仓安排可能影响相对表现，本次未分解贡献；6月30日的现金与结算备付金是时点资料，不能当作整个半年的现金拖累。</p>
  </details>
 </div>;
}
