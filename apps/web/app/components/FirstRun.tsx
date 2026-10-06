import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import type {Judgment} from './RuleJudgment.tsx';
import {date} from '../lib/format.ts';
import '../firstrun.css';

export const FIRST_RUN_KEY = 'jingwei.reader.first-run.done';
const GUIDE_KEY = 'jingwei.reader.reading-guide.dismissed';

export function firstRunDone() {
  try {return localStorage.getItem(FIRST_RUN_KEY) === '1';} catch {return true;}
}

/**
 * First launch: what Jingwei is, the official data actually loaded for each index, then where to start.
 * Every number shown comes from the bundled or refreshed judgments; nothing here is staged.
 */
export function FirstRun({indexes}: {indexes: Judgment[]}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!firstRunDone() && !dialog.current?.open) dialog.current?.showModal();
  }, []);
  // Reveal the data rows one by one when the preparation step opens.
  useEffect(() => {
    if (step !== 1) return;
    setReady(0);
    const timers = indexes.map((_, i) => setTimeout(() => setReady(i + 1), 320 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [step, indexes]);

  function finish() {
    try {localStorage.setItem(FIRST_RUN_KEY, '1'); localStorage.setItem(GUIDE_KEY, '1');} catch {}
    dialog.current?.close();
  }

  const checked = indexes.find(j => j.checked_at)?.checked_at ?? null;
  return <dialog ref={dialog} className="first-run" aria-labelledby="first-run-title" onCancel={finish}>
    <div className="first-run-steps" aria-label={`第 ${step + 1} 步，共 3 步`}>{[0, 1, 2].map(i => <span key={i} className={i <= step ? 'is-on' : ''}/>)}</div>

    {step === 0 && <section key="welcome" className="first-run-page">
      <p className="first-run-kicker">欢迎使用经纬</p>
      <h2 id="first-run-title">新钱怎么投、手里的怎么拿，<br/>按公开规则给你答案。</h2>
      <ol className="first-run-points">
        <li><b>每天一个判断</b><span>沪深300、中证500、上证50，按估值在近十年里的位置，给出新增资金和已有持仓的做法。</span></li>
        <li><b>改口有据可查</b><span>什么价位会改判、十年里改过几次，都能回看，也能自己复算。</span></li>
        <li><b>看清自己的钱</b><span>导入持仓截图，在本机识别，看看钱都放在了哪里。</span></li>
      </ol>
      <div className="first-run-actions"><button type="button" className="ghost" onClick={finish}>跳过</button><button type="button" onClick={() => setStep(1)}>开始</button></div>
    </section>}

    {step === 1 && <section key="data" className="first-run-page">
      <p className="first-run-kicker">准备数据</p>
      <h2 id="first-run-title">已载入中证指数官方估值</h2>
      <ul className="first-run-data">
        {indexes.map((j, i) => <li key={j.index_code} className={i < ready ? 'is-ready' : ''}>
          <i className={`first-run-check tone-${j.band}`} aria-hidden="true"/>
          <div><strong>{j.index_name}</strong><small>{j.rows.toLocaleString('zh-CN')} 个数据日 · {date(j.history_first)} 至 {date(j.as_of)}</small></div>
          <span className={`first-run-band tone-${j.band}`}>{BAND_JUDGMENTS[j.band].label}</span>
        </li>)}
      </ul>
      <p className="first-run-note">{checked ? `已于 ${date(checked)} 与官方数据核对。` : '当前使用随软件提供的官方数据；联网时会自动补齐最新交易日。'}</p>
      <div className="first-run-actions"><button type="button" className="ghost" onClick={() => setStep(0)}>上一步</button><button type="button" disabled={ready < indexes.length} onClick={() => setStep(2)}>下一步</button></div>
    </section>}

    {step === 2 && <section key="start" className="first-run-page">
      <p className="first-run-kicker">从哪里开始</p>
      <h2 id="first-run-title">让判断对应到你自己</h2>
      <div className="first-run-choices">
        <Link to="/holdings" onClick={finish}><b>导入持仓截图</b><span>支付宝、手机银行的持仓页都可以，截图只在本机识别</span></Link>
        <Link to="/situation" onClick={finish}><b>设置我的情况</b><span>三个选择：有没有计划、持有哪只、准备拿多久</span></Link>
      </div>
      <p className="first-run-note">之后可以随时在右上角「如何阅读」回看说明。</p>
      <div className="first-run-actions"><button type="button" className="ghost" onClick={() => setStep(1)}>上一步</button><button type="button" onClick={finish}>先看看今天的判断</button></div>
    </section>}
  </dialog>;
}
