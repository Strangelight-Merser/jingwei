import {useState} from 'react';
import {Link,useLoaderData,useRouteError,isRouteErrorResponse} from 'react-router';
import {PLAN_OPTIONS, HOLDING_OPTIONS, PERIOD_OPTIONS, EMPTY_SITUATION, validReaderSituation, type ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';
import {readChannelJudgment} from '../lib/rule-card.server.ts';
import {AdvisorExplanation} from '../components/AdvisorExplanation.tsx';
import '../advisor.css';

export async function loader({request}: {request: Request}) { return readChannelJudgment(request); }
export function meta() { return [{title: '客户经理一页说明 · 经纬'}]; }

type DesktopBridge = {savePdf?: () => Promise<{ok: boolean}>};
// The desktop app exports a PDF directly; the native print panel is avoided there.
function printSheet() {
  const bridge = (window as unknown as {jingwei?: DesktopBridge}).jingwei;
  if (bridge?.savePdf) void bridge.savePdf();
  else window.print();
}

export default function Advisor() {
  const {judgment, card} = useLoaderData<typeof loader>();
  const [draft, setDraft] = useState<ReaderSituation>({...EMPTY_SITUATION});
  const [situation, setSituation] = useState<ReaderSituation | null>(null);
  const [invalid, setInvalid] = useState(false);
  const dirty = situation !== null && JSON.stringify(draft) !== JSON.stringify(situation);
  function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!validReaderSituation(draft)) { setInvalid(true); return; }
    setInvalid(false); setSituation({...draft});
  }
  return <main id="main" className="advisor-page">
    <div className="advisor-workspace-heading"><p className="eyebrow">机构与客户经理</p><h1>给客户一页清楚的说明</h1><p>选择客户情况，把当前规则对应到这笔钱。客户信息仅用于本页说明，关页即清空。</p></div>
    <div className="advisor-workspace"><form className="advisor-form" onSubmit={generate} autoComplete="off">
      <h2>客户情况</h2>
      {([['long_plan', '有没有长期计划？', PLAN_OPTIONS], ['holding', '现在持有哪只？', HOLDING_OPTIONS], ['holding_period', '准备持有多久？', PERIOD_OPTIONS]] as const).map(([key, title, options]) => <label key={key} htmlFor={`advisor-${key}`}>{title}<select id={`advisor-${key}`} value={draft[key]} onChange={event => setDraft({...draft, [key]: event.target.value})}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      <fieldset><legend>投入金额（可选）</legend>{([['monthly_amount', '每月定投（元）'], ['idle_amount', '准备投入的闲钱（元）']] as const).map(([key, title]) => <label key={key} htmlFor={`advisor-${key}`}>{title}<input id={`advisor-${key}`} type="number" inputMode="decimal" min="0" max={Number.MAX_SAFE_INTEGER} step="0.01" value={draft[key] ?? ''} onChange={event => setDraft({...draft, [key]: event.target.value === '' ? undefined : Number(event.target.value)})}/></label>)}</fieldset>
      <button type="submit">生成一页说明</button>
      <button type="button" className="advisor-reset" onClick={() => {setDraft({...EMPTY_SITUATION}); setSituation(null); setInvalid(false);}}>清空客户情况</button>
      {invalid && <p role="alert">请填写有效的情况与非负金额。</p>}
      {dirty && <p role="status">客户情况已修改，请重新生成说明。</p>}
    </form>
    <div className="advisor-preview">{situation ? <><div className="advisor-print-actions"><span>给客户的一页说明</span><button type="button" disabled={dirty} onClick={printSheet}>另存 PDF / 打印</button></div>{dirty ? <p className="advisor-empty">重新生成后，可预览并打印更新的说明。</p> : <AdvisorExplanation situation={situation} judgment={judgment} card={card}/>}</> : <div className="advisor-empty"><h2>这位客户，适合怎样说？</h2><p>填写客户情况并生成说明，即可预览当前判断、具体说法与改判条件。</p></div>}</div>
    </div>
  </main>;
}

export function ErrorBoundary() {
  const error = useRouteError(), unsupported = isRouteErrorResponse(error) && error.status === 404 && error.data === '该指数尚未提供规则卡';
  return <main id="main" className="advisor-page"><h1>客户说明暂时无法载入</h1><p className="advisor-empty">{unsupported ? '这个指数尚未提供客户说明，请选择已支持的指数。' : '未能取得当前估值判断，连接或资料服务可能暂时不可用。请稍后重新载入。'}</p><div className="reader-actions">{unsupported ? <Link to="/advisor">打开沪深300说明 →</Link> : <a href="">重新载入</a>}<Link to="/bank">返回机构服务 →</Link></div></main>;
}
